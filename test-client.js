'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { brotliDecompressSync } = require('node:zlib');
const { X509Certificate } = require('node:crypto');
const forge = require('node-forge');
const { spawnSync } = require('node:child_process');
const { tmpdir } = require('node:os');

const httpOrigin = process.env.TEST_HTTP_URL || `http://localhost:${process.env.HTTP_PORT || 9480}`;
const httpsOrigin = process.env.TEST_HTTPS_URL || `https://localhost:${process.env.HTTPS_PORT || 9443}`;
const certs = process.env.TEST_CERTS_DIR || path.join(__dirname, 'certs');
const ca = fs.readFileSync(path.join(certs, 'ca.crt'));
const fixture = fs.readFileSync(path.join(__dirname, 'data', 'cog.tif'));
const basic = `Basic ${Buffer.from('admin:admin').toString('base64')}`;
const bearer = 'Bearer supersecrettoken123';
const client = {
    key: fs.readFileSync(path.join(certs, 'client.key')),
    cert: fs.readFileSync(path.join(certs, 'client.crt'))
};

function request(origin, route, { body, ...options } = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(route, origin);
        const transport = url.protocol === 'https:' ? https : http;
        const req = transport.request(url, { ca, agent: false, ...options }, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('error', reject);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        req.setTimeout(10000, () => req.destroy(new Error(`Timed out: ${url}`)));
        req.on('error', reject);
        req.end(body);
    });
}

for (const [protocol, origin] of [['HTTP', httpOrigin], ['HTTPS', httpsOrigin]]) {
    test(`${protocol}: docs, assets and server-generated configuration`, async () => {
        for (const route of ['/', '/logs.html', '/styles.css', '/app.js', '/logs.js']) {
            const response = await request(origin, route);
            assert.equal(response.status, 200, route);
            assert.ok(response.body.length > 100, route);
        }
        const response = await request(origin, '/api/config');
        assert.equal(response.status, 200);
        const config = JSON.parse(response.body);
        assert.equal(config.fixture.bytes, fixture.length);
        assert.ok(config.fixture.brotliBytes > 0);
        assert.equal(config.certificates.fingerprint256, new X509Certificate(ca).fingerprint256);
        assert.equal(config.oauth.mock, true);
        assert.equal(config.basic.username, 'admin');
        for (const name of ['http', 'https']) {
            assert.equal(new URL(config.endpoints[name]).protocol, `${name}:`);
        }
    });

    test(`${protocol}: no-auth TIFF contents, HEAD and byte ranges`, async () => {
        const route = '/test/none/cog.tif';
        const full = await request(origin, route);
        assert.equal(full.status, 200);
        assert.deepEqual(full.body, fixture);
        assert.match(full.headers['content-type'], /image\/tiff/);
        assert.equal(full.headers['accept-ranges'], 'bytes');
        const head = await request(origin, route, { method: 'HEAD' });
        assert.equal(head.status, 200);
        assert.equal(Number(head.headers['content-length']), fixture.length);
        assert.equal(head.body.length, 0);
        for (const [range, start, end] of [['bytes=0-31', 0, 31], ['bytes=-16', fixture.length - 16, fixture.length - 1], [`bytes=${fixture.length - 12}-`, fixture.length - 12, fixture.length - 1]]) {
            const partial = await request(origin, route, { headers: { Range: range } });
            assert.equal(partial.status, 206);
            assert.equal(partial.headers['content-range'], `bytes ${start}-${end}/${fixture.length}`);
            assert.deepEqual(partial.body, fixture.subarray(start, end + 1));
        }
        const invalid = await request(origin, route, { headers: { Range: `bytes=${fixture.length}-` } });
        assert.equal(invalid.status, 416);
        assert.equal(invalid.headers['content-range'], `bytes */${fixture.length}`);
        const status = await request(origin, '/test/none/status');
        assert.equal(JSON.parse(status.body).status, 'ok');
    });

    test(`${protocol}: Brotli decoding, negotiation, HEAD and explicit range policy`, async () => {
        const route = '/test/none/brotli/cog.tif';
        const encoded = await request(origin, route, { headers: { 'Accept-Encoding': 'br' } });
        assert.equal(encoded.status, 200);
        assert.equal(encoded.headers['content-encoding'], 'br');
        assert.equal(encoded.headers['accept-ranges'], 'none');
        assert.match(encoded.headers.vary, /Accept-Encoding/i);
        assert.equal(Number(encoded.headers['content-length']), encoded.body.length);
        assert.deepEqual(brotliDecompressSync(encoded.body), fixture);
        const ranged = await request(origin, route, { headers: { 'Accept-Encoding': 'br', Range: 'bytes=0-31' } });
        assert.equal(ranged.status, 200);
        assert.equal(ranged.headers['content-range'], undefined);
        assert.deepEqual(ranged.body, encoded.body);
        const head = await request(origin, route, { method: 'HEAD', headers: { 'Accept-Encoding': 'br' } });
        assert.equal(head.status, 200);
        assert.equal(head.headers['content-encoding'], 'br');
        assert.equal(head.headers['content-length'], encoded.headers['content-length']);
        assert.equal(head.body.length, 0);
        for (const accept of [undefined, 'gzip', 'br;q=0', 'identity;q=1, br;q=0.5']) {
            const response = await request(origin, route, { headers: { ...(accept ? { 'Accept-Encoding': accept } : {}), Range: 'bytes=0-31' } });
            assert.equal(response.status, 206, `identity fallback for ${accept}`);
            assert.equal(response.headers['content-encoding'], undefined);
            assert.deepEqual(response.body, fixture.subarray(0, 32));
        }
        const unacceptable = await request(origin, route, { headers: { 'Accept-Encoding': 'br;q=0, identity;q=0, *;q=0' } });
        assert.equal(unacceptable.status, 406);
    });

    test(`${protocol}: only intended test assets are downloadable`, async () => {
        for (const name of ['ca.crt', 'server.crt', 'client.crt', 'client.key', 'client.p12']) {
            const response = await request(origin, `/downloads/${name}`);
            assert.equal(response.status, 200, name);
            assert.deepEqual(response.body, fs.readFileSync(path.join(certs, name)));
            assert.match(response.headers['content-disposition'], /attachment/);
            assert.equal(response.headers['cache-control'], 'no-store');
        }
        const netrc = await request(origin, '/downloads/test.netrc');
        assert.equal(netrc.status, 200);
        assert.match(netrc.body.toString(), /machine \S+\nlogin admin\npassword admin\n/);
        for (const name of ['ca.key', 'server.key', 'unknown', '%2e%2e%2fserver.js']) {
            assert.equal((await request(origin, `/downloads/${name}`)).status, 404, name);
        }
    });
}

for (const [name, authorization] of [['basic', basic], ['netrc', basic], ['bearer', bearer], ['oauth2', bearer]]) {
    test(`${name}: correct credentials, missing credentials and wrong credentials`, async () => {
        const route = `/test/${name}/cog.tif`;
        for (const header of [undefined, 'Basic invalid', 'Bearer invalid']) {
            const response = await request(httpsOrigin, route, { headers: header ? { Authorization: header } : {} });
            assert.equal(response.status, 401, `${name} must reject ${header || 'missing credentials'}`);
            if (!header && ['basic', 'netrc'].includes(name)) {
                assert.match(response.headers['www-authenticate'], /^Basic /);
            }
        }
        const full = await request(httpsOrigin, route, { headers: { Authorization: authorization } });
        assert.equal(full.status, 200);
        assert.deepEqual(full.body, fixture);
        const partial = await request(httpsOrigin, route, { headers: { Authorization: authorization, Range: 'bytes=0-31' } });
        assert.equal(partial.status, 206);
        assert.deepEqual(partial.body, fixture.subarray(0, 32));
        const head = await request(httpsOrigin, route, { method: 'HEAD', headers: { Authorization: authorization } });
        assert.equal(head.status, 200);
        assert.equal(head.body.length, 0);
    });
}

for (const name of ['mtls', 'mtls-pki', 'mtls-pkcs12']) {
    test(`${name}: authorized client and missing client identity`, async () => {
        const route = `/test/${name}/cog.tif`;
        assert.equal((await request(httpsOrigin, route)).status, 401);
        const options = name === 'mtls-pkcs12'
            ? { pfx: fs.readFileSync(path.join(certs, 'client.p12')), passphrase: 'password' }
            : client;
        const full = await request(httpsOrigin, route, options);
        assert.equal(full.status, 200);
        assert.deepEqual(full.body, fixture);
        const partial = await request(httpsOrigin, route, { ...options, headers: { Range: 'bytes=0-31' } });
        assert.equal(partial.status, 206);
        assert.deepEqual(partial.body, fixture.subarray(0, 32));
    });
}

test('mTLS rejects an untrusted client certificate', async () => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(Date.now() - 60000);
    cert.validity.notAfter = new Date(Date.now() + 3600000);
    cert.setSubject([{ name: 'commonName', value: 'untrusted-test-client' }]);
    cert.setIssuer(cert.subject.attributes);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const response = await request(httpsOrigin, '/test/mtls/cog.tif', {
        cert: forge.pki.certificateToPem(cert), key: forge.pki.privateKeyToPem(keys.privateKey)
    });
    assert.equal(response.status, 403);
});

test('OAuth mock: authorize redirect and both POST-to-GET flows', async () => {
    const authorize = await request(httpsOrigin, '/oauth/authorize?response_type=code&client_id=test&redirect_uri=arcgis-pro%3A%2F%2Fauth&state=roundtrip');
    assert.equal(authorize.status, 302);
    const callback = new URL(authorize.headers.location);
    assert.equal(callback.searchParams.get('code'), 'mock_auth_code_123');
    assert.equal(callback.searchParams.get('state'), 'roundtrip');
    const state = 'roundtrip & reserved=+?#';
    const query = new URLSearchParams({ redirect_uri: 'arcgis-pro://auth?existing=kept', state });
    const encoded = await request(httpsOrigin, `/oauth/authorize?${query}`);
    assert.equal(encoded.status, 302);
    const encodedCallback = new URL(encoded.headers.location);
    assert.equal(encodedCallback.searchParams.get('state'), state);
    assert.equal(encodedCallback.searchParams.get('existing'), 'kept');
    for (const route of ['/oauth/authorize', '/oauth/authorize?redirect_uri=javascript:alert(1)', '/oauth/authorize?redirect_uri=x&redirect_uri=y']) {
        assert.equal((await request(httpsOrigin, route)).status, 400);
    }
    for (const body of [
        'grant_type=client_credentials&client_id=test&client_secret=test',
        'grant_type=authorization_code&code=mock_auth_code_123&client_id=test&code_verifier=mock_code_verifier'
    ]) {
        const response = await request(httpsOrigin, '/oauth/token', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
        });

        assert.equal(response.status, 200);
        const token = JSON.parse(response.body);
        assert.equal(token.token_type, 'Bearer');
        assert.equal(token.expires_in, 3600);
        assert.equal(typeof token.access_token, 'string');
        const raster = await request(httpsOrigin, '/test/oauth2/cog.tif', { headers: { Authorization: `Bearer ${token.access_token}` } });
        assert.equal(raster.status, 200);
        assert.deepEqual(raster.body, fixture);
    }
});

test('certificate initialization creates, reuses and refuses to rotate partial sets', () => {
    const directory = fs.mkdtempSync(path.join(tmpdir(), 'web-auth-cert-test-'));
    try {
        const script = path.join(directory, 'generate-certs.js');
        fs.copyFileSync(path.join(__dirname, 'generate-certs.js'), script);
        const run = () => spawnSync(process.execPath, [script, '--if-missing'], {
            env: { ...process.env, NODE_PATH: path.join(__dirname, 'node_modules') },
            encoding: 'utf8', timeout: 30000
        });
        const first = run();
        assert.equal(first.status, 0, first.stderr);
        const root = path.join(directory, 'certs', 'ca.crt');
        const original = fs.readFileSync(root);
        assert.ok(new X509Certificate(original).ca);
        const second = run();
        assert.equal(second.status, 0, second.stderr);
        assert.match(second.stdout, /Reusing/);
        assert.deepEqual(fs.readFileSync(root), original);
        fs.unlinkSync(path.join(directory, 'certs', 'client.p12'));
        const partial = run();
        assert.equal(partial.status, 1);
        assert.match(partial.stderr, /Incomplete certificate set/);
        assert.deepEqual(fs.readFileSync(root), original);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('CORS exposes encoding/range metadata and permits request playground headers', async () => {
    const response = await request(httpsOrigin, '/test/none/cog.tif', {
        method: 'OPTIONS', headers: { Origin: httpOrigin, 'Access-Control-Request-Headers': 'authorization,range' }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers['access-control-allow-origin'], httpOrigin);
    assert.match(response.headers['access-control-allow-headers'], /Authorization/);
    assert.match(response.headers['access-control-expose-headers'], /Content-Encoding/);
});

test('logs capture both protocols, request metadata and final status', async () => {
    for (const origin of [httpOrigin, httpsOrigin]) {
        const marker = `log-test-${new URL(origin).protocol}`;
        await request(origin, `/test/none/brotli/cog.tif?marker=${encodeURIComponent(marker)}`, {
            method: 'HEAD', headers: { 'X-Custom-Header': 'fixture-check', Cookie: 'sample=hello' }
        });
        const response = await request(httpOrigin, '/api/logs');
        assert.equal(response.status, 200);
        const logs = JSON.parse(response.body);
        assert.ok(logs.length <= 50);
        const entry = logs.find(log => log.query.marker === marker);
        assert.ok(entry, 'request must be logged');
        assert.equal(entry.headers['x-custom-header'], 'fixture-check');
        assert.equal(entry.cookies.sample, 'hello');
        assert.equal(entry.status, 200);
        assert.equal(typeof entry.durationMs, 'number');
    }
});
