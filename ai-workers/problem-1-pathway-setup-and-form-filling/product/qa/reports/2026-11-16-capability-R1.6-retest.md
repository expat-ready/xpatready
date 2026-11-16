# qa · R1.6 retest for the Prove Lead · main d66bcfd2d · 16 Nov 2026, ~20:xx IST

Asked by Lead 69 (Prove Lead plan, P-644; brief `design/prove-lead-briefs/R1.6.md` on `prove-lead/records`): retest QA-477 now, QA-478 when PF-6m #1945 merges, write the R1.6 walk ahead, score only when every part is merged. Live AI off, US$0, nothing on :4400. Outputs: `2026-11-16-capability-R1.6-retest/`.

## Verdict
**R1.6: Partial; parts missing: PF-6 part 2a (Team, Invite people with Compare roles, the Person panel), PF-6 part 2b, J-6 part 2.** No verdict until they merge (P-606). The platform web module on main has only `/account` and `/sign-in/callback` (`web/src/modules/platform/routes.tsx`).

## Findings
* **QA-477 closed** (Conflict · Major; own versus all for an Owner). FO-2v #1933 applies Lead B's one rule (rev 16.63 on #1953): all only with `agent/prospect:view.all` and "everyone sees all" on, Owners and Admins included.
  * New: `tests/qa/check_qa477_owner_view.ts` **7/7 twice** over HTTP on an isolated copy. Setting off: the Owner's GET of a Case Officer's lead is 404 and the Owner's list does not hold it; the officer still reads it. Setting on: the Owner reads and lists it (not vacuous).
  * `check_fo2v_lead_visibility.ts` 14/14; `check_pf6b_permission_rules.ts` 29/29 (the leads routes now carry `@OwnOrAll`, so the sweep compares them with retainers).
* **QA-479 closed** (Bug · Minor): `check_qa478_479_r16_breaks.ts`'s QA-479 line passes (take on a lead the person cannot see answers the same 404 as GET).
* **QA-478 stays open** (money-keys line on invitation): its line in `check_qa478_479_r16_breaks.ts` still fails, and `check_r16_money_keys_by_invitation.ts` 4/5, until PF-6m #1945 merges (approved, Lead 68's read done, in the queue).
* Still green on main: J-6 walk 50/50 twice; `check_r16_deny_sweep.ts` 9/9 twice; `check_r16_permission_sweep.ts` 13/13 twice.

## Written ahead
`tests/qa/check_r16_walk.ts`: gate A by screens for R1.6, to R1.5's next step. Owner signs in and opens Team → Invite people → Compare roles shows money keys and licence actions in their own groups (PF-6 DW3) → invites a Billing/Finance person, pending on Team and in `platform_invitation` → a Case Officer typing `/platform/team` is refused in words, and `GET /api/platform/staff` answers 403 (DW4) → axe clean, no sideways scroll at 400 and 1024 px. Today it prints one SKIP line and exits 0 (`r16-walk-skip.txt`). Selectors follow the concept r2; a builder's different words are a finding to reconcile, not a reason to loosen it.

## Next
1. When #1945 merges: re-run `check_qa478_479_r16_breaks.ts` and `check_r16_money_keys_by_invitation.ts` (expected 5/5), close QA-478.
2. When PF-6 part 2a merges: run `check_r16_walk.ts` headless at 400, 1024, 1440, twice; the design check of the brief (Team, Invite, Person panel against a calm work app: plain words, one next action, quiet surfaces, role summaries, keyboard only, 200% zoom), gaps as Suggestions.
3. When J-6 part 2 merges (its API halves in a CI-run `tests/check_*` suite, Lead B on #1953): score R1.6 with a fresh reader.

## Questions for the Lead
None new.

## Follow-up, 17 Nov ~03:4x IST (main 37d9d9203, after PF-6m #1945)
* **QA-478 closed.** `check_qa478_479_r16_breaks.ts` 7/7 (its QA-478 line passes); `check_r16_money_keys_by_invitation.ts` 5/5 twice on fresh copies; `check_pf6m_money_line.ts` 12/12; `check_pf6b_permission_rules.ts` 29/29; `check_r16_deny_sweep.ts` 9/9. Outputs: `2026-11-16-capability-R1.6-retest/after-pf6m/`.
* **R1.6: Partial; parts missing PF-6 part 2a, PF-6 part 2b, J-6 part 2.** No open bug holds it any more.
* The reviewer's Minors on #2010 are done:
  * the money-keys output is fresh;
  * `check_r16_walk.ts` W4 now fails when the page holds no token, and the role picker's checkbox fallback is gone;
  * the throwaway set-password codes in the raw outputs are redacted (`#code=[redacted]`).
* `check_r16_money_keys_by_invitation.ts` now stops cleanly with a message when the invitation is refused. A kept copy reaches the Sample plan's 5-seat limit; use a fresh copy.
