# The screenshot baselines' environment, on any machine with Docker.
#
# A baseline is only comparable with a capture from the same Chrome on
# the same system fonts (see scripts/check-route-screenshots.ts), and
# the baselines are captured by .github/workflows/screenshot-baselines.yml
# on GitHub's ubuntu-latest runner with Chrome for Testing pinned. This
# is that environment: Ubuntu 24.04 on x86-64, the same Chrome build,
# the Vulkan loader the WebGPU routes use, and the runner's fonts for
# `system-ui` and `sans-serif`: DejaVu, including its oblique faces,
# without which an italic run is slanted by Chrome and set at the
# upright face's advances, and every line that holds one moves. It is
# x86-64 even on Apple silicon because Chrome for Testing publishes no
# Linux ARM build.
#
# Built and run by scripts/screenshots-docker.ts; nothing here runs on
# its own.

FROM --platform=linux/amd64 ubuntu:24.04

ARG CHROME_VERSION=154.0.8037.57
ARG NODE_VERSION=24.22.1

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates curl unzip xz-utils rsync \
    libvulkan1 mesa-vulkan-drivers \
    fontconfig fonts-dejavu-core fonts-dejavu-extra fonts-liberation fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    | tar -xJ -C /usr/local --strip-components=1 \
  && corepack enable

# Chrome for Testing and the libraries it loads. Its own deb.deps names
# Debian's packages from before Ubuntu 24.04 renamed them for 64-bit
# time (libasound2 is libasound2t64 here), so the list is spelled out;
# `ldd` then fails the build if any library is still missing.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 libcairo2 libcups2t64 \
    libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0t64 libgtk-3-0t64 libnspr4 libnss3 \
    libpango-1.0-0 libudev1 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
    libxkbcommon0 libxrandr2 libxshmfence1 \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL -o /tmp/chrome.zip \
    "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-linux64.zip" \
  && unzip -q /tmp/chrome.zip -d /opt \
  && rm /tmp/chrome.zip \
  && ! ldd /opt/chrome-linux64/chrome | grep 'not found'

# A container cannot give Chrome the user namespaces its sandbox wants,
# so it runs without one. The sandbox decides what the process may touch,
# not how a pixel is drawn, so the captures are the same.
RUN printf '#!/bin/sh\nexec /opt/chrome-linux64/chrome --no-sandbox "$@"\n' > /usr/local/bin/chrome \
  && chmod +x /usr/local/bin/chrome

ENV CHROME_BIN=/usr/local/bin/chrome

# Docker's /etc/hosts answers `localhost` with ::1 first, the runner's
# with 127.0.0.1. Vite's preview server listens on the IPv4 address and
# Node's fetch tries only the first answer, so the gates waited thirty
# seconds for a server that was up and then failed. IPv4 first is what
# the runner does.
ENV NODE_OPTIONS=--dns-result-order=ipv4first

WORKDIR /work
