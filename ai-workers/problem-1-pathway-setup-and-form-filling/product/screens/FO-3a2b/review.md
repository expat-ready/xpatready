# Review: FO-3a part 2b, the staff read feed (API only, no screen)

Reviewer (Opus 5.5, did not build it), 19 Nov. PR #2313, head `84a6ba0d3afc41f018afeb274825ff2a5949bada`. Reviewed only this row's diff: `claude/busy-babbage-bpqaoi...HEAD` (5 files, +322 −4). Sources: the brief `FO-3a2.md` "Part 2b" (on `lead-b-front-office`), concept `fo-3-booking` r2 (§3 BR-12, BR-14, §5 Staff copy, §6 FO-3st1 J-S1..J-S9, "Who sees what", Q4), and the AG-04 v2.1 cards AG-4-39 and AG-4-67.

## Suites run (scratch databases on 127.0.0.1:54329, never :4400; live AI off, US$0)
* `check_fo3a2_feed`: 17 passed, 0 failed. `check_fo3vr_visibility`: 22/0. `check_fo3sr_routes`: 29/0. `tsc --noEmit -p api/tsconfig.json`: clean. The `count-any` ratchet: 416, at or under the baseline of 433.
* Reviewer probes, run in the scratchpad (nothing in the worktree changed):
  * **Mutations:** five mutations of `feed.ts`, each run against the suite.
  * **End to end:** an HTTP harness that uses the real `runtimeBookingPorts` (the real `auditEvent` adapter and `PrismaArrival`). It is reported in `journey-test-reviewer-2026-11-19.md`.

## Done when, ticked (code and test, pass and fail)
| Case | Pass | Fail |
|---|---|---|
| DW8 (AG-4-67 test 1) | yes: sees the one they host; with everyone-sees-all on, sees every booking | yes: a colleague's lead is hidden in team and is 404 by id |
| DW9 (Q4) | yes: Billing and finance gets its own booking in mine and by id | yes: 403 naming `agent/booking:list` on team; 404 for another host's booking |
| DW10 | yes: 60 bookings in one answer, every field, times in UTC, the office zone named | yes: over 62 days → 400; `to` before `from` → 400; an unknown view → 400; no sign-in → 401; `feed` is not read as an id |
| DW11 (edge case) | yes: an old host the record rule allows still sees it; the new host sees it in mine | yes: the old host loses it in mine, team and by id |
| FO-3vr and FO-3sr unchanged | yes: 22/0 and 29/0 | n/a |

## What holds
* **Visibility is FO-3vr's, called, not copied.**
  * `view=team` uses `readSeen` (`feed.ts:43`), the same call `staffList` makes.
  * `view=mine` is firm-scoped plus `staffId` (`feed.ts:44`).
  * By id uses `staffBooking` (`feed.ts:50`): the host, or the list key plus `seesBooking`.
  * Every lookup goes through `firmScope`, and the audit read filters on `firm_id` (`feed.ts:61-69`).
  * Probes: firm B's owner gets 404 on firm A's id; a non-UUID id gets 404 "No such booking.".
* **No read per row.** `items()` makes 8 reads in parallel, whatever the row count (`feed.ts:59-70`). A list costs about 12 queries in all, with `seenWhere`, the rows and the zone.
* **Route order.** The settings and consult feature files sort before `front-office-booking.ts`. Their only shared path is `:id/consult-record`, and `feed/consult-record` is 404 on both routes. In the feature, `BookingFeedController` comes before `BookingStaffController`, and DW10 asserts both orders.
* **`canEdit`** (`feed.ts:96`): live and the edit key. This matches `staffReschedule` and `staffCancel`, which need only `agent/booking:edit` and visibility.
* **`attendanceDue`** (`feed.ts:98`): the viewer's own booking, unanswered, at end + 30 min. This matches BR-14 and J-S4: due at 30 minutes, not at 29; never for an Owner who is not the host; never when cancelled.
* **`outsideHours`**, checked end to end through FO-3sa's real write:
  * Case Officer posts 22:00 Toronto → 409 OUTSIDE_HOURS → Book anyway → 201. The audit line is `booking.scheduled ["OUTSIDE_HOURS"]`, and the feed answers `outsideHours: true`.
  * A free-time move into hours → `false`, because the latest placement wins (`DISTINCT ON … ORDER BY at DESC`).
  * `booking.zone_changed` is rightly not counted.

## Declared deviations, judged
1. **Own controller, not route lines in `staff.controller.ts`: accepted.** Adding the routes there would change the constructor and every suite that builds the controller. Registration order gives the same guarantee, and DW10 checks it in both the feature and the routes.
2. **`outsideHours` read from the audit line: accepted.** FO-3sa keeps the warning only in `detail.warnings`, and this row has no schema change. The audit is insert-only (AUD-1a) and fail-closed, so every placement has its line. The read is correct and firm-scoped (probes above). Its two weaknesses are Minors m1 and m2 below.
3. **`staffBooking` made public (`readSeen` was already public in FO-3vr), `seenWhere` still private: accepted.** It is FO-3vr's one-booking filter, called rather than written again, as the brief wants. The brief said "if the filter needs a new export, stop and ask". This is a member's visibility inside the same module, not a new export, and it is declared in the PR. Lead B may still overrule it.

## Findings
**M1 Major (concept BR-14 and AG-4-39 rule 7): `canAnswerAttendance` is true during the meeting.**
* Where: `feed.ts:81` (`started = startsAt <= now`) and `feed.ts:95`.
* What the sources say: BR-14 says "On the booking once the meeting has ended". AG-4-39 rule 7 says "not asked … before the meeting has ended".
* Probe: at 15:10, inside a 15:00-15:30 meeting, the host gets `canAnswerAttendance: true`. FO-3st1 would show Attended and No-show mid-meeting, and the screen cannot correct this without working out a rule itself.
* The write (`service.ts:400`, and the database's own check) accepts an answer from the start. A stricter flag is therefore safe: every button the feed offers is one the server takes.
* **Fix:** use `r.endsAt.getTime() <= now` for the flag. Add a fail case: during the meeting → `false`; after the end → `true`. If the tech lead wants answers from the start instead, record that in `screens/fo-3-booking/challenge.md`. Either way the feed and the concept must agree.

**M2 Major (STANDARDS §7 [M] "a rule's test fails when the rule is removed"): `canAnswerAttendance`'s permission clause has no test that fails.**
* Mutation: `answerable && started && (mine || editKey)` → `answerable && started`. Result: 17/17 still pass.
* Every case in the suite is the host or an edit-key holder (`check_fo3a2_feed.ts:171-178`). Removing the clause would show the buttons to Read-only on a colleague's booking, and the server would answer 403. The probe confirms the code is right today: Read-only gets `false`, and its POST gets 403.
* **Fix:** add a fail line after `check_fo3a2_feed.ts:172`. Read-only, with everyone-sees-all on, opens the ended booking that the Case Officer hosts and gets `canAnswerAttendance: false`.

**m1 Minor: the "latest line wins" rule for `outsideHours` is untested.**
* Mutation: drop `DISTINCT ON` (`feed.ts:68`). The suite still passes.
* The case only inserts a line by hand (`check_fo3a2_feed.ts:180`), so the coupling to FO-3sa's `detail.warnings` shape and action names is pinned nowhere.
* **Fix:** add a later `booking.rescheduled` line with no warnings and expect `false`. Better still, export the two action names and the `warnings` key from `service.ts` (next to `warningDetail`) and use them in the query.

**m2 Minor (scale, recorded only; STANDARDS §9 leaves scale to the team): no index on `audit_event (firm_id, entity, entity_key)`.**
* The read scans the firm's audit lines (`firm_id, at` is the only index that fits), and does so on every calendar load. There is a precedent (`sales/timeline.ts:41`, `leads.ts:248`).
* **Fix:** name it as a follow-up index row in the PR. Do not add it here (schema is outside the touch list).

**m3 Minor (one rule in two places): `hangsOn` ignores the type's purpose.**
* Where: `feed.ts:82,89`.
* What happens: for a case call (FOLLOW_UP or CASE_REVIEW), staff create links the person's open prospect, so the feed says "prospect P-…". 2a's `partyOf` (`consult/service.ts:80-86`) says `client` and offers no retainer.
* Concept §6 says the feed carries "the lead, prospect or case it hangs on".
* **Fix:** derive `kind` with `partyOf` (read the type's `purpose` in the types query). Keep the number lookup for the name.

**m4 Minor (concept §5, BR-12 "every staff read comes from the feed"): three things FO-3st1 shows have no server answer.**
* (a) The chip tooltip "Cancelled by <who>.": the actor of the `booking.cancelled` line, readable in the same audit query.
* (b) Whether the viewer may open the consult record. Today the browser would have to combine `attendance === "COMPLETED" && canAnswerAttendance`.
* (c) The reschedule dialog's "inside the <n>-hour limit": `selfServiceOpen` and the type's limit.
* **Fix:** add them here, or have FO-3st1's PR name them as its own API lines before it builds. This is not new scope: each one is a string or rule already in the concept.

## Journey score (reviewer; the one score for this check)
**8.75/10, scaled from 7 of the 8 criteria that apply.** Accessibility and visual quality are N/A (no screen). The score passes (8 or more, no criterion at 0). The detail is in `journey-test-reviewer-2026-11-19.md`.

## Not checked
* `graph.mjs` was not run: it rewrites `qa/GRAPH.md`, and this review writes only its own two files.
* No browser walk, axe, widths or keyboard: no screen until FO-3st1.
* A real attendance POST in the end-to-end harness: the database's trigger uses its own clock against the fake clock.

**Verdict: Block.** To fix: M1, M2. The Minors m1-m4 do not block.

Reviewer: Changes requested

---

## Re-review at `8f08879b1eed551967f084eb1a27e01798175db4` (diff `84a6ba0d3..8f08879b1` on `*feed*` only, P-277; `service.ts` there is FO-3vr's, approved separately)

**Verdict: Approve.** No Blocker or Major is open.

**Suites at this head** (scratch databases on :54329, never :4400; US$0):
* `check_fo3a2_feed`: 25 passed, 0 failed. `check_fo3vr_visibility`: 24/0. `check_fo3sr_routes`: 29/0. `check_fo3a2_consult_record`: 39/0.
* `tsc --noEmit -p api/tsconfig.json`: no error in `feed.ts` or its check. The run needed `--max-old-space-size`. Fifteen errors remain in five unrelated tests (`check_c18_age_case`, `check_c69_runs`, `check_cost_check`, `check_vv_checklist`, `check_x2b_bulk_apply`), none in this row's files.
* **Mutations:** eleven, run on scratchpad copies of the new `feed.ts`.

**What each mutation showed:**

| Item | Fixed by | Mutation | Result |
|---|---|---|---|
| M1 | `feed.ts:99,122`: `ended = endsAt <= now` | revert to `startsAt` | caught by "while the meeting runs, nobody is asked yet" |
| M2 | Read-only case at `check_fo3a2_feed.ts:173-174` | drop `(mine \|\| editKey)` | caught |
| m1 | `feed.ts:74-76`: latest line per (booking, cancelled or not), `at DESC, id DESC`; case with a later warning-free `booking.rescheduled` | order `at ASC` | caught |
| m2 | not built; the follow-up index row is noted in the PR | n/a | accepted (schema is outside the touch list) |
| m3 | `feed.ts:101-102,111`: `kind` from 2a's `partyOf` (a case call → `client`, with the person's name) | drop the case branch | **not caught** (n3 below) |
| m4 | `cancelledBy` at `feed.ts:117`: a staff name, or "the booker" for `system:booking-link`, the only other actor that cancels (`service.ts:335,386`) | always "the booker" | caught |
| m4 | `selfServiceLimitHours` and `insideSelfServiceLimit` at `feed.ts:119`, the same rule as `selfServiceOpen` (`service.ts:841`) | drop the limit | caught |
| m4 | whether the viewer may open the consult record | left to part 2, which adds the record | accepted |
| F1 | `Instant` bounded to 2000-2099 (`feed.ts:28`) | drop the bound | caught (500 instead of 400) |
| F2 | every id lookup read in pieces of 10,000 (`feed.ts:63-72`) | n/a | checked by reading; the audit read takes one array parameter |
| F3 | lead named only to a viewer who may open it (`feed.ts:83,87`) | drop the lead filter | caught |
| F3 | prospect named only to a viewer who may open it (`feed.ts:112`) | drop the prospect filter | **not caught** (n3 below) |
| F3 | ENGAGED no longer counts as open (`feed.ts:86`) | ENGAGED counted as open again | **not caught** (n3 below) |

**Still no read per row.** Nine reads run in parallel. Two follow them: the active owners, and the cancellers not already among the hosts. The count does not grow with the rows.

**New, Minor (not blocking):**
* **n3 Minor: three new display rules have no case that fails when they are removed.**
  * The case-call branch of `hangsOn` (`feed.ts:111`).
  * The prospect visibility filter (`feed.ts:112`).
  * The OPEN-before-ENGAGED rank (`feed.ts:86`).
  * Each mutation above still passes 24/25; the one failure is the harness's own controller-identity check.
  * Why Minor: they label what the booking hangs on, and none gates a write. The prospect branch uses the same `opens()` predicate that the lead case does test.
  * **Fix**, when next touched, add three lines:
    * a CASE_REVIEW-purpose booking → `hangsOn.kind === "client"`;
    * a booking naming a prospect the viewer does not own (own only) → `hangsOn === null`, while the owner gets the prospect;
    * a person with a newer ENGAGED lead and an older OPEN one → the OPEN lead.
* **n4 Minor: `selfServiceLimitHours` rounds (`feed.ts:119`, `Math.round(limit / 60)`).** The public answer gives `minutes / 60` (`service.ts:963`), so a 90-minute limit reads "2 hours" to staff and 1.5 to the booker. **Fix:** use the same `/ 60`, or carry the minutes.

**Journey score at this head: 9.5/10.** That is 7.5 of the 8 criteria that apply, scaled; accessibility and visual quality are N/A (no screen).
* Correct data is now 1: no attendance buttons mid-meeting, and a case call is labelled as the client.
* Next step obvious is now 1: the screen gets the canceller and the limit from the server.
* Task completed stays 1, and the other criteria are unchanged.
* Trust and sources drops to ½ until n3's three branches are pinned.

**Verdict: Approve.** Nothing open blocks; the Minors n3 and n4 are for the next touch.

Reviewer: Approve 8f08879b1eed551967f084eb1a27e01798175db4
