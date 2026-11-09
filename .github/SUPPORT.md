# Support

1. Read the [README](../README.md) and the running website's connection profile.
2. Confirm HTTP 9480 and HTTPS 9443 are reachable and use the correct origin.
3. Check the active root CA, hostname/SANs and client certificate format. On
   Windows Schannel, see the documented test-CA revocation option.
4. Inspect the browser playground and live request logs. A failed TLS handshake
   may occur before HTTP and never appear in the log.
5. Run `npm test` against the affected instance. For Docker, inspect
   `docker compose ps` and `docker compose logs --tail 100 auth-server`.

For help, open a [bug report or connection diagnostic](https://github.com/augu8346/Web-Auth-Test-Server/issues/new/choose).
Include the revision, operating system, Node/Docker/client versions, selected
profile, expected result and minimal reproduction. For GDAL include its version
and TLS backend when known.

Replace real hosts, usernames, Authorization/Cookie headers, tokens and identifying
query parameters before sharing diagnostics. Do not attach private keys, netrc
files or raw logs containing real credentials. Use the fixed dummy fixtures.

Security-sensitive reports follow [SECURITY.md](../SECURITY.md), not public
issues. Support is best-effort; no response-time commitment is published.
