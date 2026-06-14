(ns trexsql.core
  "Main entry point for Trexsql - Clojure TrexSQL library."
  (:require [trexsql.db :as db]
            [trexsql.config :as config]
            [trexsql.extensions :as ext]
            [trexsql.servers :as servers]
            [trexsql.swarm :as sw]
            [trexsql.native :as native]
            [trexsql.util :as u]
            [trexsql.json :as json]
            [clojure.string :as str]
            [clojure.tools.logging :as log])
  (:gen-class))

(def ^:private shutdown-promise (promise))
(defonce current-database (atom nil))

(defn- camel->kebab
  "Convert camelCase string to kebab-case keyword.
   e.g. 'pgwirePort' -> :pgwire-port"
  [s]
  (-> s
      (str/replace #"([a-z])([A-Z])" "$1-$2")
      str/lower-case
      keyword))

(defn- parse-trex-init []
  (when-let [init-json (System/getenv "TREX_INIT")]
    (try
      (json/read-str init-json :key-fn camel->kebab)
      (catch Exception e
        (log/warn e "Failed to parse TREX_INIT JSON")
        nil))))

(defn add-shutdown-hook!
  [cleanup-fn]
  (.addShutdownHook
   (Runtime/getRuntime)
   (Thread. ^Runnable cleanup-fn)))

(defn shutdown!
  "Gracefully shutdown the database and any running servers."
  [database]
  (println "\n\nShutting down...")
  (when database
    (db/close! database))
  (reset! current-database nil))

(defn select-mode
  "Pure mode-selector. Returns one of :scoped-or-default, :orchestrated,
   :scoped, :default. See the precedence order below.

   `env` is the environment map (typically (System/getenv) wrapped) — passed
   in so the function stays pure and testable."
  [opts env]
  (cond
    (:no-orchestrator opts)        :scoped-or-default
    (:swarm-config opts)           :orchestrated
    (seq (:extensions opts))       :scoped
    (:orchestrator? opts)          :orchestrated
    (get env "SWARM_CONFIG")       :orchestrated
    :else                          :default))

(defn- env-map
  "Live JVM environment as a plain map, suitable for select-mode."
  []
  (into {} (System/getenv)))

(defn- warn-trex-init-server-shaped! [trex-init env]
  ;; Soft migration warning: if TREX_INIT carries server-shape keys but
  ;; SWARM_CONFIG isn't set, the old auto-start behavior won't fire and the
  ;; caller probably wants SWARM_CONFIG instead.
  (when (and trex-init
             (not (get env "SWARM_CONFIG"))
             (or (:trexas-port trex-init) (:pgwire-port trex-init)))
    (binding [*out* *err*]
      (println
        (str "Warning: TREX_INIT contains server-shape keys "
             "(trexas-port/pgwire-port) but $SWARM_CONFIG is not set. "
             "Bao no longer auto-starts servers from TREX_INIT; set "
             "$SWARM_CONFIG or call (init-with-servers) explicitly.")))))

(defn init
  ([]
   (init {}))
  ([config]
   (let [env         (env-map)
         env-config  (parse-trex-init)
         _           (warn-trex-init-server-shaped! env-config env)
         merged      (merge config/default-config (or env-config {}) config)
         ext-path    (config/get-extensions-path merged)
         handle      (db/create-connection merged)
         mode        (select-mode merged env)
         loaded      (case mode
                       :orchestrated
                       (let [pool-r  (ext/load-extension
                                       handle
                                       {:name "pool"
                                        :path (str ext-path "/pool/pool.trex")
                                        :requires-avx false})
                             _       (when-not (:loaded pool-r)
                                       (throw (ex-info (str "orchestrated init: pool.trex failed to load: "
                                                            (:error pool-r))
                                                       {:extension "pool" :error (:error pool-r)})))
                             _       (ext/pre-extract-all-embedded ext-path)
                             db-r    (ext/load-extension
                                       handle
                                       {:name "db"
                                        :path (str ext-path "/db/db.trex")
                                        :requires-avx false})
                             _       (when-not (:loaded db-r)
                                       (throw (ex-info (str "orchestrated init: db.trex failed to load: "
                                                            (:error db-r))
                                                       {:extension "db" :error (:error db-r)})))
                             ;; Load all remaining extensions from ext-path so the
                             ;; orchestrator's LOAD '<name>.trex' calls (which resolve
                             ;; against duckdb's extension_directory, unset in our JNA
                             ;; connection) become no-ops. Without this, trexas/pgwire/etc
                             ;; would silently fail to load and init would return a database
                             ;; with no services started.
                             all-r   (ext/load-extensions handle ext-path)
                             swarm   (or (:swarm-config merged)
                                         (some-> (get env "SWARM_CONFIG")
                                                 sw/json->config)
                                         (sw/build-swarm-config merged))
                             node-id (or (:swarm-node merged)
                                         (get env "SWARM_NODE")
                                         "local")
                             sql     (format
                                       "SELECT db_orchestrate_swarm('%s', '%s')"
                                       (u/escape-sql-string (sw/config->json swarm))
                                       (u/escape-sql-string node-id))
                             orch-rows   (native/query handle sql)
                             orch-result (some-> orch-rows first vals first str)]
                         ;; db_orchestrate_swarm returns a single VARCHAR row. Error envelope is
                         ;; an "invalid SWARM_CONFIG: ..." or "node '...' not found..." prefix
                         ;; — see plugins/db/src/service_functions.rs::orchestrate_swarm_impl.
                         ;; Per-extension failures from orchestrate_extensions are collected
                         ;; and joined by \n, so we also check for those substrings.
                         (when (and orch-result
                                    (or (str/starts-with? orch-result "invalid SWARM_CONFIG")
                                        (str/starts-with? orch-result "node '")
                                        ;; Per-extension failures from orchestrate_extensions
                                        (str/includes? orch-result ": load failed")
                                        (str/includes? orch-result ": start failed")
                                        (str/includes? orch-result ": config error")))
                           (throw (ex-info (str "db_orchestrate_swarm reported errors: " orch-result)
                                           {:orchestrate-result orch-result
                                            :swarm-config swarm
                                            :node-id node-id})))
                         (ext/loaded-from-engine handle))

                       :scoped
                       (ext/load-scoped-extensions handle
                                                    (:extensions merged)
                                                    ext-path
                                                    (select-keys merged [:no-pool]))

                       (:default :scoped-or-default)
                       (if (seq (:extensions merged))
                         (ext/load-scoped-extensions handle
                                                      (:extensions merged)
                                                      ext-path
                                                      (select-keys merged [:no-pool]))
                         (ext/load-extensions handle ext-path)))
         database    (db/make-database handle merged)]
     (reset! (:extensions-loaded database) loaded)
     (reset! current-database database)
     database)))

(defn get-database []
  (or @current-database (init)))

(defn init-with-servers
  "Convenience entry point for CLI / docker invocations. Resolves a
   SWARM_CONFIG from the first available source — explicit :swarm-config opt,
   --swarm-config-path / :swarm-config-path file, $SWARM_CONFIG env, or
   synthesized from scalar CLI options — then calls init in orchestrated
   mode and prints the running-servers status."
  ([] (init-with-servers {}))
  ([config]
   (let [env       (env-map)
         merged    (merge config/default-config config)
         _         (when-let [err (config/validate-tls-config merged)]
                     (binding [*out* *err*]
                       (println (str "Error: " err)))
                     (System/exit 1))
         _         (servers/validate-tls-files! merged)
         _         (servers/validate-sql-password!)
         swarm     (cond
                     (:swarm-config merged)
                     (:swarm-config merged)

                     (:swarm-config-path merged)
                     (sw/json->config (slurp (:swarm-config-path merged)))

                     (get env "SWARM_CONFIG")
                     (sw/json->config (get env "SWARM_CONFIG"))

                     :else
                     (sw/build-swarm-config merged))
         database  (init (assoc merged :swarm-config swarm))]
     (servers/print-server-status database merged)
     database)))

(defn is-running?
  "Check if servers are currently running."
  [database]
  (boolean (seq (db/running-servers database))))

(defn query
  "Execute a SQL query and return results.
   Wrapper around db/query for convenience."
  [database sql]
  (db/query database sql))

(defn execute!
  "Execute a non-query SQL statement.
   Wrapper around db/execute! for convenience."
  [database sql]
  (db/execute! database sql))

(defn loaded-extensions
  "Return set of loaded extension names."
  [database]
  (ext/loaded-extensions database))

(def main-help-text
  "Usage: trexsql <command> [options]

Commands:
  serve      Start Trexas and PgWire servers (default)
  cache      Manage TrexSQL caches from source databases
  bundle     Create an eszip bundle from TypeScript/JavaScript

Use 'trexsql <command> --help' for more information about a command.

Examples:
  trexsql serve --trexas-port 9876
  trexsql cache create -s source -j \"jdbc:...\" -S schema
  trexsql bundle -e main.ts -o output.eszip")

(defn- print-main-help []
  (println main-help-text))

(defn- run-serve [args]
  (let [{:keys [options errors]} (config/parse-args args)]
    (when (:help options)
      (println config/help-text)
      (System/exit 0))
    (when (seq errors)
      (binding [*out* *err*]
        (doseq [err errors]
          (println (str "Error: " err))))
      (System/exit 1))
    (println "\uD83E\uDD95 Starting TREX")
    (let [database (init-with-servers options)]
      (add-shutdown-hook!
       #(shutdown! @current-database))
      @shutdown-promise)))

(defn -main
  "Main entry point - routes to subcommands."
  [& args]
  (let [command (first args)
        sub-args (rest args)]
    (case command
      "serve" (run-serve sub-args)
      "cache" (do
                (require 'trexsql.cli)
                (let [run-cache (resolve 'trexsql.cli/run-cache)
                      {:keys [exit-code]} (run-cache sub-args)]
                  (System/exit (or exit-code 0))))
      "bundle" (do
                 (require 'trexsql.cli)
                 (let [run-bundle (resolve 'trexsql.cli/run-bundle)
                       {:keys [exit-code]} (run-bundle sub-args)]
                   (System/exit (or exit-code 0))))
      "--help" (do (print-main-help) (System/exit 0))
      "-h" (do (print-main-help) (System/exit 0))
      nil (run-serve [])
      (if (or (str/starts-with? (str command) "-")
              (str/starts-with? (str command) "--"))
        (run-serve args)
        (do
          (println (format "Unknown command: %s" command))
          (println "\nUse 'trexsql --help' for usage information.")
          (System/exit 1))))))
