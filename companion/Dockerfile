FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && python3 -m venv /opt/ytdlp \
    && /opt/ytdlp/bin/pip install --no-cache-dir yt-dlp==2026.10.26 \
    && rm -rf /var/lib/apt/lists/*
ENV YTDLP_BIN=/opt/ytdlp/bin/yt-dlp
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node remote.mjs ./remote.mjs
USER node
EXPOSE 8787
CMD ["node", "remote.mjs"]
