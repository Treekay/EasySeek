(function (root) {
  'use strict';
  const S = root.EasySeekState || (typeof require !== 'undefined' ? require('./state.js') : null);
  const defaultUrl = 'http://localhost:8765';
  function endpoint(value = defaultUrl) {
    const raw = String(value).trim();
    // Validate the literal host before URL normalization (no numeric/IP aliases).
    if (!/^http:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?\/?$/.test(raw)) throw new Error('Use an HTTP localhost or 127.0.0.1 URL with an optional port.');
    const url = new URL(raw);
    if (url.port === '0') throw new Error('Use a port from 1 to 65535.');
    return url.origin;
  }
  function settings(value) {
    try { return { enabled: value?.enabled === true, url: endpoint(value?.url ?? defaultUrl) }; }
    catch { return { enabled: false, url: defaultUrl }; }
  }
  const permission = url => endpoint(url).replace(/:[0-9]+$/, '') + '/*';
  function payload(job, state, action, description) {
    const { id, platform, canonicalKey } = S.identity(job);
    if (!['SAVED', 'APPLIED'].includes(action) || !/^[1-9][0-9]*$/.test(id) || !job.title?.trim() || !job.company?.trim())
      throw new Error('Job ID, title or company is missing. Your EasySeek mark is saved.');
    const result = { source: platform, sourceJobId: id, canonicalKey: canonicalKey || platform + ':' + id,
      title: job.title, company: job.company, location: job.location || null,
      url: S.canonicalUrl(id, platform), mark: state.mark, requestedStage: action };
    if (typeof description === 'string' && description.trim()) result.jdMarkdown = description;
    return result;
  }
  const pending = new Map();
  async function request(url, path, body, fetcher = root.fetch, timeout = 4000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetcher(endpoint(url) + path, {
        method: body ? 'POST' : 'GET', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
        signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'
      });
      if (!response.ok) throw new Error(response.status === 409 ? 'Tracker identity conflict; resolve it in Career Workspace.' : response.status === 403 ? 'Tracker rejected this extension. Check its allowed extension origins.' : 'Tracker rejected the request (HTTP ' + response.status + ').');
      const data = await response.json();
      if (body ? !['created', 'updated', 'unchanged'].includes(data.outcome) || !data.application?.id : data.service !== 'career-workspace' || data.status !== 'ok')
        throw new Error('This URL did not return a Career Workspace response.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('Local tracker unavailable. Your EasySeek mark is saved; try the mark again when it is running.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  function send(url, body, fetcher, timeout) {
    // Coalesce simultaneous clicks only; the tracker owns durable idempotency.
    const key = JSON.stringify([endpoint(url), body]);
    if (pending.has(key)) return pending.get(key);
    const promise = request(url, '/api/applications/import', body, fetcher, timeout).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }
  root.EasySeekTracker = { defaultUrl, endpoint, settings, permission, payload, send, test: (url, fetcher, timeout) => request(url, '/api/health', null, fetcher, timeout) };
  if (typeof module !== 'undefined') module.exports = root.EasySeekTracker;
})(globalThis);
