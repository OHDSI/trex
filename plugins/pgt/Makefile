.PHONY: test coverage coverage-baseline

test:
	cargo test -p pgt

coverage:
	cargo llvm-cov --lib --tests -p pgt --summary-only

coverage-baseline:
	cargo llvm-cov --lib -p pgt --summary-only | tee /tmp/pgt-cov.txt
	@echo "Update coverage/baseline.json with the % from above."
