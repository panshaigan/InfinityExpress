#!/usr/bin/env bash
# Install only the Ubuntu dependencies needed by the selected CI job.
set -euo pipefail

packages=(
  libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev
  librsvg2-dev libayatana-appindicator3-dev patchelf xdg-utils
)
if [[ $# == 1 && $1 == --smoke ]]; then
  packages+=(xvfb xauth dbus-x11 imagemagick xdotool webkit2gtk-driver minisign)
elif [[ $# != 0 ]]; then
  echo "Usage: $0 [--smoke]" >&2
  exit 1
fi

# Hosted runners also configure unrelated third-party repositories. These
# packages all come from Ubuntu; do not wait for those other repositories.
sources=/etc/apt/sources.list
if [[ -f /etc/apt/sources.list.d/ubuntu.sources ]]; then
  sources=/etc/apt/sources.list.d/ubuntu.sources
fi
apt_options=(
  -o "Dir::Etc::sourcelist=$sources" -o Dir::Etc::sourceparts=-
  -o Acquire::Retries=2 -o Acquire::http::Timeout=30
  -o Acquire::https::Timeout=30 -o DPkg::Lock::Timeout=120
  -o APT::Update::Error-Mode=any
)
timeout --kill-after=30s 5m sudo apt-get "${apt_options[@]}" update
timeout --kill-after=30s 10m sudo env DEBIAN_FRONTEND=noninteractive \
  apt-get "${apt_options[@]}" install -y --no-install-recommends "${packages[@]}"
