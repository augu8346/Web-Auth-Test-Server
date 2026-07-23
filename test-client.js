process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');
const fs = require('fs');

async function check(name, testPath, headers, optionsExt = {}) {
    return new Promise((resolve) => {
        const options = { headers, ...optionsExt };
        https.get('https://localhost:9443/test/' + testPath, options, (res) => {
            console.log(name + ' Status:', res.statusCode);
            resolve(res.statusCode);
        }).on('error', (e) => {
            console.log(name + ' Error:', e.message);
            resolve(500);
        });
    });
}

async function testOauth2() {
    console.log('\n--- Testing OAuth2 ---');
    
    const testClientCredentials = new Promise((resolve) => {
        const postData = 'grant_type=client_credentials&client_id=test&client_secret=test';
        const req = https.request('https://localhost:9443/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    console.log('Failed to get token (Client Credentials). Status:', res.statusCode);
                    return resolve(res.statusCode);
                }
                const token = JSON.parse(data).access_token;
                console.log('Got token (Client Credentials):', token);
                
                https.get('https://localhost:9443/test/oauth2/cog.tif', {
                    headers: { 'Authorization': 'Bearer ' + token }
                }, (res2) => {
                    console.log('OAuth2 File Access Status (Client Credentials):', res2.statusCode);
                    resolve(res2.statusCode);
                });
            });
        });
        req.on('error', (e) => {
            console.log('OAuth2 Error (Client Credentials):', e.message);
            resolve(500);
        });
        req.write(postData);
        req.end();
    });

    const testAuthCodePkce = new Promise((resolve) => {
        const postData = 'grant_type=authorization_code&code=mock_auth_code_123&client_id=test&code_verifier=mock_code_verifier';
        const req = https.request('https://localhost:9443/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    console.log('Failed to get token (Auth Code w/ PKCE). Status:', res.statusCode);
                    return resolve(res.statusCode);
                }
                const token = JSON.parse(data).access_token;
                console.log('Got token (Auth Code w/ PKCE):', token);
                
                https.get('https://localhost:9443/test/oauth2/cog.tif', {
                    headers: { 'Authorization': 'Bearer ' + token }
                }, (res2) => {
                    console.log('OAuth2 File Access Status (Auth Code w/ PKCE):', res2.statusCode);
                    resolve(res2.statusCode);
                });
            });
        });
        req.on('error', (e) => {
            console.log('OAuth2 Error (Auth Code w/ PKCE):', e.message);
            resolve(500);
        });
        req.write(postData);
        req.end();
    });

    const code1 = await testClientCredentials;
    const code2 = await testAuthCodePkce;
    return (code1 === 200 && code2 === 200) ? 200 : 500;
}

async function run() {
    let success = true;
    console.log('--- Testing Standard Endpoints ---');
    
    let code = await check('None Auth', 'none/cog.tif', { 'Range': 'bytes=0-10' });
    if (code !== 200 && code !== 206) success = false;
    
    code = await check('Basic Auth', 'basic/cog.tif', { 'Authorization': 'Basic ' + Buffer.from('admin:admin').toString('base64') });
    if (code !== 200) success = false;
    
    let netrcAuth = 'Basic ' + Buffer.from('admin:admin').toString('base64');
    try {
        const netrcContent = fs.readFileSync('certs/.netrc', 'utf8');
        const matchLogin = netrcContent.match(/login\s+(\S+)/);
        const matchPassword = netrcContent.match(/password\s+(\S+)/);
        if (matchLogin && matchPassword) {
            netrcAuth = 'Basic ' + Buffer.from(`${matchLogin[1]}:${matchPassword[1]}`).toString('base64');
        }
    } catch (e) {
        console.log('Could not read .netrc for test, using default credentials');
    }
    code = await check('Netrc Auth', 'netrc/cog.tif', { 'Authorization': netrcAuth });
    if (code !== 200) success = false;
    
    code = await check('Bearer Auth', 'bearer/cog.tif', { 'Authorization': 'Bearer supersecrettoken123' });
    if (code !== 200) success = false;

    console.log('\n--- Testing mTLS Endpoints ---');
    const mtlsOpts = {
        key: fs.readFileSync('certs/client.key'),
        cert: fs.readFileSync('certs/client.crt')
    };
    
    code = await check('mTLS (Legacy)', 'mtls/cog.tif', {}, mtlsOpts);
    if (code !== 200) success = false;
    
    code = await check('mTLS (PKI Alias)', 'mtls-pki/cog.tif', {}, mtlsOpts);
    if (code !== 200) success = false;
    
    code = await check('mTLS (PKCS12 Alias)', 'mtls-pkcs12/cog.tif', {}, mtlsOpts);
    if (code !== 200) success = false;

    const oauthCode = await testOauth2();
    if (oauthCode !== 200) success = false;

    if (success) {
        console.log('\n✅ All tests passed! The server is perfectly healthy.');
    } else {
        console.log('\n❌ Some tests failed.');
    }
}

run();
