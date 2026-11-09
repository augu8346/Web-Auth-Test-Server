# Changelog

## Unreleased

### Added

- Offline, responsive Connection Lab UI with eight connection profiles,
  copyable handoffs, certificate downloads, a request playground and live logs.
- Unauthenticated HTTP TIFF access alongside HTTPS, with a separate Brotli
  content-encoding case on both protocols.
- Windows/Docker host trust instructions, including Schannel revocation behavior.
- Twenty integration tests and nine Chromium tests, plus a GitHub Actions
  workflow that builds Docker and runs both suites.
- Contributor, support, security and third-party documentation and issue forms.

### Changed

- Certificates initialize at startup only when absent and persist through the
  Compose bind mount. Incomplete sets fail instead of silently rotating.
- Compose published ports bind to loopback; the Docker image uses Node 24.
- Runtime configuration uses the client's hostname and supports explicit public
  origin overrides.
- Test failures produce nonzero exits, and integration tests verify the active CA.
- Request logs show response status and duration and render request values as text.
- OAuth callback construction preserves state and existing query parameters.

### Boundaries

- OAuth remains a permissive transport mock, without PKCE or grant validation.
- Encoded Brotli responses are full streams, not random-access TIFF byte ranges.
- Four production dependency advisories were reported by the 2026-11-09 build;
  this change does not remediate them.
