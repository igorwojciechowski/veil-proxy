const path = require('path');
const { ApiServer } = require('./apiServer');
const { ProxyServer } = require('./proxyServer');
const { defaultConfig } = require('./config');

function createApp(options = {}) {
  const config = {
    ...defaultConfig,
    ...options.config,
    upstream: {
      ...defaultConfig.upstream,
      ...(options.config && options.config.upstream ? options.config.upstream : {}),
    },
    intercept: {
      ...defaultConfig.intercept,
      ...(options.config && options.config.intercept ? options.config.intercept : {}),
    },
    scope: {
      ...defaultConfig.scope,
      ...(options.config && options.config.scope ? options.config.scope : {}),
    },
    https: {
      ...defaultConfig.https,
      ...(options.config && options.config.https ? options.config.https : {}),
    },
    upstreams: Array.isArray(options.config && options.config.upstreams) ? options.config.upstreams : defaultConfig.upstreams,
    upstreamRules: Array.isArray(options.config && options.config.upstreamRules) ? options.config.upstreamRules : defaultConfig.upstreamRules,
  };

  const proxy = new ProxyServer(config);
  const publicDir = options.publicDir || path.resolve(__dirname, '../../public');
  const api = new ApiServer({
    config,
    proxy,
    publicDir,
    port: options.apiPort || config.apiPort,
  });

  return {
    config,
    proxy,
    api,
    async start() {
      await proxy.start();
      await api.start();
      return this.state();
    },
    async stop() {
      await Promise.allSettled([api.stop(), proxy.stop()]);
    },
    state() {
      return {
        apiPort: api.port,
        proxyPort: proxy.port,
        config: proxy.getConfig(),
      };
    },
  };
}

module.exports = {
  createApp,
};
