# J-37 review: the journey test for the public booking page and no double booking (PR #2284)

Reviewer (did not build it), 19 Nov 2026. Commit `09e137fea` (branch `claude/happy-archimedes-yriznu`), diff `origin/main..09e137fea`: `tests/journeys/j_37.ts` (new, 180 lines), `qa/built/J-37.md`, four screenshots. No product code. Judged as a journey test against `lead-b-briefs/J-rows.md` (shared brief plus §J-37) and BACKLOG row J-37, not with D1–D20 or the BIC table. Copies on runtime ports 4431, 4432, 4437, 4439, never :4400. Live AI off, US$0.

**Verdict: Block** (one Major, M1: a daily 25-minute window in which the walk fails on a correct product). Everything else holds; the Minors do not block on their own.

## What I ran
| Run | Result |
|---|---|
| Header line as written, fresh copy `j37` :4437 | 21/21, exit 0, 6.5 min; walked 14:10Z, reminder due 13:10:00Z, sent 13:10:03.8Z; restart left 350 s to spare |
| `HEADED=1 xvfb-run -a tsx … j_37.ts j37h 4439` (visible browser), 4 copies running at once | 21/21, exit 0; reminder sent due+2.5 s |
| `walk.mjs studio/tests/journeys/j_37.ts` (record.ts loaded; scratch `PLAYWRIGHT_BROWSERS_PATH` aliasing ffmpeg-1013 to the installed 1011, nothing installed) | 21 PASS, 0 FAIL, exit 0, 590 s, 2 traces, 46 step shots, 0 video |
| `copyOf` from walk.mjs on the header | `{ name: 'j37', port: '4437', extra: ['--ttl','40'] }` |
| `graph.mjs --check` | G1 0 · G2 0 · G4 0 · G5 0 |
| Playwright `recordVideo` probe in this container | `browserContext.newPage: Executable doesn't exist at /opt/pw-browsers/ffmpeg-1013/ffmpeg-linux`: the builder's `check_journey_recording.ts` claim is environmental (installed ffmpeg is 1011, playwright-core wants 1013); unrelated to this diff |

Mutations ran in scratch git worktrees (product code changed there only, copy restarted by the test itself), with a scratch test aiming 62 min ahead instead of 66 to cut the wait; worktrees removed after.

## 1. Does each judge fail when the product is wrong?
| Mutation (scratch only) | Lines that FAIL |
|---|---|
| M-a `arrival: fakeArrival()` in `runtime-ports.ts` | :147 DW2 (`null`); :161 W4b/DW2 (only the confirmation arrived); :164 (0 rows). 18/21 |
| M-b `mail: fakeMail()` in `runtime-ports.ts` | :142 W4 (`none`); :145 DW1 (`[]`); :161; :164; :168 W5 link; :175 (`bad-link`). 15/21 |
| M-c 1 h reminder scheduled at now+2 s, plus the manage link dropped from `runMail` | :145 DW1 (second, QUEUED row); :149 (`completed`); :157 (reminder before due); :161 (sent 13:13:52 for due 13:20); :168; :175. 15/21 |
| M-d second booking let through (busy rows ignored in `slotsFor`, `fo_booking_no_overlap` dropped by the scratch test), plus the 1 h reminder never scheduled | :134 (B sees "You are booked"); :135 (`[]`); :137 (two rows at 14:20Z); :149 (`[]`); :161; :164. 15/21 |

Every swap and walk step the brief names fails when broken. DW1 and DW2 are on main already (#1855's MailPort over MessagePort; #2196 `a87a7aa92` PrismaArrival) and the test proves both real: M-a/M-b are exactly the fakes they replaced.

## 2. Vacuous, circular, silent waits
No `.catch(() => undefined)`; `inbox()` (:54-59) returns what arrived and every caller judges the count; the readiness loop (:154) is judged at :155; :117 throws after a FAIL line. Expected times come from `Intl` on the walked instant, not from product helpers. One weak judge: Minor m1.

## 3. Rot and flake
Restart margin: 6–11 min by design, restart took 7–20 s here; the reminder came 2.5–3.8 s after due in four clean runs (pg-boss polls every 2 s, `pgboss-jobs.ts:98`), so the `< due + 3 min` bound is wide. Rate limits (`service.ts:64`: 10 bookings per IP per 10 min, in memory) are far off at 2 bookings per run, and the restart clears them. A new firm key and addresses per run, so a kept copy is safe. Month end: `openDay` pages up to twice (:94). Midnight: Major M1. DST fall-back: Minor m3.

## 4. walk.mjs and the TTL
walk.mjs reads the header (table). 40-min TTL and walk.mjs's 40-min limit are enough for a ≤13-min run. The test's own `isolated.sh … restart` (:152) passes no `--ttl`, so the copy's timer is reset to the default 60 min (`isolated.sh:19, 94-100`); harmless, since the trap or walk.mjs stops it.

## 5. Rules
No personal names ("Ana/Ben Sample" placeholders), no immigration values, no keys. PASS/FAIL lines redact the token (:61, :168). The manage URL with its token is in `trace-2.zip` because W5 opens it in a recorded browser: inherent to W5, a Sample booking on a dropped copy. Only new files plus `qa/built/J-37.md`; no builder-forbidden file. 192 changed lines (< 800).

**W4b reading (no clock seam):** sound, and stronger than a seam: the real pg-boss `start_after`, a real process restart and the real clock, with no test-only code in the product. The Sample settings are honest: 60 min notice, 5-min interval, 30-min self-service limit, 30-min meeting, host 00:00–24:00, all inside the DB checks (`minutes` and `slot_interval_minutes` 5–480, notice 0–525600; `fo1b_booking_tables/migration.sql:192-196`), and the header (:17-22) and built note name them. The brief asked for the seam to be "named in the PR": see m4.

## Findings
**Blocker:** none.

* **M1 (Major) `j_37.ts:114` with `:75-77`: the walk fails on a correct product every day from 22:25 to 22:49 Toronto** (03:25–03:49 UTC in winter, 08:55–09:19 IST). The host's window ends at 24:00 and a 30-min meeting must end inside it (`slots.ts:76`), so the last start is 23:30. When `aim` is 23:35–23:55, :114 looks only at `aim..aim+20` on `dayOf(aim)`, finds nothing, :116 FAILs and :117 throws. Evidence, `computeSlots` with the test's settings: now 22:30 → aim 23:40, offered in the window only `20/11 00:00`; now 22:40 → aim 23:50, only `00:00, 00:05, 00:10`. **Fix:** make the Sample type `minutes: 5` (the DB minimum, so the last start is 23:55 and every 5-minute mark is offered), or drop the same-day condition and open the day of the first offered time ≥ aim (with the TTL checked for the longer wait). Say which in the header.
* **m1 (Minor) `j_37.ts:141, :143`: "B gets no mail" passed while B was booked** (M-d: :143 PASS, `[]`). B's inbox is read the instant A's mail arrives, before B's would. :134/:137 caught M-d, so nothing slips, but the judge proves nothing. It also passes when the inbox route is down (`inboxNow` turns any non-200 into `[]`, :51; M-b: :143 PASS). **Fix:** read B's inbox after the W4b wait (≥ 6 min later) and require status 200.
* **m2 (Minor) W4 and W4b have no screenshot** (brief: "a screenshot per step"): the mails are read only through `GET /api/demo/platform-inbox`, which has no screen. Same gap as J-38 m2; not the builder's to build. **Fix:** name it under the PR's Questions.
* **m3 (Minor) DST fall-back day (next: Sun 7 Nov 2027):** a start in the repeated 01:00–01:59 hour is offered only at its first (EDT) moment (`slots.ts:7-8, 45`), so a run started 00:49–01:29 EDT that night aims inside the second hour and :114 finds no time. Once a year; the M1 fix (looking past the window or the day) does not cover it. **Fix:** in :114, also accept the next offered time after `aim + 20` up to, say, `aim + 90` (the wait stays inside the TTL), or note the night in the header.
* **m4 (Minor) PR body:** it is still a draft placeholder ("The full body follows with the Approve"). It must name the W4b deviation (no clock seam: real clock, Sample type settings), the named cases J-37 DW1, DW2, W1–W5 with W4b, and the `check_journey_recording.ts` environment note.

## Journey score (reviewer role; the one score for this check)
Journeys: booker A's main path W1–W5 with W4b, and booker B's refusal, by screens in two browsers, headless, headed and under walk.mjs; plus the four break-it mutations above. Wrong-role, keyboard and other widths are not in this row's walk (FO-3w's packs).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | 21/21 on all three clean runs; booking, refusal, both mails, manage page |
| Next step obvious | 1 | `W2-booked`: Add to calendar, Reschedule, Cancel; `W5-manage`: Reschedule primary |
| Plain words | 1 | "This time was just booked. Please choose another time." with "Next free times" (`W3-refused`) |
| Feedback and state | 1 | "You are booked" names the time and zone; the refusal sits above B's kept form |
| Correct data | 1 | one `fo_booking` at the instant; `fo_person` Ana; outbox rows SENT `local:`; one `reminder-1h` job, `created` |
| Error recovery | ½ | B is offered four next times but the walk never takes one; form kept after refusal |
| Accessibility and screen sizes | ½ | axe A/AA clean on W1, W2, W3, W5 at 1440 px only; no 400/1024 px or keyboard pass |
| Speed | ½ | reminder due+2.5–3.8 s, restart 7–20 s; no per-step timing against STANDARDS §9 |
| Visual quality | 1 | four screenshots clean, team look, no overflow |
| Trust and sources | 1 | Sample firm, type and wording labelled; no AI; zone named on every time |

**8.5 / 10, no 0: pass** as a journey. What would raise it: a 1024/400 px and keyboard pass of W1–W3, and B booking one of the offered times.

## Not checked
Video of the walk (ffmpeg build in this container); a run inside the M1 window or on the DST night (shown by `computeSlots` and the code, not by waiting for the clock); an intended user's unaided walk (D17/D20 stay with the founder).

**Verdict: Block.** To fix: M1. Should fix: m1, m4; m2 and m3 as Questions or header notes.
