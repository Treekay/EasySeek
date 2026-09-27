(function () {
  'use strict';
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(label, callback) {
    const node = element('button', label);
    node.type = 'button';
    node.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); callback(); });
    return node;
  }
  function actions(onAction) {
    const node = element('div', '', 'easyseek-actions');
    node.dataset.easyseekUi = 'actions';
    const control = element('details', '', 'easyseek-mark');
    const summary = element('summary', 'Mark');
    summary.setAttribute('aria-label', 'Change job mark');
    const menu = element('div', '', 'easyseek-menu');
    menu.setAttribute('aria-label', 'Choose job mark');
    const choices = [];
    for (const [label, mark] of [['Saved', 'SAVED'], ['Applied', 'APPLIED'], ['Skip', 'SKIP'], ['Clear mark', 'NONE']]) {
      const choice = button(label, () => { control.open = false; summary.focus(); onAction(mark); });
      choice.dataset.mark = mark; choices.push(choice); menu.append(choice);
    }
    control.append(summary, menu);
    control.addEventListener('click', event => event.stopPropagation());
    control.addEventListener('keydown', event => {
      if (event.key === 'Escape') { control.open = false; summary.focus(); event.stopPropagation(); }
    });
    const viewed = element('span', '', 'easyseek-viewed');
    node.append(control, viewed);
    return { node, update(state) {
      summary.textContent = { NONE: 'Mark', SAVED: 'Saved', APPLIED: 'Applied', SKIP: 'Skip' }[state.mark];
      node.dataset.mark = state.mark;
      viewed.textContent = state.viewed ? 'Viewed' : '';
      for (const choice of choices) choice.setAttribute('aria-pressed', String(choice.dataset.mark === state.mark));
    } };
  }
  document.addEventListener('click', event => {
    for (const menu of document.querySelectorAll('.easyseek-mark[open]')) if (!menu.contains(event.target)) menu.open = false;
  });
  function controls(onChange) {
    const node = element('aside', '', 'easyseek-controls');
    node.dataset.easyseekUi = 'controls';
    node.setAttribute('aria-label', 'EasySeek search filters');
    node.append(element('strong', 'EasySeek'));
    const inputs = {};
    for (const [key, title] of [['hideSkipped', 'Hide Skip'], ['hideApplied', 'Hide Applied'], ['hideSaved', 'Hide Saved'], ['hideViewed', 'Hide Viewed'], ['showHidden', 'Show Hidden']]) {
      const label = element('label');
      const input = element('input');
      input.type = 'checkbox';
      input.dataset.filter = key;
      input.addEventListener('change', () => onChange(key, input.checked));
      label.append(input, document.createTextNode(title));
      inputs[key] = input;
      node.append(label);
    }
    const count = element('span');
    count.setAttribute('aria-live', 'polite');
    node.append(count);
    node.append(button('Manage EasySeek', () => EasySeekStorage.request('openOptions').catch(error => notify(error.message, true))));
    return { node, update(preferences, shown, hidden) {
      for (const key in inputs) inputs[key].checked = preferences[key];
      const message = `${shown} jobs shown · ${hidden} hidden`;
      if (count.textContent !== message) count.textContent = message;
    } };
  }
  let feedback;
  function notify(message, error = false) {
    if (!feedback) {
      feedback = element('div', '', 'easyseek-feedback');
      feedback.dataset.easyseekUi = 'feedback';
      feedback.setAttribute('role', 'status');
      document.body.append(feedback);
    }
    feedback.textContent = message;
    feedback.hidden = false;
    clearTimeout(notify.timer);
    if (!error) notify.timer = setTimeout(() => { feedback.hidden = true; }, 4500);
  }
  globalThis.EasySeekUI = { actions, controls, notify };
})();
