(ns trexsql.http-client
  "Lazy access to clj-http so the trexsql namespace graph doesn't initialize
   clj-http — and, transitively, Apache HttpClient's SSL stack — at GraalVM
   native-image build time.

   Apache HttpClient builds a default SSLContext whose SecureRandom (with a
   cached seed) cannot be stored in the image heap, so clj-http is marked
   --initialize-at-run-time. These wrappers resolve clj-http vars on first call
   (at runtime), so no build-time-initialized namespace forces clj-http to load
   at build time."
  (:refer-clojure :exclude [get]))

(defn get [& args]
  (apply @(requiring-resolve 'clj-http.client/get) args))

(defn post [& args]
  (apply @(requiring-resolve 'clj-http.client/post) args))

(defn request [& args]
  (apply @(requiring-resolve 'clj-http.client/request) args))

(defn make-reusable-conn-manager [& args]
  (apply @(requiring-resolve 'clj-http.conn-mgr/make-reusable-conn-manager) args))
