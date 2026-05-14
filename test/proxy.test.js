const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const { createApp } = require('../src/main/veilApp');

const socketReadBuffers = new WeakMap();

test('forwards plaintext HTTP requests and records the flow', async () => {
  const origin = await createOriginServer();
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
    },
  });

  await app.start();

  try {
    const target = `http://127.0.0.1:${origin.port}/echo?x=1`;
    const response = await proxyRequest(app.proxy.port, {
      method: 'POST',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
        'content-type': 'text/plain',
      },
      body: 'hello',
    });

    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(JSON.parse(response.body), {
      method: 'POST',
      url: '/echo?x=1',
      body: 'hello',
    });

    const [flow] = app.proxy.listHistory();
    assert.equal(flow.method, 'POST');
    assert.equal(flow.statusCode, 200);
    assert.equal(flow.host, `127.0.0.1:${origin.port}`);
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('modifies intercepted HTTP requests before forwarding', async () => {
  const origin = await createOriginServer();
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      intercept: {
        requests: true,
        responses: false,
      },
    },
  });

  await app.start();

  try {
    const target = `http://127.0.0.1:${origin.port}/change`;
    const responsePromise = proxyRequest(app.proxy.port, {
      method: 'POST',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
        'content-type': 'text/plain',
      },
      body: 'original',
    });

    const pending = await waitFor(() => app.proxy.listPending()[0]);
    assert.equal(pending.stage, 'request');

    await app.proxy.resolvePending(pending.id, {
      action: 'modify',
      method: 'POST',
      url: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
        'content-type': 'text/plain',
      },
      bodyText: 'changed',
    });

    const response = await responsePromise;
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(JSON.parse(response.body), {
      method: 'POST',
      url: '/change',
      body: 'changed',
    });
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('continues queued requests when request interception is disabled', async () => {
  const origin = await createOriginServer();
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      intercept: {
        requests: true,
        responses: true,
      },
    },
  });

  await app.start();

  try {
    const target = `http://127.0.0.1:${origin.port}/chain`;
    const responsePromise = proxyRequest(app.proxy.port, {
      method: 'POST',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
        'content-type': 'text/plain',
      },
      body: 'queued',
    });

    const requestPending = await waitFor(() => app.proxy.listPending().find((item) => item.stage === 'request'));
    assert.equal(requestPending.stage, 'request');

    await app.proxy.updateConfig({
      intercept: {
        requests: false,
        responses: true,
      },
    });

    const responsePending = await waitFor(() => app.proxy.listPending().find((item) => item.stage === 'response'));
    assert.equal(app.proxy.listPending().some((item) => item.stage === 'request'), false);

    await app.proxy.resolvePending(responsePending.id, { action: 'continue' });
    const response = await responsePromise;
    assert.equal(response.statusCode, 200);
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('intercepts only requests matching enabled rules', async () => {
  const origin = await createOriginServer();
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      intercept: {
        requests: true,
        responses: false,
        rules: [
          {
            id: 'match-url',
            enabled: true,
            stage: 'request',
            field: 'url',
            operator: 'contains',
            value: '/match',
          },
        ],
      },
    },
  });

  await app.start();

  try {
    const skipTarget = `http://127.0.0.1:${origin.port}/skip`;
    const skipResponse = await proxyRequest(app.proxy.port, {
      method: 'GET',
      path: skipTarget,
      headers: {
        host: `127.0.0.1:${origin.port}`,
      },
    });
    assert.equal(skipResponse.statusCode, 200);
    assert.equal(app.proxy.listPending().length, 0);

    const matchTarget = `http://127.0.0.1:${origin.port}/match`;
    const matchResponsePromise = proxyRequest(app.proxy.port, {
      method: 'GET',
      path: matchTarget,
      headers: {
        host: `127.0.0.1:${origin.port}`,
      },
    });

    const pending = await waitFor(() => app.proxy.listPending()[0]);
    assert.equal(pending.stage, 'request');
    assert.equal(pending.editable.url, matchTarget);

    await app.proxy.resolvePending(pending.id, { action: 'continue' });
    const matchResponse = await matchResponsePromise;
    assert.equal(matchResponse.statusCode, 200);
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('applies automatic rewrite rules to requests and responses', async () => {
  const origin = await createOriginServer();
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      rewriteRules: [
        {
          id: 'rewrite-request-body',
          enabled: true,
          stage: 'request',
          target: 'body',
          matchType: 'literal',
          match: 'original-body',
          replace: 'changed-body',
        },
        {
          id: 'rewrite-response-body',
          enabled: true,
          stage: 'response',
          target: 'body',
          matchType: 'literal',
          match: '/rewrite-target',
          replace: '/rewritten-target',
        },
        {
          id: 'rewrite-response-header',
          enabled: true,
          stage: 'response',
          target: 'header',
          headerName: 'x-veil-rewrite',
          match: '',
          replace: 'applied',
        },
      ],
    },
  });

  await app.start();

  try {
    const target = `http://127.0.0.1:${origin.port}/rewrite-target`;
    const response = await proxyRequest(app.proxy.port, {
      method: 'POST',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
        'content-type': 'text/plain',
      },
      body: 'original-body',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['x-veil-rewrite'], 'applied');
    assert.deepEqual(JSON.parse(response.body), {
      method: 'POST',
      url: '/rewritten-target',
      body: 'changed-body',
    });

    const [flow] = app.proxy.listHistory();
    assert.equal(flow.notes.some((note) => note.includes('rewrite-request-body')), true);
    assert.equal(flow.notes.some((note) => note.includes('rewrite-response-body')), true);
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('forwards HTTP requests through a strict SOCKS5 upstream proxy', async () => {
  const origin = await createOriginServer();
  const socks = await createSocks5Server({ requireIpAddressTypeForIpTargets: true });
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      upstream: {
        mode: 'socks5',
        host: '127.0.0.1',
        port: socks.port,
      },
    },
  });

  await app.start();

  try {
    const target = `http://127.0.0.1:${origin.port}/via-socks?ok=1`;
    const response = await proxyRequest(app.proxy.port, {
      method: 'GET',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
      },
    });

    assert.equal(response.statusCode, 200, response.body);
    assert.equal(JSON.parse(response.body).url, '/via-socks?ok=1');
    assert.deepEqual(socks.requests.map((request) => request.addressType), [0x01]);
  } finally {
    await app.stop();
    await socks.close();
    await origin.close();
  }
});

test('reuses SOCKS5 upstream connections for sequential HTTP requests', async () => {
  const origin = await createOriginServer();
  const socks = await createSocks5Server({ requireIpAddressTypeForIpTargets: true });
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      upstream: {
        mode: 'socks5',
        host: '127.0.0.1',
        port: socks.port,
      },
    },
  });

  await app.start();

  try {
    for (const path of ['/pooled-one', '/pooled-two']) {
      const target = `http://127.0.0.1:${origin.port}${path}`;
      const response = await proxyRequest(app.proxy.port, {
        method: 'GET',
        path: target,
        headers: {
          host: `127.0.0.1:${origin.port}`,
        },
      });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(JSON.parse(response.body).url, path);
    }

    assert.equal(socks.requests.length, 1);
  } finally {
    await app.stop();
    await socks.close();
    await origin.close();
  }
});

test('sends Echo requests through configured SOCKS5 upstream proxy', async () => {
  const origin = await createOriginServer();
  const socks = await createSocks5Server({ requireIpAddressTypeForIpTargets: true });
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      upstream: {
        mode: 'socks5',
        host: '127.0.0.1',
        port: socks.port,
      },
    },
  });

  await app.start();

  try {
    const result = await app.proxy.sendEchoRequest({
      rawRequest: [
        'POST /echo-relay HTTP/1.1',
        `Host: 127.0.0.1:${origin.port}`,
        'Content-Type: text/plain',
        'Content-Length: 999',
        '',
        'relay-body',
      ].join('\r\n'),
    });

    assert.equal(result.error, null);
    assert.equal(result.response.statusCode, 200);
    assert.deepEqual(JSON.parse(result.response.bodyText), {
      method: 'POST',
      url: '/echo-relay',
      body: 'relay-body',
    });
    assert.equal(socks.requests.length, 1);
  } finally {
    await app.stop();
    await socks.close();
    await origin.close();
  }
});

test('routes matching requests through per-target upstream rules', async () => {
  const directOrigin = await createOriginServer();
  const routedOrigin = await createOriginServer();
  const socks = await createSocks5Server({ requireIpAddressTypeForIpTargets: true });
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      upstream: { mode: 'direct', host: '', port: 0, username: '', password: '' },
      upstreamRules: [
        {
          id: 'route-routed-origin',
          enabled: true,
          matchType: 'host',
          pattern: `127.0.0.1:${routedOrigin.port}`,
          upstream: { mode: 'socks5', host: '127.0.0.1', port: socks.port, username: '', password: '' },
        },
      ],
    },
  });

  await app.start();

  try {
    const directResponse = await proxyRequest(app.proxy.port, {
      method: 'GET',
      path: `http://127.0.0.1:${directOrigin.port}/direct`,
      headers: { host: `127.0.0.1:${directOrigin.port}` },
    });
    assert.equal(directResponse.statusCode, 200);
    assert.equal(socks.requests.length, 0);

    const routedResponse = await proxyRequest(app.proxy.port, {
      method: 'GET',
      path: `http://127.0.0.1:${routedOrigin.port}/routed`,
      headers: { host: `127.0.0.1:${routedOrigin.port}` },
    });
    assert.equal(routedResponse.statusCode, 200);
    assert.equal(socks.requests.length, 1);
    assert.equal(socks.requests[0].host, '127.0.0.1');
    assert.equal(socks.requests[0].port, routedOrigin.port);
  } finally {
    await app.stop();
    await directOrigin.close();
    await routedOrigin.close();
    await socks.close();
  }
});

test('configured upstreams route all traffic without rules and use direct when no rule matches', async () => {
  const origin = await createOriginServer();
  const socks = await createSocks5Server({ requireIpAddressTypeForIpTargets: true });
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      upstreams: [
        {
          id: 'all-through-socks',
          enabled: true,
          mode: 'socks5',
          host: '127.0.0.1',
          port: socks.port,
          username: '',
          password: '',
          rules: [],
        },
      ],
    },
  });

  await app.start();

  try {
    const firstResponse = await proxyRequest(app.proxy.port, {
      method: 'GET',
      path: `http://127.0.0.1:${origin.port}/all`,
      headers: { host: `127.0.0.1:${origin.port}` },
    });
    assert.equal(firstResponse.statusCode, 200);
    assert.equal(socks.requests.length, 1);

    await app.proxy.updateConfig({
      upstreams: [
        {
          id: 'only-example',
          enabled: true,
          mode: 'socks5',
          host: '127.0.0.1',
          port: socks.port,
          username: '',
          password: '',
          rules: [{ matchType: 'domain', pattern: 'example.invalid' }],
        },
      ],
    });

    const secondResponse = await proxyRequest(app.proxy.port, {
      method: 'GET',
      path: `http://127.0.0.1:${origin.port}/direct`,
      headers: { host: `127.0.0.1:${origin.port}` },
    });
    assert.equal(secondResponse.statusCode, 200);
    assert.equal(socks.requests.length, 1);
  } finally {
    await app.stop();
    await origin.close();
    await socks.close();
  }
});

test('tunnels CONNECT requests through a strict SOCKS5 upstream proxy', async () => {
  const origin = await createOriginServer();
  const socks = await createSocks5Server({ requireIpAddressTypeForIpTargets: true });
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      upstream: {
        mode: 'socks5',
        host: '127.0.0.1',
        port: socks.port,
      },
    },
  });

  await app.start();

  try {
    const response = await tunnelHttpRequest(app.proxy.port, `127.0.0.1:${origin.port}`, '/connect-via-socks');
    assert.match(response, /HTTP\/1\.1 200 OK/);
    assert.match(response, /"url":"\/connect-via-socks"/);
    assert.deepEqual(socks.requests.map((request) => request.addressType), [0x01]);
  } finally {
    await app.stop();
    await socks.close();
    await origin.close();
  }
});

test('intercepts and inspects HTTPS requests inside CONNECT tunnels', async () => {
  const origin = await createHttpsOriginServer();
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veil-proxy-test-ca-'));
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      https: {
        intercept: true,
        interceptPorts: [origin.port],
        certDir,
        ignoreUpstreamCertificateErrors: true,
      },
    },
  });

  await app.start();

  try {
    const response = await tunnelHttpsRequest(app.proxy.port, `127.0.0.1:${origin.port}`, '/secure?x=1', {
      ca: fs.readFileSync(app.proxy.certAuthority.caCertPath),
    });

    assert.match(response, /^HTTP\/1\.1 200 OK/);
    const body = response.slice(response.indexOf('\r\n\r\n') + 4);
    assert.deepEqual(JSON.parse(body), {
      method: 'GET',
      url: '/secure?x=1',
      body: '',
    });

    const flow = await waitFor(() =>
      app.proxy.listHistory().find((item) => item.type === 'http' && item.url === `https://127.0.0.1:${origin.port}/secure?x=1`),
    );
    assert.equal(flow.method, 'GET');
    assert.equal(flow.statusCode, 200);
    assert.equal(flow.host, `127.0.0.1:${origin.port}`);
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('rebinds the proxy listener when proxy port changes', async () => {
  const origin = await createOriginServer();
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
    },
  });

  await app.start();

  try {
    const oldPort = app.proxy.port;
    const requestedPort = await getFreePort();
    await app.proxy.updateConfig({ proxyPort: requestedPort });
    const newPort = app.proxy.port;
    assert.notEqual(newPort, oldPort);
    assert.equal(newPort, requestedPort);

    const target = `http://127.0.0.1:${origin.port}/after-rebind`;
    const response = await proxyRequest(newPort, {
      method: 'GET',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).url, '/after-rebind');
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('builds site map entries and applies scope rules', async () => {
  const origin = await createOriginServer();
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      scope: {
        enabled: true,
        rules: [
          {
            id: 'include-in-scope',
            enabled: true,
            action: 'include',
            field: 'url',
            operator: 'equals',
            value: `http://127.0.0.1:${origin.port}/in-scope/item`,
          },
        ],
      },
    },
  });

  await app.start();

  try {
    for (const path of ['/in-scope/item?x=1', '/out/item']) {
      const target = `http://127.0.0.1:${origin.port}${path}`;
      const response = await proxyRequest(app.proxy.port, {
        method: 'GET',
        path: target,
        headers: {
          host: `127.0.0.1:${origin.port}`,
        },
      });
      assert.equal(response.statusCode, 200);
    }

    const siteMap = app.proxy.getSiteMap();
    const host = siteMap.hosts.find((item) => item.host === `127.0.0.1:${origin.port}`);
    assert.ok(host);
    const inScopePath = host.paths.find((item) => item.path === '/in-scope/item');
    const outPath = host.paths.find((item) => item.path === '/out/item');
    assert.equal(inScopePath.inScope, true);
    assert.equal(outPath.inScope, false);

    const summaries = app.proxy.listHistory();
    assert.equal(summaries.some((flow) => flow.path === '/in-scope/item' && flow.inScope), true);
    assert.equal(summaries.some((flow) => flow.path === '/out/item' && !flow.inScope), true);
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('scope rules support domain presets and path prefixes', async () => {
  const origin = await createOriginServer();
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      scope: {
        enabled: true,
        rules: [
          {
            id: 'include-local-domain',
            enabled: true,
            action: 'include',
            field: 'host',
            operator: 'domain',
            value: '127.0.0.1',
          },
          {
            id: 'exclude-admin-prefix',
            enabled: true,
            action: 'exclude',
            field: 'path',
            operator: 'startsWith',
            value: '/admin',
          },
        ],
      },
    },
  });

  await app.start();

  try {
    for (const path of ['/api/items', '/admin/panel']) {
      const target = `http://127.0.0.1:${origin.port}${path}`;
      const response = await proxyRequest(app.proxy.port, {
        method: 'GET',
        path: target,
        headers: {
          host: `127.0.0.1:${origin.port}`,
        },
      });
      assert.equal(response.statusCode, 200);
    }

    const summaries = app.proxy.listHistory();
    assert.equal(summaries.some((flow) => flow.path === '/api/items' && flow.inScope), true);
    assert.equal(summaries.some((flow) => flow.path === '/admin/panel' && !flow.inScope), true);
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('builds passive findings from captured traffic', async () => {
  const origin = await createOriginServer();
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
    },
  });

  await app.start();

  try {
    const target = `http://127.0.0.1:${origin.port}/login?token=abc123`;
    const response = await proxyRequest(app.proxy.port, {
      method: 'POST',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'username=admin&password=secret',
    });
    assert.equal(response.statusCode, 200);

    const findings = await apiRequest(app.api.port, '/api/findings');
    assert.equal(findings.some((finding) => finding.id.startsWith('sensitive-request-data:') && finding.severity === 'high'), true);
    assert.equal(findings.some((finding) => finding.id.startsWith('cleartext-http:') && finding.severity === 'medium'), true);
    assert.equal(findings.every((finding) => Array.isArray(finding.flowIds)), true);
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('builds and exports project reports', async () => {
  const origin = await createOriginServer();
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      scope: {
        enabled: true,
        rules: [
          {
            id: 'scope-login',
            enabled: true,
            action: 'include',
            field: 'url',
            operator: 'contains',
            value: '/login',
          },
        ],
      },
    },
  });

  await app.start();

  try {
    const target = `http://127.0.0.1:${origin.port}/login?token=abc123`;
    const response = await proxyRequest(app.proxy.port, {
      method: 'POST',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'username=admin&password=secret',
    });
    assert.equal(response.statusCode, 200);

    const report = await apiRequest(app.api.port, '/api/report');
    assert.equal(report.summary.requests, 1);
    assert.equal(report.summary.inScopeRequests, 1);
    assert.equal(report.summary.findingsBySeverity.high, 1);
    assert.equal(report.scope.rules[0].value, '/login');
    assert.equal(report.findings.some((finding) => finding.title === 'Sensitive data in request'), true);

    const markdown = await apiTextRequest(app.api.port, '/api/report/export');
    assert.equal(markdown.statusCode, 200);
    assert.match(markdown.headers['content-type'], /text\/markdown/);
    assert.match(markdown.body, /# Veil Proxy Report/);
    assert.match(markdown.body, /Sensitive data in request/);
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('persists config and captured HTTP history in a project database', async () => {
  const origin = await createOriginServer();
  const projectPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'veil-proxy-project-')), 'project.sqlite');
  let app = createApp({
    projectPath,
    config: {
      proxyPort: 0,
      apiPort: 0,
    },
  });

  await app.start();

  try {
    const target = `http://127.0.0.1:${origin.port}/persisted?x=1`;
    const response = await proxyRequest(app.proxy.port, {
      method: 'POST',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
        'content-type': 'text/plain',
      },
      body: 'project-body',
    });
    assert.equal(response.statusCode, 200);

    await app.proxy.updateConfig({
      scope: {
        enabled: true,
        rules: [
          {
            id: 'persisted-scope',
            enabled: true,
            action: 'include',
            field: 'url',
            operator: 'equals',
            value: `http://127.0.0.1:${origin.port}/persisted`,
          },
        ],
      },
    });
  } finally {
    await app.stop();
  }

  app = createApp({
    projectPath,
    config: {
      proxyPort: 0,
      apiPort: 0,
    },
  });

  await app.start();

  try {
    const config = app.proxy.getConfig();
    assert.equal(config.scope.enabled, true);
    assert.equal(config.scope.rules[0].value, `http://127.0.0.1:${origin.port}/persisted`);

    const history = app.proxy.listHistory();
    const summary = history.find((flow) => flow.path === '/persisted');
    assert.ok(summary);
    assert.equal(summary.statusCode, 200);
    assert.equal(summary.inScope, true);

    const flow = app.proxy.getFlow(summary.id);
    assert.equal(flow.request.bodyText, 'project-body');
    assert.equal(JSON.parse(flow.response.bodyText).url, '/persisted?x=1');
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('persists Echo tabs and groups through the UI state API', async () => {
  const projectPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'veil-proxy-echo-project-')), 'project.sqlite');
  let app = createApp({
    projectPath,
    config: {
      proxyPort: 0,
      apiPort: 0,
    },
  });

  await app.start();

  try {
    const saved = await apiRequest(app.api.port, '/api/ui-state', 'PATCH', {
      echo: {
        tabs: [
          {
            id: 'echo-one',
            title: 'Saved request',
            customTitle: true,
            groupId: 'group-one',
            source: 'test',
            method: 'POST',
            rawRequest: 'POST /saved HTTP/1.1\r\nHost: example.test\r\n\r\nbody',
            response: {
              statusCode: 201,
              statusMessage: 'Created',
              headers: { 'content-type': 'application/json' },
              bodyText: '{"ok":true}',
              bodyBase64: Buffer.from('{"ok":true}').toString('base64'),
            },
            color: 'pink',
          },
        ],
        groups: [{ id: 'group-one', title: 'Saved group', color: 'amber' }],
        selectedTabId: 'echo-one',
        selectedGroupId: 'group-one',
        split: 63,
      },
      traffic: {
        presets: [
          {
            id: 'traffic-api',
            name: 'API without static',
            filter: {
              search: '/api,/rest',
              inScopeOnly: true,
              filters: {
                method: ['GET'],
                status: ['4xx', '5xx'],
                host: ['example.test'],
              },
              extension: {
                mode: 'exclude',
                value: 'png, jpg, css, js',
              },
            },
          },
        ],
      },
    });
    assert.equal(saved.echo.tabs[0].title, 'Saved request');
    assert.equal(saved.traffic.presets[0].name, 'API without static');
  } finally {
    await app.stop();
  }

  app = createApp({
    projectPath,
    config: {
      proxyPort: 0,
      apiPort: 0,
    },
  });

  await app.start();

  try {
    const state = await apiRequest(app.api.port, '/api/state');
    assert.equal(state.ui.echo.tabs.length, 1);
    assert.equal(state.ui.echo.tabs[0].id, 'echo-one');
    assert.equal(state.ui.echo.tabs[0].color, 'pink');
    assert.equal(state.ui.echo.groups[0].title, 'Saved group');
    assert.equal(state.ui.echo.selectedTabId, 'echo-one');
    assert.equal(state.ui.echo.selectedGroupId, 'group-one');
    assert.equal(state.ui.echo.split, 63);
    assert.equal(state.ui.traffic.presets[0].id, 'traffic-api');
    assert.equal(state.ui.traffic.presets[0].filter.extension.mode, 'exclude');
    assert.equal(state.ui.traffic.presets[0].filter.filters.status.includes('5xx'), true);
  } finally {
    await app.stop();
  }
});

test('exports, clears, and imports project snapshots', async () => {
  const origin = await createOriginServer();
  const projectPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'veil-proxy-export-project-')), 'project.sqlite');
  const app = createApp({
    projectPath,
    config: {
      proxyPort: 0,
      apiPort: 0,
    },
  });

  await app.start();

  try {
    const target = `http://127.0.0.1:${origin.port}/snapshot`;
    const response = await proxyRequest(app.proxy.port, {
      method: 'GET',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
      },
    });
    assert.equal(response.statusCode, 200);

    await apiRequest(app.api.port, '/api/ui-state', 'PATCH', {
      echo: {
        tabs: [
          {
            id: 'snapshot-tab',
            title: 'Snapshot tab',
            method: 'GET',
            rawRequest: `GET /snapshot HTTP/1.1\r\nHost: 127.0.0.1:${origin.port}\r\n\r\n`,
          },
        ],
        groups: [],
        selectedTabId: 'snapshot-tab',
        split: 55,
      },
    });

    const exported = await apiRequest(app.api.port, '/api/project/export');
    assert.equal(exported.version, 1);
    assert.equal(exported.history.some((flow) => flow.request.url === target), true);
    assert.equal(exported.ui.echo.tabs[0].id, 'snapshot-tab');

    const cleared = await apiRequest(app.api.port, '/api/history', 'DELETE');
    assert.equal(cleared.history.length, 0);
    assert.equal(app.proxy.listHistory().length, 0);

    const imported = await apiRequest(app.api.port, '/api/project/import', 'POST', exported);
    assert.equal(imported.history.some((flow) => flow.url === target), true);
    assert.equal(imported.ui.echo.tabs[0].id, 'snapshot-tab');
    assert.equal(app.proxy.listHistory().some((flow) => flow.url === target), true);
  } finally {
    await app.stop();
    await origin.close();
  }
});

async function createOriginServer() {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      res.writeHead(200, {
        'content-type': 'application/json',
      });
      res.end(
        JSON.stringify({
          method: req.method,
          url: req.url,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    });
  });

  await listen(server, 0);
  return {
    port: server.address().port,
    close: () => close(server),
  };
}

async function createHttpsOriginServer() {
  const credentials = createSelfSignedCredentials();
  const server = https.createServer(credentials, (req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      res.writeHead(200, {
        'content-type': 'application/json',
      });
      res.end(
        JSON.stringify({
          method: req.method,
          url: req.url,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    });
  });

  await listen(server, 0);
  return {
    port: server.address().port,
    close: () => close(server),
  };
}

function createSelfSignedCredentials() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'veil-proxy-test-origin-'));
  const keyPath = path.join(dir, 'origin.key');
  const certPath = path.join(dir, 'origin.crt');
  execFileSync('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-days',
    '2',
    '-subj',
    '/CN=127.0.0.1',
    '-addext',
    'subjectAltName=IP:127.0.0.1',
  ], { stdio: 'pipe' });
  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
}

async function createSocks5Server(options = {}) {
  const requests = [];
  const server = net.createServer((socket) => {
    handleSocks5Connection(socket, requests, options).catch(() => socket.destroy());
  });

  await listen(server, 0);
  return {
    port: server.address().port,
    requests,
    close: () => close(server),
  };
}

async function handleSocks5Connection(socket, requests, options) {
  const greetingHead = await readExact(socket, 2);
  if (greetingHead[0] !== 0x05) {
    socket.destroy();
    return;
  }

  const methods = await readExact(socket, greetingHead[1]);
  if (![...methods].includes(0x00)) {
    socket.write(Buffer.from([0x05, 0xff]));
    socket.destroy();
    return;
  }
  socket.write(Buffer.from([0x05, 0x00]));

  const requestHead = await readExact(socket, 4);
  const addressType = requestHead[3];
  let host = '';

  if (addressType === 0x01) {
    host = [...(await readExact(socket, 4))].join('.');
  } else if (addressType === 0x03) {
    const length = (await readExact(socket, 1))[0];
    host = (await readExact(socket, length)).toString('utf8');
  } else {
    writeSocksReply(socket, 0x08);
    socket.destroy();
    return;
  }

  const port = (await readExact(socket, 2)).readUInt16BE(0);
  requests.push({ host, port, addressType });

  if (options.requireIpAddressTypeForIpTargets && net.isIP(host) && addressType !== 0x01) {
    writeSocksReply(socket, 0x08);
    socket.destroy();
    return;
  }

  const target = net.connect({ host, port });
  target.once('connect', () => {
    writeSocksReply(socket, 0x00);
    socket.pipe(target);
    target.pipe(socket);
  });
  target.once('error', () => {
    writeSocksReply(socket, 0x05);
    socket.destroy();
  });
}

function writeSocksReply(socket, code) {
  socket.write(Buffer.from([0x05, code, 0x00, 0x01, 127, 0, 0, 1, 0, 0]));
}

function proxyRequest(proxyPort, options) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(options.body || '');
    const req = http.request(
      {
        host: '127.0.0.1',
        port: proxyPort,
        method: options.method,
        path: options.path,
        headers: {
          ...options.headers,
          'content-length': body.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    req.on('error', reject);
    if (body.length > 0) {
      req.write(body);
    }
    req.end();
  });
}

function apiRequest(apiPort, urlPath, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        host: '127.0.0.1',
        port: apiPort,
        method,
        path: urlPath,
        headers: {
          accept: 'application/json',
          ...(payload.length > 0
            ? {
                'content-type': 'application/json',
                'content-length': payload.length,
              }
            : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(text || `HTTP ${res.statusCode}`));
            return;
          }
          resolve(text ? JSON.parse(text) : null);
        });
      },
    );

    req.on('error', reject);
    if (payload.length > 0) {
      req.write(payload);
    }
    req.end();
  });
}

function apiTextRequest(apiPort, urlPath, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? Buffer.alloc(0) : Buffer.from(String(body));
    const req = http.request(
      {
        host: '127.0.0.1',
        port: apiPort,
        method,
        path: urlPath,
        headers: payload.length > 0 ? { 'content-length': payload.length } : {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    req.on('error', reject);
    if (payload.length > 0) {
      req.write(payload);
    }
    req.end();
  });
}

async function tunnelHttpRequest(proxyPort, authority, path) {
  const socket = net.connect({ host: '127.0.0.1', port: proxyPort });
  await once(socket, 'connect');
  socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);

  const { head, rest } = await readUntil(socket, '\r\n\r\n');
  const statusLine = head.toString('latin1').split('\r\n')[0];
  assert.match(statusLine, /^HTTP\/1\.1 200 /);

  socket.write(`GET ${path} HTTP/1.1\r\nHost: ${authority}\r\nConnection: close\r\n\r\n`);
  const body = await readAll(socket, rest);
  return body.toString('utf8');
}

async function tunnelHttpsRequest(proxyPort, authority, requestPath, options = {}) {
  const socket = net.connect({ host: '127.0.0.1', port: proxyPort });
  await once(socket, 'connect');
  socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);

  const { head, rest } = await readUntil(socket, '\r\n\r\n');
  const statusLine = head.toString('latin1').split('\r\n')[0];
  assert.match(statusLine, /^HTTP\/1\.1 200 /);
  if (rest.length > 0) {
    socketReadBuffers.set(socket, rest);
  }

  const tlsSocket = tls.connect({
    socket,
    ca: options.ca,
    rejectUnauthorized: true,
    checkServerIdentity: () => undefined,
  });
  await once(tlsSocket, 'secureConnect');

  tlsSocket.write(`GET ${requestPath} HTTP/1.1\r\nHost: ${authority}\r\nConnection: close\r\n\r\n`);
  const body = await readAll(tlsSocket);
  return body.toString('utf8');
}

function waitFor(fn, timeoutMs = 1000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const value = fn();
      if (value) {
        resolve(value);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error('Timed out waiting for condition.'));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function readExact(socket, length) {
  return new Promise((resolve, reject) => {
    let buffer = socketReadBuffers.get(socket) || Buffer.alloc(0);
    socketReadBuffers.delete(socket);

    const buffered = tryResolve();
    if (buffered) {
      resolve(buffered);
      return;
    }

    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const result = tryResolve();
      if (result) {
        cleanup();
        resolve(result);
      }
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onEnd = () => {
      cleanup();
      reject(new Error('Socket ended before expected data arrived.'));
    };

    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('end', onEnd);
    };

    function tryResolve() {
      if (buffer.length < length) {
        return null;
      }

      const wanted = buffer.subarray(0, length);
      const rest = buffer.subarray(length);
      if (rest.length > 0) {
        socketReadBuffers.set(socket, rest);
      }
      return wanted;
    }

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('end', onEnd);
  });
}

function readUntil(socket, marker) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const markerBuffer = Buffer.from(marker, 'latin1');

    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const index = buffer.indexOf(markerBuffer);
      if (index !== -1) {
        cleanup();
        resolve({
          head: buffer.subarray(0, index),
          rest: buffer.subarray(index + markerBuffer.length),
        });
      }
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onEnd = () => {
      cleanup();
      reject(new Error('Socket ended before expected data arrived.'));
    };

    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('end', onEnd);
    };

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('end', onEnd);
  });
}

function readAll(socket, initial = Buffer.alloc(0)) {
  return new Promise((resolve, reject) => {
    const chunks = initial.length > 0 ? [initial] : [];
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('error', reject);
    socket.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function once(emitter, event) {
  return new Promise((resolve, reject) => {
    emitter.once(event, resolve);
    emitter.once('error', reject);
  });
}

async function getFreePort() {
  const server = http.createServer();
  await listen(server, 0);
  const port = server.address().port;
  await close(server);
  return port;
}
