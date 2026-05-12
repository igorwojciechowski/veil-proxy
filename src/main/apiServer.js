const fs = require('fs');
const http = require('http');
const path = require('path');

class ApiServer {
  constructor({ config, proxy, publicDir, port }) {
    this.config = config;
    this.proxy = proxy;
    this.publicDir = publicDir;
    this.port = port;
    this.clients = new Set();
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
        this.json(res, {
          config: this.proxy.getConfig(),
          history: this.proxy.listHistory(),
          pending: this.proxy.listPending(),
          proxyPort: this.proxy.port,
          apiPort: this.port,
        });
        return;
      }

      if (parsed.pathname === '/api/config' && req.method === 'PATCH') {
        const body = await readJson(req);
        this.json(res, await this.proxy.updateConfig(body));
        return;
      }

      if (parsed.pathname === '/api/history' && req.method === 'GET') {
        this.json(res, this.proxy.listHistory());
        return;
      }

      if (parsed.pathname === '/api/site-map' && req.method === 'GET') {
        this.json(res, this.proxy.getSiteMap());
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
    write('state', {
      config: this.proxy.getConfig(),
      history: this.proxy.listHistory(),
      pending: this.proxy.listPending(),
      proxyPort: this.proxy.port,
      apiPort: this.port,
    });

    req.on('close', () => {
      this.clients.delete(client);
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

  json(res, payload, status = 200) {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(payload));
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

module.exports = {
  ApiServer,
};
