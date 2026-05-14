const fs = require('fs');
const http = require('http');
const path = require('path');
const { buildReport, renderMarkdownReport } = require('./report');

class ApiServer {
  constructor({ config, proxy, store, publicDir, port }) {
    this.config = config;
    this.proxy = proxy;
    this.store = store || null;
    this.publicDir = publicDir;
    this.port = port;
    this.clients = new Set();
    this.memoryUiState = { echo: defaultEchoUiState(), traffic: defaultTrafficUiState() };
    this.server = http.createServer(this.handleRequest.bind(this));

    this.proxy.on('history', (flow) => this.broadcast('history', flow));
    this.proxy.on('pending', (items) => this.broadcast('pending', items));
    this.proxy.on('config', (nextConfig) => this.broadcast('config', nextConfig));
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.config.apiHost, () => {
        this.server.off('error', reject);
        this.port = this.server.address().port;
        resolve();
      });
    });
  }

  stop() {
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();

    return new Promise((resolve) => {
      if (!this.server.listening) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }

  async handleRequest(req, res) {
    const parsed = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

    try {
      if (parsed.pathname === '/api/events') {
        this.handleEvents(req, res);
        return;
      }

      if (parsed.pathname === '/api/state' && req.method === 'GET') {
        this.json(res, this.statePayload());
        return;
      }

      if (parsed.pathname === '/api/config' && req.method === 'PATCH') {
        const body = await readJson(req);
        this.json(res, await this.proxy.updateConfig(body));
        return;
      }

      if (parsed.pathname === '/api/https/ca-cert' && req.method === 'GET') {
        this.serveCaCertificate(res);
        return;
      }

      if (parsed.pathname === '/api/project/export' && req.method === 'GET') {
        this.downloadJson(res, this.exportProject(), `${projectExportName(this.store)}.json`);
        return;
      }

      if (parsed.pathname === '/api/project/import' && req.method === 'POST') {
        const body = await readJson(req);
        const state = await this.importProject(body);
        this.broadcast('state', state);
        this.json(res, state);
        return;
      }

      if (parsed.pathname === '/api/project/new' && req.method === 'POST') {
        const state = await this.newProject();
        this.broadcast('state', state);
        this.json(res, state);
        return;
      }

      if (parsed.pathname === '/api/ui-state' && req.method === 'GET') {
        this.json(res, this.getUiState());
        return;
      }

      if (parsed.pathname === '/api/ui-state' && (req.method === 'PATCH' || req.method === 'POST')) {
        const body = await readJson(req);
        if (body && Object.prototype.hasOwnProperty.call(body, 'echo')) {
          this.setUiState('echo', sanitizeEchoUiState(body.echo));
        }
        if (body && Object.prototype.hasOwnProperty.call(body, 'traffic')) {
          this.setUiState('traffic', sanitizeTrafficUiState(body.traffic));
        }
        const uiState = this.getUiState();
        this.broadcast('ui', uiState);
        this.json(res, uiState);
        return;
      }

      if (parsed.pathname === '/api/history' && req.method === 'GET') {
        this.json(res, this.proxy.listHistory());
        return;
      }

      if (parsed.pathname === '/api/history' && req.method === 'DELETE') {
        this.proxy.clearHistory();
        const state = this.statePayload();
        this.broadcast('state', state);
        this.json(res, state);
        return;
      }

      if (parsed.pathname === '/api/site-map' && req.method === 'GET') {
        this.json(res, this.proxy.getSiteMap());
        return;
      }

      if (parsed.pathname === '/api/findings' && req.method === 'GET') {
        this.json(res, this.proxy.getFindings());
        return;
      }

      if (parsed.pathname === '/api/report' && req.method === 'GET') {
        this.json(res, this.buildReportPayload());
        return;
      }

      if (parsed.pathname === '/api/report/export' && req.method === 'GET') {
        const report = this.buildReportPayload();
        const filenameBase = `${projectExportName(this.store)}-report`;
        if (parsed.searchParams.get('format') === 'json') {
          this.downloadJson(res, report, `${filenameBase}.json`);
          return;
        }
        this.downloadText(res, renderMarkdownReport(report), `${filenameBase}.md`, 'text/markdown; charset=utf-8');
        return;
      }

      if (parsed.pathname === '/api/echo/send' && req.method === 'POST') {
        const body = await readJson(req);
        this.json(res, await this.proxy.sendEchoRequest(body));
        return;
      }

      const flowMatch = parsed.pathname.match(/^\/api\/history\/([^/]+)$/);
      if (flowMatch && req.method === 'GET') {
        const flow = this.proxy.getFlow(flowMatch[1]);
        if (!flow) {
          this.notFound(res);
          return;
        }
        this.json(res, flow);
        return;
      }

      if (parsed.pathname === '/api/pending' && req.method === 'GET') {
        this.json(res, this.proxy.listPending());
        return;
      }

      const pendingMatch = parsed.pathname.match(/^\/api\/pending\/([^/]+)$/);
      if (pendingMatch && req.method === 'POST') {
        const body = await readJson(req);
        const ok = await this.proxy.resolvePending(pendingMatch[1], body);
        if (!ok) {
          this.notFound(res);
          return;
        }
        this.json(res, { ok: true });
        return;
      }

      this.serveStatic(parsed.pathname, res);
    } catch (error) {
      this.json(res, { error: error.message }, 500);
    }
  }

  handleEvents(req, res) {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });

    const write = (event, payload) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const client = { end: () => res.end(), write };
    this.clients.add(client);
    write('state', this.statePayload());

    req.on('close', () => {
      this.clients.delete(client);
    });
  }

  statePayload() {
    return {
      config: this.proxy.getConfig(),
      history: this.proxy.listHistory(),
      pending: this.proxy.listPending(),
      proxyPort: this.proxy.port,
      apiPort: this.port,
      project: this.store ? this.store.info() : null,
      ui: this.getUiState(),
    };
  }

  getUiState() {
    return {
      echo: this.readUiState('echo', defaultEchoUiState()),
      traffic: this.readUiState('traffic', defaultTrafficUiState()),
    };
  }

  readUiState(name, fallback) {
    if (this.store) {
      return sanitizeUiState(name, this.store.getUiState(name, fallback));
    }
    return sanitizeUiState(name, this.memoryUiState[name] || fallback);
  }

  setUiState(name, value) {
    const sanitized = sanitizeUiState(name, value);
    if (this.store) {
      this.store.setUiState(name, sanitized);
    } else {
      this.memoryUiState[name] = sanitized;
    }
  }

  exportProject() {
    const data = this.store
      ? this.store.exportData()
      : {
          version: 1,
          exportedAt: new Date().toISOString(),
          project: null,
          config: this.proxy.getConfig(),
          ui: this.getUiState(),
          history: this.proxy.history || [],
        };
    return {
      ...data,
      findings: this.proxy.getFindings(),
    };
  }

  async importProject(data) {
    const currentConfig = this.proxy.getConfig();
    const incomingConfig = data?.config && typeof data.config === 'object' ? data.config : {};
    const nextConfig = {
      ...incomingConfig,
      apiHost: currentConfig.apiHost,
      apiPort: currentConfig.apiPort,
    };

    await this.proxy.updateConfig(nextConfig);
    this.proxy.replaceHistory(data?.history || [], { persist: false });

    const nextUi = data?.ui && typeof data.ui === 'object' ? data.ui : {};
    this.memoryUiState = {
      echo: sanitizeEchoUiState(nextUi.echo),
      traffic: sanitizeTrafficUiState(nextUi.traffic),
    };

    if (this.store) {
      this.store.importData({
        config: this.proxy.getConfig(),
        ui: this.memoryUiState,
        history: this.proxy.history,
      });
    }

    return this.statePayload();
  }

  async newProject() {
    this.proxy.replaceHistory([], { persist: false });
    this.memoryUiState = {
      echo: defaultEchoUiState(),
      traffic: defaultTrafficUiState(),
    };

    if (this.store) {
      this.store.importData({
        config: this.proxy.getConfig(),
        ui: this.memoryUiState,
        history: [],
      });
    }

    return this.statePayload();
  }

  buildReportPayload() {
    return buildReport({
      config: this.proxy.getConfig(),
      history: this.proxy.listHistory(),
      siteMap: this.proxy.getSiteMap(),
      findings: this.proxy.getFindings(),
      project: this.store ? this.store.info() : null,
    });
  }

  broadcast(event, payload) {
    for (const client of this.clients) {
      client.write(event, payload);
    }
  }

  serveStatic(urlPath, res) {
    const safePath = urlPath === '/' ? '/index.html' : urlPath;
    const filePath = path.resolve(this.publicDir, `.${safePath}`);
    if (filePath !== this.publicDir && !filePath.startsWith(`${this.publicDir}${path.sep}`)) {
      this.notFound(res);
      return;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        this.notFound(res);
        return;
      }
      res.writeHead(200, { 'content-type': contentType(filePath) });
      res.end(content);
    });
  }

  serveCaCertificate(res) {
    const caCertPath = this.proxy.certAuthority && this.proxy.certAuthority.caCertPath;
    if (!caCertPath) {
      this.notFound(res);
      return;
    }

    fs.readFile(caCertPath, (error, content) => {
      if (error) {
        this.notFound(res);
        return;
      }
      res.writeHead(200, {
        'content-type': 'application/x-x509-ca-cert',
        'content-disposition': 'attachment; filename="veil-proxy-ca.crt"',
        'cache-control': 'no-store',
      });
      res.end(content);
    });
  }

  json(res, payload, status = 200) {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(payload));
  }

  downloadJson(res, payload, filename) {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(payload, null, 2));
  }

  downloadText(res, payload, filename, type) {
    res.writeHead(200, {
      'content-type': type,
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    });
    res.end(payload);
  }

  notFound(res) {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
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

function contentType(filePath) {
  const ext = path.extname(filePath);
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function projectExportName(store) {
  const base = store ? store.info().name.replace(/\.[^.]+$/, '') : 'veil-project';
  return String(base || 'veil-project').replace(/[^a-z0-9._-]/gi, '-');
}

function defaultEchoUiState() {
  return {
    tabs: [],
    groups: [],
    selectedTabId: null,
    selectedGroupId: null,
    split: 50,
  };
}

function defaultTrafficUiState() {
  return {
    presets: [],
  };
}

function sanitizeUiState(name, value) {
  if (name === 'echo') {
    return sanitizeEchoUiState(value);
  }
  if (name === 'traffic') {
    return sanitizeTrafficUiState(value);
  }
  return value && typeof value === 'object' ? value : {};
}

function sanitizeTrafficUiState(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const presets = Array.isArray(raw.presets) ? raw.presets.slice(0, 80).map(sanitizeTrafficPreset).filter(Boolean) : [];
  return { presets };
}

function sanitizeTrafficPreset(preset) {
  if (!preset || typeof preset !== 'object') return null;
  const id = sanitizeId(preset.id || `traffic-preset-${Date.now()}`);
  const name = trimText(preset.name || 'Preset', 80).trim();
  if (!id || !name) return null;

  return {
    id,
    name,
    filter: sanitizeTrafficFilterSnapshot(preset.filter),
  };
}

function sanitizeTrafficFilterSnapshot(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const filters = raw.filters && typeof raw.filters === 'object' ? raw.filters : {};
  const extension = raw.extension && typeof raw.extension === 'object' ? raw.extension : {};
  const legacyMode = String(extension.mode || '');
  const legacyValue = trimText(extension.value || '', 400);

  return {
    search: trimText(raw.search || '', 400),
    inScopeOnly: raw.inScopeOnly === true,
    filters: {
      method: sanitizeStringList(filters.method, 60, 40),
      status: sanitizeStringList(filters.status, 20, 20),
      host: sanitizeStringList(filters.host, 120, 240),
    },
    extension: {
      include: trimText(extension.include ?? (legacyMode === 'include' ? legacyValue : ''), 400),
      exclude: trimText(extension.exclude ?? (legacyMode === 'exclude' ? legacyValue : ''), 400),
    },
  };
}

function sanitizeStringList(value, maxItems, maxLength) {
  return Array.isArray(value) ? value.slice(0, maxItems).map((item) => trimText(item, maxLength)).filter(Boolean) : [];
}

function sanitizeEchoUiState(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const tabs = Array.isArray(raw.tabs) ? raw.tabs.slice(0, 200).map(sanitizeEchoTab).filter(Boolean) : [];
  const groups = Array.isArray(raw.groups) ? raw.groups.slice(0, 100).map(sanitizeEchoGroup).filter(Boolean) : [];
  const groupIds = new Set(groups.map((group) => group.id));

  for (const tab of tabs) {
    if (tab.groupId && !groupIds.has(tab.groupId)) {
      tab.groupId = '';
    }
  }

  const selectedTabId = tabs.some((tab) => tab.id === raw.selectedTabId) ? raw.selectedTabId : tabs[0]?.id || null;
  const selectedGroupId = groups.some((group) => group.id === raw.selectedGroupId) ? raw.selectedGroupId : null;

  return {
    tabs,
    groups,
    selectedTabId,
    selectedGroupId,
    split: clampNumber(raw.split, 25, 75, 50),
  };
}

function sanitizeEchoTab(tab) {
  if (!tab || typeof tab !== 'object') return null;
  const id = sanitizeId(tab.id);
  if (!id) return null;
  return {
    id,
    title: trimText(tab.title, 240),
    customTitle: Boolean(tab.customTitle),
    groupId: sanitizeId(tab.groupId),
    source: trimText(tab.source, 240),
    method: trimText(tab.method || 'GET', 24).toUpperCase(),
    rawRequest: typeof tab.rawRequest === 'string' ? tab.rawRequest : '',
    response: tab.response && typeof tab.response === 'object' ? tab.response : null,
    loading: false,
    error: typeof tab.error === 'string' ? trimText(tab.error, 2000) : null,
    durationMs: Number.isFinite(Number(tab.durationMs)) ? Number(tab.durationMs) : null,
    color: sanitizeColor(tab.color),
  };
}

function sanitizeEchoGroup(group) {
  if (!group || typeof group !== 'object') return null;
  const id = sanitizeId(group.id);
  if (!id) return null;
  return {
    id,
    title: trimText(group.title || 'Group', 120),
    color: sanitizeColor(group.color),
  };
}

function sanitizeId(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9:_-]/g, '')
    .slice(0, 120);
}

function sanitizeColor(value) {
  const color = String(value || '').trim();
  return ['cyan', 'pink', 'amber', 'violet', 'green', 'red'].includes(color) ? color : '';
}

function trimText(value, maxLength) {
  return String(value || '').slice(0, maxLength);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

module.exports = {
  ApiServer,
};
