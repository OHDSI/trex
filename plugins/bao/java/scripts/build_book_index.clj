#!/usr/bin/env clojure
;; Builds resources/book-of-ohdsi/passages.edn from the
;; OHDSI/BookOfOHDSI-2ndEdition submodule at plugins/bao/book-of-ohdsi/.
;;
;; Each passage is a chunk of one chapter delimited by H2 headings (## ...).
;; The output drives the search_ohdsi_book BM25 retriever — no Lucene dep,
;; the index ships as plain EDN.
;;
;; Run from plugins/bao/java/:
;;   clojure -M scripts/build_book_index.clj

(require '[clojure.edn :as edn]
         '[clojure.java.io :as io]
         '[clojure.string :as str])

(def submodule-root "../book-of-ohdsi")
(def out-path "resources/book-of-ohdsi/passages.edn")
(def base-url "https://ohdsi.github.io/BookOfOHDSI-2ndEdition")
(def github-base "https://github.com/OHDSI/BookOfOHDSI-2ndEdition/blob/main")

(def ^:private skip-dirs #{"_extensions" "assets" "_cache" "_freeze"})

(defn- markdown-files []
  (->> (file-seq (io/file submodule-root))
       (filter #(.isFile ^java.io.File %))
       (filter #(let [n (.getName ^java.io.File %)]
                  (or (.endsWith n ".md") (.endsWith n ".qmd"))))
       (remove #(let [p (.getPath ^java.io.File %)]
                  (some (fn [seg] (re-find (re-pattern (str "/" seg "/")) p)) skip-dirs)))
       (remove #(let [n (str/lower-case (.getName ^java.io.File %))]
                  (#{"readme.md" "prototype.md" "contributors.md"} n)))))

(defn- title-from-file [^java.io.File f]
  ;; Use the H1 if present, else the filename stem.
  (let [text (slurp f)
        h1 (some-> (re-find #"(?m)^#\s+(.+)" text) second)]
    (or h1
        (-> (.getName f)
            (str/replace #"\.(q?md)$" "")
            (str/replace #"-" " ")
            (str/capitalize)))))

(defn- chapter-from-file [^java.io.File f]
  (let [parent (.getName (.getParentFile f))]
    (if (or (str/blank? parent) (= "book-of-ohdsi" parent))
      "root"
      parent)))

(defn- file-url [^java.io.File f]
  (let [rel (str/replace (.getPath f)
                         (re-pattern (str "^" submodule-root "/?"))
                         "")]
    (str github-base "/" rel)))

(defn- strip-code-fences [s]
  (str/replace s #"(?s)```.*?```" " "))

(defn- strip-yaml-frontmatter [s]
  (str/replace s #"(?s)\A---\n.*?\n---\n" ""))

(defn- chunk-by-h2
  "Returns [{:section :body}...]. Treats the leading text before the first
   H2 as section 'Introduction'. H2 = lines starting with `## `."
  [text]
  (let [lines (str/split-lines text)]
    (loop [lines lines
           cur-section "Introduction"
           cur-body []
           acc []]
      (cond
        (empty? lines)
        (let [acc' (cond-> acc
                     (seq cur-body) (conj {:section cur-section
                                           :body (str/trim (str/join "\n" cur-body))}))]
          (vec acc'))

        (re-find #"^## (?!#)" (first lines))
        (let [next-section (str/trim (subs (first lines) 3))
              acc' (cond-> acc
                     (seq cur-body) (conj {:section cur-section
                                           :body (str/trim (str/join "\n" cur-body))}))]
          (recur (rest lines) next-section [] acc'))

        :else
        (recur (rest lines) cur-section (conj cur-body (first lines)) acc)))))

(defn- clean-passage [text]
  (-> text
      strip-yaml-frontmatter
      strip-code-fences
      (str/replace #"\!\[[^\]]*\]\([^)]*\)" " ")  ; images
      (str/replace #"\[([^\]]+)\]\([^)]+\)" "$1") ; links → just text
      (str/replace #"\{[^}]+\}" " ")              ; pandoc attributes {.foo}
      (str/replace #"<[^>]+>" " ")                ; raw HTML tags
      (str/replace #"\s+" " ")
      str/trim))

(defn- token-count [s]
  (count (filter seq (str/split (str s) #"\s+"))))

(defn- file-passages [^java.io.File f]
  (let [text (slurp f)
        chapter (chapter-from-file f)
        title (title-from-file f)
        url (file-url f)
        chunks (chunk-by-h2 text)]
    (->> chunks
         (map-indexed
           (fn [i {:keys [section body]}]
             (let [cleaned (clean-passage body)]
               {:chapter chapter
                :file (.getName f)
                :title title
                :section section
                :url url
                :anchor (str/lower-case (-> section
                                            (str/replace #"[^a-zA-Z0-9 ]" "")
                                            (str/replace #"\s+" "-")))
                :ord i
                :text cleaned
                :tokens (token-count cleaned)})))
         (filter #(>= (:tokens %) 10)))))

(defn -main [& _args]
  (println "Scanning" submodule-root)
  (let [files (markdown-files)
        _ (println "  " (count files) "markdown files")
        passages (->> files
                      (mapcat file-passages)
                      vec)]
    (println "  " (count passages) "passages after H2 chunking")
    (io/make-parents out-path)
    (with-open [w (io/writer out-path)]
      (binding [*out* w
                *print-length* nil
                *print-level* nil]
        (println "[")
        (doseq [p passages]
          (pr p)
          (println))
        (println "]")))
    (let [bytes (.length (io/file out-path))]
      (println "Wrote" out-path "(" (format "%.1f" (/ bytes 1024.0 1024.0)) "MB )"))))

(-main)
