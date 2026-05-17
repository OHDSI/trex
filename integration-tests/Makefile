REPO_ROOT=$(shell cd .. && pwd)
DB_EXT=$(REPO_ROOT)/plugins/db/build/debug/extension/db/db.trex
PGWIRE_EXT=$(REPO_ROOT)/plugins/pgwire/build/debug/extension/pgwire/pgwire.trex
ATLAS_EXT=$(REPO_ROOT)/plugins/atlas/build/release/extension/circe/circe.trex
AI_EXT=$(REPO_ROOT)/plugins/ai/build/debug/extension/ai/ai.trex
CHDB_EXT=$(REPO_ROOT)/plugins/chdb/build/debug/extension/chdb/chdb.trex
HANA_EXT=$(REPO_ROOT)/plugins/hana/build/debug/extension/hana_scan/hana_scan.trex
TPM_EXT=$(REPO_ROOT)/plugins/tpm/build/debug/extension/tpm/tpm.trex
ETL_EXT=$(REPO_ROOT)/plugins/etl/build/debug/extension/etl/etl.trex
MIGRATION_EXT=$(REPO_ROOT)/plugins/migration/build/debug/extension/migration/migration.trex
FHIR_EXT=$(REPO_ROOT)/plugins/fhir/build/debug/extension/fhir/fhir.trex
TREXAS_EXT=$(REPO_ROOT)/plugins/runtime/build/debug/extension/trexas/trexas.trex
PYTHON_BIN?=python3
VENV=./venv
PYTEST=$(VENV)/bin/pytest
PYTEST_COV_ARGS=--cov=. --cov-report=xml:coverage/python.xml --cov-append

.PHONY: configure test test-tier1 test-tier2 test-tier3 test-pgwire test-pgwire-db test-pgwire-decimal test-pgwire-datatypes test-atlas test-ai test-chdb test-chdb-db test-hana test-tpm test-etl test-etl-db test-fhir test-trexas test-trexas-swarm test-pg-trex check-extensions check-pgwire check-atlas check-ai check-chdb check-hana check-tpm check-etl check-fhir check-migration check-trexas check-db hana-up hana-down hana-clean pg-trex-up pg-trex-down clean coverage-merge coverage-clean

configure:
	$(PYTHON_BIN) -m venv $(VENV)
	$(VENV)/bin/pip install 'duckdb==1.4.4' pytest pytest-cov psycopg2-binary

check-extensions:
	@test -f $(DB_EXT) || (echo "Build db first: cd ../plugins/db && make configure && make debug" && exit 1)

check-pgwire:
	@test -f $(PGWIRE_EXT) || (echo "Build pgwire first: cd ../plugins/pgwire && make configure && make debug" && exit 1)

check-atlas:
	@test -f $(ATLAS_EXT) || (echo "Build atlas first: cd ../plugins/atlas && make configure && make release" && exit 1)

check-ai:
	@test -f $(AI_EXT) || (echo "Build ai first: cd ../plugins/ai && make configure && make debug" && exit 1)

check-chdb:
	@test -f $(CHDB_EXT) || (echo "Build chdb first: cd ../plugins/chdb && make configure && make debug" && exit 1)

test: check-extensions check-pgwire
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_tier1_single_node.py test_tier2_two_node.py test_tier3_aggregation.py test_pgwire_standalone.py test_pgwire_db.py

test-tier1: check-extensions
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_tier1_single_node.py

test-tier2: check-extensions
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_tier2_two_node.py

test-tier3: check-extensions
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_tier3_aggregation.py

test-tier4: check-extensions
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_tier4_cross_node_joins.py

test-tier5: check-extensions
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_tier5_workload_mgmt.py

test-tier6: check-extensions
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_tier6_ballista.py

test-distributed: test-tier6

test-tier7: check-extensions
	@mkdir -p coverage
	SWARM_BROADCAST_THRESHOLD=0 $(PYTEST) -v $(PYTEST_COV_ARGS) test_tier7_shuffle.py

test-shuffle: test-tier7

test-tier8: check-extensions
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_tier8_partitioning.py

test-partitioning: test-tier8

test-pgwire: check-pgwire
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_pgwire_standalone.py

test-pgwire-db: check-extensions check-pgwire
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_pgwire_db.py

test-pgwire-decimal: check-pgwire
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_pgwire_decimal.py

test-pgwire-datatypes: check-pgwire
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_pgwire_datatypes.py

test-atlas: check-atlas
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_atlas_standalone.py

test-ai: check-ai
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_ai_standalone.py

test-chdb: check-chdb
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_chdb_standalone.py

test-chdb-db: check-extensions check-chdb
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_chdb_db.py

check-tpm:
	@test -f $(TPM_EXT) || (echo "Build tpm first: cd ../plugins/tpm && make configure && make debug" && exit 1)

check-hana:
	@test -f $(HANA_EXT) || (echo "Build hana first: cd ../plugins/hana && make configure && make debug" && exit 1)

hana-up:
	docker compose -f docker-compose.hana.yml up -d
	@echo "Waiting for HANA to be ready (this may take several minutes on first start)..."
	@for i in $$(seq 1 60); do \
		docker logs trex-hana 2>&1 | grep -q "post_start" && echo "HANA is ready!" && exit 0; \
		sleep 10; \
	done; \
	echo "Timeout waiting for HANA (10 min)" && exit 1

hana-down:
	docker compose -f docker-compose.hana.yml down

hana-clean:
	docker compose -f docker-compose.hana.yml down -v

test-tpm: check-tpm
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_tpm_standalone.py

test-hana: check-hana
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_hana_standalone.py

check-trexas:
	@test -f $(TREXAS_EXT) || (echo "Build trexas first: cd ../plugins/runtime && make configure && make debug" && exit 1)

test-trexas: check-trexas
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_trexas_standalone.py

test-trexas-swarm: check-extensions check-trexas
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_trexas_swarm.py

check-etl:
	@test -f $(ETL_EXT) || (echo "Build etl first: cd ../plugins/etl && make configure && make debug" && exit 1)

test-etl: check-etl
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_etl_standalone.py

check-db:
	@test -f $(DB_EXT) || (echo "Build db first: cd ../plugins/db && make configure && make debug" && exit 1)

test-etl-db: check-etl check-db
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_etl_db.py

pg-trex-up:
	docker compose -f docker-compose.pg_trex.yml up -d
	@echo "Waiting for pg_trex to be ready..."
	@for i in $$(seq 1 30); do \
		docker exec trex-pg-trex pg_isready -U postgres 2>/dev/null && echo "pg_trex is ready!" && exit 0; \
		sleep 2; \
	done; \
	echo "Timeout waiting for pg_trex (60s)" && exit 1

pg-trex-down:
	docker compose -f docker-compose.pg_trex.yml down -v

test-pg-trex:
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_pg_trex.py

check-migration:
	@test -f $(MIGRATION_EXT) || (echo "Build migration first: cd ../plugins/migration && make configure && make debug" && exit 1)

test-migration: check-migration
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_migration_standalone.py

check-fhir:
	@test -f $(FHIR_EXT) || (echo "Build fhir first: cd ../plugins/fhir && make configure && make debug" && exit 1)

test-fhir: check-fhir
	@mkdir -p coverage
	$(PYTEST) -v $(PYTEST_COV_ARGS) test_fhir_standalone.py

clean:
	rm -rf venv __pycache__ .pytest_cache

# ---- Coverage merge (see docs/superpowers/specs/2026-05-17-test-infrastructure-and-coverage-design.md) ----

.PHONY: coverage-merge coverage-clean

# Merge all .profraw files produced by a TREX_COVERAGE=1 test run into per-plugin
# lcov.info files. Requires llvm-profdata + llvm-cov on PATH (rustup component
# add llvm-tools-preview provides matching versions).
coverage-merge:
	@if ! ls coverage/profraw/*.profraw >/dev/null 2>&1; then \
	  echo "coverage-merge: no .profraw files found, skipping"; exit 0; \
	fi
	@mkdir -p coverage/lcov
	@LLVM_PROFDATA=$$(command -v llvm-profdata || rustc --print sysroot 2>/dev/null | xargs -I{} echo {}/lib/rustlib/$$(rustc -vV | sed -n 's/host: //p')/bin/llvm-profdata); \
	  LLVM_COV=$$(command -v llvm-cov || rustc --print sysroot 2>/dev/null | xargs -I{} echo {}/lib/rustlib/$$(rustc -vV | sed -n 's/host: //p')/bin/llvm-cov); \
	  $$LLVM_PROFDATA merge -sparse coverage/profraw/*.profraw -o coverage/merged.profdata; \
	  for plugin_dir in $(REPO_ROOT)/plugins/*/build/debug/extension/*/; do \
	    name=$$(basename $$plugin_dir); \
	    binary=$$plugin_dir$$name.trex; \
	    [ -f $$binary ] || continue; \
	    $$LLVM_COV export --format=lcov --instr-profile=coverage/merged.profdata $$binary > coverage/lcov/$$name.lcov 2>/dev/null || \
	      echo "coverage-merge: skip $$name (no instrumented symbols)"; \
	  done

coverage-clean:
	rm -rf coverage
