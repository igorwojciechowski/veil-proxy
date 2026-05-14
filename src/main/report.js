const SEVERITIES = ['high', 'medium', 'low', 'info'];

function buildReport({ config = {}, history = [], siteMap = null, findings = [], project = null, generatedAt = new Date().toISOString() } = {}) {
  const requests = Array.isArray(history) ? history.filter((flow) => flow && flow.type !== 'connect') : [];
  const hosts = Array.isArray(siteMap?.hosts) ? siteMap.hosts : [];
  const activeFindings = Array.isArray(findings) ? findings : [];
  const durations = requests.map((flow) => Number(flow.durationMs)).filter((value) => Number.isFinite(value) && value >= 0);

  return {
    version: 1,
    generatedAt,
    project: sanitizeProject(project),
    summary: {
      requests: requests.length,
      hosts: hosts.length,
      siteMapPaths: hosts.reduce((count, host) => count + (Array.isArray(host.paths) ? host.paths.length : 0), 0),
      inScopeRequests: requests.filter((flow) => flow.inScope === true).length,
      outOfScopeRequests: requests.filter((flow) => flow.inScope === false).length,
      findings: activeFindings.length,
      findingsBySeverity: countFindingsBySeverity(activeFindings),
      methods: countBy(requests, (flow) => flow.method || 'UNKNOWN'),
      statuses: countBy(requests, (flow) => statusBucket(flow)),
      durationMs: {
        min: durations.length ? Math.min(...durations) : null,
        median: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        max: durations.length ? Math.max(...durations) : null,
      },
    },
    scope: sanitizeScope(config.scope),
    upstreams: sanitizeUpstreams(config.upstreams),
    topHosts: topBy(requests, (flow) => flow.host || 'unknown', 12).map(([host, count]) => ({ host, count })),
    topPaths: topBy(requests, (flow) => `${flow.host || 'unknown'} ${flow.path || '/'}`, 16).map(([key, count]) => {
      const [host, ...pathParts] = key.split(' ');
      return { host, path: pathParts.join(' ') || '/', count };
    }),
    findings: activeFindings.map(sanitizeFinding),
  };
}

function renderMarkdownReport(report) {
  const lines = [];
  const projectName = report.project?.name || 'Unsaved project';

  lines.push('# Veil Proxy Report');
  lines.push('');
  lines.push(`Generated: ${formatDate(report.generatedAt)}`);
  lines.push(`Project: ${projectName}`);
  if (report.project?.path) {
    lines.push(`Project file: ${report.project.path}`);
  }
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | ---: |');
  lines.push(`| Requests | ${report.summary.requests} |`);
  lines.push(`| Hosts | ${report.summary.hosts} |`);
  lines.push(`| Site map paths | ${report.summary.siteMapPaths} |`);
  lines.push(`| In-scope requests | ${report.summary.inScopeRequests} |`);
  lines.push(`| Out-of-scope requests | ${report.summary.outOfScopeRequests} |`);
  lines.push(`| Findings | ${report.summary.findings} |`);
  lines.push(`| Median duration | ${formatMs(report.summary.durationMs.median)} |`);
  lines.push(`| P95 duration | ${formatMs(report.summary.durationMs.p95)} |`);
  lines.push('');

  lines.push('## Findings By Severity');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('| --- | ---: |');
  for (const severity of SEVERITIES) {
    lines.push(`| ${titleCase(severity)} | ${report.summary.findingsBySeverity[severity] || 0} |`);
  }
  lines.push('');

  lines.push('## Top Hosts');
  lines.push('');
  lines.push('| Host | Requests |');
  lines.push('| --- | ---: |');
  for (const item of report.topHosts) {
    lines.push(`| ${markdownCell(item.host)} | ${item.count} |`);
  }
  if (report.topHosts.length === 0) {
    lines.push('| None | 0 |');
  }
  lines.push('');

  lines.push('## Scope');
  lines.push('');
  lines.push(`Enabled: ${report.scope.enabled ? 'yes' : 'no'}`);
  lines.push('');
  lines.push('| Action | Field | Operator | Value | Enabled |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const rule of report.scope.rules) {
    lines.push(
      `| ${markdownCell(rule.action)} | ${markdownCell(rule.field)} | ${markdownCell(rule.operator)} | ${markdownCell(rule.value)} | ${
        rule.enabled ? 'yes' : 'no'
      } |`,
    );
  }
  if (report.scope.rules.length === 0) {
    lines.push('| - | - | - | No scope rules | - |');
  }
  lines.push('');

  lines.push('## Findings');
  lines.push('');
  if (report.findings.length === 0) {
    lines.push('No passive findings.');
  }
  for (const finding of report.findings) {
    lines.push(`### ${titleCase(finding.severity)}: ${finding.title}`);
    lines.push('');
    lines.push(`Host: ${finding.host || 'unknown'}`);
    lines.push(`Path: ${finding.path || '/'}`);
    lines.push(`Count: ${finding.count}`);
    lines.push(`Request IDs: ${finding.flowIds.join(', ') || '-'}`);
    lines.push(`Last seen: ${formatDate(finding.lastSeenAt)}`);
    lines.push('');
    lines.push(finding.description || '');
    if (finding.evidence.length > 0) {
      lines.push('');
      lines.push('Evidence:');
      for (const item of finding.evidence) {
        lines.push(`- ${item}`);
      }
    }
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

function sanitizeProject(project) {
  if (!project || typeof project !== 'object') return null;
  return {
    name: String(project.name || ''),
    path: String(project.path || ''),
    exists: project.exists !== false,
  };
}

function sanitizeScope(scope) {
  const raw = scope && typeof scope === 'object' ? scope : {};
  const rules = Array.isArray(raw.rules) ? raw.rules : [];
  return {
    enabled: raw.enabled === true,
    rules: rules.map((rule) => ({
      id: String(rule.id || ''),
      enabled: rule.enabled !== false,
      action: ['include', 'exclude'].includes(rule.action) ? rule.action : 'include',
      field: String(rule.field || 'url'),
      operator: String(rule.operator || 'contains'),
      value: String(rule.value || ''),
    })),
  };
}

function sanitizeUpstreams(upstreams) {
  if (!Array.isArray(upstreams)) return [];
  return upstreams.map((upstream) => ({
    id: String(upstream.id || ''),
    enabled: upstream.enabled !== false,
    mode: String(upstream.mode || 'direct'),
    host: String(upstream.host || ''),
    port: Number(upstream.port || 0),
    username: upstream.username ? '[set]' : '',
    password: upstream.password ? '[redacted]' : '',
    rules: Array.isArray(upstream.rules) ? upstream.rules.map(sanitizeUpstreamRule).filter(Boolean) : [],
  }));
}

function sanitizeUpstreamRule(rule) {
  if (rule && typeof rule === 'object') {
    return {
      matchType: String(rule.matchType || 'domain'),
      pattern: String(rule.pattern || ''),
      includeSubdomains: rule.includeSubdomains !== false,
    };
  }
  const text = String(rule || '').trim();
  return text ? { matchType: 'domain', pattern: text, includeSubdomains: true } : null;
}

function sanitizeFinding(finding) {
  return {
    id: String(finding.id || ''),
    severity: SEVERITIES.includes(finding.severity) ? finding.severity : 'info',
    title: String(finding.title || ''),
    description: String(finding.description || ''),
    host: String(finding.host || ''),
    path: String(finding.path || ''),
    url: String(finding.url || ''),
    count: Number(finding.count || 0),
    flowIds: Array.isArray(finding.flowIds) ? finding.flowIds.map((id) => String(id)) : [],
    evidence: Array.isArray(finding.evidence) ? finding.evidence.map((item) => String(item)) : [],
    firstSeenAt: finding.firstSeenAt || null,
    lastSeenAt: finding.lastSeenAt || null,
  };
}

function countFindingsBySeverity(findings) {
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const finding of findings) {
    const severity = SEVERITIES.includes(finding.severity) ? finding.severity : 'info';
    counts[severity] += 1;
  }
  return counts;
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = String(keyFn(item) || 'unknown');
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function topBy(items, keyFn, limit) {
  const counts = new Map();
  for (const item of items) {
    const key = String(keyFn(item) || 'unknown');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function statusBucket(flow) {
  if (flow.error) return 'errors';
  const status = Number(flow.statusCode);
  if (!Number.isFinite(status)) return 'open';
  if (status >= 200 && status <= 299) return '2xx';
  if (status >= 300 && status <= 399) return '3xx';
  if (status >= 400 && status <= 499) return '4xx';
  if (status >= 500 && status <= 599) return '5xx';
  return String(status);
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value} ms` : '-';
}

function formatDate(value) {
  if (!value) return '-';
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? '-' : date.toISOString();
}

function markdownCell(value) {
  return String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(value) {
  const text = String(value || '');
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : '';
}

module.exports = {
  buildReport,
  renderMarkdownReport,
};
