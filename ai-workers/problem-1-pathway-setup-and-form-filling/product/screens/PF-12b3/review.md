# PF-12b part 3 review: the three firm-less bypass uses write a platform line; re-encrypt leaves the list

Reviewed commit `f817c153bb5274ceb4e6de88f10d0b40d715dcbc` (branch `claude/runtime-pf12b3`). I read only the stacked diff, `git diff 4f7009ead1a391aa307799530d71e62d15528116 f817c153`.
I checked it against the tech lead's ruling (Lead 15, option 1 on #2752; Lead 70 on #1999: every bypass use writes an audit_event row, no log-only) and its Done-when.
I am a fresh session that did not build this row. Postgres was on :54329; the isolated copy used runtime port 4433, never :4400. Backend row with no screen: screen-only parts of the skill are N/A.

## What I ran (shared tree, clean, at f817c153)
- `tests/check_pf12b_bypass_audit.ts` **58/0**.
- Related suites, all green: `check_pf12_walls` 100/0, `check_pf12b_doors` 31/0, `check_pf19p_platform_mail` 68/0, `check_pf5_signup_billing` 54/0, `check_pf5v_signup_mail` 13/0, `check_case_feed` 42/42, `check_aud1b_adapter` 39/0, `check_aud1m_case_writes` 17/0, `check_pf24_secrets` 84/0, `check_pf14_jobs` 95/0, `check_pf19r_every_sender` 21/0, `check_pf19b_mail` 29/0.
- `check_aud1a_insert_only` 31/1: its part B needs an API copy on :4606 that I did not start (fetch failed). The failure comes from the setup, not from this diff.
- `tsc -p api/tsconfig.json`: no error in any touched file.
- Two mutation runs on a scratch worktree (see m2).
- A journey walk over real HTTP and a browser on the isolated copy `rv_pf12b3` (see the journey report).

## Focus questions, answered
**Every database touch on the three uses sits in a transaction that wrote the line.** This holds, with one exception (m1).
- The purge is one transaction: line first, then delete (`firms/signup.ts:233`). Its only caller is the job handler (`:86`).
- account.mail: the line and the outbox row are in one transaction (`send/mail.ts:40`). Both sign-up callers (`signup.ts:147`, `signup-identity.ts:42`) go through `send`, and no platform mail uses `sendIn`.
- `dispatch` after the commit only enqueues a pg-boss job (no walled table).
- job:messages.send: `sendPlatformRow` writes the line before its `FOR UPDATE` read (`send/messages.ts:260`). The try-count path has its own transaction (`:242-249`).

**mayRunInside** now keys on `"platform"` (`firm-scope.ts:150`). The nested-use test asserts both directions, and also the per-firm stand-in.
- The sign-up flow still works. In the suite, real mail inside `platform.firms.signup` passes.
- My browser walk: verification email, confirm, sign-in, and "already have an account". Each account.mail run added exactly one null-firm line.

**Re-encrypt off the list.** `asJob` now runs a firm-less re-encrypt job with no bypass, and two refusals still stop it:
- the runner refuses a firm-less job that is neither recurring nor on a platform queue before its handler (`check_pf14_jobs` "never reaches its handler");
- the handler refuses one before any read (`reencrypt.ts`, first lines of the handler).
- With no bypass, a stray read would also see no firm's rows.

**Can recordCase refuse or misattribute the line?** Not on today's callers.
- Public sign-up routes skip the guard (`identity/guard.ts:99`), so `req.platform` is unset. The request scope then has no firm and no actor (`observability/hook.ts:40,58`).
- Platform jobs have a null job firm.
- So `firmId = caseFirm ?? scope ?? named ?? null` gives null (`audit-event.ts:87`). The actor `system:<use>` passes CaseActor and gets type SYSTEM.
- A signed-in request would be refused by the actor check, not misattributed, and fail-closed.
- On the copy, the line read: firm null, `system:platform.account.mail`, SYSTEM, entity `bypass use`, key = the use, workspace `platform-audit`, correlation id a uuid, detail `{use, method: POST, correlationId}`.

**Is the case-side entry shape acceptable?** Yes, as an interim, with the caveat in m3.
- No current reader mistakes the line for a case line:
  - the firm Activity log filters on `firm_id` (`audit/firm-read/service.ts:134,160`);
  - the studio views filter on the demo workspace;
  - the action and entity name it plainly.
- Avoiding a port change without asking (P-423) is the right call.

**Tests are meaningful pass/fail pairs for each use's main path:**
- the purge's pass (one null-firm line) and fail (nothing deleted);
- account.mail's pass (1 line, row written) and fail (no row);
- send's pass (1 line, SENT) and fail (QUEUED, no try);
- the registry is 8 + 3 with re-encrypt absent;
- `unaudited` now refuses any `none:` text.
- Removing `touchPlatform` from any of the three main paths turns a test red (checked by reading). The catch path is not covered (m2).
- Size: +96/-44 in total, about 50 lines of app code. Under 150.

## Issues (no Blocker, no Major)
1. **m1, Minor (Should): the try-count path reads before it writes the line.** At `send/messages.ts:243-244`, `findFirst` runs and `if (!row) return null` commits a bypass read with no line. By then `sendPlatformRow`'s line has rolled back, so this job run leaves no row.
   - It is reachable only in a race: another worker finishes the row between the rollback and this read. The job then fails and its retry writes a line ("skipped").
   - Part 1's sweep sets the precedent: a read with nothing acted on writes no line.
   - Fix (one line): move `await touchPlatform(tx)` above the `findFirst`, as `sendPlatformRow` does.
2. **m2, Minor (Should): the catch path is untested.** Two mutations survived, and both suites stayed green (58/0 and 68/0):
   - (a) deleting `touchPlatform` from the try-count transaction (`:245`);
   - (b) deleting the `BypassNotRecorded` rethrow (`:240`).
   - Add one pass/fail pair:
     - a provider refusal counts one try and writes one null-firm line;
     - a port that fails only on the first write counts no try (this proves the rethrow).
3. **m3, Minor (Should): the line uses the case-side entry shape, against the port's written contract.**
   - `ports/audit.ts:111` says a platform line never names a workspace. The CaseEntry doc (`:86-91`) says the shape is for case and configuration lines.
   - `touchPlatform` (`firm-scope.ts:222-237`) does not say why it uses the case shape. It also does not check that no firm is in scope.
   - `platform.account.mail` is `outside: true`. If it ever ran inside a firm's job, `audit-event.ts:87` would stamp that firm on the "firm-less" line.
   - Fix:
     - say the departure and its reason in the comment and the PR body;
     - refuse in `touchPlatform` when the scope names a firm (`currentFirm()` or the job's firm);
     - raise the port question (an AuditEntry with an optional firm, or a platform entry) with the tech lead under P-423, as a later row.

Not findings for this row:
- Outside the diff: `platform.firms.signup`'s new-email path changes `platform_signup_pending` (`signup.ts:154-163`) with no line of its own. That is the same register the purge now lines. For the tech lead, if R1.4 is meant to cover it.
- The "Check your email" page says "We sent" even when the line failed. That is PF-5's background step (anti-enumeration), and "Send it again" recovers.

## Scores (D1–D20; backend row)
- **D1 9:** the ruling is met for all three uses, and re-encrypt is off the list.
- **D2 9:** the line and the work share one transaction. m1 is a race-only read.
- **D5 9:** a failed line gives BypassNotRecorded (500 in plain words, or a retried job), and no try is wrongly counted.
- **D15 9:** one insert per use run (plus the workspace lookup).
- **D16 8:** a pass/fail pair for each use, and mutation-checked. The catch path is untested (m2).
- **D18 8:** MODULE card and comments are updated. The port departure is not stated (m3).
- **N/A:** D3, D4, D6, D7, D19; D8 to D14 (no UI in the diff).
- **D17 and D20:** simulated only.
- **BIC-01 to BIC-20:** N/A (no case-side screen).
- **Graph (P-86):** `graph.mjs` maps no element or route to this row. The suite is named in `MODULE.rows/PF-12b3.md`.

## Journey score (reviewer, the one score for this check)
**9.5 / 10, pass.** Details: `journey-test-reviewer-2026-11-21.md`.

## Could not check
- The PR body and CI on GitHub.
- A real Cognito sign-in (local stand-in only).
- The purge job over the real scheduler (suite only).
- `check_aud1a_insert_only` part B (needs its :4606 copy).

**Verdict: Approve f817c153bb5274ceb4e6de88f10d0b40d715dcbc.** No Blocker or Major is open. m1 to m3 are recommended in the next push, or can be recorded for later.
