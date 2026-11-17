// ==UserScript==
// @name         DOJ 티어 경고
// @namespace    doj-tier-warning
// @version       0.1.1
// @description  DOJ 티어 숨김 상태에서 … / ! / !! 난이도 경고를 표시합니다.
// @match        https://doj.kr/*
// @match        https://www.doj.kr/*
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @homepageURL   https://github.com/Mist0713/doj-tier-warning
// @supportURL    https://github.com/Mist0713/doj-tier-warning/issues
// @updateURL     https://raw.githubusercontent.com/Mist0713/doj-tier-warning/main/doj-tier-warning.meta.js
// @downloadURL   https://raw.githubusercontent.com/Mist0713/doj-tier-warning/main/doj-tier-warning.user.js
// ==/UserScript==

(() => {
  'use strict';

  const KEY = 'doj-tier-warning:settings:v1';
  const CACHE_KEY = 'doj-tier-warning:levels:v1';
  const DEFAULTS = { enabled: false, warning: 16, danger: 21 };
  const TTL = 6 * 60 * 60 * 1000;
  const OWNED = '[data-dtw-owned]';
  const GROUPS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ruby'];
  const ROMAN = ['V', 'IV', 'III', 'II', 'I'];

  function normalize(raw) {
    const level = (x, fallback) => Number.isInteger(x) && x >= 1 && x <= 30 ? x : fallback;
    const warning = level(raw?.warning, DEFAULTS.warning);
    return {
      enabled: raw?.enabled === true,
      warning,
      danger: Math.max(warning, level(raw?.danger, DEFAULTS.danger)),
    };
  }

  let config = normalize(GM_getValue(KEY, DEFAULTS));
  const levels = new Map();
  const pending = new Set();
  const queue = [];
  let busy = false;
  let cooldown = 0;
  let saveTimer;
  let renderTimer;
  let route = '';
  let preference = { value: null, expires: 0, promise: null };

  try {
    const cached = GM_getValue(CACHE_KEY, {});
    for (const [id, entry] of Object.entries(cached || {})) {
      if (/^\d+$/.test(id) && Number.isFinite(entry?.expires) && entry.expires > Date.now()
          && Number.isInteger(entry.level) && entry.level >= 0 && entry.level <= 30) {
        levels.set(id, entry);
      }
    }
  } catch { /* A broken cache must never stop the script. */ }

  function saveConfig(next) {
    config = normalize(next);
    GM_setValue(KEY, config);
    schedule();
  }

  function saveCache() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const valid = [...levels].filter(([, x]) => x.expires > Date.now() && x.level !== null);
      GM_setValue(CACHE_KEY, Object.fromEntries(valid.slice(-1500)));
    }, 250);
  }

  function schedule() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 80);
  }

  function tierName(n) {
    return `${GROUPS[Math.floor((n - 1) / 5)]} ${ROMAN[(n - 1) % 5]}`;
  }

  function node(tag, className, text) {
    const el = document.createElement(tag);
    el.dataset.dtwOwned = '';
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function warningBadge(entry) {
    const known = entry && Number.isInteger(entry.level) && entry.level >= 1 && entry.level <= 30;
    const severity = !entry ? 'loading' : !known ? 'unknown'
      : entry.level >= config.danger ? 'danger' : entry.level >= config.warning ? 'warning' : 'normal';
    const symbols = { loading: '…', unknown: '?', normal: '…', warning: '!', danger: '!!' };
    const labels = {
      loading: '난이도 경고 조회 중', unknown: '난이도 정보 없음', normal: '경고 기준 미만',
      warning: '난이도 주의', danger: '높은 난이도 주의',
    };
    const badge = node('span', `dtw-badge dtw-${severity}`, symbols[severity]);
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', labels[severity]);
    badge.title = labels[severity];
    badge.dataset.dtwSeverity = severity;
    return badge;
  }

  function putBadge(host, entry) {
    const badge = warningBadge(entry);
    if (host.firstElementChild?.dataset.dtwSeverity !== badge.dataset.dtwSeverity) {
      host.replaceChildren(badge);
    }
  }

  const cleanText = x => (x || '').replace(/\s+/g, '').toLowerCase();

  // Match the labelled row/column rather than an unstable compiled CSS class or input name.
  function nativeTierControl(doc) {
    for (const table of doc.querySelectorAll('table')) {
      const header = [...((table.querySelector('thead tr') || table.rows[0])?.cells || [])];
      const col = header.findIndex(cell => /^\/?problems$/.test(cleanText(cell.textContent)));
      if (col < 1) continue;
      for (const row of table.rows) {
        if (row.hasAttribute('data-dtw-owned')) continue;
        const label = cleanText(row.cells[0]?.textContent);
        if (!/^(티어보이기|티어보기|난이도보이기|showtiers?|showdifficulty)$/.test(label)) continue;
        const checkbox = row.cells[col]?.querySelector('input[type="checkbox"]');
        if (checkbox) return { table, row, col, checkbox };
      }
    }
    return null;
  }

  function refreshPreference() {
    if (preference.promise || preference.expires > Date.now()) return;
    preference.expires = Date.now() + 30000;
    const locale = location.pathname.match(/^\/(ko|en|ja)(?:\/|$)/)?.[1] || 'ko';
    preference.promise = (async () => {
      try {
        const response = await fetch(`/${locale}/settings`, {
          credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000),
        });
        if (!response.ok || response.redirected && /\/login(?:\?|$)/.test(response.url)) {
          preference.value = null;
          return;
        }
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const native = nativeTierControl(doc);
        preference.value = native ? !native.checkbox.checked : null;
      } catch {
        preference.value = null;
      } finally {
        preference.promise = null;
        schedule();
      }
    })();
  }

  function selectTier(id, value, label) {
    const select = node('select', 'dtw-select');
    select.id = id;
    select.setAttribute('aria-label', label);
    for (let n = 1; n <= 30; n++) {
      const option = document.createElement('option');
      option.value = String(n);
      option.textContent = tierName(n);
      select.append(option);
    }
    select.value = String(value);
    return select;
  }

  function installSettings() {
    const native = nativeTierControl(document);
    if (!native) return;
    let row = document.getElementById('dtw-settings-row');
    if (row && row.parentElement !== native.row.parentElement) {
      row.remove();
      row = null;
    }
    if (!row) {
      row = node('tr');
      row.id = 'dtw-settings-row';
      row.append(node('th', '', '티어 경고'));
      row.firstElementChild.scope = 'row';
      for (let i = 1; i < native.row.cells.length; i++) {
        const cell = node('td');
        if (i === native.col) {
          const check = node('input');
          check.type = 'checkbox';
          check.id = 'dtw-enabled';
          check.setAttribute('aria-label', '/problems 티어 경고');
          check.addEventListener('change', () => saveConfig({ ...config, enabled: check.checked }));
          cell.append(check);
        } else {
          cell.textContent = '—';
          cell.title = '첫 버전은 /problems에서만 지원합니다.';
        }
        row.append(cell);
      }
      native.row.after(row);
    }

    let panel = document.getElementById('dtw-settings-panel');
    if (!panel) {
      panel = node('div', 'dtw-panel');
      panel.id = 'dtw-settings-panel';
      panel.append(node('strong', '', '난이도 경고'));
      const fields = node('div', 'dtw-fields');
      for (const [key, symbol, title] of [['warning', '!', '주의'], ['danger', '!!', '강한 주의']]) {
        const label = node('label', 'dtw-field');
        label.htmlFor = `dtw-${key}`;
        label.append(node('span', '', `${symbol} ${title} 하한`));
        const select = selectTier(`dtw-${key}`, config[key], `${symbol} 경고 하한`);
        select.addEventListener('change', () => {
          const next = { ...config, [key]: Number(select.value) };
          // Keep both explicit choices valid; equal bounds intentionally make ! an empty range.
          if (key === 'warning' && next.warning > next.danger) next.danger = next.warning;
          if (key === 'danger' && next.danger < next.warning) next.warning = next.danger;
          saveConfig(next);
        });
        label.append(select);
        fields.append(label);
      }
      panel.append(fields, node('p', 'dtw-help',
        '하한을 포함합니다. 첫 기준 미만은 …, 두 기준 사이에는 !, 두 번째 기준 이상은 !!로 표시합니다. 두 하한이 같으면 !!를 우선합니다.'));
      panel.append(node('p', 'dtw-help',
        '이 설정은 이 브라우저에 즉시 저장됩니다. DOJ의 티어 보이기 변경은 기존 저장 버튼으로 저장해 주세요.'));
      const preview = node('div', 'dtw-preview');
      for (const level of [1, 16, 21]) preview.append(warningBadge({ level }));
      panel.append(preview);
      native.table.after(panel);
    }

    const enabled = document.getElementById('dtw-enabled');
    enabled.disabled = native.checkbox.checked;
    enabled.checked = config.enabled;
    enabled.title = enabled.disabled ? '먼저 /PROBLEMS의 티어 보이기를 꺼 주세요.' : '티어 경고 사용';
    row.classList.toggle('dtw-disabled', enabled.disabled);
    panel.hidden = enabled.disabled || !config.enabled;
    for (const key of ['warning', 'danger']) document.getElementById(`dtw-${key}`).value = String(config[key]);
    const preview = panel.querySelector('.dtw-preview');
    const signature = `${config.warning}:${config.danger}`;
    if (preview.dataset.dtwSignature !== signature) {
      preview.dataset.dtwSignature = signature;
      preview.replaceChildren(
        node('span', '', '표시 예시'), warningBadge({ level: 1 }),
        warningBadge({ level: config.warning }), warningBadge({ level: config.danger }),
      );
    }
  }

  function cachedLevel(id) {
    const entry = levels.get(id);
    if (entry?.expires > Date.now()) return entry;
    return undefined;
  }

  function requestLevel(id) {
    if (cachedLevel(id) || pending.has(id) || Date.now() < cooldown) return;
    pending.add(id);
    queue.push(id);
    void drain();
  }

  async function drain() {
    if (busy) return;
    busy = true;
    try {
      while (queue.length) {
        const id = queue.shift();
        if (!config.enabled || Date.now() < cooldown) {
          pending.delete(id);
          continue;
        }
        const started = Date.now();
        let entry = { level: null, expires: Date.now() + 60000 };
        try {
          const response = await fetch(`/api/v1/problems/${id}`, {
            credentials: 'omit', signal: AbortSignal.timeout(10000),
          });
          if (response.status === 429) {
            const raw = response.headers.get('Retry-After');
            const wait = raw && /^\d+$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw || '') - Date.now();
            cooldown = Date.now() + Math.max(60000, Number.isFinite(wait) ? wait : 0);
            entry.expires = cooldown;
          } else if (response.ok) {
            const { problem } = await response.json();
            if (String(problem?.displayId) === id && Number.isInteger(problem?.difficulty)
                && problem.difficulty >= 0 && problem.difficulty <= 30) {
              entry = { level: problem.difficulty, expires: Date.now() + TTL };
            }
          }
        } catch { /* Never turn an unavailable or private problem into an easy problem. */ }
        levels.set(id, entry);
        pending.delete(id);
        saveCache();
        schedule();
        // One request at a time, at most about 85/minute in this tab. DOJ's public limit is ~120/min.
        const delay = 700 - (Date.now() - started);
        if (queue.length && delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
      }
    } finally {
      busy = false;
    }
  }

  function idFromLink(link) {
    try {
      const url = new URL(link.href, location.origin);
      if (url.origin !== location.origin) return null;
      return url.pathname.match(/^\/(?:ko|en|ja)\/problems\/(\d+)\/?$/)?.[1] || null;
    } catch { return null; }
  }

  function clearWarnings() {
    document.querySelectorAll('[data-dtw-display]').forEach(el => el.remove());
    document.querySelectorAll('.dtw-native-hidden').forEach(el => el.classList.remove('dtw-native-hidden'));
  }

  function renderList() {
    for (const table of document.querySelectorAll('table.doj-archive-table')) {
      // If native tiers are present, trust the visible site state over a cached preference.
      if ([...table.querySelectorAll('.doj-difficulty-badge')].some(el => el.getClientRects().length)) {
        table.querySelectorAll('[data-dtw-display]').forEach(el => el.remove());
        continue;
      }
      const headerRow = table.querySelector('thead tr');
      if (!headerRow) continue;
      let heading = headerRow.querySelector('[data-dtw-display="heading"]');
      if (!heading) {
        heading = node('th', 'dtw-warning-column', '티어 경고');
        heading.dataset.dtwDisplay = 'heading';
        heading.scope = 'col';
        (headerRow.cells[1] || headerRow.lastElementChild)?.after(heading);
      }
      for (const row of table.querySelectorAll('tbody tr')) {
        if (row.closest('table') !== table) continue;
        const titleLink = row.querySelector('a.doj-problem-cell') || row.querySelector('a[href*="/problems/"]');
        const id = titleLink && idFromLink(titleLink);
        if (!id) continue;
        let cell = row.querySelector('[data-dtw-display="cell"]');
        if (!cell) {
          cell = node('td', 'dtw-warning-column');
          cell.dataset.dtwDisplay = 'cell';
          titleLink.closest('td')?.after(cell);
        }
        cell.dataset.dtwId = id;
        putBadge(cell, cachedLevel(id));
        requestLevel(id);
      }
    }
  }

  function renderDetail() {
    const id = location.pathname.match(/^\/(?:ko|en|ja)\/problems\/(\d+)\/?$/)?.[1];
    if (!id) return;
    const native = document.querySelector('.problem-title-difficulty button.problem-tier-reveal:not([data-dtw-owned])');
    if (!native) return;
    let button = document.querySelector('[data-dtw-display="detail"]');
    if (native.classList.contains('is-revealed')) {
      native.classList.remove('dtw-native-hidden');
      button?.remove();
      return;
    }
    if (button?.dataset.dtwId !== id) {
      button?.remove();
      button = null;
    }
    if (!button) {
      button = node('button', 'dtw-reveal');
      button.type = 'button';
      button.dataset.dtwDisplay = 'detail';
      button.dataset.dtwId = id;
      button.setAttribute('aria-label', '난이도 확인');
      button.title = '클릭하면 DOJ의 실제 난이도를 확인합니다.';
      button.addEventListener('click', () => {
        native.classList.remove('dtw-native-hidden');
        button.remove();
        native.click();
        native.focus();
        schedule();
      });
      native.after(button);
    }
    native.classList.add('dtw-native-hidden');
    putBadge(button, cachedLevel(id));
    requestLevel(id);
  }

  function render() {
    if (!document.body) return;
    const current = location.pathname;
    if (route !== current) {
      for (const id of queue.splice(0)) pending.delete(id);
      clearWarnings();
      document.querySelectorAll('#dtw-settings-row, #dtw-settings-panel').forEach(el => el.remove());
      route = current;
      preference.expires = 0;
    }
    if (/^\/(?:ko|en|ja)\/settings\/?$/.test(current)) {
      installSettings();
      return;
    }
    if (!/^\/(?:ko|en|ja)\/problems(?:\/\d+)?\/?$/.test(current) || !config.enabled) {
      clearWarnings();
      return;
    }
    refreshPreference();
    // No guesses when login expires, the preference cannot be read, or DOJ changes its settings form.
    if (preference.value !== true) {
      clearWarnings();
      return;
    }
    renderList();
    renderDetail();
  }

  const style = document.createElement('style');
  style.id = 'dtw-styles';
  style.textContent = `
    .dtw-native-hidden { display: none !important; }
    .dtw-badge { display: inline-flex; align-items: center; justify-content: center;
      box-sizing: border-box; width: 22px; height: 27px; padding: 0 0 4px;
      clip-path: polygon(0 0, 100% 0, 100% 81%, 50% 100%, 0 81%);
      font: 900 18px/1 system-ui, sans-serif; vertical-align: middle;
      background: #667085; color: #fff; letter-spacing: -1px; }
    .dtw-normal { background: #667085; }
    .dtw-warning { background: #e1a100; color: #17191e; }
    .dtw-danger { background: #ed3658; color: #fff; font-size: 17px; }
    .dtw-loading { opacity: .45; }
    .dtw-unknown { background: #667085; font-size: 17px; }
    .dtw-warning-column { width: 86px; text-align: center; white-space: nowrap; }
    .dtw-panel { margin: 16px 0; padding: 18px; border: 1px solid var(--border, #73778366);
      border-radius: 8px; color: inherit; background: var(--panel, transparent); }
    .dtw-panel[hidden] { display: none !important; }
    .dtw-fields { display: flex; gap: 24px; flex-wrap: wrap; margin: 16px 0; }
    .dtw-field { display: flex; gap: 8px; align-items: center; }
    .dtw-select { min-width: 140px; padding: 7px 10px; border-radius: 5px;
      color: var(--text, inherit); background: var(--surface, Field);
      border: 1px solid var(--border, #73778399); font: inherit; }
    .dtw-help { font-size: .875rem; line-height: 1.7; opacity: .8; margin: 8px 0; }
    .dtw-preview { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
    .dtw-disabled { opacity: .5; }
    #dtw-settings-row th { text-align: start; }
    .dtw-reveal { display: inline-flex; align-items: center; justify-content: center;
      padding: 3px 6px; border: 0; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; }
    .dtw-reveal:focus-visible { outline: 2px solid var(--accent, #7faaf5); outline-offset: 3px; }
    html[data-theme="dark"] .dtw-select { color-scheme: dark; }
  `;

  function start() {
    (document.head || document.documentElement).append(style);
    const observer = new MutationObserver(records => {
      // Ignore changes within our own cells/panel. React mutations outside them still schedule a pass.
      if (records.some(record => {
        const el = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (el?.closest(OWNED)) return false;
        if (record.type === 'attributes' && record.attributeName === 'class'
            && el?.classList.contains('dtw-native-hidden')) return false;
        return true;
      })) schedule();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'checked', 'hidden'] });
    document.addEventListener('change', event => {
      if (event.target.matches('input[type="checkbox"]') && !event.target.closest(OWNED)) {
        preference.expires = 0;
        schedule();
      }
    });
    // Next.js updates history without a full load. Poll only the URL, never problem data.
    setInterval(() => { if (route !== location.pathname) schedule(); }, 500);
    window.addEventListener('popstate', schedule);
    window.addEventListener('focus', () => { preference.expires = 0; schedule(); });
    if (typeof GM_addValueChangeListener === 'function') {
      GM_addValueChangeListener(KEY, (_key, _old, next) => { config = normalize(next); schedule(); });
    }
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('DOJ 티어 경고 설정', () => {
        const locale = location.pathname.match(/^\/(ko|en|ja)(?:\/|$)/)?.[1] || 'ko';
        location.href = `/${locale}/settings`;
      });
    }
    schedule();
  }

  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
