const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const { brotliCompressSync } = require('zlib');
const { X509Certificate } = require('crypto');

// Ports
const HTTP_PORT = process.env.HTTP_PORT || 9480;
const HTTPS_PORT = process.env.HTTPS_PORT || 9443;

// Paths
const dataDir = path.join(__dirname, 'data');
const certsDir = path.join(__dirname, 'certs');
const publicDir = path.join(__dirname, 'public');

// Data File
const cogFile = path.join(dataDir, 'cog.tif');
const cogBytes = fs.readFileSync(cogFile);
const brotliBytes = brotliCompressSync(cogBytes);
const caCertificate = new X509Certificate(fs.readFileSync(path.join(certsDir, 'ca.crt')));

// Servers
const appHTTP = express();
const appHTTPS = express();

// Global Request Log
const MAX_LOGS = 50;
const requestLogs = [];
let requestId = 0;

function logRequest(req, res, isHttps) {
    const logEntry = {
        id: ++requestId,
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl || req.url,
        protocol: isHttps ? 'https' : 'http',
        headers: req.headers,
        query: req.query,
        cookies: req.cookies || {},
        ip: req.ip || req.connection.remoteAddress
    };
    const started = Date.now();
    res.on('finish', () => {
        logEntry.status = res.statusCode;
        logEntry.durationMs = Date.now() - started;
    });

    requestLogs.unshift(logEntry); // add to beginning
    if (requestLogs.length > MAX_LOGS) {
        requestLogs.pop(); // remove oldest
    }
}

// ----------------------------------------------------
// HTTPS Server Config (Auth Endpoints)
// ----------------------------------------------------

// CORS just in case client UI needs to hit it via fetch
appHTTPS.use((req, res, next) => {
    const origin = req.headers.origin || '*';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range, X-Custom-Header');
    res.header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Encoding');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

appHTTPS.use(cookieParser());
appHTTPS.use(express.json());
appHTTPS.use(express.urlencoded({ extended: true }));

// Log all HTTPS requests
appHTTPS.use((req, res, next) => {
    if (req.path !== '/api/logs') logRequest(req, res, true);
    next();
});

// Middleware for auth
const checkBasicAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Test Server"');
        return res.status(401).send('Authentication required.');
    }
    const b64auth = (authHeader || '').split(' ')[1] || '';
    const [user, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    if (user === 'admin' && password === 'admin') {
        return next();
    }
    return res.status(401).send('Invalid credentials.');
};

const checkBearerToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send('Bearer token required.');
    }
    const token = authHeader.split(' ')[1];
    if (token === 'supersecrettoken123') {
        return next();
    }
    return res.status(401).send('Invalid token.');
};

const checkMtls = (req, res, next) => {
    const clientCert = req.socket.getPeerCertificate();
    if (req.client.authorized) {
        return next();
    } else if (clientCert && clientCert.subject) {
        return res.status(403).send(`Client certificate provided but not authorized. Error: ${req.socket.authorizationError}`);
    } else {
        return res.status(401).send(`Client certificate required. Error: ${req.socket.authorizationError}`);
    }
};

// Endpoints
const sendCogFile = (req, res) => {
    if (!fs.existsSync(cogFile)) {
        return res.status(404).send('cog.tif not found on server. Make sure to place one in the data folder.');
    }
    res.sendFile(cogFile); // Express sendFile handles Range requests natively
};

const sendBrotliFile = (req, res) => {
    res.vary('Accept-Encoding');
    const encoding = req.headers['accept-encoding']
        ? req.acceptsEncodings('br', 'identity')
        : 'identity';
    if (!encoding) {
        return res.status(406).send('This fixture supports br and identity encodings.');
    }
    if (encoding === 'identity') return sendCogFile(req, res);
    // Ranges of a compressed stream are not independently decodable TIFF ranges.
    res.set({
        'Content-Type': 'image/tiff',
        'Content-Encoding': 'br',
        'Content-Length': brotliBytes.length,
        'Accept-Ranges': 'none',
        'Cache-Control': 'no-store'
    });
    res.status(200).end(req.method === 'HEAD' ? undefined : brotliBytes);
};

appHTTPS.get('/test/none/brotli/cog.tif', sendBrotliFile);

// 1. None (Custom headers/cookies)
appHTTPS.all('/test/none/cog.tif', sendCogFile);
appHTTPS.all('/test/none/status', (req, res) => res.json({ status: 'ok', message: 'No auth required' }));

// 2. Basic
appHTTPS.all('/test/basic/cog.tif', checkBasicAuth, sendCogFile);
appHTTPS.all('/test/netrc/cog.tif', checkBasicAuth, sendCogFile);

// 3. Bearer
appHTTPS.all('/test/bearer/cog.tif', checkBearerToken, sendCogFile);

// 4. MTLS (PEM/PKI and PKCS#12)
// Note: The server sees these exactly the same during the TLS handshake, 
// but separate endpoints help keep your GDAL client test scripts organized!
appHTTPS.all('/test/mtls/cog.tif', checkMtls, sendCogFile);
appHTTPS.all('/test/mtls-pki/cog.tif', checkMtls, sendCogFile);
appHTTPS.all('/test/mtls-pkcs12/cog.tif', checkMtls, sendCogFile);

// 5. OAuth2 Mocking
appHTTPS.get('/oauth/authorize', (req, res) => {
    const { redirect_uri, state = '' } = req.query;
    if (typeof redirect_uri !== 'string' || typeof state !== 'string' || !URL.canParse(redirect_uri)) {
        return res.status(400).send('Provide a valid redirect_uri and a single optional state value.');
    }
    const callback = new URL(redirect_uri);
    if (!['http:', 'https:'].includes(callback.protocol) &&
        !(callback.protocol === 'arcgis-pro:' && callback.hostname === 'auth')) {
        return res.status(400).send('Use an HTTP(S) callback or arcgis-pro://auth.');
    }
    callback.searchParams.set('code', 'mock_auth_code_123');
    callback.searchParams.set('state', state);
    if (callback.protocol === 'arcgis-pro:') return res.redirect(callback.href);
    const href = callback.href.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mock Authorization | Connection Lab</title><link rel="stylesheet" href="/styles.css"></head><body><main class="section"><p class="eyebrow">CONNECTION LAB / OAUTH MOCK</p><h1>A simulated sign-in.</h1><article class="panel"><h2>No account needed.</h2><p>This test page returns a fixed authorization code to the supplied callback. It does not validate client identity, scopes, registered redirects, or PKCE. Continue only if this is your intended test client.</p><pre>${href}</pre><p><a class="button primary" href="${href}">Authorize test client</a></p><a href="/#connections">Back to connection catalog</a></article></main></body></html>`);
});

appHTTPS.post('/oauth/token', (req, res) => {
    res.json({
        access_token: 'supersecrettoken123',
        token_type: 'Bearer',
        expires_in: 3600
    });
});

appHTTPS.all('/test/oauth2/cog.tif', checkBearerToken, sendCogFile);

// ----------------------------------------------------
// HTTP Server Config (Information / UI)
// ----------------------------------------------------
appHTTP.use(cookieParser());
appHTTP.use(express.json());

appHTTP.use((req, res, next) => {
    // We can avoid logging the polling requests from the logs UI itself to reduce noise
    if (req.path !== '/api/logs') {
        logRequest(req, res, false);
    }
    next();
});

appHTTP.get('/test/none/cog.tif', sendCogFile);
appHTTP.get('/test/none/status', (req, res) => res.json({ status: 'ok', message: 'No auth required' }));
appHTTP.get('/test/none/brotli/cog.tif', sendBrotliFile);

function configuration(req) {
    const hostname = req.hostname.includes(':') && !req.hostname.startsWith('[')
        ? `[${req.hostname}]` : req.hostname;
    return {
        basic: { username: 'admin', password: 'admin' },
        bearer: { token: 'supersecrettoken123' },
        oauth: {
            clientId: 'test', clientSecret: 'test', code: 'mock_auth_code_123',
            redirectUri: 'arcgis-pro://auth', expiresIn: 3600,
            mock: true
        },
        certificates: {
            ca: '/downloads/ca.crt', server: '/downloads/server.crt',
            client: '/downloads/client.crt', key: '/downloads/client.key',
            p12: '/downloads/client.p12', password: 'password',
            fingerprint256: caCertificate.fingerprint256,
            validTo: caCertificate.validTo
        },
        fixture: { bytes: cogBytes.length, brotliBytes: brotliBytes.length },
        endpoints: {
            http: process.env.PUBLIC_HTTP_URL || `http://${hostname}:${HTTP_PORT}`,
            https: process.env.PUBLIC_HTTPS_URL || `https://${hostname}:${HTTPS_PORT}`
        }
    };
}

for (const app of [appHTTP, appHTTPS]) {
    app.get('/api/logs', (req, res) => {
        res.set('Cache-Control', 'no-store').json(requestLogs);
    });
    app.get('/api/config', (req, res) => {
        res.set('Cache-Control', 'no-store').json(configuration(req));
    });
    app.get('/downloads/:name', (req, res) => {
        const allowed = ['ca.crt', 'server.crt', 'client.crt', 'client.key', 'client.p12'];
        res.set('Cache-Control', 'no-store');
        if (req.params.name === 'test.netrc') {
            res.attachment('test.netrc').type('text/plain').send(
                `machine ${new URL(configuration(req).endpoints.https).hostname.replace(/^\[|\]$/g, '')}\nlogin admin\npassword admin\n`
            );
        } else if (allowed.includes(req.params.name)) {
            res.download(path.join(certsDir, req.params.name));
        } else {
            res.status(404).send('Unknown test asset.');
        }
    });
    app.get(['/client', '/client.html'], (req, res) => res.redirect('/#client'));
    app.get('/logs', (req, res) => res.redirect('/logs.html'));
    app.use(express.static(publicDir));
}

// Start Servers
const startServers = () => {
    // Generate .netrc file if it doesn't exist
    const netrcPath = path.join(certsDir, '.netrc');
    if (!fs.existsSync(netrcPath)) {
        fs.writeFileSync(netrcPath, 'machine localhost\nlogin admin\npassword admin\n');
        console.log(`Generated .netrc file at ${netrcPath}`);
    }

    // HTTP
    http.createServer(appHTTP).listen(HTTP_PORT, () => {
        console.log(`[HTTP] Information server running on http://localhost:${HTTP_PORT}`);
    });

    // HTTPS
    if (fs.existsSync(path.join(certsDir, 'server.key')) && fs.existsSync(path.join(certsDir, 'server.crt'))) {
        const httpsOptions = {
            key: fs.readFileSync(path.join(certsDir, 'server.key')),
            cert: fs.readFileSync(path.join(certsDir, 'server.crt')),
            ca: fs.readFileSync(path.join(certsDir, 'ca.crt')), 
            requestCert: true, 
            rejectUnauthorized: false 
        };

        https.createServer(httpsOptions, appHTTPS).listen(HTTPS_PORT, () => {
            console.log(`[HTTPS] Auth Testing server running on https://localhost:${HTTPS_PORT}`);
        });
    } else {
        console.error('Certificates not found. Please run generate-certs.js first.');
    }
};

startServers();
