function buildFindings(history = []) {
  const findings = new Map();

  for (const flow of history) {
    if (!flow || flow.type !== 'http' || !flow.request) {
      continue;
    }

    inspectCleartextHttp(findings, flow);
    inspectSensitiveRequestData(findings, flow);
    inspectServerError(findings, flow);
    inspectSecurityHeaders(findings, flow);
    inspectCookies(findings, flow);
    inspectCors(findings, flow);
  }

  return [...findings.values()]
    .map((finding) => ({
      ...finding,
      flowIds: [...finding.flowIds],
      evidence: [...finding.evidence].slice(0, 6),
    }))
    .sort((a, b) => {
      const severityDelta = severityWeight(b.severity) - severityWeight(a.severity);
      if (severityDelta !== 0) return severityDelta;
      return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
    });
}

function inspectCleartextHttp(findings, flow) {
  const url = safeUrl(flow.request.url);
  if (!url || url.protocol !== 'http:') return;
  addFinding(findings, flow, {
    id: `cleartext-http:${url.host}`,
    severity: 'medium',
    title: 'Cleartext HTTP traffic',
    description: 'Traffic for this host is sent over HTTP, so credentials and session tokens can be observed or modified in transit.',
    evidence: flow.request.url,
  });
}

function inspectSensitiveRequestData(findings, flow) {
  const url = safeUrl(flow.request.url);
  if (!url) return;

  const evidence = [];
  for (const [name, value] of url.searchParams.entries()) {
    if (isSensitiveName(name) || looksLikeSecret(value)) {
      evidence.push(`query:${name}`);
    }
  }

  const headers = normalizeHeaders(flow.request.headers);
  for (const name of ['authorization', 'cookie', 'x-api-key']) {
    if (headers[name]) {
      evidence.push(`header:${name}`);
    }
  }

  const body = String(flow.request.bodyText || '');
  if (body && /(password|passwd|token|secret|api[_-]?key|access[_-]?key|jwt|bearer)\s*[=:]/i.test(body)) {
    evidence.push('body:sensitive-keyword');
  }

  if (evidence.length === 0) return;
  addFinding(findings, flow, {
    id: `sensitive-request-data:${url.host}:${url.pathname}`,
    severity: 'high',
    title: 'Sensitive data in request',
    description: 'The request contains credentials, tokens, cookies, or secret-looking values. Verify transport, logging, and caching behavior.',
    evidence: evidence.join(', '),
  });
}

function inspectServerError(findings, flow) {
  const status = Number(flow.response && flow.response.statusCode);
  if (status < 500 || status > 599) return;
  const url = safeUrl(flow.request.url);
  addFinding(findings, flow, {
    id: `server-error:${url?.host || 'unknown'}:${url?.pathname || flow.request.url}`,
    severity: 'medium',
    title: 'Server error response',
    description: 'A 5xx response can indicate unstable behavior, unhandled exceptions, or a target path worth retesting manually.',
    evidence: String(status),
  });
}

function inspectSecurityHeaders(findings, flow) {
  if (!flow.response) return;
  const url = safeUrl(flow.request.url);
  if (!url || url.protocol !== 'https:') return;

  const headers = normalizeHeaders(flow.response.headers);
  const missing = [];
  if (!headers['strict-transport-security']) missing.push('strict-transport-security');
  if (!headers['content-security-policy']) missing.push('content-security-policy');
  if (!headers['x-content-type-options']) missing.push('x-content-type-options');

  if (missing.length === 0) return;
  addFinding(findings, flow, {
    id: `missing-security-headers:${url.host}`,
    severity: 'low',
    title: 'Missing browser security headers',
    description: 'HTTPS responses from this host are missing one or more common hardening headers.',
    evidence: missing.join(', '),
  });
}

function inspectCookies(findings, flow) {
  if (!flow.response) return;
  const headers = normalizeHeaders(flow.response.headers);
  const cookieHeader = headers['set-cookie'];
  if (!cookieHeader) return;

  const issues = [];
  for (const cookie of splitSetCookie(cookieHeader)) {
    const lower = cookie.toLowerCase();
    const name = cookie.split('=', 1)[0] || 'cookie';
    if (!lower.includes('httponly')) issues.push(`${name}:missing HttpOnly`);
    if (!lower.includes('secure')) issues.push(`${name}:missing Secure`);
    if (!lower.includes('samesite=')) issues.push(`${name}:missing SameSite`);
  }

  if (issues.length === 0) return;
  const url = safeUrl(flow.request.url);
  addFinding(findings, flow, {
    id: `weak-cookie-flags:${url?.host || 'unknown'}`,
    severity: 'medium',
    title: 'Weak cookie flags',
    description: 'One or more response cookies are missing common protection flags.',
    evidence: issues.join(', '),
  });
}

function inspectCors(findings, flow) {
  if (!flow.response) return;
  const headers = normalizeHeaders(flow.response.headers);
  if (headers['access-control-allow-origin'] !== '*') return;
  const withCredentials = String(headers['access-control-allow-credentials'] || '').toLowerCase() === 'true';
  const url = safeUrl(flow.request.url);
  addFinding(findings, flow, {
    id: `cors-wildcard-origin:${url?.host || 'unknown'}`,
    severity: withCredentials ? 'high' : 'low',
    title: 'Wildcard CORS origin',
    description: withCredentials
      ? 'The response combines wildcard CORS origin with credentials, which browsers reject but often signals a dangerous CORS intent.'
      : 'The response allows any origin. Confirm this is intentional for the exposed resource.',
    evidence: withCredentials ? 'access-control-allow-origin: *, credentials: true' : 'access-control-allow-origin: *',
  });
}

function addFinding(findings, flow, input) {
  const url = safeUrl(flow.request.url);
  const id = input.id;
  const existing = findings.get(id);
  const finding =
    existing ||
    {
      id,
      severity: input.severity,
      title: input.title,
      description: input.description,
      host: url?.host || '',
      path: url ? url.pathname || '/' : '',
      url: flow.request.url,
      count: 0,
      flowIds: new Set(),
      evidence: new Set(),
      firstSeenAt: flow.startedAt,
      lastSeenAt: flow.startedAt,
    };

  finding.count += 1;
  finding.flowIds.add(flow.id);
  finding.evidence.add(input.evidence);
  finding.firstSeenAt = Math.min(finding.firstSeenAt || flow.startedAt, flow.startedAt);
  finding.lastSeenAt = Math.max(finding.lastSeenAt || flow.startedAt, flow.startedAt);
  findings.set(id, finding);
}

function normalizeHeaders(headers = {}) {
  const normalized = {};
  for (const [name, value] of Object.entries(headers || {})) {
    normalized[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return normalized;
}

function splitSetCookie(value) {
  return String(value || '')
    .split(/,(?=\s*[^;,\s]+=)/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isSensitiveName(name) {
  return /^(password|passwd|pass|token|access_token|refresh_token|secret|api[_-]?key|key|jwt|session|auth)$/i.test(String(name || ''));
}

function looksLikeSecret(value) {
  const text = String(value || '');
  return text.length >= 24 && /^[a-z0-9._~+/=-]+$/i.test(text);
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function severityWeight(severity) {
  if (severity === 'high') return 4;
  if (severity === 'medium') return 3;
  if (severity === 'low') return 2;
  return 1;
}

module.exports = {
  buildFindings,
};
