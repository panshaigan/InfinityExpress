#!/usr/bin/env bash
# Run inside the provided Linux Docker environment, or on a prepared Linux host.
set -euo pipefail
cd "$(dirname "$0")/../.."
npm ci
npm test -- --reporter=dot
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
python3 scripts/linux/weidu-smoke.py
npm run tauri:build -- --bundles deb --config '{"bundle":{"createUpdaterArtifacts":false}}'
bash scripts/linux/package-smoke.sh
