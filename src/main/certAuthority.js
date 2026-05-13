const fs = require('fs');
const os = require('os');
const path = require('path');
const tls = require('tls');
const net = require('net');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

class CertificateAuthority {
  constructor(certDir) {
    this.certDir = certDir || path.join(os.tmpdir(), 'veil-proxy-certs');
    this.caKeyPath = path.join(this.certDir, 'veil-proxy-ca.key');
    this.caCertPath = path.join(this.certDir, 'veil-proxy-ca.crt');
    this.hostDir = path.join(this.certDir, 'hosts');
    this.contexts = new Map();
    this.ensureCa();
  }

  getSecureContext(host) {
    const normalizedHost = normalizeHost(host);
    if (this.contexts.has(normalizedHost)) {
      return this.contexts.get(normalizedHost);
    }

    const certificate = this.ensureHostCertificate(normalizedHost);
    const context = tls.createSecureContext({
      key: fs.readFileSync(certificate.keyPath),
      cert: fs.readFileSync(certificate.certPath),
    });
    this.contexts.set(normalizedHost, context);
    return context;
  }

  ensureCa() {
    fs.mkdirSync(this.hostDir, { recursive: true, mode: 0o700 });
    if (fs.existsSync(this.caKeyPath) && fs.existsSync(this.caCertPath)) {
      return;
    }

    runOpenSsl(['genrsa', '-out', this.caKeyPath, '2048']);
    runOpenSsl([
      'req',
      '-x509',
      '-new',
      '-nodes',
      '-key',
      this.caKeyPath,
      '-sha256',
      '-days',
      '3650',
      '-out',
      this.caCertPath,
      '-subj',
      '/CN=Veil Proxy Local CA/O=Veil Proxy',
    ]);
    fs.chmodSync(this.caKeyPath, 0o600);
  }

  ensureHostCertificate(host) {
    const safeName = crypto.createHash('sha256').update(host).digest('hex').slice(0, 32);
    const keyPath = path.join(this.hostDir, `${safeName}.key`);
    const csrPath = path.join(this.hostDir, `${safeName}.csr`);
    const certPath = path.join(this.hostDir, `${safeName}.crt`);
    const extPath = path.join(this.hostDir, `${safeName}.ext`);

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return { keyPath, certPath };
    }

    runOpenSsl(['genrsa', '-out', keyPath, '2048']);
    runOpenSsl(['req', '-new', '-key', keyPath, '-out', csrPath, '-subj', `/CN=${escapeSubject(host)}`]);
    fs.writeFileSync(extPath, hostCertificateExtensions(host));
    runOpenSsl([
      'x509',
      '-req',
      '-in',
      csrPath,
      '-CA',
      this.caCertPath,
      '-CAkey',
      this.caKeyPath,
      '-CAcreateserial',
      '-out',
      certPath,
      '-days',
      '825',
      '-sha256',
      '-extfile',
      extPath,
    ]);
    fs.chmodSync(keyPath, 0o600);
    return { keyPath, certPath };
  }
}

function hostCertificateExtensions(host) {
  const isIp = net.isIP(host);
  const san = isIp ? `IP.1 = ${host}` : `DNS.1 = ${host}`;
  return [
    'basicConstraints = CA:FALSE',
    'keyUsage = digitalSignature, keyEncipherment',
    'extendedKeyUsage = serverAuth',
    'subjectAltName = @alt_names',
    '',
    '[alt_names]',
    san,
    '',
  ].join('\n');
}

function normalizeHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  if (!normalized) {
    throw new Error('Cannot generate HTTPS certificate for an empty host.');
  }
  return normalized;
}

function escapeSubject(value) {
  return String(value).replace(/[\\/]/g, '\\$&');
}

function runOpenSsl(args) {
  execFileSync('openssl', args, { stdio: 'pipe' });
}

module.exports = {
  CertificateAuthority,
};
