# Self-hosted Ironterm: the same app as the Cloudflare deploy, on Node + SQLite.
#   docker compose up -d        (see SELF_HOSTING.md)
FROM node:22.21.1-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.7.1 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build:node

FROM node:22.21.1-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data STATIC_DIR=/app/dist/client
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/dist/server ./dist/server
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
# PORT may be changed in .env; probe whatever the server listens on.
HEALTHCHECK --interval=60s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server/main.mjs"]
