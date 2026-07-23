---
name: Test and Fix Server
description: Runs a suite of test requests against the auth server and autonomously fixes any broken endpoints in server.js.
---

# Test and Fix Server Skill

When the user asks you to verify or "test and fix" the server, follow these steps:

1. **Test the endpoints**: Write and execute a temporary Node.js script using the `run_command` tool that attempts to hit all the authentication endpoints (Basic, Bearer, None) on `https://localhost:9443` using the correct credentials. 
   *(Note: Remember to use `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';` in your Node.js test script to bypass the self-signed cert warning).*
2. **Analyze Results**: If all tests return HTTP 200 or 206, report to the user that the server is perfectly healthy.
3. **Debug and Fix**: If any endpoint returns a 401, 403, 500, or fails entirely:
   - Read the contents of `server.js` using `view_file`.
   - Identify the bug in the authentication middleware or endpoint routing.
   - Use your file editing tools to fix `server.js`.
   - Ensure the server is restarted with the new code, and re-run your test script to verify your fix.
4. Stop only when all endpoints pass successfully.
