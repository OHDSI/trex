(ns trexsql.json
  "Drop-in subset of the clojure.data.json API (read-str / read / write-str)
   backed by cheshire, so trexsql stays GraalVM native-image friendly.

   clojure.data.json calls (set! *warn-on-reflection* true) at namespace load,
   which throws during native-image build-time class initialization
   (\"Can't change/establish root binding of *warn-on-reflection*\"). cheshire
   has no such load-time side effect and initializes cleanly at build time."
  (:refer-clojure :exclude [read])
  (:require [cheshire.core :as cheshire])
  (:import [java.io Reader]))

(defn- keywordize?
  "True when the data.json-style options request keyword keys (:key-fn keyword)."
  [opts]
  (= (:key-fn (apply hash-map opts)) keyword))

(defn read-str
  "Like clojure.data.json/read-str. Supports the :key-fn keyword option (the only
   one trexsql uses); other keys default to strings."
  [s & opts]
  (when (some? s)
    (cheshire/parse-string s (keywordize? opts))))

(defn read
  "Like clojure.data.json/read. Supports the :key-fn keyword option.

   Reads the whole stream eagerly (via slurp): clojure.data.json/read is eager,
   whereas cheshire/parse-stream can be lazy — which throws if the caller parses
   inside a with-open (the reader closes before the value is realized)."
  [^Reader reader & opts]
  (apply read-str (slurp reader) opts))

(defn write-str
  "Like clojure.data.json/write-str (serialize to a JSON string)."
  [x & _opts]
  (cheshire/generate-string x))
