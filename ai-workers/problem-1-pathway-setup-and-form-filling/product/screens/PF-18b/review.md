# PF-18b review: support tickets (API and schema, no screen)

PR #2064, branch `claude/runtime-pf18b-support`, head **e2e8b06ee7ff3f24defb0be4620c14d5a77afb39** (diff `origin/main...e2e8b06e`, 8 files, +762/-4). Reviewer: Opus 5.5, fresh context, own worktree. Brief: `design/lead-b-briefs/PF-18b.md` (main). Rules: AG-16-63, plus SA-06 v3.15 row AG16-16 ("own tickets for all; all firm tickets for Owner and Admin", checked in `domain/requirements-2026-11-02/.../SA-06-rbac_v3.15_2026-10-25.md:45`).

**Verdict: Block.** One Major (the CI type check fails on the new test). Nothing else blocks. The code, schema and walls are sound. Re-review covers the fix diff only (P-277).

## What I ran (worktree, PostgreSQL 127.0.0.1:54329)
* `tests/check_pf18b_support.ts`: **32 passed, 0 failed** (7 s).
* `tests/check_pf12_walls.ts`: **100 passed, 0 failed**. Its sweep "every firm table walled, every trigger function as xr_wall_reader" holds with the two new tables.
* `tests/check_pf6b_permission_rules.ts`: 29 passed, 0 failed. `tests/check_prisma_schema.ts`: 8 passed, 0 failed. `route-has-screen.mjs`: 0 routes without a screen or reason.
* `product/tools/typecheck.mjs`: **FAIL, 1 new type error**: `tests/check_pf18b_support.ts(78): TS2322: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'BlobPart'`. Job `types` gates `ci` (`ci.yml:499,541`).
* Break pass: a scratch script built on the suite's own harness, deleted afterwards (results below and in the journey report).

## Tech lead's conditions
1. No edit to `platform.prisma`: **met** (the diff does not touch it). There are no Prisma relations to Firm or Staff yet. The slot text is in `platform-support.prisma:10-12`.
2. Stamp `20261117030000` is later than `20261116190000_pf18a_offices` and main's newest (`20261116030000_fo7mv_move_list`): **met**. The suite asserts it.
3. Draft until the head is approved: **met** (`draft=true`, no label).
4. MODULE.md is the only shared file: **partly**. `ports/events.ts` is also touched (added lines only, and it is on the brief's touch list). The PR should say so (m7).

## Stated deviations
* No key rows: **accepted**. Both keys are on main for all six roles (`20261114015002_pf3_platform_tables/migration.sql:1137-1148`). The suite proves the 12 grants.
* "All firm" is decided by the OWNER or ADMIN role, not by holding `:list`: **accepted**. With main's seed (every role holds `:list`), a key-only rule would show every ticket to every role and break AG-16-63. This matches AG16-16 and SA-10 v2.8. The PR carries it as Question 1 for the tech lead, and it needs that answer before the label.

## Checks the brief and the lead asked for
| Check | Result | Evidence |
|---|---|---|
| DW1 404 on a guessed id | Met | `support.ts:211-215`: one `notFound()` for bad shape, missing, another person's and another firm's. The suite compares a random uuid with `not-an-id` (same detail). A colleague's ticket gives 404 by id, for a message and for a file link. |
| No file key names another ticket's folder | Met | The service builds keys only from its own random id (`fileKeyOf`, `support.ts:109,133`). Trigger `platform_support_message_write` refuses any key outside `^support/<ticket_id>/[1-9][0-9]*$`, and the suite proves it (DW3 database case). Download: the HMAC covers the key, `assertKeyVisible` re-checks the ticket, and `LocalFiles` stays in the firm's folder. A support link is 404 on the retainer route (`retainers/service.ts:629`) and the reverse too. |
| PF-12 walls, both tables | Met | ENABLE+FORCE, one `pf12_firm` policy each, `0_pf12_firm_first` (fires before the area triggers by name order). The three trigger functions are SECURITY DEFINER, owned by xr_wall_reader, search_path pinned. The routes run as xr_app in the suite. |
| Trigger in place of FKs to firm and staff | Sound for writes | On INSERT: the raiser and a FIRM_STAFF author must be staff of the row's own firm (staff exists, so the firm exists). On UPDATE: `firm_id`/`raised_by`/`page` are immutable. The message FK is composite `(firm_id, ticket_id)`. Gap: nothing stops a staff or firm row being deleted (no code does today; see m5). |
| No body or personal value in audit, event, email, logs | Met | Audit: field names, ids and a count (`support.ts:140,178,192`). Event: `SupportTicketRaised` strictObject, ids plus file count. Email: firm key, ticket id, page (`:147-151`). No logger calls. The break pass found no body in any sent mail. |
| Multipart limits | Met, with m1 | `FilesInterceptor("files", 4, fileSize 20 MB)`, then the service checks count ≤ 3 and size ≤ 10 MB (Sample) on both `size` and `byteLength`, type from a list, and first bytes. Nothing is stored before every file passes (DW3 fail: no file, no ticket). |
| Signed-link download | Met, with m3 | `FileLinks.sign` (5 min, firm and person bound). 404 for a colleague's or another firm's use, an altered token, a missing file number or an unseen ticket. 410 when expired. Served with `attachment`, `no-store`, `nosniff`. |
| Each DW with a pass and a fail | Met | DW1-DW5 and DW7 have both. DW6 has pass, a negative and failed send → saved. Mutations reasoned: dropping the role rule, the raiser rule, the key trigger, the size check, the CLOSED check or the mail catch each turns a case red. Exception: m3. |
| `replyAsSupport` has no route | Met | It is only in `support.ts:186` and the suite. The suite asserts exactly 6 routes, all under `/api/platform/support`, each declaring `:create` or `:list`. Nothing is under `/api/system`. |
| DW7 file left in place, reported | Met | The suite and the PR's DW7 line both cover it (cleanup PF-F2). |
| Migration keeps data, rollback written, `migrate diff` | Met | New tables only. Rollback is in the header. The suite shows no support line in the diff. |

## Issues
**Major**
* **M1. CI type check red.** `tests/check_pf18b_support.ts:78`: `new Blob([p.bytes], …)` gives TS2322 under the repo's TS lib. Fix: `new Blob([new Uint8Array(p.bytes)], …)` (as `check_c102_paper_readback.ts:56` does), or type `Part.bytes` as `Uint8Array<ArrayBuffer>`. Do not add it to `typecheck-known.txt`.

**Minor** (fix in this PR, or record the reason in it)
* m1. Over the upload layer's limits, the answers are the framework's, not the product's problem shape with the reason. 5 files gives 400 "Too many files". Over 20 MB gives 413 "File too large". A wrong field gives 400 "Unexpected field - file". The comment at `routes.ts:19` says the service names the limit. That holds only for exactly 4 files and 10-20 MB. This is the same as FO-5's pattern. Map MulterError to the 422 `support-fields` shape, or note it as FO-5 precedent.
* m2. The body length counts UTF-16 units (`support.ts:63`, `z.string().max`) while the database counts characters. 3,000 emoji are refused as "at most 5000 characters". Count code points (`[...s].length`).
* m3. No test turns red if `assertKeyVisible` (`routes.ts:52`) is removed: every DW3 404 is refused earlier by `FileLinks.check`. Add one case, e.g. a link the same person holds to a ticket they no longer see (Admin role removed), or a non-support key signed for them.
* m4. A double-submitted raise makes two tickets and two emails (break pass: 201, 201, distinct ids). Record this for PF-18s (disable on submit) or add an idempotency key.
* m5. The FK stand-in checks only at insert: deleting a `platform_staff` or `platform_firm` row is not refused by its tickets. No code deletes either today. Name the follow-up (real FKs and the back-relation slot after #2009) in the PR or BACKLOG. If #2009 merges first, condition 1 puts them in this PR.
* m6. `replyAsSupport` reads the ticket by id without `firmScope` (`support.ts:188,221`). This is a deliberate system-plane exception, but the card's invariant and "Do not" lines do not name it. Under the walls it answers 404 unless PF-17 runs it on a named bypass use. Add that line to `MODULE.md`.
* m7. PR body: "Checks and results" still says "More as the row goes". Paste the suite line and the shard's suites before the label (brief's standing rule), and name `ports/events.ts` as a second shared file (condition 4).

## Not checkable here
No screen in this row: concept fit, keyboard, 1024 px and 200 % zoom, BIC-01-20 and D17/D20 are N/A (PF-18s). I did not run CI's full shard or a real mail adapter, and did not test the 410 expiry path (no clock control in the HTTP harness). FileLinks' own suite covers it.

## D1-D20 (1-5; N/A where no screen)
D1 5 (AG-16-63 and AG16-16 met as written) · D2 4 (walls, triggers and checks; double-submit m4) · D3 5 (reuses FilesPort, FileLinks, MailPort, AuditPort, EVENT) · D4 N/A · D5 4 (atomic raise, failed mail keeps the ticket; m4) · D6 4 (insert-only messages, audit per write) · D7 N/A (no AI) · D8-D9 N/A · D10 4 (plain field errors; m1) · D11 4 (status and `emailed` in answers) · D12-D14 N/A · D15 5 (one query per list, no per-row requests) · D16 4 (each DW pass and fail; m3) · D17 simulated only · D18 4 (Sample labels on the limit and the inbox) · D19 N/A until PF-18s and PF-17 · D20 simulated only.

## Journey score
**9/10** (7.5 of the 8 criteria that apply, scaled; visual quality and accessibility are N/A, with no screen). Report: `screens/PF-18b/journey-test-reviewer-2026-11-17.md`.

**Verdict: Block.** Fix M1. Minors m1-m7 are fixed or answered in the PR.
