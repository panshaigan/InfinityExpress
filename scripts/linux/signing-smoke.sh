#!/usr/bin/env bash
# Validate the Linux updater packaging path with disposable keys, never release keys.
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d)
cp src-tauri/tauri.conf.json "$test_dir/config.json"
trap 'cp "$test_dir/config.json" src-tauri/tauri.conf.json; rm -rf "$test_dir"' EXIT
node node_modules/@tauri-apps/cli/tauri.js signer generate --ci -w "$test_dir/updater.key" >"$test_dir/key-generation.log"
export TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY=$(cat "$test_dir/updater.key")
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=''
export TAURI_SIGNING_PUBLIC_KEY
TAURI_SIGNING_PUBLIC_KEY=$(cat "$test_dir/updater.key.pub")
node scripts/inject-updater-pubkey.mjs
export APPIMAGE_EXTRACT_AND_RUN=1
npm run tauri:build -- --bundles deb,appimage
target_dir=${CARGO_TARGET_DIR:-src-tauri/target}
images=("$target_dir"/release/bundle/appimage/*.AppImage "$target_dir"/release/bundle/deb/*.deb)
for image in "${images[@]}"; do
test -s "$image"
test -s "${image}.sig"
# Tauri wraps minisign text in base64. Verify against the disposable public key.
python3 - "$image" "$test_dir" <<'PY'
import base64, pathlib, subprocess, sys
image = pathlib.Path(sys.argv[1])
root = pathlib.Path(sys.argv[2])
signature = root / 'signature.minisig'
public = root / 'public.minisign'
signature.write_bytes(base64.b64decode(pathlib.Path(str(image) + '.sig').read_text()))
public.write_bytes(base64.b64decode((root / 'updater.key.pub').read_text()))
subprocess.run(['minisign', '-Vm', str(image), '-x', str(signature), '-p', str(public)], check=True)
print(f'PASS: {image.name} updater signature verified with disposable signing keys')
PY
done
