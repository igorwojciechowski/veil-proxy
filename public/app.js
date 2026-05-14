if (new URLSearchParams(window.location.search).get('desktop') === '1') {
  document.documentElement.classList.add('desktop-shell');
}

const state = {
  config: null,
  project: null,
  mcp: null,
  history: [],
  findings: [],
  sentTraffic: [],
  mcpExchanges: [],
  mcpSecrets: [],
  pending: [],
  desktopProject: null,
  projectDirty: false,
  projectMetaSignature: '',
  recentProjects: [],
  projectCheckpoints: [],
  recoveryDraftChecked: false,
  recoveryDraftSaving: false,
  recoveryDraftQueued: false,
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
  trafficExtensionFilter: {
    include: '',
    exclude: '',
  },
  trafficPresets: [],
  selectedTrafficPreset: '',
  trafficPersistenceReady: false,
  openTrafficFilter: '',
  trafficAdvancedOpen: false,
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
  virtual: {
    traffic: { scrollTop: 0 },
    siteHosts: { scrollTop: 0 },
    sitePaths: { scrollTop: 0 },
  },
  visibleTrafficRows: [],
  visibleSiteHosts: [],
  visibleSitePathItems: [],
  siteCollapsedNodes: new Set(),
  activeTab: 'request',
  messageTabs: {
    request: 'pretty',
    response: 'pretty',
  },
  siteMap: { hosts: [] },
  selectedSiteHost: null,
  siteMapSearch: '',
  siteMapInScopeOnly: false,
  globalSearchQuery: '',
  globalSearchResults: [],
  globalSearchLoading: false,
  globalSearchError: '',
  findingsSearch: '',
  findingsSeverity: '',
  selectedSentTrafficId: null,
  selectedSentTraffic: null,
  payloadAttacks: [],
  selectedPayloadAttackId: null,
  selectedPayloadAttack: null,
  selectedMcpExchangeId: null,
  selectedMcpExchange: null,
  echoTabs: [],
  echoGroups: [],
  selectedEchoGroupId: null,
  selectedEchoTabId: null,
  echoPersistenceReady: false,
  openEchoColorPicker: null,
  echoSplit: 50,
  echoContextFlowId: null,
  contextFlowId: null,
  contextTarget: null,
  rulesModalStage: 'request',
};

const el = {
  viewTitle: document.querySelector('#viewTitle'),
  trafficCount: document.querySelector('#trafficCount'),
  pendingCount: document.querySelector('#pendingCount'),
  findingsCount: document.querySelector('#findingsCount'),
  upstreamStatus: document.querySelector('#upstreamStatus'),
  proxyAddress: document.querySelector('#proxyAddress'),
  requestInterceptToggle: document.querySelector('#requestInterceptToggle'),
  responseInterceptToggle: document.querySelector('#responseInterceptToggle'),
  trafficSplit: document.querySelector('#trafficSplit'),
  trafficTableWrap: document.querySelector('#trafficTableWrap'),
  trafficPaneResizer: document.querySelector('#trafficPaneResizer'),
  trafficRows: document.querySelector('#trafficRows'),
  trafficAdvancedFilterBtn: document.querySelector('#trafficAdvancedFilterBtn'),
  trafficAdvancedFilterBadge: document.querySelector('#trafficAdvancedFilterBadge'),
  trafficAdvancedFilters: document.querySelector('#trafficAdvancedFilters'),
  trafficPresetSelect: document.querySelector('#trafficPresetSelect'),
  saveTrafficPresetBtn: document.querySelector('#saveTrafficPresetBtn'),
  deleteTrafficPresetBtn: document.querySelector('#deleteTrafficPresetBtn'),
  trafficSearch: document.querySelector('#trafficSearch'),
  trafficMethodFilter: document.querySelector('#trafficMethodFilter'),
  trafficStatusFilter: document.querySelector('#trafficStatusFilter'),
  trafficHostFilter: document.querySelector('#trafficHostFilter'),
  trafficExtensionInclude: document.querySelector('#trafficExtensionInclude'),
  trafficExtensionExclude: document.querySelector('#trafficExtensionExclude'),
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
  globalSearchInput: document.querySelector('#globalSearchInput'),
  globalSearchBtn: document.querySelector('#globalSearchBtn'),
  globalSearchClearBtn: document.querySelector('#globalSearchClearBtn'),
  globalSearchStatus: document.querySelector('#globalSearchStatus'),
  globalSearchResults: document.querySelector('#globalSearchResults'),
  findingsSubtitle: document.querySelector('#findingsSubtitle'),
  findingsSearch: document.querySelector('#findingsSearch'),
  findingsSeverityFilter: document.querySelector('#findingsSeverityFilter'),
  findingsList: document.querySelector('#findingsList'),
  refreshFindingsBtn: document.querySelector('#refreshFindingsBtn'),
  sentTrafficSubtitle: document.querySelector('#sentTrafficSubtitle'),
  sentTrafficRows: document.querySelector('#sentTrafficRows'),
  clearSentTrafficBtn: document.querySelector('#clearSentTrafficBtn'),
  emptySentTrafficDetail: document.querySelector('#emptySentTrafficDetail'),
  sentTrafficDetail: document.querySelector('#sentTrafficDetail'),
  sentTrafficMethod: document.querySelector('#sentTrafficMethod'),
  sentTrafficUrl: document.querySelector('#sentTrafficUrl'),
  sentTrafficStatus: document.querySelector('#sentTrafficStatus'),
  sentTrafficRequestRaw: document.querySelector('#sentTrafficRequestRaw'),
  sentTrafficResponseRaw: document.querySelector('#sentTrafficResponseRaw'),
  sentTrafficMeta: document.querySelector('#sentTrafficMeta'),
  mcpLogSubtitle: document.querySelector('#mcpLogSubtitle'),
  mcpLogRows: document.querySelector('#mcpLogRows'),
  clearMcpLogBtn: document.querySelector('#clearMcpLogBtn'),
  emptyMcpLogDetail: document.querySelector('#emptyMcpLogDetail'),
  mcpLogDetail: document.querySelector('#mcpLogDetail'),
  mcpLogMethod: document.querySelector('#mcpLogMethod'),
  mcpLogTool: document.querySelector('#mcpLogTool'),
  mcpLogStatus: document.querySelector('#mcpLogStatus'),
  mcpLogRequestRaw: document.querySelector('#mcpLogRequestRaw'),
  mcpLogResponseRaw: document.querySelector('#mcpLogResponseRaw'),
  mcpLogMeta: document.querySelector('#mcpLogMeta'),
  payloadAttacksSubtitle: document.querySelector('#payloadAttacksSubtitle'),
  payloadAttackRows: document.querySelector('#payloadAttackRows'),
  clearPayloadAttacksBtn: document.querySelector('#clearPayloadAttacksBtn'),
  emptyPayloadAttackDetail: document.querySelector('#emptyPayloadAttackDetail'),
  payloadAttackDetail: document.querySelector('#payloadAttackDetail'),
  payloadAttackMethod: document.querySelector('#payloadAttackMethod'),
  payloadAttackUrl: document.querySelector('#payloadAttackUrl'),
  payloadAttackStatus: document.querySelector('#payloadAttackStatus'),
  payloadAttackSummary: document.querySelector('#payloadAttackSummary'),
  payloadAttackResultRows: document.querySelector('#payloadAttackResultRows'),
  payloadAttackMeta: document.querySelector('#payloadAttackMeta'),
  secretsSubtitle: document.querySelector('#secretsSubtitle'),
  secretName: document.querySelector('#secretName'),
  secretValue: document.querySelector('#secretValue'),
  secretDescription: document.querySelector('#secretDescription'),
  addSecretBtn: document.querySelector('#addSecretBtn'),
  refreshSecretsBtn: document.querySelector('#refreshSecretsBtn'),
  secretStatus: document.querySelector('#secretStatus'),
  secretRows: document.querySelector('#secretRows'),
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
  showFlowsContextBtn: document.querySelector('#showFlowsContextBtn'),
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
  mcpEnabledToggle: document.querySelector('#mcpEnabledToggle'),
  mcpPort: document.querySelector('#mcpPort'),
  mcpToken: document.querySelector('#mcpToken'),
  mcpRequireScopeToggle: document.querySelector('#mcpRequireScopeToggle'),
  mcpActiveTestingToggle: document.querySelector('#mcpActiveTestingToggle'),
  saveMcpBtn: document.querySelector('#saveMcpBtn'),
  mcpEndpoint: document.querySelector('#mcpEndpoint'),
  mcpStatus: document.querySelector('#mcpStatus'),
  anonymizationProfile: document.querySelector('#anonymizationProfile'),
  anonymizationMaxBodyChars: document.querySelector('#anonymizationMaxBodyChars'),
  anonymizationRedactHosts: document.querySelector('#anonymizationRedactHosts'),
  anonymizationCookieNames: document.querySelector('#anonymizationCookieNames'),
  anonymizationCookieValues: document.querySelector('#anonymizationCookieValues'),
  anonymizationAuthorization: document.querySelector('#anonymizationAuthorization'),
  anonymizationPlatformHeaders: document.querySelector('#anonymizationPlatformHeaders'),
  anonymizationAggressivePath: document.querySelector('#anonymizationAggressivePath'),
  anonymizationStatus: document.querySelector('#anonymizationStatus'),
  saveAnonymizationBtn: document.querySelector('#saveAnonymizationBtn'),
  projectName: document.querySelector('#projectName'),
  projectPath: document.querySelector('#projectPath'),
  newProjectBtn: document.querySelector('#newProjectBtn'),
  exportProjectBtn: document.querySelector('#exportProjectBtn'),
  saveProjectAsBtn: document.querySelector('#saveProjectAsBtn'),
  importProjectBtn: document.querySelector('#importProjectBtn'),
  importProjectInput: document.querySelector('#importProjectInput'),
  recentProjectsList: document.querySelector('#recentProjectsList'),
  clearRecentProjectsBtn: document.querySelector('#clearRecentProjectsBtn'),
  projectCheckpointsList: document.querySelector('#projectCheckpointsList'),
  clearProjectCheckpointsBtn: document.querySelector('#clearProjectCheckpointsBtn'),
  clearHistoryBtn: document.querySelector('#clearHistoryBtn'),
  projectActionStatus: document.querySelector('#projectActionStatus'),
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
  rewriteRulesCount: document.querySelector('#rewriteRulesCount'),
  rewriteRulesList: document.querySelector('#rewriteRulesList'),
  addRewriteRuleBtn: document.querySelector('#addRewriteRuleBtn'),
  saveRewriteRulesBtn: document.querySelector('#saveRewriteRulesBtn'),
};

let siteMapLoadTimer = null;
let findingsLoadTimer = null;
let globalSearchTimer = null;
let echoPersistTimer = null;
let recoveryDraftTimer = null;

const GLOBAL_SEARCH_DELAY_MS = 280;
const RECOVERY_DRAFT_DELAY_MS = 2500;
const VIRTUAL_BUFFER_ROWS = 8;
const TRAFFIC_ROW_HEIGHT = 42;
const SITE_HOST_ROW_HEIGHT = 74;
const SITE_TREE_ROW_HEIGHT = 74;
const STATIC_EXTENSIONS = 'jpg,jpeg,png,gif,webp,avif,svg,ico,css,js,map,woff,woff2,ttf,eot,otf';
const BUILTIN_TRAFFIC_PRESETS = [
  { id: 'all', name: 'All traffic', filter: { search: '', inScopeOnly: false, filters: { method: [], status: [], host: [] }, extension: { include: '', exclude: '' } } },
  { id: 'in-scope', name: 'Only in scope', filter: { search: '', inScopeOnly: true, filters: { method: [], status: [], host: [] }, extension: { include: '', exclude: '' } } },
  { id: 'errors', name: 'Only errors', filter: { search: '', inScopeOnly: false, filters: { method: [], status: ['error'], host: [] }, extension: { include: '', exclude: '' } } },
  {
    id: 'auth-session',
    name: 'Auth/session',
    filter: { search: 'auth,login,session,cookie,token,jwt,bearer,password,oauth', inScopeOnly: false, filters: { method: [], status: [], host: [] }, extension: { include: '', exclude: '' } },
  },
  {
    id: 'api-only',
    name: 'API only',
    filter: { search: '/api,/rest,/graphql,/v1,/v2', inScopeOnly: false, filters: { method: [], status: [], host: [] }, extension: { include: '', exclude: STATIC_EXTENSIONS } },
  },
  { id: '4xx-5xx', name: '4xx/5xx', filter: { search: '', inScopeOnly: false, filters: { method: [], status: ['4xx', '5xx'], host: [] }, extension: { include: '', exclude: '' } } },
  {
    id: 'exclude-static-ext',
    name: 'Exclude static extensions',
    filter: { search: '', inScopeOnly: false, filters: { method: [], status: [], host: [] }, extension: { include: '', exclude: STATIC_EXTENSIONS } },
  },
];
const SCOPE_PRESETS = {
  domain: { label: 'Domain', field: 'host', operator: 'domain' },
  'domain-subdomains': { label: 'Domain + subdomains', field: 'host', operator: 'domainSubdomains' },
  'exact-url': { label: 'Exact URL without query', field: 'url', operator: 'equals' },
  'path-prefix': { label: 'Path prefix', field: 'path', operator: 'startsWith' },
  regex: { label: 'Regex URL', field: 'url', operator: 'regex' },
  custom: { label: 'Custom', field: 'url', operator: 'contains' },
};

window.addEventListener('pagehide', () => {
  flushEchoState();
  flushTrafficPresets();
  flushRecoveryDraft();
});

async function init() {
  bindUi();
  await hydrateDesktopProjectMeta();
  const payload = await api('/api/state');
  applyState(payload);
  await maybeRestoreRecoveryDraft();
  await Promise.all([loadSiteMap(), loadFindings()]);
  openEvents();
}

function bindUi() {
  bindDesktopProjectCommands();

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
    state.selectedTrafficPreset = '';
    resetTrafficVirtualScroll();
    renderTraffic();
  });
  el.trafficPresetSelect.addEventListener('change', () => applyTrafficPreset(el.trafficPresetSelect.value));
  el.saveTrafficPresetBtn.addEventListener('click', saveCurrentTrafficPreset);
  el.deleteTrafficPresetBtn.addEventListener('click', deleteSelectedTrafficPreset);
  el.trafficExtensionInclude.addEventListener('input', () => updateTrafficExtensionFilter('include', el.trafficExtensionInclude.value));
  el.trafficExtensionExclude.addEventListener('input', () => updateTrafficExtensionFilter('exclude', el.trafficExtensionExclude.value));
  el.trafficAdvancedFilterBtn.addEventListener('click', () => {
    state.trafficAdvancedOpen = !state.trafficAdvancedOpen;
    renderTrafficAdvancedState();
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
  el.trafficTableWrap.addEventListener('scroll', () => {
    state.virtual.traffic.scrollTop = el.trafficTableWrap.scrollTop;
    renderTrafficRows(state.visibleTrafficRows);
  });
  el.trafficRows.addEventListener('click', (event) => {
    const row = event.target.closest('[data-flow-id]');
    if (row) {
      loadFlow(row.dataset.flowId);
    }
  });

  el.siteMapSearch.addEventListener('input', () => {
    state.siteMapSearch = el.siteMapSearch.value.trim().toLowerCase();
    resetSiteMapVirtualScroll();
    renderSiteMap();
  });

  el.siteMapInScopeOnly.addEventListener('change', () => {
    state.siteMapInScopeOnly = el.siteMapInScopeOnly.checked;
    resetSiteMapVirtualScroll();
    renderSiteMap();
  });
  el.siteHostsList.addEventListener('scroll', () => {
    state.virtual.siteHosts.scrollTop = el.siteHostsList.scrollTop;
    renderVirtualSiteHosts(state.visibleSiteHosts);
  });
  el.siteHostsList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-site-host]');
    if (!button) return;
    state.selectedSiteHost = button.dataset.siteHost;
    resetSitePathVirtualScroll();
    renderSiteMap();
  });
  el.sitePathsList.addEventListener('scroll', () => {
    state.virtual.sitePaths.scrollTop = el.sitePathsList.scrollTop;
    renderVirtualSitePathItems(state.visibleSitePathItems);
  });
  el.sitePathsList.addEventListener('click', async (event) => {
    const nodeButton = event.target.closest('[data-site-node-id]');
    if (nodeButton) {
      toggleSiteTreeNode(nodeButton.dataset.siteNodeId);
      return;
    }

    const flowButton = event.target.closest('[data-flow-id]');
    if (!flowButton?.dataset.flowId) return;
    await loadFlow(flowButton.dataset.flowId);
    setView('traffic');
  });

  el.refreshSiteMapBtn.addEventListener('click', () => loadSiteMap());
  el.globalSearchInput.addEventListener('input', () => {
    state.globalSearchQuery = el.globalSearchInput.value;
    state.globalSearchError = '';
    scheduleGlobalSearch();
  });
  el.globalSearchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    runGlobalSearch();
  });
  el.globalSearchBtn.addEventListener('click', () => runGlobalSearch());
  el.globalSearchClearBtn.addEventListener('click', clearGlobalSearch);
  el.globalSearchResults.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-search-request-id]');
    if (!button) return;
    await loadFlow(button.dataset.searchRequestId);
    setView('traffic');
  });
  el.refreshFindingsBtn.addEventListener('click', () => loadFindings());
  el.findingsSearch.addEventListener('input', () => {
    state.findingsSearch = el.findingsSearch.value.trim().toLowerCase();
    renderFindings();
  });
  el.findingsSeverityFilter.addEventListener('change', () => {
    state.findingsSeverity = el.findingsSeverityFilter.value;
    renderFindings();
  });
  el.sentTrafficRows?.addEventListener('click', async (event) => {
    const row = event.target.closest('[data-sent-traffic-id]');
    if (!row) return;
    await loadSentTraffic(row.dataset.sentTrafficId);
  });
  el.clearSentTrafficBtn?.addEventListener('click', clearSentTraffic);
  el.payloadAttackRows?.addEventListener('click', async (event) => {
    const row = event.target.closest('[data-payload-attack-id]');
    if (!row) return;
    await loadPayloadAttack(row.dataset.payloadAttackId);
  });
  el.payloadAttackResultRows?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-sent-traffic-id-link]');
    if (!button) return;
    await loadSentTraffic(button.dataset.sentTrafficIdLink);
    setView('sentTraffic');
  });
  el.clearPayloadAttacksBtn?.addEventListener('click', clearPayloadAttacks);
  el.mcpLogRows?.addEventListener('click', async (event) => {
    const row = event.target.closest('[data-mcp-exchange-id]');
    if (!row) return;
    await loadMcpExchange(row.dataset.mcpExchangeId);
  });
  el.clearMcpLogBtn?.addEventListener('click', clearMcpLog);
  el.addSecretBtn?.addEventListener('click', addSecret);
  el.refreshSecretsBtn?.addEventListener('click', loadSecrets);
  el.secretRows?.addEventListener('click', handleSecretRowClick);
  el.secretRows?.addEventListener('change', handleSecretRowChange);
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
    const flowId = state.contextTarget?.echoFlowId || state.echoContextFlowId || state.contextFlowId;
    closeContextMenu();
    if (flowId) {
      sendFlowToEcho(flowId);
    }
  });
  el.showFlowsContextBtn.addEventListener('click', showContextFlows);
  el.addToScopeContextBtn.addEventListener('click', () => applyScopeFromContext('include'));
  el.removeFromScopeContextBtn.addEventListener('click', () => applyScopeFromContext('exclude'));

  el.requestInterceptToggle.addEventListener('change', () => {
    patchConfig({ intercept: { requests: el.requestInterceptToggle.checked } });
  });

  el.responseInterceptToggle.addEventListener('change', () => {
    patchConfig({ intercept: { responses: el.responseInterceptToggle.checked } });
  });

  [el.proxyHost, el.proxyPort, el.mcpPort, el.mcpToken].forEach((input) => {
    input?.addEventListener('input', syncProxyDraftFromDom);
  });
  el.saveConfigBtn.addEventListener('click', () => {
    syncProxyDraftFromDom();
    syncUpstreamDraftFromDom();
    patchConfig({
      upstream: { mode: 'direct', host: '', port: 0, username: '', password: '' },
      upstreams: state.config.upstreams || [],
      upstreamRules: [],
    });
  });
  el.addUpstreamRuleBtn.addEventListener('click', addUpstreamRuleRow);
  el.addRewriteRuleBtn.addEventListener('click', addRewriteRuleRow);
  el.saveRewriteRulesBtn.addEventListener('click', saveRewriteRules);
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
    if (event.target.closest('[data-upstream-rule-field]')) {
      syncUpstreamDraftFromDom();
    }
  });
  el.upstreamRulesList.addEventListener('input', (event) => {
    if (event.target.closest('[data-upstream-rule-field]')) {
      syncUpstreamDraftFromDom();
    }
  });
  el.rewriteRulesList.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-delete-rewrite-rule]');
    if (deleteButton) {
      deleteRewriteRuleRow(deleteButton.dataset.deleteRewriteRule);
    }
  });
  el.rewriteRulesList.addEventListener('change', (event) => {
    const targetSelect = event.target.closest('[data-rewrite-field="target"]');
    if (targetSelect) {
      updateRewriteRuleRow(targetSelect.closest('.rewrite-rule-row'));
    }
    if (event.target.closest('[data-rewrite-field]')) {
      syncRewriteDraftFromDom();
    }
  });
  el.rewriteRulesList.addEventListener('input', (event) => {
    if (event.target.closest('[data-rewrite-field]')) {
      syncRewriteDraftFromDom();
    }
  });

  el.saveProxyBtn.addEventListener('click', saveProxyConfig);
  el.saveMcpBtn?.addEventListener('click', saveMcpConfig);
  el.saveAnonymizationBtn?.addEventListener('click', saveAnonymizationConfig);
  el.anonymizationProfile?.addEventListener('change', applyAnonymizationProfileDraft);
  [
    el.anonymizationMaxBodyChars,
    el.anonymizationRedactHosts,
    el.anonymizationCookieNames,
    el.anonymizationCookieValues,
    el.anonymizationAuthorization,
    el.anonymizationPlatformHeaders,
    el.anonymizationAggressivePath,
  ].forEach((input) => input?.addEventListener('change', markAnonymizationCustom));
  el.newProjectBtn.addEventListener('click', newProject);
  el.exportProjectBtn.addEventListener('click', () => saveProject(false));
  el.saveProjectAsBtn.addEventListener('click', () => saveProject(true));
  el.importProjectBtn.addEventListener('click', () => {
    if (window.veilDesktop?.openProject) {
      openDesktopProject();
      return;
    }
    el.importProjectInput.click();
  });
  el.importProjectInput.addEventListener('change', importSelectedProject);
  el.clearRecentProjectsBtn?.addEventListener('click', clearRecentProjects);
  el.clearProjectCheckpointsBtn?.addEventListener('click', clearProjectCheckpoints);
  el.clearHistoryBtn.addEventListener('click', clearHistory);
  el.addIncludeScopeRuleBtn.addEventListener('click', () => addScopeRule('include'));
  el.addExcludeScopeRuleBtn.addEventListener('click', () => addScopeRule('exclude'));
  el.scopeEnabledToggle.addEventListener('change', syncScopeDraftFromDom);
  el.saveScopeBtn.addEventListener('click', saveScopeConfig);
  [el.includeScopeRulesList, el.excludeScopeRulesList].forEach((list) => {
    list.addEventListener('click', (event) => {
      const deleteButton = event.target.closest('[data-delete-scope-rule]');
      if (deleteButton) {
        deleteScopeRule(deleteButton.dataset.deleteScopeRule);
      }
    });
    list.addEventListener('change', (event) => {
      const presetSelect = event.target.closest('[data-scope-field="preset"]');
      if (presetSelect) {
        applyScopePreset(presetSelect.closest('.rule-row'), presetSelect.value);
        syncScopeDraftFromDom();
        return;
      }

      const fieldSelect = event.target.closest('[data-scope-field="field"]');
      if (fieldSelect) {
        setScopePreset(fieldSelect.closest('.rule-row'), 'custom');
        updateScopeRuleRow(fieldSelect.closest('.rule-row'));
      }
      const operatorSelect = event.target.closest('[data-scope-field="operator"]');
      if (operatorSelect) {
        setScopePreset(operatorSelect.closest('.rule-row'), 'custom');
        updateScopeRuleRow(operatorSelect.closest('.rule-row'));
      }
      if (event.target.closest('[data-scope-field]')) {
        syncScopeDraftFromDom();
        updateScopeMatchCounts();
      }
    });
    list.addEventListener('input', (event) => {
      if (event.target.closest('[data-scope-field]')) {
        syncScopeDraftFromDom();
        updateScopeMatchCounts();
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
  events.addEventListener('state', (event) => applyState(JSON.parse(event.data), false, { renderConfig: !state.config }));
  events.addEventListener('ui', (event) => applyUiState(JSON.parse(event.data), false));
  events.addEventListener('history', (event) => upsertHistory(JSON.parse(event.data)));
  events.addEventListener('findings', (event) => {
    state.findings = JSON.parse(event.data);
    renderMeta();
    renderFindings();
  });
  events.addEventListener('sent-traffic', (event) => {
    state.sentTraffic = JSON.parse(event.data);
    if (!state.sentTraffic.some((item) => item.id === state.selectedSentTrafficId)) {
      state.selectedSentTrafficId = null;
      state.selectedSentTraffic = null;
    }
    renderSentTraffic();
    markProjectDirty();
  });
  events.addEventListener('payload-attacks', (event) => {
    state.payloadAttacks = JSON.parse(event.data);
    if (!state.payloadAttacks.some((item) => item.id === state.selectedPayloadAttackId)) {
      state.selectedPayloadAttackId = null;
      state.selectedPayloadAttack = null;
    }
    renderPayloadAttacks();
    markProjectDirty();
  });
  events.addEventListener('mcp-exchanges', (event) => {
    state.mcpExchanges = JSON.parse(event.data);
    if (!state.mcpExchanges.some((item) => item.id === state.selectedMcpExchangeId)) {
      state.selectedMcpExchangeId = null;
      state.selectedMcpExchange = null;
    }
    renderMcpLog();
    markProjectDirty();
  });
  events.addEventListener('mcp-secrets', (event) => {
    state.mcpSecrets = JSON.parse(event.data);
    renderSecrets();
  });
  events.addEventListener('pending', (event) => {
    state.pending = JSON.parse(event.data);
    renderAll({ config: false });
  });
  events.addEventListener('config', (event) => {
    state.config = JSON.parse(event.data);
    renderConfig();
    renderMeta();
    refreshHistoryAndSiteMap()
      .then(() => renderAll({ config: false }))
      .catch(console.error);
  });
}

function applyState(payload, forceUi = false, options = {}) {
  state.config = payload.config;
  state.mcp = payload.mcp || null;
  state.project = payload.project || null;
  state.history = payload.history || [];
  state.sentTraffic = payload.sentTraffic || [];
  state.payloadAttacks = payload.payloadAttacks || [];
  state.mcpExchanges = payload.mcpExchanges || [];
  state.mcpSecrets = payload.mcpSecrets || [];
  state.pending = payload.pending || [];
  applyUiState(payload.ui, forceUi);
  state.selectedFlowId = state.history.some((flow) => flow.id === state.selectedFlowId) ? state.selectedFlowId : null;
  state.selectedFlow = state.selectedFlowId ? state.selectedFlow : null;
  renderAll({ config: options.renderConfig !== false });
}

function applyUiState(ui, force = false) {
  const forceTraffic = force || ui?.forceTraffic === true;
  const forceEcho = force || ui?.forceEcho === true;

  if (ui?.traffic && (!state.trafficPersistenceReady || forceTraffic)) {
    state.trafficPresets = sanitizeTrafficPresets(ui.traffic.presets);
    state.trafficPersistenceReady = true;
  }

  if (!ui?.echo || (state.echoPersistenceReady && !forceEcho)) {
    return;
  }

  const echo = ui.echo;
  state.echoTabs = Array.isArray(echo.tabs) ? echo.tabs : [];
  state.echoGroups = Array.isArray(echo.groups) ? echo.groups : [];
  state.selectedEchoTabId = echo.selectedTabId || state.echoTabs[0]?.id || null;
  state.selectedEchoGroupId = echo.selectedGroupId || null;
  state.echoSplit = clampNumber(echo.split, 25, 75, 50);
  state.echoPersistenceReady = true;
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
  renderAll({ config: false });
  scheduleSiteMapLoad();
  scheduleFindingsLoad();
  if (state.globalSearchQuery) {
    scheduleGlobalSearch();
  }
  markProjectDirty();
}

function renderAll(options = {}) {
  renderMeta();
  if (options.config === true) {
    renderConfig();
  }
  renderTraffic();
  renderSiteMap();
  renderGlobalSearch();
  renderFindings();
  renderSentTraffic();
  renderPayloadAttacks();
  renderMcpLog();
  renderSecrets();
  renderEcho();
  renderPending();
  renderDetail();
  updateScopeMatchCounts();
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
  el.findingsCount.textContent = `${state.findings.length} ${state.findings.length === 1 ? 'finding' : 'findings'}`;
  el.upstreamStatus.textContent = upstreams.length === 0 ? 'direct' : `${upstreams.length} upstream${upstreams.length === 1 ? '' : 's'}`;
}

function renderConfig(options = {}) {
  if (!state.config) return;
  const { intercept } = state.config;
  const preserveActive = options.force !== true;
  const editingSettings = preserveActive && isActiveEditableIn(document.querySelector('#settingsView'));
  const editingScope = preserveActive && isActiveEditableIn(document.querySelector('#scopeView'));
  const editingRules = preserveActive && isActiveEditableIn(el.rulesModal);

  el.requestInterceptToggle.checked = Boolean(intercept.requests);
  el.responseInterceptToggle.checked = Boolean(intercept.responses);
  if (!editingRules && !el.rulesModal.classList.contains('hidden')) {
    renderRules();
  }
  if (!editingSettings) {
    el.proxyHost.value = state.config.proxyHost;
    el.proxyPort.value = state.config.proxyPort;
    renderMcpConfig();
    renderAnonymizationConfig();
    renderUpstreamRules();
    renderRewriteRules();
  }
  if (!editingScope) {
    renderScopeRules();
  }
  renderProject();
}

function renderProject() {
  if (!el.projectName || !el.projectPath) return;
  const project = currentProjectDisplay();
  el.projectName.textContent = `${state.projectDirty ? '● ' : ''}${project.name}`;
  el.projectPath.textContent = project.path
    ? `${project.path}${state.projectDirty ? ' · unsaved changes' : ''}`
    : `Memory session - not saved yet${state.projectDirty ? ' · unsaved changes' : ''}`;
  renderProjectCheckpoints();
  updateProjectChrome(project);
}

async function hydrateDesktopProjectMeta() {
  if (!window.veilDesktop?.getProjectMeta) {
    renderRecentProjects();
    renderProjectCheckpoints();
    return;
  }

  try {
    const meta = await window.veilDesktop.getProjectMeta();
    if (meta?.path) {
      state.desktopProject = { name: meta.name || 'Veil Proxy Project', path: meta.path };
    }
    state.projectDirty = Boolean(meta?.dirty);
    state.projectMetaSignature = '';
    await loadRecentProjects();
    await loadProjectCheckpoints();
    renderProject();
  } catch (error) {
    console.error(error);
  }
}

function bindDesktopProjectCommands() {
  if (!window.veilDesktop?.onProjectCommand) {
    return;
  }

  window.veilDesktop.onProjectCommand((command) => {
    handleProjectCommand(command).catch((error) => {
      el.projectActionStatus.textContent = `Project command failed: ${formatError(error)}`;
      if (command?.closeAfter) {
        reportProjectCommandResult({ action: command.action, closeAfter: true, saved: false });
      }
    });
  });
}

async function handleProjectCommand(command = {}) {
  if (command.action === 'save') {
    await saveProject(Boolean(command.saveAs), { closeAfter: Boolean(command.closeAfter) });
    return;
  }
  if (command.action === 'open') {
    await openDesktopProject();
    return;
  }
  if (command.action === 'openRecent') {
    await openRecentDesktopProject(command.path);
    return;
  }
  if (command.action === 'recentProjectsChanged') {
    state.recentProjects = sanitizeRecentProjects(command.projects);
    renderRecentProjects();
    return;
  }
  if (command.action === 'discardAndClose') {
    await clearRecoveryDraft({ silent: true });
    reportProjectCommandResult({ action: 'discard', closeAfter: Boolean(command.closeAfter), discarded: true });
    return;
  }
  if (command.action === 'new') {
    await newProject();
  }
}

function currentProjectDisplay() {
  const project = state.desktopProject || state.project || {};
  return {
    name: project.name || 'Unsaved project',
    path: project.path || '',
  };
}

function markProjectDirty() {
  setProjectDirty(true);
}

function setProjectDirty(dirty) {
  const next = Boolean(dirty);
  if (state.projectDirty === next) {
    if (next) {
      scheduleRecoveryDraft();
    }
    renderProject();
    return;
  }
  state.projectDirty = next;
  if (next) {
    scheduleRecoveryDraft();
  } else {
    clearRecoveryDraft({ silent: true }).catch(console.error);
  }
  renderProject();
}

function updateProjectChrome(project = currentProjectDisplay()) {
  const meta = {
    dirty: Boolean(state.projectDirty),
    name: project.name || 'Unsaved project',
    path: project.path || '',
  };
  document.title = `${meta.dirty ? '● ' : ''}${meta.name} - Veil Proxy`;
  const signature = JSON.stringify(meta);
  if (signature === state.projectMetaSignature) {
    return;
  }
  state.projectMetaSignature = signature;
  window.veilDesktop?.setProjectMeta?.(meta).catch(console.error);
}

async function loadRecentProjects() {
  if (!window.veilDesktop?.recentProjects) {
    state.recentProjects = [];
    renderRecentProjects();
    return;
  }

  try {
    state.recentProjects = sanitizeRecentProjects(await window.veilDesktop.recentProjects());
    renderRecentProjects();
  } catch (error) {
    console.error(error);
  }
}

function sanitizeRecentProjects(projects) {
  if (!Array.isArray(projects)) return [];
  const seen = new Set();
  return projects
    .map((project) => ({
      name: project?.name || basename(project?.path || ''),
      path: project?.path || '',
      lastOpened: Number(project?.lastOpened || 0) || 0,
    }))
    .filter((project) => {
      if (!project.path || seen.has(project.path)) return false;
      seen.add(project.path);
      return true;
    });
}

function renderRecentProjects() {
  if (!el.recentProjectsList || !el.clearRecentProjectsBtn) {
    return;
  }

  el.clearRecentProjectsBtn.disabled = state.recentProjects.length === 0;
  el.recentProjectsList.innerHTML = state.recentProjects.length
    ? state.recentProjects.map((project) => renderRecentProject(project)).join('')
    : '<div class="recent-projects-empty">No recent projects</div>';

  el.recentProjectsList.querySelectorAll('[data-open-recent-project]').forEach((button) => {
    button.addEventListener('click', () => openRecentDesktopProject(button.dataset.openRecentProject));
  });
}

function renderRecentProject(project) {
  return `
    <button class="recent-project-button" type="button" data-open-recent-project="${escapeHtml(project.path)}" title="${escapeHtml(project.path)}">
      <span class="recent-project-name">${escapeHtml(project.name || basename(project.path))}</span>
      <span class="recent-project-path">${escapeHtml(project.path)}</span>
    </button>
  `;
}

async function loadProjectCheckpoints() {
  const project = currentProjectDisplay();
  if (!project.path) {
    state.projectCheckpoints = [];
    renderProjectCheckpoints();
    return;
  }
  if (!window.veilDesktop?.projectCheckpoints) {
    state.projectCheckpoints = [];
    renderProjectCheckpoints();
    return;
  }

  try {
    state.projectCheckpoints = sanitizeProjectCheckpoints(await window.veilDesktop.projectCheckpoints(project));
    renderProjectCheckpoints();
  } catch (error) {
    console.error(error);
  }
}

function sanitizeProjectCheckpoints(checkpoints) {
  if (!Array.isArray(checkpoints)) return [];
  const seen = new Set();
  return checkpoints
    .map((checkpoint) => ({
      id: checkpoint?.id || '',
      createdAt: checkpoint?.createdAt || '',
      name: checkpoint?.name || '',
      size: Number(checkpoint?.size || 0) || 0,
      project: {
        name: checkpoint?.project?.name || 'Unsaved project',
        path: checkpoint?.project?.path || '',
      },
    }))
    .filter((checkpoint) => {
      if (!checkpoint.id || seen.has(checkpoint.id)) return false;
      seen.add(checkpoint.id);
      return true;
    });
}

function renderProjectCheckpoints() {
  if (!el.projectCheckpointsList || !el.clearProjectCheckpointsBtn) {
    return;
  }

  const project = currentProjectDisplay();
  const hasProjectPath = Boolean(project.path);
  el.clearProjectCheckpointsBtn.disabled = !hasProjectPath || state.projectCheckpoints.length === 0;
  el.projectCheckpointsList.innerHTML = state.projectCheckpoints.length
    ? state.projectCheckpoints.map((checkpoint) => renderProjectCheckpoint(checkpoint)).join('')
    : `<div class="project-checkpoints-empty">${hasProjectPath ? 'No checkpoints yet' : 'Save the project to create checkpoints'}</div>`;

  el.projectCheckpointsList.querySelectorAll('[data-restore-checkpoint]').forEach((button) => {
    button.addEventListener('click', () => restoreProjectCheckpoint(button.dataset.restoreCheckpoint));
  });
}

function renderProjectCheckpoint(checkpoint) {
  const createdAt = checkpoint.createdAt ? formatDateTime(checkpoint.createdAt) : 'Unknown time';
  const pathLabel = checkpoint.project.path || checkpoint.project.name || 'Unsaved project';
  return `
    <div class="project-checkpoint-row">
      <div class="project-checkpoint-main" title="${escapeHtml(pathLabel)}">
        <span class="project-checkpoint-name">${escapeHtml(createdAt)}</span>
        <span class="project-checkpoint-path">${escapeHtml(pathLabel)}</span>
      </div>
      <button class="button ghost compact-button" type="button" data-restore-checkpoint="${escapeHtml(checkpoint.id)}">Restore</button>
    </div>
  `;
}

async function restoreProjectCheckpoint(checkpointId) {
  if (!checkpointId || !window.veilDesktop?.openProjectCheckpoint) {
    return false;
  }
  if (!confirmDiscardProjectChanges('restore this checkpoint')) {
    return false;
  }

  el.projectActionStatus.textContent = 'Restoring checkpoint...';
  try {
    const checkpoint = await window.veilDesktop.openProjectCheckpoint(checkpointId);
    const project = checkpoint.project || {};
    state.projectCheckpoints = sanitizeProjectCheckpoints(checkpoint.checkpoints || state.projectCheckpoints);
    await importProjectPayload(checkpoint.data, `${project.name || 'project'} checkpoint`, project.path ? { name: project.name, path: project.path } : null, {
      dirty: true,
      keepRecoveryDraft: true,
      skipCheckpointLoad: true,
    });
    renderProjectCheckpoints();
    el.projectActionStatus.textContent = `Restored checkpoint from ${formatDateTime(checkpoint.createdAt)}. Save to keep it.`;
    return true;
  } catch (error) {
    el.projectActionStatus.textContent = `Restore failed: ${formatError(error)}`;
    await loadProjectCheckpoints();
    return false;
  }
}

function basename(filePath) {
  return String(filePath || '').split(/[\\/]/).filter(Boolean).pop() || 'Project';
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || '');
  }
  return date.toLocaleString();
}

async function maybeRestoreRecoveryDraft() {
  if (state.recoveryDraftChecked || !window.veilDesktop?.recoveryDraft) {
    return;
  }
  state.recoveryDraftChecked = true;
  if (state.projectDirty) {
    return;
  }

  let draft = null;
  try {
    draft = await window.veilDesktop.recoveryDraft();
  } catch (error) {
    console.error(error);
    return;
  }
  if (!draft?.payload) {
    return;
  }

  const project = draft.project || {};
  const displayName = project.name || basename(project.path || '') || 'unsaved project';
  const savedAt = draft.savedAt ? ` from ${formatDateTime(draft.savedAt)}` : '';
  const shouldRestore = window.confirm(`Recover autosaved changes for ${displayName}${savedAt}?`);
  if (!shouldRestore) {
    await clearRecoveryDraft({ silent: true });
    return;
  }

  await importProjectPayload(draft.payload, `${displayName} recovery`, project.path ? { name: displayName, path: project.path } : null, {
    dirty: true,
    keepRecoveryDraft: true,
  });
  el.projectActionStatus.textContent = `Recovered autosaved changes for ${displayName}.`;
}

function scheduleRecoveryDraft() {
  if (!state.projectDirty || !window.veilDesktop?.saveRecoveryDraft) {
    return;
  }

  clearTimeout(recoveryDraftTimer);
  recoveryDraftTimer = setTimeout(() => {
    recoveryDraftTimer = null;
    saveRecoveryDraftNow().catch(console.error);
  }, RECOVERY_DRAFT_DELAY_MS);
}

async function flushRecoveryDraft() {
  clearTimeout(recoveryDraftTimer);
  recoveryDraftTimer = null;
  if (!state.projectDirty) {
    return;
  }
  await saveRecoveryDraftNow();
}

async function saveRecoveryDraftNow() {
  if (!state.projectDirty || !window.veilDesktop?.saveRecoveryDraft) {
    return false;
  }
  if (state.recoveryDraftSaving) {
    state.recoveryDraftQueued = true;
    return false;
  }

  state.recoveryDraftSaving = true;
  state.recoveryDraftQueued = false;
  try {
    await syncProjectUiState();
    const payload = await api('/api/project/export');
    if (!state.projectDirty) {
      return false;
    }
    await window.veilDesktop.saveRecoveryDraft(payload, currentProjectDisplay());
    if (!state.projectDirty) {
      await clearRecoveryDraft({ silent: true });
      return false;
    }
    return true;
  } catch (error) {
    console.error(error);
    return false;
  } finally {
    state.recoveryDraftSaving = false;
    if (state.recoveryDraftQueued && state.projectDirty) {
      state.recoveryDraftQueued = false;
      scheduleRecoveryDraft();
    }
  }
}

async function clearRecoveryDraft(options = {}) {
  clearTimeout(recoveryDraftTimer);
  recoveryDraftTimer = null;
  state.recoveryDraftQueued = false;
  if (!window.veilDesktop?.clearRecoveryDraft) {
    return;
  }

  try {
    await window.veilDesktop.clearRecoveryDraft();
  } catch (error) {
    if (!options.silent) {
      el.projectActionStatus.textContent = `Could not clear recovery draft: ${formatError(error)}`;
    }
    console.error(error);
  }
}

function reportProjectCommandResult(result) {
  window.veilDesktop?.projectCommandResult?.(result).catch(console.error);
}

function confirmDiscardProjectChanges(actionLabel) {
  if (!state.projectDirty) {
    return true;
  }
  return window.confirm(`Discard unsaved project changes and ${actionLabel}?`);
}

function isActiveEditableIn(container) {
  const active = document.activeElement;
  return Boolean(container && active && container.contains(active) && isEditableControl(active));
}

function isEditableControl(element) {
  return Boolean(element?.matches?.('input, textarea, select, [contenteditable="true"]'));
}

function syncProxyDraftFromDom() {
  if (!state.config) return;
  state.config.proxyHost = el.proxyHost.value.trim();
  state.config.proxyPort = Number(el.proxyPort.value || 0);
}

function renderMcpConfig() {
  if (!el.mcpEnabledToggle || !state.config) return;
  const config = state.config.mcp || {};
  const runtime = state.mcp || {};
  el.mcpEnabledToggle.checked = config.enabled === true;
  el.mcpPort.value = runtime.port || config.port || 8765;
  el.mcpToken.value = runtime.token || config.token || '';
  el.mcpRequireScopeToggle.checked = config.requireScope === true;
  el.mcpActiveTestingToggle.checked = config.activeTesting === true;
  if (runtime.running) {
    el.mcpEndpoint.textContent = runtime.endpoint;
    el.mcpStatus.textContent = `Running. Use Authorization: Bearer ${runtime.token}`;
  } else if (config.enabled && runtime.lastError) {
    el.mcpEndpoint.textContent = 'MCP failed to start';
    el.mcpStatus.textContent = runtime.lastError;
  } else {
    el.mcpEndpoint.textContent = 'MCP disabled';
    el.mcpStatus.textContent = 'MCP returns anonymized data only. Real secret values are never returned.';
  }
}

function renderAnonymizationConfig() {
  if (!el.anonymizationProfile || !state.config) return;
  const config = anonymizationConfig();
  el.anonymizationProfile.value = config.profile || 'balanced';
  el.anonymizationMaxBodyChars.value = config.maxBodyChars || 262144;
  el.anonymizationRedactHosts.checked = config.redactHosts !== false;
  el.anonymizationCookieNames.checked = config.redactCookieNames !== false;
  el.anonymizationCookieValues.checked = config.redactCookieValues !== false;
  el.anonymizationAuthorization.checked = config.redactAuthorization !== false;
  el.anonymizationPlatformHeaders.checked = config.redactPlatformHeaders === true;
  el.anonymizationAggressivePath.checked = config.aggressivePathRedaction === true;
}

function anonymizationConfig() {
  return {
    ...anonymizationProfileDefaults('balanced'),
    ...(state.config?.mcp?.anonymization || {}),
  };
}

function anonymizationProfileDefaults(profile) {
  if (profile === 'strict') {
    return {
      profile,
      aggressivePathRedaction: true,
      redactHosts: true,
      redactCookieNames: true,
      redactCookieValues: true,
      redactAuthorization: true,
      redactPlatformHeaders: true,
      maxBodyChars: 131072,
    };
  }
  if (profile === 'local') {
    return {
      profile,
      aggressivePathRedaction: false,
      redactHosts: false,
      redactCookieNames: false,
      redactCookieValues: false,
      redactAuthorization: true,
      redactPlatformHeaders: false,
      maxBodyChars: 524288,
    };
  }
  return {
    profile: profile || 'balanced',
    aggressivePathRedaction: false,
    redactHosts: true,
    redactCookieNames: true,
    redactCookieValues: true,
    redactAuthorization: true,
    redactPlatformHeaders: false,
    maxBodyChars: 262144,
  };
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

function syncUpstreamDraftFromDom() {
  if (!state.config || !el.upstreamRulesList) return;
  state.config.upstreams = readUpstreamRows();
  state.config.upstreamRules = [];
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

function renderRewriteRules() {
  const rules = Array.isArray(state.config?.rewriteRules) ? state.config.rewriteRules : [];
  el.rewriteRulesCount.textContent = `${rules.length} ${rules.length === 1 ? 'rule' : 'rules'}`;
  el.rewriteRulesList.innerHTML =
    rules
      .map(
        (rule, index) => `
          <div class="rewrite-rule-row" data-rewrite-rule-id="${escapeHtml(rule.id || `rewrite-${index}`)}">
            <label class="upstream-enabled-toggle rewrite-enabled-toggle">
              <input type="checkbox" data-rewrite-field="enabled" ${rule.enabled === false ? '' : 'checked'} />
              <span class="mini-switch"></span>
              <span>On</span>
            </label>
            <label>
              Name
              <input data-rewrite-field="name" type="text" value="${escapeHtml(rule.name || `Rewrite ${index + 1}`)}" />
            </label>
            <label>
              Stage
              <select data-rewrite-field="stage">
                ${ruleOption('request', 'Request', rule.stage || 'request')}
                ${ruleOption('response', 'Response', rule.stage || 'request')}
                ${ruleOption('both', 'Both', rule.stage || 'request')}
              </select>
            </label>
            <label>
              Target
              <select data-rewrite-field="target">
                ${ruleOption('url', 'URL', rule.target || 'body')}
                ${ruleOption('method', 'Method', rule.target || 'body')}
                ${ruleOption('status', 'Status', rule.target || 'body')}
                ${ruleOption('statusMessage', 'Status text', rule.target || 'body')}
                ${ruleOption('header', 'Header', rule.target || 'body')}
                ${ruleOption('body', 'Body', rule.target || 'body')}
              </select>
            </label>
            <label class="rewrite-header-name">
              Header
              <input data-rewrite-field="headerName" type="text" value="${escapeHtml(rule.headerName || '')}" placeholder="x-custom-header" />
            </label>
            <label>
              Match
              <select data-rewrite-field="matchType">
                ${ruleOption('literal', 'Literal', rule.matchType || 'literal')}
                ${ruleOption('regex', 'Regex', rule.matchType || 'literal')}
              </select>
            </label>
            <label class="wide">
              Find
              <textarea data-rewrite-field="match" spellcheck="false">${escapeHtml(rule.match || '')}</textarea>
            </label>
            <label class="wide">
              Replace
              <textarea data-rewrite-field="replace" spellcheck="false">${escapeHtml(rule.replace || '')}</textarea>
            </label>
            <button class="button ghost compact-button" type="button" data-delete-rewrite-rule="${escapeHtml(rule.id || `rewrite-${index}`)}">Delete</button>
          </div>
        `,
      )
      .join('') || '<div class="message-empty">No rewrite rules configured.</div>';
  el.rewriteRulesList.querySelectorAll('.rewrite-rule-row').forEach(updateRewriteRuleRow);
}

function addRewriteRuleRow() {
  syncRewriteDraftFromDom();
  const rules = readRewriteRows();
  rules.push({
    id: `rewrite-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: `Rewrite ${rules.length + 1}`,
    enabled: true,
    stage: 'request',
    target: 'body',
    headerName: '',
    matchType: 'literal',
    match: '',
    replace: '',
  });
  state.config.rewriteRules = rules;
  renderRewriteRules();
}

function deleteRewriteRuleRow(id) {
  syncRewriteDraftFromDom();
  state.config.rewriteRules = readRewriteRows().filter((rule) => rule.id !== id);
  renderRewriteRules();
}

async function saveRewriteRules() {
  syncRewriteDraftFromDom();
  await patchConfig({ rewriteRules: state.config.rewriteRules || [] });
}

function syncRewriteDraftFromDom() {
  if (!state.config || !el.rewriteRulesList) return;
  state.config.rewriteRules = readRewriteRows();
}

function readRewriteRows() {
  return [...el.rewriteRulesList.querySelectorAll('[data-rewrite-rule-id]')].map((row) => ({
    id: row.dataset.rewriteRuleId,
    name: row.querySelector('[data-rewrite-field="name"]').value.trim(),
    enabled: row.querySelector('[data-rewrite-field="enabled"]').checked,
    stage: row.querySelector('[data-rewrite-field="stage"]').value,
    target: row.querySelector('[data-rewrite-field="target"]').value,
    headerName: row.querySelector('[data-rewrite-field="headerName"]').value.trim(),
    matchType: row.querySelector('[data-rewrite-field="matchType"]').value,
    match: row.querySelector('[data-rewrite-field="match"]').value,
    replace: row.querySelector('[data-rewrite-field="replace"]').value,
  }));
}

function updateRewriteRuleRow(row) {
  if (!row) return;
  const target = row.querySelector('[data-rewrite-field="target"]').value;
  row.querySelector('.rewrite-header-name').classList.toggle('hidden', target !== 'header');
}

function renderTraffic() {
  renderTrafficFilterControls();
  renderTrafficLayout();
  const rows = filteredHistory();
  state.visibleTrafficRows = rows;
  el.trafficFilterCount.textContent = `${rows.length} shown`;
  renderTrafficRows(rows);
  renderTrafficSortHeaders();
}

function renderTrafficRows(rows) {
  const window = virtualWindow(el.trafficTableWrap, state.virtual.traffic, rows.length, TRAFFIC_ROW_HEIGHT);
  const visibleRows = rows.slice(window.start, window.end);
  el.trafficRows.innerHTML = `
    ${renderTrafficSpacerRow(window.top, 8)}
    ${visibleRows.map(renderTrafficRow).join('')}
    ${renderTrafficSpacerRow(window.bottom, 8)}
  `;
}

function renderTrafficSpacerRow(height, colspan) {
  if (height <= 0) return '';
  return `<tr class="virtual-spacer-row" aria-hidden="true"><td colspan="${colspan}" style="height:${height}px"></td></tr>`;
}

function renderTrafficRow(flow) {
  const url = safeUrl(flow.url);
  const path = url ? `${url.pathname}${url.search}` : flow.url;
  const status = flow.error ? 'ERR' : flow.statusCode || (flow.type === 'connect' ? 'TUN' : '-');
  const size = flow.type === 'connect' ? formatBytes((flow.tunnel?.bytesUp || 0) + (flow.tunnel?.bytesDown || 0)) : formatBytes(flow.responseBytes || 0);
  const duration = flow.durationMs === null || flow.durationMs === undefined ? 'open' : `${flow.durationMs}ms`;
  const echoAttr = flow.type === 'http' ? `data-echo-flow-id="${escapeHtml(flow.id)}"` : '';
  const scopeLabel = flow.inScope ? 'in' : 'out';
  const rowClasses = [flow.id === state.selectedFlowId ? 'selected' : '', flow.error ? 'error-row' : ''].filter(Boolean).join(' ');
  return `
    <tr data-flow-id="${escapeHtml(flow.id)}" ${echoAttr} class="${rowClasses}">
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
}

function virtualWindow(container, virtual, totalItems, rowHeight) {
  const viewportHeight = Math.max(container?.clientHeight || 0, rowHeight * 8);
  const maxScrollTop = Math.max(0, totalItems * rowHeight - viewportHeight);
  const scrollTop = Math.min(Math.max(container?.scrollTop || virtual.scrollTop || 0, 0), maxScrollTop);
  virtual.scrollTop = scrollTop;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - VIRTUAL_BUFFER_ROWS);
  const count = Math.ceil(viewportHeight / rowHeight) + VIRTUAL_BUFFER_ROWS * 2;
  const end = Math.min(totalItems, start + count);
  return {
    start,
    end,
    top: start * rowHeight,
    bottom: Math.max(0, (totalItems - end) * rowHeight),
    total: totalItems * rowHeight,
  };
}

function renderVirtualList(content, totalHeight, offsetTop, windowClass = 'virtual-list-window') {
  return `
    <div class="virtual-list" style="height:${totalHeight}px">
      <div class="${windowClass}" style="transform:translateY(${offsetTop}px)">
        ${content}
      </div>
    </div>
  `;
}

function resetSiteMapVirtualScroll() {
  state.virtual.siteHosts.scrollTop = 0;
  resetSitePathVirtualScroll();
  if (el.siteHostsList) {
    el.siteHostsList.scrollTop = 0;
  }
}

function resetSitePathVirtualScroll() {
  state.virtual.sitePaths.scrollTop = 0;
  if (el.sitePathsList) {
    el.sitePathsList.scrollTop = 0;
  }
}

function resetTrafficVirtualScroll() {
  state.virtual.traffic.scrollTop = 0;
  if (el.trafficTableWrap) {
    el.trafficTableWrap.scrollTop = 0;
  }
}

function renderTrafficFilterControls() {
  const traffic = trafficHistory();
  const methods = uniqueSorted(traffic.map((flow) => flow.method).filter(Boolean));
  const hosts = uniqueSorted(traffic.map((flow) => flow.host).filter(Boolean));
  state.trafficFilters.method = state.trafficFilters.method.filter((method) => methods.includes(method));
  state.trafficFilters.host = state.trafficFilters.host.filter((host) => hosts.includes(host));
  renderTrafficPresetSelect();
  if (document.activeElement !== el.trafficExtensionInclude) {
    el.trafficExtensionInclude.value = state.trafficExtensionFilter.include;
  }
  if (document.activeElement !== el.trafficExtensionExclude) {
    el.trafficExtensionExclude.value = state.trafficExtensionFilter.exclude;
  }
  el.deleteTrafficPresetBtn.disabled = !selectedCustomTrafficPreset();
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
  renderTrafficAdvancedState();
}

function updateTrafficExtensionFilter(key, value) {
  state.trafficExtensionFilter = {
    ...state.trafficExtensionFilter,
    [key]: value,
  };
  state.selectedTrafficPreset = '';
  resetTrafficVirtualScroll();
  renderTraffic();
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
      <input id="trafficInScopeOnly" type="checkbox" ${state.trafficInScopeOnly ? 'checked' : ''} />
      <span>In scope</span>
    </label>
  `;
}

function renderTrafficPresetSelect() {
  const current = state.selectedTrafficPreset;
  el.trafficPresetSelect.innerHTML = `
    <option value="">Custom filters</option>
    <optgroup label="Built-in">
      ${BUILTIN_TRAFFIC_PRESETS.map((preset) => `<option value="builtin:${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</option>`).join('')}
    </optgroup>
    ${
      state.trafficPresets.length
        ? `<optgroup label="Saved">${state.trafficPresets
            .map((preset) => `<option value="custom:${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</option>`)
            .join('')}</optgroup>`
        : ''
    }
  `;
  el.trafficPresetSelect.value = current;
  if (el.trafficPresetSelect.value !== current) {
    state.selectedTrafficPreset = '';
  }
}

function applyTrafficPreset(value) {
  const preset = trafficPresetBySelectValue(value);
  if (!preset) {
    state.selectedTrafficPreset = '';
    return;
  }

  state.selectedTrafficPreset = value;
  applyTrafficFilterSnapshot(preset.filter);
  resetTrafficVirtualScroll();
  renderTraffic();
}

function trafficPresetBySelectValue(value) {
  if (!value) return null;
  if (value.startsWith('builtin:')) {
    return BUILTIN_TRAFFIC_PRESETS.find((preset) => preset.id === value.slice(8)) || null;
  }
  if (value.startsWith('custom:')) {
    return state.trafficPresets.find((preset) => preset.id === value.slice(7)) || null;
  }
  return null;
}

function saveCurrentTrafficPreset() {
  const name = window.prompt('Preset name', selectedCustomTrafficPreset()?.name || 'Traffic preset');
  if (!name || !name.trim()) return;

  const existing = selectedCustomTrafficPreset();
  const preset = {
    id: existing?.id || `preset-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: name.trim().slice(0, 80),
    filter: currentTrafficFilterSnapshot(),
  };

  state.trafficPresets = existing
    ? state.trafficPresets.map((item) => (item.id === existing.id ? preset : item))
    : [...state.trafficPresets, preset];
  state.selectedTrafficPreset = `custom:${preset.id}`;
  persistTrafficPresets().catch(console.error);
  renderTraffic();
}

function deleteSelectedTrafficPreset() {
  const preset = selectedCustomTrafficPreset();
  if (!preset) return;
  state.trafficPresets = state.trafficPresets.filter((item) => item.id !== preset.id);
  state.selectedTrafficPreset = '';
  persistTrafficPresets().catch(console.error);
  renderTraffic();
}

function selectedCustomTrafficPreset() {
  if (!state.selectedTrafficPreset.startsWith('custom:')) return null;
  const id = state.selectedTrafficPreset.slice(7);
  return state.trafficPresets.find((preset) => preset.id === id) || null;
}

function currentTrafficFilterSnapshot() {
  return {
    search: state.trafficSearch,
    inScopeOnly: state.trafficInScopeOnly,
    filters: {
      method: [...state.trafficFilters.method],
      status: [...state.trafficFilters.status],
      host: [...state.trafficFilters.host],
    },
    extension: {
      include: state.trafficExtensionFilter.include,
      exclude: state.trafficExtensionFilter.exclude,
    },
  };
}

function applyTrafficFilterSnapshot(snapshot) {
  const next = normalizeTrafficFilterSnapshot(snapshot);
  state.trafficSearch = next.search;
  state.trafficInScopeOnly = next.inScopeOnly;
  state.trafficFilters = next.filters;
  state.trafficExtensionFilter = next.extension;
  el.trafficSearch.value = state.trafficSearch;
  el.trafficExtensionInclude.value = state.trafficExtensionFilter.include;
  el.trafficExtensionExclude.value = state.trafficExtensionFilter.exclude;
}

function normalizeTrafficFilterSnapshot(snapshot) {
  const raw = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const filters = raw.filters && typeof raw.filters === 'object' ? raw.filters : {};
  const extension = raw.extension && typeof raw.extension === 'object' ? raw.extension : {};
  const normalizedExtension = normalizeTrafficExtensionFilter(extension);
  return {
    search: String(raw.search || '').slice(0, 400),
    inScopeOnly: raw.inScopeOnly === true,
    filters: {
      method: Array.isArray(filters.method) ? filters.method.map(String).filter(Boolean) : [],
      status: Array.isArray(filters.status) ? filters.status.map(String).filter(Boolean) : [],
      host: Array.isArray(filters.host) ? filters.host.map(String).filter(Boolean) : [],
    },
    extension: normalizedExtension,
  };
}

function normalizeTrafficExtensionFilter(extension) {
  const legacyMode = String(extension.mode || '');
  const legacyValue = String(extension.value || '');
  return {
    include: String(extension.include ?? (legacyMode === 'include' ? legacyValue : '')).slice(0, 400),
    exclude: String(extension.exclude ?? (legacyMode === 'exclude' ? legacyValue : '')).slice(0, 400),
  };
}

function sanitizeTrafficPresets(presets) {
  return Array.isArray(presets)
    ? presets
        .map((preset) => ({
          id: String(preset.id || '').replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 120),
          name: String(preset.name || '').slice(0, 80),
          filter: normalizeTrafficFilterSnapshot(preset.filter),
        }))
        .filter((preset) => preset.id && preset.name)
    : [];
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
  state.trafficExtensionFilter = { include: '', exclude: '' };
  state.selectedTrafficPreset = '';
  state.openTrafficFilter = '';
  state.trafficAdvancedOpen = false;
  el.trafficSearch.value = '';
  el.trafficExtensionInclude.value = '';
  el.trafficExtensionExclude.value = '';
  resetTrafficVirtualScroll();
  renderTraffic();
}

function handleTrafficCheckboxFilterChange(event) {
  const scopeInput = event.target.closest('#trafficInScopeOnly');
  if (scopeInput) {
    state.trafficInScopeOnly = scopeInput.checked;
    state.selectedTrafficPreset = '';
    resetTrafficVirtualScroll();
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
  state.selectedTrafficPreset = '';
  resetTrafficVirtualScroll();
  renderTraffic();
}

function closeTrafficFiltersOnOutside(event) {
  const insideMultiFilter = event.target.closest('.multi-filter');
  const insideAdvancedFilters = event.target.closest('#trafficAdvancedFilters, #trafficAdvancedFilterBtn');
  if (!insideMultiFilter) {
    state.openTrafficFilter = '';
    document.querySelectorAll('.multi-filter[open]').forEach((details) => {
      details.open = false;
    });
  }

  if (!insideAdvancedFilters && state.trafficAdvancedOpen) {
    state.trafficAdvancedOpen = false;
    renderTrafficAdvancedState();
  }
}

function renderTrafficAdvancedState() {
  el.trafficAdvancedFilters.classList.toggle('hidden', !state.trafficAdvancedOpen);
  el.trafficAdvancedFilterBtn.classList.toggle('active', state.trafficAdvancedOpen);
  el.trafficAdvancedFilterBtn.setAttribute('aria-expanded', state.trafficAdvancedOpen ? 'true' : 'false');
  const activeCount = advancedTrafficFilterCount();
  el.trafficAdvancedFilterBadge.textContent = String(activeCount);
  el.trafficAdvancedFilterBadge.classList.toggle('hidden', activeCount === 0);
}

function advancedTrafficFilterCount() {
  let count = 0;
  if (state.selectedTrafficPreset) count += 1;
  if (state.trafficFilters.host.length > 0) count += 1;
  if (state.trafficExtensionFilter.include.trim()) count += 1;
  if (state.trafficExtensionFilter.exclude.trim()) count += 1;
  return count;
}

function closeEchoGroupListOnOutside(event) {
  if (!state.selectedEchoGroupId) return;
  if (event.target.closest('.echo-group-list, .echo-group-tab')) return;
  state.selectedEchoGroupId = null;
  schedulePersistEchoState({ dirty: false });
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

async function loadFindings() {
  state.findings = await api('/api/findings');
  renderFindings();
  renderMeta();
}

function scheduleFindingsLoad() {
  clearTimeout(findingsLoadTimer);
  findingsLoadTimer = setTimeout(() => {
    loadFindings().catch(console.error);
  }, 180);
}

async function refreshHistoryAndSiteMap() {
  const [history, siteMap, findings, sentTraffic, payloadAttacks] = await Promise.all([
    api('/api/history'),
    api('/api/site-map'),
    api('/api/findings'),
    api('/api/sent-traffic'),
    api('/api/payload-attacks'),
  ]);
  state.history = history;
  state.siteMap = siteMap;
  state.findings = findings;
  state.sentTraffic = sentTraffic;
  state.payloadAttacks = payloadAttacks;
}

function renderSiteMap() {
  const hosts = filteredSiteMapHosts();
  const previousHost = state.selectedSiteHost;
  if (!hosts.some((host) => host.host === state.selectedSiteHost)) {
    state.selectedSiteHost = hosts[0]?.host || null;
  }
  if (previousHost !== state.selectedSiteHost) {
    resetSitePathVirtualScroll();
  }

  el.siteMapInScopeOnly.checked = state.siteMapInScopeOnly;
  el.siteMapCount.textContent = `${hosts.length} ${hosts.length === 1 ? 'host' : 'hosts'}`;
  state.visibleSiteHosts = hosts;
  renderVirtualSiteHosts(hosts);

  const selectedHost = hosts.find((host) => host.host === state.selectedSiteHost);
  renderSitePaths(selectedHost);
}

function renderVirtualSiteHosts(hosts) {
  if (hosts.length === 0) {
    el.siteHostsList.innerHTML = '<div class="empty-state">No hosts captured</div>';
    return;
  }

  const window = virtualWindow(el.siteHostsList, state.virtual.siteHosts, hosts.length, SITE_HOST_ROW_HEIGHT);
  el.siteHostsList.innerHTML = renderVirtualList(
    hosts.slice(window.start, window.end).map(renderSiteHostItem).join(''),
    window.total,
    window.top,
  );
}

function renderSiteHostItem(host) {
  const flowIds = siteHostFlowIds(host);
  return `
    <button class="site-host-item ${host.host === state.selectedSiteHost ? 'active' : ''}" type="button" data-site-context="host" data-site-host="${escapeHtml(host.host)}" data-site-scheme="${escapeHtml(host.scheme || 'http')}" data-flow-count="${escapeHtml(String(flowIds.length))}">
      <span class="site-main-line">
        <span class="site-host-name" title="${escapeHtml(host.host)}">${escapeHtml(host.host)}</span>
        <span class="scope-chip ${host.inScope ? 'in-scope' : 'out-scope'}">${host.inScope ? 'in' : 'out'}</span>
      </span>
      <span class="site-meta-line">
        <span>${escapeHtml(String(host.requestCount))} reqs</span>
        <span>${escapeHtml((host.methods || []).join(', ') || '-')}</span>
        <span>${escapeHtml((host.statuses || []).join(', ') || '-')}</span>
      </span>
    </button>
  `;
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
  el.sitePathsSubtitle.textContent = `${paths.length} ${paths.length === 1 ? 'path' : 'paths'} · ${host.requestCount} reqs`;
  if (paths.length === 0) {
    state.visibleSitePathItems = [];
    el.sitePathsList.innerHTML = '<div class="empty-state">No paths match this filter</div>';
    return;
  }

  state.visibleSitePathItems = flattenSiteTree(buildSiteTree(paths), host);
  renderVirtualSitePathItems(state.visibleSitePathItems);
}

function renderVirtualSitePathItems(items) {
  if (items.length === 0) {
    el.sitePathsList.innerHTML = '<div class="empty-state">No paths match this filter</div>';
    return;
  }

  const window = virtualWindow(el.sitePathsList, state.virtual.sitePaths, items.length, SITE_TREE_ROW_HEIGHT);
  el.sitePathsList.innerHTML = renderVirtualList(
    items.slice(window.start, window.end).map(renderSiteTreeItem).join(''),
    window.total,
    window.top,
    'site-tree virtual-list-window',
  );
}

function scheduleGlobalSearch() {
  clearTimeout(globalSearchTimer);
  const query = state.globalSearchQuery.trim();
  if (!query) {
    state.globalSearchResults = [];
    state.globalSearchLoading = false;
    state.globalSearchError = '';
    renderGlobalSearch();
    return;
  }
  if (query.length < 2) {
    renderGlobalSearch();
    return;
  }
  globalSearchTimer = setTimeout(() => {
    runGlobalSearch().catch(console.error);
  }, GLOBAL_SEARCH_DELAY_MS);
}

async function runGlobalSearch() {
  clearTimeout(globalSearchTimer);
  const query = state.globalSearchQuery.trim();
  if (!query) {
    clearGlobalSearch();
    return;
  }

  state.globalSearchLoading = true;
  state.globalSearchError = '';
  renderGlobalSearch();
  try {
    const result = await api(`/api/search?q=${encodeURIComponent(query)}&limit=200`);
    if (query !== state.globalSearchQuery.trim()) {
      return;
    }
    state.globalSearchResults = Array.isArray(result.results) ? result.results : [];
  } catch (error) {
    state.globalSearchResults = [];
    state.globalSearchError = `Search failed: ${formatError(error)}`;
    return;
  } finally {
    state.globalSearchLoading = false;
    renderGlobalSearch();
  }
}

function clearGlobalSearch() {
  clearTimeout(globalSearchTimer);
  state.globalSearchQuery = '';
  state.globalSearchResults = [];
  state.globalSearchLoading = false;
  state.globalSearchError = '';
  el.globalSearchInput.value = '';
  renderGlobalSearch();
}

function renderGlobalSearch() {
  if (!el.globalSearchResults || !el.globalSearchStatus) return;
  if (el.globalSearchInput.value !== state.globalSearchQuery) {
    el.globalSearchInput.value = state.globalSearchQuery;
  }

  const query = state.globalSearchQuery.trim();
  if (!query) {
    el.globalSearchStatus.textContent = 'Search across requests, responses, headers, bodies, and metadata';
    el.globalSearchResults.innerHTML = '<div class="empty-state">Enter a query to search captured requests</div>';
    return;
  }
  if (query.length < 2) {
    el.globalSearchStatus.textContent = 'Type at least 2 characters';
    el.globalSearchResults.innerHTML = '<div class="empty-state">Query is too short</div>';
    return;
  }
  if (state.globalSearchError) {
    el.globalSearchStatus.textContent = state.globalSearchError;
    el.globalSearchResults.innerHTML = '<div class="empty-state">Search failed</div>';
    return;
  }
  if (state.globalSearchLoading) {
    el.globalSearchStatus.textContent = 'Searching...';
  } else {
    const count = state.globalSearchResults.length;
    el.globalSearchStatus.textContent = `${count} ${count === 1 ? 'request' : 'requests'} found`;
  }

  el.globalSearchResults.innerHTML = state.globalSearchResults.length
    ? state.globalSearchResults.map((result) => renderGlobalSearchResult(result, query)).join('')
    : `<div class="empty-state">${state.globalSearchLoading ? 'Searching...' : 'No matching requests'}</div>`;
}

function renderGlobalSearchResult(result, query) {
  const request = result.request || {};
  const status = request.error ? 'ERR' : request.statusCode || '-';
  const url = request.url || '';
  const path = safeUrl(url)?.pathname || request.path || url || '/';
  return `
    <article class="global-search-result">
      <button class="global-search-result-main" type="button" data-search-request-id="${escapeHtml(request.id || '')}">
        <span class="flow-id-cell">#${escapeHtml(request.id || '')}</span>
        <span class="method-pill">${escapeHtml(request.method || '-')}</span>
        <span class="global-search-host" title="${escapeHtml(request.host || '')}">${escapeHtml(request.host || '')}</span>
        <span class="global-search-path" title="${escapeHtml(url)}">${escapeHtml(path)}</span>
        <span class="status-pill ${request.error ? 'error' : ''}">${escapeHtml(String(status))}</span>
      </button>
      <div class="global-search-matches">
        ${(result.matches || []).map((match) => renderGlobalSearchMatch(match, query)).join('')}
      </div>
    </article>
  `;
}

function renderGlobalSearchMatch(match, query) {
  return `
    <div class="global-search-match">
      <span class="global-search-match-label">${escapeHtml(match.area || 'Match')} · ${escapeHtml(match.label || '')}</span>
      <code>${highlightSearchText(match.preview || '', query)}</code>
    </div>
  `;
}

function highlightSearchText(text, query) {
  const terms = String(query || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map(escapeRegExp);
  if (terms.length === 0) return escapeHtml(text);
  const pattern = new RegExp(`(${terms.join('|')})`, 'ig');
  return escapeHtml(text).replace(pattern, '<mark>$1</mark>');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderFindings() {
  if (!el.findingsList) return;
  const findings = filteredFindings();
  el.findingsSeverityFilter.value = state.findingsSeverity;
  el.findingsSubtitle.textContent = `${findings.length} shown of ${state.findings.length} passive findings`;
  el.findingsList.innerHTML =
    findings
      .map(
        (finding) => `
          <article class="finding-card finding-${escapeHtml(finding.severity)}">
            <div class="finding-main">
              <span class="severity-pill severity-${escapeHtml(finding.severity)}">${escapeHtml(finding.severity)}</span>
              <div>
                <h3>${escapeHtml(finding.title)}</h3>
                <p>${escapeHtml(finding.description)}</p>
              </div>
            </div>
            <div class="finding-meta">
              <span title="${escapeHtml(finding.host || '')}">${escapeHtml(finding.host || '-')}</span>
              <span title="${escapeHtml(finding.path || '')}">${escapeHtml(finding.path || '/')}</span>
              <span>${escapeHtml(String(finding.count || 1))} hits</span>
              <span>${escapeHtml(timeAgo(finding.lastSeenAt || Date.now()))}</span>
            </div>
            <div class="finding-evidence">
              ${(finding.evidence || []).map((item) => `<code>${escapeHtml(item)}</code>`).join('')}
            </div>
            <div class="finding-actions">
              ${(finding.flowIds || [])
                .slice(0, 5)
                .map((flowId) => `<button class="button ghost compact-button" type="button" data-finding-flow-id="${escapeHtml(flowId)}">#${escapeHtml(flowId)}</button>`)
                .join('')}
            </div>
          </article>
        `,
      )
      .join('') || '<div class="empty-state">No findings match current filters</div>';

  el.findingsList.querySelectorAll('[data-finding-flow-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      await loadFlow(button.dataset.findingFlowId);
      setView('traffic');
    });
  });
}

function filteredFindings() {
  const query = state.findingsSearch;
  return state.findings.filter((finding) => {
    if (state.findingsSeverity && finding.severity !== state.findingsSeverity) return false;
    if (!query) return true;
    const haystack = [
      finding.severity,
      finding.title,
      finding.description,
      finding.host,
      finding.path,
      finding.url,
      ...(finding.evidence || []),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

function renderSentTraffic() {
  if (!el.sentTrafficRows) return;
  const records = Array.isArray(state.sentTraffic) ? state.sentTraffic : [];
  el.sentTrafficSubtitle.textContent = `${records.length} ${records.length === 1 ? 'request' : 'requests'} sent by MCP`;
  el.clearSentTrafficBtn.disabled = records.length === 0;
  el.sentTrafficRows.innerHTML =
    records
      .map((record) => {
        const status = record.error ? 'ERR' : record.statusCode || '-';
        const rowClass = [record.id === state.selectedSentTrafficId ? 'selected' : '', record.error ? 'error-row' : ''].filter(Boolean).join(' ');
        const size = `${formatBytes(record.requestSize || 0)} / ${formatBytes(record.responseSize || 0)}`;
        return `
          <tr class="${rowClass}" data-sent-traffic-id="${escapeHtml(record.id)}">
            <td title="${escapeHtml(record.id)}">${escapeHtml(shortSentId(record.id))}</td>
            <td>${escapeHtml(record.sourceId ? `#${record.sourceId}` : '-')}</td>
            <td title="${escapeHtml(record.tool || '')}">${escapeHtml(shortToolName(record.tool || 'mcp'))}</td>
            <td><span class="method-pill small">${escapeHtml(record.method || '-')}</span></td>
            <td title="${escapeHtml(record.host || '')}">${escapeHtml(record.host || '-')}</td>
            <td><span class="status-pill ${record.error ? 'error' : ''}">${escapeHtml(String(status))}</span></td>
            <td>${escapeHtml(size)}</td>
            <td>${escapeHtml(record.durationMs == null ? '-' : `${record.durationMs}ms`)}</td>
          </tr>
        `;
      })
      .join('') || '<tr><td colspan="8"><div class="empty-state compact-empty">No MCP-sent traffic yet</div></td></tr>';

  renderSentTrafficDetail();
}

async function loadSentTraffic(id) {
  state.selectedSentTrafficId = id;
  state.selectedSentTraffic = await api(`/api/sent-traffic/${encodeURIComponent(id)}`);
  renderSentTraffic();
}

function renderSentTrafficDetail() {
  if (!el.sentTrafficDetail) return;
  const record = state.selectedSentTraffic;
  if (!record) {
    el.emptySentTrafficDetail.classList.remove('hidden');
    el.sentTrafficDetail.classList.add('hidden');
    return;
  }

  el.emptySentTrafficDetail.classList.add('hidden');
  el.sentTrafficDetail.classList.remove('hidden');
  el.sentTrafficMethod.textContent = record.request?.method || '-';
  el.sentTrafficUrl.textContent = record.request?.url || '';
  el.sentTrafficStatus.textContent = record.error ? 'ERR' : record.response ? `${record.response.statusCode} ${record.response.statusMessage || ''}`.trim() : '-';
  el.sentTrafficStatus.classList.toggle('error', Boolean(record.error));
  setHighlightedHttp(el.sentTrafficRequestRaw, buildRawRequest(record));
  setHighlightedHttp(el.sentTrafficResponseRaw, record.response ? buildRawResponse(record) : `MCP request failed\r\n\r\n${record.error || 'No response'}`);
  el.sentTrafficMeta.textContent = JSON.stringify(
    {
      id: record.id,
      sourceId: record.sourceId,
      tool: record.tool,
      startedAt: record.startedAt ? new Date(record.startedAt).toISOString() : null,
      completedAt: record.completedAt ? new Date(record.completedAt).toISOString() : null,
      durationMs: record.durationMs,
      error: record.error,
      notes: record.notes || [],
    },
    null,
    2,
  );
}

async function clearSentTraffic() {
  if (!state.sentTraffic.length) return;
  if (!window.confirm('Clear MCP-sent traffic log? Captured traffic and Echo tabs will stay intact.')) {
    return;
  }
  state.sentTraffic = await api('/api/sent-traffic', { method: 'DELETE' });
  state.selectedSentTrafficId = null;
  state.selectedSentTraffic = null;
  renderSentTraffic();
  markProjectDirty();
}

function shortSentId(id) {
  const text = String(id || '');
  const match = text.match(/^sent-([^-]+)-([^-]+)-/);
  return match ? `#${match[1]} ${match[2]}` : text.slice(0, 18);
}

function shortToolName(tool) {
  return String(tool || 'mcp').replace(/^send_/, '').replace(/_proxy_item|_item/g, '').replace(/_/g, ' ');
}

function renderPayloadAttacks() {
  if (!el.payloadAttackRows) return;
  const records = Array.isArray(state.payloadAttacks) ? state.payloadAttacks : [];
  el.payloadAttacksSubtitle.textContent = `${records.length} ${records.length === 1 ? 'run' : 'runs'}`;
  el.clearPayloadAttacksBtn.disabled = records.length === 0;
  el.payloadAttackRows.innerHTML =
    records
      .map((record) => {
        const rowClass = record.id === state.selectedPayloadAttackId ? 'selected' : '';
        const payloads = `${record.executed || 0}/${record.requestedPayloads || 0}`;
        const interesting = `${record.interesting || 0}${record.errors ? `, ${record.errors} err` : ''}`;
        return `
          <tr class="${rowClass}" data-payload-attack-id="${escapeHtml(record.id)}">
            <td title="${escapeHtml(record.id)}">${escapeHtml(shortAttackId(record.id))}</td>
            <td>${escapeHtml(record.sourceId ? `#${record.sourceId}` : '-')}</td>
            <td><span class="method-pill small">${escapeHtml(record.method || '-')}</span></td>
            <td title="${escapeHtml(record.host || '')}">${escapeHtml(record.host || '-')}</td>
            <td>${escapeHtml(payloads)}</td>
            <td><span class="status-pill ${record.errors ? 'error' : ''}">${escapeHtml(interesting)}</span></td>
            <td>${escapeHtml(record.durationMs == null ? '-' : `${record.durationMs}ms`)}</td>
          </tr>
        `;
      })
      .join('') || '<tr><td colspan="7"><div class="empty-state compact-empty">No payload attack runs yet</div></td></tr>';

  renderPayloadAttackDetail();
}

async function loadPayloadAttack(id) {
  state.selectedPayloadAttackId = id;
  state.selectedPayloadAttack = await api(`/api/payload-attacks/${encodeURIComponent(id)}`);
  renderPayloadAttacks();
}

function renderPayloadAttackDetail() {
  if (!el.payloadAttackDetail) return;
  const record = state.selectedPayloadAttack;
  if (!record) {
    el.emptyPayloadAttackDetail.classList.remove('hidden');
    el.payloadAttackDetail.classList.add('hidden');
    return;
  }

  const results = Array.isArray(record.results) ? record.results : [];
  el.emptyPayloadAttackDetail.classList.add('hidden');
  el.payloadAttackDetail.classList.remove('hidden');
  el.payloadAttackMethod.textContent = record.method || '-';
  el.payloadAttackUrl.textContent = record.url || '';
  el.payloadAttackStatus.textContent = `${record.interesting || 0} interesting`;
  el.payloadAttackStatus.classList.toggle('error', Boolean(record.errors));
  el.payloadAttackSummary.textContent = payloadAttackSummaryText(record);
  el.payloadAttackResultRows.innerHTML =
    results
      .map((result) => {
        const signals = [
          result.interesting ? 'interesting' : '',
          result.statusChanged ? 'status' : '',
          result.payloadReflected ? 'reflected' : '',
          result.securitySignal ? 'security' : '',
          result.error ? 'error' : '',
        ].filter(Boolean);
        return `
          <tr class="${result.error ? 'error-row' : ''}">
            <td>${escapeHtml(String(result.index ?? '-'))}</td>
            <td title="${escapeHtml(result.payloadPreview || '')}"><code>${escapeHtml(result.payloadPreview || '-')}</code></td>
            <td><span class="status-pill ${result.error ? 'error' : ''}">${escapeHtml(result.error ? 'ERR' : String(result.statusCode || '-'))}</span></td>
            <td>${escapeHtml(result.responseBytesDelta == null ? '-' : signedNumber(result.responseBytesDelta))}</td>
            <td>${signals.map((signal) => `<span class="mini-chip">${escapeHtml(signal)}</span>`).join('') || '-'}</td>
            <td>${
              result.sentTrafficId
                ? `<button class="button ghost compact-button" type="button" data-sent-traffic-id-link="${escapeHtml(result.sentTrafficId)}">${escapeHtml(shortSentId(result.sentTrafficId))}</button>`
                : '-'
            }</td>
          </tr>
        `;
      })
      .join('') || '<tr><td colspan="6"><div class="empty-state compact-empty">No payload results</div></td></tr>';
  el.payloadAttackMeta.textContent = JSON.stringify(
    {
      id: record.id,
      sourceId: record.sourceId,
      insertionPoint: record.insertionPoint || {},
      startedAt: record.startedAt ? new Date(record.startedAt).toISOString() : null,
      completedAt: record.completedAt ? new Date(record.completedAt).toISOString() : null,
      statusCodes: record.statusCodes || {},
      secretAliasesUsed: record.secretAliasesUsed || [],
      detailsTruncated: record.detailsTruncated === true,
      details: record.details || [],
    },
    null,
    2,
  );
}

async function clearPayloadAttacks() {
  if (!state.payloadAttacks.length) return;
  if (!window.confirm('Clear payload attack run history? Sent traffic will stay intact.')) {
    return;
  }
  state.payloadAttacks = await api('/api/payload-attacks', { method: 'DELETE' });
  state.selectedPayloadAttackId = null;
  state.selectedPayloadAttack = null;
  renderPayloadAttacks();
  markProjectDirty();
}

function payloadAttackSummaryText(record) {
  return [
    `Attack ID: ${record.id || '-'}`,
    `Source: ${record.sourceId ? `#${record.sourceId}` : '-'}`,
    `Target: ${record.method || '-'} ${record.url || '-'}`,
    `Insertion: ${insertionPointLabel(record.insertionPoint)}`,
    `Payloads: ${record.executed || 0}/${record.requestedPayloads || 0}`,
    `Sent: ${record.sent || 0}`,
    `Errors: ${record.errors || 0}`,
    `Interesting: ${record.interesting || 0}`,
    `Reflected: ${record.reflectedCount || 0}`,
    `Security signals: ${record.securitySignalCount || 0}`,
    `Delay: ${record.delayMillis || 0}ms`,
    `Duration: ${record.durationMs == null ? '-' : `${record.durationMs}ms`}`,
    `Status codes: ${statusCodesLabel(record.statusCodes)}`,
    `Secrets: ${(record.secretAliasesUsed || []).join(', ') || '-'}`,
  ].join('\n');
}

function insertionPointLabel(point) {
  if (!point || typeof point !== 'object') return '-';
  const parts = [point.type, point.name, point.marker ? `marker ${point.marker}` : '', point.hasTemplate ? 'template' : ''].filter(Boolean);
  return parts.join(' / ') || '-';
}

function statusCodesLabel(statusCodes) {
  const entries = Object.entries(statusCodes || {});
  return entries.length ? entries.map(([code, count]) => `${code}:${count}`).join(', ') : '-';
}

function signedNumber(value) {
  const number = Number(value || 0);
  return number > 0 ? `+${number}` : String(number);
}

function shortAttackId(id) {
  const text = String(id || '');
  const match = text.match(/^attack-([^-]+)-/);
  return match ? `#${match[1]}` : text.slice(0, 18);
}

function renderMcpLog() {
  if (!el.mcpLogRows) return;
  const records = Array.isArray(state.mcpExchanges) ? state.mcpExchanges : [];
  el.mcpLogSubtitle.textContent = `${records.length} ${records.length === 1 ? 'exchange' : 'exchanges'}`;
  el.clearMcpLogBtn.disabled = records.length === 0;
  el.mcpLogRows.innerHTML =
    records
      .map((record) => {
        const rowClass = [record.id === state.selectedMcpExchangeId ? 'selected' : '', record.error ? 'error-row' : ''].filter(Boolean).join(' ');
        const size = `${formatBytes(record.requestBytes || 0)} / ${formatBytes(record.responseBytes || 0)}`;
        const tool = record.tool ? shortToolName(record.tool) : '-';
        return `
          <tr class="${rowClass}" data-mcp-exchange-id="${escapeHtml(record.id)}">
            <td title="${escapeHtml(record.id)}">${escapeHtml(shortMcpExchangeId(record.id))}</td>
            <td title="${escapeHtml(record.rpcMethod || '')}">${escapeHtml(record.rpcMethod || '-')}</td>
            <td title="${escapeHtml(record.tool || '')}">${escapeHtml(tool)}</td>
            <td><span class="status-pill ${record.error ? 'error' : ''}">${escapeHtml(String(record.status || '-'))}</span></td>
            <td>${escapeHtml(size)}</td>
            <td>${escapeHtml(record.durationMs == null ? '-' : `${record.durationMs}ms`)}</td>
          </tr>
        `;
      })
      .join('') || '<tr><td colspan="6"><div class="empty-state compact-empty">No MCP exchanges yet</div></td></tr>';

  renderMcpLogDetail();
}

async function loadMcpExchange(id) {
  state.selectedMcpExchangeId = id;
  state.selectedMcpExchange = await api(`/api/mcp/exchanges/${encodeURIComponent(id)}`);
  renderMcpLog();
}

function renderMcpLogDetail() {
  if (!el.mcpLogDetail) return;
  const record = state.selectedMcpExchange;
  if (!record) {
    el.emptyMcpLogDetail.classList.remove('hidden');
    el.mcpLogDetail.classList.add('hidden');
    return;
  }

  el.emptyMcpLogDetail.classList.add('hidden');
  el.mcpLogDetail.classList.remove('hidden');
  el.mcpLogMethod.textContent = record.rpcMethod || '-';
  el.mcpLogTool.textContent = record.tool || 'MCP exchange';
  el.mcpLogStatus.textContent = record.error ? 'ERR' : String(record.status || '-');
  el.mcpLogStatus.classList.toggle('error', Boolean(record.error));
  setHighlightedJson(el.mcpLogRequestRaw, record.request);
  setHighlightedJson(el.mcpLogResponseRaw, record.response || { accepted: true });
  el.mcpLogMeta.textContent = JSON.stringify(
    {
      id: record.id,
      jsonRpcId: record.jsonRpcId,
      rpcMethod: record.rpcMethod,
      tool: record.tool,
      startedAt: record.startedAt ? new Date(record.startedAt).toISOString() : null,
      completedAt: record.completedAt ? new Date(record.completedAt).toISOString() : null,
      durationMs: record.durationMs,
      status: record.status,
      error: record.error,
    },
    null,
    2,
  );
}

async function clearMcpLog() {
  if (!state.mcpExchanges.length) return;
  if (!window.confirm('Clear local MCP exchange log? Captured traffic, Sent, Echo, and findings will stay intact.')) {
    return;
  }
  state.mcpExchanges = await api('/api/mcp/exchanges', { method: 'DELETE' });
  state.selectedMcpExchangeId = null;
  state.selectedMcpExchange = null;
  renderMcpLog();
  markProjectDirty();
}

function shortMcpExchangeId(id) {
  const text = String(id || '');
  const match = text.match(/^mcp-(\d+)-/);
  if (!match) {
    return text.slice(0, 18);
  }
  return new Date(Number(match[1])).toLocaleTimeString([], { hour12: false });
}

function setHighlightedJson(target, value) {
  const text = JSON.stringify(value == null ? null : value, null, 2);
  target.dataset.rawText = text;
  target.innerHTML = renderLineNumberedHighlighted(highlightJson(text));
}

function renderSecrets() {
  if (!el.secretRows) return;
  const secrets = Array.isArray(state.mcpSecrets) ? state.mcpSecrets : [];
  el.secretsSubtitle.textContent = `${secrets.length} ${secrets.length === 1 ? 'alias' : 'aliases'} available to MCP`;
  el.secretRows.innerHTML =
    secrets
      .map(
        (secret) => `
          <tr data-secret-id="${escapeHtml(secret.id)}">
            <td>
              <input type="checkbox" data-secret-toggle="${escapeHtml(secret.id)}" ${secret.enabled !== false ? 'checked' : ''} aria-label="Secret enabled" />
            </td>
            <td title="${escapeHtml(secret.name || '')}">${escapeHtml(secret.name || '-')}</td>
            <td title="${escapeHtml(secret.description || '')}">${escapeHtml(secret.description || '-')}</td>
            <td title="${escapeHtml(secret.alias || '')}"><code>${escapeHtml(secret.alias || '')}</code></td>
            <td>${escapeHtml(secret.lastUsedAt ? timeAgo(secret.lastUsedAt) : '-')}</td>
            <td>
              <div class="button-row secret-actions">
                <button class="button ghost compact-button" type="button" data-secret-copy="${escapeHtml(secret.id)}">Copy</button>
                <button class="button ghost compact-button" type="button" data-secret-regenerate="${escapeHtml(secret.id)}">Regenerate</button>
                <button class="button danger compact-button" type="button" data-secret-delete="${escapeHtml(secret.id)}">Delete</button>
              </div>
            </td>
          </tr>
        `,
      )
      .join('') || '<tr><td colspan="6"><div class="empty-state compact-empty">No local MCP secrets yet</div></td></tr>';
}

async function loadSecrets() {
  state.mcpSecrets = await api('/api/mcp/secrets');
  renderSecrets();
}

async function addSecret() {
  const name = el.secretName.value.trim();
  const value = el.secretValue.value;
  const description = el.secretDescription.value.trim();
  if (!value) {
    el.secretStatus.textContent = 'Secret value is required.';
    return;
  }
  try {
    await api('/api/mcp/secrets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, value, description }),
    });
    el.secretName.value = '';
    el.secretValue.value = '';
    el.secretDescription.value = '';
    el.secretStatus.textContent = 'Secret added. Use its alias in MCP active tools.';
    await loadSecrets();
  } catch (error) {
    el.secretStatus.textContent = `Could not add secret: ${formatError(error)}`;
  }
}

async function handleSecretRowClick(event) {
  const copyButton = event.target.closest('[data-secret-copy]');
  if (copyButton) {
    const secret = state.mcpSecrets.find((item) => item.id === copyButton.dataset.secretCopy);
    if (secret?.alias) {
      await navigator.clipboard.writeText(secret.alias).catch(() => fallbackCopyText(secret.alias));
      el.secretStatus.textContent = 'Alias copied.';
    }
    return;
  }

  const regenerateButton = event.target.closest('[data-secret-regenerate]');
  if (regenerateButton) {
    await updateSecret(regenerateButton.dataset.secretRegenerate, { regenerateAlias: true });
    el.secretStatus.textContent = 'Alias regenerated.';
    return;
  }

  const deleteButton = event.target.closest('[data-secret-delete]');
  if (deleteButton) {
    if (!window.confirm('Delete this local secret alias?')) return;
    await api(`/api/mcp/secrets/${encodeURIComponent(deleteButton.dataset.secretDelete)}`, { method: 'DELETE' });
    el.secretStatus.textContent = 'Secret deleted.';
    await loadSecrets();
  }
}

async function handleSecretRowChange(event) {
  const checkbox = event.target.closest('[data-secret-toggle]');
  if (!checkbox) return;
  await updateSecret(checkbox.dataset.secretToggle, { enabled: checkbox.checked });
  el.secretStatus.textContent = checkbox.checked ? 'Secret enabled.' : 'Secret disabled.';
}

async function updateSecret(id, patch) {
  await api(`/api/mcp/secrets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  await loadSecrets();
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

function renderSiteTreeLeaf(path, depth = 0, host = null) {
  const latestFlowId = path.flowIds?.[0] || '';
  const echoAttr = latestFlowId && path.path !== '(CONNECT tunnel)' ? `data-echo-flow-id="${escapeHtml(latestFlowId)}"` : '';
  const leafName = path.path === '(CONNECT tunnel)' ? path.path : siteLeafName(path.path);
  const hostAttr = host?.host ? `data-site-host="${escapeHtml(host.host)}" data-site-scheme="${escapeHtml(host.scheme || 'http')}"` : '';
  return `
    <button class="site-tree-row site-tree-leaf site-path-item" type="button" data-site-context="leaf" ${hostAttr} data-site-path="${escapeHtml(path.path)}" data-flow-id="${escapeHtml(latestFlowId)}" ${echoAttr} style="--site-depth:${depth}">
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

function siteTreeNodeMeta(node) {
  const methods = new Set();
  const statuses = new Set();
  const flowIds = [];
  let endpointCount = 0;
  let hitCount = 0;
  let inScope = false;

  for (const path of node.leaves) {
    endpointCount += 1;
    hitCount += Number(path.count || 0);
    inScope = inScope || Boolean(path.inScope);
    (path.methods || []).forEach((method) => methods.add(method));
    (path.statuses || []).forEach((status) => statuses.add(status));
    flowIds.push(...(path.flowIds || []));
  }

  for (const child of node.children.values()) {
    const childMeta = siteTreeNodeMeta(child);
    endpointCount += childMeta.endpointCount;
    hitCount += childMeta.hitCount;
    inScope = inScope || childMeta.inScope;
    childMeta.methods.forEach((method) => methods.add(method));
    childMeta.statuses.forEach((status) => statuses.add(status));
    flowIds.push(...childMeta.flowIds);
  }

  return {
    endpointCount,
    hitCount,
    inScope,
    methods: [...methods].sort(),
    statuses: sortStatusValues([...statuses]),
    flowIds: uniqueFlowIds(flowIds),
  };
}

function flattenSiteTree(root, host) {
  const items = [];
  const hostName = host?.host || String(host || '');
  const hostScheme = host?.scheme || 'http';

  const walk = (node, depth, parts) => {
    const children = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      const childParts = [...parts, child.name];
      const id = `${hostName}:${childParts.join('/')}`;
      const collapsed = state.siteCollapsedNodes.has(id);
      const meta = siteTreeNodeMeta(child);
      items.push({
        id,
        type: 'folder',
        host: hostName,
        scheme: hostScheme,
        name: child.name,
        pathPrefix: `/${childParts.join('/')}`,
        depth,
        count: meta.endpointCount,
        hitCount: meta.hitCount,
        inScope: meta.inScope,
        methods: meta.methods,
        statuses: meta.statuses,
        flowIds: meta.flowIds,
        collapsed,
      });
      if (!collapsed) {
        walk(child, depth + 1, childParts);
      }
    }

    for (const path of node.leaves) {
      items.push({
        id: `${hostName}:${path.path}`,
        type: 'leaf',
        host: hostName,
        scheme: hostScheme,
        path,
        depth,
      });
    }
  };

  walk(root, 0, []);
  return items;
}

function renderSiteTreeItem(item) {
  if (item.type === 'folder') {
    return `
      <button class="site-tree-row site-tree-folder-row" type="button" data-site-context="folder" data-site-node-id="${escapeHtml(item.id)}" data-site-host="${escapeHtml(item.host)}" data-site-scheme="${escapeHtml(item.scheme)}" data-site-path-prefix="${escapeHtml(item.pathPrefix)}" style="--site-depth:${item.depth}">
        <span class="site-main-line">
          <span class="site-folder-title">
            <span class="site-tree-folder ${item.collapsed ? '' : 'open'}">▸</span>
            <span class="site-tree-name" title="${escapeHtml(item.pathPrefix)}">${escapeHtml(item.name)}</span>
          </span>
          <span class="site-tree-count">${escapeHtml(String(item.count))} endpoints</span>
        </span>
        <span class="site-meta-line">
          <span>${escapeHtml((item.methods || []).join(', ') || '-')}</span>
          <span>${escapeHtml((item.statuses || []).join(', ') || '-')}</span>
          <span>${escapeHtml(String(item.hitCount || 0))} hits</span>
        </span>
      </button>
    `;
  }

  return renderSiteTreeLeaf(item.path, item.depth, { host: item.host, scheme: item.scheme });
}

function toggleSiteTreeNode(id) {
  if (state.siteCollapsedNodes.has(id)) {
    state.siteCollapsedNodes.delete(id);
  } else {
    state.siteCollapsedNodes.add(id);
  }

  const selectedHost = state.visibleSiteHosts.find((host) => host.host === state.selectedSiteHost);
  renderSitePaths(selectedHost);
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

function siteHostByName(hostName) {
  return (state.siteMap.hosts || []).find((host) => host.host === hostName) || null;
}

function siteHostFlowIds(host) {
  return uniqueFlowIds((host?.paths || []).flatMap((path) => path.flowIds || []));
}

function uniqueFlowIds(flowIds) {
  return [...new Set((flowIds || []).map((id) => String(id)).filter(Boolean))];
}

function sortStatusValues(values) {
  return [...values].sort((a, b) => statusSortRank(a) - statusSortRank(b) || String(a).localeCompare(String(b)));
}

function statusSortRank(value) {
  const text = String(value || '');
  if (/^\d+$/.test(text)) return Number(text);
  if (text === 'ERR') return 900;
  if (text === 'TUN') return 901;
  if (text === '-') return 999;
  return 950;
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
      schedulePersistEchoState({ dirty: false });
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
      schedulePersistEchoState({ dirty: false });
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
      schedulePersistEchoState({ dirty: false });
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
  schedulePersistEchoState();
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
  schedulePersistEchoState();
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
  schedulePersistEchoState();
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
  schedulePersistEchoState();
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
  schedulePersistEchoState();
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
  schedulePersistEchoState();
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
    schedulePersistEchoState({ dirty: false });
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
  schedulePersistEchoState();
  setView('echo');
  renderEcho();
}

async function sendFlowToEcho(flowId) {
  const flow = state.selectedFlow?.id === flowId ? state.selectedFlow : await api(`/api/history/${encodeURIComponent(flowId)}`);
  const tab = createEchoTab(flow.request, `${flow.request.method} ${requestTarget(flow.request.url)}`, `From req #${flow.id}`);
  state.echoTabs.unshift(tab);
  state.selectedEchoTabId = tab.id;
  schedulePersistEchoState();
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

function serializeEchoState() {
  return {
    tabs: state.echoTabs.map((tab) => ({
      id: tab.id,
      title: tab.title || '',
      customTitle: Boolean(tab.customTitle),
      groupId: tab.groupId || '',
      source: tab.source || '',
      method: tab.method || 'GET',
      rawRequest: tab.rawRequest || '',
      response: tab.response || null,
      loading: false,
      error: tab.loading ? null : tab.error || null,
      durationMs: tab.durationMs ?? null,
      color: tab.color || '',
    })),
    groups: state.echoGroups.map((group) => ({
      id: group.id,
      title: group.title || 'Group',
      color: group.color || '',
    })),
    selectedTabId: state.selectedEchoTabId,
    selectedGroupId: state.selectedEchoGroupId,
    split: state.echoSplit,
  };
}

function schedulePersistEchoState(options = {}) {
  if (!state.echoPersistenceReady) {
    return;
  }

  if (options.dirty !== false) {
    markProjectDirty();
  }
  clearTimeout(echoPersistTimer);
  echoPersistTimer = setTimeout(() => {
    echoPersistTimer = null;
    persistEchoState().catch(console.error);
  }, 300);
}

async function persistEchoState() {
  await api('/api/ui-state', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      echo: serializeEchoState(),
    }),
  });
}

function flushEchoState() {
  if (!state.echoPersistenceReady) {
    return;
  }

  clearTimeout(echoPersistTimer);
  echoPersistTimer = null;
  const payload = JSON.stringify({ echo: serializeEchoState() });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/ui-state', new Blob([payload], { type: 'application/json' }));
    return;
  }
  fetch('/api/ui-state', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(console.error);
}

async function persistTrafficPresets() {
  state.trafficPersistenceReady = true;
  markProjectDirty();
  await api('/api/ui-state', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      traffic: serializeTrafficUiState(),
    }),
  });
}

function serializeTrafficUiState() {
  return {
    presets: state.trafficPresets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      filter: preset.filter,
    })),
  };
}

function flushTrafficPresets() {
  if (!state.trafficPersistenceReady) {
    return;
  }

  const payload = JSON.stringify({ traffic: serializeTrafficUiState() });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/ui-state', new Blob([payload], { type: 'application/json' }));
    return;
  }
  fetch('/api/ui-state', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(console.error);
}

function syncSelectedEchoRequest() {
  const tab = selectedEchoTab();
  if (!tab || el.echoWorkspace.classList.contains('hidden')) {
    return;
  }

  const previousRaw = tab.rawRequest || '';
  const previousMethod = tab.method || '';
  const previousTitle = tab.title || '';
  tab.rawRequest = el.echoRawRequest.value;
  const parsed = parseRawRequestMeta(tab.rawRequest);
  tab.method = parsed.method || 'GET';
  if (!tab.customTitle) {
    tab.title = `${tab.method} ${parsed.target || '/'}`;
    el.echoTabName.value = tab.title;
  }
  renderEchoRawRequest();
  if (tab.rawRequest !== previousRaw || tab.method !== previousMethod || tab.title !== previousTitle) {
    schedulePersistEchoState();
  }
}

function syncSelectedEchoMeta() {
  const tab = selectedEchoTab();
  if (!tab || el.echoWorkspace.classList.contains('hidden')) {
    return;
  }

  const nextTitle = el.echoTabName.value.trim();
  tab.title = nextTitle || `${tab.method || 'GET'} ${parseRawRequestMeta(tab.rawRequest).target || '/'}`;
  tab.customTitle = Boolean(nextTitle);
  schedulePersistEchoState();
  renderEcho();
}

function closeEchoTab(tabId) {
  state.echoTabs = state.echoTabs.filter((tab) => tab.id !== tabId);
  if (state.selectedEchoTabId === tabId) {
    state.selectedEchoTabId = state.echoTabs[0]?.id || null;
  }
  schedulePersistEchoState();
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
  schedulePersistEchoState();
  renderEcho();
}

function openEchoContextMenu(event) {
  const siteSource = event.target.closest('[data-site-context]');
  const flowSource = event.target.closest('[data-flow-id], [data-echo-flow-id]');
  const target = siteSource ? siteContextTarget(siteSource) : flowContextTarget(flowSource);
  if (!target) {
    closeContextMenu();
    return;
  }

  event.preventDefault();
  state.contextTarget = target;
  state.contextFlowId = target.flowId || target.flowIds?.[0] || null;
  state.echoContextFlowId = target.echoFlowId || null;
  el.sendToEchoContextBtn.disabled = !target.echoFlowId;
  el.showFlowsContextBtn.disabled = !target.flowIds?.length;
  el.showFlowsContextBtn.classList.toggle('hidden', !target.flowIds?.length);
  const inConfiguredScope = Boolean(state.config?.scope?.enabled && target.inScope);
  el.addToScopeContextBtn.classList.toggle('hidden', inConfiguredScope);
  el.removeFromScopeContextBtn.classList.toggle('hidden', !inConfiguredScope);
  el.contextMenu.style.left = '0px';
  el.contextMenu.style.top = '0px';
  el.contextMenu.classList.remove('hidden');
  const rect = el.contextMenu.getBoundingClientRect();
  el.contextMenu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - rect.width - 8))}px`;
  el.contextMenu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - rect.height - 8))}px`;
}

function flowContextTarget(source) {
  const flowId = source?.dataset.flowId || source?.dataset.echoFlowId || '';
  if (!flowId) return null;

  const flow = flowSummaryById(flowId);
  const scopeUrl = flow ? scopeUrlWithoutQuery(flow) : '';
  return {
    kind: 'flow',
    flowId,
    flowIds: [flowId],
    echoFlowId: source.dataset.echoFlowId || (flow?.type === 'http' ? flowId : null),
    inScope: Boolean(flow?.inScope),
    scopeRule: scopeUrl ? { field: 'url', operator: 'equals', value: scopeUrl } : null,
  };
}

function siteContextTarget(source) {
  const kind = source.dataset.siteContext;
  const hostName = source.dataset.siteHost || state.selectedSiteHost || '';
  const host = siteHostByName(hostName);
  const scheme = source.dataset.siteScheme || host?.scheme || 'http';

  if (kind === 'host') {
    const flowIds = siteHostFlowIds(host);
    return {
      kind,
      flowIds,
      echoFlowId: firstEchoableFlowId(flowIds),
      inScope: Boolean(host?.inScope),
      scopeRule: hostName ? { field: 'host', operator: 'equals', value: hostName } : null,
    };
  }

  if (kind === 'folder') {
    const item = state.visibleSitePathItems.find((candidate) => candidate.id === source.dataset.siteNodeId);
    const pathPrefix = item?.pathPrefix || source.dataset.sitePathPrefix || '/';
    const flowIds = uniqueFlowIds(item?.flowIds || []);
    return {
      kind,
      flowIds,
      echoFlowId: firstEchoableFlowId(flowIds),
      inScope: Boolean(item?.inScope),
      scopeRule: siteFolderScopeRule(hostName, scheme, pathPrefix),
    };
  }

  if (kind === 'leaf') {
    const pathValue = source.dataset.sitePath || '';
    const path = (host?.paths || []).find((candidate) => candidate.path === pathValue);
    const flowIds = uniqueFlowIds(path?.flowIds || [source.dataset.flowId]);
    return {
      kind,
      flowId: source.dataset.flowId || flowIds[0] || null,
      flowIds,
      echoFlowId: firstEchoableFlowId(flowIds),
      inScope: Boolean(path?.inScope),
      scopeRule: siteLeafScopeRule(hostName, scheme, path),
    };
  }

  return null;
}

function closeContextMenu() {
  state.contextFlowId = null;
  state.echoContextFlowId = null;
  state.contextTarget = null;
  el.contextMenu.classList.add('hidden');
}

function flowSummaryById(flowId) {
  if (state.selectedFlow?.id === flowId) {
    return state.selectedFlow;
  }
  return state.history.find((flow) => flow.id === flowId) || null;
}

async function applyScopeFromContext(action) {
  const target = state.contextTarget;
  const flowId = state.contextFlowId;
  closeContextMenu();
  let scopeRule = target?.scopeRule || null;
  if (!scopeRule && flowId) {
    const flow = flowSummaryById(flowId) || (await api(`/api/history/${encodeURIComponent(flowId)}`));
    const scopeUrl = scopeUrlWithoutQuery(flow);
    if (scopeUrl) {
      scopeRule = { field: 'url', operator: 'equals', value: scopeUrl };
    }
  }
  if (!scopeRule?.value) {
    return;
  }

  const scope = state.config?.scope || { enabled: false, rules: [] };
  const rules = (scope.rules || []).filter(
    (rule) => !(rule.field === scopeRule.field && rule.operator === scopeRule.operator && rule.value === scopeRule.value),
  );
  rules.push({
    id: `scope-context-${Date.now()}`,
    enabled: true,
    action,
    field: scopeRule.field,
    operator: scopeRule.operator,
    value: scopeRule.value,
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

function siteFolderScopeRule(hostName, scheme, pathPrefix) {
  if (!hostName) return null;
  const normalizedPrefix = normalizeSitePathPrefix(pathPrefix);
  if (!normalizedPrefix || normalizedPrefix === '/') {
    return { field: 'host', operator: 'equals', value: hostName };
  }

  return {
    field: 'url',
    operator: 'regex',
    value: `^${escapeRegExp(siteOrigin(scheme, hostName))}${escapeRegExp(normalizedPrefix)}(?:/|$)`,
  };
}

function siteLeafScopeRule(hostName, scheme, path) {
  if (!hostName || !path) return null;
  if (path.path === '(CONNECT tunnel)') {
    return { field: 'host', operator: 'equals', value: hostName };
  }
  const fallbackUrl = `${siteOrigin(scheme, hostName)}${normalizeSitePathPrefix(path.path || '/')}`;
  const value = scopeUrlWithoutQuery({ url: path.lastUrl || fallbackUrl });
  return value ? { field: 'url', operator: 'equals', value } : null;
}

function siteOrigin(scheme, hostName) {
  return `${scheme || 'http'}://${hostName}`;
}

function normalizeSitePathPrefix(path) {
  const value = String(path || '/');
  return value.startsWith('/') ? value : `/${value}`;
}

function firstEchoableFlowId(flowIds) {
  return uniqueFlowIds(flowIds).find((flowId) => flowSummaryById(flowId)?.type === 'http') || null;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function showContextFlows() {
  const flowIds = uniqueFlowIds(state.contextTarget?.flowIds || (state.contextFlowId ? [state.contextFlowId] : []));
  closeContextMenu();
  if (flowIds.length === 0) return;

  state.trafficSearch = `req:${flowIds.join(',')}`;
  state.trafficFilters = {
    method: [],
    status: [],
    host: [],
  };
  state.trafficInScopeOnly = false;
  state.trafficExtensionFilter = { include: '', exclude: '' };
  state.selectedTrafficPreset = '';
  state.openTrafficFilter = '';
  el.trafficSearch.value = state.trafficSearch;
  el.trafficExtensionInclude.value = '';
  el.trafficExtensionExclude.value = '';
  resetTrafficVirtualScroll();
  setView('traffic');
  renderTraffic();
}

function filteredHistory() {
  return trafficHistory().filter((flow) => {
    if (state.trafficFilters.method.length > 0 && !state.trafficFilters.method.includes(flow.method)) return false;
    if (state.trafficFilters.host.length > 0 && !state.trafficFilters.host.includes(flow.host)) return false;
    if (state.trafficInScopeOnly && !flow.inScope) return false;
    if (!matchesExtensionFilter(flow)) return false;
    if (!matchesStatusFilters(flow)) return false;
    return matchesTrafficSearch(flow);
  }).sort(compareTrafficFlows);
}

function matchesTrafficSearch(flow) {
  if (!state.trafficSearch) return true;
  const flowSearchIds = flowSearchIdSet(state.trafficSearch);
  if (flowSearchIds) {
    return flowSearchIds.has(String(flow.id));
  }

  const haystack = `${flow.id} ${flow.method} ${flow.host} ${flow.url} ${flow.statusCode || ''} ${flow.inScope ? 'in scope' : 'out scope'}`.toLowerCase();
  const terms = state.trafficSearch
    .split(',')
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
  if (terms.length > 1) {
    return terms.some((term) => haystack.includes(term));
  }
  return haystack.includes(state.trafficSearch);
}

function flowSearchIdSet(query) {
  const text = String(query || '').trim().toLowerCase();
  if (!text.startsWith('req:') && !text.startsWith('flow:')) return null;
  const ids = text
    .slice(text.indexOf(':') + 1)
    .split(/[,\s]+/)
    .map((item) => item.replace(/^#/, '').trim())
    .filter(Boolean);
  return ids.length ? new Set(ids) : new Set();
}

function matchesExtensionFilter(flow) {
  const extension = flowExtension(flow);
  const included = parseExtensionFilter(state.trafficExtensionFilter.include);
  const excluded = parseExtensionFilter(state.trafficExtensionFilter.exclude);
  if (included.length > 0 && (!extension || !included.includes(extension))) return false;
  if (excluded.length > 0 && extension && excluded.includes(extension)) return false;
  return true;
}

function parseExtensionFilter(value) {
  return String(value || '')
    .split(/[,\s]+/)
    .map((item) => item.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
}

function flowExtension(flow) {
  const pathname = safeUrl(flow.url)?.pathname || flow.path || '';
  const filename = pathname.split('/').pop() || '';
  const match = filename.match(/\.([a-z0-9][a-z0-9_-]{0,24})$/i);
  return match ? match[1].toLowerCase() : '';
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
      protocol: flow.protocol || null,
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
    ['Protocol', protocolDisplay(request.protocol || protocolLabel(request.httpVersion))],
    ['ALPN', protocolDisplay(request.alpnProtocol || flow.protocol?.clientAlpn)],
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
    ['Protocol', protocolDisplay(response.protocol || protocolLabel(response.httpVersion))],
    ['ALPN', protocolDisplay(response.alpnProtocol || flow.protocol?.upstreamAlpn)],
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
  const version = response.httpVersion || '1.1';
  const statusLine = `HTTP/${version} ${response.statusCode || ''} ${response.statusMessage || ''}`.trim();
  return buildRawMessage(statusLine, response.headers, rawBodyText(response));
}

function buildRawMessage(startLine, headers, body) {
  const headerText = Object.entries(headers || {})
    .map(([name, value]) => `${name}: ${value}`)
    .join('\r\n');
  return `${startLine}\r\n${headerText}\r\n\r\n${body || ''}`;
}

function protocolLabel(httpVersion) {
  const version = String(httpVersion || '').trim();
  return version ? `HTTP/${version}` : '';
}

function protocolDisplay(value) {
  return value ? String(value) : '-';
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
    container.appendChild(bodyNote('No message body', 'This request has no message for this side yet.'));
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
  const rules = interceptRulesWithVisibleDraft();
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
  const rules = interceptRulesWithVisibleDraft().filter((rule) => rule.id !== id);
  patchConfig({ intercept: { rules } });
}

function saveInterceptRules() {
  const stage = state.rulesModalStage;
  const editedRules = readInterceptRuleRows(stage);
  const preservedRules = (state.config?.intercept?.rules || []).filter((rule) => rule.stage !== stage && rule.stage !== 'both');

  patchConfig({ intercept: { rules: [...preservedRules, ...editedRules] } }).then(closeRulesModal);
}

function interceptRulesWithVisibleDraft() {
  const allRules = state.config?.intercept?.rules || [];
  if (el.rulesModal.classList.contains('hidden')) {
    return [...allRules];
  }

  const stage = state.rulesModalStage;
  const editedRules = readInterceptRuleRows(stage);
  const preservedRules = allRules.filter((rule) => rule.stage !== stage && rule.stage !== 'both');
  return [...preservedRules, ...editedRules];
}

function readInterceptRuleRows(stage = state.rulesModalStage) {
  return [...el.rulesList.querySelectorAll('.rule-row')].map((row) => ({
    id: row.dataset.ruleId,
    enabled: row.querySelector('[data-rule-field="enabled"]').checked,
    stage,
    field: row.querySelector('[data-rule-field="field"]').value,
    operator: row.querySelector('[data-rule-field="operator"]').value,
    headerName: row.querySelector('[data-rule-field="headerName"]').value.trim(),
    value: row.querySelector('[data-rule-field="value"]').value,
  }));
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
  syncProxyDraftFromDom();
  const port = Number(el.proxyPort.value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    el.proxySaveStatus.textContent = 'Port must be between 1 and 65535.';
    return;
  }

  el.proxySaveStatus.textContent = 'Rebinding proxy listener...';
  try {
    await patchConfig({ proxyHost: state.config.proxyHost, proxyPort: port });
    el.proxySaveStatus.textContent = `Listening on ${state.config.proxyHost}:${state.config.proxyPort}.`;
  } catch (error) {
    el.proxySaveStatus.textContent = `Could not bind port: ${formatError(error)}`;
    renderConfig();
  }
}

async function saveMcpConfig() {
  const port = Number(el.mcpPort.value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    el.mcpStatus.textContent = 'MCP port must be between 0 and 65535.';
    return;
  }

  el.mcpStatus.textContent = 'Applying MCP settings...';
  try {
    await patchConfig({
      mcp: {
        ...(state.config.mcp || {}),
        enabled: el.mcpEnabledToggle.checked,
        host: '127.0.0.1',
        port,
        token: el.mcpToken.value.trim(),
        requireScope: el.mcpRequireScopeToggle.checked,
        activeTesting: el.mcpActiveTestingToggle.checked,
      },
    });
    const payload = await api('/api/state');
    applyState(payload, false, { renderConfig: true });
    renderMcpConfig();
    el.mcpStatus.textContent = state.mcp?.running
      ? `Running. Use Authorization: Bearer ${state.mcp.token}`
      : state.mcp?.lastError || 'MCP disabled.';
  } catch (error) {
    el.mcpStatus.textContent = `Could not apply MCP settings: ${formatError(error)}`;
    renderConfig();
  }
}

function applyAnonymizationProfileDraft() {
  const profile = el.anonymizationProfile.value;
  if (profile === 'custom') {
    return;
  }
  const defaults = anonymizationProfileDefaults(profile);
  el.anonymizationMaxBodyChars.value = defaults.maxBodyChars;
  el.anonymizationRedactHosts.checked = defaults.redactHosts;
  el.anonymizationCookieNames.checked = defaults.redactCookieNames;
  el.anonymizationCookieValues.checked = defaults.redactCookieValues;
  el.anonymizationAuthorization.checked = defaults.redactAuthorization;
  el.anonymizationPlatformHeaders.checked = defaults.redactPlatformHeaders;
  el.anonymizationAggressivePath.checked = defaults.aggressivePathRedaction;
}

function markAnonymizationCustom(event) {
  if (!event?.isTrusted || !el.anonymizationProfile) return;
  el.anonymizationProfile.value = 'custom';
}

async function saveAnonymizationConfig() {
  const maxBodyChars = Number(el.anonymizationMaxBodyChars.value);
  if (!Number.isInteger(maxBodyChars) || maxBodyChars < 4096 || maxBodyChars > 2 * 1024 * 1024) {
    el.anonymizationStatus.textContent = 'Max body chars must be between 4096 and 2097152.';
    return;
  }

  el.anonymizationStatus.textContent = 'Saving anonymization settings...';
  try {
    await patchConfig({
      mcp: {
        ...(state.config.mcp || {}),
        anonymization: {
          profile: el.anonymizationProfile.value,
          maxBodyChars,
          redactHosts: el.anonymizationRedactHosts.checked,
          redactCookieNames: el.anonymizationCookieNames.checked,
          redactCookieValues: el.anonymizationCookieValues.checked,
          redactAuthorization: el.anonymizationAuthorization.checked,
          redactPlatformHeaders: el.anonymizationPlatformHeaders.checked,
          aggressivePathRedaction: el.anonymizationAggressivePath.checked,
        },
      },
    });
    renderAnonymizationConfig();
    el.anonymizationStatus.textContent = 'Anonymization settings saved.';
  } catch (error) {
    el.anonymizationStatus.textContent = `Could not save anonymization settings: ${formatError(error)}`;
    renderConfig();
  }
}

async function saveProject(forceSaveAs = false, options = {}) {
  el.projectActionStatus.textContent = forceSaveAs ? 'Preparing Save As...' : 'Saving project...';
  let saved = false;

  try {
    await syncProjectUiState();
    const payload = await api('/api/project/export');
    const filename = projectSnapshotFilename(payload);

    if (window.veilDesktop?.saveProject) {
      const result = await (forceSaveAs || !state.desktopProject?.path
        ? window.veilDesktop.saveProjectAs(payload, filename)
        : window.veilDesktop.saveProject(payload, filename));
      if (result?.canceled) {
        el.projectActionStatus.textContent = 'Save cancelled.';
        return false;
      }
      state.desktopProject = { name: result.name, path: result.path };
      state.recentProjects = sanitizeRecentProjects(result.recentProjects || state.recentProjects);
      state.projectCheckpoints = sanitizeProjectCheckpoints(result.checkpoints || state.projectCheckpoints);
      setProjectDirty(false);
      await clearRecoveryDraft({ silent: true });
      renderRecentProjects();
      renderProjectCheckpoints();
      el.projectActionStatus.textContent = `Saved ${result.name}.`;
      saved = true;
      return true;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setProjectDirty(false);
    await clearRecoveryDraft({ silent: true });
    el.projectActionStatus.textContent = `Saved ${filename}.`;
    saved = true;
    return true;
  } catch (error) {
    el.projectActionStatus.textContent = `Save failed: ${formatError(error)}`;
    return false;
  } finally {
    if (options.closeAfter) {
      reportProjectCommandResult({ action: 'save', closeAfter: true, saved });
    }
  }
}

async function openDesktopProject() {
  if (!confirmDiscardProjectChanges('open another project')) {
    return false;
  }

  el.projectActionStatus.textContent = 'Opening project...';
  try {
    const result = await window.veilDesktop.openProject();
    if (result?.canceled) {
      el.projectActionStatus.textContent = 'Open cancelled.';
      return false;
    }
    state.recentProjects = sanitizeRecentProjects(result.recentProjects || state.recentProjects);
    state.projectCheckpoints = sanitizeProjectCheckpoints(result.checkpoints || state.projectCheckpoints);
    await importProjectPayload(result.data, result.name, { name: result.name, path: result.path });
    return true;
  } catch (error) {
    el.projectActionStatus.textContent = `Open failed: ${formatError(error)}`;
    return false;
  }
}

async function openRecentDesktopProject(filePath) {
  if (!filePath || !window.veilDesktop?.openRecentProject) {
    return false;
  }
  if (!confirmDiscardProjectChanges('open another project')) {
    return false;
  }

  el.projectActionStatus.textContent = `Opening ${basename(filePath)}...`;
  try {
    const result = await window.veilDesktop.openRecentProject(filePath);
    state.recentProjects = sanitizeRecentProjects(result.recentProjects || state.recentProjects);
    state.projectCheckpoints = sanitizeProjectCheckpoints(result.checkpoints || state.projectCheckpoints);
    await importProjectPayload(result.data, result.name, { name: result.name, path: result.path });
    return true;
  } catch (error) {
    el.projectActionStatus.textContent = `Open failed: ${formatError(error)}`;
    await loadRecentProjects();
    return false;
  }
}

async function importSelectedProject() {
  const file = el.importProjectInput.files?.[0];
  if (!file) return;
  if (!confirmDiscardProjectChanges('open another project')) {
    el.importProjectInput.value = '';
    return;
  }

  el.projectActionStatus.textContent = `Opening ${file.name}...`;
  try {
    const text = await file.text();
    await importProjectPayload(JSON.parse(text), file.name, null);
  } catch (error) {
    el.projectActionStatus.textContent = `Open failed: ${formatError(error)}`;
  } finally {
    el.importProjectInput.value = '';
  }
}

async function importProjectPayload(projectPayload, displayName, desktopProject, options = {}) {
  const payload = await api('/api/project/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(projectPayload || {}),
  });
  state.desktopProject = desktopProject;
  state.selectedFlowId = null;
  state.selectedFlow = null;
  applyState(payload, true);
  setProjectDirty(Boolean(options.dirty));
  if (!options.dirty && !options.keepRecoveryDraft) {
    await clearRecoveryDraft({ silent: true });
  }
  if (!options.skipCheckpointLoad) {
    await loadProjectCheckpoints();
  }
  renderRecentProjects();
  renderProjectCheckpoints();
  await Promise.all([loadSiteMap(), loadFindings()]);
  el.projectActionStatus.textContent = `Opened ${displayName || 'project'}.`;
}

async function newProject() {
  if (!confirmDiscardProjectChanges('create a new empty project')) {
    return;
  }

  el.projectActionStatus.textContent = 'Creating empty project...';
  try {
    const payload = await api('/api/project/new', { method: 'POST' });
    state.desktopProject = null;
    state.selectedFlowId = null;
    state.selectedFlow = null;
    if (window.veilDesktop?.forgetProject) {
      await window.veilDesktop.forgetProject();
    }
    applyState(payload, true);
    setProjectDirty(false);
    await clearRecoveryDraft({ silent: true });
    state.projectCheckpoints = [];
    renderRecentProjects();
    renderProjectCheckpoints();
    await Promise.all([loadSiteMap(), loadFindings()]);
    el.projectActionStatus.textContent = 'New empty project ready.';
  } catch (error) {
    el.projectActionStatus.textContent = `New project failed: ${formatError(error)}`;
  }
}

async function syncProjectUiState() {
  syncSelectedEchoRequest();
  await api('/api/ui-state', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      echo: serializeEchoState(),
      traffic: serializeTrafficUiState(),
    }),
  });
}

function projectSnapshotFilename(payload) {
  const base = state.desktopProject?.name || payload?.project?.name || 'veil-project';
  return `${String(base).replace(/\.veil\.json$/i, '').replace(/\.json$/i, '').replace(/[^a-z0-9._-]/gi, '-')}.veil.json`;
}

async function clearHistory() {
  if (!window.confirm('Clear all captured traffic from this project? Echo tabs and config will stay intact.')) {
    return;
  }

  el.projectActionStatus.textContent = 'Clearing captured traffic...';
  try {
    const payload = await api('/api/history', { method: 'DELETE' });
    state.selectedFlowId = null;
    state.selectedFlow = null;
    applyState(payload, false);
    markProjectDirty();
    await Promise.all([loadSiteMap(), loadFindings()]);
    el.projectActionStatus.textContent = 'Captured traffic cleared.';
  } catch (error) {
    el.projectActionStatus.textContent = `Clear failed: ${formatError(error)}`;
  }
}

async function clearRecentProjects() {
  if (!window.veilDesktop?.clearRecentProjects) {
    return;
  }

  try {
    state.recentProjects = sanitizeRecentProjects(await window.veilDesktop.clearRecentProjects());
    renderRecentProjects();
    el.projectActionStatus.textContent = 'Recent projects cleared.';
  } catch (error) {
    el.projectActionStatus.textContent = `Could not clear recent projects: ${formatError(error)}`;
  }
}

async function clearProjectCheckpoints() {
  if (!window.veilDesktop?.clearProjectCheckpoints) {
    return;
  }
  const project = currentProjectDisplay();
  if (!project.path) {
    el.projectActionStatus.textContent = 'Save the project before using checkpoints.';
    return;
  }
  const targetLabel = project.path ? basename(project.path) : 'all projects';
  if (!window.confirm(`Clear checkpoints for ${targetLabel}?`)) {
    return;
  }

  try {
    state.projectCheckpoints = sanitizeProjectCheckpoints(await window.veilDesktop.clearProjectCheckpoints(project));
    renderProjectCheckpoints();
    el.projectActionStatus.textContent = 'Project checkpoints cleared.';
  } catch (error) {
    el.projectActionStatus.textContent = `Could not clear checkpoints: ${formatError(error)}`;
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
      .map((rule) => {
        const preset = scopeRulePreset(rule);
        return `
          <div class="rule-row scope-rule-row scope-rule-${escapeHtml(action)} ${preset === 'custom' ? 'scope-custom-rule' : ''}" data-scope-rule-id="${escapeHtml(rule.id)}" data-scope-action="${escapeHtml(action)}">
            <div class="rule-row-top">
              <label class="rule-enabled">
                <input type="checkbox" data-scope-field="enabled" ${rule.enabled === false ? '' : 'checked'} />
                <span>Enabled</span>
              </label>
              <div class="scope-rule-actions">
                <span class="scope-match-count" data-scope-match-count>0 matches</span>
                <button class="button ghost compact-button" type="button" data-delete-scope-rule="${escapeHtml(rule.id)}">Delete</button>
              </div>
            </div>
            <div class="rule-grid">
              <label>
                Type
                <select data-scope-field="preset">
                  ${scopePresetOptions(preset)}
                </select>
              </label>
              <label class="scope-advanced-field">
                Field
                <select data-scope-field="field">
                  ${ruleOption('url', 'URL', rule.field)}
                  ${ruleOption('host', 'Host', rule.field)}
                  ${ruleOption('path', 'Path', rule.field)}
                  ${ruleOption('method', 'Method', rule.field)}
                </select>
              </label>
              <label class="scope-advanced-operator">
                Operator
                <select data-scope-field="operator">
                  ${ruleOption('contains', 'Contains', rule.operator)}
                  ${ruleOption('equals', 'Equals', rule.operator)}
                  ${ruleOption('startsWith', 'Starts with', rule.operator)}
                  ${ruleOption('endsWith', 'Ends with', rule.operator)}
                  ${ruleOption('regex', 'Regex', rule.operator)}
                  ${ruleOption('exists', 'Exists', rule.operator)}
                  ${ruleOption('domain', 'Domain', rule.operator)}
                  ${ruleOption('domainSubdomains', 'Domain + subdomains', rule.operator)}
                </select>
              </label>
              <label class="rule-value">
                Value
                <input data-scope-field="value" type="text" value="${escapeHtml(rule.value || '')}" placeholder="${escapeHtml(scopeValuePlaceholder(rule.field, preset))}" />
              </label>
            </div>
          </div>
        `;
      })
      .join('') || `<div class="message-empty">No ${label} rules configured.</div>`;
  container.querySelectorAll('.rule-row').forEach(updateScopeRuleRow);
}

function updateScopeRuleRow(row) {
  if (!row) {
    return;
  }

  const preset = row.querySelector('[data-scope-field="preset"]')?.value || 'custom';
  const field = row.querySelector('[data-scope-field="field"]').value;
  const valueInput = row.querySelector('[data-scope-field="value"]');
  row.classList.toggle('scope-custom-rule', preset === 'custom');
  valueInput.placeholder = scopeValuePlaceholder(field, preset);
  updateScopeRuleMatchCount(row);
}

function scopePresetOptions(current) {
  return Object.entries(SCOPE_PRESETS)
    .map(([value, preset]) => ruleOption(value, preset.label, current))
    .join('');
}

function scopeRulePreset(rule) {
  if (rule.field === 'host' && rule.operator === 'domain') return 'domain';
  if (rule.field === 'host' && rule.operator === 'domainSubdomains') return 'domain-subdomains';
  if (rule.field === 'url' && rule.operator === 'equals') return 'exact-url';
  if (rule.field === 'path' && rule.operator === 'startsWith') return 'path-prefix';
  if (rule.field === 'url' && rule.operator === 'regex') return 'regex';
  return 'custom';
}

function setScopePreset(row, preset) {
  const presetSelect = row?.querySelector('[data-scope-field="preset"]');
  if (presetSelect) {
    presetSelect.value = preset;
  }
}

function applyScopePreset(row, preset) {
  if (!row) return;
  const config = SCOPE_PRESETS[preset] || SCOPE_PRESETS.custom;
  const fieldSelect = row.querySelector('[data-scope-field="field"]');
  const operatorSelect = row.querySelector('[data-scope-field="operator"]');
  const valueInput = row.querySelector('[data-scope-field="value"]');

  if (preset !== 'custom') {
    fieldSelect.value = config.field;
    operatorSelect.value = config.operator;
    valueInput.value = normalizeScopeValueForPreset(valueInput.value, preset);
  }

  updateScopeRuleRow(row);
}

function normalizeScopeValueForPreset(value, preset) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (preset === 'domain' || preset === 'domain-subdomains') return normalizeScopeDomain(text);
  if (preset === 'exact-url') return stripUrlQuery(text);
  if (preset === 'path-prefix') return normalizeScopePath(text);
  return text;
}

function scopeValuePlaceholder(field, preset = 'custom') {
  if (preset === 'domain') return 'example.com';
  if (preset === 'domain-subdomains') return 'example.com';
  if (preset === 'exact-url') return 'https://example.com/api/items';
  if (preset === 'path-prefix') return '/api/';
  if (preset === 'regex') return '/api/(users|admin)';
  if (field === 'url') return 'https://target.test/api, /admin';
  if (field === 'host') return '';
  if (field === 'path') return '/rest, /login, /assets';
  if (field === 'method') return 'GET, POST, PUT';
  return 'Value to match';
}

function updateScopeMatchCounts() {
  document.querySelectorAll('.scope-rule-row').forEach(updateScopeRuleMatchCount);
}

function updateScopeRuleMatchCount(row) {
  const badge = row?.querySelector('[data-scope-match-count]');
  if (!badge) return;
  const rule = readScopeRuleRow(row);
  if (!rule.enabled) {
    badge.textContent = 'disabled';
    return;
  }
  const count = trafficHistory().filter((flow) => scopeRuleMatchesFlow(rule, flow)).length;
  badge.textContent = `${count} ${count === 1 ? 'match' : 'matches'}`;
}

function addScopeRule(action) {
  syncScopeDraftFromDom();
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
  syncScopeDraftFromDom();
  const scope = state.config.scope || { enabled: false, rules: [] };
  state.config.scope = {
    ...scope,
    rules: (scope.rules || []).filter((rule) => rule.id !== id),
  };
  renderScopeRules();
}

async function saveScopeConfig() {
  syncScopeDraftFromDom();
  const scope = state.config.scope || { enabled: false, rules: [] };

  el.scopeStatus.textContent = 'Applying scope...';
  try {
    await patchConfig({
      scope: {
        enabled: scope.enabled,
        rules: scope.rules || [],
      },
    });
  } catch (error) {
    el.scopeStatus.textContent = `Scope update failed: ${formatError(error)}`;
    renderConfig();
  }
}

function syncScopeDraftFromDom() {
  if (!state.config || !el.includeScopeRulesList || !el.excludeScopeRulesList) {
    return;
  }

  const scope = state.config.scope || { enabled: false, rules: [] };
  state.config.scope = {
    ...scope,
    enabled: el.scopeEnabledToggle.checked,
    rules: [
      ...readScopeRuleRows(el.includeScopeRulesList, 'include'),
      ...readScopeRuleRows(el.excludeScopeRulesList, 'exclude'),
    ],
  };
}

function readScopeRuleRows(container, action) {
  return [...container.querySelectorAll('.rule-row')].map((row) => readScopeRuleRow(row, action));
}

function readScopeRuleRow(row, action = row?.dataset.scopeAction || 'include') {
  return {
    id: row.dataset.scopeRuleId,
    enabled: row.querySelector('[data-scope-field="enabled"]').checked,
    action,
    field: row.querySelector('[data-scope-field="field"]').value,
    operator: row.querySelector('[data-scope-field="operator"]').value,
    value: row.querySelector('[data-scope-field="value"]').value,
  };
}

function scopeRuleMatchesFlow(rule, flow) {
  if (!flow || flow.type === 'connect' || flow.method === 'CONNECT') return false;
  let candidate = '';
  if (rule.field === 'url') candidate = scopeComparableUrl(flow.url);
  if (rule.field === 'host') candidate = flow.host || safeUrl(flow.url)?.host || '';
  if (rule.field === 'path') candidate = flow.path || safeUrl(flow.url)?.pathname || '';
  if (rule.field === 'method') candidate = flow.method || '';
  return matchesScopeCandidate(candidate, rule.operator, rule.value);
}

function matchesScopeCandidate(candidate, operator, value) {
  const haystackRaw = String(candidate || '');
  if (operator === 'exists') return haystackRaw.length > 0;

  const needleRaw = String(value || '');
  if (!needleRaw) return false;

  if (operator === 'domain' || operator === 'domainSubdomains') {
    const host = normalizeScopeDomain(haystackRaw);
    const domain = normalizeScopeDomain(needleRaw);
    return Boolean(host && domain && (host === domain || (operator === 'domainSubdomains' && host.endsWith(`.${domain}`))));
  }

  if (operator === 'regex') {
    try {
      return new RegExp(needleRaw, 'i').test(haystackRaw);
    } catch {
      return false;
    }
  }

  const haystack = haystackRaw.toLowerCase();
  const needle = needleRaw.toLowerCase();
  if (operator === 'equals') return haystack === needle;
  if (operator === 'startsWith') return haystack.startsWith(needle);
  if (operator === 'endsWith') return haystack.endsWith(needle);
  return haystack.includes(needle);
}

function scopeComparableUrl(url) {
  const parsed = safeUrl(url);
  return parsed ? `${parsed.origin}${parsed.pathname || '/'}` : String(url || '').split(/[?#]/, 1)[0];
}

function stripUrlQuery(value) {
  const parsed = safeUrl(value);
  return parsed ? `${parsed.origin}${parsed.pathname || '/'}` : String(value || '').split(/[?#]/, 1)[0];
}

function normalizeScopePath(value) {
  const parsed = safeUrl(value);
  const path = parsed ? parsed.pathname || '/' : String(value || '').trim().split(/[?#]/, 1)[0];
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function normalizeScopeDomain(value) {
  const text = String(value || '')
    .trim()
    .replace(/^\*\./, '')
    .split(/[/?#]/, 1)[0];
  if (!text) return '';
  const parsed = safeUrl(text.includes('://') ? text : `http://${text}`);
  if (parsed) return parsed.hostname.toLowerCase();
  return text.replace(/:\d+$/, '').toLowerCase();
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
  renderAll({ config: true });
  markProjectDirty();
}

function setView(view) {
  const viewTitles = {
    traffic: 'Traffic',
    search: 'Search',
    siteMap: 'Site Map',
    findings: 'Findings',
    sentTraffic: 'Sent Traffic',
    mcpLog: 'MCP Log',
    payloadAttacks: 'Payload Attacks',
    secrets: 'Secrets',
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

function downloadFilename(contentDisposition) {
  const match = String(contentDisposition || '').match(/filename="?([^";]+)"?/i);
  return match ? match[1] : '';
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
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
