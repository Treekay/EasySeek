(function () {
  'use strict';
  globalThis.EasySeekStorage = {
    handoff(result, warn) {
      if (result.trackerWarning) warn(result.trackerWarning);
      if (result.handoff) this.request('trackerImport', { payload: result.handoff }).catch(error => warn(error.message));
    },
    async request(type, data = {}) {
      const response = await chrome.runtime.sendMessage({ channel: 'easyseek', type, ...data });
      if (!response?.ok) throw new Error(response?.error || 'Extension unavailable; reload this page.');
      return response;
    }
  };
})();
