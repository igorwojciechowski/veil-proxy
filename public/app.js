const state = {
  config: null,
  history: [],
  pending: [],
  selectedFlowId: null,
  selectedFlow: null,
  selectedPendingId: null,
  trafficFilter: 'all',
  trafficSearch: '',
  activeTab: 'request',
  messageTabs: {
    request: 'pretty',
    response: 'pretty',
  },
  siteMap: { hosts: [] },
  selectedSiteHost: null,
  siteMapSearch: '',
  siteMapInScopeOnly: false,
  rulesModalStage: 'request',
};

const el = {
  viewTitle: document.querySelector('#viewTitle'),
  trafficCount: document.querySelector('#trafficCount'),
  pendingCount: document.querySelector('#pendingCount'),
  upstreamStatus: document.querySelector('#upstreamStatus'),
  proxyAddress: document.querySelector('#proxyAddress'),
  requestInterceptToggle: document.querySelector('#requestInterceptToggle'),
  responseInterceptToggle: document.querySelector('#responseInterceptToggle'),
  trafficRows: document.querySelector('#trafficRows'),
  trafficSearch: document.querySelector('#trafficSearch'),
  siteMapCount: document.querySelector('#siteMapCount'),
  siteMapSearch: document.querySelector('#siteMapSearch'),
  siteMapInScopeOnly: document.querySelector('#siteMapInScopeOnly'),
  siteHostsList: document.querySelector('#siteHostsList'),
  sitePathsTitle: document.querySelector('#sitePathsTitle'),
  sitePathsSubtitle: document.querySelector('#sitePathsSubtitle'),
  sitePathsList: document.querySelector('#sitePathsList'),
  refreshSiteMapBtn: document.querySelector('#refreshSiteMapBtn'),
  emptyDetail: document.querySelector('#emptyDetail'),
  flowDetail: document.querySelector('#flowDetail'),
  detailMethod: document.querySelector('#detailMethod'),
  detailUrl: document.querySelector('#detailUrl'),
  detailStatus: document.querySelector('#detailStatus'),
  requestSummary: document.querySelector('#requestSummary'),
  requestQuery: document.querySelector('#requestQuery'),
  requestPrettyHeaders: document.querySelector('#requestPrettyHeaders'),
  requestBody: document.querySelector('#requestBody'),
  requestRawText: document.querySelector('#requestRawText'),
  responseSummary: document.querySelector('#responseSummary'),
  responsePrettyHeaders: document.querySelector('#responsePrettyHeaders'),
  responseBody: document.querySelector('#responseBody'),
  responseRawText: document.querySelector('#responseRawText'),
  metaBody: document.querySelector('#metaBody'),
  queueBadge: document.querySelector('#queueBadge'),
  pendingList: document.querySelector('#pendingList'),
  emptyPending: document.querySelector('#emptyPending'),
  pendingEditor: document.querySelector('#pendingEditor'),
  pendingStage: document.querySelector('#pendingStage'),
  pendingTitle: document.querySelector('#pendingTitle'),
  requestFields: document.querySelector('#requestFields'),
  responseFields: document.querySelector('#responseFields'),
  editMethod: document.querySelector('#editMethod'),
  editUrl: document.querySelector('#editUrl'),
  editStatusCode: document.querySelector('#editStatusCode'),
  editStatusMessage: document.querySelector('#editStatusMessage'),
  editHeaders: document.querySelector('#editHeaders'),
  editBody: document.querySelector('#editBody'),
  continueBtn: document.querySelector('#continueBtn'),
  dropBtn: document.querySelector('#dropBtn'),
  modifyBtn: document.querySelector('#modifyBtn'),
  requestRulesBtn: document.querySelector('#requestRulesBtn'),
  responseRulesBtn: document.querySelector('#responseRulesBtn'),
  rulesModal: document.querySelector('#rulesModal'),
  rulesBackdrop: document.querySelector('#rulesBackdrop'),
  closeRulesBtn: document.querySelector('#closeRulesBtn'),
  cancelRulesBtn: document.querySelector('#cancelRulesBtn'),
  rulesStagePill: document.querySelector('#rulesStagePill'),
  rulesModalTitle: document.querySelector('#rulesModalTitle'),
  rulesModalSubtitle: document.querySelector('#rulesModalSubtitle'),
  rulesCount: document.querySelector('#rulesCount'),
  addRuleBtn: document.querySelector('#addRuleBtn'),
  saveRulesBtn: document.querySelector('#saveRulesBtn'),
  rulesList: document.querySelector('#rulesList'),
  proxyHost: document.querySelector('#proxyHost'),
  proxyPort: document.querySelector('#proxyPort'),
  saveProxyBtn: document.querySelector('#saveProxyBtn'),
  proxySaveStatus: document.querySelector('#proxySaveStatus'),
  scopeStatus: document.querySelector('#scopeStatus'),
  scopeEnabledToggle: document.querySelector('#scopeEnabledToggle'),
  includeScopeCount: document.querySelector('#includeScopeCount'),
  excludeScopeCount: document.querySelector('#excludeScopeCount'),
  addIncludeScopeRuleBtn: document.querySelector('#addIncludeScopeRuleBtn'),
  addExcludeScopeRuleBtn: document.querySelector('#addExcludeScopeRuleBtn'),
  saveScopeBtn: document.querySelector('#saveScopeBtn'),
  includeScopeRulesList: document.querySelector('#includeScopeRulesList'),
  excludeScopeRulesList: document.querySelector('#excludeScopeRulesList'),
  upstreamMode: document.querySelector('#upstreamMode'),
  upstreamHost: document.querySelector('#upstreamHost'),
  upstreamPort: document.querySelector('#upstreamPort'),
  upstreamUsername: document.querySelector('#upstreamUsername'),
  upstreamPassword: document.querySelector('#upstreamPassword'),
  saveConfigBtn: document.querySelector('#saveConfigBtn'),
};

let siteMapLoadTimer = null;

async function init() {
  bindUi();
  const payload = await api('/api/state');
  applyState(payload);
  await loadSiteMap();
  openEvents();
}

function bindUi() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });

  document.querySelectorAll('.segment').forEach((button) => {
    button.addEventListener('click', () => {
      state.trafficFilter = button.dataset.filter;
      document.querySelectorAll('.segment').forEach((item) => item.classList.toggle('active', item === button));
      renderTraffic();
    });
  });

  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeTab = button.dataset.tab;
      renderTabs();
    });
  });

  document.querySelectorAll('.message-tab').forEach((button) => {
    button.addEventListener('click', () => {
      state.messageTabs[button.dataset.message] = button.dataset.messageTab;
      renderMessageTabs();
    });
  });

  document.querySelectorAll('[data-copy-target]').forEach((button) => {
    button.addEventListener('click', () => copyTargetText(button));
  });

  el.trafficSearch.addEventListener('input', () => {
    state.trafficSearch = el.trafficSearch.value.trim().toLowerCase();
    renderTraffic();
  });

  el.siteMapSearch.addEventListener('input', () => {
    state.siteMapSearch = el.siteMapSearch.value.trim().toLowerCase();
    renderSiteMap();
  });

  el.siteMapInScopeOnly.addEventListener('change', () => {
    state.siteMapInScopeOnly = el.siteMapInScopeOnly.checked;
    renderSiteMap();
  });

  el.refreshSiteMapBtn.addEventListener('click', () => loadSiteMap());

  el.requestInterceptToggle.addEventListener('change', () => {
    patchConfig({ intercept: { requests: el.requestInterceptToggle.checked } });
  });

  el.responseInterceptToggle.addEventListener('change', () => {
    patchConfig({ intercept: { responses: el.responseInterceptToggle.checked } });
  });

  el.saveConfigBtn.addEventListener('click', () => {
    patchConfig({
      upstream: {
        mode: el.upstreamMode.value,
        host: el.upstreamHost.value.trim(),
        port: Number(el.upstreamPort.value || 0),
        username: el.upstreamUsername.value,
        password: el.upstreamPassword.value,
      },
    });
  });

  el.saveProxyBtn.addEventListener('click', saveProxyConfig);
  el.addIncludeScopeRuleBtn.addEventListener('click', () => addScopeRule('include'));
  el.addExcludeScopeRuleBtn.addEventListener('click', () => addScopeRule('exclude'));
  el.saveScopeBtn.addEventListener('click', saveScopeConfig);
  [el.includeScopeRulesList, el.excludeScopeRulesList].forEach((list) => {
    list.addEventListener('click', (event) => {
      const deleteButton = event.target.closest('[data-delete-scope-rule]');
      if (deleteButton) {
        deleteScopeRule(deleteButton.dataset.deleteScopeRule);
      }
    });
    list.addEventListener('change', (event) => {
      const fieldSelect = event.target.closest('[data-scope-field="field"]');
      if (fieldSelect) {
        updateScopeRuleRow(fieldSelect.closest('.rule-row'));
      }
    });
  });

  el.continueBtn.addEventListener('click', () => sendPendingAction('continue'));
  el.dropBtn.addEventListener('click', () => sendPendingAction('drop'));
  el.modifyBtn.addEventListener('click', () => sendPendingAction('modify'));
  el.requestRulesBtn.addEventListener('click', () => openRulesModal('request'));
  el.responseRulesBtn.addEventListener('click', () => openRulesModal('response'));
  el.closeRulesBtn.addEventListener('click', closeRulesModal);
  el.cancelRulesBtn.addEventListener('click', closeRulesModal);
  el.rulesBackdrop.addEventListener('click', closeRulesModal);
  el.addRuleBtn.addEventListener('click', addInterceptRule);
  el.saveRulesBtn.addEventListener('click', saveInterceptRules);
  el.rulesList.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-delete-rule]');
    if (deleteButton) {
      deleteInterceptRule(deleteButton.dataset.deleteRule);
    }
  });
  el.rulesList.addEventListener('change', (event) => {
    const fieldSelect = event.target.closest('[data-rule-field="field"]');
    if (fieldSelect) {
      updateRuleRowVisibility(fieldSelect.closest('.rule-row'));
    }
  });
}

function openEvents() {
  const events = new EventSource('/api/events');
  events.addEventListener('state', (event) => applyState(JSON.parse(event.data)));
  events.addEventListener('history', (event) => upsertHistory(JSON.parse(event.data)));
  events.addEventListener('pending', (event) => {
    state.pending = JSON.parse(event.data);
    renderAll();
  });
  events.addEventListener('config', (event) => {
    state.config = JSON.parse(event.data);
    renderConfig();
    renderMeta();
    refreshHistoryAndSiteMap().then(renderAll).catch(console.error);
  });
}

function applyState(payload) {
  state.config = payload.config;
  state.history = payload.history || [];
  state.pending = payload.pending || [];
  renderAll();
}

function upsertHistory(flow) {
  const index = state.history.findIndex((item) => item.id === flow.id);
  if (index === -1) {
    state.history.unshift(flow);
  } else {
    state.history[index] = flow;
  }

  if (state.selectedFlowId === flow.id) {
    loadFlow(flow.id);
  }
  renderAll();
  scheduleSiteMapLoad();
}

function renderAll() {
  renderMeta();
  renderConfig();
  renderTraffic();
  renderSiteMap();
  renderPending();
  renderDetail();
}

function renderMeta() {
  const config = state.config || {};
  const upstream = config.upstream || {};
  const proxyHost = config.proxyHost || '127.0.0.1';
  const proxyPort = config.proxyPort || 8080;
  el.proxyAddress.textContent = `${proxyHost}:${proxyPort}`;
  el.trafficCount.textContent = `${state.history.length} ${state.history.length === 1 ? 'flow' : 'flows'}`;
  el.pendingCount.textContent = `${state.pending.length} pending`;
  el.upstreamStatus.textContent = upstream.mode === 'direct' ? 'direct' : `${upstream.mode} ${upstream.host}:${upstream.port}`;
}

function renderConfig() {
  if (!state.config) return;
  const { intercept, upstream } = state.config;
  el.requestInterceptToggle.checked = Boolean(intercept.requests);
  el.responseInterceptToggle.checked = Boolean(intercept.responses);
  if (!el.rulesModal.classList.contains('hidden')) {
    renderRules();
  }
  el.proxyHost.value = state.config.proxyHost;
  el.proxyPort.value = state.config.proxyPort;
  el.upstreamMode.value = upstream.mode || 'direct';
  el.upstreamHost.value = upstream.host || '';
  el.upstreamPort.value = upstream.port || '';
  el.upstreamUsername.value = upstream.username || '';
  el.upstreamPassword.value = upstream.password || '';
  renderScopeRules();
}

function renderTraffic() {
  const rows = filteredHistory();
  el.trafficRows.innerHTML = rows
    .map((flow) => {
      const url = safeUrl(flow.url);
      const path = url ? `${url.pathname}${url.search}` : flow.url;
      const status = flow.error ? 'ERR' : flow.statusCode || (flow.type === 'connect' ? 'TUN' : '-');
      const size = flow.type === 'connect' ? formatBytes((flow.tunnel?.bytesUp || 0) + (flow.tunnel?.bytesDown || 0)) : formatBytes(flow.responseBytes || 0);
      const duration = flow.durationMs === null || flow.durationMs === undefined ? 'open' : `${flow.durationMs}ms`;
      return `
        <tr data-flow-id="${escapeHtml(flow.id)}" class="${flow.id === state.selectedFlowId ? 'selected' : ''}">
          <td><span class="method-pill">${escapeHtml(flow.method)}</span></td>
          <td title="${escapeHtml(flow.host || '')}">${escapeHtml(flow.host || '')}</td>
          <td title="${escapeHtml(path || '')}">${escapeHtml(path || '')}</td>
          <td><span class="status-pill ${flow.error ? 'error' : ''}">${escapeHtml(String(status))}</span></td>
          <td>${escapeHtml(size)}</td>
          <td>${escapeHtml(duration)}</td>
        </tr>
      `;
    })
    .join('');

  el.trafficRows.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => loadFlow(row.dataset.flowId));
  });
}

async function loadSiteMap() {
  state.siteMap = await api('/api/site-map');
  renderSiteMap();
}

function scheduleSiteMapLoad() {
  clearTimeout(siteMapLoadTimer);
  siteMapLoadTimer = setTimeout(() => {
    loadSiteMap().catch(console.error);
  }, 150);
}

async function refreshHistoryAndSiteMap() {
  const [history, siteMap] = await Promise.all([api('/api/history'), api('/api/site-map')]);
  state.history = history;
  state.siteMap = siteMap;
}

function renderSiteMap() {
  const hosts = filteredSiteMapHosts();
  if (!hosts.some((host) => host.host === state.selectedSiteHost)) {
    state.selectedSiteHost = hosts[0]?.host || null;
  }

  el.siteMapInScopeOnly.checked = state.siteMapInScopeOnly;
  el.siteMapCount.textContent = `${hosts.length} ${hosts.length === 1 ? 'host' : 'hosts'}`;
  el.siteHostsList.innerHTML =
    hosts
      .map(
        (host) => `
          <button class="site-host-item ${host.host === state.selectedSiteHost ? 'active' : ''}" type="button" data-site-host="${escapeHtml(host.host)}">
            <span class="site-main-line">
              <span class="site-host-name" title="${escapeHtml(host.host)}">${escapeHtml(host.host)}</span>
              <span class="scope-chip ${host.inScope ? 'in-scope' : 'out-scope'}">${host.inScope ? 'in' : 'out'}</span>
            </span>
            <span class="site-meta-line">
              <span>${escapeHtml(String(host.requestCount))} requests</span>
              <span>${escapeHtml((host.methods || []).join(', ') || '-')}</span>
            </span>
          </button>
        `,
      )
      .join('') || '<div class="empty-state">No hosts captured</div>';

  el.siteHostsList.querySelectorAll('[data-site-host]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedSiteHost = button.dataset.siteHost;
      renderSiteMap();
    });
  });

  const selectedHost = hosts.find((host) => host.host === state.selectedSiteHost);
  renderSitePaths(selectedHost);
}

function renderSitePaths(host) {
  if (!host) {
    el.sitePathsTitle.textContent = 'Select a host';
    el.sitePathsSubtitle.textContent = 'No host selected';
    el.sitePathsList.innerHTML = '<div class="empty-state">Select a host</div>';
    return;
  }

  const paths = filteredSitePaths(host);
  el.sitePathsTitle.textContent = host.host;
  el.sitePathsSubtitle.textContent = `${paths.length} ${paths.length === 1 ? 'path' : 'paths'} · ${host.requestCount} requests`;
  el.sitePathsList.innerHTML =
    paths
      .map((path) => {
        const latestFlowId = path.flowIds?.[0] || '';
        return `
          <button class="site-path-item" type="button" data-flow-id="${escapeHtml(latestFlowId)}">
            <span class="site-main-line">
              <span class="site-path-name" title="${escapeHtml(path.path)}">${escapeHtml(path.path)}</span>
              <span class="scope-chip ${path.inScope ? 'in-scope' : 'out-scope'}">${path.inScope ? 'in scope' : 'out'}</span>
            </span>
            <span class="site-meta-line">
              <span>${escapeHtml((path.methods || []).join(', ') || '-')}</span>
              <span>${escapeHtml((path.statuses || []).join(', ') || '-')}</span>
              <span>${escapeHtml(String(path.count))} hits</span>
            </span>
            ${path.query ? `<span class="site-query" title="${escapeHtml(path.query)}">${escapeHtml(path.query)}</span>` : ''}
          </button>
        `;
      })
      .join('') || '<div class="empty-state">No paths match this filter</div>';

  el.sitePathsList.querySelectorAll('[data-flow-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!button.dataset.flowId) return;
      await loadFlow(button.dataset.flowId);
      setView('traffic');
    });
  });
}

function filteredSiteMapHosts() {
  const query = state.siteMapSearch;
  const inScopeOnly = state.siteMapInScopeOnly;
  return (state.siteMap.hosts || []).filter((host) => {
    if (inScopeOnly && !host.inScope) return false;
    if (!query) return true;
    if (host.host.toLowerCase().includes(query)) return true;
    return (host.paths || []).some((path) => sitePathSearchText(host, path).includes(query));
  });
}

function filteredSitePaths(host) {
  const query = state.siteMapSearch;
  const inScopeOnly = state.siteMapInScopeOnly;
  return (host.paths || []).filter((path) => {
    if (inScopeOnly && !path.inScope) return false;
    if (!query || host.host.toLowerCase().includes(query)) return true;
    return sitePathSearchText(host, path).includes(query);
  });
}

function sitePathSearchText(host, path) {
  return `${host.host} ${path.path} ${path.query || ''} ${path.lastUrl || ''} ${(path.methods || []).join(' ')}`.toLowerCase();
}

function filteredHistory() {
  return state.history.filter((flow) => {
    if (state.trafficFilter === 'http' && flow.type !== 'http') return false;
    if (state.trafficFilter === 'connect' && flow.type !== 'connect') return false;
    if (state.trafficFilter === 'error' && !flow.error) return false;
    if (!state.trafficSearch) return true;
    const haystack = `${flow.method} ${flow.host} ${flow.url} ${flow.statusCode || ''}`.toLowerCase();
    return haystack.includes(state.trafficSearch);
  });
}

async function loadFlow(id) {
  state.selectedFlowId = id;
  state.selectedFlow = await api(`/api/history/${encodeURIComponent(id)}`);
  renderTraffic();
  renderDetail();
}

function renderDetail() {
  if (!state.selectedFlow) {
    el.emptyDetail.classList.remove('hidden');
    el.flowDetail.classList.add('hidden');
    return;
  }

  const flow = state.selectedFlow;
  el.emptyDetail.classList.add('hidden');
  el.flowDetail.classList.remove('hidden');
  el.detailMethod.textContent = flow.request.method;
  el.detailUrl.textContent = flow.request.url;
  el.detailStatus.textContent = flow.error ? 'ERR' : flow.response ? `${flow.response.statusCode} ${flow.response.statusMessage || ''}` : flow.type;
  el.detailStatus.classList.toggle('error', Boolean(flow.error));
  renderRequestPretty(flow);
  renderBody(el.requestBody, flow.request, {
    kind: 'request',
    method: flow.request.method,
  });
  el.requestRawText.value = buildRawRequest(flow);
  renderResponsePretty(flow);
  renderBody(el.responseBody, flow.response, {
    kind: 'response',
    statusCode: flow.response?.statusCode,
  });
  el.responseRawText.value = buildRawResponse(flow);
  el.metaBody.textContent = JSON.stringify(
    {
      id: flow.id,
      type: flow.type,
      startedAt: new Date(flow.startedAt).toISOString(),
      completedAt: flow.completedAt ? new Date(flow.completedAt).toISOString() : null,
      durationMs: flow.durationMs,
      tunnel: flow.tunnel || null,
      error: flow.error,
      notes: flow.notes || [],
    },
    null,
    2,
  );
  renderTabs();
  renderMessageTabs();
}

function renderRequestPretty(flow) {
  const request = flow.request;
  const parsed = safeUrl(request.url);
  const path = parsed ? `${parsed.pathname}${parsed.search}` : request.url;
  const queryCount = parsed ? [...parsed.searchParams.keys()].length : 0;
  const bodySize = base64ByteLength(request.bodyBase64 || '');

  el.requestSummary.innerHTML = summaryCards([
    ['Method', request.method],
    ['Host', parsed?.host || headerValue(request.headers, 'host') || '-'],
    ['Path', path || '-'],
    ['Query', `${queryCount} ${queryCount === 1 ? 'param' : 'params'}`],
    ['Body', formatBytes(bodySize)],
  ]);
  el.requestQuery.innerHTML = renderQueryTable(parsed);
  el.requestPrettyHeaders.innerHTML = renderHeaderTable(request.headers);
}

function renderResponsePretty(flow) {
  if (!flow.response) {
    el.responseSummary.innerHTML = summaryCards([
      ['Status', flow.type === 'connect' ? 'Tunnel' : 'Pending'],
      ['Body', '-'],
    ]);
    el.responsePrettyHeaders.innerHTML = '<div class="message-empty">No response headers yet.</div>';
    return;
  }

  const response = flow.response;
  const bodySize = base64ByteLength(response.bodyBase64 || '');
  el.responseSummary.innerHTML = summaryCards([
    ['Status', `${response.statusCode} ${response.statusMessage || ''}`.trim()],
    ['Content-Type', headerValue(response.headers, 'content-type') || '-'],
    ['Body', formatBytes(bodySize)],
    ['Duration', flow.durationMs === null || flow.durationMs === undefined ? 'open' : `${flow.durationMs}ms`],
  ]);
  el.responsePrettyHeaders.innerHTML = renderHeaderTable(response.headers);
}

function renderMessageTabs() {
  document.querySelectorAll('.message-tab').forEach((button) => {
    const active = state.messageTabs[button.dataset.message] === button.dataset.messageTab;
    button.classList.toggle('active', active);
  });
  document.querySelectorAll('[data-message-page]').forEach((page) => {
    const [message, tab] = page.dataset.messagePage.split(':');
    page.classList.toggle('active', state.messageTabs[message] === tab);
  });
}

function summaryCards(items) {
  return items
    .map(
      ([label, value]) => `
        <div class="summary-card">
          <span>${escapeHtml(label)}</span>
          <strong title="${escapeHtml(value || '-')}">${escapeHtml(value || '-')}</strong>
        </div>
      `,
    )
    .join('');
}

function renderQueryTable(url) {
  if (!url || [...url.searchParams.keys()].length === 0) {
    return '<div class="message-empty">No query parameters.</div>';
  }

  return `
    <table class="kv-table">
      <tbody>
        ${[...url.searchParams.entries()]
          .map(
            ([name, value]) => `
              <tr>
                <th>${escapeHtml(name)}</th>
                <td>${escapeHtml(value)}</td>
              </tr>
            `,
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function renderHeaderTable(headers = {}) {
  const entries = Object.entries(headers);
  if (entries.length === 0) {
    return '<div class="message-empty">No headers.</div>';
  }

  return `
    <table class="kv-table">
      <tbody>
        ${entries
          .map(
            ([name, value]) => `
              <tr>
                <th>${escapeHtml(name)}</th>
                <td>${escapeHtml(value)}</td>
              </tr>
            `,
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function buildRawRequest(flow) {
  if (!flow?.request) {
    return '';
  }

  const request = flow.request;
  const version = request.httpVersion || '1.1';
  const requestLine = `${request.method} ${requestTarget(request.url)} HTTP/${version}`;
  return buildRawMessage(requestLine, request.headers, rawBodyText(request));
}

function buildRawResponse(flow) {
  if (!flow?.response) {
    return 'No response captured yet.';
  }

  const response = flow.response;
  const statusLine = `HTTP/1.1 ${response.statusCode || ''} ${response.statusMessage || ''}`.trim();
  return buildRawMessage(statusLine, response.headers, rawBodyText(response));
}

function buildRawMessage(startLine, headers, body) {
  const headerText = Object.entries(headers || {})
    .map(([name, value]) => `${name}: ${value}`)
    .join('\r\n');
  return `${startLine}\r\n${headerText}\r\n\r\n${body || ''}`;
}

function requestTarget(url) {
  const parsed = safeUrl(url);
  if (!parsed) {
    return url || '/';
  }
  return `${parsed.pathname || '/'}${parsed.search || ''}`;
}

function rawBodyText(message) {
  const byteLength = base64ByteLength(message.bodyBase64 || '');
  if (byteLength === 0) {
    return '';
  }

  const contentType = headerValue(message.headers, 'content-type') || 'application/octet-stream';
  if (isTextContent(contentType)) {
    return message.bodyText || '';
  }

  return `[binary body base64; content-type=${contentType}; size=${formatBytes(byteLength)}]\r\n${message.bodyBase64 || ''}`;
}

async function copyTargetText(button) {
  const target = document.getElementById(button.dataset.copyTarget);
  const text = target?.value || target?.textContent || '';
  if (!text) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    fallbackCopyText(text);
  }

  const previous = button.textContent;
  button.textContent = 'Copied';
  setTimeout(() => {
    button.textContent = previous;
  }, 900);
}

function fallbackCopyText(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function renderBody(container, message, context) {
  container.innerHTML = '';

  if (!message) {
    container.appendChild(bodyNote('No message body', 'This flow has no message for this side yet.'));
    return;
  }

  const byteLength = base64ByteLength(message.bodyBase64 || '');
  if (byteLength === 0) {
    container.appendChild(bodyNote('No body', emptyBodyReason(context)));
    return;
  }

  const contentType = headerValue(message.headers, 'content-type') || 'application/octet-stream';
  const isText = isTextContent(contentType);
  const isImage = contentType.toLowerCase().startsWith('image/');

  if (isImage && message.bodyBase64) {
    const wrapper = document.createElement('div');
    wrapper.className = 'body-media';
    wrapper.innerHTML = `
      <div class="body-media-header">
        <span>${escapeHtml(contentType)}</span>
        <span>${escapeHtml(formatBytes(byteLength))}</span>
      </div>
      <img class="body-image" alt="Response body preview" src="data:${escapeHtml(contentType)};base64,${message.bodyBase64}" />
    `;
    container.appendChild(wrapper);
    return;
  }

  const pre = document.createElement('pre');
  if (isText) {
    pre.textContent = message.bodyText || '';
  } else {
    pre.textContent = `Binary body: ${contentType}, ${formatBytes(byteLength)}\n\n${message.bodyBase64 || ''}`;
  }
  container.appendChild(pre);
}

function bodyNote(title, detail) {
  const note = document.createElement('div');
  note.className = 'body-note';
  note.innerHTML = `<div><strong>${escapeHtml(title)}</strong>${escapeHtml(detail)}</div>`;
  return note;
}

function emptyBodyReason(context) {
  if (context.kind === 'request') {
    return `${context.method || 'This request'} was sent without a request body.`;
  }

  const statusCode = Number(context.statusCode);
  if (statusCode === 304) {
    return '304 Not Modified responses do not include a response body; the client reuses its cached copy.';
  }
  if (statusCode === 204) {
    return '204 No Content responses do not include a response body.';
  }
  if (statusCode >= 100 && statusCode < 200) {
    return `${statusCode} informational responses do not include a response body.`;
  }
  return 'The response body is empty.';
}

function headerValue(headers = {}, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) {
      return String(value);
    }
  }
  return '';
}

function isTextContent(contentType) {
  const normalized = contentType.toLowerCase();
  return (
    normalized.startsWith('text/') ||
    normalized.includes('json') ||
    normalized.includes('xml') ||
    normalized.includes('javascript') ||
    normalized.includes('x-www-form-urlencoded')
  );
}

function base64ByteLength(value) {
  if (!value) return 0;
  const clean = value.replace(/\s/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

function renderTabs() {
  document.querySelectorAll('.tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === state.activeTab);
  });
  document.querySelectorAll('.tab-page').forEach((page) => page.classList.remove('active'));
  document.querySelector(`#${state.activeTab}Tab`).classList.add('active');
}

function renderPending() {
  el.queueBadge.textContent = String(state.pending.length);
  if (!state.pending.some((item) => item.id === state.selectedPendingId)) {
    state.selectedPendingId = state.pending[0]?.id || null;
  }

  el.pendingList.innerHTML =
    state.pending
      .map((item) => {
        const title = item.stage === 'request' ? item.editable.url : `${item.summary.statusCode || '-'} ${item.summary.url}`;
        const direction = item.stage === 'request' ? '← IN' : '→ OUT';
        return `
          <button class="pending-item pending-${escapeHtml(item.stage)} ${item.id === state.selectedPendingId ? 'active' : ''}" type="button" data-pending-id="${escapeHtml(item.id)}">
            <span class="stage-pill stage-${escapeHtml(item.stage)}">${escapeHtml(direction)} · ${escapeHtml(item.stage)}</span>
            <span class="pending-item-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
            <span class="pending-item-meta">
              <span>${escapeHtml(item.summary.method)}</span>
              <span>${escapeHtml(timeAgo(item.createdAt))}</span>
            </span>
          </button>
        `;
      })
      .join('') || '<div class="empty-state">Queue is empty</div>';

  el.pendingList.querySelectorAll('.pending-item').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedPendingId = button.dataset.pendingId;
      renderPending();
    });
  });

  renderPendingEditor();
}

function renderPendingEditor() {
  const item = selectedPending();
  if (!item) {
    el.emptyPending.classList.remove('hidden');
    el.pendingEditor.classList.add('hidden');
    return;
  }

  el.emptyPending.classList.add('hidden');
  el.pendingEditor.classList.remove('hidden');
  el.pendingStage.className = `stage-pill stage-${item.stage}`;
  el.pendingStage.textContent = item.stage === 'request' ? '← REQUEST' : '→ RESPONSE';
  el.pendingTitle.textContent = item.stage === 'request' ? item.editable.url : item.summary.url;
  el.requestFields.classList.toggle('hidden', item.stage !== 'request');
  el.responseFields.classList.toggle('hidden', item.stage !== 'response');

  if (item.stage === 'request') {
    el.editMethod.value = item.editable.method || '';
    el.editUrl.value = item.editable.url || '';
  } else {
    el.editStatusCode.value = item.editable.statusCode || '';
    el.editStatusMessage.value = item.editable.statusMessage || '';
  }

  el.editHeaders.value = headersToText(item.editable.headers);
  el.editBody.value = item.editable.bodyText || '';
}

function renderRules() {
  const stage = state.rulesModalStage;
  const allRules = state.config?.intercept?.rules || [];
  const rules = allRules.filter((rule) => rule.stage === stage || rule.stage === 'both');
  const stageLabel = stage === 'request' ? 'Request' : 'Response';
  el.rulesStagePill.className = `stage-pill stage-${stage}`;
  el.rulesStagePill.textContent = stage === 'request' ? '← REQUEST' : '→ RESPONSE';
  el.rulesModalTitle.textContent = `${stageLabel} Intercept Rules`;
  el.rulesModalSubtitle.textContent = `No active ${stage} rules means all ${stage}s are intercepted while ${stageLabel} is enabled.`;
  el.rulesCount.textContent = `${rules.length} ${rules.length === 1 ? 'rule' : 'rules'}`;
  el.rulesList.innerHTML =
    rules
      .map(
        (rule) => `
          <div class="rule-row" data-rule-id="${escapeHtml(rule.id)}">
            <div class="rule-row-top">
              <label class="rule-enabled">
                <input type="checkbox" data-rule-field="enabled" ${rule.enabled === false ? '' : 'checked'} />
                <span>Enabled</span>
              </label>
              <button class="button ghost compact-button" type="button" data-delete-rule="${escapeHtml(rule.id)}">Delete</button>
            </div>
            <div class="rule-grid">
              <label>
                Field
                <select data-rule-field="field">
                  ${ruleOption('url', 'URL', rule.field)}
                  ${ruleOption('host', 'Host', rule.field)}
                  ${ruleOption('method', 'Method', rule.field)}
                  ${ruleOption('status', 'Status', rule.field)}
                  ${ruleOption('header', 'Header', rule.field)}
                  ${ruleOption('body', 'Body', rule.field)}
                </select>
              </label>
              <label>
                Operator
                <select data-rule-field="operator">
                  ${ruleOption('contains', 'Contains', rule.operator)}
                  ${ruleOption('equals', 'Equals', rule.operator)}
                  ${ruleOption('startsWith', 'Starts with', rule.operator)}
                  ${ruleOption('endsWith', 'Ends with', rule.operator)}
                  ${ruleOption('regex', 'Regex', rule.operator)}
                  ${ruleOption('exists', 'Exists', rule.operator)}
                </select>
              </label>
              <label class="rule-header-name">
                Header
                <input data-rule-field="headerName" type="text" value="${escapeHtml(rule.headerName || '')}" placeholder="content-type" />
              </label>
              <label class="rule-value">
                Value
                <input data-rule-field="value" type="text" value="${escapeHtml(rule.value || '')}" placeholder="${escapeHtml(ruleValuePlaceholder(rule.field))}" />
              </label>
            </div>
          </div>
        `,
      )
      .join('') || `<div class="message-empty">No ${stage} intercept rules configured.</div>`;
  el.rulesList.querySelectorAll('.rule-row').forEach(updateRuleRowVisibility);
}

function ruleOption(value, label, current) {
  return `<option value="${escapeHtml(value)}" ${value === current ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}

function updateRuleRowVisibility(row) {
  if (!row) {
    return;
  }

  const field = row.querySelector('[data-rule-field="field"]').value;
  const headerInput = row.querySelector('[data-rule-field="headerName"]');
  const headerLabel = row.querySelector('.rule-header-name');
  const valueInput = row.querySelector('[data-rule-field="value"]');
  const isHeaderRule = field === 'header';

  headerLabel.classList.toggle('hidden', !isHeaderRule);
  headerInput.disabled = !isHeaderRule;
  if (!isHeaderRule) {
    headerInput.value = '';
  }
  valueInput.placeholder = ruleValuePlaceholder(field);
}

function ruleValuePlaceholder(field) {
  if (field === 'url') return '/api, /login, productId=';
  if (field === 'host') return 'example.com';
  if (field === 'method') return 'GET, POST, PUT';
  if (field === 'status') return '200, 404, 5';
  if (field === 'header') return 'application/json, Bearer, session=';
  if (field === 'body') return 'token, username, error';
  return 'Value to match';
}

function addInterceptRule() {
  const rules = [...(state.config?.intercept?.rules || [])];
  rules.push({
    id: `rule-${Date.now()}`,
    enabled: true,
    stage: state.rulesModalStage,
    field: 'url',
    operator: 'contains',
    headerName: '',
    value: '',
  });
  patchConfig({ intercept: { rules } });
}

function deleteInterceptRule(id) {
  const rules = (state.config?.intercept?.rules || []).filter((rule) => rule.id !== id);
  patchConfig({ intercept: { rules } });
}

function saveInterceptRules() {
  const stage = state.rulesModalStage;
  const editedRules = [...el.rulesList.querySelectorAll('.rule-row')].map((row) => ({
    id: row.dataset.ruleId,
    enabled: row.querySelector('[data-rule-field="enabled"]').checked,
    stage,
    field: row.querySelector('[data-rule-field="field"]').value,
    operator: row.querySelector('[data-rule-field="operator"]').value,
    headerName: row.querySelector('[data-rule-field="headerName"]').value.trim(),
    value: row.querySelector('[data-rule-field="value"]').value,
  }));
  const preservedRules = (state.config?.intercept?.rules || []).filter((rule) => rule.stage !== stage && rule.stage !== 'both');

  patchConfig({ intercept: { rules: [...preservedRules, ...editedRules] } }).then(closeRulesModal);
}

function openRulesModal(stage) {
  state.rulesModalStage = stage;
  renderRules();
  el.rulesModal.classList.remove('hidden');
}

function closeRulesModal() {
  el.rulesModal.classList.add('hidden');
}

async function saveProxyConfig() {
  const port = Number(el.proxyPort.value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    el.proxySaveStatus.textContent = 'Port must be between 1 and 65535.';
    return;
  }

  el.proxySaveStatus.textContent = 'Rebinding proxy listener...';
  try {
    await patchConfig({ proxyPort: port });
    el.proxySaveStatus.textContent = `Listening on ${state.config.proxyHost}:${state.config.proxyPort}.`;
  } catch (error) {
    el.proxySaveStatus.textContent = `Could not bind port: ${formatError(error)}`;
    renderConfig();
  }
}

function renderScopeRules() {
  const scope = state.config?.scope || { enabled: false, rules: [] };
  const rules = scope.rules || [];
  const includeRules = rules.filter((rule) => rule.action !== 'exclude');
  const excludeRules = rules.filter((rule) => rule.action === 'exclude');
  el.scopeEnabledToggle.checked = Boolean(scope.enabled);
  el.scopeStatus.textContent = scope.enabled
    ? `${rules.filter((rule) => rule.enabled !== false).length} active of ${rules.length} rules`
    : 'Scope disabled';
  el.includeScopeCount.textContent = `${includeRules.length} ${includeRules.length === 1 ? 'rule' : 'rules'}`;
  el.excludeScopeCount.textContent = `${excludeRules.length} ${excludeRules.length === 1 ? 'rule' : 'rules'}`;
  renderScopeRuleList(el.includeScopeRulesList, includeRules, 'include');
  renderScopeRuleList(el.excludeScopeRulesList, excludeRules, 'exclude');
}

function renderScopeRuleList(container, rules, action) {
  const label = action === 'include' ? 'include' : 'exclude';
  container.innerHTML =
    rules
      .map(
        (rule) => `
          <div class="rule-row scope-rule-row scope-rule-${escapeHtml(action)}" data-scope-rule-id="${escapeHtml(rule.id)}">
            <div class="rule-row-top">
              <label class="rule-enabled">
                <input type="checkbox" data-scope-field="enabled" ${rule.enabled === false ? '' : 'checked'} />
                <span>Enabled</span>
              </label>
              <button class="button ghost compact-button" type="button" data-delete-scope-rule="${escapeHtml(rule.id)}">Delete</button>
            </div>
            <div class="rule-grid">
              <label>
                Field
                <select data-scope-field="field">
                  ${ruleOption('url', 'URL', rule.field)}
                  ${ruleOption('host', 'Host', rule.field)}
                  ${ruleOption('path', 'Path', rule.field)}
                  ${ruleOption('method', 'Method', rule.field)}
                </select>
              </label>
              <label>
                Operator
                <select data-scope-field="operator">
                  ${ruleOption('contains', 'Contains', rule.operator)}
                  ${ruleOption('equals', 'Equals', rule.operator)}
                  ${ruleOption('startsWith', 'Starts with', rule.operator)}
                  ${ruleOption('endsWith', 'Ends with', rule.operator)}
                  ${ruleOption('regex', 'Regex', rule.operator)}
                  ${ruleOption('exists', 'Exists', rule.operator)}
                </select>
              </label>
              <label class="rule-value">
                Value
                <input data-scope-field="value" type="text" value="${escapeHtml(rule.value || '')}" placeholder="${escapeHtml(scopeValuePlaceholder(rule.field))}" />
              </label>
            </div>
          </div>
        `,
      )
      .join('') || `<div class="message-empty">No ${label} rules configured.</div>`;
  container.querySelectorAll('.rule-row').forEach(updateScopeRuleRow);
}

function updateScopeRuleRow(row) {
  if (!row) {
    return;
  }

  const field = row.querySelector('[data-scope-field="field"]').value;
  const valueInput = row.querySelector('[data-scope-field="value"]');
  valueInput.placeholder = scopeValuePlaceholder(field);
}

function scopeValuePlaceholder(field) {
  if (field === 'url') return 'https://target.test/api, /admin';
  if (field === 'host') return 'juice-shop.proxmox.hvn';
  if (field === 'path') return '/rest, /login, /assets';
  if (field === 'method') return 'GET, POST, PUT';
  return 'Value to match';
}

function addScopeRule(action) {
  const scope = state.config.scope || { enabled: false, rules: [] };
  state.config.scope = {
    ...scope,
    rules: [
      ...(scope.rules || []),
      {
        id: `scope-${Date.now()}`,
        enabled: true,
        action,
        field: 'host',
        operator: 'contains',
        value: '',
      },
    ],
  };
  renderScopeRules();
}

function deleteScopeRule(id) {
  const scope = state.config.scope || { enabled: false, rules: [] };
  state.config.scope = {
    ...scope,
    rules: (scope.rules || []).filter((rule) => rule.id !== id),
  };
  renderScopeRules();
}

async function saveScopeConfig() {
  const rules = [
    ...readScopeRuleRows(el.includeScopeRulesList, 'include'),
    ...readScopeRuleRows(el.excludeScopeRulesList, 'exclude'),
  ];

  el.scopeStatus.textContent = 'Applying scope...';
  try {
    await patchConfig({
      scope: {
        enabled: el.scopeEnabledToggle.checked,
        rules,
      },
    });
  } catch (error) {
    el.scopeStatus.textContent = `Scope update failed: ${formatError(error)}`;
    renderConfig();
  }
}

function readScopeRuleRows(container, action) {
  return [...container.querySelectorAll('.rule-row')].map((row) => ({
    id: row.dataset.scopeRuleId,
    enabled: row.querySelector('[data-scope-field="enabled"]').checked,
    action,
    field: row.querySelector('[data-scope-field="field"]').value,
    operator: row.querySelector('[data-scope-field="operator"]').value,
    value: row.querySelector('[data-scope-field="value"]').value,
  }));
}

function selectedPending() {
  return state.pending.find((item) => item.id === state.selectedPendingId) || null;
}

async function sendPendingAction(action) {
  const item = selectedPending();
  if (!item) return;

  const payload = { action };
  if (action === 'modify') {
    payload.headers = textToHeaders(el.editHeaders.value);
    payload.bodyText = el.editBody.value;
    if (item.stage === 'request') {
      payload.method = el.editMethod.value.trim() || item.editable.method;
      payload.url = el.editUrl.value.trim() || item.editable.url;
    } else {
      payload.statusCode = Number(el.editStatusCode.value || item.editable.statusCode || 200);
      payload.statusMessage = el.editStatusMessage.value;
    }
  }

  await api(`/api/pending/${encodeURIComponent(item.id)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function patchConfig(partial) {
  state.config = await api('/api/config', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(partial),
  });
  await refreshHistoryAndSiteMap();
  renderAll();
}

function setView(view) {
  const viewTitles = {
    traffic: 'Traffic',
    siteMap: 'Site Map',
    scope: 'Scope',
    intercept: 'Intercept',
    settings: 'Settings',
  };
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  document.querySelectorAll('.view').forEach((panel) => panel.classList.remove('active'));
  document.querySelector(`#${view}View`).classList.add('active');
  el.viewTitle.textContent = viewTitles[view] || view;
}

async function api(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json();
}

function headersToText(headers = {}) {
  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join('\n');
}

function textToHeaders(text) {
  const headers = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const index = line.indexOf(':');
    if (index === -1) continue;
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return headers;
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function formatBytes(value) {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(time) {
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatError(error) {
  try {
    const parsed = JSON.parse(error.message);
    return parsed.error || error.message;
  } catch {
    return error.message;
  }
}

init().catch((error) => {
  document.body.innerHTML = `<pre class="code-block">${escapeHtml(error.stack || error.message)}</pre>`;
});
