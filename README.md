# EasySeek V1

A lightweight Manifest V3 Chrome extension that adds short-term browsing memory to SEEK New Zealand. Keep using SEEK's own search results and job details: hide reviewed or skipped jobs, highlight roles to pursue, and copy the current job for Career Ops.

No build step, dependencies, backend, account, analytics, network requests, crawler, or application automation. Data stays in `chrome.storage.local` in this Chrome profile. Full descriptions are extracted only for the current detail view and are never persisted.

## Install

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Choose **Load unpacked** and select this folder, `F:\code\EasySeek` (the folder containing `manifest.json`).
3. Open or reload a SEEK NZ search page. Existing SEEK tabs need a reload after installation or extension updates.

Supported hosts are exactly `https://www.seek.co.nz` and `https://seek.co.nz`. Search results, `/job/{numeric ID}` detail pages, and search/detail split views with a numeric `jobId` query parameter are supported when the DOM clues below are present. No other SEEK countries or subdomains are enabled. The script matches all paths on these two hosts to support client-side navigation; UI is only added to recognized job cards/details.

## Use

The small **EasySeek** strip above results has **Hide Seen** and **Hide Skipped**, both on by default, and **Show Hidden**. Counts describe currently loaded DOM cards, not all matches or unique opportunities. Hide preferences persist across tabs/reloads; Show Hidden is temporary and resets on navigation.

| State | Behavior |
| --- | --- |
| NEW | No remembered record; shown normally. |
| SEEN | A successfully rendered detail page was opened; hidden when Hide Seen is on. |
| SKIP | Explicit decision; hidden when Hide Skipped is on. Opening it preserves SKIP. |
| PURSUE | Explicit decision; always visible with a green outline and badge. Opening it preserves PURSUE. |

Use **Skip**, **Pursue**, or **Reset** on cards or details. Show Hidden reveals hidden cards with state badges and Reset controls. Hiding uses a reversible CSS class, never deletes SEEK's cards. Reset clears the whole remembered opportunity, including linked listing IDs. Reset on an already open detail stays NEW for that visit; leaving and reopening it can mark it SEEN again.

The background worker serializes writes from all tabs. Automatic SEEN/observation updates preserve explicit decisions. Storage changes update other open SEEK tabs.

## Identity and retention

SEEK IDs are extracted from `/job/12345678`; tracking parameters do not affect identity. Complete company + city + title metadata also links reposts with different IDs. Company normalization trims a trailing Ltd/Limited, title normalization treats hyphens as spaces, and seniority is preserved. Thus `Xero Limited / Auckland Central / Full-Stack Engineer` becomes `xero|auckland|full stack engineer`. Software Engineer and Senior Software Engineer remain distinct.

Only explicitly recognized city names are normalized; unknown locations, remote-only text, and missing fields do not create a fallback key. Those listings use their ID instead of risking unrelated matches. Different jobs with an identical complete canonical key intentionally share a decision, as requested. This heuristic cannot distinguish separate vacancies with identical company/city/title.

Records contain canonical key, linked SEEK IDs, title, company, city, status, timestamps, and the latest manual-action timestamp. SEEN/SKIP expire after **60 days since lastSeenAt**, including at the exact 60-day boundary. Encountering a remembered card, even one hidden by filters, or opening its detail refreshes lastSeenAt. Merely leaving a tab open does not continuously refresh it. PURSUE never expires automatically. Cleanup runs on worker requests (including SEEK load/pageshow); there is no scheduled task.

Removing the extension clears its local storage. Chrome profile sync is not used. Stored decisions can be inspected in the extension service worker console with `chrome.storage.local.get(null).then(console.log)`.

## Career Ops

On a loaded detail, click **Analyze with Career Ops**. It copies Markdown containing title, company, location, salary, posted age/date, SEEK ID, canonical URL, the full rendered description text, and the requested analysis checklist. Missing optional fields say “Not available.” A successful write displays **Copied for Career Ops**; a failed write displays an error. Paste it into your existing Career Ops workflow yourself.

It never opens or contacts Career Ops. Description formatting becomes readable plain text within Markdown. Expand any collapsed description in SEEK first; extraction reflects the currently rendered visible text. Clipboard write permission is used only on the explicit button click. Other permissions are limited to local storage and content-script access to the two SEEK NZ hosts.

## Source and maintenance

| File | Responsibility |
| --- | --- |
| `src/seek-extractor.js` | All SEEK selectors, card/detail extraction, Markdown generation. |
| `src/state.js` | Pure identity, transitions, deduplication and expiry. |
| `src/background.js` | Serialized storage writes and opportunistic cleanup. |
| `src/storage.js` | Content-script messaging client. |
| `src/content.js` | Dynamic DOM processing, navigation, filtering and actions. |
| `src/ui.js`, `src/styles.css` | Small accessible controls, badges and feedback. |

DOM assumptions are centralized in `EasySeekExtractor.selectors`:

- Cards have `/job/{ID}` anchors inside an `article`, `data-testid="job-card"`, or `data-automation="normalJob"/"premiumJob"`. A card must contain only one distinct job ID. Title prefers `jobTitle`, then semantic heading links. Company/location prefer `jobCompany`/`jobLocation`.
- Detail titles prefer `job-detail-title` (or a visible `h1` on a standalone detail URL). Descriptions use `jobAdDetails`, `job-description`, or `jobDescription` markers. Both must be visible and share a container smaller than the whole document body. Metadata is scoped to that container, using `advertiser-name`, `job-detail-location`, `job-detail-salary`, and `jobListingDate` alternatives in the selector table.
- A rendered detail requires a route ID and nonempty title/description. If `data-job-id` is present, it must agree with the route. During SPA navigation the previous unchanged detail is withheld until new content appears. If SEEK reuses the exact same elements and identical text for a different listing, a page refresh may be needed to resolve this conservative guard.
- A debounced MutationObserver handles inserted/recycled cards and changed text/links. A lightweight 750 ms URL comparison catches History API navigation from the page's isolated execution world. No page navigation, network fetching, or background scraping is performed.

If SEEK changes markup, edit the extractor selectors and test the actual page before adding broader selectors. Unrecognized cards are left alone; failed/missing details are not marked SEEN. Search controls remain outside hidden cards.

## Verification

Run the dependency-free state and worker tests:

```powershell
node --test tests/state.test.cjs
Get-ChildItem src\*.js | ForEach-Object { node --check $_.FullName }
```

Open `tests/browser.html` in Chrome to run a self-contained DOM fixture. The report below the sample jobs becomes PASS or FAIL. It uses the real extraction/content/UI scripts with mocked Chrome storage and clipboard APIs; it does not change extension storage or your clipboard. This covers hiding/recovery, actions, dynamic reposts, malformed cards, SPA navigation, manual Reset, and clipboard success/failure handling.

Verified during implementation: all 9 Node tests and JavaScript syntax checks passed; the DOM fixture passed in headless Chrome. **Live SEEK DOM compatibility and real extension clipboard/storage integration remain unverified:** the public SEEK request returned a JavaScript/cookie verification challenge. Fixture success is not a substitute for the live checks below. The Manifest V3 content-script arrangement follows [Chrome's official documentation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).

### Chrome acceptance checklist

1. Load unpacked, open a SEEK search, and confirm a new job is visible with NEW and the EasySeek strip appears.
2. Open the job and wait for its description; return to search and confirm it is hidden. Reload and repeat in another search/tab.
3. Enable Show Hidden, confirm SEEN, and Reset it. Turn Show Hidden off; it should remain visible.
4. Skip a job. Confirm it hides, including in another search and with a changed tracking URL. Use Show Hidden to recover it.
5. Pursue a role. Confirm it remains visible and marked, including after opening/reloading its detail.
6. Check an available repost with the same company/city and hyphen/space title variation shares state; a different seniority title must not. Missing company/location should still match by ID.
7. Load additional cards or change searches without refreshing; confirm actions/filtering appear without duplicates. Try the split detail view and browser Back/Forward.
8. On a full detail click Analyze with Career Ops and paste into a text editor. Confirm the final paragraph, metadata, canonical URL, and analysis checklist are included. No external application should open.
9. For a disposable record, use the service-worker console to set `lastSeenAt` to `Date.now() - 61 * 86400000`, then reload SEEK. SEEN/SKIP should disappear from storage; PURSUE should remain. Automated tests also cover the exact expiry boundary.

V1 intentionally includes no dashboard, alerts integration, cloud sync, AI calls, job archive, or application automation.
