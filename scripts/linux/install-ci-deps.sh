#!/usr/bin/env bash
# Install only the Ubuntu dependencies needed by the selected CI job.
set -euo pipefail

packages=(
  libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev
  librsvg2-dev libayatana-appindicator3-dev patchelf xdg-utils
)
if [[ $# == 1 && $1 == --smoke ]]; then
  packages+=(xvfb xauth dbus-x11 imagemagick xdotool webkit2gtk-driver)
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

if [[ ${1:-} == --smoke ]]; then
  # Ubuntu 22.04 has no minisign executable package. Use the upstream static
  # binary rather than adding another distro's repository or compiling in CI.
  arch=$(uname -m)
  case "$arch" in
    x86_64|aarch64) ;;
    *) echo "Unsupported Minisign architecture: $arch" >&2; exit 1 ;;
  esac
  minisign_dir=$(mktemp -d)
  trap 'rm -rf "$minisign_dir"' EXIT
  curl --fail --location --retry 2 --connect-timeout 30 --max-time 120 \
    https://github.com/jedisct1/minisign/releases/download/0.12/minisign-0.12-linux.tar.gz \
    -o "$minisign_dir/minisign.tar.gz"
  printf '%s  %s\n' \
    9a599b48ba6eb7b1e80f12f36b94ceca7c00b7a5173c95c3efc88d9822957e73 \
    "$minisign_dir/minisign.tar.gz" | sha256sum --check --strict
  tar -xzf "$minisign_dir/minisign.tar.gz" -C "$minisign_dir" \
    "minisign-linux/$arch/minisign"
  sudo install -m 0755 "$minisign_dir/minisign-linux/$arch/minisign" /usr/local/bin/minisign
fi
