# Web Auth Test Server

A mock REST server built to test various HTTP authentication workflows (like Basic Auth, Bearer tokens, Mutual TLS, and OAuth 2.0). 
It is specifically designed with features like proper HTTP Range request support to be compatible with tools like `GDAL` and `ArcObjects`.

## Quickstart

### Using Docker (Recommended)
This project is fully containerized. To spin it up, just run:
```bash
docker-compose up --build
```
This will automatically generate all necessary certificates and bake the sample `cog.tif` data right into the container!

### Local Node.js
If you prefer to run it locally without Docker:
1. Install dependencies: `npm install`
2. Generate Certificates: `npm run generate-certs` (creates Root CA, Server Cert, and Client `.p12` in the `certs/` folder)
3. Start the server: `npm start`

## How it works

Once started, two servers will be running:

1. **HTTP Information Server (Port 9480)**
   - Open **`http://localhost:9480`** in your browser to see the instructions, built-in interactive test client, and live request logs.
   - The **Test Client** lets you manually trigger requests to the HTTPS server and inspect the response.
   - The **Live Logs** are great for debugging your external clients (GDAL, ArcObjects) by seeing exactly what headers, cookies, and parameters they send without tailing a giant log file.

2. **HTTPS Auth Testing Server (Port 9443)**
   - This is the secured server your clients will target.
   - Endpoints include:
     - `/test/none/cog.tif`
     - `/test/basic/cog.tif`
     - `/test/bearer/cog.tif`
     - `/test/mtls/cog.tif`
   - OAuth endpoints:
     - `/oauth/authorize`
     - `/oauth/token`
     - `/test/oauth2/cog.tif`

## Testing with GDAL

When testing GDAL against this server, you will need to configure GDAL to pass the appropriate client certificates for mTLS. Due to strict trust validation in some GDAL builds on Windows, the recommended approach for testing is to use `GDAL_HTTP_UNSAFESSL='YES'`.

### Netrc Example

Run the following in PowerShell (adjust the paths to where your repository is cloned). GDAL can use a `.netrc` file to automatically provide Basic Auth credentials to matching hosts:

```powershell
$ENV:GDAL_HTTP_NETRC_FILE='D:/git/Web-Auth-Test-Server/certs/.netrc'
$ENV:GDAL_HTTP_UNSAFESSL='YES'

gdalinfo /vsicurl/https://localhost:9443/test/netrc/cog.tif
```

**Expected Output:**
```text
Driver: GTiff/GeoTIFF
Files: /vsicurl/https://localhost:9443/test/netrc/cog.tif
Size is 512, 512
...
```

### mTLS Example (Recommended)

Run the following in PowerShell (adjust the paths to where your repository is cloned). Using `GDAL_HTTP_UNSAFESSL` allows you to test the client certificate handshake without wrestling with local root certificate stores:

```powershell
$ENV:GDAL_ADDITIONAL_CA_PATH='D:/git/Web-Auth-Test-Server/certs'
$ENV:GDAL_HTTP_SSLCERTTYPE='PEM'
$ENV:GDAL_HTTP_SSLCERT='D:/git/Web-Auth-Test-Server/certs/client.crt'
$ENV:GDAL_HTTP_SSLKEY='D:/git/Web-Auth-Test-Server/certs/client.key'
gdalinfo /vsicurl/https://localhost:9443/test/mtls-pki/cog.tif

gdalinfo /vsicurl/https://localhost:9443/test/mtls-pki/cog.tif
```

**Expected Output:**
```text
Driver: GTiff/GeoTIFF
Files: /vsicurl/https://localhost:9443/test/mtls-pki/cog.tif
Size is 512, 512
...
```

### Alternative: Windows Trusted Root Store

If you prefer *not* to use `GDAL_HTTP_UNSAFESSL='YES'`, you can forcefully trust the Mock CA by installing it into your Windows Trusted Root Certificate Authorities. 

*Note: Because Docker automatically generates fresh certificates every time the container is built/started, you will need to redo this process and import the new `ca.crt` every time the certificates change.*

```powershell
Import-Certificate -FilePath "D:/git/Web-Auth-Test-Server/certs/ca.crt" -CertStoreLocation Cert:\CurrentUser\Root
```
Once installed, you can drop `$ENV:GDAL_HTTP_UNSAFESSL='YES'` and the `gdalinfo` command will pass natively.
