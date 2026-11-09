# Security policy

## Intended boundary

Only the current `main` branch is maintained; there is no support SLA or promise
of backports. This is a local testing fixture, not a production authentication
service. Compose binds to loopback by default.

Deliberately exposed test behavior includes:

- Fixed dummy Basic/bearer credentials and permissive mock OAuth token issuance.
- Downloadable test client certificates and their private key.
- Request headers, cookies and query fields in a public in-memory log.
- A test root CA whose signing key remains in the local certificate directory.

Never submit production credentials, install this CA on an untrusted machine,
or expose the service to untrusted clients. Remove test trust when finished.
The server does not publish CA or server private keys. Its public test client
identity must never be reused elsewhere.

## Reporting

Do not post exploit details, private keys, live tokens or personal data in public
issues. If GitHub shows **Report a vulnerability** in this repository's Security
tab, use that private channel. Otherwise, contact the repository owner through
an existing trusted private channel and ask for a secure reporting route. Do not
assume private reporting is enabled, and do not paste sensitive details into an
issue merely to request contact.

Describe the affected revision, exposure assumptions, impact and a minimal
reproduction using dummy data. Public non-sensitive usage problems belong in the
[issue tracker](https://github.com/augu8346/Web-Auth-Test-Server/issues).

## Dependencies and runtime

The 2026-11-09 production Docker build reported four npm dependency advisories:
one moderate, two high, and one critical. They have not been remediated by the
website redesign. This count is a dated observation, not a complete security
assessment or a guarantee about future installs.

Run `npm audit --omit=dev` to obtain current details. Review dependency and Node
image updates separately, update the lockfile, rebuild the image, and rerun
certificate, endpoint and browser tests. Do not blindly apply forceful dependency
upgrades or equate a green functional test suite with security clearance.
