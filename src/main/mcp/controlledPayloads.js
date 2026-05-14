const DEFAULT_CANARY_PATTERN = '(?:VEILCANARY|XSSVEIL|SQLIVEIL|CMDVEIL|SSRFVEIL|SSTIVEIL|PATHVEIL)-[A-Za-z0-9_-]{3,}';
const DEFAULT_MARKER_PATTERN = '(?:VEILCANARY|XSSVEIL|SQLIVEIL|CMDVEIL|SSRFVEIL|SSTIVEIL|PATHVEIL)';
const DEFAULT_CANARY = new RegExp(`(^|[^A-Za-z0-9_-])(${DEFAULT_CANARY_PATTERN})(?![A-Za-z0-9_-])`, 'g');
const DEFAULT_MARKER = new RegExp(`(^|[^A-Za-z0-9_-])(${DEFAULT_MARKER_PATTERN})(?![A-Za-z0-9_-])`, 'g');
const MAX_EVIDENCE = 20;
const MAX_PAYLOADS = 500;

class ControlledPayloadRegistry {
  constructor() {
    this.payloads = [];
  }

  register(payload) {
    const text = String(payload || '').trim();
    if (!text) {
      return null;
    }
    if (!this.payloads.includes(text)) {
      this.payloads.unshift(text);
      this.payloads.length = Math.min(this.payloads.length, MAX_PAYLOADS);
    }
    return this.summaryForPayload(text);
  }

  registerMany(payloads) {
    for (const payload of Array.isArray(payloads) ? payloads : []) {
      this.register(payload);
    }
  }

  clear() {
    this.payloads = [];
  }

  count() {
    return this.payloads.length;
  }

  list() {
    return this.payloads.map((payload) => this.summaryForPayload(payload));
  }

  canaries() {
    const found = new Set();
    for (const payload of this.payloads) {
      for (const canary of findCanaries(payload)) {
        found.add(canary);
      }
    }
    return [...found];
  }

  collectEvidence(value, options = {}) {
    const source = String(value || '');
    if (!source) {
      return [];
    }

    const evidence = [];
    const seen = new Set();
    const variants = decodedVariants(source);
    for (const variant of variants) {
      this.collectFromVariant(variant.text, variant.encoding, evidence, seen, options);
      if (evidence.length >= MAX_EVIDENCE) {
        break;
      }
    }
    return evidence.slice(0, MAX_EVIDENCE);
  }

  collectFromVariant(source, encoding, evidence, seen, options) {
    for (const match of findCanaryMatches(source)) {
      const canary = match.value;
      const registered = this.payloads.find((payload) => payload.includes(canary) && source.includes(payload));
      const payloadRef = registered ? this.payloadRef(registered) : '';
      const snippet = evidenceSnippet(source, match.start, match.end);
      this.pushEvidence(
        evidence,
        seen,
        {
          type: 'controlled_reflection',
          canary,
          matched: registered ? payloadRef : canary,
          payloadRef,
          payloadIntegrity: registered ? 'full_payload' : 'canary',
          encoding,
          context: classifyContext(snippet),
          snippet: sanitizeSnippet(snippet, options),
        },
      );
      if (evidence.length >= MAX_EVIDENCE) return;
    }

    for (const match of findMarkerMatches(source)) {
      const marker = match.value;
      const snippet = evidenceSnippet(source, match.start, match.end);
      this.pushEvidence(
        evidence,
        seen,
        {
          type: 'controlled_marker',
          canary: marker,
          matched: marker,
          payloadRef: '',
          payloadIntegrity: 'marker_with_context',
          encoding,
          context: classifyContext(snippet),
          snippet: sanitizeSnippet(snippet, options),
        },
      );
      if (evidence.length >= MAX_EVIDENCE) return;
    }

    for (const payload of this.payloads) {
      if (payload.length < 4) {
        continue;
      }
      const index = source.indexOf(payload);
      if (index < 0) {
        continue;
      }
      const canary = findCanaries(payload)[0] || '';
      const payloadRef = this.payloadRef(payload);
      const snippet = evidenceSnippet(source, index, index + payload.length);
      this.pushEvidence(
        evidence,
        seen,
        {
          type: 'controlled_reflection',
          canary,
          matched: payloadRef,
          payloadRef,
          payloadIntegrity: 'full_payload',
          encoding,
          context: classifyContext(snippet),
          snippet: sanitizeSnippet(snippet, options),
        },
      );
      if (evidence.length >= MAX_EVIDENCE) return;
    }
  }

  pushEvidence(evidence, seen, item) {
    const key = [item.type, item.encoding, item.canary, item.payloadRef, item.payloadIntegrity, item.snippet].join('|');
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    evidence.push(item);
  }

  payloadRef(payload) {
    const index = this.payloads.indexOf(payload);
    return index >= 0 ? `controlled-payload-${index + 1}` : 'controlled-payload';
  }

  summaryForPayload(payload) {
    return {
      id: this.payloadRef(payload),
      length: payload.length,
      canaries: findCanaries(payload),
      rawPayloadReturned: false,
    };
  }
}

function decodedVariants(source) {
  const variants = [{ encoding: 'raw', text: source }];
  const html = decodeHtmlEntities(source);
  if (html !== source) {
    variants.push({ encoding: 'html_entity', text: html });
  }
  const url = safeDecodeURIComponent(source);
  if (url !== source) {
    variants.push({ encoding: 'url', text: url });
    const urlHtml = decodeHtmlEntities(url);
    if (urlHtml !== url) {
      variants.push({ encoding: 'url_html_entity', text: urlHtml });
    }
  }
  return variants;
}

function findCanaries(source) {
  return findCanaryMatches(source).map((match) => match.value);
}

function findCanaryMatches(source) {
  return findMatches(source, DEFAULT_CANARY);
}

function findMarkerMatches(source) {
  return findMatches(source, DEFAULT_MARKER);
}

function findMatches(source, pattern) {
  const results = [];
  pattern.lastIndex = 0;
  for (const match of source.matchAll(pattern)) {
    const prefix = match[1] || '';
    const value = match[2] || '';
    if (!value) continue;
    const start = (match.index || 0) + prefix.length;
    results.push({ value, start, end: start + value.length });
  }
  return results;
}

function evidenceSnippet(source, start, end) {
  const from = Math.max(0, start - 140);
  const to = Math.min(source.length, end + 140);
  return source.slice(from, to).replace(/\s+/g, ' ').trim();
}

function classifyContext(snippet) {
  const text = String(snippet || '');
  if (/<script\b|javascript:|onerror\s*=|onload\s*=|alert\s*\(/i.test(text)) return 'script';
  if (/\b(?:SQLITE_ERROR|syntax\s+error|ORA-\d+|PostgreSQL|MySQL|Exception|Traceback)\b/i.test(text)) return 'security_signal';
  if (/<[a-z][\s\S]*>/i.test(text)) return 'html';
  return 'text';
}

function sanitizeSnippet(snippet, options) {
  const text = String(snippet || '');
  if (typeof options.sanitizeSnippet !== 'function') {
    return text.slice(0, 360);
  }
  return String(options.sanitizeSnippet(text) || '').slice(0, 360);
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, '%20'));
  } catch {
    return String(value || '');
  }
}

module.exports = {
  ControlledPayloadRegistry,
  DEFAULT_CANARY,
  DEFAULT_MARKER,
};
