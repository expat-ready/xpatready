# qa capability R1.59: proof on main 414820671 after FO-7b part 1a (#2502), 20 Nov (cloud qa lane; Opus 5.5 medium; fresh Opus reader, ran nothing; live AI off; US$0)

**Item:** R1.59 "Money arithmetic". **Done when:** "Integer cents with currency; tax rounded per line by one stated rule; mixed currencies refused; a pass and a fail test per rule". This was in the original qa brief ("R1.59 once #2502 is on main"). #2502 merged at 16:59Z and closes QA-482.
**Parts (P-606):** MVP-CHECKLIST row 59 lists "FO-7a; FO-7b (tax rounded per line …)". FO-7a (#1758) and FO-7b part 1a (#2502) have both merged. Part 1a is the tax rounding; issuing, PDF and payments are part 1b, which row 59 does not list. So the row is scored.

**Verdict: Works** (updated 23:5x IST). j_59 is green on GitHub's runners on main's head ff6997410, whose app code is 414820671's (no `prototype/` or `.github/` change between them), from the Lead's walks.yml dispatches: runs **44792638809** and **44792679430**, 15/15 each, plus 44792887054 green. Before those, item-proof 44778921658 passed on 414820671 (P-339). **The fresh Opus reader gives Works, ~80%.** qa agrees.

## Clause by clause (main 414820671)
| Clause | Met? | Evidence |
|---|---|---|
| Integer cents with currency | Met | The route works in whole numbers only (`api/src/client-money/invoices/drafts.ts:63`). Tax is computed in BigInt (`tax-round.ts:14-20`). Each line takes its invoice's currency (`drafts.ts:82`). The database requires amount = quantity × unit (FO-7a migration `:578`). Fail cases: a fraction of a cent, text or a negative gives 400 (`check_fo7b_invoices.ts:164`); a float throws (`:34-36`). |
| Tax rounded per line by one stated rule | Met | The rule is round half to even, per line, then summed (`tax-round.ts:17-19`). It is stated in `api/src/client-money/MODULE.md:20`, AG-6-4a and BR-4. The route computes the tax and ignores one sent by the client (`drafts.ts:65-66`). Tested: 0.50 at 13 % gives 0.06, and 1.50 at 13 % gives 0.20; a planted half-up rule is caught, and tax on the subtotal is caught (`check_fo7b:110-132`). J-59 W2 gives 850.00 → 110.50 and W3 gives two 0.50 lines → 0.12. |
| Mixed currencies refused | Met | A USD line on a CAD draft gets 400, "This invoice is in CAD; a line in USD can't be added. Nothing was saved.", and no row is stored (`drafts.ts:75`; J-59 W5). The FO-7a trigger is a second guard. |
| A pass and a fail test per rule | Met | Every step in J-59 and FO-7b R1–R14 has a stand-in or a planted fail. |

**Gate A** is by API (P-616): there is no invoice screen in part 1a. J-59 ends with a stored draft read back by GET. The next capability, R1.60 ("Deposit invoice prepared on signature"), is Not built, so the walk cannot reach its first step. The draft J-59 leaves is the input R1.60 starts from, so the walk is blocked by the missing next step, not by output that step cannot use. The reader agrees.

## Runs
| Run | Where | Result |
|---|---|---|
| item-proof **44778921658**, job `prove (R1.59)` (136436451957) | GitHub, main 414820671 | j_59 **PASS**, secret scan pass, overall PASS |
| walks.yml j_59: **44792638809** (job 136484314478), **44792679430** (job 136484510872); also 44792887054 | GitHub, main ff6997410 (the Lead's dispatches) | **15/15** each; the self-test journeys j_0_fails and j_0_throws behaved as expected |
| `tests/journeys/j_59.ts` on fresh isolated copies (q59r1 :4475, q59r2 :4476) | here, main 414820671 | **15/15, twice** (`2026-11-20-capability-R1.59/j59-run{1,2}.txt`) |
| `check_fo7b_invoices.ts` | here | **43/43, twice** |
| `check_fo7a_money_schema.ts` | here | **122/122, twice** |

## Bugs: 0 Blocker · 0 Critical · 0 Major · 1 Minor new (QA-615); QA-482 closed
- **QA-482 closed** (Gap · Major): tax is now rounded per line by the stated rule. Moved to `BUGS-CLOSED.md`.
- **QA-615** (Bug · Minor, new; from #2502's breaker, Minors 3-4, which had no row): when about 200 or more lines are added to one draft at once, some requests answer 500 (Prisma P2028, the transaction could not start within 2 s) and 2-3 answer 409 "Already exists". No data is lost or wrong.
- Known, not new rows:
  - The database's line check allows ±1 cent, so a writer that skips the route can store a half-up 0.07 (`check_fo7b:115`). This is defence in depth; the exact check is the scheduled follow-up migration (FO-7b Question 2, 18 Nov ruling).
  - A draft above 21,474,836.47 is accepted (FO-7b R8) but can never be issued. Part 1b must refuse it in words.

## Records out of date (for the Lead; qa does not edit them)
- `MVP-CHECKLIST.md:117` still says "FO-7b … missing". Recommended: name "FO-7b part 1a" in the parts cell.

## Questions for the Lead
1. Done: the Lead dispatched walks.yml j_59, and the runs are green.
2. `MVP-CHECKLIST.md:117`: please update the parts and status cell (FO-7b part 1a; Works).

## Could not test
- A screen: there is none in part 1a.
- c8 coverage: not run this round.
