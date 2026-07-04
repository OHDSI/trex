# Differential conformance harness: PostgREST v12.2.3 (oracle) vs the
# plugins/postgrest Deno worker, replaying the upstream hspec-wai corpus.
#
# Workflow:
#   make corpus POSTGREST_SRC=/path/to/postgrest-12.2.3   # extract requests
#   make up                                               # db + oracle
#   make serve                                            # plugin server (bg)
#   make diff                                             # replay + report
#   make serve-stop down                                  # teardown

REPO_ROOT=$(shell cd ../.. && pwd)
PYTHON_BIN?=python3
DENO_BIN?=deno
# PostgREST v12.2.3 source checkout (test/spec/** must exist)
POSTGREST_SRC?=$(POSTGREST_SRC_DIR)
COMPOSE=docker compose -f docker-compose.yml
ORACLE_URL=http://127.0.0.1:13000
PLUGIN_URL=http://127.0.0.1:13001
PLUGIN_PID=.serve_plugin.pid
BUCKETS?=DEFAULT
DIFF_ARGS?=

.PHONY: corpus up wait serve serve-stop diff down clean

corpus:
	@test -n "$(POSTGREST_SRC)" || (echo "Set POSTGREST_SRC to a PostgREST v12.2.3 checkout" && exit 1)
	$(PYTHON_BIN) extract_corpus.py --spec-root "$(POSTGREST_SRC)" --out corpus

up:
	$(COMPOSE) up -d --wait
	@echo "waiting for oracle to answer..."
	@for i in $$(seq 1 60); do \
	  curl -sf -o /dev/null $(ORACLE_URL)/ && break; sleep 1; \
	done
	@curl -sf -o /dev/null $(ORACLE_URL)/ && echo "oracle up at $(ORACLE_URL)" || (echo "oracle did not come up"; docker logs pgrst-diff-oracle | tail -20; exit 1)

serve: serve-stop
	@set -a; . ./plugin.env; set +a; \
	  nohup $(DENO_BIN) run --allow-net --allow-env --allow-read \
	    serve_plugin.ts > report/serve_plugin.log 2>&1 & \
	  echo $$! > $(PLUGIN_PID)
	@for i in $$(seq 1 30); do \
	  curl -s -o /dev/null $(PLUGIN_URL)/ && break; sleep 1; \
	done
	@curl -s -o /dev/null $(PLUGIN_URL)/ && echo "plugin server up at $(PLUGIN_URL)" || (echo "plugin server did not come up"; tail -20 report/serve_plugin.log; exit 1)

serve-stop:
	@mkdir -p report
	@-test -f $(PLUGIN_PID) && kill $$(cat $(PLUGIN_PID)) 2>/dev/null; rm -f $(PLUGIN_PID)
	@# the deno node-shim spawns the real deno as a child that can survive
	@# killing the recorded pid — make sure no leftover server holds the port
	@-pkill -f "deno run.*serve_plugin\.ts" 2>/dev/null; sleep 0.3; true

diff:
	$(PYTHON_BIN) run_diff.py --buckets $(BUCKETS) $(DIFF_ARGS)

down: serve-stop
	$(COMPOSE) down -v

clean: down
	rm -rf report corpus/*.jsonl
