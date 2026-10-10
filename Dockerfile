FROM node:lts-slim

WORKDIR /app

ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    FFMPEG_PATH=/usr/lib/jellyfin-ffmpeg/ffmpeg

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg python3 python3-pip && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://repo.jellyfin.org/jellyfin_team.gpg.key | gpg --dearmor -o /etc/apt/keyrings/jellyfin.gpg && \
    . /etc/os-release && \
    printf "Types: deb\nURIs: https://repo.jellyfin.org/debian\nSuites: %s\nComponents: main\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/jellyfin.gpg\n" \
        "$VERSION_CODENAME" "$(dpkg --print-architecture)" > /etc/apt/sources.list.d/jellyfin.sources && \
    apt-get update && \
    apt-get install -y --no-install-recommends jellyfin-ffmpeg8 && \
    ln -sf /usr/lib/jellyfin-ffmpeg/ffmpeg /usr/local/bin/ffmpeg && \
    ln -sf /usr/lib/jellyfin-ffmpeg/ffprobe /usr/local/bin/ffprobe && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src/scripts ./src/scripts

RUN pnpm install --prod --frozen-lockfile

COPY --chown=node:node src ./src
COPY --chown=node:node languages ./languages
COPY --chown=node:node database ./database

RUN mkdir -p audio_cache && chown -R node:node /app
VOLUME ["/app/database"]

USER node

CMD ["pnpm", "start"]