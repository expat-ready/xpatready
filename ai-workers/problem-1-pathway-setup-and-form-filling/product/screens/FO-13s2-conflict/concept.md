# FO-13s part 2 concept: the Conflict check panel (R1.108)

Written 20 Nov 2026 (21 Nov IST) by the builder of FO-13c (#2478), on the tech lead's ask (Lead 7, series 3): "FO-13s, the conflict panel on screen, so R1.108 can reach Works". Brief: BACKLOG row FO-13s ("a Conflict check panel … on the lead-and-prospect screen … the step messages on Send, Convert and Signed offline"); `design/lead-b-briefs/FO-13s.md` (branch `lead-b-front-office`) covers part 1 only and says the conflict panel waits for FO-13c, which is now #2478. No board: the panel is a section on an existing page, so the tech lead approves after the fresh challenge (P-223 (4)).

## 1. Job and journey
Before a prospect becomes a client, the RCIC (or an assistant with `agent/conflict:check`) runs a conflict-of-interest search for the client and records the result, from the prospect page, where Convert lives. When the search finds records they cannot open, a manager confirms it from a link. Journey: lead → engage → **conflict check** (→ manager's confirmation) → Convert or retainer Send / Signed offline (FO-5), which the server refuses without a clearing check. R1.108; Code SOR/2022-128 s. 5, 15, 16 (trace t8 §1b; our product rule, the Code names no check step). Unconfirmed: no counsel.

## 2. Layers
* Data, rules, API: FO-13c (#2478): `POST conflict-checks/preview`, `POST conflict-checks` (`requestId`, `prospectId`, `result`, `disclosureText`), `GET prospects/:id/conflict-checks`, `GET conflict-checks/:id/for-confirmation`, `POST conflict-checks/:id/confirm`; refusals 409 `CONFLICT_*` on Convert, Send and Signed offline.
* **One small API addition** (this part, in FO-13c's service): the list answer gains `clearance: { ok: true } | { ok: false, code, detail }`, the gate's own verdict for this prospect (`gate.ts clearance`, its 409 caught), so the screen works out no rule (stale details, unconfirmed, cannot act). About 10 lines and one pass + fail line in `check_fo13c_conflict.ts`.
* UI: new `web/src/modules/front-office/compliance/conflict/` (panel, run-check side panel, confirm page, contract). Mounts: one line in `sales/prospect-page.tsx` (left column, below Prospect), one route `/front-office/conflict-checks/:id` for the confirmer.
* The team's code has no conflict screen: new, not a retrofit. Part 1's Identity panel is the pattern to match (section, side Panel, table).

## 3. Business rules (all enforced by the server; the screen shows them)
* BR-1 A check is insert-only; a correction is a new check (FO-13's triggers). No edit or delete.
* BR-2 The search uses the client's own current name, email and phone; the screen shows them read-only ("Searched for"), never asks for them.
* BR-3 Matches the user may not open are counted, never named: "N matches with records you cannot open: a manager who may see them must confirm this check." With any hidden match, the result choices are off and the button is "Record for confirmation" (#2478 M1).
* BR-4 POTENTIAL_CONFLICT needs disclosure text (shown as its own field, required), "printed in the retainer the client signs" (s. 15(1), 24(3)(o)).
* BR-5 The gate's verdict is shown as the panel's status, word for word from `clearance.detail`; Convert's panel shows the same words when the server refuses it.
* BR-6 A Save makes one `requestId`; a retry after a lost answer reuses it (STANDARDS §4).
* BR-7 Keys: the panel shows with `agent/prospect:show`; Run a check only with `agent/conflict:check`; without it one plain line says why (BIC-18).
* BR-8 Confirm: only another staff member who sees every record or the firm's Owner/Admin; the confirm page shows the check and the matches searched again (`matchesNow`), then the result choices; the checker sees "Waiting for a manager's confirmation" and a copyable link.
* BR-9 Other parties on cases are not searched yet (no `PartySearchPort` adapter on main): the panel shows `scope` as an info line, never hides it.

## 4. Layout (Workspace section + Side panel, EXPERIENCE §3; team tokens through `@/components/ui/controls`)
* Section "Conflict check" in the prospect page's left column, below Prospect. Header: title, status chip and "Run a check" (outline button).
* Status (BR-5): ok → success Notice "Cleared: no conflict found · <who>, <when>"; not ok → warn/danger Notice with `clearance.detail`.
* History table, newest first: Checked (when, by whom) · Result (chip) · Matches (n named, n hidden) · Confirmed (by, when, or "Waiting"). A row opens its matches inline (disclosure, name and why matched: Email, Phone, Name; case matches grouped by case number).
* Run a check (side Panel, as Engage): on open it calls preview. Shows "Searched for" (BR-2), the matches table, the hidden line (BR-3), the scope line (BR-9). Then Result (radio: No conflict · Potential conflict · Cannot act), Disclosure (textarea, only for Potential; hint "Printed in the retainer the client signs"). Footer: Cancel and Save check / Record for confirmation.
* Confirm page `/front-office/conflict-checks/:id`: the check (client, searched for, who and when), matches now, Result radio + Disclosure, Confirm. 404 → "No check waiting for your confirmation" (the server's answer).
* Convert refused (409 `CONFLICT_*`): Convert's panel shows the detail and a "Go to the conflict check" link that scrolls to the section.
* States: loading skeletons; load error with Try again; empty: "No conflict check is recorded for this client. Run one before the client is converted or the retainer is sent."; saving (busy, locked); saved toast "Conflict check recorded." Widths 375 / 1024 / 1440 px (table stacks at 375).

## 4b. Best in class (judgment, from product knowledge; Unverified: no primary page read in this cloud lane)
Legal practice tools (Clio, PracticePanther, Smokeball) search contacts and matters in one box and save a conflict report with who and when. Copy: one search over everything, a saved report, the reviewer named. Beat: no typing (the client's own details are searched), the result gates Convert and Send by itself, hidden matches are counted instead of silently missed.

## 4c. Scorecard (BIC, the ones that apply)
BIC-01 ask once: search terms come from the person · BIC-04 incomplete is a state ("No check recorded") · BIC-11 one primary per panel (Save check / Confirm) · BIC-13 field errors on Disclosure and Result, summary at top · BIC-14 tooltips on chips · BIC-18 empty/loading/error drawn · BIC-19 one heading, one primary · BIC-20 keyboard, axe, 200 % zoom. BIC-02, -03, -05 to -10, -12, -15 to -17: N/A (no form questions, documents, filings or review queue here).

## 5. Copy
Run a check · Save check · Record for confirmation · Confirm check · Searched for · "Matches with records you cannot open: a manager who may see them must confirm this check." · "Other parties on cases are not searched yet." · "Printed in the retainer the client signs." · results: No conflict / Potential conflict / Cannot act. Server sentences (clearance, refusals) word for word.

## 6. Contract and tests
* `compliance/conflict/contract.ts` (zod): preview `{ searched, matches[], notStored, hiddenCount, hiddenLine, scope }`; list `{ checks[], scope, clearance }`; for-confirmation `{ …check, matchesNow[], hiddenNow }`.
* `tests/check_fo13s_conflict_browser.ts` (Playwright, isolated copy), pass + fail each: BR-3 a hidden match → choices off, "Record for confirmation", status Waiting; BR-4 Potential without disclosure → field error, nothing stored; BR-5 status cleared after a check, stale after the email changes; BR-7 a read-only user sees no Run a check; BR-8 the checker's confirm page → 404 sentence, the Admin confirms → status cleared; Convert refused shows the detail and the link. Keyboard only, axe-core, 375/1024/1440 with no sideways scroll.
* `tests/journeys/j_108.ts` (J-108, new): prospect → Convert refused (the sentence) → Run a check → a match with a current client listed → Save No conflict → status Cleared → Convert succeeds; second prospect with a hidden match → Record for confirmation → Admin opens the link, confirms → Convert succeeds; a retainer Send through the API before/after (no retainer screen on main: scaffolding, named so).

## 6b. Capability or scaffolding
All elements are the capability (P-33). The retainer Send step in J-108 goes through the API (FO-5s not built), named as scaffolding.

## 7. Questions (recommendation first)
1. Include the confirm page (`/front-office/conflict-checks/:id`) in this part? **Recommend yes**: without it a check with hidden matches can never clear on screen, so R1.108 is not Works for firms with "everyone sees all" off. Cost ~120 lines; the PR stays under 800 with J-108.
2. The `clearance` field on the list answer (an FO-13c API addition, ~10 lines + test) in this screens PR? **Recommend yes**: otherwise the screen re-implements the stale-details rule. Needs #2478 merged first.
3. Mount on the lead page too? **Recommend no**: a check needs a prospect (`prospectId`); the lead page has none until Engage.

## Definition of ready
Acceptance: `tests/check_fo13s_conflict_browser.ts` and `tests/journeys/j_108.ts` green twice. Row text: BACKLOG FO-13s (conflict panel half). Decisions: P-579, P-768 (FO-13c size), #2478 merged. Concept approved by the tech lead after `challenge.md`. Ends with `Completes: R1.108`.
