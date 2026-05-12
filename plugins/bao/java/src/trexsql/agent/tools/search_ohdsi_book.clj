(ns trexsql.agent.tools.search-ohdsi-book
  "search_ohdsi_book tool — BM25 retrieval over the OHDSI Book of OHDSI
   2nd Edition, chunked by H2 heading. Used by Pythia for methodology
   grounding (washout, censoring, exit strategies, study design) so
   recommendations cite canonical OHDSI text instead of model recall.

   Index built by `scripts/build_book_index.clj`; ships as plain EDN at
   resources/book-of-ohdsi/passages.edn. No Lucene dependency."
  (:require [clojure.edn :as edn]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]))

(def ^:private default-k 3)
(def ^:private k1 1.2)
(def ^:private b 0.75)

(def ^:private stopwords
  #{"a" "an" "the" "and" "or" "but" "if" "of" "to" "in" "on" "for" "with"
    "is" "are" "was" "were" "be" "been" "being" "this" "that" "these"
    "those" "it" "its" "as" "at" "by" "from" "we" "you" "they" "i" "he"
    "she" "their" "his" "her" "our" "your" "do" "does" "did" "have" "has"
    "had" "will" "would" "should" "can" "could" "may" "might" "must" "not"
    "no" "yes" "than" "then" "so" "such"})

(defn- tokenize [s]
  (->> (str/split (str/lower-case (str s)) #"[^a-z0-9]+")
       (remove str/blank?)
       (remove stopwords)
       vec))

(def ^:private passages
  (delay
    (try
      (if-let [resource (io/resource "book-of-ohdsi/passages.edn")]
        (with-open [r (java.io.PushbackReader. (io/reader resource))]
          (edn/read r))
        (do (log/warn "book-of-ohdsi/passages.edn not found on classpath")
            []))
      (catch Exception e
        (log/warn e "failed to load book passages")
        []))))

(defn- term-frequencies [tokens]
  (frequencies tokens))

(def ^:private corpus
  (delay
    (let [docs @passages
          tokenized (mapv (fn [p] (assoc p :tf (term-frequencies (tokenize (:text p)))
                                          :len (max 1 (count (tokenize (:text p))))))
                          docs)
          n (count tokenized)
          df (reduce (fn [acc {:keys [tf]}]
                       (reduce (fn [a t] (update a t (fnil inc 0))) acc (keys tf)))
                     {} tokenized)
          avg-len (if (pos? n)
                    (/ (reduce + (map :len tokenized)) (double n))
                    1.0)]
      {:docs tokenized :n n :df df :avg-len avg-len})))

(defn- idf [df n term]
  (let [d (get df term 0)]
    (Math/log (+ 1.0 (/ (- n d 0.5) (+ d 0.5))))))

(defn- bm25-score [doc query-terms df n avg-len]
  (let [{:keys [tf len]} doc]
    (reduce
      (fn [score t]
        (let [f (get tf t 0)]
          (if (zero? f)
            score
            (let [w (idf df n t)
                  num (* f (+ k1 1))
                  den (+ f (* k1 (+ 1 (- b) (* b (/ len avg-len)))))]
              (+ score (* w (/ num den)))))))
      0.0
      query-terms)))

(defn- snippet
  "Return up to ~340 chars of the passage centred on the first matching
   query term (so Pythia sees relevant context, not just the chapter
   intro)."
  [text query-terms]
  (let [t (str text)
        n (count t)
        lower (str/lower-case t)
        hit (some (fn [term]
                    (let [i (str/index-of lower term)]
                      (when i [term i])))
                  query-terms)
        centre (or (some-> hit second) 0)
        start (max 0 (- centre 80))
        end (min n (+ centre 260))
        prefix (if (pos? start) "…" "")
        suffix (if (< end n) "…" "")]
    (str prefix (subs t start end) suffix)))

(defn run
  "Tool entrypoint. Args: {:query \"...\" :k 3}."
  [args _req]
  (let [query (str (or (:query args) ""))
        k (max 1 (min 10 (long (or (:k args) default-k))))]
    (cond
      (str/blank? query)
      {:results [] :note "empty query"}

      (zero? (:n @corpus))
      {:results [] :note "book index unavailable"}

      :else
      (let [{:keys [docs n df avg-len]} @corpus
            qterms (tokenize query)]
        (if (empty? qterms)
          {:results [] :note "no searchable terms after stopword filtering"}
          (let [scored (->> docs
                            (map (fn [d] [(bm25-score d qterms df n avg-len) d]))
                            (filter (fn [[s _]] (pos? s)))
                            (sort-by (fn [[s _]] (- s)))
                            (take k))]
            {:results
             (mapv (fn [[score d]]
                     {:chapter (:chapter d)
                      :title (:title d)
                      :section (:section d)
                      :file (:file d)
                      :score (Double/parseDouble (format "%.3f" score))
                      :snippet (snippet (:text d) qterms)
                      :url (str (:url d) (when-not (str/blank? (:anchor d))
                                           (str "#" (:anchor d))))})
                   scored)}))))))
