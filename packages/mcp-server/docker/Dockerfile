FROM docker.cnb.cool/liangyunzhijing/docker-sync/oven-bun:1.4.4-slim_amd64 AS dependencies

WORKDIR /app

COPY package.json bun.lock ./
COPY packages/sdk/package.json ./packages/sdk/package.json
COPY packages/cli/package.json ./packages/cli/package.json
COPY packages/mcp-server/package.json ./packages/mcp-server/package.json

RUN bun install --frozen-lockfile --production --filter @tqx-ai/mcp-server

FROM dependencies AS build

RUN bun install --frozen-lockfile --filter @tqx-ai/mcp-server

COPY packages/mcp-server/src ./packages/mcp-server/src
COPY packages/mcp-server/scripts/build-backtest-app.ts packages/mcp-server/scripts/backtest-vite.ts ./packages/mcp-server/scripts/
RUN bun run --cwd packages/mcp-server build:ui

FROM docker.cnb.cool/liangyunzhijing/docker-sync/oven-bun:1.4.4-slim_amd64 AS runtime

WORKDIR /app/packages/mcp-server

ENV NODE_ENV=production
ENV TQX_MCP_BIND_HOST=0.0.0.0

COPY --from=dependencies --chown=bun:bun /app/node_modules /app/node_modules
COPY --from=dependencies --chown=bun:bun /app/packages/mcp-server/node_modules ./node_modules
COPY --chown=bun:bun packages/mcp-server/package.json ./package.json
COPY --chown=bun:bun packages/mcp-server/src ./src
COPY --chown=bun:bun plugins/agent-plugin/skills /app/plugins/agent-plugin/skills
COPY --from=build --chown=bun:bun /app/packages/mcp-server/dist/apps ./dist/apps

USER bun
EXPOSE 61102

CMD ["bun", "--no-env-file", "src/index.ts"]
