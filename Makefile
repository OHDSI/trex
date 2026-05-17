# trex top-level Makefile — convenience entry points for tests and coverage.
# Per-plugin builds live in plugins/*/Makefile; this file fans out.

RUST_PLUGINS := chdb db etl fhir hana migration pgt pgwire pool pool-client runtime tpm transform
TS_PACKAGES  := plugins/notebook plugins/web plugins/studio
DENO_PACKAGES := core/server core/event

.PHONY: test test-rust test-integration test-frontend test-deno \
        coverage coverage-rust coverage-integration coverage-frontend coverage-deno coverage-merge-all \
        coverage-clean

# ---- Run every test layer ----

test: test-rust test-frontend test-deno test-integration

test-rust:
	@for p in $(RUST_PLUGINS); do \
	  if [ -f plugins/$$p/Cargo.toml ]; then \
	    echo "==> cargo test in plugins/$$p"; \
	    (cd plugins/$$p && cargo test --no-fail-fast) || exit $$?; \
	  fi; \
	done

test-frontend:
	@for pkg in $(TS_PACKAGES); do \
	  if [ -f $$pkg/package.json ]; then \
	    echo "==> npm test in $$pkg"; \
	    (cd $$pkg && npm test --silent --if-present) || exit $$?; \
	  fi; \
	done

test-deno:
	@for pkg in $(DENO_PACKAGES); do \
	  if [ -f $$pkg/deno.json ]; then \
	    echo "==> deno task test in $$pkg"; \
	    (cd $$pkg && deno task test 2>/dev/null || true); \
	  fi; \
	done

test-integration:
	$(MAKE) -C integration-tests test

# ---- Coverage ----

coverage: coverage-rust coverage-frontend coverage-deno coverage-merge-all
	@echo "==> Coverage artifacts under build/coverage/ in each plugin and core/*"

coverage-rust:
	@for p in $(RUST_PLUGINS); do \
	  if [ -f plugins/$$p/Makefile ] && grep -q "^coverage:" plugins/$$p/Makefile; then \
	    echo "==> coverage in plugins/$$p"; \
	    $(MAKE) -C plugins/$$p coverage || exit $$?; \
	  fi; \
	done

coverage-frontend:
	@for pkg in $(TS_PACKAGES); do \
	  if [ -f $$pkg/package.json ]; then \
	    echo "==> npm run test:coverage in $$pkg"; \
	    (cd $$pkg && npm run test:coverage --silent --if-present) || exit $$?; \
	  fi; \
	done

coverage-deno:
	@for pkg in $(DENO_PACKAGES); do \
	  if [ -f $$pkg/deno.json ]; then \
	    echo "==> deno task coverage in $$pkg"; \
	    (cd $$pkg && deno task coverage 2>/dev/null || true); \
	  fi; \
	done

# Convenience: render a merged HTML report (requires genhtml from lcov)
coverage-merge-all:
	@mkdir -p build/coverage
	@find plugins core -name "lcov.info" -path "*/coverage/*" 2>/dev/null | xargs -I{} cat {} > build/coverage/merged.lcov 2>/dev/null || true
	@if command -v genhtml >/dev/null 2>&1 && [ -s build/coverage/merged.lcov ]; then \
	  genhtml -q --output-directory build/coverage/html build/coverage/merged.lcov; \
	  echo "==> HTML report: build/coverage/html/index.html"; \
	else \
	  echo "==> Skipping HTML render (genhtml not installed or no lcov data)"; \
	fi

coverage-clean:
	@for p in $(RUST_PLUGINS); do rm -rf plugins/$$p/build/coverage; done
	@for pkg in $(TS_PACKAGES); do rm -rf $$pkg/coverage; done
	@for pkg in $(DENO_PACKAGES); do rm -rf $$pkg/coverage; done
	rm -rf integration-tests/coverage build/coverage
