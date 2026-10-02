FROM node:lts-slim

WORKDIR /app

ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

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
