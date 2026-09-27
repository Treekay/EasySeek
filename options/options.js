(function () {
  'use strict';
  const S = EasySeekState, store = EasySeekStorage;
  const $ = id => document.getElementById(id);
  let records = [], preferences = S.preferences(), busy = false, dirty = false;
  const date = value => Number.isFinite(value) ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown';
  function node(tag, text) { const element = document.createElement(tag); element.textContent = text; return element; }
  function feedback(text, error = false) { $('feedback').textContent = text; $('feedback').dataset.error = String(error); }
  function renderSettings() {
    if (dirty) return;
    for (const key of ['seenDays', 'skipDays']) {
      const value = preferences[key] === null ? 'never' : String(preferences[key]);
      if (![...$(key).options].some(option => option.value === value)) {
        const option = node('option', `${value} days`); option.value = value; $(key).append(option);
      }
      $(key).value = value;
    }
  }
  function render() {
    const search = $('search').value.trim().toLowerCase(), filter = $('filter').value;
    const visible = records.filter(record => (!filter || record.status === filter) &&
      `${record.title} ${record.company}`.toLowerCase().includes(search))
      .sort((a, b) => b.statusChangedAt - a.statusChangedAt);
    $('count').textContent = `${visible.length} of ${records.length} remembered opportunities · newest status first`;
    $('records').replaceChildren();
    if (!visible.length) $('records').append(node('p', records.length ? 'No matching opportunities.' : 'No remembered jobs yet. Browse SEEK to start.'));
    for (const record of visible) {
      const row = node('article', ''); row.className = 'record';
      row.append(node('h3', record.title || 'Untitled job'), node('p', [record.company || 'Unknown company', record.city || 'Unknown city'].join(' · ')));
      const badge = node('span', record.status); badge.className = 'badge'; badge.dataset.state = record.status; row.append(badge);
      const expiry = S.expiresAt(record, preferences);
      const dates = node('p', `Marked: ${date(record.statusChangedAt)} · Expires: ${expiry === null ? 'Never' : date(expiry)} · Last seen: ${date(record.lastSeenAt)}`);
      dates.className = 'dates'; row.append(dates, node('p', 'SEEK IDs: ' + (record.seekIds.join(', ') || 'Not available')));
      const actions = node('div', ''); actions.className = 'actions';
      const label = node('label', 'Change status');
      const select = node('select', '');
      select.setAttribute('aria-label', `Status for ${record.title || 'untitled job'}`);
      for (const status of ['SEEN', 'SKIP', 'PURSUE']) select.append(node('option', status));
      select.value = record.status; label.append(select);
      const save = node('button', 'Apply'); save.type = 'button';
      save.addEventListener('click', () => run('manage', { key: S.recordKey(record), action: select.value }, 'Status updated. Retention starts now.'));
      const remove = node('button', 'Remove'); remove.type = 'button';
      remove.addEventListener('click', () => {
        if (confirm(`Remove memory for “${record.title || 'this job'}” and all its linked SEEK IDs? This cannot be undone.`)) {
          run('manage', { key: S.recordKey(record), action: 'REMOVE' }, 'Opportunity removed.');
        }
      });
      actions.append(label, save, remove); row.append(actions); $('records').append(row);
    }
    renderSettings();
  }
  async function run(type, data = {}, message = '') {
    if (busy) return;
    busy = true;
    document.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try {
      const result = await store.request(type, data);
      records = result.records; preferences = result.preferences;
      if (type === 'preferences') dirty = false;
      render(); feedback(message);
    } catch (error) { feedback(error.message, true); }
    finally { busy = false; document.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
  }
  $('search').addEventListener('input', render);
  $('filter').addEventListener('change', render);
  $('refresh').addEventListener('click', () => run('read', {}, 'Memory refreshed.'));
  $('settings').addEventListener('change', () => { dirty = true; });
  $('settings').addEventListener('submit', event => {
    event.preventDefault();
    const next = Object.fromEntries(['seenDays', 'skipDays'].map(key => [key, $(key).value === 'never' ? null : Number($(key).value)]));
    const expired = records.filter(record => { const expiry = S.expiresAt(record, next); return expiry !== null && expiry <= Date.now(); }).length;
    const shorter = ['seenDays', 'skipDays'].some(key => next[key] !== null && (preferences[key] === null || next[key] < preferences[key]));
    if ((shorter || expired) && !confirm(`Apply this retention policy? ${expired} currently listed records would expire now. Older matching records, including any added in another tab, will be permanently removed during cleanup.`)) return;
    run('preferences', { preferences: next }, 'Retention settings saved.');
  });
  document.querySelectorAll('[data-bulk]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.bulk;
    const target = action === 'EXPIRED' ? 'expired SEEN/SKIP records' : `all ${action} records`;
    if (confirm(`Permanently remove ${target} and their linked SEEK IDs? This cannot be undone. PURSUE records will be kept.`)) {
      run('bulk', { action, confirmed: true }, 'Cleanup complete.');
    }
  }));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || busy) return;
    if (changes.records) records = S.migrate(changes.records.newValue || []);
    if (changes.preferences) preferences = S.preferences(changes.preferences.newValue);
    render();
  });
  run('read');
})();
