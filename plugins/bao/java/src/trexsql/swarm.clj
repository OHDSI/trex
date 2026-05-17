(ns trexsql.swarm
  "SWARM_CONFIG synthesis and JSON helpers for bao's orchestrated mode."
  (:require [clojure.data.json :as json]))

(defn build-swarm-config
  "Build a single-node ClusterConfig map from bao's scalar CLI options.

   The shape matches the SWARM_CONFIG JSON the docker-compose default uses
   and that db.trex's ClusterConfig deserializer expects. Only fields that
   the caller supplied are included — TLS port is dropped if there's no
   cert/key, event-worker path is dropped if absent, etc.

   Power users that need multi-trexas, multi-node, custom extensions, or
   non-default gossip should write SWARM_CONFIG by hand and pass it via
   --swarm-config / $SWARM_CONFIG instead."
  [{:keys [trexas-host trexas-port main-path event-worker-path
           tls-cert tls-key tls-port
           enable-inspector inspector-type inspector-host inspector-port
           pgwire-host pgwire-port]
    :or   {trexas-host "0.0.0.0"
           pgwire-host "0.0.0.0"}}]
  (let [trexas-base (cond-> {:host              trexas-host
                             :port              trexas-port
                             :main_service_path main-path}
                      event-worker-path
                      (assoc :event_worker_path event-worker-path)

                      tls-cert (assoc :tls_cert_path tls-cert)
                      tls-key  (assoc :tls_key_path  tls-key)

                      (and tls-cert tls-key)
                      (assoc :tls_port tls-port)

                      enable-inspector
                      (assoc :inspector
                             (str inspector-type ":"
                                  inspector-host ":"
                                  inspector-port)))]
    {:cluster_id "local"
     :nodes
     {:local
      {:gossip_addr "0.0.0.0:4200"
       :extensions  [{:name "trexas" :config trexas-base}
                     {:name "pgwire" :config {:host pgwire-host
                                              :port pgwire-port}}]}}}))

(defn config->json
  "Serialize a SWARM_CONFIG map to a JSON string the orchestrator can parse."
  [cfg]
  (json/write-str cfg))

(defn json->config
  "Parse a JSON string SWARM_CONFIG into a Clojure map with keyword keys."
  [s]
  (json/read-str s :key-fn keyword))
