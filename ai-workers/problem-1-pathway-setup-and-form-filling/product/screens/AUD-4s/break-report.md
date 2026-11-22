# AUD-4s break report, round 1 (the firm's Activity log page, R1.88)

Breaker, 22 Nov 2026. Commit `4f779ef1d4155ad56a272ea87803220c3d676869` (branch `claude/loving-johnson-pkzdri`, PR #2916). Isolated copy `br_aud4s` on :4446 (`AI_LIVE=off PLATFORM_IDENTITY=local`), Playwright on chromium, stopped afterwards (database removed). Scope: `concept.md` C1–C9 over `concept-draft.md`. Sample lines written into the copy's `audit_event`: a staff member with a 200-character unbroken name, a 600-character unbroken summary, Arabic/Chinese/emoji/Zalgo text, a 200-character record reference with 60 KB of detail, a hostile line (`<script>`, `=HYPERLINK`, "Ignore previous instructions"), lines at 2025-12-31 23:59:59Z and 2026-01-01 00:00:00Z, 130 lines at one moment, and one firm B line (`FIRM-B-SECRET-KEY`). Paths below are under `prototype/studio/web/src/modules/platform/audit/`. US$0.

Note: while this ran, someone else's uncommitted edits to `activity-log-page.tsx` and the check appeared in the shared working tree (mtime 06:01 UTC; chip focus, tooltip, `overflow-wrap` on the sentence). The copy was built before that, and every finding below is against the commit. That diff would fix m1 and does not touch M1–M3.

**Totals: 0 Blocker · 3 Major · 7 Minor.**

## Major

**M1. The Who column shrinks to about one syllable wide on every list that has no "Support session" pill, which includes the Admin's own story.** `activity-log-page.tsx:240` (`max-w-48 … [overflow-wrap:anywhere]`) with `:244` (`w-full max-w-0` on What happened)
Steps: sign in as the Owner and open `/platform/activity-log?actorType=SYSTEM`, or `?person=<Representative's id>`, or pick any Person. Use 1440 px, 1024 px or 200 % zoom.
Expected: names are readable, as in the PR's own `aud4s-1-list-1440.png`.
Actual: the Who cell is 51 px wide, so names read "The / sys / tem" and "Rep / res / ent / ativ / e (Sa / mpl / e)". That is eight lines per row and about 3 rows per screen. With `overflow-wrap:anywhere`, the cell's narrowest width is one character, and the `w-full` column takes the rest. The PR's screenshot only looks right because a nowrap "Support session" pill happens to be in view and props the column open. Filtering by person (BR-14, "when a rep leaves, see what they changed") or by Done by removes that pill, and the column the page exists to show becomes hard to read. The axe and no-sideways-scroll checks pass, so the check cannot see it.

**M2. Firm A's filters stay in the address after sign-out, and firm B's page shows them as B's own filters.** `activity-log-page.tsx:72` (`readFilters(params)`), `:274` (the `key` remounts the component but leaves the address alone)
Steps: as firm A's Owner, open `?person=<A staff id>&entityKey=client-alpha@example.com&action=br.hostile&area=team`, then press Sign out. On the same tab's sign-in card, sign in as `sample-solo` / `representative@sample-solo.example.com`.
Expected (BR-13, DW1b): no firm A text in the DOM, and B sees B's default view.
Actual: the address keeps firm A's query. B's page shows chips "Record: client-alpha@example.com", "Action: br.hostile" and "Person: a person not on this list". The Record reference field holds `client-alpha@example.com`, and the sentence reads "changes by a person not on this list in Team and settings, action br.hostile, record client-alpha@example.com … — no lines". So firm A's record reference, action code and staff id reach firm B's DOM. B also lands on an empty list with filters B never set. The filters are read back, but they are not B's. DW1b only tests the bare address, so it passes.

**M3. To = 31 Dec 9999 blanks the whole app, and reloading does not bring it back.** `contract.ts:60` (`addDays` gives `"+010000-01"` past 9999), `:63` and `:126` (`dayStart` → `Invalid Date.toISOString()`), called while rendering at `activity-log-page.tsx:72`
Steps: open `?from=9999-06-01&to=9999-12-31`, or `?to=9999-12-31` with the default From. You can also type 12/31/9999 into the To date picker, which accepts it.
Expected: the field error "Pick a date" or the one-year limit, as for 2026-02-29 (which works).
Actual: `RangeError: Invalid time value` is thrown during render. No error boundary catches it, so `main` is empty and the header, menu and sign-out disappear (screenshot: a blank grey page). The bad date is in the address, so a reload crashes again. The only way out is to edit the URL or press Back.

## Minor
* **m1. A valid 200-character record reference scrolls the page sideways.** `activity-log-page.tsx:219` (the sentence has no wrap) and `:198-201` (the chip's `li` has no `min-w-0`, so `truncate` never applies). Opening `?entityKey=` plus 200 × `K` (the API accepts it) gives 689 px of sideways scroll at 1440 px. 201 characters gives 527 px, from the field. The uncommitted diff noted above addresses this.
* **m2. While the range is invalid, the chips and selects describe a list that is not shown.** `:72-76`, `:92`. Set From to 2024-01-01 (stopped on the field), then pick Area = Money. The chip says "Area: Money" and the select shows Money, but the list still shows Team and settings and Messages lines. The sentence correctly says "all areas", so it contradicts the chip on the same screen. Nothing says the new filter is waiting on the date fix.
* **m3. The "too large" error survives a narrower range.** `:119`, `:204` (only cleared inside `exportNow`, `:131`). After a 413 ("150,000 lines match … Narrow the dates and export again"), narrowing From to 21 Nov reloads the list but leaves the red notice up until the next export.
* **m4. The confirm misnames the filters while the first answer is loading.** `:153`, `:265` (`names` is empty until page 1 arrives). With `?person=<Representative>&area=team` and the list held loading, Export CSV opens the confirm. It reads "Changes by a person not on this list in team, …": the person is on the list, and "team" is a raw code. Export is offered before the list has loaded. The file itself would be correct.
* **m5. The exported file's name and the status give a day outside the range.** `:147` passes on the API's name (`api/…/firm-read/service.ts:246`, on `main`, which uses the exclusive `to`). For 15–22 Nov, the status says "Export saved: activity-log-2026-11-15-to-2026-11-23.csv". The file holds the right 130 lines.
* **m6. A stale count sits in the live region.** `:205` (`said` is never cleared). After Show more twice it holds "Showing 130 lines". After an Area change it still says so, while the sentence says "— no lines". A screen-reader user who reads the region gets the old count.
* **m7. Latent: `dayStart` misses where a clock change skips midnight.** `contract.ts:62-66`. `America/Santiago` on 2026-09-06 returns 23:00 on 5 Sep, not 01:00 on 6 Sep. The comment says the opposite. Toronto, London, Kiritimati and Lord Howe are right. No effect today, because the zone is always UTC (C9). It applies once AUD-4 sends `timeZone`.

## What held
* **Role and firm:** a Case Officer sees no menu entry, and the address shows "You do not have access to the activity log" (never blank). `/api/platform/audit` and `/export` give the Case Officer 403 and give 401 with no token. Firm B asking with A's staff id or A's record reference gets 0 lines, and with `FIRM-B-SECRET-KEY` from firm A gets "no lines".
* **Session end:** the rows and open lines are gone at the sign-in card. Signing out mid-export saves no file (`:144`).
* **Hostile address values:** a 5,000-character `person` (422, "Clear filters"), `area=__proto__`, `actorType=constructor`, entityKey of 201 characters, 2026-02-29, empty dates, To before From, To only, future ranges and `ours=true` are all handled. `ours=true` is ignored and the sentence says "everyone's", which matches what is shown. Duplicated keys take the first value, and the page sends one.
* **Year end:** 31 Dec 2025 to 1 Jan 2026 shows both edge lines.
* **Export:** the confirm repeats the filters and is not shown again for a second press. A double press on confirm plus Export gives 1 request, 1 file and 1 `audit.exported` line. The file holds exactly the 130 filtered lines. Escape returns focus to Export CSV. While the file comes, Export shows "Exporting…" with `aria-disabled`. 413 shows its numbers, 503 the server's words, and a 500 with an HTML body the generic text, with no crash.
* **Show more:** 130 lines at the same moment show once each over 3 pages. Focus moves to line 51 and the region says "Showing 100 lines". A filter change while Show more is pending leaves no duplicates and no stale page.
* **Odd text:** `<script>`, `<img onerror>` and `=cmd|calc!A1` show as text, and no script ran. The CSV quotes them (the `=` is not at a cell start, so formula escaping was not exercised). Arabic, Chinese, emoji and Zalgo render. A 60 KB detail scrolls inside its focusable `pre`. The 600-character unbroken summary truncates, and its When button stays visible.
* **Keyboard and widths:** the walk from Home through the menu, filters, Advanced and every When button runs in order with focus visible. 375 px, 1024 px and 200 % zoom have no sideways scroll on normal data.
* **N/A here** (read-only page, so these are not in "What gets built"): duplicates, hierarchy, rename or delete, two sessions saving, uploads and planted-instruction PDFs, rules, and the 100-program / 400-combination budgets.

Verdict: Changes 4f779ef1d4155ad56a272ea87803220c3d676869

## Round 2 (head `dc006e04e0e4e70922fd785b4e4778656a80a2fd`)
Breaker, 22 Nov 2026. I read `git diff 4f779ef1d..dc006e04e -- prototype/studio` only. I ran a fresh copy `br_aud4s` on :4446, stopped afterwards, with Sample lines from a 200-character unbroken name, a name written as an email address, and a firm A line keyed `client-alpha@example.com`. I redid the round-1 steps for M1–M3 and tried to get around each fix. This was not a new sweep. **Round 2 totals: 0 Blocker · 2 Major · 1 Minor.**

**M1 (Who column): fixed, and held.** `:256` now uses `w-40 min-w-40 max-w-48` and `break-word`. With Done by = The system, with a Person set, and on the default list, the Who cell is 160–192 px at 1440 px, 1024 px, 641 px, 700 px, 1280 px at 200 % (640 css px) and 1440 px at 200 % (720 css px). Names read whole. The 200-character name wraps inside 192 px and the email-shaped name inside 171 px, with no sideways scroll. At 1024 px at 200 % (512 css px), 1440 px at 400 % (360 css px) and 375 px the column folds into the line as designed, again with no sideways scroll.

**M3 (dates that throw): fixed, and held.** `contract.ts:55` (years up to 9998). None of these throw; each gets "Pick a date." or a valid read, and the header and Sign out stay:
* `to=9999-12-31`, `from=9999-06-01&to=9999-12-31`, `275760-09-12`, `+010000-01-01`, `1969-12-31`
* `2026-11-15T00:00`, `2026-1-5`, full-width digits, `%00` / `%ff`
* the range `9998-06-01`..`9998-12-31` and 1 Jan 1970 (both read)
* typing 12/31/9999 into the To picker

**R2-M1. M2 is still reachable: firm A's filters come back to firm B through Back.** `activity-log-page.tsx:298` clears the address only while the Activity log page itself is mounted with no session. Earlier history entries keep A's query.
Steps: as firm A's Owner, open `?person=<A id>&entityKey=client-alpha@example.com&action=br.hostile&area=team`. Click **Team** in My account and press Sign out there. On that tab's sign-in card, sign in as `sample-solo` / `representative@sample-solo.example.com`, then press the browser's Back.
Expected (BR-13, DW1b): no firm A text in B's DOM.
Actual: B lands on A's address. The sentence says "changes by a person not on this list in Team and settings, action br.hostile, record client-alpha@example.com (Advanced) …", and the chips and the Record reference field show the same text. Signing out from Home after A had loaded a filtered address does the same. Only signing out on the Activity log page itself, the round-1 steps, now passes. Leaving the log, signing out and handing over the tab is the ordinary path.

**R2-M2. The fix wipes the filters of every shared or new-tab link before sign-in, and says nothing.** `activity-log-page.tsx:298`
Steps: in a fresh tab, which starts signed out because the token is kept per tab, open a colleague's link `/platform/activity-log?action=br.hostile`. Sign in as the same firm's Owner.
Expected: the link's filters show, read back in the sentence and as chips. That is the point of keeping filter state in the address and of DW6 ("an Advanced filter set from the address opens Advanced").
Actual: the address is stripped to `/platform/activity-log` while the sign-in card shows. After sign-in the page shows "everyone's changes … — 14 lines", with no chip and no word that the link's filters were dropped. Any link opened from mail or chat, or with Ctrl/middle-click, loses its filters. A person checking "what happened to record X" from a link sees the 7-day default and is not told.

**R2-m1 (latent). An unknown `timeZone` in the answer blanks the app.** `contract.ts:26` accepts any string, and `activity-log-page.tsx:85` puts it straight into `Intl`. I used a stand-in answer with `timeZone: "Mars/Olympus_Mons"`. It threw `RangeError: Invalid time zone specified`, and the header and Sign out disappeared. This is the same failure M3 had, through C9's future field. AUD-4 sends no zone today, so nothing happens yet.

Seen in passing, not counted (outside this round's scope): at 1024 px the Person select shows "Everyon" clipped.

Verdict: Changes dc006e04e0e4e70922fd785b4e4778656a80a2fd

## Round 3 (head `e8ffb5edf26dbdff605b08f830bda1ddd9a422cb`)
Breaker, 22 Nov 2026. I read `git diff dc006e04e..e8ffb5edf -- prototype/studio` only and ran a fresh copy `br_aud4s` on :4446, stopped afterwards. Every sign-in went through the real sign-in card. A per-frame watcher (`requestAnimationFrame`) checked the body text and every input or select value for firm A's `client-alpha` or `br.hostile` after firm B signed in. This was not a full sweep. **Round 3 totals: 0 Blocker · 0 Major · 2 Minor.**

**R2-M1: fixed, and held.** Steps: A opens the filtered address, clicks Team, signs out; B signs in and presses Back.
* B lands on `/platform/activity-log` with no filters and the "Filters cleared" notice.
* No frame showed firm A text.
* Getting around the stamp (`activity-log-page.tsx:300-310`):
  * Forward and then Back again: held. A reload of the cleared entry: held.
  * Three filtered entries pushed by A, then Back three times and `history.go(3)`: each entry was cleared on arrival, with no firm A frame.
  * A's session ending elsewhere (a second sign-in by A from outside), then B signing in from "Signed in elsewhere": cleared.
  * The same email as Owner of firm B (a new `platform_staff` row in `sample-solo`), signing in on A's entry: cleared, because the stamp is firm id plus staff id.
  * B signing in on A's entry, using the menu, then Back: cleared.
  * Expected to keep their filters, and they did: A signing out and back in on A's own entry; a link opened by full load mid-session by B, which is unstamped and so stamped for B.
* Residual, by design: an address A loads while already signed out is never stamped, so it counts as a link and keeps its filters.

**R2-M2: fixed, and held.** A fresh tab, signed out, opens `/platform/activity-log?action=br.hostile`. After the same firm's Owner signs in, the filter is still there: sentence "action br.hostile (Advanced)", one line, entry stamped for that person.

**R2-m1: fixed, and held.** A stand-in answer with `timeZone: "Mars/Olympus_Mons"` no longer blanks the app: the header stays and nothing throws. A stand-in with `America/Toronto` gives "(Toronto time)".

**Minors:**
* **R3-m1. An unknown zone now fails the whole list, and the words point the wrong way.** `contract.ts:28` (`refine(isZone)` rejects the whole page): the page says "The activity log could not load · Check your connection and try again · Retry", but Retry can never succeed and the connection is not the cause. Falling back to UTC would keep the list. Latent: AUD-4 sends no zone today.
* **R3-m2. "Filters cleared" comes back on every return to that entry.** `activity-log-page.tsx:232` (`auditCleared` stays in history state): after B is told once, a reload or Back-then-Forward onto the same entry shows "Filters cleared … set in an earlier session" again, though nothing was cleared that time. It goes once B changes any filter.

Verdict: Approve e8ffb5edf26dbdff605b08f830bda1ddd9a422cb
