#!/usr/bin/env bash
set -euo pipefail
# Headless CI containers run as root and have no GPU. These are test-only flags.
export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
test_home=$(mktemp -d)
export XDG_CONFIG_HOME="$test_home/config" XDG_DATA_HOME="$test_home/data" XDG_CACHE_HOME="$test_home/cache"
if command -v WebKitWebDriver >/dev/null; then
  trap 'rm -rf "$test_home"' EXIT
  python3 scripts/linux/webview-smoke.py
  exit 0
fi
"$IE_SMOKE_BINARY" >"$IE_SMOKE_RESULT_DIR/window.log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; rm -rf "$test_home"' EXIT
window=''
for attempt in $(seq 1 30); do
  kill -0 "$pid"
  window=$(xdotool search --onlyvisible --pid "$pid" --name 'iNfinity eXpress' 2>/dev/null | head -n1 || true)
  if [[ -n "$window" ]]; then break; fi
  sleep 1
done
test -n "$window"
# Allow the initial React render to settle after the native window appears.
sleep 4
kill -0 "$pid"
import -window "$window" "$IE_SMOKE_RESULT_DIR/linux-window.png"
