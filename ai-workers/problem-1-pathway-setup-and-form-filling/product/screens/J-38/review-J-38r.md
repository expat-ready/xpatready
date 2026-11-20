# Review: J-38r (W7 staff move, W8 staff cancel; R1.40, QA-522) at 820be19d3

Independent reviewer; did not build it. Judged as a journey test (`git diff origin/main..820be19d3`: `studio/tests/journeys/j_38.ts` +76/-1, screenshots under `screens/J-38/screenshots/`). No runtime code changed.

**Verdict: Approve** (no open Blocker or Major), for commit 820be19d3. **One condition before merge:** the row's "Done when" (walk j_38 green on GitHub's runners) is not yet evidenced. At this head, `walks` was *skipped* (draft PR; `gh run list`: walks skipped, ci success). Mergify does not gate on walks, so link a green `walk j_38` run at 820be19d3 in the PR (it runs by itself on ready_for_review) before the `review: approved` label is relied on.

## Runs (US$0, port 4438, never :4400)
* Fresh copy `PLATFORM_IDENTITY=local`: **34/34, exit 0** (27 s). Same copy kept, re-run: **34/34, exit 0** (new firm/host/booker per run, `run = Date.now()`). Third fresh copy: 34/34. The builder's "33/33" did not reproduce; the file has 34 fixed `ok()` lines, so it was likely an earlier draft.
* Screenshots rewritten by each run were restored with `git checkout --`.

## Q1: does each new judge fail on a wrong product? (mutations on a scratch tree, each reverted, copy restarted)
| Mutation | Result | Lines that catch it |
|---|---|---|
| `METHOD.moved` → CANCEL (service.ts:177) | 32/34 | W7 "booker's/host's inbox gets the moved invite" (j_38.ts:248, both people) |
| `METHOD.cancelled` → REQUEST (service.ts:177) | 32/34 | W8 "gets the cancel invite" (j_38.ts:265, both) |
| SEQUENCE not raised on a move (inviteIcs: `b.sequence - 1` when RESCHEDULED, service.ts:799) | 32/34 | W7 :248, both (seq [0,0]); W8 still passes, as it should (cancel is 2 > 0) |
| UID changed per version (`${id}-v${seq}` after booking, service.ts:799) | 30/34 | W7 :248 both, W8 :265 both |
| DTSTART/DTEND left an hour earlier on the moved invite (service.ts:799) | 32/34 | W7 :248, both. The "names the new time" lines still pass: the mail text is right, only the file is wrong |
| `STATUS:CONFIRMED` always (ics.ts:66) | 32/34 | W8 :265, both |
| moved mail to the booker only (afterCommit loop, service.ts:567) | 29/34 | W7 host :248, host time :251, browser count :253; W8 browser count :262, host :265. Took two 90 s waits; fails visibly, never a false pass |

Every mutation the row names is caught, for the booker and for the host separately.

## Q2: vacuous or racy
* **Wait before the cancel:** sound. `inbox(booker, 2)` and `inbox(host, 2)` (:242) both return only after the moved mails are SENT, and the cancel comes after. A dropped mail (runMail's `sequence !== p.sequence`) shows as a FAIL, never a pass.
* **Move target:** `at + 60 min` (:238) is 11:00 Toronto on a weekday the page itself offered. That is inside the default Mon–Fri 09:00–17:00 (settings.ts:191; `place()` warns OUTSIDE_HOURS otherwise, and :240 needs status 200). The host has no other booking. DST changes happen at 02:00 on Sundays, so 10:00→11:00 on a weekday never crosses one. Dubai has no DST, and the UTC sums hold. The 1 h/24 h reminders cannot reach either inbox (walk ≥ 26 h ahead), so the mail counts are exact.
* **Re-runs on a kept copy:** checked, 34/34 (also 7 restarts of the same copy for the mutations).
* **Role grant / identity:** the W1–W5 judges are unchanged and pass on the `local` copy. The grant is needed and enforced by the server: once the grant is ended, the same host gets **403 missing-permission (agent/booking:edit)** on both `/cancel` and `/reschedule`. Break pass, also checked: cancel again → 409 not-active; move a cancelled booking → 409; no bearer → 401; the host inbox stays at 3, sequence 2.
* **Not vacuous, but weak:** see m1 and m2 below.

## Q3: walk.mjs and walks.yml
`copyOf` (walk.mjs:24) reads the new header as `['j38','4438',['--ttl','30','PLATFORM_IDENTITY=local']]` (run on the file). A local `node walk.mjs j_38` started the copy with `start --ttl 30 PLATFORM_IDENTITY=local: exit 0` and stopped it cleanly. The journey then could not open its browser here: this machine lacks Playwright's ffmpeg for video, an environment gap that CI's `playwright install chromium` covers. walks.yml calls the same walk.mjs. Eight other journeys on main (j_6, j_28, j_30, …) already start this way. The local stand-in is allowed because walks sets no `PLATFORM_ENVIRONMENT` (port.ts:49).

## Q4: rules
* Names: Sample only ("Ana Sample", "Sample host", `*.example`). No personal names.
* Tokens: the bearer token is never printed (:233 prints the status only). The staff answers print the status plus DB fields. record.ts logs URLs only (no token in them). All six changed PNGs at 820be19d3 were viewed. W7/W8 show subjects and invite text only: UID (the booking id), Sample addresses, no link or token. W1-2/W1-3/W1-4/W5 are product screens with no token.
* Files: only the row's journey file and its own screenshots. No runtime, rules or instruction file touched. j_38.ts is 274 lines, in the existing style.
* Staff booking screen: none in `web/src` (the only `/reschedule` caller is the booker's `manage-page.tsx:148`), and no inbox screen. Using the staff API (`staff.controller.ts`, guarded by PermissionKeys) is the product's own door, not scaffolding (P-33). The row says "staff", so the booker's manage page is not the right actor for W7/W8.

## Findings
**Blocker:** none. **Major:** none.

**m1 (Minor): the "read back in the browser" is judged by count only, and one alias suggests otherwise.** `inboxInBrowser` returns `list.length` (j_38.ts:227). The host judgments at :246–251 run on the fetch read: `const hb7 = h7;` (:244) names the fetch result as if it were the browser's. :253 says "holds the same two mails" but compares counts, and :262 does not even compare with `hb8.length`. Opening the inbox address and drawing what the browser received is honest, not theatre: the PNG text is the product's bytes, and the screenshot is not judged. **Fix:** have the evaluate return `[{subject, ics}]` and (a) run the host's W7/W8 judges on that list, or (b) assert that each browser-read invite equals the fetch-read invite (`noStamp` is not even needed: same stored file). Drop the `hb7` alias.

**m2 (Minor): the comment at j_38.ts:20 overclaims.** "headers, links and their tokens left out" is true of the PNG only. The browser first loads the raw inbox JSON, which holds each host mail's `List-Unsubscribe` URL with its unsubscribe token (checked: both SERVICE mails carry one). The walk's trace and video therefore keep it in the walk artifact, as W5 already does for the booker's manage link (:194 says so). The risk is a throwaway copy with a Sample address. **Fix:** word it as :194 does ("left out of the screenshot; the walk's trace holds the inbox's raw answer").

## Journey score (journey-test, reviewer role; the one score for this check): **7.5 / 10**
Journey walked: booker books by screens (W1) → mails and .ics (W2–W4) → own page (W5) → staff move (W7) → staff cancel (W8), each read back from the inbox. Break pass above.
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | 34/34 ×3; all 7 mutations caught |
| Next step obvious | ½ | W5 ends at row 42's first step; W7/W8 staff have no screen (API) |
| Plain words | 1 | "Consultation has moved: Monday, November 23, 2026 at 11:00 a.m. (America/Toronto)"; cancel mail plain, no link |
| Feedback and state | ½ | The move/cancel is shown only in mail and the DB; no staff view (no screen on main) |
| Correct data | 1 | DB start/sequence/status checked at :240 and :257; UID, SEQUENCE, DTSTART, STATUS as RFC 5546 expects |
| Error recovery | ½ | Product holds (409/409/401/403 in break pass), but the walk checks no error step |
| Accessibility and screen sizes | ½ | axe and 1440 px on W1–W5 only; W7/W8 have no product screen to check |
| Speed | 1 | Whole walk 27 s; mails in within 1–2 s |
| Visual quality | ½ | W7/W8 PNGs are titled, readable text renders (honest stand-in), not product screens |
| Trust and sources | 1 | Setup disclosed as not through the product; stand-in SI-20 named; Sample labels |
Below 8 only because of inherited stand-ins (no staff booking screen, no inbox screen on main). The row may change no runtime code, so this row cannot close them. Inside the row, fixing m1 is what would make the W7/W8 evidence judged rather than shown.

## Could not check
The recorded walk on GitHub (skipped on the draft; condition above). The local recorded walk (no ffmpeg on this machine). A real calendar client consuming the REQUEST/CANCEL pair. The booker's inbox in the browser: only the host's is opened there. That is enough for the row's "read each one back", and it avoids the manage token.
