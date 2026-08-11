(ns trexsql.proxy
  (:require [trexsql.http-client :as client]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [ring.core.protocols :as ring-protocols])
  (:import [java.io InputStream IOException OutputStream]))

(def ^:private hop-by-hop-headers
  ;; content-length is stripped so the HTTP client recomputes it from the body
  ;; (forwarding the original alongside clj-http's own → "Content-Length header
  ;; already present"); on responses it lets the SSE stream go chunked.
  #{"connection" "keep-alive" "proxy-authenticate" "proxy-authorization"
    "te" "trailers" "transfer-encoding" "upgrade" "host" "content-length"})

(defn- filter-headers [headers]
  (when headers
    (into {}
          (remove #(hop-by-hop-headers (str/lower-case (name (key %))))
                  headers))))

(defn- build-target-url [base-url path query-string]
  (let [base (str/replace base-url #"/$" "")
        path-with-slash (if (str/starts-with? path "/") path (str "/" path))
        url (str base path-with-slash)]
    (if (str/blank? query-string)
      url
      (str url "?" query-string))))

(defn- flushing-stream-body
  "Wrap an upstream response stream so every chunk reaches the client as it
   arrives.

   Ring's default InputStream branch copies with clojure.java.io/copy and never
   flushes, so bytes sit in the servlet's response buffer until it fills or the
   response completes. That is invisible for ordinary responses and fatal for a
   long-lived one: an agent session stream (SSE/NDJSON) does not complete while
   the turn runs, so the client receives NOTHING — the request simply hangs
   until it gives up, with no error on either side. Measured against the same
   agent: 518 bytes of events over the direct mount, 0 bytes through this proxy.

   A client that walks away mid-stream is normal here, so a broken pipe ends the
   copy quietly instead of surfacing as a servlet-level error."
  [^InputStream in]
  (reify ring-protocols/StreamableResponseBody
    (write-body-to-stream [_ _response out]
      (let [^OutputStream out out]
       (try
        (with-open [in in]
          (let [buf (byte-array 8192)]
            (loop []
              (let [n (.read in buf)]
                (when (pos? n)
                  (.write out buf 0 n)
                  (.flush out)
                  (recur))))))
        (catch IOException e
          (log/debug (str "Proxy stream closed by client: " (.getMessage e))))
        (finally
          (try (.close out) (catch IOException _ nil))))))))

(defn- request-body->string [body]
  (cond
    (nil? body) nil
    (string? body) body
    (instance? java.io.InputStream body) (slurp body)
    :else (str body)))

(defn proxy-request
  ([request base-url]
   (proxy-request request base-url nil nil))
  ([request base-url extra-headers]
   (proxy-request request base-url extra-headers nil))
  ([{:keys [request-method uri headers body query-string]} base-url extra-headers opts]
  (let [target-url (build-target-url base-url uri query-string)
        forwarded-headers (-> headers
                              filter-headers
                              (assoc "X-Forwarded-Host" (get headers "host"))
                              (merge extra-headers))
        method-kw (if (keyword? request-method)
                    request-method
                    (keyword (str/lower-case (name request-method))))
        body-str (request-body->string body)]
    (log/debug (str "Proxying " (str/upper-case (name method-kw)) " " target-url))
    (try
      (let [response (client/request
                       (merge {:method method-kw
                               :url target-url
                               :headers forwarded-headers
                               :body body-str
                               :throw-exceptions false
                               :as :stream
                               :socket-timeout 30000
                               :connection-timeout 10000}
                              opts))]
        {:status (:status response)
         :headers (filter-headers (:headers response))
         :body (let [b (:body response)]
                 (if (instance? InputStream b)
                   (flushing-stream-body b)
                   b))})
      (catch java.net.ConnectException e
        (log/error (str "Proxy connection failed: " target-url " - " (.getMessage e)))
        {:status 502
         :headers {"Content-Type" "application/json"}
         :body {:error "BAD_GATEWAY"
                :message (str "Failed to connect to upstream: " (.getMessage e))}})
      (catch java.net.SocketTimeoutException e
        (log/error (str "Proxy timeout: " target-url " - " (.getMessage e)))
        {:status 504
         :headers {"Content-Type" "application/json"}
         :body {:error "GATEWAY_TIMEOUT"
                :message (str "Upstream request timed out: " (.getMessage e))}})
      (catch Exception e
        (log/error e (str "Proxy request failed: " target-url))
        {:status 502
         :headers {"Content-Type" "application/json"}
         :body {:error "BAD_GATEWAY"
                :message (str "Proxy error: " (.getMessage e))}})))))
