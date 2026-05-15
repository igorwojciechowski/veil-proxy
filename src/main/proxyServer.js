const http = require('http');
const net = require('net');
const tls = require('tls');
const { EventEmitter } = require('events');
const { closeIdleTransports, createTunnel, requestViaTransport } = require('./transport');
const { CertificateAuthority } = require('./certAuthority');
const { buildFindings } = require('./findings');
const { loadActiveTemplates, loadPassiveTemplates, runActiveScan } = require('./scanner');
const { VeilCoreBridge } = require('./mcp/veilCoreBridge');
const {
  decodeBody,
  encodeBodyForClient,
  headersArrayToObject,
  normalizeHeaderObject,
  objectToRawHeaders,
  shouldKeepBody,
} = require('./httpMessage');

const SECURITY_SIGNAL =
  /\b(?:SQLITE_ERROR|SQL\s+syntax|syntax\s+error|ORA-\d{4,5}|ODBC|JDBC|PostgreSQL|MySQL|MariaDB|SQLite|SQL\s+Server|MongoError|SequelizeDatabaseError|PDOException|XPathException|SAXParseException|TemplateSyntaxError|Traceback|stack\s+trace|Exception|Command\s+failed|Permission\s+denied)\b|<script\b|javascript:|onerror\s*=|onload\s*=|alert\s*\(/i;

class ProxyServer extends EventEmitter {
  constructor(config, options = {}) {
    super();
    this.config = structuredClone(config);
    this.server = this.createHttpServer();
    this.store = options.store || null;
    this.history = Array.isArray(options.history) ? options.history : [];
    this.pending = new Map();
    this.pendingCounter = 1;
    this.flowCounter = nextFlowCounter(this.history);
    this.reportedFindings = sanitizeReportedFindings(options.reportedFindings || (this.store && this.store.getFindings ? this.store.getFindings() : []));
    this.sentTraffic = sanitizeSentTraffic(options.sentTraffic || (this.store && this.store.getSentTraffic ? this.store.getSentTraffic() : []));
    this.payloadAttacks = sanitizePayloadAttacks(options.payloadAttacks || (this.store && this.store.getPayloadAttacks ? this.store.getPayloadAttacks() : []));
    this.activeScans = [];
    this.port = this.config.proxyPort;
    this.certAuthority = new CertificateAuthority(this.config.https && this.config.https.certDir);
    this.mitmTargets = new WeakMap();
    this.mitmHttpServer = http.createServer(this.handleMitmHttpRequest.bind(this));
    this.mitmHttpServer.on('clientError', (_error, socket) => {
      if (socket && !socket.destroyed) {
        socket.destroy();
      }
    });
    this.mitmHttpServer.on('error', (error) => {
      this.emit('mitm-error', error);
    });
    this.veilCore = new VeilCoreBridge(() => ({ veilCore: this.config.veilCore }));
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
    this.persistConfig();
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
    const mcp = nextConfig.mcp || {};
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
      mcp: sanitizeMcp(
        Object.prototype.hasOwnProperty.call(nextConfig, 'mcp')
          ? {
              ...this.config.mcp,
              ...mcp,
            }
          : this.config.mcp,
      ),
      veilCore: Object.prototype.hasOwnProperty.call(nextConfig, 'veilCore')
        ? sanitizeVeilCore({ ...this.config.veilCore, ...nextConfig.veilCore })
        : sanitizeVeilCore(this.config.veilCore),
      upstreams: Object.prototype.hasOwnProperty.call(nextConfig, 'upstreams')
        ? sanitizeUpstreams(nextConfig.upstreams)
        : this.config.upstreams || [],
      upstreamRules: Object.prototype.hasOwnProperty.call(nextConfig, 'upstreamRules')
        ? sanitizeUpstreamRules(nextConfig.upstreamRules)
        : this.config.upstreamRules || [],
      rewriteRules: Object.prototype.hasOwnProperty.call(nextConfig, 'rewriteRules')
        ? sanitizeRewriteRules(nextConfig.rewriteRules)
        : this.config.rewriteRules || [],
    };

    if (this.config.mcp?.enabled !== true && candidate.mcp?.enabled === true && !hasConfiguredMcpScope(candidate.scope)) {
      throw new Error('Cannot enable MCP before scope is configured. Add at least one enabled include scope rule first.');
    }

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
    if (this.history.length > this.config.historyLimit) {
      this.history.length = this.config.historyLimit;
    }
    this.persistConfig();
    this.prunePersistedHistory();

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

  getFindings() {
    return sortFindings([...this.reportedFindings, ...buildFindings(this.history)]);
  }

  listScannerTemplates() {
    const summarize = (template) => ({
      id: String(template.id || ''),
      title: String(template.title || template.id || ''),
      category: String(template.category || ''),
      severity: String(template.severity || 'information'),
      confidence: String(template.confidence || 'firm'),
      insertionPoints: Array.isArray(template.insertionPoints) ? template.insertionPoints.map(String) : [],
      payloadCount: Array.isArray(template.payloads) ? template.payloads.length : 0,
    });
    return {
      passive: loadPassiveTemplates().map(summarize),
      active: loadActiveTemplates().map(summarize),
    };
  }

  async runActiveScannerFromRequest(payload = {}) {
    const sourceId = String(payload.id || payload.flowId || payload.sourceId || '');
    const flow = this.getFlow(sourceId);
    if (!flow || flow.type !== 'http' || !flow.request) {
      throw new Error('Captured HTTP request not found.');
    }
    if (payload.async === true || payload.background === true) {
      return this.startActiveScan(flow, payload);
    }
    const record = this.createActiveScanRecord(flow, payload, 'running');
    this.emitActiveScans();
    const result = await this.executeActiveScanRecord(record, flow, payload);
    return result;
  }

  startActiveScan(flow, payload = {}) {
    const record = this.createActiveScanRecord(flow, payload, 'running');
    this.activeScans.unshift(record);
    this.activeScans = this.activeScans.slice(0, 100);
    this.emitActiveScans();
    this.executeActiveScanRecord(record, flow, payload).catch((error) => {
      record.status = 'error';
      record.error = error.message;
      record.completedAt = Date.now();
      this.emitActiveScans();
    });
    return activeScanSummary(record);
  }

  createActiveScanRecord(flow, payload = {}, status = 'queued') {
    const startedAt = Date.now();
    return {
      id: `active-${flow.id}-${startedAt}`,
      sourceId: flow.id,
      sourceMethod: flow.request.method || '',
      sourceUrl: flow.request.url || '',
      sourceHost: safeUrlParts(flow.request.url || '').host || '',
      sourcePath: safeUrlParts(flow.request.url || '').path || '/',
      templateIds: Array.isArray(payload.templateIds) ? payload.templateIds.map(String).filter(Boolean) : [],
      maxRequests: normalizeActiveScanNumber(payload.maxRequests, 60),
      concurrency: normalizeActiveScanNumber(payload.concurrency, 3),
      requested: 0,
      executed: 0,
      matched: 0,
      findingIds: [],
      resultCount: 0,
      status,
      error: '',
      startedAt,
      completedAt: null,
      paused: false,
      stopped: false,
      stopReason: '',
      results: [],
      findings: [],
    };
  }

  async executeActiveScanRecord(record, flow, payload = {}) {
    record.status = 'running';
    const control = record;
    const result = await runActiveScan({
      proxy: this,
      flow,
      templateIds: Array.isArray(payload.templateIds) ? payload.templateIds : [],
      maxRequests: payload.maxRequests,
      concurrency: payload.concurrency,
      control,
      onProgress: (scanResult) => {
        if (!scanResult?.skipped) {
          record.executed += 1;
          record.resultCount += 1;
          if (scanResult.matched) record.matched += 1;
          if (scanResult.findingId && !record.findingIds.includes(scanResult.findingId)) {
            record.findingIds.push(scanResult.findingId);
          }
          record.results.push(scanResult);
          record.results = record.results.slice(-200);
          this.emitActiveScans();
        }
      },
    });
    record.status = record.stopped ? 'stopped' : 'completed';
    record.completedAt = result.completedAt || Date.now();
    record.requested = result.requested;
    record.executed = result.executed;
    record.matched = result.results.filter((item) => item?.matched).length;
    record.resultCount = result.results.length;
    record.findings = result.findings;
    record.findingIds = uniqueStrings([...(record.findingIds || []), ...result.findings.map((finding) => finding.id)]);
    record.results = result.results;
    this.emitActiveScans();
    return structuredClone({ ...result, activeScanId: record.id, status: record.status });
  }

  listActiveScans() {
    return this.activeScans.map(activeScanSummary);
  }

  getActiveScan(id) {
    const record = this.activeScans.find((item) => item.id === String(id)) || null;
    return record ? structuredClone(record) : null;
  }

  updateActiveScan(id, action) {
    const record = this.activeScans.find((item) => item.id === String(id));
    if (!record) return null;
    if (action === 'pause' && record.status === 'running') {
      record.paused = true;
      record.status = 'paused';
    } else if (action === 'resume' && record.status === 'paused') {
      record.paused = false;
      record.status = 'running';
    } else if (action === 'stop' && ['running', 'paused', 'queued'].includes(record.status)) {
      record.paused = false;
      record.stopped = true;
      record.stopReason = 'stopped';
      record.status = 'stopping';
    }
    this.emitActiveScans();
    return activeScanSummary(record);
  }

  deleteActiveScan(id) {
    const record = this.activeScans.find((item) => item.id === String(id));
    if (!record) return null;
    if (['running', 'paused', 'queued', 'stopping'].includes(record.status)) {
      record.stopped = true;
      record.paused = false;
      record.stopReason = 'deleted';
    }
    this.activeScans = this.activeScans.filter((item) => item.id !== String(id));
    this.emitActiveScans();
    return activeScanSummary(record);
  }

  emitActiveScans() {
    this.emit('active-scans', this.listActiveScans());
  }

  getReportedFindings() {
    return structuredClone(this.reportedFindings);
  }

  addReportedFinding(input = {}, flow = null) {
    const finding = buildReportedFinding(input, flow);
    const existingIndex = this.reportedFindings.findIndex((item) => item.id === finding.id);
    if (existingIndex >= 0) {
      const existing = this.reportedFindings[existingIndex];
      finding.count = Number(existing.count || 1) + 1;
      finding.flowIds = uniqueStrings([...(existing.flowIds || []), ...(finding.flowIds || [])]);
      finding.evidence = uniqueStrings([...(existing.evidence || []), ...(finding.evidence || [])]).slice(0, 12);
      finding.firstSeenAt = Math.min(Number(existing.firstSeenAt || finding.firstSeenAt), Number(finding.firstSeenAt));
      this.reportedFindings[existingIndex] = finding;
    } else {
      this.reportedFindings.unshift(finding);
    }
    this.reportedFindings = sortFindings(this.reportedFindings).slice(0, 500);
    this.persistReportedFindings();
    this.emit('findings', this.getFindings());
    return structuredClone(finding);
  }

  replaceReportedFindings(findings = []) {
    this.reportedFindings = sanitizeReportedFindings(findings).slice(0, 500);
    this.persistReportedFindings();
    this.emit('findings', this.getFindings());
    return this.getReportedFindings();
  }

  persistReportedFindings() {
    if (this.store && this.store.setFindings) {
      this.store.setFindings(this.reportedFindings);
    }
  }

  listSentTraffic() {
    return this.sentTraffic.map((record) => sentTrafficSummary(record));
  }

  getSentTraffic() {
    return structuredClone(this.sentTraffic);
  }

  getSentTrafficRecord(id) {
    const record = this.sentTraffic.find((item) => item.id === String(id)) || null;
    return record ? structuredClone(record) : null;
  }

  findSentTrafficBySourceId(sourceId) {
    const record = this.sentTraffic.find((item) => item.sourceId === String(sourceId)) || null;
    return record ? structuredClone(record) : null;
  }

  addSentTraffic(record = {}) {
    const normalized = sanitizeSentTrafficRecord(record);
    if (!normalized) {
      return null;
    }
    const existingIndex = this.sentTraffic.findIndex((item) => item.id === normalized.id);
    if (existingIndex >= 0) {
      this.sentTraffic.splice(existingIndex, 1);
    }
    this.sentTraffic.unshift(normalized);
    this.sentTraffic = this.sentTraffic.slice(0, 500);
    this.persistSentTraffic();
    this.emit('sent-traffic', this.listSentTraffic());
    return structuredClone(normalized);
  }

  replaceSentTraffic(records = []) {
    this.sentTraffic = sanitizeSentTraffic(records).slice(0, 500);
    this.persistSentTraffic();
    this.emit('sent-traffic', this.listSentTraffic());
    return this.getSentTraffic();
  }

  clearSentTraffic() {
    this.sentTraffic = [];
    this.persistSentTraffic();
    this.emit('sent-traffic', this.listSentTraffic());
    return [];
  }

  persistSentTraffic() {
    if (this.store && this.store.setSentTraffic) {
      this.store.setSentTraffic(this.sentTraffic);
    }
  }

  listPayloadAttacks() {
    return this.payloadAttacks.map((record) => payloadAttackSummary(record));
  }

  getPayloadAttacks() {
    return structuredClone(this.payloadAttacks);
  }

  getPayloadAttack(id) {
    const record = this.payloadAttacks.find((item) => item.id === String(id)) || null;
    return record ? structuredClone(record) : null;
  }

  addPayloadAttack(record = {}) {
    const normalized = sanitizePayloadAttack(record);
    if (!normalized) {
      return null;
    }
    const existingIndex = this.payloadAttacks.findIndex((item) => item.id === normalized.id);
    if (existingIndex >= 0) {
      this.payloadAttacks.splice(existingIndex, 1);
    }
    this.payloadAttacks.unshift(normalized);
    this.payloadAttacks = this.payloadAttacks.slice(0, 500);
    this.persistPayloadAttacks();
    this.emit('payload-attacks', this.listPayloadAttacks());
    return structuredClone(normalized);
  }

  replacePayloadAttacks(records = []) {
    this.payloadAttacks = sanitizePayloadAttacks(records).slice(0, 500);
    this.persistPayloadAttacks();
    this.emit('payload-attacks', this.listPayloadAttacks());
    return this.getPayloadAttacks();
  }

  clearPayloadAttacks() {
    this.payloadAttacks = [];
    this.persistPayloadAttacks();
    this.emit('payload-attacks', []);
    return [];
  }

  persistPayloadAttacks() {
    if (this.store && this.store.setPayloadAttacks) {
      this.store.setPayloadAttacks(this.payloadAttacks);
    }
  }

  replaceHistory(history, options = {}) {
    const nextHistory = Array.isArray(history) ? structuredClone(history).filter((flow) => flow && flow.id && flow.request) : [];
    this.history = nextHistory.slice(0, this.config.historyLimit);
    this.flowCounter = nextFlowCounter(this.history);
    this.reportedFindings = [];
    this.sentTraffic = [];
    this.payloadAttacks = [];

    if (options.persist !== false && this.store) {
      this.store.clearHistory();
      this.persistReportedFindings();
      this.persistSentTraffic();
      this.persistPayloadAttacks();
      for (const flow of this.history) {
        this.store.upsertFlow(flow);
      }
      this.store.pruneHistory(this.config.historyLimit);
    }

    return this.listHistory();
  }

  clearHistory() {
    this.history = [];
    this.flowCounter = 1;
    this.reportedFindings = [];
    this.sentTraffic = [];
    this.payloadAttacks = [];
    if (this.store) {
      this.store.clearHistory();
      this.persistReportedFindings();
      this.persistSentTraffic();
      this.persistPayloadAttacks();
    }
    this.emit('findings', this.getFindings());
    this.emit('sent-traffic', this.listSentTraffic());
    this.emit('payload-attacks', this.listPayloadAttacks());
    return this.listHistory();
  }

  async sendEchoRequest(payload = {}, options = {}) {
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
    let result;
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
      result = {
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
          httpVersion: upstreamResponse.httpVersion || '1.1',
          protocol: protocolLabel(upstreamResponse.httpVersion || '1.1'),
          alpnProtocol: normalizeAlpnProtocol(upstreamResponse.alpnProtocol),
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
      result = {
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

    if (options && options.recordHistory === true) {
      const recorded = this.recordToolHistory(result, options);
      if (recorded) {
        result.historyFlowId = recorded.id;
        result.source = recorded.source;
        result.tool = recorded.tool;
      }
    }

    return result;
  }

  recordToolHistory(sent = {}, options = {}) {
    if (!sent || !sent.request || !sent.request.url) {
      return null;
    }

    const startedAt = Number(sent.startedAt || Date.now());
    const completedAt = sent.completedAt == null ? Date.now() : Number(sent.completedAt);
    const responseProtocol = sent.response ? protocolLabel(sent.response.httpVersion || '1.1') : '';
    const flow = {
      id: String(this.flowCounter++),
      type: 'http',
      source: sanitizeTrafficSource(options.source || options.tool || 'tool'),
      tool: trimText(options.tool || options.source || 'tool', 80),
      sourceId: trimText(options.sourceId || '', 160),
      startedAt,
      completedAt,
      durationMs: sent.durationMs == null ? completedAt - startedAt : Number(sent.durationMs),
      protocol: {
        client: 'Tool',
        clientAlpn: '',
        proxiedAs: 'HTTP/1.1',
        upstream: responseProtocol,
        upstreamAlpn: sent.response ? normalizeAlpnProtocol(sent.response.alpnProtocol) : '',
      },
      request: {
        method: sent.request.method,
        url: sent.request.url,
        httpVersion: '1.1',
        protocol: 'Tool',
        alpnProtocol: '',
        headers: sent.request.headers || {},
        bodyBase64: sent.request.bodyBase64 || '',
        bodyText: sent.request.bodyText || '',
        bodyTruncated: sent.request.bodyTruncated === true,
      },
      response: sent.response
        ? {
            statusCode: sent.response.statusCode,
            statusMessage: sent.response.statusMessage,
            httpVersion: sent.response.httpVersion || '1.1',
            protocol: sent.response.protocol || responseProtocol,
            alpnProtocol: normalizeAlpnProtocol(sent.response.alpnProtocol),
            headers: sent.response.headers || {},
            bodyBase64: sent.response.bodyBase64 || '',
            bodyText: sent.response.bodyText || '',
            bodyEncoding: sent.response.bodyEncoding || '',
            bodyTruncated: sent.response.bodyTruncated === true,
          }
        : null,
      error: sent.error || null,
      notes: uniqueStrings([options.note || '', options.sourceId ? `Source req: ${options.sourceId}` : '']).slice(0, 6),
    };

    this.addHistory(flow);
    this.emitHistory(flow);
    return this.summarizeFlow(flow);
  }

  async runPayloadAttackFromRequest(payload = {}) {
    const input = sanitizeManualPayloadAttackInput(payload);
    const variants = buildManualAttackVariants(input);
    if (variants.length === 0) {
      throw new Error('Fuzzer needs at least one generated payload variant.');
    }

    const attackId = `attack-user-${input.sourceId || 'manual'}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const startedAt = Date.now();
    const statusCodes = {};
    const outcomes = [];

    const executeVariant = async (variant, baseline) => {
      const rawRequest = applyManualAttackVariant(input.rawRequest, variant);
      let sent = null;
      let saved = null;
      try {
        sent = await this.sendEchoRequest(
          { rawRequest },
          {
            recordHistory: true,
            source: 'attacks',
            tool: 'Fuzzer',
            sourceId: input.sourceId,
            note: `Fuzzer ${attackId} variant ${variant.index}`,
          },
        );
        saved = this.addSentTraffic(manualAttackSentRecord(input.sourceId, variant.index, sent, 'Fuzzer'));
      } catch (error) {
        const now = Date.now();
        sent = {
          startedAt: now,
          completedAt: now,
          durationMs: 0,
          request: null,
          response: null,
          error: error.message,
        };
      }
      const summary = manualAttackSummary(saved || sent, variant, baseline);
      if (summary.statusCode) {
        statusCodes[summary.statusCode] = (statusCodes[summary.statusCode] || 0) + 1;
      }
      return summary;
    };

    const first = await executeVariant(variants[0], null);
    outcomes.push(first);
    const baseline = first;
    const remaining = await runWithConcurrency(variants.slice(1), input.concurrency, async (variant) => {
      if (input.delayMillis > 0) {
        await sleep(input.delayMillis);
      }
      return executeVariant(variant, baseline);
    });
    outcomes.push(...remaining);
    const results = outcomes.sort((a, b) => a.index - b.index);
    const completedAt = Date.now();
    const firstRequest = results.find((item) => item.url || item.method) || {};
    const record = this.addPayloadAttack({
      id: attackId,
      sourceId: input.sourceId,
      method: firstRequest.method,
      url: firstRequest.url,
      insertionPoint: {
        type: 'marked',
        mode: input.mode,
        count: input.insertionPoints.length,
        insertionPoints: input.insertionPoints.map((point) => ({
          id: point.id,
          name: point.name,
          listId: point.listId,
        })),
      },
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      requestedPayloads: variants.length,
      executed: results.length,
      sent: results.filter((item) => !item.error).length,
      errors: results.filter((item) => item.error).length,
      interesting: results.filter((item) => item.interesting).length,
      reflectedCount: results.filter((item) => item.payloadReflected).length,
      securitySignalCount: results.filter((item) => item.securitySignal).length,
      concurrency: input.concurrency,
      delayMillis: input.delayMillis,
      statusCodes,
      results,
      details: [],
      detailsTruncated: false,
      secretAliasesUsed: [],
    });
    return record;
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
      protocol: {
        client: protocolLabel(clientReq.httpVersion),
        clientAlpn: normalizeAlpnProtocol(clientReq.socket && clientReq.socket.alpnProtocol),
        proxiedAs: 'HTTP/1.1',
        upstream: null,
        upstreamAlpn: '',
      },
      request: {
        method: clientReq.method,
        url: target.href,
        httpVersion: clientReq.httpVersion,
        protocol: protocolLabel(clientReq.httpVersion),
        alpnProtocol: normalizeAlpnProtocol(clientReq.socket && clientReq.socket.alpnProtocol),
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
      this.applyRewriteRules('request', flow);

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
        this.emitHistory(flow);
        return;
      }

      if (requestDecision.action === 'modify') {
        applyRequestModification(flow, requestDecision);
      }

      this.emitHistory(flow);

      const outboundUrl = new URL(flow.request.url);
      const upstreamResponse = await requestViaTransport({
        targetUrl: outboundUrl,
        method: flow.request.method,
        headers: normalizeHeaderObject(flow.request.headers),
        body: Buffer.from(flow.request.bodyBase64 || '', 'base64'),
        upstream: this.resolveUpstream(outboundUrl),
        maxBodyBytes: this.config.maxBodyBytes,
        ignoreCertificateErrors: Boolean(this.config.https && this.config.https.ignoreUpstreamCertificateErrors),
      });

      const decoded = decodeBody(upstreamResponse.headers, upstreamResponse.body);
      flow.protocol.upstream = protocolLabel(upstreamResponse.httpVersion || '1.1');
      flow.protocol.upstreamAlpn = normalizeAlpnProtocol(upstreamResponse.alpnProtocol);
      flow.response = {
        statusCode: upstreamResponse.statusCode,
        statusMessage: upstreamResponse.statusMessage,
        httpVersion: upstreamResponse.httpVersion || '1.1',
        protocol: protocolLabel(upstreamResponse.httpVersion || '1.1'),
        alpnProtocol: normalizeAlpnProtocol(upstreamResponse.alpnProtocol),
        headers: headersArrayToObject(upstreamResponse.rawHeaders),
        bodyBase64: upstreamResponse.body.toString('base64'),
        bodyText: decoded.text,
        bodyEncoding: decoded.encoding,
        bodyTruncated: upstreamResponse.body.truncated,
      };

      this.applyRewriteRules('response', flow);

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
        this.emitHistory(flow);
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
      this.emitHistory(flow);
    } catch (error) {
      flow.error = error.message;
      flow.completedAt = Date.now();
      flow.durationMs = flow.completedAt - flow.startedAt;
      this.emitHistory(flow);

      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      }
      clientRes.end(`Veil Proxy upstream error: ${error.message}`);
    }
  }

  veilCoreConfig() {
    return sanitizeVeilCore(this.config.veilCore);
  }

  async prepareVeilCoreOutboundRequest(flow) {
    const request = flow.request || {};
    const headers = normalizeHeaderObject(request.headers || {});
    const body = Buffer.from(request.bodyBase64 || '', 'base64');
    const outbound = {
      method: request.method || 'GET',
      url: request.url || '',
      headers: { ...headers },
      body,
    };
    const cfg = this.veilCoreConfig();
    if (!cfg.enabled || !cfg.rehydrateRequests) {
      return outbound;
    }

    try {
      const urlResult = await this.veilCore.detokenizeText(outbound.url, 'upstream_request');
      outbound.url = urlResult.text || outbound.url;
      const outboundUrl = new URL(outbound.url);

      const nextHeaders = {};
      for (const [name, value] of Object.entries(outbound.headers)) {
        const detokenized = await this.veilCore.detokenizeText(String(value), 'upstream_request');
        nextHeaders[name] = detokenized.text;
      }
      nextHeaders.host = outboundUrl.host;
      outbound.headers = nextHeaders;

      if (body.length > 0 && canRewriteHttpBody(outbound.headers) && isVeilCoreTextContent(outbound.headers)) {
        const bodyResult = await this.veilCore.detokenizeText(request.bodyText || body.toString('utf8'), 'upstream_request');
        outbound.body = Buffer.from(bodyResult.text || '', 'utf8');
        outbound.headers['content-length'] = String(outbound.body.length);
        delete outbound.headers['content-md5'];
      }
      return outbound;
    } catch (error) {
      flow.notes.push(`Veil Core request rehydration failed: ${error.message}`);
      if (cfg.fallbackOnError === false) {
        throw error;
      }
      return outbound;
    }
  }

  async applyVeilCoreRequestSanitization(flow) {
    const cfg = this.veilCoreConfig();
    if (!cfg.enabled || !flow.request) {
      return;
    }

    try {
      const urlResult = await this.veilCore.sanitizeText(flow.request.url || '', 'proxy_request');
      flow.request.url = urlResult.text || flow.request.url;

      const headers = normalizeHeaderObject(flow.request.headers || {});
      const nextHeaders = {};
      for (const [name, value] of Object.entries(headers)) {
        const headerResult = await this.veilCore.sanitizeText(String(value), 'proxy_request');
        nextHeaders[name] = headerResult.text;
      }
      flow.request.headers = nextHeaders;

      if (flow.request.bodyBase64 && canRewriteHttpBody(flow.request.headers) && isVeilCoreTextContent(flow.request.headers)) {
        const bodyResult = await this.veilCore.sanitizeText(flow.request.bodyText || '', 'proxy_request');
        flow.request.bodyText = bodyResult.text;
        flow.request.bodyBase64 = Buffer.from(bodyResult.text, 'utf8').toString('base64');
        flow.request.headers['content-length'] = String(Buffer.byteLength(bodyResult.text));
        delete flow.request.headers['content-md5'];
      }
    } catch (error) {
      flow.notes.push(`Veil Core request sanitization failed: ${error.message}`);
      throw new Error('Veil Core request sanitization failed; refusing to store unsanitized request.');
    }
  }

  async applyVeilCoreResponseSanitization(flow) {
    const cfg = this.veilCoreConfig();
    if (!cfg.enabled || !cfg.sanitizeResponses || !flow.response) {
      return;
    }
    if (!canRewriteHttpBody(flow.response.headers) || !isVeilCoreTextContent(flow.response.headers)) {
      return;
    }

    try {
      const current = flow.response.bodyText || Buffer.from(flow.response.bodyBase64 || '', 'base64').toString('utf8');
      const sanitized = await this.veilCore.sanitizeText(current, 'proxy_response');
      if (sanitized.text !== current) {
        flow.response.bodyText = sanitized.text;
        flow.response.bodyBase64 = Buffer.from(sanitized.text, 'utf8').toString('base64');
        flow.response.bodyEncoding = 'identity';
        const headers = normalizeHeaderObject(flow.response.headers);
        delete headers['content-encoding'];
        delete headers['content-md5'];
        headers['content-length'] = String(Buffer.byteLength(sanitized.text));
        flow.response.headers = headers;
        flow.notes.push(`Veil Core sanitized response (${sanitized.aliasMappings || 0} tokens).`);
      }
    } catch (error) {
      flow.notes.push(`Veil Core response sanitization failed: ${error.message}`);
      throw new Error('Veil Core response sanitization failed; refusing to return unsanitized response.');
    }
  }

  async sanitizeStoredVeilCoreResponse(flow) {
    try {
      await this.applyVeilCoreResponseSanitization(flow);
    } catch (error) {
      if (flow.response) {
        const message = '[Veil Core blocked response body: sanitization failed]';
        flow.response.bodyText = message;
        flow.response.bodyBase64 = Buffer.from(message, 'utf8').toString('base64');
        flow.response.bodyEncoding = 'identity';
        const headers = normalizeHeaderObject(flow.response.headers);
        delete headers['content-encoding'];
        delete headers['content-md5'];
        headers['content-type'] = headers['content-type'] || 'text/plain; charset=utf-8';
        headers['content-length'] = String(Buffer.byteLength(message));
        flow.response.headers = headers;
      }
      flow.notes.push(error.message);
    }
  }

  async auditVeilCoreTraffic(flow) {
    const cfg = this.veilCoreConfig();
    if (!cfg.enabled || !cfg.auditTraffic) {
      return;
    }

    try {
      await this.veilCore.auditEventBatch([
        {
          operation: 'proxy_http_flow',
          subject: 'traffic',
          action: 'forward',
          summary: `${flow.request?.method || 'GET'} ${flow.request?.url || ''} -> ${flow.response?.statusCode || flow.error || 'ERR'}`,
          metadata: {
            flow_id: flow.id,
            status_code: flow.response ? flow.response.statusCode : null,
            error: flow.error || null,
          },
        },
      ]);
    } catch (error) {
      flow.notes.push(`Veil Core audit failed: ${error.message}`);
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
      protocol: {
        client: protocolLabel(req.httpVersion),
        clientAlpn: '',
        proxiedAs: 'TCP tunnel',
        upstream: '',
        upstreamAlpn: '',
      },
      request: {
        method: 'CONNECT',
        url: req.url,
        httpVersion: req.httpVersion,
        protocol: protocolLabel(req.httpVersion),
        alpnProtocol: '',
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
    this.emitHistory(flow);

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
          this.emitHistory(flow);
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
      this.emitHistory(flow);
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
      const finalize = () => {
        if (!flow.completedAt) {
          flow.completedAt = Date.now();
          flow.durationMs = flow.completedAt - startedAt;
          this.emitHistory(flow);
        }
      };
      const markError = (error) => {
        if (error && !flow.error) {
          flow.error = error.message;
        }
      };

      clientSocket.on('error', markError);
      clientSocket.on('close', finalize);

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

      tlsSocket.once('secure', () => {
        this.mitmHttpServer.emit('connection', tlsSocket);
      });
      tlsSocket.on('data', (chunk) => {
        flow.tunnel.bytesUp += chunk.length;
      });
      tlsSocket.on('error', markError);
      tlsSocket.on('close', finalize);
    } catch (error) {
      flow.error = error.message;
      flow.completedAt = Date.now();
      flow.durationMs = flow.completedAt - startedAt;
      this.emitHistory(flow);
      if (!clientSocket.destroyed) {
        clientSocket.end('HTTP/1.1 502 Bad Gateway\r\ncontent-type: text/plain\r\n\r\nVeil Proxy HTTPS MITM error\r\n');
      }
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
    this.persistFlow(flow);
    this.prunePersistedHistory();
  }

  emitHistory(flow) {
    this.persistFlow(flow);
    this.emit('history', this.summarizeFlow(flow));
  }

  async addFlowHistory(flow) {
    const stored = await this.sanitizeFlowForStorage(flow);
    this.addHistory(stored);
  }

  async emitFlowHistory(flow) {
    const stored = await this.sanitizeFlowForStorage(flow);
    const index = this.history.findIndex((item) => item.id === stored.id);
    if (index >= 0) {
      this.history[index] = stored;
    } else {
      this.history.unshift(stored);
      if (this.history.length > this.config.historyLimit) {
        this.history.length = this.config.historyLimit;
      }
      this.prunePersistedHistory();
    }
    this.emitHistory(stored);
  }

  async sanitizeFlowForStorage(flow) {
    const stored = structuredClone(flow);
    try {
      await this.applyVeilCoreRequestSanitization(stored);
      await this.sanitizeStoredVeilCoreResponse(stored);
    } catch (error) {
      stored.notes = Array.isArray(stored.notes) ? stored.notes : [];
      stored.notes.push(error.message);
      if (stored.request) {
        stored.request.bodyText = '[Veil Core blocked request body: sanitization failed]';
        stored.request.bodyBase64 = Buffer.from(stored.request.bodyText, 'utf8').toString('base64');
      }
      if (stored.response) {
        stored.response.bodyText = '[Veil Core blocked response body: sanitization failed]';
        stored.response.bodyBase64 = Buffer.from(stored.response.bodyText, 'utf8').toString('base64');
      }
    }
    return stored;
  }

  persistFlow(flow) {
    if (!this.store) {
      return;
    }
    this.store.upsertFlow(flow);
  }

  persistConfig() {
    if (this.store) {
      this.store.setConfig(this.config);
    }
  }

  prunePersistedHistory() {
    if (this.store) {
      this.store.pruneHistory(this.config.historyLimit);
    }
  }

  summarizeFlow(flow) {
    return {
      id: flow.id,
      type: flow.type,
      source: sanitizeTrafficSource(flow.source || (flow.tool ? 'tool' : 'proxy')),
      tool: trimText(flow.tool || trafficSourceLabel(flow.source || 'proxy'), 80),
      sourceId: trimText(flow.sourceId || '', 160),
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
      protocol: flow.protocol || protocolSummaryFromFlow(flow),
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

  applyRewriteRules(stage, flow) {
    const activeRules = sanitizeRewriteRules(this.config.rewriteRules).filter(
      (rule) => rule.enabled && (rule.stage === stage || rule.stage === 'both'),
    );
    for (const rule of activeRules) {
      const changed = applyRewriteRule(stage, flow, rule);
      if (changed) {
        flow.notes.push(`Rewrite applied: ${rule.name || rule.id} (${rule.id})`);
      }
    }
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

function nextFlowCounter(history) {
  const maxId = (Array.isArray(history) ? history : []).reduce((max, flow) => {
    const id = Number(flow && flow.id);
    return Number.isFinite(id) ? Math.max(max, id) : max;
  }, 0);
  return maxId + 1;
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

function protocolLabel(httpVersion) {
  const version = String(httpVersion || '').trim();
  return version ? `HTTP/${version}` : '';
}

function normalizeAlpnProtocol(value) {
  return value && value !== false ? String(value) : '';
}

function sanitizeTrafficSource(value) {
  const source = String(value || 'proxy')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  if (!source || source === 'tool') return 'tool';
  if (source === 'attack' || source === 'payload-attack') return 'attacks';
  return source;
}

function trafficSourceLabel(source) {
  const normalized = sanitizeTrafficSource(source);
  if (normalized === 'proxy') return 'Proxy';
  if (normalized === 'echo') return 'Relay';
  if (normalized === 'attacks') return 'Fuzzer';
  if (normalized === 'mcp') return 'MCP';
  return normalized
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ') || 'Tool';
}

function protocolSummaryFromFlow(flow) {
  return {
    client: flow?.request?.protocol || protocolLabel(flow?.request?.httpVersion),
    clientAlpn: normalizeAlpnProtocol(flow?.request?.alpnProtocol),
    proxiedAs: flow?.type === 'http' ? 'HTTP/1.1' : '',
    upstream: flow?.response?.protocol || protocolLabel(flow?.response?.httpVersion),
    upstreamAlpn: normalizeAlpnProtocol(flow?.response?.alpnProtocol),
  };
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
    throw new Error('Relay request URL must be absolute and use http or https.');
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

function sanitizeRewriteRules(rawRules) {
  if (!Array.isArray(rawRules)) return [];
  return rawRules
    .slice(0, 100)
    .map((rule, index) => {
      const raw = rule && typeof rule === 'object' ? rule : {};
      const stage = ['request', 'response', 'both'].includes(raw.stage) ? raw.stage : 'request';
      const target = ['url', 'method', 'status', 'statusMessage', 'header', 'body'].includes(raw.target) ? raw.target : 'body';
      const matchType = ['literal', 'regex'].includes(raw.matchType) ? raw.matchType : 'literal';
      const headerName = String(raw.headerName || '').trim().slice(0, 120);
      if (target === 'header' && !headerName) {
        return null;
      }
      return {
        id: String(raw.id || `rewrite-${Date.now()}-${index}`),
        name: String(raw.name || `Rewrite ${index + 1}`).trim().slice(0, 120),
        enabled: raw.enabled !== false,
        stage,
        target,
        headerName,
        matchType,
        match: String(raw.match || '').slice(0, 4000),
        replace: String(raw.replace || '').slice(0, 4000),
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
    throw new Error('Relay raw request must start with an HTTP request line.');
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
      throw new Error('Relay raw request with relative target requires a Host header.');
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
    const operator = ['contains', 'equals', 'startsWith', 'endsWith', 'regex', 'exists', 'domain', 'domainSubdomains'].includes(rule.operator)
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
    const operator = ['contains', 'equals', 'startsWith', 'endsWith', 'regex', 'exists', 'domain', 'domainSubdomains'].includes(rule.operator)
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

function sanitizeMcp(mcp) {
  const raw = mcp && typeof mcp === 'object' ? mcp : {};
  return {
    enabled: raw.enabled === true,
    host: ['127.0.0.1', 'localhost', '::1'].includes(String(raw.host || '127.0.0.1')) ? String(raw.host || '127.0.0.1') : '127.0.0.1',
    port: normalizeMcpPort(raw.port),
    token: String(raw.token || '').slice(0, 512),
    requireScope: raw.requireScope === true,
    activeTesting: raw.activeTesting === true,
    anonymization: sanitizeMcpAnonymization(raw.anonymization),
    veilCore: sanitizeMcpVeilCore(raw.veilCore),
  };
}

function hasConfiguredMcpScope(scope) {
  const normalized = sanitizeScope(scope);
  if (!normalized.enabled) {
    return false;
  }
  return normalized.rules.some((rule) => rule.enabled !== false && rule.action === 'include' && String(rule.value || '').trim());
}

function sanitizeMcpAnonymization(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const profile = ['balanced', 'strict', 'local', 'custom'].includes(String(raw.profile || 'balanced')) ? String(raw.profile || 'balanced') : 'balanced';
  const profiled = anonymizationProfileOptions(profile);
  return {
    ...profiled,
    profile,
    aggressivePathRedaction: boolOrDefault(raw.aggressivePathRedaction, profiled.aggressivePathRedaction),
    redactHosts: boolOrDefault(raw.redactHosts, profiled.redactHosts),
    redactCookieNames: boolOrDefault(raw.redactCookieNames, profiled.redactCookieNames),
    redactCookieValues: boolOrDefault(raw.redactCookieValues, profiled.redactCookieValues),
    redactAuthorization: boolOrDefault(raw.redactAuthorization, profiled.redactAuthorization),
    redactPlatformHeaders: boolOrDefault(raw.redactPlatformHeaders, profiled.redactPlatformHeaders),
    maxBodyChars: clampNumber(raw.maxBodyChars, 4096, 2 * 1024 * 1024, profiled.maxBodyChars),
  };
}

function sanitizeMcpVeilCore(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const socketPath = String(raw.socketPath || process.env.VEIL_CORE_SOCKET || '/run/veil/veil.sock').slice(0, 1000);
  const scopeId = String(raw.scopeId || process.env.VEIL_CORE_SCOPE_ID || 'veil-proxy-default')
    .replace(/[^\w:.-]+/g, '-')
    .slice(0, 160) || 'veil-proxy-default';
  const caller = String(raw.caller || 'veil-proxy').replace(/[^\w:.-]+/g, '-').slice(0, 120) || 'veil-proxy';
  const policyMode = String(raw.policyMode || 'default').replace(/[^\w:.-]+/g, '-').slice(0, 80) || 'default';
  return {
    enabled: raw.enabled === true || process.env.VEIL_CORE_ENABLED === '1',
    socketPath,
    scopeId,
    caller,
    policyMode,
    autoCreateScope: raw.autoCreateScope !== false,
    fallbackOnError: raw.fallbackOnError !== false,
    ensureDefaultPolicies: raw.ensureDefaultPolicies !== false,
    cacheEntries: clampNumber(raw.cacheEntries, 0, 10000, 1000),
  };
}

function sanitizeVeilCore(value) {
  const normalized = sanitizeMcpVeilCore(value);
  const raw = value && typeof value === 'object' ? value : {};
  return {
    ...normalized,
    sanitizeResponses: raw.sanitizeResponses !== false,
    rehydrateRequests: raw.rehydrateRequests !== false,
    auditTraffic: raw.auditTraffic !== false,
  };
}

function canRewriteHttpBody(headers = {}) {
  const encoding = headerValue(headers, 'content-encoding').trim().toLowerCase();
  return !encoding || encoding === 'identity';
}

function isVeilCoreTextContent(headers = {}) {
  const contentType = headerValue(headers, 'content-type').split(';', 1)[0].trim().toLowerCase();
  if (!contentType) {
    return false;
  }
  if (contentType.startsWith('text/')) {
    return true;
  }
  return [
    'application/json',
    'application/x-www-form-urlencoded',
    'application/xml',
    'application/graphql',
    'application/javascript',
  ].includes(contentType) || contentType.endsWith('+json') || contentType.endsWith('+xml');
}

function anonymizationProfileOptions(profile) {
  if (profile === 'strict') {
    return {
      aggressivePathRedaction: true,
      redactHosts: true,
      redactCookieNames: true,
      redactCookieValues: true,
      redactAuthorization: true,
      redactPlatformHeaders: true,
      maxBodyChars: 128 * 1024,
    };
  }
  if (profile === 'local') {
    return {
      aggressivePathRedaction: false,
      redactHosts: false,
      redactCookieNames: false,
      redactCookieValues: false,
      redactAuthorization: true,
      redactPlatformHeaders: false,
      maxBodyChars: 512 * 1024,
    };
  }
  return {
    aggressivePathRedaction: false,
    redactHosts: true,
    redactCookieNames: true,
    redactCookieValues: true,
    redactAuthorization: true,
    redactPlatformHeaders: false,
    maxBodyChars: 256 * 1024,
  };
}

function boolOrDefault(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeMcpPort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return 8765;
  }
  return port;
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

  if (operator === 'domain' || operator === 'domainSubdomains') {
    return matchesDomainCandidate(haystackRaw, needleRaw, operator === 'domainSubdomains');
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

function matchesDomainCandidate(candidate, value, includeSubdomains) {
  const host = normalizeDomain(candidate);
  const domain = normalizeDomain(value);
  if (!host || !domain) return false;
  return host === domain || (includeSubdomains && host.endsWith(`.${domain}`));
}

function normalizeDomain(value) {
  const text = String(value || '')
    .trim()
    .replace(/^\*\./, '')
    .split(/[/?#]/, 1)[0];
  if (!text) return '';

  try {
    return new URL(text.includes('://') ? text : `http://${text}`).hostname.toLowerCase();
  } catch {
    return text
      .replace(/:\d+$/, '')
      .toLowerCase();
  }
}

function applyRewriteRule(stage, flow, rule) {
  if (flow.type !== 'http') return false;
  if (stage === 'request') {
    return applyRequestRewrite(flow, rule);
  }
  return applyResponseRewrite(flow, rule);
}

function applyRequestRewrite(flow, rule) {
  if (rule.target === 'url') {
    const next = rewriteText(flow.request.url || '', rule);
    if (next === flow.request.url || !/^https?:\/\//i.test(next)) return false;
    flow.request.url = next;
    const headers = normalizeHeaderObject(flow.request.headers);
    headers.host = new URL(next).host;
    flow.request.headers = headers;
    return true;
  }

  if (rule.target === 'method') {
    const next = rewriteText(flow.request.method || '', rule).trim().toUpperCase();
    if (!next || next === flow.request.method || !/^[A-Z0-9_-]{1,24}$/.test(next)) return false;
    flow.request.method = next;
    return true;
  }

  if (rule.target === 'header') {
    return rewriteHeaderValue(flow.request.headers, rule);
  }

  if (rule.target === 'body') {
    return rewriteMessageBody(flow.request, rule, false);
  }

  return false;
}

function applyResponseRewrite(flow, rule) {
  if (!flow.response) return false;

  if (rule.target === 'status') {
    const next = Number(rewriteText(String(flow.response.statusCode || ''), rule));
    if (!Number.isInteger(next) || next < 100 || next > 599 || next === flow.response.statusCode) return false;
    flow.response.statusCode = next;
    return true;
  }

  if (rule.target === 'statusMessage') {
    const next = rewriteText(flow.response.statusMessage || '', rule);
    if (next === flow.response.statusMessage) return false;
    flow.response.statusMessage = next.slice(0, 120);
    return true;
  }

  if (rule.target === 'header') {
    return rewriteHeaderValue(flow.response.headers, rule);
  }

  if (rule.target === 'body') {
    return rewriteMessageBody(flow.response, rule, true);
  }

  return false;
}

function rewriteHeaderValue(headers, rule) {
  const normalized = normalizeHeaderObject(headers);
  const key = Object.keys(normalized).find((name) => name.toLowerCase() === rule.headerName.toLowerCase()) || rule.headerName.toLowerCase();
  const current = normalized[key] || '';
  const next = rule.match ? rewriteText(current, rule) : rule.replace;
  if (next === current) return false;
  if (next === '' && current) {
    delete normalized[key];
  } else {
    normalized[key] = next;
  }
  Object.keys(headers).forEach((name) => delete headers[name]);
  Object.assign(headers, normalized);
  return true;
}

function rewriteMessageBody(message, rule, response) {
  const current = message.bodyText || '';
  const next = rewriteText(current, rule);
  if (next === current) return false;

  message.bodyText = next;
  message.bodyBase64 = Buffer.from(next).toString('base64');
  const headers = normalizeHeaderObject(message.headers);
  headers['content-length'] = String(Buffer.byteLength(next));
  if (response) {
    delete headers['content-encoding'];
  }
  message.headers = headers;
  return true;
}

function rewriteText(value, rule) {
  const text = String(value || '');
  if (rule.matchType === 'regex') {
    try {
      return text.replace(new RegExp(rule.match || '', 'g'), rule.replace || '');
    } catch {
      return text;
    }
  }
  if (!rule.match) {
    return text;
  }
  return text.split(rule.match).join(rule.replace || '');
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

function buildReportedFinding(input, flow) {
  const now = Date.now();
  const parts = safeUrlParts(input.url || flow?.request?.url || '');
  const sourceId = String(input.sourceId || flow?.id || '');
  const flowIds = uniqueStrings([
    ...(Array.isArray(input.flowIds) ? input.flowIds : []),
    sourceId,
  ]);
  const title = trimText(input.title || input.name || 'Reported issue', 160) || 'Reported issue';
  const detail = trimText(input.detail || input.description || '', 4000);
  const remediation = trimText(input.remediation || '', 2000);
  const evidence = uniqueStrings([
    ...(Array.isArray(input.evidence) ? input.evidence : [input.evidence]),
    detail,
    remediation ? `Remediation: ${remediation}` : '',
  ]).filter(Boolean);

  return {
    id: trimText(input.id, 240) || `mcp:${sourceId || 'sent'}:${slug(title)}:${now}`,
    source: trimText(input.source || 'mcp', 40),
    evidenceSource: input.evidenceSource || 'proxy_history',
    reporter: trimText(input.reporter || 'Codex', 80),
    category: trimText(input.category || '', 80),
    confidence: normalizeConfidence(input.confidence),
    severity: normalizeSeverity(input.severity),
    title,
    description: detail || title,
    remediation,
    host: parts.host,
    path: parts.path || '/',
    url: parts.url,
    method: trimText(input.method || flow?.request?.method || '', 24).toUpperCase(),
    statusCode: input.statusCode == null ? flow?.response?.statusCode || null : Number(input.statusCode),
    count: 1,
    flowIds,
    evidence: evidence.slice(0, 12),
    firstSeenAt: Number(input.firstSeenAt || flow?.startedAt || now),
    lastSeenAt: Number(input.lastSeenAt || now),
    mcpReportedAt: input.mcpReportedAt || new Date(now).toISOString(),
    sentTrafficId: input.sentTrafficId ? String(input.sentTrafficId) : '',
  };
}

function sanitizeSentTraffic(value) {
  if (!Array.isArray(value)) return [];
  return value.map(sanitizeSentTrafficRecord).filter(Boolean).slice(0, 500);
}

function sanitizeSentTrafficRecord(record) {
  if (!record || typeof record !== 'object' || !record.request) return null;
  const id = trimText(record.id, 160) || `sent:${Date.now()}`;
  const request = sanitizeSentMessage(record.request);
  if (!request.url) return null;
  const response = record.response && typeof record.response === 'object' ? sanitizeSentResponse(record.response) : null;
  return {
    id,
    sourceId: trimText(record.sourceId, 160),
    tool: trimText(record.tool || record.origin || 'mcp', 80),
    type: 'http',
    startedAt: Number(record.startedAt || Date.now()),
    completedAt: record.completedAt == null ? null : Number(record.completedAt),
    durationMs: record.durationMs == null ? null : Number(record.durationMs),
    request,
    response,
    error: record.error ? trimText(record.error, 2000) : null,
    notes: Array.isArray(record.notes) ? record.notes.map((note) => trimText(note, 240)).filter(Boolean) : [],
  };
}

function sanitizeSentMessage(message) {
  return {
    method: trimText(message.method || 'GET', 24).toUpperCase(),
    url: trimText(message.url, 4096),
    headers: message.headers && typeof message.headers === 'object' ? message.headers : {},
    bodyBase64: typeof message.bodyBase64 === 'string' ? message.bodyBase64 : '',
    bodyText: typeof message.bodyText === 'string' ? message.bodyText : '',
    bodyEncoding: typeof message.bodyEncoding === 'string' ? message.bodyEncoding : '',
    bodyTruncated: message.bodyTruncated === true,
  };
}

function sanitizeSentResponse(response) {
  return {
    statusCode: response.statusCode == null ? null : Number(response.statusCode),
    statusMessage: trimText(response.statusMessage || '', 120),
    httpVersion: trimText(response.httpVersion || '1.1', 20),
    headers: response.headers && typeof response.headers === 'object' ? response.headers : {},
    bodyBase64: typeof response.bodyBase64 === 'string' ? response.bodyBase64 : '',
    bodyText: typeof response.bodyText === 'string' ? response.bodyText : '',
    bodyEncoding: typeof response.bodyEncoding === 'string' ? response.bodyEncoding : '',
    bodyTruncated: response.bodyTruncated === true,
  };
}

function sentTrafficSummary(record) {
  const parts = safeUrlParts(record.request?.url || '');
  return {
    id: String(record.id || ''),
    sourceId: String(record.sourceId || ''),
    tool: record.tool || 'mcp',
    method: record.request?.method || '',
    url: parts.url,
    host: parts.host,
    path: `${parts.path || '/'}${parts.query || ''}`,
    statusCode: record.response?.statusCode || null,
    statusMessage: record.response?.statusMessage || '',
    error: record.error || null,
    startedAt: record.startedAt || null,
    completedAt: record.completedAt || null,
    durationMs: record.durationMs,
    requestSize: sentBodyBytes(record.request),
    responseSize: record.response ? sentBodyBytes(record.response) : 0,
    notes: record.notes || [],
  };
}

function sentBodyBytes(message) {
  if (!message) return 0;
  const base64 = String(message.bodyBase64 || '').replace(/\s+/g, '');
  if (base64) {
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  }
  return Buffer.byteLength(message.bodyText || '', 'utf8');
}

function sanitizeManualPayloadAttackInput(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const rawRequest = String(raw.rawRequest || '');
  if (!rawRequest.trim()) {
    throw new Error('Fuzzer requires a raw request.');
  }
  const lists = Array.isArray(raw.payloadLists)
    ? raw.payloadLists
        .map((list, index) => {
          const listId = sanitizeMarkerId(list?.id || `list-${index + 1}`);
          const items = Array.isArray(list?.items)
            ? list.items.map((item) => String(item)).filter((item) => item.length > 0).slice(0, 1000)
            : [];
          if (!listId || items.length === 0) return null;
          return {
            id: listId,
            name: trimText(list.name || listId, 120),
            items,
          };
        })
        .filter(Boolean)
    : [];
  const listIds = new Set(lists.map((list) => list.id));
  const insertionPoints = Array.isArray(raw.insertionPoints)
    ? raw.insertionPoints
        .map((point, index) => {
          const id = sanitizeMarkerId(point?.id || `p${index + 1}`);
          const listId = sanitizeMarkerId(point?.listId || lists[0]?.id || '');
          if (!id || !listIds.has(listId)) return null;
          return {
            id,
            name: trimText(point.name || id, 80),
            listId,
          };
        })
        .filter(Boolean)
        .slice(0, 12)
    : [];
  if (insertionPoints.length === 0) {
    throw new Error('Fuzzer requires at least one insertion point.');
  }
  for (const point of insertionPoints) {
    if (!rawRequest.includes(markerToken(point.id))) {
      throw new Error(`Raw request is missing insertion marker ${markerToken(point.id)}.`);
    }
  }
  return {
    sourceId: trimText(raw.sourceId || '', 160),
    rawRequest,
    insertionPoints,
    payloadLists: lists,
    mode: ['clusterBomb', 'pitchfork'].includes(raw.mode) ? raw.mode : 'clusterBomb',
    concurrency: clampNumber(raw.concurrency, 1, 10, 1),
    delayMillis: clampNumber(raw.delayMillis, 0, 5000, 0),
  };
}

function buildManualAttackVariants(input) {
  const lists = new Map(input.payloadLists.map((list) => [list.id, list.items]));
  const points = input.insertionPoints;
  const maxVariants = 200;
  if (input.mode === 'pitchfork') {
    const length = Math.min(...points.map((point) => lists.get(point.listId)?.length || 0));
    return Array.from({ length: Math.min(length, maxVariants) }, (_, index) => ({
      index,
      payloads: Object.fromEntries(points.map((point) => [point.id, lists.get(point.listId)[index]])),
    }));
  }

  const variants = [];
  const walk = (pointIndex, payloads) => {
    if (variants.length >= maxVariants) return;
    if (pointIndex >= points.length) {
      variants.push({ index: variants.length, payloads: { ...payloads } });
      return;
    }
    const point = points[pointIndex];
    for (const payload of lists.get(point.listId) || []) {
      payloads[point.id] = payload;
      walk(pointIndex + 1, payloads);
      if (variants.length >= maxVariants) break;
    }
  };
  walk(0, {});
  return variants;
}

function applyManualAttackVariant(rawRequest, variant) {
  let output = rawRequest;
  for (const [pointId, payload] of Object.entries(variant.payloads || {})) {
    output = output.split(markerToken(pointId)).join(String(payload));
  }
  return output;
}

function manualAttackSentRecord(sourceId, index, sent, note) {
  return {
    id: `sent-${String(sourceId || 'manual')}-user-attack-${index}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sourceId: String(sourceId || ''),
    tool: 'payload_attack',
    type: 'http',
    startedAt: sent.startedAt,
    completedAt: sent.completedAt,
    durationMs: sent.durationMs,
    request: sent.request,
    response: sent.response,
    error: sent.error,
    notes: [note],
  };
}

function manualAttackSummary(record, variant, baseline) {
  const responseText = record.response?.bodyText || '';
  const headers = headersToComparableText(record.response?.headers);
  const responseBytes = record.response ? Buffer.byteLength(record.response.bodyBase64 || '', 'base64') : 0;
  const requestBytes = record.request ? Buffer.byteLength(record.request.bodyBase64 || '', 'base64') : 0;
  const payloadValues = Object.values(variant.payloads || {}).map(String);
  const reflected = payloadValues.some((payload) => payload && (responseText.includes(payload) || headers.includes(payload)));
  const securitySignal = SECURITY_SIGNAL.test(responseText);
  const statusCode = record.response?.statusCode || null;
  const delta = baseline ? responseBytes - baseline.responseBytes : 0;
  const statusChanged = baseline ? statusCode !== baseline.statusCode : false;
  return {
    index: variant.index,
    sentTrafficId: record.id || '',
    payloadPreview: Object.entries(variant.payloads || {})
      .map(([point, payload]) => `${point}=${String(payload).slice(0, 80)}`)
      .join(', '),
    method: record.request?.method || '',
    url: record.request?.url || '',
    statusCode,
    durationMs: record.durationMs,
    requestBytes,
    responseBytes,
    responseBytesDelta: delta,
    statusChanged,
    payloadReflected: reflected,
    securitySignal,
    interesting:
      variant.index === 0 ||
      Boolean(record.error) ||
      reflected ||
      securitySignal ||
      statusChanged ||
      Math.abs(delta) > Math.max(128, Math.round((baseline?.responseBytes || 0) * 0.15)),
    title: '',
    error: record.error || null,
  };
}

function sanitizeMarkerId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-z0-9_-]/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function markerToken(id) {
  return `§${id}§`;
}

function headersToComparableText(headers) {
  return Object.entries(headers || {})
    .map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(', ') : value}`)
    .join('\n');
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  const count = Math.max(1, Math.min(Number(concurrency) || 1, items.length || 1));
  await Promise.all(
    Array.from({ length: count }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await worker(items[index], index);
      }
    }),
  );
  return results.filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizePayloadAttacks(value) {
  if (!Array.isArray(value)) return [];
  return value.map(sanitizePayloadAttack).filter(Boolean).slice(0, 500);
}

function sanitizePayloadAttack(record) {
  if (!record || typeof record !== 'object') return null;
  const results = Array.isArray(record.results) ? record.results.map(sanitizePayloadAttackResult).filter(Boolean).slice(0, 500) : [];
  const id = trimText(record.id, 160) || `attack:${Date.now()}`;
  return {
    id,
    sourceId: trimText(record.sourceId, 160),
    method: trimText(record.method || '', 24).toUpperCase(),
    url: trimText(record.url || '', 4096),
    insertionPoint: record.insertionPoint && typeof record.insertionPoint === 'object' ? structuredClone(record.insertionPoint) : {},
    startedAt: Number(record.startedAt || Date.now()),
    completedAt: record.completedAt == null ? null : Number(record.completedAt),
    durationMs: record.durationMs == null ? null : Number(record.durationMs),
    requestedPayloads: Number(record.requestedPayloads || record.payloadCount || results.length || 0),
    executed: Number(record.executed || results.length || 0),
    sent: Number(record.sent || results.filter((item) => !item.error).length || 0),
    errors: Number(record.errors || results.filter((item) => item.error).length || 0),
    interesting: Number(record.interesting || results.filter((item) => item.interesting).length || 0),
    reflectedCount: Number(record.reflectedCount || results.filter((item) => item.payloadReflected).length || 0),
    securitySignalCount: Number(record.securitySignalCount || results.filter((item) => item.securitySignal).length || 0),
    concurrency: Number(record.concurrency || 1),
    delayMillis: Number(record.delayMillis || 0),
    statusCodes: record.statusCodes && typeof record.statusCodes === 'object' ? structuredClone(record.statusCodes) : {},
    detailsTruncated: record.detailsTruncated === true,
    secretAliasesUsed: Array.isArray(record.secretAliasesUsed) ? record.secretAliasesUsed.map((alias) => trimText(alias, 240)).filter(Boolean) : [],
    results,
    details: Array.isArray(record.details) ? structuredClone(record.details.slice(0, 50)) : [],
    rawRequestReturned: false,
    rawResponseReturned: false,
  };
}

function sanitizePayloadAttackResult(result) {
  if (!result || typeof result !== 'object') return null;
  return {
    index: Number(result.index || 0),
    sentTrafficId: trimText(result.sentTrafficId || '', 160),
    payloadPreview: trimText(result.payloadPreview || '', 240),
    statusCode: result.statusCode == null ? null : Number(result.statusCode),
    durationMs: result.durationMs == null ? null : Number(result.durationMs),
    requestBytes: Number(result.requestBytes || 0),
    responseBytes: Number(result.responseBytes || 0),
    responseBytesDelta: Number(result.responseBytesDelta || 0),
    statusChanged: result.statusChanged === true,
    payloadReflected: result.payloadReflected === true,
    securitySignal: result.securitySignal === true,
    interesting: result.interesting === true,
    title: trimText(result.title || '', 240),
    error: result.error ? trimText(result.error, 1000) : null,
  };
}

function payloadAttackSummary(record) {
  return {
    id: record.id,
    sourceId: record.sourceId,
    method: record.method,
    url: record.url,
    host: safeUrlParts(record.url).host,
    insertionPoint: record.insertionPoint || {},
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    durationMs: record.durationMs,
    requestedPayloads: record.requestedPayloads,
    executed: record.executed,
    sent: record.sent,
    errors: record.errors,
    interesting: record.interesting,
    reflectedCount: record.reflectedCount,
    securitySignalCount: record.securitySignalCount,
    concurrency: record.concurrency || 1,
    delayMillis: record.delayMillis,
    statusCodes: record.statusCodes || {},
  };
}

function activeScanSummary(record) {
  return {
    id: record.id,
    sourceId: record.sourceId,
    sourceMethod: record.sourceMethod,
    sourceUrl: record.sourceUrl,
    sourceHost: record.sourceHost,
    sourcePath: record.sourcePath,
    templateIds: record.templateIds || [],
    maxRequests: record.maxRequests,
    concurrency: record.concurrency,
    requested: record.requested || 0,
    executed: record.executed || 0,
    matched: record.matched || 0,
    findingIds: record.findingIds || [],
    resultCount: record.resultCount || 0,
    status: record.status,
    error: record.error || '',
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    durationMs: record.completedAt ? Number(record.completedAt) - Number(record.startedAt || record.completedAt) : Date.now() - Number(record.startedAt || Date.now()),
  };
}

function normalizeActiveScanNumber(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeReportedFindings(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => buildReportedFinding(item, null))
    .filter((item) => item.id)
    .slice(0, 500);
}

function sortFindings(findings) {
  return [...findings].sort((a, b) => {
    const severityDelta = severityWeight(b.severity) - severityWeight(a.severity);
    if (severityDelta !== 0) return severityDelta;
    return Number(b.lastSeenAt || 0) - Number(a.lastSeenAt || 0);
  });
}

function severityWeight(severity) {
  if (severity === 'high') return 4;
  if (severity === 'medium') return 3;
  if (severity === 'low') return 2;
  return 1;
}

function normalizeSeverity(value) {
  const severity = String(value || 'high').trim().toLowerCase();
  if (severity === 'info') return 'information';
  return ['high', 'medium', 'low', 'information'].includes(severity) ? severity : 'high';
}

function normalizeConfidence(value) {
  const confidence = String(value || 'firm').trim().toLowerCase();
  return ['certain', 'firm', 'tentative'].includes(confidence) ? confidence : 'firm';
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = trimText(value, 4000);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function trimText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
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
