const os = require('os');
const path = require('path');

const defaultConfig = {
  apiHost: '127.0.0.1',
  apiPort: Number(process.env.VEIL_API_PORT || 8999),
  proxyHost: '127.0.0.1',
  proxyPort: Number(process.env.VEIL_PROXY_PORT || 8080),
  historyLimit: 500,
  maxBodyBytes: 10 * 1024 * 1024,
  intercept: {
    requests: false,
    responses: false,
    rules: [],
  },
  scope: {
    enabled: false,
    rules: [],
  },
  https: {
    intercept: true,
    interceptPorts: [443],
    certDir: process.env.VEIL_CERT_DIR || path.join(os.tmpdir(), 'veil-proxy-certs'),
    ignoreUpstreamCertificateErrors: true,
  },
  mcp: {
    enabled: process.env.VEIL_MCP_ENABLED === '1',
    host: '127.0.0.1',
    port: Number(process.env.VEIL_MCP_PORT || 8765),
    token: process.env.VEIL_MCP_TOKEN || '',
    requireScope: false,
    activeTesting: false,
    anonymization: {
      profile: 'balanced',
      aggressivePathRedaction: false,
      redactHosts: true,
      redactCookieNames: true,
      redactCookieValues: true,
      redactAuthorization: true,
      redactPlatformHeaders: false,
      maxBodyChars: 256 * 1024,
    },
  },
  upstream: {
    mode: 'direct',
    host: '',
    port: 0,
    username: '',
    password: '',
  },
  upstreams: [],
  upstreamRules: [],
  rewriteRules: [],
};

module.exports = {
  defaultConfig,
};
