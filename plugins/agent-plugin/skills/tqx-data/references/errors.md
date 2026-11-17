# `tqx-data` Error Contract

Handle typed package errors and give the user a short category, the next action,
and the non-secret context needed to reproduce the issue.

## `ApiKeyInvalidError`

The API key is missing, invalid, expired, revoked, or not accepted by the data
service.

Next action: verify that the key came from TQX Dev Settings and that the runtime
is using the intended `TQX_API_KEY` or credential store. Never print the key.

## `InsufficientScopeError`

The key does not include the `data` permission required by the package.

Next action: create or update a key with the `data` permission in Dev Settings.
Do not substitute a trading token, OAuth token, or TypeScript CLI credential.

## `RateLimitError`

The request rate is above the service or account limit.

Next action: reduce concurrency, narrow the requested symbols and fields, and
retry with bounded backoff only when the operation is safe to retry. Do not loop
indefinitely or duplicate a state-changing operation; this package is intended
for data reads.

## `ServiceError`

Another service or data-access failure occurred.

Next action: preserve the method name, complete non-secret parameters, package
version, HTTP status, request ID, and a bounded response summary. Do not expose
raw response bodies or stack traces.

## Unknown Errors

If the package raises an untyped error, first classify it as configuration,
dependency, network, parsing, or data-quality failure. Do not silently retry a
request whose response is incomplete or whose symbol and date columns cannot be
verified.
