# Veil Proxy

Veil Proxy is a desktop intercepting web proxy prototype inspired by Burp Suite.

## What Works

- Plaintext HTTP interception and history.
- Request editing before forwarding.
- Response editing before returning to the client.
- CONNECT tunneling for HTTPS and other TCP-over-proxy traffic.
- HTTPS MITM inspection with a downloadable local CA certificate.
- Upstream routing through direct, HTTP proxy, or SOCKS5 proxy modes.
- MCP server for LLM tools with anonymized request/response access and local secret aliases.
- Payload attack run history for MCP-driven Intruder-style testing.
- Electron desktop app with an embedded local backend.
- Optional web UI served by the same backend for development.

## Run The Desktop App

```sh
npm install
npm start
```

Configure your browser or tool to use:

```text
HTTP proxy: 127.0.0.1
Port: 8080
```

## Package A Local macOS App

```sh
npm run package:mac
```

The app bundle is created at `dist/mac-arm64/Veil Proxy.app`.

## Optional Web Mode

```sh
npm run server
```

Open `http://127.0.0.1:8999`.

## MCP

Enable MCP in `Settings -> MCP`, or start web mode with:

```sh
VEIL_MCP_ENABLED=1 VEIL_MCP_PORT=8765 VEIL_MCP_TOKEN=change-me npm run server
```

The MCP endpoint is `http://127.0.0.1:<port>/mcp` and requires:

```text
Authorization: Bearer <token>
```

MCP tools return anonymized traffic only. Real hosts, cookies, authorization values, detected secrets, emails, IPs, and operator-provided secret values are replaced before any MCP response is built. Secret values are stored locally in memory; MCP exposes only aliases such as `$secret:AUTH_TOKEN:...`, and active MCP requests resolve those aliases locally before sending.

When `Active testing` is enabled in MCP settings, Veil Proxy also exposes active tools:

- `send_modified_proxy_item` for one-off modified requests.
- `run_payload_attack` for Intruder-like payload attacks against query, body, cookie, header, path, or raw body insertion points, with optional bounded concurrency. Payload attack results include anonymized summaries, reflection/security-signal flags, and limited anonymized details.
- `list_payload_attack_runs`, `get_payload_attack_run`, and `report_payload_attack_issue` for reviewing attack runs and creating local findings from specific payload results without returning raw traffic.
- `register_controlled_payload` and `clear_controlled_payloads` for operator-controlled canary/payload evidence. Reflections are returned as sanitized evidence snippets, including URL/HTML-decoded variants.
- `send_proxy_item_to_echo` and `send_random_proxy_item_to_echo` for copying captured requests into local Echo tabs or groups without returning raw traffic through MCP.
- `report_proxy_item_issue`, `report_sent_traffic_issue`, and `report_modified_proxy_item_issue` for creating local Veil Proxy findings from captured or MCP-sent evidence.
- `list_reported_findings` for reviewing anonymized summaries of MCP-reported findings.

MCP-sent requests are stored locally in the `Sent` view and in project snapshots. The local UI can inspect raw sent request/response evidence; MCP clients only receive anonymized output through tools such as `get_sent_traffic_item`.

The `Attacks` view records `run_payload_attack` runs locally with payload counts, status-code distributions, interesting/reflected/security-signal flags, filters/sorting for run results, links to the generated `Sent` requests, and one-click finding creation from interesting payload results. Attack run history is included in project save/load snapshots.

The `MCP Log` view records local JSON-RPC exchanges with request/response payloads for operator debugging. Authorization headers are not stored in the log, and the log is never exposed through MCP tools.

The `Secrets` view lets the operator add, disable, regenerate, copy, and delete local secret aliases. Secret values stay in memory; MCP clients receive only aliases. `Settings -> Anonymization` controls the MCP redaction profile at runtime, including host/cookie/auth/platform-header redaction and body clipping.

## Environment

```sh
VEIL_PROXY_PORT=8081 VEIL_API_PORT=9000 npm run server
```

## Test

```sh
npm test
```
