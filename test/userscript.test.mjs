import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// The alternate path lets this workspace reuse an isolated test dependency installation.
const require = createRequire(import.meta.url);
const modulePath = process.env.DTW_HAPPY_DOM || require.resolve('happy-dom');
const { Window } = await import(pathToFileURL(modulePath).href);
const source = await readFile(new URL('../doj-tier-warning.user.js', import.meta.url), 'utf8');
const KEY = 'doj-tier-warning:settings:v1';
const CACHE = 'doj-tier-warning:levels:v1';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function settings(checked = false) {
  return `<form><table><thead><tr><th>항목</th><th>/PROBLEMS</th><th>카테고리</th><th>문제집</th><th>그룹</th></tr></thead>
    <tbody><tr><th>티어 보이기</th>${[checked, true, true, true].map(on => `<td><input type="checkbox" ${on ? 'checked' : ''}></td>`).join('')}</tr>
    <tr><th>정답률 보이기</th>${'<td><input type="checkbox" checked></td>'.repeat(4)}</tr></tbody></table>
    <button>저장</button></form>`;
}

function list(ids = [1, 2, 3], visible = false) {
  return `<table class="table doj-archive-table"><thead><tr><th>ID</th><th>문제</th>${visible ? '<th>난이도</th>' : ''}<th>해결 수</th></tr></thead>
    <tbody>${ids.map(id => `<tr><td>${id}</td><td><a class="doj-problem-cell" href="/ko/problems/${id}">문제 ${id}</a></td>
      ${visible ? '<td><span class="doj-difficulty-badge" title="Gold I">Gold I</span></td>' : ''}<td>10</td></tr>`).join('')}</tbody></table>`;
}

function boot({ url = '/ko/problems', body = list(), enabled = true, nativeOn = false,
  warning = 11, danger = 16, cache = {}, result = { 1: 10, 2: 11, 3: 16 }, failure,
  preferenceFailure = false } = {}) {
  const window = new Window({ url: `https://doj.kr${url}` });
  window.document.body.innerHTML = body;
  window.Element.prototype.getClientRects = function () {
    return this.matches('.doj-difficulty-badge') ? [{ width: 30 }] : [];
  };
  const values = new Map([[KEY, { enabled, warning, danger }], [CACHE, cache]]);
  const requests = [];
  window.GM_getValue = (key, fallback) => values.get(key) ?? fallback;
  window.GM_setValue = (key, value) => values.set(key, structuredClone(value));
  window.GM_addValueChangeListener = () => {};
  window.GM_registerMenuCommand = () => {};
  window.AbortSignal = AbortSignal;
  window.fetch = async (input, options) => {
    const path = String(input);
    requests.push({ path, options });
    if (path.endsWith('/settings')) return {
      ok: !preferenceFailure, redirected: preferenceFailure,
      url: preferenceFailure ? 'https://doj.kr/ko/login?returnTo=settings' : `https://doj.kr${path}`,
      text: async () => settings(nativeOn),
    };
    const id = path.split('/').pop();
    if (failure === 'network') throw new Error('offline');
    if (failure === 429) return { ok: false, status: 429, headers: { get: () => '120' } };
    if (failure === 404) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => ({ problem: { displayId: Number(id), difficulty: result[id], tags: ['SECRET_TAG'] } }) };
  };
  window.eval(source);
  return {
    window, doc: window.document, values, requests,
    close: () => window.happyDOM.abort(),
    change(el, value) {
      if (el.type === 'checkbox') el.checked = value;
      else el.value = String(value);
      el.dispatchEvent(new window.Event('change', { bubbles: true }));
    },
  };
}

const makeCache = mapping => Object.fromEntries(Object.entries(mapping).map(([id, level]) =>
  [id, { level, expires: Date.now() + 60000 }]));
const severities = doc => [...doc.querySelectorAll('[data-dtw-display="cell"] .dtw-badge')].map(el => el.dataset.dtwSeverity);

test('settings row follows /PROBLEMS native checkbox and changes save immediately', async t => {
  const b = boot({ url: '/ko/settings', body: settings(true) });
  t.after(b.close);
  await pause(150);
  assert.equal(b.doc.querySelectorAll('#dtw-settings-row').length, 1);
  assert.equal(b.doc.querySelector('#dtw-enabled').disabled, true);
  assert.equal(b.doc.querySelector('#dtw-settings-panel').hidden, true);
  b.change(b.doc.querySelector('table tbody tr input'), false);
  await pause(150);
  assert.equal(b.doc.querySelector('#dtw-enabled').disabled, false);
  assert.equal(b.doc.querySelector('#dtw-settings-panel').hidden, false);
  assert.equal(b.doc.querySelector('#dtw-warning').options.length, 30);
  b.change(b.doc.querySelector('#dtw-warning'), 30);
  await pause(150);
  assert.deepEqual(b.values.get(KEY), { enabled: true, warning: 30, danger: 30 });
  b.change(b.doc.querySelector('#dtw-danger'), 1);
  await pause(150);
  assert.deepEqual(b.values.get(KEY), { enabled: true, warning: 1, danger: 1 });
  assert.equal(b.doc.querySelectorAll('[data-dtw-owned][name]').length, 0);
  b.change(b.doc.querySelector('#dtw-enabled'), false);
  await pause(150);
  assert.equal(b.doc.querySelector('#dtw-settings-panel').hidden, true);
  assert.equal(b.values.get(KEY).enabled, false);
});

test('exact lower bounds, no tier tooltip or tags, cache avoids public API calls', async t => {
  const b = boot({ cache: makeCache({ 1: 10, 2: 11, 3: 16 }) });
  t.after(b.close);
  await pause(300);
  assert.deepEqual(severities(b.doc), ['normal', 'warning', 'danger']);
  assert.equal(b.doc.querySelectorAll('[data-dtw-display="heading"]').length, 1);
  assert.equal(b.requests.filter(r => r.path.startsWith('/api/')).length, 0);
  assert.equal(b.doc.body.textContent.includes('Gold'), false);
  assert.equal(b.doc.body.innerHTML.includes('SECRET_TAG'), false);
  assert.equal([...b.doc.querySelectorAll('[title]')].some(e => /Gold|Platinum|11|16/.test(e.title)), false);
});

test('all tier boundaries, equal thresholds and unknown level', async t => {
  const ids = Array.from({ length: 31 }, (_, n) => n);
  const b = boot({ body: list(ids), warning: 1, danger: 30,
    cache: makeCache(Object.fromEntries(ids.map(n => [n, n]))) });
  t.after(b.close);
  await pause(300);
  assert.deepEqual(severities(b.doc), ['unknown', ...Array(29).fill('warning'), 'danger']);
  const equal = boot({ warning: 11, danger: 11, cache: makeCache({ 1: 10, 2: 11, 3: 30 }) });
  t.after(equal.close);
  await pause(300);
  assert.deepEqual(severities(equal.doc), ['normal', 'danger', 'danger']);
});

test('disabled, native tiers on, or login failure does not inject warnings or call API', async t => {
  for (const options of [{ enabled: false }, { nativeOn: true }, { preferenceFailure: true }]) {
    const b = boot(options);
    t.after(b.close);
    await pause(300);
    assert.equal(b.doc.querySelector('[data-dtw-display]'), null);
    assert.equal(b.requests.filter(r => r.path.startsWith('/api/')).length, 0);
  }
});

test('visible native tiers win over stale hidden preference', async t => {
  const b = boot({ body: list([1], true) });
  t.after(b.close);
  await pause(300);
  assert.equal(b.doc.querySelector('[data-dtw-display]'), null);
  assert.equal(b.doc.querySelector('.doj-difficulty-badge').textContent, 'Gold I');
});

test('single problem shows warning and explicitly revealing delegates to native button', async t => {
  const b = boot({ url: '/ko/problems/3', cache: makeCache({ 3: 16 }),
    body: '<div class="problem-title-difficulty"><button class="problem-tier-reveal"><span>난이도 보기</span></button></div>' });
  t.after(b.close);
  const native = b.doc.querySelector('button');
  native.addEventListener('click', () => { native.classList.add('is-revealed'); native.textContent = 'Platinum V'; });
  await pause(300);
  assert.equal(b.doc.querySelector('[data-dtw-display="detail"] .dtw-badge').textContent, '!!');
  assert.equal(native.classList.contains('dtw-native-hidden'), true);
  b.doc.querySelector('[data-dtw-display="detail"]').click();
  await pause(200);
  assert.equal(native.textContent, 'Platinum V');
  assert.equal(native.classList.contains('dtw-native-hidden'), false);
  assert.equal(b.doc.querySelector('[data-dtw-display="detail"]'), null);
});

test('dynamic pagination replaces IDs and does not duplicate injected columns', async t => {
  const b = boot({ body: list([1]), cache: makeCache({ 1: 10, 3: 16 }) });
  t.after(b.close);
  await pause(300);
  b.doc.querySelector('tbody').innerHTML = '<tr><td>3</td><td><a class="doj-problem-cell" href="/ko/problems/3">문제 3</a></td><td>3</td></tr>';
  await pause(250);
  assert.deepEqual(severities(b.doc), ['danger']);
  assert.equal(b.doc.querySelectorAll('[data-dtw-display="heading"]').length, 1);
  b.window.history.pushState({}, '', '/ko/categories');
  await pause(650);
  assert.equal(b.doc.querySelector('[data-dtw-display]'), null);
});

test('out of scope pages never request preferences or difficulty', async t => {
  for (const url of ['/ko/categories/graphs', '/ko/workbooks/1', '/ko/groups/a', '/ko/contests/a', '/ko/problems/recent']) {
    const b = boot({ url });
    t.after(b.close);
    await pause(150);
    assert.equal(b.requests.length, 0);
    assert.equal(b.doc.querySelector('[data-dtw-display]'), null);
  }
});

test('requests are serial, cached and limited to difficulty values', async t => {
  const b = boot({ body: list([1, 2]), result: { 1: 11, 2: 16 } });
  t.after(b.close);
  await pause(450);
  assert.equal(b.requests.filter(r => r.path.startsWith('/api/')).length, 1);
  await pause(850);
  assert.deepEqual(severities(b.doc), ['warning', 'danger']);
  assert.equal(b.requests.filter(r => r.path.startsWith('/api/')).length, 2);
  await pause(300);
  assert.equal(JSON.stringify(b.values.get(CACHE)).includes('SECRET_TAG'), false);
  assert.equal(b.requests.find(r => r.path.startsWith('/api/')).options.credentials, 'omit');
});

test('unrated, failed requests and 429 are never classified as easy', async t => {
  for (const failure of ['network', 404, 429]) {
    const b = boot({ body: list([1]), failure });
    t.after(b.close);
    await pause(450);
    assert.deepEqual(severities(b.doc), ['unknown']);
    assert.equal(b.requests.filter(r => r.path.startsWith('/api/')).length, 1);
  }
  const b = boot({ body: list([1]), result: { 1: 0 } });
  t.after(b.close);
  await pause(450);
  assert.deepEqual(severities(b.doc), ['unknown']);
});
