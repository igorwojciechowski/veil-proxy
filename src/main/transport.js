const http = require('http');
const net = require('net');
const tls = require('tls');
const { Buffer } = require('buffer');
const { normalizeHeaderObject, readResponseBody } = require('./httpMessage');

const socketReadBuffers = new WeakMap();
const httpSocketPool = new Map();
const HTTP_POOL_IDLE_MS = 20_000;
const HTTP_POOL_MAX_IDLE_PER_KEY = 6;

function createTransport(targetUrl, upstream) {
  if (!upstream || upstream.mode === 'direct') {
    const port = Number(targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80));
    return connectDirect(targetUrl.hostname, port, targetUrl.protocol === 'https:');
  }

  if (upstream.mode === 'http') {
    return connectViaHttpProxy(targetUrl, upstream);
  }

  if (upstream.mode === 'socks5') {
    const port = Number(targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80));
    return connectViaSocks5(targetUrl.hostname, port, targetUrl.protocol === 'https:', upstream);
  }

  throw new Error(`Unsupported upstream mode: ${upstream.mode}`);
}

function createTunnel({ host, port, upstream }) {
  if (!upstream || upstream.mode === 'direct') {
    return connectDirect(host, port, false);
  }

  if (upstream.mode === 'http') {
    return connectHttpProxyTunnel(host, port, upstream);
  }

  if (upstream.mode === 'socks5') {
    return connectViaSocks5(host, port, false, upstream);
  }

  throw new Error(`Unsupported upstream mode: ${upstream.mode}`);
}

async function requestViaTransport({ targetUrl, method, headers, body, upstream, maxBodyBytes }) {
  if (targetUrl.protocol === 'http:' && (!upstream || upstream.mode === 'direct')) {
    return requestHttpDirect({ targetUrl, method, headers, body, maxBodyBytes });
  }

  const poolKey = reusableHttpPoolKey(targetUrl, upstream);
  const socket = (poolKey && takePooledSocket(poolKey)) || (await createTransport(targetUrl, upstream));
  const requestPath =
    upstream && upstream.mode === 'http' && targetUrl.protocol === 'http:'
      ? targetUrl.href
      : `${targetUrl.pathname || '/'}${targetUrl.search || ''}`;
  const normalizedHeaders = normalizeHeaderObject(headers);
  normalizedHeaders.host = targetUrl.host;
  normalizedHeaders.connection = poolKey ? 'keep-alive' : 'close';
  delete normalizedHeaders['proxy-connection'];
  if (upstream && upstream.mode === 'http' && targetUrl.protocol === 'http:' && upstream.username) {
    normalizedHeaders['proxy-authorization'] = `Basic ${Buffer.from(`${upstream.username}:${upstream.password || ''}`).toString('base64')}`;
  }

  const requestHead = [
    `${method} ${requestPath} HTTP/1.1`,
    ...Object.entries(normalizedHeaders).map(([name, value]) => `${name}: ${value}`),
    '',
    '',
  ].join('\r\n');

  socket.write(requestHead);
  if (body && body.length > 0) {
    socket.write(body);
  }

  try {
    const response = await readRawHttpResponse(socket, maxBodyBytes);
    if (poolKey && response.reusable && !shouldCloseConnection(response.headers) && !socket.destroyed) {
      releasePooledSocket(poolKey, socket);
    } else {
      socket.destroy();
    }
    return response;
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

function reusableHttpPoolKey(targetUrl, upstream) {
  if (targetUrl.protocol !== 'http:' || !upstream || !['http', 'socks5'].includes(upstream.mode)) {
    return '';
  }

  const upstreamKey = [
    upstream.mode,
    upstream.host || '',
    Number(upstream.port || 0),
    upstream.username || '',
    upstream.password ? 'auth' : '',
  ].join(':');
  return `${upstreamKey}->${targetUrl.protocol}//${targetUrl.host}`;
}

function takePooledSocket(poolKey) {
  const sockets = httpSocketPool.get(poolKey);
  if (!sockets) {
    return null;
  }

  while (sockets.length > 0) {
    const entry = sockets.pop();
    clearTimeout(entry.timer);
    if (!entry.socket.destroyed && entry.socket.readable && entry.socket.writable) {
      return entry.socket;
    }
  }

  httpSocketPool.delete(poolKey);
  return null;
}

function releasePooledSocket(poolKey, socket) {
  socket.removeAllListeners('timeout');
  socket.setTimeout(0);
  socket.setNoDelay(true);

  const sockets = httpSocketPool.get(poolKey) || [];
  const entry = {
    socket,
    timer: setTimeout(() => {
      const current = httpSocketPool.get(poolKey) || [];
      const index = current.indexOf(entry);
      if (index !== -1) {
        current.splice(index, 1);
      }
      if (current.length === 0) {
        httpSocketPool.delete(poolKey);
      }
      socket.destroy();
    }, HTTP_POOL_IDLE_MS),
  };
  entry.timer.unref?.();

  sockets.push(entry);

  while (sockets.length > HTTP_POOL_MAX_IDLE_PER_KEY) {
    const stale = sockets.shift();
    clearTimeout(stale.timer);
    stale.socket.destroy();
  }

  httpSocketPool.set(poolKey, sockets);
}

function closeIdleTransports() {
  for (const sockets of httpSocketPool.values()) {
    for (const entry of sockets) {
      clearTimeout(entry.timer);
      entry.socket.destroy();
    }
  }
  httpSocketPool.clear();
}

function requestHttpDirect({ targetUrl, method, headers, body, maxBodyBytes }) {
  return new Promise((resolve, reject) => {
    const normalizedHeaders = normalizeHeaderObject(headers);
    normalizedHeaders.host = targetUrl.host;
    normalizedHeaders.connection = 'close';
    delete normalizedHeaders['proxy-connection'];

    const req = http.request(
      {
        hostname: targetUrl.hostname,
        port: Number(targetUrl.port || 80),
        method,
        path: `${targetUrl.pathname || '/'}${targetUrl.search || ''}`,
        headers: normalizedHeaders,
      },
      async (res) => {
        try {
          const bodyBuffer = await readResponseBody(res, maxBodyBytes);
          resolve({
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            headers: res.headers,
            rawHeaders: res.rawHeaders,
            body: bodyBuffer,
          });
        } catch (error) {
          reject(error);
        }
      },
    );

    req.on('error', reject);
    if (body && body.length > 0) {
      req.write(body);
    }
    req.end();
  });
}

function connectDirect(host, port, secure) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    socket.once('error', reject);
    socket.once('connect', () => {
      socket.off('error', reject);
      if (!secure) {
        resolve(socket);
        return;
      }

      const tlsSocket = tls.connect({
        socket,
        servername: host,
      });
      tlsSocket.once('error', reject);
      tlsSocket.once('secureConnect', () => {
        tlsSocket.off('error', reject);
        resolve(tlsSocket);
      });
    });
  });
}

async function connectViaHttpProxy(targetUrl, upstream) {
  if (targetUrl.protocol === 'http:') {
    return connectDirect(upstream.host, Number(upstream.port), false);
  }

  return connectHttpProxyTunnel(
    targetUrl.hostname,
    Number(targetUrl.port || 443),
    upstream,
    true,
    targetUrl.hostname,
  );
}

function connectHttpProxyTunnel(host, port, upstream, secureAfterConnect = false, servername = host) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: upstream.host, port: Number(upstream.port) });
    socket.once('error', reject);
    socket.once('connect', () => {
      const auth = upstream.username
        ? `Proxy-Authorization: Basic ${Buffer.from(`${upstream.username}:${upstream.password || ''}`).toString('base64')}\r\n`
        : '';
      socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}\r\n`);
    });

    readUntil(socket, '\r\n\r\n')
      .then(({ head, rest }) => {
        const statusLine = head.toString('latin1').split('\r\n')[0] || '';
        if (!/^HTTP\/1\.[01] 2\d\d /.test(statusLine)) {
          throw new Error(`HTTP upstream CONNECT failed: ${statusLine}`);
        }

        if (rest.length > 0) {
          socket.unshift(rest);
        }

        socket.off('error', reject);
        if (!secureAfterConnect) {
          resolve(socket);
          return;
        }

        const tlsSocket = tls.connect({ socket, servername });
        tlsSocket.once('error', reject);
        tlsSocket.once('secureConnect', () => {
          tlsSocket.off('error', reject);
          resolve(tlsSocket);
        });
      })
      .catch(reject);
  });
}

function connectViaSocks5(host, port, secure, upstream) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: upstream.host, port: Number(upstream.port) });
    socket.once('error', reject);
    socket.once('connect', () => {
      if (upstream.username) {
        socket.write(Buffer.from([0x05, 0x02, 0x00, 0x02]));
      } else {
        socket.write(Buffer.from([0x05, 0x01, 0x00]));
      }
    });

    readExact(socket, 2)
      .then(async (methodResponse) => {
        if (methodResponse[0] !== 0x05) {
          throw new Error('Invalid SOCKS5 greeting response.');
        }
        if (methodResponse[1] === 0xff) {
          throw new Error('SOCKS5 upstream did not accept an offered auth method.');
        }
        if (methodResponse[1] === 0x02) {
          const username = Buffer.from(upstream.username || '');
          const password = Buffer.from(upstream.password || '');
          if (username.length > 255 || password.length > 255) {
            throw new Error('SOCKS5 username/password is too long.');
          }
          socket.write(Buffer.concat([Buffer.from([0x01, username.length]), username, Buffer.from([password.length]), password]));
          const authResponse = await readExact(socket, 2);
          if (authResponse[1] !== 0x00) {
            throw new Error('SOCKS5 authentication failed.');
          }
        }

        const portBuffer = Buffer.alloc(2);
        portBuffer.writeUInt16BE(Number(port), 0);
        socket.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00]), encodeSocksAddress(host), portBuffer]));

        const connectHead = await readExact(socket, 4);
        if (connectHead[1] !== 0x00) {
          throw new Error(`SOCKS5 connect failed with code 0x${connectHead[1].toString(16).padStart(2, '0')}.`);
        }

        const addressType = connectHead[3];
        if (addressType === 0x01) {
          await readExact(socket, 4);
        } else if (addressType === 0x03) {
          const length = await readExact(socket, 1);
          await readExact(socket, length[0]);
        } else if (addressType === 0x04) {
          await readExact(socket, 16);
        } else {
          throw new Error('Invalid SOCKS5 bind address type.');
        }
        await readExact(socket, 2);

        socket.off('error', reject);
        if (!secure) {
          resolve(socket);
          return;
        }

        const tlsSocket = tls.connect({ socket, servername: host });
        tlsSocket.once('error', reject);
        tlsSocket.once('secureConnect', () => {
          tlsSocket.off('error', reject);
          resolve(tlsSocket);
        });
      })
      .catch(reject);
  });
}

function encodeSocksAddress(host) {
  const normalizedHost = String(host || '').trim();
  const ipVersion = net.isIP(normalizedHost);

  if (ipVersion === 4) {
    return Buffer.concat([Buffer.from([0x01]), encodeIpv4(normalizedHost)]);
  }

  if (ipVersion === 6) {
    return Buffer.concat([Buffer.from([0x04]), encodeIpv6(normalizedHost)]);
  }

  const hostBuffer = Buffer.from(normalizedHost);
  if (hostBuffer.length === 0) {
    throw new Error('SOCKS5 target host is empty.');
  }
  if (hostBuffer.length > 255) {
    throw new Error('SOCKS5 host name is too long.');
  }
  return Buffer.concat([Buffer.from([0x03, hostBuffer.length]), hostBuffer]);
}

function encodeIpv4(host) {
  const octets = host.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new Error(`Invalid IPv4 address for SOCKS5: ${host}`);
  }
  return Buffer.from(octets);
}

function encodeIpv6(host) {
  const normalized = host.split('%')[0].toLowerCase();
  const address = normalizeIpv6Address(normalized);
  const buffer = Buffer.alloc(16);
  address.forEach((part, index) => buffer.writeUInt16BE(part, index * 2));
  return buffer;
}

function normalizeIpv6Address(host) {
  let value = host;
  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    const ipv4Bytes = encodeIpv4(value.slice(lastColon + 1));
    const high = ipv4Bytes.readUInt16BE(0).toString(16);
    const low = ipv4Bytes.readUInt16BE(2).toString(16);
    value = `${value.slice(0, lastColon)}:${high}:${low}`;
  }

  const halves = value.split('::');
  if (halves.length > 2) {
    throw new Error(`Invalid IPv6 address for SOCKS5: ${host}`);
  }

  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
  const parts = [...left, ...Array(Math.max(0, missing)).fill('0'), ...right];

  if (parts.length !== 8) {
    throw new Error(`Invalid IPv6 address for SOCKS5: ${host}`);
  }

  return parts.map((part) => {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) {
      throw new Error(`Invalid IPv6 address for SOCKS5: ${host}`);
    }
    return Number.parseInt(part, 16);
  });
}

function readRawHttpResponse(socket, maxBodyBytes) {
  return readUntil(socket, '\r\n\r\n').then(async ({ head, rest }) => {
    const headerText = head.toString('latin1');
    const lines = headerText.split('\r\n');
    const statusLine = lines.shift() || '';
    const match = statusLine.match(/^HTTP\/\d\.\d\s+(\d{3})\s*(.*)$/);
    if (!match) {
      throw new Error(`Invalid upstream HTTP response: ${statusLine}`);
    }

    const rawHeaders = [];
    const headers = {};
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx === -1) {
        continue;
      }
      const name = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      rawHeaders.push(name, value);
      headers[name.toLowerCase()] = value;
    }

    const transferEncoding = String(headers['transfer-encoding'] || '').toLowerCase();
    const contentLength = parseContentLength(headers['content-length']);
    let reusable = true;
    let body;

    if (hasEmptyResponseBody(Number(match[1]))) {
      stashSocketBuffer(socket, rest);
      body = Buffer.alloc(0);
      body.truncated = false;
    } else if (transferEncoding.includes('chunked')) {
      body = await readChunkedBody(socket, rest, maxBodyBytes);
    } else if (contentLength !== null) {
      body = await readKnownLengthBody(socket, rest, contentLength, maxBodyBytes);
    } else {
      reusable = false;
      body = await readSocketBody(socket, rest, maxBodyBytes);
    }

    return {
      statusCode: Number(match[1]),
      statusMessage: match[2] || '',
      headers,
      rawHeaders,
      body,
      reusable,
    };
  });
}

async function readChunkedBody(socket, initial, maxBodyBytes) {
  stashSocketBuffer(socket, initial);
  const chunks = [];
  let length = 0;
  let truncated = false;

  while (true) {
    const sizeText = (await readLine(socket)).split(';')[0].trim();
    const size = Number.parseInt(sizeText, 16);
    if (!Number.isFinite(size)) {
      throw new Error(`Invalid chunk size from upstream: ${sizeText}`);
    }

    if (size === 0) {
      while ((await readLine(socket)) !== '') {
        // Drain trailers.
      }
      break;
    }

    const chunk = await readKnownLengthBody(socket, Buffer.alloc(0), size, Math.max(0, maxBodyBytes - length));
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    length += size;
    truncated = truncated || chunk.truncated || length > maxBodyBytes;

    const crlf = await readExact(socket, 2);
    if (crlf[0] !== 0x0d || crlf[1] !== 0x0a) {
      throw new Error('Invalid chunk terminator from upstream.');
    }
  }

  const body = Buffer.concat(chunks);
  body.truncated = truncated;
  return body;
}

function parseContentLength(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function hasEmptyResponseBody(statusCode) {
  return (statusCode >= 100 && statusCode < 200) || statusCode === 204 || statusCode === 304;
}

function shouldCloseConnection(headers) {
  return String(headers.connection || '').toLowerCase().includes('close');
}

function readUntil(socket, marker) {
  return new Promise((resolve, reject) => {
    let buffer = socketReadBuffers.get(socket) || Buffer.alloc(0);
    socketReadBuffers.delete(socket);
    const markerBuffer = Buffer.from(marker, 'latin1');

    const match = tryResolve();
    if (match) {
      resolve(match);
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
      const index = buffer.indexOf(markerBuffer);
      if (index === -1) {
        return null;
      }
      return {
        head: buffer.subarray(0, index),
        rest: buffer.subarray(index + markerBuffer.length),
      };
    }

    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('end', onEnd);
  });
}

async function readLine(socket) {
  const { head, rest } = await readUntil(socket, '\r\n');
  stashSocketBuffer(socket, rest);
  return head.toString('latin1');
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

function stashSocketBuffer(socket, chunk) {
  if (!chunk || chunk.length === 0) {
    return;
  }

  const existing = socketReadBuffers.get(socket);
  socketReadBuffers.set(socket, existing && existing.length > 0 ? Buffer.concat([chunk, existing]) : chunk);
}

function readSome(socket, maxLength) {
  return new Promise((resolve, reject) => {
    let buffer = socketReadBuffers.get(socket) || Buffer.alloc(0);
    socketReadBuffers.delete(socket);

    const buffered = takeFromBuffer();
    if (buffered) {
      resolve(buffered);
      return;
    }

    const onData = (chunk) => {
      buffer = chunk;
      const result = takeFromBuffer();
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

    function takeFromBuffer() {
      if (buffer.length === 0) {
        return null;
      }

      const wanted = buffer.subarray(0, maxLength);
      const rest = buffer.subarray(wanted.length);
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

async function readKnownLengthBody(socket, initial, contentLength, maxBodyBytes) {
  stashSocketBuffer(socket, initial);

  const chunks = [];
  let remaining = contentLength;
  let stored = 0;
  let truncated = false;

  while (remaining > 0) {
    const chunk = await readSome(socket, remaining);
    remaining -= chunk.length;
    const capacity = Math.max(0, maxBodyBytes - stored);
    if (capacity > 0) {
      const storedChunk = chunk.length > capacity ? chunk.subarray(0, capacity) : chunk;
      chunks.push(storedChunk);
      stored += storedChunk.length;
    }
    truncated = truncated || chunk.length > capacity;
  }

  const body = Buffer.concat(chunks);
  body.truncated = truncated;
  return body;
}

function readSocketBody(socket, initial, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    let truncated = false;

    const push = (chunk) => {
      length += chunk.length;
      if (length <= maxBodyBytes) {
        chunks.push(chunk);
      } else if (!truncated) {
        const allowed = Math.max(0, chunk.length - (length - maxBodyBytes));
        if (allowed > 0) {
          chunks.push(chunk.subarray(0, allowed));
        }
        truncated = true;
      }
    };

    if (initial.length > 0) {
      push(initial);
    }

    socket.on('data', push);
    socket.on('error', reject);
    socket.on('end', () => {
      const body = Buffer.concat(chunks);
      body.truncated = truncated;
      resolve(body);
    });
  });
}

module.exports = {
  closeIdleTransports,
  createTransport,
  createTunnel,
  requestViaTransport,
};
