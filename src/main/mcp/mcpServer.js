const crypto = require('crypto');
const http = require('http');
const { AliasVault, HttpAnonymizer } = require('./anonymizer');
const { McpTools } = require('./mcpTools');
const { SecretVault } = require('./secretVault');

const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

class McpServer {
  constructor({ proxy, configProvider }) {
    this.proxy = proxy;
    this.configProvider = configProvider || (() => proxy.getConfig());
    this.aliasVault = new AliasVault();
    this.secretVault = new SecretVault();
    this.anonymizer = new HttpAnonymizer(this.aliasVault);
    this.tools = new McpTools({
      proxy,
      anonymizer: this.anonymizer,
      aliasVault: this.aliasVault,
      secretVault: this.secretVault,
      configProvider: this.configProvider,
    });
    this.server = null;
    this.port = 0;
    this.host = '127.0.0.1';
    this.token = '';
    this.lastError = '';
    this.sessionId = crypto.randomUUID();
  }

  async start() {
    const config = this.mcpConfig();
    this.host = normalizeLoopbackHost(config.host || '127.0.0.1');
    this.token = config.token || this.token || generateToken();
    if (config.enabled !== true) {
      this.lastError = '';
      return this.state();
    }
    if (this.server) {
      return this.state();
    }

    const server = http.createServer(this.handleRequest.bind(this));
    try {
      await listen(server, Number(config.port || 8765), this.host);
      this.server = server;
      this.port = server.address().port;
      this.lastError = '';
    } catch (error) {
      this.lastError = error.message;
      await close(server);
    }
    return this.state();
  }

  async stop() {
    const server = this.server;
    this.server = null;
    this.port = 0;
    if (server) {
      await close(server);
    }
  }

  setUiStateAccess(access = {}) {
    this.tools.setUiStateAccess(access);
  }

  async reconfigure() {
    const wasRunning = Boolean(this.server);
    await this.stop();
    if (wasRunning || this.mcpConfig().enabled === true) {
      await this.start();
    }
    return this.state();
  }

  mcpConfig() {
    return (this.configProvider() || {}).mcp || {};
  }

  endpoint() {
    return this.server ? `http://${this.host}:${this.port}/mcp` : '';
  }

  state() {
    const config = this.mcpConfig();
    return {
      enabled: config.enabled === true,
      running: Boolean(this.server),
      endpoint: this.endpoint(),
      health: this.server ? `http://${this.host}:${this.port}/health` : '',
      host: this.host,
      port: this.port || Number(config.port || 8765),
      token: this.token,
      requireScope: config.requireScope === true,
      activeTesting: config.activeTesting === true,
      lastError: this.lastError,
      aliasMappings: this.aliasVault.mappingCount(),
      secretCount: this.secretVault.count(),
    };
  }

  async handleRequest(req, res) {
    const remote = req.socket.remoteAddress || '';
    if (!isLoopbackAddress(remote)) {
      sendJson(res, 403, { error: 'loopback_only' });
      return;
    }

    const parsed = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    if (parsed.pathname === '/health' && req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        name: 'veil-proxy-mcp',
        endpoint: this.endpoint(),
        activeTesting: this.mcpConfig().activeTesting === true,
      });
      return;
    }

    if (parsed.pathname !== '/mcp') {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
      return;
    }
    if (!this.authorized(req)) {
      sendJson(res, 401, { error: 'missing_or_invalid_token' });
      return;
    }
    if (!originAllowed(req.headers.origin)) {
      sendJson(res, 403, { error: 'origin_not_allowed' });
      return;
    }

    try {
      const body = await readJson(req, 20 * 1024 * 1024);
      if (Array.isArray(body)) {
        sendJson(res, 400, jsonRpcError(null, -32600, 'Batch requests are not supported'));
        return;
      }
      const response = await this.handleJsonRpc(body || {});
      if (!response) {
        res.writeHead(202, { 'cache-control': 'no-store' });
        res.end();
        return;
      }
      sendJson(res, 200, response, { 'Mcp-Session-Id': this.sessionId });
    } catch (error) {
      sendJson(res, 200, jsonRpcError(null, -32603, error.message || 'Internal error'));
    }
  }

  authorized(req) {
    const authorization = req.headers.authorization;
    if (authorization === `Bearer ${this.token}`) {
      return true;
    }
    return req.headers['x-veil-token'] === this.token;
  }

  async handleJsonRpc(request) {
    const id = Object.prototype.hasOwnProperty.call(request, 'id') ? request.id : null;
    const method = String(request.method || '');
    if (!method) {
      return jsonRpcError(id, -32600, 'Missing method');
    }
    if (!Object.prototype.hasOwnProperty.call(request, 'id') && method.startsWith('notifications/')) {
      return null;
    }
    switch (method) {
      case 'initialize':
        return jsonRpcResult(id, this.initializeResult(request.params || {}));
      case 'ping':
        return jsonRpcResult(id, {});
      case 'tools/list':
        return jsonRpcResult(id, { tools: this.tools.listTools() });
      case 'tools/call':
        return jsonRpcResult(id, await this.callTool(request.params || {}));
      default:
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }
  }

  initializeResult(params) {
    const requested = String(params.protocolVersion || DEFAULT_PROTOCOL_VERSION);
    const supported = [DEFAULT_PROTOCOL_VERSION, '2024-11-05'];
    return {
      protocolVersion: supported.includes(requested) ? requested : DEFAULT_PROTOCOL_VERSION,
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: 'veil-proxy-mcp',
        version: '0.1.0',
      },
    };
  }

  async callTool(params) {
    const name = String(params.name || '');
    if (!name) {
      throw new Error('Missing tool name');
    }
    return await this.tools.call(name, params.arguments || {});
  }
}

function jsonRpcResult(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  };
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': body.length,
    ...extraHeaders,
  });
  res.end(body);
}

function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    req.on('data', (chunk) => {
      length += chunk.length;
      if (length > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(new Error(`Invalid JSON: ${error.message}`));
      }
    });
    req.on('error', reject);
  });
}

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function normalizeLoopbackHost(host) {
  const value = String(host || '127.0.0.1').trim();
  return value === 'localhost' || value === '::1' ? value : '127.0.0.1';
}

function isLoopbackAddress(address) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
}

function originAllowed(origin) {
  if (!origin || origin === 'null') {
    return true;
  }
  const lower = String(origin).toLowerCase();
  return (
    lower.startsWith('http://127.0.0.1:') ||
    lower.startsWith('http://localhost:') ||
    lower.startsWith('https://127.0.0.1:') ||
    lower.startsWith('https://localhost:')
  );
}

function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}

module.exports = {
  DEFAULT_PROTOCOL_VERSION,
  McpServer,
  generateToken,
};
