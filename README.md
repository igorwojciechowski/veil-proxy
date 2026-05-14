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
- `run_payload_attack` for Intruder-like sequential payload attacks against query, body, cookie, header, path, or raw body insertion points. Payload attack results include anonymized summaries, reflection/security-signal flags, and limited anonymized details.
- `send_proxy_item_to_echo` and `send_random_proxy_item_to_echo` for copying captured requests into local Echo tabs or groups without returning raw traffic through MCP.
- `report_proxy_item_issue`, `report_sent_traffic_issue`, and `report_modified_proxy_item_issue` for creating local Veil Proxy findings from captured or MCP-sent evidence.
- `list_reported_findings` for reviewing anonymized summaries of MCP-reported findings.

## Environment

```sh
VEIL_PROXY_PORT=8081 VEIL_API_PORT=9000 npm run server
```

## Test

```sh
npm test
```
