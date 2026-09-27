const { test } = require('node:test');
const assert = require('node:assert/strict');
const J = require('../src/jd.js');
test('Markdown contains structured metadata and complete visible description', () => {
  const text = J.markdown({ title: 'Engineer', company: 'Example', location: 'Auckland', salary: '$100k', posted: '2 days ago', url: 'https://nz.seek.com/job/1', id: '1', description: 'First paragraph\n\nFinal paragraph' });
  for (const value of ['# Engineer', 'Example', 'Auckland', '$100k', '2 days ago', 'https://nz.seek.com/job/1', '**SEEK Job ID:** 1', 'First paragraph\n\nFinal paragraph']) assert.ok(text.includes(value));
  assert.ok(J.markdown({ title: 'Job', description: 'Details' }).includes('Not available'));
});
test('download filenames are bounded and remove unsafe path characters', () => {
  assert.equal(J.filename({ company: 'Xero Limited', title: 'Full-Stack Engineer', id: '123' }), 'xero-limited-full-stack-engineer-123.md');
  const filename = J.filename({ company: '../A:B', title: 'Role/Name*?<>|', id: '123' });
  assert.equal(filename, 'a-b-role-name-123.md');
  assert.ok(J.filename({ title: 'a'.repeat(500) }).length < 160);
  assert.equal(J.filename({}), 'company-job-seek.md');
});
