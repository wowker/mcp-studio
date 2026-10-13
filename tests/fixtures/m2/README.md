# M2 controlled fixture

`startM2Fixture({allowedOrigin, tls?, publicHostname?})` returns `{origin, oauthOrigin, stats, close}`. Bind address is always 127.0.0.1 with an ephemeral port. `publicHostname` advertises `127.0.0.1` (default) or `localhost`; HTTPS browser OAuth tests use `localhost` while the platform uses `127.0.0.1`, isolating cookies on popup navigation. All credential material is synthetic and ephemeral. `stats` and GET `/stats` expose numeric counters only, never bodies, headers, codes, verifiers or tokens.

- `/mcp`: actual Streamable HTTP initialize/initialized handshake.
- `/sse`, `/messages?session=…`: explicit SSE initialize/initialized handshake.
- `/token-mcp`: requires the synthetic `fixture-token` authorization header.
- `/oauth-mcp`: 401 resource metadata challenge with `read` scope.
- `/oauth-deny-mcp`: 401 own-resource metadata challenge with `deny` scope. `/authorize` emits a real access_denied callback.
- `/authorize`, `/token`: public client code flow, exact redirect, S256 verifier, resource/client binding, single-use code. `/token` rejects refresh grants.
- `/failure`, `/slow-mcp`, `/cors-denied`, `/metadata-malicious`: controlled failure/timeout/browser-policy/discovery fixtures.

Use HTTPS `tls` for production browser OAuth tests. Plain HTTP is for Node or explicitly configured development fixture-only OAuth tests. Temporary certificates belong in OS temporary directories; no certificate/private key is committed. CORS authorizes only the requested workbench origin and never allows browser credentials.

Run `node --test tests/fixtures/m2/fixture.test.mjs` with loopback listen permission. The fixture covers real SDK handshakes, OAuth PKCE/resource/replay and genuine authorization denial. It does not execute Tools and is not a platform MCP proxy. Public HTTPS local-network permission, arbitrary third-party providers and the OS Agent remain outside this fixture's evidence.
