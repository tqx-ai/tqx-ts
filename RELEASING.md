# Release Process

The SDK must be published before the CLI because `@tqx-ai/cli` depends on the matching
`@tqx-ai/sdk` version.

The release being prepared is npm version `0.5.2` with planned Git tag `v0.5.2`.

Use Bun to pack packages. Bun rewrites `workspace:*` to the workspace package version; an
npm-created CLI tarball does not and will fail to install with `EUNSUPPORTEDPROTOCOL`. The release
workflow publishes the resulting Bun tarballs through npm Trusted Publishing. The repository is
public, so both npm publishes use GitHub OIDC and include provenance attestations.

## Prerequisites

- Confirm the release version and update `CHANGELOG.md`.
- Confirm that `LICENSE` and all package manifests declare `GPL-3.0-only`.
- Configure `.env.prod` with valid HTTPS values for the research/non-trading
  `TQX_BUILD_BASE_URL` (ending in `/pandaApi`), `TQX_BUILD_TRADING_BASE_URL`, and
  `TQX_BUILD_GET_API_KEY_URL`.
- Configure the GitHub repository variables `TQX_BUILD_BASE_URL`,
  `TQX_BUILD_TRADING_BASE_URL`, and `TQX_BUILD_GET_API_KEY_URL` with valid production HTTPS URLs.
- Configure npm Trusted Publishing for both `@tqx-ai/sdk` and `@tqx-ai/cli`: GitHub owner
  `tqx-ai`, repository `tqx-ts`, workflow filename `release.yml`, no environment, and the
  `npm publish` allowed action. Do not configure an `NPM_TOKEN` secret or bypass 2FA.
- Work from an up-to-date `main` branch with no unrelated changes.

## Prepare

For releases after the initial release, update every workspace version together:

```bash
bun run bump-version
```

Review the version changes and ensure these values match:

- `package.json`
- `lerna.json`
- `packages/sdk/package.json`
- `packages/cli/package.json`
- `README.md`, `packages/sdk/README.md`, and `packages/cli/README.md`
- `../skills/tqx-trading/SKILL.md`
- `../skills/tqx-trading/references/commands.md`

Run the complete release gate:

```bash
bun install
bun run release:check
git status --short
```

`release:check` validates versions, licenses, changelog metadata, and production URLs, then runs
formatting, lint, type checks, unit tests, production builds, Node/Bun smoke tests, Bun package dry
runs, and an isolated npm install of both tarballs. Review both package file lists before
continuing.

Commit the final version and changelog, then push the release commit to `main`. The release tag
must point at that exact commit.

## Dry Run

Run the release workflow manually to rehearse a release without publishing anything. A dry run
runs every job and step of a real release except the tag check and publishing the GitHub Release:
it builds and compresses every standalone binary, verifies each one on its own platform, uploads all
assets to a temporary draft GitHub Release named `dry-run-<run-id>-<attempt>`, checks the draft,
deletes it, and runs both npm publishes with `--dry-run`. Drafts are visible only to repository collaborators and do not
create tags. The binaries, gzip assets, npm tarballs, and `SHA256SUMS` stay available as the
`release-assets` workflow artifact. Push the branch first; the workflow runs the version of
`release.yml` on that branch:

```bash
gh workflow run release.yml --ref <branch>
gh run list --workflow release.yml --branch <branch> --limit 1
gh run watch <run-id>
gh run download <run-id> --name release-assets --dir release-assets
```

## Tag And Publish

The tag workflow at `.github/workflows/release.yml` is the only publishing path. Nothing is
published until every standalone binary has passed verification. The `publish` job then:

1. uploads every asset to a draft GitHub Release and confirms the draft is complete;
2. publishes the SDK and then the CLI to npm through OIDC;
3. publishes the draft GitHub Release last, because it is what announces the update to users and
   npm-installed CLIs update from npm.

Every `publish` step is safe to rerun: an already published npm version is skipped and an
unpublished draft from an earlier attempt is replaced. If the job fails, fix the cause and rerun the
failed job for the same tag. Do not run the local `publish:sdk` or `publish:cli` scripts for a normal
release.

```bash
git add package.json lerna.json packages/sdk/package.json packages/cli/package.json \
  CHANGELOG.md README.md packages/sdk/README.md packages/cli/README.md RELEASING.md
git commit -m "Release v<version>"
git push origin main
git tag -a v<version> -m "Release v<version>"
git push origin v<version>
```

Pushing `v<version>` triggers GitHub Actions. Monitor the workflow to completion before proceeding.
The workflow also publishes a gzip-compressed `.gz` asset beside each standalone binary, covers both
in `SHA256SUMS`, and runs `scripts/verify-release-assets.ts` plus the Node.js differential suite
`scripts/standalone-e2e.ts` on each binary's own platform before it creates the GitHub Release.
Unit tests cover only the TypeScript source, so these checks are what confirm that each compiled
binary behaves exactly like the npm CLI on Node.js and that the `.gz` assets `tqx self-update`
prefers match their checksums. To check a locally compiled binary, run
`bun scripts/standalone-e2e.ts <binary>` after `bun run build`.
For a repository configuration failure, correct the configuration and rerun the workflow for the
same tag. For a release-content failure, create a new patch version and tag its commit. If a package
was published, never reuse or overwrite that version.

## Verify From npm

Test from a clean directory so workspace links and local build artifacts cannot hide packaging
problems:

```bash
npm view @tqx-ai/sdk@<version> version
npm view @tqx-ai/cli@<version> version
npm install --global @tqx-ai/cli@<version>
tqx --version
tqx --help
tqx status
```

Also install `@tqx-ai/sdk@<version>` in a temporary Node.js project and verify both ESM import and
CommonJS require if either package layout changed.

## Confirm

The workflow publishes both packages with the `latest` dist-tag. After verification, confirm the
registry metadata:

```bash
npm view @tqx-ai/sdk dist-tags --json
npm view @tqx-ai/cli dist-tags --json
```

If verification fails, remove the broken `latest` dist-tag or deprecate the broken packages as
appropriate. Fix the issue, publish a new patch version, and repeat the checks; never reuse or
overwrite a published version.
