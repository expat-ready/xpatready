# FO-2v review: one own-versus-all rule for leads (PR #1933, permissions)

Reviewer (Opus, did not build it), 16 Nov. **Commit reviewed: `87a811e983c8c8241be879727144e152720b355c`** (diff `origin/main...87a811e`: 8 files, +191 −22). The concept is the brief (`lead-b-briefs/FO-2v.md` rev 16.53 on `lead-b-front-office`); there is no `concept.md`. Read against the requirement text: AG-2-64 rules 1–5 (`AG-02 v2.6`), AG-2-13c rule 6, AG-2-86 rule 3 and edge cases, SA-6-24 / SA6-D1 (`SA-06 v3.15`). Also Lead B's ruling on the PR (comment 2, 05:01 UTC, rev 16.55). It came **after** this head (04:58 UTC), so its conditions were checked against the head. Isolated copy `review_fo2v` on :4437 (runtime lane), never :4400. Live AI off, US$0. The breaker's `break-report.md` was read after my own runs. Its m1 and m2 match my J7 and code finding 1.

**Verdict (screen-review scale): Ship after fixes at `87a811e`; Ship at `e4317a6` (re-review at the end).**

## Requirement fit
- **AG-2-64 rule 2a / SA-6-24: met.** `visibilityOf` (`sales/common.ts:59-64`) drops `admin ||`. All = `agent/prospect:view.all` and "everyone sees all" on. This matches retainers' `seesAll` (`retainers/service.ts:166-168`). No text in AG-2-64 or SA-6-24 backs a role that sees all regardless.
- **AG-2-13c rule 6: met.** Unassigned stays `view.all || assign`, and a deactivated owner counts as no owner (`leads.ts:42-46`, `:98`, `:222`).
- **AG-2-64 rule 3, one server check: met for every lead path.** These all go through `visibilityOf` + `sees`: the list (filter in the query, before the 500 cap; `leads.ts:46`), the read and its possible-match line (`:79`), Add's known-person match and `personId` (`:130-143`), and every change (`:221-235`). The Unassigned count is the filtered `unassigned` list (`sales-frame.tsx:19`). Search filters that list on the client. Assignees lists staff, not leads. No other module reads `fo_lead` (grep).
- **AG-2-86 edge case "cannot see → cannot take": met.** Take on an unseen lead gives the GET 404, byte for byte (J5). Rule 3's race gives 409 naming who, with no `ownerStaffId` (J3; `leads.ts:107`, `:234`).
- **AG-2-64 rule 1 ("inside the caller's firm_id") and Lead B's ruling conditions 1 and 3: not met at this head.** See Major 1.

## Issues, ranked
1. **Major (Must): the race lookup is not scoped to the firm, and the ruling's firm-B test is missing.**
   - `leads.ts:209-212` filters `audit_event` only on `entity`, `entity_key`, `action` and `at`.
   - Every firm writes into the one `platform-audit` workspace, and the firm is only in `detail.firmId` (`platform/audit/audit-event.ts:4-7`).
   - Lead B's ruling accepts the audit-line design on condition that the read is "one query under the firm's scope" (condition 1), with a test that "the same race in firm B never reads firm A's audit lines … 404" (condition 3). Neither is in the head.
   - The breaker's forged other-firm line reproduces it: 409 where 404 is due. No API path writes such a line today, so the impact is low. The rating is Major because the head does not meet the row owner's accepted design or AG-2-64 rule 1 on a permissions PR.
   - **Fix:** add `and workspace_id = ${await platformAuditWorkspaceId(tx)}::uuid and detail->>'firmId' = ${ctx.firmId}`. Add a `check_fo2v` case: a `lead.taken` line carrying another firm's `firmId` for this lead's id gives 404. It must fail on this head.
2. **Minor (Should): the race uses the previous owner's status now, not at the time of the change (my J7, the breaker's m1).**
   - Repro: T assigns lead LM from MOVER to T, with the setting on for the assign. MOVER is then deactivated, and the setting is off. Within 10 minutes the Case Officer's Take gives `409 "Second representative (Sample) already has this lead."`. The lead was never Unassigned, so a name reaches someone due a 404. Reproduced on 2 of 2 runs.
   - The reverse fails closed: a previous owner reactivated later turns a real race into a 404.
   - **Fix:** write the fact at change time. In `change()`'s detail, add `fromUnassigned: activeOf(l.owner_staff_id) === null` (a boolean, allowed by `AuditDetail`) and read that instead of `staff.get(previous)`. Add the J7 case to `check_fo2v` (pass and fail).
3. **Minor: MODULE.md does not carry the ruling's wording (condition 4).** The new line (`front-office/MODULE.md:19`) describes the behaviour but not "Take's race answer reads the latest take/assign audit line (AG-2-86 rule 3); no owner-set column."
4. **Minor: the PR body's "Changed tests" is still "(filled in as found)".** Brief DW4 requires each to be named. Name `check_fo2_leads_prospects.ts` (the Owner's match-line read now needs the setting on) and `journeys/j_6.ts` (the setting stays on through the Owner's assign).

Not findings: the breaker's m3 (lead numbers reveal the firm's count) predates this PR. When the setting is off, an Owner holding `assign` can reassign only Unassigned leads and their own (the J-6 change shows this). That follows from the ruling and is noted for the release holder (P-423).

## Code checks (item 5)
- **Concurrency:** the race read runs in the Take's transaction, after `FOR UPDATE`. Under READ COMMITTED, a waiting second taker's next statement sees the winner's committed line. FO-2's parallel race test passes.
- **Index:** I loaded 300k audit lines into my copy and ran EXPLAIN ANALYZE. As written, the query uses PG18 skip scan on `(workspace_id, at)` bounded by the last 10 minutes: 0.34 ms. With `workspace_id` set it is a backward index scan: 0.05 ms. That is index-friendly enough. Fix 1 makes it faster too.
- **Reading `audit_event` from a module bypasses the write-only AuditPort.** The row owner accepted this. If AUD-1 moves the table, DW3's race line fails, and the code fails closed to 404.
- **The tests fail when the rule is removed** (each mutation on a scratch worktree, then restored):

| Mutation | Result |
|---|---|
| main's `visibilityOf` | `check_fo2v` 2 FAIL (DW1); PF-6b sweep 2 FAIL ("off: view.all holder sees X2") |
| `@OwnOrAll` off `read` | DW2-pass FAIL |
| no time window | 1 FAIL |
| ignore the previous owner | 1 FAIL |
| never race | 1 FAIL |
| `ownerStaffId` back in the race body | 1 FAIL |

- **Runs on this head** (all mine): `check_fo2v` 11/11, `check_pf6b` 28/28, `check_fo2` 113/113. qa's QA-479 line PASS; its QA-478 line FAIL, which is out of scope (another row). `check_r16_permission_sweep` 15/15.

## D1–D20 (server permission change; the screens are unchanged)
| D | Score | Evidence |
|---|---|---|
| D1 | 4 | Rules AG-2-64 2a/3, AG-2-13c 6 and AG-2-86 3 are met; the firm-scope condition is open (Major 1) |
| D2 | 4 | Lock-then-check holds; Take writes nothing on 404/409 (J3–J5 DB checks); J7 leak |
| D3 | 5 | One `visibilityOf` for every lead path; the same rule as retainers; one sweep for both |
| D4 | N/A | No question rules |
| D5 | 5 | Rows are read again after a refused Take; a stale page recovers (J3, J4) |
| D6 | 4 | One audit line per change; the race reads it; firm not filtered |
| D7 | N/A | No AI |
| D8 | 5 | Sales › Leads path is unchanged |
| D9 | 5 | Take it → toast → row leaves the list |
| D10 | 4 | A stale list past 10 minutes gives "No such lead in your firm." (by the brief) |
| D11 | 5 | The toast names who; the list refreshes |
| D12 | 5 | Team look unchanged (my J1/J3 screenshots) |
| D13 | 5 | axe clean; 1024 and 400 px with no sideways scroll; keyboard Take (J8) |
| D14 | 5 | Same components and words |
| D15 | 5 | All open in 0.42–0.52 s; no request per row |
| D16 | 4 | Pass and fail for each Done-when line; ruling condition 3's test missing |
| D17 | simulated only | No intended-user walk |
| D18 | 4 | The 409 names the owner; the source is the audit line |
| D19 | N/A | Not a closure row |
| D20 | simulated only | No intended-user walk |

**BIC-01 to BIC-20: N/A.** `EXPERIENCE.md` §6 scopes them to case-side screens. This is a front-office permission change with no screen change, and the brief does not opt in.

**Graph (P-86):** I ran it on a scratch worktree so GRAPH.md here stays unchanged: G3 93, G6 17. The leads routes' "no test" lines predate this PR (the services are tested directly and pages use template strings). The PR adds no element without a capability.

**Not checked:** a real screen reader; 200 % zoom (stood in by the 400 px width); J-6 50/50 and the FO-4 browser 45/45 (the builder's runs; my J1–J8 cover the FO-4 Take and list flows on this head).

**Verdict at `87a811e`: Changes needed** (the skill's "Block"; superseded by the re-review below). Fix Major 1 (firm-scoped race read plus the firm-B 404 test) before the label. Fix Minors 2–4 in the same push, or list them in the PR. A re-review reads only the diff.

## Re-review at `e4317a6bb20c44b969aadc8aff0b17ac275b294f` (diff `0be67b3c7..e4317a6` only, P-277)
The commit also carries this review and the journey report, which the builder picked up from the shared tree.
- **Major 1: closed.** `leads.ts:211-218` now filters `workspace_id = platformAuditWorkspaceId(tx)` and `detail->>'firmId' = firmId`, inside the take's transaction and after the row lock. New test `FO-2v DW3 fail (firm B)`: a forged line with firm B's `firmId` gives 404. With the firm filter removed, it fails (409); I checked this on a scratch worktree. The index plan from the first pass applies (backward scan on `(workspace_id, at)`).
- **Minor 2: closed.** `change()` writes `fromUnassigned: activeOf(previous owner) === null` on every `lead.taken` line, whether Take or Assign, at the change. The race reads only `fromUnassigned === "true"`. Lines from before this PR lack the field and fail closed to 404. New test `breaker m1`: moved owner to owner, previous owner deactivated afterwards → 404. With `fromUnassigned` forced to true, it fails along with the owner-to-owner line.
- **Minor 3: closed.** MODULE.md carries Lead B's sentence word for word.
- **Minor 4:** the builder says it goes into the PR body now. Tick it there.
- **New, Minor (Should), a test gap, not a bug:** the real race through a **deactivated** previous owner (Lead B condition 2, "or a deactivated person"; AG-2-13c rule 6) has no test. With `activeOf(...) === null` mutated to `l.owner_staff_id === null`, `check_fo2v` stays 13/13 and `check_fo2` 113/113. The code is right on reading, and a regression would fail closed (404, no leak). Fix: one `check_fo2v` case (owner deactivated, someone takes, a second taker gets 409 naming who), or list it in the PR.
- **Runs on `e4317a6`** (mine, scratch worktree): `check_fo2v` 13/13, `check_fo2` 113/113, `check_pf6b` 28/28. I did not re-run J-6 or qa's QA-479 line, whose inputs did not change; the builder reports them green.
- **Journey score:** "correct data" goes to 1, as the J7 leak is fixed and covered by the new test. **9/10**, a pass.

**Verdict at `e4317a6`: Approve** (superseded by the re-review below). No open Blocker or Major. Fix the one Minor test gap or list it in the PR.

## Re-review at `d0bc7b6bba5836b6e39f445b4f522f6db988e1bb` (diff `e4317a6..d0bc7b6` only)
- **No app code changed:** `git diff e4317a6 d0bc7b6 -- api` is empty. The rest of the diff is this review and the journey report.
- **The test gap from the last re-review is closed.** New case `DW3 fail (the race through a deactivated owner)`: a deactivated owner's lead is taken by the Case Manager, then the Officer's Take gives 409 "CASE_MANAGER (Sample) already has this lead.", with no `ownerStaffId`. On a scratch worktree, `check_fo2v` gives 14/14. With `fromUnassigned` computed as `l.owner_staff_id === null`, it gives 13/14, failing on exactly this line.
- **Minor 4 is closed.** The PR body's "Changed tests" names `check_fo2_leads_prospects.ts` and `journeys/j_6.ts`, each with why.
- No open Blocker, Major or Minor in this PR's scope. The breaker's m3 (lead numbers) predates it and is for the release holder.

**Verdict: Approve d0bc7b6bba5836b6e39f445b4f522f6db988e1bb**
