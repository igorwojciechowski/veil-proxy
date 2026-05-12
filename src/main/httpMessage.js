const zlib = require('zlib');

function headersArrayToObject(rawHeaders = []) {
  const headers = {};
  for (let i = 0; i < rawHeaders.length; i += 2) {
    headers[rawHeaders[i].toLowerCase()] = rawHeaders[i + 1];
  }
  return headers;
}

function normalizeHeaderObject(headers = {}) {
  const normalized = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || value === null) {
      continue;
    }
    normalized[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return normalized;
}

function objectToRawHeaders(headers = {}) {
  const raw = [];
  for (const [name, value] of Object.entries(headers)) {
    raw.push(name, String(value));
  }
  return raw;
}

function decodeBody(headers = {}, body = Buffer.alloc(0)) {
  const normalized = normalizeHeaderObject(headers);
  const encoding = (normalized['content-encoding'] || 'identity').toLowerCase();
  let decoded = body;
  let decodedEncoding = encoding;

  try {
    if (encoding.includes('gzip')) {
      decoded = zlib.gunzipSync(body);
      decodedEncoding = 'gzip';
    } else if (encoding.includes('deflate')) {
      decoded = zlib.inflateSync(body);
      decodedEncoding = 'deflate';
    } else if (encoding.includes('br')) {
      decoded = zlib.brotliDecompressSync(body);
      decodedEncoding = 'br';
    }
  } catch {
    decoded = body;
    decodedEncoding = 'binary';
  }

  return {
    encoding: decodedEncoding,
    text: bufferToDisplayText(decoded),
  };
}

function encodeBodyForClient(response) {
  if (!response) {
    return Buffer.alloc(0);
  }

  if (response.bodyBase64) {
    return Buffer.from(response.bodyBase64, 'base64');
  }

  if (typeof response.bodyText === 'string') {
    return Buffer.from(response.bodyText);
  }

  return Buffer.alloc(0);
}

function bufferToDisplayText(buffer) {
  if (!buffer || buffer.length === 0) {
    return '';
  }

  const text = buffer.toString('utf8');
  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  if (replacementCount > Math.max(3, text.length * 0.05)) {
    return buffer.toString('base64');
  }
  return text;
}

function shouldKeepBody(method, statusCode) {
  if (String(method).toUpperCase() === 'HEAD') {
    return false;
  }
  const code = Number(statusCode);
  return !(code >= 100 && code < 200) && code !== 204 && code !== 304;
}

function readResponseBody(stream, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    let truncated = false;

    stream.on('data', (chunk) => {
      length += chunk.length;
      if (length <= maxBytes) {
        chunks.push(chunk);
      } else if (!truncated) {
        const allowed = Math.max(0, chunk.length - (length - maxBytes));
        if (allowed > 0) {
          chunks.push(chunk.subarray(0, allowed));
        }
        truncated = true;
      }
    });

    stream.on('end', () => {
      const body = Buffer.concat(chunks);
      body.truncated = truncated;
      resolve(body);
    });
    stream.on('error', reject);
  });
}

module.exports = {
  decodeBody,
  encodeBodyForClient,
  headersArrayToObject,
  normalizeHeaderObject,
  objectToRawHeaders,
  readResponseBody,
  shouldKeepBody,
};
