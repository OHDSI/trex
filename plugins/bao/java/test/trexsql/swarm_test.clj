(ns trexsql.swarm-test
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.swarm :as sw]))

(deftest build-swarm-config-minimal
  (testing "scalar opts produce a single-node config with trexas + pgwire"
    (let [cfg (sw/build-swarm-config
                {:trexas-host "0.0.0.0"
                 :trexas-port 8001
                 :main-path   "/usr/src/core/server"
                 :pgwire-host "0.0.0.0"
                 :pgwire-port 5432})]
      (is (= "local" (:cluster_id cfg)))
      (let [node       (get-in cfg [:nodes :local])
            extensions (:extensions node)
            by-name    (into {} (map (juxt :name identity) extensions))]
        (is (= "0.0.0.0:4200" (:gossip_addr node)))
        (is (= 2 (count extensions)))
        (is (= 8001  (get-in by-name ["trexas" :config :port])))
        (is (= "/usr/src/core/server"
               (get-in by-name ["trexas" :config :main_service_path])))
        (is (= 5432  (get-in by-name ["pgwire" :config :port])))))))

(deftest build-swarm-config-includes-tls-and-event-worker
  (let [cfg (sw/build-swarm-config
              {:trexas-host       "0.0.0.0"
               :trexas-port       8001
               :main-path         "/m"
               :event-worker-path "/e"
               :tls-cert          "/c.pem"
               :tls-key           "/k.pem"
               :tls-port          443
               :pgwire-host       "0.0.0.0"
               :pgwire-port       5432})
        trexas-cfg (->> (get-in cfg [:nodes :local :extensions])
                        (filter #(= "trexas" (:name %)))
                        first
                        :config)]
    (is (= "/e"   (:event_worker_path trexas-cfg)))
    (is (= "/c.pem" (:tls_cert_path    trexas-cfg)))
    (is (= "/k.pem" (:tls_key_path     trexas-cfg)))
    (is (= 443      (:tls_port         trexas-cfg)))))

(deftest build-swarm-config-omits-tls-port-when-no-cert
  (let [cfg (sw/build-swarm-config
              {:trexas-host "0.0.0.0" :trexas-port 8001 :main-path "/m"
               :pgwire-host "0.0.0.0" :pgwire-port 5432
               :tls-port 999})  ; tls-port without cert/key should be ignored
        trexas-cfg (->> (get-in cfg [:nodes :local :extensions])
                        (filter #(= "trexas" (:name %))) first :config)]
    (is (nil? (:tls_port trexas-cfg)))))

(deftest config-roundtrip-through-json
  (testing "config->json then json->config returns a structurally equivalent map"
    (let [cfg (sw/build-swarm-config
                {:trexas-host "0.0.0.0"
                 :trexas-port 8001
                 :main-path   "/usr/src/core/server"
                 :pgwire-host "0.0.0.0"
                 :pgwire-port 5432})
          parsed (sw/json->config (sw/config->json cfg))]
      ;; The :local node-id keyword in cfg becomes the string "local" in JSON,
      ;; and json->config converts it back to :local via :key-fn keyword.
      (is (= (get-in cfg [:cluster_id])
             (get-in parsed [:cluster_id])))
      (is (= (get-in cfg [:nodes :local :gossip_addr])
             (get-in parsed [:nodes :local :gossip_addr])))
      (is (= (get-in cfg [:nodes :local :extensions 0 :name])
             (get-in parsed [:nodes :local :extensions 0 :name])))
      (is (= (get-in cfg [:nodes :local :extensions 0 :config :port])
             (get-in parsed [:nodes :local :extensions 0 :config :port])))
      (is (= (get-in cfg [:nodes :local :extensions 0 :config :main_service_path])
             (get-in parsed [:nodes :local :extensions 0 :config :main_service_path]))))))
