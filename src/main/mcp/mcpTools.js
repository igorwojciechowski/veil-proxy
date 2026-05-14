const { normalizeHeaderObject } = require('../httpMessage');

const MAX_ATTACK_PAYLOADS = 100;
const MAX_ATTACK_DETAILS = 20;
const SECURITY_SIGNAL =
  /\b(?:SQLITE_ERROR|SQL\s+syntax|syntax\s+error|ORA-\d{4,5}|ODBC|JDBC|PostgreSQL|MySQL|MariaDB|SQLite|SQL\s+Server|MongoError|SequelizeDatabaseError|PDOException|XPathException|SAXParseException|TemplateSyntaxError|Traceback|stack\s+trace|Exception|Command\s+failed|Permission\s+denied)\b|<script\b|javascript:|onerror\s*=|onload\s*=|alert\s*\(/i;

class McpTools {
  constructor({ proxy, anonymizer, aliasVault, secretVault, configProvider }) {
    this.proxy = proxy;
    this.anonymizer = anonymizer;
    this.aliasVault = aliasVault;
    this.secretVault = secretVault;
    this.configProvider = configProvider;
    this.sentTraffic = [];
    this.uiStateAccess = null;
  }

  setUiStateAccess(access = {}) {
    this.uiStateAccess = access && typeof access.read === 'function' && typeof access.write === 'function' ? access : null;
  }

  listTools() {
    const tools = [
      tool('get_usage_guide', 'Return the current Veil Proxy MCP guide for safe LLM work with anonymized HTTP traffic and secret aliases.', objectSchema()),
      tool(
        'anonymize_http',
        'Anonymize a raw HTTP request or response. This is useful before pasting traffic into an external model.',
        objectSchema(
          property('message', 'string', 'Raw HTTP request or response.'),
          property('direction', 'string', 'Optional: auto, request, or response.'),
          property('aggressivePathRedaction', 'boolean', 'Optional: redact non-technical path segments. Defaults to false.'),
        ),
        ['message'],
      ),
      tool('list_secrets', 'List operator-provided secret aliases. Real secret values are never returned by MCP.', objectSchema()),
      tool(
        'list_proxy_history',
        'List recent Veil Proxy history items with URLs anonymized. Raw traffic is never returned.',
        objectSchema(
          property('limit', 'integer', 'Maximum number of items, capped at 100. Defaults to 25.'),
          property('inScopeOnly', 'boolean', 'Only include in-scope items. Defaults to true.'),
        ),
      ),
      tool(
        'get_proxy_item',
        'Return an anonymized request and optional response from Veil Proxy history by request id.',
        objectSchema(
          property('id', 'string', 'Visible request id from Traffic.'),
          property('includeResponse', 'boolean', 'Include anonymized response if present. Defaults to true.'),
        ),
        ['id'],
      ),
      tool(
        'search_proxy_history',
        'Search in-scope Veil Proxy history by URL/path, method, status code, response presence, and body/header text. Returns anonymized metadata only.',
        objectSchema(
          property('query', 'string', 'Optional case-insensitive search over URL, path, method, status, headers, and body text.'),
          property('method', 'string', 'Optional HTTP method filter.'),
          property('statusCode', 'integer', 'Optional exact HTTP status code.'),
          property('hasResponse', 'boolean', 'Optional response presence filter.'),
          property('limit', 'integer', 'Maximum newest items to inspect and return, capped at 250. Defaults to 100.'),
        ),
      ),
      tool('find_login_requests', 'Find likely in-scope login/authentication requests. Returns anonymized metadata only.', objectSchema(property('limit', 'integer', 'Maximum newest items to inspect, capped at 250. Defaults to 100.'))),
      tool('find_json_api_requests', 'Find likely in-scope JSON/API requests. Returns anonymized metadata only.', objectSchema(property('limit', 'integer', 'Maximum newest items to inspect, capped at 250. Defaults to 100.'))),
      tool('list_endpoints', 'Summarize unique in-scope endpoints by method and normalized path. Hosts are anonymized.', objectSchema(property('limit', 'integer', 'Maximum newest items to inspect, capped at 500. Defaults to 250.'))),
      tool('summarize_scope_surface', 'Summarize visible in-scope attack surface: methods, statuses, hosts, and endpoints.', objectSchema(property('limit', 'integer', 'Maximum newest items to inspect, capped at 500. Defaults to 250.'))),
      tool(
        'list_reported_findings',
        'List findings reported through Veil Proxy MCP. Returned URLs and evidence are anonymized; raw request/response evidence is never returned.',
        objectSchema(
          property('limit', 'integer', 'Maximum number of findings, capped at 500. Defaults to 100.'),
          property('reporter', 'string', 'Optional reporter filter.'),
          property('category', 'string', 'Optional category filter.'),
        ),
      ),
      tool('reset_aliases', 'Clear in-memory anonymization aliases. Future anonymization will produce a new alias set.', objectSchema()),
    ];

    if (this.mcpConfig().activeTesting === true) {
      tools.push(
        tool(
          'send_modified_proxy_item',
          'Modify a history request, resolve secret aliases locally, send it through Veil Proxy transports, and return only anonymized request/response.',
          objectSchema(
            property('id', 'string', 'Visible request id used as the base request.'),
            property('method', 'string', 'Optional replacement HTTP method.'),
            property('path', 'string', 'Optional replacement path including query string.'),
            property('headers', 'object', 'Optional headers to add or update.'),
            property('removeHeaders', 'array', 'Optional header names to remove.'),
            property('queryParameters', 'object', 'Optional URL query parameters to add or update.'),
            property('bodyParameters', 'object', 'Optional form body parameters to add or update.'),
            property('cookieParameters', 'object', 'Optional cookie parameters to add or update.'),
            property('body', 'string', 'Optional full replacement body. Secret aliases are resolved locally.'),
          ),
          ['id'],
        ),
        tool(
          'get_sent_traffic_item',
          'Return anonymized request/response for traffic previously sent by MCP.',
          objectSchema(
            property('id', 'string', 'Source history request id.'),
            property('includeResponse', 'boolean', 'Include anonymized response if present. Defaults to true.'),
          ),
          ['id'],
        ),
        tool(
          'run_payload_attack',
          'Run an Intruder-like sequential payload attack from a history request. Payloads are inserted into a query/body/cookie/header/path/raw body location. Results are anonymized.',
          objectSchema(
            property('id', 'string', 'Visible request id used as the base request.'),
            property('insertionPoint', 'object', 'Insertion point object: type=query|body|cookie|header|path|bodyTemplate|rawBody, name for parameter/header/cookie, optional template containing {{payload}}, optional marker.'),
            property('payloads', 'array', 'Payload strings to inject. Capped at 100 per call.'),
            property('method', 'string', 'Optional base request method override.'),
            property('path', 'string', 'Optional base path override before insertion.'),
            property('headers', 'object', 'Optional base headers to add or update before insertion.'),
            property('removeHeaders', 'array', 'Optional base header names to remove before insertion.'),
            property('queryParameters', 'object', 'Optional base query parameters before insertion.'),
            property('bodyParameters', 'object', 'Optional base form body parameters before insertion.'),
            property('cookieParameters', 'object', 'Optional base cookie parameters before insertion.'),
            property('body', 'string', 'Optional base full replacement body before insertion.'),
            property('delayMillis', 'integer', 'Optional delay between requests, capped at 5000 ms. Defaults to 0.'),
            property('detailLimit', 'integer', 'Maximum detailed anonymized request/response items, capped at 20. Defaults to 5.'),
            property('includeDetails', 'boolean', 'Include anonymized request/response details for interesting items. Defaults to true.'),
          ),
          ['id', 'insertionPoint', 'payloads'],
        ),
        tool(
          'send_proxy_item_to_echo',
          'Copy a history request into a local Echo tab or group. MCP returns anonymized metadata only; the raw request stays inside Veil Proxy.',
          objectSchema(
            property('id', 'string', 'Visible request id used as the Echo tab source.'),
            property('tabName', 'string', 'Optional Echo tab title.'),
            property('groupName', 'string', 'Optional Echo group title. Existing groups with the same title are reused.'),
            property('repeaterGroup', 'string', 'Optional compatibility alias for groupName.'),
            property('color', 'string', 'Optional tab color token: cyan, pink, amber, green, blue, or blank.'),
            property('groupColor', 'string', 'Optional group color token: cyan, pink, amber, green, blue, or blank.'),
          ),
          ['id'],
        ),
        tool(
          'send_random_proxy_item_to_echo',
          'Copy one random recent request into a local Echo tab or group. MCP returns anonymized metadata only; the raw request stays inside Veil Proxy.',
          objectSchema(
            property('limit', 'integer', 'Newest history window to choose from, capped at 250. Defaults to 100.'),
            property('inScopeOnly', 'boolean', 'Only choose in-scope requests. Defaults to true. Scope guard is still enforced when enabled.'),
            property('tabName', 'string', 'Optional Echo tab title.'),
            property('groupName', 'string', 'Optional Echo group title. Existing groups with the same title are reused.'),
            property('repeaterGroup', 'string', 'Optional compatibility alias for groupName.'),
            property('color', 'string', 'Optional tab color token: cyan, pink, amber, green, blue, or blank.'),
            property('groupColor', 'string', 'Optional group color token: cyan, pink, amber, green, blue, or blank.'),
          ),
        ),
        tool(
          'report_proxy_item_issue',
          'Create a local Veil Proxy finding from a captured history request. Raw traffic is not returned through MCP.',
          objectSchema(
            property('id', 'string', 'Visible request id from Traffic.'),
            property('name', 'string', 'Finding name. Alias: title.'),
            property('title', 'string', 'Finding title. Alias for name.'),
            property('detail', 'string', 'Finding detail and evidence. Alias: description.'),
            property('description', 'string', 'Finding description. Alias for detail.'),
            property('remediation', 'string', 'Optional remediation guidance.'),
            property('severity', 'string', 'Optional: high, medium, low, information. Defaults to high.'),
            property('confidence', 'string', 'Optional: certain, firm, tentative. Defaults to firm.'),
            property('reporter', 'string', 'Optional reporter label. Defaults to Codex.'),
            property('category', 'string', 'Optional finding category, for example SQLi, XSS, IDOR.'),
          ),
          ['id'],
        ),
        tool(
          'report_sent_traffic_issue',
          'Create a local Veil Proxy finding from the latest request/response previously sent by MCP for a source request id.',
          objectSchema(
            property('id', 'string', 'Source request id whose latest MCP-sent traffic should be used as evidence.'),
            property('name', 'string', 'Finding name. Alias: title.'),
            property('title', 'string', 'Finding title. Alias for name.'),
            property('detail', 'string', 'Finding detail and evidence. Alias: description.'),
            property('description', 'string', 'Finding description. Alias for detail.'),
            property('remediation', 'string', 'Optional remediation guidance.'),
            property('severity', 'string', 'Optional: high, medium, low, information. Defaults to high.'),
            property('confidence', 'string', 'Optional: certain, firm, tentative. Defaults to firm.'),
            property('reporter', 'string', 'Optional reporter label. Defaults to Codex.'),
            property('category', 'string', 'Optional finding category, for example SQLi, XSS, IDOR.'),
          ),
          ['id'],
        ),
        tool(
          'report_modified_proxy_item_issue',
          'Modify and send a history request, then create a local finding whose evidence is that modified request/response. Raw traffic is not returned through MCP.',
          objectSchema(
            property('id', 'string', 'Visible request id used as the base request.'),
            property('name', 'string', 'Finding name. Alias: title.'),
            property('title', 'string', 'Finding title. Alias for name.'),
            property('detail', 'string', 'Finding detail and evidence. Alias: description.'),
            property('description', 'string', 'Finding description. Alias for detail.'),
            property('remediation', 'string', 'Optional remediation guidance.'),
            property('severity', 'string', 'Optional: high, medium, low, information. Defaults to high.'),
            property('confidence', 'string', 'Optional: certain, firm, tentative. Defaults to firm.'),
            property('reporter', 'string', 'Optional reporter label. Defaults to Codex.'),
            property('category', 'string', 'Optional finding category, for example SQLi, XSS, IDOR.'),
            property('method', 'string', 'Optional replacement HTTP method.'),
            property('path', 'string', 'Optional replacement path including query string.'),
            property('headers', 'object', 'Optional headers to add or update.'),
            property('removeHeaders', 'array', 'Optional header names to remove.'),
            property('queryParameters', 'object', 'Optional URL query parameters to add or update.'),
            property('bodyParameters', 'object', 'Optional form body parameters to add or update.'),
            property('cookieParameters', 'object', 'Optional cookie parameters to add or update.'),
            property('body', 'string', 'Optional full replacement body. Secret aliases are resolved locally.'),
            property('createEchoTab', 'boolean', 'Also create an Echo tab with the evidence request. Defaults to false.'),
            property('tabName', 'string', 'Optional Echo tab title when createEchoTab is true.'),
            property('groupName', 'string', 'Optional Echo group title when createEchoTab is true.'),
          ),
          ['id'],
        ),
      );
    }

    return tools;
  }

  call(name, args = {}) {
    if (activeOnlyTool(name) && this.mcpConfig().activeTesting !== true) {
      return permissionDenied(name);
    }
    switch (name) {
      case 'get_usage_guide':
        return this.usageGuide();
      case 'anonymize_http':
        return this.anonymizeHttp(args);
      case 'list_secrets':
      case 'list_credentials':
        return this.listSecrets();
      case 'list_proxy_history':
        return this.listProxyHistory(args);
      case 'get_proxy_item':
        return this.getProxyItem(args);
      case 'search_proxy_history':
        return this.searchProxyHistory(args);
      case 'find_login_requests':
        return this.findLoginRequests(args);
      case 'find_json_api_requests':
        return this.findJsonApiRequests(args);
      case 'list_endpoints':
        return this.listEndpoints(args);
      case 'summarize_scope_surface':
        return this.summarizeScopeSurface(args);
      case 'list_reported_findings':
        return this.listReportedFindings(args);
      case 'send_modified_proxy_item':
        return this.sendModifiedProxyItem(args);
      case 'get_sent_traffic_item':
        return this.getSentTrafficItem(args);
      case 'run_payload_attack':
        return this.runPayloadAttack(args);
      case 'send_proxy_item_to_echo':
      case 'send_proxy_item_to_repeater':
        return this.sendProxyItemToEcho(args);
      case 'send_random_proxy_item_to_echo':
      case 'send_random_proxy_item_to_repeater':
        return this.sendRandomProxyItemToEcho(args);
      case 'report_proxy_item_issue':
        return this.reportProxyItemIssue(args);
      case 'report_sent_traffic_issue':
        return this.reportSentTrafficIssue(args);
      case 'report_modified_proxy_item_issue':
        return this.reportModifiedProxyItemIssue(args);
      case 'reset_aliases':
        this.aliasVault.reset();
        return toolResult({ reset: true, aliasMappings: 0 });
      default:
        return toolError(`Unknown tool: ${name}`);
    }
  }

  mcpConfig() {
    const config = typeof this.configProvider === 'function' ? this.configProvider() : {};
    return config.mcp || {};
  }

  scopeGuardActive() {
    if (this.mcpConfig().requireScope !== true) {
      return true;
    }
    return this.proxy.history.some((flow) => isHttpFlow(flow) && this.proxy.isFlowInScope(flow));
  }

  ensureScope() {
    if (this.scopeGuardActive()) {
      return null;
    }
    const result = toolResult({
      warning: 'Veil Proxy scope is required before MCP will expose history or execute traffic actions.',
      scopeGuardActive: false,
      actionRequired: 'Configure Scope in Veil Proxy and capture at least one in-scope request, then retry.',
    });
    result.isError = true;
    return result;
  }

  usageGuide() {
    return toolResult({
      name: 'Veil Proxy MCP usage guide',
      scopeGuardActive: this.scopeGuardActive(),
      permissionMode: this.mcpConfig().activeTesting === true ? 'Active testing' : 'Read-only',
      activeTestingAllowed: this.mcpConfig().activeTesting === true,
      rawTrafficReturnedByMcp: false,
      recommendedWorkflow: [
        'Use list_proxy_history, search_proxy_history, list_endpoints, and summarize_scope_surface to orient yourself.',
        'Use get_proxy_item only when you need an anonymized request/response for a specific request id.',
        'Use list_secrets when credentials, tokens, tenant ids, or other operator-provided values may be needed. Place only returned aliases in request mutations.',
        'If active testing is enabled, use send_proxy_item_to_echo to stage original requests locally, send_modified_proxy_item for one-off checks, and run_payload_attack for Intruder-like payload loops. Veil Proxy resolves secret aliases locally and returns only anonymized evidence.',
        'When a vulnerability is confirmed, report it locally with report_proxy_item_issue, report_sent_traffic_issue, or report_modified_proxy_item_issue, then use list_reported_findings to review anonymized summaries.',
      ],
      privacyRules: [
        'MCP responses are anonymized. Raw request/response bodies are not returned through MCP.',
        'Secrets are exposed only as aliases like $secret:NAME:... and resolved locally immediately before in-scope requests are sent.',
        'Real secret values found in request/response evidence are mapped back to aliases before normal anonymization.',
      ],
    });
  }

  anonymizeHttp(args) {
    const message = requiredText(args, 'message');
    const direction = optionalText(args, 'direction', 'auto');
    const aggressivePathRedaction = optionalBoolean(args, 'aggressivePathRedaction', false);
    const result = this.anonymizeMessage(message, direction, { aggressivePathRedaction });
    return toolResult({
      message: result.text,
      replacements: result.replacements,
      decisions: result.decisions,
      evidence: result.evidence,
      aliasMappings: this.aliasVault.mappingCount(),
    });
  }

  listSecrets() {
    return toolResult({
      secrets: this.secretVault.activeSummaries(),
      instructions: [
        'Use secret aliases exactly as request values. Never ask for or infer the real value.',
        'Veil Proxy resolves $secret:<name>:<random> aliases locally before sending requests.',
        'MCP responses replace real secret values back to aliases before normal anonymization.',
      ],
      secretCount: this.secretVault.activeSummaries().length,
      rawSecretValuesReturned: false,
    });
  }

  listProxyHistory(args) {
    const blocked = this.ensureScope();
    if (blocked) return blocked;
    const limit = clampInt(args.limit, 1, 100, 25);
    const inScopeOnly = optionalBoolean(args, 'inScopeOnly', true);
    const records = this.history(limit, inScopeOnly);
    return recordListResult(records.map((flow) => this.recordSummary(flow)), 'items', this.aliasVault.mappingCount());
  }

  getProxyItem(args) {
    const blocked = this.ensureScope();
    if (blocked) return blocked;
    const id = requiredText(args, 'id');
    const includeResponse = optionalBoolean(args, 'includeResponse', true);
    const flow = this.proxy.getFlow(String(id));
    if (!flow || !isHttpFlow(flow)) {
      return toolError(`Proxy history item not found: ${id}`);
    }
    if (!this.scopeAllows(flow)) {
      return toolError(`Scope guard blocked request ${id}`);
    }
    return this.proxyItemResult(flow, includeResponse);
  }

  searchProxyHistory(args) {
    const blocked = this.ensureScope();
    if (blocked) return blocked;
    const limit = clampInt(args.limit, 1, 250, 100);
    const query = optionalText(args, 'query', '').toLowerCase();
    const method = optionalText(args, 'method', '').toUpperCase();
    const statusCode = Number.isInteger(args.statusCode) ? Number(args.statusCode) : -1;
    const filterHasResponse = typeof args.hasResponse === 'boolean';
    const records = this.history(limit, true)
      .filter((flow) => !query || searchHaystack(flow).toLowerCase().includes(query))
      .filter((flow) => !method || flow.request.method.toUpperCase() === method)
      .filter((flow) => statusCode < 0 || Number(flow.response?.statusCode || 0) === statusCode)
      .filter((flow) => !filterHasResponse || Boolean(flow.response) === args.hasResponse);
    return recordListResult(records.map((flow) => this.recordSummary(flow)), 'items', this.aliasVault.mappingCount());
  }

  findLoginRequests(args) {
    const blocked = this.ensureScope();
    if (blocked) return blocked;
    const records = this.history(clampInt(args.limit, 1, 250, 100), true).filter((flow) =>
      /login|signin|sign-in|authenticate|password|username|session|token/i.test(searchHaystack(flow)),
    );
    return recordListResult(records.map((flow) => this.recordSummary(flow)), 'items', this.aliasVault.mappingCount());
  }

  findJsonApiRequests(args) {
    const blocked = this.ensureScope();
    if (blocked) return blocked;
    const records = this.history(clampInt(args.limit, 1, 250, 100), true).filter((flow) => {
      const requestContentType = headerValue(flow.request.headers, 'content-type');
      const requestAccept = headerValue(flow.request.headers, 'accept');
      const responseContentType = headerValue(flow.response?.headers, 'content-type');
      return /application\/json/i.test(`${requestContentType} ${requestAccept} ${responseContentType}`) || /\/api\/|\/rest\//i.test(flow.request.url);
    });
    return recordListResult(records.map((flow) => this.recordSummary(flow)), 'items', this.aliasVault.mappingCount());
  }

  listEndpoints(args) {
    const blocked = this.ensureScope();
    if (blocked) return blocked;
    const limit = clampInt(args.limit, 1, 500, 250);
    const endpoints = new Map();
    for (const flow of this.history(limit, true)) {
      const path = endpointPath(flow.request.url);
      const key = `${flow.request.method} ${path}`;
      if (!endpoints.has(key)) {
        endpoints.set(key, {
          method: flow.request.method,
          path,
          sampleUrl: this.anonymizeText(flow.request.url),
          count: 0,
          statusCodes: {},
        });
      }
      const item = endpoints.get(key);
      item.count += 1;
      if (flow.response?.statusCode) {
        item.statusCodes[flow.response.statusCode] = (item.statusCodes[flow.response.statusCode] || 0) + 1;
      }
    }
    return toolResult({
      items: [...endpoints.values()],
      uniqueEndpoints: endpoints.size,
      inspected: limit,
      aliasMappings: this.aliasVault.mappingCount(),
    });
  }

  summarizeScopeSurface(args) {
    const blocked = this.ensureScope();
    if (blocked) return blocked;
    const records = this.history(clampInt(args.limit, 1, 500, 250), true);
    const methods = {};
    const statusCodes = {};
    const hosts = {};
    for (const flow of records) {
      methods[flow.request.method] = (methods[flow.request.method] || 0) + 1;
      if (flow.response?.statusCode) {
        statusCodes[flow.response.statusCode] = (statusCodes[flow.response.statusCode] || 0) + 1;
      }
      const host = this.anonymizeText(safeUrl(flow.request.url)?.host || '');
      hosts[host] = (hosts[host] || 0) + 1;
    }
    const endpoints = this.listEndpoints(args).structuredContent.items;
    return toolResult({
      inspected: records.length,
      withResponse: records.filter((flow) => Boolean(flow.response)).length,
      methods,
      statusCodes,
      hosts,
      endpoints,
      aliasMappings: this.aliasVault.mappingCount(),
    });
  }

  async sendModifiedProxyItem(args) {
    const blocked = this.ensureScope();
    if (blocked) return blocked;
    const id = requiredText(args, 'id');
    const source = this.proxy.getFlow(String(id));
    if (!source || !isHttpFlow(source) || !this.scopeAllows(source)) {
      return toolError(`Proxy history item not found or out of scope: ${id}`);
    }
    const request = mutateRequest(source.request, args);
    const resolved = this.secretVault.resolveRequest(request);
    if (resolved.blockedAliases.length > 0) {
      return toolError(`Secret aliases are disabled and were not used: ${resolved.blockedAliases.join(', ')}`);
    }

    const candidateFlow = {
      ...source,
      request: {
        ...source.request,
        ...resolved.request,
      },
    };
    if (!this.scopeAllows(candidateFlow)) {
      return toolError(`Modified request is out of scope: ${id}`);
    }

    const sent = await this.proxy.sendEchoRequest(resolved.request);
    const record = {
      id: String(id),
      sourceId: String(id),
      type: 'http',
      startedAt: sent.startedAt,
      completedAt: sent.completedAt,
      durationMs: sent.durationMs,
      request: sent.request,
      response: sent.response,
      error: sent.error,
      notes: ['Sent by MCP'],
    };
    this.sentTraffic.unshift(record);
    this.sentTraffic.length = Math.min(this.sentTraffic.length, 100);
    const result = this.proxyItemResult(record, true).structuredContent;
    result.sent = true;
    result.sourceId = String(id);
    result.secretAliasesUsed = resolved.usedAliases;
    return toolResult(result);
  }

  async runPayloadAttack(args) {
    const blocked = this.ensureScope();
    if (blocked) return blocked;
    const id = requiredText(args, 'id');
    const source = this.proxy.getFlow(String(id));
    if (!source || !isHttpFlow(source) || !this.scopeAllows(source)) {
      return toolError(`Proxy history item not found or out of scope: ${id}`);
    }

    const payloads = stringList(args.payloads).filter(Boolean).slice(0, MAX_ATTACK_PAYLOADS);
    if (payloads.length === 0) {
      return toolError('payloads must contain at least one non-empty payload');
    }
    const insertionPoint = args.insertionPoint && typeof args.insertionPoint === 'object' ? args.insertionPoint : null;
    if (!insertionPoint) {
      return toolError('insertionPoint object is required');
    }

    let baseRequest;
    try {
      baseRequest = mutateRequest(source.request, args);
    } catch (error) {
      return toolError(`Invalid base request mutation: ${error.message}`);
    }

    const delayMillis = clampInt(args.delayMillis, 0, 5000, 0);
    const detailLimit = clampInt(args.detailLimit, 0, MAX_ATTACK_DETAILS, 5);
    const includeDetails = optionalBoolean(args, 'includeDetails', true);
    const summaries = [];
    const details = [];
    const statusCodes = {};
    const usedSecretAliases = new Set();
    let baseline = null;

    for (let index = 0; index < payloads.length; index += 1) {
      const payload = payloads[index];
      let request;
      try {
        request = applyInsertionPoint(baseRequest, insertionPoint, payload);
      } catch (error) {
        return toolError(`Invalid insertion point: ${error.message}`);
      }

      const resolved = this.secretVault.resolveRequest(request);
      if (resolved.blockedAliases.length > 0) {
        return toolError(`Secret aliases are disabled and were not used: ${resolved.blockedAliases.join(', ')}`);
      }
      resolved.usedAliases.forEach((alias) => usedSecretAliases.add(alias));

      const candidateFlow = {
        ...source,
        request: {
          ...source.request,
          ...resolved.request,
        },
      };
      if (!this.scopeAllows(candidateFlow)) {
        return toolError(`Payload request ${index} is out of scope for source request ${id}`);
      }

      const sent = await this.proxy.sendEchoRequest(resolved.request);
      const record = sentTrafficRecord(String(id), index, sent, 'Payload attack');
      this.sentTraffic.unshift(record);
      this.sentTraffic.length = Math.min(this.sentTraffic.length, 100);

      const resolvedPayload = this.secretVault.resolveText(payload).text;
      const summary = this.attackSummary(record, payload, resolvedPayload, index, baseline);
      baseline = baseline || summary;
      summaries.push(summary);
      if (summary.statusCode) {
        statusCodes[summary.statusCode] = (statusCodes[summary.statusCode] || 0) + 1;
      }
      if (includeDetails && details.length < detailLimit && isInterestingAttackResult(summary, baseline, index)) {
        const detail = this.proxyItemResult(record, true).structuredContent;
        detail.attackIndex = index;
        detail.payloadPreview = summary.payloadPreview;
        detail.payloadReflected = summary.payloadReflected;
        detail.securitySignal = summary.securitySignal;
        details.push(detail);
      }
      if (delayMillis > 0 && index < payloads.length - 1) {
        await sleep(delayMillis);
      }
    }

    return toolResult({
      sourceId: String(id),
      insertionPoint: sanitizeInsertionPoint(insertionPoint),
      payloadCount: payloads.length,
      executed: summaries.length,
      delayMillis,
      statusCodes,
      reflectedCount: summaries.filter((item) => item.payloadReflected).length,
      securitySignalCount: summaries.filter((item) => item.securitySignal).length,
      results: summaries,
      details,
      detailsTruncated: includeDetails && summaries.length > details.length,
      secretAliasesUsed: [...usedSecretAliases],
      rawRequestReturned: false,
      rawResponseReturned: false,
      aliasMappings: this.aliasVault.mappingCount(),
    });
  }

  sendProxyItemToEcho(args) {
    const blocked = this.ensureScope();
    if (blocked) return blocked;
    const id = requiredText(args, 'id');
    const flow = this.proxy.getFlow(String(id));
    if (!flow || !isHttpFlow(flow)) {
      return toolError(`Proxy history item not found: ${id}`);
    }
    if (!this.scopeAllows(flow)) {
      return toolError(`Scope guard blocked request ${id}`);
    }
    return this.createEchoTabForFlow(flow, args);
  }

  sendRandomProxyItemToEcho(args) {
    const blocked = this.ensureScope();
    if (blocked) return blocked;
    const limit = clampInt(args.limit, 1, 250, 100);
    const inScopeOnly = optionalBoolean(args, 'inScopeOnly', true);
    const records = this.history(limit, inScopeOnly).filter((flow) => this.scopeAllows(flow));
    if (records.length === 0) {
      return toolError('No matching proxy history items are available for Echo.');
    }
    const flow = records[Math.floor(Math.random() * records.length)];
    return this.createEchoTabForFlow(flow, args);
  }

  createEchoTabForFlow(flow, args = {}) {
    if (!this.uiStateAccess) {
      return toolError('Echo UI state is unavailable. Start Veil Proxy with the local API server and retry.');
    }

    const currentUi = this.uiStateAccess.read() || {};
    const echo = cloneEchoState(currentUi.echo);
    const groupName = cleanEchoText(optionalText(args, 'groupName', '') || optionalText(args, 'repeaterGroup', ''), 120);
    const group = groupName ? ensureEchoGroup(echo, groupName, sanitizeEchoColor(args.groupColor)) : null;
    const requestedTitle = cleanEchoText(optionalText(args, 'tabName', ''), 180);
    const fallbackTitle = cleanEchoText(`${flow.request.method || 'GET'} ${requestTarget(flow.request.url)}`, 180);
    const tabTitle = requestedTitle || fallbackTitle;
    const tab = {
      id: makeEchoId('echo-mcp'),
      title: tabTitle,
      customTitle: Boolean(requestedTitle),
      groupId: group ? group.id : '',
      source: `From req #${flow.id} via MCP`,
      method: String(flow.request.method || 'GET').toUpperCase(),
      rawRequest: rawRequest(flow),
      response: null,
      loading: false,
      error: null,
      durationMs: null,
      color: sanitizeEchoColor(args.color),
    };

    echo.tabs.unshift(tab);
    echo.selectedTabId = tab.id;
    echo.selectedGroupId = group ? group.id : null;
    const nextUi = this.uiStateAccess.write({ echo }) || {};
    const savedEcho = nextUi.echo || echo;
    const savedTab = (savedEcho.tabs || []).find((item) => item.id === tab.id) || tab;
    const summary = this.recordSummary(flow);

    return toolResult({
      sentToEcho: true,
      id: summary.id,
      method: summary.method,
      url: summary.url,
      path: summary.path,
      statusCode: summary.statusCode,
      hasResponse: summary.hasResponse,
      inScope: summary.inScope,
      echoTabId: savedTab.id,
      echoTabTitle: requestedTitle ? requestedTitle : this.anonymizeText(tabTitle),
      echoGroupId: group ? group.id : null,
      echoGroupName: group ? group.title : null,
      rawRequestReturned: false,
      rawResponseReturned: false,
      aliasMappings: this.aliasVault.mappingCount(),
      note: 'The original raw request was copied into local Echo state. MCP returned anonymized metadata only.',
    });
  }

  reportProxyItemIssue(args) {
    const blocked = this.ensureScope();
    if (blocked) return blocked;
    const id = requiredText(args, 'id');
    const flow = this.proxy.getFlow(String(id));
    if (!flow || !isHttpFlow(flow)) {
      return toolError(`Proxy history item not found: ${id}`);
    }
    if (!this.scopeAllows(flow)) {
      return toolError(`Scope guard blocked request ${id}`);
    }
    const issue = issueFromArgs(args);
    const finding = this.addFindingForRecord(flow, issue, 'proxy_history');
    return this.issueResult(finding, flow, issue, 'proxy_history');
  }

  reportSentTrafficIssue(args) {
    const blocked = this.ensureScope();
    if (blocked) return blocked;
    const id = requiredText(args, 'id');
    const record = this.sentTraffic.find((item) => item.sourceId === String(id));
    if (!record) {
      return toolError(`Sent traffic evidence not found for source id: ${id}. Use send_modified_proxy_item first, or use report_modified_proxy_item_issue to send and report in one call.`);
    }
    const candidateFlow = {
      ...record,
      id: record.sourceId,
    };
    if (!this.scopeAllows(candidateFlow)) {
      return toolError(`Sent traffic evidence is out of scope for source id: ${id}`);
    }
    const issue = issueFromArgs(args);
    const finding = this.addFindingForRecord(record, issue, 'sent_traffic');
    return this.issueResult(finding, record, issue, 'sent_traffic', {
      sourceId: String(id),
      sentTrafficId: String(record.id),
      note: 'Finding evidence uses the latest MCP-sent request/response for this source id, not the original captured request.',
    });
  }

  async reportModifiedProxyItemIssue(args) {
    const blocked = this.ensureScope();
    if (blocked) return blocked;
    const id = requiredText(args, 'id');
    const source = this.proxy.getFlow(String(id));
    if (!source || !isHttpFlow(source) || !this.scopeAllows(source)) {
      return toolError(`Proxy history item not found or out of scope: ${id}`);
    }

    let request;
    try {
      request = mutateRequest(source.request, args);
    } catch (error) {
      return toolError(`Invalid request mutation: ${error.message}`);
    }

    const resolved = this.secretVault.resolveRequest(request);
    if (resolved.blockedAliases.length > 0) {
      return toolError(`Secret aliases are disabled and were not used: ${resolved.blockedAliases.join(', ')}`);
    }

    const candidateFlow = {
      ...source,
      request: {
        ...source.request,
        ...resolved.request,
      },
    };
    if (!this.scopeAllows(candidateFlow)) {
      return toolError(`Modified request is out of scope: ${id}`);
    }

    const sent = await this.proxy.sendEchoRequest(resolved.request);
    const record = {
      id: `${id}:issue:${Date.now()}`,
      sourceId: String(id),
      type: 'http',
      startedAt: sent.startedAt,
      completedAt: sent.completedAt,
      durationMs: sent.durationMs,
      request: sent.request,
      response: sent.response,
      error: sent.error,
      notes: ['Sent by MCP issue reporter'],
    };
    this.sentTraffic.unshift(record);
    this.sentTraffic.length = Math.min(this.sentTraffic.length, 100);

    if (optionalBoolean(args, 'createEchoTab', false)) {
      this.createEchoTabForFlow(record, {
        tabName: optionalText(args, 'tabName', '') || `Evidence #${id}`,
        groupName: optionalText(args, 'groupName', '') || optionalText(args, 'repeaterGroup', ''),
        color: optionalText(args, 'color', ''),
        groupColor: optionalText(args, 'groupColor', ''),
      });
    }

    const issue = issueFromArgs(args);
    const finding = this.addFindingForRecord(record, issue, 'modified_request');
    const result = this.issueResult(finding, record, issue, 'modified_request', {
      sourceId: String(id),
      sentTrafficId: String(record.id),
      secretAliasesUsed: resolved.usedAliases,
      note: 'Finding evidence uses this modified request/response, not the original captured request.',
    }).structuredContent;
    const evidence = this.proxyItemResult(record, true).structuredContent;
    result.request = evidence.request;
    result.response = evidence.response || null;
    result.requestReplacements = evidence.requestReplacements;
    result.responseReplacements = evidence.responseReplacements || [];
    return toolResult(result);
  }

  addFindingForRecord(record, issue, evidenceSource) {
    const response = record.response || {};
    const sourceId = String(record.sourceId || record.id);
    const finding = this.proxy.addReportedFinding(
      {
        id: `mcp:${evidenceSource}:${record.sourceId || record.id}:${slug(issue.name)}`,
        sourceId,
        sentTrafficId: record.sourceId ? String(record.id) : '',
        evidenceSource,
        title: issue.name,
        detail: issue.detail,
        remediation: issue.remediation,
        severity: issue.severity,
        confidence: issue.confidence,
        reporter: issue.reporter,
        category: issue.category,
        method: record.request?.method,
        url: record.request?.url,
        statusCode: response.statusCode || null,
        evidence: issue.detail,
      },
      record,
    );
    this.annotateSourceFlow(sourceId, issue, evidenceSource);
    return finding;
  }

  annotateSourceFlow(sourceId, issue, evidenceSource) {
    const flow = this.proxy.getFlow(String(sourceId));
    if (!flow) return;
    const note = `MCP finding (${evidenceSource}): ${issue.name}`;
    flow.notes = Array.isArray(flow.notes) ? flow.notes : [];
    if (!flow.notes.includes(note)) {
      flow.notes.unshift(note);
      if (typeof this.proxy.emitHistory === 'function') {
        this.proxy.emitHistory(flow);
      }
    }
  }

  issueResult(finding, record, issue, evidenceSource, extra = {}) {
    return toolResult({
      reported: true,
      findingId: finding.id,
      id: String(record.sourceId || record.id),
      sourceId: String(extra.sourceId || record.sourceId || record.id),
      sentTrafficId: extra.sentTrafficId || '',
      evidenceSource,
      name: this.anonymizeText(issue.name),
      reporter: issue.reporter,
      category: issue.category,
      filterHint: this.anonymizeText(issue.name),
      severity: issue.severity,
      confidence: issue.confidence,
      method: record.request?.method || '',
      url: this.anonymizeText(record.request?.url || ''),
      statusCode: record.response?.statusCode || null,
      detail: this.anonymizeText(issue.detail),
      remediation: this.anonymizeText(issue.remediation),
      rawRequestReturned: false,
      rawResponseReturned: false,
      aliasMappings: this.aliasVault.mappingCount(),
      ...extra,
    });
  }

  listReportedFindings(args) {
    const limit = clampInt(args.limit, 1, 500, 100);
    const reporter = optionalText(args, 'reporter', '').toLowerCase();
    const category = optionalText(args, 'category', '').toLowerCase();
    const items = (this.proxy.getReportedFindings ? this.proxy.getReportedFindings() : [])
      .filter((finding) => !reporter || String(finding.reporter || '').toLowerCase() === reporter)
      .filter((finding) => !category || String(finding.category || '').toLowerCase() === category)
      .slice(0, limit)
      .map((finding) => this.reportedFindingSummary(finding));
    return toolResult({
      items,
      count: items.length,
      totalRecorded: this.proxy.getReportedFindings ? this.proxy.getReportedFindings().length : 0,
      limit,
      reporterFilter: reporter,
      categoryFilter: category,
      rawRequestReturned: false,
      rawResponseReturned: false,
      aliasMappings: this.aliasVault.mappingCount(),
    });
  }

  reportedFindingSummary(finding) {
    return {
      id: String(finding.id || ''),
      time: finding.mcpReportedAt || '',
      sourceId: String((finding.flowIds || [])[0] || ''),
      sentTrafficId: finding.sentTrafficId || '',
      evidenceSource: finding.evidenceSource || '',
      reporter: finding.reporter || '',
      category: finding.category || '',
      name: this.anonymizeText(finding.title || ''),
      severity: finding.severity || '',
      confidence: finding.confidence || '',
      method: finding.method || '',
      url: this.anonymizeText(finding.url || ''),
      statusCode: finding.statusCode || null,
      detail: this.anonymizeText(finding.description || ''),
      remediation: this.anonymizeText(finding.remediation || ''),
      rawRequestReturned: false,
      rawResponseReturned: false,
      hasRequestEvidence: true,
      hasResponseEvidence: finding.statusCode != null,
    };
  }

  getSentTrafficItem(args) {
    const id = requiredText(args, 'id');
    const includeResponse = optionalBoolean(args, 'includeResponse', true);
    const record = this.sentTraffic.find((item) => item.sourceId === String(id));
    if (!record) {
      return toolError(`Sent traffic item not found for source id: ${id}`);
    }
    return this.proxyItemResult(record, includeResponse);
  }

  history(limit, inScopeOnly) {
    return this.proxy.history.filter(isHttpFlow).filter((flow) => !inScopeOnly || this.scopeAllows(flow)).slice(0, limit);
  }

  scopeAllows(flow) {
    return this.mcpConfig().requireScope !== true || this.proxy.isFlowInScope(flow);
  }

  recordSummary(flow) {
    const response = flow.response || {};
    return {
      id: String(flow.id),
      method: flow.request.method,
      url: this.anonymizeText(flow.request.url),
      path: endpointPath(this.anonymizeText(flow.request.url)),
      statusCode: response.statusCode || null,
      hasResponse: Boolean(flow.response),
      time: flow.startedAt,
      inScope: this.proxy.isFlowInScope(flow),
      error: flow.error || null,
    };
  }

  attackSummary(record, payload, resolvedPayload, index, baseline) {
    const responseText = record.response?.bodyText || '';
    const responseBytes = record.response ? Buffer.byteLength(record.response.bodyBase64 || '', 'base64') : 0;
    const requestBytes = Buffer.byteLength(record.request?.bodyBase64 || '', 'base64');
    const reflected =
      Boolean(resolvedPayload && responseText.includes(resolvedPayload)) ||
      Boolean(payload && responseText.includes(payload)) ||
      Boolean(resolvedPayload && headersText(record.response?.headers).includes(resolvedPayload));
    const securitySignal = SECURITY_SIGNAL.test(responseText);
    const title = extractHtmlTitle(responseText);
    return {
      index,
      payloadPreview: this.anonymizeText(payload).slice(0, 180),
      statusCode: record.response?.statusCode || null,
      durationMs: record.durationMs,
      requestBytes,
      responseBytes,
      responseBytesDelta: baseline ? responseBytes - baseline.responseBytes : 0,
      statusChanged: baseline ? (record.response?.statusCode || null) !== baseline.statusCode : false,
      payloadReflected: reflected,
      securitySignal,
      title: title ? this.anonymizeText(title).slice(0, 180) : '',
      error: record.error || null,
    };
  }

  proxyItemResult(flow, includeResponse) {
    const request = this.anonymizeMessage(rawRequest(flow), 'request');
    const structured = {
      id: String(flow.id),
      method: flow.request.method,
      url: this.anonymizeText(flow.request.url),
      statusCode: flow.response?.statusCode || null,
      hasResponse: Boolean(flow.response),
      request: request.text,
      requestReplacements: request.replacements,
      requestDecisions: request.decisions,
      requestEvidence: request.evidence,
      rawRequestReturned: false,
      rawResponseReturned: false,
      aliasMappings: this.aliasVault.mappingCount(),
    };
    if (includeResponse && flow.response) {
      const response = this.anonymizeMessage(rawResponse(flow), 'response');
      structured.response = response.text;
      structured.responseReplacements = response.replacements;
      structured.responseDecisions = response.decisions;
      structured.responseEvidence = response.evidence;
    }
    return toolResult(structured);
  }

  anonymizeMessage(message, direction, options = {}) {
    return this.anonymizer.anonymizeHttpMessage(this.secretVault.redactSecrets(message), direction, options);
  }

  anonymizeText(text) {
    return this.anonymizer.anonymizeText(this.secretVault.redactSecrets(text)).text;
  }
}

function activeOnlyTool(name) {
  return [
    'send_modified_proxy_item',
    'get_sent_traffic_item',
    'run_payload_attack',
    'send_proxy_item_to_echo',
    'send_random_proxy_item_to_echo',
    'send_proxy_item_to_repeater',
    'send_random_proxy_item_to_repeater',
    'report_proxy_item_issue',
    'report_sent_traffic_issue',
    'report_modified_proxy_item_issue',
  ].includes(name);
}

function permissionDenied(name) {
  const result = toolResult({
    error: `MCP permission mode blocks active tool: ${name}`,
    blockedTool: name,
    permissionMode: 'Read-only',
    requiredPermissionMode: 'Active testing',
    actionRequired: 'Enable active testing for Veil Proxy MCP, then retry.',
  });
  result.isError = true;
  return result;
}

function toolResult(structuredContent) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(structuredContent, null, 2),
      },
    ],
    structuredContent,
    isError: false,
  };
}

function toolError(message) {
  const result = toolResult({ error: message });
  result.isError = true;
  return result;
}

function recordListResult(items, fieldName, aliasMappings) {
  return toolResult({
    [fieldName]: items,
    count: items.length,
    aliasMappings,
  });
}

function tool(name, description, inputSchema, required = []) {
  return {
    name,
    description,
    inputSchema: {
      ...inputSchema,
      required,
    },
  };
}

function objectSchema(...properties) {
  const schema = {
    type: 'object',
    properties: {},
    additionalProperties: false,
  };
  for (const item of properties) {
    schema.properties[item.name] = {
      type: item.type,
      description: item.description,
    };
  }
  return schema;
}

function property(name, type, description) {
  return { name, type, description };
}

function requiredText(args, name) {
  const value = args && args[name];
  if (value === undefined || value === null || String(value) === '') {
    throw new Error(`${name} is required`);
  }
  return String(value);
}

function requiredAnyText(args, names, label) {
  for (const name of names) {
    const value = args && args[name];
    if (value !== undefined && value !== null && String(value) !== '') {
      return String(value);
    }
  }
  throw new Error(`${label || names[0]} is required`);
}

function optionalText(args, name, fallback) {
  const value = args && args[name];
  return value === undefined || value === null ? fallback : String(value);
}

function optionalBoolean(args, name, fallback) {
  return typeof (args && args[name]) === 'boolean' ? args[name] : fallback;
}

function stringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => (item === undefined || item === null ? '' : String(item)));
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function isHttpFlow(flow) {
  return flow && flow.type === 'http' && flow.request && flow.request.method !== 'CONNECT';
}

function headerValue(headers = {}, name) {
  const wanted = String(name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === wanted) {
      return String(value || '');
    }
  }
  return '';
}

function rawRequest(flow) {
  const request = flow.request || {};
  const parsed = safeUrl(request.url);
  const path = parsed ? `${parsed.pathname}${parsed.search}` : request.url || '/';
  return [
    `${request.method || 'GET'} ${path || '/'} HTTP/${request.httpVersion || '1.1'}`,
    ...Object.entries(request.headers || {}).map(([name, value]) => `${name}: ${value}`),
    '',
    request.bodyText || '',
  ].join('\r\n');
}

function rawResponse(flow) {
  const response = flow.response || {};
  return [
    `HTTP/${response.httpVersion || '1.1'} ${response.statusCode || 0} ${response.statusMessage || ''}`.trim(),
    ...Object.entries(response.headers || {}).map(([name, value]) => `${name}: ${value}`),
    '',
    response.bodyText || '',
  ].join('\r\n');
}

function endpointPath(url) {
  const parsed = safeUrl(url);
  if (!parsed) return String(url || '/');
  return parsed.pathname || '/';
}

function requestTarget(url) {
  const parsed = safeUrl(url);
  if (!parsed) return String(url || '/');
  return `${parsed.pathname || '/'}${parsed.search || ''}`;
}

function searchHaystack(flow) {
  return [
    flow.id,
    flow.request?.method,
    flow.request?.url,
    flow.response?.statusCode,
    headersText(flow.request?.headers),
    flow.request?.bodyText,
    headersText(flow.response?.headers),
    flow.response?.bodyText,
    flow.error,
  ]
    .filter(Boolean)
    .join('\n');
}

function headersText(headers) {
  return Object.entries(headers || {})
    .map(([name, value]) => `${name}: ${value}`)
    .join('\n');
}

function mutateRequest(request, args) {
  const parsed = new URL(request.url);
  const headers = normalizeHeaderObject(request.headers || {});
  for (const name of Array.isArray(args.removeHeaders) ? args.removeHeaders : []) {
    delete headers[String(name).toLowerCase()];
  }
  for (const [name, value] of Object.entries(args.headers || {})) {
    headers[String(name).toLowerCase()] = String(value);
  }
  if (args.path) {
    const path = String(args.path);
    const [pathname, search = ''] = path.split('?');
    parsed.pathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
    parsed.search = search ? `?${search}` : '';
  }
  for (const [name, value] of Object.entries(args.queryParameters || {})) {
    parsed.searchParams.set(name, String(value));
  }
  if (args.cookieParameters && typeof args.cookieParameters === 'object') {
    const cookies = parseCookie(headers.cookie || '');
    for (const [name, value] of Object.entries(args.cookieParameters)) {
      cookies.set(name, String(value));
    }
    headers.cookie = [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  let bodyText = Object.prototype.hasOwnProperty.call(args, 'body') ? String(args.body || '') : request.bodyText || '';
  if (args.bodyParameters && typeof args.bodyParameters === 'object') {
    const params = new URLSearchParams(bodyText);
    for (const [name, value] of Object.entries(args.bodyParameters)) {
      params.set(name, String(value));
    }
    bodyText = params.toString();
    headers['content-type'] = headers['content-type'] || 'application/x-www-form-urlencoded';
  }
  headers.host = parsed.host;
  const bodyBuffer = Buffer.from(bodyText);
  if (bodyBuffer.length > 0) {
    headers['content-length'] = String(bodyBuffer.length);
  } else {
    delete headers['content-length'];
  }
  return {
    method: String(args.method || request.method || 'GET').toUpperCase(),
    url: parsed.href,
    headers,
    bodyText,
    bodyBase64: bodyBuffer.toString('base64'),
  };
}

function applyInsertionPoint(request, insertionPoint, payload) {
  const type = String(insertionPoint.type || '').trim();
  const name = String(insertionPoint.name || '').trim();
  const rendered = renderPayload(insertionPoint.template, payload);
  const next = {
    ...request,
    headers: normalizeHeaderObject(request.headers || {}),
    bodyText: request.bodyText || '',
  };
  const parsed = new URL(next.url);

  if (type === 'query') {
    if (!name) throw new Error('query insertion point requires name');
    parsed.searchParams.set(name, rendered);
    next.url = parsed.href;
    return finalizeRequest(next);
  }

  if (type === 'body' || type === 'form') {
    if (!name) throw new Error('body insertion point requires name');
    const params = new URLSearchParams(next.bodyText || '');
    params.set(name, rendered);
    next.bodyText = params.toString();
    next.headers['content-type'] = next.headers['content-type'] || 'application/x-www-form-urlencoded';
    return finalizeRequest(next);
  }

  if (type === 'cookie') {
    if (!name) throw new Error('cookie insertion point requires name');
    const cookies = parseCookie(next.headers.cookie || '');
    cookies.set(name, rendered);
    next.headers.cookie = [...cookies.entries()].map(([cookieName, value]) => `${cookieName}=${value}`).join('; ');
    return finalizeRequest(next);
  }

  if (type === 'header') {
    if (!name) throw new Error('header insertion point requires name');
    next.headers[name.toLowerCase()] = rendered;
    return finalizeRequest(next);
  }

  if (type === 'path') {
    const marker = String(insertionPoint.marker || '{{payload}}');
    if (insertionPoint.template) {
      const [pathname, search = ''] = rendered.split('?');
      parsed.pathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
      parsed.search = search ? `?${search}` : '';
    } else {
      const current = `${parsed.pathname}${parsed.search}`;
      const replacement = current.includes(marker)
        ? current.split(marker).join(encodeURIComponent(payload))
        : `${parsed.pathname.replace(/\/$/, '')}/${encodeURIComponent(payload)}${parsed.search}`;
      const [pathname, search = ''] = replacement.split('?');
      parsed.pathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
      parsed.search = search ? `?${search}` : '';
    }
    next.url = parsed.href;
    return finalizeRequest(next);
  }

  if (type === 'bodyTemplate' || type === 'rawBody') {
    const template = Object.prototype.hasOwnProperty.call(insertionPoint, 'template') ? String(insertionPoint.template || '') : next.bodyText || '{{payload}}';
    next.bodyText = renderPayload(template, payload);
    return finalizeRequest(next);
  }

  throw new Error('unsupported insertion point type');
}

function renderPayload(template, payload) {
  if (template === undefined || template === null || String(template) === '') {
    return String(payload);
  }
  const text = String(template);
  return text.includes('{{payload}}') ? text.split('{{payload}}').join(String(payload)) : `${text}${payload}`;
}

function finalizeRequest(request) {
  const parsed = new URL(request.url);
  const headers = normalizeHeaderObject(request.headers || {});
  headers.host = parsed.host;
  const body = Buffer.from(request.bodyText || '');
  if (body.length > 0) {
    headers['content-length'] = String(body.length);
  } else {
    delete headers['content-length'];
  }
  return {
    ...request,
    url: parsed.href,
    headers,
    bodyText: body.toString('utf8'),
    bodyBase64: body.toString('base64'),
  };
}

function sentTrafficRecord(sourceId, index, sent, note) {
  return {
    id: `${sourceId}:${index}`,
    sourceId: String(sourceId),
    type: 'http',
    startedAt: sent.startedAt,
    completedAt: sent.completedAt,
    durationMs: sent.durationMs,
    request: sent.request,
    response: sent.response,
    error: sent.error,
    notes: [note],
  };
}

function isInterestingAttackResult(summary, baseline, index) {
  return (
    index === 0 ||
    summary.error ||
    summary.payloadReflected ||
    summary.securitySignal ||
    summary.statusChanged ||
    Math.abs(summary.responseBytesDelta || 0) > Math.max(128, Math.round((baseline?.responseBytes || 0) * 0.15))
  );
}

function sanitizeInsertionPoint(insertionPoint) {
  return {
    type: String(insertionPoint.type || ''),
    name: insertionPoint.name ? String(insertionPoint.name) : '',
    hasTemplate: Object.prototype.hasOwnProperty.call(insertionPoint, 'template'),
    marker: insertionPoint.marker ? String(insertionPoint.marker) : '',
  };
}

function extractHtmlTitle(text) {
  const match = String(text || '').match(/<title\b[^>]*>(.*?)<\/title>/is);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCookie(value) {
  const result = new Map();
  for (const part of String(value || '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name) {
      result.set(name, rest.join('='));
    }
  }
  return result;
}

function cloneEchoState(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const cloned = clonePlain(raw);
  return {
    tabs: Array.isArray(cloned.tabs) ? cloned.tabs : [],
    groups: Array.isArray(cloned.groups) ? cloned.groups : [],
    selectedTabId: typeof cloned.selectedTabId === 'string' ? cloned.selectedTabId : null,
    selectedGroupId: typeof cloned.selectedGroupId === 'string' ? cloned.selectedGroupId : null,
    split: Number.isFinite(Number(cloned.split)) ? Number(cloned.split) : 50,
  };
}

function clonePlain(value) {
  try {
    return JSON.parse(JSON.stringify(value || {}));
  } catch {
    return {};
  }
}

function ensureEchoGroup(echo, title, color) {
  const existing = echo.groups.find((group) => String(group.title || '').trim().toLowerCase() === title.toLowerCase());
  if (existing) {
    if (color && !existing.color) {
      existing.color = color;
    }
    return existing;
  }
  const group = {
    id: makeEchoId('echo-group-mcp'),
    title,
    color,
  };
  echo.groups.push(group);
  return group;
}

function cleanEchoText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function sanitizeEchoColor(value) {
  const color = String(value || '').trim().toLowerCase();
  return ['cyan', 'pink', 'amber', 'green', 'blue'].includes(color) ? color : '';
}

function makeEchoId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function issueFromArgs(args) {
  return {
    name: requiredAnyText(args, ['name', 'title'], 'name'),
    detail: requiredAnyText(args, ['detail', 'description'], 'detail'),
    remediation: optionalText(args, 'remediation', ''),
    severity: normalizeIssueSeverity(optionalText(args, 'severity', 'high')),
    confidence: normalizeIssueConfidence(optionalText(args, 'confidence', 'firm')),
    reporter: cleanEchoText(optionalText(args, 'reporter', 'Codex'), 80) || 'Codex',
    category: cleanEchoText(optionalText(args, 'category', ''), 80),
  };
}

function normalizeIssueSeverity(value) {
  const severity = String(value || 'high').trim().toLowerCase();
  if (severity === 'info') return 'information';
  return ['high', 'medium', 'low', 'information'].includes(severity) ? severity : 'high';
}

function normalizeIssueConfidence(value) {
  const confidence = String(value || 'firm').trim().toLowerCase();
  return ['certain', 'firm', 'tentative'].includes(confidence) ? confidence : 'firm';
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

module.exports = {
  McpTools,
  toolError,
  toolResult,
};
