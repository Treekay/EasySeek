(function (root) {
  'use strict';
  const field = value => String(value || 'Not available').replace(/[\r\n]+/g, ' ').trim();
  function markdown(job) {
    return '# ' + field(job.title) + '\n\n## Job details\n\n' +
      [['Title', job.title], ['Company', job.company], ['Location', job.location], ['Salary', job.salary],
        ['Posted', job.posted], ['URL', job.url], [job.platform === 'linkedin' ? 'LinkedIn Job ID' : 'SEEK Job ID', job.id]]
        .map(([label, value]) => `- **${label}:** ${field(value)}`).join('\n') +
      '\n\n## Job description\n\n' + String(job.description || '').trim() + '\n';
  }
  function filename(job) {
    const slug = value => String(value || '').normalize('NFKC').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/g, '');
    return `${slug(job.company) || 'company'}-${slug(job.title) || 'job'}-${slug(job.id) || 'seek'}.md`;
  }
  function download(job) {
    const url = URL.createObjectURL(new Blob([markdown(job)], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = filename(job);
    link.hidden = true; link.dataset.easyseekUi = 'download'; document.body.append(link);
    try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
  }
  root.EasySeekJD = { markdown, filename, download };
  if (typeof module !== 'undefined') module.exports = root.EasySeekJD;
})(globalThis);
