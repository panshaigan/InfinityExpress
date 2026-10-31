#!/usr/bin/env bash
# Verify the produced Debian package, then launch its real GTK/WebKit window.
set -euo pipefail
cd "$(dirname "$0")/../.."
target_dir=${CARGO_TARGET_DIR:-src-tauri/target}
result_dir=${IE_LINUX_RESULTS:-.cache/linux-check}
mkdir -p "$result_dir"
result_dir=$(realpath "$result_dir")
packages=("$target_dir"/release/bundle/deb/*.deb)
test -f "${packages[0]}"
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
dpkg-deb -x "${packages[0]}" "$root"
weidu=$(find "$root/usr" -type f -path '*/weidu/weidu' -print -quit)
test -n "$weidu" && test -x "$weidu"
"$weidu" --version
if find "$root" -type f \( -name '*.exe' -o -name '*.dll' \) -print | grep -q .; then
  echo 'Windows binaries leaked into the Linux package' >&2
  exit 1
fi
cp "${packages[0]}" "$result_dir/"
binary=$(find "$root/usr/bin" -type f -print -quit)
test -n "$binary"
# Tauri resolves resource paths relative to /usr for a packaged Linux binary.
# Install only inside the disposable container/runner; never on the user's host.
if [[ ${IE_LINUX_INSTALL_TEST_PACKAGE:-0} == 1 ]]; then
  dpkg -i "${packages[0]}"
  binary="/usr/bin/$(basename "$binary")"
fi
export IE_SMOKE_BINARY="$binary"
export IE_SMOKE_RESULT_DIR="$result_dir"
xvfb-run -a -s '-screen 0 1280x900x24' dbus-run-session -- bash scripts/linux/window-smoke.sh
echo 'PASS: Linux package resources, native WeiDU, and desktop window startup'
