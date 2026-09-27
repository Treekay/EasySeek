(function () {
  'use strict';
  globalThis.EasySeekStorage = {
    async request(type, data = {}) {
      const response = await chrome.runtime.sendMessage({ channel: 'easyseek', type, ...data });
      if (!response?.ok) throw new Error(response?.error || 'Extension unavailable; reload this page.');
      return response;
    }
  };
})();
