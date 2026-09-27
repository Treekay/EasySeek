(function (root) {
  'use strict';
  const S = root.EasySeekState || require('./state.js');
  const iso = value => Number.isFinite(value) ? new Date(value).toISOString() : '';
  const meaningful = record => record.mark === 'SAVED' || (record.applicationStage && record.applicationStage !== 'NONE');
  function dates(record) {
    return Object.fromEntries(S.stages.slice(1).map(stage => [stage, record.applicationHistory?.find(event => event.stage === stage)?.at ?? null]));
  }
  function cell(value) {
    let text = String(value ?? '');
    // Quoting handles CSV delimiters; the apostrophe prevents spreadsheet formulas.
    if (/^\s*[=+@-]|^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function csv(records) {
    const rows = [['Platform', 'Job ID', 'Title', 'Company', 'Location', 'URL', 'Saved At', 'Current Stage',
      'Applied At', 'Interview At', 'Offered At', 'Rejected At', 'First Seen At', 'Last Viewed At', 'Application History', 'Linked Job IDs']];
    for (const record of S.migrate(records).filter(meaningful)) {
      const stageDates = dates(record), platform = S.platformOf(record);
      const id = S.identity({ platform, url: record.url }).id || S.recordIds(record)[0] || '';
      rows.push([platform, id, record.title, record.company, record.location || record.city,
        S.canonicalUrl(id, platform) || record.url, iso(record.savedAt), record.applicationStage,
        ...S.stages.slice(1).map(stage => iso(stageDates[stage])), iso(record.firstSeenAt), iso(record.lastViewedAt),
        JSON.stringify(record.applicationHistory), JSON.stringify(S.recordIds(record))]);
    }
    return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
  }
  function download(records, now = new Date()) {
    const url = URL.createObjectURL(new Blob([csv(records)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = 'easyseek-applications-' + now.toISOString().slice(0, 10) + '.csv';
    link.hidden = true; document.body.append(link);
    try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
  }
  root.EasySeekApplications = { meaningful, dates, csv, download };
  if (typeof module !== 'undefined') module.exports = root.EasySeekApplications;
})(globalThis);
