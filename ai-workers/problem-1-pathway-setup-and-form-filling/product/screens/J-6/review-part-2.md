# J-6 part 2 review: `claude/screens-j6p2` at 2d6ba0289 (R1.6 join and walk, map row 6)

Reviewer: a fresh context, not the builder. Brief: Lead B's rows rev 16.54 (J-6 DW1, DW2, walk W1) and BACKLOG row J-6.
Diff read: `git diff 6b22a7343 2d6ba0289`. It changes only `tests/journeys/j_6.ts` (+71/-1), 5 new `P2-*` screenshots and 7 regenerated `P1-*` screenshots. There is no product code and no fake-to-real swap, as the row says.
(The brief's first hash, 1a96d78f7, does not exist. The coordinator corrected it to the branch head, 2d6ba0289.)
Journey test (reviewer role): the section below, **8.5/10, pass**. It sits in this file because the brief asks for one report file.

## What I ran (isolated copy `rev_j6` on :4594; never :4400 or :4436)
* `vite build`, then the brief's command on a fresh copy: **62/62, exit 0**.
* A kept copy: **62/62** headless (26.7 s), then **62/62** again with `HEADED=1 xvfb-run -a` (34.6 s), with no restart.
  - In the database afterwards, both runs' Billing and finance and Read only people are `DEACTIVATED`. The only active `j6-` person is the second Case Officer that part 1 keeps by design.
  - `seats_limit` is back to 5, and `CASE_OFFICER` has `agent/prospect:view.all` again.
* **Mutations (P-606), on a fresh copy, product code restored after (`git checkout -- studio/api`):**
  - (A) `session/service.ts:119`: the invitation accept no longer calls `writeMoneyKeysGranted`.
  - (B) `sales/common.ts:61`: `seesAll` ignores "everyone sees all".
  - Result: **52/62**. `J-6 DW1 pass` fails on (A) (`[]` read back). `J-6 DW2 pass` fails on (B) (the Owner sees Omar and Oona). Part 1's setting-world lines and PF-6b DW6 fail too.
  - Both join checks therefore fail without the real part.
* **Break probes after a run:**
  - A deactivated Billing person's sign-in is refused with 401 and "This staff account is not active…".
  - Re-accepting the used Billing invitation is refused with 410.
* `graph.mjs`: G1 0, G2 0, G4 0, G5 0. No J-6 entry; the row adds no page or route.
* Screenshots restored with `git checkout -- …/product/screens`. My runs overwrote all 12, and the mutated run's DW2 shot showed the mutated world. Only this file is new.

## Does each line prove its label? (pass and fail where the row asks)
| Line | Verdict |
|---|---|
| W1 step 1, Compare roles groups | **Partly.** It reads `Money permissions: 12` from the Billing and finance box, which comes from PF-6r's `class`. The licence assertion `/: \d+$/` accepts any count; Billing and finance's is 0, so the licence group is never shown holding a key (m1). |
| W1 step 2, money line before Send | Proven. The exact words are `This gives <email> 12 money permissions.`; DW1 checks the same 12 on the server. |
| W1 step 2, one invitation | Proven by SQL: `{BILLING_FINANCE}` only. |
| W1 step 3, accept and signed in | Proven on the product's Accept page. Only the mail link is stood in: `knownLink` rewrites `token_hash` by SQL (`j_6.ts:207`), as PF-6's own browser check does (`check_pf6_staff_browser.ts:238`). That is acceptable; it is not P-33 scaffolding. |
| DW1 pass / fail | **Proven** (mutation A). The pass half has one line, actor `staff:<Owner>`, roles `BILLING_FINANCE`, 12 keys. The fail half has an accepted Read only invitation and no line. The audit line is written at accept, not at Send, which is PF-6m's design (`platform/MODULE.md:18`), so "saved with its audit line" is met at accept. |
| W1 step 4, refused Team | Proven both ways. The API answers 403, the on-screen text equals the API's `detail`, and the account menu has no Team entry. |
| DW2 pass / fail | **Proven** (mutation B). With the setting off, the Owner's All open shows R and U but not O, O2 or B (committed shot `P2-DW2-owner-setting-off-1440`). With it on, O and O2 show. |
| W1 step 5, Case Officer "own" | Proven (O only, no R, B or U). It is the part 1 ROLE world again, whose real negative leg is P1-NR. That is acceptable for a walk step. |
| W1 step 6, ends at My account | Met. The new person clicks My account in the account menu and the Profile heading shows. axe is 0 there. This matches the row's "My account (row 5)". |

## Repeatability and part 1's world
* Seats are lent (+10) and given back. The two new people are deactivated, and the setting and view.all end as part 1 expects. Proven 62/62 twice on one copy.
* None of this sits in `try/finally`, and the deactivate answers are not checked (`j_6.ts:203-204, 264-265`). A failed wait after line 204 leaves the plan at +10 and the people active. The next run then lends on top and "gives back" to the inflated number (m2).
* The P1 screenshots changed because main's Leads screen changed (the "Source: all" filter, "Phone call (Sample)" capitalised) and the copy held different leftover leads. I compared old and new `P1-W2-role-case-officer-all-open`. The P1 checks themselves are unchanged. In these Leads shots the Sales menu still has only "Leads", so the "new menu entries" in the brief are not what changed them.

## Findings
**Blocker / Major:** none.

**Minor**
* m1. `j_6.ts:214`: the licence half of step 1 passes on any number, so a licence group that never counted keys would pass. **Fix:** compare both of Billing and finance's group counts with `GET /api/platform/roles` (PF-6r), and assert that a role holding licence actions shows its count (Owner or Case Manager: 3).
* m2. `j_6.ts:203-204, 264-265`: put the seat lend, the deactivations and the setting reset in `try/finally`, give back a value saved before the lend (not one read inside the run), and assert each deactivate answers 200.
* m3. The committed `P2-W1-invite-billing-money-line-1440` shows "4 of 15 seats used", the lent value. Say in the evidence note that the seats are lent for the walk, so the demo reader is not misled.

**Noted, outside J-6's touch (PF-6 lane, not a J-6 finding):** the refusal shows the raw key to a Billing person: "Your roles do not include the permission this needs (agent/staff:manage)."

## Journey test (reviewer role; journey-test skill)
Journeys (persona, goal, result):
1. The Owner compares roles before inviting. Groups show. Done.
2. The Owner invites a Billing and finance person. The money line shows before Send; one invitation is made. Done.
3. The invitee accepts and lands on My account. Done.
4. The invitee tries Team by URL. Refused on screen and by the API. Done.
5. The Owner, with the setting off, sees own and Unassigned only; with it on, sees all. Done.
6. A Case Officer with "own" sees only their own leads. Done.
7. Recovery and break: a reused invitation gets 410; a deactivated person's sign-in gets 401 with words. Held.
8. The boundary step: My account. Done.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | 62/62 three times; every W1 step passes in a visible browser |
| Next step obvious | 1 | The refusal keeps the My account menu; the walk ends on Profile |
| Plain words | ½ | The money line is plain; the refusal names a raw key (noted above) |
| Feedback and state | 1 | The money line shows before Send; the refusal states the reason |
| Correct data | 1 | Audit line by the Owner with 12 keys; `{BILLING_FINANCE}` only; people deactivated; seats back |
| Error recovery | 1 | 410 on reuse; 401 with words for a deactivated person |
| Accessibility and screen sizes | ½ | axe 0 on My account only; the P2 screens' axe and widths are left to PF-6's check (`check_pf6_staff_browser.ts:131,222,231`), which I did not re-run; no keyboard-only part 2 |
| Speed | 1 | The whole check runs in 26.7 s; no wait near its timeout |
| Visual quality | 1 | Committed P2 shots: team frame, dialog and panel aligned |
| Trust and sources | 1 | Sample labelled; no AI; the money count comes from the server's catalogue |
| **Total** | **8.5/10** | **Pass** (8 or more, no 0) |

## D1–D20 (only what this test-only change touches)
* D1 Met: every rev 16.54 line is walked.
* D5 Met: repeatable 62/62 twice, with m2's caveat.
* D13 Partly: see the score table.
* D16 Met: both join checks fail without the real part (mutations A and B).
* D17, D20: simulated only.
* D2, D3, D4, D6, D7, D18, D19: N/A.
* D8–D12, D14, D15: Met (screenshots, timings).
* BIC-01–20: N/A (platform and front-office screens, not case-side).

## Not checked
A real screen reader; an intended user's unaided walk (D17, D20); CI on this head (there is no PR yet); PF-6's own browser check (not re-run).

Verdict: Approve (2d6ba02891761a0297136a67fdf89829ccee4baf)
* Blockers: none. Majors: none. Minors: m1–m3, which can be fixed in this PR or a follow-up.

## Re-review: 9ad163a4f (fixes for m1–m3)
Read: `git diff 2d6ba0289 9ad163a4f -- j_6.ts qa/built/J-6-part2.md`. The commit also carries this file (as written above) and 12 regenerated screenshots.
* **Runs (copy `rev_j6` on :4594):**
  - A fresh copy: **63/63**. The same kept copy with `HEADED=1 xvfb-run -a`: **63/63**.
  - In the database afterwards, the 4 new people are `DEACTIVATED`; only the second Case Officer that part 1 keeps is `ACTIVE`, and `seats_limit` is 5.
* **m1, fixed.** Step 1 compares each role's Compare roles group counts with `GET /api/platform/roles`. It read `OWNER [16,16,3,3] … BILLING_FINANCE [12,12,0,0] … READ_ONLY [0,0,0,0]`, and it requires 6 roles, Billing and finance at 12 money and Case Manager at 3 licence.
  - Mutation: `roles.tsx` shows no licence actions. Step 1 **fails** (Owner `[16,16,0,3]`). The web code was restored and rebuilt.
* **m2, fixed.** The loan, the leavers and the give-back are in `try/finally`, and the new "J-6 part 2 clean-up" line checks that each deactivate answers 200 and the seat limit is back.
  - Mutation: a `throw` before W1 step 4. The run exits 1, the clean-up line still passes (`[200,200]`), both new people are `DEACTIVATED` and `seats_limit` is 5. `j_6.ts` was restored.
  - The value given back is still the one read at the start of the run. With the `finally`, only a killed process can now leave it inflated, which is acceptable.
* **m3, fixed.** The comment at `j_6.ts:204` and `qa/built/J-6-part2.md` say the screenshots show the lent seat figure.
* **`qa/built/J-6-part2.md`:** its claims match my runs: the walk lines, 52/62 under mutation, and 63/63 twice.
* **No new findings.** Two style points, not findings: the `try` body is not indented, and `left.every` passes when there are no leavers (but the step 3 and DW1 lines fail first in that case).
* Screenshots my runs overwrote are restored; only this section is new.

Verdict: Approve (9ad163a4f55558915050eb14252a7bb63219359c)
* Blockers: none. Majors: none. Minors: none open (m1–m3 fixed and checked by mutation).
