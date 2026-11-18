# Brief: PF-18bk, the real foreign keys for support tickets (the PF-18b follow-up) (cloud builder lane; row owner Lead B / Build Lead A)

Written 18 Nov 23:38 IST by Lead B (6), after #2064 (PF-18b) merged at 23:37 IST (2c9231ab4).

**Source:**
* Lead 74's P-423 read of #2064 (comment 6937825642), note 1: while `platform.prisma` was held for #2009, the write trigger proved the firm and the person instead of a foreign key. Once #2009 merged, a small follow-up adds those keys.
* My ruling on #2064 (comment 6981263837, item 3): the keys are a follow-up part that I shape after the PR merges.
* #2009 (PF-18a) has been on `main` since 19:49 IST 18 Nov.

**Model:** Opus 5.5 high (a migration; the Lead's P-423 read). **PR title:** `migration — platform: PF-18bk — support tickets' firm and staff foreign keys`.
**Starts when:** now, from `origin/main` (P-663 permitting). It edits `platform.prisma` (two back-relation lines), as #2130 (PF-15 part 1a, queued) and the PF-15 part 2 overlap lane do. Whichever merges second merges `main` in and keeps both sides (P-270).

## What `main` has (2c9231ab4)
* `platform_support_ticket` has `firm_id` UUID and `raised_by` UUID, with no foreign key. The trigger `platform_support_ticket_write` refuses a raiser who is not staff of the firm (line 91, `foreign_key_violation`).
* `platform_support_message` has `firm_id` plus `(firm_id, ticket_id)` → ticket, which is already a real key. `author_id` is **text** (`'support'` or a staff uuid, by a CHECK). The trigger proves a FIRM_STAFF author.
* `platform_staff` has the unique `(firm_id, id)` (`platform_staff_firm_id_id_key`, PF-3).

## What to build (one migration, a later stamp, P-600)
1. `platform_support_ticket.firm_id` → `platform_firm(id)`, ON DELETE RESTRICT, ON UPDATE RESTRICT.
2. `platform_support_ticket(firm_id, raised_by)` → `platform_staff(firm_id, id)`, RESTRICT. The composite key keeps the raiser inside the ticket's own firm.
3. `platform_support_message.firm_id` → `platform_firm(id)`, RESTRICT.
4. **The message author stays as it is.** `author_id` is text and can be `'support'`, so it takes no key. The trigger keeps proving a FIRM_STAFF author. Do not add a nullable uuid column for it in this part.
5. **The triggers stay.** Remove only the raiser's EXISTS check (line 91), and only if test DW2 shows the composite key refuses the same row with the same `foreign_key_violation` code. The no-delete, insert-only, closed-final and truncate rules are untouched.
6. **Prisma:** add the relations in `platform-support.prisma` and the two back-relation lines in `platform.prisma` (`PlatformFirm`, `PlatformStaff`). `check_cssd1_no_drift` must show no drift between the schema and the migrations.
7. **Before adding the keys,** the migration checks that every existing row already has its firm and raiser. If one does not, it stops with a clear message; it never deletes rows.

## Done when (P-606; `tests/check_pf18bk_keys.ts`, a pass and a fail each)
* **DW1:** a ticket for a firm id that doesn't exist → refused by the key. With the trigger off in a test transaction, the key alone still refuses it.
* **DW2:** a ticket whose `raised_by` is staff of **another** firm → refused (`foreign_key_violation`). Staff of the same firm → accepted.
* **DW3:** deleting a firm or a staff row that a ticket points to → refused (RESTRICT). Nothing is cascaded.
* **DW4:** the migration on a copy with seeded tickets applies cleanly. On a copy with a planted orphan ticket it stops with the message and changes nothing.
* **DW5:** PF-18b's suites, `check_pf12_walls`, `check_pf3_platform_schema` and `check_cssd1_no_drift` pass unchanged. Test actors are typed (#2003).

## Touch list (nothing else)
* one new migration folder;
* `prisma/schema/platform-support.prisma`;
* `prisma/schema/platform.prisma` (two back-relation lines only, flagged in the PR as a shared-file edit);
* `tests/check_pf18bk_keys.ts`.

**Size (P-610):** about 150 lines. No API or screen change.

## Duplicate check (P-526; 18 Nov 23:38 IST)
* **`main`:** no foreign key from either support table to `platform_firm` or `platform_staff`.
* **Open PRs:** none names PF-18bk or the support keys.
* **BACKLOG:** no row; the Lead adds the line. Lead 74 once routed these keys to PF-17 with m1. This row takes them **out of PF-17**, which keeps only m1's other database rule.
* The PR writes its own `Duplicate check:` line.

## Rules
The standard PF/FO rules at the end of `wave1-sales.md` apply.
