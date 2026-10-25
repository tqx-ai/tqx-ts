# Test packaging only. No registry login/push, service replacement or endpoint configuration.
ARG BASE_IMAGE=node:22-alpine
FROM ${BASE_IMAGE}
WORKDIR /app
COPY --chown=node:node Dockerfile package.json manifest.json verify-package.mjs ./
COPY --chown=node:node bundle ./bundle
COPY --chown=node:node node_modules ./node_modules
USER node
CMD ["node", "bundle/index.mjs"]
