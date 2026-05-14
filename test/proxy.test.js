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
const { ProjectStore } = require('../src/main/projectStore');

const socketReadBuffers = new WeakMap();

test('forwards plaintext HTTP requests and records the request', async () => {
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
      ALPNProtocols: ['h2', 'http/1.1'],
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
    const fullFlow = app.proxy.getFlow(flow.id);
    assert.equal(fullFlow.request.protocol, 'HTTP/1.1');
    assert.equal(fullFlow.request.alpnProtocol, 'http/1.1');
    assert.equal(fullFlow.protocol.clientAlpn, 'http/1.1');
    assert.equal(fullFlow.protocol.proxiedAs, 'HTTP/1.1');
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

test('searches captured requests across metadata headers and bodies', async () => {
  const origin = await createOriginServer();
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
    },
  });

  await app.start();

  try {
    const target = `http://127.0.0.1:${origin.port}/api/searchable?mode=global`;
    const response = await proxyRequest(app.proxy.port, {
      method: 'POST',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
        'content-type': 'text/plain',
        'x-search-token': 'needle-header',
      },
      body: 'needle-body',
    });
    assert.equal(response.statusCode, 200);

    const bodySearch = await apiRequest(app.api.port, '/api/search?q=needle-body');
    assert.equal(bodySearch.count, 1);
    assert.equal(bodySearch.results[0].request.method, 'POST');
    assert.equal(bodySearch.results[0].matches.some((match) => match.area === 'Request' && match.label === 'Body'), true);

    const headerSearch = await apiRequest(app.api.port, '/api/search?q=needle-header');
    assert.equal(headerSearch.count, 1);
    assert.equal(headerSearch.results[0].matches.some((match) => match.area === 'Request' && match.label === 'Headers'), true);
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('serves MCP tool calls with anonymized HTTP output', async () => {
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      mcp: {
        enabled: true,
        port: 0,
        token: 'test-token',
      },
    },
  });

  await app.start();

  try {
    assert.equal(app.mcp.state().running, true);

    const listed = await mcpRpc(app, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    assert.equal(listed.result.tools.some((tool) => tool.name === 'anonymize_http'), true);
    assert.equal(listed.result.tools.some((tool) => tool.name === 'get_proxy_item'), true);
    assert.equal(listed.result.tools.some((tool) => tool.name === 'send_proxy_item_to_echo'), false);

    const response = await mcpToolCall(app, 'anonymize_http', {
      message:
        'GET /users/alice@example.com HTTP/1.1\r\nHost: private.example.com\r\nCookie: SID=abcdef\r\nAuthorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue\r\n\r\n',
    });
    const text = response.result.structuredContent.message;
    assert.equal(text.includes('private.example.com'), false);
    assert.equal(text.includes('abcdef'), false);
    assert.equal(text.includes('signaturevalue'), false);
    assert.equal(text.includes('app-1.example.invalid'), true);
    assert.equal(text.includes('cookie-value-1'), true);
    assert.equal(response.result.structuredContent.rawTrafficReturned, undefined);
  } finally {
    await app.stop();
  }
});

test('records local MCP exchanges without exposing authorization headers', async () => {
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      mcp: {
        enabled: true,
        port: 0,
        token: 'test-token',
      },
    },
  });

  await app.start();

  try {
    const response = await mcpToolCall(app, 'anonymize_http', {
      message: 'GET / HTTP/1.1\r\nHost: private.example.com\r\n\r\n',
    });
    assert.equal(response.result.structuredContent.message.includes('private.example.com'), false);

    const exchanges = await apiRequest(app.api.port, '/api/mcp/exchanges');
    assert.equal(exchanges.length, 1);
    assert.equal(exchanges[0].rpcMethod, 'tools/call');
    assert.equal(exchanges[0].tool, 'anonymize_http');
    assert.equal(JSON.stringify(exchanges).includes('test-token'), false);

    const full = await apiRequest(app.api.port, `/api/mcp/exchanges/${encodeURIComponent(exchanges[0].id)}`);
    assert.equal(full.request.params.name, 'anonymize_http');
    assert.equal(full.response.result.structuredContent.rawRequestReturned, undefined);
    assert.equal(JSON.stringify(full).includes('test-token'), false);

    const cleared = await apiRequest(app.api.port, '/api/mcp/exchanges', 'DELETE');
    assert.equal(cleared.length, 0);
  } finally {
    await app.stop();
  }
});

test('manages local MCP secrets through the API without returning values', async () => {
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      mcp: {
        enabled: true,
        port: 0,
        token: 'test-token',
      },
    },
  });

  await app.start();

  try {
    const created = await apiRequest(app.api.port, '/api/mcp/secrets', 'POST', {
      name: 'auth_token',
      value: 'secret-api-value-1234567890',
      description: 'API auth token.',
    });
    assert.equal(created.name, 'AUTH_TOKEN');
    assert.equal(created.value, undefined);
    assert.equal(created.alias.startsWith('$secret:AUTH_TOKEN:'), true);

    const secrets = await apiRequest(app.api.port, '/api/mcp/secrets');
    assert.equal(secrets.length, 1);
    assert.equal(JSON.stringify(secrets).includes('secret-api-value-1234567890'), false);

    const disabled = await apiRequest(app.api.port, `/api/mcp/secrets/${encodeURIComponent(created.id)}`, 'PATCH', {
      enabled: false,
    });
    assert.equal(disabled.enabled, false);

    const regenerated = await apiRequest(app.api.port, `/api/mcp/secrets/${encodeURIComponent(created.id)}`, 'PATCH', {
      regenerateAlias: true,
    });
    assert.notEqual(regenerated.alias, created.alias);

    const deleted = await apiRequest(app.api.port, `/api/mcp/secrets/${encodeURIComponent(created.id)}`, 'DELETE');
    assert.equal(deleted.deleted, true);
    assert.equal((await apiRequest(app.api.port, '/api/mcp/secrets')).length, 0);
  } finally {
    await app.stop();
  }
});

test('MCP anonymization settings change returned traffic redaction', async () => {
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      mcp: {
        enabled: true,
        port: 0,
        token: 'test-token',
        anonymization: {
          profile: 'local',
          redactHosts: false,
          redactCookieNames: false,
          redactCookieValues: false,
          redactAuthorization: true,
          redactPlatformHeaders: false,
          aggressivePathRedaction: false,
          maxBodyChars: 262144,
        },
      },
    },
  });

  await app.start();

  try {
    const local = await mcpToolCall(app, 'anonymize_http', {
      message: 'GET /users/alice HTTP/1.1\r\nHost: private.example.com\r\nCookie: SID=plain-cookie\r\nAuthorization: Bearer top-secret-token-1234567890\r\n\r\n',
    });
    const localText = local.result.structuredContent.message;
    assert.equal(localText.includes('private.example.com'), true);
    assert.equal(localText.includes('SID=plain-cookie'), true);
    assert.equal(localText.includes('top-secret-token-1234567890'), false);

    await apiRequest(app.api.port, '/api/config', 'PATCH', {
      mcp: {
        ...app.proxy.getConfig().mcp,
        anonymization: {
          profile: 'strict',
          redactHosts: true,
          redactCookieNames: true,
          redactCookieValues: true,
          redactAuthorization: true,
          redactPlatformHeaders: true,
          aggressivePathRedaction: true,
          maxBodyChars: 131072,
        },
      },
    });

    const strict = await mcpToolCall(app, 'anonymize_http', {
      message: 'GET /users/alice HTTP/1.1\r\nHost: private.example.com\r\nCookie: SID=plain-cookie\r\nServer: nginx\r\n\r\n',
    });
    const strictText = strict.result.structuredContent.message;
    assert.equal(strictText.includes('private.example.com'), false);
    assert.equal(strictText.includes('plain-cookie'), false);
    assert.equal(strictText.includes('nginx'), false);
    assert.equal(strictText.includes('app-'), true);
  } finally {
    await app.stop();
  }
});

test('MCP controlled payloads return sanitized reflection evidence', async () => {
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      mcp: {
        enabled: true,
        port: 0,
        token: 'test-token',
        activeTesting: true,
      },
    },
  });

  await app.start();

  try {
    const listed = await mcpRpc(app, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    assert.equal(listed.result.tools.some((tool) => tool.name === 'register_controlled_payload'), true);

    const registered = await mcpToolCall(app, 'register_controlled_payload', {
      payload: `alert('VEILCANARY-alpha')`,
    });
    assert.equal(registered.result.structuredContent.registered, true);
    assert.equal(registered.result.structuredContent.rawPayloadReturned, false);
    assert.equal(registered.result.structuredContent.canaries.includes('VEILCANARY-alpha'), true);

    const reflected = await mcpToolCall(app, 'anonymize_http', {
      direction: 'response',
      message: "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<script>alert('VEILCANARY-alpha')</script>",
    });
    const evidence = reflected.result.structuredContent.evidence;
    assert.equal(evidence.some((item) => item.canary === 'VEILCANARY-alpha'), true);
    assert.equal(evidence.some((item) => item.payloadIntegrity === 'full_payload'), true);
    assert.equal(JSON.stringify(reflected).includes('private.example.com'), false);

    const cleared = await mcpToolCall(app, 'clear_controlled_payloads');
    assert.equal(cleared.result.structuredContent.cleared, true);
    assert.equal(app.mcp.controlledPayloads.count(), 0);
  } finally {
    await app.stop();
  }
});

test('MCP history and secrets tools never return raw target data', async () => {
  const origin = await createOriginServer();
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      mcp: {
        enabled: true,
        port: 0,
        token: 'test-token',
      },
    },
  });

  await app.start();

  try {
    const secret = app.mcp.secretVault.add({
      name: 'auth_token',
      value: 'super-secret-token',
      description: 'Session token for authenticated checks.',
    });
    const target = `http://127.0.0.1:${origin.port}/login?email=alice@example.com&token=super-secret-token`;
    const response = await proxyRequest(app.proxy.port, {
      method: 'POST',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
        'content-type': 'text/plain',
        authorization: 'Bearer super-secret-token',
      },
      body: 'password=super-secret-token',
    });
    assert.equal(response.statusCode, 200);

    const secrets = await mcpToolCall(app, 'list_secrets');
    assert.equal(secrets.result.structuredContent.secrets[0].alias, secret.alias);
    assert.equal(JSON.stringify(secrets).includes('super-secret-token'), false);

    const history = await mcpToolCall(app, 'list_proxy_history', { limit: 10 });
    const historyText = JSON.stringify(history);
    assert.equal(historyText.includes('127.0.0.1'), false);
    assert.equal(historyText.includes('alice@example.com'), false);
    assert.equal(historyText.includes('super-secret-token'), false);
    assert.equal(historyText.includes('app-'), true);

    const id = history.result.structuredContent.items[0].id;
    const item = await mcpToolCall(app, 'get_proxy_item', { id });
    const itemText = JSON.stringify(item);
    assert.equal(itemText.includes('127.0.0.1'), false);
    assert.equal(itemText.includes('alice@example.com'), false);
    assert.equal(itemText.includes('super-secret-token'), false);
    assert.equal(itemText.includes(secret.alias) || itemText.includes(encodeURIComponent(secret.alias)), true);
    assert.equal(item.result.structuredContent.rawRequestReturned, false);
    assert.equal(item.result.structuredContent.rawResponseReturned, false);
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('MCP active tool resolves secret aliases locally before sending modified request', async () => {
  const origin = await createOriginServer();
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      mcp: {
        enabled: true,
        port: 0,
        token: 'test-token',
        activeTesting: true,
      },
    },
  });

  await app.start();

  try {
    const secret = app.mcp.secretVault.add({
      name: 'api_key',
      value: 'real-api-key-1234567890',
      description: 'API key used by active checks.',
    });
    const target = `http://127.0.0.1:${origin.port}/echo`;
    const response = await proxyRequest(app.proxy.port, {
      method: 'GET',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
      },
    });
    assert.equal(response.statusCode, 200);

    const sourceId = app.proxy.listHistory()[0].id;
    const sent = await mcpToolCall(app, 'send_modified_proxy_item', {
      id: sourceId,
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
      },
      body: `apiKey=${secret.alias}`,
    });
    const sentText = JSON.stringify(sent);
    assert.equal(sent.result.structuredContent.sent, true);
    assert.equal(sent.result.structuredContent.secretAliasesUsed.includes(secret.alias), true);
    assert.equal(sentText.includes('real-api-key-1234567890'), false);
    assert.equal(sentText.includes(secret.alias), true);
    assert.equal(sent.result.structuredContent.rawRequestReturned, false);
    assert.equal(sent.result.structuredContent.rawResponseReturned, false);
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('MCP run_payload_attack sends payload variants and returns anonymized results', async () => {
  const origin = await createOriginServer();
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      mcp: {
        enabled: true,
        port: 0,
        token: 'test-token',
        activeTesting: true,
      },
    },
  });

  await app.start();

  try {
    const secret = app.mcp.secretVault.add({
      name: 'attack_token',
      value: 'attack-secret-1234567890',
      description: 'Secret payload value for attack checks.',
    });
    const target = `http://127.0.0.1:${origin.port}/search?q=seed`;
    const sourceResponse = await proxyRequest(app.proxy.port, {
      method: 'GET',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
      },
    });
    assert.equal(sourceResponse.statusCode, 200);

    const listed = await mcpRpc(app, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    assert.equal(listed.result.tools.some((tool) => tool.name === 'run_payload_attack'), true);

    const sourceId = app.proxy.listHistory()[0].id;
    const attack = await mcpToolCall(app, 'run_payload_attack', {
      id: sourceId,
      insertionPoint: {
        type: 'query',
        name: 'q',
      },
      payloads: ['baseline', 'VEILCANARY-attack', secret.alias],
      includeDetails: true,
      detailLimit: 3,
    });
    const structured = attack.result.structuredContent;
    const serialized = JSON.stringify(attack);

    assert.equal(structured.executed, 3);
    assert.equal(structured.payloadCount, 3);
    assert.equal(typeof structured.attackId, 'string');
    assert.equal(structured.results.length, 3);
    assert.equal(structured.reflectedCount, 3);
    assert.equal(structured.secretAliasesUsed.includes(secret.alias), true);
    assert.equal(structured.rawRequestReturned, false);
    assert.equal(structured.rawResponseReturned, false);
    assert.equal(structured.details.length > 0, true);
    assert.equal(serialized.includes('attack-secret-1234567890'), false);
    assert.equal(serialized.includes(`127.0.0.1:${origin.port}`), false);
    assert.equal(serialized.includes(secret.alias), true);

    const attackRuns = await apiRequest(app.api.port, '/api/payload-attacks');
    assert.equal(attackRuns.length, 1);
    assert.equal(attackRuns[0].id, structured.attackId);
    assert.equal(attackRuns[0].sourceId, sourceId);
    assert.equal(attackRuns[0].executed, 3);
    assert.equal(attackRuns[0].reflectedCount, 3);

    const attackDetail = await apiRequest(app.api.port, `/api/payload-attacks/${encodeURIComponent(structured.attackId)}`);
    assert.equal(attackDetail.results.length, 3);
    assert.equal(attackDetail.results.every((item) => item.sentTrafficId), true);
    assert.equal(attackDetail.secretAliasesUsed.includes(secret.alias), true);
    assert.equal(JSON.stringify(attackDetail).includes('attack-secret-1234567890'), false);
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('MCP sends captured requests to Echo without returning raw traffic', async () => {
  const origin = await createOriginServer();
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      mcp: {
        enabled: true,
        port: 0,
        token: 'test-token',
        activeTesting: true,
      },
    },
  });

  await app.start();

  try {
    const target = `http://127.0.0.1:${origin.port}/login?email=alice@example.com`;
    const response = await proxyRequest(app.proxy.port, {
      method: 'POST',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'password=secret-value',
    });
    assert.equal(response.statusCode, 200);

    const listed = await mcpRpc(app, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    assert.equal(listed.result.tools.some((tool) => tool.name === 'send_proxy_item_to_echo'), true);
    assert.equal(listed.result.tools.some((tool) => tool.name === 'send_random_proxy_item_to_echo'), true);

    const sourceId = app.proxy.listHistory()[0].id;
    const sent = await mcpToolCall(app, 'send_proxy_item_to_echo', {
      id: sourceId,
      tabName: 'Login replay',
      groupName: 'Auth checks',
      color: 'pink',
      groupColor: 'cyan',
    });
    const serialized = JSON.stringify(sent);
    const structured = sent.result.structuredContent;
    assert.equal(structured.sentToEcho, true);
    assert.equal(structured.rawRequestReturned, false);
    assert.equal(structured.rawResponseReturned, false);
    assert.equal(serialized.includes(`127.0.0.1:${origin.port}`), false);
    assert.equal(serialized.includes('alice@example.com'), false);
    assert.equal(serialized.includes('secret-value'), false);

    const ui = app.api.getUiState();
    const group = ui.echo.groups.find((item) => item.title === 'Auth checks');
    assert.ok(group);
    assert.equal(group.color, 'cyan');
    const tab = ui.echo.tabs.find((item) => item.id === structured.echoTabId);
    assert.ok(tab);
    assert.equal(tab.title, 'Login replay');
    assert.equal(tab.groupId, group.id);
    assert.equal(tab.color, 'pink');
    assert.equal(tab.rawRequest.toLowerCase().includes(`host: 127.0.0.1:${origin.port}`), true);
    assert.equal(tab.rawRequest.includes('alice@example.com'), true);

    const random = await mcpToolCall(app, 'send_random_proxy_item_to_repeater', {
      limit: 10,
      repeaterGroup: 'Auth checks',
      tabName: 'Random replay',
    });
    assert.equal(random.result.structuredContent.sentToEcho, true);
    assert.equal(app.api.getUiState().echo.tabs.length, 2);
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('MCP reports local findings without returning raw evidence', async () => {
  const origin = await createOriginServer();
  const app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
      mcp: {
        enabled: true,
        port: 0,
        token: 'test-token',
        activeTesting: true,
      },
    },
  });

  await app.start();

  try {
    const secretValue = 'finding-secret-token-1234567890';
    const secret = app.mcp.secretVault.add({
      name: 'finding_token',
      value: secretValue,
      description: 'Finding verification token.',
    });
    const target = `http://127.0.0.1:${origin.port}/account?email=alice@example.com`;
    const response = await proxyRequest(app.proxy.port, {
      method: 'GET',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
      },
    });
    assert.equal(response.statusCode, 200);

    const sourceId = app.proxy.listHistory()[0].id;
    const reported = await mcpToolCall(app, 'report_proxy_item_issue', {
      id: sourceId,
      name: 'Account token exposure for alice@example.com',
      detail: `Observed token ${secretValue} on http://127.0.0.1:${origin.port}/account`,
      remediation: 'Move the token to a server-side session.',
      severity: 'medium',
      confidence: 'firm',
      category: 'Access Control',
    });
    const reportedText = JSON.stringify(reported);
    assert.equal(reported.result.structuredContent.reported, true);
    assert.equal(reported.result.structuredContent.rawRequestReturned, false);
    assert.equal(reported.result.structuredContent.rawResponseReturned, false);
    assert.equal(reportedText.includes(`127.0.0.1:${origin.port}`), false);
    assert.equal(reportedText.includes('alice@example.com'), false);
    assert.equal(reportedText.includes(secretValue), false);

    const sent = await mcpToolCall(app, 'send_modified_proxy_item', {
      id: sourceId,
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: `token=${secret.alias}`,
    });
    assert.equal(sent.result.structuredContent.sent, true);
    const sentTrafficAfterSend = await apiRequest(app.api.port, '/api/sent-traffic');
    assert.equal(sentTrafficAfterSend.length, 1);
    assert.equal(sentTrafficAfterSend[0].sourceId, sourceId);
    assert.equal(sentTrafficAfterSend[0].tool, 'send_modified_proxy_item');
    const sentTrafficFull = await apiRequest(app.api.port, `/api/sent-traffic/${encodeURIComponent(sentTrafficAfterSend[0].id)}`);
    assert.equal(Buffer.from(sentTrafficFull.request.bodyBase64, 'base64').toString('utf8').includes(secretValue), true);

    const sentReported = await mcpToolCall(app, 'report_sent_traffic_issue', {
      id: sourceId,
      name: 'Modified evidence issue',
      detail: `Response reflected ${secretValue}`,
      severity: 'high',
      category: 'Evidence',
    });
    assert.equal(sentReported.result.structuredContent.evidenceSource, 'sent_traffic');
    assert.equal(JSON.stringify(sentReported).includes(secretValue), false);

    const modifiedReported = await mcpToolCall(app, 'report_modified_proxy_item_issue', {
      id: sourceId,
      name: 'One-call modified finding',
      detail: `Payload ${secretValue} confirms behavior`,
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: `token=${secret.alias}`,
      severity: 'low',
      createEchoTab: true,
      groupName: 'Reported evidence',
    });
    assert.equal(modifiedReported.result.structuredContent.evidenceSource, 'modified_request');
    assert.equal(modifiedReported.result.structuredContent.secretAliasesUsed.includes(secret.alias), true);
    assert.equal(JSON.stringify(modifiedReported).includes(secretValue), false);
    assert.equal(app.api.getUiState().echo.groups.some((group) => group.title === 'Reported evidence'), true);
    assert.equal((await apiRequest(app.api.port, '/api/sent-traffic')).length, 2);

    const listed = await mcpToolCall(app, 'list_reported_findings', { limit: 10 });
    assert.equal(listed.result.structuredContent.count, 3);
    assert.equal(JSON.stringify(listed).includes(secretValue), false);
    assert.equal(JSON.stringify(listed).includes('alice@example.com'), false);

    const findings = await apiRequest(app.api.port, '/api/findings');
    assert.equal(findings.filter((finding) => finding.source === 'mcp').length, 3);
    assert.equal(findings.some((finding) => finding.title === 'Account token exposure for alice@example.com'), true);
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

test('stores large captured bodies externally and hydrates them from the project database', async () => {
  const origin = await createOriginServer();
  const projectPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'veil-proxy-body-project-')), 'project.sqlite');
  const app = createApp({
    projectPath,
    config: {
      proxyPort: 0,
      apiPort: 0,
    },
  });

  await app.start();

  let flowId;
  const largeBody = 'body-'.repeat(6000);
  try {
    const target = `http://127.0.0.1:${origin.port}/large-body`;
    const response = await proxyRequest(app.proxy.port, {
      method: 'POST',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
        'content-type': 'text/plain',
      },
      body: largeBody,
    });
    assert.equal(response.statusCode, 200);

    const summary = app.proxy.listHistory().find((item) => item.path === '/large-body');
    assert.ok(summary);
    flowId = summary.id;

    const flow = app.proxy.getFlow(flowId);
    assert.equal(flow.request.bodyText, largeBody);
    assert.equal(JSON.parse(flow.response.bodyText).body, largeBody);

    const statePayload = await apiRequest(app.api.port, '/api/state');
    const apiSummary = statePayload.history.find((item) => item.id === flowId);
    assert.ok(apiSummary);
    assert.equal(apiSummary.request, undefined);
    const apiFlow = await apiRequest(app.api.port, `/api/history/${flowId}`);
    assert.equal(apiFlow.request.bodyText, largeBody);
  } finally {
    await app.stop();
    await origin.close();
  }

  const store = new ProjectStore(projectPath);
  try {
    const row = store.db.prepare('SELECT flow_json FROM flows WHERE id = ?').get(flowId);
    assert.ok(row);
    const storedFlow = JSON.parse(row.flow_json);
    assert.equal(storedFlow.request.bodyText, '');
    assert.equal(storedFlow.request.bodyBase64, '');
    assert.equal(storedFlow.request.bodyStorage.external, true);

    const bodies = store.db.prepare('SELECT part, storage_encoding, original_bytes, stored_bytes FROM flow_bodies WHERE flow_id = ?').all(flowId);
    assert.equal(bodies.some((body) => body.part === 'request' && body.storage_encoding === 'gzip-json'), true);
    assert.equal(bodies.some((body) => body.part === 'response'), true);

    const hydrated = store.loadHistory(10).find((flow) => flow.id === flowId);
    assert.ok(hydrated);
    assert.equal(hydrated.request.bodyText, largeBody);
    assert.equal(JSON.parse(hydrated.response.bodyText).body, largeBody);
  } finally {
    store.close();
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
                include: '',
                exclude: 'png, jpg, css, js',
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
    assert.equal(state.ui.traffic.presets[0].filter.extension.exclude, 'png, jpg, css, js');
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
    app.proxy.addSentTraffic({
      id: 'sent-snapshot',
      sourceId: app.proxy.listHistory()[0].id,
      tool: 'test',
      type: 'http',
      startedAt: Date.now(),
      completedAt: Date.now(),
      durationMs: 1,
      request: {
        method: 'GET',
        url: target,
        headers: { host: `127.0.0.1:${origin.port}` },
        bodyText: '',
        bodyBase64: '',
      },
      response: {
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'text/plain' },
        bodyText: 'sent evidence',
        bodyBase64: Buffer.from('sent evidence').toString('base64'),
      },
      notes: ['snapshot sent traffic'],
    });
    app.proxy.addPayloadAttack({
      id: 'attack-snapshot',
      sourceId: app.proxy.listHistory()[0].id,
      method: 'GET',
      url: target,
      insertionPoint: { type: 'query', name: 'q' },
      startedAt: Date.now(),
      completedAt: Date.now(),
      durationMs: 2,
      requestedPayloads: 1,
      executed: 1,
      sent: 1,
      errors: 0,
      interesting: 1,
      reflectedCount: 1,
      securitySignalCount: 0,
      statusCodes: { 200: 1 },
      results: [
        {
          index: 0,
          sentTrafficId: 'sent-snapshot',
          payloadPreview: 'snapshot',
          statusCode: 200,
          durationMs: 2,
          responseBytesDelta: 12,
          payloadReflected: true,
          interesting: true,
        },
      ],
    });
    app.mcp.replaceExchanges([
      {
        id: 'mcp-snapshot',
        startedAt: Date.now(),
        completedAt: Date.now(),
        status: 200,
        rpcMethod: 'tools/call',
        tool: 'anonymize_http',
        request: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'anonymize_http' } },
        response: { jsonrpc: '2.0', id: 1, result: { structuredContent: { ok: true } } },
      },
    ]);

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
    assert.equal(Array.isArray(exported.findings), true);
    assert.equal(exported.sentTraffic.some((record) => record.id === 'sent-snapshot'), true);
    assert.equal(exported.payloadAttacks.some((record) => record.id === 'attack-snapshot'), true);
    assert.equal(exported.mcpExchanges.some((record) => record.id === 'mcp-snapshot'), true);

    const cleared = await apiRequest(app.api.port, '/api/project/new', 'POST');
    assert.equal(cleared.history.length, 0);
    assert.equal(cleared.ui.echo.tabs.length, 0);
    assert.equal(app.proxy.listHistory().length, 0);
    assert.equal((await apiRequest(app.api.port, '/api/findings')).length, 0);
    assert.equal((await apiRequest(app.api.port, '/api/sent-traffic')).length, 0);
    assert.equal((await apiRequest(app.api.port, '/api/payload-attacks')).length, 0);
    assert.equal((await apiRequest(app.api.port, '/api/mcp/exchanges')).length, 0);

    const imported = await apiRequest(app.api.port, '/api/project/import', 'POST', exported);
    assert.equal(imported.history.some((flow) => flow.url === target), true);
    assert.equal(imported.ui.echo.tabs[0].id, 'snapshot-tab');
    assert.equal(imported.sentTraffic.some((record) => record.id === 'sent-snapshot'), true);
    assert.equal(imported.payloadAttacks.some((record) => record.id === 'attack-snapshot'), true);
    assert.equal(imported.mcpExchanges.some((record) => record.id === 'mcp-snapshot'), true);
    assert.equal(app.proxy.listHistory().some((flow) => flow.url === target), true);
    assert.equal((await apiRequest(app.api.port, '/api/sent-traffic')).some((record) => record.id === 'sent-snapshot'), true);
    assert.equal((await apiRequest(app.api.port, '/api/payload-attacks')).some((record) => record.id === 'attack-snapshot'), true);
    assert.equal((await apiRequest(app.api.port, '/api/mcp/exchanges')).some((record) => record.id === 'mcp-snapshot'), true);
  } finally {
    await app.stop();
    await origin.close();
  }
});

test('starts without a project file as an empty memory session', async () => {
  const origin = await createOriginServer();
  let app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
    },
  });

  await app.start();

  try {
    const target = `http://127.0.0.1:${origin.port}/memory-session`;
    const response = await proxyRequest(app.proxy.port, {
      method: 'GET',
      path: target,
      headers: {
        host: `127.0.0.1:${origin.port}`,
      },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(app.proxy.listHistory().length, 1);
  } finally {
    await app.stop();
  }

  app = createApp({
    config: {
      proxyPort: 0,
      apiPort: 0,
    },
  });
  await app.start();

  try {
    const state = await apiRequest(app.api.port, '/api/state');
    assert.equal(state.project, null);
    assert.equal(state.history.length, 0);
    assert.equal(state.ui.echo.tabs.length, 0);
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

function mcpToolCall(app, name, args = {}) {
  return mcpRpc(app, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name,
      arguments: args,
    },
  });
}

function mcpRpc(app, body) {
  const mcp = app.mcp.state();
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        host: '127.0.0.1',
        port: mcp.port,
        method: 'POST',
        path: '/mcp',
        headers: {
          authorization: `Bearer ${mcp.token}`,
          'content-type': 'application/json',
          'content-length': payload.length,
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
    req.write(payload);
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
    ALPNProtocols: options.ALPNProtocols,
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
