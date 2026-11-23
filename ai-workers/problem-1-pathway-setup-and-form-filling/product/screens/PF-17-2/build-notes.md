# PF-17 part 2: build notes (runtime lane, 23 Nov)

Row PF-17, item R1.93. Stacked on PF-17 part 1 (#3155, branch `claude/runtime-pf17-firms`, head cd306cb67). API only: no screen (part 4 is the screens, concept first).

**Ruling (Lead 1 on #3155, 23 Nov, comment after 7093007003):** use the requirement's key names, `system/support:list` (Platform Owner, Admin, Support, Auditor) and `system/support:manage` (Platform Owner, Support), seeded as Sample and marked "Unconfirmed: SA10-X3 pending". Scope: list, one ticket and reply. Failed jobs per firm (j_93 W2) is a separate small part in this row. Breaker and the Lead's migration read apply.

**Sources:** SA-10 v2.8 §3.2 (one queue, oldest-unanswered first; "Waiting on firm" drops below unanswered tickets), §10 and SA10-D8 (the two keys), SA10-X3 (role mapping pending in SA-07 Appendix A); AG-16-63 (tickets, Waiting on firm). PF-18b's `SupportService.replyAsSupport` (`api/src/platform/support/support.ts`) says PF-17 calls it.

## What gets built
1. Migration `prisma/migrations/20261123060000_pf17_support_keys`: six rows in `plat_system_role_permission` (list: Owner, Admin, Support, Auditor; manage: Owner, Support), in PF-8b F7's DO-block shape. Data only.
2. `GET /api/system/support/tickets` (`system/support:list`): every firm's tickets, each with `firm {id, key, name}`, `subject` (PF-18b's `subjectOf`), `status`, `page`, `raisedByName`, `messages` (count), `createdAt`, `updatedAt`. Order: OPEN and WAITING_ON_SUPPORT first, then WAITING_ON_FIRM, then CLOSED; inside each, `updated_at` ascending (longest waiting first). Filters `?status=`, `?firm=` (uuid), `?page=` (50 a page, Sample); anything else 422 `SUPPORT_QUERY`.
3. `GET /api/system/support/tickets/:id` (`system/support:list`): the ticket with its messages in order; firm authors named from the ticket's firm's staff, ours as "ExpatReady support". An unknown or malformed id → 404.
4. `POST /api/system/support/tickets/:id/replies` (`system/support:manage`), body `{ body }` only: PF-18b's `replyAsSupport` in the bypass transaction. One SUPPORT message, the ticket → WAITING_ON_FIRM, one `support.ticket.replied` line on the firm's trail. A closed ticket → 409; a blank body, a non-text body or an extra field → 422; an unknown ticket → 404. Answers 201 with the ticket.
5. Two bypass uses in `api/src/platform/system-console/support.bypass.ts`: `platform.console.support-queue` (the list route only, audit `platform`: one firm-less line per call) and `platform.console.support-ticket` (the one-ticket read and the reply routes, audit `per-firm`: that firm's own line).
6. The service checks the key again itself (403), as part 1 does.
7. `tests/check_pf4s_system_signin.ts`: its exact seeded-key list gains the two keys (as PF-21b part 2 did for its key).

## Not built
Internal notes, assignment, priority, force-close, reopen window, linked tickets, the three SA-10 emails (no email on our reply), attachment download for our staff, a support session from a ticket (AUD-3b), naming the replying staff member on the firm's trail (the line's actor is `system:support`, PF-18b's; PF-4s's guard line names the person; AUD-3a, open as #3178, brings an actor word for our staff), failed jobs per firm (its own part), and every screen (part 4).

## Checks (builder)
* `tests/check_pf17_support.ts`: DW1-DW8, 26 passed, 0 failed, run twice.
* Existing suites: listed in the PR body with exit codes.
