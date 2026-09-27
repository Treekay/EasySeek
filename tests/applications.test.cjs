const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/state.js');
const A = require('../src/applications.js');
const job = { id: '123', title: 'Engineer', company: 'Example Ltd', location: 'Auckland' };

test('schema 2/3 Applied migration preserves timestamps, IDs and history idempotently', () => {
  for (const schemaVersion of [2, 3]) for (const at of [0, 123456]) {
    const old = { schemaVersion, mark: 'APPLIED', markChangedAt: at, canonicalKey: '', seekIds: ['123', '456'],
      url: 'https://seek.co.nz/job/123', firstSeenAt: 0, lastSeenAt: 400000, updatedAt: 300000, lastViewedAt: 200000 };
    const migrated = S.migrate([old], 900000)[0];
    assert.equal(migrated.schemaVersion, 4); assert.equal(migrated.mark, 'NONE');
    assert.equal(migrated.applicationStage, 'APPLIED');
    assert.deepEqual(migrated.applicationHistory, [{ stage: 'APPLIED', at }]);
    for (const key of ['markChangedAt', 'firstSeenAt', 'lastSeenAt', 'updatedAt', 'lastViewedAt', 'seekIds', 'url']) assert.deepEqual(migrated[key], old[key]);
    assert.deepEqual(S.migrate([migrated], 999999), [migrated]);
    assert.equal(old.mark, 'APPLIED');
  }
  const fallback = S.migrate([{ schemaVersion: 3, platform: 'linkedin', linkedinIds: ['1'], mark: 'APPLIED', markChangedAt: null, updatedAt: 42 }])[0];
  assert.deepEqual(fallback.applicationHistory, [{ stage: 'APPLIED', at: 42 }]);
});

test('stages support direct rejection, interviews, offers and reversals without inventing events', () => {
  for (const path of [['APPLIED', 'REJECTED'], ['APPLIED', 'INTERVIEW', 'REJECTED'], ['APPLIED', 'INTERVIEW', 'OFFERED'], ['OFFERED', 'INTERVIEW', 'APPLIED']]) {
    let records = [];
    path.forEach((stage, index) => { records = S.apply(records, job, stage, index); });
    assert.deepEqual(records[0].applicationHistory, path.map((stage, at) => ({ stage, at })));
    assert.equal(records[0].applicationStage, path.at(-1));
    const again = S.apply(records, job, path.at(-1), 100);
    assert.deepEqual(again[0].applicationHistory, records[0].applicationHistory);
    assert.equal(again[0].applicationStageChangedAt, path.length - 1);
    assert.deepEqual(S.migrate(JSON.parse(JSON.stringify(again))), again);
  }
});

test('viewing, browsing marks and finite expiry never erase application history', () => {
  let records = S.apply(S.apply([], job, 'SAVED', 0), job, 'APPLIED', 1);
  records = S.apply(records, job, 'INTERVIEW', 2);
  const events = structuredClone(records[0].applicationHistory);
  for (const action of ['VIEW', 'OBSERVE', 'SKIP', 'SAVED', 'NONE']) records = S.apply(records, job, action, 3);
  records = S.apply(records, job, 'SKIP', 4);
  const kept = S.cleanup(records, 10000 * S.DAY, { viewedDays: 30, skipDays: 30, appliedDays: 30 });
  assert.equal(kept.length, 1); assert.equal(kept[0].mark, 'NONE'); assert.equal(kept[0].lastViewedAt, null);
  assert.equal(kept[0].applicationStage, 'INTERVIEW'); assert.deepEqual(kept[0].applicationHistory, events);
  const reset = S.manage(kept, S.recordKey(kept[0]), 'STAGE_NONE', 10001 * S.DAY);
  assert.equal(S.cleanup(reset, 20000 * S.DAY).length, 1);
  assert.equal(reset[0].applicationHistory.at(-1).stage, 'NONE');
  assert.equal(S.manage(reset, S.recordKey(reset[0]), 'REMOVE').length, 0);
});

test('canonical aliases combine histories and preserve equal-time cycles without cross-platform merging', () => {
  let records = S.apply([], { id: '1' }, 'APPLIED', 0);
  records = S.apply(records, { id: '1' }, 'INTERVIEW', 0);
  records = S.apply(records, { id: '1' }, 'APPLIED', 0);
  records = S.apply(records, { ...job, id: '2' }, 'REJECTED', 2);
  records = S.apply(records, { ...job, id: '1' }, 'OBSERVE', 3);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].applicationHistory.map(event => event.stage), ['APPLIED', 'INTERVIEW', 'APPLIED', 'REJECTED']);
  assert.deepEqual(records[0].seekIds.sort(), ['1', '2']);
  records = S.apply(records, { ...job, id: '1', platform: 'linkedin' }, 'OFFERED', 4);
  assert.equal(records.length, 2);
  assert.equal(S.getState(records, { id: '2' }).applicationStage, 'REJECTED');
});

test('application search filter covers every current stage and saved date survives progress', () => {
  for (const stage of S.stages.slice(1)) {
    const records = S.apply(S.apply([], job, 'SAVED', 0), job, stage, 1);
    assert.equal(records[0].savedAt, 0); assert.equal(records[0].markChangedAt, 0);
    assert.equal(records[0].mark, 'SAVED');
    assert.equal(S.hidden(S.getState(records, job), { hideApplied: true }), true);
    assert.equal(S.hidden(S.getState(records, job), {}), false);
  }
});

// Independent CSV reader handles escaped quotes, embedded newlines and BOM.
function parse(text) {
  const rows = []; let row = [], value = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(value); value = ''; }
    else if (c === '\r' && text[i + 1] === '\n' && !quoted) { row.push(value); rows.push(row); row = []; value = ''; i++; }
    else value += c;
  }
  return rows;
}

test('CSV includes saved and all current stages, excludes viewed/skip-only jobs; BOM and escaping round-trip', () => {
  let records = [];
  const actions = ['VIEW', 'SKIP', 'SAVED', 'APPLIED', 'INTERVIEW', 'OFFERED', 'REJECTED'];
  actions.forEach((action, i) => { records = S.apply(records, { id: String(i + 1), title: '工程师, "研发"\nSecond line', company: '=FORMULA()', location: 'Remote' }, action, i); });
  const before = JSON.stringify(records), output = A.csv(records), rows = parse(output);
  assert.deepEqual([...Buffer.from(output).subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(rows.length, 6);
  assert.equal(rows[1][2], '工程师, "研发"\nSecond line'); assert.equal(rows[1][3], "'=FORMULA()");
  assert.equal(rows[1][6], new Date(2).toISOString()); assert.equal(rows[1][7], 'NONE');
  assert.deepEqual(rows.slice(1).map(row => row[1]), ['3', '4', '5', '6', '7']);
  assert.equal(JSON.stringify(records), before);
});

test('CSV stage dates use first occurrence and full history retains repeated funnel paths', () => {
  let records = S.apply([], job, 'SAVED', 0);
  for (const [at, stage] of ['APPLIED', 'INTERVIEW', 'REJECTED', 'APPLIED', 'INTERVIEW', 'OFFERED'].entries()) records = S.apply(records, job, stage, at + 1);
  const rows = parse(A.csv(records)), data = Object.fromEntries(rows[0].map((name, i) => [name, rows[1][i]]));
  assert.equal(data['Current Stage'], 'OFFERED');
  assert.equal(data['Applied At'], new Date(1).toISOString()); assert.equal(data['Interview At'], new Date(2).toISOString());
  assert.equal(data['Rejected At'], new Date(3).toISOString()); assert.equal(data['Offered At'], new Date(6).toISOString());
  assert.deepEqual(JSON.parse(data['Application History']), records[0].applicationHistory);
  assert.equal(data.URL, 'https://nz.seek.com/job/123');
});
