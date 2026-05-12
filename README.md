# Veil Proxy

Veil Proxy is a desktop intercepting web proxy prototype inspired by Burp Suite.

## What Works

- Plaintext HTTP interception and history.
- Request editing before forwarding.
- Response editing before returning to the client.
- CONNECT tunneling for HTTPS and other TCP-over-proxy traffic.
- Upstream routing through direct, HTTP proxy, or SOCKS5 proxy modes.
- Electron desktop app with an embedded local backend.
- Optional web UI served by the same backend for development.

HTTPS CONNECT traffic is tunnelled in this MVP. Full HTTPS MITM needs a generated local CA, per-host certificates, and trust-store installation.

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

## Environment

```sh
VEIL_PROXY_PORT=8081 VEIL_API_PORT=9000 npm run server
```

## Test

```sh
npm test
```
