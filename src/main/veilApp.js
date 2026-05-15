const path = require('path');
const { ApiServer } = require('./apiServer');
const { McpServer } = require('./mcp/mcpServer');
const { ProxyServer } = require('./proxyServer');
const { defaultConfig } = require('./config');
const { ProjectStore } = require('./projectStore');

function createApp(options = {}) {
  const ownsStore = !options.store;
  const store = options.store || (options.projectPath ? new ProjectStore(options.projectPath) : null);
  const config = buildConfig(store ? store.getConfig() : null, options.config);
  const history = store ? store.loadHistory(config.historyLimit) : [];

  const proxy = new ProxyServer(config, { store, history });
  const mcp = new McpServer({
    proxy,
    configProvider: () => proxy.getConfig(),
  });
  if (store && typeof store.getMcpExchanges === 'function' && typeof mcp.replaceExchanges === 'function') {
    mcp.replaceExchanges(store.getMcpExchanges());
  }
  const publicDir = options.publicDir || path.resolve(__dirname, '../../public');
  const api = new ApiServer({
    config,
    proxy,
    mcp,
    store,
    publicDir,
    port: options.apiPort || config.apiPort,
  });

  return {
    config,
    proxy,
    api,
    mcp,
    async start() {
      await proxy.start();
      await api.start();
      await mcp.start();
      return this.state();
    },
    async stop() {
      await Promise.allSettled([mcp.stop(), api.stop(), proxy.stop()]);
      if (store && ownsStore) {
        store.close();
      }
    },
    state() {
      return {
        apiPort: api.port,
        proxyPort: proxy.port,
        config: proxy.getConfig(),
        mcp: mcp.state(),
        project: store ? store.info() : null,
        ui: api.getUiState(),
      };
    },
  };
}

function buildConfig(storedConfig, runtimeConfig) {
  return mergeConfig(mergeConfig(defaultConfig, storedConfig || {}), runtimeConfig || {});
}

function mergeConfig(base, override) {
  const next = {
    ...clone(base),
    ...clone(override),
  };

  for (const key of ['upstream', 'intercept', 'scope', 'https', 'mcp']) {
    next[key] = {
      ...(base && base[key] ? clone(base[key]) : {}),
      ...(override && override[key] ? clone(override[key]) : {}),
    };
  }
  next.veilCore = {
    ...(base && base.veilCore ? clone(base.veilCore) : {}),
    ...(override && override.veilCore ? clone(override.veilCore) : {}),
    enabled: false,
  };

  for (const key of ['upstreams', 'upstreamRules', 'rewriteRules']) {
    if (Object.prototype.hasOwnProperty.call(override || {}, key)) {
      next[key] = Array.isArray(override[key]) ? clone(override[key]) : [];
    } else {
      next[key] = Array.isArray(base && base[key]) ? clone(base[key]) : [];
    }
  }

  return next;
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

module.exports = {
  createApp,
};
