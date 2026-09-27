'use strict';
importScripts('state.js');
// A single writer prevents concurrent tabs from overwriting each other's decisions.
let queue = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !/^https:\/\/(www\.)?seek\.co\.nz\//.test(sender.url || '') || message?.channel !== 'easyseek') return;
  queue = queue.catch(() => {}).then(async () => {
    const stored = await chrome.storage.local.get(['records', 'preferences']);
    let records = EasySeekState.cleanup(stored.records || []);
    let preferences = { hideSeen: true, hideSkipped: true, ...stored.preferences };
    if (message.type === 'action') records = EasySeekState.apply(records, message.job, message.action);
    else if (message.type === 'observe') {
      for (const job of message.jobs || []) records = EasySeekState.apply(records, job, 'OBSERVE');
    } else if (message.type === 'preferences') {
      for (const key of ['hideSeen', 'hideSkipped']) {
        if (typeof message.preferences?.[key] === 'boolean') preferences[key] = message.preferences[key];
      }
    } else if (message.type !== 'read') throw new Error('Unknown request');
    if (JSON.stringify(records) !== JSON.stringify(stored.records || [])) await chrome.storage.local.set({ records });
    if (JSON.stringify(preferences) !== JSON.stringify(stored.preferences)) await chrome.storage.local.set({ preferences });
    return { records, preferences };
  });
  queue.then(data => respond({ ok: true, ...data }), error => respond({ ok: false, error: error.message }));
  return true;
});
