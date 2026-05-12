const defaultConfig = {
  apiHost: '127.0.0.1',
  apiPort: Number(process.env.VEIL_API_PORT || 8999),
  proxyHost: '127.0.0.1',
  proxyPort: Number(process.env.VEIL_PROXY_PORT || 8080),
  historyLimit: 500,
  maxBodyBytes: 10 * 1024 * 1024,
  intercept: {
    requests: false,
    responses: false,
    rules: [],
  },
  scope: {
    enabled: false,
    rules: [],
  },
  upstream: {
    mode: 'direct',
    host: '',
    port: 0,
    username: '',
    password: '',
  },
};

module.exports = {
  defaultConfig,
};
