# FO-7q follow-up review: the money reads bound to CS-MV1's PgMoneyVisibility (head 4dcaea959)

This is a diff-only review of `git diff origin/main...4dcaea959` (main is bb12f5203, with #3001 and #3073 merged). The diff has 2 files:
- `api/src/features/client-money-reads.ts`
- `tests/check_fo7q_reads.ts` (DW9)

I read `client-money/visibility-adapter.ts`, `ports/money-visibility.ts` and the PF-12 pool on main for context only. The reviewer is a fresh context.

**Verdict:** Ship. There is no Blocker or Major, and 3 Minor findings.

## What I ran
- `check_fo7q_reads`: **40 passed, 0 failed**.
- `check_csmv1_money_visibility`: **33 passed, 0 failed**.
- I did not re-run `check_csw3_firm_scope`; its 48/48 is the builder's figure, on an isolated copy.
- **Mutation probe:** a scratchpad copy of the suite, with nothing changed in the repo. It swapped the app's binding and the test's adapter for (a) fail closed and (b) a widened scope. For (b), the app gets `"ALL"` and the adapter returns every case and every person of the firm. Results are in the table below.
- **Scale probe:** the suite's 10,000 bulk invoices put on 10,000 real cases. I then timed user-R (`agent/case:view.all`) over HTTP through the bound adapter, twice each.

## Questions asked
- **Can the binding widen anything? No.**
  - The port's type (`MoneyVisibility`, a strict schema with `cases` and `parties` uuid arrays) has no `"ALL"`. So the reads' `scopeSql` always takes the list branch, and the "no invoice and scope ALL" branch in `payments.ts` can never open.
  - `PgMoneyVisibility` reads `ctx.firmId` and `ctx.staffId` from the session only.
  - It runs `caseScope`'s membership check first, so a non-member gets `{cases: [], parties: []}`.
  - Cases come from `caseScopeWhere`, which uses runtime_case's firm. Parties come from `firmScope(ctx.firmId)`, either all prospects or only the caller's own.
  - The reads still put `i.firm_id = <session firm>` on every query. So even a scope holding another firm's ids could not reach that firm's rows.
  - `failClosed` stays the constructors' default (`visibility.ts` unchanged), so any other caller that builds the reads gets nothing by default.
- **The adapter on the root `Db`, not the request transaction: no effect on the walls.**
  - `Db` is PF-12's `WalledPool` (as xr_app: each query runs in its caller's firm, with row rules), plus `oneQueryPerCaller`, which never batches across callers outside a transaction. So the adapter's queries are walled to the request's firm whether or not they are in a transaction, and they also carry their explicit firm filters.
- **Snapshot consistency with the RepeatableRead transaction: a separate snapshot, but it cannot widen.**
  - `plan()` and `detail()` call `scopeOf` before the read transaction opens, so the scope and the read use two snapshots a few milliseconds apart.
  - An invoice is filtered by its `case_id` *in the read's snapshot* against the scope's ids. If an invoice moves from a visible case to a hidden one in between, it is hidden. If it moves the other way, it is shown, which is correct at read time.
  - A team change in between takes effect on the next request. That is the same as any live permission check.
  - Passing the transaction into the adapter is possible (it takes a `Reader`) but not needed.
- **Would each DW9 fail case really fail?** Mostly yes; the probe results:

| DW9 case | Fail closed (a) | Widened (b) |
|---|---|---|
| pass: user-R lists X and Y, opens Y | **FAIL** | pass |
| fail: a case-less invoice of a person with no prospect is absent and 404 | pass | **FAIL** (200) |
| pass: an own-cases officer gets X's and PA2's invoices, opens X | **FAIL** | pass |
| fail: never Y's invoice (404) nor PA's case-less one | pass | **FAIL** (Y 200) |
| fail: payments follow the invoice's scope | pass | **FAIL** (4 payments) |
| fail: firm B's widest scope holds none of A's | pass | pass |

Each mutation is caught by at least two cases: (a) by the two pass cases, (b) by three fail cases. The firm-B case can never fail; see n1.

- **Scale:** user-R's scope holds 10,002 cases and 1 party, and `scopeOf` alone takes 8 ms. Through the bound adapter over HTTP, two runs each:

| Read | Time |
|---|---|
| page 1 | 40-62 ms |
| `status=OPEN` | 47 ms |
| `status=OPEN&pageSize=200` | 92-106 ms |
| `status=REFUNDED` (rare word) | 833-872 ms |

  The one big array parameter costs little. The rare-word time is #3001's open R2-m1 question, unchanged by this diff.

## Findings (Minor, none blocks)
- **n1: the DW9 firm-B case cannot catch a widened adapter** (`tests/check_fo7q_reads.ts`, the last DW9 case). The list's own `firm_id` filter hides any cross-firm id, so this case tests the list's wall, not the adapter.
  - CS-MV1's contract rule 1 (`check_csmv1`, 33/0) does prove the adapter's firm rule.
  - Fix: either assert that `vis.scopeOf(ctxB)` holds neither X nor Y, or reword the case as the list's wall.
- **n2: the payments DW9 case has no positive side.** Under fail closed it passes with 0 payments.
  - Fix: record a payment on X's invoice, and assert that the officer's list includes it and excludes PA's.
- **n3: payments with no invoice (trust deposits) are now unreachable for everyone in the app.** `payments.ts` opens them only for scope `"ALL"`, which the port never returns, and `money_payment` has no party column to scope them by.
  - This is not a widening, and nothing changes from before: it stays fail closed.
  - Name it for the row that reads trust deposits (scope them through their trust entry's party or case). It is not this PR's job.

## Not checked
- `check_csw3_firm_scope` (the builder's 48/48).
- RLS enforcement as xr_app inside the test: the scratch database connects as the owner. I relied on PF-12's own suite for that.

Verdict: Approve on 4dcaea959
