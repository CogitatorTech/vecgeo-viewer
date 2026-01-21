#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUCKDB_VER="1.31.0"
ARROW_VER="14.0.2"
VENDOR_DUCKDB="$ROOT_DIR/app/assets/vendor/duckdb"
VENDOR_ARROW="$ROOT_DIR/app/assets/vendor/arrow"

mkdir -p "$VENDOR_DUCKDB" "$VENDOR_ARROW"

BASE="https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${DUCKDB_VER}/dist"

echo "Fetching DuckDB WASM (${DUCKDB_VER}) to $VENDOR_DUCKDB"
# ESM module
curl -fsSL "$BASE/duckdb-browser.mjs" -o "$VENDOR_DUCKDB/duckdb-browser.mjs"
# Workers and wasm bundles
curl -fsSL "$BASE/duckdb-mvp.wasm" -o "$VENDOR_DUCKDB/duckdb-mvp.wasm"
curl -fsSL "$BASE/duckdb-browser-mvp.worker.js" -o "$VENDOR_DUCKDB/duckdb-browser-mvp.worker.js"
curl -fsSL "$BASE/duckdb-eh.wasm" -o "$VENDOR_DUCKDB/duckdb-eh.wasm"
curl -fsSL "$BASE/duckdb-browser-eh.worker.js" -o "$VENDOR_DUCKDB/duckdb-browser-eh.worker.js"

# Apache Arrow (browser UMD)
echo "Fetching Apache Arrow (${ARROW_VER}) to $VENDOR_ARROW"
curl -fsSL "https://cdn.jsdelivr.net/npm/apache-arrow@${ARROW_VER}/Arrow.dom.min.js" -o "$VENDOR_ARROW/Arrow.dom.min.js"

ls -lh "$VENDOR_DUCKDB" || true
ls -lh "$VENDOR_ARROW" || true

echo "Done."
