# Changelog

All notable changes to the TQX TypeScript SDK and CLI are documented in this file.

## Unreleased

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
