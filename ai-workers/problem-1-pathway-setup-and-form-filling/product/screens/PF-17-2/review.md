# PF-17 part 2 review: our support queue API, one ticket, our reply (R1.93)

Reviewer: Opus, fresh context; I did not build this. Commit reviewed: **d1cf4ba67d872b2fbd3ecb1455d1d3d378e0176c**, branch `claude/runtime-pf17-support`, diff `cd306cb67..d1cf4ba67` (10 files, +502).
* Scope: `build-notes.md` "What gets built" 1-7, with its "Not built" excluded (P-26).
* Lead 1's ruling on #3155: I read it on the PR, and it matches the migration and the routes.
* SA-10 v2.8 §3.2, BR-15 and §10; STANDARDS; `api/src/platform/MODULE.md`.
* API only, so D1-D20 and the BIC-01..20 scorecard are N/A (the PF-15 and PF-17-1 precedent).
* Journey score: **8.75 / 10, pass** (`journey-test-reviewer-2026-11-23.md`).
* A breaker's records commit (c4eac3fd2, `break-report.md` only) landed on the branch while I worked. It changes no code, and I did not read it.

## Checks run (postgres 127.0.0.1:54329, scratch databases; isolated copy on :4437; port 4400 not used)
* `check_pf17_support.ts`: **26 passed, 0 failed**, two runs. The Prisma client had to be generated first; that changes node_modules only.
* Exit 0: `check_bypass_uses` 52/0, `check_pf12b_bypass_audit` 70/0, `check_pf4s_system_signin` 102/102, `check_features_registry` 27/0, `check_pf18b_support` 41/0, `check_pf17_console` 38/0, `check_pf1_module_routes` 28/28, `check_pf8b_f8_seeds_nobypass` 15/15, `check_pf8b_f4_migrations` 9/9.
* `check_pf8b_f6_pg18_nobypass` 26/26: every migration, this one included, deploys under a runner that is neither superuser nor BYPASSRLS.
* Mutations, on a scratch worktree, `support.ts` only:

  | Mutation | Result |
  |---|---|
  | Order by `created_at` | caught |
  | `WAITING_ON_SUPPORT` ranked with closed | caught |
  | `updated_at DESC` | caught |
  | `WAITING_ON_FIRM` after closed | caught |
  | No `touchPlatform` | caught |
  | No `touchFirm` in `one()` | caught |
  | The reply on the queue's use | caught |
  | Page offset ignored | caught |
  | **No `touchFirm` in `reply()`** | **not caught** (m1) |
  | **The service's own key check removed from `list()`** | **not caught** (m2) |
* An all-or-nothing probe on the suite's harness: PF-18b's audit port throws inside `replyAsSupport`. The message, the status change and the firm's bypass line all roll back.
* `graph.mjs` (in the worktree): G1 0, G2 0.
  * The two `:id` routes show `testedBy: []`, and the list route is missing.
  * The tool misses `@Get()` with no path and template-literal URLs, as noted in PF-17-1.
  * This is a tool limit, not a finding.

## What holds
* **Keys.** The migration (`20261123060000…/migration.sql:15-33`) seeds exactly 6 rows:
  * `system/support:list`: Platform Owner, Admin, Support, Auditor;
  * `system/support:manage`: Platform Owner, Support.

  It marks them Sample and "Unconfirmed: SA10-X3 pending", and leaves `system/support:reply` unseeded. The DO block is the same, line for line, as PF-21b's F7 seed; only the VALUES differ. It changes data only, with a rollback recorded.
* **Authorisation.** Each route declares `@SystemKeys` (`support-routes.ts:16-22`), and the service checks the key again (`support.ts:63-65`). The suite and my walk confirm:
  * Billing and Content publisher get 403 on the list;
  * Admin and Auditor get 403 on a reply;
  * a firm token gets 403, also on mixed-case paths;
  * no token gets 401.
* **Order (§3.2, BR-15).** Waiting on us comes first (OPEN and WAITING_ON_SUPPORT), then WAITING_ON_FIRM, then CLOSED. Inside each group the order is `updated_at` ascending, then id (`support.ts:124`).
  * PF-18b's `addMessage` and `replyAsSupport` move `updated_at` in the same transaction as the message. So for an unanswered ticket, `updated_at` is when the firm's latest message arrived, as BR-15 says.
  * J2: when the firm writes again, the ticket goes back among the unanswered ones at that time.
* **Filters.** `z.strictObject` takes `status`, `firm` (uuid, any case) and `page` (1-99999). Anything else is 422 SUPPORT_QUERY with the field named. Every value is a bound parameter in tagged `$queryRaw`.
* **Speed.** 5,006 tickets: 12-27 ms a page.
* **Bypass uses** (`support.bypass.ts`): both are declared beside the module, not on the frozen list.
  * The queue's use covers `GET` of the list only, with `platform` audit: `touchPlatform` writes one firm-less line per call.
  * The ticket's use covers `GET :id` and `POST :id/replies`, with `per-firm` audit: `touchFirm` writes that firm's line once the row is found. An unknown id writes nothing.
  * Any other route is refused (DW7).
* **Reply.** PF-18b's `replyAsSupport(tx, …)` runs inside the use's own transaction, after `touchFirm` (`support.ts:105-106`). It writes one SUPPORT message (`author_id 'support'`), sets WAITING_ON_FIRM, and writes one `support.ticket.replied` line on the firm's trail. The ticket row is locked `FOR UPDATE`. Refusals:
  * closed ticket: 409;
  * blank, missing or non-text body, an extra field, over 5,000 characters: 422;
  * unknown or malformed id: 404;
  * bad JSON: 400.

  None gives 500, and nothing is written on any refusal.
* **Words and names.** Firm authors are named only from the ticket's own firm's staff; our messages are "ExpatReady support". Neither the module card rows nor the PF-4s seed list goes beyond scope.

## Findings

**Blocker**: none. **Major**: none.

**Minor (Should)**
* **m1. The reply's own bypass line is never asserted.**
  * Where: `check_pf17_support.ts:175` checks the replied line and the PF-4s line only. If `support.ts:105` (`touchFirm` in `reply()`) is removed, all 26 checks still pass.
  * Fix: in DW5, assert `bypassOn(firmA) === before + 1` and firm B unchanged after the reply.
* **m2. The service's second key check is tested for the reply only.**
  * Where: removing `support.ts:69` (and, by the same pattern, `:85`) passes every check; DW7 (`:251-252`) covers `reply` only. Build-notes item 6 claims the check for all three routes.
  * Fix: add two `throwsLike(… e.status === 403)` lines, for `list` and for `one`, with `keys: []`.
* **m3. The order comment names a trigger that does not exist.**
  * Where: `support.ts:14` says `updated_at` changes "with each message, PF-18b's trigger". No trigger sets it. It is Prisma's `@updatedAt` (`platform-support.prisma:40`), applied by PF-18b's ticket update; the migration's trigger only refuses it going back.
  * The DW3 "fail" check moves t1 by raw SQL (`check_pf17_support.ts:199-200`), which leaves `updated_at` at the reply time. So the check never exercises "the firm's latest message".
  * Fix:
    * correct the comment (STANDARDS: comments say why, accurately);
    * in DW3, write the firm's message through PF-18b's `addMessage`, or set `updated_at` in that SQL.
* **m4. A double click posts the reply twice.**
  * Evidence: journey J6. Two identical replies at the same moment both answer 201 and store two SUPPORT messages. STANDARDS §4 [M] asks for "Idempotent creates". PF-18b's `addMessage` has the same gap.
  * Fix (no new scope): record it in the build notes and PR body as a known departure, for part 4's composer to prevent; or the Lead rules otherwise.
* **m5. The queue row gives the firm's name but not its plan.**
  * SA-10 §3.2 says each row shows "firm (name and plan)". The row carries `firm {id, key, name}`, and the plan is in neither "What gets built" nor "Not built".
  * Fix: add "the firm's plan on the queue row" to Not built (part 4 will need it), or the Lead rules.

Not a finding:
* Page numbers instead of the [M] cursor pagination, as in part 1, where it was accepted.
* Refusal words reused from PF-18b's firm-side refusals: the build notes say so on purpose. Part 4's concept should give support staff their own words (journey score, "next step obvious").

## Could not check
* CI on the PR.
* A real Cognito pool for our staff (local stand-in only).
* Part 4's screens: keyboard, 1024 px and 200 % walks are N/A.
* The break report (not read).

Verdict: Approve on d1cf4ba67
Reviewer: Approve d1cf4ba67d872b2fbd3ecb1455d1d3d378e0176c
