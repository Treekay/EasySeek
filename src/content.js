(function () {
  'use strict';
  const S = EasySeekState, E = EasySeekExtractor, UI = EasySeekUI, store = EasySeekStorage;
  let records = [], preferences = S.preferences(), showHidden = false;
  let ready = false, running = false, rerun = false, timer, panel, detailUI;
  let route = location.href, opened = '', previousDetail = null, staleDetail = null;
  const mounted = new Map(), observed = new Set();
  const memoryJob = ({ id, title, company, location, url }) => ({ id, title, company, location, url });
  const fail = error => UI.notify('EasySeek: ' + error.message, true);
  async function refresh() {
    const data = await store.request('read');
    records = data.records; preferences = data.preferences; ready = true; schedule();
  }
  async function act(job, action) {
    try {
      const data = await store.request('action', { job: memoryJob(job), action });
      records = data.records;
      schedule();
      UI.notify(action === 'NONE' ? 'Mark cleared' : 'Marked ' + action);
    } catch (error) { fail(error); }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(scan, 120); }
  function onRoute() {
    if (route === location.href) return;
    const oldId = S.jobId(route) || new URL(route).searchParams.get('jobId');
    const newId = S.jobId(location.href) || new URL(location.href).searchParams.get('jobId');
    route = location.href;
    observed.clear(); showHidden = false;
    if (oldId === newId) return;
    opened = '';
    // A SPA can change its URL before replacing the previous job body.
    staleDetail = oldId && newId ? previousDetail : null;
    previousDetail = null;
    detailUI?.node.remove(); detailUI = null;
  }
  function isStale(detail) {
    return staleDetail && detail.descriptionNode === staleDetail.descriptionNode &&
      detail.job.title === staleDetail.job.title && detail.job.description === staleDetail.job.description;
  }
  async function scan() {
    if (!ready) return;
    if (running) { rerun = true; return; }
    running = true;
    observer.disconnect();
    try {
      onRoute();
      const cards = E.cards();
      for (const [node, controls] of mounted) {
        if (!cards.has(node)) {
          node.classList.remove('easyseek-hidden', 'easyseek-saved', 'easyseek-applied'); controls.node.remove(); mounted.delete(node);
        }
      }
      let hidden = 0;
      const toObserve = [];
      for (const [node, job] of cards) {
        let controls = mounted.get(node);
        if (!controls) {
          controls = UI.actions(action => act(controls.job, action));
          mounted.set(node, controls);
        }
        if (!node.contains(controls.node)) node.append(controls.node);
        controls.job = job;
        const state = S.getState(records, job);
        controls.update(state);
        const hide = S.hidden(state, preferences, showHidden);
        node.classList.toggle('easyseek-hidden', hide);
        node.classList.toggle('easyseek-saved', state.mark === 'SAVED');
        node.classList.toggle('easyseek-applied', state.mark === 'APPLIED');
        if (hide) hidden++;
        const token = JSON.stringify([job.id, S.identity(job).canonicalKey, state.mark, state.viewed]);
        if ((state.mark !== 'NONE' || state.viewed) && !observed.has(token)) { observed.add(token); toObserve.push(memoryJob(job)); }
      }
      if (cards.size) {
        if (!panel) panel = UI.controls(async (key, value) => {
          if (key === 'showHidden') { showHidden = value; schedule(); return; }
          try {
            const data = await store.request('preferences', { preferences: { [key]: value } });
            preferences = data.preferences; schedule();
          } catch (error) { fail(error); schedule(); }
        });
        const first = cards.keys().next().value;
        // Place outside the card so hiding all results cannot hide the recovery controls.
        if (!panel.node.isConnected) first.parentElement.insertBefore(panel.node, first);
        panel.update({ ...preferences, showHidden }, cards.size - hidden, hidden);
      } else { panel?.node.remove(); }
      const detail = E.detail();
      if (detail && !isStale(detail)) {
        previousDetail = detail;
        staleDetail = null;
        if (!detailUI || !detail.node.contains(detailUI.node)) {
          detailUI?.node.remove();
          detailUI = UI.actions(action => act(detailUI.job, action));
          detail.heading.insertAdjacentElement('afterend', detailUI.node);
        }
        detailUI.job = detail.job;
        detailUI.update(S.getState(records, detail.job));
        if (opened !== detail.job.id) {
          opened = detail.job.id;
          // Enqueue synchronously before any later click; the worker preserves manual decisions.
          store.request('action', { job: memoryJob(detail.job), action: 'VIEW' })
            .then(data => { records = data.records; schedule(); }).catch(error => { opened = ''; fail(error); });
        }
      } else { detailUI?.node.remove(); detailUI = null; }
      if (toObserve.length) store.request('observe', { jobs: toObserve }).catch(fail);
    } catch (error) { fail(error); }
    finally {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'data-job-id', 'hidden', 'aria-hidden'] });
      running = false;
      if (rerun) { rerun = false; schedule(); }
    }
  }
  const observer = new MutationObserver(changes => {
    if (changes.some(change => !change.target.closest?.('[data-easyseek-ui]'))) schedule();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.records) records = changes.records.newValue || [];
    if (changes.preferences) preferences = S.preferences(changes.preferences.newValue);
    schedule();
  });
  window.addEventListener('popstate', schedule);
  window.addEventListener('pageshow', () => refresh().catch(fail));
  // URL polling covers history.pushState in SEEK's isolated main world, without patching it.
  setInterval(() => { if (location.href !== route) schedule(); }, 750);
  refresh().catch(fail);
})();
