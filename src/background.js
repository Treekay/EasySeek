'use strict';
importScripts('state.js', 'tracker.js');
// A single writer prevents concurrent tabs from overwriting each other's decisions.
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const isOptions = sender.url === `chrome-extension://${chrome.runtime.id}/options/options.html`;
  if (sender.id !== chrome.runtime.id || (!isOptions && !EasySeekState.isSupportedPage(sender.url)) || message?.channel !== 'easyseek') return;
  // Network work never occupies the serialized marking/storage queue.
  if (['trackerSettings', 'trackerTest', 'trackerImport'].includes(message.type)) {
    (async () => {
      if (message.type !== 'trackerImport' && !isOptions) throw new Error('Settings are available only in EasySeek options.');
      if (message.type === 'trackerSettings') {
        if (typeof message.settings?.enabled !== 'boolean') throw new Error('Enabled must be a boolean.');
        const tracker = { enabled: message.settings.enabled, url: EasySeekTracker.endpoint(message.settings.url) };
        if (tracker.enabled && !await chrome.permissions.contains({ origins: [EasySeekTracker.permission(tracker.url)] })) throw new Error('Localhost permission was not granted.');
        await chrome.storage.local.set({ careerWorkspace: tracker });
        return { tracker };
      }
      const stored = await chrome.storage.local.get(['careerWorkspace']);
      const tracker = EasySeekTracker.settings(stored.careerWorkspace);
      const url = message.type === 'trackerTest' ? EasySeekTracker.endpoint(message.url) : tracker.url;
      if (message.type === 'trackerImport' && !tracker.enabled) return { disabled: true };
      if (!await chrome.permissions.contains({ origins: [EasySeekTracker.permission(url)] })) throw new Error('Enable localhost permission in EasySeek settings. Your mark is saved.');
      if (message.type === 'trackerTest') return { connection: await EasySeekTracker.test(url) };
      const supplied = message.payload;
      if (!supplied || !['seek', 'linkedin'].includes(supplied.source) || !['SAVED', 'APPLIED'].includes(supplied.requestedStage)) throw new Error('Invalid tracker handoff.');
      const body = EasySeekTracker.payload({ id: supplied.sourceJobId, platform: supplied.source, title: supplied.title, company: supplied.company, location: supplied.location }, { mark: supplied.mark }, supplied.requestedStage, supplied.jdMarkdown);
      if (JSON.stringify(body).length > 550000) throw new Error('JD is too large for the local tracker. Your mark is saved.');
      return { imported: await EasySeekTracker.send(url, body) };
    })().then(data => respond({ ok: true, ...data }), error => respond({ ok: false, error: error.message }));
    return true;
  }
  queue = queue.catch(() => {}).then(async () => {
    if (message.type === 'openOptions') { await chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') }); return {}; }
    const stored = await chrome.storage.local.get(['records', 'preferences', 'careerWorkspace']);
    const tracker = EasySeekTracker.settings(stored.careerWorkspace);
    const now = Date.now();
    let records = EasySeekState.migrate(stored.records || [], now);
    let preferences = EasySeekState.preferences(stored.preferences);
    // Apply a newly selected policy before cleanup; extending it must not first
    // delete records under the previous policy. Never rewrite decision timestamps.
    if (message.type !== 'preferences') records = EasySeekState.cleanup(records, now, preferences);
    const managed = message.type === 'manage' ? records.find(record => EasySeekState.recordKey(record) === message.key) : null;
    if (message.type === 'action') records = EasySeekState.apply(records, message.job, message.action);
    else if (message.type === 'observe') {
      for (const job of message.jobs || []) records = EasySeekState.apply(records, job, 'OBSERVE');
    } else if (message.type === 'preferences') {
      for (const key of EasySeekState.filterKeys) {
        if (typeof message.preferences?.[key] === 'boolean') preferences[key] = message.preferences[key];
      }
      for (const key of EasySeekState.retentionKeys) {
        if (Object.prototype.hasOwnProperty.call(message.preferences || {}, key)) {
          if (!isOptions || !EasySeekState.validDays(message.preferences[key])) throw new Error('Retention must be Never or 1–36500 whole days.');
          preferences[key] = message.preferences[key];
        }
      }
      records = EasySeekState.cleanup(records, now, preferences);
    } else if (message.type === 'manage' && isOptions) {
      records = EasySeekState.manage(records, message.key, message.action, now);
    } else if (message.type === 'bulk' && isOptions) {
      if (message.confirmed !== true) throw new Error('Confirmation required');
      if (message.action !== 'EXPIRED') throw new Error('Invalid bulk action');
    } else if (message.type !== 'read') throw new Error('Unknown request');
    const changes = {};
    if (JSON.stringify(records) !== JSON.stringify(stored.records || [])) changes.records = records;
    if (JSON.stringify(preferences) !== JSON.stringify(stored.preferences)) changes.preferences = preferences;
    if (Object.keys(changes).length) await chrome.storage.local.set(changes);
    let handoff, trackerWarning;
    if (tracker.enabled && ['action', 'manage'].includes(message.type) && ['SAVED', 'APPLIED'].includes(message.action)) {
      try {
        const job = message.type === 'action' ? message.job : { ...managed, id: EasySeekState.identity(managed || {}).id || EasySeekState.recordIds(managed || {}).at(-1) };
        handoff = EasySeekTracker.payload(job, EasySeekState.getState(records, job), message.action, message.type === 'action' ? message.jdMarkdown : undefined);
      } catch (error) { trackerWarning = error.message; }
    }
    return { records, preferences, tracker, handoff, trackerWarning };
  });
  queue.then(data => respond({ ok: true, ...data }), error => respond({ ok: false, error: error.message }));
  return true;
});
