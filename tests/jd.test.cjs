const { test } = require('node:test');
const assert = require('node:assert/strict');
const J = require('../src/jd.js');
test('Markdown contains structured metadata and complete visible description', () => {
  const text = J.markdown({ title: 'Engineer', company: 'Example', location: 'Auckland', salary: '$100k', posted: '2 days ago', url: 'https://nz.seek.com/job/1', id: '1', description: 'First paragraph\n\nFinal paragraph' });
  for (const value of ['# Engineer', 'Example', 'Auckland', '$100k', '2 days ago', 'https://nz.seek.com/job/1', '**SEEK Job ID:** 1', 'First paragraph\n\nFinal paragraph']) assert.ok(text.includes(value));
  assert.ok(J.markdown({ title: 'Job', description: 'Details' }).includes('Not available'));
});
test('download filenames are bounded and remove unsafe path characters', () => {
  assert.equal(J.filename({ company: 'Xero Limited', title: 'Full-Stack Engineer', id: '123' }), 'xero-limited-full-stack-engineer-seek-123.md');
  const filename = J.filename({ company: '../A:B', title: 'Role/Name*?<>|', id: '123' });
  assert.equal(filename, 'a-b-role-name-seek-123.md');
  assert.ok(J.filename({ title: 'a'.repeat(500) }).length < 160);
  assert.equal(J.filename({}), 'company-job-seek-job.md');
});

const S = require('../src/state.js');
const when = '2026-09-27T01:02:03.000Z';
// Every scalar uses JSON-compatible YAML syntax; keep this reader dependency-free.
function metadata(markdown) {
  assert.ok(markdown.startsWith('---\n'));
  return Object.fromEntries(markdown.split('\n---\n')[0].slice(4).split('\n').map(line => {
    const split = line.indexOf(': ');
    return [line.slice(0, split), JSON.parse(line.slice(split + 2))];
  }));
}
const job = { platform: 'seek', id: '12345678', title: 'Software Engineer', company: 'Xero Limited', location: 'Auckland Central', url: 'https://seek.co.nz/job/12345678?tracking=x', description: 'First paragraph\n\nFinal paragraph' };
test('SEEK handoff has versioned metadata, existing canonical identity and normalized URL', () => {
  const output = J.markdown(job, { mark: 'SAVED', viewed: true }, when);
  assert.deepEqual(metadata(output), {
    easyseek_schema: 1, platform: 'seek', job_id: '12345678', canonical_url: 'https://nz.seek.com/job/12345678',
    canonical_key: S.identity(job).canonicalKey, mark: 'saved', viewed: true, title: job.title, company: job.company,
    location: job.location, salary: null, posted: null, exported_at: when
  });
  assert.equal(metadata(output).canonical_key, 'xero|auckland|software engineer');
  assert.equal(output, J.markdown(job, { mark: 'SAVED', viewed: true }, when));
  assert.ok(output.endsWith('First paragraph\n\nFinal paragraph\n'));
});
test('LinkedIn handoff derives numeric ID and keeps platform-specific canonical identity', () => {
  const linked = { ...job, id: undefined, platform: 'linkedin', url: 'https://www.linkedin.com/jobs/search-results/?currentJobId=4321123456&trackingId=x' };
  const data = metadata(J.markdown(linked, { mark: 'APPLIED', viewed: false }, when));
  assert.equal(data.platform, 'linkedin'); assert.equal(data.job_id, '4321123456');
  assert.equal(data.canonical_url, 'https://www.linkedin.com/jobs/view/4321123456/');
  assert.equal(data.canonical_key, 'linkedin|xero|auckland|software engineer');
  assert.equal(data.mark, 'applied'); assert.equal(data.viewed, false);
  assert.equal(J.filename(linked), 'xero-limited-software-engineer-linkedin-4321123456.md');
});
test('all marks and viewed values round-trip; missing optional metadata is consistently null', () => {
  for (const mark of ['NONE', 'SKIP', 'SAVED', 'APPLIED']) for (const viewed of [true, false]) {
    const data = metadata(J.markdown(job, { mark, viewed }, when));
    assert.equal(data.mark, mark.toLowerCase()); assert.equal(data.viewed, viewed);
  }
  const data = metadata(J.markdown({ title: 'Job', location: '  ', salary: '', posted: null }, {}, when));
  for (const key of ['company', 'location', 'salary', 'posted', 'canonical_key', 'canonical_url', 'job_id']) assert.equal(data[key], null);
  assert.equal(data.mark, 'none'); assert.equal(data.viewed, false);
});
test('YAML strings preserve punctuation, quotes, backslashes, control and Unicode newlines', () => {
  const special = 'Role: # "quoted" \\ path\n---\nmark: applied\r\t\u0085\u2028\u2029';
  const output = J.markdown({ ...job, title: special, company: special, salary: special, posted: special }, {}, when);
  const data = metadata(output);
  for (const key of ['title', 'company', 'salary', 'posted']) assert.equal(data[key], special);
  assert.equal(data.mark, 'none');
  assert.equal(output.split('\n---\n').length, 2, 'values cannot inject front matter delimiters');
});
test('formatting leaves inputs, marks and all retention/view timestamps unchanged', () => {
  const records = S.apply(S.apply([], job, 'SAVED', 1), job, 'VIEW', 2);
  const snapshot = JSON.stringify(records), original = JSON.stringify(job);
  const state = Object.freeze(S.getState(records, job));
  Object.freeze(job);
  J.markdown(job, state, when); J.filename(job);
  assert.equal(JSON.stringify(records), snapshot); assert.equal(JSON.stringify(job), original);
  assert.ok(records.every(record => !('description' in record)));
});
