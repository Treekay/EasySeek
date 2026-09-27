const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/state.js');
const J = require('../src/jd.js');
const job = { platform: 'linkedin', id: '123', title: 'Full-Stack Engineer', company: 'Xero Limited', location: 'Auckland Central', url: 'https://www.linkedin.com/jobs/view/123/?tracking=x' };
test('LinkedIn URLs: numeric, slug, search selection, collection, unrelated hosts', () => {
  for (const origin of S.linkedinOrigins) {
    assert.equal(S.linkedinJobId(origin + '/jobs/view/123/?tracking=x'), '123');
    assert.equal(S.linkedinJobId(origin + '/jobs/view/full-stack-engineer-at-example-123'), '123');
    assert.equal(S.linkedinJobId(origin + '/jobs/search/?currentJobId=123&keywords=engineer'), '123');
    assert.equal(S.linkedinJobId(origin + '/jobs/search-results/?currentJobId=4461706468&trackingId=ignored'), '4461706468');
    assert.equal(S.linkedinJobId(origin + '/jobs/collections/recommended/?currentJobId=123'), '123');
    assert.equal(S.isSupportedPage(origin + '/jobs/'), true);
    assert.equal(S.isSupportedPage(origin + '/feed/'), false);
  }
  for (const url of ['https://www.linkedin.com.evil.test/jobs/view/123/', 'http://www.linkedin.com/jobs/view/123/', 'https://example.com/jobs/view/123/', 'https://www.linkedin.com/feed/?currentJobId=123', 'https://www.linkedin.com/jobs/search/?currentJobId=abc']) assert.equal(S.linkedinJobId(url), '');
  assert.equal(S.canonicalUrl('123', 'linkedin'), 'https://www.linkedin.com/jobs/view/123/');
  const manifest = require('../manifest.json');
  assert.deepEqual(manifest.content_scripts[1].matches, S.linkedinOrigins.map(origin => origin + '/*'));
});
test('same numeric IDs and canonical titles on SEEK and LinkedIn remain separate', () => {
  let records = S.apply([], { ...job, platform: 'seek', url: 'https://nz.seek.com/job/123' }, 'SKIP', 0);
  assert.deepEqual(S.getState(records, job), { mark: 'NONE', viewed: false, applicationStage: 'NONE', applicationHistory: [] });
  records = S.apply(records, job, 'SAVED', 1);
  records = S.apply(records, job, 'VIEW', 2);
  assert.equal(records.length, 2);
  assert.equal(records[0].mark, 'SKIP');
  assert.deepEqual(records[1].linkedinIds, ['123']);
  assert.equal(records[1].seekIds, undefined);
  assert.notEqual(S.recordKey(records[0]), S.recordKey(records[1]));
  assert.deepEqual(S.getState(records, job), { mark: 'SAVED', viewed: true, applicationStage: 'NONE', applicationHistory: [] });
});
test('LinkedIn aliases deduplicate only within platform without extending expiry', () => {
  let records = S.apply([], job, 'SKIP', 0);
  records = S.apply(records, { ...job, id: '999', title: 'Full Stack Engineer' }, 'OBSERVE', 50 * S.DAY);
  assert.deepEqual(records[0].linkedinIds, ['123', '999']);
  assert.equal(records[0].markChangedAt, 0);
  assert.equal(S.cleanup(records, 60 * S.DAY).length, 0);
  assert.equal(S.getState(records, { platform: 'linkedin', id: '999' }).mark, 'SKIP');
  assert.equal(S.getState(records, { platform: 'linkedin', id: '777', title: 'Senior Full Stack Engineer', company: job.company, location: job.location }).mark, 'NONE');
});
test('schema 2 migration preserves all memory and old management keys', () => {
  const record = { schemaVersion: 2, canonicalKey: '', seekIds: ['123'], url: 'https://seek.co.nz/job/123', mark: 'APPLIED', markChangedAt: 100, lastViewedAt: 200, firstSeenAt: 50, lastSeenAt: 300, updatedAt: 300 };
  const migrated = S.migrate([record], 400)[0];
  assert.equal(S.recordKey(migrated), 'seek:123');
  assert.deepEqual(migrated, { ...record, schemaVersion: 4, platform: 'seek', mark: 'NONE', savedAt: null, applicationStage: 'APPLIED', applicationStageChangedAt: 100, applicationHistory: [{ stage: 'APPLIED', at: 100 }] });
  assert.deepEqual(S.migrate([migrated], 500), [migrated]);
  assert.equal(S.getState([migrated], job).mark, 'NONE');
});
test('LinkedIn Markdown uses the correct platform and no SEEK ID label', () => {
  const output = J.markdown({ ...job, description: 'First paragraph\n\nLast paragraph' });
  assert.ok(output.includes('LinkedIn Job ID'));
  assert.ok(output.includes('Last paragraph'));
  assert.ok(!output.includes('SEEK Job ID'));
});
test('LinkedIn Memory management clears marks independently and removes linked IDs', () => {
  let records = S.apply(S.apply([], job, 'VIEW', 1), job, 'APPLIED', 2);
  const key = S.recordKey(records[0]);
  records = S.manage(records, key, 'NONE', 3);
  assert.deepEqual(S.getState(records, job), { mark: 'NONE', viewed: true, applicationStage: 'APPLIED', applicationHistory: [{ stage: 'APPLIED', at: 2 }] });
  records = S.manage(records, key, 'REMOVE', 4);
  assert.equal(records.length, 0);
});
