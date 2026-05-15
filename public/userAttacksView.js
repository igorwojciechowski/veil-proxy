(function () {
  function create(deps) {
    const { state, el, api, escapeHtml, formatError, markProjectDirty, setView, buildRawRequest, parseRawRequestMeta, renderLineNumberedHighlighted, highlightHttpMessage, formatBytes, schedulePersist, renderPaneLayout } = deps;

    function bind() {
      el.newAttackTabBtn?.addEventListener('click', createBlankTab);
      el.attackTabs?.addEventListener('click', (event) => {
        const close = event.target.closest('[data-close-attack-tab]');
        if (close) {
          closeTab(close.dataset.closeAttackTab);
          return;
        }
        const button = event.target.closest('[data-attack-tab-id]');
        if (!button) return;
        state.selectedAttackTabId = button.dataset.attackTabId;
        render();
      });
      el.attackTabName?.addEventListener('input', syncMeta);
      el.attackRawRequest?.addEventListener('input', syncRequest);
      el.attackRawRequest?.addEventListener('scroll', syncRawScroll);
      el.markAttackSelectionBtn?.addEventListener('click', markSelection);
      el.clearAttackPointsBtn?.addEventListener('click', clearPoints);
      el.attackPointRows?.addEventListener('change', syncPoints);
      el.attackPointRows?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-delete-attack-point]');
        if (!button) return;
        deletePoint(button.dataset.deleteAttackPoint);
      });
      el.attackListSelect?.addEventListener('change', () => {
        selectedTab().selectedListId = el.attackListSelect.value;
        render();
        schedulePersist();
      });
      el.attackListName?.addEventListener('input', syncList);
      el.attackPayloadText?.addEventListener('input', syncList);
      el.newAttackListBtn?.addEventListener('click', addList);
      el.deleteAttackListBtn?.addEventListener('click', deleteList);
      el.attackListFile?.addEventListener('change', importListFile);
      [el.attackMode, el.attackConcurrency, el.attackDelay].forEach((input) => input?.addEventListener('change', syncOptions));
      el.runAttackBtn?.addEventListener('click', runAttack);
    }

    function render() {
      if (!el.attackTabs) return;
      normalizeState();
      renderTabs();
      const tab = selectedTab();
      if (!tab) {
        el.attackPaneToolbar?.classList.add('hidden');
        el.emptyAttackTool.classList.remove('hidden');
        el.attackWorkspace.classList.add('hidden');
        return;
      }
      el.attackPaneToolbar?.classList.remove('hidden');
      el.emptyAttackTool.classList.add('hidden');
      el.attackWorkspace.classList.remove('hidden');
      renderPaneLayout?.();
      el.attackTabName.value = tab.title || '';
      el.attackRequestSubtitle.textContent = tab.source || 'Manual attack';
      el.attackRawRequest.value = tab.rawRequest || '';
      renderRawRequest();
      renderPoints(tab);
      renderLists(tab);
      renderResults(tab);
      el.attackMode.value = tab.mode || 'clusterBomb';
      el.attackConcurrency.value = tab.concurrency || 1;
      el.attackDelay.value = tab.delayMillis || 0;
      el.runAttackBtn.disabled = tab.loading || tab.insertionPoints.length === 0;
      el.attackStatus.textContent = tab.loading ? 'Running...' : tab.error || (tab.result ? `${tab.result.executed || 0} requests executed` : 'Ready');
      el.attackStatus.classList.toggle('error-text', Boolean(tab.error));
    }

    function createBlankTab() {
      createFromRequest(
        {
          method: 'GET',
          url: 'http://example.com/',
          headers: { host: 'example.com', 'user-agent': 'Veil Attack' },
          bodyText: '',
        },
        'Manual fuzzer',
        'Manual fuzzer',
        '',
      );
    }

    function createFromRequest(request, title, source, sourceId) {
      const tab = createTab(request, title, source, sourceId);
      state.attackTabs.unshift(tab);
      state.selectedAttackTabId = tab.id;
      schedulePersist();
      setView('attacks');
      render();
    }

    function createTab(request, title, source, sourceId) {
      const rawRequest = request.rawRequest || buildRawRequest({ request });
      const parsed = parseRawRequestMeta(rawRequest);
      return {
        id: `attack-tab-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: title || `${parsed.method || 'GET'} ${parsed.target || '/'}`,
        customTitle: false,
        sourceId: sourceId || '',
        source: source || 'Manual fuzzer',
        rawRequest,
        insertionPoints: [],
        payloadLists: [{ id: 'list-1', name: 'List 1', items: ['test'] }],
        selectedListId: 'list-1',
        mode: 'clusterBomb',
        concurrency: 1,
        delayMillis: 0,
        result: null,
        loading: false,
        error: null,
      };
    }

    function renderTabs() {
      el.attackTabs.innerHTML = state.attackTabs
        .map((tab) => `
          <button class="attack-tab ${tab.id === state.selectedAttackTabId ? 'active' : ''}" type="button" data-attack-tab-id="${escapeHtml(tab.id)}" title="${escapeHtml(tab.title || '')}">
            <span>${escapeHtml(tab.title || 'Fuzzer')}</span>
            <span class="attack-tab-close" data-close-attack-tab="${escapeHtml(tab.id)}">x</span>
          </button>
        `)
        .join('');
    }

    function renderPoints(tab) {
      el.attackPointRows.innerHTML =
        tab.insertionPoints
          .map((point) => `
            <div class="attack-point-row">
              <code>§${escapeHtml(point.id)}§</code>
              <input data-attack-point-name="${escapeHtml(point.id)}" value="${escapeHtml(point.name || point.id)}" />
              <select data-attack-point-list="${escapeHtml(point.id)}">
                ${tab.payloadLists.map((list) => `<option value="${escapeHtml(list.id)}" ${point.listId === list.id ? 'selected' : ''}>${escapeHtml(list.name)}</option>`).join('')}
              </select>
              <button class="icon-button" type="button" data-delete-attack-point="${escapeHtml(point.id)}">x</button>
            </div>
          `)
          .join('') || '<div class="hint-line">Select text in the raw request and click Mark selection.</div>';
    }

    function renderLists(tab) {
      if (!tab.payloadLists.length) {
        tab.payloadLists.push({ id: 'list-1', name: 'List 1', items: ['test'] });
      }
      if (!tab.payloadLists.some((list) => list.id === tab.selectedListId)) {
        tab.selectedListId = tab.payloadLists[0].id;
      }
      const list = selectedList(tab);
      el.attackListSelect.innerHTML = tab.payloadLists.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === tab.selectedListId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
      el.attackListName.value = list?.name || '';
      el.attackPayloadText.value = (list?.items || []).join('\n');
    }

    function renderResults(tab) {
      const results = tab.result?.results || [];
      el.attackResultRows.innerHTML =
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
                <td>${escapeHtml(result.durationMs == null ? '-' : `${result.durationMs}ms`)}</td>
                <td>${signals.map((signal) => `<span class="mini-chip">${escapeHtml(signal)}</span>`).join('') || '-'}</td>
              </tr>
            `;
          })
          .join('') || '<tr><td colspan="6"><div class="empty-state compact-empty">No results yet</div></td></tr>';
    }

    function syncMeta() {
      const tab = selectedTab();
      if (!tab) return;
      tab.title = el.attackTabName.value.trim() || 'Fuzzer';
      tab.customTitle = Boolean(el.attackTabName.value.trim());
      schedulePersist();
      renderTabs();
    }

    function syncRequest() {
      const tab = selectedTab();
      if (!tab) return;
      tab.rawRequest = el.attackRawRequest.value;
      renderRawRequest();
      schedulePersist();
    }

    function renderRawRequest() {
      el.attackRawRequestHighlight.innerHTML = renderLineNumberedHighlighted(highlightHttpMessage(el.attackRawRequest.value));
      syncRawScroll();
    }

    function syncRawScroll() {
      el.attackRawRequestHighlight.scrollTop = el.attackRawRequest.scrollTop;
      el.attackRawRequestHighlight.scrollLeft = el.attackRawRequest.scrollLeft;
    }

    function markSelection() {
      const tab = selectedTab();
      if (!tab) return;
      const start = el.attackRawRequest.selectionStart;
      const end = el.attackRawRequest.selectionEnd;
      if (end <= start) {
        tab.error = 'Select text in the request first.';
        render();
        return;
      }
      const id = nextPointId(tab);
      const marker = `§${id}§`;
      const raw = el.attackRawRequest.value;
      tab.rawRequest = `${raw.slice(0, start)}${marker}${raw.slice(end)}`;
      tab.insertionPoints.push({ id, name: id, listId: tab.selectedListId || tab.payloadLists[0]?.id || 'list-1' });
      tab.error = null;
      schedulePersist();
      render();
      el.attackRawRequest.focus();
      el.attackRawRequest.setSelectionRange(start, start + marker.length);
    }

    function clearPoints() {
      const tab = selectedTab();
      if (!tab) return;
      for (const point of tab.insertionPoints) {
        tab.rawRequest = tab.rawRequest.split(`§${point.id}§`).join(point.name || point.id);
      }
      tab.insertionPoints = [];
      schedulePersist();
      render();
    }

    function syncPoints(event) {
      const tab = selectedTab();
      if (!tab) return;
      const nameInput = event.target.closest('[data-attack-point-name]');
      if (nameInput) {
        const point = tab.insertionPoints.find((item) => item.id === nameInput.dataset.attackPointName);
        if (point) point.name = nameInput.value.trim() || point.id;
      }
      const listSelect = event.target.closest('[data-attack-point-list]');
      if (listSelect) {
        const point = tab.insertionPoints.find((item) => item.id === listSelect.dataset.attackPointList);
        if (point) point.listId = listSelect.value;
      }
      schedulePersist();
      render();
    }

    function deletePoint(id) {
      const tab = selectedTab();
      if (!tab) return;
      const point = tab.insertionPoints.find((item) => item.id === id);
      tab.rawRequest = tab.rawRequest.split(`§${id}§`).join(point?.name || id);
      tab.insertionPoints = tab.insertionPoints.filter((item) => item.id !== id);
      schedulePersist();
      render();
    }

    function syncList() {
      const tab = selectedTab();
      const list = tab && selectedList(tab);
      if (!list) return;
      list.name = el.attackListName.value.trim() || list.name;
      list.items = el.attackPayloadText.value.split(/\r?\n/).filter((line) => line.length > 0);
      schedulePersist();
      renderPoints(tab);
      renderTabs();
    }

    function addList() {
      const tab = selectedTab();
      if (!tab) return;
      const id = `list-${tab.payloadLists.length + 1}-${Date.now().toString(16).slice(-4)}`;
      tab.payloadLists.push({ id, name: `List ${tab.payloadLists.length + 1}`, items: ['test'] });
      tab.selectedListId = id;
      schedulePersist();
      render();
    }

    function deleteList() {
      const tab = selectedTab();
      if (!tab || tab.payloadLists.length <= 1) return;
      const id = tab.selectedListId;
      tab.payloadLists = tab.payloadLists.filter((list) => list.id !== id);
      tab.selectedListId = tab.payloadLists[0]?.id || '';
      for (const point of tab.insertionPoints) {
        if (point.listId === id) point.listId = tab.selectedListId;
      }
      schedulePersist();
      render();
    }

    function importListFile() {
      const file = el.attackListFile.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const tab = selectedTab();
        const list = tab && selectedList(tab);
        if (!list) return;
        list.name = file.name.replace(/\.[^.]+$/, '') || list.name;
        list.items = String(reader.result || '').split(/\r?\n/).filter((line) => line.length > 0);
        el.attackListFile.value = '';
        schedulePersist();
        render();
      };
      reader.readAsText(file);
    }

    function syncOptions() {
      const tab = selectedTab();
      if (!tab) return;
      tab.mode = el.attackMode.value;
      tab.concurrency = clamp(Number(el.attackConcurrency.value || 1), 1, 10);
      tab.delayMillis = clamp(Number(el.attackDelay.value || 0), 0, 5000);
      schedulePersist();
    }

    async function runAttack() {
      const tab = selectedTab();
      if (!tab) return;
      syncRequest();
      syncOptions();
      if (!tab.insertionPoints.length) {
        tab.error = 'At least one insertion point is required.';
        render();
        return;
      }
      tab.loading = true;
      tab.error = null;
      render();
      try {
        const result = await api('/api/payload-attacks/run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sourceId: tab.sourceId,
            rawRequest: tab.rawRequest,
            insertionPoints: tab.insertionPoints,
            payloadLists: tab.payloadLists,
            mode: tab.mode,
            concurrency: tab.concurrency,
            delayMillis: tab.delayMillis,
          }),
        });
        tab.result = result;
        tab.error = null;
      } catch (error) {
        tab.error = formatError(error);
      } finally {
        tab.loading = false;
      }
      schedulePersist();
      render();
      markProjectDirty();
    }

    function closeTab(id) {
      state.attackTabs = state.attackTabs.filter((tab) => tab.id !== id);
      if (state.selectedAttackTabId === id) {
        state.selectedAttackTabId = state.attackTabs[0]?.id || null;
      }
      schedulePersist();
      render();
    }

    function selectedTab() {
      return state.attackTabs.find((tab) => tab.id === state.selectedAttackTabId) || null;
    }

    function selectedList(tab) {
      return (tab.payloadLists || []).find((list) => list.id === tab.selectedListId) || tab.payloadLists[0] || null;
    }

    function normalizeState() {
      if (!Array.isArray(state.attackTabs)) state.attackTabs = [];
      if (!state.selectedAttackTabId || !state.attackTabs.some((tab) => tab.id === state.selectedAttackTabId)) {
        state.selectedAttackTabId = state.attackTabs[0]?.id || null;
      }
      for (const tab of state.attackTabs) {
        tab.insertionPoints = Array.isArray(tab.insertionPoints) ? tab.insertionPoints : [];
        tab.payloadLists = Array.isArray(tab.payloadLists) && tab.payloadLists.length ? tab.payloadLists : [{ id: 'list-1', name: 'List 1', items: ['test'] }];
        tab.selectedListId = tab.selectedListId || tab.payloadLists[0].id;
      }
    }

    function nextPointId(tab) {
      let index = tab.insertionPoints.length + 1;
      while (tab.insertionPoints.some((point) => point.id === `p${index}`)) index += 1;
      return `p${index}`;
    }

    function signedNumber(value) {
      const number = Number(value || 0);
      return number > 0 ? `+${number}` : String(number);
    }

    function clamp(value, min, max) {
      if (!Number.isFinite(value)) return min;
      return Math.max(min, Math.min(max, Math.round(value)));
    }

    return { bind, render, createBlankTab, createFromRequest };
  }

  window.VeilUserAttacks = { create };
})();
