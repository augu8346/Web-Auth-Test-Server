const forge = require('node-forge');
const fs = require('fs');
const path = require('path');

const certsDir = path.join(__dirname, 'certs');
if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir);
}

function generateKeyPair() {
    return forge.pki.rsa.generateKeyPair(2048);
}

function createCert(keys, subject, issuer, isCA, caKey) {
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(19));
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10); // 10 years
    
    cert.setSubject(subject);
    cert.setIssuer(issuer);

    const extensions = [
        {
            name: 'basicConstraints',
            cA: isCA
        },
        {
            name: 'keyUsage',
            keyCertSign: isCA,
            digitalSignature: true,
            nonRepudiation: true,
            keyEncipherment: true,
            dataEncipherment: true
        }
    ];

    if (!isCA) {
        extensions.push({
            name: 'extKeyUsage',
            serverAuth: true,
            clientAuth: true
        });
        extensions.push({
            name: 'subjectAltName',
            altNames: [{
                type: 2, // dNSName
                value: 'localhost'
            }, {
                type: 7, // iPAddress
                ip: '127.0.0.1'
            }]
        });
    }

    cert.setExtensions(extensions);

    // Self-sign if CA, else sign with CA key
    cert.sign(caKey || keys.privateKey, forge.md.sha256.create());

    return cert;
}

console.log('Generating Root CA...');
const caKeys = generateKeyPair();
const caSubject = [{ name: 'commonName', value: 'Mock Auth Testing CA' }];
const caCert = createCert(caKeys, caSubject, caSubject, true, null);
fs.writeFileSync(path.join(certsDir, 'ca.crt'), forge.pki.certificateToPem(caCert));
fs.writeFileSync(path.join(certsDir, 'ca.key'), forge.pki.privateKeyToPem(caKeys.privateKey));

console.log('Generating Server Certificate...');
const serverKeys = generateKeyPair();
const serverSubject = [{ name: 'commonName', value: 'localhost' }];
const serverCert = createCert(serverKeys, serverSubject, caSubject, false, caKeys.privateKey);
fs.writeFileSync(path.join(certsDir, 'server.crt'), forge.pki.certificateToPem(serverCert));
fs.writeFileSync(path.join(certsDir, 'server.key'), forge.pki.privateKeyToPem(serverKeys.privateKey));

console.log('Generating Client Certificate...');
const clientKeys = generateKeyPair();
const clientSubject = [{ name: 'commonName', value: 'test-client' }];
const clientCert = createCert(clientKeys, clientSubject, caSubject, false, caKeys.privateKey);
fs.writeFileSync(path.join(certsDir, 'client.crt'), forge.pki.certificateToPem(clientCert));
fs.writeFileSync(path.join(certsDir, 'client.key'), forge.pki.privateKeyToPem(clientKeys.privateKey));

console.log('Generating Client PKCS#12 (.p12)...');
const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    clientKeys.privateKey, [clientCert], 'password',
    { generateLocalKeyId: true, friendlyName: 'test-client' }
);
const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
fs.writeFileSync(path.join(certsDir, 'client.p12'), p12Der, { encoding: 'binary' });

console.log('Certificates generated successfully in ./certs');
