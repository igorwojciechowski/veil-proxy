const { createApp } = require('./veilApp');

const app = createApp({
  projectPath: process.env.VEIL_PROJECT_PATH || null,
});

app
  .start()
  .then((state) => {
    console.log(`Veil Proxy UI: http://127.0.0.1:${state.apiPort}`);
    console.log(`Proxy listener: 127.0.0.1:${state.proxyPort}`);
    if (state.mcp && state.mcp.running) {
      console.log(`MCP server: ${state.mcp.endpoint}`);
      console.log(`MCP token: ${state.mcp.token}`);
    } else if (state.mcp && state.mcp.enabled && state.mcp.lastError) {
      console.log(`MCP server failed: ${state.mcp.lastError}`);
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

process.on('SIGINT', async () => {
  await app.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await app.stop();
  process.exit(0);
});
