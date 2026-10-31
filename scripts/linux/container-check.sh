#!/usr/bin/env bash
# /source is a read-only repository mount; /work and /build are Linux volumes.
set -euo pipefail
tar -C /source --exclude='./.git' --exclude='./.cache' --exclude='./node_modules' \
    --exclude='./src-tauri/target' --exclude='./dist' --exclude='./.agents' \
    --exclude='./.cursor' --exclude='./.env' --exclude='./.env.*' \
    --exclude='./WeiDU-*.zip' -cf - . | tar -C /work -xf -
cd /work
bash scripts/linux/check.sh
