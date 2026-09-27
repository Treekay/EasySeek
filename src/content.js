(function () {
  'use strict';
  const S = EasySeekState, E = EasySeekExtractor, UI = EasySeekUI, store = EasySeekStorage;
  let records = [], preferences = S.preferences();
  let ready = false, running = false, rerun = false, timer, rail;
  let route = location.href, opened = '', previousDetail = null, staleDetail = null;
  let exportSnapshot = null;
  const mounted = new Set(), observed = new Set();
  const memoryJob = ({ id, platform, title, company, location, url }) => ({ id, platform, title, company, location, url });
  const fail = error => UI.notify('EasySeek: ' + error.message, true);
  const activePage = () => !E.active || E.active(location.href);
  const routeId = url => E.routeId ? E.routeId(url) : S.jobId(url) || new URL(url).searchParams.get('jobId');
  async function refresh() {
    if (!activePage()) { ready = true; schedule(); return; }
    const data = await store.request('read');
    records = data.records; preferences = data.preferences; ready = true; schedule();
  }
  async function act(job, action) {
    try {
      const data = await store.request('action', { job: memoryJob(job), action });
      records = data.records;
      schedule();
      UI.notify(action === 'NONE' ? 'Mark cleared' : S.stages.includes(action) ? 'Progress: ' + action : 'Marked ' + action);
    } catch (error) { fail(error); }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(scan, 120); }
  function onRoute() {
    if (route === location.href) return;
    const oldId = routeId(route);
    const newId = routeId(location.href);
    route = location.href;
    exportSnapshot = null;
    observed.clear();
    if (oldId === newId) return;
    opened = '';
    // A SPA can change its URL before replacing the previous job body.
    staleDetail = oldId && newId ? previousDetail : null;
    previousDetail = null;
    rail?.close();
  }
  function isStale(detail) {
    return staleDetail && detail.descriptionNode === staleDetail.descriptionNode &&
      detail.job.title === staleDetail.job.title && detail.job.description === staleDetail.job.description;
  }
  function activeDetail() {
    onRoute();
    if (!activePage()) return null;
    const detail = E.detail();
    return detail && !isStale(detail) ? detail : null;
  }
  function requireJob() {
    const detail = activeDetail();
    if (!detail) { schedule(); throw new Error('Open a job and wait for its description to load.'); }
    return detail.job;
  }
  function handoff() {
    // Re-extract on every explicit action. Keep only an in-tab snapshot signature
    // and creation time so Copy and Export of unchanged content are identical.
    const job = requireJob();
    const state = S.getState(records, job);
    const key = JSON.stringify([job, state]);
    if (exportSnapshot?.key !== key) exportSnapshot = { key, exportedAt: new Date().toISOString() };
    return [job, state, exportSnapshot.exportedAt];
  }
  async function copy() {
    try { await navigator.clipboard.writeText(EasySeekJD.markdown(...handoff())); UI.notify('Copied'); }
    catch (error) { fail(new Error('Could not copy. ' + error.message)); }
  }
  function download() {
    try { EasySeekJD.download(...handoff()); UI.notify('Download started'); }
    catch (error) { fail(new Error('Could not export. ' + error.message)); }
  }
  function mark(value) {
    try { act(requireJob(), value); } catch (error) { fail(error); }
  }
  async function filter(key, value) {
    try {
      const data = await store.request('preferences', { preferences: { [key]: value } });
      preferences = data.preferences; schedule();
    } catch (error) { fail(error); schedule(); }
  }
  async function scan() {
    if (!ready) return;
    if (running) { rerun = true; return; }
    running = true;
    observer.disconnect();
    try {
      onRoute();
      if (!activePage()) {
        rail?.node.remove();
        for (const node of mounted) node.classList.remove('easyseek-hidden', 'easyseek-saved', 'easyseek-applied');
        mounted.clear(); return;
      }
      const cards = E.cards();
      for (const node of mounted) {
        if (!cards.has(node)) {
          node.classList.remove('easyseek-hidden', 'easyseek-saved', 'easyseek-applied'); mounted.delete(node);
        }
      }
      let hidden = 0;
      const toObserve = [];
      for (const [node, job] of cards) {
        mounted.add(node);
        const state = S.getState(records, job);
        const hide = S.hidden(state, preferences);
        node.classList.toggle('easyseek-hidden', hide);
        node.classList.toggle('easyseek-saved', state.mark === 'SAVED');
        node.classList.toggle('easyseek-applied', state.applicationStage !== 'NONE');
        if (hide) hidden++;
        const token = JSON.stringify([job.id, S.identity(job).canonicalKey, state.mark, state.viewed, state.applicationStage]);
        if ((state.mark !== 'NONE' || state.applicationHistory.length || state.viewed) && !observed.has(token)) { observed.add(token); toObserve.push(memoryJob(job)); }
      }
      if (!rail) rail = UI.rail({ copy, export: download, mark, filter,
        memory: () => store.request('openOptions').catch(fail) });
      if (!rail.node.isConnected) document.body.append(rail.node);
      const detail = activeDetail();
      rail.update(detail?.job, detail ? S.getState(records, detail.job) : { mark: 'NONE', viewed: false }, preferences, cards.size - hidden, hidden);
      if (detail && !isStale(detail)) {
        previousDetail = detail;
        staleDetail = null;
        if (opened !== detail.job.id) {
          opened = detail.job.id;
          // Enqueue synchronously before any later click; the worker preserves manual decisions.
          store.request('action', { job: memoryJob(detail.job), action: 'VIEW' })
            .then(data => { records = data.records; schedule(); }).catch(error => { opened = ''; fail(error); });
        }
      }
      if (toObserve.length) store.request('observe', { jobs: toObserve }).catch(fail);
    } catch (error) { fail(error); }
    finally {
      if (activePage()) observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['id', 'componentkey', 'href', 'data-job-id', 'data-occludable-job-id', 'data-entity-urn', 'hidden', 'aria-hidden'] });
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
  // URL polling covers site history.pushState without patching the main world.
  setInterval(() => { if (location.href !== route) refresh().catch(fail); }, 750);
  refresh().catch(fail);
})();
