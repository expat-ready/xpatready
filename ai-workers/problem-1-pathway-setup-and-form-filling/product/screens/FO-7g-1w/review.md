# Review: FO-7g part 1w (R1.56, money; no screen): the tax default on every new draft line

Reviewer (Opus 5.5, effort high; did not build it), 22 Nov. Code reviewed: `edea9f68f975440cf43b67f2f4af0d875cde7794`, diff `562df834b..edea9f68 -- prototype/studio` (6 files, +129/-13). Commit `8b81ec120` (the breaker's `break-report.md`), added on the branch after this head, changes only records (+44 lines in one file). I did not read it, so this review stands on its own.
Spec: brief `track-b/FO-7g-1w.md` (lead-b branch, with P-797 and `billToProvince(firm, party)`), and Lead B's ruling A on #2967.

**Verdict: Approve** (Ship). No open Blocker or Major.

## Runs (PG 127.0.0.1:54329; isolated copies on :4471 and :4487, never :4400)
| Check | Result |
|---|---|
| `check_fo7g_tax_defaults.ts` | 72/0, exit 0 (also 72/0 in a scratch worktree) |
| `check_fo7b_invoices.ts` | 107/0, exit 0 |
| `check_fo7a_money_schema.ts` / `check_pf12_walls.ts` | 122/0 / 110/0, both unchanged by the diff |
| `journeys/j_59.ts` on isolated `rv1w` :4471 | 15/15, exit 0 |
| `check_pf28_inputs.ts` on isolated :4487 | 46/47. The one fail is `POST …/invoices/:id/issue missing → 404`, an #2953 route the diff does not touch (the known item) |
| New checks against the **old** `drafts.ts` (562df834b) | 62/10: all ten 1w case lines fail, so the checks were written first and are real |

## Done-when: five cases, each passing and each named fail caught (mutation runs on `drafts.ts`)
| Case | Pass | Named fail, and what I planted |
|---|---|---|
| 1. Ontario 0.50 FEE, no rate sent → 130000 / 0.06 | yes | half up through the route stores 0.07 and is caught. My mutants: `Math.round` → 2 fails; "nothing sent = 0" → 5 fails |
| 2. GOVERNMENT_FEE sent with 130000 → 422 at ratePpm | yes | refusal removed → case 2 fails, and fo7b R10-fail fails too; government fee taxed at the default → 4 fails |
| 3. A rate the client sends is never stored | yes | client rate stored and 422 removed → 4 fails in fo7g, and R12 fails in fo7b |
| 4. Not registered → 0 on every line | yes | `registered: true` forced → 2 fails |
| 5. Firm A never reads firm B's province | yes | B in NS: A gets ON, B gets NS. Dropping `where f.id = …` is **not** caught (72/0), because PF-12's RLS on `platform_firm` (`20261116013000_pf12_firm_walls/migration.sql:190-192`) already hides B's row. The behaviour holds at two layers (Minor 1) |
| Audit carries the stored rate | yes | audit `detail.ratePpm` set to the client's value → the 1w audit line fails |

## Rate safety, the read, concurrency (code: `invoices/drafts.ts:80-112`, `invoices/bill-to.ts`)
* **No client rate reaches `tax_rate_ppm`.** The stored rate is only `lineRatePpm(…, dflt)` (`drafts.ts:100`), which returns 0 or `taxDefault`'s rate, and `lineRatePpm` itself refuses any default outside the cited table. The sent value only sets `taxable`. Probes: `ratePpm` null or "0" → 422 (zod); 1,000,000 → 422; DISBURSEMENT at default or 0 → stored default or 0; `taxable: true` → 422 unknown key.
* **Government fee:** sent with any rate other than 0 → 422 at `ratePpm`, in words, before the transaction (`drafts.ts:83`). No rate, 0 or -0 → 201 with rate 0 and tax 0.
* **One-statement read after the lock:** `drafts.ts:94` runs after the `for update` at `:87`. It reads `tax_registered` and `business_address` in one statement (one snapshot), filtered by the session's `firmScope(ctx.firmId)`, with RLS under it. The province goes through `billToProvince`, which pulls `province_state` the same way part 1's route does. It is exported for part 3, takes `(firm, party)`, and the party comes from the invoice row.
* **Race:** 24 lines added at once to one invoice while a loop flipped `tax_registered` and the province ON/AB. Result: 24×201; positions 1-24, unique; stored rates only {0, 130000, 50000}; 24/24 audit lines with `ratePpm` = `taxRatePpm_after` = stored; `money_invoice_total` = the sum of the lines. Across the whole copy, 70/70 lines carry the stored rate in their audit line. A New Brunswick firm sending 13 % → 422 naming 150000; nothing sent → 150000.
* **Scope:** no `ports/` change, no new route, no migration. All edits are inside the touch list (`invoices/`, the three tests, `MODULE.rows/FO-7g-1w.md`).

## Edits to the frozen checks (ruling A: setup and requests only), compared line by line
* `check_fo7b_invoices.ts:103-109`: **setup**. Both firms registered; `atRate` puts firm A in NB, NS or AB for the 15/14/5 % cases and back in ON in a `finally`. `:116` `taxOf` and `:157` R8 wrap the same request in `atRate`. **Every assertion and figure is unchanged** (110.50/960.50, the R2-R6 halves, R7's 0.06+0.06, R8's 3,221,225.47 and 24,696,061.94, the race total 2.26, the audit counts).
* `:164-167` R10: the rate is removed from the government-fee request; the message loses "(13 % sent)"; the assertion is identical. `:168-170` adds the R10 refusal (new).
* `:182-184` R12 pass is turned into the 1w refusal (422, nothing written, then the default is accepted), as the ruling names. R12 fail (`:186-188`) is unchanged.
* `journeys/j_59.ts:45-48`: setup only (registered). `:87`: the rate is removed from the W4 government-fee request. No assertion changed.
* `check_fo7g_tax_defaults.ts:264,271`: DW3's request loses the government-fee rate (that path is now case 2's refusal); its assertion is identical.
Nothing weakened: no rounding, total, wall or audit assertion was removed.

## Journey test (API, reviewer role; the invoice has no screen yet). Score **8.5/10**, pass
Journeys walked: (1) a staff member drafts and adds fee, disbursement and government lines with no rate (J-59 W1-W5 and DW, plus my probes); (2) "not taxable" sent as 0; (3) an error: a wrong rate, then recovery by sending the default; (4) the wrong firm (fo7b and J-59 DW give 404); (5) a firm outside Ontario; (6) a race of 24 at once. Line add p50 27 ms, p95 33 ms (20 calls on :4471).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J-59 15/15; the default lands on every new line |
| Next step obvious | 1 | the refusal names what to send: "send no rate or 150000 … or 0" |
| Plain words | ½ | "130000" in parts per million appears in the words (Minor 2) |
| Feedback and state | 1 | 422 at the field, "Nothing was saved.", count unchanged |
| Correct data | 1 | race and audit results above |
| Error recovery | 1 | R12: refused, then the default is accepted |
| Accessibility and screen sizes | ½ | not applicable: no screen |
| Speed | 1 | p95 33 ms |
| Visual quality | ½ | not applicable: no screen |
| Trust and sources | 1 | the rate comes only from the cited table; "Unconfirmed: no accountant" in `bill-to.ts:5` |

## Screen-review items
No screen and no concept: D1-D20 and the BIC-01 to BIC-20 scorecard do not apply. The graph (`graph.mjs` run): the line route has no page ("no page uses it either"), as expected while the invoice has no screen. Its tests are named in `MODULE.rows/FO-7g-1w.md`.

## Issues
1. **Minor** (no fix required): `tests/check_fo7g_tax_defaults.ts:237-239`. Case 5's "fail (stand-in)" shows that the rate follows the firm's own province, but it cannot detect a missing `where f.id = ${firmId}` at `drafts.ts:94`: RLS is the guard that actually holds. Either say so in the case's words ("held by the wall and the filter"), or leave it as it is.
2. **Minor** (builder's call): `drafts.ts:97-99`. The refusal says "send no rate or 130000 for taxable (HST)". Fine for an API, but the future invoice screen should not show it verbatim. A percentage ("13 %") would read as plain words.

## Could not check
Full `ci` (no PR yet; P-683 asks for the reviewer's verdict first). `check_pf28_inputs.ts` at the base commit (it needs a copy running the base code); its one failing probe is on the issue route, outside this diff. No accountant, so the tax readings stay Unconfirmed.

**Verdict: Approve**. No Blocker, no Major. Minors 1 and 2 are optional.

Reviewer: Approve edea9f68f975440cf43b67f2f4af0d875cde7794

## Round 2 (diff edea9f68..825b9249)

Reviewer and breaker for this diff (Opus 5.5, effort high; did not build it), 22 Nov. Code reviewed: `825b92496608177ef120d66da0c80d21316538e0`, diff only: `git diff edea9f68..825b9249 -- prototype/studio` (2 files: `api/src/client-money/invoices/drafts.ts` +8/-3, `tests/check_fo7g_tax_defaults.ts` +17/-1). The same commit adds the round 1 records (review.md and break-report.md); no other code changed.

### Runs (PG 127.0.0.1:54329; isolated copy `rr1w` on :4473, stopped afterwards; never :4400)
| Check | Result |
|---|---|
| `check_fo7g_tax_defaults.ts`, three runs in a row | 76/0, 76/0, 76/0, exit 0 each |
| the same, a fourth run with all 4 cores busy (busy loops) | 76/0, exit 0 |
| `check_fo7b_invoices.ts` | 107/0, exit 0 (R10, R10-fail, R12 and the race pass) |
| `journeys/j_59.ts rr1w 4473` | 15/15, exit 0 |
| Mutants, in a scratch worktree of 825b9249 (removed afterwards) | see the table below |

### Each fix: is it correct, and does its test fail without it
| Fix | Code | Mutant I planted | Result |
|---|---|---|---|
| Breaker m1: "Prices include tax" read again after the lock, in the same statement as registration and province | `drafts.ts:98-99` | `if (false && facts?.inclusive)` | 74/2: the m1 fail case gets `[201, …, "FEE:100000:130000:13000"]` and the m1 pass stand-in then sees two lines. Caught in 3 of 3 runs |
| Breaker m2: `ratePpm: undefined` = not sent | `drafts.ts:84` | the old `Object.hasOwn(...)` alone | 75/1: the m2 case stores `FEE:100000:0:0` |
| Reviewer minor 2: the refusal names "HST 13 %" | `drafts.ts:104` | the old words | 75/1: the minor-2 case fails |
| Reviewer minor 1: case 5's words | `check_fo7g_tax_defaults.ts:333` | words only | Now says that the filter and PF-12's row rules each keep the case green on their own. That is accurate, and it was the wording I asked for |

* **m1 is correct.** `inclusive`, `registered` and `address` come from one statement (`:98`), after the `for update` (`:91`). Any commit that lands while the line waits is therefore seen whole, and the result matches a serial order. The line itself takes no lock on `money_payment_settings` (`settingsOrRefuse`, `:133`, is a plain read), so a writer that holds the invoice and updates the settings cannot deadlock with it. A missing settings row still gives `null`, so it proceeds as before; that row cannot disappear here (no route deletes it). The 409 now takes precedence below 403/ISSUED, and every one of them writes nothing.
* **m2 is correct.** `hasOwn && value !== undefined` means an absent key and `undefined` both count as "not sent". JSON cannot carry `undefined`, and `null` is still 422 through zod, so nothing changes over HTTP.
* **`percent()` (`drafts.ts:52`)** works from the integer's digits: it truncates for the whole part and builds the fraction from `ppm % 10000` as a padded string with trailing zeros removed. No float is ever formatted. I ran it on its own: 50000 → "5 %", 130000 → "13 %", 140000 → "14 %", 150000 → "15 %", 9975 → "0.9975 %" (correct arithmetic: 9975 ppm is 0.9975 %; Quebec's 9.975 % would be 99750 → "9.975 %", and it is not in the GST/HST table anyway), 10000 → "1 %", 125000 → "12.5 %", 1 → "0.0001 %". It is only called with a cited table rate other than 0 (the `dflt.ratePpm === 0` branch takes the other words), so negative or fractional input cannot reach it.

### Breaker, this diff (live HTTP on :4473, psql holding the invoice lock)
* **Refusal words, firm in each province, `ratePpm: 1300` sent:** ON "(HST 13 %) … 130000 (parts per million)", NB "(HST 15 %) … 150000", NS "(HST 14 %) … 140000", AB and QC "(GST 5 %) … 50000". All 422, nothing written.
* **The breaker's m1 reproduced over HTTP** (not registered, inclusive off; psql takes the lock, the POST waits (`pg_stat_activity` shows 1 lock waiter), then psql sets registered and inclusive in one statement and commits): **409 PRICES_INCLUDE_TAX, no rows** (in round 1 this gave 201 with tax on top). Turning on inclusive alone while 130000 is sent also gives 409, no rows. ON changed to NB while 130000 is sent gives 422, no rows (validated against the NB rate read after the lock). Registration turned off while nothing is sent gives 201 at `FEE:100000:0:0`. Every result matches a serial order.
* **Audit after the run:** 0 lines whose `detail.ratePpm` differs from the stored rate, and 0 lines without an `invoice.line_added` entry.
* **Is the new lock test flaky?** No in 4 green runs (one under full CPU load) and 3 of 3 red mutant runs. It uses fixed waits (`:339`, 300 ms then 700 ms), not a check that the request is actually waiting on the lock. Minor 1 below covers this.

### No regression
The round 1 cases (1w cases 1-5, audit, DW3), the race in fo7b (two lines, total 2.26), fo7b's R10/R12 and J-59 W1-W5/DW all pass, and their assertions are untouched by this diff (only the case 5 words changed). `git diff` of the check shows only additions after case 5 plus the one reworded message.

### Journey test (API, reviewer role; no screen). Score **9/10**, pass
Same journeys as round 1, plus the m1 race over HTTP and the refusal words for five provinces. Changes from 8.5: plain words goes from ½ to 1, because the refusal now says "HST 13 %" first and gives parts per million only as the value to send. Accessibility and visual quality stay ½ each (not applicable: no screen). Every other criterion stays 1 (task done; next step named; 422 at the field with "Nothing was saved."; correct data and audit; recovery by sending no rate; p95 well under 100 ms; rates only from the cited table).

### Issues (round 2)
1. **Minor** (optional): `tests/check_fo7g_tax_defaults.ts:337-339`. The lock test orders itself with `sleep(300)` and `sleep(700)`. If the POST ever reached `settingsOrRefuse` (`drafts.ts:133-135`) only after the locker committed, it would get the same 409 from there, and the m1 fail case would stay green without the fix. It did not happen in 7 runs. Polling `pg_stat_activity` for a `Lock` waiter before `release()` would make the case deterministic.
2. **Minor** (optional): `drafts.ts:99` and `:135` carry the same PRICES_INCLUDE_TAX words twice. A shared constant would keep them from drifting.
3. **Nit**: `drafts.ts:104` "send no rate, or 130000 (parts per million), for taxable, or 0 …" reads a little choppy. It is fine for an API; the future screen will use its own words.

Housekeeping: my scratch worktree, the `rr1w` copy and its database are removed. The four `xr_studio_fo7g_scratch_*` databases the breaker noted are no longer on the server. Nothing committed.

**Verdict: Approve**. No Blocker, no Major. The fixes are correct and each is caught by its test when disabled. Open items, all optional:
* Minor: `studio/tests/check_fo7g_tax_defaults.ts:337-339`, fixed sleeps in the lock test (wait for the lock instead)
* Minor: `studio/api/src/client-money/invoices/drafts.ts:99` and `:135`, the same refusal words twice
* Nit: `studio/api/src/client-money/invoices/drafts.ts:104`, word order of the refusal

Reviewer: Approve 825b92496608177ef120d66da0c80d21316538e0

## Round 3 (diff-only, f4e48b664)

Reviewer (Opus 5.5; did not build it), 22 Nov. Head `f4e48b6640c0b373949b74acd34d887b01a5ee92`. Since the round 2 Approve on `825b9249`, the branch has only: `f489ee7a7` (round 2 records), `7aafe0315` (merge of #2953's branch at `3b0f5bb54`) and `f4e48b664` (merge of `origin/main` at `bc1f39c08`, after #2953 landed as `3264e2510`). No rebase: `825b9249` is still on the first-parent line.

### What I checked
| Check | Result |
|---|---|
| 1. `git diff origin/main...f4e48b664 --stat` (merge base = `origin/main` = `bc1f39c08`) | 8 files, all part 1w's own: `screens/FO-7g-1w/{break-report,review}.md`, `MODULE.rows/FO-7g-1w.md`, `invoices/{bill-to,drafts}.ts`, `tests/check_fo7b_invoices.ts`, `tests/check_fo7g_tax_defaults.ts`, `tests/journeys/j_59.ts` (+316/-13). `git diff bc1f39c08 f4e48b664 --stat` is the same 8 files, so the head is main plus part 1w and nothing else |
| 2a. Blobs at `825b9249` vs `f4e48b664` | `bill-to.ts`, `drafts.ts`, `check_fo7g_tax_defaults.ts`, `j_59.ts`, `MODULE.rows/FO-7g-1w.md`: **byte-identical** (same blob ids). `drafts.ts` addLine (the lock query, the one facts statement, both ratePpm checks, `lineRatePpm`, the audit line) is unchanged by the merges |
| 2b. Part 1w's own diff, approved vs now | `git diff 562df834b 825b9249` (the approved PR diff, against the #2953 merge it sat on) and `git diff origin/main...f4e48b664`, on the six code/test files: the two patches are **identical hunk for hunk**. The only difference is the `index` line of `check_fo7b_invoices.ts`, because its base moved |
| 2c. `check_fo7b_invoices.ts` merge | Main's side since `562df834b` (#2953's last commits: issue's `dueDate` moved to `?dueDate=`, the new "I fail (PF-28)" unknown-query case, the `client_money.*` template keys in R9 and the DocumentRenderPort contract) is all present at the head, and part 1w's side (registered firms, `atRate`, R10 without the rate, R10-fail, R12 as the 1w refusal) is all present. Neither side's lines were dropped or altered. `git show --cc f4e48b664` shows no hand-resolved hunk in either file |
| 2d. Main's other changes that the 1w read depends on | `firm-scope.ts` (+1 bypass use for a billing job) and the PF-12 / pf18bk / pf8b migrations (grant and FORCE RLS handling during migration) do not change `platform_firm`'s row rules, `money_payment_settings`, `tax_registered`, `prices_include_tax` or `business_address`. `documents.ts`/`money.ts` still import `MONEY` from `drafts.ts`, which is unchanged |
| 3. `check_fo7g_tax_defaults.ts` on PG 127.0.0.1:54329 (from `prototype/`) | **76 passed, 0 failed** |
| 3. `check_fo7b_invoices.ts` | **108 passed, 0 failed** (107 in round 2, plus #2953's new PF-28 issue-query case; R10, R10-fail, R12 pass/fail and the race all pass) |
| Type check `tsc --noEmit -p api/tsconfig.json` | no error in `client-money/`, `check_fo7b`, `check_fo7g` or `j_59` (errors remain in unrelated older tests, not touched here) |

Not re-run: mutants and the live HTTP break runs (the code under them is byte-identical to round 2, where each was caught), `j_59.ts` (identical file and identical route code), full `ci`. Working tree clean after the runs; no evidence file rewritten; nothing committed by me.

### Journey test
No behaviour changed since round 2 (same `drafts.ts`, `bill-to.ts`, same routes for adding a line). Score stays **9/10**, pass, on the round 2 evidence: accessibility and visual quality ½ each (no screen), every other criterion 1.

### Findings
None new. Round 2's optional items stay open and optional (fixed sleeps in the lock test `check_fo7g_tax_defaults.ts:337-339`; the PRICES_INCLUDE_TAX words twice at `drafts.ts:99` and `:135`; the refusal's word order at `drafts.ts:104`). No Blocker, no Major.

Verdict: Approve f4e48b6640c0b373949b74acd34d887b01a5ee92
