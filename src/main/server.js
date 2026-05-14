const { createApp } = require('./veilApp');

const app = createApp({
  projectPath: process.env.VEIL_PROJECT_PATH || null,
});

app
  .start()
  .then((state) => {
    console.log(`Veil Proxy UI: http://127.0.0.1:${state.apiPort}`);
    console.log(`Proxy listener: 127.0.0.1:${state.proxyPort}`);
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
