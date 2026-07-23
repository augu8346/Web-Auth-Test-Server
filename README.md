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
