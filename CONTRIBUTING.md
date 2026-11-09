# Contributing

Connection Lab is an intentionally observable, local-only authentication fixture,
not a production identity provider. Preserve that boundary when proposing changes.

## Development

Use Node.js 24+, npm, and Docker with the Compose v2 plugin for container checks.
Clone the repository over SSH and work on a focused topic branch:

```powershell
git clone git@github.com:augu8346/Web-Auth-Test-Server.git
cd Web-Auth-Test-Server
npm ci
npm start
```

The [README](README.md) owns connection details and certificate setup. Never
regenerate an existing certificate set just to run tests: that invalidates trust.
Use generated dummy identities only; do not commit certificates, private keys,
real credentials, customer rasters, request dumps or local configuration.

## Required checks

Run integration tests against the running server:

```powershell
npm test
npx playwright install chromium
npm run test:ui
git diff --check
```

The UI suite starts its own server on 19480/19443. For Docker changes, stop any
local server occupying 9480/9443, then run:

```powershell
docker compose config --quiet
docker compose up --build -d
npm test
```

When finished with a disposable container, use `docker compose down`; preserve
the bind-mounted certificate directory unless rotation is intentional. Check
`npm audit --omit=dev` separately and report advisories honestly. Existing
advisories are documented in [SECURITY.md](SECURITY.md), not hidden by test results.

## Changes and review

- Keep browser assets self-contained and usable without internet access.
- Update the on-server instructions along with repository documentation.
- For raster cases, specify content negotiation, GET/HEAD, Range and exact bytes.
- Test rejected credentials as well as successful authentication.
- Test desktop and mobile layouts; sanitize screenshots before attaching them.
- Preserve package lockfile reproducibility and dependency license notices.
- Use concise commit subjects consistent with repository history, such as
  `feat:`, `fix:`, `docs:` or `test:`. Open a pull request with exact validation
  commands, results, behavior changes and any unverified limitations.

Follow the [code of conduct](CODE_OF_CONDUCT.md). Report sensitive issues through
the private route in [SECURITY.md](SECURITY.md), not a public issue or PR.
