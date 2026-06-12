# bao Native DuckDB Scanner Cache + Native-Image Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the DuckDB native-scanner read path for cache creation for postgres/mysql/bigquery sources (DuckDB `ATTACH … (TYPE …)` + `CREATE TABLE AS SELECT`), keep the JDBC path as the fallback for all other dialects, and make cache creation work inside WebAPI's GraalVM native image.

**Architecture:** A single unified `create-cache` flow that branches only on the *read* step: native-scanner dialects go through a new `create-cache-native` (pure-DuckDB SQL over the `TrexEngine` FFI handle); everything else stays on `batch/create-cache-jdbc`. The shared post-copy FTS step and `CacheResult` assembly are untouched. WebAPI passes a JDBC URL, so a new pure translator converts it to the DuckDB ATTACH DSN per dialect. The native-image fix removes JDBC/reflection for the common dialects and registers the missing JDBC-driver + SqlRender metadata in `plugins/webapi/graalvm-config/` for the fallback dialects.

**Tech Stack:** Clojure (Leiningen project `org.trex/trexsql`), DuckDB via the `TrexEngine` JNA FFI, `honey.sql` for query building, `clojure.test`. Native image via GraalVM (`plugins/webapi/graalvm-config/`, `gen-graalvm-config.sh`, `build-native-lib.sh`).

**Working directory for all commands:** `plugins/bao/java` (the Leiningen project root) unless a path says otherwise.

**Run all tests:** `lein test` · **Run one ns:** `lein test :only trexsql.source-dsn-test`

---

## File Structure

- **Create** `src/trexsql/source_dsn.clj` — pure functions translating a WebAPI JDBC URL + dialect into a DuckDB ATTACH DSN (postgres libpq string, mysql key/value string) and extracting the BigQuery project id. No I/O, fully unit-testable.
- **Create** `test/trexsql/source_dsn_test.clj` — unit tests for the translator.
- **Modify** `src/trexsql/db.clj` — add pure ATTACH-SQL builders (`postgres-attach-sql`, `mysql-attach-sql`, `bigquery-attach-sql`) and the executing `attach-source-postgres!`, `attach-source-mysql!`, `attach-source-bigquery!`.
- **Modify** `src/trexsql/datamart.clj` — add `native-scanner-dialects` + `native-scanner-dialect?`; restore copy helpers (`get-source-tables`, `apply-table-filter`, `build-select-clause`, `build-where-clause`, `copy-table`, `copy-tables-sequential`, `copy-tables-parallel`, `copy-schema`); add `attach-source!` dispatch and `create-cache-native`; rewire `create-cache` to dispatch native vs JDBC while keeping the shared FTS step.
- **Modify** `test/trexsql/datamart_test.clj` — add tests for dispatch predicate, clause builders, and a `^:integration` postgres end-to-end test.
- **Modify** `plugins/webapi/graalvm-config/reflect-config.json` — register fallback JDBC driver classes.
- **Modify** `plugins/webapi/graalvm-config/resource-config.json` — register SqlRender translation resources + JDBC `META-INF/services/java.sql.Driver`.
- **Modify** `plugins/webapi/gen-graalvm-config.sh` — exercise cache creation with `trexsql.enabled=true` so the tracing agent captures the above.
- **Modify** `plugins/webapi/smoke/smoke.sh` — add a native-image cache smoke check.

---

## Task 1: JDBC-URL → DuckDB DSN translator (pure)

WebAPI Sources carry a JDBC URL (`source->credentials` in `webapi.clj` sets `:jdbc-url`). DuckDB's `ATTACH` needs a native DSN. This task isolates that translation as pure, tested functions.

**Files:**
- Create: `src/trexsql/source_dsn.clj`
- Test: `test/trexsql/source_dsn_test.clj`

- [ ] **Step 1: Write the failing tests**

Create `test/trexsql/source_dsn_test.clj`:

```clojure
(ns trexsql.source-dsn-test
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.source-dsn :as dsn]))

(deftest postgres-dsn-test
  (testing "standard jdbc:postgresql url → libpq keyword string"
    (is (= "host=db.example.com port=5432 dbname=cdm user=alice password=secret"
           (dsn/postgres-dsn {:jdbc-url "jdbc:postgresql://db.example.com:5432/cdm"
                              :user "alice" :password "secret"}))))
  (testing "missing port defaults to 5432"
    (is (= "host=localhost port=5432 dbname=cdm user=alice password=secret"
           (dsn/postgres-dsn {:jdbc-url "jdbc:postgresql://localhost/cdm"
                              :user "alice" :password "secret"}))))
  (testing "query string after dbname is dropped"
    (is (= "host=h port=5432 dbname=cdm user=u password=p"
           (dsn/postgres-dsn {:jdbc-url "jdbc:postgresql://h:5432/cdm?sslmode=require"
                              :user "u" :password "p"}))))
  (testing "single quotes in a credential are doubled for SQL safety"
    (is (= "host=h port=5432 dbname=cdm user=u password=p''q"
           (dsn/postgres-dsn {:jdbc-url "jdbc:postgresql://h:5432/cdm"
                              :user "u" :password "p'q"})))))

(deftest mysql-dsn-test
  (testing "jdbc:mysql url → key/value string with database= and port 3306"
    (is (= "host=db port=3306 database=cdm user=alice password=secret"
           (dsn/mysql-dsn {:jdbc-url "jdbc:mysql://db:3306/cdm"
                           :user "alice" :password "secret"}))))
  (testing "mariadb sub-protocol is accepted"
    (is (= "host=db port=3306 database=cdm user=u password=p"
           (dsn/mysql-dsn {:jdbc-url "jdbc:mariadb://db/cdm" :user "u" :password "p"})))))

(deftest bigquery-project-test
  (testing "ProjectId is extracted case-insensitively from the Simba url"
    (is (= "my-proj"
           (dsn/bigquery-project {:jdbc-url "jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=my-proj;OAuthType=3;DefaultDataset=ds"}))))
  (testing "missing ProjectId throws a clear error"
    (is (thrown-with-msg? Exception #"(?i)projectid"
          (dsn/bigquery-project {:jdbc-url "jdbc:bigquery://host:443;OAuthType=3"})))))

(deftest unparseable-url-test
  (testing "a non-postgres url to postgres-dsn throws"
    (is (thrown-with-msg? Exception #"(?i)postgres"
          (dsn/postgres-dsn {:jdbc-url "jdbc:oracle:thin:@h:1521:orcl" :user "u" :password "p"})))))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `lein test :only trexsql.source-dsn-test`
Expected: FAIL — `No namespace: trexsql.source-dsn` / unresolved `dsn/...`.

- [ ] **Step 3: Write the implementation**

Create `src/trexsql/source_dsn.clj`:

```clojure
(ns trexsql.source-dsn
  "Pure translation of a WebAPI JDBC URL into a DuckDB ATTACH DSN.

   WebAPI Sources hand us a JDBC URL (e.g. jdbc:postgresql://host:5432/db).
   DuckDB's native scanners want their own connection strings:
     - postgres: libpq keyword string  host=.. port=.. dbname=.. user=.. password=..
     - mysql:    key/value string      host=.. port=.. database=.. user=.. password=..
     - bigquery: project=<id>          (dataset is the source schema, supplied separately)
   These functions do no I/O and are fully unit-testable."
  (:require [clojure.string :as str]
            [trexsql.errors :as errors]))

(defn- sql-quote-safe
  "Double single quotes so a value is safe inside a single-quoted ATTACH string."
  [v]
  (str/replace (str v) "'" "''"))

(defn- parse-host-port-db
  "Parse jdbc:<proto>://host[:port]/db[?query] → {:host :port :db}.
   `expected-protos` is a set of acceptable sub-protocols (e.g. #{\"postgresql\"}).
   `default-port` is used when the URL omits the port.
   Throws config-error if the URL does not match `expected-protos`."
  [jdbc-url expected-protos default-port label]
  (let [m (re-matches #"(?i)jdbc:([a-z]+)://([^:/?]+)(?::(\d+))?/([^?]+).*" (str jdbc-url))]
    (when-not m
      (throw (errors/config-error
              (str "Cannot parse " label " JDBC URL: " jdbc-url) :jdbc-url)))
    (let [[_ proto host port db] m]
      (when-not (contains? expected-protos (str/lower-case proto))
        (throw (errors/config-error
                (str label " DSN requires a " label " JDBC URL, got: " jdbc-url) :jdbc-url)))
      {:host host :port (or port (str default-port)) :db db})))

(defn postgres-dsn
  "Build a libpq keyword DSN for DuckDB's postgres scanner from credentials."
  [{:keys [jdbc-url user password]}]
  (let [{:keys [host port db]} (parse-host-port-db jdbc-url #{"postgresql" "postgres"} 5432 "postgres")]
    (format "host=%s port=%s dbname=%s user=%s password=%s"
            (sql-quote-safe host) (sql-quote-safe port) (sql-quote-safe db)
            (sql-quote-safe user) (sql-quote-safe password))))

(defn mysql-dsn
  "Build a key/value DSN for DuckDB's mysql scanner from credentials."
  [{:keys [jdbc-url user password]}]
  (let [{:keys [host port db]} (parse-host-port-db jdbc-url #{"mysql" "mariadb"} 3306 "mysql")]
    (format "host=%s port=%s database=%s user=%s password=%s"
            (sql-quote-safe host) (sql-quote-safe port) (sql-quote-safe db)
            (sql-quote-safe user) (sql-quote-safe password))))

(defn bigquery-project
  "Extract the BigQuery ProjectId (case-insensitive) from a Simba JDBC URL."
  [{:keys [jdbc-url]}]
  (let [m (re-find #"(?i)ProjectId=([^;]+)" (str jdbc-url))]
    (when-not m
      (throw (errors/config-error
              (str "BigQuery JDBC URL missing ProjectId=: " jdbc-url) :jdbc-url)))
    (second m)))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `lein test :only trexsql.source-dsn-test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/trexsql/source_dsn.clj test/trexsql/source_dsn_test.clj
git commit -m "feat(bao): pure JDBC-URL → DuckDB ATTACH DSN translator"
```

---

## Task 2: Pure ATTACH-SQL builders in db.clj

Factor the ATTACH statement strings into pure functions so they are unit-testable without a live database, then add the executing attach functions.

**Files:**
- Modify: `src/trexsql/db.clj` (add after `attach-cache-file!`, before `is-attached?`)
- Test: `test/trexsql/db_attach_test.clj` (create)

- [ ] **Step 1: Write the failing tests**

Create `test/trexsql/db_attach_test.clj`:

```clojure
(ns trexsql.db-attach-test
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.db :as db]))

(deftest postgres-attach-sql-test
  (testing "READ_ONLY postgres ATTACH targeting the per-run alias"
    (is (= "ATTACH IF NOT EXISTS 'host=h port=5432 dbname=cdm user=u password=p' AS \"mysrc__srcdb\" (TYPE postgres, READ_ONLY)"
           (db/postgres-attach-sql "mysrc"
                                   {:jdbc-url "jdbc:postgresql://h:5432/cdm" :user "u" :password "p"})))))

(deftest mysql-attach-sql-test
  (testing "READ_ONLY mysql ATTACH"
    (is (= "ATTACH IF NOT EXISTS 'host=h port=3306 database=cdm user=u password=p' AS \"mysrc__srcdb\" (TYPE mysql, READ_ONLY)"
           (db/mysql-attach-sql "mysrc"
                                {:jdbc-url "jdbc:mysql://h:3306/cdm" :user "u" :password "p"})))))

(deftest bigquery-attach-sql-test
  (testing "bigquery ATTACH (inherently read-only, no READ_ONLY flag)"
    (is (= "ATTACH IF NOT EXISTS 'project=my-proj' AS \"mysrc__srcdb\" (TYPE bigquery)"
           (db/bigquery-attach-sql "mysrc"
                                   {:jdbc-url "jdbc:bigquery://h:443;ProjectId=my-proj"})))))

(deftest attach-sql-rejects-bad-alias-test
  (testing "invalid database-code is rejected before building SQL"
    (is (thrown? Exception
          (db/postgres-attach-sql "bad alias!" {:jdbc-url "jdbc:postgresql://h/d" :user "u" :password "p"})))))

(deftest mask-credentials-test
  (testing "user and password are redacted in DSN-bearing error text"
    (is (= "host=h port=5432 dbname=d user=*** password=***"
           (#'db/mask-credentials "host=h port=5432 dbname=d user=alice password=secret")))))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `lein test :only trexsql.db-attach-test`
Expected: FAIL — `Unable to resolve: db/postgres-attach-sql`.

- [ ] **Step 3: Write the implementation**

In `src/trexsql/db.clj`, add `[trexsql.source-dsn :as source-dsn]` to the `:require`, then insert these functions immediately after `attach-cache-file!`:

```clojure
;; === Native source attach (DuckDB scanners) ===
;; The per-run source alias is "<database-code>__srcdb". It is attached on the
;; same in-memory handle that already holds the cache file as catalog
;; <database-code>, so a cross-catalog CREATE TABLE AS SELECT copies the data.

(defn- source-alias-for [database-code]
  (str database-code "__srcdb"))

(defn postgres-attach-sql
  "Pure: the READ_ONLY postgres ATTACH statement for a source. No I/O."
  [database-code credentials]
  (validate-identifier! database-code "database-code")
  (format "ATTACH IF NOT EXISTS '%s' AS %s (TYPE postgres, READ_ONLY)"
          (source-dsn/postgres-dsn credentials)
          (escape-identifier (source-alias-for database-code) "source-alias")))

(defn mysql-attach-sql
  "Pure: the READ_ONLY mysql ATTACH statement for a source. No I/O."
  [database-code credentials]
  (validate-identifier! database-code "database-code")
  (format "ATTACH IF NOT EXISTS '%s' AS %s (TYPE mysql, READ_ONLY)"
          (source-dsn/mysql-dsn credentials)
          (escape-identifier (source-alias-for database-code) "source-alias")))

(defn bigquery-attach-sql
  "Pure: the bigquery ATTACH statement (inherently read-only). No I/O."
  [database-code credentials]
  (validate-identifier! database-code "database-code")
  (format "ATTACH IF NOT EXISTS 'project=%s' AS %s (TYPE bigquery)"
          (source-dsn/bigquery-project credentials)
          (escape-identifier (source-alias-for database-code) "source-alias")))

(defn- mask-credentials
  "Redact password/user values so a failed ATTACH (whose error embeds the full
   SQL via native/check-error!) never leaks credentials into logs or responses."
  [^String s]
  (-> (str s)
      (str/replace #"(?i)password=[^ '\";]+" "password=***")
      (str/replace #"(?i)user=[^ '\";]+" "user=***")))

(defn- execute-attach!
  "Run an ATTACH statement, masking credentials in any thrown error."
  [^TrexsqlDatabase db ^String attach-sql]
  (try
    (execute! db attach-sql)
    (catch Exception e
      (throw (errors/resource-error
              (str "Source ATTACH failed: " (mask-credentials (.getMessage e)))
              :source)))))

(defn attach-source-postgres!
  "INSTALL/LOAD the postgres scanner and ATTACH the source. Returns the alias."
  [^TrexsqlDatabase db ^String database-code credentials]
  (ensure-open! db)
  (load-extension! db "postgres")
  (execute-attach! db (postgres-attach-sql database-code credentials))
  (source-alias-for database-code))

(defn attach-source-mysql!
  "INSTALL/LOAD the mysql scanner and ATTACH the source. Returns the alias."
  [^TrexsqlDatabase db ^String database-code credentials]
  (ensure-open! db)
  (load-extension! db "mysql")
  (execute-attach! db (mysql-attach-sql database-code credentials))
  (source-alias-for database-code))

(defn attach-source-bigquery!
  "INSTALL/LOAD the bigquery (community) scanner and ATTACH. Returns the alias."
  [^TrexsqlDatabase db ^String database-code credentials]
  (ensure-open! db)
  (load-extension! db "bigquery" :source "community")
  (execute-attach! db (bigquery-attach-sql database-code credentials))
  (source-alias-for database-code))
```

Note: `db.clj` must `:require [trexsql.errors :as errors]` — confirm it is in the `:require` (it is used elsewhere in the file). The masking uses `clojure.string` (already required as `str`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `lein test :only trexsql.db-attach-test`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/trexsql/db.clj test/trexsql/db_attach_test.clj
git commit -m "feat(bao): restore native DuckDB source ATTACH for postgres/mysql/bigquery"
```

---

## Task 3: Restore datamart copy helpers

Restore the pure/SQL copy helpers deleted in `1a5b763`. These build and run the `CREATE TABLE … AS SELECT` copy across the attached source and cache catalogs.

**Files:**
- Modify: `src/trexsql/datamart.clj` (add helpers after `tables-to-arraylist`/before the `fts-config` block)
- Test: `test/trexsql/datamart_test.clj` (add clause-builder tests)

- [ ] **Step 1: Write the failing tests**

Append to `test/trexsql/datamart_test.clj`:

```clojure
(deftest build-select-clause-test
  (testing "nil / * / empty → *"
    (is (= "*" (datamart/build-select-clause nil)))
    (is (= "*" (datamart/build-select-clause ["*"])))
    (is (= "*" (datamart/build-select-clause []))))
  (testing "explicit columns are escaped and comma-joined"
    (is (= "\"person_id\", \"birth_year\""
           (datamart/build-select-clause ["person_id" "birth_year"])))))

(deftest build-where-clause-test
  (testing "no filters → nil"
    (is (nil? (datamart/build-where-clause nil nil))))
  (testing "numeric patient filter builds an IN clause"
    (is (= " WHERE person_id IN (1, 2, 3)"
           (datamart/build-where-clause [1 2 3] nil))))
  (testing "non-numeric patient id is rejected"
    (is (thrown? Exception (datamart/build-where-clause ["1; DROP TABLE x"] nil))))
  (testing "timestamp filter builds a >= clause"
    (is (= " WHERE observation_date >= '2020-01-01'"
           (datamart/build-where-clause nil "2020-01-01"))))
  (testing "bad timestamp is rejected"
    (is (thrown? Exception (datamart/build-where-clause nil "not-a-date")))))

(deftest apply-table-filter-test
  (testing "nil filter → all tables"
    (is (= ["a" "b"] (datamart/apply-table-filter ["a" "b"] nil))))
  (testing "map filter keeps only matching keys"
    (is (= ["a"] (datamart/apply-table-filter ["a" "b"] {"a" ["*"]})))))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `lein test :only trexsql.datamart-test`
Expected: FAIL — `Unable to resolve: datamart/build-select-clause`.

- [ ] **Step 3: Write the implementation**

In `src/trexsql/datamart.clj`, ensure the `:require` includes `[trexsql.errors :as errors]` and `[honey.sql :as sql]` (sql is already required). Add these functions after `tables-to-arraylist` (around line 157, before the `fts-config` def):

```clojure
;; === Native-scanner copy helpers (DuckDB ATTACH + CREATE TABLE AS SELECT) ===

(defn get-source-tables
  "List table names in the attached source schema via information_schema."
  [db source-alias schema-name]
  (db/validate-identifier! source-alias "source-alias")
  (db/validate-identifier! schema-name "schema-name")
  (let [[query-sql & params] (sql/format
                              {:select [:table_name]
                               :from [:information_schema.tables]
                               :where [:and
                                       [:= :table_schema schema-name]
                                       [:= :table_catalog source-alias]]})
        results (db/query-with-params db query-sql (vec params))]
    (mapv #(.get ^HashMap % "table_name") results)))

(defn apply-table-filter
  "Keep only tables present in `table-filter` keys; nil filter keeps all."
  [tables table-filter]
  (if (nil? table-filter)
    tables
    (filterv #(contains? table-filter %) tables)))

(defn build-select-clause
  "\"*\" for nil/empty/[\"*\"]; otherwise escaped, comma-joined column names."
  [columns]
  (if (or (nil? columns) (empty? columns)
          (= ["*"] columns) (= "*" (first columns)))
    "*"
    (do
      (doseq [col columns] (db/validate-identifier! col "column-name"))
      (str/join ", " (map #(db/escape-identifier % "column") columns)))))

(defn- validate-patient-ids [patient-filter]
  (when patient-filter
    (let [invalid (seq (remove #(or (integer? %)
                                    (and (string? %) (re-matches #"^\d+$" %)))
                               patient-filter))]
      (when invalid
        (str "Invalid patient IDs (must be numeric): " (pr-str (take 5 invalid)))))))

(defn- validate-timestamp-filter [timestamp-filter]
  (when timestamp-filter
    (when-not (re-matches #"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$" (str timestamp-filter))
      (str "Invalid timestamp format: " timestamp-filter
           ". Expected ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)"))))

(defn build-where-clause
  "WHERE clause for patient and timestamp filters, or nil. Validates inputs."
  [patient-filter timestamp-filter]
  (when-let [error (validate-patient-ids patient-filter)]
    (throw (errors/validation-error error {:field :patient-filter})))
  (when-let [error (validate-timestamp-filter timestamp-filter)]
    (throw (errors/validation-error error {:field :timestamp-filter})))
  (let [clauses (cond-> []
                  patient-filter
                  (conj (str "person_id IN ("
                             (str/join ", " (map #(if (integer? %) % (Long/parseLong (str %)))
                                                 patient-filter))
                             ")"))
                  timestamp-filter
                  (conj (str "observation_date >= '" timestamp-filter "'")))]
    (when (seq clauses)
      (str " WHERE " (str/join " AND " clauses)))))

(defn copy-table
  "Copy one table from the attached source to the cache catalog.
   Returns TableResult on success, TableError on failure."
  [db source-alias cache-alias schema-name target-schema table-name config]
  (try
    (db/validate-identifier! source-alias "source-alias")
    (db/validate-identifier! cache-alias "cache-alias")
    (db/validate-identifier! schema-name "schema-name")
    (db/validate-identifier! target-schema "target-schema")
    (db/validate-identifier! table-name "table-name")
    (let [{:keys [table-filter patient-filter timestamp-filter]} config
          columns (get table-filter table-name)
          select-clause (build-select-clause columns)
          where-clause (build-where-clause patient-filter timestamp-filter)
          source-table (format "%s.%s.%s"
                               (db/escape-identifier source-alias "source-alias")
                               (db/escape-identifier schema-name "schema-name")
                               (db/escape-identifier table-name "table-name"))
          target-table (format "%s.%s.%s"
                               (db/escape-identifier cache-alias "cache-alias")
                               (db/escape-identifier target-schema "target-schema")
                               (db/escape-identifier table-name "table-name"))
          create-sql (format "CREATE OR REPLACE TABLE %s AS SELECT %s FROM %s WHERE false"
                             target-table select-clause source-table)
          insert-sql (format "INSERT INTO %s SELECT %s FROM %s%s"
                             target-table select-clause source-table (or where-clause ""))]
      (db/execute! db create-sql)
      (db/execute! db insert-sql)
      (let [count-sql (format "SELECT COUNT(*) as cnt FROM %s" target-table)
            count-result (db/query db count-sql)
            row-count (or (some-> count-result first (.get "cnt")) 0)]
        (->TableResult table-name row-count 0)))
    (catch Exception e
      (->TableError table-name (.getMessage e) "copy"))))

(defn- copy-tables-sequential
  [db source-alias cache-alias schema-name target-schema tables-to-copy config]
  (let [total (count tables-to-copy)]
    (loop [remaining tables-to-copy, idx 1, copied [], failed []]
      (if (empty? remaining)
        {:tables-copied copied :tables-failed failed}
        (let [t (first remaining)
              _ (log/info (format "Copying table %d of %d: %s" idx total t))
              result (copy-table db source-alias cache-alias schema-name target-schema t config)]
          (if (instance? TableResult result)
            (recur (rest remaining) (inc idx) (conj copied result) failed)
            (recur (rest remaining) (inc idx) copied (conj failed result))))))))

(defn- copy-tables-parallel
  [db source-alias cache-alias schema-name target-schema tables-to-copy config]
  (let [results (doall
                 (pmap #(copy-table db source-alias cache-alias schema-name target-schema % config)
                       tables-to-copy))
        {copied true failed false} (group-by #(instance? TableResult %) results)]
    {:tables-copied (vec copied) :tables-failed (vec failed)}))

(defn copy-schema
  "Copy all (filtered) tables from the source schema into the cache catalog.
   Returns {:tables-copied [...] :tables-failed [...]}."
  [db source-alias cache-alias config]
  (let [{:keys [schema-name target-schema-name table-filter parallel-copy]} config
        target-schema (or target-schema-name schema-name)
        _ (db/validate-identifier! cache-alias "cache-alias")
        _ (db/validate-identifier! target-schema "target-schema")
        all-tables (get-source-tables db source-alias schema-name)
        tables-to-copy (apply-table-filter all-tables table-filter)
        create-schema-sql (format "CREATE SCHEMA IF NOT EXISTS %s.%s"
                                  (db/escape-identifier cache-alias "cache-alias")
                                  (db/escape-identifier target-schema "target-schema"))]
    (try
      (db/execute! db create-schema-sql)
      (catch Exception e
        (when-not (re-find #"(?i)already exists" (.getMessage e))
          (log/warn (format "Failed to create schema %s.%s: %s"
                            cache-alias target-schema (.getMessage e))))))
    (if parallel-copy
      (copy-tables-parallel db source-alias cache-alias schema-name target-schema tables-to-copy config)
      (copy-tables-sequential db source-alias cache-alias schema-name target-schema tables-to-copy config))))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `lein test :only trexsql.datamart-test`
Expected: PASS (existing tests + the 3 new clause-builder tests).

- [ ] **Step 5: Commit**

```bash
git add src/trexsql/datamart.clj test/trexsql/datamart_test.clj
git commit -m "feat(bao): restore native-scanner copy helpers (select/where/copy-schema)"
```

---

## Task 4: Native dispatch + create-cache-native, wire into create-cache

Add the dialect dispatch and the native orchestration, and rewire `create-cache` so the shared FTS step runs for both paths.

**Files:**
- Modify: `src/trexsql/datamart.clj` (`create-cache` region, ~line 311–377)
- Test: `test/trexsql/datamart_test.clj` (dispatch predicate test)

- [ ] **Step 1: Write the failing test**

Append to `test/trexsql/datamart_test.clj`:

```clojure
(deftest native-scanner-dialect-pred-test
  (testing "postgres/mysql/bigquery + aliases are native; others are not"
    (is (true?  (datamart/native-scanner-dialect? "postgres")))
    (is (true?  (datamart/native-scanner-dialect? "postgresql")))
    (is (true?  (datamart/native-scanner-dialect? "mysql")))
    (is (true?  (datamart/native-scanner-dialect? "mariadb")))
    (is (true?  (datamart/native-scanner-dialect? "bigquery")))
    (is (true?  (datamart/native-scanner-dialect? "BigQuery")))   ; case-insensitive
    (is (false? (datamart/native-scanner-dialect? "oracle")))
    (is (false? (datamart/native-scanner-dialect? "sql server")))
    (is (false? (datamart/native-scanner-dialect? nil)))))
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `lein test :only trexsql.datamart-test`
Expected: FAIL — `Unable to resolve: datamart/native-scanner-dialect?`.

- [ ] **Step 3: Write the implementation**

In `src/trexsql/datamart.clj`, add the dispatch set + predicate near the top (after `valid-dialects`, ~line 55):

```clojure
;; Dialects DuckDB can read directly via a bundled scanner. These take the
;; native ATTACH + CREATE TABLE AS SELECT path; every other valid dialect
;; falls back to the JDBC batch path. postgresql/mariadb are aliases.
(def native-scanner-dialects
  #{"postgres" "postgresql" "mysql" "mariadb" "bigquery"})

(defn native-scanner-dialect?
  "True if `dialect` should use the native DuckDB scanner path."
  [dialect]
  (contains? native-scanner-dialects (str/lower-case (or dialect ""))))
```

Then add `attach-source!` and `create-cache-native` immediately before the existing `create-cache` (after `create-fts-indexes`):

```clojure
(defn attach-source!
  "Attach the source via the matching DuckDB scanner. Returns the alias."
  [db database-code credentials]
  (case (str/lower-case (:dialect credentials))
    ("postgres" "postgresql") (db/attach-source-postgres! db database-code credentials)
    ("mysql" "mariadb")       (db/attach-source-mysql! db database-code credentials)
    "bigquery"                (db/attach-source-bigquery! db database-code credentials)
    (throw (errors/config-error
            (str "Dialect is not a native-scanner dialect: " (:dialect credentials))
            :dialect))))

(defn create-cache-native
  "Native-scanner cache read. Attaches the cache file and the source on the
   same handle, copies the schema with DuckDB doing all type conversion, then
   detaches the source. Returns the SAME map shape as batch/create-cache-jdbc
   (no FTS, no ->CacheResult — create-cache adds those), so the shared FTS
   step in create-cache works identically for both paths."
  [db config]
  (let [start (System/currentTimeMillis)
        {:keys [database-code schema-name source-credentials cache-path]} config]
    (db/attach-cache-file! db database-code (or cache-path "./data/cache"))
    (let [source-alias (attach-source! db database-code source-credentials)]
      (try
        (let [{:keys [tables-copied tables-failed]}
              (copy-schema db source-alias database-code config)]
          {:success? (empty? tables-failed)
           :database-code database-code
           :schema-name schema-name
           :tables-copied (mapv (fn [t] {:table-name (:table-name t)
                                         :rows-copied (:rows-copied t)}) tables-copied)
           :tables-failed (mapv (fn [t] {:table-name (:table-name t)
                                         :error (:error t)
                                         :phase (:phase t)}) tables-failed)
           :duration-ms (- (System/currentTimeMillis) start)
           :error nil})
        (finally
          (try (db/detach-database! db source-alias)
               (catch Exception e
                 (log/warn (format "Failed to detach source %s: %s"
                                   source-alias (.getMessage e))))))))))
```

Finally, change `create-cache` so the read step dispatches. Replace the `let` binding `result (batch/create-cache-jdbc db jdbc-config progress-fn)` and the line above it (`jdbc-config (convert-config-for-jdbc config)`) with:

```clojure
   (let [dialect (get-in config [:source-credentials :dialect])
         result (if (native-scanner-dialect? dialect)
                  (create-cache-native db config)
                  (batch/create-cache-jdbc db (convert-config-for-jdbc config) progress-fn))
         tables-copied (:tables-copied result)
```

Leave the rest of `create-cache` (the FTS block gated on `(:success? result)` and the `->CacheResult` assembly) exactly as-is — it already consumes `(:table-name t)` / `(:rows-copied t)` from `tables-copied`, which `create-cache-native` provides.

Also update the `create-cache` docstring first line from "Every supported dialect goes through the JDBC batch transfer path" to: "postgres/mysql/bigquery use the native DuckDB scanner path; all other dialects use the JDBC batch transfer path. After the copy, FTS indexes are built on the configured tables."

- [ ] **Step 4: Run the tests to verify they pass**

Run: `lein test`
Expected: PASS — all namespaces, including the new dispatch test.

- [ ] **Step 5: Commit**

```bash
git add src/trexsql/datamart.clj test/trexsql/datamart_test.clj
git commit -m "feat(bao): dispatch create-cache to native scanner path for pg/mysql/bigquery"
```

---

## Task 5: Update the stale module docstring/comments

The `1a5b763` comments now misdescribe the module. Fix them so future readers aren't misled.

**Files:**
- Modify: `src/trexsql/datamart.clj` (ns docstring ~line 2-5; the comment block ~line 30-34 above `valid-dialects`)

- [ ] **Step 1: Update the ns docstring**

Replace the `trexsql.datamart` ns docstring with:

```clojure
  "Datamart (cache) creation for source database schemas in TrexSQL.
   postgres/mysql/bigquery use DuckDB's native scanners (ATTACH + CREATE TABLE
   AS SELECT over the TrexEngine FFI handle); all other dialects use the JDBC
   batch transfer path (HikariCP + SqlRender). FTS indexing and progress
   reporting run on the cache file after the copy completes."
```

- [ ] **Step 2: Fix the comment above `valid-dialects`**

Replace the comment block that currently says "Every dialect goes through the same JDBC + HikariCP + SqlRender path; there is no longer a native DuckDB scanner code path." with:

```clojure
;; Mirrors WebAPI's DBMSType enum so any source the WebAPI accepts can be
;; cached. postgres/mysql/bigquery read via DuckDB's bundled scanners (see
;; native-scanner-dialects); the rest read via JDBC + HikariCP + SqlRender.
;; "postgres"/"mariadb" are kept as forgiving aliases for "postgresql"/"mysql".
```

- [ ] **Step 3: Verify it still compiles**

Run: `lein test`
Expected: PASS (no behavior change).

- [ ] **Step 4: Commit**

```bash
git add src/trexsql/datamart.clj
git commit -m "docs(bao): correct datamart module comments for the hybrid read paths"
```

---

## Task 6: Postgres end-to-end integration test (native path)

Prove the native path actually copies rows and that FTS runs, against a live Postgres. Marked `^:integration` so the default `lein test` run can exclude it where no DB is available.

**Files:**
- Test: `test/trexsql/datamart_native_integration_test.clj` (create)

**Prereq:** a reachable Postgres with a small schema. The repo's compose stack provides one; export its URL, e.g. `export BAO_IT_PG_URL=jdbc:postgresql://localhost:5432/cdm BAO_IT_PG_USER=postgres BAO_IT_PG_PASS=postgres BAO_IT_PG_SCHEMA=demo_cdm`.

- [ ] **Step 1: Write the integration test**

Create `test/trexsql/datamart_native_integration_test.clj`:

```clojure
(ns trexsql.datamart-native-integration-test
  "End-to-end: native DuckDB postgres-scanner copy + FTS. Requires a live
   Postgres; set BAO_IT_PG_URL/USER/PASS/SCHEMA. Run with:
     lein test :only trexsql.datamart-native-integration-test"
  (:require [clojure.test :refer [deftest is testing]]
            [trexsql.db :as db]
            [trexsql.datamart :as datamart]))

(defn- env [k] (System/getenv k))

(deftest ^:integration native-postgres-copy-test
  (when (env "BAO_IT_PG_URL")
    (let [conn (db/create-connection {:allow-unsigned-extensions true})
          handle (db/make-database conn {})
          tmp (str (System/getProperty "java.io.tmpdir") "/bao-it-cache")
          config {:database-code "it_pg"
                  :schema-name (env "BAO_IT_PG_SCHEMA")
                  :target-schema-name (env "BAO_IT_PG_SCHEMA")
                  :cache-path tmp
                  :fts-tables ["concept"]
                  :source-credentials {:dialect "postgres"
                                       :jdbc-url (env "BAO_IT_PG_URL")
                                       :user (env "BAO_IT_PG_USER")
                                       :password (env "BAO_IT_PG_PASS")}}
          result (datamart/create-cache handle config nil)]
      (testing "copy succeeded with at least one table"
        (is (:success? result))
        (is (pos? (count (:tables-copied result)))))
      (testing "FTS index built on concept (if present in the source)"
        (when (some #(= "concept" (:table-name %)) (:tables-copied result))
          (is (some #{"concept"} (:fts-indexes-created result)))))
      (db/close! handle))))
```

- [ ] **Step 2: Run it against the live DB**

Run: `BAO_IT_PG_URL=... BAO_IT_PG_USER=... BAO_IT_PG_PASS=... BAO_IT_PG_SCHEMA=... lein test :only trexsql.datamart-native-integration-test`
Expected: PASS. (With `BAO_IT_PG_URL` unset, the test body no-ops and still passes.)

- [ ] **Step 3: Verify the default suite is unaffected**

Run: `lein test`
Expected: PASS — the integration test no-ops without env vars.

- [ ] **Step 4: Commit**

```bash
git add test/trexsql/datamart_native_integration_test.clj
git commit -m "test(bao): native postgres-scanner cache end-to-end + FTS integration test"
```

---

## Task 7: Register fallback JDBC drivers + SqlRender resources for native image

The JDBC fallback (oracle/sql server/redshift/snowflake/etc.) breaks under native image because driver classes and SqlRender resources are not in `graalvm-config/`. Register them so the closed-world build keeps them.

**Files:**
- Modify: `plugins/webapi/graalvm-config/reflect-config.json`
- Modify: `plugins/webapi/graalvm-config/resource-config.json`

- [ ] **Step 1: Identify the drivers actually shipped by WebAPI**

Run (from repo root): `grep -rREn 'class="[a-zA-Z0-9.]*Driver"|Driver' plugins/webapi/webapi-be/src/main/resources 2>/dev/null | head; ls plugins/webapi/webapi-be 2>/dev/null`
Then list the JDBC driver classes on the WebAPI classpath:
Run: `cd plugins/webapi/webapi-be && mvn -q dependency:list 2>/dev/null | grep -iE 'postgresql|mysql|ojdbc|mssql|redshift|snowflake|simba|jtds'`
Record the driver class names (e.g. `org.postgresql.Driver`, `com.microsoft.sqlserver.jdbc.SQLServerDriver`, `oracle.jdbc.OracleDriver`, `com.amazon.redshift.jdbc.Driver`, `net.snowflake.client.jdbc.SnowflakeDriver`).

- [ ] **Step 2: Add the driver classes to reflect-config.json**

For each driver class found in Step 1 that is *not* already present (postgres/mysql/bigquery are handled natively and are not required here, but registering them is harmless), add an entry to the JSON array in `plugins/webapi/graalvm-config/reflect-config.json`:

```json
  { "name": "oracle.jdbc.OracleDriver", "allDeclaredConstructors": true, "allPublicConstructors": true, "allDeclaredMethods": true },
  { "name": "com.microsoft.sqlserver.jdbc.SQLServerDriver", "allDeclaredConstructors": true, "allPublicConstructors": true, "allDeclaredMethods": true },
  { "name": "com.amazon.redshift.jdbc.Driver", "allDeclaredConstructors": true, "allPublicConstructors": true, "allDeclaredMethods": true },
  { "name": "net.snowflake.client.jdbc.SnowflakeDriver", "allDeclaredConstructors": true, "allPublicConstructors": true, "allDeclaredMethods": true }
```

(Use only the classes confirmed present in Step 1. The JSON is a single top-level array — insert these objects as elements, keeping commas valid.)

- [ ] **Step 3: Add the JDBC service file + SqlRender resources to resource-config.json**

In `plugins/webapi/graalvm-config/resource-config.json`, under `"resources": { "includes": [ ... ] }`, add patterns so the `java.sql.Driver` service registry and SqlRender's translation CSVs are embedded:

```json
  { "pattern": "\\QMETA-INF/services/java.sql.Driver\\E" },
  { "pattern": "inst/csv/replacementPatterns.csv" },
  { "pattern": ".*org/ohdsi/sql/.*\\.csv" },
  { "pattern": ".*org/ohdsi/circe/.*\\.json" }
```

- [ ] **Step 4: Validate the JSON**

Run (from repo root): `python3 -m json.tool plugins/webapi/graalvm-config/reflect-config.json >/dev/null && python3 -m json.tool plugins/webapi/graalvm-config/resource-config.json >/dev/null && echo OK`
Expected: `OK` (no JSON parse errors).

- [ ] **Step 5: Commit**

```bash
git add plugins/webapi/graalvm-config/reflect-config.json plugins/webapi/graalvm-config/resource-config.json
git commit -m "fix(webapi): register fallback JDBC drivers + SqlRender resources for native image"
```

---

## Task 8: Capture cache metadata automatically in the tracing run

`gen-graalvm-config.sh` runs with `trexsql.enabled=false`, so the cache path is never traced. Add a traced cache exercise with `trexsql.enabled=true` so the agent records any remaining reflection/resource needs.

**Files:**
- Modify: `plugins/webapi/gen-graalvm-config.sh`

- [ ] **Step 1: Add a traced cache exercise**

In `gen-graalvm-config.sh`, locate the `SPRING_APPLICATION_JSON` export that sets `"trexsql.enabled":"false"`. Add a second capture phase after the existing scheduler-capture: set `trexsql.enabled=true`, point a Source at the ephemeral Postgres already started in the script, and invoke the cache endpoint so the JDBC fallback path runs under the agent. Insert, right before the final "review and commit" message:

```bash
# --- Capture the JDBC cache path (trexsql enabled) ---
# The agent is already attached for the whole JVM run; exercising cache
# creation here records SqlRender resource loads and any JDBC driver
# reflection the fallback path needs.
echo "[gen-config] exercising JDBC cache path under the agent"
CACHE_SRC_KEY="${CACHE_SRC_KEY:-it_src}"
# Register a Postgres Source pointing at the local ephemeral DB, then POST the
# cache endpoint. Adjust the curl auth/headers to match the running WebAPI.
curl -fsS -X POST "http://localhost:8080/WebAPI/source/${CACHE_SRC_KEY}/cache" \
  -H 'Content-Type: application/json' \
  -d '{"schemaName":"webapi"}' || \
  echo "[gen-config] WARN: cache exercise returned non-zero (trace may be incomplete)"
sleep 5
```

(If WebAPI is booted with `trexsql.enabled=false` earlier in the script, change that boot to `trexsql.enabled=true` for the run, or add a second short-lived boot with it enabled. Keep the existing scheduler/proxy capture intact.)

- [ ] **Step 2: Shellcheck the script**

Run (from repo root): `bash -n plugins/webapi/gen-graalvm-config.sh && echo OK`
Expected: `OK` (syntax valid; full execution requires GraalVM + Maven + Postgres and is run in CI/manually).

- [ ] **Step 3: Commit**

```bash
git add plugins/webapi/gen-graalvm-config.sh
git commit -m "build(webapi): trace the cache path with trexsql enabled in gen-graalvm-config"
```

---

## Task 9: Native-image cache smoke check

`smoke.sh` boots the native WebAPI (`/app/harness`) with `trexsql.enabled=true`, then probes endpoints with inline `curl` (capturing `%{http_code}`) and greps `/tmp/harness.log` for native-image reachability errors. It already sweeps `/sqlrender/translate` (exercises SqlRender resource loading) and `/trexsql/cache/jobs`. This task adds (a) a best-effort native-scanner cache create against the local Postgres and (b) a focused reachability grep for the risk classes this work introduces. It reuses the file's existing inline-curl + log-grep style — no new helpers.

**Files:**
- Modify: `plugins/webapi/smoke/smoke.sh`

- [ ] **Step 1: Add a best-effort cache-create probe (after the endpoint sweep)**

The smoke's Postgres holds the `webapi` database. Register a self-referential Postgres Source via the WebAPI REST API, then POST the cache endpoint, so the **native postgres-scanner path** runs inside the native image. Insert after the `=== endpoint probes` loop:

```bash
echo "=== native-scanner cache create probe ==="
# Register a postgres Source pointing at the local DB (idempotent; ignore errors
# if it already exists). The body shape matches WebAPI's Source API.
curl -s -m 20 -X POST "$BASE/source" -H 'Content-Type: application/json' -d '{
  "sourceName":"smoke-pg","sourceKey":"smoke_pg","sourceDialect":"postgresql",
  "sourceConnection":"jdbc:postgresql://localhost:5432/webapi",
  "username":"ohdsi_app_user","password":"app1",
  "daimons":[{"daimonType":"CDM","tableQualifier":"webapi","priority":0}]
}' -o /tmp/smoke-source.json -w "  source-register: %{http_code}\n" || true
# Trigger a cache build for the webapi schema (small set of BATCH_ tables — enough
# to prove ATTACH + CREATE TABLE AS SELECT runs natively without JDBC).
cache_code=$(curl -s -m 60 -X POST "$BASE/source/smoke_pg/cache" \
  -H 'Content-Type: application/json' -d '{"schemaName":"webapi"}' \
  -o /tmp/smoke-cache.json -w "%{http_code}" || echo ERR)
echo "  cache-create: $cache_code"
cat /tmp/smoke-cache.json 2>/dev/null | head -c 400; echo
if ls -1 /tmp/trexcache/smoke_pg.db >/dev/null 2>&1; then
  echo "OK: cache file /tmp/trexcache/smoke_pg.db created (native scanner path)"
else
  echo "WARN: cache file not found — check the cache-create response above"
fi
```

- [ ] **Step 2: Add a focused reachability grep for this work's risk classes**

Insert after the existing `=== native-image reachability errors during the sweep` block:

```bash
echo "=== cache-path native-image reachability check (JDBC driver / SqlRender / duckdb scanner) ==="
if grep -iE "No suitable driver|error loading .*driver|org\.postgresql\.Driver|SqlRender|replacementPatterns|postgres_scanner|mysql_scanner|bigquery.*extension|not registered for reflection" /tmp/harness.log \
   | grep -iE "Unsupported|ClassNotFound|NoClassDefFound|not registered|No suitable driver|FileNotFound|could not (load|open)" ; then
  echo "FAIL: cache-path reachability/resource gap in the native image (see lines above)"
else
  echo "OK: no JDBC-driver / SqlRender / duckdb-scanner reachability gaps on the cache path"
fi
```

- [ ] **Step 3: Shellcheck the script**

Run (from repo root): `bash -n plugins/webapi/smoke/smoke.sh && echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add plugins/webapi/smoke/smoke.sh
git commit -m "test(webapi): native-image smoke for cache creation + scanner/SqlRender reachability"
```

---

## Task 10: Full verification pass

- [ ] **Step 1: Run the full bao test suite**

Run (from `plugins/bao/java`): `lein test`
Expected: PASS — all namespaces, zero failures/errors.

- [ ] **Step 2: Run the native integration test against the compose Postgres**

Bring up the compose stack's Postgres (per repo docs), then:
Run: `BAO_IT_PG_URL=... BAO_IT_PG_USER=... BAO_IT_PG_PASS=... BAO_IT_PG_SCHEMA=... lein test :only trexsql.datamart-native-integration-test`
Expected: PASS — `:success?` true, tables copied, FTS on `concept`.

- [ ] **Step 3: Confirm JSON configs are valid**

Run (from repo root): `python3 -m json.tool plugins/webapi/graalvm-config/reflect-config.json >/dev/null && python3 -m json.tool plugins/webapi/graalvm-config/resource-config.json >/dev/null && echo OK`
Expected: `OK`.

- [ ] **Step 4: (Heavy, CI/manual) Build the native lib and run smoke**

Run (from repo root): `bash plugins/webapi/build-native-lib.sh && bash plugins/webapi/smoke/smoke.sh`
Expected: native lib builds; smoke passes including the new cache step. (Requires GraalVM + ~6–8 GB RAM + Postgres; typically run in CI, not locally.)

- [ ] **Step 5: Final review of the diff**

Run (from repo root): `git diff --stat develop...HEAD`
Confirm only the files in this plan's File Structure were touched.

---

## Notes & Deferred Items (not in scope)

- **No Spring Batch job rows for the native path.** Like the original native implementation, `create-cache-native` is synchronous and does not write `cacheGeneration` job rows or call `progress-fn`. If a status/poll endpoint assumes a job row exists for every cache build, verify it tolerates the native path during Task 6/10; if not, raise it as a follow-up (the synchronous POST already returns the full `CacheResult`).
- **MySQL/BigQuery** are covered at the unit level (DSN + ATTACH-string) in this pass; live end-to-end tests for them are future work.
- **HANA** stays on the JDBC fallback; a native HANA path (`trex_hana_attach`/`hana_scan`) behind `attach-source!` is future work.
- **Validation** (`validate-credentials`) is unchanged; it requires `jdbc-url`. For BigQuery OAuth sources lacking user/password, confirm validation passes during integration — adjust only if it blocks (out of scope otherwise).
