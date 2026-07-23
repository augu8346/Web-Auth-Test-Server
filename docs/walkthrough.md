# Mock Auth Testing Server Complete!

The project has been successfully and autonomously built! It is completely containerized, self-describing, and ready for you and your colleagues to use for testing GDAL and ArcObjects.

## What was built

1. **Portable Docker Environment**: 
   - A `Dockerfile` and `docker-compose.yml` have been created. 
   - `D:\RData\cog.tif` was successfully copied into the project's `data/` directory so it will be bundled inside the Docker container, making the image entirely self-sufficient.

2. **Automated PKI Generation**:
   - `generate-certs.js` was written and set up to run automatically during the Docker build. It generates a Root CA, a trusted Server Cert, and a Client Certificate (`client.p12`) perfectly bundled for testing mTLS.
   - The server dynamically generates a `.netrc` file locally to support `GDAL_HTTP_NETRC_FILE` testing.

3. **Dual Express.js Servers**:
   - **HTTP Server (9480)**: Serves the Web UI, documentation, and the `/api/config` and `/api/logs` endpoints.
   - **HTTPS Server (9443)**: Serves the protected endpoints and strictly enforces the various authentication schemas (Basic, Bearer, Netrc, mTLS) before streaming the actual `cog.tif` back using native HTTP `Range` request support!

4. **Web UIs**:
   - **Home**: A beautifully styled landing page outlining the available endpoints and credentials.
   - **Test Client (`/client.html`)**: An interactive UI allowing you to manually fire requests to the secured server using any of the auth mechanisms.
   - **Live Logs (`/logs.html`)**: A real-time, auto-refreshing log viewer that displays the exact headers, cookies, and parameters sent by GDAL/ArcObjects.

## How to use it

Everything is located in **`D:\git\Web-Auth-Test-Server`**.

To start the server, you have two options:

**Option A (Docker):**
```bash
cd D:\git\Web-Auth-Test-Server
docker-compose up --build
```
*Note: Since certs are generated dynamically during the build, you can extract the `client.p12` from the container, or just run Option B to get the certs locally.*

**Option B (Local):**
```bash
cd D:\git\Web-Auth-Test-Server
npm run generate-certs
npm start
```

Once running, simply open **http://localhost:9480** in your browser to see the server in action!
