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
  function actions(onAction, onCopy) {
    const node = element('div', '', 'easyseek-actions');
    node.dataset.easyseekUi = 'actions';
    node.setAttribute('aria-label', 'EasySeek job actions');
    const badge = element('span', 'NEW', 'easyseek-badge');
    node.append(badge);
    for (const [label, action] of [['Skip', 'SKIP'], ['Pursue', 'PURSUE'], ['Reset', 'RESET']]) {
      node.append(button(label, () => onAction(action)));
    }
    if (onCopy) node.append(button('Analyze with Career Ops', onCopy));
    return { node, update(status) { badge.textContent = status; node.dataset.state = status; } };
  }
  function controls(onChange) {
    const node = element('aside', '', 'easyseek-controls');
    node.dataset.easyseekUi = 'controls';
    node.setAttribute('aria-label', 'EasySeek search filters');
    node.append(element('strong', 'EasySeek'));
    const inputs = {};
    for (const [key, title] of [['hideSeen', 'Hide Seen'], ['hideSkipped', 'Hide Skipped'], ['showHidden', 'Show Hidden']]) {
      const label = element('label');
      const input = element('input');
      input.type = 'checkbox';
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
