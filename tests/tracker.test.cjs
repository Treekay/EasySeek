const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const T = require('../src/tracker.js');
const S = require('../src/state.js');
const job = { id: '12345', platform: 'seek', title: 'Engineer', company: 'Example', location: 'Auckland' };
function worker({ enabled = false, permission = true, fetcher = async () => { throw new TypeError('offline'); } } = {}) {
  const saved = { careerWorkspace: { enabled, url: T.defaultUrl } };
  let listener;
  const context = vm.createContext({ URL, AbortController, setTimeout, clearTimeout, TypeError, fetch: fetcher,
    importScripts(...names) { for (const name of names) vm.runInContext(fs.readFileSync('src/' + name, 'utf8'), context); },
    chrome: { runtime: { id: 'test', onMessage: { addListener(fn) { listener = fn; } } },
      permissions: { async contains() { return permission; } },
      storage: { local: { async get() { return structuredClone(saved); }, async set(value) { Object.assign(saved, structuredClone(value)); } } } }
  });
  vm.runInContext(fs.readFileSync('src/background.js', 'utf8'), context);
  return { saved, send(message, url = 'https://nz.seek.com/job/12345') {
    return new Promise(resolve => { if (!listener({ channel: 'easyseek', ...message }, { id: 'test', url }, resolve)) resolve(null); });
  } };
}
test('optional local endpoint rejects remote hosts, credentials, paths, aliases, and redirects', async () => {
  assert.deepEqual(T.settings(), { enabled: false, url: 'http://localhost:8765' });
  assert.equal(T.endpoint('http://127.0.0.1:3001/'), 'http://127.0.0.1:3001');
  assert.equal(T.permission('http://localhost:8765'), 'http://localhost/*');
  for (const url of ['https://example.com', 'http://localhost.evil:8765', 'http://localhost@evil', 'http://user@localhost', 'http://127.1', 'http://2130706433', 'http://0.0.0.0', 'http://localhost:8765/api', 'http://localhost/?x', 'http://localhost#x', 'http://localhost:0', 'http://localhost:65536']) assert.throws(() => T.endpoint(url), url);
  assert.equal(T.settings({ enabled: true, url: 'http://evil' }).enabled, false);
  let options;
  await T.test(T.defaultUrl, async (url, init) => { options = init; assert.equal(url, T.defaultUrl + '/api/health'); return { ok: true, json: async () => ({ status: 'ok', service: 'career-workspace' }) }; });
  assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit');
  await assert.rejects(T.test(T.defaultUrl, async () => ({ ok: true, json: async () => ({ status: 'ok', service: 'other' }) })), /Career Workspace/);
  const manifest = JSON.parse(fs.readFileSync('manifest.json'));
  assert.deepEqual(manifest.optional_host_permissions, ['http://localhost/*', 'http://127.0.0.1/*']);
  assert.equal(manifest.host_permissions, undefined);
});
test('payload preserves current mark, stable source identity and full rendered JD for both sources', () => {
  const description = 'First paragraph\n\n' + 'Detail\n'.repeat(1000) + 'Final requirement';
  for (const source of ['seek', 'linkedin']) {
    const payload = T.payload({ ...job, platform: source }, { mark: 'SAVED' }, 'APPLIED', description);
    assert.equal(payload.source, source); assert.equal(payload.sourceJobId, '12345');
    assert.equal(payload.mark, 'SAVED'); assert.equal(payload.requestedStage, 'APPLIED');
    assert.equal(payload.jdMarkdown, description);
    assert.equal(payload.url, S.canonicalUrl('12345', source));
    assert.deepEqual(T.payload({ ...job, platform: source }, { mark: 'SAVED' }, 'APPLIED', description), payload);
  }
  assert.equal(T.payload(job, { mark: 'SAVED' }, 'SAVED').jdMarkdown, undefined);
});
test('disabled integration sends nothing; enabled marking persists before any handoff and never stores JD', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw new TypeError('offline'); };
  const disabled = worker({ fetcher });
  assert.equal((await disabled.send({ type: 'action', job, action: 'SAVED', jdMarkdown: '# JD' })).handoff, undefined);
  assert.equal(calls, 0);
  const w = worker({ enabled: true, fetcher });
  const result = await w.send({ type: 'action', job, action: 'APPLIED', jdMarkdown: '# Full JD' });
  assert.equal(result.ok, true); assert.equal(calls, 0);
  assert.equal(w.saved.records[0].applicationStage, 'APPLIED');
  assert.equal(JSON.stringify(w.saved).includes('Full JD'), false);
  const response = await w.send({ type: 'trackerImport', payload: result.handoff });
  assert.equal(response.ok, false); assert.match(response.error, /mark is saved/);
  assert.equal(w.saved.records[0].applicationStage, 'APPLIED');
  assert.equal((await w.send({ type: 'action', job, action: 'SAVED' })).ok, true);
  for (const action of ['VIEW', 'INTERVIEW', 'SKIP', 'NONE']) assert.equal((await w.send({ type: 'action', job, action })).handoff, undefined);
});
test('settings are options-only, validate permission, and test connection makes no application writes', async () => {
  const options = 'chrome-extension://test/options/options.html';
  let requests = [];
  const w = worker({ fetcher: async (url, init) => { requests.push([url, init.method]); return { ok: true, json: async () => ({ service: 'career-workspace', status: 'ok' }) }; } });
  assert.equal((await w.send({ type: 'trackerSettings', settings: { enabled: true, url: T.defaultUrl } })).ok, false);
  assert.equal((await w.send({ type: 'trackerSettings', settings: { enabled: true, url: 'http://example.com' } }, options)).ok, false);
  assert.equal((await w.send({ type: 'trackerSettings', settings: { enabled: true, url: T.defaultUrl } }, options)).ok, true);
  assert.equal((await w.send({ type: 'trackerTest', url: T.defaultUrl }, options)).ok, true);
  assert.deepEqual(requests, [[T.defaultUrl + '/api/health', 'GET']]);
  assert.equal(w.saved.records, undefined);
  const denied = worker({ permission: false });
  assert.equal((await denied.send({ type: 'trackerSettings', settings: { enabled: true, url: T.defaultUrl } }, options)).ok, false);
});
test('network requests are outside marking queue; simultaneous identical handoffs coalesce', async () => {
  let complete, calls = 0;
  const w = worker({ enabled: true, fetcher: async () => { calls++; await new Promise(resolve => { complete = resolve; }); return { ok: true, json: async () => ({ outcome: 'created', application: { id: 'abc' } }) }; } });
  const result = await w.send({ type: 'action', job, action: 'SAVED' });
  const p1 = w.send({ type: 'trackerImport', payload: result.handoff });
  const p2 = w.send({ type: 'trackerImport', payload: result.handoff });
  const next = await w.send({ type: 'action', job, action: 'APPLIED' });
  assert.equal(next.ok, true); assert.equal(next.records[0].applicationStage, 'APPLIED');
  assert.equal(calls, 1);
  complete();
  assert.equal((await p1).ok, true); assert.equal((await p2).ok, true);
});
test('timeout and HTTP errors are contained; an explicit retry remains possible', async () => {
  const payload = T.payload(job, { mark: 'SAVED' }, 'SAVED');
  await assert.rejects(T.send(T.defaultUrl, payload, (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { const error = new Error(); error.name = 'AbortError'; reject(error); })), 10), /unavailable/);
  for (const status of [400, 403, 409, 500]) await assert.rejects(T.send(T.defaultUrl, payload, async () => ({ ok: false, status })), /Tracker/);
  const success = await T.send(T.defaultUrl, payload, async () => ({ ok: true, json: async () => ({ outcome: 'unchanged', application: { id: 'abc' } }) }));
  assert.equal(success.outcome, 'unchanged');
});
test('Memory Saved/Applied actions produce metadata-only handoffs; missing identity only warns', async () => {
  const w = worker({ enabled: true });
  await w.send({ type: 'action', job, action: 'VIEW' });
  const key = S.recordKey(w.saved.records[0]);
  for (const action of ['SAVED', 'APPLIED']) {
    const result = await w.send({ type: 'manage', key, action }, 'chrome-extension://test/options/options.html');
    assert.equal(result.ok, true); assert.equal(result.handoff.sourceJobId, job.id);
    assert.equal(result.handoff.requestedStage, action); assert.equal(result.handoff.jdMarkdown, undefined);
  }
  const weak = await w.send({ type: 'action', job: { ...job, id: '', url: '' }, action: 'SAVED' });
  assert.equal(weak.ok, true); assert.match(weak.trackerWarning, /missing/);
});
