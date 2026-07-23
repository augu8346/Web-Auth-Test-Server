---
name: Auth Debugger
description: Analyzes the server logs to determine why an external client's authentication request failed.
---

# Auth Debugger Skill

When the user asks you to debug why a recent request failed (e.g., "Why did my ArcObjects script fail to authenticate?"), follow these steps:

1. Use the `run_command` tool to fetch the recent logs from the local information server.
   Command: `Invoke-RestMethod -Uri http://localhost:9480/api/logs`
2. Analyze the JSON response, specifically looking at the most recent requests.
3. Compare the headers and cookies sent by the client against the expected credentials for the endpoint they hit:
   - `/test/basic/cog.tif`: Expects `Authorization: Basic YWRtaW46YWRtaW4=`
   - `/test/bearer/cog.tif`: Expects `Authorization: Bearer supersecrettoken123`
   - `/test/mtls/cog.tif`: Expects a valid client certificate.
4. Identify exactly what the client did wrong (e.g., missing header, incorrect encoding, wrong endpoint) and provide a clear, actionable explanation to the user.
