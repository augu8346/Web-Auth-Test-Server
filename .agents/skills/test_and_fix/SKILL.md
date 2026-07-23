---
name: Test and Fix Server
description: Runs a suite of test requests against the auth server and autonomously fixes any broken endpoints in server.js.
---

# Test and Fix Server Skill

When the user asks you to verify or "test and fix" the server, follow these steps:

1. **Test the endpoints**: Use the `run_command` tool to execute `node test-client.js` in the project root. This script is already configured to test all endpoints including Basic, Bearer, None, Netrc, mTLS, and a full OAuth2 POST-to-GET flow.
   *(Note: Make sure the server is actually running locally or in Docker before you run the test script).*
2. **Analyze Results**: If all tests return HTTP 200 or 206, report to the user that the server is perfectly healthy.
3. **Debug and Fix**: If any endpoint returns a 401, 403, 500, or fails entirely:
   - Read the contents of `server.js` using `view_file`.
   - Identify the bug in the authentication middleware or endpoint routing.
   - Use your file editing tools to fix `server.js`.
   - Ensure the server is restarted with the new code, and re-run your test script to verify your fix.
4. Stop only when all endpoints pass successfully.
