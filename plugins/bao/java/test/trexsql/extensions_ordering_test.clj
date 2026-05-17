(ns trexsql.extensions-ordering-test
  (:require [clojure.test :refer [deftest is testing]]
            [clojure.string :as str]
            [trexsql.extensions :as ext]
            [clojure.java.io :as io])
  (:import [java.io File]))

(defn- tempdir-with-fake-exts
  "Create a temp dir with fake .trex files under subdirs matching the
   real plugins/<name>/build/debug/extension/<name>/<name>.trex layout."
  [names]
  (let [base (File/createTempFile "ext-order-test" "")]
    (.delete base)
    (.mkdir base)
    (doseq [n names]
      (let [sub (File. base ^String n)]
        (.mkdir sub)
        (spit (File. sub (str n ".trex")) "")))
    base))

(deftest find-extensions-loads-pool-first
  (testing "pool sorts to the front even when alphabetically later"
    (let [dir   (tempdir-with-fake-exts ["zebra" "db" "pool" "apple"])
          names (mapv :name (ext/find-extensions (.getAbsolutePath dir)))]
      (is (= "pool" (first names))
          (str "expected pool first, got: " names))
      (is (= ["pool" "apple" "db" "zebra"] names)
          (str "expected pool then alphabetic, got: " names)))))

(deftest find-extensions-handles-missing-pool
  (testing "no pool present -> alphabetic order"
    (let [dir   (tempdir-with-fake-exts ["zebra" "db" "apple"])
          names (mapv :name (ext/find-extensions (.getAbsolutePath dir)))]
      (is (= ["apple" "db" "zebra"] names)))))

(deftest pre-extract-all-embedded-creates-target-dir
  (testing "missing target dir is created and call returns a (possibly empty) vec"
    (let [tdir (str (System/getProperty "java.io.tmpdir") "/bao-pre-extract-test")]
      (.delete (io/file tdir))
      (let [result (ext/pre-extract-all-embedded tdir)]
        (is (vector? result))
        (is (.exists (io/file tdir)))))))

(deftest load-scoped-extensions-warns-on-missing-ext
  (testing "unresolved extension name emits warning and returns empty set"
    (let [tdir (.getAbsolutePath (tempdir-with-fake-exts []))
          out  (with-out-str
                 (let [result (ext/load-scoped-extensions nil [:no-such-ext] tdir {:no-pool true})]
                   (is (= #{} result) "no extensions loaded")))]
      (is (str/includes? out "not found in embedded or")
          (str "expected warning output, got: " out)))))
