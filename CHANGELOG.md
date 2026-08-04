# Changelog

All notable changes to the TQX TypeScript SDK and CLI are documented in this file.

## Unreleased

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
