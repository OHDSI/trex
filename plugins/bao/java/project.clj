(defproject org.trex/trexsql "0.3.1"
  :description "Clojure DuckDB library for TREX - replaces bao with JVM implementation"
  :url "https://github.com/p-hoffmann/trex-java"
  :license {:name "Apache License 2.0"
            :url "https://www.apache.org/licenses/LICENSE-2.0"}

  :repositories [["jitpack" "https://jitpack.io"]
                 ["ohdsi" "https://repo.ohdsi.org/nexus/content/groups/public"]]

  :java-source-paths ["java"]

  ;; Global exclusions for logging - let the container provide these
  :exclusions [ch.qos.logback/logback-classic
               ch.qos.logback/logback-core]

  :dependencies [[org.clojure/clojure "1.11.1"]
                 [net.java.dev.jna/jna "5.15.0"]
                 [org.clojure/tools.cli "1.1.230"]
                 ;; cheshire (not clojure.data.json) for JSON: data.json calls
                 ;; (set! *warn-on-reflection*) at load, which breaks GraalVM
                 ;; native-image build-time init (see trexsql.json).
                 [cheshire "5.13.0"]
                 ;; HoneySQL for SQL generation (005-jdbc-batch-cache)
                 [com.github.seancorfield/honeysql "2.6.1196"]
                 ;; HikariCP for connection pooling (005-jdbc-batch-cache)
                 [com.zaxxer/HikariCP "5.1.0"]
                 ;; Logging (T4.1.1-T4.1.2) - provided by container
                 [org.clojure/tools.logging "1.2.4"]
                 ;; Ring for HTTP/Servlet integration
                 [ring/ring-core "1.14.1"]
                 [org.ring-clojure/ring-jakarta-servlet "1.14.1"]
                 [ring/ring-json "0.5.1"]
                 ;; Jakarta Servlet API (provided at runtime by container)
                 [jakarta.servlet/jakarta.servlet-api "6.0.0" :scope "provided"]
                 ;; Reitit for routing
                 [metosin/reitit-ring "0.7.2"]
                 [clj-http "3.12.3"]
                 ;; Spring Boot auto-configuration (provided by WebAPI at runtime)
                 [org.springframework.boot/spring-boot-autoconfigure "3.5.6" :scope "provided"]
                 [org.springframework.boot/spring-boot "3.5.6" :scope "provided"]
                 [org.springframework/spring-context "6.2.6" :scope "provided"]
                 [org.springframework/spring-web "6.2.6" :scope "provided"]
                 ;; spring-orm + JPA API for the /trexsql/* OpenEntityManagerInView
                 ;; filter (binds an EntityManager to servlet-thread requests).
                 [org.springframework/spring-orm "6.2.6" :scope "provided"]
                 [jakarta.persistence/jakarta.persistence-api "3.1.0" :scope "provided"]
                 ;; OHDSI vocabulary interfaces (provided by WebAPI at runtime)
                 [org.ohdsi/standardized-analysis-specs "1.5.0" :scope "provided"]
                 ;; SLF4J API (provided by WebAPI at runtime)
                 [org.slf4j/slf4j-api "2.0.16" :scope "provided"]
                 ;; AWS Bedrock SDK for the cohort-design agent (trexsql.agent.*)
                 [software.amazon.awssdk/bedrockruntime "2.28.16"]
                 ;; Force Jackson to match WebAPI's Spring Boot 3.5.6 version (2.18.2),
                 ;; otherwise cheshire pulls in 2.10/2.11 which doesn't support Java records
                 ;; → Spring's content negotiation fails serialising LoginService.Result → 406.
                 [com.fasterxml.jackson.core/jackson-core "2.18.2"]
                 [com.fasterxml.jackson.core/jackson-databind "2.18.2"]
                 [com.fasterxml.jackson.core/jackson-annotations "2.18.2"]
                 [com.fasterxml.jackson.dataformat/jackson-dataformat-smile "2.18.2"]
                 [com.fasterxml.jackson.dataformat/jackson-dataformat-cbor "2.18.2"]]

  :source-paths ["src"]
  :test-paths ["test"]
  :resource-paths ["resources"]

  :main trexsql.core

  ;; clj-http is reached only via runtime requiring-resolve (trexsql.http-client),
  ;; so AOT it here to put its classes in the closed-world native image. Without
  ;; this the runtime require recompiles clj_http/*.clj from source, which a native
  ;; image can't do. Init stays deferred via --initialize-at-run-time=clj_http.
  :aot [trexsql.api trexsql.core trexsql.servlet
        trexsql.webapi.plugin trexsql.webapi.search-provider
        clj-http.client clj-http.conn-mgr]

  :profiles {:dev {:dependencies [[org.clojure/test.check "1.1.1"]]}
             :uberjar {:aot :all
                       :uberjar-name "trexsql-%s-standalone.jar"}}

  :repl-options {:init-ns trexsql.core})
