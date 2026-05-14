const fs = require('fs');
const path = require('path');

class ProjectStore {
  constructor(projectPath) {
    if (!projectPath) {
      throw new Error('Project path is required.');
    }

    this.path = path.resolve(projectPath);
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    this.db = createDatabase(this.path);
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

  loadHistory(limit) {
    const safeLimit = normalizeLimit(limit);
    return this.statements.listFlows
      .all(safeLimit)
      .map((row) => parseJson(row.flow_json, null))
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
    };
  }

  importData(data) {
    const normalized = normalizeProjectData(data);
    this.runTransaction(() => {
      this.statements.deleteFlows.run();
      this.statements.deleteMeta.run();
      this.setConfig(normalized.config || {});
      for (const [name, value] of Object.entries(normalized.ui || {})) {
        this.setUiState(name, value);
      }
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

    const url = flow.request.url || '';
    this.statements.upsertFlow.run({
      id: String(flow.id),
      startedAt: Number(flow.startedAt || Date.now()),
      completedAt: flow.completedAt == null ? null : Number(flow.completedAt),
      method: String(flow.request.method || ''),
      url,
      host: flow.type === 'connect' ? String(flow.tunnel?.host || '') : safeHost(url),
      type: String(flow.type || ''),
      statusCode: flow.response?.statusCode == null ? null : Number(flow.response.statusCode),
      flowJson: JSON.stringify(flow),
    });
  }

  pruneHistory(limit) {
    this.statements.pruneFlows.run(normalizeLimit(limit));
  }

  clearHistory() {
    this.statements.deleteFlows.run();
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
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
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

function normalizeProjectData(data) {
  const raw = data && typeof data === 'object' ? data : {};
  return {
    config: raw.config && typeof raw.config === 'object' ? raw.config : {},
    ui: raw.ui && typeof raw.ui === 'object' ? raw.ui : {},
    history: Array.isArray(raw.history) ? raw.history.filter((flow) => flow && typeof flow === 'object' && flow.id && flow.request) : [],
  };
}

module.exports = {
  ProjectStore,
};
