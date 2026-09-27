# Changelog

All notable changes to the TQX TypeScript SDK and CLI are documented in this file.

## Unreleased

## 0.5.2 - 2026-09-27

### Changed

- Publish nothing until every standalone binary passes verification, then upload a draft GitHub
  Release, publish npm, and publish the release last. Dry runs now also upload and delete a
  temporary draft release and run `npm publish --dry-run`, and every publishing step is safe to
  rerun.

### Fixed

- Create the GitHub Release reliably: every `gh` command in the release workflow now names the
  repository explicitly and the release job checks out the repository again. The v0.5.1 workflow
  published npm but failed to create the GitHub Release, which was then created from the verified
  workflow assets.
- Publish npm tarballs by absolute path. A relative `dir/file.tgz` path is read by npm as a GitHub
  repository shorthand, which stopped the first v0.5.2 run before anything was published. Dry runs
  now run `npm publish --dry-run` with the same arguments.

## 0.5.1 - 2026-09-27

### Added

- Publish a gzip-compressed `.gz` asset beside each standalone binary. It is less than half the
  download size, and `tqx self-update` prefers it when `SHA256SUMS` covers it. The raw binaries are
  still published, so earlier CLIs can keep updating.
- Verify every standalone release binary on its own platform against the Node.js CLI with a
  differential end-to-end suite before creating the GitHub Release.
- Support manual dry runs of the release workflow that build and verify every binary without
  publishing to npm or creating a GitHub Release.

### Fixed

- Keep the Intel macOS standalone binary logged in after `tqx login`. Its Bun runtime kept an
  invalidated Developer ID signature, so macOS rejected keychain reads; macOS binaries are now
  compiled on macOS and ad-hoc signed. Intel macOS users should run `tqx login` again after
  upgrading.
- Verify that `tqx login` can read an API key back from the system keychain; otherwise store it in
  the credentials file and print a warning instead of reporting a login that later reads as logged
  out. Warn when the keychain refuses to return a stored key.

## 0.5.0 - 2026-09-22

### Added

- Add SDK and CLI support for submitting detailed bug reports with validated input and optional
  idempotency keys.
- Add optional client MAC address and version headers to SDK requests, populated automatically by
  the CLI.
- Add the `agent_cooldown` trading API error code.

### Changed

- Update bundled research, trading, and product guidance with the bug-report workflow.
- Require Bun 1.4.2 for development, CI, and release builds.

## 0.4.0 - 2026-08-27

### Added

- Add `tqx self-update`, 24-hour throttled automatic version checks, checksum-verified standalone
  upgrades, and pinned package-manager upgrades.
- Add factor creation guidance and refine Hong Kong strategy and factor templates.

### Changed

- Update API key retrieval guidance and improve self-update timeout handling.
- Expand research documentation for factor and strategy workflows.

## 0.3.1 - 2026-08-21

### Added

- Add limit-order examples and guidance for Hong Kong and US research strategies.

### Changed

- Clarify that backtest commission and slippage values are passed through as backend parameters.
- Clarify factor source-file usage and normalize technical-indicator examples to backend field names.

### Removed

- Remove the obsolete SkillHub installation fallback from the skill command reference.

## 0.3.0 - 2026-08-19

### Added

- Add the `timeInForce` order option, currently supporting `DAY`, to the SDK and CLI.
- Add factor creation guidance, factor operator references, and local Python factor code gates.

### Changed

- Retry GET and idempotent write requests after 5xx responses with exponential backoff.
- Improve CLI diagnostics and retry guidance for optimistic-concurrency version conflicts.
- Preserve network retry metadata and expand rejected-order diagnostics in SDK responses.

## 0.2.3 - 2026-08-17

### Changed

- Add enhanced trading API error handling and validation.
- Add the new Qube strategy workflow, including create, save, and update support across stock,
  futures, Hong Kong, and US markets.
- Add Qube Python strategy validation for syntax, lifecycle rules, market-specific APIs, data API
  arguments, and context state before requests are submitted.
- Add Strategy Code Gateway support.
- Add explicit trading API error codes for invalid price and price-range inputs.
- Normalize cancelled backtests consistently across list, result, and wait output, including
  cancellation reasons and partial-result markers.
- Enforce direct `data[symbol]` access for US strategy BarMaps and strengthen US symbol, lifecycle,
  market API, and rolling-window validation.
- Refine the official US strategy templates and research references for the updated market and
  cancellation contracts.

## 0.2.1 - 2026-08-07

### Changed

- Enhance tool and credential handling across the TQX skills: default to non-browser tools for API
  requests and documentation, and manage API keys securely without pushing users back to a terminal.

## 0.2.0 - 2026-08-06

### Changed

- Recommend standalone CLI binaries for agent and server installations, with npm as a fallback.
- Resolve the current CLI release dynamically in the bundled research and trading skills.
- Move contributor setup, build, packaging, and release guidance into `CONTRIBUTING.md`.
- Simplify the generated GitHub Release notes heading.

## 0.1.15 - 2026-08-05

### Changed

- Clarify signal and order lifecycle distinctions in CLI output, documentation, and public types.

## 0.1.14 - 2026-08-05

### Changed

- Use the checkout v7 action in all release jobs.

## 0.1.13 - 2026-08-05

### Fixed

- Remove nested artifact files after flattening so GitHub Release receives files instead of directories.

## 0.1.12 - 2026-08-05

### Fixed

- Check out the repository in the release job before invoking GitHub CLI release creation.

## 0.1.11 - 2026-08-05

### Fixed

- Compile the Windows standalone CLI on a Windows runner so the application icon is embedded successfully.
- Collect release artifacts from platform jobs before generating checksums and creating the GitHub Release.

## 0.1.10 - 2026-08-05

### Added

- Embed the TQX icon in the Windows standalone CLI executable.

### Changed

- Resolve the latest CLI release before skill-driven tasks and recommend upgrading outdated installations.
- Prefer standalone GitHub Release binaries so CLI installation does not require Node.js or npm.

## 0.1.9 - 2026-08-04

### Changed

- Use concise GitHub Release notes with platform-specific standalone binary mappings.
- Prefer global GitHub Release CLI installation in the agent skills, with package and temporary-runner fallbacks.

## 0.1.8 - 2026-08-04

### Fixed

- Generate GitHub release notes without shell-expanding Markdown examples.

## 0.1.7 - 2026-08-04

### Fixed

- Preserve Markdown code samples while generating GitHub release notes.

## 0.1.6 - 2026-08-04

### Fixed

- Support Trusted Publishing from the private GitHub repository without provenance attestation.

## 0.1.5 - 2026-08-04

### Changed

- Publish Bun-generated package tarballs through npm Trusted Publishing with GitHub Actions OIDC.

## 0.1.4 - 2026-08-04

### Changed

- Point published package homepage and repository metadata at the GitHub repository.

## 0.1.3 - 2026-07-24

### Fixed

- Accept additive response fields from the TQX API and expose account IDs on trading accounts.

## 0.1.2 - 2026-07-24

### Added

- Expose optional broker diagnostics on signal responses.

## 0.1.1 - 2026-07-24

### Fixed

- Preserve and expose business-specific data in `TqxApiError` responses.

## 0.1.0 - 2026-07-22

### Added

- Node.js-compatible SDK with ESM, CommonJS, and TypeScript declaration outputs.
- TQX trading API clients and public Valibot request and response schemas.
- CLI authentication backed by environment variables, Bun's system keychain, or a local
  credentials file.
- Account, position, order, trade, signal, and service-status commands.
- Human-readable, plain-text, and JSON output modes.
- Input validation, structured API errors, unit tests, and Node/Bun smoke tests.
