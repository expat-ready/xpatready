# Review: R1.96 part 3, journey j_96 and qa/built/R1.96.md (no product code)

PR #3792 · reviewed head `ee4579cee7cb7f927649bf81ce9675be93c46b30` · reviewer: fresh session, did not build it · 25 Nov 2026, 23:2x IST.
Read: the diff (`git diff origin/main...ee4579cee`: `tests/journeys/j_96.ts` +161, `qa/built/R1.96.md` +1), the PR body, CAPABILITIES
R1.96, parts 1-2 code (`write-offs/`, `plans/`, `ledger-check.ts`, `invoices/refunds.ts`, `invoices/money.ts` credit notes,
`reversals/`), the r1-96-p1/p2 reviews, `j_58.ts`/`j_59.ts` headers, `walks.yml`, `tools/walk-plan.mjs`, `tests/journeys/walk.mjs`,
`tools/item-proof.mjs` (`journeyOf`).

**Runs (never :4400, US$0, no Stripe, no model):**
* As the header says, from `prototype/`, port 4438, name j96r: `isolated.sh j96r 4438 start --ttl 30 PLATFORM_IDENTITY=local && tsx … j_96.ts j96r 4438`
  → **23/23, exit 0, 4 s**; a second run on the same copy → **23/23** (run tags keep it re-runnable). Copy stopped, database dropped.
* Packs at this head (worktree of the exact head, own scratch DBs on 54329): `check_r196_plans` **40/40**, `check_r196_write_offs` **40/40**.
* Rule removal: 12 mutations on a scratch worktree of the head (scratchpad only), each on a fresh database on :4438, j_96 run each
  time; the two rollback mutations also against their packs.
* Header: `walk.mjs`'s regex reads `j96 4496 --ttl 30 PLATFORM_IDENTITY=local`; `journeyOf("R1.96")` → `tests/journeys/j_96.ts`, so
  the PR's `Completes: R1.96` walks it at the merge. Style matches j_58/j_59 (map row, Done-when quoted, W-lines, Sample, US$0,
  Unconfirmed, the run line with `trap … stop`, refuses :4400).

No screen in this part (FO-7s4's dialogs come later), so the BIC table, browser, keyboard, widths and zoom are N/A.

**Verdict: Rework (3 Major, 0 Blocker).** Journey score (API journey): **9.0 / 10, pass** (`journey-test-reviewer-2026-11-25.md`).
The product holds every rule I tried. The Majors are in the proof: what the journey would miss, and what the qa line claims.

## Rule removal (would a step stay green?)
| Rule removed (API and/or database) | j_96 |
|---|---|
| refund cap, API and DB (`refunds.ts:54`, fo7a migration:1064) | red, 9 FAIL |
| refund cap, API only (DB still refuses) | green (rule still held; see issue 4) |
| credit cap at the total, API only (DB still refuses "more than is left") | green (rule still held) |
| write-off reason optional · write-off key → `agent/invoice:show` | red · red |
| plan sum, API · plan sum, DB commit trigger | red · red |
| "Already settled by write-off" on a later credit note | red |
| **credit note capped at the invoice total, not at what is left (API `money.ts:159-160` and the 4 DB triggers)** | **green 23/23** |
| **`ledgerCheck` always answers balanced** | **green 23/23** |
| **write-off's in-transaction UNBALANCED rollback (`write-off.ts:59`)** | **green** (pack WO10 red) |
| **plan's UNBALANCED rollback (`plan.ts:113`)** | **green; `check_r196_plans` also 40/40** |

## Done-when coverage
"Refund never exceeds what was paid": W2 pass + 2 fails, held. "Credit note never exceeds (what is left)": W3 pass + a fail that only
tests the total (M2). "Instalments sum exactly": W5 pass + API fail + DB-commit fail, held. "Write-off needs a reason and the key":
W4 pass + 2 fails + the follow-on credit-note fail, held. "The ledger stays balanced each time": six pass steps, **no fail step** (M1).

## Dimensions (1-5)
D1 Requirement fit 3: 3 of 4 Done-when lines have pass and fail; the ledger line has no fail, the credit cap's "left" reading is not walked ·
D2 Data integrity 5: every figure read back from `money_*` rows; nothing written on each refusal · D3 Reuse 5: `client`, `recorder`,
`moneyVisible`, seeds and `ledgerCheck` reused, no new helpers beyond j_58's shape · D4 Rule integrity 3: four rule removals stay green
(table) · D5 Stability 5: 23/23 twice, fresh copy and re-run · D6 Governance 4: audit and event counted on the write-off; not on the
refund, credit note or plan · D7 AI N/A · D8, D9, D12-D14 N/A (no screen) · D10 Language 4: answers plain except the no-reason 422 (m2) ·
D11 Feedback 4: each answer names what is left or the difference · D15 Speed 5: whole journey 4 s · D16 Testability 3: M1, M2 ·
D17, D20 simulated only (no intended user walked it) · D18 Provenance 4: Sample marked, no counsel, no accountant; the qa line overclaims
(M3) · D19 Closure 4: W6 roles and the cross-firm refusals; the hand-over to FO-7s4 named.

## Issues
1. **Major (Must): the ledger clause has no fail step** (`j_96.ts:82`, used at :89, :107, :115, :130, :146, :157). Replace `ledgerCheck`'s
   answer with `{ balanced: true }`, or drop the write-off's or the plan's UNBALANCED rollback: j_96 stays 23/23. Fix: one W7 at the
   end, after the "whole journey" check. Plant an L1 imbalance on a new party's invoice, the way pack WO10 does
   (`check_r196_write_offs.ts:213-219`: a replica-role trust entry whose balance is not the running sum). Then assert three things:
   `ledgerCheck(db, A, inv)` names L1; a write-off on it gets 409 UNBALANCED, with no write-off, audit line or event; a plan on it gets
   409 UNBALANCED, with no plan.
2. **Major (Must): W3 never tests "what is left"** (`j_96.ts:111`). Its fail step is 300.01 on a 300.00 invoice with nothing credited,
   so the total and what is left are the same. Cap credit notes at the total instead (API and DB): j_96 stays 23/23, yet a 200.01 note
   after the 100.00 is accepted (credited 300.01 on 300.00, ledger L3 off). Fix: after the 100.00 note, 200.01 → 409 OVER_CREDIT with
   `leftMinor` 20000 and credited still 100.00. My probe of exactly this passes at this head.
3. **Major (Must): `qa/built/R1.96.md` claims more than is built or proved.** "a write that would unbalance it is rolled back (409
   UNBALANCED)" holds only for write-offs (`write-off.ts:58-59`, proved by WO10) and plans (`plan.ts:112-113`, proved by nothing: the
   table above). Refunds, credit notes, reversals and payments run no ledger check in their transaction. Fix: say "a write-off or a
   plan that would unbalance it is rolled back (409 UNBALANCED)", with M1's W7 as the proof for both. Then name the PR (#3792, not
   "the part 3 PR"), and drop the quotes around "150.00 of 400.00": the app's words are "Only CAD 250.00 of this payment is left to
   refund".
4. Minor (Should): W2's fail steps accept 400, 409 or 422 with no code (`j_96.ts:101`, :105). With the API cap removed, the database's
   raw "40001 would refund more than the payment 40000" passes a step labelled "refused in words". Assert `code === "OVER_REFUND"`
   and `leftMinor`, as W3 does for OVER_CREDIT.
5. Minor (Should; part 1 code, not this diff): a write-off with no `reason` key answers 422 "Invalid input: expected string, received
   undefined" (zod's default). `words()` (`ports/client-money.ts:99`) says "The reason is needed." only for an empty string. Give the
   missing key the same words; FO-7s4's dialog will show this text.
6. Minor (Should): `graph.mjs` still shows `testedBy: []` for the R1.96 routes j_96 calls (write-off, plan ×3, refunds, credit notes,
   reverse, reverse-preview), because the paths are built from `${M}` (`j_96.ts:44`). This carries part 2's
   m11 ("Part 3's j_96 should name them"). Write the paths out, or teach the graph the constant.
7. Minor: the header's port 4496 is also `check_csw3_firm_scope.ts:13`'s. They clash only if both run on one machine at once.

## Could not check
The GitHub walk (`walks.yml` with `record.ts`) runs on the header's :4496, which is not mine to use; I checked its header parse
instead. A real user's walk (D17/D20 stay with the founder).

**Verdict: Block.** Fix 1, 2 and 3. Fix minors 4-7 or list them in the PR.

Reviewer: Block ee4579cee7cb7f927649bf81ce9675be93c46b30
