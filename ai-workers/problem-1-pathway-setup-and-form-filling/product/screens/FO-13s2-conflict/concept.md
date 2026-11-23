# FO-13s part 2 concept: the Conflict check panel (R1.108)

Written 20 Nov 2026 (21 Nov IST) by the builder of FO-13c (#2478), on the tech lead's ask (Lead 7, series 3): "FO-13s, the conflict panel on screen, so R1.108 can reach Works". Brief: BACKLOG row FO-13s ("a Conflict check panel … on the lead-and-prospect screen … the step messages on Send, Convert and Signed offline"); `design/lead-b-briefs/FO-13s.md` (branch `lead-b-front-office`) covers part 1 only and says the conflict panel waits for FO-13c, which is now #2478. No board: the panel is a section on an existing page, so the tech lead approves after the fresh challenge (P-223 (4)).

## 1. Job and journey
Before a prospect becomes a client, the RCIC (or an assistant with `agent/conflict:check`) runs a conflict-of-interest search for the client and records the result, from the prospect page, where Convert lives. When the search finds records they cannot open, a manager confirms it from a link. Journey: lead → engage → **conflict check** (→ manager's confirmation) → Convert or retainer Send / Signed offline (FO-5), which the server refuses without a clearing check. R1.108; Code SOR/2022-128 s. 5, 15, 16 (trace t8 §1b; our product rule, the Code names no check step). Unconfirmed: no counsel.

## 2. Layers
* Data, rules, API: FO-13c (#2478): `POST conflict-checks/preview`, `POST conflict-checks` (`requestId`, `prospectId`, `result`, `disclosureText`), `GET prospects/:id/conflict-checks`, `GET conflict-checks/:id/for-confirmation`, `POST conflict-checks/:id/confirm`; refusals 409 `CONFLICT_*` on Convert, Send and Signed offline.
* **Small API additions** (in FO-13c's service, after #2478 merges; files outside FO-13s's touch list, so the tech lead adds them, challenge M4): the list answer gains `clearance: { ok: true } | { ok: false, code, detail }`, the gate's own verdict for this prospect (`gate.ts clearance`, only its 409 caught), so the screen works out no rule; each check gains `checkedByName` and `confirmedByName` from the `checker`/`confirmer` relations, so "recorded with who" shows a name, not an id (M1). About 20 lines and pass + fail lines in `check_fo13c_conflict.ts`.
* UI: new `web/src/modules/front-office/compliance/conflict/` (panel, run-check side panel, confirm page, contract). Mounts: one line in `sales/prospect-page.tsx` (full width under the Prospect grid, Individual and Corporate alike; m4), one route `/front-office/conflict-checks/:id` for the confirmer (PR B, see §8).
* The team's code has no conflict screen: new, not a retrofit. Part 1's Identity panel is the pattern to match (section, side Panel, table).

## 3. Business rules (all enforced by the server; the screen shows them)
* BR-1 A check is insert-only; a correction is a new check (FO-13's triggers). No edit or delete.
* BR-2 The search uses the client's own current name, email and phone; the screen shows them read-only ("Searched for"), never asks for them.
* BR-3 Matches the user may not open are counted, never named: the count and the server's `hiddenLine`, word for word (m1). With any hidden match, the result choices are off and the button is "Record for confirmation" (#2478 M1). If the search changed between preview and Save (409 `NEEDS_CONFIRMATION`, 400 `fields.result`), the panel searches again and shows the server's words (m2).
* BR-4 POTENTIAL_CONFLICT needs disclosure text (shown as its own field, required), "printed in the retainer the client signs" (s. 15(1), 24(3)(o)).
* BR-5 Status, worded by the latest check (the row the gate reads; M2): no check, or `clearance.ok === false` → `clearance.detail` word for word; `NO_CONFLICT` and ok → "Cleared: no conflict found · <name>, <when>"; `POTENTIAL_CONFLICT` and ok → "Potential conflict: the client must read the disclosure in the retainer and sign it before becoming a client" (not "Cleared"). The Convert dialog shows `clearance.detail` before the click when not ok (EXPERIENCE §2.8; m5) and the server's refusal after; its "Go to the conflict check" link appears only for `CONFLICT_CHECK_REQUIRED`, `_UNCONFIRMED`, `_STALE` and `CONFLICT_CANNOT_ACT`, never for the disclosure or consent codes, whose fix is the retainer.
* BR-6 One `requestId` per opening of the Run a check panel; a retry after a lost answer reuses it; a new opening makes a new one (STANDARDS §4; m3).
* BR-7 Keys: the panel shows with `agent/prospect:show`; Run a check only with `agent/conflict:check`; without it one plain line says why (BIC-18).
* BR-8 Confirm: only another staff member who sees every record or the firm's Owner/Admin; the confirm page shows the check and the matches searched again (`matchesNow`), then the result choices; the checker sees "Waiting for a manager's confirmation" and a copyable link.
* BR-9 The server's `scope` line (other parties on cases not searched yet) and `notStored` count are shown as given, never hidden or retyped (m1). A company is searched by its name only: "Searched for" says so (m6).

## 4. Layout (Workspace section + Side panel, EXPERIENCE §3; team tokens through `@/components/ui/controls`)
* Section "Conflict check" in the prospect page's left column, below Prospect. Header: title, status chip and "Run a check" (outline button).
* Status (BR-5): ok → success Notice "Cleared: no conflict found · <who>, <when>"; not ok → warn/danger Notice with `clearance.detail`.
* History table, newest first: Checked (when, by name) · Result (chip: No conflict · Potential conflict · Conflict: the firm cannot act; m10) · Matches (n named, n hidden) · Confirmed (by name, when, or "Waiting"). A row opens its matches inline (disclosure, name and why matched: Email, Phone, Name; case matches grouped by case number).
* Run a check (side Panel, as Engage): on open it calls preview. Shows "Searched for" (BR-2), the matches table, the hidden line (BR-3), the scope line (BR-9). Then Result (radio: No conflict · Potential conflict · Cannot act), Disclosure (textarea, only for Potential; hint "Printed in the retainer the client signs"). Footer: Cancel and Save check / Record for confirmation.
* Confirm page `/front-office/conflict-checks/:id` (PR B): the check (searched for, who and when), matches now, Result radio + Disclosure, Confirm. States (m7): 404 and 403 → the server's sentence; 409 `ALREADY_CONFIRMED` / `RESULT_FIXED` → its sentence and the check read again; after Confirm → "Check confirmed: <result>", no link to the prospect (a confirmer may not open it).
* Convert is a Dialog that already shows the server's refusal word for word (`prospect-page.tsx`); new: the pre-click reason and the link (BR-5).
* States: loading skeletons; load error with Try again; empty: "No conflict check is recorded for this client. Run one before the client is converted or the retainer is sent."; saving (busy, locked); saved toast "Conflict check recorded." Widths 375 / 1024 / 1440 px (table stacks at 375).

## 4b. Best in class (judgment, from product knowledge; Unverified: no primary page read in this cloud lane)
Legal practice tools (Clio, PracticePanther, Smokeball) search contacts and matters in one box and save a conflict report with who and when. Copy: one search over everything, a saved report, the reviewer named. Beat: no typing (the client's own details are searched), the result gates Convert and Send by itself, hidden matches are counted instead of silently missed.

## 4c. Scorecard (BIC, the ones that apply)
BIC-01 ask once: search terms come from the person · BIC-04 incomplete is a state ("No check recorded") · BIC-11 one primary per panel (Save check / Confirm) · BIC-13 field errors on Disclosure and Result, summary at top · BIC-14 tooltips on chips · BIC-18 empty/loading/error drawn · BIC-19 one heading, one primary · BIC-20 keyboard, axe, 200 % zoom. BIC-02, -03, -05 to -10, -12, -15 to -17: N/A (no form questions, documents, filings or review queue here).

## 5. Copy
Run a check · Save check · Record for confirmation · Confirm check · Searched for · "A company is searched by its name only." · "Printed in the retainer the client signs." · results: No conflict / Potential conflict / Conflict: the firm cannot act. Server sentences (clearance, refusals, `hiddenLine`, `scope`) shown from the answer, never retyped.

## 6. Contract and tests
* `compliance/conflict/contract.ts` (zod): preview `{ searched, matches[], notStored, hiddenCount, hiddenLine, scope }`; list `{ checks[ …, checkedByName, confirmedByName ], scope, clearance }`; for-confirmation `{ …check, matchesNow[], hiddenNow }`.
* `tests/check_fo13s_conflict_browser.ts` (Playwright, isolated copy), pass + fail each: BR-3 a hidden match → choices off, "Record for confirmation", status Waiting; BR-4 Potential without disclosure → field error, nothing stored; BR-5 status cleared after a No conflict check, stale after the email changes, "Potential conflict" (never Cleared) after a potential one, and the Convert link absent for a disclosure refusal; M1 the checker's name shown; BR-7 a read-only user sees no Run a check; BR-8 the checker's confirm page → 404 sentence, the Admin confirms → status cleared; Convert refused shows the detail and the link. Keyboard only, axe-core, 375/1024/1440 with no sideways scroll.
* `tests/journeys/j_108.ts` (J-108, new): prospect → Convert refused (the sentence) → Run a check → a match with a current client listed → Save No conflict → status Cleared → Convert succeeds; second prospect with a hidden match → Record for confirmation → Admin opens the link, confirms → Convert succeeds; a retainer Send through the API before/after (no retainer screen on main: scaffolding, named so).

## 6b. Capability or scaffolding
All elements are the capability (P-33). The retainer Send step in J-108 goes through the API (FO-5s not built), named as scaffolding. **Not built** (handed on by #2478, m8): a list of checks waiting for a confirmer; conflict checks on the sales timeline.

## 7. Questions (recommendation first)
For the tech lead (challenge M3, M4):
1. **Size: split in two, records first.** Part 1 (#2309) merged at 998 lines; this is ~1,100-1,300. **Recommend:** `concept.md` + `challenge.md` in a records PR (P-686); **PR A** = panel, Run a check, the API additions (clearance, names), the Convert dialog's reason and link, the browser suite, J-108's first walk, (`Completes: R1.108` on PR B, the Lead's answer); **PR B** = the confirm page and J-108's hidden-match walk. PR A is enough for the default firm ("everyone sees all" is on by default, so nothing is hidden there).
2. **Touch list:** add FO-13c's `compliance/conflict/service.ts` and `tests/check_fo13c_conflict.ts` to FO-13s's touch list once #2478 has merged.
For the founder (via the tech lead): 3. Does R1.108 count as Works once PR A merges, the confirm page following as PR B? **Recommend yes.**

## Definition of ready
Acceptance: `tests/check_fo13s_conflict_browser.ts` and `tests/journeys/j_108.ts` green twice. Row text: BACKLOG FO-13s (conflict panel half). Decisions: P-579, #2478 merged, the answers to §7. Concept approved by the tech lead after `challenge.md` (all four Majors and every Minor taken in this revision; see its Lead response). Approved (see `challenge.md` Agreement): PR B ends with `Completes: R1.108` unless the founder decides Works on PR A alone.
