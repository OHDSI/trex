(ns trexsql.agent.tools.web-search-test
  "Pure parser tests for the DuckDuckGo Lite scrape. Avoids hitting the
   live endpoint."
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.agent.tools.web-search :as ws]))

(def ^:private fixture-html
  "Minimal DuckDuckGo Lite results fragment with two link/snippet pairs."
  (str
    "<html><body>"
    "<table>"
    "<tr><td>"
    "<a rel='nofollow' href='https://www.ohdsi.org/phenotypes' class='result-link'>OHDSI Phenotype Library</a>"
    "</td></tr>"
    "<tr><td class='result-snippet'>The OHDSI Phenotype Library is a community-curated set of <b>validated</b> definitions.</td></tr>"
    "<tr><td>"
    "<a rel='nofollow' href='https://pubmed.ncbi.nlm.nih.gov/12345' class='result-link'>T2DM phenotype validation in OMOP CDM</a>"
    "</td></tr>"
    "<tr><td class='result-snippet'>Sensitivity and specificity of the algorithm across <i>five sites</i>.</td></tr>"
    "</table>"
    "</body></html>"))

(deftest parse-html-extracts-links-and-snippets
  (testing "parse-html returns links + snippets, in order, capped at n"
    (let [results (ws/parse-html fixture-html 5)]
      (is (= 2 (count results)))
      (is (= "https://www.ohdsi.org/phenotypes" (:url (first results))))
      (is (= "OHDSI Phenotype Library" (:title (first results))))
      (is (re-find #"validated" (:snippet (first results))))
      (is (= "https://pubmed.ncbi.nlm.nih.gov/12345" (:url (second results))))
      (is (re-find #"five sites" (:snippet (second results))))))

  (testing "parse-html caps at the requested count"
    (let [results (ws/parse-html fixture-html 1)]
      (is (= 1 (count results)))))

  (testing "parse-html handles empty / nil input"
    (is (= [] (ws/parse-html nil 5)))
    (is (= [] (ws/parse-html "" 5)))
    (is (= [] (ws/parse-html "<html></html>" 5)))))

(deftest run-rejects-blank-query
  (testing "run returns {:error ...} for blank query"
    (is (= "query is required" (:error (ws/run {} {}))))
    (is (= "query is required" (:error (ws/run {:query "  "} {}))))))
