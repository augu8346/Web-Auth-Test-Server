# Project guide

Use [README.md](README.md) for setup and connection behavior and
[CONTRIBUTING.md](CONTRIBUTING.md) for validation and publication.

- Keep the connection catalog and its copyable examples consistent with routes
  in `server.js`. Preserve existing endpoint aliases.
- Ordinary TIFF endpoints support byte ranges; the separate negotiated Brotli
  representation returns a complete stream. Test exact decoded bytes.
- Keep OAuth's permissive mock boundary explicit; do not describe it as PKCE
  validation or token renewal.
- Preserve existing certificates. `npm start` initializes missing sets;
  `npm run generate-certs` intentionally rotates all test identities.
- Use `npm test` against a running server and `npm run test:ui` for browser work.
  The latter owns its temporary server on 19480/19443.
- Keep generated test evidence, certificates, logs and dependencies out of Git.
  Never publish real credentials or request data.
- Browser request data belongs in text nodes, not interpolated HTML.
- Keep all user-facing documentation and assets available offline from the server.
