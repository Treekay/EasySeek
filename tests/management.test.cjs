const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const S = require('../src/state.js');
const job = { id: '1', title: 'Engineer', company: 'Example Ltd', location: 'Auckland' };
function worker(initial = {}) {
  let listener, opened = 0;
  const saved = structuredClone(initial);
  const context = vm.createContext({ EasySeekState: S, importScripts() {}, chrome: {
    runtime: { id: 'test', getURL(path) { return 'chrome-extension://test/' + path; }, onMessage: { addListener(fn) { listener = fn; } } },
    tabs: { async create({ url }) { assert.equal(url, 'chrome-extension://test/options/options.html'); opened++; } },
    storage: { local: { async get() { return structuredClone(saved); }, async set(data) { Object.assign(saved, structuredClone(data)); } } }
  } });
  vm.runInContext(fs.readFileSync('src/background.js', 'utf8'), context);
  return { saved, get opened() { return opened; }, send(message, url = 'chrome-extension://test/options/options.html') {
    return new Promise(resolve => {
      const handled = listener({ channel: 'easyseek', ...message }, { id: 'test', url }, resolve);
      if (!handled) resolve(null);
    });
  } };
}
test('background accepts production searches/details and legacy domains, rejecting lookalikes', async () => {
  const w = worker();
  for (const url of ['https://nz.seek.com/software-engineer-jobs', 'https://nz.seek.com/job/1?tracking=x', 'https://seek.co.nz/jobs', 'https://www.seek.co.nz/job/1']) {
    const result = await w.send({ type: 'action', job, action: 'SAVED' }, url);
    assert.equal(result.ok, true, url);
    assert.equal(result.records[0].url, 'https://nz.seek.com/job/1');
  }
  assert.equal(w.saved.records.length, 1);
  for (const url of ['https://nz.seek.com.example.com/jobs', 'https://example.com/jobs', 'http://nz.seek.com/jobs', 'blob:https://nz.seek.com/jobs', '/jobs']) {
    assert.equal(await w.send({ type: 'read' }, url), null, url);
  }
  assert.equal((await w.send({ type: 'manage', key: S.recordKey(w.saved.records[0]), action: 'REMOVE' }, 'https://nz.seek.com/jobs')).ok, false);
});
test('options can migrate and manage; SEEK can open options but not remove records', async () => {
  const legacy = [{ status: 'PURSUE', canonicalKey: '', seekIds: ['1'], title: 'Engineer', firstSeenAt: Date.now(), lastSeenAt: Date.now(), updatedAt: Date.now() }];
  const w = worker({ records: legacy });
  let result = await w.send({ type: 'read' });
  assert.ok(result.ok); assert.equal(w.saved.records[0].mark, 'SAVED');
  const key = S.recordKey(result.records[0]);
  result = await w.send({ type: 'manage', key, action: 'APPLIED' });
  assert.equal(result.records[0].mark, 'APPLIED');
  assert.equal((await w.send({ type: 'manage', key, action: 'REMOVE' }, 'https://www.seek.co.nz/jobs')).ok, false);
  await w.send({ type: 'openOptions' }, 'https://www.seek.co.nz/jobs'); assert.equal(w.opened, 1);
  assert.equal(await w.send({ type: 'read' }, 'https://example.com/'), null);
  result = await w.send({ type: 'manage', key, action: 'REMOVE' });
  assert.equal(result.records.length, 0);
});
test('settings apply before cleanup, preserve timestamps, validate all new fields', async () => {
  const records = S.apply([], job, 'SKIP', Date.now() - 70 * S.DAY);
  const timestamp = records[0].markChangedAt;
  const w = worker({ records });
  let result = await w.send({ type: 'preferences', preferences: { skipDays: null, savedDays: 90, appliedDays: 180, viewedDays: 30, hideSaved: true, hideApplied: true, hideViewed: true } });
  assert.equal(result.records.length, 1); assert.equal(result.records[0].markChangedAt, timestamp);
  assert.equal(result.preferences.appliedDays, 180); assert.equal(result.preferences.hideSaved, true);
  result = await w.send({ type: 'preferences', preferences: { skipDays: 0 } });
  assert.equal(result.ok, false); assert.equal(w.saved.preferences.skipDays, null);
  result = await w.send({ type: 'preferences', preferences: { skipDays: 30 } });
  assert.equal(result.records.length, 0);
});
test('serialized VIEW and manual marks from simultaneous tabs remain independent', async () => {
  const w = worker();
  const results = await Promise.all([
    w.send({ type: 'action', job, action: 'SAVED' }, 'https://www.seek.co.nz/jobs'),
    w.send({ type: 'action', job, action: 'VIEW' }, 'https://www.seek.co.nz/jobs'),
    w.send({ type: 'action', job: { id: '2' }, action: 'APPLIED' }, 'https://www.seek.co.nz/jobs')
  ]);
  assert.ok(results.every(result => result.ok));
  assert.equal(w.saved.records.length, 2);
  assert.deepEqual(S.getState(w.saved.records, job), { mark: 'SAVED', viewed: true });
  const key = S.recordKey(w.saved.records[0]);
  await w.send({ type: 'manage', key, action: 'NONE' });
  assert.deepEqual(S.getState(w.saved.records, job), { mark: 'NONE', viewed: true });
});
test('cleanup requires confirmation; default saved/applied survive', async () => {
  const w = worker({ records: [...S.apply([], job, 'SAVED', 0), ...S.apply([], { id: '2' }, 'APPLIED', 0)] });
  assert.equal((await w.send({ type: 'bulk', action: 'EXPIRED' })).ok, false);
  assert.equal((await w.send({ type: 'bulk', action: 'SAVED', confirmed: true })).ok, false);
  assert.equal((await w.send({ type: 'bulk', action: 'EXPIRED', confirmed: true })).records.length, 2);
});

test('LinkedIn Jobs messages accepted, feed and lookalike senders rejected', async () => {
  const w = worker();
  for (const url of ['https://www.linkedin.com/jobs/search/?currentJobId=1', 'https://nz.linkedin.com/jobs/view/1/']) {
    const result = await w.send({ type: 'action', job: { ...job, platform: 'linkedin' }, action: 'SAVED' }, url);
    assert.equal(result.ok, true); assert.equal(result.records[0].platform, 'linkedin');
    assert.equal(result.records[0].url, 'https://www.linkedin.com/jobs/view/1/');
  }
  for (const url of ['https://www.linkedin.com/feed/', 'https://www.linkedin.com.evil.test/jobs/search/']) assert.equal(await w.send({ type: 'read' }, url), null);
});
