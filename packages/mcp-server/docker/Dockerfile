FROM docker.cnb.cool/liangyunzhijing/docker-sync/oven-bun:1.4.4-slim_amd64 AS dependencies

WORKDIR /app

COPY package.json bun.lock ./
COPY packages/sdk/package.json ./packages/sdk/package.json
COPY packages/cli/package.json ./packages/cli/package.json
COPY packages/mcp-server/package.json ./packages/mcp-server/package.json

RUN bun install --frozen-lockfile --production --filter @tqx-ai/mcp-server

FROM docker.cnb.cool/liangyunzhijing/docker-sync/oven-bun:1.4.4-slim_amd64 AS runtime

WORKDIR /app/packages/mcp-server

ENV NODE_ENV=production
ENV TQX_MCP_BIND_HOST=0.0.0.0

COPY --from=dependencies --chown=bun:bun /app/node_modules /app/node_modules
COPY --from=dependencies --chown=bun:bun /app/packages/mcp-server/node_modules ./node_modules
COPY --chown=bun:bun packages/mcp-server/package.json ./package.json
COPY --chown=bun:bun packages/mcp-server/src ./src

USER bun
EXPOSE 61102

CMD ["bun", "--no-env-file", "src/index.ts"]
