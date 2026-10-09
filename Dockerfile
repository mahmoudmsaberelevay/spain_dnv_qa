# ELEVAY's review-only media compositor requires real ffmpeg/ffprobe at runtime.
# The managed Node image does not consistently retain the static package binaries.
FROM node:22-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates fontconfig \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . .
RUN npm install -g corepack@latest \
    && corepack pnpm install --frozen-lockfile \
    && corepack pnpm run build \
    && /usr/bin/ffmpeg -version >/dev/null \
    && /usr/bin/ffprobe -version >/dev/null
ENV NODE_ENV=production \
    ELEVAY_FFMPEG_BIN=/usr/bin/ffmpeg \
    ELEVAY_FFPROBE_BIN=/usr/bin/ffprobe \
    ELEVAY_REEL_THREADS=1
CMD ["node", "dist/index.js"]
