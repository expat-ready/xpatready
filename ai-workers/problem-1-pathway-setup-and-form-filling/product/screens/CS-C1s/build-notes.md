# CS-C1s part 2: build notes (Decision and closing on the case page)

Row CS-C1s part 2 (brief `design/build-lead-c-briefs/CS-C1s.md` on `claude/build-lead-c-647b40` a7014c0bb; concept r2 `concept.md`, approved for building by Build Lead C, 18 Nov 23:0x IST). Release 1 row R1.77, bug QA-502. Base: part 1's head (#2132, `claude/serene-newton-knjcpc` 2444d3a7), the overlapped chain. Outcome words: **Sample** (AG-7-33 rule 4: "The decision vocabulary comes from the pack"; no official IRCC page cited). Legal points: **Unconfirmed: no counsel**.

## Top 5 production improvements over the board
1. The panel reads its own route (`GET …/decisions`), so rows of every stage show, not only the current stage's (board frame 1 drew one stage).
2. `can` comes from the server, from the same state checks as the four acts; the screen holds no rule (DS1 parity cases keep them in step).
3. A decision dialog carries one idempotency key per opening: a double click or a lost answer records one row.
4. A refusal arrives in the dialog in plain words (concept §5), "Nothing was changed.", and the panel reads again so the acts on offer match the case now.
5. The staff sign-in is inline in the panel (the same `SignInCard`, `embedded`), replaced by the rows as soon as the session exists; the rest of the case page keeps the simulated person.

## Files changed
* `api/src/case-close.ts`: `CaseClose.view` (read only, no lock; firm-scoped as `locked`, 404 for another firm, an unknown or malformed id). The four acts are unchanged.
* `api/src/features/case-close.ts`: `GET api/runtime/cases/:id/decisions`, `@PermissionKeys("agent/case:show")`.
* `contracts/runtime.ts`: `CaseDecisionsView` (zod), the response shape; the screen parses it.
* `web/src/runtime/case-decision.tsx` (new): `CaseDecisionPanel`, `CaseStatusPill`, `CaseEndLine`, four dialogs.
* `web/src/runtime/cases.tsx`: mount lines only (one import, the status pill and closing line in the header, the panel under Submission to IRCC).
* `web/src/modules/platform/frame.tsx`: `SignInCard` gains `embedded` (h3 heading, no card frame, the same words) — named in concept §6's touch list.
* Module cards `api/src/MODULE.cases.md`, `web/src/runtime/MODULE.md` (entry point and test lines).
* Tests: `tests/check_csc1s_view.ts` (DS1, DS2), `tests/check_csc1s_decision_browser.cjs` (DS3-DS5).
* Not changed: `runtime.ts`, `cases.prisma`, any migration, `start.sh` (see the question below).

## Team-name mapping
No team code for a case decision was found (concept §2). Words follow AG-07 v3.12: decision, withdraw, close, reopen; `closeOutcome` WITHDRAWN · CLOSED_BY_STAFF · COMPLETED (Sample).

## Mock vs real
Real: the four acts, their audit lines and outbox events (CS-C1a/b), the read, the staff session and keys (PF-3, PF-4). Stand-in: PF-4's local sign-in (no provider pages yet). Sample: every outcome word, marked with a "Sample" tag and its tooltip.

## Checks run (STANDARDS sections)
* §2 rules: every BR in concept §3 has a pass and a fail case: DS1 (BR-2, -3, -4, -5, -6, -7 parity), DS2 (keys), DS3-DS5 (screen).
* §4 contract: zod response shape; Problem Details passed through; idempotency key on decisions (DS5 double click: one row).
* §6 authorisation: server only; no key → no act offered, a forced call 403 (DS5); another firm 404 (DS1).
* §7 accessibility: axe WCAG 2.2 AA clean on the panel (signed out, open, closed, 375 px) and on each dialog with its errors and a refusal; headings h2 panel, h3 rows and embedded sign-in; focus returns to the opener, or to the panel heading when it is gone.
* §8 sizes: 1440 and 375 px walked (the brief's widths); at 375 the acts are full width and the page has no sideways scroll. 1024 not walked separately (the layout is the same flex rows as 1440): an [S] gap, named.
* Results on this branch (cloud copy, 18 Nov, after the review fixes): `check_csc1s_view.ts` 26 pass 0 fail; `check_csc1s_decision_browser.cjs` 52 pass 0 fail; type check: no new errors (15 known).
* Regression on the cloud copy (head fa22d256, before the fixes; the fixes touch only this row's files): `check_csc1_close` 55/55, `check_case_feed` 39/39, `check_c82_filing_numbers` 13/13, `check_csc1_count` 40/40, `check_c82_filing_record_api` 24/24, `check_c82_record_api` 71/71, `check_c82_record_browser` 40/40, `check_c69_page_browser` 55/55, `check_b78_sp_case_browser` 8/8, qa's `check_r177_case_decision` **46/46** (its screen line passes now).

## Self-score D1-D20 (honest)
D1 job 9 · D2 rules shown 9 · D3 data 9 · D4 contract 9 · D5 states 8 (terms-not-accepted 428 shown in words, not walked) · D6 copy 8 · D7 layout 8 · D8 a11y 9 · D9 keyboard 8 (Radix dialogs; not walked by keys alone) · D10 responsive 8 · D11 performance 8 (one extra GET per case page with a session; not measured against a budget) · D12 errors 9 · D13 security 9 · D14 audit 9 (existing) · D15 tests 9 · D16 docs 8 · D17 AI N/A · D18 cost US$0 · D19 brand 8 · D20 maintainability 8.

## Known gaps
* The other case panels on a closed case still offer their actions (AG-7-34 rule 4): a follow-up row (concept §3).
* An earlier-stage filing never submitted keeps Close off for ever; named on screen; a follow-up row decides the rule (§7 Q2 ruling).
* A decision date after today is accepted by the API (up to 2200): a follow-up row, no change to the four acts here.
* The header's closing line needs the staff session; without one the header shows the "Closed" pill only (concept §4).
* `start.sh` does not set `PLATFORM_IDENTITY=local` / `PLATFORM_SAMPLE_SEED=on`, so on :4400 the staff sign-in is refused (403 `LOCAL_SIGN_IN_OFF`, checked by Build Lead C 18 Nov): asked in the PR as a question for the tech lead, not decided here.

## AI cost
None. Live AI off; no model call; US$0.

## Review and break findings (fresh reviewer `review.md`, breaker `break-report.md`, both on fa22d256)
* **M1 (both): the header's "Decision:" could name a removed filing's outcome or only the last one.** Fixed: the read's `case.decisions` is each *active* filing's latest decision (`case-close.ts`), the header says "Decision: X" when they agree and "Decisions: X for A, Y for B" when not. DS1 case "break M1" (a removed filing's Refused is not the case's decision).
* **M2 (both): an act sent after the session ended vanished.** Fixed: the panel says "<act> was not sent: nothing was recorded", with the reason (signed in elsewhere, expired); what was typed is kept and the dialog opens again with it after the inline sign-in ("What you typed is kept. Nothing was sent yet."). A 401 on the POST leaves it to the panel. DS5 case "break M2" / "review M2".
* Review m1 focus after the inline sign-in: now on the panel heading. m2 tooltips: the app's `Tip`, focusable. m3 the counter stays visible under an error; the empty-date message is "Give the date." (the API's own words stay as they are). m4 the four POSTs are now literal `staffApi(...)` calls; note that `graph.mjs` reads `api(...)` calls only, so no `staffApi` call in the app is on its graph (front office too): a tool follow-up, not this row.
* Break m3 the other-firm notice no longer shows the firm key. m4 a 403 says "Your role does not allow this now…" and the person's keys are read again. m6 notes and reasons are isolated (`<bdi>`) for right-to-left text.
* **Held, follow-up rows (outside this row's touch list: the older acts' checks in `contracts/runtime.ts`, CS-C1):** break m1/m2 reasons or notes of other invisible characters (soft hyphen, U+2800, U+3164, bidi and tag characters) are accepted; m7 dates before the submission (1900-01-01) are accepted. Break m5: with no staff session a withdrawn case's header pill says "Closed" (the case read gives `status` only; concept §4 names the header as session-dependent).
* The reviewer counted 45/45 on qa's R1.77 check; this copy counts 46/46 (the brief's figure). Not verified why the reviewer's copy counted one fewer.
