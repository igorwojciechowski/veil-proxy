if (new URLSearchParams(window.location.search).get('desktop') === '1') {
  document.documentElement.classList.add('desktop-shell');
}

const state = {
  config: null,
  history: [],
  pending: [],
  selectedFlowId: null,
  selectedFlow: null,
  selectedPendingId: null,
  pendingEditorMode: 'raw',
  trafficSearch: '',
  trafficFilters: {
    method: [],
    status: [],
    host: [],
  },
  trafficInScopeOnly: false,
  openTrafficFilter: '',
  trafficSort: {
    key: 'id',
    direction: 'desc',
  },
  trafficLayout: {
    orientation: 'horizontal',
    showList: true,
    showDetail: true,
    splitSize: 58,
  },
  activeTab: 'request',
  messageTabs: {
    request: 'pretty',
    response: 'pretty',
  },
  siteMap: { hosts: [] },
  selectedSiteHost: null,
  siteMapSearch: '',
  siteMapInScopeOnly: false,
  echoTabs: [],
  echoGroups: [],
  selectedEchoGroupId: null,
  selectedEchoTabId: null,
  openEchoColorPicker: null,
  echoSplit: 50,
  echoContextFlowId: null,
  contextFlowId: null,
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
  trafficSplit: document.querySelector('#trafficSplit'),
  trafficPaneResizer: document.querySelector('#trafficPaneResizer'),
  trafficRows: document.querySelector('#trafficRows'),
  trafficSearch: document.querySelector('#trafficSearch'),
  trafficMethodFilter: document.querySelector('#trafficMethodFilter'),
  trafficStatusFilter: document.querySelector('#trafficStatusFilter'),
  trafficHostFilter: document.querySelector('#trafficHostFilter'),
  trafficScopeFilter: document.querySelector('#trafficScopeFilter'),
  resetTrafficFiltersBtn: document.querySelector('#resetTrafficFiltersBtn'),
  trafficFilterCount: document.querySelector('#trafficFilterCount'),
  trafficHorizontalLayoutBtn: document.querySelector('#trafficHorizontalLayoutBtn'),
  trafficVerticalLayoutBtn: document.querySelector('#trafficVerticalLayoutBtn'),
  showTrafficListToggle: document.querySelector('#showTrafficListToggle'),
  showTrafficDetailToggle: document.querySelector('#showTrafficDetailToggle'),
  siteMapCount: document.querySelector('#siteMapCount'),
  siteMapSearch: document.querySelector('#siteMapSearch'),
  siteMapInScopeOnly: document.querySelector('#siteMapInScopeOnly'),
  siteHostsList: document.querySelector('#siteHostsList'),
  sitePathsTitle: document.querySelector('#sitePathsTitle'),
  sitePathsSubtitle: document.querySelector('#sitePathsSubtitle'),
  sitePathsList: document.querySelector('#sitePathsList'),
  refreshSiteMapBtn: document.querySelector('#refreshSiteMapBtn'),
  echoTabs: document.querySelector('#echoTabs'),
  echoGroupList: document.querySelector('#echoGroupList'),
  newEchoTabBtn: document.querySelector('#newEchoTabBtn'),
  newEchoGroupBtn: document.querySelector('#newEchoGroupBtn'),
  emptyEcho: document.querySelector('#emptyEcho'),
  echoWorkspace: document.querySelector('#echoWorkspace'),
  echoPaneResizer: document.querySelector('#echoPaneResizer'),
  echoRequestSubtitle: document.querySelector('#echoRequestSubtitle'),
  echoTabName: document.querySelector('#echoTabName'),
  echoRawRequest: document.querySelector('#echoRawRequest'),
  echoRawRequestHighlight: document.querySelector('#echoRawRequestHighlight'),
  sendEchoBtn: document.querySelector('#sendEchoBtn'),
  echoResponseStatus: document.querySelector('#echoResponseStatus'),
  echoResponseMeta: document.querySelector('#echoResponseMeta'),
  echoRawResponse: document.querySelector('#echoRawResponse'),
  contextMenu: document.querySelector('#contextMenu'),
  sendToEchoContextBtn: document.querySelector('#sendToEchoContextBtn'),
  addToScopeContextBtn: document.querySelector('#addToScopeContextBtn'),
  removeFromScopeContextBtn: document.querySelector('#removeFromScopeContextBtn'),
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
  pendingRawBtn: document.querySelector('#pendingRawBtn'),
  pendingPrettyBtn: document.querySelector('#pendingPrettyBtn'),
  pendingRawView: document.querySelector('#pendingRawView'),
  pendingPrettyView: document.querySelector('#pendingPrettyView'),
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
  upstreamRulesList: document.querySelector('#upstreamRulesList'),
  addUpstreamRuleBtn: document.querySelector('#addUpstreamRuleBtn'),
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
  [el.trafficMethodFilter, el.trafficStatusFilter, el.trafficHostFilter, el.trafficScopeFilter].forEach((container) => {
    container.addEventListener('change', handleTrafficCheckboxFilterChange);
  });
  document.addEventListener('click', closeTrafficFiltersOnOutside);
  document.addEventListener('click', closeEchoGroupListOnOutside);
  document.addEventListener('click', closeEchoColorPickersOnOutside);
  document.querySelectorAll('[data-sort-key]').forEach((button) => {
    button.addEventListener('click', () => setTrafficSort(button.dataset.sortKey));
  });
  el.resetTrafficFiltersBtn.addEventListener('click', resetTrafficFilters);
  el.trafficHorizontalLayoutBtn.addEventListener('click', () => setTrafficLayout({ orientation: 'horizontal' }));
  el.trafficVerticalLayoutBtn.addEventListener('click', () => setTrafficLayout({ orientation: 'vertical' }));
  el.showTrafficListToggle.addEventListener('change', () => setTrafficLayout({ showList: el.showTrafficListToggle.checked }));
  el.showTrafficDetailToggle.addEventListener('change', () => setTrafficLayout({ showDetail: el.showTrafficDetailToggle.checked }));
  el.trafficPaneResizer.addEventListener('mousedown', startTrafficPaneResize);

  el.siteMapSearch.addEventListener('input', () => {
    state.siteMapSearch = el.siteMapSearch.value.trim().toLowerCase();
    renderSiteMap();
  });

  el.siteMapInScopeOnly.addEventListener('change', () => {
    state.siteMapInScopeOnly = el.siteMapInScopeOnly.checked;
    renderSiteMap();
  });

  el.refreshSiteMapBtn.addEventListener('click', () => loadSiteMap());
  el.newEchoTabBtn.addEventListener('click', () => createBlankEchoTab());
  el.newEchoGroupBtn.addEventListener('click', createEchoGroup);
  el.sendEchoBtn.addEventListener('click', sendSelectedEchoRequest);
  el.echoTabName.addEventListener('input', syncSelectedEchoMeta);
  el.echoRawRequest.addEventListener('input', syncSelectedEchoRequest);
  el.echoRawRequest.addEventListener('scroll', syncEchoRawEditorScroll);
  el.echoPaneResizer.addEventListener('mousedown', startEchoPaneResize);
  document.addEventListener('contextmenu', openEchoContextMenu);
  document.addEventListener('click', closeContextMenu);
  window.addEventListener('blur', closeContextMenu);
  el.sendToEchoContextBtn.addEventListener('click', () => {
    const flowId = state.contextFlowId;
    closeContextMenu();
    if (flowId) {
      sendFlowToEcho(flowId);
    }
  });
  el.addToScopeContextBtn.addEventListener('click', () => applyScopeFromContext('include'));
  el.removeFromScopeContextBtn.addEventListener('click', () => applyScopeFromContext('exclude'));

  el.requestInterceptToggle.addEventListener('change', () => {
    patchConfig({ intercept: { requests: el.requestInterceptToggle.checked } });
  });

  el.responseInterceptToggle.addEventListener('change', () => {
    patchConfig({ intercept: { responses: el.responseInterceptToggle.checked } });
  });

  el.saveConfigBtn.addEventListener('click', () => {
    patchConfig({
      upstream: { mode: 'direct', host: '', port: 0, username: '', password: '' },
      upstreams: readUpstreamRows(),
      upstreamRules: [],
    });
  });
  el.addUpstreamRuleBtn.addEventListener('click', addUpstreamRuleRow);
  el.upstreamRulesList.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-delete-upstream-rule]');
    if (deleteButton) {
      deleteUpstreamRuleRow(deleteButton.dataset.deleteUpstreamRule);
    }
  });
  el.upstreamRulesList.addEventListener('change', (event) => {
    const enabled = event.target.closest('[data-upstream-rule-field="enabled"]');
    if (enabled) {
      const label = enabled.closest('.upstream-enabled-toggle')?.querySelector('[data-enabled-label]');
      if (label) label.textContent = enabled.checked ? 'On' : 'Off';
    }
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
  el.pendingRawBtn.addEventListener('click', () => setPendingEditorMode('raw'));
  el.pendingPrettyBtn.addEventListener('click', () => setPendingEditorMode('pretty'));
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
  renderEcho();
  renderPending();
  renderDetail();
}

function renderMeta() {
  const config = state.config || {};
  const upstreams = configuredUpstreamRows();
  const proxyHost = config.proxyHost || '127.0.0.1';
  const proxyPort = config.proxyPort || 8080;
  el.proxyAddress.textContent = `${proxyHost}:${proxyPort}`;
  const trafficCount = trafficHistory().length;
  el.trafficCount.textContent = `${trafficCount} ${trafficCount === 1 ? 'req' : 'reqs'}`;
  el.pendingCount.textContent = `${state.pending.length} pending`;
  el.upstreamStatus.textContent = upstreams.length === 0 ? 'direct' : `${upstreams.length} upstream${upstreams.length === 1 ? '' : 's'}`;
}

function renderConfig() {
  if (!state.config) return;
  const { intercept } = state.config;
  el.requestInterceptToggle.checked = Boolean(intercept.requests);
  el.responseInterceptToggle.checked = Boolean(intercept.responses);
  if (!el.rulesModal.classList.contains('hidden')) {
    renderRules();
  }
  el.proxyHost.value = state.config.proxyHost;
  el.proxyPort.value = state.config.proxyPort;
  renderUpstreamRules();
  renderScopeRules();
}

function renderUpstreamRules() {
  const groups = configuredUpstreamRows();
  el.upstreamRulesList.innerHTML =
    groups
      .map(
        (group, index) => `
          <div class="upstream-rule-row" data-upstream-rule-id="${escapeHtml(group.id || `upstream-${index}`)}">
            <label class="upstream-enabled-toggle">
              <input type="checkbox" data-upstream-rule-field="enabled" ${group.enabled !== false ? 'checked' : ''} />
              <span class="mini-switch"></span>
              <span data-enabled-label>${group.enabled !== false ? 'On' : 'Off'}</span>
            </label>
            <label class="wide">
              <span class="label-with-info">
                Rules
                <span class="info-tooltip" tabindex="0" aria-label="Rules help">i
                  <span class="tooltip-popover">
                    Leave empty to route all traffic through this upstream.<br />
                    domain *.example.com<br />
                    host api.example.com:443<br />
                    url https://*.example.com/api/*
                  </span>
                </span>
              </span>
              <textarea data-upstream-rule-field="patterns" spellcheck="false">${escapeHtml(upstreamRulesText(group.rules))}</textarea>
            </label>
            <label>
              Mode
              <select data-upstream-rule-field="mode">
                <option value="direct" ${group.mode === 'direct' ? 'selected' : ''}>Direct</option>
                <option value="http" ${group.mode === 'http' ? 'selected' : ''}>HTTP</option>
                <option value="socks5" ${group.mode === 'socks5' ? 'selected' : ''}>SOCKS5</option>
              </select>
            </label>
            <label>
              Host
              <input data-upstream-rule-field="host" type="text" value="${escapeHtml(group.host || '')}" />
            </label>
            <label>
              Port
              <input data-upstream-rule-field="port" type="number" min="0" max="65535" value="${escapeHtml(group.port || '')}" />
            </label>
            <label>
              User
              <input data-upstream-rule-field="username" type="text" value="${escapeHtml(group.username || '')}" />
            </label>
            <label>
              Pass
              <input data-upstream-rule-field="password" type="password" value="${escapeHtml(group.password || '')}" />
            </label>
            <button class="button ghost compact-button" type="button" data-delete-upstream-rule="${escapeHtml(group.id || `upstream-${index}`)}">Delete</button>
          </div>
        `,
      )
      .join('') || '<div class="message-empty">No upstreams configured. All traffic goes direct.</div>';
}

function addUpstreamRuleRow() {
  const upstreams = readUpstreamRows();
  upstreams.push({
    id: `upstream-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    enabled: true,
    mode: 'socks5',
    host: '127.0.0.1',
    port: 9050,
    username: '',
    password: '',
    rules: [],
  });
  state.config.upstreams = upstreams;
  state.config.upstreamRules = [];
  renderUpstreamRules();
}

function deleteUpstreamRuleRow(id) {
  state.config.upstreams = readUpstreamRows().filter((upstream) => upstream.id !== id);
  state.config.upstreamRules = [];
  renderUpstreamRules();
}

function readUpstreamRows() {
  return [...el.upstreamRulesList.querySelectorAll('[data-upstream-rule-id]')].map((row) => ({
    id: row.dataset.upstreamRuleId,
    enabled: row.querySelector('[data-upstream-rule-field="enabled"]').checked,
    mode: row.querySelector('[data-upstream-rule-field="mode"]').value,
    host: row.querySelector('[data-upstream-rule-field="host"]').value.trim(),
    port: Number(row.querySelector('[data-upstream-rule-field="port"]').value || 0),
    username: row.querySelector('[data-upstream-rule-field="username"]').value,
    password: row.querySelector('[data-upstream-rule-field="password"]').value,
    rules: row
      .querySelector('[data-upstream-rule-field="patterns"]')
      .value.split(/\r?\n/)
      .map(parseUpstreamPatternLine)
      .filter(Boolean),
  }));
}

function configuredUpstreamRows() {
  if (Array.isArray(state.config?.upstreams) && state.config.upstreams.length > 0) {
    return state.config.upstreams;
  }

  const legacyRules = state.config?.upstreamRules || [];
  if (legacyRules.length > 0) {
    return upstreamGroupsFromRules(legacyRules);
  }

  const legacy = state.config?.upstream || {};
  if (legacy.mode && legacy.mode !== 'direct') {
    return [
      {
        id: 'legacy-upstream',
        enabled: true,
        mode: legacy.mode,
        host: legacy.host || '',
        port: legacy.port || 0,
        username: legacy.username || '',
        password: legacy.password || '',
        rules: [],
      },
    ];
  }

  return [];
}

function upstreamGroupsFromRules(rules) {
  const groups = new Map();
  for (const rule of rules) {
    const upstream = rule.upstream || {};
    const key = [upstream.mode, upstream.host, upstream.port, upstream.username, upstream.password, rule.enabled !== false].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        id: rule.id || `upstream-${groups.size + 1}`,
        enabled: rule.enabled !== false,
        mode: upstream.mode || 'direct',
        host: upstream.host || '',
        port: upstream.port || 0,
        username: upstream.username || '',
        password: upstream.password || '',
        rules: [],
      });
    }
    groups.get(key).rules.push({
      matchType: rule.matchType || 'domain',
      pattern: rule.pattern || '',
    });
  }
  return [...groups.values()];
}

function upstreamRulesText(rules = []) {
  return rules.map((rule) => `${rule.matchType || 'domain'} ${rule.pattern || ''}`.trim()).join('\n');
}

function parseUpstreamPatternLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(domain|host|url)\s+(.+)$/i);
  return {
    matchType: match ? match[1].toLowerCase() : 'domain',
    pattern: match ? match[2].trim() : trimmed,
  };
}

function renderTraffic() {
  renderTrafficFilterControls();
  renderTrafficLayout();
  const rows = filteredHistory();
  el.trafficFilterCount.textContent = `${rows.length} shown`;
  el.trafficRows.innerHTML = rows
    .map((flow) => {
      const url = safeUrl(flow.url);
      const path = url ? `${url.pathname}${url.search}` : flow.url;
      const status = flow.error ? 'ERR' : flow.statusCode || (flow.type === 'connect' ? 'TUN' : '-');
      const size = flow.type === 'connect' ? formatBytes((flow.tunnel?.bytesUp || 0) + (flow.tunnel?.bytesDown || 0)) : formatBytes(flow.responseBytes || 0);
      const duration = flow.durationMs === null || flow.durationMs === undefined ? 'open' : `${flow.durationMs}ms`;
      const echoAttr = flow.type === 'http' ? `data-echo-flow-id="${escapeHtml(flow.id)}"` : '';
      const scopeLabel = flow.inScope ? 'in' : 'out';
      return `
        <tr data-flow-id="${escapeHtml(flow.id)}" ${echoAttr} class="${flow.id === state.selectedFlowId ? 'selected' : ''}">
          <td class="flow-id-cell">#${escapeHtml(flow.id)}</td>
          <td><span class="method-pill">${escapeHtml(flow.method)}</span></td>
          <td title="${escapeHtml(flow.host || '')}">${escapeHtml(flow.host || '')}</td>
          <td title="${escapeHtml(path || '')}">${escapeHtml(path || '')}</td>
          <td><span class="status-pill ${flow.error ? 'error' : ''}">${escapeHtml(String(status))}</span></td>
          <td><span class="scope-chip ${flow.inScope ? 'in-scope' : 'out-scope'}">${escapeHtml(scopeLabel)}</span></td>
          <td>${escapeHtml(size)}</td>
          <td>${escapeHtml(duration)}</td>
        </tr>
      `;
    })
    .join('');

  el.trafficRows.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => loadFlow(row.dataset.flowId));
  });
  renderTrafficSortHeaders();
}

function renderTrafficFilterControls() {
  const traffic = trafficHistory();
  const methods = uniqueSorted(traffic.map((flow) => flow.method).filter(Boolean));
  const hosts = uniqueSorted(traffic.map((flow) => flow.host).filter(Boolean));
  state.trafficFilters.method = state.trafficFilters.method.filter((method) => methods.includes(method));
  state.trafficFilters.host = state.trafficFilters.host.filter((host) => hosts.includes(host));
  renderCheckboxFilter(
    el.trafficMethodFilter,
    'method',
    methods.map((method) => [method, method]),
  );
  renderCheckboxFilter(el.trafficStatusFilter, 'status', [
    ['2xx', '2xx'],
    ['3xx', '3xx'],
    ['4xx', '4xx'],
    ['5xx', '5xx'],
    ['error', 'Errors'],
    ['open', 'Open'],
  ]);
  renderCheckboxFilter(
    el.trafficHostFilter,
    'host',
    hosts.map((host) => [host, host]),
  );
  renderScopeFilter();
}

function renderCheckboxFilter(container, key, options) {
  const selected = new Set(state.trafficFilters[key]);
  const count = selected.size;
  const label = count === 0 ? 'Any' : `${count} selected`;
  container.innerHTML =
    `<details class="multi-filter" data-filter-dropdown="${escapeHtml(key)}" ${state.openTrafficFilter === key ? 'open' : ''}>
      <summary>${escapeHtml(label)}</summary>
      <div class="multi-filter-menu">
        ${
          options
            .map(
              ([value, optionLabel]) => `
                <label class="filter-check" title="${escapeHtml(optionLabel)}">
                  <input type="checkbox" data-filter-key="${escapeHtml(key)}" value="${escapeHtml(value)}" ${selected.has(value) ? 'checked' : ''} />
                  <span>${escapeHtml(optionLabel)}</span>
                </label>
              `,
            )
            .join('') || '<span class="filter-empty">-</span>'
        }
      </div>
    </details>`;
}

function renderScopeFilter() {
  el.trafficScopeFilter.innerHTML = `
    <label class="scope-filter-check">
      <span>In scope</span>
      <input id="trafficInScopeOnly" type="checkbox" ${state.trafficInScopeOnly ? 'checked' : ''} />
    </label>
  `;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
}

function resetTrafficFilters() {
  state.trafficSearch = '';
  state.trafficFilters = {
    method: [],
    status: [],
    host: [],
  };
  state.trafficInScopeOnly = false;
  state.openTrafficFilter = '';
  el.trafficSearch.value = '';
  renderTraffic();
}

function handleTrafficCheckboxFilterChange(event) {
  const scopeInput = event.target.closest('#trafficInScopeOnly');
  if (scopeInput) {
    state.trafficInScopeOnly = scopeInput.checked;
    renderTraffic();
    return;
  }

  const input = event.target.closest('[data-filter-key]');
  if (!input) return;
  const key = input.dataset.filterKey;
  const values = new Set(state.trafficFilters[key]);
  if (input.checked) {
    values.add(input.value);
  } else {
    values.delete(input.value);
  }
  state.trafficFilters[key] = [...values];
  state.openTrafficFilter = key;
  renderTraffic();
}

function closeTrafficFiltersOnOutside(event) {
  if (event.target.closest('.multi-filter')) return;
  state.openTrafficFilter = '';
  document.querySelectorAll('.multi-filter[open]').forEach((details) => {
    details.open = false;
  });
}

function closeEchoGroupListOnOutside(event) {
  if (!state.selectedEchoGroupId) return;
  if (event.target.closest('.echo-group-list, .echo-group-tab')) return;
  state.selectedEchoGroupId = null;
  renderEcho();
}

function closeEchoColorPickersOnOutside(event) {
  if (!state.openEchoColorPicker) return;
  if (event.target.closest('.echo-color-picker')) return;
  state.openEchoColorPicker = null;
  renderEcho();
}

function setTrafficSort(key) {
  if (state.trafficSort.key === key) {
    state.trafficSort.direction = state.trafficSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.trafficSort = { key, direction: 'asc' };
  }
  renderTraffic();
}

function renderTrafficSortHeaders() {
  document.querySelectorAll('[data-sort-key]').forEach((button) => {
    const active = button.dataset.sortKey === state.trafficSort.key;
    button.classList.toggle('active', active);
    button.dataset.sortDirection = active ? state.trafficSort.direction : '';
  });
}

function setTrafficLayout(partial) {
  state.trafficLayout = {
    ...state.trafficLayout,
    ...partial,
  };
  if (!state.trafficLayout.showList && !state.trafficLayout.showDetail) {
    state.trafficLayout.showDetail = true;
  }
  renderTrafficLayout();
}

function renderTrafficLayout() {
  const layout = state.trafficLayout;
  const split = Math.max(25, Math.min(75, Number(layout.splitSize) || 58));
  el.trafficSplit.classList.toggle('vertical', layout.orientation === 'vertical');
  el.trafficSplit.classList.toggle('hide-list', !layout.showList);
  el.trafficSplit.classList.toggle('hide-detail', !layout.showDetail);
  el.trafficSplit.style.setProperty('--traffic-list-size', `${split}%`);
  el.trafficSplit.style.setProperty('--traffic-detail-size', `${100 - split}%`);
  el.trafficHorizontalLayoutBtn.classList.toggle('active', layout.orientation === 'horizontal');
  el.trafficVerticalLayoutBtn.classList.toggle('active', layout.orientation === 'vertical');
  el.showTrafficListToggle.checked = layout.showList;
  el.showTrafficDetailToggle.checked = layout.showDetail;
}

function startTrafficPaneResize(event) {
  event.preventDefault();
  const bounds = el.trafficSplit.getBoundingClientRect();
  const vertical = state.trafficLayout.orientation === 'vertical';

  const onMove = (moveEvent) => {
    const position = vertical ? moveEvent.clientY - bounds.top : moveEvent.clientX - bounds.left;
    const total = vertical ? bounds.height : bounds.width;
    const next = (position / total) * 100;
    state.trafficLayout.splitSize = Math.max(25, Math.min(75, Math.round(next)));
    renderTrafficLayout();
  };

  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
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
  el.sitePathsList.innerHTML = paths.length
    ? `<div class="site-tree">${renderSiteTree(buildSiteTree(paths))}</div>`
    : '<div class="empty-state">No paths match this filter</div>';

  el.sitePathsList.querySelectorAll('[data-flow-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!button.dataset.flowId) return;
      await loadFlow(button.dataset.flowId);
      setView('traffic');
    });
  });
}

function buildSiteTree(paths) {
  const root = createSiteTreeNode('/');

  for (const path of paths) {
    if (path.path === '(CONNECT tunnel)') {
      root.leaves.push(path);
      continue;
    }

    const segments = String(path.path || '/')
      .split('/')
      .filter(Boolean);
    let node = root;
    for (const segment of segments) {
      if (!node.children.has(segment)) {
        node.children.set(segment, createSiteTreeNode(segment));
      }
      node = node.children.get(segment);
    }
    node.leaves.push(path);
  }

  return root;
}

function createSiteTreeNode(name) {
  return {
    name,
    children: new Map(),
    leaves: [],
  };
}

function renderSiteTree(node) {
  const folderHtml = [...node.children.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((child) => renderSiteTreeNode(child))
    .join('');
  const leafHtml = node.leaves.map((path) => renderSiteTreeLeaf(path)).join('');
  return `${folderHtml}${leafHtml}`;
}

function renderSiteTreeNode(node) {
  const count = countSiteTreeLeaves(node);
  return `
    <details class="site-tree-node" open>
      <summary>
        <span class="site-tree-folder">▸</span>
        <span class="site-tree-name" title="${escapeHtml(node.name)}">${escapeHtml(node.name)}</span>
        <span class="site-tree-count">${escapeHtml(String(count))}</span>
      </summary>
      <div class="site-tree-children">
        ${renderSiteTree(node)}
      </div>
    </details>
  `;
}

function renderSiteTreeLeaf(path) {
  const latestFlowId = path.flowIds?.[0] || '';
  const echoAttr = latestFlowId && path.path !== '(CONNECT tunnel)' ? `data-echo-flow-id="${escapeHtml(latestFlowId)}"` : '';
  const leafName = path.path === '(CONNECT tunnel)' ? path.path : siteLeafName(path.path);
  return `
    <button class="site-tree-leaf site-path-item" type="button" data-flow-id="${escapeHtml(latestFlowId)}" ${echoAttr}>
      <span class="site-main-line">
        <span class="site-path-name" title="${escapeHtml(path.path)}">${escapeHtml(leafName)}</span>
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
}

function siteLeafName(path) {
  const segments = String(path || '/')
    .split('/')
    .filter(Boolean);
  return segments.at(-1) || '/';
}

function countSiteTreeLeaves(node) {
  let count = node.leaves.length;
  for (const child of node.children.values()) {
    count += countSiteTreeLeaves(child);
  }
  return count;
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

function renderEcho() {
  if (!state.echoTabs.some((tab) => tab.id === state.selectedEchoTabId)) {
    state.selectedEchoTabId = state.echoTabs[0]?.id || null;
  }
  normalizeEchoGroups();

  el.echoTabs.innerHTML = renderEchoTabGroups();
  el.echoWorkspace.style.setProperty('--echo-request-size', `${state.echoSplit}%`);
  el.echoWorkspace.style.setProperty('--echo-response-size', `${100 - state.echoSplit}%`);

  el.echoTabs.querySelectorAll('[data-echo-tab-id]').forEach((button) => {
    button.addEventListener('click', () => {
      syncSelectedEchoRequest();
      state.selectedEchoTabId = button.dataset.echoTabId;
      renderEcho();
    });
    button.addEventListener('dblclick', (event) => {
      event.preventDefault();
      renameEchoTab(button.dataset.echoTabId);
    });
  });
  el.echoTabs.querySelectorAll('[data-echo-group-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedEchoGroupId = state.selectedEchoGroupId === button.dataset.echoGroupId ? null : button.dataset.echoGroupId;
      renderEcho();
    });
    button.addEventListener('dblclick', (event) => {
      event.preventDefault();
      renameEchoGroup(button.dataset.echoGroupId);
    });
  });
  el.echoTabs.querySelectorAll('[data-close-echo-tab]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      closeEchoTab(button.dataset.closeEchoTab);
    });
  });
  el.echoTabs.querySelectorAll('[data-delete-echo-group]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteEchoGroup(button.dataset.deleteEchoGroup);
    });
  });
  bindEchoColorButtons(el.echoTabs);
  el.echoTabs.querySelectorAll('[draggable="true"]').forEach((node) => {
    node.addEventListener('dragstart', handleEchoDragStart);
    node.addEventListener('dragover', handleEchoDragOver);
    node.addEventListener('drop', handleEchoDrop);
    node.addEventListener('dragend', handleEchoDragEnd);
  });
  el.echoTabs.querySelectorAll('[data-echo-drop-group]').forEach((node) => {
    node.addEventListener('dragover', handleEchoDragOver);
    node.addEventListener('drop', handleEchoDrop);
  });
  renderEchoGroupList();

  const tab = selectedEchoTab();
  if (!tab) {
    el.emptyEcho.classList.remove('hidden');
    el.echoWorkspace.classList.add('hidden');
    return;
  }

  el.emptyEcho.classList.add('hidden');
  el.echoWorkspace.classList.remove('hidden');
  el.echoRequestSubtitle.textContent = tab.source || 'Editable request';
  el.echoTabName.value = tab.title || '';
  el.echoRawRequest.value = tab.rawRequest || '';
  renderEchoRawRequest();
  renderEchoResponse(tab);
}

function renderEchoTabGroups() {
  if (state.echoTabs.length === 0 && state.echoGroups.length === 0) {
    return '';
  }

  const ungrouped = state.echoTabs.filter((tab) => !tab.groupId);
  const groupHtml = state.echoGroups
    .map((group) => {
      const tabs = state.echoTabs.filter((tab) => tab.groupId === group.id);
      const active = state.selectedEchoGroupId === group.id;
      return `
        <div class="echo-group-shell" data-echo-drop-group="${escapeHtml(group.id)}">
          <button class="echo-group-tab ${echoColorClass(group.color)} ${active ? 'active' : ''}" type="button" data-echo-group-id="${escapeHtml(group.id)}">
            ${renderEchoColorSelect('group', group.id, group.color)}
            <span class="echo-group-title">${escapeHtml(group.title)}</span>
            <span class="echo-group-count">${tabs.length}</span>
            <span class="echo-group-close" role="button" tabindex="-1" aria-label="Delete group" data-delete-echo-group="${escapeHtml(group.id)}">×</span>
          </button>
        </div>
      `;
    })
    .join('');

  return `
    <div class="echo-tab-strip" data-echo-drop-group="">
      ${ungrouped.map((tab) => renderEchoTabButton(tab, false)).join('')}
      <div class="echo-ungroup-drop">Drop here to ungroup</div>
    </div>
    ${groupHtml}
  `;
}

function renderEchoTabButton(tab, inGroup) {
  return `
    <button class="echo-tab ${inGroup ? 'in-menu' : ''} ${echoColorClass(tab.color)} ${tab.id === state.selectedEchoTabId ? 'active' : ''}" type="button" draggable="true" data-echo-tab-id="${escapeHtml(tab.id)}">
      ${renderEchoColorSelect('tab', tab.id, tab.color)}
      <span class="method-pill">${escapeHtml(tab.method || 'GET')}</span>
      <span class="echo-tab-title" title="${escapeHtml(tab.title)}">${escapeHtml(tab.title)}</span>
      <span class="echo-tab-close" role="button" tabindex="-1" aria-label="Close tab" data-close-echo-tab="${escapeHtml(tab.id)}">×</span>
    </button>
  `;
}

function renderEchoGroupList() {
  const group = state.echoGroups.find((item) => item.id === state.selectedEchoGroupId);
  if (!group) {
    el.echoGroupList.classList.add('hidden');
    el.echoGroupList.innerHTML = '';
    return;
  }

  const tabs = state.echoTabs.filter((tab) => tab.groupId === group.id);
  el.echoGroupList.classList.remove('hidden');
  el.echoGroupList.dataset.echoDropGroup = group.id;
  el.echoGroupList.innerHTML = `
    <div class="echo-group-list-header">
      <span>${escapeHtml(group.title)}</span>
      <button class="button ghost compact-button" type="button" data-rename-echo-group="${escapeHtml(group.id)}">Rename</button>
    </div>
    <div class="echo-group-list-tabs">
      ${tabs.length ? tabs.map((tab) => renderEchoTabButton(tab, true)).join('') : '<div class="echo-group-empty">Drop tabs here</div>'}
    </div>
  `;
  el.echoGroupList.querySelectorAll('[data-echo-tab-id]').forEach((button) => {
    button.addEventListener('click', () => {
      syncSelectedEchoRequest();
      state.selectedEchoTabId = button.dataset.echoTabId;
      renderEcho();
    });
    button.addEventListener('dblclick', (event) => {
      event.preventDefault();
      renameEchoTab(button.dataset.echoTabId);
    });
  });
  el.echoGroupList.querySelectorAll('[data-close-echo-tab]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      closeEchoTab(button.dataset.closeEchoTab);
    });
  });
  bindEchoColorButtons(el.echoGroupList);
  el.echoGroupList.querySelectorAll('[draggable="true"]').forEach((node) => {
    node.addEventListener('dragstart', handleEchoDragStart);
    node.addEventListener('dragover', handleEchoDragOver);
    node.addEventListener('drop', handleEchoDrop);
    node.addEventListener('dragend', handleEchoDragEnd);
  });
  el.echoGroupList.ondragover = handleEchoDragOver;
  el.echoGroupList.ondrop = handleEchoDrop;
  el.echoGroupList.querySelector('[data-rename-echo-group]')?.addEventListener('click', (event) => {
    renameEchoGroup(event.currentTarget.dataset.renameEchoGroup);
  });
}

function renderEchoColorSelect(kind, id, color) {
  const options = [
    ['', 'None'],
    ['cyan', 'Cyan'],
    ['pink', 'Pink'],
    ['amber', 'Amber'],
    ['violet', 'Violet'],
    ['green', 'Green'],
    ['red', 'Red'],
  ];
  const pickerId = `${kind}:${id}`;
  return `
    <span class="echo-color-picker ${state.openEchoColorPicker === pickerId ? 'open' : ''}" title="Color">
      <span class="echo-color-trigger ${echoColorClass(color)}" role="button" tabindex="0" data-echo-color-picker="${escapeHtml(pickerId)}"></span>
      <span class="echo-color-menu">
        ${options
          .map(
            ([value, label]) => `
              <span class="echo-color-choice ${echoColorClass(value)} ${color === value ? 'active' : ''}" role="button" tabindex="0" title="${escapeHtml(label)}" data-echo-color-target="${escapeHtml(kind)}" data-echo-color-id="${escapeHtml(id)}" data-echo-color-value="${escapeHtml(value)}"></span>
            `,
          )
          .join('')}
      </span>
    </span>
  `;
}

function renderEchoResponse(tab) {
  el.echoResponseStatus.classList.toggle('error', Boolean(tab.error));
  if (tab.loading) {
    el.echoResponseStatus.textContent = '...';
    el.echoResponseMeta.textContent = 'Sending request...';
    setHighlightedHttp(el.echoRawResponse, 'Waiting for response.');
    return;
  }

  if (tab.error) {
    el.echoResponseStatus.textContent = 'ERR';
    el.echoResponseMeta.textContent = tab.durationMs ? `${tab.durationMs}ms` : 'Request failed';
    setHighlightedHttp(el.echoRawResponse, `Echo request failed\r\n\r\n${tab.error}`);
    return;
  }

  if (!tab.response) {
    el.echoResponseStatus.textContent = '-';
    el.echoResponseMeta.textContent = 'No response yet';
    setHighlightedHttp(el.echoRawResponse, 'Send the request to see a response.');
    return;
  }

  el.echoResponseStatus.textContent = `${tab.response.statusCode || '-'} ${tab.response.statusMessage || ''}`.trim();
  el.echoResponseMeta.textContent = `${formatBytes(base64ByteLength(tab.response.bodyBase64 || ''))} · ${tab.durationMs ?? '-'}ms`;
  setHighlightedHttp(el.echoRawResponse, buildRawResponse({ response: tab.response }));
}

function selectedEchoTab() {
  return state.echoTabs.find((tab) => tab.id === state.selectedEchoTabId) || null;
}

function normalizeEchoGroups() {
  for (const tab of state.echoTabs) {
    if (tab.group && !tab.groupId) {
      let group = state.echoGroups.find((item) => item.title === tab.group);
      if (!group) {
        group = { id: `echo-group-${Date.now()}-${Math.random().toString(16).slice(2)}`, title: tab.group };
        state.echoGroups.push(group);
      }
      tab.groupId = group.id;
      delete tab.group;
    }
    if (tab.groupId && !state.echoGroups.some((group) => group.id === tab.groupId)) {
      tab.groupId = '';
    }
  }
}

function createEchoGroup() {
  const count = state.echoGroups.length + 1;
  const group = {
    id: `echo-group-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: `Group ${count}`,
  };
  state.echoGroups.push(group);
  state.selectedEchoGroupId = group.id;
  renderEcho();
}

function renameEchoTab(tabId) {
  const tab = state.echoTabs.find((item) => item.id === tabId);
  if (!tab) return;
  const next = window.prompt('Rename Echo tab', tab.title || '');
  if (next === null) return;
  const trimmed = next.trim();
  if (!trimmed) return;
  tab.title = trimmed;
  tab.customTitle = true;
  renderEcho();
}

function renameEchoGroup(groupId) {
  const group = state.echoGroups.find((item) => item.id === groupId);
  if (!group) return;
  const next = window.prompt('Rename Echo group', group.title || '');
  if (next === null) return;
  const trimmed = next.trim();
  if (!trimmed) return;
  group.title = trimmed;
  renderEcho();
}

function deleteEchoGroup(groupId) {
  state.echoGroups = state.echoGroups.filter((group) => group.id !== groupId);
  state.echoTabs.forEach((tab) => {
    if (tab.groupId === groupId) {
      tab.groupId = '';
    }
  });
  if (state.selectedEchoGroupId === groupId) {
    state.selectedEchoGroupId = null;
  }
  renderEcho();
}

function bindEchoColorButtons(root) {
  root.querySelectorAll('[data-echo-color-picker]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      state.openEchoColorPicker = state.openEchoColorPicker === trigger.dataset.echoColorPicker ? null : trigger.dataset.echoColorPicker;
      renderEcho();
    });
    trigger.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      state.openEchoColorPicker = state.openEchoColorPicker === trigger.dataset.echoColorPicker ? null : trigger.dataset.echoColorPicker;
      renderEcho();
    });
  });
  root.querySelectorAll('[data-echo-color-target]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      state.openEchoColorPicker = null;
      setEchoColor(button.dataset.echoColorTarget, button.dataset.echoColorId, button.dataset.echoColorValue || '');
    });
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      state.openEchoColorPicker = null;
      setEchoColor(button.dataset.echoColorTarget, button.dataset.echoColorId, button.dataset.echoColorValue || '');
    });
  });
}

function setEchoColor(kind, id, color) {
  const item =
    kind === 'group'
      ? state.echoGroups.find((group) => group.id === id)
      : state.echoTabs.find((tab) => tab.id === id);
  if (!item) return;
  item.color = color || '';
  renderEcho();
}

function echoColorClass(color) {
  const normalized = String(color || '').replace(/[^a-z0-9_-]/gi, '');
  return normalized ? `echo-color-${normalized}` : '';
}

function handleEchoDragStart(event) {
  const tabId = event.currentTarget.dataset.echoTabId;
  event.dataTransfer.setData('text/plain', tabId);
  event.dataTransfer.effectAllowed = 'move';
  event.currentTarget.classList.add('dragging');
  el.echoTabs.classList.add('drag-active');
}

function handleEchoDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

function handleEchoDrop(event) {
  event.preventDefault();
  const tabId = event.dataTransfer.getData('text/plain');
  if (!tabId) return;

  const targetTabId = event.currentTarget.dataset.echoTabId || '';
  const targetGroupId = event.currentTarget.dataset.echoDropGroup ?? event.currentTarget.closest('[data-echo-drop-group]')?.dataset.echoDropGroup ?? '';
  moveEchoTab(tabId, targetTabId, targetGroupId);
}

function handleEchoDragEnd(event) {
  event.currentTarget.classList.remove('dragging');
  el.echoTabs.classList.remove('drag-active');
}

function moveEchoTab(tabId, targetTabId, targetGroupId) {
  const tab = state.echoTabs.find((item) => item.id === tabId);
  if (!tab) return;

  state.echoTabs = state.echoTabs.filter((item) => item.id !== tabId);
  tab.groupId = targetGroupId || '';

  let insertIndex = state.echoTabs.length;
  if (targetTabId && targetTabId !== tabId) {
    const targetIndex = state.echoTabs.findIndex((item) => item.id === targetTabId);
    if (targetIndex !== -1) {
      insertIndex = targetIndex;
      tab.groupId = state.echoTabs[targetIndex].groupId || targetGroupId || '';
    }
  } else if (targetGroupId) {
    const groupIndexes = state.echoTabs
      .map((item, index) => (item.groupId === targetGroupId ? index : -1))
      .filter((index) => index !== -1);
    insertIndex = groupIndexes.length ? groupIndexes.at(-1) + 1 : state.echoTabs.length;
  }

  state.echoTabs.splice(insertIndex, 0, tab);
  state.selectedEchoGroupId = tab.groupId || null;
  renderEcho();
}

function startEchoPaneResize(event) {
  event.preventDefault();
  const bounds = el.echoWorkspace.getBoundingClientRect();

  const onMove = (moveEvent) => {
    const next = ((moveEvent.clientX - bounds.left) / bounds.width) * 100;
    state.echoSplit = Math.max(25, Math.min(75, Math.round(next)));
    el.echoWorkspace.style.setProperty('--echo-request-size', `${state.echoSplit}%`);
    el.echoWorkspace.style.setProperty('--echo-response-size', `${100 - state.echoSplit}%`);
  };

  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function renderEchoRawRequest() {
  el.echoRawRequestHighlight.innerHTML = renderLineNumberedHighlighted(highlightHttpMessage(el.echoRawRequest.value));
  syncEchoRawEditorScroll();
}

function syncEchoRawEditorScroll() {
  el.echoRawRequestHighlight.scrollTop = el.echoRawRequest.scrollTop;
  el.echoRawRequestHighlight.scrollLeft = el.echoRawRequest.scrollLeft;
}

function createBlankEchoTab() {
  const tab = createEchoTab({
    method: 'GET',
    url: 'http://example.com/',
    headers: {
      host: 'example.com',
      'user-agent': 'Veil Echo',
    },
    bodyText: '',
  }, 'Manual request');
  state.echoTabs.unshift(tab);
  state.selectedEchoTabId = tab.id;
  setView('echo');
  renderEcho();
}

async function sendFlowToEcho(flowId) {
  const flow = state.selectedFlow?.id === flowId ? state.selectedFlow : await api(`/api/history/${encodeURIComponent(flowId)}`);
  const tab = createEchoTab(flow.request, `${flow.request.method} ${requestTarget(flow.request.url)}`, `From flow ${flow.id}`);
  state.echoTabs.unshift(tab);
  state.selectedEchoTabId = tab.id;
  setView('echo');
  renderEcho();
}

function createEchoTab(request, title, source = 'Editable request') {
  const parsed = safeUrl(request.url);
  const displayTitle = title || `${request.method || 'GET'} ${parsed ? requestTarget(request.url) : request.url || '/'}`;
  const rawRequest = request.rawRequest || buildRawRequest({ request });
  const parsedRaw = parseRawRequestMeta(rawRequest);
  return {
    id: `echo-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: displayTitle,
    customTitle: false,
    groupId: '',
    source,
    method: parsedRaw.method || request.method || 'GET',
    rawRequest,
    response: null,
    loading: false,
    error: null,
    durationMs: null,
  };
}

function syncSelectedEchoRequest() {
  const tab = selectedEchoTab();
  if (!tab || el.echoWorkspace.classList.contains('hidden')) {
    return;
  }

  tab.rawRequest = el.echoRawRequest.value;
  const parsed = parseRawRequestMeta(tab.rawRequest);
  tab.method = parsed.method || 'GET';
  if (!tab.customTitle) {
    tab.title = `${tab.method} ${parsed.target || '/'}`;
    el.echoTabName.value = tab.title;
  }
  renderEchoRawRequest();
}

function syncSelectedEchoMeta() {
  const tab = selectedEchoTab();
  if (!tab || el.echoWorkspace.classList.contains('hidden')) {
    return;
  }

  const nextTitle = el.echoTabName.value.trim();
  tab.title = nextTitle || `${tab.method || 'GET'} ${parseRawRequestMeta(tab.rawRequest).target || '/'}`;
  tab.customTitle = Boolean(nextTitle);
  renderEcho();
}

function closeEchoTab(tabId) {
  state.echoTabs = state.echoTabs.filter((tab) => tab.id !== tabId);
  if (state.selectedEchoTabId === tabId) {
    state.selectedEchoTabId = state.echoTabs[0]?.id || null;
  }
  renderEcho();
}

async function sendSelectedEchoRequest() {
  syncSelectedEchoRequest();
  const tab = selectedEchoTab();
  if (!tab) {
    return;
  }

  tab.loading = true;
  tab.error = null;
  tab.response = null;
  renderEcho();

  try {
    const result = await api('/api/echo/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rawRequest: tab.rawRequest,
      }),
    });

    tab.response = result.response;
    tab.error = result.error;
    tab.durationMs = result.durationMs;
  } catch (error) {
    tab.response = null;
    tab.error = formatError(error);
    tab.durationMs = null;
  } finally {
    tab.loading = false;
  }
  renderEcho();
}

function openEchoContextMenu(event) {
  const source = event.target.closest('[data-flow-id], [data-echo-flow-id]');
  const flowId = source?.dataset.flowId || source?.dataset.echoFlowId || '';
  if (!flowId) {
    closeContextMenu();
    return;
  }

  event.preventDefault();
  const flow = flowSummaryById(flowId);
  state.contextFlowId = flowId;
  state.echoContextFlowId = source.dataset.echoFlowId || (flow?.type === 'http' ? flowId : null);
  el.sendToEchoContextBtn.disabled = flow?.type !== 'http';
  const inConfiguredScope = Boolean(state.config?.scope?.enabled && flow?.inScope);
  el.addToScopeContextBtn.classList.toggle('hidden', inConfiguredScope);
  el.removeFromScopeContextBtn.classList.toggle('hidden', !inConfiguredScope);
  el.contextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 210)}px`;
  el.contextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 86)}px`;
  el.contextMenu.classList.remove('hidden');
}

function closeContextMenu() {
  state.contextFlowId = null;
  state.echoContextFlowId = null;
  el.contextMenu.classList.add('hidden');
}

function flowSummaryById(flowId) {
  if (state.selectedFlow?.id === flowId) {
    return state.selectedFlow;
  }
  return state.history.find((flow) => flow.id === flowId) || null;
}

async function applyScopeFromContext(action) {
  const flowId = state.contextFlowId;
  closeContextMenu();
  if (!flowId) {
    return;
  }

  const flow = flowSummaryById(flowId) || (await api(`/api/history/${encodeURIComponent(flowId)}`));
  const scopeUrl = scopeUrlWithoutQuery(flow);
  if (!scopeUrl) {
    return;
  }

  const scope = state.config?.scope || { enabled: false, rules: [] };
  const rules = (scope.rules || []).filter(
    (rule) => !(rule.field === 'url' && rule.operator === 'equals' && rule.value === scopeUrl),
  );
  rules.push({
    id: `scope-context-${Date.now()}`,
    enabled: true,
    action,
    field: 'url',
    operator: 'equals',
    value: scopeUrl,
  });

  await patchConfig({
    scope: {
      ...scope,
      enabled: true,
      rules,
    },
  });
}

function scopeUrlWithoutQuery(flow) {
  const parsed = safeUrl(flow?.request?.url || flow?.url || '');
  if (!parsed) {
    return '';
  }
  return `${parsed.origin}${parsed.pathname || '/'}`;
}

function filteredHistory() {
  return trafficHistory().filter((flow) => {
    if (state.trafficFilters.method.length > 0 && !state.trafficFilters.method.includes(flow.method)) return false;
    if (state.trafficFilters.host.length > 0 && !state.trafficFilters.host.includes(flow.host)) return false;
    if (state.trafficInScopeOnly && !flow.inScope) return false;
    if (!matchesStatusFilters(flow)) return false;
    if (!state.trafficSearch) return true;
    const haystack = `${flow.id} ${flow.method} ${flow.host} ${flow.url} ${flow.statusCode || ''} ${flow.inScope ? 'in scope' : 'out scope'}`.toLowerCase();
    return haystack.includes(state.trafficSearch);
  }).sort(compareTrafficFlows);
}

function trafficHistory() {
  return state.history.filter(isTrafficFlow);
}

function isTrafficFlow(flow) {
  return flow && flow.type !== 'connect' && flow.method !== 'CONNECT';
}

function compareTrafficFlows(a, b) {
  const direction = state.trafficSort.direction === 'asc' ? 1 : -1;
  const key = state.trafficSort.key;
  const av = trafficSortValue(a, key);
  const bv = trafficSortValue(b, key);
  if (typeof av === 'number' && typeof bv === 'number') {
    return (av - bv) * direction;
  }
  return String(av).localeCompare(String(bv)) * direction;
}

function trafficSortValue(flow, key) {
  if (key === 'id') return Number(flow.id) || 0;
  if (key === 'method') return flow.method || '';
  if (key === 'host') return flow.host || '';
  if (key === 'path') return safeUrl(flow.url)?.pathname || flow.path || flow.url || '';
  if (key === 'status') return Number(flow.statusCode) || (flow.error ? 999 : 0);
  if (key === 'scope') return flow.inScope ? 1 : 0;
  if (key === 'size') return Number(flow.responseBytes || 0);
  if (key === 'time') return Number(flow.durationMs ?? Number.MAX_SAFE_INTEGER);
  return '';
}

function matchesStatusFilters(flow) {
  const filters = state.trafficFilters.status;
  if (filters.length === 0) return true;
  return filters.some((filter) => {
    if (filter === 'error') return Boolean(flow.error);
    if (filter === 'open') return flow.durationMs === null || flow.durationMs === undefined;
    if (!/^[2-5]xx$/.test(filter)) return true;
    const status = Number(flow.statusCode);
    return status >= Number(filter[0]) * 100 && status < (Number(filter[0]) + 1) * 100;
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
    delete el.flowDetail.dataset.flowId;
    delete el.flowDetail.dataset.echoFlowId;
    return;
  }

  const flow = state.selectedFlow;
  el.emptyDetail.classList.add('hidden');
  el.flowDetail.classList.remove('hidden');
  el.flowDetail.dataset.flowId = flow.id;
  if (flow.type === 'http') {
    el.flowDetail.dataset.echoFlowId = flow.id;
  } else {
    delete el.flowDetail.dataset.echoFlowId;
  }
  el.detailMethod.textContent = flow.request.method;
  el.detailUrl.textContent = flow.request.url;
  el.detailStatus.textContent = flow.error ? 'ERR' : flow.response ? `${flow.response.statusCode} ${flow.response.statusMessage || ''}` : flow.type;
  el.detailStatus.classList.toggle('error', Boolean(flow.error));
  renderRequestPretty(flow);
  renderBody(el.requestBody, flow.request, {
    kind: 'request',
    method: flow.request.method,
  });
  setHighlightedHttp(el.requestRawText, buildRawRequest(flow));
  renderResponsePretty(flow);
  renderBody(el.responseBody, flow.response, {
    kind: 'response',
    statusCode: flow.response?.statusCode,
  });
  setHighlightedHttp(el.responseRawText, buildRawResponse(flow));
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

function setHighlightedHttp(target, raw) {
  const text = String(raw || '');
  target.dataset.rawText = text;
  target.innerHTML = renderLineNumberedHighlighted(highlightHttpMessage(text));
}

function parseRawRequestMeta(raw) {
  const firstLine = String(raw || '').split(/\r?\n/, 1)[0] || '';
  const [method, target] = firstLine.trim().split(/\s+/);
  return {
    method: method ? method.toUpperCase() : '',
    target: target || '',
  };
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
  const formatted = formatBodyForContentType(message.bodyText || '', contentType);
  if (isTextContent(contentType)) {
    return formatted.text;
  }

  return `[binary body base64; content-type=${contentType}; size=${formatBytes(byteLength)}]\r\n${message.bodyBase64 || ''}`;
}

async function copyTargetText(button) {
  const target = document.getElementById(button.dataset.copyTarget);
  const text = target?.dataset?.rawText || target?.value || target?.textContent || '';
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
    const formatted = formatBodyForContentType(message.bodyText || '', contentType);
    pre.className = `syntax-block line-numbered language-${formatted.language}`;
    pre.dataset.rawText = formatted.text;
    pre.innerHTML = renderLineNumberedHighlighted(highlightStructuredText(formatted.text, formatted.language));
  } else {
    const binaryText = `Binary body: ${contentType}, ${formatBytes(byteLength)}\n\n${message.bodyBase64 || ''}`;
    pre.className = 'syntax-block line-numbered language-plain';
    pre.dataset.rawText = binaryText;
    pre.innerHTML = renderLineNumberedHighlighted(escapeHtml(binaryText));
  }
  container.appendChild(pre);
}

function formatBodyText(text, headers = {}) {
  if (!text) {
    return '<div class="message-empty">No body.</div>';
  }
  const contentType = headerValue(headers, 'content-type') || 'text/plain';
  const formatted = formatBodyForContentType(text, contentType);
  return `<pre class="syntax-block line-numbered language-${escapeHtml(formatted.language)}">${renderLineNumberedHighlighted(highlightStructuredText(formatted.text, formatted.language))}</pre>`;
}

function renderLineNumberedHighlighted(highlightedHtml) {
  const html = String(highlightedHtml || '');
  const lines = html.split('\n');
  return lines.map((line) => `<span class="code-line">${line || ' '}</span>`).join('');
}

function formatBodyForContentType(text, contentType = '') {
  const source = String(text || '');
  const type = contentType.split(';', 1)[0].trim().toLowerCase();

  if (isJsonContentType(type)) {
    return { text: formatJsonLike(source, type), language: 'json' };
  }

  if (type === 'application/x-www-form-urlencoded') {
    return { text: formatUrlEncoded(source), language: 'form' };
  }

  if (isXmlContentType(type)) {
    return { text: formatXmlLike(source), language: type === 'text/html' ? 'html' : 'xml' };
  }

  if (type.includes('javascript') || type.endsWith('/ecmascript')) {
    return { text: source, language: 'js' };
  }

  if (type === 'text/css') {
    return { text: source, language: 'css' };
  }

  return { text: source, language: 'plain' };
}

function isJsonContentType(type) {
  return type === 'application/json' || type.endsWith('+json') || type.includes('json');
}

function isXmlContentType(type) {
  return (
    type === 'application/xml' ||
    type === 'text/xml' ||
    type === 'text/html' ||
    type === 'image/svg+xml' ||
    type.endsWith('+xml')
  );
}

function formatJsonLike(text, type) {
  const trimmed = text.trim();
  if (!trimmed) {
    return text;
  }

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    if (type.includes('ndjson') || trimmed.includes('\n')) {
      const lines = trimmed.split(/\r?\n/);
      try {
        return lines
          .map((line) => (line.trim() ? JSON.stringify(JSON.parse(line), null, 2) : ''))
          .join('\n');
      } catch {
        return text;
      }
    }
    return text;
  }
}

function formatUrlEncoded(text) {
  try {
    const params = new URLSearchParams(text);
    const entries = [...params.entries()];
    if (entries.length === 0) {
      return text;
    }
    return entries.map(([name, value]) => `${name}=${value}`).join('\n');
  } catch {
    return text;
  }
}

function formatXmlLike(text) {
  const trimmed = text.trim();
  if (!trimmed || !trimmed.includes('<')) {
    return text;
  }

  const normalized = trimmed.replace(/>\s+</g, '><').replace(/</g, '\n<').trim();
  const lines = normalized.split(/\n/).filter(Boolean);
  let depth = 0;
  return lines
    .map((line) => {
      const trimmedLine = line.trim();
      if (/^<\//.test(trimmedLine)) {
        depth = Math.max(0, depth - 1);
      }
      const out = `${'  '.repeat(depth)}${trimmedLine}`;
      if (
        /^<[^!?/][^>]*[^/]?>$/.test(trimmedLine) &&
        !/^<[^>]+>.*<\/[^>]+>$/.test(trimmedLine) &&
        !/^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/i.test(trimmedLine)
      ) {
        depth += 1;
      }
      return out;
    })
    .join('\n');
}

function highlightHttpMessage(raw) {
  const text = String(raw || '');
  const normalized = text.replace(/\r\n/g, '\n');
  const separator = normalized.search(/\n\n/);
  const headerText = separator === -1 ? normalized : normalized.slice(0, separator);
  const bodyText = separator === -1 ? '' : normalized.slice(separator + 2);
  const lines = headerText.split('\n');
  const startLine = lines.shift() || '';
  const headers = textToHeaders(lines.join('\n'));
  const bodyLanguage = languageFromHeaders(headers);

  const parts = [];
  if (startLine) {
    parts.push(`<span class="syntax-start-line">${highlightHttpStartLine(startLine)}</span>`);
  }

  for (const line of lines) {
    parts.push(highlightHeaderLine(line));
  }

  if (separator !== -1 || bodyText) {
    parts.push('');
    parts.push(highlightStructuredText(bodyText, bodyLanguage));
  }

  return parts.join('\n');
}

function highlightHttpStartLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('HTTP/')) {
    const match = trimmed.match(/^(HTTP\/[0-9.]+)\s+(\d{3})(?:\s+(.*))?$/);
    if (!match) {
      return escapeHtml(line);
    }
    return `<span class="syntax-protocol">${escapeHtml(match[1])}</span> <span class="syntax-status">${escapeHtml(match[2])}</span>${match[3] ? ` <span class="syntax-reason">${escapeHtml(match[3])}</span>` : ''}`;
  }

  const match = trimmed.match(/^([A-Z0-9_-]+)\s+(\S+)(?:\s+(HTTP\/[0-9.]+))?$/i);
  if (!match) {
    return escapeHtml(line);
  }
  return `<span class="syntax-method">${escapeHtml(match[1].toUpperCase())}</span> <span class="syntax-target">${escapeHtml(match[2])}</span>${match[3] ? ` <span class="syntax-protocol">${escapeHtml(match[3])}</span>` : ''}`;
}

function highlightHeaderLine(line) {
  const index = line.indexOf(':');
  if (index === -1) {
    return escapeHtml(line);
  }
  return `<span class="syntax-header-name">${escapeHtml(line.slice(0, index))}</span><span class="syntax-punctuation">:</span><span class="syntax-header-value">${escapeHtml(line.slice(index + 1))}</span>`;
}

function languageFromHeaders(headers) {
  return formatBodyForContentType('', headerValue(headers, 'content-type') || '').language;
}

function highlightStructuredText(text, language = 'plain') {
  if (language === 'json') {
    return highlightJson(text);
  }
  if (language === 'xml' || language === 'html') {
    return highlightXml(text);
  }
  if (language === 'form') {
    return highlightForm(text);
  }
  return escapeHtml(text);
}

function highlightJson(text) {
  const regex = /("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b)/g;
  let output = '';
  let lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    const token = match[0];
    const index = match.index || 0;
    output += escapeHtml(text.slice(lastIndex, index));
    let className = 'syntax-json-number';
    if (token.startsWith('"')) {
      className = /^\s*:/.test(text.slice(index + token.length)) ? 'syntax-json-key' : 'syntax-json-string';
    } else if (token === 'true' || token === 'false') {
      className = 'syntax-json-boolean';
    } else if (token === 'null') {
      className = 'syntax-json-null';
    }
    output += `<span class="${className}">${escapeHtml(token)}</span>`;
    lastIndex = index + token.length;
  }
  output += escapeHtml(text.slice(lastIndex));
  return output;
}

function highlightXml(text) {
  const regex = /<\/?[\s\S]*?>/g;
  let output = '';
  let lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    const token = match[0];
    const index = match.index || 0;
    output += escapeHtml(text.slice(lastIndex, index));
    let tag = escapeHtml(token);
    tag = tag.replace(/(&lt;\/?)([A-Za-z0-9_:-]+)/, '$1<span class="syntax-xml-tag">$2</span>');
    tag = tag.replace(/([A-Za-z0-9_:-]+)(=)(&quot;.*?&quot;|'.*?')/g, '<span class="syntax-xml-attr">$1</span><span class="syntax-punctuation">$2</span><span class="syntax-xml-string">$3</span>');
    output += `<span class="syntax-xml-bracket">${tag}</span>`;
    lastIndex = index + token.length;
  }
  output += escapeHtml(text.slice(lastIndex));
  return output;
}

function highlightForm(text) {
  return text
    .split('\n')
    .map((line) => {
      const index = line.indexOf('=');
      if (index === -1) {
        return escapeHtml(line);
      }
      return `<span class="syntax-form-key">${escapeHtml(line.slice(0, index))}</span><span class="syntax-punctuation">=</span><span class="syntax-form-value">${escapeHtml(line.slice(index + 1))}</span>`;
    })
    .join('\n');
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
          <button class="pending-item pending-${escapeHtml(item.stage)} ${item.id === state.selectedPendingId ? 'active' : ''}" type="button" data-pending-id="${escapeHtml(item.id)}" data-echo-flow-id="${escapeHtml(item.flowId)}">
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
    delete el.pendingEditor.dataset.echoFlowId;
    return;
  }

  el.emptyPending.classList.add('hidden');
  el.pendingEditor.classList.remove('hidden');
  el.pendingEditor.dataset.echoFlowId = item.flowId;
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
  renderPendingPretty(item);
  renderPendingEditorMode();
}

function setPendingEditorMode(mode) {
  state.pendingEditorMode = mode === 'pretty' ? 'pretty' : 'raw';
  renderPendingEditorMode();
}

function renderPendingEditorMode() {
  const pretty = state.pendingEditorMode === 'pretty';
  el.pendingPrettyBtn.classList.toggle('active', pretty);
  el.pendingRawBtn.classList.toggle('active', !pretty);
  el.pendingPrettyView.classList.toggle('hidden', !pretty);
  el.pendingRawView.classList.toggle('hidden', pretty);
}

function renderPendingPretty(item) {
  const editable = item.editable || {};
  const isRequest = item.stage === 'request';
  const url = isRequest ? safeUrl(editable.url) : safeUrl(item.summary?.url);
  const summary = isRequest
    ? [
        ['Method', editable.method || '-'],
        ['Host', url?.host || headerValue(editable.headers, 'host') || '-'],
        ['Path', url ? `${url.pathname}${url.search}` : editable.url || '-'],
        ['Body', formatBytes(Buffer.byteLength(editable.bodyText || ''))],
      ]
    : [
        ['Status', `${editable.statusCode || '-'} ${editable.statusMessage || ''}`.trim()],
        ['URL', item.summary?.url || '-'],
        ['Body', formatBytes(Buffer.byteLength(editable.bodyText || ''))],
      ];

  el.pendingPrettyView.innerHTML = `
    <div class="message-summary">${summaryCards(summary)}</div>
    ${isRequest ? `<section class="message-section"><h3>Query Parameters</h3>${renderQueryTable(url)}</section>` : ''}
    <section class="message-section"><h3>Headers</h3>${renderHeaderTable(editable.headers)}</section>
    <section class="message-section"><h3>Body</h3><div class="body-block">${formatBodyText(editable.bodyText || '', editable.headers)}</div></section>
  `;
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
    echo: 'Echo',
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
