(function (root) {
  'use strict';
  const DAY = 86400000;
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[\u2010-\u2015-]/g, ' ').replace(/\s+/g, ' ').trim();
  const company = value => normalize(value).replace(/,?\s+\b(limited|ltd)\.?$/, '').trim();
  const city = value => {
    const text = normalize(value);
    if (/\bauckland\b/.test(text)) return 'auckland';
    // Only collapse explicitly named cities; an unknown suburb is not a city.
    for (const name of ['wellington', 'christchurch', 'hamilton', 'tauranga', 'dunedin', 'nelson', 'queenstown', 'palmerston north', 'new plymouth', 'invercargill', 'rotorua', 'whangarei', 'napier', 'hastings']) {
      if (new RegExp('\\b' + name + '\\b').test(text)) return name;
    }
    return '';
  };
  function jobId(url) {
    try {
      const parsed = new URL(url, 'https://www.seek.co.nz');
      if (!['www.seek.co.nz', 'seek.co.nz'].includes(parsed.hostname)) return '';
      return parsed.pathname.match(/^\/job\/(\d+)(?:\/|$)/)?.[1] || '';
    } catch { return ''; }
  }
  function identity(job) {
    const id = /^\d+$/.test(String(job.id || '')) ? String(job.id) : jobId(job.url);
    const parts = [company(job.company), city(job.location), normalize(job.title)];
    const canonicalKey = parts.every(Boolean) ? parts.join('|') : '';
    return { id, canonicalKey, key: canonicalKey || (id ? 'seek:' + id : '') };
  }
  function matches(records, job) {
    const { id, canonicalKey } = identity(job);
    const byId = id ? records.filter(r => r.seekIds.includes(id)) : [];
    // Known IDs win, but link complete canonical aliases to the same opportunity.
    const keys = new Set([canonicalKey, ...byId.map(r => r.canonicalKey)].filter(Boolean));
    return records.filter(r => byId.includes(r) || (r.canonicalKey && keys.has(r.canonicalKey)));
  }
  function winner(records) {
    return [...records].sort((a, b) => (b.manualAt || 0) - (a.manualAt || 0) || b.updatedAt - a.updatedAt)[0];
  }
  function status(records, job) { return winner(matches(records, job))?.status || 'NEW'; }
  function cleanup(records, now = Date.now()) {
    return records.filter(r => r.status === 'PURSUE' || now - r.lastSeenAt < 60 * DAY);
  }
  function apply(records, job, action, now = Date.now()) {
    const ident = identity(job);
    if (!ident.key) return records;
    const found = matches(records, job);
    const old = winner(found);
    const rest = records.filter(r => !found.includes(r));
    if (action === 'RESET') return rest;
    if (!['SEEN', 'SKIP', 'PURSUE', 'OBSERVE'].includes(action)) throw new Error('Invalid action');
    if (action === 'OBSERVE' && !old) return records;
    const automatic = action === 'SEEN' || action === 'OBSERVE';
    const nextStatus = automatic && old ? old.status : action;
    const record = {
      canonicalKey: old?.canonicalKey || ident.canonicalKey,
      seekIds: [...new Set([...found.flatMap(r => r.seekIds), ident.id].filter(Boolean))],
      title: job.title || old?.title || '', company: job.company || old?.company || '',
      city: city(job.location) || old?.city || '', status: nextStatus,
      firstSeenAt: found.length ? Math.min(...found.map(r => r.firstSeenAt)) : now,
      lastSeenAt: now, updatedAt: now,
      manualAt: automatic ? old?.manualAt || 0 : now
    };
    return [...rest, record];
  }
  root.EasySeekState = { DAY, normalize, company, city, jobId, identity, matches, status, cleanup, apply };
  if (typeof module !== 'undefined') module.exports = root.EasySeekState;
})(globalThis);
