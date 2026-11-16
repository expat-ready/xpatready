# PF-6m review: one money-keys audit line for both doors (QA-478; PR #1945, head ff0ef12a8)

Reviewer (Opus 5.5) did not build or break this. Brief: Lead B rev 16.53 (`origin/lead-b-front-office:…/lead-b-briefs/PF-6m.md`). Diff `origin/main...ff0ef12a8`, base bf4fbbf66, 4 files, +157/−7. Nothing in `identity/` changed on `main` since the base. API and audit only: no screen, so the concept, BIC and browser checks do not apply (§ "Could not check"). Ports: scratch DBs on 127.0.0.1:54329 and isolated copies on runtime ports :4436/:4437. Never :4400. Live AI off, US$0.

**Verdict: Approve.** No Blocker and no Major against this row. Four Minors are listed below; none blocks the merge.

## Done when: evidence

| Line | Result at ff0ef12a8 | Does it fail without the fix? (mutations run in a scratch worktree, then reverted) |
|---|---|---|
| DW1: Billing/Finance accept writes 1 line, 12 keys, actor `staff:<inviter>`; Read-only writes none | PASS | Remove the accept call: the DW1 pass, DW2 pass, two-roles, replay and Case Officer lines fail (6 FAIL). Actor `actorWord(inv.invited_by)` (that is, `staff:staff:`): DW1 fails. Helper writes even with 0 keys: DW1 fail and DW3 fail both fail. |
| DW2: refused provider rolls the whole accept back, line included | PASS | Helper given `this.db` instead of `tx` (line outside the transaction): DW2 fail and DW2 pass both fail. |
| DW3: role-change line byte-for-byte unchanged | PASS | Summary "given"→"granted": DW3 fails. `detail.roles` lists all added roles (break m2): DW3 and two-roles fail. **`main`'s real `identity/service.ts` (the old inline code) passes DW3 11/11**, so the test's frozen copy matches what main actually wrote. |
| PF-4 / PF-4b / PF-6b suites | 119/119 (isolated `pf4` on :4437) · 53/53 · 24/24 | n/a |
| qa's QA-478 line (`tests/qa/check_qa478_479_r16_breaks.ts` from PR #1929, on isolated :4436) | QA-478 PASS ("12 money keys … before 0, after 1"). QA-479 FAIL, as expected: it is another row. | n/a |
| PF-6m suite | 11/11, twice (the checkout and the worktree) | n/a |

## Code checks
* **Placement (correct).** Inside the accept `$transaction`, after the grant rows and before `accepted_at`, the `platform.invitation.accepted` line and `admin.createUser`: `session/service.ts:100`. Under the firm lock and the invitation `FOR UPDATE`, so a replay finds the invitation used (410) and writes no second line. The breaker ran 12 accepts in parallel: one line.
* **Actor (correct).** `insertInvitation` stores `invited_by` as `actorWord(actor.staffId)`, which is `staff:<id>` (`identity/service.ts:334,369`). Passing `inv.invited_by` unchanged gives the same word as the grant rows' `granted_by` and the role-change door's actor. Wrapping it again would be wrong (mutation M5).
* **Two audit writers in one transaction (acceptable).** The money line goes through `identity/audit.ts` `auditStaff`: "Firm <key>: " prefix, `detail.firmId`/`firmKey`, entity `platform_staff`. The accept line goes through `audit/audit-event.ts` `auditEvent.record`: no prefix, lower-case `firmId`. DW3 asks for a byte-identical role-change line, and that door writes through `auditStaff`, so the shared helper must use `auditStaff` or copy its format. Using the same writer is the right choice. The two lines differ only in format, as every PF-4 staff line already does until AUD-1. One side effect is F2 below.
* **Helper.** Behaviour is the same as the old inline code. It makes one catalogue query per role plus one; roles are distinct and between 1 and 6, enforced by constraints. Return value unused. Key names only; no licence number, token or email (the breaker's full-text scan confirms).
* **Catalogue.** Money keys per role: READ_ONLY 0, CASE_OFFICER 4, CASE_MANAGER 4, BILLING_FINANCE 12, ADMIN 15, OWNER 16 (counted on a scratch DB with every migration). So invitations into Case Officer and Case Manager now write a line too. That is consistent with ruling 2 (b) and with the role-change door, which already wrote one for them. The test covers Case Officer.
* **PR #1910 (PF-12).** `git merge-tree ff0ef12a8 pr1910` merges cleanly (tree 147a4ba). #1910 wraps the whole accept transaction in `asBypass("platform.identity.invitation")`, so the new call runs on the bypass. The tables it reads (`platform_role_permission`, `platform_permission_key`) are named as unwalled catalogues in #1910's migration (line 14). `audit_event` and `workspace` are not walled there. No interaction found. If #1910's review m8 is done later ("resolve on the bypass, then write as the firm"), the money line must stay in the firm-scoped part. That belongs to PF-12, not to this row.

## Issues (all Minor; Should, none Must)
1. **F2: race on a database that has no audit row yet (new here).** `money-line.ts:18` reaches `identity/audit.ts:14-19` (`platformAuditWorkspaceId`: Prisma `upsert` plus a module cache) before the accept's race-safe `audit-event.ts:19-24` (`createMany skipDuplicates`). The breaker saw 1 of 2 parallel first accepts answer 500 (P2002), three runs out of three. Only an empty database can reach it, because seeding, signup and every invitation write a line first. Fix: let `identity/audit.ts` delegate to the race-safe maker. *The builder committed this fix during the review as 341e0459e (on top of ff0ef12a8). It is not part of the reviewed head and I did not review it; it needs a diff-only re-review (P-277).* That edit touches `identity/audit.ts`, which the touch list allows ("`identity/audit.ts` or the new helper file").
2. **F4: the helper's comment overstates its reach.** `money-line.ts:1-2` says "every door that hands out roles". Firm signup grants OWNER (16 money keys) at `firms/signup.ts:181` and writes no money line. Fix the comment to say two doors (the same uncommitted edit does this). Whether signup needs the line under ruling 2 (b) is a question for the row owner. It is not scope for this row.
3. **F1 (older code, now visible in the audit): an invitation outlives its inviter.** Deactivating an inviter, or cutting their roles, leaves their open invitation valid. The accept then grants money keys, and the line names the deactivated inviter (`session/service.ts:97,100`; `identity/service.ts:249`). The actor is correct by the brief ("as the grant rows record"), and the same transaction's `platform.invitation.accepted` line carries `invitationId` and `staffId` for correlation. The behaviour itself predates PF-6m (PF-4). Record it as a qa/BUGS row for the row owner; it does not block this PR.
4. **Test wording.** The "DW2 fail" line says "no role grant" but checks only the staff row and the invitation (`check_pf6m_money_line.ts`, DW2 block). Grants need the staff row (foreign key), so the claim holds, but it is not asserted. Optional: add a grant count.

Not a finding: F3 (the line counts keys of added roles, not keys new to the person). DW3 freezes this behaviour from PF-6b.

## D1–D20 (1–5; API row, so only what the evidence shows)
D1 Requirement fit 5 (DW1–DW3 and the QA-478 line green) · D2 Data integrity 4 (one line under 12-way replay; F2 on an empty DB) · D3 Reuse 5 (one helper, both doors) · D4 Rule integrity 5 (no line for 0 keys; only money roles named) · D5 Stability and recovery 5 (DW2 rollback; retry commits) · D6 Governance 4 (actor and keys recorded; F1) · D7 AI trust N/A (no AI) · D8–D14 N/A (no screen change; no web file in the diff) · D15 Speed 5 (accept 27–48 ms, role change 52 ms, timed on this head) · D16 Testability 5 (every Done-when line bites under mutation; DW3 checked against main's real code) · D17 simulated only · D18 Provenance 4 (the line names the inviter, not the invitation; correlate through the accepted line) · D19 Closure 4 (invitation door closed; signup door still open, F4) · D20 simulated only.

**BIC-01–20:** N/A. This is a platform identity API, not a case-side screen (§6 scope). **Graph (P-86):** not run, because `graph.mjs` rewrites `qa/graph.json` and this review may write only review.md. The new file adds no route or page; its one test names PF-6m.

## Journey score (reviewer, the one score for this check): **8 / 10, pass**
See `journey-test-reviewer-2026-11-16.md`: API journeys only, and the screen criteria were not exercised.

## Could not check
No browser, keyboard, 1024 px or zoom checks: there is no screen. No real Cognito: local stand-ins only. Commit 341e0459e (F2 and F4 fixes, the break report) was not reviewed. This Approve is for ff0ef12a8 only. The label needs a re-review of 341e0459e (P-277).

Verdict: Approve
Blockers: none · Majors: none · Minors: F2 workspace race on an empty DB, F4 comment and signup door, F1 invitation outlives inviter (older code; BUGS row), DW2 test wording.

## Re-review at 142cefbb6 (P-277: diff only, `ff0ef12a8..142cefbb6`, commits 341e0459e and 142cefbb6)
* **F2 fixed.** `identity/audit.ts` `platformAuditWorkspaceId` now returns `audit-event.ts`'s race-safe maker: `findUnique` by key, then `createMany skipDuplicates` (INSERT … ON CONFLICT DO NOTHING), then `findUniqueOrThrow`.
  * The new test line fails 3 runs out of 3 with ff0ef12a8's `audit.ts` (P2002 on one of the two first writers) and passes on this head.
* **Bare PrismaClient outside a transaction (demo-reset).** `demo-reset.ts:26` and the tests in PF-4, PF-6b and PF-21v call it with a bare PrismaClient. Each of the three statements then commits on its own.
  * ON CONFLICT DO NOTHING makes a second writer wait for the first and then read its row, so it stays race-safe there.
  * PrismaClient has every method used, and the same maker was already called with a PrismaClient by the FO-2, FO-4, FO-5 and J-6 tests.
  * The cast `db as Tx` is structural only.
* **Nothing lost with the cache.**
  * With the cache, the old code still ran one `findUnique` (by id) per call. It now runs one `findUnique` (by key) when the row exists, so the query count is the same.
  * The label string and the key are identical.
  * The platform-audit row is never reset, so a cached id had no extra value. Dropping it also removes module state that could outlive a rolled-back first writer.
  * No import cycle: `audit-event.ts` imports only `ports/audit.ts`.
* **F4:** the `money-line.ts` comment now names the two doors and points the signup question to the PR. **DW2:** the line now also counts `platform_role_grant` rows, which resolves my Minor 4. Neither changes behaviour.
* **Runs at 142cefbb6 (mine):**
  * PF-6m 12/12, PF-4b 53/53, PF-6b 24/24, PF-21v 54/54, PF-0p 113/113.
  * **PF-4 119/119 in full** (isolated `pf4` on :4437, parts A and B). That includes the six demo-reset lines and "the real demo reset keeps every platform audit line". The builder's 110/111 was part B only.
* **Still open:** F1 (older code; a BUGS row for the row owner) and the signup question in F4. Both are outside this row, so neither blocks.

Verdict: Approve (142cefbb6)
Blockers: none · Majors: none · Minors: F1 invitation outlives inviter (older code, BUGS row), F4 signup door (question for the row owner).

## Re-review at 584a4cb8f (P-277: diff only, `7d3c079a6..584a4cb8f`; card only, no code)
* **Card change.** `studio/api/src/platform/MODULE.md` gains one invariant line, and `tests/check_pf6m_money_line.ts` is added to its Tests list. The card is 32 lines, under the 40 limit.
* **Card checks (run on this head).**
  * `module-cards.py pr` on the PR's changed files: "PASS 1 module(s) touched, 14 cards".
  * `module-cards.py tree`: "PASS 14 cards, tree checked".
  * The tool's own fixtures, `check-module-cards.sh` under bash, exit 0.
* **Accurate as written.**
  * Both doors call `writeMoneyKeysGranted`: role change at `identity/service.ts`, invitation accept at `session/service.ts:100`.
  * No other writer of `platform.staff.money_keys_granted` exists in `api/src`.
  * Each change writes at most one line, naming every money role it adds, and always in the caller's `tx`.
  * The test path exists and passes, 12/12 at 142cefbb6, with no code change since.
* **Minor (wording, does not block).** The line opens "A role that brings money keys writes one … line", which as a module invariant reads as universal. The card's paths also cover `firms/signup.ts`, which grants OWNER (16 money keys) with no line (F4, still open as a question for the row owner). Scoping it as "When role change or invitation accept gives a role that brings money keys, …" would match the code exactly. The trailing "from role change and invitation accept alike" already narrows it.

Verdict: Approve (584a4cb8f)
Blockers: none · Majors: none · Minors: the card's invariant wording should name the two doors (signup is the F4 question); F1 still open (older code, BUGS row).
