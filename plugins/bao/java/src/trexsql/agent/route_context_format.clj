(ns trexsql.agent.route-context-format
  "Pure formatter for the per-request route + open-artifact snapshot.
   Lives separately from trexsql.agent.routes so tests can load it
   without dragging in the bedrock HTTP client (which Java-imports
   AWS SDK classes that aren't on the :dev classpath)."
  (:require [clojure.string :as str]))

(defn- format-params-segment
  "Render a routeParams map as ' (k1: v1, k2: v2)'. Returns '' when empty."
  [params]
  (if (and (map? params) (seq params))
    (let [items (for [[k v] params
                      :when (some? v)]
                  (str (name k) ": " v))]
      (if (seq items)
        (str " (" (str/join ", " items) ")")
        ""))
    ""))

(defn format-route-context
  "Render the per-request route + open-artifact snapshot as a system-prompt
   block. Returns nil when no useful context is available."
  [route-ctx]
  (when (map? route-ctx)
    (let [route-name (some-> (:routeName route-ctx) str)
          route-params (:routeParams route-ctx)
          artifact   (:artifact route-ctx)
          lines      (cond-> []
                       (and route-name (not (str/blank? route-name)))
                       (conj (str "Current screen: " route-name
                                  (format-params-segment route-params)))

                       (map? artifact)
                       (conj (str "Open artifact: " (name (:kind artifact))
                                  " \"" (:name artifact) "\""
                                  " (id " (:id artifact) ")"))

                       (and (map? artifact) (string? (:summary artifact))
                            (not (str/blank? (:summary artifact))))
                       (conj (str "Summary: " (:summary artifact))))]
      (when (seq lines)
        (str "## Current context\n"
             (str/join "\n" lines)
             "\n\nThe user is currently on this screen with this artifact open. "
             "When they ask to modify it, call get_artifact first to load its "
             "current state, then propose edits via the matching update_* tool "
             "(or the cohort add_*/set_* tools when the artifact is a cohort). "
             "Do NOT propose creating a new artifact when one is already open "
             "and the user is asking to modify it.")))))
