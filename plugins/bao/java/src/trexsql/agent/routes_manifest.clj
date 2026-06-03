(ns trexsql.agent.routes-manifest
  "Loads the route manifest emitted by Atlas3's emit-route-manifest script.
   The JSON lives at resources/routes.manifest.json. Single source of
   truth for navigate_to enum + param keys."
  (:require [trexsql.json :as json]
            [clojure.java.io :as io]))

(def ^:private manifest
  (delay
    (with-open [rdr (io/reader (io/resource "routes.manifest.json"))]
      (json/read rdr :key-fn keyword))))

(defn entries
  "All manifest entries."
  []
  @manifest)

(defn agent-visible-entries
  "Manifest entries with agentVisible=true."
  []
  (filter :agentVisible (entries)))

(defn agent-visible-views
  "List of view names (route :name) the agent is allowed to navigate to."
  []
  (mapv :name (agent-visible-entries)))

(defn- by-name [view-name]
  (some #(when (= (:name %) view-name) %) (entries)))

(defn view-params
  "Param keys declared for a view; empty vector when unknown."
  [view-name]
  (let [e (by-name view-name)]
    (or (:params e) [])))

(defn view-label
  "Human label for a view; falls back to the name when no agentLabel set."
  [view-name]
  (let [e (by-name view-name)]
    (or (:label e) view-name)))
