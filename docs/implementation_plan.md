# Implementation overview

The original plan is implemented as a self-describing connection workbench.
For setup and current behavior, use the [README](../README.md) or the running
website at `/`.

- `server.js`: HTTP and HTTPS applications, authentication fixtures, TIFF ranges,
  negotiated Brotli fixture, runtime configuration, allowlisted test downloads,
  and a bounded in-memory request log.
- `generate-certs.js`: test CA, localhost server identity, PEM client identity and
  password-protected PKCS#12 bundle. `--if-missing` preserves existing complete
  sets and refuses partial sets.
- `public/index.html`, `public/app.js`, `public/styles.css`: responsive connection
  catalog, copyable handoffs, Windows host trust guide and request playground.
- `public/logs.html`, `public/logs.js`: filterable, pausable request inspector.
  Untrusted request data is rendered as text, not HTML.
- `test-client.js`: Node assertions against a running server, with CA verification.
- `tests/website.spec.js`, `playwright.config.js`: isolated browser regression
  tests and desktop/mobile rendering checks.
- Docker: Node 24 image; certificates generated at runtime into a persistent
  bind mount, not embedded into the image; loopback-only Compose published ports.

## Deliberate boundaries

This is not a production service. Public test credentials/client keys and verbose
request logs are intentional. OAuth is permissive transport simulation, not
grant validation or token renewal. The Brotli endpoint serves a complete encoded
representation, not independently decodable ranges; the original COG routes
remain the random-access baseline.

Future no-auth cases can use the existing profile case selector, but should define
their content negotiation, HEAD and Range behavior explicitly and add byte-level
tests before exposing them as connection configurations.
