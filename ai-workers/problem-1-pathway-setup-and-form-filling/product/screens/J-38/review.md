# J-38 review: the journey test for time zones and calendar invite files (PR #2247)

Reviewer (did not build it), 19 Nov 2026. Commit `e62731483` (branch `claude/happy-archimedes-yriznu`), diff `origin/main..e62731483`: `tests/journeys/j_38.ts` (new), `qa/built/J-38.md`, five screenshots. No product code. This is a test-only J-row, so it is judged as a journey test against `lead-b-briefs/J-rows.md` (shared brief plus §J-38) and BACKLOG row J-38, not with the D1–D20 screen dimensions or the BIC table. Isolated copy `j38` on :4438 (runtime range), never :4400. Live AI off, US$0.

**Verdict: Approve** (no open Blocker or Major). Three Minor items below; none blocks the merge.

## What I ran
| Run | Result |
|---|---|
| Header line as written (`isolated.sh j38 4438 start --ttl 30 && … tsx … j_38.ts j38 4438`), fresh copy | 22/22, exit 0, 13.6 s; moment walked 2026-11-20T15:00Z = 10:00 Toronto (EST) = 19:00 Dubai |
| Same kept copy, re-run about 12 times (mutations below) | every clean run 22/22; a new firm key per run, so nothing collides |
| Visible browser: `HEADED=1 xvfb-run -a tsx … j_38.ts j38 4438` | 22/22 (the builder could not run headed; this covers "passes in a visible browser") |
| Paging: scratch copy with the 26 h margin raised to 15 days and to 45 days | 22/22 each: Next month once (4 Dec 2026), twice and across the year (4 Jan 2027) |
| Summer and the DST week: scratch copy, start after Fri 12 Mar 2027 16:00Z (Toronto changes on Sun 14 Mar), then after 30 Apr, `windowDays: 240`, 9 turns | 22/22 each: Mon 15 Mar 14:00Z (EDT) = 18:00 Dubai, "6:00 p.m. (Asia/Dubai)"; 30 Apr likewise |
| `walk.mjs j_38` (pre-installed browsers via a scratch `PLAYWRIGHT_BROWSERS_PATH` with symlinks, nothing installed) | 22 PASS, 0 FAIL, exit 0, 1 trace, 34 step screenshots, 5 journey shots; 0 video (ffmpeg 1011 present, Playwright wants 1013: environment) |
| `graph.mjs --check` | G1 0 · G2 0 · G4 0 · G5 0 |

Scratch test copies were untracked files deleted after use; every product mutation was reverted with `git checkout --`.

## 1. W1–W5 against the brief, and mutations (each on the API, copy restarted, then reverted)
| Mutation | Lines that FAIL |
|---|---|
| M1 host mail in the booker's zone (`hostWhen = wallLabel(b.startsAt, zone)`) | :157 W3 reads 10:00 a.m. (Toronto); :158 W3 no other zone. 20/22 |
| M2 DTSTART +1 h (`ics.ts`) | :172-173 W4 ×3 (booker mail, host mail, Add to calendar). 19/22 |
| M3 manage link dropped from the booker's mail | :181 W5 link; :189 W5 opens own page (`state: bad-link`). 20/22 |
| M4 booker's mail in the firm's zone | :155 W2 reads 7:00 p.m. (Dubai); :156 W2 no other zone. 20/22 |
| M5 DTSTART as `TZID=America/Toronto` local time | :172-173 W4 ×3 (only the UTC `Z` form is read as an instant). 19/22 |
| M6 DTEND 60 min | :172-173 W4 ×3. 19/22 |
| M7 `mail: fakeMail()` in `runtime-ports.ts` (the DW1 swap undone) | :149 DW1 (`outbox: [], inbox: [0,0]`) plus W2–W5 (11 FAIL). 11/22 |
| M8 booker's mail states both zones | :156 W2 no other zone. 21/22 |
| M9 host mail carries a manage link | :182 W5 host has no booker link. 21/22 |

W1 (Dubai browser books 10:00 Toronto by screens, plus the database row), W2 (7:00 p.m. Asia/Dubai, 6:00 p.m. in summer, both run), W3 (10:00 a.m. America/Toronto in subject and text), W4 (UTC instant, 30 min, one UID, REQUEST, from all three sources) and W5 (link in the booker's mail opens the manage page with Reschedule) each match the brief's words, and every judge I broke failed.

## 2. Weakened, vacuous or circular?
None found. Expected values are plain UTC sums plus `Intl` for which UTC hour is 10:00 in Toronto (:102, :111), never `wallLabel`/`whenWords`/`inviteUid`; the UID is built from the database row id (:169). A missing mail cannot pass: :156, :158 and :182 guard with `!!mail`, :176 with `length > 0`, and `inbox()` (:44-52) returns short after 90 s so DW1 and W2 fail with what arrived (M7 shows it). No `.catch(() => undefined)` after a wait. The fixed 3.5 s pause (:136) is above the form's `MIN_FILL_MS = 3_100` (`type-page.tsx:18`) and is commented.

## 3. Rot and flake
The day is found at run time (first offered 10:00 Toronto at least 26 h ahead; min notice and the self-service limit are 240 min, window 60 days), so the date does not go stale; month ends, year end, the DST week and EDT all pass (table above). Late on a Friday it rolls to Monday. The en-CA "p.m." wording is hard-coded through `clock12` (:57) and U+00A0/U+202F/U+2009 are folded (:54), so a CLDR wording change fails loudly rather than passing. `Date.parse("20 November 2026 12:00 UTC")` (:110) relies on V8's lenient parser: stable in Node. Small race: Minor m1.

## 4. walk.mjs and record.ts
`copyOf` reads the header: `{ name: 'j38', port: '4438', extra: ['--ttl','30'] }`; `WALK_BOARD=0` (the file names chromium). Under `record.ts` the run is 22/22 with a trace and step screenshots. Five "no screenshot for step n: page closed" lines come from axe's own short-lived page being in record.ts's page list: harmless, and record.ts's matter, not this file's.

## 5. Rules
No personal names ("Ana Sample" is the placeholder other tests use), no immigration values, no keys. Only new files plus `qa/built/J-38.md`; no builder-forbidden file. Port 4438 is in the runtime range. Token printing: Minor m3.

## Findings
**Blocker:** none. **Major:** none.

* **m1 (Minor) `j_38.ts:114` and `:130`:** `count()` right after clicking a day reads the times list without waiting for it to redraw. If React has not flushed yet, :114 skips a good day (a later day is walked) and :130 can FAIL falsely. Fix: `await p.locator("[data-day-times] h3", { hasText: label }).waitFor()` after each day click, before `count()`.
* **m2 (Minor) W2–W4 have no screenshot (brief: "a screenshot per step"):** the booking mails are in `GET /api/demo/platform-inbox` only; the `/inbox` screen (`web/src/runtime/link-page.tsx:178`) reads `/demo/inbox` (person-link messages) and never shows them. §J-38 names "FO-3w plus the demo inbox" as the screen. This is not the builder's to build (shared brief: a missing part is asked about, not built). Fix: add it to the PR's Questions ("the platform demo inbox has no screen; W2–W4 are read through its API") so the Lead can route it.
* **m3 (Minor) `j_38.ts:163` and `:155`, the manage token in walk records:** line 180 says "the token is never printed", but the "Add to calendar" `fetch` puts `/api/public/bookings/<token>/ics` into `record.ts`'s `requests.jsonl` and `steps.jsonl` (seen in the walk above, then deleted), which `walks.yml` uploads as an artifact. The W2 PASS detail (`bookerText.slice(0, 260)`) stops 7 characters before the `#` with the shortest month and weekday ("Sunday, May 1, 2026"). The copy is Sample and dropped at stop, so nothing real leaks, but the comment overstates it. Fix: click "Add to calendar" and read the download (`p.waitForEvent("download")`, also closer to a person), and print `bookerText.replace(/#\S+/, "#<token>")`.

## Journey score (reviewer role; the one score for this check)
Journeys walked: the main path W1–W5 (Dubai booker, Toronto firm), on screens and as the script, headed and headless; plus the scratch paging, EDT and DST variants. Error, wrong-role and keyboard journeys are not in this row's walk (they belong to FO-3w's packs), so they were not re-walked.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | 22/22 on every clean run; booking, both mails, three invites, manage page |
| Next step obvious | 1 | `W1-4-booked`: Add to calendar and Reschedule; `W5-manage`: Reschedule primary |
| Plain words | 1 | "Times shown in Asia/Dubai (change)"; mails "7:00 p.m. (Asia/Dubai)" / "10:00 a.m. (America/Toronto)" as briefed |
| Feedback and state | 1 | "You are booked" with the slot words; manage page states the booking |
| Correct data | 1 | one `fo_booking` at the instant with `bookerTimeZone` Asia/Dubai; two outbox rows SENT, keys per booking |
| Error recovery | ½ | not exercised by this walk (main path only); W5 falls to `bad-link` when the link is missing (M3) |
| Accessibility and screen sizes | ½ | axe A/AA clean on five pages, at 1440 px only; no 400/1024 px or keyboard pass in this journey |
| Speed | ½ | whole run 13.6 s; no per-step timing against STANDARDS §9 |
| Visual quality | 1 | five screenshots clean, team look, no overflow |
| Trust and sources | 1 | Sample firm and data labelled; no AI; zones named on every time |

**8.5 / 10, no 0: pass.** What would raise it: a 1024/400 px and keyboard pass of W1 (FO-3w's own packs may already hold these), and step timings.

## Not checked
Video of the walk (ffmpeg version in this container); a real calendar client importing the file (W4 is judged by RFC 5545 rules in the test, as the PR says); an intended user's unaided walk (D17/D20 stay with the founder).
