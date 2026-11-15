# CS-C1a break report (PR #1818): decision, withdrawal, close, reopen (API only)

Breaker, 15 Nov 2026. Commits tested: **27bc4a406** (the brief's) and **af33e80cb** (the hook narrowed to `/api/runtime/` in exact case; audit entity `case`). Everything below was run on both commits and gave the same answer on both, except where a line says otherwise.
How: (1) a scratch script (not in the repo) built from `tests/check_csc1_close.ts`'s approach: a scratch database with every migration, the PF-3 Sample seed, one firm-A staff member per starter role plus extra staff (an ended grant, a deactivated person, a revoked session), firm B's `user-S`, and fixture cases in SQL. A Nest app ran core.ts's `ConfigReadGuard`, PF-4's guard, the identity routes, this row's feature, and probe controllers: an undeclared `/api/runtime/probe`; `/api/runtime/latent/*` declaring `@StaffSignIn`, `@AnyStaff` and a `system/*` key; and a declared `/api/elsewhere/w`. It ran once against each commit's tree. (2) The real app at af33e80 on an isolated copy (`isolated.sh brk_csc1 4561`, `PLATFORM_IDENTITY=local`, `PLATFORM_SAMPLE_SEED=on`), with Sample load, fixture cases, the four routes and the demo reset. Copy stopped. Every scratch database was dropped (`xr_studio_brk_csc1_*`, `xr_studio_brk_csc1`). No model call; US$0.

## What broke

**M1 (Major, latent). PF-4's start-up rule does not cover declared routes outside `/api/platform` and `/api/front-office`. The hook relies on it.**
* `challenge.md` (option A) says "PF-4's start-up rule (`assertEveryRouteDeclared`) already covers declared routes on any path". The test's setup line says the same. That is not true. `platformRoutes()` keeps only paths matching `PLATFORM_PATH` (`api/src/platform/identity/guard.ts:31`). Called on the running app, it lists **no** `/api/runtime/*` route, not even the four routes this row adds (scratch output: `[]`).
* What follows with the hook in place, on both commits:
  * `POST /api/runtime/latent/signin` (declares `@StaffSignIn`), no token, no `x-actor` → **201** (open to anyone). Expected: the start-up stops, as it does on platform paths.
  * `POST /api/runtime/latent/anystaff` (declares `@AnyStaff`) with firm B's CASE_OFFICER token → **201**.
  * A `/api/runtime` route declaring `system/platform:anything` starts without complaint. The guard still refuses it (403 MISSING_PERMISSION), so it fails closed.
* Nothing like this ships today: only the four case-close routes declare access, and they name `agent/*` keys. But the next `/api/runtime` route that copies `@AnyStaff`/`@StaffSignIn` from `platform/identity/routes.ts` is opened silently. The safety argument for the hook (Lead 58's OK) assumed a start-up check that is not there.

**m1 (Minor). A NUL character in `reason` or `note` is not a 400 on its field.**
* `POST /api/runtime/cases/:id/close` with `{"reason":"Closed\u0000now"}`; the same on `/withdraw` (`reason`) and `/decisions` (`note`).
* Scratch app: **500**. Real app: **404 "Not found (it may have been removed by a reset)"**. `main.ts:213` maps PostgreSQL's `invalid byte sequence for encoding` to that 404.
* Expected: 400 INVALID with a field message (STANDARDS §6, RFC 9457). The case stays unchanged, so no data is harmed. `reasonOf` and the note check (`api/src/case-close.ts:28-33, 100`) accept any string.

**m2 (Minor). `decidedOn: "0000-01-01"` → 500, in the scratch app and the real app (`/decisions`, firm B's own case).** `dateOf` (`case-close.ts:34-39`) accepts year 0, which PostgreSQL's `date` cannot store. Expected: 400 on `decidedOn`. The same applies to `withdrawnOn`.

**m3 (Minor). Dates in the future are accepted.** `decidedOn: "2099-01-01"` and `"9999-12-31"` → 201 with a row. A withdrawal dated in the future is accepted the same way. AG-7-33 rule 3 asks for "the decision date" of the authority, and AG-7-50 rule 2 for "a date". Neither rule says "not in the future", so this is for the tech lead to decide, not a rule broken.

**m4 (Minor). A reason made only of invisible characters passes.**
* `POST …/reopen` with `{"reason":"​"}` (zero-width space) → **200**, and the case reopens. `close` and `withdraw` share `reasonOf`.
* `String.trim` does not remove U+200B. The database's `length(btrim(closed_reason)) > 0` passes too, and even accepts `E'\t'` as a closing reason when written directly (SQL `update runtime_case set status='CLOSED', closed_at=now(), close_outcome='CLOSED_BY_STAFF', closed_reason=E'\t' …` → OK).
* Expected: 400 REASON_REQUIRED (AG-7-13 rule 7, AG-7-34 rule 2: "a reason").

**m5 (Minor). The insert-only exemption `pg_trigger_depth() > 1` can be reached by any trigger, not only the case's cascade.**
* Run as one statement batch:
  `create temp table brk_t(x int); create function pg_temp.brk_trig() returns trigger language plpgsql as $$ begin delete from public.case_decision where case_id = '<id>'; return new; end $$; create trigger brk_tr after insert on brk_t for each row execute function pg_temp.brk_trig(); insert into brk_t values (1);`
* Result: the decision rows are **deleted** (count 0). Only the TEMP privilege and DELETE on the table are needed; the user needs no right to create objects in `public`. Expected: refused.
* A tighter exemption would be "the parent case row is already gone". This is a suggestion only; nothing was changed.
* Context: the app's role `xr_studio` is a superuser here, so `set session_replication_role = replica; delete from case_decision …` also succeeds (count 0). The trigger is a guard against mistakes, not against the app's own role.

**m6 (Minor). Links the database does not check twice (STANDARDS §3.4).** These are reachable only by SQL; no route does any of them.
* `closed_from_stage` may name **another case's** stage (SQL update → OK). A reopen would then put that stage id into `case.reopened`.
* Moving `runtime_case.firm_key` after a decision leaves `case_decision.firm_id` naming the old firm (1 mismatched row). The firm check runs on insert only.
* A DECISION row may be inserted for a filing with no `filing_record`. The "submitted" rule is checked only in the service.

**m7 (Minor, read from the code).** The staff member is checked once, in the guard, before the transaction. `case-close.ts` does not check again inside the transaction, unlike PF-4's staff changes (`platform/identity/service.ts:152-161`). So a deactivation or a role change that commits in between still lets one close or reopen through.

**Fixed by af33e80 (found on 27bc4a406):**
* The hook opened declared routes on **any** path: `POST /api/elsewhere/w` (declares `agent/case:edit`) with an Owner token → 201. At af33e80: 403 link-only.
* `GET /API/platform/me` with a staff token → 200 (PF-4 break M1 came back). At af33e80: 403 link-only.
* At af33e80, a mixed-case path to a declared case route is never answered: `/API/Runtime/Cases/:id/CLOSE` with a staff token → 403 link-only; with no token, with `x-actor: user-R`, or with an unknown actor → 401 NOT_SIGNED_IN. The case was unchanged.

## What held (both commits)
* **DW2 and DW5, full matrix.** Answers for decide / close / withdraw / reopen:
  * OWNER: 201 / 200 / 200 / 200.
  * ADMIN: 201 / 200 / 200 / **403** MISSING_PERMISSION.
  * CASE_MANAGER: 201 / 200 / 200 / 200.
  * CASE_OFFICER, BILLING_FINANCE, READ_ONLY: 403 on all four, nothing written.
  * The seeded keys match: record-decision for OWNER, ADMIN, CASE_MANAGER; reopen for OWNER, CASE_MANAGER.
  * The real app gave the same answers (user-O 403, user-R 201/200).
  * Reopen with no reason, `""`, whitespace, a number, an array, an object or `null` → 400 REASON_REQUIRED; the case stays CLOSED.
* **Identity:** ended grant → 403 MISSING_PERMISSION; deactivated → 401 STAFF_NOT_ACTIVE; session ended by a newer sign-in → 401 SIGNED_IN_ELSEWHERE; no second step → 401; forged `sub` → 401 TOKEN_REFUSED.
  * Authorization header `Bearer`, `Bearer ` (nothing after) or `Basic …`, or a token followed by an extra word → 401. Lower-case `bearer` and a double space are accepted as the same token.
* **DW8:**
  * Firm A's token on firm B's open case (decide, withdraw, close) and on B's **closed** case (reopen) → 404 NOT_FOUND. B's rows, decisions and events are unchanged.
  * No token on all four routes → 401 NOT_SIGNED_IN.
  * B's filing in the body of A's case, a `filingId` array, an upper-case filing id → 404.
  * A case whose `firm_key` names no platform firm → 404.
  * Odd ids (zero UUID, `../../platform/me`, `%00`, SQL text, 5000 characters) → 404.
  * An upper-case case UUID works (201).
* **The hook:**
  * Undeclared `/api/runtime/*` (GET and POST) with a staff or link Bearer token → 403 link-only; the same for `/API/RUNTIME/probe` and, in the real app, `GET /api/runtime/cases` and `/api/runtime/cases/:id`.
  * A link token on a declared route → 401 TOKEN_REFUSED, also with `x-actor`.
  * `x-actor` alone → 401.
  * Trailing slash → guarded (403 for READ_ONLY).
  * Double slash, percent-encoded segment, GET on `/close` → 404.
* **Bodies:**
  * Arrays, empty body, duplicate keys and `__proto__` → 400. Number, string, `null` and broken JSON → 400 from the body parser.
  * 2 MB body → 413.
  * Note of 2001 characters, a reason of 1001, `outcome:"approved"`, a numeric date → 400 on the field.
  * French, Japanese and Arabic text is stored intact. 1000 × "é" is accepted.
  * 1500 emoji (3000 UTF-16 units) is refused at 2000: the limit counts code units, not characters.
* **Races:**
  * 12 parallel closes → one 200, eleven 409, one event.
  * 8 parallel reopens → one 200.
  * Decision against withdrawal on the same case, 15 rounds → never both (14 × 201/409, 1 × 409/200).
  * Reopen, close and decide in parallel, 10 rounds → only orders that could happen one after another.
  * Two filings decided in parallel → the second answers `everyFilingDecided: true`.
* **Lifecycle:** withdraw → reopen → withdraw again → two WITHDRAWAL rows, case CLOSED WITHDRAWN. No filings: close → 409 NOT_DECIDED; withdraw → 200.
* **Database:** UPDATE, DELETE, DELETE in a CTE and DELETE in a SQL function are refused; an id change cascading from the case or filing is refused (filing_record's trigger fires first); DW7 held.
* **Demo reset (real app):** with a CLOSED case, a WITHDRAWN case and decisions present → 201, every case and every `case_decision` row removed.
* **Personal text:**
  * `case.closed` and `case.reopened` payloads carry ids and codes only, with no reason or note text.
  * Audit lines carry the reasons in `detail` (AG-7-13 rule 3 asks for the old values). The decision note is never in the audit line.
  * The summary is "C-2026-NNNNN: …" only.
  * At af33e80 the entity is `case`, so `case-feed.ts` shows it only to the case's firm.

## Not checked
Other (`x-actor`) case routes acting on a CLOSED case (AG-7-34 rule 4 beyond these four routes). Screens, keyboard, zoom and the 100-program budgets: not built.
