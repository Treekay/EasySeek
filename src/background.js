'use strict';
importScripts('state.js');
// A single writer prevents concurrent tabs from overwriting each other's decisions.
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const isOptions = sender.url === `chrome-extension://${chrome.runtime.id}/options/options.html`;
  if (sender.id !== chrome.runtime.id || (!isOptions && !EasySeekState.isSeekUrl(sender.url)) || message?.channel !== 'easyseek') return;
  queue = queue.catch(() => {}).then(async () => {
    if (message.type === 'openOptions') { await chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') }); return {}; }
    const stored = await chrome.storage.local.get(['records', 'preferences']);
    const now = Date.now();
    let records = EasySeekState.migrate(stored.records || [], now);
    let preferences = EasySeekState.preferences(stored.preferences);
    // Apply a newly selected policy before cleanup; extending it must not first
    // delete records under the previous policy. Never rewrite decision timestamps.
    if (message.type !== 'preferences') records = EasySeekState.cleanup(records, now, preferences);
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
    return { records, preferences };
  });
  queue.then(data => respond({ ok: true, ...data }), error => respond({ ok: false, error: error.message }));
  return true;
});
