(function () {
  'use strict';
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(label, action, callback, className = '') {
    const node = element('button', label, className);
    node.type = 'button'; node.dataset.action = action;
    node.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); callback(); });
    return node;
  }
  function icon(kind) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
    const paths = {
      copy: ['M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3', 'M9 2h6v5H9z', 'M8 12h8M8 16h6'],
      export: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4'],
      mark: ['m16 3 5 5-12 12-6 1 1-6Z', 'm14 5 5 5', 'm4 15 5 5'],
      filter: ['M3 4h18l-7 8v7l-4 2V12Z'],
      memory: ['M9.866 5.019L10.514 2.617L13.486 2.617L14.134 5.019L15.427 5.554L17.584 4.314L19.686 6.416L18.446 8.573L18.981 9.866L21.383 10.514L21.383 13.486L18.981 14.134L18.446 15.427L19.686 17.584L17.584 19.686L15.427 18.446L14.134 18.981L13.486 21.383L10.514 21.383L9.866 18.981L8.573 18.446L6.416 19.686L4.314 17.584L5.554 15.427L5.019 14.134L2.617 13.486L2.617 10.514L5.019 9.866L5.554 8.573L4.314 6.416L6.416 4.314L8.573 5.554Z', 'M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0']
    };
    for (const d of paths[kind]) { const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path); }
    return svg;
  }
  function rail(handlers) {
    const node = element('aside', '', 'easyseek-rail');
    node.dataset.easyseekUi = 'rail'; node.setAttribute('aria-label', 'EasySeek job tools');
    const buttons = {}, panels = {}, choices = {}, toggles = {};
    let open = '', contextId = '', settings = {};
    function close(focus = false) {
      const previous = open; open = '';
      for (const key of Object.keys(panels)) { panels[key].hidden = true; buttons[key].setAttribute('aria-expanded', 'false'); }
      if (focus && previous) buttons[previous].focus();
    }
    function toggle(key) {
      const next = open === key ? '' : key; close();
      if (next) { open = next; panels[next].hidden = false; buttons[next].setAttribute('aria-expanded', 'true'); }
    }
    for (const [key, label, title] of [['copy', 'Copy JD', 'Copy the current job as Markdown'], ['export', '.md', 'Download the current job as Markdown'], ['mark', 'Mark', 'Mark the current job'], ['filter', 'Filter', 'Filter search results'], ['memory', 'Memory', 'Open EasySeek Memory in a new tab']]) {
      const row = element('div', '', 'easyseek-rail-row');
      buttons[key] = button(label, key, () => key === 'mark' || key === 'filter' ? toggle(key) : handlers[key](), 'easyseek-main easyseek-' + key);
      buttons[key].replaceChildren(icon(key));
      buttons[key].title = title; buttons[key].setAttribute('aria-label', title);
      row.append(buttons[key]);
      if (key === 'mark' || key === 'filter') {
        const panel = element('div', '', 'easyseek-submenu'); panel.id = 'easyseek-' + key + '-menu'; panel.hidden = true;
        panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', key === 'mark' ? 'Choose job mark' : 'Search filters');
        buttons[key].setAttribute('aria-controls', panel.id); buttons[key].setAttribute('aria-expanded', 'false');
        panels[key] = panel; row.append(panel);
      }
      node.append(row);
    }
    for (const [label, mark] of [['Skip', 'SKIP'], ['Saved', 'SAVED'], ['Applied', 'APPLIED']]) {
      const choice = button(label, 'mark-' + mark, () => { close(true); handlers.mark(mark); });
      choice.dataset.mark = mark; choices[mark] = choice; panels.mark.append(choice);
    }
    const filterRow = element('div', '', 'easyseek-filter-toggles');
    for (const [key, label] of [['hideSkipped', 'Skip'], ['hideApplied', 'Applied'], ['hideSaved', 'Saved'], ['hideViewed', 'Viewed']]) {
      toggles[key] = button(label, key, () => handlers.filter(key, !settings[key]));
      toggles[key].title = 'Show ' + label + ' jobs';
      toggles[key].setAttribute('aria-label', 'Show ' + label + ' jobs');
      toggles[key].dataset.filter = key; filterRow.append(toggles[key]);
    }
    panels.filter.append(filterRow);
    node.addEventListener('keydown', event => {
      if (event.key === 'Escape') { close(true); event.stopPropagation(); }
    });
    document.addEventListener('click', event => { if (!node.contains(event.target)) close(); });
    node.addEventListener('focusout', event => { if (!node.contains(event.relatedTarget)) close(); });
    return { node, close, update(detail, state, preferences, shown, hidden) {
      if (contextId !== (detail?.id || '')) { close(); contextId = detail?.id || ''; }
      for (const key of ['copy', 'export', 'mark']) buttons[key].disabled = !detail;
      settings = { ...preferences };
      buttons.mark.dataset.mark = state.mark;
      buttons.mark.title = detail ? `${detail.title} — ${state.mark}${state.viewed ? ' · Viewed' : ''}` : 'Open a job to mark it';
      buttons.mark.setAttribute('aria-label', detail ? 'Change job mark: ' + state.mark : 'Open a job to mark it');
      buttons.filter.title = `${shown} jobs shown · ${hidden} hidden`;
      for (const [mark, choice] of Object.entries(choices)) choice.setAttribute('aria-pressed', String(state.mark === mark));
      for (const [key, choice] of Object.entries(toggles)) choice.setAttribute('aria-pressed', String(!settings[key]));
    } };
  }
  let feedback;
  function notify(message, error = false) {
    if (!feedback) {
      feedback = element('div', '', 'easyseek-feedback'); feedback.dataset.easyseekUi = 'feedback';
      feedback.setAttribute('role', 'status'); document.body.append(feedback);
    }
    feedback.textContent = message; feedback.hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { feedback.hidden = true; }, error ? 9000 : 3500);
  }
  globalThis.EasySeekUI = { rail, notify };
})();
