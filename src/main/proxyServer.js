const http = require('http');
const net = require('net');
const tls = require('tls');
const { EventEmitter } = require('events');
const { closeIdleTransports, createTunnel, requestViaTransport } = require('./transport');
const { CertificateAuthority } = require('./certAuthority');
const {
  decodeBody,
  encodeBodyForClient,
  headersArrayToObject,
  normalizeHeaderObject,
  objectToRawHeaders,
  shouldKeepBody,
} = require('./httpMessage');

class ProxyServer extends EventEmitter {
  constructor(config) {
    super();
    this.config = structuredClone(config);
    this.server = this.createHttpServer();
    this.history = [];
    this.pending = new Map();
    this.pendingCounter = 1;
    this.flowCounter = 1;
    this.port = this.config.proxyPort;
    this.certAuthority = new CertificateAuthority(this.config.https && this.config.https.certDir);
    this.mitmTargets = new WeakMap();
    this.mitmHttpServer = http.createServer(this.handleMitmHttpRequest.bind(this));
  }

  createHttpServer() {
    const server = http.createServer(this.handleHttpRequest.bind(this));
    server.on('connect', this.handleConnect.bind(this));
    return server;
  }

  async start() {
    await listenServer(this.server, this.config.proxyPort, this.config.proxyHost);
    this.port = this.server.address().port;
    this.config.proxyPort = this.port;
  }

  stop() {
    closeIdleTransports();
    for (const pending of this.pending.values()) {
      pending.resolve({ action: 'drop' });
    }
    this.pending.clear();

    return closeServer(this.server);
  }

  getConfig() {
    return structuredClone(this.config);
  }

  async updateConfig(nextConfig = {}) {
    const upstream = nextConfig.upstream || {};
    const intercept = nextConfig.intercept || {};
    const scope = nextConfig.scope || {};
    const https = nextConfig.https || {};
    const nextHost = Object.prototype.hasOwnProperty.call(nextConfig, 'proxyHost')
      ? normalizeProxyHost(nextConfig.proxyHost)
      : this.config.proxyHost;
    const nextPort = Object.prototype.hasOwnProperty.call(nextConfig, 'proxyPort')
      ? normalizeProxyPort(nextConfig.proxyPort)
      : this.config.proxyPort;

    const candidate = {
      ...this.config,
      ...nextConfig,
      proxyHost: nextHost,
      proxyPort: nextPort,
      upstream: {
        ...this.config.upstream,
        ...upstream,
      },
      intercept: {
        ...this.config.intercept,
        ...intercept,
        rules: sanitizeInterceptRules(
          Object.prototype.hasOwnProperty.call(intercept, 'rules') ? intercept.rules : this.config.intercept.rules,
        ),
      },
      scope: sanitizeScope(
        Object.prototype.hasOwnProperty.call(nextConfig, 'scope')
          ? {
              ...this.config.scope,
              ...scope,
            }
          : this.config.scope,
      ),
      https: {
        ...this.config.https,
        ...https,
      },
      upstreams: Object.prototype.hasOwnProperty.call(nextConfig, 'upstreams')
        ? sanitizeUpstreams(nextConfig.upstreams)
        : this.config.upstreams || [],
      upstreamRules: Object.prototype.hasOwnProperty.call(nextConfig, 'upstreamRules')
        ? sanitizeUpstreamRules(nextConfig.upstreamRules)
        : this.config.upstreamRules || [],
    };

    if (
      Object.prototype.hasOwnProperty.call(nextConfig, 'upstream') ||
      Object.prototype.hasOwnProperty.call(nextConfig, 'upstreams') ||
      Object.prototype.hasOwnProperty.call(nextConfig, 'upstreamRules')
    ) {
      closeIdleTransports();
    }

    if (nextHost !== this.config.proxyHost || nextPort !== this.config.proxyPort) {
      candidate.proxyPort = await this.rebind(nextHost, nextPort);
    }

    this.config = candidate;

    if (Object.prototype.hasOwnProperty.call(https, 'certDir') && https.certDir !== this.certAuthority.certDir) {
      this.certAuthority = new CertificateAuthority(https.certDir);
    }

    if (!this.config.intercept.requests) {
      this.continuePendingStage('request');
    }
    if (!this.config.intercept.responses) {
      this.continuePendingStage('response');
    }

    this.emit('config', this.getConfig());
    return this.getConfig();
  }

  async rebind(host, port) {
    const nextServer = this.createHttpServer();
    await listenServer(nextServer, port, host);

    const previousServer = this.server;
    this.server = nextServer;
    this.port = nextServer.address().port;
    await closeServer(previousServer);
    return this.port;
  }

  listHistory() {
    return this.history.map((item) => this.summarizeFlow(item));
  }

  getFlow(id) {
    return this.history.find((item) => item.id === id) || null;
  }

  getSiteMap() {
    return buildSiteMap(this.history, (flow) => this.isFlowInScope(flow));
  }

  async sendEchoRequest(payload = {}) {
    const request = sanitizeEchoRequest(payload);
    const targetUrl = new URL(request.url);
    const body = request.bodyBase64 ? Buffer.from(request.bodyBase64, 'base64') : Buffer.from(request.bodyText || '');
    const headers = normalizeHeaderObject(request.headers);
    headers.host = targetUrl.host;
    if (body.length > 0) {
      headers['content-length'] = String(body.length);
    } else {
      delete headers['content-length'];
    }

    const startedAt = Date.now();
    try {
      const upstreamResponse = await requestViaTransport({
        targetUrl,
        method: request.method,
        headers,
        body,
        upstream: this.resolveUpstream(targetUrl),
        maxBodyBytes: this.config.maxBodyBytes,
        ignoreCertificateErrors: Boolean(this.config.https && this.config.https.ignoreUpstreamCertificateErrors),
      });
      const decoded = decodeBody(upstreamResponse.headers, upstreamResponse.body);
      const completedAt = Date.now();
      return {
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        request: {
          method: request.method,
          url: targetUrl.href,
          headers,
          bodyBase64: body.toString('base64'),
          bodyText: request.bodyBase64 ? body.toString('utf8') : request.bodyText || '',
        },
        response: {
          statusCode: upstreamResponse.statusCode,
          statusMessage: upstreamResponse.statusMessage,
          headers: headersArrayToObject(upstreamResponse.rawHeaders),
          bodyBase64: upstreamResponse.body.toString('base64'),
          bodyText: decoded.text,
          bodyEncoding: decoded.encoding,
          bodyTruncated: upstreamResponse.body.truncated,
        },
        error: null,
      };
    } catch (error) {
      const completedAt = Date.now();
      return {
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        request: {
          method: request.method,
          url: targetUrl.href,
          headers,
          bodyBase64: body.toString('base64'),
          bodyText: request.bodyBase64 ? body.toString('utf8') : request.bodyText || '',
        },
        response: null,
        error: error.message,
      };
    }
  }

  listPending() {
    return [...this.pending.values()].map((item) => item.public);
  }

  async resolvePending(id, payload) {
    const pending = this.pending.get(id);
    if (!pending) {
      return false;
    }

    this.pending.delete(id);
    pending.resolve(payload);
    this.emit('pending', this.listPending());
    return true;
  }

  continuePendingStage(stage) {
    let changed = false;
    for (const [id, pending] of this.pending.entries()) {
      if (pending.public.stage === stage) {
        this.pending.delete(id);
        pending.resolve({ action: 'continue' });
        changed = true;
      }
    }

    if (changed) {
      this.emit('pending', this.listPending());
    }
  }

  async handleHttpRequest(clientReq, clientRes, forcedTarget = null) {
    const startedAt = Date.now();
    const id = String(this.flowCounter++);
    const body = await readBody(clientReq, this.config.maxBodyBytes);
    const target = parseProxyTarget(clientReq, forcedTarget);

    if (!target) {
      clientRes.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      clientRes.end('Veil Proxy could not determine target URL. Configure the client to use HTTP proxy mode.');
      return;
    }

    const flow = {
      id,
      type: 'http',
      startedAt,
      completedAt: null,
      durationMs: null,
      request: {
        method: clientReq.method,
        url: target.href,
        httpVersion: clientReq.httpVersion,
        headers: headersArrayToObject(clientReq.rawHeaders),
        bodyBase64: body.toString('base64'),
        bodyText: decodeBody(clientReq.headers, body).text,
        bodyTruncated: body.truncated,
      },
      response: null,
      error: null,
      notes: [],
    };

    this.addHistory(flow);

    try {
      const requestDecision = await this.maybeIntercept('request', flow, {
        method: flow.request.method,
        url: flow.request.url,
        headers: flow.request.headers,
        bodyText: flow.request.bodyText,
        bodyBase64: flow.request.bodyBase64,
      });

      if (requestDecision.action === 'drop') {
        flow.error = 'Dropped by operator before forwarding request.';
        flow.completedAt = Date.now();
        flow.durationMs = flow.completedAt - flow.startedAt;
        clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        clientRes.end('Dropped by Veil Proxy.');
        this.emit('history', this.summarizeFlow(flow));
        return;
      }

      if (requestDecision.action === 'modify') {
        applyRequestModification(flow, requestDecision);
      }

      this.emit('history', this.summarizeFlow(flow));

      const upstreamResponse = await requestViaTransport({
        targetUrl: new URL(flow.request.url),
        method: flow.request.method,
        headers: normalizeHeaderObject(flow.request.headers),
        body: Buffer.from(flow.request.bodyBase64 || '', 'base64'),
        upstream: this.resolveUpstream(new URL(flow.request.url)),
        maxBodyBytes: this.config.maxBodyBytes,
        ignoreCertificateErrors: Boolean(this.config.https && this.config.https.ignoreUpstreamCertificateErrors),
      });

      const decoded = decodeBody(upstreamResponse.headers, upstreamResponse.body);
      flow.response = {
        statusCode: upstreamResponse.statusCode,
        statusMessage: upstreamResponse.statusMessage,
        headers: headersArrayToObject(upstreamResponse.rawHeaders),
        bodyBase64: upstreamResponse.body.toString('base64'),
        bodyText: decoded.text,
        bodyEncoding: decoded.encoding,
        bodyTruncated: upstreamResponse.body.truncated,
      };

      const responseDecision = await this.maybeIntercept('response', flow, {
        statusCode: flow.response.statusCode,
        statusMessage: flow.response.statusMessage,
        headers: flow.response.headers,
        bodyText: flow.response.bodyText,
        bodyBase64: flow.response.bodyBase64,
      });

      if (responseDecision.action === 'drop') {
        flow.error = 'Dropped by operator before returning response.';
        flow.completedAt = Date.now();
        flow.durationMs = flow.completedAt - flow.startedAt;
        clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
        clientRes.end('Response dropped by Veil Proxy.');
        this.emit('history', this.summarizeFlow(flow));
        return;
      }

      if (responseDecision.action === 'modify') {
        applyResponseModification(flow, responseDecision);
      }

      const responseBody = encodeBodyForClient(flow.response);
      const responseHeaders = normalizeHeaderObject(flow.response.headers);
      delete responseHeaders['transfer-encoding'];
      responseHeaders['content-length'] = String(responseBody.length);

      clientRes.writeHead(
        Number(flow.response.statusCode || 200),
        flow.response.statusMessage || undefined,
        objectToRawHeaders(responseHeaders),
      );

      if (shouldKeepBody(clientReq.method, flow.response.statusCode)) {
        clientRes.end(responseBody);
      } else {
        clientRes.end();
      }

      flow.completedAt = Date.now();
      flow.durationMs = flow.completedAt - flow.startedAt;
      this.emit('history', this.summarizeFlow(flow));
    } catch (error) {
      flow.error = error.message;
      flow.completedAt = Date.now();
      flow.durationMs = flow.completedAt - flow.startedAt;
      this.emit('history', this.summarizeFlow(flow));

      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      }
      clientRes.end(`Veil Proxy upstream error: ${error.message}`);
    }
  }

  async handleConnect(req, clientSocket, head) {
    const startedAt = Date.now();
    const id = String(this.flowCounter++);
    const [host, portText] = req.url.split(':');
    const port = Number(portText || 443);

    const flow = {
      id,
      type: 'connect',
      startedAt,
      completedAt: null,
      durationMs: null,
      request: {
        method: 'CONNECT',
        url: req.url,
        httpVersion: req.httpVersion,
        headers: headersArrayToObject(req.rawHeaders),
        bodyBase64: '',
        bodyText: '',
      },
      response: null,
      tunnel: {
        host,
        port,
        bytesUp: 0,
        bytesDown: 0,
      },
      error: null,
      notes: [],
    };

    this.addHistory(flow);
    this.emit('history', this.summarizeFlow(flow));

    if (this.shouldMitmConnect(host, port)) {
      this.handleHttpsMitmConnect(flow, clientSocket, head);
      return;
    }

    flow.notes.push('TLS CONNECT is tunnelled without HTTPS interception.');

    try {
      const tunnel = await createTunnel({
        host,
        port,
        upstream: this.resolveUpstreamForConnect(host, port),
      });

      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length > 0) {
        tunnel.write(head);
      }

      clientSocket.on('data', (chunk) => {
        flow.tunnel.bytesUp += chunk.length;
      });
      tunnel.on('data', (chunk) => {
        flow.tunnel.bytesDown += chunk.length;
      });

      const finalize = () => {
        if (!flow.completedAt) {
          flow.completedAt = Date.now();
          flow.durationMs = flow.completedAt - startedAt;
          this.emit('history', this.summarizeFlow(flow));
        }
      };

      clientSocket.on('error', (error) => {
        flow.error = error.message;
      });
      tunnel.on('error', (error) => {
        flow.error = error.message;
      });
      clientSocket.on('close', finalize);
      tunnel.on('close', finalize);
      clientSocket.pipe(tunnel);
      tunnel.pipe(clientSocket);
    } catch (error) {
      flow.error = error.message;
      flow.completedAt = Date.now();
      flow.durationMs = flow.completedAt - startedAt;
      this.emit('history', this.summarizeFlow(flow));
      clientSocket.end('HTTP/1.1 502 Bad Gateway\r\ncontent-type: text/plain\r\n\r\nVeil Proxy CONNECT error\r\n');
    }
  }

  shouldMitmConnect(host, port) {
    const ports = Array.isArray(this.config.https && this.config.https.interceptPorts)
      ? this.config.https.interceptPorts.map((item) => Number(item))
      : [443];
    return Boolean(this.config.https && this.config.https.intercept && host && ports.includes(Number(port || 443)));
  }

  handleHttpsMitmConnect(flow, clientSocket, head) {
    const startedAt = flow.startedAt;
    flow.notes.push('HTTPS MITM enabled. Decrypted requests are recorded as HTTPS flows.');

    try {
      const context = this.certAuthority.getSecureContext(flow.tunnel.host);
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length > 0) {
        clientSocket.unshift(head);
      }

      const tlsSocket = new tls.TLSSocket(clientSocket, {
        isServer: true,
        secureContext: context,
        ALPNProtocols: ['http/1.1'],
      });

      this.mitmTargets.set(tlsSocket, {
        host: flow.tunnel.host,
        port: flow.tunnel.port,
      });

      const finalize = () => {
        if (!flow.completedAt) {
          flow.completedAt = Date.now();
          flow.durationMs = flow.completedAt - startedAt;
          this.emit('history', this.summarizeFlow(flow));
        }
      };

      tlsSocket.once('secure', () => {
        this.mitmHttpServer.emit('connection', tlsSocket);
      });
      tlsSocket.on('data', (chunk) => {
        flow.tunnel.bytesUp += chunk.length;
      });
      tlsSocket.on('error', (error) => {
        flow.error = error.message;
      });
      tlsSocket.on('close', finalize);
    } catch (error) {
      flow.error = error.message;
      flow.completedAt = Date.now();
      flow.durationMs = flow.completedAt - startedAt;
      this.emit('history', this.summarizeFlow(flow));
      clientSocket.end('HTTP/1.1 502 Bad Gateway\r\ncontent-type: text/plain\r\n\r\nVeil Proxy HTTPS MITM error\r\n');
    }
  }

  handleMitmHttpRequest(clientReq, clientRes) {
    const target = this.mitmTargets.get(clientReq.socket);
    this.handleHttpRequest(clientReq, clientRes, target);
  }

  resolveUpstream(targetUrl) {
    const upstreams = this.effectiveUpstreams();
    const match = upstreams.find((upstream) => {
      if (upstream.enabled === false) return false;
      const rules = Array.isArray(upstream.rules) ? upstream.rules : [];
      return rules.length === 0 || rules.some((rule) => upstreamRuleMatches(rule, targetUrl));
    });
    return match ? normalizeUpstream(match) : directUpstream();
  }

  resolveUpstreamForConnect(host, port) {
    const targetUrl = new URL(`https://${host}${Number(port || 443) === 443 ? '' : `:${Number(port)}`}/`);
    return this.resolveUpstream(targetUrl);
  }

  effectiveUpstreams() {
    if (Array.isArray(this.config.upstreams) && this.config.upstreams.length > 0) {
      return this.config.upstreams.map((upstream) => normalizeConfiguredUpstream(upstream));
    }

    const legacyRules = Array.isArray(this.config.upstreamRules) ? this.config.upstreamRules : [];
    if (legacyRules.length > 0) {
      return legacyRules.map((rule) => ({
        ...normalizeUpstream(rule.upstream),
        enabled: rule.enabled !== false,
        rules: [{ matchType: rule.matchType, pattern: rule.pattern, includeSubdomains: rule.includeSubdomains }],
      }));
    }

    const legacy = normalizeUpstream(this.config.upstream);
    return legacy.mode === 'direct' ? [] : [{ ...legacy, enabled: true, rules: [] }];
  }

  addHistory(flow) {
    this.history.unshift(flow);
    if (this.history.length > this.config.historyLimit) {
      this.history.length = this.config.historyLimit;
    }
  }

  summarizeFlow(flow) {
    return {
      id: flow.id,
      type: flow.type,
      startedAt: flow.startedAt,
      completedAt: flow.completedAt,
      durationMs: flow.durationMs,
      method: flow.request.method,
      url: flow.request.url,
      host: flow.type === 'connect' ? flow.tunnel.host : safeHost(flow.request.url),
      statusCode: flow.response ? flow.response.statusCode : null,
      statusMessage: flow.response ? flow.response.statusMessage : null,
      requestBytes: Buffer.byteLength(flow.request.bodyBase64 || '', 'base64'),
      responseBytes: flow.response ? Buffer.byteLength(flow.response.bodyBase64 || '', 'base64') : null,
      tunnel: flow.tunnel || null,
      error: flow.error,
      notes: flow.notes,
      path: flowScopeParts(flow).path,
      inScope: this.isFlowInScope(flow),
    };
  }

  isFlowInScope(flow) {
    return matchesScope(this.config.scope, flow);
  }

  maybeIntercept(stage, flow, editable) {
    const enabled =
      (stage === 'request' && this.config.intercept.requests) ||
      (stage === 'response' && this.config.intercept.responses);

    if (!enabled || flow.type !== 'http' || !matchesInterceptRules(stage, flow, editable, this.config.intercept.rules)) {
      return Promise.resolve({ action: 'continue' });
    }

    const id = String(this.pendingCounter++);
    const publicItem = {
      id,
      stage,
      flowId: flow.id,
      createdAt: Date.now(),
      summary: this.summarizeFlow(flow),
      editable,
    };

    return new Promise((resolve) => {
      this.pending.set(id, {
        id,
        public: publicItem,
        resolve,
      });
      this.emit('pending', this.listPending());
    });
  }
}

function listenServer(server, port, host) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function normalizeProxyHost(value) {
  const host = String(value || '').trim();
  return host || '127.0.0.1';
}

function normalizeProxyPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Proxy port must be a number between 0 and 65535.');
  }
  return port;
}

function parseProxyTarget(req, forcedTarget = null) {
  try {
    if (/^https?:\/\//i.test(req.url)) {
      return new URL(req.url);
    }

    if (forcedTarget && forcedTarget.host) {
      const port = Number(forcedTarget.port || 443);
      const defaultPort = port === 443 ? '' : `:${port}`;
      return new URL(req.url || '/', `https://${forcedTarget.host}${defaultPort}`);
    }

    const host = req.headers.host;
    if (!host) {
      return null;
    }

    return new URL(`http://${host}${req.url}`);
  } catch {
    return null;
  }
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function safeUrlParts(url) {
  try {
    const parsed = new URL(url);
    return {
      url: parsed.href,
      host: parsed.host,
      path: parsed.pathname || '/',
      query: parsed.search || '',
      scheme: parsed.protocol.replace(':', ''),
    };
  } catch {
    return {
      url: url || '',
      host: '',
      path: '',
      query: '',
      scheme: '',
    };
  }
}

function sanitizeEchoRequest(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  if (typeof raw.rawRequest === 'string') {
    return sanitizeEchoRequestParts(parseRawEchoRequest(raw.rawRequest));
  }

  return sanitizeEchoRequestParts(raw);
}

function sanitizeEchoRequestParts(raw) {
  const method = String(raw.method || 'GET')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24);
  const url = String(raw.url || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Echo request URL must be absolute and use http or https.');
  }

  const headers = raw.headers && typeof raw.headers === 'object' ? raw.headers : {};
  return {
    method: method || 'GET',
    url,
    headers,
    bodyText: typeof raw.bodyText === 'string' ? raw.bodyText : '',
    bodyBase64: typeof raw.bodyBase64 === 'string' ? raw.bodyBase64 : '',
  };
}

function sanitizeUpstreamRules(rawRules) {
  if (!Array.isArray(rawRules)) return [];
  return rawRules
    .map((rule, index) => {
      const raw = rule && typeof rule === 'object' ? rule : {};
      const matchType = ['host', 'domain', 'url'].includes(raw.matchType) ? raw.matchType : 'domain';
      const pattern = String(raw.pattern || '').trim();
      if (!pattern) return null;
      return {
        id: String(raw.id || `upstream-rule-${index + 1}`),
        enabled: raw.enabled !== false,
        matchType,
        pattern,
        includeSubdomains: raw.includeSubdomains !== false,
        upstream: normalizeUpstream(raw.upstream),
      };
    })
    .filter(Boolean);
}

function sanitizeUpstreams(rawUpstreams) {
  if (!Array.isArray(rawUpstreams)) return [];
  return rawUpstreams.map((upstream, index) => normalizeConfiguredUpstream({ ...upstream, id: upstream.id || `upstream-${index + 1}` }));
}

function normalizeConfiguredUpstream(raw = {}) {
  return {
    ...normalizeUpstream(raw),
    id: String(raw.id || `upstream-${Date.now()}`),
    enabled: raw.enabled !== false,
    rules: sanitizeUpstreamRouteRules(raw.rules),
  };
}

function sanitizeUpstreamRouteRules(rawRules) {
  if (!Array.isArray(rawRules)) return [];
  return rawRules
    .map((rule) => {
      const raw = rule && typeof rule === 'object' ? rule : {};
      const pattern = String(raw.pattern || '').trim();
      if (!pattern) return null;
      return {
        matchType: ['host', 'domain', 'url'].includes(raw.matchType) ? raw.matchType : 'domain',
        pattern,
        includeSubdomains: raw.includeSubdomains !== false,
      };
    })
    .filter(Boolean);
}

function normalizeUpstream(raw = {}) {
  const mode = ['direct', 'http', 'socks5'].includes(raw.mode) ? raw.mode : 'direct';
  return {
    mode,
    host: String(raw.host || '').trim(),
    port: Number(raw.port || 0),
    username: String(raw.username || ''),
    password: String(raw.password || ''),
  };
}

function directUpstream() {
  return { mode: 'direct', host: '', port: 0, username: '', password: '' };
}

function upstreamRuleMatches(rule, targetUrl) {
  if (!targetUrl) return false;
  if (rule.matchType === 'url') {
    return wildcardMatches(rule.pattern, targetUrl.href);
  }
  const host = targetUrl.hostname.toLowerCase();
  const pattern = String(rule.pattern || '').toLowerCase();
  if (rule.matchType === 'host') {
    return wildcardMatches(pattern, targetUrl.host.toLowerCase()) || wildcardMatches(pattern, host);
  }
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  if (pattern.includes('*')) {
    return wildcardMatches(pattern, host);
  }
  return host === pattern || (rule.includeSubdomains !== false && host.endsWith(`.${pattern}`));
}

function wildcardMatches(pattern, value) {
  const escaped = String(pattern || '')
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`, 'i').test(String(value || ''));
}

function parseRawEchoRequest(rawRequest) {
  const normalized = String(rawRequest || '').replace(/\r\n/g, '\n');
  const separator = normalized.search(/\n\n/);
  const head = separator === -1 ? normalized : normalized.slice(0, separator);
  const bodyText = separator === -1 ? '' : normalized.slice(separator + 2);
  const lines = head.split('\n').filter((line) => line.trim() || line.includes(':'));
  const requestLine = lines.shift() || '';
  const [method, target] = requestLine.trim().split(/\s+/);

  if (!method || !target) {
    throw new Error('Echo raw request must start with an HTTP request line.');
  }

  const headers = {};
  for (const line of lines) {
    const index = line.indexOf(':');
    if (index === -1) {
      continue;
    }
    const name = line.slice(0, index).trim().toLowerCase();
    if (!name) {
      continue;
    }
    headers[name] = line.slice(index + 1).trim();
  }

  const host = headerValue(headers, 'host');
  let url = target;
  if (/^\/\//.test(target)) {
    url = `http:${target}`;
  } else if (!/^https?:\/\//i.test(target)) {
    if (!host) {
      throw new Error('Echo raw request with relative target requires a Host header.');
    }
    url = `http://${host}${target.startsWith('/') ? target : `/${target}`}`;
  }

  return {
    method,
    url,
    headers,
    bodyText,
  };
}

function flowScopeParts(flow) {
  if (flow.type === 'connect') {
    const host = flow.tunnel?.host || safeHost(`https://${flow.request.url}`);
    const port = flow.tunnel?.port || 443;
    return {
      url: `${host}:${port}`,
      host,
      path: '(CONNECT tunnel)',
      query: '',
      scheme: 'connect',
    };
  }

  return safeUrlParts(flow.request.url);
}

function sanitizeInterceptRules(rules) {
  if (!Array.isArray(rules)) {
    return [];
  }

  return rules.slice(0, 50).map((rawRule, index) => {
    const rule = rawRule && typeof rawRule === 'object' ? rawRule : {};
    const stage = ['request', 'response', 'both'].includes(rule.stage) ? rule.stage : 'both';
    const field = ['url', 'host', 'method', 'status', 'header', 'body'].includes(rule.field) ? rule.field : 'url';
    const operator = ['contains', 'equals', 'startsWith', 'endsWith', 'regex', 'exists'].includes(rule.operator)
      ? rule.operator
      : 'contains';

    return {
      id: String(rule.id || `rule-${Date.now()}-${index}`),
      enabled: rule.enabled !== false,
      stage,
      field,
      operator,
      headerName: String(rule.headerName || '').trim().slice(0, 120),
      value: String(rule.value || '').slice(0, 2000),
    };
  });
}

function sanitizeScope(scope) {
  const raw = scope && typeof scope === 'object' ? scope : {};
  return {
    enabled: raw.enabled === true,
    rules: sanitizeScopeRules(raw.rules),
  };
}

function sanitizeScopeRules(rules) {
  if (!Array.isArray(rules)) {
    return [];
  }

  return rules.slice(0, 100).map((rawRule, index) => {
    const rule = rawRule && typeof rawRule === 'object' ? rawRule : {};
    const action = ['include', 'exclude'].includes(rule.action) ? rule.action : 'include';
    const field = ['url', 'host', 'path', 'method'].includes(rule.field) ? rule.field : 'url';
    const operator = ['contains', 'equals', 'startsWith', 'endsWith', 'regex', 'exists'].includes(rule.operator)
      ? rule.operator
      : 'contains';

    return {
      id: String(rule.id || `scope-${Date.now()}-${index}`),
      enabled: rule.enabled !== false,
      action,
      field,
      operator,
      value: String(rule.value || '').slice(0, 2000),
    };
  });
}

function matchesScope(scope, flow) {
  const normalized = sanitizeScope(scope);
  if (!normalized.enabled) {
    return true;
  }

  const activeRules = normalized.rules.filter((rule) => rule.enabled);
  const excludeRules = activeRules.filter((rule) => rule.action === 'exclude');
  if (excludeRules.some((rule) => matchesScopeRule(rule, flow))) {
    return false;
  }

  const includeRules = activeRules.filter((rule) => rule.action === 'include');
  if (includeRules.length === 0) {
    return false;
  }

  return includeRules.some((rule) => matchesScopeRule(rule, flow));
}

function matchesScopeRule(rule, flow) {
  const parts = flowScopeParts(flow);
  let candidate = '';
  if (rule.field === 'url') candidate = parts.scheme && parts.host ? `${parts.scheme}://${parts.host}${parts.path || '/'}` : parts.url;
  if (rule.field === 'host') candidate = parts.host;
  if (rule.field === 'path') candidate = parts.path;
  if (rule.field === 'method') candidate = flow.request.method || '';
  return matchesCandidate(candidate, rule.operator, rule.value);
}

function matchesInterceptRules(stage, flow, editable, rules) {
  const activeRules = sanitizeInterceptRules(rules).filter((rule) => rule.enabled && (rule.stage === stage || rule.stage === 'both'));
  if (activeRules.length === 0) {
    return true;
  }

  return activeRules.some((rule) => matchesRule(rule, stage, flow, editable));
}

function matchesRule(rule, stage, flow, editable) {
  const candidate = ruleCandidate(rule, stage, flow, editable);
  return matchesCandidate(candidate, rule.operator, rule.value);
}

function ruleCandidate(rule, stage, flow, editable) {
  if (rule.field === 'url') return flow.request.url || '';
  if (rule.field === 'host') return safeHost(flow.request.url);
  if (rule.field === 'method') return flow.request.method || '';
  if (rule.field === 'status') return stage === 'response' && flow.response ? String(flow.response.statusCode || '') : '';
  if (rule.field === 'body') return editable.bodyText || '';
  if (rule.field === 'header') return headerValue(editable.headers, rule.headerName);
  return '';
}

function headerValue(headers = {}, name) {
  const wanted = String(name || '').toLowerCase();
  if (!wanted) {
    return '';
  }

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) {
      return String(value);
    }
  }
  return '';
}

function matchesCandidate(candidate, operator, value) {
  const haystackRaw = String(candidate || '');
  if (operator === 'exists') {
    return haystackRaw.length > 0;
  }

  const needleRaw = String(value || '');
  if (!needleRaw) {
    return false;
  }

  if (operator === 'regex') {
    try {
      return new RegExp(needleRaw, 'i').test(haystackRaw);
    } catch {
      return false;
    }
  }

  const haystack = haystackRaw.toLowerCase();
  const needle = needleRaw.toLowerCase();
  if (operator === 'equals') return haystack === needle;
  if (operator === 'startsWith') return haystack.startsWith(needle);
  if (operator === 'endsWith') return haystack.endsWith(needle);
  return haystack.includes(needle);
}

function buildSiteMap(history, inScopeFn) {
  const hostMap = new Map();

  for (const flow of [...history].reverse()) {
    const parts = flowScopeParts(flow);
    if (!parts.host) {
      continue;
    }

    const inScope = inScopeFn(flow);
    const hostRecord = ensureHostRecord(hostMap, parts.host, parts.scheme);
    const pathRecord = ensurePathRecord(hostRecord.paths, parts.path || '/', parts.url);
    const status = flow.error ? 'ERR' : flow.response ? String(flow.response.statusCode) : flow.type === 'connect' ? 'TUN' : '-';

    hostRecord.requestCount += 1;
    hostRecord.lastSeenAt = flow.startedAt;
    hostRecord.inScope = hostRecord.inScope || inScope;
    hostRecord.methods.add(flow.request.method);
    hostRecord.statuses.add(status);

    pathRecord.count += 1;
    pathRecord.lastSeenAt = flow.startedAt;
    pathRecord.lastUrl = parts.url;
    pathRecord.query = parts.query;
    pathRecord.inScope = pathRecord.inScope || inScope;
    pathRecord.methods.add(flow.request.method);
    pathRecord.statuses.add(status);
    pathRecord.flowIds.unshift(flow.id);
    if (pathRecord.flowIds.length > 30) {
      pathRecord.flowIds.length = 30;
    }
  }

  return {
    generatedAt: Date.now(),
    hosts: [...hostMap.values()]
      .map((host) => ({
        host: host.host,
        scheme: host.scheme,
        requestCount: host.requestCount,
        lastSeenAt: host.lastSeenAt,
        inScope: host.inScope,
        methods: [...host.methods].sort(),
        statuses: [...host.statuses].sort(statusSort),
        paths: [...host.paths.values()]
          .map((path) => ({
            path: path.path,
            query: path.query,
            lastUrl: path.lastUrl,
            count: path.count,
            lastSeenAt: path.lastSeenAt,
            inScope: path.inScope,
            methods: [...path.methods].sort(),
            statuses: [...path.statuses].sort(statusSort),
            flowIds: path.flowIds,
          }))
          .sort((a, b) => a.path.localeCompare(b.path)),
      }))
      .sort((a, b) => a.host.localeCompare(b.host)),
  };
}

function ensureHostRecord(hostMap, host, scheme) {
  if (!hostMap.has(host)) {
    hostMap.set(host, {
      host,
      scheme,
      requestCount: 0,
      lastSeenAt: 0,
      inScope: false,
      methods: new Set(),
      statuses: new Set(),
      paths: new Map(),
    });
  }
  return hostMap.get(host);
}

function ensurePathRecord(pathMap, path, url) {
  if (!pathMap.has(path)) {
    pathMap.set(path, {
      path,
      query: '',
      lastUrl: url,
      count: 0,
      lastSeenAt: 0,
      inScope: false,
      methods: new Set(),
      statuses: new Set(),
      flowIds: [],
    });
  }
  return pathMap.get(path);
}

function statusSort(a, b) {
  const aNumber = Number(a);
  const bNumber = Number(b);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
    return aNumber - bNumber;
  }
  return String(a).localeCompare(String(b));
}

function applyRequestModification(flow, decision) {
  if (decision.method) {
    flow.request.method = decision.method;
  }
  if (decision.url) {
    flow.request.url = decision.url;
  }
  if (decision.headers) {
    flow.request.headers = decision.headers;
  }
  if (typeof decision.bodyText === 'string') {
    flow.request.bodyText = decision.bodyText;
    flow.request.bodyBase64 = Buffer.from(decision.bodyText).toString('base64');
    const headers = normalizeHeaderObject(flow.request.headers);
    headers['content-length'] = String(Buffer.byteLength(decision.bodyText));
    flow.request.headers = headers;
  } else if (typeof decision.bodyBase64 === 'string') {
    flow.request.bodyBase64 = decision.bodyBase64;
    flow.request.bodyText = Buffer.from(decision.bodyBase64, 'base64').toString('utf8');
    const headers = normalizeHeaderObject(flow.request.headers);
    headers['content-length'] = String(Buffer.byteLength(flow.request.bodyBase64, 'base64'));
    flow.request.headers = headers;
  }
}

function applyResponseModification(flow, decision) {
  if (decision.statusCode) {
    flow.response.statusCode = Number(decision.statusCode);
  }
  if (decision.statusMessage) {
    flow.response.statusMessage = decision.statusMessage;
  }
  if (decision.headers) {
    flow.response.headers = decision.headers;
  }
  if (typeof decision.bodyText === 'string') {
    flow.response.bodyText = decision.bodyText;
    flow.response.bodyBase64 = Buffer.from(decision.bodyText).toString('base64');
    const headers = normalizeHeaderObject(flow.response.headers);
    delete headers['content-encoding'];
    headers['content-length'] = String(Buffer.byteLength(decision.bodyText));
    flow.response.headers = headers;
  } else if (typeof decision.bodyBase64 === 'string') {
    flow.response.bodyBase64 = decision.bodyBase64;
    flow.response.bodyText = Buffer.from(decision.bodyBase64, 'base64').toString('utf8');
    const headers = normalizeHeaderObject(flow.response.headers);
    delete headers['content-encoding'];
    headers['content-length'] = String(Buffer.byteLength(flow.response.bodyBase64, 'base64'));
    flow.response.headers = headers;
  }
}

function readBody(stream, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    let truncated = false;

    stream.on('data', (chunk) => {
      length += chunk.length;
      if (length <= maxBytes) {
        chunks.push(chunk);
      } else if (!truncated) {
        const allowed = Math.max(0, chunk.length - (length - maxBytes));
        if (allowed > 0) {
          chunks.push(chunk.subarray(0, allowed));
        }
        truncated = true;
      }
    });

    stream.on('end', () => {
      const body = Buffer.concat(chunks);
      body.truncated = truncated;
      resolve(body);
    });

    stream.on('error', reject);
  });
}

module.exports = {
  ProxyServer,
};
