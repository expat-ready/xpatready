# Review: R1.62 PF-4p part 1, client sign-in plane, `/api/portal` guard, own cases (PR #3647)

Reviewer, 25 Nov 2026. I did not build this. Base 63f5cc913 (the merge base with origin/main).
Asked for 3e506f8d8. The builder then pushed dded96722 (a person-rule fix) and 2e8acf698 (migration folder rename, Mergify slot, card rows; no code change), so the verdict is for **head 2e8acf6987ce2c3cbef01ec730a4afb741b81855**.
Scope: shape.md part 1 and the part-1 lines of BACKLOG PF-4p. No concept.md (API only). Invitations, activation, passwords, suspend and revoke routes, the stream and all screens are parts 2-5 and are not findings.
My copy ran on :4447, API only (screens lane range; web build broken in this sandbox, see the end). Never :4400; stopped and dropped afterwards.

**Verdict: Ship (Approve).** No open Blocker or Major. One Major at 3e506f8d8 (M1) is fixed at dded96722, and I re-checked the fix. Six Minors (m1-m6) and three carry-forward notes follow.

## What I ran (evidence)
| Run | Result |
|---|---|
| `npx tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pf4p_client_identity.ts` (from `prototype/`) | 3e506f8d8: 50/50, exit 0. 2e8acf698: 51/51, exit 0, three runs (main copy once, a clean worktree twice), no flake |
| `prisma migrate diff` (all migrations applied → `prisma/schema`) | 3e506f8d8: `DROP CONSTRAINT "platform_client_account_person_fkey"`, exit 2 (M1). dded96722: empty migration, exit 0 |
| `migration-slots.py check origin/main..HEAD` · `mergify --check` | PASS, 1 new migration after main's newest (20261124170000) · PASS, 33 area scopes |
| `module-cards.py pr <changed files>` · `tree` | PASS, 3 modules touched · PASS, 15 cards |
| Mutations (scratch worktree, reverted) | Person filter removed from `ownCases`: 5 FAIL. core.ts pass-through removed: 4 FAIL (link-only 403). Both closed-firm checks removed: **51/51 still pass** (m1) |
| Full app on :4447 (`PLATFORM_IDENTITY=local`), journeys and break-it | See `journey-test-reviewer-2026-11-25.md`. **9.5/10, pass** |
| `tsc --noEmit -p api/tsconfig.json` | Not finished: the compiler ran out of memory here (exit 134). The CI type check is the one that counts |

## Correctness
* **The planes.** The client stand-in has its own HMAC key (`local.ts:197`, derived from the same setting with its own label), its own issuer and a `plane` claim. Tokens cross no plane boundary:
  - a staff token on `/api/portal/*` → 401;
  - a client token on `/api/platform/me` → 401;
  - a client token on `/api/system/me` → 401;
  - a client token on `/api/runtime/*` → 403 link-only.
  All four were checked live on the full app as well as in the suite. `ClientIdentity` refuses one shared port (`service.ts:58`), as PF-4s does.
  Forged tokens are refused: a swapped `sub` with the old signature, `alg:none`, and a changed signature each → 401.
* **Own cases only.** The handler finds the client's `case_client.fo_person_id` rows, then `runtime_case`, both filtered by `firmId` explicitly. The runtime tables are not walled yet (`check_pf12_walls.ts:43`), so the explicit filter is what protects them.
  Another client's case, another firm's case, a random id and a malformed id all give the same 404, byte for byte. Two queries per list: no per-row requests.
* **PF-12.** Both tables are walled, firm-first and FORCE RLS. The definer lookup `platform_client_account_firm` gives the firm id only, owned by `xr_wall_reader`, with the RDS grant dance copied from PF-12b/pf10a. The guard calls `enterRequest` and `setRequestFirm` as PF-4's guard does.
  In production `platform-client-identity.ts` loads before `platform-identity.ts`, so ClientGuard runs first. PF-4's later `enterRequest` re-reads the request's firm tag, so the client's firm stands. The live copy confirmed it (own cases read as `xr_app`).
* **Sessions and races.** Sign-in locks the account row, re-checks ACTIVE and dates itself after the last sign-in and the last ending (`service.ts:100-105`). Ten parallel sign-ins gave 10 × 200 and 11/11 distinct audit times (one earlier sign-in included).
  - A sign-out ends the session at its next request; a second sign-out with the same token → 401 SESSION_ENDED.
  - Suspending the account mid-session → 401 paused; setting it ACTIVE again restores the session.
* **Input.** The door is gated before the body is parsed (`service.ts:84`, as PF-4's QA-621 order). Strict zod: an unknown field, a 400-character email, an array body and a missing email are each a 422 naming the field. Unknown email and wrong firm give the same 401.
* **Audit.** One line per sign-in, refused sign-in and sign-out. Actor `person:<fo_person id>`, typed CLIENT by AUD-1a's trigger. No email on any line (checked in the database).

## Major, fixed in dded96722 (re-checked)
* **M1 (3e506f8d8, migration.sql).** The `(firm_id, person_id) → fo_person` foreign key existed only in SQL. `prisma migrate diff` dropped it, so the next generated migration would have deleted the rule. The fix is the trigger `pf4p_client_person_ok` (migration.sql:32-47):
  - on insert, the person must be one of the firm's own;
  - on update, the firm and the person never change.

  It is SECURITY INVOKER, so it reads `fo_person` under the writer's wall. Its name sorts after `0_pf12_firm_first`, so the firm check fires first. The rollback drops it. The drift diff is now empty, and the new DW6 line fails when the update branch is removed. The comment's premise holds: nothing in `api/src` or the migrations deletes `fo_person` rows (erasure and merge keep them).

## The two shared-contract lines: safe
* **`ports/audit.ts:15` AuditActor gains `person:`.** The change is additive: no word that passed before is refused now.
  - The database already maps `person:` to CLIENT (aud1a trigger, its line 37), and so do `actorTypeOfWord` (`audit/context.ts:42`) and `CaseActor` (`ports/audit.ts:86`). Port and database now agree.
  - The other readers of AuditActor gain one accepted prefix and no new caller: `settings.ts:149` (staff routes only) and `ports/fo-person.ts:43` (`created_by`).
  - Wording drift: see m3.
* **`core.ts:99` lets `/api/portal` through to the client guard.** It is a copy of PF-4s's line 98 (any letter case).
  - Without it, every portal call is a link-only 403 (mutation above).
  - With it, the portal paths are guarded by ClientGuard alone. That guard is registered in the same feature file as the only portal controller. It denies by default at runtime (`guard.ts:71`) and stops the start-up for an undeclared, misplaced or mixed route (DW5, 3 cases).
  - Residual risk, as for `/api/system`: a portal controller registered without this feature file would be unguarded. Acceptable while the feature file owns both.

## Minor (Should; none blocks)
| # | Where | Finding | Fix |
|---|---|---|---|
| m1 | `service.ts:73`, `:91` | The closed-firm refusal (PF-11c/SA-2-21, copied from PF-4) has no test. Removing both lines keeps 51/51 (STANDARDS §3.10, §7 "a rule's test fails when the rule is removed"). It works live: a closed firm → 401 FIRM_CLOSED for both the token and the door | Add a pass/fail pair: a firm set to DELETED → 401 FIRM_CLOSED on `/me` and at the door, then ACTIVE again → 200 |
| m2 | `tests/check_pf4p_client_identity.ts:237` | The BACKLOG line "each sign-in writes … one activity event (FO-14; fake until then)" is neither built nor listed as PENDING, unlike firmAllows | One PENDING line naming part 3 (`PortalActivityPort.record`), so the requirement stays visible |
| m3 | `keys.ts:26`, test `:212` vs `ports/audit.ts:12` | `person:` now names two kinds of id: the case side's subject id (`runtime.ts:117`; `person-link.ts:42` renders any `person:` as "the person on their own link") and the portal's `fo_person` id. The comments call the same word "party id" and "fo_person id". The entity on the line tells them apart today | Use one wording in the three comments. When a reader names actors, distinguish by entity |
| m4 | migration.sql:7 | "Never deleted: a revoked account is kept (AG-15-6)" is not enforced. An account without an invitation can be deleted by the app role. pf10a revokes DELETE from `xr_data` for its kept tables | `REVOKE DELETE, TRUNCATE ON platform_client_account FROM xr_data`, plus a fail test; or drop the claim from the comment |
| m5 | `service.ts:115` | Sign-out sets the end to max(now, this session's sign-in time). A second session signed in during the same millisecond is dated +1 ms (`:102`), so it outlives "every session ends" | max(now, `last_sign_in_at`) under the row lock already taken |
| m6 | `service.ts:46-48` (via `unauthorized`) | A paused or closed account gets the title "Sign in again" while the detail says "Contact your firm". Signing in again cannot help | Give these refusals their own title (e.g. "Access paused") before part 4 shows them |

## Carry-forward notes (not findings for part 1)
* `/API/PORTAL/...` in upper case gets the web app's page (200 HTML), exactly as `/API/SYSTEM/...` does today. It fails closed. This is the known case-sensitive catch-all in `main.ts` (BACKLOG PF-4pc). PF-4pc's test should name `/api/portal` too.
* Part 4: `/api/portal` is not a public path on a firm's address yet. When it is registered, `guard.ts:76` `setRequestFirm` silently replaces the host's firm. Firm B's token on firm A's address must be refused (PF-25's "firm A's address never serves firm B", `enterFirm`'s R2 rule).
* Part 2: the person trigger accepts a merged-away person. Invitations should skip `merged_into_id IS NOT NULL`, as erasure's `foPersonCheck` does.

## D1-D20 (1-5)
D1 5: part 1's Done-when lines met (planes, own cases, 404 by URL, suspend, audit) · D2 5 · D3 5: copies PF-4/PF-4s's shape, own port, own key · D4-D13 N/A: no screen in this part · D14 5: RFC 9457 with codes · D15 5: 7-22 ms per call · D16 4: pass/fail per rule except m1 and m2 · D17 simulated only · D18 4: audit typed CLIENT (m3 wording) · D19 4: hands a clean API to parts 2-5 · D20 simulated only.

## BIC-01-BIC-20
N/A: no client screen in part 1 (part 4 brings Sign in, Home and the not-found page; it gets the scorecard).

## Graph (P-86)
`graph.mjs` lists the five `/portal/*` routes under G3 ("no test reaches"). The suite calls each of them through its `call()` helper. Forty `/system/*` routes show the same, so this is a gap in the tool's detection, not in this PR.

## Could not check
The web build fails in this sandbox (`pdfjs-data` plugin, MODULE_NOT_FOUND), so `isolated.sh` refused to start. I ran `api/src/main.ts` directly on :4447 with migrations and the Sample seed. Portal accounts were seeded by SQL, because there is no invite until part 2.
Not checked: Cognito, a full `tsc` (out of memory), the CI suites beyond those listed, and a real person's walk (D17, D20).

Reviewer: Approve 2e8acf6987ce2c3cbef01ec730a4afb741b81855

## Round 2 (diff-only): `2e8acf698..fd4bc940b`
Reviewer, 25 Nov. Asked for f03d188f5; the builder then pushed fd4bc940b (CodeQL: `normalEmail`'s edge regex became a character scan), so this verdict is for **fd4bc940ba802e4eae05ca1cb648f29074f64391**. Runs at fd4bc940b from `prototype/`: `check_pf4p_client_identity.ts` 60 passed, exit 0; `check_pf12_walls.ts` 110 passed, exit 0 (both also at f03d188f5); `check_pf0p_ports.ts` (migrate diff included) 127 passed at f03d188f5.
* **Accounts kept (m4 / breaker m8): right.** The delete is refused for the app role in its own firm and for the owner. TRUNCATE is refused for the owner too, even with CASCADE (`xr_app` has no TRUNCATE grant). No foreign key or reset script cascades into the table. The rollback still drops the table, then the function.
* **Definer triggers: safe.** Both are `prosecdef`, owned by `xr_wall_reader`, with `search_path=pg_catalog, public, pg_temp`, and `xr_app` holds no EXECUTE. Probed as `xr_app` in firm A on a scratch database (dropped afterwards):
  - its own person: inserted. Firm B's person: refused by the person trigger. A row naming firm B: refused first by `0_pf12_firm_first`;
  - an update still passes, and a `pg_temp.fo_person` look-alike holding firm B's person under firm A is ignored (refused);
  - the function compares `p.firm_id = NEW.firm_id` itself, so reading as the wall reader leaks nothing. This now meets PF-12's guard rule; the round-1 head could not have passed it (SECURITY INVOKER), and I did not run it then.
* **Email check (m2): works in ARE.** The `\uXXXX` escapes inside the bracket are read as characters, not letters: `u0afeb27@b` is accepted. NFD, a no-break space, U+2007, U+202F, U+200B, U+FEFF, a tab and U+0085 are refused. `IS NFC NORMALIZED` holds. The scan in fd4bc940b equals the old regex on every code point (0 mismatches, at both ends and inside) and is linear (250,000 spaces in 5 ms).
* **`/api/portal` in INPUT_PATHS: changes no existing door.** The only routes under `/api/portal` are this PR's. Express matches at segment boundaries; the SNS exception and the hooks are untouched. The 2 MB test gets 413.
* **Race-time refusal (breaker m5): right.** The row's own status gives its words, and the refused line is written in the same transaction (it commits). `!row` can no longer happen now that a delete is refused.
* **Sign-out (m5): right.** `max(now, authTime, last_sign_in_at)` under the row lock already taken, and the guard ends a session at `<=`. Mutation test: reverting the line gives 1 FAIL.
* **Closed firm (m1): the test bites.** With both FIRM_CLOSED lines removed, 1 FAIL (the main copy, reverted; tree clean).
* **Titles (m6): right.** Only the title changes; `type` and `code` stay. "Portal closed" is used for a closed firm.

**New Minor r2-m1 (Should, not blocking).** All this project's databases use the C collation. In C, `lower()` changes ASCII only, and `[[:space:]]` covers ASCII only. So the check still accepts `josÉ@…` (upper-case non-ASCII), and U+3000, U+2000-U+200A, U+2028/9, U+1680 and U+205F anywhere in the email, including at either end. `normalEmail` lower-cases the first and trims the second at the ends, so a row written by SQL with them can never be matched (round-1 m2's class, narrower). The migration comment's "no space of any kind" claims more than it does.
Fix: put the scan's whole `EDGE_SPACE` set into the check's bracket. For case, compare with `lower("email" COLLATE pg_c_utf8)` (PostgreSQL 17+; Unicode simple case mapping), or reword the comment to "ASCII case".

Journey score: the round-1 score, 9.5/10 (`journey-test-reviewer-2026-11-25.md`), stands. This diff changes no screen or journey, and its API paths are covered by the suite above.

**Verdict: Approve** (Ship) for fd4bc940ba802e4eae05ca1cb648f29074f64391. No open Blocker or Major; r2-m1 can go with part 2.

Reviewer: Approve fd4bc940ba802e4eae05ca1cb648f29074f64391
