const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const S = require('../src/state.js');
const job = { id: '12345678', title: 'Full-Stack Engineer', company: 'Xero Limited', location: 'Auckland Central', url: 'https://www.seek.co.nz/job/12345678?tracking=abc' };
test('IDs ignore tracking and reject unrelated hosts', () => {
  assert.equal(S.jobId(job.url), job.id);
  assert.equal(S.jobId('/job/12345678?x=2'), job.id);
  assert.equal(S.jobId('https://evil.example/job/12345678'), '');
});
test('canonical normalization preserves seniority and refuses unknown cities', () => {
  assert.equal(S.identity(job).canonicalKey, 'xero|auckland|full stack engineer');
  assert.equal(S.identity({ ...job, location: 'Remote' }).canonicalKey, '');
  assert.notEqual(S.identity({ ...job, title: 'Software Engineer' }).key, S.identity({ ...job, title: 'Senior Software Engineer' }).key);
});
test('A–H: new, seen, reset, skip and cross-search tracking variants', () => {
  let records = [];
  assert.equal(S.status(records, job), 'NEW');
  records = S.apply(records, job, 'SEEN', 1);
  assert.equal(S.status(records, { ...job, url: job.url + '&foo=bar' }), 'SEEN');
  records = S.apply(records, job, 'RESET', 2);
  assert.equal(records.length, 0);
  records = S.apply(records, job, 'SKIP', 3);
  assert.equal(S.status(records, { id: job.id }), 'SKIP');
});
test('I–J: repost aliases match while seniority stays separate', () => {
  let records = S.apply([], job, 'SKIP', 1);
  const repost = { ...job, id: '99999999', title: 'Full Stack Engineer', company: 'Xero Ltd.' };
  assert.equal(S.status(records, repost), 'SKIP');
  records = S.apply(records, repost, 'OBSERVE', 2);
  assert.deepEqual(records[0].seekIds, [job.id, repost.id]);
  assert.equal(S.status(records, { id: repost.id }), 'SKIP');
  assert.equal(S.status(records, { ...repost, id: '111', title: 'Senior Full Stack Engineer' }), 'NEW');
  assert.equal(S.apply(records, repost, 'RESET').length, 0);
});
test('K–N: auto-seen preserves decisions; expiry uses statusChangedAt and retains pursue', () => {
  for (const status of ['SKIP', 'PURSUE']) {
    const records = S.apply(S.apply([], job, status, 1), job, 'SEEN', 2);
    assert.equal(records[0].status, status);
    assert.equal(records[0].firstSeenAt, 1);
  }
  for (const status of ['SEEN', 'SKIP', 'PURSUE']) {
    let records = S.apply([], job, status, 1);
    assert.equal(S.cleanup(records, 60 * S.DAY + 1).length, status === 'PURSUE' ? 1 : 0);
    records = S.apply(records, job, 'OBSERVE', 50 * S.DAY);
    assert.equal(S.cleanup(records, 65 * S.DAY).length, status === 'PURSUE' ? 1 : 0);
  }
});
test('A–B: observations, opening, and listing aliases never extend SEEN/SKIP expiry', () => {
  for (const status of ['SEEN', 'SKIP']) {
    let records = S.apply([], job, status, 0);
    for (const day of [10, 20, 50]) {
      records = S.apply(records, { ...job, id: String(day) }, 'OBSERVE', day * S.DAY);
      records = S.apply(records, job, 'SEEN', day * S.DAY);
      assert.equal(records[0].statusChangedAt, 0);
      assert.equal(records[0].status, status);
    }
    assert.equal(records[0].lastSeenAt, 50 * S.DAY);
    assert.equal(records[0].seekIds.length, 4);
    assert.equal(S.cleanup(records, 60 * S.DAY - 1).length, 1);
    assert.equal(S.cleanup(records, 60 * S.DAY).length, 0);
  }
});
test('C–D, G: management transitions reset decision time but not observation time', () => {
  let records = S.apply([], job, 'SKIP', 0);
  const key = S.recordKey(records[0]);
  records = S.manage(records, key, 'PURSUE', 10 * S.DAY);
  assert.equal(S.cleanup(records, 1000 * S.DAY).length, 1);
  records = S.manage(records, key, 'SKIP', 20 * S.DAY);
  assert.equal(records[0].statusChangedAt, 20 * S.DAY);
  assert.equal(records[0].lastSeenAt, 0);
  assert.equal(S.cleanup(records, 79 * S.DAY).length, 1);
  assert.equal(S.cleanup(records, 80 * S.DAY).length, 0);
  records = S.manage(records, key, 'SEEN', 30 * S.DAY);
  assert.equal(records[0].status, 'SEEN');
  assert.equal(records[0].statusChangedAt, 30 * S.DAY);
  records = S.apply(records, job, 'SEEN', 40 * S.DAY);
  assert.equal(records[0].statusChangedAt, 30 * S.DAY);
  records = S.manage(records, key, 'SEEN', 50 * S.DAY);
  assert.equal(records[0].statusChangedAt, 50 * S.DAY);
});
test('E–F: shorter and Never settings use original timestamps', () => {
  for (const status of ['SEEN', 'SKIP']) {
    const records = S.apply([], job, status, 0);
    const prefs = { seenDays: 30, skipDays: 30 };
    assert.equal(S.cleanup(records, 40 * S.DAY).length, 1);
    assert.equal(S.cleanup(records, 40 * S.DAY, prefs).length, 0);
    assert.equal(records[0].statusChangedAt, 0);
    assert.equal(S.cleanup(records, 10000 * S.DAY, { seenDays: null, skipDays: null }).length, 1);
    assert.equal(S.expiresAt(records[0], prefs), 30 * S.DAY);
  }
});
test('H: management removes whole opportunity including IDs and canonical matching', () => {
  let records = S.apply([], job, 'SKIP', 0);
  records = S.apply(records, { ...job, id: '99' }, 'OBSERVE', 10);
  records = S.manage(records, S.recordKey(records[0]), 'REMOVE', 20);
  assert.equal(S.status(records, job), 'NEW');
  assert.equal(S.status(records, { id: '99' }), 'NEW');
  assert.equal(records.length, 0);
});
test('I: V1 migration is lossless and idempotent, with conservative timestamp fallback', () => {
  const legacy = ['SEEN', 'SKIP', 'PURSUE'].map(status => ({ ...S.apply([], job, status, 100)[0], lastSeenAt: 300, updatedAt: 200, manualAt: 100 }));
  legacy.forEach(record => { delete record.statusChangedAt; });
  const migrated = S.migrate(legacy, 999);
  assert.deepEqual(migrated.map(record => record.statusChangedAt), [200, 100, 100]);
  assert.deepEqual(S.migrate(migrated, 1000), migrated);
  assert.deepEqual(migrated.map(({ statusChangedAt, ...record }) => record), legacy);
  assert.equal(S.migrate([{ status: 'SKIP', manualAt: 0, updatedAt: null, lastSeenAt: 400 }], 999)[0].statusChangedAt, 400);
  assert.equal(S.migrate([{ status: 'SEEN' }], 999)[0].statusChangedAt, 999);
  assert.equal(S.cleanup([{ status: 'SEEN' }], 999).length, 1);
});
test('retention values validate and PURSUE ignores finite policies', () => {
  for (const invalid of [0, -1, 1.5, '60', Infinity, 36501]) assert.equal(S.validDays(invalid), false);
  assert.equal(S.validDays(null), true);
  assert.equal(S.validDays(1), true);
  assert.equal(S.expiresAt(S.apply([], job, 'PURSUE', 0)[0], { seenDays: 1, skipDays: 1 }), null);
});
test('missing fields cannot merge unrelated IDs; known ID can acquire metadata', () => {
  let records = S.apply([], { id: '1' }, 'SKIP', 1);
  assert.equal(S.status(records, { id: '2' }), 'NEW');
  records = S.apply(records, { ...job, id: '1' }, 'SEEN', 2);
  assert.equal(records[0].canonicalKey, S.identity(job).canonicalKey);
  assert.equal(records[0].status, 'SKIP');
  assert.deepEqual(S.apply([], {}, 'SEEN'), []);
});
test('fallback identity works without a SEEK ID and never stores a full JD', () => {
  const records = S.apply([], { ...job, id: '', url: '', description: 'private text' }, 'PURSUE', 1);
  assert.equal(records.length, 1);
  assert.equal(records[0].description, undefined);
});
test('O: Markdown includes full description and analysis request', () => {
  const context = vm.createContext({ URL });
  vm.runInContext(fs.readFileSync('src/seek-extractor.js', 'utf8'), context);
  const output = context.EasySeekExtractor.markdown({ ...job, description: 'First paragraph\n\nLast paragraph' });
  for (const text of ['# Job Analysis Request', 'Last paragraph', 'Salary: Not available', 'recommended application strategy', 'SEEK Job ID: 12345678']) assert.ok(output.includes(text));
});
test('worker serializes simultaneous tabs and persists manual priority', async () => {
  let listener;
  const saved = {};
  const context = vm.createContext({
    EasySeekState: S, importScripts() {},
    chrome: { runtime: { id: 'test', onMessage: { addListener(fn) { listener = fn; } } }, storage: { local: {
      async get() { await new Promise(resolve => setTimeout(resolve, 2)); return structuredClone(saved); },
      async set(data) { Object.assign(saved, structuredClone(data)); }
    } } }
  });
  vm.runInContext(fs.readFileSync('src/background.js', 'utf8'), context);
  const send = (action, item = job) => new Promise(resolve => listener({ channel: 'easyseek', type: 'action', action, job: item }, { id: 'test', url: job.url }, resolve));
  const responses = await Promise.all([send('PURSUE'), send('SEEN'), send('SKIP', { ...job, id: '22', title: 'Designer' })]);
  assert.ok(responses.every(r => r.ok));
  assert.equal(saved.records.length, 2);
  assert.equal(S.status(saved.records, job), 'PURSUE');
  await send('RESET');
  assert.equal(S.status(saved.records, job), 'NEW');
});
