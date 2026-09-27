(function () {
  'use strict';
  const S = EasySeekState;
  // LinkedIn has separate signed-in and public layouts. Keep their clues here.
  const selectors = {
    card: '[componentkey^="job-card-component-ref-"], li[data-occludable-job-id], li.jobs-search-results__list-item, .job-card-container, .base-card, .base-search-card',
    title: '.job-card-list__title, .job-card-container__link, .base-search-card__title',
    company: '.artdeco-entity-lockup__subtitle, .job-card-container__primary-description, .base-search-card__subtitle',
    location: '.job-card-container__metadata-item, .artdeco-entity-lockup__caption, .job-search-card__location',
    detailTitle: '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, .top-card-layout__title',
    detailCompany: '.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .topcard__org-name-link',
    detailLocation: '.job-details-jobs-unified-top-card__primary-description-container .tvm__text:first-child, .jobs-unified-top-card__bullet, .topcard__flavor--bullet',
    salary: '.job-details-jobs-unified-top-card__job-insight--highlight, .salary.compensation__salary, .compensation__salary',
    posted: '.posted-time-ago__text, .jobs-unified-top-card__posted-date, .job-details-jobs-unified-top-card__primary-description-container',
    description: '#job-details, .jobs-description__content .jobs-box__html-content, .jobs-description-content__text, .show-more-less-html__markup'
  };
  const text = node => (node?.innerText ?? node?.textContent ?? '').trim();
  const read = (root, selector) => text(root.querySelector(selector));
  const visible = node => !!node && !node.closest('[hidden], [aria-hidden="true"], [data-easyseek-ui]') && node.getClientRects().length > 0 && getComputedStyle(node).visibility === 'visible';
  function elementId(node) {
    for (const key of ['data-job-id', 'data-occludable-job-id', 'data-entity-urn']) {
      const value = node?.getAttribute(key) || '';
      if (/^\d+$/.test(value)) return value;
      const urn = value.match(/^urn:li:jobPosting:(\d+)$/);
      if (urn) return urn[1];
    }
    return '';
  }
  function cards(root = document) {
    const result = new Map();
    for (const link of root.querySelectorAll('a[href*="/jobs/view/"]')) {
      if (link.closest('[data-easyseek-ui]')) continue;
      const id = S.linkedinJobId(link.href);
      const inner = link.closest(selectors.card);
      const node = inner?.closest('li[data-occludable-job-id], li.jobs-search-results__list-item') || inner;
      if (!id || !node || node.querySelector(selectors.description) || result.has(node)) continue;
      const ids = new Set([...node.querySelectorAll('a[href*="/jobs/view/"]')].map(a => S.linkedinJobId(a.href)).filter(Boolean));
      if (ids.size !== 1 || (elementId(node) && elementId(node) !== id)) continue;
      const titleNode = node.querySelector(selectors.title);
      // Signed-in links often duplicate their label in visually-hidden accessibility text.
      const title = text(titleNode?.querySelector('[aria-hidden="true"]')) || text(titleNode) || text(link);
      if (!title) continue;
      result.set(node, { platform: 'linkedin', id, title, company: read(node, selectors.company), location: read(node, selectors.location), url: S.canonicalUrl(id, 'linkedin') });
    }
    // SDUI search cards are buttons, with no /jobs/view anchor.
    for (const node of root.querySelectorAll('[role="button"][componentkey^="job-card-component-ref-"]')) {
      const id = node.getAttribute('componentkey').match(/^job-card-component-ref-(\d+)$/)?.[1];
      const paragraphs = [...node.querySelectorAll('p')];
      const title = text(paragraphs[0]?.querySelector('[aria-hidden="true"]')) || text(paragraphs[0]);
      if (!id || !title) continue;
      result.set(node, { platform: 'linkedin', id, title, company: text(paragraphs[1]), location: text(paragraphs[2]), url: S.canonicalUrl(id, 'linkedin') });
    }
    return result;
  }
  function sduiDetail(root, url) {
    const routeId = S.linkedinJobId(url);
    for (const body of root.querySelectorAll('[id^="JobDetails_AboutTheJob_"]')) {
      const id = body.id.match(/^JobDetails_AboutTheJob_(\d+)$/)?.[1];
      const description = body;
      if (!body.querySelector('[data-testid="expandable-text-box"]')) continue;
      if (!id || (routeId && routeId !== id) || !visible(description) || !text(description)) continue;
      let scope = body.parentElement;
      let links = [];
      while (scope && scope !== root.body && scope !== root.documentElement) {
        links = [...scope.querySelectorAll('a[href*="/jobs/view/"]')].filter(link => visible(link) && text(link) && !link.closest(selectors.card));
        if (links.length) break;
        scope = scope.parentElement;
      }
      // The body component and title link must independently identify the same job.
      if (!links.length || links.some(link => S.linkedinJobId(link.href) !== id)) continue;
      const heading = links[0];
      const company = [...scope.querySelectorAll('a[href*="/company/"]')].find(link => visible(link) && text(link) && (link.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING));
      const metadata = [...scope.querySelectorAll('p')].find(node =>
        (heading.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        (node.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING) && text(node).includes('·') && /\b(?:ago|applicants|clicked apply)\b/i.test(text(node)));
      const meta = text(metadata);
      // Read the whole AboutTheJob component: list items may sit outside the
      // expandable span after HTML parsing. Exclude its heading and UI affordance.
      let descriptionText = text(description);
      const label = text(body.querySelector('h2'));
      if (label && descriptionText.startsWith(label)) descriptionText = descriptionText.slice(label.length).trim();
      const more = text(description.querySelector('[data-testid="expandable-text-button"]'));
      if (more && descriptionText.endsWith(more)) descriptionText = descriptionText.slice(0, -more.length).trim();
      if (!descriptionText) continue;
      return { node: scope, heading, descriptionNode: description, job: {
        platform: 'linkedin', id, title: text(heading), company: text(company), location: meta.split('·')[0].trim(),
        posted: meta.match(/(?:reposted\s+)?(?:\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago|just now|today|yesterday)/i)?.[0] || '',
        salary: '', url: S.canonicalUrl(id, 'linkedin'), description: descriptionText
      } };
    }
    return null;
  }
  function detail(root = document, url = location.href) {
    if (!S.isLinkedInJobsUrl(url)) return null;
    const current = sduiDetail(root, url);
    if (current) return current;
    const headings = [...root.querySelectorAll(selectors.detailTitle)].filter(node => visible(node) && text(node) && !node.closest(selectors.card));
    // Pair title and body inside the same detail panel, ignoring empty loading
    // placeholders and hidden duplicate panels. Titles may contain h1, h2 or links.
    for (const description of root.querySelectorAll(selectors.description)) {
      if (!visible(description) || !text(description) || description.closest(selectors.card)) continue;
      let scope = description.parentElement;
      while (scope && scope !== root.body && scope !== root.documentElement && !headings.some(node => scope.contains(node))) scope = scope.parentElement;
      if (!scope || scope === root.body || scope === root.documentElement) continue;
      const candidates = headings.filter(node => scope.contains(node));
      if (candidates.length !== 1) continue;
      const heading = candidates[0];
      const titleLink = heading.closest('a[href*="/jobs/view/"]') || heading.querySelector('a[href*="/jobs/view/"]');
      const evidence = new Set([S.linkedinJobId(titleLink?.href), elementId(scope)].filter(Boolean));
      for (const start of [heading, description]) {
        for (let node = start; node && scope.contains(node); node = node.parentElement) {
          const id = elementId(node); if (id) evidence.add(id);
          if (node === scope) break;
        }
      }
      const routeId = S.linkedinJobId(url);
      const id = routeId || (evidence.size === 1 ? [...evidence][0] : '');
      if (!id || [...evidence].some(value => value !== id)) continue;
      const postedText = read(scope, selectors.posted);
      const posted = postedText.match(/(?:reposted\s+)?(?:\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago|just now|today|yesterday)/i)?.[0] || '';
      const salaryText = read(scope, selectors.salary);
      const salary = /[$€£¥]|\b(?:NZD|USD|AUD|salary)\b/i.test(salaryText) ? salaryText : '';
      return { node: scope, heading, descriptionNode: description, job: {
        platform: 'linkedin', id, title: text(heading), company: read(scope, selectors.detailCompany),
        location: read(scope, selectors.detailLocation), salary, posted,
        url: S.canonicalUrl(id, 'linkedin'), description: text(description)
      } };
    }
    return null;
  }
  globalThis.EasySeekExtractor = { selectors, cards, detail, routeId: S.linkedinJobId, active: S.isLinkedInJobsUrl };
})();
