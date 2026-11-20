# FO-13s part 2: fresh challenge (the Conflict check panel, R1.108)

Written 20 Nov 2026 by a fresh challenger that did not draft `concept.md` (screen-concept skill, section B). It challenges `concept.md` at ae779e6dd on `claude/screens-fo13s-conflict`.

**Read:**
* the concept;
* the BACKLOG row FO-13s (BACKLOG.md:369);
* the brief `design/lead-b-briefs/FO-13s.md` (branch `lead-b-front-office`). It covers part 1 only, and its line 17 says the panel waits for FO-13c;
* FO-13c, PR #2478 (open; head 5a6bf2070 on `origin/claude/nice-fermi-pts7f3`): `compliance/conflict/{service,gate,routes}.ts`, `sales/prospects.ts` `winProspect`, `retainers/service.ts` send and signedOffline, and the PR body;
* part 1 on main: `compliance/identity/*`, the mounts in `lead-page.tsx` and `prospect-page.tsx`, `screens/FO-13s/{concept,challenge}.md`, PR #2309;
* `prospect-page.tsx`, `prospect-actions.tsx` `useOwners`, `platform/session.ts` `StaffApiError`, `platform/settings.ts` `EVERYONE_SEES_ALL`, `prisma/schema/front-office-compliance.prisma`;
* PRODUCT.md, STANDARDS.md §2–§6, EXPERIENCE.md §2–§6, QUALITY.md, RULES.md P-610/P-686, WAY-OF-WORKING.md, `tools/pr-size.sh`.

`ai-workers/tools/freshness.sh` fails in this cloud copy because `code/README-copies.md` is missing, and there is no `code/` capture. So the statement "the team's code has no conflict screen" is **Unverified**.

S = `ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio`. "PR" = #2478 at 5a6bf2070.

## Verdict
**Build after these changes.**

The concept puts the panel in the right place and leaves every rule on the server. It asks the server for the gate's verdict instead of working out the stale-details rule itself. Three things must change before the build:
* **who** is not in the API answer, so the screen cannot show it;
* after a potential conflict the status would say "no conflict found";
* the work does not fit in one PR under 800 lines.

A fourth change is to the row's touch list. No Blocker.

## Objections

### Blocker
None.

### Major

**M1. The screen cannot show who checked or who confirmed: the API returns staff ids only.** *Needed for the proof.*
* **What breaks:** R1.108 says the check is "recorded with who". The concept shows "Cleared … · <who>, <when>", "Checked (when, by whom)" and "Confirmed (by, when)". FO-13c's answers return `checkedBy` and `confirmedBy` as raw uuids. The concept's single API addition (`clearance`) adds no names. The only name source on the prospect page is `useOwners`, which reads `leads/assignees` and falls back to "A colleague". An Admin who confirms is usually not an assignee, so the confirmer would show as "A colleague".
* **Example:** a Case Officer records a check with a hidden match. The Admin confirms it. The checker's history reads "Confirmed by A colleague".
* **Evidence:** PR `service.ts:123` (`checkedBy: c.checkedBy, … confirmedBy: c.confirmedBy`, ids). `web/.../sales/prospect-actions.tsx:19`. Part 1 had a name from its API: `compliance/identity/contract.ts:8` `checkedBy: { staffId, name }` and FO-13i `service.ts:209` `r.checker.displayName`. The relations already exist: `prisma/schema/front-office-compliance.prisma` `checker` / `confirmer`. Confidence: high.
* **Fix:** add the names to the same small API addition.
  * `view()` gains `checkedByName` and `confirmedByName`. They come from `include: { checker: { select: { displayName } }, confirmer: … }` in `list`, `forConfirmer`, `record` and `confirm`.
  * Keep the id fields so existing callers do not break.
  * About 8 lines, plus one pass line in `check_fo13c_conflict.ts`.
  * The contract gains the two strings, and the panel shows them.

**M2. After a potential conflict the status says "Cleared: no conflict found", and Convert is still refused.** *Needed for the proof.*
* **What breaks:** `clearance` lets a `POTENTIAL_CONFLICT` check through, so the gate answers ok. BR-5 and §4 turn every ok into "Cleared: no conflict found · …", which is false for a potential conflict. The win then refuses Convert with `CONFLICT_CONSENT_NEEDED` because there is no signed retainer. Send and Signed offline refuse a version without the disclosure (`CONFLICT_DISCLOSURE_NOT_PRINTED`). For both refusals the concept offers "Go to the conflict check", but a new check fixes neither of them. The fix is the signed retainer that prints the disclosure. An RCIC told "no conflict found" may also tell the client so.
* **Example:** Save Potential conflict with a disclosure → the status reads "Cleared: no conflict found" → Convert → "A potential conflict needs the client's written consent … Record the signed retainer instead of converting." → "Go to the conflict check" → the RCIC runs another check, and the same thing happens.
* **Evidence:**
  * PR `gate.ts:83-91`: `clearance` returns the check for `POTENTIAL_CONFLICT`.
  * PR `gate.ts:108-115` and `gate.ts:23`: `clearForWin` gives `NO_CONSENT`.
  * PR `gate.ts:22, 102-104`: `assertDisclosurePrinted`.
  * Concept lines 19, 27 and 31.
  * Confidence: high.
* **Fix:** presentation only, with no new rule.
  * When `clearance.ok`, name the status by the result of `checks[0]`. That is the same row the gate reads, because `latestCheck` and `list` sort the same way (`checkedAt desc, id desc`).
    * `NO_CONFLICT`: "Cleared: no conflict found · <who>, <when>".
    * `POTENTIAL_CONFLICT`: "Potential conflict recorded · <who>, <when>", with the disclosure text and the concept's existing hint "Printed in the retainer the client signs."
  * Show "Go to the conflict check" only for the four codes a check can fix: `CONFLICT_CHECK_REQUIRED`, `CONFLICT_CHECK_UNCONFIRMED`, `CONFLICT_CHECK_STALE` and `CONFLICT_CANNOT_ACT`. For other refusals the server's sentence stands alone.
  * Add one browser line: Potential conflict → the status is not "Cleared", and Convert shows the `NO_CONSENT` sentence word for word.

**M3. One PR under 800 changed lines, with tests, J-108 and the confirm page, is not realistic.** *Needed for the proof.*
* **What breaks:** P-610 caps a row's PR at 800 changed lines, tests included. `pr-size.sh` counts every line GitHub counts, including concept.md and challenge.md. Part 1 was a single panel with no confirm page and no API change, and it merged at **998 additions** (PR #2309). It reached that through 687 lines first, then review fixes of +163/−15 and break fixes of +90/−8.

  Part 2 holds:
  * the section with status and history, and inline match rows grouped by case;
  * the Run panel with preview, matches table, hidden line, scope, result radios and disclosure;
  * a confirm page and its route;
  * a contract with three shapes;
  * the API addition plus names (M1) and its test lines;
  * a browser suite covering six rules, each with a pass and a fail case, plus Convert;
  * J-108 with two walks, an Admin login, the "everyone sees all" setting turned off for the hidden walk, and a retainer through the API.

  Measured against part 1, that comes to about 1,100–1,300 lines before review and break fixes. The concept's "~120 lines; the PR stays under 800" (line 52) is not supported. The last overrun needed a recorded exception (P-768, #2478).
* **Evidence:** `gh api …/pulls/2309`: 998 additions, 26 files. RULES.md:52 P-610. `tools/pr-size.sh:2-15`. Confidence: high that it goes over 800; medium on the exact number.
* **Fix:**
  1. Land `concept.md` and `challenge.md` in a records PR before the build. Records PRs have no size limit (P-686), which saves about 200 lines.
  2. Split into two PRs:
     * **PR A:** the section, Run a check, the API addition (`clearance` and names), the Convert link, the browser suite for BR-1/2/4/5/6/7/9, and J-108's first walk with the retainer scaffolding. It ends `Completes: R1.108`.
     * **PR B:** the confirm page and route, the hidden-match browser lines (BR-3, BR-8), and J-108's second walk.

     PR A stands on its own in the default firm. `platform.everyone_sees_all` defaults to `true` (`platform/settings.ts:241-244`), and SA6-D1 seeds `view.all` on every starter role. So no front-office match is hidden there, and the case port is not connected (`service.ts:34`). That makes the hidden path reachable only once a firm turns the setting off. The tech lead decides the split; founder question 1 asks whether R1.108 counts as Works after PR A.

**M4. The API addition edits FO-13c's files, which are not in FO-13s's touch list.** *Needed for the proof.*
* **What breaks:** the concept edits `compliance/conflict/service.ts` and `tests/check_fo13c_conflict.ts` (concept line 10). Row FO-13s touches only `web/src/modules/front-office/compliance/` and its browser test. #2478 still owns both files and is open. Lanes whose touch lists overlap never run at once (the baton rule), and a row must name what it touches before it is Ready.
* **Evidence:** BACKLOG.md:369 (Touch). WAY-OF-WORKING.md:21 (Ready, touch, baton). Concept DoR line 57: "#2478 merged". Confidence: high.
* **Fix:** once #2478 merges, the tech lead adds the two API files, `j_108.ts` and the route line to FO-13s's touch list. Or the tech lead opens a runtime row of about 20 lines first for `clearance` and the names, and the screens PR builds on it. The concept's Q2 then becomes this row change, not a founder question (see m9).

### Minor

**m1. Some server sentences are retyped rather than shown from the answer.** *Needed for the proof.*
* The hidden line in BR-3 and §5 says "…a manager who may see them **must confirm** this check." The server's line (PR `service.ts:35` `HIDDEN_LINE`) is "Matches with records you cannot open: a manager who may see them confirms this check."
* §5's scope line ("Other parties on cases are not searched yet.") cuts off `NOT_SEARCHED` (`service.ts:34`).
* The preview's `notStored` (more than 200 found) is in the contract but nowhere in the layout.
* Fix: render `hiddenLine`, `scope` and, when it is above zero, `notStored` from the answer. Show the count apart from the sentence, as "N hidden". That keeps BR-5's "word for word". Confidence: high.

**m2. When the search changes between preview and Save, the server refuses the Save, and the concept does not say what the screen shows.** *Needed for the proof.*
* `record` runs the search again (PR `service.ts:160-163`):
  * if a hidden match has appeared, a chosen result gets 409 `NEEDS_CONFIRMATION`;
  * if the hidden match has gone, a Save without a result gets 400 `fields.result` (`service.ts:129, 161`).
* Fix:
  * On `NEEDS_CONFIRMATION`, run preview again and show the fresh matches, with the server's sentence at the top of the panel. Keep the `requestId`, since nothing was stored.
  * On `fields.result`, turn the choices on and show the sentence on Result, using part 1's error summary (BIC-13).
* Confidence: high on the API behaviour. The case is rare.

**m3. BR-6 repeats the `requestId` wording that part 1's challenge flagged.** *Needed for the proof.*
* "A Save makes one requestId" can be read as one id per click.
* Fix: as part 1 does (`identity-panel.tsx:88-90, 110`), make the id once when the panel opens and keep it through field errors and lost answers. Make a new one after a success, after `REQUEST_REUSED`, or when the panel opens again. Evidence: `screens/FO-13s/challenge.md` M2. Confidence: high.

**m4. The mount and the Convert step are described as layouts the page does not have.** *Needed for the proof.*
* The prospect page's grid has the Prospect section on the left and the Actions aside on the right (`prospect-page.tsx:112-131`). The Identity panel sits at full width after the grid (line 133).
* A section placed in the grid's left column lands on a new grid row.
* Convert is a `Dialog` (lines 160-164), not a panel. Its `general` Notice already shows any 409 detail word for word: `onError` closes only on STALE, TERMINAL, ALREADY_WON and NOT_WON (lines 54-62). `StaffApiError.message` is the server's `detail` (`platform/session.ts:64`).
* Fix:
  * Mount at full width between the grid and the Identity panel, for both Individual and Corporate prospects. Do not copy Identity's `p.person` condition, because a company is a party too (PR `gate.ts:39-43`).
  * Write that the refusal text in the Convert dialog already exists, so only the link is new.
* Confidence: high.

**m5. Prevent the error before showing it (EXPERIENCE §2.8 [M]).**
* The concept shows the gate's reason only after "Yes, convert to client" is refused. Meanwhile the dialog still shows "Work can start…" (`NOT_SIGNED`, line 163).
* The page already holds `clearance` from the list answer.
* Fix: when `clearance` is not ok, the Convert dialog shows its detail and the link above the buttons, about 3 lines. The server still decides.
* *Needed for the proof.* Confidence: medium (judgment).

**m6. A company prospect searches the name only.**
* For a company party, `termsOf` returns `email: null, phone: null` (PR `gate.ts:48-50`). "Searched for" must not show two empty rows.
* Fix: show the name and "Email and phone: not searched for a company". Add one browser line on a Corporate prospect, or name it in J-108.
* *Needed for the proof.* Confidence: high.

**m7. Some states on the confirm page are missing (PR B).**
* Someone without `agent/conflict:check` gets 403 from the route guard (`routes.ts:21, 24`), not only 404.
* After Confirm, the page must say what changed, for example "Confirmed. The checker can now send the retainer or convert." It must not link to the prospect: the Admin gets 404 there (PR body DW6).
* `confirm` can also answer 409 `ALREADY_CONFIRMED` / `RESULT_FIXED` or 403 "hidden from you too" (`service.ts:194-202`). Show each one in the server's words.
* *Needed for the proof.* Confidence: high.

**m8. Name what FO-13c handed to FO-13s and this concept leaves out.**
* #2478's "Minors left open" passes two items to FO-13s:
  * "No list of checks waiting for a confirmer (FO-13s)";
  * "Checks are not on the sales timeline yet (FO-13s or a follow-up)".
* The concept is right not to build them, since the copyable link stands in for a waiting list. It should still list both as Not built, so the hand-over does not silently drop them.
* *Not built.* Confidence: high.

**m9. The concept's three questions are not founder questions.**
* Q2 (`clearance` in this PR) is not a choice. STANDARDS keeps rules on the server, and the concept itself says "otherwise the screen re-implements the stale-details rule". The stale rule needs `personNameKey` and `phoneE164Exact` (PR `gate.ts:61-65`), so the server must give the verdict. Where the code goes is M4's row question for the tech lead.
* Q3 (the lead page) is settled by the API: `prospectId` is required (`service.ts:53`). The recommendation, no, is correct.
* Q1 mixes a size call (the tech lead's, M3) with a product scope call. Only the scope call is the founder's (see Questions below).
* Confidence: high.

**m10. The label "Cannot act" can be misread.**
* Next to "No conflict" and "Potential conflict", "Cannot act" can read as "I cannot do this check".
* The server's meaning is "a conflict the firm cannot act in" (`gate.ts:20`).
* Fix: label it "Conflict: the firm cannot act", and add a one-line hint saying it blocks the retainer and Convert.
* *Needed for the proof.* Confidence: medium (copy judgment).

## What is sound
* **Placement.** The prospect page is where Convert lives, and a check needs a `prospectId`. Not mounting on the lead page is correct.
* **No server rule is re-implemented.**
  * The screen sends the result and disclosure and nothing else.
  * The search terms are the person's own details (BR-2, BIC-01).
  * The stale, unconfirmed, cannot-act and required rules are read from the gate's own verdict. Catching `clearance`'s 409 inside `list` is the right way to do it. `problem()` throws an `HttpException` that carries `code` and `detail` (`platform/identity/keys.ts:62-63`), so about 10 lines does it. Catch only status 409 and re-throw anything else.
  * One gap remains: the status wording after a potential conflict (M2).
* **Hidden matches.** They are counted, never named. With a hidden match the result choices are off and the button becomes "Record for confirmation". This matches `record` exactly (PR `service.ts:161-163`).
* **The confirm page reads `for-confirmation`.** The confirmer sees `matchesNow` before choosing a result, and the server's 404 sentence covers the checker opening their own link (`service.ts:216-221`).
* **Insert-only (BR-1).** There is no edit or delete, and a correction is a new check. This matches FO-13's triggers and DW6.
* **Keys (BR-7).** The list needs `agent/prospect:show`, and Run needs `agent/conflict:check`, matching `routes.ts:15-28`. Without the key the panel says why in one line.
* **Patterns.** It reuses part 1: a section with one outline header button, a side `Panel` with one primary button, the Loading skeleton, a Notice with Try again, and an empty state that teaches. This fits EXPERIENCE §3 and BIC-11/18/19.
* **Tests.** The plan has a pass and a fail case per rule, plus keyboard, axe and the three widths. The retainer Send in J-108 is named as scaffolding (P-33), honestly.
* **Legal labels.** The Code points come from the server's sentences, each marked "Unconfirmed: no counsel" (AGENTS rule 4).
* **Immigration fit.** Not applicable: the panel holds no program, form, fee or threshold value.
* **Scope.** No gold-plating found. Not building the waiting list or a timeline entry is correct (m8 only asks to name them).

## Back-end plan (element → record → API → rule → test)
| Element | Record | API | Rule | Test |
|---|---|---|---|---|
| Section status | `fo_conflict_check` (latest for the party) | `GET prospects/:id/conflict-checks` + new `clearance` (gate's 409 caught) | `gate.ts clearance`: REQUIRED / UNCONFIRMED / CANNOT_ACT / STALE; ok named by `checks[0].result` (M2) | `check_fo13c_conflict.ts` +1 pass/fail on `clearance`; browser BR-5 cleared → stale after email change; Potential → not "Cleared" |
| Who and when | `checked_by`/`confirmed_by` → `platform_staff.display_name` (existing relations) | the same GET, + `checkedByName`/`confirmedByName` (M1) | none (display) | `check_fo13c_conflict.ts` +1 line; browser: names in the history |
| History rows and matches | `fo_conflict_check.matches`, `hidden_count` | the same GET (`view`: named to checker, confirmer, sees-all; else counted) | BR-1, BR-3 (`service.ts:112-125`) | browser: a read-only reader sees counts only |
| Run a check: preview | none (read-only) | `POST conflict-checks/preview` | BR-2 terms are the party's own; BR-9 `scope`; `notStored` | browser: "Searched for" read-only; scope line verbatim (m1) |
| Save check | `fo_conflict_check` insert, audit line, `conflict.checked` event | `POST conflict-checks` with `requestId` per panel opening (m3) | BR-3 hidden → no result (409 `NEEDS_CONFIRMATION`); BR-4 Potential needs disclosure (400 `fields.disclosureText`); replay → same check; `REQUEST_REUSED` → new id | browser BR-4 pass/fail; lost-answer retry → one row by API count; J-108 walk 1 |
| Convert link and dialog | `fo_prospect` (won) | `POST prospects/:id/convert` → `winProspect` → `clearForWin` | the link only for the four check codes; `CONSENT_NEEDED` shows its sentence alone (M2); `clearance` shown before the click (m5) | browser: Convert refused shows the detail and the link; J-108 refused → check → Convert succeeds |
| Retainer Send (scaffolding) | `fo_retainer` | `POST retainers/:id/send` via the API | `conflictCleared` + `assertDisclosurePrinted` | J-108 Send refused before, sent after (named scaffolding) |
| Confirm page (PR B) | `fo_conflict_check.confirmed_by/at` (+ result) | `GET conflict-checks/:id/for-confirmation`, `POST conflict-checks/:id/confirm` | BR-8: not the checker (403), only sees-every-match (404); once (409); hidden from them too (403) | browser BR-8: the checker → 404 sentence; Admin confirms → status cleared; J-108 walk 2 with "everyone sees all" off |
| Mount | none | none | full width below the grid, Individual and Corporate (m4, m6) | browser: panel on a Corporate prospect, name-only line |

No migration. The API change is about 20 lines in FO-13c's `service.ts` (`clearance` and names) plus about 3 test lines, after #2478 merges and with the touch list fixed (M4).

## Questions for the founder
1. **Should R1.108 count as Works once PR A merges, with the manager's confirm page following as the next PR?** **Recommended: yes.** In a firm with "everyone sees all" on, the default, nothing is hidden, so every check clears on screen without a confirmation. The confirm page matters only to firms that turn that setting off, and it follows straight after as PR B. The alternative keeps R1.108 Partial until both PRs merge, or asks for a second size exception for one PR of about 1,200 lines.

## Lead response
*Builder's proposal, for the tech lead to accept or change (20 Nov, after the challenge):* every objection is taken in `concept.md` rev 2. M1: `checkedByName`/`confirmedByName` added to the list answer. M2: status worded by the latest check, "Potential conflict" never "Cleared", the link only for the four codes a new check fixes. M3: split proposed (records PR, then PR A completing R1.108, then PR B the confirm page), concept §7 Q1. M4: the API additions wait for #2478's merge and the tech lead's touch-list line, §7 Q2. m1-m10: taken as written (server sentences from the answer, preview-to-save change handled, one `requestId` per opening, full-width mount for both prospect types, pre-click reason in the Convert dialog, company searched by name said, confirm-page states, the two Not built items named, "Conflict: the firm cannot act"). Founder question carried as §7 Q3.

## Agreement
**Approved by the tech lead (Lead 8, series 3), 21 Nov ~03:3x IST, with the challenge's changes (P-223 (4)).** Q1: split as proposed (this records PR, then PR A, then PR B). Q2: once #2478 merges, the Lead adds `compliance/conflict/service.ts`, `tests/check_fo13c_conflict.ts`, `tests/journeys/j_108.ts` and the route line to FO-13s's touch list; PR A is built on #2478's branch until then. Q3 (Works on PR A alone) goes to the founder at 07:00; both A and B are built tonight (P-774), so `Completes: R1.108` goes on PR B unless the founder says otherwise. The waiting list and the timeline entry are Not built (m8). `clearance` catches only the gate's 409 and re-throws anything else. Breaker on A and B.

## Build discoveries
