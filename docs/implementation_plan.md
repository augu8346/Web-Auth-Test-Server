# Mock Auth Testing Server (Updated)

This project will set up a mock REST server designed to test various HTTP authentication workflows (GDAL, ArcObjects). The server will serve an actual COG file, properly handle HTTP Range requests, and provide a self-describing information page, along with built-in client testing and log viewing UIs.

## User Review Required

> [!IMPORTANT]  
> I have updated the plan based on your latest feedback: 
> 1. The `cog.tif` will be copied into the project and Docker image to ensure absolute portability.
> 2. A **Client Testing UI** will be built so your colleagues can manually trigger and learn about the different auth flows directly from the browser.
> 3. A **Live Logs UI** will be added to view the recent requests (headers, cookies, parameters) in real-time, keeping only a small recent history in memory to avoid bloat.
> 
> If you approve of this final plan, please reply with **Proceed** or use **`/goal`** to let me build this out completely autonomously!

## Proposed Changes

We will create the project at `D:\git\Web-Auth-Test-Server` and initialize Git.

### 1. Technology Stack & Ports
- **Stack**: Node.js with Express.
- **HTTP Server (Port 9480)**: Unsecured. Acts as the "Self-Describing" server. Contains instructions, the client testing UI, and the logs viewer.
- **HTTPS Server (Port 9443)**: Secured with self-signed certs and configured for Mutual TLS (mTLS). Hosts the actual authenticated endpoints.

### 2. Docker, Certificates & Portable Data
- **Data**: I will copy `d:\RData\cog.tif` into the project directory (`data/cog.tif`). The Dockerfile will `COPY` this file into the image, making the container completely self-sufficient and portable.
- **Docker**: A `Dockerfile` and `docker-compose.yml` will be created.
- **Certificates**: A Node.js script (`generate-certs.js`) will generate the Root CA, Server Certificate, Client Certificate, and a PKCS#12 (`.p12`) file. The server will also automatically generate a `.netrc` file for testing GDAL `.netrc` credential lookup.

### 3. Endpoints (HTTP Server - Port 9480)
- `/` - HTML Home page explaining the setup and providing default credentials.
- `/client` - **[NEW]** An interactive web UI where users can click buttons to trigger requests to the HTTPS server using the various authentication types (Basic, Bearer, Custom Headers, OAuth2 flows) and see the results.
- `/logs` - **[NEW]** A web UI that fetches and displays the recent request logs. 
- `/api/logs` - Returns a JSON array of the last 50 requests hitting the HTTPS server. Logs are kept in-memory to prevent bloat.
- `/api/config` - JSON payload of default test credentials.

### 4. Endpoints (HTTPS Auth Server - Port 9443)
- `/test/none/cog.tif` - Unauthenticated access (tests custom headers/cookies).
- `/test/basic/cog.tif` - Requires Basic Auth.
- `/test/netrc/cog.tif` - **[NEW]** Requires Basic Auth (tests `.netrc` file parsing in clients).
- `/test/bearer/cog.tif` - Requires a valid Bearer token.
- `/test/mtls/cog.tif` - Requires a valid Client Certificate.
- `/oauth/authorize` - OAuth2 Authorization endpoint.
- `/oauth/token` - OAuth2 Token endpoint.
- `/test/oauth2/cog.tif` - Requires the Bearer token issued by `/oauth/token`.

## Verification Plan

### Automated Tests
- I will verify the certificate generation script works.
- I will write a simple `test_server.js` script to verify endpoints.

### Manual Verification
- You can run `docker-compose up --build`.
- Open `http://localhost:9480/client` to use the built-in testing page.
- Open `http://localhost:9480/logs` to watch the requests come in as you run your `GDALOpen` or ArcObjects tests against `https://localhost:9443`.
