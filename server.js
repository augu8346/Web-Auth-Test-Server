const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');

// Ports
const HTTP_PORT = process.env.HTTP_PORT || 9480;
const HTTPS_PORT = process.env.HTTPS_PORT || 9443;

// Paths
const dataDir = path.join(__dirname, 'data');
const certsDir = path.join(__dirname, 'certs');
const publicDir = path.join(__dirname, 'public');

// Data File
const cogFile = path.join(dataDir, 'cog.tif');

// Servers
const appHTTP = express();
const appHTTPS = express();

// Global Request Log
const MAX_LOGS = 50;
const requestLogs = [];

function logRequest(req, isHttps) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.originalUrl || req.url,
        protocol: isHttps ? 'https' : 'http',
        headers: req.headers,
        query: req.query,
        cookies: req.cookies || {},
        ip: req.ip || req.connection.remoteAddress
    };

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
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range, X-Custom-Header');
    res.header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
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
    logRequest(req, true);
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
    const { client_id, redirect_uri, response_type, state } = req.query;
    if (redirect_uri && redirect_uri.startsWith('arcgis-pro://auth')) {
        return res.redirect(`${redirect_uri}?code=mock_auth_code_123&state=${state || ''}`);
    }
    res.send(`<html><body><h2>Simulated OAuth Login</h2><a href="${redirect_uri}?code=mock_auth_code_123&state=${state || ''}">Authorize</a></body></html>`);
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
    if (req.originalUrl !== '/api/logs') {
        logRequest(req, false);
    }
    next();
});

// Serve UI pages
appHTTP.use(express.static(publicDir));

appHTTP.get('/api/logs', (req, res) => {
    res.json(requestLogs);
});

appHTTP.get('/api/config', (req, res) => {
    res.json({
        basic: { username: 'admin', password: 'admin' },
        bearer: { token: 'supersecrettoken123' },
        endpoints: {
            http: `http://localhost:${HTTP_PORT}`,
            https: `https://localhost:${HTTPS_PORT}`
        }
    });
});

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
