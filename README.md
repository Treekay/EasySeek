# EasySeek V1

A lightweight Manifest V3 Chrome extension for SEEK New Zealand and LinkedIn Jobs browsing. It remembers which jobs you viewed and lets you mark opportunities **Saved** or **Skip**, and track **Applied / Interview / Offered / Rejected**, while keeping each site's own search and detail UI.

Plain JavaScript and CSS, no build step or dependencies. All data stays in `chrome.storage.local` in this Chrome profile. No backend, accounts, cloud sync, analytics, network requests, crawling, application automation, or messages. Full job descriptions are never stored in extension memory. Copy JD and .md download are generated only on request from the current page. Memory offers an explicit local applications CSV download. There is no Career Ops integration, JSON export, sync, automated analysis, or Sankey diagram.

## Install or update

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select the folder containing `manifest.json` (`F:\code\EasySeek`).
3. For an existing installation, click **Reload** on EasySeek. Reload open SEEK/LinkedIn tabs and the Memory page so they use the new scripts.

Supported hosts: production SEEK New Zealand at `https://nz.seek.com`, plus the legacy `https://seek.co.nz` and `https://www.seek.co.nz` domains. The extension recognizes search cards, `/job/{numeric ID}` details, and split views with a numeric `jobId` query parameter. Other countries/subdomains are not enabled. Content scripts match all paths on these three hosts for client-side navigation, with a single floating rail; job-specific actions are enabled only for a recognized active detail.

Version **1.6.0** separates browsing marks from application progress, keeps stage event history, and adds an Applications view and local CSV export in Memory. Stored records migrate to schema 4; JD Markdown uses handoff schema 2. Reload the extension, job tabs and Memory after updating.

Runtime host validation and canonical URL generation live in `src/state.js` (`seekOrigins`, `isSeekUrl`, `canonicalUrl`). The background worker and extractor reuse these helpers. Manifest match patterns must remain declarative; a test checks that they match the shared origin list. Only the listed HTTPS origins are accepted, not unrelated hosts or lookalike subdomains.

Newly recorded or observed jobs use `https://nz.seek.com/job/{id}` as their canonical URL. Existing legacy URLs remain valid: identity is based on SEEK IDs/canonical keys, not the domain or tracking parameters. Existing marks, marked dates and viewed history are preserved. An existing record's URL is updated when its job is next observed; no destructive migration is needed.

## Structured Markdown handoff

Copy JD and Export JD use the same formatter and produce the same UTF-8 Markdown for an unchanged active job and EasySeek state. Each click re-extracts the currently rendered JD and reads the tab's current EasySeek state. The YAML front matter uses schema version 2, followed by a human-readable title, `## Job` metadata, and `## Job Description` with the full extracted text.

```yaml
---
easyseek_schema: 2
platform: "seek"
job_id: "12345678"
canonical_url: "https://nz.seek.com/job/12345678"
canonical_key: "xero|auckland|software engineer"
mark: "saved"
viewed: true
application_stage: "none"
application_history: []
title: "Software Engineer"
company: "Xero"
location: "Auckland"
salary: null
posted: "2d ago"
exported_at: "2026-09-27T01:02:03.000Z"
---
```

- `platform` is `seek` or `linkedin`; `job_id` is a string containing the platform's numeric ID. `canonical_url` uses the existing normalized URL without tracking parameters.
- `canonical_key` reuses EasySeek's canonical identity logic, including the `linkedin|` prefix. It is `null` when there is insufficient metadata for a canonical key; consumers can use platform plus job ID instead.
- `mark` is `none`, `skip`, or `saved`. `application_stage` is `none`, `applied`, `interview`, `offered`, or `rejected`; `application_history` is the ordered list of stored `{stage, at}` events (uppercase stage names, Unix milliseconds). Schema 2 replaces schema 1's `mark: applied` with this independent stage. `viewed` is a YAML boolean. These describe local EasySeek state, independently of native site marks.
- `title`, `company`, `location`, `salary`, and `posted` contain extracted text; missing/blank values are consistently `null`. All strings are double-quoted with escaped quotes, backslashes and newlines. Human-readable missing fields say “Not available”.
- `exported_at` is an ISO 8601 UTC timestamp for the generated snapshot. The tab reuses that timestamp while the job content and state remain unchanged, ensuring Copy and Export are byte-identical. A changed job/content/state or navigation creates a fresh timestamp on the next explicit handoff. The formatter accepts an explicit timestamp for reproducible output.

Download names retain bounded, sanitized slugs: `company-title-platform-jobId.md`, for example `xero-software-engineer-seek-12345678.md` or `partly-backend-engineer-linkedin-4321123456.md`.

This is a portable handoff for external tools or agents, including career-ops; no tool is required or directly integrated. EasySeek does not send the output anywhere, perform analysis, call APIs or synchronize data. Copy and download are explicit and local. They do not change marks, Viewed history or retention timestamps, and never persist the JD to `chrome.storage`. Only transient in-tab snapshot information is kept for consistent output.

## Viewed history, browsing marks and application progress

These are independent concepts:

- **Viewed** means a detail page successfully rendered a title and description. Opening it updates `lastViewedAt`; encountering a search card does not count as viewing.
- **Mark** is your browsing decision: NONE, SKIP or SAVED. Opening or observing never overwrites it or its timestamp. Saved is a pre-application decision and may coexist with an application stage.
- **Application stage** is NONE, APPLIED, INTERVIEW, OFFERED or REJECTED. Each change appends `{stage, at}`; choosing the same current stage again adds no event. Arbitrary paths are allowed: direct rejection, interview then rejection/offer, returning to an earlier stage, or starting directly at Interview. No missing stages are inferred.
- Changing marks or viewing never changes application history. Memory's **No current stage** records a NONE event and preserves history; only **Remove record** deletes it. History survives reloads/restarts and never expires automatically. Canonical aliases merge their histories within the same platform.

## Floating action rail

The right-middle edge of the viewport has five compact, fixed 40 × 40 px square buttons. Copy uses a clipboard icon, Export a download icon, Mark a pencil, Filter a funnel, and Memory a gear; accessible names and hover tooltips identify each action. Submenu buttons are also square. There are no injected action bars inside cards or detail panels.

- **Copy JD** (blue) copies the active job as structured Markdown and shows “Copied” after success.
- **Export JD** (green download icon) downloads the same Markdown as `company-title-platform-jobId.md`.
- **Mark** opens a compact 3 × 2 grid of square buttons: **Skip / Saved / Applied / Interview / Offered / Rejected**. Selecting one closes it. The current stage appears in the submenu and tooltip; the pencil button has an A/I/O/R stage indicator. Browsing marks and stage selections highlight independently. Saved and application cards retain subtle outlines.
- **Filter** opens four independent toggle buttons to its left. Selected toggles have a blue state and a check: they indicate which types of jobs are shown. This menu stays open for repeated changes; Escape, clicking outside, or clicking Filter again closes it. The Filter tooltip reports loaded cards shown/hidden.

**Memory** is the fifth main button (gear icon). It opens the management page directly in a new tab, including when no job detail is active.

The rail acts on a full detail page or the active split-view detail pane. Without a parseable detail, Copy JD, Export JD and Mark are disabled; Filter remains available. Each job action reparses the active detail when clicked, and stale content during SPA transitions is withheld. Menus support native button keyboard navigation, visible focus, and Escape to close. On narrow viewports filter buttons shrink to keep the submenu on screen.

Copy/download include title, company, location, salary, posted date/age, canonical URL, platform-specific job ID, and the full visible description. Missing fields say “Not available.” Description paragraphs remain plain text inside structured Markdown. Expand any collapsed job description on the site first. Filenames remove filesystem-unsafe characters. Downloads use a temporary local Blob URL, without the downloads permission or a network request; Chrome chooses the destination according to your download settings. “Download started” confirms handoff to Chrome, not that the file has finished saving. Clipboard failures show an error rather than a success message.

**Clear mark** in Memory returns to NONE and preserves any unexpired viewed history. **Remove record** in Memory deletes marks, application history and viewed history, including all linked listing IDs. If clearing a mark leaves neither viewed nor application history, the empty record is discarded. Selecting a mark again is a new manual decision and restarts its mark retention timer.

## Search filters

| Filter | Default |
| --- | --- |
| Skip | Not selected (hidden) |
| Applications (Apps) | Selected (shown) |
| Saved | Selected (shown) |
| Viewed | Selected (shown) |

All four can be changed through the floating Filter menu or Memory settings. Select the types you want to see; deselect to hide them. These remain independent: a viewed Saved job requires both Viewed and Saved to be selected. Applications covers all four current application stages using the existing `hideApplied` preference. New jobs with no mark, stage or viewed history remain visible. Select all four to recover every hidden job; the separate Show Hidden override has been removed. Selections persist across pages and tabs. Existing preferences keep their filtering effect; only the UI meaning is inverted, so no data migration is needed. Internally the existing `hide*` preference keys are retained for compatibility. The Filter tooltip counts currently loaded cards, not total SEEK matches or unique opportunities.

Filtering uses reversible CSS classes, never removes site nodes. Settings and record changes propagate to other open job tabs through storage events. A single background writer serializes updates from all tabs.

## Independent retention

| Memory | Default | Retention anchor |
| --- | --- | --- |
| Viewed | 60 days | `lastViewedAt`: last actual detail opening |
| Skip | 60 days | `markChangedAt`: explicit mark assignment |
| Saved | Never | `markChangedAt` if configured finite |
| Applied / Interview / Offered / Rejected and all application history | Never (not configurable) | No automatic expiry |

Viewed, Skip and Saved each independently offer **30 / 60 / 90 / 180 days / Never** in Memory settings. Expiry is the anchor plus the selected number of 24-hour days, inclusive of the expiry boundary. Repeated search appearances, observations in another tab, and discovered listing aliases do not extend either timer. Reopening a detail refreshes viewed history only, never the mark timer.

Cleanup clears only the expired part. An expired Skip mark becomes NONE while recent viewed history remains. Expired viewed or Skip memory never removes application history. The record is deleted only when no mark, viewed history, stage or application history remains. The old finite `appliedDays` setting is retired and normalized to Never; even previously finite Applied records migrate before cleanup. Settings changes do not rewrite timestamps and affect the next cleanup, including cleanup performed when saving them. Shortening retention requires confirmation because it may immediately discard older memory. Extending a policy cannot recover information already removed.

Cleanup is opportunistic on background requests, including job-page load/pageshow, Memory opening/Refresh, and Clear expired memory. No scheduled task is installed; an idle tab need not update at the exact expiry instant.

## EasySeek Memory

Open **chrome://extensions → EasySeek → Details → Extension options**, or click **Memory (gear icon)** in the floating rail.

- Inspect every remembered opportunity: title, company, location, platform, source URL, mark, mark/view expiry, stage and linked listing IDs. Application rows show first Applied/Interview/Offered/Rejected dates and an expandable full event history.
- Choose **Applications & saved** to omit Viewed/Skip-only memory, then filter Saved, Applied, Interview, Offered or Rejected. Search title/company and combine mark/stage filters with Viewed/Not viewed. No marked date/expiry is shown for NONE; no viewed date is shown when viewing is unknown or expired.
- Choose a mark and **Apply**, including Clear mark. This changes only the explicit decision; it does not manufacture a viewing event.
- Set **Application stage** and click **Update progress**; No current stage preserves past events.
- **Remove record** deletes all memory for the opportunity after confirmation.
- Configure the three browsing retention policies and search filters independently.
- **Clear expired memory now** requires confirmation and preserves all unexpired information. Saved can expire if configured finite; applications never expire automatically. There is no bulk-delete applications action.

Records are sorted by latest mark change, stage change or view. Storage uses this Chrome profile only, not Chrome Sync. Uninstalling the extension removes its local memory.

## Applications CSV

**Export applications CSV** in Memory downloads `easyseek-applications-YYYY-MM-DD.csv` (UTC date). It includes all currently Saved jobs and all jobs whose current application stage is Applied, Interview, Offered or Rejected, independently of the screen's search/filter. Viewed/Skip-only records are excluded. A record reset to stage NONE stays in Memory with its history, but is exported only if still Saved.

Columns: Platform, Job ID, Title, Company, Location, URL, Saved At, Current Stage, Applied At, Interview At, Offered At, Rejected At, First Seen At, Last Viewed At, Application History, Linked Job IDs.

Dates use ISO 8601 UTC, with blank cells for unknown dates. Saved At is the first known Saved assignment; each stage date is its first recorded occurrence. **Application History** contains the full ordered JSON event list, so repeat applications, reversals and different funnel paths remain reconstructable; the date columns alone do not encode event order. Linked Job IDs contains the platform-specific alias IDs as JSON. No stage or timestamp is inferred from a later event.

CSV uses UTF-8 BOM and CRLF rows for Excel, quotes every cell, doubles embedded quotes and preserves commas/newlines. Potential spreadsheet formulas are prefixed with an apostrophe. There is no XLSX dependency. Downloading does not alter records, timestamps or history, send data anywhere, or store a JD. No chart or automatic downstream integration is implemented.

## Migration from earlier V1 versions

Migration is automatic and idempotent:

- Schema 2/3 APPLIED → browsing mark NONE plus stage APPLIED and one history event, using `markChangedAt` (including zero), then `updatedAt`, `lastSeenAt`, `firstSeenAt`, or migration time. Existing timestamps and IDs remain intact. Schema 4 migrations are idempotent.
- Existing SAVED, SKIP and Viewed records retain their state; Saved records gain their best known Saved date.
- PURSUE → SAVED, preserving the original decision date.
- SKIP → SKIP, preserving the original decision date.
- SEEN → NONE with viewed history, using the old status assignment timestamp as the best known viewing time.
- Earlier records without `statusChangedAt` use meaningful `manualAt` for explicit decisions, otherwise `updatedAt`, `lastSeenAt`, or `firstSeenAt`; if none exists, use migration time once.

Old SKIP/PURSUE records cannot reliably tell whether you opened the detail or merely saw a card. Migration does not invent viewed history for these records. Identity, linked IDs, title/company/city and observation timestamps are preserved. Missing new fields alone do not cause deletion; cleanup runs after migration under the current policies.

Configured `seenDays` becomes `viewedDays`, and `skipDays` is preserved. The old Hide Seen behavior is retired: Viewed starts selected (shown). Existing Skip visibility preference is retained. Saved retention defaults to Never; application retention is always Never. Their visibility controls start selected.

## Identity and schema

SEEK IDs come from `/job/12345678`; query/tracking parameters are ignored. Complete normalized company + city + title also links reposts with different IDs. Trailing Ltd/Limited and title hyphens are normalized, while seniority is preserved: `Xero Limited / Auckland Central / Full-Stack Engineer` becomes `xero|auckland|full stack engineer`. Software Engineer and Senior Software Engineer remain distinct.

Only explicitly recognized city names are collapsed. Unknown/missing location or company does not form a partial fallback key; use the SEEK ID instead. Within the same platform, identical complete canonical keys intentionally share memory, even if SEEK issued another ID. This heuristic cannot distinguish separate vacancies with identical company/city/title.

The versioned, plain-data record schema is used by the local applications CSV exporter without storing job descriptions:

```text
schemaVersion: 4
platform: seek | linkedin
canonicalKey: string (LinkedIn keys are prefixed with linkedin|)
seekIds: string[] (SEEK records)
linkedinIds: string[] (LinkedIn records)
url: canonical job URL (no tracking parameters), or empty when no ID exists
title, company, city, location: strings (older records may lack location)
mark: NONE | SKIP | SAVED
markChangedAt, savedAt: Unix milliseconds or null
applicationStage: NONE | APPLIED | INTERVIEW | OFFERED | REJECTED
applicationStageChangedAt: Unix milliseconds or null
applicationHistory: ordered {stage, at: Unix milliseconds}[]
lastViewedAt: Unix milliseconds or null
firstSeenAt, lastSeenAt, updatedAt: Unix milliseconds
```

Viewed state is derived from a non-null `lastViewedAt`. `lastSeenAt` is observation metadata, never a retention anchor. Clearing/expiring a mark may retain its historical `markChangedAt` while viewed memory remains; NONE has no active mark expiry. Only the current visible JD can be copied/downloaded as Markdown. Application CSV export is available in Memory; all-memory JSON export, sync integrations, and external tool calls are not implemented.

## Source and DOM maintenance

| File | Responsibility |
| --- | --- |
| `src/state.js` | Identity, schema migration, independent marks/views, application event history, filters and expiry. |
| `src/background.js` | Serialized local storage writes and cleanup. |
| `src/storage.js` | Content/options messaging client. |
| `src/seek-extractor.js` | Centralized SEEK selectors and card/detail recognition. |
| `src/linkedin-extractor.js` | Public/signed-in LinkedIn card and detail adapters, route validation. |
| `src/content.js` | Navigation, dynamic cards, filtering, automatic views. |
| `src/ui.js`, `src/styles.css` | Fixed floating rail, left-opening menus and feedback. |
| `src/jd.js` | Shared Markdown generation, safe filenames and temporary Blob downloads. |
| `src/applications.js` | Application stage dates, CSV formatting and explicit local download. |
| `options/` | Memory management and settings. |

Cards are recognized through `/job/{ID}` links inside semantic `article` elements or known job-card markers. A candidate must contain only one distinct job ID. Title/company/location use centralized `data-automation`/`data-testid` selectors and semantic heading links.

Details require a visible title and nonempty description in a shared container smaller than the whole document body, plus a route job ID. `data-job-id`, when present, must agree with that ID. Description text is used to recognize loaded/stale SPA content and for explicit Copy JD/.md actions; it is never persisted in extension memory. The previous unchanged detail is withheld during navigation. Exact reuse of identical DOM/content for another listing can require a refresh.

A debounced MutationObserver handles inserted/recycled cards and changed text/links. A lightweight 750 ms URL check catches History API navigation. Unrecognized cards are left alone; incomplete details are not recorded as viewed. If SEEK markup changes, update the selector table in `seek-extractor.js` and verify on a real page before broadening selectors.

## Tests and Chrome checklist

```powershell
node --test tests/state.test.cjs tests/management.test.cjs tests/jd.test.cjs tests/linkedin.test.cjs tests/applications.test.cjs
Get-ChildItem src\*.js, options\*.js | ForEach-Object { node --check $_.FullName }
```

`tests/browser.html` exercises real content/extraction/UI code with mocked extension storage: fixed rail placement, absence of inline controls, left-opening menus, dismissal, positive visibility filters, mark/view independence, aliases, malformed cards, SPA navigation, and copied/downloaded Markdown equality. Clipboard and download handoff are intercepted in this fixture; it does not write your clipboard or save a JD file. `tests/options-browser.html` loads the real Memory UI with mocked extension APIs to test search, filters, edits, clear/remove, browsing retention, application management/CSV export, and confirmation/cancellation. The options fixture requires Chrome's `--allow-file-access-from-files` flag for local fixture loading. These fixtures do not touch extension data.

Verified: 43 Node tests, JavaScript syntax checks, and four headless Chrome fixtures (SEEK, legacy LinkedIn, SDUI LinkedIn, Memory). The LinkedIn extractor also passed a local Chrome check against freshly retrieved public HTML: 60 result cards and one full detail with company/location/description. Live SEEK markup and real extension installation integration remain unverified in this environment; previous public SEEK requests returned a JavaScript/cookie challenge. Run these checks after reloading the unpacked extension:

1. Open a search on `https://nz.seek.com` and confirm one rail appears at the right-middle with Copy JD/Export JD/Mark disabled until a job is open. Confirm no inline action bars remain. Confirm Skip is unselected and Apps/Saved/Viewed are selected by default. Open a new job: it gains Viewed and remains visible.
2. Set Saved/Skip and Applied/Interview/Offered/Rejected using the menu. Confirm the correct label/outline and default filtering. Open each marked job and check its mark and marked date are unchanged.
3. Toggle each visibility option. Selecting all four should reveal every loaded card, including those matching multiple types. Use the Memory gear button to clear a hidden job's mark and confirm viewed history remains.
4. Test reposts/tracking URLs, dynamic cards, split details, and Back/Forward navigation. Confirm no duplicate controls.
5. Open Memory from both entry points. Combine mark/viewed filters, search, change and clear marks, remove a disposable record, and confirm updates reach an open SEEK tab.
6. Set Saved to finite retention and Viewed/Skip to Never, save, and confirm application history remains without expiry. Test shorter-policy confirmation and expired-memory cleanup with disposable data.
7. Copy JD, paste into a text editor, then download .md and compare the contents, metadata, and final description paragraph. Confirm the filename and that nothing is stored in extension memory. Test after changing the active job.
8. If upgrading, confirm old PURSUE becomes SAVED and old SEEN becomes viewed-only. Confirm old Applied migrates with its timestamp and no application is expired by its former finite policy.

## Extension icon

The blue magnifying-glass/check mark is an original, platform-neutral symbol for finding and selecting jobs. The editable vector is `icons/easyseek.svg`; Chrome uses the included 16, 32, 48 and 128 px PNG exports. The Memory tab also uses this icon. To rebuild the assets, run `python tools/generate_icons.py` with Pillow installed; this is optional development tooling and is not needed to load the extension.

## LinkedIn Jobs

Supported hosts are `www.linkedin.com`, `nz.linkedin.com`, and `linkedin.com`, over HTTPS. EasySeek runs job operations only under `/jobs` (including search, collections/recommendations with `currentJobId`, and full detail pages). Lightweight scripts load on these hosts to detect SPA navigation from the feed into Jobs, but do not inspect feed cards, send storage messages, or display the rail outside Jobs. No broad `*.linkedin.com` permission is requested.

The same five-button rail provides Copy JD, Markdown download, marks, visibility filters and Memory. Filters and retention settings are shared across platforms. Mark/viewed records are isolated by platform: a LinkedIn job with ID 123 never matches SEEK ID 123, and similar company/title/location across platforms do not automatically merge. Within LinkedIn, complete canonical metadata still recognizes reposts. The existing conservative NZ city normalization is retained; unknown/overseas locations use listing IDs rather than guessing cities.

LinkedIn URLs may be numeric (`/jobs/view/123/`), title slugs ending in an ID (`/jobs/view/engineer-at-company-123`), or split views (`/jobs/search/?currentJobId=123`). All normalize to `https://www.linkedin.com/jobs/view/123/`. Tracking parameters do not affect identity. Markdown labels the ID as LinkedIn rather than SEEK.

Existing schema-2 memory migrates to schema 4 with `platform: seek`; existing SEEK keys, IDs, browsing marks and timestamps stay unchanged; Applied becomes an application stage. Older V1 migrations still work. Memory displays each record's platform and linked IDs; editing/removing one platform's job does not affect the other.

### LinkedIn DOM assumptions and limits

Public cards use `.base-card` / `.base-search-card` and semantic `/jobs/view/` links. Signed-in cards use `.job-card-container` or result list items with `data-occludable-job-id`; the outer item is hidden so no empty wrapper remains. Public details use `.top-card-layout__title`, `.topcard__org-name-link`, and `.show-more-less-html__markup`; signed-in details use unified-top-card markers and `#job-details`/description content. SDUI cards instead use `componentkey="job-card-component-ref-{id}"` on button containers. SDUI details use `JobDetails_AboutTheJob_{id}` and the nearby `/jobs/view/{id}` title link, with no dependence on generated CSS class names. Only the AboutTheJob component supplies the JD; company descriptions and expand controls are excluded. Changes to component IDs are observed during SPA navigation. All selectors are centralized in the LinkedIn adapter.

A title and nonempty description must be visibly rendered in a shared detail container. Route IDs must agree with any job ID evidence on that container or title link. A stale detail during selection changes is withheld until it updates. Salary and posting age are optional; missing values say Not available. Only the rendered description is copied, so expand Show more yourself. No application buttons, native LinkedIn Save controls, messages, account settings or network APIs are operated by EasySeek. EasySeek marks are local and independent of LinkedIn's native Saved/Applied state.

Public markup was checked using a [LinkedIn NZ job search](https://www.linkedin.com/jobs/search/?keywords=software%20engineer&location=New%20Zealand) and one linked detail, with scripts/external assets removed for the local extraction test. The supplied saved SDUI page was also verified offline in Chrome with its original local CSS: 25 cards and the selected detail including the final description requirements. The original page is not included in this repository; `tests/linkedin-sdui-browser.html` uses a reduced structure with synthetic content and tests enabled actions, full JD copy/export, filtering and partial SPA updates. Live signed-in extension integration remains unverified; LinkedIn experiments may require selector maintenance. Feed-to-Jobs navigation, delayed descriptions, dynamic cards, mark/filter behavior and copy/download handoff are tested in `tests/linkedin-browser.html` without real account actions.

After upgrading, reload the extension and LinkedIn tabs. Open Jobs, select a role, verify the rail enables and records Viewed, then test Skip/Saved/Applied, selecting visibility types to recover hidden jobs, Copy JD and download, and Memory. Switch jobs and use Back/Forward; briefly return to the feed (rail should disappear), then Jobs again. Confirm older SEEK memory remains available. No LinkedIn login is performed by the extension.
