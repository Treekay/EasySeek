(function (root) {
  'use strict';
  const DAY = 86400000;
  // Manifest match patterns are declarative; tests keep them aligned with this list.
  const seekOrigins = Object.freeze(['https://nz.seek.com', 'https://seek.co.nz', 'https://www.seek.co.nz']);
  const canonicalOrigin = seekOrigins[0];
  function isSeekUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && seekOrigins.includes(parsed.origin);
    }
    catch { return false; }
  }
  const linkedinOrigins = Object.freeze(['https://www.linkedin.com', 'https://nz.linkedin.com', 'https://linkedin.com']);
  function isLinkedInUrl(url) {
    try { const parsed = new URL(url); return parsed.protocol === 'https:' && linkedinOrigins.includes(parsed.origin); }
    catch { return false; }
  }
  function isLinkedInJobsUrl(url) {
    try { return isLinkedInUrl(url) && /^\/jobs(?:\/|$)/.test(new URL(url).pathname); }
    catch { return false; }
  }
  function isSupportedPage(url) { return isSeekUrl(url) || isLinkedInJobsUrl(url); }
  function platformOf(job) { return job.platform === 'linkedin' || isLinkedInUrl(job.url) ? 'linkedin' : 'seek'; }
  function linkedinJobId(url) {
    try {
      const parsed = new URL(url, linkedinOrigins[0]);
      if (!isLinkedInJobsUrl(parsed.href)) return '';
      const direct = parsed.pathname.match(/^\/jobs\/view\/(?:[^/]*-)?(\d+)(?:\/|$)/)?.[1];
      return direct || (/^\d+$/.test(parsed.searchParams.get('currentJobId') || '') ? parsed.searchParams.get('currentJobId') : '');
    } catch { return ''; }
  }
  function canonicalUrl(id, platform = 'seek') {
    return /^\d+$/.test(String(id || '')) ? (platform === 'linkedin' ? `${linkedinOrigins[0]}/jobs/view/${id}/` : `${canonicalOrigin}/job/${id}`) : '';
  }
  function recordIds(record) { return platformOf(record) === 'linkedin' ? record.linkedinIds || [] : record.seekIds || []; }
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
      const parsed = new URL(url, canonicalOrigin);
      if (!isSeekUrl(parsed.href)) return '';
      return parsed.pathname.match(/^\/job\/(\d+)(?:\/|$)/)?.[1] || '';
    } catch { return ''; }
  }
  function identity(job) {
    const platform = platformOf(job);
    const id = /^\d+$/.test(String(job.id || '')) ? String(job.id) : platform === 'linkedin' ? linkedinJobId(job.url) : jobId(job.url);
    const parts = [company(job.company), city(job.location), normalize(job.title)];
    const canonicalKey = parts.every(Boolean) ? (platform === 'linkedin' ? 'linkedin|' : '') + parts.join('|') : '';
    return { id, platform, canonicalKey, key: canonicalKey || (id ? platform + ':' + id : '') };
  }
  function matches(records, job) {
    const { id, platform, canonicalKey } = identity(job);
    records = records.filter(record => platformOf(record) === platform);
    const byId = id ? records.filter(r => recordIds(r).includes(id)) : [];
    // Known IDs win, but link complete canonical aliases to the same opportunity.
    const keys = new Set([canonicalKey, ...byId.map(r => r.canonicalKey)].filter(Boolean));
    return records.filter(r => byId.includes(r) || (r.canonicalKey && keys.has(r.canonicalKey)));
  }
  const marks = ['NONE', 'SKIP', 'SAVED', 'APPLIED'];
  const filterKeys = ['hideSkipped', 'hideApplied', 'hideSaved', 'hideViewed'];
  const retentionKeys = ['viewedDays', 'skipDays', 'savedDays', 'appliedDays'];
  const defaults = { hideSkipped: true, hideApplied: false, hideSaved: false, hideViewed: false,
    viewedDays: 60, skipDays: 60, savedDays: null, appliedDays: null };
  const validDays = value => value === null || (Number.isSafeInteger(value) && value > 0 && value <= 36500);
  function preferences(saved = {}) {
    const result = { ...defaults };
    // Retain configured memory durations; do not carry the old hide-SEEN default forward.
    if (!('viewedDays' in saved) && validDays(saved.seenDays)) result.viewedDays = saved.seenDays;
    for (const key of filterKeys) if (typeof saved[key] === 'boolean') result[key] = saved[key];
    for (const key of retentionKeys) if (validDays(saved[key])) result[key] = saved[key];
    return result;
  }
  function recordKey(record) { return record.canonicalKey || platformOf(record) + ':' + recordIds(record)[0]; }
  const timestamp = value => Number.isFinite(value) && value >= 0;
  function migrate(records, now = Date.now()) {
    return records.map(record => {
      if (record.schemaVersion === 3) return record;
      if (record.schemaVersion === 2) return { ...record, schemaVersion: 3, platform: 'seek' };
      const assigned = [record.statusChangedAt,
        ...(['SKIP', 'PURSUE'].includes(record.status) && record.manualAt > 0 ? [record.manualAt] : []),
        record.updatedAt, record.lastSeenAt, record.firstSeenAt].find(timestamp) ?? now;
      const { status, statusChangedAt, manualAt, ...metadata } = record;
      return { ...metadata, schemaVersion: 3, platform: 'seek',
        url: canonicalUrl(record.seekIds[0]),
        mark: status === 'PURSUE' ? 'SAVED' : status === 'SKIP' ? 'SKIP' : 'NONE',
        markChangedAt: ['PURSUE', 'SKIP'].includes(status) ? assigned : null,
        // V1 did not distinguish viewing a marked job from observing its card.
        lastViewedAt: status === 'SEEN' ? assigned : null
      };
    });
  }
  function winner(records) {
    return [...records].sort((a, b) => (b.markChangedAt ?? -1) - (a.markChangedAt ?? -1) || b.updatedAt - a.updatedAt)[0];
  }
  function getState(records, job) {
    const found = matches(records, job);
    return { mark: winner(found)?.mark || 'NONE', viewed: found.some(record => timestamp(record.lastViewedAt)) };
  }
  function hidden(state, settings) {
    const prefs = preferences(settings);
    return ((state.mark === 'SKIP' && prefs.hideSkipped) ||
      (state.mark === 'SAVED' && prefs.hideSaved) || (state.mark === 'APPLIED' && prefs.hideApplied) ||
      (state.viewed && prefs.hideViewed));
  }
  function expiresAt(record, settings = {}) {
    const prefs = preferences(settings);
    const days = { SKIP: prefs.skipDays, SAVED: prefs.savedDays, APPLIED: prefs.appliedDays }[record.mark];
    return {
      mark: record.mark === 'NONE' || days == null ? null : record.markChangedAt + days * DAY,
      viewed: !timestamp(record.lastViewedAt) || prefs.viewedDays === null ? null : record.lastViewedAt + prefs.viewedDays * DAY
    };
  }
  function cleanup(records, now = Date.now(), settings = {}) {
    return migrate(records, now).map(record => {
      const expiry = expiresAt(record, settings);
      const next = { ...record };
      if (expiry.mark !== null && now >= expiry.mark) next.mark = 'NONE';
      if (expiry.viewed !== null && now >= expiry.viewed) next.lastViewedAt = null;
      return next;
    }).filter(record => record.mark !== 'NONE' || timestamp(record.lastViewedAt));
  }
  function manage(records, key, action, now = Date.now()) {
    const record = records.find(item => recordKey(item) === key);
    if (!record) throw new Error('This record no longer exists. Refresh the list.');
    if (action === 'REMOVE') return records.filter(item => item !== record);
    if (!marks.includes(action)) throw new Error('Invalid mark');
    return records.map(item => item === record ? { ...item, mark: action, markChangedAt: now, updatedAt: now } : item)
      .filter(item => item.mark !== 'NONE' || timestamp(item.lastViewedAt));
  }
  function apply(records, job, action, now = Date.now()) {
    if (!marks.includes(action) && !['VIEW', 'OBSERVE'].includes(action)) throw new Error('Invalid action');
    const ident = identity(job);
    if (!ident.key) return records;
    const found = matches(records, job);
    const old = winner(found);
    if (action === 'OBSERVE' && !old) return records;
    const rest = records.filter(record => !found.includes(record));
    const automatic = action === 'VIEW' || action === 'OBSERVE';
    const viewedTimes = found.map(record => record.lastViewedAt).filter(timestamp);
    const record = {
      schemaVersion: 3, platform: ident.platform, canonicalKey: old?.canonicalKey || ident.canonicalKey,
      [ident.platform === 'linkedin' ? 'linkedinIds' : 'seekIds']: [...new Set([...found.flatMap(recordIds), ident.id].filter(Boolean))],
      title: job.title || old?.title || '', company: job.company || old?.company || '',
      city: city(job.location) || old?.city || '',
      url: canonicalUrl(ident.id, ident.platform) || old?.url || '',
      mark: automatic ? old?.mark || 'NONE' : action,
      markChangedAt: automatic ? old?.markChangedAt ?? null : now,
      lastViewedAt: action === 'VIEW' ? now : viewedTimes.length ? Math.max(...viewedTimes) : null,
      firstSeenAt: found.length ? Math.min(...found.map(record => record.firstSeenAt)) : now,
      lastSeenAt: now, updatedAt: now
    };
    return record.mark !== 'NONE' || timestamp(record.lastViewedAt) ? [...rest, record] : rest;
  }
  root.EasySeekState = { DAY, linkedinOrigins, isLinkedInUrl, isLinkedInJobsUrl, isSupportedPage, platformOf, linkedinJobId, recordIds, seekOrigins, canonicalOrigin, isSeekUrl, canonicalUrl, normalize, company, city, jobId, identity, matches, getState, hidden, cleanup, apply,
    marks, filterKeys, retentionKeys, defaults, preferences, validDays, recordKey, migrate, expiresAt, manage };
  if (typeof module !== 'undefined') module.exports = root.EasySeekState;
})(globalThis);
