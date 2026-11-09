'use strict';

const byId = id => document.getElementById(id);
let config;
let profiles = [];
let selectedProfile = 'none-http';
let selectedCase = 'standard';
let toastTimer;

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function notify(message) {
    byId('toast').textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { byId('toast').textContent = ''; }, 4500);
}

async function copy(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            const previousFocus = document.activeElement;
            const input = element('textarea', text);
            input.style.position = 'fixed';
            input.style.opacity = '0';
            document.body.append(input);
            input.select();
            const copied = document.execCommand('copy');
            input.remove();
            previousFocus?.focus();
            if (!copied) throw new Error('Clipboard access was denied. Select and copy the text manually.');
        }
        notify('Copied to clipboard');
    } catch (error) {
        notify(`Copy failed: ${error.message}`);
    }
}

function copyButton(text, label = 'Copy') {
    const button = element('button', label, 'copy-button');
    button.type = 'button';
    button.addEventListener('click', () => copy(text));
    return button;
}

function codeBlock(text) {
    const block = element('div', undefined, 'code-block');
    block.append(element('pre', text), copyButton(text));
    return block;
}

const ps = value => `'${String(value).replaceAll("'", "''")}'`;
const assetDir = '$assetDir = Join-Path $HOME \'AuthTest\'';

function downloadCommands(names) {
    return `${assetDir}\nNew-Item -ItemType Directory -Force -Path $assetDir | Out-Null\n` +
        names.map(name => `Invoke-WebRequest ${ps(`${location.origin}/downloads/${name}`)} -OutFile (Join-Path $assetDir ${ps(name)})`).join('\n');
}

function makeProfiles() {
    const https = config.endpoints.https;
    return [
        { id: 'none-http', title: 'No Auth / HTTP', subtitle: 'Plain HTTP baseline', transport: 'HTTP', noAuth: true, base: config.endpoints.http, path: 'none',
            description: 'Start here to separate connectivity and raster handling from TLS and authentication. Custom headers and cookies are accepted but not required.' },
        { id: 'none-https', title: 'No Auth / HTTPS', subtitle: 'TLS without credentials', transport: 'HTTPS', noAuth: true, base: https, path: 'none',
            description: 'Validate server certificate trust and raster delivery without sending any authentication credentials.' },
        { id: 'basic', title: 'Basic authentication', subtitle: 'Username + password', transport: 'HTTPS', base: https, path: 'basic',
            description: 'Select Basic authentication in your connection configuration. The server challenges missing credentials and checks the username and password on every request.' },
        { id: 'netrc', title: 'Netrc credentials', subtitle: 'Host-matched Basic auth', transport: 'HTTPS', base: https, path: 'netrc',
            description: 'The client reads a netrc file and sends Basic authentication. Set the machine entry to the URL hostname, without a scheme, port, or path. The file stays on the client machine.' },
        { id: 'bearer', title: 'Bearer token', subtitle: 'Static Authorization header', transport: 'HTTPS', base: https, path: 'bearer',
            description: 'Select bearer/token authentication, or set the Authorization header. Paste the token alone into a token field; include the Bearer prefix only when setting the full header.' },
        { id: 'oauth2', title: 'OAuth 2.0', subtitle: 'Token acquisition mock', transport: 'HTTPS', base: https, path: 'oauth2',
            description: 'Configure a custom OAuth provider with the fields below. The mock returns a fixed token so you can test the POST-to-GET workflow, not authorization policy or PKCE enforcement.' },
        { id: 'mtls-pki', title: 'mTLS / PEM', subtitle: 'Client certificate + key', transport: 'HTTPS', base: https, path: 'mtls-pki',
            description: 'Select PKI/client certificate authentication. Supply both the client certificate and its private key. The server checks whether the presented client identity chains to its test CA.' },
        { id: 'mtls-pkcs12', title: 'mTLS / PKCS#12', subtitle: 'Password-protected bundle', transport: 'HTTPS', base: https, path: 'mtls-pkcs12',
            description: 'Select PKCS#12 client certificate authentication and provide the downloadable .p12 bundle with its password. This exercises the same server-side mTLS check as PEM, using a different client format.' }
    ];
}

function profileDetails(profile, variant = 'standard') {
    const brotli = profile.noAuth && variant === 'brotli';
    const url = `${profile.base}/test/${profile.path}/${brotli ? 'brotli/' : ''}cog.tif`;
    const fields = [['Raster URL', url], ['Authentication', profile.noAuth ? 'None' : profile.title]];
    const assets = profile.transport === 'HTTPS' ? ['ca.crt'] : [];
    let curlFlags = profile.transport === 'HTTPS' ? '--ssl-revoke-best-effort --cacert "$assetDir\\ca.crt" ' : '';
    let gdalFlags = profile.transport === 'HTTPS' ? '--config GDAL_HTTP_CAINFO "$assetDir\\ca.crt" ' : '';
    let beforeCurl = '';
    let notes = 'Expected: 200 for a complete TIFF or HEAD; 206 for a satisfiable byte range; 416 for an unsatisfiable range.';
    if (profile.noAuth) {
        fields.push(['Test case', brotli ? 'Brotli HTTP content encoding' : 'Standard TIFF / byte ranges']);
        if (brotli) {
            fields.push(['Request header', 'Accept-Encoding: br'], ['Response encoding', 'br (when accepted)'], ['Range behavior', 'Full response: 200; Accept-Ranges: none']);
            curlFlags += '--compressed --header "Accept-Encoding: br" ';
            gdalFlags += '--config GDAL_HTTP_HEADERS "Accept-Encoding: br" ';
            notes = 'This is HTTP transfer compression, not compression of TIFF tiles. br-capable clients receive the full stream and must decode it. A Range header is intentionally ignored for the encoded representation. Without br support, the route falls back to the standard TIFF with byte ranges. curl must list brotli in curl.exe --version. Use /vsicurl_streaming/ rather than random-access /vsicurl/ for this case.';
        }
    }
    if (profile.id === 'basic' || profile.id === 'netrc') {
        fields.push(['Username', config.basic.username], ['Password', config.basic.password]);
        if (profile.id === 'basic') {
            curlFlags += `--user ${ps(`${config.basic.username}:${config.basic.password}`)} `;
            gdalFlags += `--config GDAL_HTTP_AUTH BASIC --config GDAL_HTTP_USERPWD ${ps(`${config.basic.username}:${config.basic.password}`)} `;
        } else {
            assets.push('test.netrc');
            fields.push(['Netrc machine', new URL(url).hostname], ['Netrc file', '$HOME\\AuthTest\\test.netrc']);
            curlFlags += '--netrc-file "$assetDir\\test.netrc" ';
            gdalFlags += '--config GDAL_HTTP_NETRC YES --config GDAL_HTTP_NETRC_FILE "$assetDir\\test.netrc" ';
        }
        notes += ' Missing or incorrect credentials return 401.';
    }
    if (profile.id === 'bearer') {
        fields.push(['Token', config.bearer.token], ['Header', `Authorization: Bearer ${config.bearer.token}`]);
        curlFlags += `--header ${ps(`Authorization: Bearer ${config.bearer.token}`)} `;
        gdalFlags += `--config GDAL_HTTP_HEADERS ${ps(`Authorization: Bearer ${config.bearer.token}`)} `;
        notes += ' Missing or incorrect tokens return 401.';
    }
    if (profile.id === 'oauth2') {
        fields.push(['Authorization URL', `${profile.base}/oauth/authorize`], ['Token URL', `${profile.base}/oauth/token`],
            ['Client ID', config.oauth.clientId], ['Client secret', config.oauth.clientSecret],
            ['Grant types', 'client_credentials / authorization_code (mock)'], ['Scope', 'Not required; ignored by mock'],
            ['Redirect URI', config.oauth.redirectUri], ['Code', config.oauth.code], ['Token lifetime', `${config.oauth.expiresIn} seconds advertised; not enforced`],
            ['Token transport', 'Authorization: Bearer <access_token>']);
        beforeCurl = `$tokenJson = curl.exe --fail-with-body --silent --show-error --ssl-revoke-best-effort --cacert "$assetDir\\ca.crt" --data ${ps(`grant_type=client_credentials&client_id=${config.oauth.clientId}&client_secret=${config.oauth.clientSecret}`)} ${ps(`${profile.base}/oauth/token`)}\nif ($LASTEXITCODE -ne 0) { throw 'Token request failed' }\n$token = ($tokenJson | ConvertFrom-Json).access_token\n`;
        curlFlags += '--header "Authorization: Bearer $token" ';
        gdalFlags += '--config GDAL_HTTP_HEADERS "Authorization: Bearer $token" ';
        notes = 'Transport mock only: the POST endpoint accepts any submitted fields and returns a fixed token. Authorization code, client secret, PKCE verifier, grant, scopes and expiry are not validated. Refresh and token renewal are not implemented. The resource endpoint still checks the bearer token. For the auth-code wiring flow, visit the authorization URL with response_type=code, client_id, redirect_uri, state and optional PKCE parameters, then POST grant_type=authorization_code, code, redirect_uri, client_id and code_verifier to the token URL.';
    }
    if (profile.id.startsWith('mtls')) {
        fields.push(['Client identity', 'test-client'], ['Legacy alias', `${profile.base}/test/mtls/cog.tif`]);
        if (profile.id === 'mtls-pki') {
            assets.push('client.crt', 'client.key');
            fields.push(['Certificate', '$HOME\\AuthTest\\client.crt'], ['Private key', '$HOME\\AuthTest\\client.key'], ['Key password', 'None (unencrypted test key)']);
            curlFlags += '--cert-type PEM --cert "$assetDir\\client.crt" --key "$assetDir\\client.key" ';
            gdalFlags += '--config GDAL_HTTP_SSLCERTTYPE PEM --config GDAL_HTTP_SSLCERT "$assetDir\\client.crt" --config GDAL_HTTP_SSLKEY "$assetDir\\client.key" ';
        } else {
            assets.push('client.p12');
            fields.push(['Bundle', '$HOME\\AuthTest\\client.p12'], ['Bundle password', config.certificates.password]);
            curlFlags += `--cert-type P12 --cert "$assetDir\\client.p12:${config.certificates.password}" `;
            gdalFlags += `--config GDAL_HTTP_SSLCERTTYPE P12 --config GDAL_HTTP_SSLCERT "$assetDir\\client.p12" --config GDAL_HTTP_KEYPASSWD ${ps(config.certificates.password)} `;
        }
        notes += ' No client certificate returns 401; an untrusted identity may fail at the TLS handshake or return 403. PEM/P12 file support depends on the client TLS backend. These commands target an OpenSSL-capable curl/GDAL build; Windows Schannel curl may need the client certificate imported into CurrentUser\\My and selected by thumbprint instead. The root CA is not a client identity.';
    }
    const setup = assets.length ? downloadCommands(assets) : '# No certificate or credential files are required for HTTP.';
    const curl = `${beforeCurl}curl.exe --fail-with-body --show-error ${curlFlags}--output .\\downloaded-cog.tif ${ps(url)}`;
    const gdal = `${profile.id === 'oauth2' ? '# Run the token acquisition commands above first.\n' : ''}gdalinfo ${gdalFlags}${ps(`${brotli ? '/vsicurl_streaming/' : '/vsicurl/'}${url}`)}`;
    return { url, fields, setup, curl, gdal, notes };
}

function renderProfile() {
    const profile = profiles.find(item => item.id === selectedProfile);
    const data = profileDetails(profile, selectedCase);
    document.querySelectorAll('.profile-button').forEach(button => {
        button.setAttribute('aria-current', String(button.dataset.profile === selectedProfile));
    });
    const detail = byId('connection-detail');
    detail.replaceChildren();
    const header = element('div', undefined, 'detail-header');
    header.append(element('h3', profile.title), element('span', profile.transport, 'tag'));
    detail.append(header, element('p', profile.description));
    if (profile.noAuth) {
        const label = element('label', 'Test case ');
        const select = element('select');
        select.id = 'fixture-case';
        select.setAttribute('aria-label', 'No Auth test case');
        for (const [value, text] of [['standard', 'Standard TIFF / byte ranges'], ['brotli', 'Brotli-encoded TIFF']]) {
            const option = element('option', text);
            option.value = value;
            select.append(option);
        }
        select.value = selectedCase;
        select.addEventListener('change', () => {
            selectedCase = select.value;
            renderProfile();
            byId('fixture-case').focus();
        });
        label.append(select);
        detail.append(label);
    }
    const fields = element('dl', undefined, 'fields');
    for (const [name, value] of data.fields) {
        const row = element('div', undefined, 'field');
        const dd = element('dd');
        dd.append(element('code', value));
        const button = copyButton(value);
        button.setAttribute('aria-label', `Copy ${name}`);
        row.append(element('dt', name), dd, button);
        fields.append(row);
    }
    const handoff = `${profile.title}\n${data.fields.map(([key, value]) => `${key}: ${value}`).join('\n')}\n\n${data.notes}\n\nPowerShell setup:\n${data.setup}\n\ncurl:\n${data.curl}\n\nGDAL:\n${data.gdal}`;
    const copyAll = copyButton(handoff, 'Copy connection handoff');
    copyAll.className = 'button';
    detail.append(fields, copyAll, element('h4', 'Expected behavior'), element('p', data.notes, 'notice'));
    detail.append(element('h4', '1. Prepare test assets / PowerShell'), codeBlock(data.setup),
        element('h4', '2. Download with curl / PowerShell'), codeBlock(data.curl),
        element('h4', '3. Open with GDAL / PowerShell'), codeBlock(data.gdal),
        element('p', 'Run examples in a fresh PowerShell session with curl.exe and gdalinfo on PATH. Remove inherited GDAL_HTTP_* credential overrides before switching profiles. HTTPS examples use an explicit CA file. The curl revocation option allows missing revocation metadata for this test CA on Schannel; CA and hostname verification remain enabled. Certificate installation is explained below.', 'small'));
    if (profile.id === 'oauth2') {
        const authorize = new URL(`${profile.base}/oauth/authorize`);
        authorize.search = new URLSearchParams({ response_type: 'code', client_id: config.oauth.clientId, redirect_uri: config.oauth.redirectUri, state: 'connection-lab' });
        const link = element('a', 'Open mock authorization flow');
        link.href = authorize.href;
        link.target = '_blank';
        link.rel = 'noopener';
        detail.append(link);
    }
}

function renderCertificates() {
    byId('ca-fingerprint').textContent = `SHA-256: ${config.certificates.fingerprint256}`;
    byId('ca-expiry').textContent = `CA expires: ${config.certificates.validTo}`;
    byId('trust-command').append(codeBlock(`${downloadCommands(['ca.crt'])}\nImport-Certificate -FilePath "$assetDir\\ca.crt" -CertStoreLocation Cert:\\CurrentUser\\Root`));
    byId('verify-command').append(codeBlock(`${assetDir}\ncurl.exe --fail --ssl-revoke-best-effort --cacert "$assetDir\\ca.crt" ${ps(`${config.endpoints.https}/test/none/status`)}\n# Windows Schannel: after importing the CA, also test without --cacert.\ncurl.exe --fail --ssl-revoke-best-effort ${ps(`${config.endpoints.https}/test/none/status`)}`));
}

function renderPlayground() {
    const select = byId('request-profile');
    for (const profile of profiles.filter(item => !item.id.startsWith('mtls') && item.id !== 'netrc')) {
        for (const variant of profile.noAuth ? ['standard', 'brotli'] : ['standard']) {
            const option = element('option', `${profile.title}${variant === 'brotli' ? ' / Brotli' : ''}`);
            option.value = `${profile.id}:${variant}`;
            select.append(option);
        }
    }
    select.addEventListener('change', () => {
        const brotli = select.value.endsWith(':brotli');
        byId('request-range').disabled = brotli;
        byId('range-help').textContent = brotli
            ? 'Brotli uses a full download. Browsers force identity encoding when requesting byte ranges.'
            : 'Standard TIFF requests support byte ranges.';
    });
    byId('request-form').addEventListener('submit', async event => {
        event.preventDefault();
        const button = byId('send-request');
        button.disabled = true;
        byId('request-status').textContent = 'Sending...';
        const [id, variant] = select.value.split(':');
        const profile = profiles.find(item => item.id === id);
        const { url } = profileDetails(profile, variant);
        try {
            if (location.protocol === 'https:' && url.startsWith('http:')) {
                throw new Error('Open the HTTP documentation origin to test HTTP. Browsers block mixed-content requests from HTTPS pages.');
            }
            const headers = {};
            if (!byId('request-range').disabled && byId('request-range').value) headers.Range = byId('request-range').value;
            if (id === 'basic') headers.Authorization = `Basic ${btoa(`${config.basic.username}:${config.basic.password}`)}`;
            if (id === 'bearer') headers.Authorization = `Bearer ${config.bearer.token}`;
            if (id === 'oauth2') {
                const tokenResponse = await fetch(`${profile.base}/oauth/token`, {
                    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: config.oauth.clientId, client_secret: config.oauth.clientSecret }),
                    signal: AbortSignal.timeout(15000)
                });
                if (!tokenResponse.ok) throw new Error(`Token endpoint returned ${tokenResponse.status}`);
                headers.Authorization = `Bearer ${(await tokenResponse.json()).access_token}`;
            }
            const started = performance.now();
            const response = await fetch(url, { method: byId('request-method').value, headers, signal: AbortSignal.timeout(15000) });
            const body = await response.arrayBuffer();
            byId('request-status').textContent = `${response.status} ${response.statusText} / ${Math.round(performance.now() - started)} ms`;
            byId('request-output').textContent = `${byId('request-method').value} ${url}\n\n${[...response.headers].map(([key, value]) => `${key}: ${value}`).join('\n')}\n\nReceived ${body.byteLength.toLocaleString()} decoded bytes.\n${response.ok ? 'Request completed.' : 'Request rejected. Check configuration and live logs.'}${variant === 'brotli' ? '\nThe browser sets Accept-Encoding. Confirm content-encoding: br above; otherwise this was the identity fallback. Content-Length measures encoded bytes, not the decoded body.' : ''}`;
        } catch (error) {
            byId('request-status').textContent = 'Request failed';
            byId('request-output').textContent = `${error.message}\n\nCheck that both ports are reachable and trust the active root CA. A TLS failure occurs before HTTP and might not appear in logs.`;
        } finally {
            button.disabled = false;
        }
    });
}

async function initialize() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error(`Configuration endpoint returned ${response.status}`);
        config = await response.json();
        profiles = makeProfiles();
        byId('http-origin').textContent = config.endpoints.http;
        byId('https-origin').textContent = config.endpoints.https;
        byId('fixture-size').textContent = `${(config.fixture.bytes / 1048576).toFixed(2)} MiB original / ${(config.fixture.brotliBytes / 1048576).toFixed(2)} MiB Brotli`;
        profiles.forEach((profile, index) => {
            const button = element('button', undefined, 'profile-button');
            button.type = 'button';
            button.dataset.profile = profile.id;
            const label = element('span');
            label.append(element('strong', profile.title), element('small', profile.subtitle));
            button.append(element('span', String(index + 1).padStart(2, '0'), 'profile-number'), label);
            button.addEventListener('click', () => { selectedProfile = profile.id; renderProfile(); });
            byId('connection-list').append(button);
        });
        renderProfile();
        renderCertificates();
        renderPlayground();
        byId('load-status').hidden = true;
    } catch (error) {
        byId('load-status').className = 'notice error';
        byId('load-status').textContent = `Unable to load the connection catalog: ${error.message}. Check the server and reload this page.`;
        byId('send-request').disabled = true;
    }
}

initialize();
