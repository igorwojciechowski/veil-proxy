const net = require('net');

const DEFAULT_SOCKET_PATH = process.env.VEIL_SOCKET_PATH || '/run/veil/veil.sock';

class VeilCoreBridge {
  constructor(configProvider) {
    this.configProvider = configProvider || (() => ({}));
    this.knownScopes = new Set();
    this.cache = new Map();
    this.lastError = '';
  }

  enabled() {
    return this.config().enabled === true;
  }

  config() {
    const root = typeof this.configProvider === 'function' ? this.configProvider() || {} : {};
    const mcp = root.mcp || {};
    const veilCore = { ...(root.veilCore || {}), ...(mcp.veilCore || {}) };
    return {
      enabled: veilCore.enabled === true,
      socketPath: String(veilCore.socketPath || process.env.VEIL_CORE_SOCKET || DEFAULT_SOCKET_PATH),
      scopeId: String(veilCore.scopeId || mcp.scopeId || root.scopeId || 'veil-proxy-default'),
      caller: String(veilCore.caller || 'veil-proxy'),
      policyMode: String(veilCore.policyMode || 'default'),
      autoCreateScope: veilCore.autoCreateScope !== false,
      fallbackOnError: veilCore.fallbackOnError !== false,
      ensureDefaultPolicies: veilCore.ensureDefaultPolicies !== false,
      cacheEntries: Number(veilCore.cacheEntries || 1000),
    };
  }

  async sanitizeText(text, purpose = 'mcp_response') {
    const cfg = this.config();
    const source = String(text || '');
    const cacheKey = `${cfg.socketPath}\n${cfg.scopeId}\n${cfg.caller}\n${cfg.policyMode}\n${purpose}\n${source}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      return {
        ...cached,
        replacements: [...cached.replacements],
        decisions: [...cached.decisions, { area: 'veil-core', rule: 'cache_hit', scopeId: cfg.scopeId }],
        evidence: [...cached.evidence],
        veilCore: { ...cached.veilCore, cached: true },
      };
    }
    await this.ensureScope(cfg);
    const result = await this.post(cfg.socketPath, '/sanitize_text', {
      scope_id: cfg.scopeId,
      caller: cfg.caller,
      purpose,
      policy_mode: cfg.policyMode,
      text: source,
    });
    const sanitized = {
      text: result.text || '',
      replacements: tokensToReplacements(result.tokens),
      decisions: [{ area: 'veil-core', rule: 'sanitize_text', scopeId: cfg.scopeId }],
      evidence: [],
      aliasMappings: Array.isArray(result.tokens) ? result.tokens.length : 0,
      veilCore: { used: true, scopeId: cfg.scopeId },
    };
    this.cacheSet(cacheKey, sanitized);
    return sanitized;
  }

  async sanitizeHttpMessage(message, direction = 'auto', purpose = 'mcp_response') {
    const sanitized = await this.sanitizeText(message, purpose);
    return {
      ...sanitized,
      direction,
    };
  }

  async detokenizeText(text, purpose = 'upstream_request', approvalId = '') {
    const cfg = this.config();
    await this.ensureScope(cfg);
    const result = await this.post(cfg.socketPath, '/detokenize_text', {
      scope_id: cfg.scopeId,
      caller: cfg.caller,
      purpose,
      policy_mode: cfg.policyMode,
      approval_id: approvalId,
      text: String(text || ''),
    });
    return {
      text: result.text || '',
      tokens: Array.isArray(result.tokens) ? result.tokens : [],
      veilCore: { used: true, scopeId: cfg.scopeId },
    };
  }

  async auditEventBatch(events, purpose = 'audit') {
    const cfg = this.config();
    await this.ensureScope(cfg);
    return await this.post(cfg.socketPath, '/audit_event_batch', {
      scope_id: cfg.scopeId,
      caller: cfg.caller,
      purpose,
      policy_mode: cfg.policyMode,
      events: Array.isArray(events) ? events : [],
    });
  }

  cacheSet(key, value) {
    const maxEntries = Number(this.config().cacheEntries || 1000);
    this.cache.set(key, {
      ...value,
      replacements: [...value.replacements],
      decisions: [...value.decisions],
      evidence: [...value.evidence],
      veilCore: { ...value.veilCore },
    });
    while (this.cache.size > Math.max(0, maxEntries)) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  async ensureScope(cfg = this.config()) {
    if (!cfg.autoCreateScope || this.knownScopes.has(cfg.scopeId)) {
      return;
    }
    await this.post(cfg.socketPath, '/scopes', {
      scope_id: cfg.scopeId,
      caller: cfg.caller,
      label: 'Veil Proxy MCP',
      metadata: { component: 'veil-proxy', transport: 'mcp' },
    });
    if (cfg.ensureDefaultPolicies) {
      await this.post(cfg.socketPath, '/policies', {
        scope_id: cfg.scopeId,
        caller: cfg.caller,
        purpose: 'upstream_request',
        action: 'detokenize',
        policy_mode: cfg.policyMode,
        allowed: true,
        reason: 'Veil Proxy local upstream request rehydration',
      });
    }
    this.knownScopes.add(cfg.scopeId);
  }

  post(socketPath, path, payload) {
    const body = Buffer.from(JSON.stringify(payload || {}));
    const request = [
      `POST ${path} HTTP/1.1`,
      'Host: localhost',
      'Content-Type: application/json',
      `Content-Length: ${body.length}`,
      'Connection: close',
      '',
      '',
    ].join('\r\n');

    return new Promise((resolve, reject) => {
      const socket = net.createConnection(socketPath);
      const chunks = [];
      socket.on('connect', () => {
        socket.write(request);
        socket.write(body);
      });
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.on('error', (error) => {
        this.lastError = error.message;
        reject(error);
      });
      socket.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          const split = raw.indexOf('\r\n\r\n');
          const head = split >= 0 ? raw.slice(0, split) : raw;
          const responseBody = split >= 0 ? raw.slice(split + 4) : '';
          const statusMatch = head.match(/^HTTP\/\d(?:\.\d)?\s+(\d+)/);
          const status = statusMatch ? Number(statusMatch[1]) : 0;
          const parsed = responseBody ? JSON.parse(responseBody) : {};
          if (status >= 400) {
            const error = new Error(parsed.reason || parsed.error || `veil-core HTTP ${status}`);
            error.status = status;
            error.payload = parsed;
            this.lastError = error.message;
            reject(error);
            return;
          }
          this.lastError = '';
          resolve(parsed);
        } catch (error) {
          this.lastError = error.message;
          reject(error);
        }
      });
    });
  }
}

function tokensToReplacements(tokens = []) {
  if (!Array.isArray(tokens)) return [];
  return tokens.map((item) => ({
    kind: item.type || 'token',
    originalLength: 0,
    replacement: item.token || '',
    source: 'veil-core',
  }));
}

module.exports = {
  DEFAULT_SOCKET_PATH,
  VeilCoreBridge,
};
