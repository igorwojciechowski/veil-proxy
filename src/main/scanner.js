const fs = require('fs');
const path = require('path');

const TEMPLATE_DIR = path.join(__dirname, 'scannerTemplates');
const PASSIVE_TEMPLATE_PATH = path.join(TEMPLATE_DIR, 'passive.json');
const ACTIVE_TEMPLATE_PATH = path.join(TEMPLATE_DIR, 'active.json');

function loadPassiveTemplates() {
  return loadTemplates(PASSIVE_TEMPLATE_PATH);
}

function loadActiveTemplates() {
  return loadTemplates(ACTIVE_TEMPLATE_PATH);
}

function loadTemplates(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && Array.isArray(item.matchers)) : [];
  } catch {
    return [];
  }
}

function buildTemplateFindings(history = [], templates = loadPassiveTemplates()) {
  const findings = new Map();

  for (const flow of history) {
    if (!flow || flow.type !== 'http' || !flow.request) {
      continue;
    }

    for (const template of templates) {
      const matched = matchTemplate(template, flow, null);
      if (!matched) continue;
      addTemplateFinding(findings, flow, template, matched);
    }
  }

  return [...findings.values()].map((finding) => ({
    ...finding,
    flowIds: [...finding.flowIds],
    evidence: [...finding.evidence].slice(0, 12),
  }));
}

async function runActiveScan({ proxy, flow, templateIds = [], maxRequests = 60, concurrency = 3, control = null, onProgress = null } = {}) {
  if (!proxy || !flow || !flow.request || flow.type !== 'http') {
    throw new Error('Active scanner needs a captured HTTP request.');
  }

  const ids = new Set(Array.isArray(templateIds) ? templateIds.map(String).filter(Boolean) : []);
  const templates = loadActiveTemplates().filter((template) => ids.size === 0 || ids.has(String(template.id)));
  if (templates.length === 0) {
    throw new Error('No active scanner templates matched the request.');
  }

  const limit = clampInt(maxRequests, 1, 200, 60);
  const parallel = clampInt(concurrency, 1, 8, 3);
  const variants = buildActiveVariants(flow.request, templates).slice(0, limit);
  if (variants.length === 0) {
    throw new Error('No insertion points were found for active scanning.');
  }

  const startedAt = Date.now();
  const findings = [];
  const results = await runWithConcurrency(variants, parallel, async (variant) => {
    const before = await waitForScanSlot(control);
    if (before?.stopped) {
      return skippedActiveResult(variant, before.reason || 'stopped');
    }
    const result = await executeActiveVariant(proxy, flow, variant, findings);
    if (typeof onProgress === 'function') {
      onProgress(result);
    }
    return result;
  });
  const executedResults = results.filter((result) => result && !result.skipped);

  return {
    id: `scan-${flow.id}-${startedAt}`,
    sourceId: flow.id,
    startedAt,
    completedAt: Date.now(),
    requested: variants.length,
    executed: executedResults.length,
    stopped: Boolean(control?.stopped),
    findings,
    results,
  };
}

async function waitForScanSlot(control) {
  if (!control) return null;
  while (control.paused && !control.stopped) {
    await delay(100);
  }
  return control.stopped ? { stopped: true, reason: control.stopReason || 'stopped' } : null;
}

function skippedActiveResult(variant, reason) {
  return {
    index: variant.index,
    templateId: variant.template.id,
    title: variant.template.title,
    insertionPoint: variant.point,
    statusCode: null,
    durationMs: 0,
    historyFlowId: '',
    matched: false,
    findingId: '',
    skipped: true,
    error: reason,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeActiveVariant(proxy, sourceFlow, variant, findings) {
  const startedAt = Date.now();
  let sent;
  try {
    sent = await proxy.sendEchoRequest(
      {
        method: variant.request.method,
        url: variant.request.url,
        headers: variant.request.headers,
        bodyText: variant.request.bodyText,
      },
      {
        recordHistory: true,
        source: 'scanner',
        tool: 'Active Scanner',
        sourceId: sourceFlow.id,
        note: `Active scanner ${variant.template.id} ${variant.point.type}:${variant.point.name}`,
      },
    );
  } catch (error) {
    return {
      index: variant.index,
      templateId: variant.template.id,
      insertionPoint: variant.point,
      statusCode: null,
      durationMs: Date.now() - startedAt,
      matched: false,
      error: error.message,
    };
  }

  const matched = sent && !sent.error ? matchTemplate(variant.template, toFlowLike(sent), variant.payload) : null;
  let finding = null;
  if (matched) {
    finding = proxy.addReportedFinding(
      {
        id: `scanner-active:${variant.template.id}:${sourceFlow.id}:${variant.point.type}:${variant.point.name}`,
        source: 'scanner',
        evidenceSource: 'active_scan',
        reporter: 'Veil Scanner',
        category: variant.template.category || '',
        severity: variant.template.severity || 'high',
        confidence: variant.template.confidence || 'firm',
        title: variant.template.title,
        description: variant.template.description || variant.template.title,
        remediation: variant.template.remediation || '',
        url: sent.request.url,
        method: sent.request.method,
        statusCode: sent.response?.statusCode || null,
        flowIds: [sourceFlow.id, sent.historyFlowId].filter(Boolean),
        evidence: [
          `Template: ${variant.template.id}`,
          `Insertion point: ${variant.point.type}:${variant.point.name}`,
          `Payload: ${variant.payload}`,
          matched.evidence || '',
        ],
      },
      sourceFlow,
    );
    findings.push(finding);
  }

  return {
    index: variant.index,
    templateId: variant.template.id,
    title: variant.template.title,
    insertionPoint: variant.point,
    statusCode: sent.response?.statusCode || null,
    durationMs: sent.durationMs,
    historyFlowId: sent.historyFlowId || '',
    matched: Boolean(matched),
    findingId: finding?.id || '',
    error: sent.error || null,
  };
}

function matchTemplate(template, flow, payload) {
  const matchers = Array.isArray(template.matchers) ? template.matchers : [];
  if (matchers.length === 0) return null;
  const matches = [];

  for (const matcher of matchers) {
    const match = matchOne(matcher, flow, payload);
    if (match) {
      matches.push(match);
    } else if (String(template.condition || 'and').toLowerCase() !== 'or') {
      return null;
    }
  }

  if (matches.length === 0) return null;
  return {
    evidence: matches.map((item) => item.evidence).filter(Boolean).join('; '),
  };
}

function matchOne(matcher = {}, flow, payload) {
  if (matcher.type === 'reflection') {
    const reflected = String(flow.response?.bodyText || '').includes(payload) || headersText(flow.response?.headers).includes(payload);
    return reflected ? { evidence: 'Payload reflected in response.' } : null;
  }

  const part = String(matcher.part || 'response.body');
  const value = partValue(flow, part);
  if (matcher.type === 'status') {
    const expected = Array.isArray(matcher.status) ? matcher.status.map(Number) : [Number(matcher.status)];
    const status = Number(flow.response?.statusCode || 0);
    return expected.includes(status) ? { evidence: `Status ${status}` } : null;
  }

  if (matcher.type === 'status_range') {
    const status = Number(flow.response?.statusCode || 0);
    const min = Number(matcher.min || 0);
    const max = Number(matcher.max || 999);
    return status >= min && status <= max ? { evidence: `Status ${status}` } : null;
  }

  const text = String(value || '');
  if (matcher.type === 'contains') {
    const needle = String(matcher.value || '');
    return needle && text.includes(needle) ? { evidence: `${part} contains ${needle}` } : null;
  }

  if (matcher.type === 'not_contains') {
    const needle = String(matcher.value || '');
    return needle && !text.includes(needle) ? { evidence: `${part} does not contain ${needle}` } : null;
  }

  if (matcher.type === 'contains_payload') {
    return payload && text.includes(payload) ? { evidence: `${part} contains payload.` } : null;
  }

  if (matcher.type === 'regex') {
    try {
      const regex = new RegExp(String(matcher.pattern || ''), matcher.flags || 'i');
      const match = text.match(regex);
      return match ? { evidence: `${part} matched ${match[0].slice(0, 160)}` } : null;
    } catch {
      return null;
    }
  }

  if (matcher.type === 'not_regex') {
    try {
      const regex = new RegExp(String(matcher.pattern || ''), matcher.flags || 'i');
      return regex.test(text) ? null : { evidence: `${part} did not match ${matcher.pattern}` };
    } catch {
      return null;
    }
  }

  return null;
}

function buildActiveVariants(request, templates) {
  const variants = [];
  let index = 0;
  for (const template of templates) {
    const payloads = Array.isArray(template.payloads) ? template.payloads.map(String).filter(Boolean) : [];
    const insertionTypes = new Set(Array.isArray(template.insertionPoints) ? template.insertionPoints : ['query']);
    const points = insertionPointsForRequest(request).filter((point) => insertionTypes.has(point.type));
    for (const point of points) {
      for (const payload of payloads) {
        const mutated = mutateRequest(request, point, payload);
        if (!mutated) continue;
        variants.push({
          index: ++index,
          template,
          point,
          payload,
          request: mutated,
        });
      }
    }
  }
  return variants;
}

function insertionPointsForRequest(request) {
  const points = [];
  const parsed = safeUrl(request.url);
  if (parsed) {
    const entries = [...parsed.searchParams.keys()];
    for (const name of entries.length > 0 ? entries : ['veil_scan']) {
      points.push({ type: 'query', name });
    }
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    if (pathSegments.length > 0) {
      points.push({ type: 'path', name: 'last-segment' });
    }
  }

  const headers = normalizeHeaders(request.headers);
  const contentType = String(headers['content-type'] || '').toLowerCase();
  const body = String(request.bodyText || '');
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(body);
    const keys = [...params.keys()];
    for (const name of keys.length > 0 ? keys : ['veil_scan']) {
      points.push({ type: 'form', name });
    }
  }

  if (contentType.includes('application/json')) {
    const parsedBody = parseJson(body);
    if (parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody)) {
      const keys = Object.keys(parsedBody);
      for (const name of keys.length > 0 ? keys : ['veilScan']) {
        points.push({ type: 'json', name });
      }
    }
  }

  if (contentType.includes('xml') && body.trim()) {
    points.push({ type: 'xml', name: 'document' });
  }

  return points;
}

function mutateRequest(request, point, payload) {
  const next = {
    method: String(request.method || 'GET').toUpperCase(),
    url: request.url,
    headers: cloneActiveHeaders(request.headers),
    bodyText: String(request.bodyText || ''),
  };

  if (point.type === 'query') {
    const parsed = safeUrl(next.url);
    if (!parsed) return null;
    parsed.searchParams.set(point.name, payload);
    next.url = parsed.href;
    return next;
  }

  if (point.type === 'path') {
    const parsed = safeUrl(next.url);
    if (!parsed) return null;
    const segments = parsed.pathname.split('/');
    const lastIndex = Math.max(1, segments.length - 1);
    segments[lastIndex] = payload;
    parsed.pathname = segments.join('/');
    next.url = parsed.href;
    return next;
  }

  if (point.type === 'form') {
    const params = new URLSearchParams(next.bodyText);
    params.set(point.name, payload);
    next.bodyText = params.toString();
    next.headers['content-type'] = next.headers['content-type'] || 'application/x-www-form-urlencoded';
    return next;
  }

  if (point.type === 'json') {
    const parsed = parseJson(next.bodyText);
    const body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    body[point.name] = payload;
    next.bodyText = JSON.stringify(body);
    next.headers['content-type'] = next.headers['content-type'] || 'application/json';
    return next;
  }

  if (point.type === 'xml') {
    next.bodyText = payload;
    next.headers['content-type'] = next.headers['content-type'] || 'application/xml';
    return next;
  }

  return null;
}

function addTemplateFinding(findings, flow, template, matched) {
  const url = safeUrl(flow.request.url);
  const id = `template:${template.id}:${url?.host || 'unknown'}:${url?.pathname || flow.request.url}`;
  const existing = findings.get(id);
  const finding =
    existing ||
    {
      id,
      source: 'scanner',
      evidenceSource: 'passive_scan',
      reporter: 'Veil Scanner',
      category: template.category || '',
      confidence: template.confidence || 'firm',
      severity: template.severity || 'information',
      title: template.title || template.id,
      description: template.description || template.title || template.id,
      remediation: template.remediation || '',
      host: url?.host || '',
      path: url ? url.pathname || '/' : '',
      url: flow.request.url,
      method: flow.request.method || '',
      statusCode: flow.response?.statusCode || null,
      count: 0,
      flowIds: new Set(),
      evidence: new Set(),
      firstSeenAt: flow.startedAt,
      lastSeenAt: flow.startedAt,
    };

  finding.count += 1;
  finding.flowIds.add(flow.id);
  finding.evidence.add(template.evidence || matched.evidence || template.id);
  finding.firstSeenAt = Math.min(finding.firstSeenAt || flow.startedAt, flow.startedAt);
  finding.lastSeenAt = Math.max(finding.lastSeenAt || flow.startedAt, flow.startedAt);
  findings.set(id, finding);
}

function toFlowLike(sent) {
  return {
    type: 'http',
    request: sent.request || null,
    response: sent.response || null,
  };
}

function partValue(flow, part) {
  if (part === 'request.url') return flow.request?.url || '';
  if (part === 'request.path') return safeUrl(flow.request?.url)?.pathname || '';
  if (part === 'request.headers') return headersText(flow.request?.headers);
  if (part === 'request.body') return flow.request?.bodyText || '';
  if (part === 'response.status') return String(flow.response?.statusCode || '');
  if (part === 'response.headers') return headersText(flow.response?.headers);
  if (part === 'response.body') return flow.response?.bodyText || '';
  if (part === 'all') {
    return [
      flow.request?.url || '',
      headersText(flow.request?.headers),
      flow.request?.bodyText || '',
      String(flow.response?.statusCode || ''),
      headersText(flow.response?.headers),
      flow.response?.bodyText || '',
    ].join('\n');
  }
  return '';
}

function headersText(headers = {}) {
  return Object.entries(headers || {})
    .map(([name, value]) => `${String(name).toLowerCase()}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    .join('\n');
}

function normalizeHeaders(headers = {}) {
  const normalized = {};
  for (const [name, value] of Object.entries(headers || {})) {
    normalized[String(name).toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return normalized;
}

function cloneActiveHeaders(headers = {}) {
  const cloned = normalizeHeaders(headers);
  delete cloned.host;
  delete cloned['content-length'];
  delete cloned['proxy-connection'];
  delete cloned.connection;
  return cloned;
}

function parseJson(value) {
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return null;
  }
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

module.exports = {
  buildTemplateFindings,
  loadActiveTemplates,
  loadPassiveTemplates,
  runActiveScan,
};
