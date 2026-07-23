process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const https = require('https');
const fs = require('fs');

async function testMtls() {
    console.log('--- Testing mTLS ---');
    return new Promise((resolve) => {
        const options = {
            key: fs.readFileSync('certs/client.key'),
            cert: fs.readFileSync('certs/client.crt')
        };
        https.get('https://localhost:9443/test/mtls/cog.tif', options, (res) => {
            console.log('mTLS Status:', res.statusCode);
            resolve(res.statusCode);
        }).on('error', (e) => {
            console.log('mTLS Error:', e.message);
            resolve(500);
        });
    });
}

async function testOauth2() {
    console.log('\n--- Testing OAuth2 ---');
    return new Promise((resolve) => {
        // 1. Get Token
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
                    console.log('Failed to get token. Status:', res.statusCode);
                    return resolve(res.statusCode);
                }
                const token = JSON.parse(data).access_token;
                console.log('Got token:', token);
                
                // 2. Use Token
                https.get('https://localhost:9443/test/oauth2/cog.tif', {
                    headers: { 'Authorization': 'Bearer ' + token }
                }, (res2) => {
                    console.log('OAuth2 File Access Status:', res2.statusCode);
                    resolve(res2.statusCode);
                });
            });
        });
        req.on('error', (e) => {
            console.log('OAuth2 Error:', e.message);
            resolve(500);
        });
        req.write(postData);
        req.end();
    });
}

async function run() {
    let success = true;
    const mtlsCode = await testMtls();
    if (mtlsCode !== 200 && mtlsCode !== 206) success = false;
    
    const oauthCode = await testOauth2();
    if (oauthCode !== 200 && oauthCode !== 206) success = false;

    if (success) {
        console.log('\n✅ mTLS and OAuth2 tests passed!');
    } else {
        console.log('\n❌ Extra tests failed.');
    }
}
run();
