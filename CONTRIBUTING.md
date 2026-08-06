# Contributing

This repository is a Bun workspace for the Node.js-compatible `@tqx-ai/sdk` and the Citty-based
`@tqx-ai/cli`. End-user installation and CLI usage are documented in [README.md](./README.md).

## Requirements

- Bun 1.3.14 or newer
- Node.js 22.18 or newer for published-package smoke checks

Install dependencies and run the complete check suite:

```bash
bun install
bun run test
```

`bun run test` checks formatting, lint, TypeScript types, Vitest tests, production builds, and
Node/Bun smoke tests.

## Environment

Copy `.env.example` to `.env`, `.env.dev`, or `.env.prod` as needed. The build-time values are
public gateway URLs:

```dotenv
TQX_BUILD_BASE_URL=https://www.tqx.trade/pandaApi
TQX_BUILD_TRADING_BASE_URL=https://www.tqx.trade
TQX_BUILD_GET_API_KEY_URL=https://www.tqx.trade/hk/competition-manage?catalog=2
```

`.env`, `.env.dev`, and `.env.prod` are ignored by Git. `bun run dev` loads `.env`, then
`.env.dev`; `bun run build` loads `.env`, then `.env.prod`. The build-time values are embedded in
the generated artifacts. The built CLI does not load dotenv files; set `TQX_BASE_URL` in the
process environment to override every gateway at runtime.

## Development

```bash
bun install
bun run dev
```

The development command watches both packages and writes development output to `output`.

## Build And Package

```bash
bun run build
bun run pack:check
```

`bun run build` creates production artifacts in each package's `dist` directory. Use Bun to pack
and publish this workspace: it replaces local `workspace:*` dependencies with the published package
version. An npm-created CLI tarball retains `workspace:*` and cannot be installed from the registry.

Run the complete release gate with `bun run release:check`. See [RELEASING.md](./RELEASING.md) for
the versioning, publishing, verification, and Git tag procedure.
