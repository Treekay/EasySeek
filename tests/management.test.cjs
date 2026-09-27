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
    runtime: { id: 'test', async openOptionsPage() { opened++; }, onMessage: { addListener(fn) { listener = fn; } } },
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
test('options sender can migrate, manage, remove; SEEK can open options but not bulk-delete', async () => {
  const legacy = S.apply([], job, 'PURSUE'); delete legacy[0].statusChangedAt;
  const w = worker({ records: legacy });
  let result = await w.send({ type: 'read' });
  assert.ok(result.ok); assert.ok(w.saved.records[0].statusChangedAt);
  const key = S.recordKey(result.records[0]);
  result = await w.send({ type: 'manage', key, action: 'SEEN' });
  assert.equal(result.records[0].status, 'SEEN');
  const timestamp = result.records[0].statusChangedAt;
  await w.send({ type: 'observe', jobs: [{ ...job, id: '2' }] }, 'https://www.seek.co.nz/jobs');
  assert.equal(w.saved.records[0].statusChangedAt, timestamp);
  assert.equal(w.saved.records[0].seekIds.length, 2);
  assert.equal((await w.send({ type: 'bulk', action: 'SEEN', confirmed: true }, 'https://www.seek.co.nz/jobs')).ok, false);
  await w.send({ type: 'openOptions' }, 'https://www.seek.co.nz/jobs'); assert.equal(w.opened, 1);
  assert.equal(await w.send({ type: 'read' }, 'https://example.com/'), null);
  result = await w.send({ type: 'manage', key, action: 'REMOVE' });
  assert.equal(result.records.length, 0);
  assert.equal((await w.send({ type: 'manage', key, action: 'SKIP' })).ok, false);
});
test('settings apply before cleanup, preserve timestamps and reject invalid values atomically', async () => {
  const records = S.apply([], job, 'SKIP', Date.now() - 70 * S.DAY);
  const timestamp = records[0].statusChangedAt;
  const w = worker({ records });
  let result = await w.send({ type: 'preferences', preferences: { skipDays: null } });
  assert.equal(result.records.length, 1); assert.equal(result.records[0].statusChangedAt, timestamp);
  result = await w.send({ type: 'preferences', preferences: { skipDays: 0 } });
  assert.equal(result.ok, false); assert.equal(w.saved.preferences.skipDays, null);
  result = await w.send({ type: 'preferences', preferences: { skipDays: 30 } });
  assert.equal(result.records.length, 0);
});
test('bulk actions require confirmation, keep other states, and never clear PURSUE', async () => {
  let records = [];
  for (const [index, status] of ['SEEN', 'SKIP', 'PURSUE'].entries()) records = S.apply(records, { id: String(index) }, status);
  const w = worker({ records });
  assert.equal((await w.send({ type: 'bulk', action: 'SEEN' })).ok, false);
  assert.equal(w.saved.records.length, 3);
  assert.equal((await w.send({ type: 'bulk', action: 'PURSUE', confirmed: true })).ok, false);
  assert.equal((await w.send({ type: 'bulk', action: 'SEEN', confirmed: true })).records.length, 2);
  assert.equal((await w.send({ type: 'bulk', action: 'SKIP', confirmed: true })).records.length, 1);
  assert.equal((await w.send({ type: 'bulk', action: 'EXPIRED', confirmed: true })).records[0].status, 'PURSUE');
});
