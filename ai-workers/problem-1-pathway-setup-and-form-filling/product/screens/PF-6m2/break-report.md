# PF-6m2 break report: the accept re-checks the inviter; firm signup writes the Owner's money line

Breaker (Opus 5.5, effort high), 16 Nov 2026. PR #2045, head `51fb031e6`, branch `claude/runtime-inviter-recheck`. Brief: Lead B's `lead-b-briefs/PF-6m2.md`.
Scope (P-26): the accept's inviter re-check, the `platform.invitation.refused_inviter` line, and the signup money line. This is
an API-only row with no screen, so keyboard, 1024 px, zoom, uploads and the 100-program budgets do not apply. No isolated copy was started.
Method: scratch databases on 127.0.0.1:54329 (every migration plus the Sample firms) and the Nest app of the row's own test,
driven over HTTP. The harness is outside the repo (`/tmp/claude-0/breaker/attack.ts`, `attack2.ts`), and its databases were dropped afterwards. US$0, live AI off, :4400 not touched.
Suites run on this head: `check_pf6m2_invite_recheck` 13/0, `check_pf6m_money_line` 12/0, `check_pf4b_session_reads` 53/0,
`check_pf5_signup_billing` 53/0, `check_pf6b_permission_rules` 29/0. `check_pf4_identity` part B needs a running copy on :4541, so it was not run.

## Findings

| # | Severity | Steps | What happened | What should happen | Where |
|---|---|---|---|---|---|
| F1 | Minor | Admin T invites `no.manage@example.com` as Read-only (201). The Owner changes T to Case Manager (200). Case Manager holds every Read-only key but not `agent/staff:manage`. T tries a new invite (403). Then the invitee accepts the old one. | The accept answers 200. The grant row says `granted_by = staff:<T>`, from someone who at that moment may not invite anyone. The re-check copies only `roleRules`' key test. It does not copy the door's own key (`@PermissionKeys("agent/staff:manage")`). The same happens with any demotion to a role that still holds the invited role's keys, for example Admin → Billing/Finance with a pending Billing/Finance invitation, which then grants 12 money keys "by" a non-inviter. | The row owner decides. Either "may still give" also needs `agent/staff:manage` (as at invite), or the brief's key-only reading is written into MODULE.md as intended. | `identity/session/service.ts:128-136`; `identity/routes.ts:22` |
| F2 | Minor | An invitation's `invited_by` is set by SQL to `staff:someone@example.com`, or to `staff:` plus 250 characters. Then the invitation is accepted. | **500** "Internal server error". AuditEntry refuses the refusal line: detail `invitedBy` is copied raw, and it fails "detail holds ids only: no email address" or "≤200 characters". The whole transaction rolls back, so the invitation stays **pending**: it holds a seat, the state page still says VALID, and every retry is 500. Other bad values (`garbage`, `staff:`, `system:sign-up`, another firm's staff id) all give 410, "inactive", revoked, one line. | The same 410 refusal for any value that is not a staff id. The line should carry only the parsed uuid (or null), never the raw column. The door only ever writes `actorWord`, so reaching this needs a direct database write. Minor. | `identity/session/service.ts:104` |
| F3 | Minor | `invited_by` points at an **active** Owner of `sample-solo` (another firm), and the invitation is accepted. | 410, nothing granted, correct. But the line's reason is `inactive`, and the summary says "its inviter is no longer active". That is false: the person is active, in another firm. The same reason covers a malformed value. | A third reason, for example `not_firm_staff`, or summary words that do not claim the person is inactive. | `identity/session/service.ts:131` |
| F4 | Minor | A firm signup (DW3), then the actors in that firm's audit lines are read. | `firm.created`, `owner_created`, `terms.accepted` and `subscription.created`, and the Owner's grant row (`granted_by`), all say **`system:sign-up`**. Only the new money line says **`system:signup`**, as the brief wrote it. A trail filtered by the signup door's actor misses the money line. On accept, by contrast, the money line's actor matches the grant row's `granted_by`. | One actor word for one door: either use `ACTOR` (`system:sign-up`) or rename it everywhere. This is a brief-level choice, so it goes to Lead B rather than being changed silently. | `firms/signup.ts:45,197` |
| F5 | Minor | Admin T invites. T is deactivated. Before anyone accepts, `GET /api/public/invitations/:token` is called, and the seat count is read. | The state page answers `VALID`, "Continue to set your password", and the invitation still counts one seat until someone presses accept. Only the accept refuses (410). | The invitee is told only at accept. This is acceptable under the row's touch list (accept only). Noted so that the BR-4 page and seat counting can follow the same rule later. It is not a request for new scope. | `identity/session/service.ts:78-80` |

No Blocker or Major found.

## What held

- **Deactivation racing the accept, 40 runs.** Fresh invitation each run, deactivation sent before or after the accept with 0–6 ms skew. Result: 30 accepted (accept first) and 10 refused (deactivation first). There were 0 5xx and 0 mixed outcomes: every 200 had a staff member, one money line and no refusal line; every 410 had nothing granted, one refusal line and a revoked invitation. The firm-row lock orders the two (read committed).
- **Parallel accepts.** Eight accepts with a deactivation in the middle gave one 200 and seven 410, with one staff member, one money line and no refusal line. Ten parallel accepts after the inviter was deactivated all gave 410, with exactly **one** refusal line. A replay after success gives 410 and writes nothing new.
- **Inviter reactivated before the accept.** Deactivated, reactivated, then deactivated and reactivated again: the accept answers 200 with one money line, as the "checked at accept" rule says.
- **Demoted then promoted back.** Admin → Read-only → Admin before the accept: 200.
- **Role permissions changed in between.** The catalogue was edited by SQL. (a) Billing/Finance gained `agent/ai:switch`, which Admin lacks: 410 `role_no_longer_givable` [BILLING_FINANCE]. (b) Admin lost `agent/billing-report:view`: 410, same line.
- **Owner invited into OWNER, then lost the Owner role.** T was made Owner and invited OWNER with a reason; R then removed T's Owner role. Result: 410, line roles [OWNER], nothing granted. When T is Owner again before the accept, it answers 200.
- **Resend.** A resend by the Owner after Admin T was deactivated makes the Owner the new inviter (`invited_by = staff:<R>`). The old link answers 410 with no refusal line; the new link answers 200. For a refused invitation, resend and revoke both answer 409 "This invitation was already revoked.", the list shows REVOKED, and a fresh invite to the same email gives 201 and accepts (200).
- **Malformed `invited_by`.** An upper-case staff uuid is matched (200). Garbage, an empty id and a `system:` actor are refused cleanly (see F2 for the two exceptions).
- **No leaks in the refusal line.** Seven refusal lines were written. Actor `system:invitation-accept`. Detail fields are only `invitationId`, `invitedBy` (a staff id), `reason`, `roles` and `firmId`. No `@` and no `agent/` key name appear in any summary or detail. The 410 body is BR-4's fixed words.
- **Signup double submit.** Six parallel `verify` calls with one token and code: one firm, one Owner, **one** `money_keys_granted` line.
- **Signup rollback.** A forced failure of `platform.subscription.created`, after the money line was written, leaves no firm and no money line (49 before and after). A retry of the same link then succeeds with exactly one line.
- **Status codes.** A refused accept is committed and answers 410 `INVITATION_NOT_VALID`, never 5xx (except F2). The second try writes no second line.

## Re-break at e3632f97b

Only the diff `51fb031e6..e3632f97b` (`identity/session/service.ts`, plus its test) was re-broken, using the same scratch-database harness (`/tmp/claude-0/breaker/attack3.ts`), whose databases were dropped afterwards. No live copy was started. Suites on this head:
`check_pf6m2_invite_recheck` 18/0, `check_pf6m_money_line` 12/0, `check_pf4b_session_reads` 53/0, `check_pf5_signup_billing` 53/0, `check_pf6b_permission_rules` 29/0.

**F1: closed.**
- Admin T sends a Billing/Finance invitation, then is changed to Billing/Finance, which does not hold `agent/staff:manage`. The accept answers 410, with no grant and no money line. The line has reason `may_no_longer_invite` and `invitedBy` `staff:<T>`.
- The same holds for Admin → Read-only with a Read-only invitation.
- An Owner demoted to Case Manager: both the Billing/Finance invitation and the OWNER invitation are refused with `may_no_longer_invite`.
- Admin → Billing/Finance → Admin again before the accept: 200 with one money line.
- Catalogue edits by SQL: removing `agent/staff:manage` from ADMIN refuses an Admin's invitation. Giving the key to CASE_MANAGER lets a Case Manager's invitation through. Both follow the invite door's rule exactly.

**F2: closed.** Each of these `invited_by` values gives 410 `inviter_not_found`, revokes the invitation, writes one line and grants nothing: `staff:someone@example.com`, a bare email, `staff:` plus 240 characters, `staff:` plus 1000 characters, a trailing newline, a leading space, `staff:staff:<uuid>`, and non-English text. None gives a 500. The line has no `invitedBy` field. An upper-case staff uuid still matches (200).

**F3: closed.** Another firm's active Owner, written as `staff:<id>` or as the bare id, gives 410 `inviter_not_found`. The summary reads "its inviter is not a staff member of this firm".

**What the new key check opens: nothing found.**
- I ran 30 races of a demotion to Billing/Finance against the accept, in both orders: 25 accepted (with one money line each) and 5 refused (`may_no_longer_invite`, nothing granted). There were 0 5xx and 0 mixed outcomes. The firm lock serialises the two.
- Across all 20 refusal lines: no `@`, no `agent/` key name, and every `invitedBy` is `staff:<uuid>`. Two reasons appeared: `may_no_longer_invite` and `inviter_not_found`.
- `role_no_longer_givable` (an Owner who becomes only an Admin, with an OWNER invitation) is covered by the row's own test, which passes.
- Precedence is not-found, then inactive, then the invite key, then the roles. So an Owner demoted to Case Manager is logged as "may no longer invite" without naming OWNER. That is acceptable, and not a finding.

**Still open:**
- F4 stays with Lead B.
- F5 is outside the touch list (a known gap).
- Neither is a Blocker or a Major.

Verdict: Approve e3632f97b04791c41ff0cea1e0e3a2dd91abee0c

Re-check at 32804de86: `git diff e3632f97b..32804de86 -- '*.ts'` touches only `tests/check_pf6m2_invite_recheck.ts`, adding the reviewer M1 case (an Owner's Case Officer invitation, the Owner then made Admin → 410 `role_no_longer_givable` [CASE_OFFICER]). No code changed. The suite passes 19/0 on this head.

Verdict: Approve 32804de869c02fa59cbfb2b530ae34e5ee839871 (test-only diff since e3632f97b)
