# Verification notes

## Redesign verification (2026-11-09)

- `npm test`: 20 Node integration tests pass against the running server. These
  verify the active CA instead of globally disabling TLS validation.
- `npm run test:ui`: 9 Chromium tests pass, covering the connection handoffs,
  clipboard, both Brotli variants, real Basic/bearer/OAuth requests, certificate
  guidance, logs, visible error states, and desktop/mobile overflow.
- Desktop and 390-pixel mobile screenshots were inspected. The site uses only
  local assets.
- `docker compose config --quiet`: configuration validates.
- `docker compose up --build -d`: image built and container started successfully
  after Docker Desktop became available. Both published ports are loopback-only.
  Startup reused the existing bind-mounted certificates.
- `npm test` against the Docker container: all 20 tests pass.
- The container's advertised CA fingerprint matches the CA already installed in
  Windows CurrentUser Trusted Root Certification Authorities. Schannel curl
  successfully reached the container's HTTPS status endpoint using Windows trust
  with `--ssl-revoke-best-effort`, without `--cacert` or `-k`.
- The image build reported four production dependency audit advisories (one
  moderate, two high, one critical). Dependency remediation was not part of
  this build-and-launch verification.

## Real raster clients

`C:\ArcGIS\bin\gdalinfo.exe` identified as GDAL 3.13.2e (ArcGIS 3.8 build).
It successfully opened the fixture as GTiff, **6472 x 6841**, using:

- HTTP standard `/vsicurl/`.
- HTTP and HTTPS Brotli `/vsicurl_streaming/`, explicitly accepting `br`.
- HTTPS Basic, netrc, PEM mTLS and PKCS#12 mTLS.

HTTPS checks used `GDAL_HTTP_CAINFO` pointing to the active CA, not
`GDAL_HTTP_UNSAFESSL`. The HTTPS Brotli output identifies the dataset as a COG
with JPEG-compressed TIFF tiles; that internal compression is separate from the
HTTP Brotli representation.

`C:\ArcGIS\bin\brotli.exe` (1.2.1) independently decoded the raw HTTP Brotli
response. SHA-256 of the decoded TIFF matched the original fixture exactly.
Use curl **without** `--compressed` to capture raw encoded bytes for this check;
PowerShell Invoke-WebRequest may automatically decompress the response.

## Browser negotiation finding

Chromium requests `Accept-Encoding: identity` when sending a Range header.
The Brotli playground therefore disables its range field and requests a complete
representation. Browser tests check `Content-Encoding: br` and 4,339,079 decoded
bytes. Separate Node tests explicitly send both br and Range and verify the
server's documented 200/full-stream policy.

## Limits

Windows Schannel curl's default revocation policy rejected the test certificate
with "revocation status is unknown". Using `--ssl-revoke-best-effort` together
with `--cacert` succeeded without disabling CA or hostname validation. The website
and README examples include this test-CA-specific setting.

These are mock connection fixtures, not a validation of every ArcGIS Pro dialog
or a real OAuth provider. The matching CA was already installed in the Windows
user trust store, so no duplicate import was needed. OpenSSL/GDAL trust was
checked with an explicit CA file.
Client TLS backend differences and remote-host certificate SAN requirements
remain documented in the website.
