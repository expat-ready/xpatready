# Review: PF-21j (QA-517, Major): only a person who may record complaints can handle one

Reviewer (fresh agent, did not build it) · branch `claude/vibrant-bohr-r3x35h` · commit `7de1529c00fe1e4da13e833837598822d94a1ff0` · diff `origin/main...7de1529c0` (merge base `67ae91df2`) · 19 Nov 2026, about 20:55 IST.
Brief: `origin/lead-b-front-office:…/design/lead-b-briefs/PF-21j.md`. Journey test: `journey-test-reviewer-2026-11-19.md` in this folder, **7.5/10, below the pass**.
The shared checkout moved on (`b00312229`, `040c81aee`, `0895b303d`) while I worked. Every result below is from `7de1529c0` itself: the API suites ran before HEAD moved, and the browser runs, mutations and graph check ran on a scratch extract of that commit. Copy `rev_pf21j` on :4482, stopped each time; :4400 never used; US$0.

## Re-runs on 7de1529c0 (the builder's numbers hold)
* pf21j **15/0**, pf21w **83/0**, pf21 **108/0**, pf21v **55/0**, pf21i **30/0**.
* pf21s **117/117** and `j_109.ts` **26/0**, both on my :4482 copy.
* `graph.mjs --check` exit 0 (G1, G2, G4, G5 = 0); `count-any.mjs` exit 0 (416, under the 433 baseline).

## What holds (server)
* **`canAct`** (`complaints.ts:198`) = record key AND (handler OR read key), as briefed. `canRead` is unchanged. The order in `change()` (`:354-355`) gives a non-reader 404 and a reader without the right to act 403, so no complaint's existence leaks.
* **Every path that sets a handler is checked.**
  * Recording (`:288`) and `changeHandler` (`:419`) both call `checkHandler` inside the transaction, before any write, so a 422 rolls back with nothing written (pf21j H2 compares the row and its events).
  * The idempotent replay (`:276-286`) returns before the check. That is safe: it writes nothing; it needs the same hash and the same recorder; and a first request refused with 422 stored no key, so its retry is checked again.
* **The grants filter** (`mayHandle`, `:224-227`) matches how identity builds keys (`identity/service.ts:107-117`: ACTIVE staff, grants with `endedAt` null, the global role catalogue). It is firm-scoped through `firmScope` on the staff row. The grant's `(firmId, staffId)` foreign key stops a grant from crossing firms.
* **No information leak.** The two 422 sentences only tell the recorder whether an id is an active colleague who may record complaints, which `GET /handlers` already shows them. Another firm's id gets the same answer as an unknown id.
* **Seed and other web callers.** No seed creates complaints. The record drawer defaults the handler to the recorder, who always holds the record key. Both pickers read `GET /handlers`.
* **The five changed suites only move onto the new rule; no assertion was weakened or dropped:**
  * pf21: a Case Manager handler; the 403 recorder is now the Case Officer; a new 422 case.
  * pf21w: Case Manager handlers; the DW2 and DW3 cases still have both pass and fail.
  * pf21v: DW5's oracle is an independent role list; a new exclusion case.
  * pf21i: handler swapped only.
  * pf21s: a new case that the Case Officer is not offered; handover to the Owner.
  * The old "handler acts with no key" pass cases are now pf21j H4's fail cases. One check got weaker by accident (m3).
* **Mutations** (scratch copy):
  * Main's `canAct` fails 5 pf21j cases.
  * Main's `handlers()` fails 2 pf21j and 4 pf21v cases.
  * Dropping the key check in `checkHandler` fails 4 pf21j and 2 pf21 cases.
  * An over-wide `canAct` fails 5 pf21j and 2 pf21 cases.
  * Dropping `status` from `mayHandle` fails 4 pf21v cases.

## D1–D20 (n/5, one line each)
D1 Requirement fit 3: server rule as briefed; the web and the reminder still follow the old rule (M1, M2) · D2 Data integrity 4: a refused change writes nothing; m4 race · D3 Reuse 5: one `mayHandle` serves the list and the check · D4 Rule integrity 3: the web rule disagrees with the server (M1) · D5 Stability 4: replay safe; the J3 loop · D6 Governance 5: audit and events unchanged · D7 AI trust N/A · D8 Orientation 5: unchanged · D9 Flow 3: a demoted handler is offered a step they cannot take · D10 Language 3: m1, m2 · D11 Feedback and state 3: no read-only line in J3 · D12 Visual 5: unchanged · D13 Accessibility 5: axe clean at 400, 1024, 1440; no sideways scroll · D14 Team look 5 · D15 Speed 5: list about 350 ms; `mayHandle` adds one catalogue read, no request per row · D16 Testability 3: the ended-grant filter has no failing case (M3) · D17 simulated only · D18 Provenance N/A · D19 Closure 3: the reminder can go to someone who cannot act (M2) · D20 simulated only.

## BIC (staff platform screen; only the checks in scope)
BIC-11 Met (one filled action). BIC-13 Met for the 422 (J5: at the field, says the fix); Partly for the 403 (m1). BIC-18 **Not met** for the demoted handler: read-only does not say why, and actions are offered (M1, `j3-demoted-handler-1440.png`). BIC-19 Met. BIC-20 Met (pf21s keyboard path). BIC-01 to 10, 12 and 14 to 17: N/A (no case-side forms on this screen).

## Issues on 7de1529c0
**Majors**
1. **The screen still uses the old rule** (`web/src/modules/platform/complaints/contract.ts:10-11`, used at `record-page.tsx:80-82`).
   * What happens: a handler made Read-only sees "Needs you" and five actions at 400, 1024 and 1440 px, with no read-only line. Every save gets a 403, and after the re-read the same actions come back. My J3 found this on two runs, and so did the builder's breaker M1.
   * Fix: `canAct = has(record) && (handler || has(read))`, the `READ_ONLY` words, and a fail case.
2. **The reminder still goes to a handler who cannot act** (`complaints.ts:465-470`).
   * What happens: an active handler without the record key is reminded to "record the acknowledgement" and gets 403 when they try. No Owner or Admin is told (breaker M2; confirmed in the code).
   * Fix: the handler tier only when they hold the key; otherwise the Owners and Admins tier. Add a pass and a fail case.
3. **No test covers the "current (not ended) grants" rule** (`complaints.ts:226`).
   * What happens: removing `endedAt: null` leaves pf21j, pf21v, pf21 and pf21w all green.
   * Fix: in pf21j H4, after the demotion, assert the person is absent from `GET /handlers` and that making them handler gives 422.

**Minors**
1. The 403 detail (`complaints.ts:355`) still says "…or being its handler". It is shown to exactly the handler this row refuses (`j3-refused-1440.png`).
2. Words that still state the old rule:
   * `routes.ts:4` and `:17` (`HANDLES`);
   * `contract.ts:41` (`READ_ONLY`);
   * the picker hints "An active staff member of your firm." (`record-drawer.tsx:93`, `action-drawer.tsx:115`).
3. The suspended case is now empty (`check_pf21v_views.ts:99`). The suspended person is a Case Officer, who is excluded by role anyway, so "a suspended … member is absent" no longer tests the status filter. Fix: make them a Case Manager.
4. Race (breaker m2): keys are read by the guard before the transaction. A demotion that commits while an act waits on the row lock still lets that act through. This existed before this row; list it as a follow-up.
5. An inactive, unknown or other-firm handler still gets the old sentence "choose an active staff member of your firm". The brief's line 3 reads as one sentence for every such person. The tech lead should confirm which wording is meant. There is no leak either way.
6. Nit: pf21w W1 (`check_pf21w_routes.ts:234`) now has the same Case Manager record the complaint and handle it. Using `manager2` as handler would keep the recorder and the handler apart.

## Not checked
* A real screen reader, a visible browser pane, and an intended user's unaided walk (D17, D20).
* CI on the PR.
* The builder's later commits (`b00312229`, `040c81aee`, `0895b303d`), which appear to address M1, M2, m1 and m2. They need their own review at their own sha.

Verdict: Changes requested — Majors 1-3 above (Minors 1-6 do not block)

## Round 2: acc82fef943615a75cbe6d48b13b8b2a8891e036 (diff only, P-277; 19 Nov 2026, about 21:25 IST)
Read: the four own commits `b00312229`, `040c81aee`, `0895b303d`, `acc82fef9` (`git log --no-merges 7de1529c0..acc82fef9`). The main merge `709c38146` is not reviewed.
Everything ran on a scratch extract of exactly `acc82fef9`. My copy `rev_pf21j` was on :4482 and stopped after each run; :4400 was never used; US$0.

**Re-runs on acc82fef9**
* API suites: pf21j **22/0**, pf21w **83/0**, pf21 **108/0**, pf21v **55/0**, pf21i **30/0**.
* Browser suites: pf21s **117/117** and `j_109.ts` **26/0**, both on :4482. That is on `acc82fef9` itself, not only on `0895b303d`.
* My J1-J5 walks ran twice: **21/21** both times.
* Checks: `graph.mjs --check` exit 0; `count-any.mjs` exit 0 (416, under the 433 baseline); web `tsc --noEmit` 0 errors; the api `tsc` shows no error in complaints.

**Round-1 findings**
* **Major 1, fixed** (`contract.ts:12` matches `complaints.ts:198`).
  * My J3 walk at 400, 1024 and 1440 px: the demoted handler now gets the read-only line, with no next step and no action (`j3-demoted-handler-1024.png`). axe is clean and there is no sideways scroll.
  * H6 imports the web `canAct`. Putting back the old `canAct` fails H6.
* **Major 2, fixed** (`complaints.ts:467-469`). The handler tier now uses `mayHandle`: active staff, a grant not ended, the record key. Otherwise the Owners and Admins get the reminder, and its sentence now covers "can no longer handle complaints".
  * H5 has a pass and a fail case. Putting back the old `findFirst` fails H5.
  * pf21's deactivated-handler fallbacks (break m10, R2-m1) still pass.
* **Major 3, fixed.** H4 now checks the ended grant two ways: the demoted person is not in `GET /handlers`, and making them handler again gives 422 with the sentence. Dropping `endedAt: null` now fails 3 cases (H4 twice, H5 once).
* **Minor 1, fixed.** The 403 detail names the rule: "…the permission to record complaints, as its handler or with the permission to read every complaint."
* **Minor 2, fixed.** Fixed in the `READ_ONLY` sentence, both picker hints, and `routes.ts:4` and `:18`.
* **Minor 3, fixed.** pf21v's suspended person is a Case Manager. Dropping `status` from `mayHandle` fails DW5's "suspended and deactivated are absent".
* **Minors 4, 5 and 6: I agree they stay open.**
  * Minor 4 (keys read before the transaction) is older than this row and applies to every route: a follow-up.
  * Minor 5 is the brief's split, for the tech lead.
  * Minor 6 is a nit.
* **`0895b303d`** only changes `j_109.ts`'s import, to where #2000 moved `zonedInstant` and `FirmCalendar`. No assertion changed, and it gives 26/0.

**New in round 2:** nothing that blocks.
* One observation from before this row, not a finding against it: an overdue complaint shows the "Needs you" notice (`record-page.tsx:78`) to every reader. That includes a reader who may not act, such as an Admin with the read key alone or the demoted handler, even though the read-only line sits right under it. Wording it for readers would be a small follow-up for the PF-21s owner (P-26: not this row's scope).

**Journey score, round 2: 9.5/10, a pass.** Every criterion scores 1 except "Next step obvious" at ½ (the "Needs you" wording above). Round 1's ½ scores rise to 1:
* plain words: the 403, the hints and the read-only sentence;
* feedback and state: the read-only line;
* error recovery: the J3 dead end is gone.

**Round-2 BIC:** BIC-18 now Met (read-only says why, `j3-demoted-handler-1024.png`); BIC-13 Met.
**Round-2 D scores that changed:** D1 5 · D4 5 · D9 4 · D10 5 · D11 5 · D16 5 · D19 5.
**Not checked:** a real screen reader, a visible browser pane, an intended user's unaided walk (D17, D20), and CI on the PR.

Verdict: Approve acc82fef943615a75cbe6d48b13b8b2a8891e036
Verdict: Approve 542ac63c374044029cf7f393cffbeca7bea24a90 (records-only commit after acc82fef9)
