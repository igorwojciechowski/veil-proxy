const net = require('net');
const { ControlledPayloadRegistry } = require('./controlledPayloads');

const DEFAULT_OPTIONS = {
  aggressivePathRedaction: false,
  redactHosts: true,
  redactCookieNames: true,
  redactCookieValues: true,
  redactAuthorization: true,
  redactPlatformHeaders: false,
  maxBodyChars: 256 * 1024,
};

const PLATFORM_HEADERS = new Set(['server', 'x-powered-by', 'via', 'x-aspnet-version', 'x-runtime']);
const LOCATION_HEADERS = new Set(['origin', 'referer', 'referrer', 'location']);
const AUTH_HEADERS = new Set(['authorization', 'proxy-authorization']);
const SENSITIVE_FIELD_TOKENS = new Set([
  'apikey',
  'api_key',
  'auth',
  'authorization',
  'bearer',
  'clientsecret',
  'credential',
  'credentials',
  'csrf',
  'mfa',
  'otp',
  'pass',
  'passcode',
  'passwd',
  'password',
  'pin',
  'privatekey',
  'pwd',
  'refresh',
  'secret',
  'session',
  'token',
  'xsrf',
]);

class AliasVault {
  constructor() {
    this.reset();
  }

  reset() {
    this.maps = new Map();
    this.counters = new Map();
  }

  mappingCount() {
    let count = 0;
    for (const map of this.maps.values()) {
      count += map.size;
    }
    return count;
  }

  alias(kind, value, factory = null) {
    const normalized = String(value || '');
    if (!normalized) {
      return normalized;
    }
    if (!this.maps.has(kind)) {
      this.maps.set(kind, new Map());
    }
    const map = this.maps.get(kind);
    if (map.has(normalized)) {
      return map.get(normalized);
    }
    const next = (this.counters.get(kind) || 0) + 1;
    this.counters.set(kind, next);
    const alias = factory ? factory(next, normalized) : `${kind}-${next}`;
    map.set(normalized, alias);
    return alias;
  }
}

class HttpAnonymizer {
  constructor(aliasVault = new AliasVault(), controlledPayloads = new ControlledPayloadRegistry()) {
    this.aliasVault = aliasVault;
    this.controlledPayloads = controlledPayloads;
  }

  anonymizeHttpMessage(raw, direction = 'auto', options = {}) {
    const merged = { ...DEFAULT_OPTIONS, ...options };
    const source = String(raw || '');
    const evidence = this.controlledEvidence(source, merged);
    const parsed = parseHttpMessage(source);
    if (!parsed) {
      const result = this.anonymizeText(source, merged);
      return { ...result, evidence };
    }

    const inferredDirection = direction === 'auto' || !direction ? parsed.direction : direction;
    const replacements = [];
    const decisions = [];
    const headers = parsed.headers.map((header) => {
      const result = this.anonymizeHeader(header, inferredDirection, merged);
      replacements.push(...result.replacements);
      decisions.push(...result.decisions);
      return { ...header, value: result.value };
    });

    const bodyResult = this.anonymizeBody(parsed.body, headers, merged);
    replacements.push(...bodyResult.replacements);
    decisions.push(...bodyResult.decisions);

    const startLine = this.anonymizeStartLine(parsed.startLine, inferredDirection, merged).text;
    const nextHeaders = updateContentLength(headers, bodyResult.text);
    const text = [
      startLine,
      ...nextHeaders.map((header) => `${header.name}: ${header.value}`),
      '',
      bodyResult.text,
    ].join('\r\n');

    return {
      text,
      replacements,
      decisions,
      evidence,
    };
  }

  anonymizeText(text, options = {}) {
    const merged = { ...DEFAULT_OPTIONS, ...options };
    const source = String(text || '');
    const replacements = [];
    const decisions = [];
    const result = this.redactText(source, merged, replacements, decisions);
    return {
      text: result,
      replacements,
      decisions,
      evidence: this.controlledEvidence(source, merged),
    };
  }

  anonymizeUrl(value, options = {}) {
    const merged = { ...DEFAULT_OPTIONS, ...options };
    return anonymizeUrlValue(String(value || ''), merged, this.aliasVault, [], []).text;
  }

  anonymizeHeader(header, direction, options) {
    const name = header.name || '';
    const lower = name.toLowerCase();
    const replacements = [];
    const decisions = [];
    let value = String(header.value || '');

    if (AUTH_HEADERS.has(lower) && options.redactAuthorization) {
      const alias = this.aliasVault.alias('auth-token', value);
      replacements.push({ kind: 'auth-token', originalLength: value.length, replacement: alias });
      decisions.push({ area: 'header', name, rule: 'authorization' });
      return { value: authHeaderAlias(value, alias), replacements, decisions };
    }

    if (lower === 'host' && options.redactHosts) {
      const alias = anonymizeHostPort(value, this.aliasVault);
      replacements.push({ kind: 'host', originalLength: value.length, replacement: alias });
      decisions.push({ area: 'header', name, rule: 'host' });
      return { value: alias, replacements, decisions };
    }

    if (lower === 'cookie') {
      value = anonymizeCookieHeader(value, options, this.aliasVault, replacements, decisions);
      return { value, replacements, decisions };
    }

    if (lower === 'set-cookie') {
      value = anonymizeSetCookieHeader(value, options, this.aliasVault, replacements, decisions);
      return { value, replacements, decisions };
    }

    if (LOCATION_HEADERS.has(lower)) {
      value = anonymizeUrlValue(value, options, this.aliasVault, replacements, decisions).text;
      return { value, replacements, decisions };
    }

    if (PLATFORM_HEADERS.has(lower) && options.redactPlatformHeaders) {
      const alias = this.aliasVault.alias('platform', value);
      replacements.push({ kind: 'platform', originalLength: value.length, replacement: alias });
      decisions.push({ area: 'header', name, rule: 'platform-header' });
      return { value: alias, replacements, decisions };
    }

    value = this.redactText(value, options, replacements, decisions);
    return { value, replacements, decisions };
  }

  anonymizeStartLine(startLine, direction, options) {
    if (direction === 'response') {
      return { text: startLine };
    }
    const parts = String(startLine || '').split(' ');
    if (parts.length < 2) {
      return { text: startLine };
    }
    const replacements = [];
    const decisions = [];
    parts[1] = anonymizeUrlValue(parts[1], options, this.aliasVault, replacements, decisions).text;
    return { text: parts.join(' ') };
  }

  anonymizeBody(body, headers, options) {
    const replacements = [];
    const decisions = [];
    const source = String(body || '');
    if (!source) {
      return { text: '', replacements, decisions };
    }

    const clipped = source.length > options.maxBodyChars ? source.slice(0, options.maxBodyChars) : source;
    const contentType = headerValue(headers, 'content-type').toLowerCase();

    if (contentType.includes('application/json') || looksLikeJson(clipped)) {
      try {
        const parsed = JSON.parse(clipped);
        const redacted = redactStructuredValue(parsed, {
          redactString: (value) => this.redactText(value, options, replacements, decisions),
          redactSensitive: (key, value) => redactSensitiveFieldValue(key, value, this.aliasVault, replacements, decisions, 'body'),
        });
        return {
          text: JSON.stringify(redacted, null, 2),
          replacements,
          decisions,
        };
      } catch {
        // Fall through to text redaction.
      }
    }

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(clipped);
      for (const [name, value] of [...params.entries()]) {
        params.set(
          name,
          isSensitiveFieldName(name)
            ? redactSensitiveFieldValue(name, value, this.aliasVault, replacements, decisions, 'form')
            : this.redactText(value, options, replacements, decisions),
        );
      }
      return { text: params.toString(), replacements, decisions };
    }

    return {
      text: this.redactText(clipped, options, replacements, decisions),
      replacements,
      decisions,
    };
  }

  redactText(value, options, replacements, decisions) {
    let text = String(value || '');

    text = text.replace(/https?:\/\/[^\s"'<>\\)]+/gi, (match) => {
      const result = anonymizeUrlValue(match, options, this.aliasVault, replacements, decisions);
      return result.text;
    });

    text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (match) => {
      const alias = this.aliasVault.alias('email', match.toLowerCase(), (index) => `user-${index}@example.invalid`);
      replacements.push({ kind: 'email', originalLength: match.length, replacement: alias });
      decisions.push({ area: 'text', rule: 'email' });
      return alias;
    });

    text = text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (match) => {
      if (!net.isIP(match)) return match;
      const alias = this.aliasVault.alias('ip', match);
      replacements.push({ kind: 'ip', originalLength: match.length, replacement: alias });
      decisions.push({ area: 'text', rule: 'ip' });
      return alias;
    });

    text = text.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, (match) => {
      const alias = this.aliasVault.alias('uuid', match.toLowerCase());
      replacements.push({ kind: 'uuid', originalLength: match.length, replacement: alias });
      decisions.push({ area: 'text', rule: 'uuid' });
      return alias;
    });

    text = text.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g, (match) => {
      const alias = this.aliasVault.alias('jwt', match);
      replacements.push({ kind: 'jwt', originalLength: match.length, replacement: alias });
      decisions.push({ area: 'text', rule: 'jwt' });
      return alias;
    });

    text = text.replace(/\b(?=[A-Za-z0-9+/_-]{28,}\b)(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9+/_=-]{28,}\b/g, (match) => {
      if (match.startsWith('VEILCANARY-') || match.startsWith('SQLIVEIL-') || match.startsWith('XSSVEIL-')) {
        return match;
      }
      const alias = this.aliasVault.alias('secret', match);
      replacements.push({ kind: 'secret', originalLength: match.length, replacement: alias });
      decisions.push({ area: 'text', rule: 'long-secret' });
      return alias;
    });

    return text;
  }

  controlledEvidence(source, options) {
    if (!this.controlledPayloads || typeof this.controlledPayloads.collectEvidence !== 'function') {
      return [];
    }
    return this.controlledPayloads.collectEvidence(source, {
      sanitizeSnippet: (snippet) => this.redactText(snippet, options, [], []),
    });
  }
}

function parseHttpMessage(raw) {
  const split = raw.indexOf('\r\n\r\n') >= 0 ? raw.indexOf('\r\n\r\n') : raw.indexOf('\n\n');
  const headerBlock = split >= 0 ? raw.slice(0, split) : raw;
  const body = split >= 0 ? raw.slice(split + (raw[split] === '\r' ? 4 : 2)) : '';
  const lines = headerBlock.replace(/\r\n/g, '\n').split('\n');
  const startLine = lines.shift() || '';
  if (!startLine) return null;
  const direction = /^HTTP\/\d(?:\.\d)?\s+\d{3}/i.test(startLine) ? 'response' : 'request';
  const headers = [];
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    headers.push({
      name: line.slice(0, colon).trim(),
      value: line.slice(colon + 1).trim(),
    });
  }
  return { startLine, direction, headers, body };
}

function anonymizeUrlValue(value, options, aliasVault, replacements, decisions) {
  const text = String(value || '');
  try {
    const parsed = new URL(text, text.startsWith('/') ? 'http://placeholder.invalid' : undefined);
    if (options.redactHosts && parsed.hostname && parsed.hostname !== 'placeholder.invalid') {
      const original = parsed.host;
      parsed.host = anonymizeHostPort(parsed.host, aliasVault);
      replacements.push({ kind: 'host', originalLength: original.length, replacement: parsed.host });
      decisions.push({ area: 'url', rule: 'host' });
    }
    if (options.aggressivePathRedaction) {
      parsed.pathname = parsed.pathname
        .split('/')
        .map((segment) => (segment ? aliasVault.alias('path', segment) : ''))
        .join('/');
    }
    for (const [name, paramValue] of [...parsed.searchParams.entries()]) {
      parsed.searchParams.set(name, redactUrlParamValue(name, paramValue, options, aliasVault, replacements, decisions));
    }
    if (text.startsWith('/')) {
      return { text: `${parsed.pathname}${parsed.search}${parsed.hash}` };
    }
    return { text: parsed.toString() };
  } catch {
    return { text };
  }
}

function redactUrlParamValue(name, value, options, aliasVault, replacements, decisions) {
  if (isSensitiveFieldName(name)) {
    return redactSensitiveFieldValue(name, value, aliasVault, replacements, decisions, 'url-param');
  }
  const anonymizer = new HttpAnonymizer(aliasVault);
  return anonymizer.redactText(value, options, replacements, decisions);
}

function anonymizeHostPort(value, aliasVault) {
  const raw = String(value || '').trim();
  const bracketed = raw.match(/^\[([^\]]+)](?::(\d+))?$/);
  if (bracketed) {
    return aliasVault.alias('host', bracketed[1], (index) => `app-${index}.example.invalid`);
  }
  const lastColon = raw.lastIndexOf(':');
  const host = lastColon > -1 && raw.indexOf(':') === lastColon ? raw.slice(0, lastColon) : raw;
  return aliasVault.alias('host', host.toLowerCase(), (index) => `app-${index}.example.invalid`);
}

function anonymizeCookieHeader(value, options, aliasVault, replacements, decisions) {
  return String(value || '')
    .split(';')
    .map((part) => {
      const [rawName, ...rawValue] = part.trim().split('=');
      if (!rawName) return '';
      const originalValue = rawValue.join('=');
      const name = options.redactCookieNames ? aliasVault.alias('cookie', rawName, (index) => `cookie_${index}`) : rawName;
      const cookieValue = options.redactCookieValues ? aliasVault.alias('cookie-value', originalValue || rawName) : originalValue;
      replacements.push({ kind: 'cookie', originalLength: part.length, replacement: `${name}=${cookieValue}` });
      decisions.push({ area: 'header', name: 'Cookie', rule: 'cookie' });
      return `${name}=${cookieValue}`;
    })
    .filter(Boolean)
    .join('; ');
}

function anonymizeSetCookieHeader(value, options, aliasVault, replacements, decisions) {
  const parts = String(value || '').split(';');
  const first = parts.shift() || '';
  const [rawName, ...rawValue] = first.trim().split('=');
  const name = options.redactCookieNames ? aliasVault.alias('cookie', rawName, (index) => `cookie_${index}`) : rawName;
  const cookieValue = options.redactCookieValues ? aliasVault.alias('cookie-value', rawValue.join('=') || rawName) : rawValue.join('=');
  const attrs = parts.map((part) => {
    const trimmed = part.trim();
    if (/^domain=/i.test(trimmed) || /^path=/i.test(trimmed)) {
      return trimmed.replace(/=(.*)$/i, '=redacted');
    }
    return trimmed;
  });
  replacements.push({ kind: 'set-cookie', originalLength: value.length, replacement: `${name}=${cookieValue}` });
  decisions.push({ area: 'header', name: 'Set-Cookie', rule: 'cookie' });
  return [`${name}=${cookieValue}`, ...attrs].filter(Boolean).join('; ');
}

function authHeaderAlias(value, alias) {
  const lower = String(value || '').toLowerCase();
  if (lower.startsWith('bearer ')) return `Bearer ${alias}`;
  if (lower.startsWith('basic ')) return `Basic ${alias}`;
  return alias;
}

function updateContentLength(headers, body) {
  const length = Buffer.byteLength(String(body || ''));
  let changed = false;
  const next = headers.map((header) => {
    if (header.name.toLowerCase() === 'content-length') {
      changed = true;
      return { ...header, value: String(length) };
    }
    return header;
  });
  return changed ? next : next;
}

function headerValue(headers, name) {
  const wanted = String(name || '').toLowerCase();
  const header = headers.find((item) => item.name.toLowerCase() === wanted);
  return header ? String(header.value || '') : '';
}

function looksLikeJson(text) {
  const trimmed = String(text || '').trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

function redactStructuredValue(value, handlers, key = '') {
  if (key && isSensitiveFieldName(key)) {
    return handlers.redactSensitive(key, value);
  }
  if (typeof value === 'string') return handlers.redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactStructuredValue(item, handlers));
  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, nested] of Object.entries(value)) {
      next[key] = redactStructuredValue(nested, handlers, key);
    }
    return next;
  }
  return value;
}

function redactSensitiveFieldValue(fieldName, value, aliasVault, replacements, decisions, area) {
  if (value === null || value === undefined || value === '') {
    return value;
  }
  const original = typeof value === 'string' ? value : JSON.stringify(value);
  const alias = aliasVault.alias('secret', `${fieldName}:${original}`);
  replacements.push({ kind: 'sensitive-field', field: String(fieldName || ''), originalLength: String(original || '').length, replacement: alias });
  decisions.push({ area, name: String(fieldName || ''), rule: 'sensitive-field' });
  return alias;
}

function isSensitiveFieldName(name) {
  const raw = String(name || '');
  if (!raw) return false;
  const normalized = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  if (!compact) return false;
  if (
    compact.includes('password') ||
    compact.includes('passwd') ||
    compact.includes('passphrase') ||
    compact.includes('clientsecret') ||
    compact.includes('privatekey') ||
    compact.includes('apikey') ||
    compact.includes('accesstoken') ||
    compact.includes('refreshtoken') ||
    compact.includes('idtoken') ||
    compact.includes('securityanswer')
  ) {
    return true;
  }
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.includes('security') && tokens.includes('answer')) return true;
  return tokens.some((token) => SENSITIVE_FIELD_TOKENS.has(token));
}

module.exports = {
  AliasVault,
  HttpAnonymizer,
  ControlledPayloadRegistry,
};
