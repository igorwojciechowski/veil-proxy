const crypto = require('crypto');

class SecretVault {
  constructor() {
    this.secrets = new Map();
  }

  add(secret = {}) {
    const id = String(secret.id || crypto.randomUUID());
    const name = sanitizeSecretName(secret.name || `SECRET_${this.secrets.size + 1}`);
    const value = String(secret.value || '');
    if (!value) {
      throw new Error('Secret value is required.');
    }
    const record = {
      id,
      name,
      value,
      description: String(secret.description || ''),
      enabled: secret.enabled !== false,
      alias: secret.alias || `$secret:${name}:${crypto.randomBytes(8).toString('hex')}`,
      createdAt: secret.createdAt || new Date().toISOString(),
      lastUsedAt: secret.lastUsedAt || null,
    };
    this.secrets.set(id, record);
    return this.summary(record);
  }

  remove(id) {
    return this.secrets.delete(String(id || ''));
  }

  setEnabled(id, enabled) {
    const secret = this.secrets.get(String(id || ''));
    if (!secret) {
      return null;
    }
    secret.enabled = enabled === true;
    return this.summary(secret);
  }

  regenerateAlias(id) {
    const secret = this.secrets.get(String(id || ''));
    if (!secret) {
      return null;
    }
    secret.alias = `$secret:${secret.name}:${crypto.randomBytes(8).toString('hex')}`;
    secret.lastUsedAt = null;
    return this.summary(secret);
  }

  clear() {
    this.secrets.clear();
  }

  list() {
    return [...this.secrets.values()].map((secret) => this.summary(secret));
  }

  activeSummaries() {
    return this.list().filter((secret) => secret.enabled);
  }

  count() {
    return this.secrets.size;
  }

  summary(secret) {
    return {
      id: secret.id,
      name: secret.name,
      description: secret.description,
      alias: secret.alias,
      enabled: secret.enabled,
      lastUsedAt: secret.lastUsedAt,
      createdAt: secret.createdAt,
    };
  }

  resolveText(text) {
    let result = String(text || '');
    const usedAliases = [];
    const blockedAliases = [];
    for (const secret of this.secrets.values()) {
      const encodedAlias = encodeURIComponent(secret.alias);
      const hasPlainAlias = result.includes(secret.alias);
      const hasEncodedAlias = result.includes(encodedAlias);
      if (!hasPlainAlias && !hasEncodedAlias) {
        continue;
      }
      if (!secret.enabled) {
        blockedAliases.push(secret.alias);
        continue;
      }
      result = result.split(secret.alias).join(secret.value);
      result = result.split(encodedAlias).join(encodeURIComponent(secret.value));
      secret.lastUsedAt = new Date().toISOString();
      usedAliases.push(secret.alias);
    }
    return { text: result, usedAliases, blockedAliases };
  }

  resolveRequest(request = {}) {
    const usedAliases = new Set();
    const blockedAliases = new Set();
    const resolve = (value) => {
      const result = this.resolveText(value);
      result.usedAliases.forEach((alias) => usedAliases.add(alias));
      result.blockedAliases.forEach((alias) => blockedAliases.add(alias));
      return result.text;
    };

    const headers = {};
    for (const [name, value] of Object.entries(request.headers || {})) {
      headers[name] = resolve(value);
    }

    const bodyText = resolve(request.bodyText || '');
    const bodyBuffer = Buffer.from(bodyText);
    if (bodyBuffer.length > 0) {
      headers['content-length'] = String(bodyBuffer.length);
    } else {
      delete headers['content-length'];
    }

    return {
      request: {
        ...request,
        url: resolve(request.url || ''),
        headers,
        bodyText,
        bodyBase64: bodyBuffer.toString('base64'),
      },
      usedAliases: [...usedAliases],
      blockedAliases: [...blockedAliases],
    };
  }

  redactSecrets(text) {
    let result = String(text || '');
    const ordered = [...this.secrets.values()].sort((a, b) => b.value.length - a.value.length);
    for (const secret of ordered) {
      if (!secret.value) continue;
      result = result.split(encodeURIComponent(secret.value)).join(encodeURIComponent(secret.alias));
      result = result.split(secret.value).join(secret.alias);
    }
    return result;
  }
}

function sanitizeSecretName(value) {
  const cleaned = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'SECRET';
}

module.exports = {
  SecretVault,
};
