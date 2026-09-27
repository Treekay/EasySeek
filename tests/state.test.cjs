const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/state.js');
const job = { id: '12345678', title: 'Full-Stack Engineer', company: 'Xero Limited', location: 'Auckland Central', url: 'https://www.seek.co.nz/job/12345678?tracking=abc' };
test('production and legacy domains share identity; unrelated origins are rejected', () => {
  for (const origin of ['https://nz.seek.com', 'https://seek.co.nz', 'https://www.seek.co.nz']) {
    assert.equal(S.isSeekUrl(origin + '/software-engineer-jobs?jobId=12345678'), true);
    assert.equal(S.jobId(origin + '/job/12345678?tracking=abc#description'), job.id);
    assert.equal(S.identity({ url: origin + '/job/12345678?tracking=other' }).key, 'seek:' + job.id);
  }
  for (const origin of ['https://example.com', 'https://nz.seek.com.example.com', 'https://seek.com', 'https://www.seek.com', 'http://nz.seek.com', 'https://nz.seek.com:8443', 'https://nz.seek.com@example.com', 'blob:https://nz.seek.com']) {
    assert.equal(S.isSeekUrl(origin + '/job/12345678'), false, origin);
    assert.equal(S.jobId(origin + '/job/12345678'), '', origin);
  }
  assert.equal(S.isSeekUrl('/jobs'), false);
  assert.equal(S.isSeekUrl('not a URL'), false);
  assert.equal(S.canonicalUrl(job.id), 'https://nz.seek.com/job/12345678');
  assert.equal(S.canonicalUrl('123?tracking=x'), '');
});
test('manifest matches stay aligned with the shared origin list', () => {
  const manifest = require('../manifest.json');
  assert.deepEqual(manifest.content_scripts[0].matches, S.seekOrigins.map(origin => origin + '/*'));
});
test('legacy stored marks and viewed history survive production-domain observations', () => {
  for (const mark of ['SKIP', 'SAVED', 'APPLIED']) {
    const records = S.apply(S.apply([], job, 'VIEW', 10), job, mark, 20);
    records[0].url = 'https://www.seek.co.nz/job/12345678';
    assert.deepEqual(S.migrate(records, 30), records);
    const updated = S.apply(records, { url: 'https://nz.seek.com/job/12345678?tracking=new' }, 'OBSERVE', 30);
    assert.equal(updated.length, 1);
    assert.equal(updated[0].url, 'https://nz.seek.com/job/12345678');
    assert.equal(updated[0].mark, mark);
    assert.equal(updated[0].markChangedAt, 20);
    assert.equal(updated[0].lastViewedAt, 10);
    assert.deepEqual(updated[0].seekIds, records[0].seekIds);
    assert.equal(updated[0].canonicalKey, records[0].canonicalKey);
  }
});
test('identity ignores tracking, normalizes suffixes/hyphens, preserves seniority', () => {
  assert.equal(S.jobId(job.url), job.id);
  assert.equal(S.jobId('/job/12345678?x=2'), job.id);
  assert.equal(S.jobId('https://example.com/job/12345678'), '');
  assert.equal(S.identity(job).canonicalKey, 'xero|auckland|full stack engineer');
  assert.equal(S.identity({ ...job, location: 'Remote' }).canonicalKey, '');
  assert.notEqual(S.identity({ ...job, title: 'Software Engineer' }).key, S.identity({ ...job, title: 'Senior Software Engineer' }).key);
});
test('unseen NONE has no record; viewing records history without marking', () => {
  assert.deepEqual(S.getState([], job), { mark: 'NONE', viewed: false });
  assert.deepEqual(S.apply([], job, 'OBSERVE', 0), []);
  const records = S.apply([], job, 'VIEW', 0);
  assert.deepEqual(S.getState(records, job), { mark: 'NONE', viewed: true });
  assert.equal(records[0].lastViewedAt, 0);
  assert.equal(records[0].markChangedAt, null);
});
test('opening never changes a mark or its timestamp; observation never counts as viewing', () => {
  for (const mark of ['SKIP', 'SAVED', 'APPLIED']) {
    let records = S.apply([], job, mark, 0);
    records = S.apply(records, job, 'OBSERVE', S.DAY);
    assert.equal(records[0].lastViewedAt, null);
    records = S.apply(records, job, 'VIEW', 2 * S.DAY);
    assert.equal(records[0].mark, mark);
    assert.equal(records[0].markChangedAt, 0);
    assert.equal(records[0].lastViewedAt, 2 * S.DAY);
  }
});
test('repeated observations and aliases cannot extend SKIP expiry', () => {
  let records = S.apply([], job, 'SKIP', 0);
  for (const day of [10, 20, 50]) records = S.apply(records, { ...job, id: String(day), title: 'Full Stack Engineer', company: 'Xero Ltd.' }, 'OBSERVE', day * S.DAY);
  assert.equal(records[0].markChangedAt, 0);
  assert.equal(records[0].seekIds.length, 4);
  assert.equal(S.cleanup(records, 60 * S.DAY - 1).length, 1);
  assert.equal(S.cleanup(records, 60 * S.DAY).length, 0);
  assert.equal(S.getState(records, { id: '20' }).mark, 'SKIP');
});
test('viewed expiry uses actual views, not search observations', () => {
  let records = S.apply([], job, 'VIEW', 0);
  records = S.apply(records, job, 'OBSERVE', 50 * S.DAY);
  assert.equal(S.cleanup(records, 60 * S.DAY).length, 0);
  records = S.apply(records, job, 'VIEW', 50 * S.DAY);
  assert.equal(S.cleanup(records, 109 * S.DAY).length, 1);
  assert.equal(S.cleanup(records, 110 * S.DAY).length, 0);
});
test('view and mark expiry clear only their own concept', () => {
  let records = S.apply([], job, 'SKIP', 0);
  records = S.apply(records, job, 'VIEW', 50 * S.DAY);
  records = S.cleanup(records, 60 * S.DAY);
  assert.equal(records[0].mark, 'NONE'); assert.equal(records[0].lastViewedAt, 50 * S.DAY);
  for (const mark of ['SAVED', 'APPLIED']) {
    let keep = S.apply(S.apply([], job, 'VIEW', 0), job, mark, 1);
    keep = S.cleanup(keep, 10000 * S.DAY);
    assert.equal(keep[0].mark, mark); assert.equal(keep[0].lastViewedAt, null);
  }
});
test('clear mark keeps viewed history; remove discards entire linked opportunity', () => {
  let records = S.apply(S.apply([], job, 'VIEW', 0), job, 'SAVED', 1);
  records = S.apply(records, { ...job, id: '99' }, 'OBSERVE', 2);
  records = S.apply(records, job, 'NONE', 3);
  assert.deepEqual(S.getState(records, { id: '99' }), { mark: 'NONE', viewed: true });
  assert.equal(records[0].lastViewedAt, 0);
  records = S.manage(records, S.recordKey(records[0]), 'REMOVE', 4);
  assert.equal(records.length, 0); assert.equal(S.getState(records, job).mark, 'NONE');
  assert.deepEqual(S.apply(S.apply([], job, 'SKIP', 0), job, 'NONE', 1), []);
});
test('manual management marks restart retention without changing view date', () => {
  let records = S.apply([], job, 'VIEW', 0), key = S.recordKey(records[0]);
  for (const [index, mark] of ['SKIP', 'SAVED', 'APPLIED', 'SKIP'].entries()) {
    records = S.manage(records, key, mark, (index + 1) * S.DAY);
    assert.equal(records[0].markChangedAt, (index + 1) * S.DAY);
    assert.equal(records[0].lastViewedAt, 0);
  }
  records = S.manage(records, key, 'NONE', 10 * S.DAY);
  assert.equal(records[0].lastViewedAt, 0); assert.equal(records[0].mark, 'NONE');
});
test('each retention setting supports finite or Never without rewriting timestamps', () => {
  for (const [mark, key] of [['SKIP', 'skipDays'], ['SAVED', 'savedDays'], ['APPLIED', 'appliedDays']]) {
    const records = S.apply([], job, mark, 0);
    assert.equal(S.cleanup(records, 40 * S.DAY, { [key]: 30 }).length, 0);
    assert.equal(S.cleanup(records, 400 * S.DAY, { [key]: null }).length, 1);
    assert.equal(records[0].markChangedAt, 0);
  }
  const records = S.apply([], job, 'VIEW', 0);
  assert.equal(S.cleanup(records, 400 * S.DAY, { viewedDays: null }).length, 1);
  assert.equal(S.cleanup(records, 30 * S.DAY, { viewedDays: 30 }).length, 0);
});
test('all filters independent, default only Skip, selecting all types shows everything', () => {
  for (const mark of S.marks) for (const viewed of [true, false]) {
    assert.equal(S.hidden({ mark, viewed }, {}), mark === 'SKIP');
    assert.equal(S.hidden({ mark, viewed }, { hideViewed: true }), mark === 'SKIP' || viewed);
    assert.equal(S.hidden({ mark, viewed }, { hideSkipped: false, hideSaved: false, hideApplied: false, hideViewed: false }), false);
  }
  assert.equal(S.hidden({ mark: 'APPLIED', viewed: false }, { hideApplied: true }), true);
  assert.equal(S.hidden({ mark: 'SAVED', viewed: false }, { hideSaved: true }), true);
  assert.equal(S.hidden({ mark: 'SKIP', viewed: false }, { hideSkipped: false }), false);
});
test('migration maps old marks/history conservatively and is idempotent', () => {
  const legacy = ['SEEN', 'SKIP', 'PURSUE'].map(status => ({ canonicalKey: 'xero|auckland|engineer', seekIds: ['1', '2'], title: 'Engineer', company: 'Xero', city: 'auckland', status, firstSeenAt: 10, lastSeenAt: 300, updatedAt: 200, manualAt: 100 }));
  const migrated = S.migrate(legacy, 999);
  assert.deepEqual(migrated.map(record => record.mark), ['NONE', 'SKIP', 'SAVED']);
  assert.deepEqual(migrated.map(record => record.lastViewedAt), [200, null, null]);
  assert.deepEqual(migrated.map(record => record.markChangedAt), [null, 100, 100]);
  assert.deepEqual(S.migrate(migrated, 1000), migrated);
  assert.deepEqual(migrated[0].seekIds, ['1', '2']);
  assert.equal(S.migrate([{ ...legacy[1], statusChangedAt: 50 }])[0].markChangedAt, 50);
  assert.equal(S.migrate([{ status: 'SEEN', seekIds: [] }], 999)[0].lastViewedAt, 999);
  assert.equal(migrated[0].status, undefined);
  assert.equal(S.preferences({ hideSeen: true, seenDays: 90 }).hideViewed, false);
  assert.equal(S.preferences({ seenDays: 90 }).viewedDays, 90);
});
test('missing fields use ID only; complete fallback works without ID; no JD stored', () => {
  let records = S.apply([], { id: '1' }, 'SAVED', 0);
  assert.equal(S.getState(records, { id: '2' }).mark, 'NONE');
  records = S.apply(records, { ...job, id: '1' }, 'VIEW', 1);
  assert.equal(records[0].canonicalKey, S.identity(job).canonicalKey);
  assert.equal(records[0].mark, 'SAVED');
  const fallback = S.apply([], { ...job, id: '', url: '', description: 'not stored' }, 'APPLIED', 0);
  assert.equal(fallback.length, 1); assert.equal(fallback[0].description, undefined);
  assert.deepEqual(S.apply([], {}, 'VIEW'), []);
});
test('retention inputs validated and old actions rejected', () => {
  for (const value of [0, -1, 1.5, '60', Infinity, 36501]) assert.equal(S.validDays(value), false);
  assert.equal(S.validDays(null), true);
  assert.throws(() => S.apply([], job, 'PURSUE'), /Invalid action/);
});
