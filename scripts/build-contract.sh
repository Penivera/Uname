#!/usr/bin/env sh
# Builds the registry contract with cargo-near embedding the NEAR ABI schema:
#   opt-level=z + fat LTO + codegen-units=1 + panic=abort (Cargo.toml [profile.release])
#   Generates, compresses, and embeds unam_registry_abi.zst so block explorers
#   (NearBlocks, near.org) display contract methods and interactive interfaces.
set -eu
cd "$(dirname "$0")/.."

(cd contracts/registry && cargo near build non-reproducible-wasm)

OUT=dist
mkdir -p "$OUT"
cp target/near/unam_registry/unam_registry.wasm "$OUT/unam_registry.wasm"
ls -l "$OUT/unam_registry.wasm"
echo "deploy with: near contract deploy <account-id> use-file $OUT/unam_registry.wasm without-init-call"
