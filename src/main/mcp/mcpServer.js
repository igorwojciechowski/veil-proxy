const crypto = require('crypto');
const EventEmitter = require('events');
const http = require('http');
const { AliasVault, HttpAnonymizer } = require('./anonymizer');
const { ControlledPayloadRegistry } = require('./controlledPayloads');
const { McpTools } = require('./mcpTools');
const { SecretVault } = require('./secretVault');

const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

class McpServer extends EventEmitter {
  constructor({ proxy, configProvider }) {
    super();
    this.proxy = proxy;
    this.configProvider = configProvider || (() => proxy.getConfig());
    this.aliasVault = new AliasVault();
    this.secretVault = new SecretVault();
    this.controlledPayloads = new ControlledPayloadRegistry();
    this.anonymizer = new HttpAnonymizer(this.aliasVault, this.controlledPayloads);
    this.tools = new McpTools({
      proxy,
      anonymizer: this.anonymizer,
      aliasVault: this.aliasVault,
      secretVault: this.secretVault,
      controlledPayloads: this.controlledPayloads,
      configProvider: this.configProvider,
    });
    this.server = null;
    this.port = 0;
    this.host = '127.0.0.1';
    this.token = '';
    this.lastError = '';
    this.sessionId = crypto.randomUUID();
    this.exchanges = [];
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
      await listen(server, config.port == null ? 8765 : Number(config.port), this.host);
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
      port: this.port || (config.port == null ? 8765 : Number(config.port)),
      token: this.token,
      requireScope: config.requireScope === true,
      activeTesting: config.activeTesting === true,
      lastError: this.lastError,
      aliasMappings: this.aliasVault.mappingCount(),
      secretCount: this.secretVault.count(),
      controlledPayloadCount: this.controlledPayloads.count(),
      exchangeCount: this.exchanges.length,
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

    const startedAt = Date.now();
    let body = null;
    try {
      body = await readJson(req, 20 * 1024 * 1024);
      if (Array.isArray(body)) {
        const response = jsonRpcError(null, -32600, 'Batch requests are not supported');
        this.recordExchange({ request: body, response, status: 400, startedAt, completedAt: Date.now() });
        sendJson(res, 400, response);
        return;
      }
      const response = await this.handleJsonRpc(body || {});
      if (!response) {
        this.recordExchange({ request: body, response: null, status: 202, startedAt, completedAt: Date.now() });
        res.writeHead(202, { 'cache-control': 'no-store' });
        res.end();
        return;
      }
      this.recordExchange({ request: body, response, status: 200, startedAt, completedAt: Date.now() });
      sendJson(res, 200, response, { 'Mcp-Session-Id': this.sessionId });
    } catch (error) {
      const response = jsonRpcError(jsonRpcId(body), -32603, error.message || 'Internal error');
      this.recordExchange({
        request: body,
        response,
        status: 200,
        startedAt,
        completedAt: Date.now(),
        error: error.message || 'Internal error',
      });
      sendJson(res, 200, response);
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

  listExchanges() {
    return this.exchanges.map(mcpExchangeSummary);
  }

  getExchange(id) {
    return this.exchanges.find((exchange) => exchange.id === String(id || '')) || null;
  }

  replaceExchanges(exchanges = []) {
    this.exchanges = sanitizeMcpExchanges(exchanges);
    this.emit('mcp-exchanges', this.listExchanges());
    return this.listExchanges();
  }

  clearExchanges() {
    this.exchanges = [];
    this.emit('mcp-exchanges', []);
    return [];
  }

  recordExchange(entry = {}) {
    const exchange = sanitizeMcpExchange({
      ...entry,
      id: `mcp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    });
    this.exchanges.unshift(exchange);
    this.exchanges.length = Math.min(this.exchanges.length, 500);
    this.emit('mcp-exchanges', this.listExchanges());
    return exchange;
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

function jsonRpcId(request) {
  return request && typeof request === 'object' && Object.prototype.hasOwnProperty.call(request, 'id') ? request.id : null;
}

function sanitizeMcpExchanges(exchanges) {
  return (Array.isArray(exchanges) ? exchanges : [])
    .map(sanitizeMcpExchange)
    .filter(Boolean)
    .slice(0, 500);
}

function sanitizeMcpExchange(exchange) {
  if (!exchange || typeof exchange !== 'object') {
    return null;
  }
  const request = cloneJson(exchange.request);
  const response = cloneJson(exchange.response);
  const startedAt = Number(exchange.startedAt || Date.now());
  const completedAt = Number(exchange.completedAt || startedAt);
  const rpc = summarizeRpc(request);
  return {
    id: String(exchange.id || `mcp-${startedAt}`),
    startedAt,
    completedAt,
    durationMs: Math.max(0, completedAt - startedAt),
    status: Number(exchange.status || 0),
    rpcMethod: String(exchange.rpcMethod || rpc.method || ''),
    tool: String(exchange.tool || rpc.tool || ''),
    jsonRpcId: jsonRpcId(request),
    error: String(exchange.error || response?.error?.message || ''),
    request,
    response,
  };
}

function mcpExchangeSummary(exchange) {
  return {
    id: exchange.id,
    startedAt: exchange.startedAt,
    completedAt: exchange.completedAt,
    durationMs: exchange.durationMs,
    status: exchange.status,
    rpcMethod: exchange.rpcMethod,
    tool: exchange.tool,
    jsonRpcId: exchange.jsonRpcId,
    error: exchange.error,
    requestBytes: jsonByteLength(exchange.request),
    responseBytes: jsonByteLength(exchange.response),
  };
}

function summarizeRpc(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { method: '', tool: '' };
  }
  return {
    method: String(request.method || ''),
    tool: request.method === 'tools/call' ? String(request.params?.name || '') : '',
  };
}

function cloneJson(value) {
  if (value == null) {
    return value;
  }
  try {
    const text = JSON.stringify(value);
    if (text.length > 1024 * 1024) {
      return {
        clipped: true,
        originalBytes: Buffer.byteLength(text, 'utf8'),
        preview: text.slice(0, 1024 * 1024),
      };
    }
    return JSON.parse(text);
  } catch {
    return String(value);
  }
}

function jsonByteLength(value) {
  if (value == null) {
    return 0;
  }
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return Buffer.byteLength(String(value), 'utf8');
  }
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
