# Review: FO-7g part 1 (R1.56): tax default by province from a cited table

Independent reviewer (money row, P-608 (2), P-303). Fresh Opus 5.5, high effort, 22 Nov 2026. **Commit reviewed: `84a3e1ab2c34ec290b950539969ae79784917beb`** on `claude/sharp-tesla-7vrduw`, against `origin/main` `0c3f95afd`. Specs, highest first: Track B `briefs/track-b/FO-7g-1.md` (it narrows the row: no edit in `invoices/`, DW12 pure, an unknown province gives `NONE`/0 plus the warning), then `build-lead-c-briefs/FO-7g.md` (the table, DW10, DW11, the breaker list), then the draft `briefs/FO-7g.md` (DW1-DW7).
While I worked, the builder committed `6730ec00d` (the break report, plus fixes for the breaker's m1-m3 in `canada-gst-hst.ts`, `defaults.ts` and the check). Every result below is for 84a3e1ab. The mutation runs used a copy whose files I checked byte for byte against `git show 84a3e1ab:`. I read 6730ec00d's diff but did not review it in full: re-review that diff (P-277).

**Screen-review checks that apply:** this part has no screen. Checks (2), (3) and (7) (the BIC table) are N/A, and so are D8, D9 and D12-D14. Check (5) code, check (4) the API [M] lines (server authorisation, a field error on a bad field, no per-row requests) and the graph check apply.

## What I ran (all on 84a3e1ab)
* `check_fo7g_tax_defaults.ts`: **52 passed, 0 failed, exit 0** (7.9 s). Unchanged: `check_fo7b_invoices` **44/0**, `check_fo7a_money_schema` **122/0**, `check_fo7ts_money_settings` **107/0**, `check_pf12_walls` **110/0**, each exit 0.
* `typecheck.mjs` (CI's type job): api 15 known errors, 0 new; web 0. **PASS.** Full `ci` not run (the PR is still a draft).
* Scope: `git diff --stat origin/main..84a3e1ab` lists exactly the 6 files on the Track B touch list. No `invoices/`, schema, migration, `ports/`, `main.ts`, `runtime.ts` or `core.ts` edit. The route is registered in its own `features/client-money-tax.ts` (P-214).
* **Mutation pass:** 17 plants, one at a time, each run through the check. 14 were caught. Caught: removing the registered check; `registered` read as truthy; guessing a province; dropping the warning; loose province parsing; taxing a government fee; the key changed; a non-strict query; NS at 15 % (quote edited too); BC at 12 %; ON in basis points (quote edited to "0.13%"); the URL host check removed; the read-date check removed. The 3 that survived are explained in Minor 1 and in Observation 1.
* **Citations:** I could not reach www.canada.ca. curl got HTTP/2 INTERNAL_ERROR, then a 30 s timeout over HTTP/1.1. **Not verified independently at source.** Instead I compared:
  * Build Lead C's table (read 18 Nov): all 13 codes, rates, GST/HST names and the NS start date match `canada-gst-hst.ts:47-70` and the PR body.
  * The builder's own saved capture of the page (scratchpad `cra/page.html`, 06:10 UTC, 58,990 bytes): the title "GST/HST calculator (and rates)", "Date modified: 2025-04-01", the caption "GST/HST and PST rates", all 13 rows word for word (for example "Nova Scotia | 14% | N/A" and "Quebec | 5% | 9.975%"), the sentence "As of April 1, 2025, the HST rate has decreased to 14% in Nova Scotia." and the sentence "…provinces that don't participate in the HST." all match. That capture is the builder's, not my own read.
  * Rates are integer ppm, never basis points. The quote-to-ppm conversion (`:93`) uses integer arithmetic only, and no float touches money. DW12 goes through `taxForLine` (BigInt, half to even).

## D1-D20
D1 requirement fit **Met**: DW1-DW7, DW10, DW11 and the pure DW12 pass, the narrowing is respected, and the unknown province gives the ruling's words exactly · D2 data integrity **Met**: read only (audit, invoice and line counts unchanged), strict query, 422 at the field · D3 reuse **Met**: `taxForLine`, `firmScope`/`ownFirm`, `parseInput`/`strict` and PF-4's guard are reused · D4 rule integrity **Met**: every province value resolves to an entry or to `NONE` · D5 stability **Met**: one RepeatableRead snapshot, and a bad table stops the app at load · D6 freshness **Met**: URL, quote and read date (2026-11-22) on every value · D7 AI **N/A** · D8, D9, D12-D14 **N/A** (no screen) · D10 language **Met**: "No such person in your firm.", "ratePpm: This field is not allowed here.", the warning word for word · D11 feedback **Met**: `source`, `registered`, `warning` · D15 speed **Met**: 12-31 ms a call, 3 queries, no per-row request · D16 testability **Partly**: each DW has a pass and a fail, but see Minors 1-2 · D17 **simulated only** · D18 provenance **Met** in code and PR body (the answer carries `source`, not the citation, which is what the brief's shape asks) · D19 **N/A** (part 1 of 4) · D20 **simulated only**.

## Journey test (reviewer role, API journey; my one score for this check)
I started an isolated copy on **:4431** (runtime ports; never :4400) and walked it with curl, signed in through the local stand-in. Two parties per firm were seeded by SQL as `seed:FO-7g-review`, because no route creates a person yet. The copy was stopped and dropped afterwards. The working tree may already have held 6730ec00d's edits by then, but `routes.ts`, `taxDefault` and the table values are byte-identical between the two commits, so these answers stand for 84a3e1ab.

| # | Journey (staff asks the default for a client) | Result |
|---|---|---|
| 1 | Owner, own client, firm has no payment settings | 200 `ratePpm 0`, `NONE`, `registered false`, no warning |
| 2 | Owner, own person / own company, registered, ON | 200 `HST 130000 FIRM_PROVINCE`, both kinds |
| 3 | Case Manager, Case Officer, same firm | 200, same answer |
| 4 | Client of another firm (both directions) | 404 "No such person in your firm.", no rate |
| 5 | No session / garbage token | 401 `NOT_SIGNED_IN` / `TOKEN_REFUSED` |
| 6 | Staff without the key (READ_ONLY) | 403 `MISSING_PERMISSION` naming `agent/invoice:create` |
| 7 | Unregistered firm, own client | 200 `0`, `registered false` |
| 8 | Registered firm, no province / "Nova Scotia" spelled out | 200 `0`, `NONE`, "Your firm's province isn't set — tax is not added" |
| 9 | Province NS | 200 `HST 140000` |
| 10 | Typed `ratePpm=1300`, bad / 5000-char id, non-English kind, JSON body on GET | 422 naming the field for each query case; the body is ignored |

The audit delta over the walk was 0. Score (0 / ½ / 1): task completed 1 · next step obvious 1 (the warning says why there is no tax) · plain words 1 · feedback and state 1 · correct data 1 (each value equals the table, nothing written) · error recovery 1 (each 422 names its field; a missing party and another firm's party give the same 404) · accessibility and screen sizes ½ (no screen; nothing to test) · speed 1 · visual quality ½ (no screen) · trust and sources 1. **Journey score: 9/10. Pass.**

## Blocker
None.

## Major
None.

## Minor
1. **The fail-closed load has no test.** At `api/src/client-money/tax/canada-gst-hst.ts:105-106`, deleting the `throw` leaves the check at 52/52. CI still catches an uncited value in the file, through the "source pass" case (`tests/check_fo7g_tax_defaults.ts:42`). But nothing proves that the app refuses to load such a table. That was the brief's reason for the check, and it is still untested in 6730ec00d. **Fix:** move the load check into an exported function (for example `assertCited(table)`), call it at load, and add a planted-table case that expects it to throw.
2. **The DW12 fail case does not test the code.** `tests/check_fo7g_tax_defaults.ts:108` asserts only that `Math.round(50*130000/1e6)` is 7. It never puts a half-up rounding through the DW12 predicate. The pass case at `:107` would catch a half-up `taxForLine`, so the risk is small. **Fix:** write DW12 as a predicate over a rounding function, then apply it to `taxForLine` (pass) and to `halfUp` (fail).
3. **A DW4 deviation is recorded only in a test name.** The draft's DW4 asks for "`tax_registered` true with no number → taxed", but FO-7ts's `money_payment_settings_tax_registered_check` makes that state impossible. `tests/check_fo7g_tax_defaults.ts:183` proves the refusal and states the reason. The PR body is silent. **Fix:** add one line under "Where the briefs and main differ" in the PR body ("never deviate silently").
4. **The PR body's "Checks and results" section is still empty** (`<!-- CHECKS -->`). **Fix:** paste the five result lines above before asking for the label.
5. **I agree with the breaker's m1-m3** (`break-report.md`). I reproduced m2's basis-point case myself: "ON 1300 / 0.13%" loads, and only DW10 catches it. The builder fixed all three in 6730ec00d, which I did not review in full.

## Observations (not findings)
1. **The firm filters are backed by PF-12.** Removing `firmScope`/`ownFirm` from any of the three reads (`routes.ts:26-30`) leaves 52/52, because PF-12's row-level walls on `fo_person`, `fo_company`, `money_payment_settings` and `platform_firm` still give the 404. The wall is proven. The route's own filter is a second layer that the check cannot tell apart from the first.
2. **Graph (P-86):** `graph.mjs` reported G1 0, G2 0, G3 203, G4 0, G5 0, G6 16, with no gap naming tax. The tool does not see this route, because its pattern needs a path inside `@Get("…")` and `routes.ts:43` is `@Get()`. FO-7b's `@Post()` is missed the same way. That is a tool limit, not this row's to fix.
3. **For part 1w (P-26):** FO-7b's line route still takes `ratePpm` from the request body. `invoices/drafts.ts:76` silently stores 0 for a government fee where it should refuse. Two breaker items stay open until part 1w calls `taxDefault`/`lineRatePpm`: "a rate in the body" and "a government fee taxed via a line edit".
4. A lower-case code with spaces (" on ") reads as ON (`defaults.ts:29-34`). That is safe: the only writer stores the 13-code enum. A spelled-out name or a typo gets `NONE`, never a guess.

## What I could not check
* The CRA page at source (blocked here).
* The BC, MB and SK bulletins, which hold no table value and were not re-read by the builder either.
* Full `ci`, a real screen reader, and an intended user's unaided walk (D17 and D20 stay with the founder).

**Verdict: Approve** (84a3e1ab: no open Blocker or Major). Minors to fix (not blocking): 1. `canada-gst-hst.ts:105-106` load-time refusal untested · 2. `check_fo7g_tax_defaults.ts:108` DW12 fail case does not test the code · 3. DW4 deviation (`check_fo7g_tax_defaults.ts:183`) missing from the PR body · 4. PR body "Checks and results" empty · 5. breaker m1-m3: fixed in 6730ec00d, re-review that diff.

## Round 2 (diff 84a3e1ab..d87e1f41)
Same reviewer, 22 Nov 2026. This round re-reviews the diff only (P-277), and I also act as the breaker for it (money). **Commit reviewed: `d87e1f41d2219d3cfa49a52d7b648c55eeaa95de`.** Scope: `git diff 84a3e1ab..d87e1f41 -- …/prototype/studio`, which touches 3 files: `canada-gst-hst.ts` (+23/-4), `defaults.ts` (+6/-1) and `check_fo7g_tax_defaults.ts` (+22/-4). No route, schema, migration, `invoices/` or `taxDefault` edit. The other two files in the commit range are the round-1 `review.md` and `break-report.md`.

### What I ran (on d87e1f41)
* `check_fo7g_tax_defaults.ts`: **56 passed, 0 failed, exit 0** (8.2 s). That is round 1's 52 plus 4 new cases. Unchanged: `check_fo7b_invoices` **44/0**, `check_fo7a_money_schema` **122/0** and `check_fo7ts_money_settings` **107/0**, each exit 0.
* `typecheck.mjs` (CI's type job): api 15 known errors, 0 new; web 0. **PASS.**
* **Boot:** importing the app's real `api/src/features.ts` and `features/client-money-tax.ts` under tsx works. `assertCited(PROVINCE_TAX_RATES)` runs at import and passes on today's table (default `today` = 2026-11-22 UTC). The check's own Nest app also boots with the feature.
* **The new checks against the real table:** the table loads as of 2025-04-01, 2026-11-22 and 2099-12-31. It is refused as of 2025-03-31, because NS's real start date (2025-04-01) would then be after today, which is correct. All 13 `PROVINCE_NAMES` equal the real entries' `province` and their quotes' first column, so the code-to-name check passes on the real data.
* **`lineRatePpm` still takes every answer `taxDefault` gives.** I tried 128 combinations: the 13 codes, no province, a spelled-out province and not registered, times FEE, DISBURSEMENT and GOVERNMENT_FEE, times taxable unset, true and false (a government fee set taxable is left out, because that is refused on purpose). **0 were wrong.**
* **Mutation pass:** 11 plants, one at a time, run in a scratch copy whose three files are byte-identical to `git show d87e1f41:`. Each file was restored and compared afterwards. 10 were caught and 1 survived:

| Plant | Result |
|---|---|
| M1: remove the load call `assertCited(PROVINCE_TAX_RATES)` (`canada-gst-hst.ts:121`) | **survived, 56/56** (Minor A) |
| M2: `assertCited` never throws | caught (`:63` case) |
| M3: remove the code-to-name check (`:95`) | caught (`:93`) |
| M4: remove the lowest-rate check (`:96`) | caught (`:93`) |
| M5: remove the start-date-after-today check (`:108`) | caught (`:95`) |
| M6: default `today` set to 9999-12-31 | caught (`:95`) |
| M7: remove `lineRatePpm`'s default check (`defaults.ts:59`) | caught (`:134`) |
| M8: remove the null-line check (`defaults.ts:57`) | caught (`:134`) |
| M9: allow any whole number as the default | caught (`:134`) |
| M10: refuse 0 as a default | caught (the check stops with `TaxRuleRefused`) |
| M11: `taxForLine` rounds half up | caught (DW12 pass, and DW12 stored) |

### Each fix
* **Breaker m1 (`defaults.ts:57-60`): correct.** 1300, 99, -1, "130000", undefined, NaN, a `Number` object, a null default and a null line are all refused with `TaxRuleRefused`. A government fee with a bad default is now refused instead of giving 0. That fails closed, and no real caller hits it, because `taxDefault` gives only 0 or a table rate. The fail test (`:134`) fails without the fix (M7, M8, M9). See Minor B for the one way past it.
* **Breaker m2 (`canada-gst-hst.ts:20-25`, `:95-96`): correct.** Alberta's whole entry under ON is refused ("the province is not Ontario"). So is a trailing space in the name. The fail test (`:93`) fails without either half (M3, M4).
* **Breaker m3, start date (`canada-gst-hst.ts:76`, `:108`): correct for `effectiveFrom`.** Tomorrow (2026-11-23), 2999 and a scheduled ON 15 % from 2030 are refused, today (2026-11-22) loads, and a `Date` object is refused as "not a date". `isDay` checks the format first, so the string comparison is safe. The fail test (`:95`) uses fixed dates for its pass half, so it will not drift, and it fails without the fix (M5, M6). The breaker's second half (a `readOn` of 2099) is not covered: see Minor C.
* **Review minor 1 (`canada-gst-hst.ts:114-121`): partly fixed.** `assertCited` exists, is exported, is called at load, and has a fail test (M2 is caught). But deleting the call itself still passes the check (M1). This is exactly the fix I asked for in round 1, so the gap is mine as much as the builder's: Minor A.
* **Review minor 2 (`tests/check_fo7g_tax_defaults.ts:117-120`): fixed.** DW12 is now a predicate over a rounding rule. It passes for `taxForLine` and refuses `halfUp` and a 15 % planted default. A half-up `taxForLine` fails the pass case (M11).
* **Review minors 3-4 (PR body):** not in this diff. GitHub's REST API lists no pull request for `claude/sharp-tesla-7vrduw` yet, so they stay open for when the PR is opened.

### Breaker pass on this diff (money): basis points and uncited rates
* **Basis points: I could not get one past the load check.** I planted each of these, and each was refused by the module's own check (not only by DW10):
  * ON 1300 with its quote set to "0.13%"
  * ON 13 with "0.0013%"
  * AB 500 with "0.05%"
  * AB 49 999 with "4.9999%"
  * ON 0 with "0%"
  * ON 130 000 000
  * ON 5 000 000 with "500%"
  * ON as a bigint or as text

  The rate must equal its quote's percentage in ppm. So a basis-point value either sits under 50 000 (refused by `:96`) or would need a quote of 500 % or more (refused by the 1,000,000 cap).
* **Uncited but consistent values still load** (no change from round 1; not a new finding). These all pass `tableProblems`:
  * ON 150 000 with the quote edited to "Ontario | 15% | N/A"
  * AB 60 000 with "6%"
  * a URL of `https://www.canada.ca/en/anything`

  The quote is the builder's own copy and the load check never compares it with the page. **DW10** (the brief's table pinned in the check) is what fails them in CI. That stays the guard, so DW10 must never be edited to match a table change without a fresh read of the page.
* **Two ways past the new checks:** a `readOn` in the future (Minor C), and a default whose value changes between reads (Minor B).

### Journey score
No route, guard, query or answer code changed (`routes.ts`, `taxDefault`, the feature file and the table values are byte-identical to 84a3e1ab). The check's route cases (DW2, DW4, DW7, keys and inputs, all with the API in the loop) ran green again on d87e1f41. I did not re-walk with curl. **Journey score: 9/10 (carried from round 1; nothing on the journey changed). Pass.**

### Blocker
None.

### Major
None.

### Minor
A. **The call at load still has no test** (`canada-gst-hst.ts:121`; test `tests/check_fo7g_tax_defaults.ts:63`). Removing `assertCited(PROVINCE_TAX_RATES);` leaves 56/56. CI would still fail an uncited table through the "source pass" case (`:42`), but would not show that the app refuses to load one. **Fix (one line):** assert that the module's source holds the call, for example `readFileSync(<canada-gst-hst.ts>).includes("\nassertCited(PROVINCE_TAX_RATES);")`, or import a planted copy in a child `tsx` and expect a non-zero exit.

B. **`lineRatePpm` reads `dflt.ratePpm` more than once** (`defaults.ts:59` checks it, `:67` returns it). A getter or Proxy that answers 0 on the check and 1300 on the return gets **1300** out, and a Proxy gets **99** out. A JSON body cannot build a getter, and part 1w passes `taxDefault`'s plain object, so nothing realistic reaches this. It is still the same read-twice pattern the breaker tried on `kind` in round 1. **Fix:** read once (`const rate = dflt?.ratePpm;`), check `rate`, return `rate`. Add a getter case to `:134`.

C. **A read date in the future still loads** (`canada-gst-hst.ts:94`; breaker m3's second half). `readOn: "2099-01-01"` passes. So does `1900-01-01`, which falls before the page's own "Date modified: 2025-04-01". A read date that has not happened yet is not a citation (AGENTS rule 4). **Fix:** give `readOn` the same `> today` refusal as `effectiveFrom` at `:108`, with one planted case beside `:95`.

### Observations (not findings)
1. **The load check now reads the clock.** A host whose clock is before 2025-04-01 refuses to boot. That fails closed, so it is acceptable. Also, a rate change can only be entered on or after its start day (UTC), so a scheduled change means a deploy on that day. The start date is compared in UTC, so near midnight it can be a day off from Canadian local time. Effective dating belongs to a later part; I note it so part 1w and part 3 do not assume the table can hold an announced change ahead of time.
2. `lineRatePpm` accepts any table rate, not the firm's own: NS 140 000 passes for an Ontario firm. The doc (`defaults.ts:55`) says exactly this ("0 or one of the table's rates"). Part 1w must pass `taxDefault`'s answer for that firm and never a number from the request (round 1, Observation 3 still applies).
3. `-0` passes as 0. That is harmless: `taxForLine` gives 0.

### What I could not check
* The CRA page at source (still blocked here; same as round 1).
* The PR body: no PR exists yet.

**Verdict: Approve** (d87e1f41: no open Blocker or Major; the five fixes asked for are in and correct, and none of them breaks boot, the real table or `taxDefault`'s answers). Minors to fix (not blocking):
* A. `canada-gst-hst.ts:121`: the load call is untested (test at `tests/check_fo7g_tax_defaults.ts:63`).
* B. `defaults.ts:59` and `:67`: `dflt.ratePpm` is read twice, so a getter gets 1300 past.
* C. `canada-gst-hst.ts:94`: a future `readOn` is accepted.
* Round-1 minors 3-4 (PR body) stay open until the PR exists.
