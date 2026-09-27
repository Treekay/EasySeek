(function () {
  'use strict';
  const S = EasySeekState, store = EasySeekStorage;
  const $ = id => document.getElementById(id);
  let records = [], preferences = S.preferences(), busy = false, dirty = false;
  const date = value => Number.isFinite(value) ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  function node(tag, text) { const element = document.createElement(tag); element.textContent = text; return element; }
  function feedback(text, error = false) { $('feedback').textContent = text; $('feedback').dataset.error = String(error); }
  for (const [key, title] of [['viewedDays', 'Viewed'], ['skipDays', 'Skip'], ['savedDays', 'Saved'], ['appliedDays', 'Applied']]) {
    const label = node('label', title), select = node('select', ''); select.id = key;
    for (const days of [30, 60, 90, 180, null]) {
      const option = node('option', days === null ? 'Never' : days + ' days'); option.value = days === null ? 'never' : String(days); select.append(option);
    }
    label.append(select); $('retention').append(label);
  }
  for (const [key, title] of [['hideSkipped', 'Skip'], ['hideApplied', 'Applied'], ['hideSaved', 'Saved'], ['hideViewed', 'Viewed']]) {
    const label = node('label', title), input = node('input', ''); input.type = 'checkbox'; input.id = key; label.prepend(input); $('filters').append(label);
  }
  function renderSettings() {
    if (dirty) return;
    for (const key of S.retentionKeys) {
      const value = preferences[key] === null ? 'never' : String(preferences[key]);
      if (![...$(key).options].some(option => option.value === value)) { const option = node('option', value + ' days'); option.value = value; $(key).append(option); }
      $(key).value = value;
    }
    for (const key of S.filterKeys) $(key).checked = !preferences[key];
  }
  function render() {
    const search = $('search').value.trim().toLowerCase(), filter = $('filter').value, viewed = $('viewedFilter').value;
    const visible = records.filter(record => (!filter || record.mark === filter) &&
      (!viewed || (Number.isFinite(record.lastViewedAt) === (viewed === 'yes'))) &&
      `${record.title} ${record.company}`.toLowerCase().includes(search))
      .sort((a, b) => (b.markChangedAt ?? b.lastViewedAt ?? 0) - (a.markChangedAt ?? a.lastViewedAt ?? 0));
    $('count').textContent = `${visible.length} of ${records.length} remembered opportunities · newest mark first`;
    $('records').replaceChildren();
    if (!visible.length) $('records').append(node('p', records.length ? 'No matching opportunities.' : 'No remembered jobs yet. Browse SEEK or LinkedIn Jobs to start.'));
    for (const record of visible) {
      const row = node('article', ''); row.className = 'record';
      row.append(node('h3', record.title || 'Untitled job'), node('p', [record.company || 'Unknown company', record.city || 'Unknown city'].join(' · ')));
      const badge = node('span', record.mark); badge.className = 'badge'; badge.dataset.state = record.mark; row.append(badge);
      const expiry = S.expiresAt(record, preferences);
      const dates = node('p', `Marked: ${record.mark === 'NONE' ? '—' : date(record.markChangedAt)} · Mark expires: ${record.mark === 'NONE' ? '—' : expiry.mark === null ? 'Never' : date(expiry.mark)}`);
      dates.className = 'dates'; row.append(dates);
      row.append(node('p', `Last viewed: ${date(record.lastViewedAt)} · Viewed expires: ${record.lastViewedAt === null ? '—' : expiry.viewed === null ? 'Never' : date(expiry.viewed)}`));
      row.append(node('p', (S.platformOf(record) === 'linkedin' ? 'LinkedIn IDs: ' : 'SEEK IDs: ') + (S.recordIds(record).join(', ') || 'Not available')));
      const actions = node('div', ''); actions.className = 'actions';
      const label = node('label', 'Change mark'), select = node('select', '');
      select.setAttribute('aria-label', `Mark for ${record.title || 'untitled job'}`);
      for (const mark of ['SAVED', 'APPLIED', 'SKIP', 'NONE']) { const option = node('option', mark === 'NONE' ? 'Clear mark' : mark); option.value = mark; select.append(option); }
      select.value = record.mark; label.append(select);
      const save = node('button', 'Apply'); save.type = 'button';
      save.addEventListener('click', () => run('manage', { key: S.recordKey(record), action: select.value }, select.value === 'NONE' ? 'Mark cleared. Viewed history is unchanged.' : 'Mark updated. Mark retention starts now.'));
      const remove = node('button', 'Remove record'); remove.type = 'button';
      remove.addEventListener('click', () => {
        if (confirm(`Remove all memory for “${record.title || 'this job'}”, including its mark, viewed history and linked listing IDs? This cannot be undone.`)) run('manage', { key: S.recordKey(record), action: 'REMOVE' }, 'Record removed.');
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
  $('viewedFilter').addEventListener('change', render);
  $('refresh').addEventListener('click', () => run('read', {}, 'Memory refreshed.'));
  $('settings').addEventListener('change', () => { dirty = true; });
  $('settings').addEventListener('submit', event => {
    event.preventDefault();
    const next = Object.fromEntries(S.retentionKeys.map(key => [key, $(key).value === 'never' ? null : Number($(key).value)]));
    for (const key of S.filterKeys) next[key] = !$(key).checked;
    const shorter = S.retentionKeys.some(key => next[key] !== null && (preferences[key] === null || next[key] < preferences[key]));
    if (shorter && !confirm('Apply shorter retention? Older marks or viewed history may expire immediately. Their timestamps will not change. This cannot be undone.')) return;
    run('preferences', { preferences: next }, 'Settings saved.');
  });
  $('cleanup').addEventListener('click', () => {
    if (confirm('Clear expired marks and viewed history now? Unexpired memory is kept. This cannot be undone.')) run('bulk', { action: 'EXPIRED', confirmed: true }, 'Cleanup complete.');
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || busy) return;
    if (changes.records) records = S.migrate(changes.records.newValue || []);
    if (changes.preferences) preferences = S.preferences(changes.preferences.newValue);
    render();
  });
  run('read');
})();
