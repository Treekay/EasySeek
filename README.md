# EasySeek V1

A lightweight Manifest V3 Chrome extension for SEEK New Zealand and LinkedIn Jobs browsing. It remembers which jobs you viewed and lets you mark opportunities **Saved**, **Applied**, or **Skip**, while keeping each site's own search and detail UI.

Plain JavaScript and CSS, no build step or dependencies. All data stays in `chrome.storage.local` in this Chrome profile. No backend, accounts, cloud sync, analytics, network requests, crawling, application automation, or messages. Full job descriptions are never stored in extension memory. Copy JD and .md download are generated only on request from the current page. There is no Career Ops integration, JSON/CSV memory export, or sync.

## Install or update

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select the folder containing `manifest.json` (`F:\code\EasySeek`).
3. For an existing installation, click **Reload** on EasySeek. Reload open SEEK/LinkedIn tabs and the Memory page so they use the new scripts.

Supported hosts: production SEEK New Zealand at `https://nz.seek.com`, plus the legacy `https://seek.co.nz` and `https://www.seek.co.nz` domains. The extension recognizes search cards, `/job/{numeric ID}` details, and split views with a numeric `jobId` query parameter. Other countries/subdomains are not enabled. Content scripts match all paths on these three hosts for client-side navigation, with a single floating rail; job-specific actions are enabled only for a recognized active detail.

Version **1.4.3** supports LinkedIn's SDUI `/jobs/search-results/` layout: job actions recognize the selected detail, and visibility filters recognize button-based result cards. The detail title link and AboutTheJob component must agree on the job ID before actions are enabled. Reload the extension and your SEEK/LinkedIn tabs after updating.

Runtime host validation and canonical URL generation live in `src/state.js` (`seekOrigins`, `isSeekUrl`, `canonicalUrl`). The background worker and extractor reuse these helpers. Manifest match patterns must remain declarative; a test checks that they match the shared origin list. Only the listed HTTPS origins are accepted, not unrelated hosts or lookalike subdomains.

Newly recorded or observed jobs use `https://nz.seek.com/job/{id}` as their canonical URL. Existing legacy URLs remain valid: identity is based on SEEK IDs/canonical keys, not the domain or tracking parameters. Existing marks, marked dates and viewed history are preserved. An existing record's URL is updated when its job is next observed; no destructive migration is needed.

## Viewed history and user marks

These are independent concepts:

- **Viewed** means a detail page successfully rendered a title and description. Opening it updates `lastViewedAt`; encountering a search card does not count as viewing.
- **Mark** is your explicit decision: NONE, SKIP, SAVED, or APPLIED. Opening or observing the job never overwrites the mark or its timestamp.

## Floating action rail

The right-middle edge of the viewport has five compact, fixed 40 × 40 px square buttons. Copy uses a clipboard icon, Export a download icon, Mark a pencil, Filter a funnel, and Memory a gear; accessible names and hover tooltips identify each action. Submenu buttons are also square. There are no injected action bars inside cards or detail panels.

- **Copy JD** (blue) copies the active job as structured Markdown and shows “Copied” after success.
- **Export JD** (green download icon) downloads the same Markdown as `company-title-seekJobId.md`.
- **Mark** opens three equal-sized buttons to its left: **Skip / Saved / Applied**. Selecting one closes the menu. The pencil icon color and tooltip reflect the current mark; its tooltip also shows whether the job was viewed. Saved and Applied cards retain subtle outlines.
- **Filter** opens four independent toggle buttons to its left. Selected toggles have a blue state and a check: they indicate which types of jobs are shown. This menu stays open for repeated changes; Escape, clicking outside, or clicking Filter again closes it. The Filter tooltip reports loaded cards shown/hidden.

**Memory** is the fifth main button (gear icon). It opens the management page directly in a new tab, including when no job detail is active.

The rail acts on a full detail page or the active split-view detail pane. Without a parseable detail, Copy JD, Export JD and Mark are disabled; Filter remains available. Each job action reparses the active detail when clicked, and stale content during SPA transitions is withheld. Menus support native button keyboard navigation, visible focus, and Escape to close. On narrow viewports filter buttons shrink to keep the submenu on screen.

Copy/download include title, company, location, salary, posted date/age, canonical URL, platform-specific job ID, and the full visible description. Missing fields say “Not available.” Description paragraphs remain plain text inside structured Markdown. Expand any collapsed job description on the site first. Filenames remove filesystem-unsafe characters. Downloads use a temporary local Blob URL, without the downloads permission or a network request; Chrome chooses the destination according to your download settings. “Download started” confirms handoff to Chrome, not that the file has finished saving. Clipboard failures show an error rather than a success message.

**Clear mark** in Memory returns to NONE and preserves any unexpired viewed history. **Remove record** in Memory deletes both the mark and viewed history, including all linked listing IDs. If clearing a mark leaves no viewed history, the empty record is discarded. Selecting a mark again is a new manual decision and restarts its mark retention timer.

## Search filters

| Filter | Default |
| --- | --- |
| Skip | Not selected (hidden) |
| Applied | Selected (shown) |
| Saved | Selected (shown) |
| Viewed | Selected (shown) |

All four can be changed through the floating Filter menu or Memory settings. Select the types you want to see; deselect to hide them. These remain independent: a viewed Saved job requires both Viewed and Saved to be selected. New, unmarked jobs always remain visible. Select all four to recover every hidden job; the separate Show Hidden override has been removed. Selections persist across pages and tabs. Existing preferences keep their filtering effect; only the UI meaning is inverted, so no data migration is needed. Internally the existing `hide*` preference keys are retained for compatibility. The Filter tooltip counts currently loaded cards, not total SEEK matches or unique opportunities.

Filtering uses reversible CSS classes, never removes site nodes. Settings and record changes propagate to other open job tabs through storage events. A single background writer serializes updates from all tabs.

## Independent retention

| Memory | Default | Retention anchor |
| --- | --- | --- |
| Viewed | 60 days | `lastViewedAt`: last actual detail opening |
| Skip | 60 days | `markChangedAt`: explicit mark assignment |
| Saved | Never | `markChangedAt` if configured finite |
| Applied | Never | `markChangedAt` if configured finite |

Each policy independently offers **30 / 60 / 90 / 180 days / Never** in Memory settings. Expiry is the anchor plus the selected number of 24-hour days, inclusive of the expiry boundary. Repeated search appearances, observations in another tab, and discovered listing aliases do not extend either timer. Reopening a detail refreshes viewed history only, never the mark timer.

Cleanup clears only the expired part. An expired Skip mark becomes NONE while recent viewed history remains. Expired viewed history does not remove an unexpired Saved/Applied/Skip mark. The record is deleted only when neither a mark nor viewed history remains. Settings changes do not rewrite timestamps and affect the next cleanup, including cleanup performed when saving them. Shortening retention requires confirmation because it may immediately discard older memory. Extending a policy cannot recover information already removed.

Cleanup is opportunistic on background requests, including job-page load/pageshow, Memory opening/Refresh, and Clear expired memory. No scheduled task is installed; an idle tab need not update at the exact expiry instant.

## EasySeek Memory

Open **chrome://extensions → EasySeek → Details → Extension options**, or click **Memory (gear icon)** in the floating rail.

- Inspect every remembered opportunity: title, company, city, mark, marked date, mark expiry, last viewed date, viewed expiry, and linked platform-specific listing IDs.
- Search title/company and combine a mark filter (including NONE) with Viewed/Not viewed. No marked date/expiry is shown for NONE; no viewed date is shown when viewing is unknown or expired.
- Choose a mark and **Apply**, including Clear mark. This changes only the explicit decision; it does not manufacture a viewing event.
- **Remove record** deletes all memory for the opportunity after confirmation.
- Configure the four retention policies and search filters independently.
- **Clear expired memory now** requires confirmation and preserves all unexpired information. Saved/Applied can expire only if you explicitly configure a finite policy for them. There is no bulk-delete Saved/Applied action.

The default ordering is most recently changed mark first, using the last-viewed date for records without a mark-change date. Storage uses this Chrome profile only, not Chrome Sync. Uninstalling the extension removes its local memory.

## Migration from earlier V1 versions

Migration is automatic and idempotent:

- PURSUE → SAVED, preserving the original decision date.
- SKIP → SKIP, preserving the original decision date.
- SEEN → NONE with viewed history, using the old status assignment timestamp as the best known viewing time.
- Earlier records without `statusChangedAt` use meaningful `manualAt` for explicit decisions, otherwise `updatedAt`, `lastSeenAt`, or `firstSeenAt`; if none exists, use migration time once.

Old SKIP/PURSUE records cannot reliably tell whether you opened the detail or merely saw a card. Migration does not invent viewed history for these records. Identity, linked IDs, title/company/city and observation timestamps are preserved. Missing new fields alone do not cause deletion; cleanup runs after migration under the current policies.

Configured `seenDays` becomes `viewedDays`, and `skipDays` is preserved. The old Hide Seen behavior is retired: Viewed starts selected (shown). Existing Skip visibility preference is retained. New Saved/Applied retention defaults to Never and their visibility controls start selected.

## Identity and schema

SEEK IDs come from `/job/12345678`; query/tracking parameters are ignored. Complete normalized company + city + title also links reposts with different IDs. Trailing Ltd/Limited and title hyphens are normalized, while seniority is preserved: `Xero Limited / Auckland Central / Full-Stack Engineer` becomes `xero|auckland|full stack engineer`. Software Engineer and Senior Software Engineer remain distinct.

Only explicitly recognized city names are collapsed. Unknown/missing location or company does not form a partial fallback key; use the SEEK ID instead. Within the same platform, identical complete canonical keys intentionally share memory, even if SEEK issued another ID. This heuristic cannot distinguish separate vacancies with identical company/city/title.

The versioned, plain-data record schema is suitable for a later JSON/CSV exporter without storing job descriptions:

```text
schemaVersion: 3
platform: seek | linkedin
canonicalKey: string (LinkedIn keys are prefixed with linkedin|)
seekIds: string[] (SEEK records)
linkedinIds: string[] (LinkedIn records)
url: canonical job URL (no tracking parameters), or empty when no ID exists
title, company, city: strings
mark: NONE | SKIP | SAVED | APPLIED
markChangedAt: Unix milliseconds or null
lastViewedAt: Unix milliseconds or null
firstSeenAt, lastSeenAt, updatedAt: Unix milliseconds
```

Viewed state is derived from a non-null `lastViewedAt`. `lastSeenAt` is observation metadata, never a retention anchor. Clearing/expiring a mark may retain its historical `markChangedAt` while viewed memory remains; NONE has no active mark expiry. Only the current visible JD can be copied/downloaded as Markdown. Bulk memory export, JSON/CSV export, sync integrations, and external tool calls are not implemented.

## Source and DOM maintenance

| File | Responsibility |
| --- | --- |
| `src/state.js` | Identity, schema migration, independent marks/views, filters and expiry. |
| `src/background.js` | Serialized local storage writes and cleanup. |
| `src/storage.js` | Content/options messaging client. |
| `src/seek-extractor.js` | Centralized SEEK selectors and card/detail recognition. |
| `src/linkedin-extractor.js` | Public/signed-in LinkedIn card and detail adapters, route validation. |
| `src/content.js` | Navigation, dynamic cards, filtering, automatic views. |
| `src/ui.js`, `src/styles.css` | Fixed floating rail, left-opening menus and feedback. |
| `src/jd.js` | Shared Markdown generation, safe filenames and temporary Blob downloads. |
| `options/` | Memory management and settings. |

Cards are recognized through `/job/{ID}` links inside semantic `article` elements or known job-card markers. A candidate must contain only one distinct job ID. Title/company/location use centralized `data-automation`/`data-testid` selectors and semantic heading links.

Details require a visible title and nonempty description in a shared container smaller than the whole document body, plus a route job ID. `data-job-id`, when present, must agree with that ID. Description text is used to recognize loaded/stale SPA content and for explicit Copy JD/.md actions; it is never persisted in extension memory. The previous unchanged detail is withheld during navigation. Exact reuse of identical DOM/content for another listing can require a refresh.

A debounced MutationObserver handles inserted/recycled cards and changed text/links. A lightweight 750 ms URL check catches History API navigation. Unrecognized cards are left alone; incomplete details are not recorded as viewed. If SEEK markup changes, update the selector table in `seek-extractor.js` and verify on a real page before broadening selectors.

## Tests and Chrome checklist

```powershell
node --test tests/state.test.cjs tests/management.test.cjs tests/jd.test.cjs tests/linkedin.test.cjs
Get-ChildItem src\*.js, options\*.js | ForEach-Object { node --check $_.FullName }
```

`tests/browser.html` exercises real content/extraction/UI code with mocked extension storage: fixed rail placement, absence of inline controls, left-opening menus, dismissal, positive visibility filters, mark/view independence, aliases, malformed cards, SPA navigation, and copied/downloaded Markdown equality. Clipboard and download handoff are intercepted in this fixture; it does not write your clipboard or save a JD file. `tests/options-browser.html` loads the real Memory UI with mocked extension APIs to test search, filters, edits, clear/remove, all four policies, and confirmation/cancellation. The options fixture requires Chrome's `--allow-file-access-from-files` flag for local fixture loading. These fixtures do not touch extension data.

Verified: 30 Node tests, JavaScript syntax checks, and four headless Chrome fixtures (SEEK, legacy LinkedIn, SDUI LinkedIn, Memory). The LinkedIn extractor also passed a local Chrome check against freshly retrieved public HTML: 60 result cards and one full detail with company/location/description. Live SEEK markup and real extension installation integration remain unverified in this environment; previous public SEEK requests returned a JavaScript/cookie challenge. Run these checks after reloading the unpacked extension:

1. Open a search on `https://nz.seek.com` and confirm one rail appears at the right-middle with Copy JD/Export JD/Mark disabled until a job is open. Confirm no inline action bars remain. Confirm Skip is unselected and Applied/Saved/Viewed are selected by default. Open a new job: it gains Viewed and remains visible.
2. Mark Saved, Applied, and Skip using the menu. Confirm the correct label/outline and default filtering. Open each marked job and check its mark and marked date are unchanged.
3. Toggle each visibility option. Selecting all four should reveal every loaded card, including those matching multiple types. Use the Memory gear button to clear a hidden job's mark and confirm viewed history remains.
4. Test reposts/tracking URLs, dynamic cards, split details, and Back/Forward navigation. Confirm no duplicate controls.
5. Open Memory from both entry points. Combine mark/viewed filters, search, change and clear marks, remove a disposable record, and confirm updates reach an open SEEK tab.
6. Set Saved/Applied to finite retention and Viewed/Skip to Never, save, and inspect both expiry dates. Test shorter-policy confirmation and expired-memory cleanup with disposable data.
7. Copy JD, paste into a text editor, then download .md and compare the contents, metadata, and final description paragraph. Confirm the filename and that nothing is stored in extension memory. Test after changing the active job.
8. If upgrading, confirm old PURSUE becomes SAVED and old SEEN becomes viewed-only. Existing marks, filters and retention settings must be preserved.

## Extension icon

The blue magnifying-glass/check mark is an original, platform-neutral symbol for finding and selecting jobs. The editable vector is `icons/easyseek.svg`; Chrome uses the included 16, 32, 48 and 128 px PNG exports. The Memory tab also uses this icon. To rebuild the assets, run `python tools/generate_icons.py` with Pillow installed; this is optional development tooling and is not needed to load the extension.

## LinkedIn Jobs

Supported hosts are `www.linkedin.com`, `nz.linkedin.com`, and `linkedin.com`, over HTTPS. EasySeek runs job operations only under `/jobs` (including search, collections/recommendations with `currentJobId`, and full detail pages). Lightweight scripts load on these hosts to detect SPA navigation from the feed into Jobs, but do not inspect feed cards, send storage messages, or display the rail outside Jobs. No broad `*.linkedin.com` permission is requested.

The same five-button rail provides Copy JD, Markdown download, marks, visibility filters and Memory. Filters and retention settings are shared across platforms. Mark/viewed records are isolated by platform: a LinkedIn job with ID 123 never matches SEEK ID 123, and similar company/title/location across platforms do not automatically merge. Within LinkedIn, complete canonical metadata still recognizes reposts. The existing conservative NZ city normalization is retained; unknown/overseas locations use listing IDs rather than guessing cities.

LinkedIn URLs may be numeric (`/jobs/view/123/`), title slugs ending in an ID (`/jobs/view/engineer-at-company-123`), or split views (`/jobs/search/?currentJobId=123`). All normalize to `https://www.linkedin.com/jobs/view/123/`. Tracking parameters do not affect identity. Markdown labels the ID as LinkedIn rather than SEEK.

Existing schema-2 memory migrates losslessly to schema 3 with `platform: seek`; existing SEEK keys, IDs, marks, viewed dates and retention anchors stay unchanged. Older V1 migrations still work. Memory displays each record's platform and linked IDs; editing/removing one platform's job does not affect the other.

### LinkedIn DOM assumptions and limits

Public cards use `.base-card` / `.base-search-card` and semantic `/jobs/view/` links. Signed-in cards use `.job-card-container` or result list items with `data-occludable-job-id`; the outer item is hidden so no empty wrapper remains. Public details use `.top-card-layout__title`, `.topcard__org-name-link`, and `.show-more-less-html__markup`; signed-in details use unified-top-card markers and `#job-details`/description content. SDUI cards instead use `componentkey="job-card-component-ref-{id}"` on button containers. SDUI details use `JobDetails_AboutTheJob_{id}` and the nearby `/jobs/view/{id}` title link, with no dependence on generated CSS class names. Only the AboutTheJob component supplies the JD; company descriptions and expand controls are excluded. Changes to component IDs are observed during SPA navigation. All selectors are centralized in the LinkedIn adapter.

A title and nonempty description must be visibly rendered in a shared detail container. Route IDs must agree with any job ID evidence on that container or title link. A stale detail during selection changes is withheld until it updates. Salary and posting age are optional; missing values say Not available. Only the rendered description is copied, so expand Show more yourself. No application buttons, native LinkedIn Save controls, messages, account settings or network APIs are operated by EasySeek. EasySeek marks are local and independent of LinkedIn's native Saved/Applied state.

Public markup was checked using a [LinkedIn NZ job search](https://www.linkedin.com/jobs/search/?keywords=software%20engineer&location=New%20Zealand) and one linked detail, with scripts/external assets removed for the local extraction test. The supplied saved SDUI page was also verified offline in Chrome with its original local CSS: 25 cards and the selected detail including the final description requirements. The original page is not included in this repository; `tests/linkedin-sdui-browser.html` uses a reduced structure with synthetic content and tests enabled actions, full JD copy/export, filtering and partial SPA updates. Live signed-in extension integration remains unverified; LinkedIn experiments may require selector maintenance. Feed-to-Jobs navigation, delayed descriptions, dynamic cards, mark/filter behavior and copy/download handoff are tested in `tests/linkedin-browser.html` without real account actions.

After upgrading, reload the extension and LinkedIn tabs. Open Jobs, select a role, verify the rail enables and records Viewed, then test Skip/Saved/Applied, selecting visibility types to recover hidden jobs, Copy JD and download, and Memory. Switch jobs and use Back/Forward; briefly return to the feed (rail should disappear), then Jobs again. Confirm older SEEK memory remains available. No LinkedIn login is performed by the extension.
