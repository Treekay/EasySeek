(function () {
  'use strict';
  const selectors = {
    card: 'article, [data-testid="job-card"], [data-automation="normalJob"], [data-automation="premiumJob"]',
    cardTitle: '[data-automation="jobTitle"], [data-testid="job-title"], h2 a[href*="/job/"], h3 a[href*="/job/"]',
    company: '[data-automation="jobCompany"], [data-automation="advertiser-name"], [data-testid="company-name"]',
    location: '[data-automation="jobLocation"], [data-testid="job-location"]',
    detailTitle: '[data-automation="job-detail-title"], [data-testid="job-detail-title"]',
    detailCompany: '[data-automation="advertiser-name"], [data-automation="job-detail-company"]',
    detailLocation: '[data-automation="job-detail-location"]',
    salary: '[data-automation="job-detail-salary"]',
    posted: '[data-automation="jobListingDate"], [data-automation="job-detail-date"]',
    description: '[data-automation="jobAdDetails"], [data-testid="job-description"], [data-automation="jobDescription"]'
  };
  const text = element => (element?.innerText ?? element?.textContent ?? '').trim();
  const read = (root, selector) => text(root.querySelector(selector));
  const visible = element => !!element && !element.closest('[hidden], [aria-hidden="true"]') && element.getClientRects().length > 0;
  function cards(root = document) {
    const result = new Map();
    for (const link of root.querySelectorAll('a[href*="/job/"]')) {
      if (link.closest('[data-easyseek-ui]')) continue;
      const id = EasySeekState.jobId(link.href);
      const node = link.closest(selectors.card);
      if (!id || !node || node.querySelector(selectors.description) || result.has(node)) continue;
      // Avoid treating a broad article containing several jobs as one card.
      const ids = new Set([...node.querySelectorAll('a[href*="/job/"]')].map(a => EasySeekState.jobId(a.href)).filter(Boolean));
      if (ids.size !== 1) continue;
      const title = read(node, selectors.cardTitle) || text(link);
      if (!title) continue;
      result.set(node, { id, title, company: read(node, selectors.company), location: read(node, selectors.location), url: 'https://www.seek.co.nz/job/' + id });
    }
    return result;
  }
  function detail(root = document, url = location.href) {
    const parsed = new URL(url);
    const id = EasySeekState.jobId(url) || (/^\d+$/.test(parsed.searchParams.get('jobId') || '') ? parsed.searchParams.get('jobId') : '');
    if (!id) return null;
    const description = [...root.querySelectorAll(selectors.description)].find(visible);
    const heading = [...root.querySelectorAll(selectors.detailTitle)].find(visible) ||
      (EasySeekState.jobId(url) ? [...root.querySelectorAll('h1')].find(visible) : null);
    if (!description || !heading || !text(description) || !text(heading)) return null;
    // Scope metadata to the detail region, never to a neighboring result card.
    let scope = description.parentElement;
    while (scope && !scope.contains(heading)) scope = scope.parentElement;
    if (!scope || scope === root.body || scope === root.documentElement) return null;
    const advertisedId = scope.getAttribute('data-job-id');
    if (advertisedId && advertisedId !== id) return null;
    return { node: scope, heading, descriptionNode: description, job: {
      id, title: text(heading), company: read(scope, selectors.detailCompany),
      location: read(scope, selectors.detailLocation), salary: read(scope, selectors.salary),
      posted: read(scope, selectors.posted), url: 'https://www.seek.co.nz/job/' + id,
      description: text(description)
    } };
  }
  globalThis.EasySeekExtractor = { selectors, cards, detail };
})();
