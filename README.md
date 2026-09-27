# EasySeek V1

A lightweight Manifest V3 Chrome extension for SEEK New Zealand browsing. It remembers which jobs you viewed and lets you mark opportunities **Saved**, **Applied**, or **Skip**, while keeping SEEK's own search and detail UI.

Plain JavaScript and CSS, no build step or dependencies. All data stays in `chrome.storage.local` in this Chrome profile. No backend, accounts, cloud sync, analytics, network requests, crawling, application automation, or messages. Full job descriptions are never stored. Career Ops Markdown copying and clipboard permission have been removed; export/sync are not implemented.

## Install or update

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select the folder containing `manifest.json` (`F:\code\EasySeek`).
3. For an existing installation, click **Reload** on EasySeek. Reload open SEEK tabs and the Memory page so they use the new scripts.

Supported hosts: production SEEK New Zealand at `https://nz.seek.com`, plus the legacy `https://seek.co.nz` and `https://www.seek.co.nz` domains. The extension recognizes search cards, `/job/{numeric ID}` details, and split views with a numeric `jobId` query parameter. Other countries/subdomains are not enabled. Content scripts match all paths on these three hosts for client-side navigation, but add UI only to recognized cards/details.

Version **1.2.1** adds `https://nz.seek.com/*` support. Chrome may request approval for this additional site access when updating. Reload the extension and your SEEK tabs after updating.

Runtime host validation and canonical URL generation live in `src/state.js` (`seekOrigins`, `isSeekUrl`, `canonicalUrl`). The background worker and extractor reuse these helpers. Manifest match patterns must remain declarative; a test checks that they match the shared origin list. Only the listed HTTPS origins are accepted, not unrelated hosts or lookalike subdomains.

Newly recorded or observed jobs use `https://nz.seek.com/job/{id}` as their canonical URL. Existing legacy URLs remain valid: identity is based on SEEK IDs/canonical keys, not the domain or tracking parameters. Existing marks, marked dates and viewed history are preserved. An existing record's URL is updated when its job is next observed; no destructive migration is needed.

## Viewed history and user marks

These are independent concepts:

- **Viewed** means a detail page successfully rendered a title and description. Opening it updates `lastViewedAt`; encountering a search card does not count as viewing.
- **Mark** is your explicit decision: NONE, SKIP, SAVED, or APPLIED. Opening or observing the job never overwrites the mark or its timestamp.

Each card/detail has one compact mark control. Click it to open **Saved / Applied / Skip / Clear mark**. The control reflects the current mark; Saved and Applied cards also have distinct outlines. A separate Viewed label indicates browsing history. The menu supports normal keyboard navigation and Escape to close; clicking outside closes it.

**Clear mark** returns to NONE and preserves any unexpired viewed history. **Remove record** in Memory deletes both the mark and viewed history, including all linked listing IDs. If clearing a mark leaves no viewed history, the empty record is discarded. Selecting a mark again is a new manual decision and restarts its mark retention timer.

## Search filters

| Filter | Default |
| --- | --- |
| Hide Skip | On |
| Hide Applied | Off |
| Hide Saved | Off |
| Hide Viewed | Off |

All four can be changed in the search strip or Memory settings. Any enabled matching filter can hide a card: for example Hide Viewed can hide a viewed Saved job even when Hide Saved is off. **Show Hidden** temporarily overrides every filter so you can inspect and change hidden jobs. It resets on navigation and is not stored. Counts refer to currently loaded cards, not total SEEK matches or unique opportunities.

Filtering uses reversible CSS classes, never removes SEEK nodes. Settings and record changes propagate to other open SEEK tabs through storage events. A single background writer serializes updates from all tabs.

## Independent retention

| Memory | Default | Retention anchor |
| --- | --- | --- |
| Viewed | 60 days | `lastViewedAt`: last actual detail opening |
| Skip | 60 days | `markChangedAt`: explicit mark assignment |
| Saved | Never | `markChangedAt` if configured finite |
| Applied | Never | `markChangedAt` if configured finite |

Each policy independently offers **30 / 60 / 90 / 180 days / Never** in Memory settings. Expiry is the anchor plus the selected number of 24-hour days, inclusive of the expiry boundary. Repeated search appearances, observations in another tab, and discovered listing aliases do not extend either timer. Reopening a detail refreshes viewed history only, never the mark timer.

Cleanup clears only the expired part. An expired Skip mark becomes NONE while recent viewed history remains. Expired viewed history does not remove an unexpired Saved/Applied/Skip mark. The record is deleted only when neither a mark nor viewed history remains. Settings changes do not rewrite timestamps and affect the next cleanup, including cleanup performed when saving them. Shortening retention requires confirmation because it may immediately discard older memory. Extending a policy cannot recover information already removed.

Cleanup is opportunistic on background requests, including SEEK load/pageshow, Memory opening/Refresh, and Clear expired memory. No scheduled task is installed; an idle tab need not update at the exact expiry instant.

## EasySeek Memory

Open **chrome://extensions → EasySeek → Details → Extension options**, or click **Manage EasySeek** in the search strip.

- Inspect every remembered opportunity: title, company, city, mark, marked date, mark expiry, last viewed date, viewed expiry, and linked SEEK IDs.
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

Configured `seenDays` becomes `viewedDays`, and `skipDays` is preserved. The old Hide Seen behavior is retired: Hide Viewed starts off. Existing Hide Skipped preference is retained. New Saved/Applied retention defaults to Never and their filters start off.

## Identity and schema

SEEK IDs come from `/job/12345678`; query/tracking parameters are ignored. Complete normalized company + city + title also links reposts with different IDs. Trailing Ltd/Limited and title hyphens are normalized, while seniority is preserved: `Xero Limited / Auckland Central / Full-Stack Engineer` becomes `xero|auckland|full stack engineer`. Software Engineer and Senior Software Engineer remain distinct.

Only explicitly recognized city names are collapsed. Unknown/missing location or company does not form a partial fallback key; use the SEEK ID instead. Identical complete canonical keys intentionally share memory, even if SEEK issued another ID. This heuristic cannot distinguish separate vacancies with identical company/city/title.

The versioned, plain-data record schema is suitable for a later JSON/CSV exporter without storing job descriptions:

```text
schemaVersion: 2
canonicalKey: string
seekIds: string[]
url: canonical SEEK URL (no tracking parameters), or empty when no ID exists
title, company, city: strings
mark: NONE | SKIP | SAVED | APPLIED
markChangedAt: Unix milliseconds or null
lastViewedAt: Unix milliseconds or null
firstSeenAt, lastSeenAt, updatedAt: Unix milliseconds
```

Viewed state is derived from a non-null `lastViewedAt`. `lastSeenAt` is observation metadata, never a retention anchor. Clearing/expiring a mark may retain its historical `markChangedAt` while viewed memory remains; NONE has no active mark expiry. There are no export buttons, sync integrations, or external tool calls in this version.

## Source and DOM maintenance

| File | Responsibility |
| --- | --- |
| `src/state.js` | Identity, schema migration, independent marks/views, filters and expiry. |
| `src/background.js` | Serialized local storage writes and cleanup. |
| `src/storage.js` | Content/options messaging client. |
| `src/seek-extractor.js` | Centralized SEEK selectors and card/detail recognition. |
| `src/content.js` | Navigation, dynamic cards, filtering, automatic views. |
| `src/ui.js`, `src/styles.css` | Compact mark menus, filters and feedback. |
| `options/` | Memory management and settings. |

Cards are recognized through `/job/{ID}` links inside semantic `article` elements or known job-card markers. A candidate must contain only one distinct job ID. Title/company/location use centralized `data-automation`/`data-testid` selectors and semantic heading links.

Details require a visible title and nonempty description in a shared container smaller than the whole document body, plus a route job ID. `data-job-id`, when present, must agree with that ID. Description text is read only to recognize loaded/stale SPA content; it is not stored or copied. The previous unchanged detail is withheld during navigation. Exact reuse of identical DOM/content for another listing can require a refresh.

A debounced MutationObserver handles inserted/recycled cards and changed text/links. A lightweight 750 ms URL check catches History API navigation. Unrecognized cards are left alone; incomplete details are not recorded as viewed. If SEEK markup changes, update the selector table in `seek-extractor.js` and verify on a real page before broadening selectors.

## Tests and Chrome checklist

```powershell
node --test tests/state.test.cjs tests/management.test.cjs
Get-ChildItem src\*.js, options\*.js | ForEach-Object { node --check $_.FullName }
```

`tests/browser.html` exercises real content/extraction/UI code with mocked extension storage: menus, dismissal, all filters, Show Hidden, mark/view independence, aliases, malformed cards, and SPA navigation. `tests/options-browser.html` loads the real Memory UI with mocked extension APIs to test search, filters, edits, clear/remove, all four policies, and confirmation/cancellation. The options fixture requires Chrome's `--allow-file-access-from-files` flag for local fixture loading. These fixtures do not touch extension data.

Verified: 21 Node tests, JavaScript syntax checks, and both headless Chrome fixtures. Live SEEK markup and real extension installation integration remain unverified in this environment; previous public SEEK requests returned a JavaScript/cookie challenge. Run these checks after reloading the unpacked extension:

1. Open a search on `https://nz.seek.com` and confirm the EasySeek strip and mark controls appear. Confirm only Hide Skip is enabled by default. Open a new job: it gains Viewed and remains visible.
2. Mark Saved, Applied, and Skip using the menu. Confirm the correct label/outline and default filtering. Open each marked job and check its mark and marked date are unchanged.
3. Toggle each filter. Show Hidden should reveal every loaded card, including those matching several filters. Clear a hidden job's mark and confirm viewed history remains.
4. Test reposts/tracking URLs, dynamic cards, split details, and Back/Forward navigation. Confirm no duplicate controls.
5. Open Memory from both entry points. Combine mark/viewed filters, search, change and clear marks, remove a disposable record, and confirm updates reach an open SEEK tab.
6. Set Saved/Applied to finite retention and Viewed/Skip to Never, save, and inspect both expiry dates. Test shorter-policy confirmation and expired-memory cleanup with disposable data.
7. If upgrading, confirm old PURSUE becomes SAVED and old SEEN becomes viewed-only. Confirm there is no Career Ops copy control or clipboard permission.
