Verdict: Changes requested

# PF-12 review: database walls between firms (schema and permissions, API only)

Reviewed commit `5f22defa42ad90b8d5bc56e3dd29e6eb8cdca0af` (branch `claude/sweet-mccarthy-cnj9qn`, PR #1910), against Lead B's brief `lead-b-briefs/PF-12.md` (rev 16.34), BACKLOG row PF-12 and main's records commit 718a3672c. Reviewer role, independent of the builder and the breaker. I edited no code.

## Blocker

**B1. A firm's own public site answers 404 under the walls (a public door never sets its firm).** In `api/src/platform/web-address/host.ts:67-74` the host middleware finds the firm through the bypass, but it only sets `req.publicFirm`. It never sets the request's firm. The handler (`web-address/routes.ts:65-67`) then reads `platform_firm_web_address` with no firm, gets nothing back, and answers the plain not-found.
- Reproduced on isolated copy :4643 at 5f22: `curl -H 'Host: sample-firm.localhost:4643' /api/public/site` returned 404 (same for `sample-solo`).
- With row-level security turned off on that one table only, the same request returned 200 `{"webAddress":"sample-firm"}`.
- This breaks two lines of the brief: "the public doors … resolve the firm first, then set it" and "no route's answer changes for a correct caller". Every path registered with `registerPublicPath` inherits the fault (the FO-3w pages, FO-2's form and the portal, as they arrive).
- PF-25's suite stays green only because it injects an owner client: `tests/check_pf25_web_address.ts:320` has `{ provide: Db, useValue: db }`.
- **Fix:** when `r.kind === "firm"`, the middleware also sets the request's firm (for example `setRequestFirm(req, r.firmId)`, which the interceptor's `inRequest` picks up). Add a pass and a fail through a real server in `check_pf12_walls.ts`.

## Major

**M1. Database checks that look up another row's firm stop working under the walls.** The brief says "every trigger and RESTRICT key on main holds against the app". Two PF-19a triggers do not:
- `msg_template_version_in_firm` (`prisma/migrations/20261115004500_pf19a_platform_messages/migration.sql:411-420`) and `msg_outbox_template_in_firm` (`:423-433`) are SECURITY INVOKER and raise only `IF FOUND AND …`. Under the walls, firm B's row is never found, so the check passes.
- Reproduced on a scratch database with every migration at 5f22: as `xr_app` with firm A, an insert into `msg_template_version` (firm A) pointing at firm B's template **was accepted**. The same insert as the owner was refused by the trigger.
- With RESTRICT keys, firm B then cannot delete its own template.
- 22 `IF FOUND` / `IF NOT FOUND` lines exist across the migrations. Each one that reads a walled table needs the same audit; the concurrent break report names PF-25's `platform_web_address_held_by_other` as another.
- **Fix:** do those lookups through narrow definer functions (the `platform_web_address_taken` pattern) or composite `(firm_id, id)` keys, with fail tests. Replacing a function body goes beyond "policies and roles only", so ask Lead B / the release holder in the PR.

**M2. Main has moved: the branch conflicts, and two new public routes fall outside the named list.**
- GitHub reports `mergeable_state: dirty` (conflict in `front-office/booking/service.ts`).
- FO-3pa (main 1d0c740a7) added `GET /api/public/firms/:key/book` and `GET /api/public/bookings/:token/ics`. Neither matches `firm-scope.ts:98-99`; I checked by calling the two patterns directly, and both return false. Once merged, both routes become `BypassRefused` and answer 500.
- main's new `publicFirm()` helper must also run through the bypass.
- **Fix:** handle all three in the merge, then run `check_fo3pa_public_answers.ts` against an isolated copy.

**M3. The release gate does not actually run under the walls.** The brief says: "Run every PF and FO suite unchanged under the walls. Their cross-firm tests are the release gate."
- Most PF/FO suites build services on an owner (superuser) `PrismaClient`, or on `Db` in "direct" mode. In direct mode (`firm-scope.ts:120-123, 190-192`) an unscoped query runs on the bypass role. Their cross-firm checks therefore pass whether the walls hold or not; B1 is the proof (green suite, 404 server).
- Only the real-server suites exercise the walls: pf4, pf4b, pf1, pf23, pf24, d1, c10.1 and the fo4 browser suite.
- The doors (sign-in, invitation, web form, booking page and link, host site, sign-up) are tested only through unit `asBypass` calls (`check_pf12_walls.ts:234-253`), never as HTTP requests through the walled server.
- **Fix:** add a real-server pass and fail per door to `check_pf12_walls.ts`, and state in the PR which suites run under the walls.

**M4. The PR record the brief requires is missing.** At 5f22 the body still says "Draft, in progress". It lacks:
- the table-by-table policy list;
- the exception list. The PR adds `platform_permission_key`, `platform_terms_version` (no `firm_id`) and `platform_signup_pending` (forced, no policy) beyond the brief's three. That is justified, but it must be listed.
- "Shared-file lines" with the owners' OK for the 12 files outside the touch list;
- the scripts and suites that rely on the superuser. The owner is still the cluster superuser `xr_studio`, and `check_pf12_walls.ts:109` asserts it.
- the suites' result lines;
- the deviation from "`SET LOCAL` in each request's transaction": it sets the value at session level on each checkout instead. The rules say never deviate silently.

CI did not run on 5f22 (only skipped or neutral checks). The previous head, 275bea45d, failed `module-cards` and `pr-rules`.

## Minor

- **m1.** HEAD requests and trailing slashes answer 500. `routeOf` uses the raw `req.path` (`firm-scope.ts:151`), and the patterns end in `$` (`:94-107`). Reproduced: `GET /api/public/forms/<token>/` → 500, where it was the form's own answer before. **Fix:** normalise the trailing slash and HEAD before matching.
- **m2.** Bypass uses outside the named list:
  - `asBypass` lets a `direct` use run whenever there is no scope, even inside the API server (`firm-scope.ts:142` ignores `unscopedMode()`).
  - Every API start logs `platform_bypass use=direct-process` (in every isolated copy's api.log). Unscoped start-up queries that run before `FirmWallsInterceptor.onModuleInit` go to the bypass under no named use.
  - **Fix:** allow `direct` only when `unscopedMode()==="direct"`. Wall unscoped queries before `NestFactory.create`, and put the start-up uses on the list.
- **m3.** The missing-policy guard accepts any policy (`check_pf12_walls.ts:52`), so `CREATE POLICY p ON fo_x USING (true)` passes. **Fix:** require a policy that uses `platform_session_firm()`, or one on a named role-only list (CS-W1's `TO xr_case_lookup` policy).
- **m4.** One SQL statement reaches the bypass: `GRANT xr_staff_bypass TO xr_app … SET TRUE` (migration :49). The bypass role also owns `platform_web_address_taken` (:64). `appRoleProblems` (`firm-scope.ts:230-238`) ignores roles the app can SET to. This is within the brief's design (the named list lives in code), but the owner should own the function.
- **m5.** `GRANT … UPDATE ON ALL SEQUENCES` (migration :53) lets `xr_app` call `setval` on shared sequences such as `module_event_seq_seq`, which would stop every firm's next insert. `USAGE` is enough for `nextval`.
- **m6.** The per-connection tag (`firm-scope.ts:192-196`) trusts that nothing else changes `role` or `app.firm_id` on a pooled connection. Today nothing does (grep). A later `SET ROLE`, `set_config(…, false)` or `RESET ALL` (CS-W3 plans per-transaction calls) would leave the tag stale, and the next checkout would run as the wrong firm. Say so in the module card, or reset on release.
- **m7.** The API process still opens owner/superuser connections outside the walls: pg-boss (`platform-jobs.ts:44`, `DATABASE_URL`) and the start-up Sample seed (`identity/sample-seed.ts:29`). Neither is on the named list or audited, and the start-up check sees only the Prisma pool. Main's CS-W1 brief (718a3672c) expects the start-up seed on PF-12's named list.
- **m8.** The invitation accept runs its whole write transaction on the bypass (`identity/session/service.ts:87`), so WITH CHECK never confirms that its writes land in the invitation's firm. Resolve on the bypass, then write as the firm, as sign-in does.

## What holds (checked)

- **Migration content:**
  - Only ENABLE/FORCE plus policies, roles, grants and two `platform_` functions; no table, column, key or index change.
  - 62 tables walled: every `platform_*` (bar the catalogues), `fo_*`, `money_*`, `msg_*` and `plat_complaint*` table on the branch.
  - `msg_template*` platform rows: firms can read them, never write them; the owner/firm check constraint pairs `owner='PLATFORM'` with `firm_id IS NULL`.
  - No firm, `''` or garbage → no rows or a uuid error.
- **Roles:**
  - `xr_app`: not a superuser, no BYPASSRLS, cannot create, owns nothing, cannot `SET session_replication_role`, `DISABLE TRIGGER` or `row_security=off`; terse errors.
  - `xr_case_lookup`: created NOLOGIN only if missing, its attributes re-set, no grants, idempotent. It works whichever of PF-12 and CS-W1 lands first.
  - The start-up refusal works: the real `main.ts` as owner → refused; as `xr_app` → starts.
- **Stamp and timing:** the stamp is later than every migration before it and unique, never `.at(-1)`. The migration is measured right after itself (database "bare"), then on demo-shaped data with row counts unchanged.
- **Mechanism:**
  - AsyncLocalStorage: the guard's `enterWith` runs before any await, and Nest 11 binds `next.handle()` to the interceptor's scope.
  - The pool sets the firm and role at checkout, in the caller's context. A transaction keeps the firm that opened it.
  - Prisma 7's same-tick `findUnique` merge is proven and switched off outside transactions; start-up fails loudly if Prisma's internals move.
  - The door edits are 1-4 lines each. The extra files are each needed for "doors resolve then set", but they must be listed (M4).
- **Live (:4643):**
  - 60 interleaved `/api/platform/staff` calls from two firms each saw only their own staff (30/30).
  - Firm A reading B's staff by id → 404.
  - Booking slots door → 200 for its firm, 404 for the other.
  - Web form door: an unknown token gives the form's own 404 (only a trailing slash gives a 500, m1).

**Runs.** The other session moved HEAD to d6c1bdb4c at 02:54:56 UTC (the migration rewritten as a loop over the same tables, plus module cards) and left uncommitted edits at 03:03. My later runs may include those edits; B1 and M1 were reproduced on 5f22 code.

| Suite | Result |
|---|---|
| `check_pf12_walls` (5f22) | 82/82 |
| pf0p | 113 |
| pf14 | 92 |
| pf19a | 94 |
| pf19b mail | 28 |
| pf19b sending | 40 |
| pf21 | 107 |
| pf21v | 54 |
| pf21w | 83 |
| pf23w | 31 |
| pf25 | 68 |
| pf3 | 75 |
| pf5 | 53 |
| pf6b | 24 |
| fo13 | 76 |
| fo1a | 124 |
| fo1b | 80 |
| fo2 | 113 |
| fo3 | 133 |
| fo3sa | 39 |
| fo3sr | 29 |
| fo5 | 243 |
| fo5f2 | 72 |
| prisma_schema | 8 |
| case_feed | 39 |
| csc1_close | 55 |
| Isolated :4641/:4642: pf4 / pf4b | 119 / 55 |
| d1 reset (:4644) | 25 |
| C10.1 load (:4645) | 48 |
| pf1 (:4646) | 28 |
| pf23 (:4647) | 100 |
| pf24 (:4648) | 84 |

Every suite passed with no failures; every copy and scratch database was stopped or dropped.

**Not checked:** a real `migrate diff` and `migrate reset` on main + branch after the merge (M2); the fo4 browser suite; CS-W1's function EXECUTE grant to `xr_app` when CS-W1 lands first (CS-W1's side).

## Journey score (reviewer, journey-test adapted to an API-only row): 7.5 / 10, below the pass mark

The journeys were HTTP calls by persona: staff of firm A and of firm B, a visitor on a firm's address, a booker, a web-form visitor, and our staff (bypass).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | Staff, booking and sign-in journeys work; the firm site visitor gets 404 (B1) |
| Next step obvious | ½ | "This page is not available" on a live firm's own address |
| Plain words | 1 | Answers unchanged |
| Feedback and state | ½ | Trailing slash or HEAD → 500 (m1) |
| Correct data | 1 | No cross-firm row in 60 interleaved calls or by id |
| Error recovery | ½ | 500 instead of the door's own answer |
| Accessibility and screen sizes | 1 | Not applicable: no screen |
| Speed | 1 | One extra round trip only when the checkout's firm changes |
| Visual quality | 1 | Not applicable: no screen |
| Trust and sources | ½ | Bypass lines audited, but the `direct-process` start-up use is unnamed (m2) |

To raise it, fix B1 then m1.

**Verdict: Block.** Fix B1, M1, M2, M3 and M4 (the Minors are recommended). Then ask for a diff-only re-review at the new head, with main merged and CI green.
