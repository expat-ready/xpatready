# R1.60 part a1: re-review of the main merge (PR #3681, diff only, P-303)

Head reviewed: `4321ee7db7373a7faa819e1f8bed32cc7f61b664` (`claude/runtime-r160-a1`), a merge of origin/main `791c6f82f` into the approved head `874ce4ce1` (Reviewer Approve, Lead read), with this PR's migration re-stamped. Reviewed only what the merge changes beyond a clean merge: `git show --remerge-diff 4321ee7db` (6 files). API only: screens, 1024 px, zoom and keyboard are N/A.

**Verdict: Approve.** No Blocker, no Major, no new Minor.

## 1. `ports/notifications.ts` (conflict with #3670 FO-5d)
- `NOTIFICATION_KIND` keeps both `RETAINER_DECLINED` and `DEPOSIT_REQUEST_PREPARED`. `NOTIFICATION_GROUP` gives both `NEEDS_YOU`, which matches each side before the merge. `NOTIFICATION_ITEM_KIND` is `[…, "lead", "retainer", "trust-request"]`. Nothing from either side is lost.
- Order: the only tests that use position read `NOTIFICATION_ITEM_KIND[0]` (`check_pf18n2_lead_notices.ts:95`) and `.slice(0, 6)` (`check_csdl3_milestones.ts:87`). Both read only the first six entries, which did not move. `labels.ts:26` uses `includes`, and `z.enum(NOTIFICATION_KIND)` does not depend on order. Main's `retainers/notification-labels.ts` registers `"retainer"`. No labeller is registered for `"trust-request"`: that is unchanged and was accepted in round 1 (`review-a1.md` m4, `break-report-a1.md` N1).

## 2. `front-office/signing/service.ts` imports (conflict with #3670)
- `applyDecline`, `signingNotifications` (main) and `retainerSigned` (PR) are all imported, and each is used: `:286-287` and `:359`.
- The completion path is unchanged from `874ce4ce1`: `line("signing.completed")` at `:343`, then the win in its savepoint (`:348-357`), then `retainerSigned(…)` at `:359`, then `tx.moduleEvent.create(SIGNING_COMPLETED)` at `:362`. The event row is still the last write.
- A decline cannot reach `retainerSigned`. The `declined` branch (`:282-289`) returns before the completion code. `applyDecline` sets the request to `DECLINED` with `endedAt` (`decline.ts:59`). After that, `live` is false (`:273`, `:279`), so a later `completed` is refused. Completion also needs `q.status === "CLIENT_SIGNED"` and every signer signed (`:321`), and `moveRetainer(["CLIENT_SIGNED"], "SIGNED")` must move exactly one row (`:325-326`). A retainer that is DECLINED, or WITHDRAWN after the client signed, fails that guard before line `:359`. The paper-signing path (`retainers/service.ts:786`, `via: "SIGNED_OFFLINE"`) gains 5 lines from main. Those lines do not touch the `retainerSigned` call.

## 3. Migration re-stamp `20261125150000_…` → `20261126064000_client-money__r160_trust_request_prepared`
- Why it moved: main's `20261125150000_front-office-signing__fo5d_decline_reason` now uses the old stamp. The new stamp is after main's newest migration.
- `migration.sql` is byte-identical: `git diff 874ce4ce1:<old> 4321ee7db:<new>` is empty, with similarity 100%. `rollback.sql`, `MODULE.rows/R1-60-a1.md` and `check_r160_deposit_prepare.ts:279` change only the name. `git grep 20261125150000` finds the old stamp only in FO-5d's own files.
- **The newest definition of `money_trust_request_write()` on main is still `20261118200000_fo7ts_money_settings`.** It is the only migration since FO-7a that redefines this function. Main's three new migrations do not mention `money_trust_request` or this function: `20261125140000` (FO-7w1, `money_invoice_source_fixed()`), `20261125140100` (R1.96, the payment-plan functions) and `20261125150000` (FO-5d, `fo_signer.decline_reason`). So this migration's `CREATE OR REPLACE` drops nothing main added.
- The function bodies differ only by what this PR adds (diffed `20261118200000` against `20261126064000`): the delete guard for a prepared request; `prepared_at := now()` on insert; `prepared_at` and `estimated_tax_minor` in the frozen tuple of a cancelled request; `prepared_at` beside `number` and `created_at` in the "the database's" check; `estimated_tax_minor` beside `amount_minor` and `purpose`. No line is removed. The PF-12 owner and definer settings are set again inside PF-8b F4's GRANT/REVOKE pair, as main's own new migrations do.
- `rollback.sql`'s function body is identical to `20261118200000`'s, so the rollback still restores what main has.
- Schema: `client-money.prisma:501-503` keeps `preparedAt` and `estimatedTaxMinor` next to main's new payment-plan models.

## What I ran on 4321ee7db
Worktree `.tools/wt3681`, `COPY_PREFIX=rv3681` (isolated copies, ports +27000, never :4400). Every suite below passed with 0 failed:
- **R1.60, notifications and drift:** `check_r160_deposit_prepare` 47, `check_pf18np_port` 11, `check_cssd1_no_drift` 17, `check_pf8b_f4_migrations` 9/9.
- **Signing and retainers:** `check_fo6_signing_api` 71, `check_fo5d_decline_withdraw` 41, `check_fo5_retainers` 248.
- **Client money:** `check_fo7ts_money_settings` 157 (DW9 included), `check_fo7t_trust` 62, `check_fo7a_money_schema` 122, `check_fo7a2_ledger_rules` 35, `check_fo7lk_lock_order` 16, `check_fo7w1_retainer_invoice` 43, `check_r196_plans` 40.
- **Data walls (they read migration text and function owners):** `check_pf12_walls` 110, `check_pf8b_f5_pg18_grants` 14/14, `check_pf8b_f6_pg18_nobypass` 26/26, `check_pf8b_f7_data_walls` 17/17, `check_pff1c_catchup_walls` 14.
- **Schema, notifications and ports:** `check_prisma_schema` 8, `check_pf18n_notifications` 34, `check_pf18n2_lead_notices` 32, `check_csdl3_milestones` 43/43, `check_ports_events` 31.
- **Tools:**
  - `migration-slots.py check 791c6f82f..HEAD`: PASS (1 new migration after main's newest, 20261125150000).
  - `migration-slots.py mergify --check`: exit 0.
  - `check-own-migration-guard.sh`: 47 passed.
  - `typecheck.mjs`: PASS, no new type errors (api has 15 known errors, web has 0).

## Journey score
8.75/10, carried from `journey-test-reviewer-a1-r2-2026-11-25.md`. I did not run the journey again. This merge changes nothing a person sees: it re-orders imports, joins two lists and renames a migration folder.

## Not checked
- Suites outside signing, retainers, client money, notifications, data walls and schema. CI's merge queue runs the full set.
- `select-suites --changed` across the whole merge: main's own changes are already green on main.

Reviewer: Approve 4321ee7db7373a7faa819e1f8bed32cc7f61b664
