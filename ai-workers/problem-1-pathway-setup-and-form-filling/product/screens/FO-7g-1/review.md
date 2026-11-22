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

## Round 3 (diff d87e1f41..03796f94)
Same reviewer, 22 Nov 2026. This round re-reviews the diff only, under the Lead's standing permission (A277: round 2 fixed only Minors). I also act as the breaker for it (money). During the review the builder pushed one more commit, `9baa5e30`, and asked for it to be included. **Commit reviewed: `9baa5e3012febf1e6ae2d4c08c127c1f2980a991`.**

Scope is `git diff d87e1f41..9baa5e30 -- …/prototype/studio`, which touches 4 files:
* `03796f94`: `canada-gst-hst.ts` (+3), `defaults.ts` (+3/-2) and `check_fo7g_tax_defaults.ts` (+10/-2).
* `9baa5e30`: `routes.ts` (+7/-6), which only renames locals.

No schema, migration, `invoices/`, `taxDefault` or table value changed.

### What I ran
All runs used a scratch copy under `scratchpad/rr3/`. Its four changed files are byte-identical to `git show 9baa5e30:` (checked with `cmp`). I also ran the check once on the checkout at `03796f94`.
* **`check_fo7g_tax_defaults.ts`: 59 passed, 0 failed, exit 0** on both `03796f94` and `9baa5e30` (about 8 s). That is round 2's 56 plus 3 new cases.
* **Boot.** Importing `api/src/features.ts` and `features/client-money-tax.ts` under tsx works at `9baa5e30`, and the check's own Nest app boots with the feature (the "setup" case).
  * The load call now also checks the read date. It passes on today's real table: host clock 2026-11-22 06:57 UTC, every `readOn` is `2026-11-22`, and the check finds 0 problems.
  * As of 2026-11-21 and as of 2025-04-01 the real table is refused (13 problems, one per entry). That is correct, because the read had not happened yet on those days.
  * No clock override exists anywhere in the studio (searched for faketime, `useFakeTimers` and `Date.now =`), so nothing can boot the app with a clock in the past.
* **`lineRatePpm` still accepts every answer `taxDefault` gives.** I tried 136 combinations: the 13 codes, no province and a spelled-out province, registered or not, times FEE, DISBURSEMENT and GOVERNMENT_FEE, times taxable unset, true and false. I left out a government fee set taxable, because that is refused on purpose. **0 were wrong.**
* **CS-W3 census at `9baa5e30`.** I exported the commit into a throwaway git repo in scratch and ran the real script there: `bash studio/tests/fixtures/csw3/csw3-spike.sh census`, exit 0, `files: 47`, **no `client-money` file**. The 47 equal `check_csw3_firm_scope.ts`'s `ALLOW` exactly (no extra). The same census run on `03796f94`'s tree lists 48 files, and the 48th is `api/src/client-money/tax/routes.ts`, so this commit is what fixes the census. I did not run `check_csw3_firm_scope.ts` itself, because it builds a whole walled app copy. Its census case is the comparison above.
* **Types.** `tsc --noEmit` on the scratch api project reports 0 errors in `client-money/**` or the check. The other errors it reports are missing modules, because the scratch copy does not hold the whole studio. I did not run the full `typecheck.mjs` at `9baa5e30`.
* **Mutation pass:** 15 plants, one at a time. After each, the file was restored and its hash compared.

| Plant | Result |
|---|---|
| A1: remove `assertCited(PROVINCE_TAX_RATES);` (`canada-gst-hst.ts:124`) | caught (`:65`) |
| A2: call it with a fixed `today` of 2099 | caught (`:65`) |
| A3: replace the call with dead code | caught (`:65`) |
| C1: remove the read-date bound (`canada-gst-hst.ts:97`) | caught (`:67`) |
| C2: drop the `> today` half | caught (`:67`, 2099) |
| C3: drop the `< PAGE_MODIFIED` half | caught (`:67`, 1900 and 2025-03-31) |
| C4: `<= PAGE_MODIFIED` (off by one) | **survived** (Nit 1) |
| C5: `>= today` (off by one) | caught: the app's own load refuses the real table and the check cannot start |
| C6: `PAGE_MODIFIED` set to 2026-11-23 | caught: the same refusal at load |
| B1: put back the read-twice code (`defaults.ts:59-60`) | caught (`:144`) |
| B2: check `rate` but return `dflt.ratePpm` (`defaults.ts:68`) | caught (`:144`, which gets 1300 after 2 reads) |
| B3: `(dflt as any)?.ratePpm` instead of the object guard | survived. This plant changes nothing that matters: a primitive or null default still reads `undefined` and is refused |
| R1: the route answers `partyId: rawId` instead of `found.id` (`routes.ts:33`) | **survived** (Nit 2; the same gap existed before this diff) |
| R2: the route swaps PERSON and COMPANY (`routes.ts:26`) | caught (12 route cases) |
| R3: the route looks up `rawId` instead of the lower-cased id | survived. This plant changes nothing that matters: PostgreSQL's `uuid` ignores case |

### Each fix
* **Minor A (`canada-gst-hst.ts:124`; test `tests/check_fo7g_tax_defaults.ts:65-66`): fixed.** The test reads the module's source and requires `\nassertCited(PROVINCE_TAX_RATES);` as the file's last statement. Removing the call fails it (A1). So does adding a fixed date (A2) or putting dead code in its place (A3).
  * Hiding the call inside a comment, a string or a block needs closing text after it, which the anchored `$` refuses. An unclosed comment or template literal does not compile.
  * The test reads text, so moving the call elsewhere would fail it even when the call is still correct. That fails closed, so it is acceptable.
* **Minor B (`defaults.ts:59`, `:68`): fixed.** `ratePpm` is read exactly once and then checked and returned as a primitive.
  * The round-2 getter (0, then 1300) now gives **0 after 1 read**. A Proxy whose `get` answers 0 then 1300 also gives 0 after 1 read.
  * A function, an array, a bigint and `null` are refused as before. A `ratePpm` inherited from a prototype with a table rate passes. That is harmless, because it is a real table rate, and it passed before the fix too.
  * The fail test (`:142-144`) fails without the fix (B1, B2).
* **Minor C (`canada-gst-hst.ts:16`, `:97`): fixed.** `readOn` must now fall between the page's "Date modified" (`PAGE_MODIFIED`, 2025-04-01) and today, both days included.
  * 2099-01-01, 1900-01-01 and 2025-03-31 are refused. `isDay` runs first, so the string comparison only ever sees a real YYYY-MM-DD.
  * The fail test (`:67-68`) fails without either half (C1-C3).
  * The break-m3 case (`:99-100`) changed honestly. "As of 2025-04-01" now asserts only that no start-date problem appears, because a read on 22 Nov 2026 is correctly refused as of 2025-04-01. It also gained `tableProblems(T).length === 0`, which asserts that the real table loads as of today.
* **`9baa5e30` (`routes.ts:22-33`): no behaviour change.** The diff renames `q.partyKind` to `kind`, `q.partyId` to `rawId`, `partyId` to `id` and `party` to `found`.
  * The `where` filters (`firmScope(ctx.firmId, { id })`), the 404 text and the answer's keys (`partyKind`, `partyId: found.id`) are the same as before.
  * All 23 cases that run with the app (setup, DW2, DW3, DW4, DW5, DW6, DW7, DW12 stored, keys, inputs and read only) pass, and they catch a real swap (R2).

### Breaker pass on this diff (money)
* **Boot and the clock.** The load check now needs the host's UTC date to be on or after `READ_ON`, which is today, 2026-11-22. Round 2's observation said 2025-04-01; it is now 2026-11-22.
  * A host whose clock runs behind by a day refuses to boot. That fails closed. It also cannot happen on a correct clock from now on, because UTC is used regardless of the host's time zone.
  * The next re-read of the CRA page must set `READ_ON` to the actual read day, never a day ahead. Otherwise the app stops booting until that day comes (C5 and C6 show the refusal).
* **The check depends on the clock in two places.** `tableProblems(T)` at `:100` and the 2099 plant at `:67` use the real date. The first is the point of the case. The second only goes stale in 2099.
* **Basis points and uncited values:** nothing in this diff touches them. Round 2's result stands: a basis-point value cannot get past the load check, and DW10 stays the guard against a consistent but uncited value.

### Journey score
The route is unchanged in behaviour. `9baa5e30` renames locals only, the 23 cases that run with the app (API in the loop) pass at `9baa5e30`, and the R2 plant shows they bite. I did not re-walk with curl. **Journey score: 9/10 (carried from round 1; nothing on the journey changed). Pass.**

### Blocker
None.

### Major
None.

### Minor
None.

### Nits (optional; not blocking)
1. **The lower bound of the read-date check is untested on its exact day** (`canada-gst-hst.ts:97`, test `tests/check_fo7g_tax_defaults.ts:67`). Changing `<` to `<=` survives (C4). That would refuse a read made on the page's own "Date modified" day. A pass case with `readOn: "2025-04-01"` beside `:67` would close it.
2. **The answer's `partyId` is not checked against the canonical id** (`routes.ts:33`, test `:236`). Answering `rawId` instead of `found.id` survives (R1): an upper-case request would echo the upper-case id. This gap existed before this diff, but the rename now puts `rawId` and `found.id` side by side, so a swap is an easy typo. Asserting `partyId === PA` in the upper-case case at `:236` would close it.

### What I could not check
* The CRA page at source (blocked here, same as rounds 1 and 2).
* The full `typecheck.mjs` and a full run of `check_csw3_firm_scope.ts` at `9baa5e30`. I ran its census case, and tsc on the changed files, as described above.
* The PR body: round-1 minors 3-4 stay open until the PR exists.

**Verdict: Approve** (9baa5e30: no open Blocker or Major). Minors A, B and C are fixed correctly, and each fail test fails without its fix. The read-date bound passes on today's real table at load and does not stop the app booting. `lineRatePpm` still accepts every `taxDefault` answer (136/136). `9baa5e30` changes no behaviour and takes `client-money` off CS-W3's census. Nothing left to fix. These are optional:
* Nit 1: `canada-gst-hst.ts:97`: no case on the exact `PAGE_MODIFIED` day (test `tests/check_fo7g_tax_defaults.ts:67`).
* Nit 2: `routes.ts:33`: the answer's `partyId` is not asserted (test `tests/check_fo7g_tax_defaults.ts:236`).
* Round-1 minors 3-4 (PR body) stay open until the PR exists.

Reviewer: Approve 9baa5e3012febf1e6ae2d4c08c127c1f2980a991
