(ns trexsql.agent.rag
  "Shared retrieval primitives for the cohort-design agent.

   Phase 6 scaffold: today this exposes the BM25 corpus + scorer that
   `search_ohdsi_book` already uses, plus a `hybrid-search` entrypoint
   that automatically blends BM25 with cosine similarity if (and only
   if) a precomputed embeddings file is found on the classpath.

   No embeddings ship yet — the plan defers semantic retrieval until an
   eval set proves BM25 is measurably weak. This namespace exists so
   that adding embeddings later is a build-step + file-drop, not a
   refactor of every search tool."
  (:require [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]))

(def ^:private k1 1.2)
(def ^:private b 0.75)

(def ^:private stopwords
  #{"a" "an" "the" "and" "or" "but" "if" "of" "to" "in" "on" "for" "with"
    "is" "are" "was" "were" "be" "been" "being" "this" "that" "these"
    "those" "it" "its" "as" "at" "by" "from" "we" "you" "they" "i" "he"
    "she" "their" "his" "her" "our" "your" "do" "does" "did" "have" "has"
    "had" "will" "would" "should" "can" "could" "may" "might" "must" "not"
    "no" "yes" "than" "then" "so" "such"})

(defn tokenize [s]
  (->> (str/split (str/lower-case (str s)) #"[^a-z0-9]+")
       (remove str/blank?)
       (remove stopwords)
       vec))

(defn build-bm25-corpus
  "Builds an immutable BM25 corpus map from a vector of documents.
   Each doc must contain at minimum a :text field; the original doc is
   preserved in the corpus output for downstream rendering."
  [docs text-fn]
  (let [tokenized (mapv (fn [d]
                          (let [toks (tokenize (text-fn d))]
                            (assoc d :_tf (frequencies toks)
                                     :_len (max 1 (count toks)))))
                        docs)
        n (count tokenized)
        df (reduce (fn [acc d]
                     (reduce (fn [a t] (update a t (fnil inc 0))) acc (keys (:_tf d))))
                   {}
                   tokenized)
        avg-len (if (pos? n)
                  (/ (reduce + (map :_len tokenized)) (double n))
                  1.0)]
    {:docs tokenized :n n :df df :avg-len avg-len}))

(defn- idf [df n term]
  (let [d (get df term 0)]
    (Math/log (+ 1.0 (/ (- n d 0.5) (+ d 0.5))))))

(defn bm25-score [doc query-terms df n avg-len]
  (let [{:keys [_tf _len]} doc]
    (reduce
      (fn [score t]
        (let [f (get _tf t 0)]
          (if (zero? f)
            score
            (let [w (idf df n t)
                  num (* f (+ k1 1))
                  den (+ f (* k1 (+ 1 (- b) (* b (/ _len avg-len)))))]
              (+ score (* w (/ num den)))))))
      0.0
      query-terms)))

(defn bm25-search
  "Score every doc in `corpus` against `query` and return the top-k as
   [{:doc :score}]. `:doc` is the original doc with internal :_tf/:_len
   keys stripped."
  ([corpus query] (bm25-search corpus query 5))
  ([corpus query k]
   (let [{:keys [docs n df avg-len]} corpus
         qterms (tokenize query)]
     (->> docs
          (map (fn [d] {:doc (dissoc d :_tf :_len)
                        :score (bm25-score d qterms df n avg-len)}))
          (filter (fn [{:keys [score]}] (pos? score)))
          (sort-by (fn [{:keys [score]}] (- score)))
          (take k)
          vec))))

(defn- load-embeddings-resource
  "Returns the loaded embeddings vector if `<resource-path>` exists on
   the classpath, otherwise nil. Embeddings file shape (when added in a
   future phase): [{:id ... :vec [float ...]}, ...] aligned with the
   corpus docs by :id."
  [resource-path]
  (try
    (when-let [r (io/resource resource-path)]
      (with-open [in (java.io.PushbackReader. (io/reader r))]
        (edn/read in)))
    (catch Exception e
      (log/debug e "embeddings load failed for" resource-path)
      nil)))

(defn embeddings-available?
  "Returns true if a precomputed embeddings file is on the classpath at
   `resource-path`. Today this always returns false — Phase 6 has not
   shipped an embeddings file yet."
  [resource-path]
  (some? (io/resource resource-path)))

(defn hybrid-search
  "Hybrid retrieval entrypoint. Falls back to BM25 alone when no
   embeddings file is on the classpath at `embeddings-resource`.

   When embeddings ARE present (post-Phase-6 build step), we union the
   top-k from BM25 with the top-k from cosine similarity over the query
   embedding and re-rank by a simple sum of normalised scores. Until
   then, callers get plain BM25 with zero behaviour change.

   The async-friendly shape (a single map) is intentional so a future
   phase can swap in an embedding model without touching the call sites."
  ([corpus query] (hybrid-search corpus query 5 nil))
  ([corpus query k embeddings-resource]
   (let [bm25-hits (bm25-search corpus query k)]
     (if (or (nil? embeddings-resource)
             (not (embeddings-available? embeddings-resource)))
       bm25-hits
       ;; Phase 6 future: embed `query`, compute cosine over loaded
       ;; embeddings, union with bm25-hits, re-rank. Today nothing
       ;; ships an embeddings file so this branch is unreachable.
       (let [_loaded (load-embeddings-resource embeddings-resource)]
         (log/debug "embeddings present but Phase 6 hybrid retrieval not yet wired in")
         bm25-hits)))))
