#!/usr/bin/env bash
set -e

SCRIPT=$(readlink -f "$0")
SCRIPTPATH=$(dirname "$SCRIPT")

export $(grep -v '^#' $SCRIPTPATH/../.env | xargs)

# --features cli/tracing
cargo build --features cli/tracing && \
LD_LIBRARY_PATH="~/code/trex/target/debug/build/circe-rust-wrapper-5443f92155e3cfac/out:$LD_LIBRARY_PATH" \
RUST_BACKTRACE=full npm run watchtest