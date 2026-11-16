# PF-6m2 review: the inviter re-checked at accept, and the Owner's money line at signup (PR #2045, head 51fb031e6)

The reviewer (Opus 5.5, effort high) did not build or break this. Brief: Lead B rev 16.60 (`origin/lead-b-front-office:…/lead-b-briefs/PF-6m2.md`). Rules: concept `pf-6-staff` BR-1, BR-4, BR-5 and PF-6m's break report F1 and F4. Diff `origin/main...51fb031e6`, 6 files, +217/−7. The base is `origin/main` itself (bfac889d7), so there is no drift. The row is API and audit only, with no screen, so the concept-screen, BIC and browser checks do not apply.

Where things ran:
* scratch databases on 127.0.0.1:54329;
* one isolated copy `rev6m2` on :4447, as the caller set it. :4447 is in the screens range of `WAY-OF-WORKING.md`, not runtime's 4430–4439. It was stopped after use.
* Never :4400. Live AI off, US$0.

**Verdict: Approve.** There is no Blocker and no Major. The Minors below do not block the merge.

## Done when: evidence (suites run by me on 51fb031e6)
`check_pf6m2_invite_recheck` 13/0 · `check_pf6m_money_line` 12/0 · `check_pf4b_session_reads` 53/0 · `check_pf6b_permission_rules` 29/0 · `check_pf5_signup_billing` 53/0 · `check_pf12_walls` 100/0. All exited 0.

Mutations were made in a scratch copy of `studio/` (outside the repo, restored after each run). Each one ran the new suite.

| Line | Pass and fail present | Mutation result |
|---|---|---|
| DW1 deactivated inviter → 410, nothing granted; active → 200 with 1 money line | yes, both | Inactive check removed: 3 FAIL. Refusal thrown inside the transaction (rolls back): 3 FAIL. Revoke removed: 3 FAIL. |
| DW2 demoted to Case Manager → 410; an Owner's invitation → 200 | yes, both | Key check removed: DW2 fail FAILs. Re-check reading the invited roles' keys as held: DW2 fail FAILs. |
| DW3 signup writes 1 line, actor `system:signup`; a refused signup writes none | yes, both, plus a rollback case | Call removed: DW3 pass FAILs. Actor `ACTOR`: DW3 pass FAILs. Line written outside the transaction: DW3 fail FAILs. |
| DW4 old suites pass; replay gives one winner | 8 parallel accepts → 1×200 + 7×410, 1 staff member, 1 line | PF-5 needed one changed expected list (Question 1). |

Three mutations survive, and none of them hides a defect today:
* **OWNER clause removed (M3).** Equivalent today: OWNER holds 12 keys that no other role holds (`agent/subscription:*`, `agent/support-access:*` and others; counted on the copy). The key test therefore already refuses an ex-Owner's OWNER invitation.
* **FIRM_KEY filter removed (M5).** Equivalent: 0 non-firm keys in `platform_role_permission`.
* **firmScope dropped from the inviter lookup (M9).** No door can reach it. The live copy with another firm's active staff id planted as `invited_by` gave 410 with firmScope in place.

## Code checks
* **Same rule as at invite time: yes, for keys and Owner.** At invite, `roleRules` compares the needed keys (unfiltered) with `actor.keys`, which the guard has already filtered by FIRM_KEY (`identity/service.ts:113,199-201`). The re-check does the same (`session/service.ts:132-135`): held keys filtered by FIRM_KEY, needed keys unfiltered, and OWNER only from a current OWNER (`roleRules:193-194`). The reason and the step-up cannot be checked again at accept, rightly.
  * One gap: the door's own key, `agent/staff:manage`, is not re-checked (the breaker's F1, Minor m1).
* **Lock order and races: correct.** Accept order: unlocked read → firm `FOR UPDATE` → invitation `FOR UPDATE` → re-check. Deactivate, reactivate and role change all run in `inFirm`, which takes the firm row first (`identity/service.ts:165-168`); no other writer of staff status or grants exists in `api/src`. Under read committed, the reads after the lock see the committed change.
  * Live demotion race on :4447, staggered 0–15 ms: both outcomes happened (3 accepted, 3 refused). Each was consistent: a 200 gave 1 staff member, 1 money line and no refusal; a 410 gave 0 staff and 1 refusal line.
  * Deactivation race: 6 of 6 runs consistent, no 5xx. The breaker's 40 runs gave 30 accepts and 10 refusals.
* **Transaction, then 410: really commits.** Returning `{ refused }` commits, and the `.then` throws outside the transaction (`:122`). M4 shows that throwing inside rolls back and the tests catch it. Live J2: `revoked_at` set, one line, GET then answers NOT_VALID, and a retry gives 410 with no second line.
* **asBypass and firmScope: no misbehaviour.** The `.then` is inside the `asBypass` callback, so the bypass covers the whole door, as on main. The inviter lookup keeps `firmScope(inv.firm_id)`. `platform_role_permission` has no firm column. Signup's line runs inside `asBypass("platform.firms.signup")`'s transaction; the same helper already runs under the accept's bypass live (J1).

## Issues (all Minor: Should, none Must)
1. **m1 · "may still give" omits the door key.** An Admin demoted to Billing/Finance whose pending invitation is for Billing/Finance still has it accepted: 12 money keys, with a grant "by" someone who can no longer invite (breaker F1). The brief's literal rule, "every key of every role", is met.
   * Fix, if Lead B rules so: also require `agent/staff:manage` among the inviter's held keys at `session/service.ts:132`, with a pass and a fail line.
   * Otherwise, write the key-only reading into MODULE.md.
2. **m2 · Raw `invited_by` in the refusal line's detail (`:104`).** A planted value with an `@`, or one over 200 characters, fails AuditEntry, and the accept then answers 500 and the invitation stays pending (breaker F2). No door writes such a value. Fix: put the parsed uuid or `null` in the line, never the raw column.
3. **m3 · Reason `inactive` also covers "not this firm's staff" or "not a staff word" (`:131`).** The summary "no longer active" is then false (breaker F3). Fix: a third reason, or neutral words.
4. **m4 · Two actor words for one door.** Signup's money line says `system:signup` while its other lines and the grant row say `system:sign-up` (`firms/signup.ts:45,197`). See Question 3.
5. **m5 · GET answers VALID before the accept refuses.** `GET /api/public/invitations/:token` still answers VALID, "Continue to set your password", until someone presses accept, and the seat stays counted until then (`:78-80`; live J2; breaker F5).
   * The PR body says it "opens on the Accept page as 'This invitation is no longer valid.'"; that holds only after one accept. Correct the wording.
   * Running the same check in the read is the row owner's call: it is not in the touch list.
6. **m6 · Comment slips.** `session/service.ts:24`: "The Accept page's words (BR-4), fixed." now documents `INVITER_REFUSED`, and `INVITE_WORDS` has lost it; swap the two comments. `money-line.ts:1` says "the two doors" but lists three.

## The PR's four questions: my view
1. **PF-5's changed expected list.** Accept. The brief's own F4 fix adds `platform.staff.money_keys_granted` to that firm's audit actions. The change adds one action and nothing else, and the suite still asserts the exact list.
2. **Touch-list slips.** Keep all three.
   * The Owner grant really is in `firms/signup.ts:195`; `signup-identity.ts` holds only the provider.
   * The `money-line.ts` comment and the MODULE.md card had to change, or they would state the opposite of the code. The card checks pass (`module-cards.py tree`; 34 lines).
3. **`system:signup` or `system:sign-up`.** I prefer the existing `ACTOR`, so that one door has one actor word in the trail. It is the brief's word, so Lead B rules. The change is one line plus one test line.
4. **Owner at invite.** Agree: use the server's invite-time rule (OWNER only from a current Owner).
   * BR-1's "Owner is never offered at invite" is a picker rule, and the server's acceptance of OWNER→OWNER (PF-4) is older code.
   * Refusing at accept alone would make the two doors disagree. The BR-1 server gap belongs in its own row for Lead B, not in this one.

## D1–D20 (1–5; API row)
* D1 Requirement fit 5 (DW1–DW4 met; PF-6m break F1 and F4 closed)
* D2 Data integrity 5 (no mixed outcome in any race)
* D3 Reuse 5 (one helper, three doors)
* D4 Rule integrity 4 (m1)
* D5 Stability and recovery 4 (m2's 500 needs a planted value)
* D6 Governance 4 (m3, m4)
* D7 N/A
* D8–D14 N/A (no screen)
* D15 Speed 5 (accept 13–42 ms live)
* D16 Testability 5 (every DW line bites; the survivors are equivalent)
* D17 simulated only
* D18 Provenance 4 (m4)
* D19 Closure 4 (m5)
* D20 simulated only

**BIC-01–20:** N/A (platform identity API, not a case-side screen).

**Graph (P-86):** `graph.mjs --check` exit 0, with hard gaps G1, G2 and G5 at 0. Only the gitignored `graph.json` was written. No route or page was added.

## Journey score (reviewer; the one score for this check): **8.5 / 10, pass**
`journey-test-reviewer-2026-11-16.md`: API journeys on :4447. The screen criteria were not exercised.

## Could not check
* **Uncommitted edit in this clone, not mine and not reviewed.** At 22:31:48 UTC, after my suites, mutations and the isolated copy's start, someone else changed `session/service.ts` in the working tree. The edit adds `inviter_not_found`, a `may_no_longer_invite` check on `agent/staff:manage`, and `invitedBy` from the parsed id, which looks like a fix for m1–m3. I left it untouched. This Approve covers 51fb031e6 only; a commit of that edit needs a diff-only re-review (P-277).
* No browser, keyboard, 1024 px or zoom checks: no screen exists.
* No real Cognito, only the local stand-ins.
* Signup was not walked on the live copy: the local mail has no inbox route. It is covered by DW3 in-process, with its rollback case.
* `check_pf4_identity` part B was not run.

Verdict: Approve 51fb031e6ca23df0cdd9a4bf50b1fdb006bfe131
Blockers: none · Majors: none · Minors: m1 door key not re-checked (ruling), m2 raw `invited_by` in the line (500 on planted data), m3 `inactive` label too wide, m4 two signup actor words, m5 GET VALID before the refusal plus the PR body wording, m6 comment slips.
