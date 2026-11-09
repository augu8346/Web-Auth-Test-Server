# Connection Lab / Web Auth Test Server

[![Build and Verify](https://github.com/augu8346/Web-Auth-Test-Server/actions/workflows/docker-build.yml/badge.svg)](https://github.com/augu8346/Web-Auth-Test-Server/actions/workflows/docker-build.yml)

A self-contained raster connection workbench for GDAL, ArcGIS Pro and HTTP clients.
It serves a real 6472 x 6841 Cloud Optimized GeoTIFF, predictable authentication
fixtures, copy-ready connection profiles, certificate downloads, a browser request
playground, and the latest 50 request logs.

**Start here: <http://localhost:9480>.** The website is the primary connection
handbook: all credentials, URLs, PowerShell/curl/GDAL examples, certificate setup,
Brotli behavior, and troubleshooting are available directly from the running server.
It needs no CDN, external fonts, or internet access.

> Test environment only. Credentials and client private keys are deliberately
> public fixtures. Request headers, cookies and query parameters are visible in
> the logs. Never use real credentials or expose this server to untrusted users.
> The OAuth implementation is a transport mock, not an authorization server.
> The latest local Docker build reported four production dependency advisories
> (one moderate, two high, one critical). Passing functional tests does not clear
> these advisories. See the [security policy](SECURITY.md).

## Start locally

Use Node.js 24 or newer:

```powershell
npm ci
npm start
```

`prestart` generates certificates when the entire set is absent, reuses an existing
complete set, and rejects an incomplete set rather than silently rotating trust.
The TIFF fixture is already in `data/cog.tif`. Brotli bytes are generated once at
startup using Node's built-in encoder; no GDAL/Brotli executable is needed to run
the server. Restart after replacing the fixture.

| Origin | Available surfaces |
|---|---|
| <http://localhost:9480> | Documentation, playground, downloads, logs, no-auth TIFF cases |
| <https://localhost:9443> | Same UI/downloads/logs, no-auth cases, all authenticated cases, OAuth mock |

`HTTP_PORT` and `HTTPS_PORT` change listening ports. The website derives connection
hostnames from the current request. Set `PUBLIC_HTTP_URL` / `PUBLIC_HTTPS_URL` to
absolute client-visible origins when using different published ports or a proxy.
The generated certificate covers only `localhost` and `127.0.0.1`; other hostnames
require an appropriate server certificate even if the CA is trusted.

## Start with Docker

```powershell
docker compose up --build -d
docker compose logs -f auth-server
```

Compose publishes both ports on **127.0.0.1 only** and bind-mounts `./certs` into
`/app/certs`. Startup initializes an empty mounted directory. Rebuilds and restarts
reuse these certificates, so they do not normally require another CA import.
Certificates, private keys and local dependencies are excluded from the build
context; no machine's PKI is baked into the image.

Stop a local Node instance before starting Compose on the same ports. To share
this intentionally insecure test service, explicitly change the Compose bind
addresses, restrict network access, and provision a server certificate whose SANs
cover the actual hostname/IP. A client in another container cannot use its own
`localhost` to reach this service.

## Trust HTTPS on the Windows Docker host

Do this **on the machine/account running the client**, not inside Docker:

```powershell
$assetDir = Join-Path $HOME 'AuthTest'
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
Invoke-WebRequest http://localhost:9480/downloads/ca.crt -OutFile "$assetDir\ca.crt"
Import-Certificate -FilePath "$assetDir\ca.crt" -CertStoreLocation Cert:\CurrentUser\Root
curl.exe --fail --ssl-revoke-best-effort --cacert "$assetDir\ca.crt" https://localhost:9443/test/none/status
```

Before importing, verify the CA's SHA-256 fingerprint through a trusted channel;
the active fingerprint is shown on the website. Import the **root CA**, not the
server leaf certificate. CurrentUser import needs no administrator privileges.
Restart ArcGIS Pro or the client after importing. Services under another account
need that account's trust store or administrator-managed LocalMachine trust.

Schannel clients use the Windows root store. OpenSSL-backed curl/GDAL may need
`--cacert` / `GDAL_HTTP_CAINFO` even after importing. Do not normally disable TLS
verification. Trust does not solve hostname mismatches or expired certificates.
The test CA has no revocation service. Windows Schannel curl may report
"revocation status is unknown"; `--ssl-revoke-best-effort` permits unavailable
revocation metadata while retaining CA, expiry and hostname checks. This is not
equivalent to disabling TLS validation with `-k`.

Alternatively, extract the active CA from the running container:

```powershell
docker compose cp auth-server:/app/certs/ca.crt .\ca.crt
```

`npm run generate-certs` explicitly **replaces the full test PKI**. Restart the
server afterwards, download fresh client assets, and replace the old trust entry.
Remove test CA trust when finished through `certmgr.msc` (Trusted Root
Certification Authorities / Certificates), verifying the thumbprint before
deleting only the matching Mock Auth Testing CA.

## Connection catalog

The website's **Copy connection handoff** includes the precise fields, asset
downloads and commands for each profile. All values below are dummy test values.

| Case | Path | Configuration |
|---|---|---|
| No Auth HTTP / HTTPS | `/test/none/cog.tif` | No credentials; ordinary GET/HEAD/range access |
| No Auth Brotli HTTP / HTTPS | `/test/none/brotli/cog.tif` | `Accept-Encoding: br`; see policy below |
| Basic | `/test/basic/cog.tif` | Username `admin`, password `admin` |
| Netrc | `/test/netrc/cog.tif` | Basic via a client-side netrc file; machine = URL hostname, without scheme or port |
| Bearer | `/test/bearer/cog.tif` | `Authorization: Bearer supersecrettoken123` |
| OAuth | `/test/oauth2/cog.tif` | Bearer token from POST `/oauth/token`; client ID/secret `test` |
| mTLS PEM | `/test/mtls-pki/cog.tif` | Client certificate + unencrypted client private key |
| mTLS PKCS#12 | `/test/mtls-pkcs12/cog.tif` | Client `.p12` bundle; password `password` |

Authenticated routes are HTTPS-only. `/test/mtls/cog.tif` remains a compatibility
alias. Missing/wrong Basic or bearer credentials return 401. Missing client
identity returns 401; an untrusted client certificate returns 403 or fails at TLS.
PEM/P12 file support varies by TLS backend; website commands target a compatible
OpenSSL-based GDAL/curl build. Schannel curl may require a client certificate
imported into CurrentUser\My and selected by thumbprint.

Downloads are allowlisted under `/downloads/`: `ca.crt`, `server.crt`,
`client.crt`, `client.key`, `client.p12`, and `test.netrc`. The downloaded netrc
matches the advertised HTTPS hostname. CA and server private keys are not served.
Installing the root CA establishes server trust; it does not supply an mTLS client
identity.

### Brotli is HTTP encoding, not TIFF tile compression

- The dedicated route negotiates `br` versus `identity` using Accept-Encoding.
- With `br`, it returns `Content-Type: image/tiff`, `Content-Encoding: br`,
  encoded `Content-Length`, `Vary: Accept-Encoding`, and `Accept-Ranges: none`.
- A Range request accepting `br` intentionally receives **200 with the entire
  compressed representation**, not undecodable partial compressed bytes.
- Without `br` support, it serves the identity TIFF with ordinary 206 byte ranges.
  Explicitly rejecting both representations returns 406.
- HEAD returns the same representation headers without a body.
- Ordinary TIFF endpoints remain unchanged: GET/HEAD, 206 for valid ranges,
  416 for unsatisfiable ranges.

For random-access COG testing, use the standard endpoint. For Brotli, use a full
download or GDAL's streaming reader:

```powershell
gdalinfo --config GDAL_HTTP_CAINFO "$assetDir\ca.crt" --config GDAL_HTTP_HEADERS "Accept-Encoding: br" /vsicurl_streaming/https://localhost:9443/test/none/brotli/cog.tif
```

The browser controls Accept-Encoding and automatically decompresses supported
responses. The playground disables byte ranges for the Brotli case because
Chromium requests identity encoding when fetching a byte range. It reports the
actual Content-Encoding and decoded body size, rather than assuming compression.

### OAuth mock boundaries

`GET /oauth/authorize` returns a fixed code to a supplied HTTP(S) callback or
`arcgis-pro://auth`. The latter redirects immediately. The HTTP(S) case displays a
mock authorization page. A callback URL is required; state and existing query
parameters are preserved.

`POST /oauth/token` returns a fixed token with advertised `expires_in: 3600`.
Client credentials, grants, authorization codes, registered redirect URIs, scopes,
PKCE verifiers and expiry **are not validated**. Refresh/renewal is not implemented.
Use it to test client wiring and token propagation, not OAuth correctness.

## Verification

With the normal server running:

```powershell
npm test
# The original entry point still works:
node test-client.js
```

Node tests assert TLS trust, exact TIFF bytes, range/HEAD behavior, Brotli
decompression and negotiation on both protocols, authentication success and
rejection, actual PEM/P12 identities, OAuth wiring, download restrictions and
request logs. Failures produce a nonzero exit code.

Use `TEST_HTTP_URL`, `TEST_HTTPS_URL`, and `TEST_CERTS_DIR` to target another
deployment with its active CA/client files. Defaults are local ports 9480/9443
(or `HTTP_PORT` / `HTTPS_PORT`) and the repository's `certs` directory.

Browser tests launch their own server on 19480/19443 and stop it automatically:

```powershell
npx playwright install chromium
npm run test:ui
```

They cover all profiles, clipboard handoffs, real request workflows, Brotli
decoding, certificate guidance, safe log rendering, error states, and mobile /
desktop layout. Browser tests bypass TLS trust only to avoid modifying the user's
certificate store; the separate Node suite verifies the actual CA. Generated
screenshots and reports are ignored by Git.

See [verification notes](docs/walkthrough.md) for the executed checks and limits.

GitHub Actions runs the Docker build, container integration tests and Chromium
tests on pushes and pull requests targeting `main` or `master`. It does not import
certificates into a developer's trust store or publish images.

## Project resources

- [Architecture](docs/implementation_plan.md) and [acceptance checklist](docs/task.md)
- [Changes](CHANGELOG.md) and [contributing](CONTRIBUTING.md)
- [Support](.github/SUPPORT.md) and [issue tracker](https://github.com/augu8346/Web-Auth-Test-Server/issues)
- [Security policy](SECURITY.md) and [code of conduct](CODE_OF_CONDUCT.md)
- [MIT license](LICENSE) and [third-party notices](NOTICE.md)
