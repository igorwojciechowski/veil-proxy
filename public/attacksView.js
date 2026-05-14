(function () {
  function create(deps) {
    const { state, el, api, escapeHtml, markProjectDirty, setView, loadSentTraffic, renderFindings, renderMeta, shortSentId } = deps;

    function bind() {
      el.payloadAttackRows?.addEventListener('click', async (event) => {
        const row = event.target.closest('[data-payload-attack-id]');
        if (!row) return;
        await load(row.dataset.payloadAttackId);
      });
      el.payloadAttackResultRows?.addEventListener('click', async (event) => {
        const sentButton = event.target.closest('[data-sent-traffic-id-link]');
        if (sentButton) {
          await loadSentTraffic(sentButton.dataset.sentTrafficIdLink);
          setView('sentTraffic');
          return;
        }
        const findingButton = event.target.closest('[data-create-attack-finding]');
        if (findingButton) {
          await createFinding(Number(findingButton.dataset.createAttackFinding));
        }
      });
      el.clearPayloadAttacksBtn?.addEventListener('click', clear);
      el.payloadAttackSearch?.addEventListener('input', () => {
        state.payloadAttackSearch = el.payloadAttackSearch.value.trim().toLowerCase();
        render();
      });
      el.payloadAttackSort?.addEventListener('change', () => {
        state.payloadAttackSort = el.payloadAttackSort.value;
        render();
      });
      el.payloadAttackResultFilter?.addEventListener('change', () => {
        state.payloadAttackResultFilter = el.payloadAttackResultFilter.value;
        renderDetail();
      });
      el.payloadAttackResultSort?.addEventListener('change', () => {
        state.payloadAttackResultSort = el.payloadAttackResultSort.value;
        renderDetail();
      });
    }

    function render() {
      if (!el.payloadAttackRows) return;
      const allRecords = Array.isArray(state.payloadAttacks) ? state.payloadAttacks : [];
      const records = filteredAttacks(allRecords);
      if (el.payloadAttackSearch && el.payloadAttackSearch.value !== state.payloadAttackSearch) {
        el.payloadAttackSearch.value = state.payloadAttackSearch || '';
      }
      if (el.payloadAttackSort) {
        el.payloadAttackSort.value = state.payloadAttackSort || 'startedAt:desc';
      }
      el.payloadAttacksSubtitle.textContent = `${records.length} of ${allRecords.length} ${allRecords.length === 1 ? 'run' : 'runs'}`;
      el.clearPayloadAttacksBtn.disabled = allRecords.length === 0;
      el.payloadAttackRows.innerHTML =
        records
          .map((record) => {
            const rowClass = record.id === state.selectedPayloadAttackId ? 'selected' : '';
            const payloads = `${record.executed || 0}/${record.requestedPayloads || 0}`;
            const interesting = `${record.interesting || 0}${record.errors ? `, ${record.errors} err` : ''}`;
            return `
              <tr class="${rowClass}" data-payload-attack-id="${escapeHtml(record.id)}">
                <td title="${escapeHtml(record.id)}">${escapeHtml(shortAttackId(record.id))}</td>
                <td>${escapeHtml(record.sourceId ? `#${record.sourceId}` : '-')}</td>
                <td><span class="method-pill small">${escapeHtml(record.method || '-')}</span></td>
                <td title="${escapeHtml(record.host || '')}">${escapeHtml(record.host || '-')}</td>
                <td>${escapeHtml(payloads)}</td>
                <td><span class="status-pill ${record.errors ? 'error' : ''}">${escapeHtml(interesting)}</span></td>
                <td>${escapeHtml(record.durationMs == null ? '-' : `${record.durationMs}ms`)}</td>
              </tr>
            `;
          })
          .join('') || '<tr><td colspan="7"><div class="empty-state compact-empty">No payload attack runs match filters</div></td></tr>';

      renderDetail();
    }

    async function load(id) {
      state.selectedPayloadAttackId = id;
      state.selectedPayloadAttack = await api(`/api/payload-attacks/${encodeURIComponent(id)}`);
      render();
    }

    function renderDetail() {
      if (!el.payloadAttackDetail) return;
      const record = state.selectedPayloadAttack;
      if (!record) {
        el.emptyPayloadAttackDetail.classList.remove('hidden');
        el.payloadAttackDetail.classList.add('hidden');
        return;
      }

      if (el.payloadAttackResultFilter) {
        el.payloadAttackResultFilter.value = state.payloadAttackResultFilter || 'all';
      }
      if (el.payloadAttackResultSort) {
        el.payloadAttackResultSort.value = state.payloadAttackResultSort || 'index:asc';
      }
      const results = sortedResults(filteredResults(Array.isArray(record.results) ? record.results : []));
      el.emptyPayloadAttackDetail.classList.add('hidden');
      el.payloadAttackDetail.classList.remove('hidden');
      el.payloadAttackMethod.textContent = record.method || '-';
      el.payloadAttackUrl.textContent = record.url || '';
      el.payloadAttackStatus.textContent = `${record.interesting || 0} interesting`;
      el.payloadAttackStatus.classList.toggle('error', Boolean(record.errors));
      el.payloadAttackSummary.textContent = summaryText(record);
      el.payloadAttackResultRows.innerHTML =
        results
          .map((result) => {
            const signals = [
              result.interesting ? 'interesting' : '',
              result.statusChanged ? 'status' : '',
              result.payloadReflected ? 'reflected' : '',
              result.securitySignal ? 'security' : '',
              result.error ? 'error' : '',
            ].filter(Boolean);
            return `
              <tr class="${result.error ? 'error-row' : ''}">
                <td>${escapeHtml(String(result.index ?? '-'))}</td>
                <td title="${escapeHtml(result.payloadPreview || '')}"><code>${escapeHtml(result.payloadPreview || '-')}</code></td>
                <td><span class="status-pill ${result.error ? 'error' : ''}">${escapeHtml(result.error ? 'ERR' : String(result.statusCode || '-'))}</span></td>
                <td>${escapeHtml(result.responseBytesDelta == null ? '-' : signedNumber(result.responseBytesDelta))}</td>
                <td>${signals.map((signal) => `<span class="mini-chip">${escapeHtml(signal)}</span>`).join('') || '-'}</td>
                <td>${
                  result.sentTrafficId
                    ? `<button class="button ghost compact-button" type="button" data-sent-traffic-id-link="${escapeHtml(result.sentTrafficId)}">${escapeHtml(shortSentId(result.sentTrafficId))}</button>`
                    : '-'
                }</td>
                <td><button class="button ghost compact-button" type="button" data-create-attack-finding="${escapeHtml(String(result.index ?? ''))}">Create</button></td>
              </tr>
            `;
          })
          .join('') || '<tr><td colspan="7"><div class="empty-state compact-empty">No payload results match filters</div></td></tr>';
      el.payloadAttackMeta.textContent = JSON.stringify(
        {
          id: record.id,
          sourceId: record.sourceId,
          insertionPoint: record.insertionPoint || {},
          concurrency: record.concurrency || 1,
          startedAt: record.startedAt ? new Date(record.startedAt).toISOString() : null,
          completedAt: record.completedAt ? new Date(record.completedAt).toISOString() : null,
          statusCodes: record.statusCodes || {},
          secretAliasesUsed: record.secretAliasesUsed || [],
          detailsTruncated: record.detailsTruncated === true,
          details: record.details || [],
        },
        null,
        2,
      );
    }

    async function clear() {
      if (!state.payloadAttacks.length) return;
      if (!window.confirm('Clear payload attack run history? Sent traffic will stay intact.')) {
        return;
      }
      state.payloadAttacks = await api('/api/payload-attacks', { method: 'DELETE' });
      state.selectedPayloadAttackId = null;
      state.selectedPayloadAttack = null;
      render();
      markProjectDirty();
    }

    async function createFinding(index) {
      if (!state.selectedPayloadAttack || !Number.isFinite(index)) return;
      const result = await api(`/api/payload-attacks/${encodeURIComponent(state.selectedPayloadAttack.id)}/findings`, {
        method: 'POST',
        body: JSON.stringify({ resultIndex: index }),
      });
      state.findings = await api('/api/findings');
      renderFindings?.();
      renderMeta?.();
      window.alert(`Finding created: ${result.title || result.id}`);
      markProjectDirty();
    }

    function filteredAttacks(records) {
      const query = String(state.payloadAttackSearch || '').toLowerCase();
      return [...records]
        .filter((record) => {
          if (!query) return true;
          const haystack = [
            record.id,
            record.sourceId,
            record.method,
            record.url,
            record.host,
            insertionPointLabel(record.insertionPoint),
            statusCodesLabel(record.statusCodes),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(query);
        })
        .sort(compareBy(state.payloadAttackSort || 'startedAt:desc'));
    }

    function filteredResults(results) {
      const filter = state.payloadAttackResultFilter || 'all';
      return results.filter((result) => {
        if (filter === 'interesting') return result.interesting;
        if (filter === 'reflected') return result.payloadReflected;
        if (filter === 'security') return result.securitySignal;
        if (filter === 'errors') return result.error;
        return true;
      });
    }

    function sortedResults(results) {
      return [...results].sort(compareBy(state.payloadAttackResultSort || 'index:asc'));
    }

    function compareBy(sortValue) {
      const [key, direction] = String(sortValue || '').split(':');
      const factor = direction === 'asc' ? 1 : -1;
      return (a, b) => {
        const av = sortableValue(a, key);
        const bv = sortableValue(b, key);
        if (typeof av === 'number' && typeof bv === 'number') {
          return (av - bv) * factor;
        }
        return String(av).localeCompare(String(bv)) * factor;
      };
    }

    function sortableValue(item, key) {
      if (key === 'statusCode') return Number(item.statusCode || 0);
      if (key === 'responseBytesDelta') return Number(item.responseBytesDelta || 0);
      if (key === 'durationMs') return Number(item.durationMs || 0);
      if (key === 'interesting') return Number(item.interesting || 0);
      if (key === 'errors') return Number(item.errors || 0);
      if (key === 'reflectedCount') return Number(item.reflectedCount || 0);
      if (key === 'startedAt') return Number(item.startedAt || 0);
      if (key === 'index') return Number(item.index || 0);
      return item[key] || '';
    }

    return { bind, render, load, clear };
  }

  function summaryText(record) {
    return [
      `Attack ID: ${record.id || '-'}`,
      `Source: ${record.sourceId ? `#${record.sourceId}` : '-'}`,
      `Target: ${record.method || '-'} ${record.url || '-'}`,
      `Insertion: ${insertionPointLabel(record.insertionPoint)}`,
      `Payloads: ${record.executed || 0}/${record.requestedPayloads || 0}`,
      `Sent: ${record.sent || 0}`,
      `Errors: ${record.errors || 0}`,
      `Interesting: ${record.interesting || 0}`,
      `Reflected: ${record.reflectedCount || 0}`,
      `Security signals: ${record.securitySignalCount || 0}`,
      `Concurrency: ${record.concurrency || 1}`,
      `Delay: ${record.delayMillis || 0}ms`,
      `Duration: ${record.durationMs == null ? '-' : `${record.durationMs}ms`}`,
      `Status codes: ${statusCodesLabel(record.statusCodes)}`,
      `Secrets: ${(record.secretAliasesUsed || []).join(', ') || '-'}`,
    ].join('\n');
  }

  function insertionPointLabel(point) {
    if (!point || typeof point !== 'object') return '-';
    const parts = [point.type, point.name, point.marker ? `marker ${point.marker}` : '', point.hasTemplate ? 'template' : ''].filter(Boolean);
    return parts.join(' / ') || '-';
  }

  function statusCodesLabel(statusCodes) {
    const entries = Object.entries(statusCodes || {});
    return entries.length ? entries.map(([code, count]) => `${code}:${count}`).join(', ') : '-';
  }

  function signedNumber(value) {
    const number = Number(value || 0);
    return number > 0 ? `+${number}` : String(number);
  }

  function shortAttackId(id) {
    const text = String(id || '');
    const match = text.match(/^attack-([^-]+)-/);
    return match ? `#${match[1]}` : text.slice(0, 18);
  }

  window.VeilPayloadAttacks = { create };
})();
