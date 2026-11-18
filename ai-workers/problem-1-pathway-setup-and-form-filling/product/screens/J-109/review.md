# J-109 review: complaints join-and-walk (R1.109), commit 648daeea9

Reviewer (Opus 5.5, high effort, P-303); did not build it. Scope: `git diff 648daeea9~1 648daeea9` only (`tests/journeys/j_109.ts` plus 9 screenshots). Brief: `J-rows.md` §J-109 as amended by `wave1-registers.md` §J-109 (at c5bf956f9). Journey test: `journey-test-reviewer-2026-11-18.md` (this folder).

**Verdict (screen-review terms): Ship after fixes.** One Major: the committed screenshots come from the builder's fake-wired run, not the real one.

## Builder's claims, checked
* **Wiring unchanged, on main:** true. `api/src/features/platform-complaints.ts` is the same on `origin/main` and at 648daeea9: `clock: systemClock`, `jobs` injected as `PlatformJobs`, `mail: fakeMail()` (lines 21, 46). The diff touches no wiring. Mail staying `fakeMail` is named in the test header (j_109.ts:9-11).
* **DW1/DW2 fail on the fakes (5 FAILs):** confirmed by reading the code, not by re-running a swapped build (I edit nothing outside my record). With `fakeJobs` no `platform_jobs.job` row exists, so DW1 pass, DW1 run, DW1 fail and DW1 cancel fail (4 lines). With `FakeClock` at `FAKE_NOW` = 24 Nov 14:00Z (`ports/clock.ts:13`), "five minutes ahead" is accepted, so DW2 fail fails (1 line). Total 5. A fake fixed in the past would fail DW2 pass instead, so the pair catches either kind of fake.
* **W1-W5, 27 passed / 0 failed:** reproduced. Copy `j109rv` on :4437 (runtime range 4430-4439, never :4400), headless Chromium, 3 runs on the same reused copy: 27/0 each time. The walk is deterministic on rerun.

## Named cases: a pass line and a fail line each
| Case | Pass line | Fail line | Proves its name? |
|---|---|---|---|
| DW1 | row in pg-boss, due at the acknowledge-by date (j_109.ts:115) | "no other reminder row" (:119) | Pass: yes. Fail: **no** (m1). The cancel line (:127) is the real negative. |
| DW2 | a minute ago gives 201 (:124) | five minutes ahead gives 422 "in the future" (:129) | Yes |
| W1 | drawer records it; the DB row has the received time and the handler (:102) | same key, other words: 422, one row (:106) | Yes; the Idempotency-Key is read off the real browser request (:69, :104) |
| W2 | stored and shown date = Tue 17 Nov 17:00, an independent constant (:132) | not Mon 16 Nov (:134) | Yes; weak fallback (m3) |
| W3 | Read-only list lacks it (:140) | Owner sees it under Overdue (:150) | Yes; also Not found by address and API 404 |
| W4 | Acknowledged, then Closed/Resolved in the DOM and the DB (:157, :163) | no outcome: refused, DB still OPEN (:160) | Yes |
| W5 | under Closed, `view=closed` (:173) | gone from Open (:170) | Yes |

Server authorisation is checked underneath (W3 API 404). The data is checked in the database (rows, `requestKey`, status, outcome). There are no per-row requests in the test. Its timing is safe: `commit()` awaits the after-commit job work before it answers (`complaints.ts:232-236`), so the cancel check at :127 does not race.

## D1-D20 (this row: joins plus walk; the screen itself is PF-21s, reviewed elsewhere)
D1 fit: every W step and DW swap in the amended brief has a line. W2 uses the 2-business-day period, not 30 days. · D2 integrity: idempotent repeat refused, one reminder per complaint, one ACKNOWLEDGED event across two tabs (journey report). · D3 N/A · D4 N/A · D5 stability: double click sends 1 POST; a reused copy reruns green; the closed day is restored in `finally` (:181). · D6 governance: audit lines record/acknowledge/reminder present (journey report); the walk does not assert them (m5). · D7 N/A (no AI) · D8 orientation: breadcrumbs on every shot. · D9 flow: one filled next-step button (W4 :152). · D10 words: plain; "Sample" on lists and the period. · D11 feedback: toasts, timeline, Needs you, 409 shown in the panel. · D12 visual: team look in the screenshots. · D13 a11y/responsive: axe clean, no sideways scroll at 400/1024/1440 and 1440 at 200%, keyboard-only record (journey report). · D14 team look: yes. · D15 speed: record 219 ms. · D16 testability: a pass and a fail per case, the swaps fail on the fakes, reruns pass; the screenshots are the wrong run (M1). · D17 simulated only · D18 provenance: Sample marked; no immigration value is asserted. · D19 closure: from record to closed in the list, the brief's end (no next capability). · D20 simulated only.

## BIC-01-BIC-20 (EXPERIENCE.md §6)
N/A, all 20: §6 covers case-side screens. Complaints is a firm (platform) screen, and this row adds no screen.

## Graph (P-86)
`graph.mjs` ran (exit 0). `qa/GRAPH.md` covers the runtime `/api` routes and pages. Platform complaints routes are not in its scope, so this row has no graph finding.

## Issues
**Major**
* **M1 (Must): the committed screenshots are from the fake-port run, not the real one.** Evidence:
  * `w2-acknowledge-by-1440.png` reads "5 business days late". Five business days after Tue 17 Nov is Tue 24 Nov, which is `FAKE_NOW`. On the system clock (18 Nov) the same step reads "1 business day late" (my run).
  * `w4-closed-1440.png` has no "Reminder sent to acknowledge" event, because `fakeJobs` never runs the job. The real run shows it.
  * The close time in `w4-close`/`w4-closed`, 12:44 p.m. Toronto, is the commit minute (17:44 UTC). So the last run before the commit was the swapped one.

  The brief asks for a screenshot per W step as evidence of the real path, and these show fake behaviour. Fix: re-run `j_109.ts` on the unchanged wiring and commit the regenerated `screens/J-109/*.png`.

**minor (Should)**
* **m1** `j_109.ts:119` "DW1 fail" cannot fail apart from :115: `r1` is read after the refused repeat, and the repeat is refused before any schedule (`complaints.ts:261`). Fix: label the cancel line (:127) as "DW1 fail" and drop :119, or make :119 test something new.
* **m2** `:118` takes pg-boss `completed` to mean the reminder ran. `runAckReminder` also completes when it skips (`complaints.ts` ~442-443). Fix: also assert a `REMINDER_SENT` event for the complaint.
* **m3** `:131` falls back to the whole page text when the "Acknowledge by" fact is missing. W2 could then pass on the banner's date alone. Fix: drop the `.catch` fallback.
* **m4** The default and example port 4573 (`:20`, `:34`) is outside the runtime lane's 4430-4439 (`WAY-OF-WORKING.md:18`). Fix: use a port in range.
* **m5** The brief's W2 says "on the fake clock" while its swap says "system clock". The builder fixed the received date instead (`:16-17`), which is sound, but say so in the PR body (never deviate silently). The walk could also assert the audit lines (D6); optional.

**Out of this diff (PF-21s screen, for its owner):** in `w4-close-1440.png` the close panel's "There is a problem" summary and field errors stay after the outcome and note are filled, until the next submit.

## What I could not check
* A visible (headed) browser walk: no display here, so headless only.
* A real screen reader. An intended user's unaided walk (D17, D20 stay with the founder).
* Re-running with the fakes swapped in: verified by code reading, since I edit nothing outside my record.
* CI on this head.

Verdict: Changes requested
1. Major M1: regenerate and commit the J-109 screenshots from a run on the real wiring (see above).
2. minor m1-m5 as listed (Should; not blocking on their own).

## Re-review R2 (P-277, diff only): `git diff 648daeea9 62b4bcd95`
Read: the `j_109.ts` changes (+12/-10), the 9 regenerated screenshots, and `break-report.md`. The app code has no change in this range (only the test and records). The committed `review.md` and journey report are mine, unaltered.
* **M1, fixed.**
  * `w2-acknowledge-by-1440.png` now reads "1 business day late". That matches the system clock on 18 Nov; the earlier shot showed FakeClock's 24 Nov.
  * `w4-closed-1440.png` now shows "Reminder sent to acknowledge · The system", so the real pg-boss worker ran it.
  * The close times (12:03 / 1:03 p.m.) are after the earlier fake-wired run.
* **m1, fixed.** The line that could not fail on its own is gone. The cancel check is now "DW1 fail" (`j_109.ts:129`): created, then acknowledged, then `cancelled`. Every case still has a pass and a fail line.
* **m2, fixed.** The run line (`:121`) now needs pg-boss `completed` and exactly one `REMINDER_SENT` event. A skipped run would fail it.
* **m3, fixed.** W2 reads only the "Acknowledge by" fact (`:133`), with no page-text fallback. A missing fact throws, the run exits non-zero, and no FAIL line is printed. That is acceptable.
* **m4, fixed.** The port is now 4436, in the runtime range 4430-4439.
* **m5.** It goes in the PR body (I can't check that from the diff).
* **Breaker m2 (wait raised to 120 s), accepted.** The longer wait only allows for a backlog; the pass condition is unchanged and still strict.
* **On the fakes, the new lines still fail.** With `fakeJobs` there is no row, so DW1 pass, run and fail all fail (3 lines). With FakeClock at 24 Nov, five minutes ahead is accepted, so DW2 fail fails (1 line). The swaps are still proven real.
* **Rerun.** I ran the `62b4bcd95` walk from a scratchpad copy (imports pointed at the same code; screenshots kept in the scratchpad, so the committed shots are untouched). Copy `j109rr` on :4436, twice on the same copy: **26 passed, 0 failed** both times, about 7.6 s each.
* **Breaker's M1 is out of J-109, so it does not block this row.** The finding: a Read-only person chosen as handler can see, acknowledge and close the complaint (`complaints.ts:188-192`, `:323-326`). That bug sits in PF-21v/w, which this row may not change (the brief says to stop and ask). W3 as briefed still holds for a Read-only person who is not the handler. The question to the tech lead needs a tracked row (BUGS or PF-21v/w), so it is not lost when this merges.
* **Breaker's other findings.** Its m3 (the "Reminder sent" wording while mail is `fakeMail`) is allowed by the brief and named in the header. Its m1, m4 and m5 belong to existing parts. No new issue in this diff.

Verdict: Approve 62b4bcd95aeb8c69e519e37444905b8230103993
