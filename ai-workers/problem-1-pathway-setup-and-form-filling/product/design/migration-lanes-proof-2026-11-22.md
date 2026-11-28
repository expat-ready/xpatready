# Migration lane per area: what is proven, and why step 3 stops (22 Nov 2026)

P-785 (2) step 3 asked for one migration lane per area (platform, front office, client money, case side) in place of one Mergify scope with capacity 1, and for the re-stamp rule (P-600 (d)) to apply only inside one area's schema files. The brief said: "prove with a fixture that two areas' migrations merge in either order and `prisma migrate deploy` is clean both ways. If it cannot be proven safe, say so and stop." Written by the runtime lane, 22 Nov ~13:3x IST, main `01841047d`. **Verdict: half proven. Step 3 stops here; no code was opened for it.**

## 1. Proven: the order of two areas' migrations does not matter to the database
**Method.** Scratch databases on the local PostgreSQL 18, with Prisma 7.8's own `migrate deploy`. Every migration before the window is applied first. The last 30 migrations (13 platform, 8 front office, 2 money, 6 case side, 1 other) are then applied one by one, one deploy per migration, in three orders:
- name order;
- every cross-area order reversed, keeping each area's own order;
- the opposite reversal.

The schema is read from the catalogue with `psql`: columns, constraints, indexes, function bodies (hashed), triggers, row-level-security policies and flags, views, enums, grants, sequences and extensions. That is 9,257 lines. (`pg_dump` on this machine is version 16 and refuses the version 18 server.)

| Run | Deploys | `migrate status` | Schema against name order |
|---|---|---|---|
| Cross-area order reversed | 30 of 30 exit 0 | up to date | identical (9,257 lines) |
| Opposite reversal | 30 of 30 exit 0 | up to date | identical |
| Negative control: one migration left out | 29 of 29 exit 0 | up to date | **different**: one RLS policy (`webhook_receipt pf12_firm`) missing, so the comparison bites |
| Pairs (pf12b5 / fo6, csw3 / pf5p3, pf15b / pf5p3): an older stamp deployed after a newer one | exit 0 each way | up to date | not compared (the dump tool refused); see the 30-migration runs |

So Prisma applies an older-stamped migration after a newer one without complaint, and the final schema is the same. The deploy side of "either order" holds for today's migrations.

## 2. Not proven: an area's tests meeting another area's migration
- **Why migrations have capacity 1.** Measured 16 Nov (`design/merge-queue-causes-2026-11-16.md`): 60% of PRs failed in the queue when a second migration merged after their `ci` started. The largest cause (25% of failed-batch minutes) was an area's schema check breaking on another area's new functions.
- **Still happening after the 16 Nov fixes.** `adcf9c105` ("FO-7a2 DW7 reads the functions right after its own migration, not after later ones (CS-S1's case_party_index_* on main failed the queue batch)") is a money test broken by a case-side migration.
- **Today that is caught in the queue.** The single migration lane tests the second migration on top of the first, so the break stops before merge.
- **With one lane per area, it is not.** The money batch and the case-side batch are each tested without the other, both merge, and the break shows first on `main`. That is exactly what P-785 forbids ("nobody can break my main").
- **The 30-migration runs do not cover this.** They prove the database; they do not run the 10 migration-reading suites (`check_*_schema.ts`, `check_*_migration.ts`, the DW checks) against each other's in-flight migrations.

## 3. What would make it safe (each a separate decision for the tech lead)
1. **Every migration-reading suite reads only its own migration's effect** ("right after its own migration", as `adcf9c105` fixed for one), checked by a guard that fails a suite asserting over the whole function or table catalogue. Then rerun this proof with the suites, both orders.
2. **Area names enforced on migration folders** (`<stamp>_pf…`, `fo…`, `fo7…`, `cs…`). Mergify scopes have no "everything else" list, so a migration matching no area pattern would batch freely; a check must refuse it. Mergify's own scope glob rules were not readable from here (its docs host is blocked in this session), so the patterns need its configuration check first.
3. Only then: a scope per area, each with capacity 1.

## 4. A smaller, safe step that needs no new lane
**The re-stamps are pure toil.** Since 16 Nov there have been 19 re-stamp commits on `main` (`git log --grep re-stamp`), every one a rename with the SQL unchanged. They exist only because P-600 (d) asks for "a stamp later than `main`'s newest". Section 1 shows order does not matter to `migrate deploy`.

**Proposal for the tech lead.** Change P-600 (d) to "a stamp unique and later than every migration of the same area's schema files on `main`". The single capacity-1 lane stays as it is, so every batch still tests one migration on top of the last. This removes the cross-area re-stamp (about 3 a day) without moving any failure onto `main`. It changes a rule (P-600, DEVELOPING.md "Migrations"), so it is the tech lead's ruling, then a one-line edit there plus a guard in its own PR.

## Reproduce
The scripts are in the session's scratch folder, not committed (no code for a stopped step): `order2.py <studio> 30` with `REVERSE=1` or `SKIP=1`, and `schema.sql`, the catalogue read. Ask, and they go in as `product/tools/migration-order-check.py` with a guard test.
