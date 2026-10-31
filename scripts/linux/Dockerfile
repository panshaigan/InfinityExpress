FROM rust:1-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev \
    librsvg2-dev libayatana-appindicator3-dev patchelf xz-utils ca-certificates \
    xvfb xauth dbus-x11 python3 imagemagick xdotool webkit2gtk-driver minisign xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Vite 8 requires a newer Node than Debian bookworm's packaged version.
RUN curl -fsSLo /tmp/SHASUMS256.txt https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt \
    && archive=$(awk '$2 ~ /^node-v.*-linux-x64.tar.xz$/ { print $2 }' /tmp/SHASUMS256.txt) \
    && test -n "$archive" \
    && curl -fsSLo "/tmp/$archive" "https://nodejs.org/dist/latest-v22.x/$archive" \
    && cd /tmp && grep " $archive$" SHASUMS256.txt | sha256sum -c - \
    && tar -xJf "$archive" -C /usr/local --strip-components=1 \
    && rm "$archive" SHASUMS256.txt

WORKDIR /work
ENV CARGO_TARGET_DIR=/build/target
