(ns trexsql.agent.tools.all
  "Static requires of every agent tool namespace.

   tools.clj dispatches each tool with (requiring-resolve 'trexsql.agent.tools.X/run).
   The tool namespaces require the tools registry (trexsql.agent.tools) for shared
   schemas, so the registry can't require them back — that cycle is why dispatch is
   dynamic. In a closed-world GraalVM native image a namespace reached only via runtime
   requiring-resolve is never AOT-compiled or included, so the call fails with
   FileNotFoundException: ...search_concepts__init.class. This namespace sits outside
   the cycle and is pulled in from trexsql.agent.routes, making every tool reachable
   (AOT-compiled, included, build-time-loaded) so the runtime requiring-resolve is a
   no-op. Order-independent; listed alphabetically."
  (:require [trexsql.agent.tools._search-util]
            [trexsql.agent.tools.draft-concept-set-spec]
            [trexsql.agent.tools.get-artifact]
            [trexsql.agent.tools.get-cohort-generation-summary]
            [trexsql.agent.tools.get-cohort-overlap]
            [trexsql.agent.tools.get-reference-phenotype]
            [trexsql.agent.tools.search-characterizations]
            [trexsql.agent.tools.search-concept-sets]
            [trexsql.agent.tools.search-concepts]
            [trexsql.agent.tools.search-existing-cohorts]
            [trexsql.agent.tools.search-feature-analyses]
            [trexsql.agent.tools.search-incidence-rates]
            [trexsql.agent.tools.search-ohdsi-book]
            [trexsql.agent.tools.search-ohdsi-studies]
            [trexsql.agent.tools.search-pathways]
            [trexsql.agent.tools.search-phenotypes]
            [trexsql.agent.tools.summarise-attrition]
            [trexsql.agent.tools.validate-circe]
            [trexsql.agent.tools.verify-concept-mapping]
            [trexsql.agent.tools.web-search]))
