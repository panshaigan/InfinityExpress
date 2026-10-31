#!/usr/bin/env bash
# Exercise AppImage's AppRun/library/resource layout without requiring FUSE.
set -euo pipefail
cd "$(dirname "$0")/../.."
repo_dir=$PWD
target_dir=${CARGO_TARGET_DIR:-src-tauri/target}
images=("$target_dir"/release/bundle/appimage/*.AppImage)
image=$(realpath "${images[0]}")
result_dir=${IE_LINUX_RESULTS:-.cache/linux-check}
mkdir -p "$result_dir/appimage"
result_dir=$(realpath "$result_dir/appimage")
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
cd "$test_dir"
"$image" --appimage-extract >/dev/null
export APPDIR="$test_dir/squashfs-root"
weidu=$(find "$APPDIR/usr" -type f -path '*/weidu/weidu' -print -quit)
test -n "$weidu" && test -x "$weidu"
"$weidu" --version
export IE_SMOKE_BINARY="$APPDIR/AppRun"
export IE_SMOKE_RESULT_DIR="$result_dir"
cd "$repo_dir"
xvfb-run -a -s '-screen 0 1280x900x24' dbus-run-session -- bash scripts/linux/window-smoke.sh
echo 'PASS: extracted AppImage startup, resources, and native install/restore commands'
