const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BODY_EXTERNALIZE_THRESHOLD_BYTES = 16 * 1024;

class ProjectStore {
  constructor(projectPath) {
    if (!projectPath) {
      throw new Error('Project path is required.');
    }

    this.path = path.resolve(projectPath);
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    this.db = createDatabase(this.path);
    this.inTransaction = false;
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.prepareSchema();
    this.prepareStatements();
  }

  prepareSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS flows (
        id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        method TEXT,
        url TEXT,
        host TEXT,
        type TEXT,
        status_code INTEGER,
        flow_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS flow_bodies (
        flow_id TEXT NOT NULL,
        part TEXT NOT NULL,
        storage_encoding TEXT NOT NULL,
        body_json BLOB NOT NULL,
        original_bytes INTEGER NOT NULL,
        stored_bytes INTEGER NOT NULL,
        PRIMARY KEY (flow_id, part),
        FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS flows_started_at_idx ON flows(started_at DESC);
      CREATE INDEX IF NOT EXISTS flows_host_idx ON flows(host);
      CREATE INDEX IF NOT EXISTS flows_method_idx ON flows(method);
      CREATE INDEX IF NOT EXISTS flows_status_code_idx ON flows(status_code);
    `);
  }

  prepareStatements() {
    this.statements = {
      getMeta: this.db.prepare('SELECT value FROM meta WHERE key = ?'),
      setMeta: this.db.prepare(`
        INSERT INTO meta (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `),
      upsertFlow: this.db.prepare(`
        INSERT INTO flows (id, started_at, completed_at, method, url, host, type, status_code, flow_json)
        VALUES (@id, @startedAt, @completedAt, @method, @url, @host, @type, @statusCode, @flowJson)
        ON CONFLICT(id) DO UPDATE SET
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          method = excluded.method,
          url = excluded.url,
          host = excluded.host,
          type = excluded.type,
          status_code = excluded.status_code,
          flow_json = excluded.flow_json
      `),
      deleteFlowBodies: this.db.prepare('DELETE FROM flow_bodies WHERE flow_id = ?'),
      upsertFlowBody: this.db.prepare(`
        INSERT INTO flow_bodies (flow_id, part, storage_encoding, body_json, original_bytes, stored_bytes)
        VALUES (@flowId, @part, @storageEncoding, @bodyJson, @originalBytes, @storedBytes)
        ON CONFLICT(flow_id, part) DO UPDATE SET
          storage_encoding = excluded.storage_encoding,
          body_json = excluded.body_json,
          original_bytes = excluded.original_bytes,
          stored_bytes = excluded.stored_bytes
      `),
      getFlowBodies: this.db.prepare(`
        SELECT part, storage_encoding, body_json
        FROM flow_bodies
        WHERE flow_id = ?
      `),
      listFlows: this.db.prepare(`
        SELECT flow_json
        FROM flows
        ORDER BY started_at DESC, CAST(id AS INTEGER) DESC
        LIMIT ?
      `),
      pruneFlows: this.db.prepare(`
        DELETE FROM flows
        WHERE id NOT IN (
          SELECT id
          FROM flows
          ORDER BY started_at DESC, CAST(id AS INTEGER) DESC
          LIMIT ?
        )
      `),
      deleteFlows: this.db.prepare('DELETE FROM flows'),
      deleteAllFlowBodies: this.db.prepare('DELETE FROM flow_bodies'),
      deleteMeta: this.db.prepare('DELETE FROM meta'),
    };
  }

  getConfig() {
    return this.getJsonMeta('config', null);
  }

  setConfig(config) {
    this.setJsonMeta('config', config || {});
  }

  getUiState(name, fallback = null) {
    return this.getJsonMeta(`ui:${name}`, fallback);
  }

  setUiState(name, value) {
    this.setJsonMeta(`ui:${name}`, value || {});
  }

  getFindings() {
    const value = this.getJsonMeta('reportedFindings', []);
    return Array.isArray(value) ? value : [];
  }

  setFindings(findings) {
    this.setJsonMeta('reportedFindings', Array.isArray(findings) ? findings : []);
  }

  getSentTraffic() {
    const value = this.getJsonMeta('sentTraffic', []);
    return Array.isArray(value) ? value : [];
  }

  setSentTraffic(records) {
    this.setJsonMeta('sentTraffic', Array.isArray(records) ? records : []);
  }

  getMcpExchanges() {
    const value = this.getJsonMeta('mcpExchanges', []);
    return Array.isArray(value) ? value : [];
  }

  setMcpExchanges(records) {
    this.setJsonMeta('mcpExchanges', Array.isArray(records) ? records : []);
  }

  loadHistory(limit) {
    const safeLimit = normalizeLimit(limit);
    return this.statements.listFlows
      .all(safeLimit)
      .map((row) => this.hydrateStoredFlow(parseJson(row.flow_json, null)))
      .filter(Boolean);
  }

  exportData() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      project: this.info(),
      config: this.getConfig() || {},
      ui: this.getAllUiState(),
      history: this.loadHistory(100000),
      reportedFindings: this.getFindings(),
      sentTraffic: this.getSentTraffic(),
      mcpExchanges: this.getMcpExchanges(),
    };
  }

  importData(data) {
    const normalized = normalizeProjectData(data);
    this.runTransaction(() => {
      this.statements.deleteAllFlowBodies.run();
      this.statements.deleteFlows.run();
      this.statements.deleteMeta.run();
      this.setConfig(normalized.config || {});
      for (const [name, value] of Object.entries(normalized.ui || {})) {
        this.setUiState(name, value);
      }
      this.setFindings(normalized.reportedFindings || []);
      this.setSentTraffic(normalized.sentTraffic || []);
      this.setMcpExchanges(normalized.mcpExchanges || []);
      for (const flow of normalized.history || []) {
        this.upsertFlow(flow);
      }
    });
    return normalized;
  }

  upsertFlow(flow) {
    if (!flow || !flow.id || !flow.request) {
      return;
    }

    const write = () => {
      const prepared = prepareFlowForStorage(flow);
      const url = prepared.flow.request.url || '';
      this.statements.upsertFlow.run({
        id: String(prepared.flow.id),
        startedAt: Number(prepared.flow.startedAt || Date.now()),
        completedAt: prepared.flow.completedAt == null ? null : Number(prepared.flow.completedAt),
        method: String(prepared.flow.request.method || ''),
        url,
        host: prepared.flow.type === 'connect' ? String(prepared.flow.tunnel?.host || '') : safeHost(url),
        type: String(prepared.flow.type || ''),
        statusCode: prepared.flow.response?.statusCode == null ? null : Number(prepared.flow.response.statusCode),
        flowJson: JSON.stringify(prepared.flow),
      });
      this.statements.deleteFlowBodies.run(String(prepared.flow.id));
      for (const body of prepared.bodies) {
        this.statements.upsertFlowBody.run(body);
      }
    };

    this.runTransaction(write);
  }

  hydrateStoredFlow(flow) {
    if (!flow || !flow.id) {
      return null;
    }

    const rows = this.statements.getFlowBodies.all(String(flow.id));
    if (rows.length === 0) {
      return flow;
    }

    const bodies = new Map(rows.map((row) => [row.part, row]));
    hydrateMessageBody(flow.request, bodies.get('request'));
    hydrateMessageBody(flow.response, bodies.get('response'));
    return flow;
  }

  pruneHistory(limit) {
    this.statements.pruneFlows.run(normalizeLimit(limit));
  }

  clearHistory() {
    this.runTransaction(() => {
      this.statements.deleteAllFlowBodies.run();
      this.statements.deleteFlows.run();
    });
  }

  info() {
    return {
      path: this.path,
      name: path.basename(this.path),
    };
  }

  close() {
    this.db.close();
  }

  runTransaction(fn) {
    if (this.inTransaction) {
      return fn();
    }

    this.inTransaction = true;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  getJsonMeta(key, fallback) {
    const row = this.statements.getMeta.get(key);
    if (!row) {
      return fallback;
    }
    return parseJson(row.value, fallback);
  }

  setJsonMeta(key, value) {
    this.statements.setMeta.run(key, JSON.stringify(value), Date.now());
  }

  getAllUiState() {
    const rows = this.db.prepare("SELECT key, value FROM meta WHERE key LIKE 'ui:%'").all();
    const ui = {};
    for (const row of rows) {
      ui[row.key.slice(3)] = parseJson(row.value, {});
    }
    return ui;
  }
}

function normalizeLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    return 500;
  }
  return Math.min(limit, 100000);
}

function createDatabase(projectPath) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    return new DatabaseSync(projectPath);
  } catch (error) {
    if (error && error.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') {
      throw error;
    }
  }

  const Database = require('better-sqlite3');
  return new Database(projectPath);
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function prepareFlowForStorage(flow) {
  const stored = structuredClone(flow);
  const bodies = [];
  externalizeMessageBody(stored, 'request', bodies);
  externalizeMessageBody(stored, 'response', bodies);
  return { flow: stored, bodies };
}

function externalizeMessageBody(flow, part, bodies) {
  const message = flow && flow[part];
  if (!message || !shouldExternalizeMessageBody(message)) {
    return;
  }

  const payloadBuffer = Buffer.from(
    JSON.stringify({
      bodyBase64: typeof message.bodyBase64 === 'string' ? message.bodyBase64 : '',
      bodyText: typeof message.bodyText === 'string' ? message.bodyText : '',
    }),
    'utf8',
  );
  const compressed = zlib.gzipSync(payloadBuffer);
  const useCompressed = compressed.length < payloadBuffer.length;
  const bodyJson = useCompressed ? compressed : payloadBuffer;

  bodies.push({
    flowId: String(flow.id),
    part,
    storageEncoding: useCompressed ? 'gzip-json' : 'json',
    bodyJson,
    originalBytes: payloadBuffer.length,
    storedBytes: bodyJson.length,
  });

  message.bodyStorage = {
    external: true,
    part,
    storageEncoding: useCompressed ? 'gzip-json' : 'json',
    originalBytes: payloadBuffer.length,
    storedBytes: bodyJson.length,
    bodyBytes: base64ByteLength(message.bodyBase64 || ''),
    textBytes: Buffer.byteLength(message.bodyText || '', 'utf8'),
  };
  message.bodyBase64 = '';
  message.bodyText = '';
}

function shouldExternalizeMessageBody(message) {
  const bodyBytes = base64ByteLength(message.bodyBase64 || '');
  const textBytes = Buffer.byteLength(message.bodyText || '', 'utf8');
  return bodyBytes >= BODY_EXTERNALIZE_THRESHOLD_BYTES || textBytes >= BODY_EXTERNALIZE_THRESHOLD_BYTES;
}

function hydrateMessageBody(message, row) {
  if (!message || !message.bodyStorage || !message.bodyStorage.external || !row) {
    return;
  }

  const raw = Buffer.isBuffer(row.body_json) ? row.body_json : Buffer.from(row.body_json || []);
  const jsonBuffer = row.storage_encoding === 'gzip-json' ? zlib.gunzipSync(raw) : raw;
  const payload = parseJson(jsonBuffer.toString('utf8'), {});
  message.bodyBase64 = typeof payload.bodyBase64 === 'string' ? payload.bodyBase64 : '';
  message.bodyText = typeof payload.bodyText === 'string' ? payload.bodyText : '';
  message.bodyStorage = {
    ...message.bodyStorage,
    loaded: true,
  };
}

function base64ByteLength(value) {
  const text = String(value || '');
  if (!text) return 0;
  const clean = text.replace(/\s+/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

function normalizeProjectData(data) {
  const raw = data && typeof data === 'object' ? data : {};
  return {
    config: raw.config && typeof raw.config === 'object' ? raw.config : {},
    ui: raw.ui && typeof raw.ui === 'object' ? raw.ui : {},
    history: Array.isArray(raw.history) ? raw.history.filter((flow) => flow && typeof flow === 'object' && flow.id && flow.request) : [],
    reportedFindings: normalizeReportedFindings(raw.reportedFindings || raw.findings),
    sentTraffic: normalizeSentTraffic(raw.sentTraffic),
    mcpExchanges: normalizeMcpExchanges(raw.mcpExchanges),
  };
}

function normalizeReportedFindings(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((finding) => finding && typeof finding === 'object' && (finding.source === 'mcp' || finding.reporter))
    .map((finding) => ({
      ...finding,
      id: String(finding.id || ''),
      source: finding.source || 'mcp',
      flowIds: Array.isArray(finding.flowIds) ? finding.flowIds.map(String) : [],
      evidence: Array.isArray(finding.evidence) ? finding.evidence.map(String) : [],
    }))
    .filter((finding) => finding.id);
}

function normalizeSentTraffic(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((record) => record && typeof record === 'object' && record.id && record.request)
    .map((record) => ({
      ...record,
      id: String(record.id),
      sourceId: String(record.sourceId || ''),
      type: 'http',
      notes: Array.isArray(record.notes) ? record.notes.map(String) : [],
    }))
    .slice(0, 500);
}

function normalizeMcpExchanges(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((record) => record && typeof record === 'object' && record.id)
    .map((record) => ({
      ...record,
      id: String(record.id),
      rpcMethod: String(record.rpcMethod || ''),
      tool: String(record.tool || ''),
      error: String(record.error || ''),
    }))
    .slice(0, 500);
}

module.exports = {
  ProjectStore,
};
