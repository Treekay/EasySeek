(function (root) {
  'use strict';
  const S = root.EasySeekState || (typeof require !== 'undefined' ? require('./state.js') : null);
  const optional = value => value == null || !String(value).trim() ? null : String(value);
  const field = value => String(value || 'Not available').replace(/[\r\n]+/g, ' ').trim();
  // JSON-quoted strings are also YAML double-quoted scalars. Escape Unicode line
  // separators explicitly so YAML parsers cannot fold them into spaces.
  const yaml = value => JSON.stringify(value).replace(/[\u0085\u2028\u2029]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
  function markdown(job, easySeekState = {}, exportedAt = new Date().toISOString()) {
    const { id, platform, canonicalKey } = S.identity(job);
    const url = S.canonicalUrl(id, platform);
    const mark = String(easySeekState.mark || 'none').toLowerCase();
    const metadata = {
      easyseek_schema: 1, platform, job_id: optional(id), canonical_url: optional(url), canonical_key: optional(canonicalKey),
      mark: ['none', 'skip', 'saved', 'applied'].includes(mark) ? mark : 'none', viewed: easySeekState.viewed === true,
      title: optional(job.title), company: optional(job.company), location: optional(job.location),
      salary: optional(job.salary), posted: optional(job.posted), exported_at: new Date(exportedAt).toISOString()
    };
    return '---\n' + Object.entries(metadata).map(([key, value]) => `${key}: ${yaml(value)}`).join('\n') + '\n---\n\n' +
      '# ' + field(job.title) + '\n\n## Job\n\n' +
      [['Title', job.title], ['Company', job.company], ['Location', job.location], ['Salary', job.salary],
        ['Posted', job.posted], ['Source', platform === 'linkedin' ? 'LinkedIn' : 'SEEK'], ['URL', url], [platform === 'linkedin' ? 'LinkedIn Job ID' : 'SEEK Job ID', id]]
        .map(([label, value]) => `- **${label}:** ${field(value)}`).join('\n') +
      '\n\n## Job Description\n\n' + String(job.description || '').trim() + '\n';
  }
  function filename(job) {
    const slug = value => String(value || '').normalize('NFKC').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/g, '');
    return `${slug(job.company) || 'company'}-${slug(job.title) || 'job'}-${S.platformOf(job)}-${slug(S.identity(job).id) || 'job'}.md`;
  }
  function download(job, easySeekState, exportedAt) {
    const url = URL.createObjectURL(new Blob([markdown(job, easySeekState, exportedAt)], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = filename(job);
    link.hidden = true; link.dataset.easyseekUi = 'download'; document.body.append(link);
    try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
  }
  root.EasySeekJD = { markdown, filename, download };
  if (typeof module !== 'undefined') module.exports = root.EasySeekJD;
})(globalThis);
