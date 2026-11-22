# Break report: FO-7g part 1 (R1.56): tax default by province from a cited table

Breaker, 22 Nov 2026. Branch `claude/sharp-tesla-7vrduw` at `84a3e1ab2c34ec290b950539969ae79784917beb`. Scope: the brief `design/briefs/track-b/FO-7g-1.md` over `build-lead-c-briefs/FO-7g.md` (its breaker list). The draft-step calls in `invoices/` are part 1w, so they are not findings here. The line-level items were run against `lineRatePpm` directly.
How it was run: throwaway scripts outside the repo, each on its own scratch database (`xr_brk_fo7g_*`, every migration, dropped afterwards). Each built a Nest app of PF-4's guard, PF-12's walls, FO-7b's invoice routes and this feature on a random port, signed in through the local stand-in. Nothing touched :4400. No network, US$0. The row's own check, copied with the Linux `psql` path: **52 passed, 0 failed**.

## Findings

### m1 (Minor): `lineRatePpm` returns any `ratePpm` it is handed, including basis points
* Reproduction (pure): `lineRatePpm({kind:"FEE"}, {ratePpm:1300})` → `1300`; `{ratePpm:99}` → `99`; `{ratePpm:-130000}` → `-130000`; `{ratePpm:"130000"}` → `"130000"`; `{ratePpm:NaN}` → `NaN`; `{}` → `undefined`. `lineRatePpm(null, on)` throws a `TypeError`, not `TaxRuleRefused`.
* Expected: the doc says "No other number can come out: the function takes no rate". So the result is 0 or one of the table's rates, and anything else is refused.
* Actual: the second argument is a rate, and nothing checks it. `taxForLine` stops NaN, negatives and values over 1,000,000 later. It does not stop 1300 or 99.
* Why only Minor: nothing calls it yet. The government-fee rule itself held against every input shape (below). Part 1w must pass `taxDefault(...)`'s own result, never a value from a request. Today FO-7b's line route still takes `ratePpm` from the body: a FEE line sent with 1300 was stored as `1300` (`invoices/drafts.ts:76`). That is part 1w's job, noted so it is not lost.
* File: `api/src/client-money/tax/defaults.ts:55-56`, `:63`.

### m2 (Minor): the load-time check does not tie a code to its province, and takes a basis-point quote
* Reproduction: a copy of `canada-gst-hst.ts` with `ON: cited("Alberta", "GST", 50000, "Alberta | 5% | 0%")` **loads**: `tableProblems` gives `[]`. So does `ON: cited("Ontario", "HST", 1300, "Ontario | 0.13% | N/A")`, which is 13 % typed as basis points, with the quote edited to match.
* Expected: the comment at line 92 ("the quote is not this province's row") reads as "the entry under ON is Ontario's row".
* Actual: the quote is compared with the entry's own free-text `province`, never with the code. The quote's percentage is not checked against the page. DW10 in `tests/check_fo7g_tax_defaults.ts:67-71` catches both plants, so CI fails, but the fail-closed check at module load does not.
* File: `api/src/client-money/tax/canada-gst-hst.ts:92`, `:61`.

### m3 (Minor): a start date in the future is accepted and charged at once
* Reproduction: plant `ON` at 150000 with quote "Ontario | 15% | N/A", `effectiveFrom: "2030-07-01"` and a sentence. `tableProblems` → `[]`, and `taxDefault({firmProvince:"ON", registered:true}, table)` → `ratePpm 150000` today. A `readOn` of `2099-01-01` is also accepted.
* Expected: a rate that has not started yet is refused by the check, or not applied before its date.
* Actual: `effectiveFrom` is stored and never read. Nothing in today's table has a future date, so this only bites the first time a scheduled change is entered.
* File: `api/src/client-money/tax/canada-gst-hst.ts:87`, `:97-99`; `defaults.ts:47`.

## What held
* **Government fee never taxed** (`lineRatePpm`): `taxable: true` → `TaxRuleRefused`. These are all refused: `"true"`, `1`, `null`, lower-case or padded kind, kind as an array or a `String` object. These all give 0: a `ratePpm` field beside the line, kind inherited through the prototype, a JSON `__proto__` key, getters that change kind between reads.
* **Basis points in the table**: a single-value edit (ON 1300, NS 150000, BC 120000) is refused **at load**: a planted file threw at import. `features.ts` has no catch, so the app would not boot. A PST field, a `source.*` extra field, a missing or blank source, URL, quote or read date, an http URL or a look-alike host, a 14th code or a missing code, an array table and a JSON `__proto__` code are all named. The table, its entries and their sources are frozen.
* **Typed rates in the request**: `ratePpm`, `ratePpm[]`, `tax_rates`, `rate`, `province`, `firmProvince`, `registered`, `firmId`, `taxable`, `__proto__` (plain and %-encoded), `constructor`, `hasOwnProperty` and `toString` → 422 naming the field. `partyId[]`, repeated `partyId` or `partyKind`, a mis-cased key, a 10 KB extra parameter, a 5000-character id, a braced or dash-less id, NUL, a leading space or a non-ASCII kind → 422. Never a 500, never a rate. A JSON body on GET changes nothing. POST, PUT, PATCH and DELETE → 404. `tax_rates` is gone from the schema.
* **Walls**: firm B asking for A's person (also upper-case) or A's company → 404. So do a company id asked as PERSON, firm B's own firm id, A's firm id, a staff id, the nil uuid and the all-f uuid. Every one is the same 404 with no rate.
* **Province values** (live route): no address; a JSON null, number, list or text address; Cyrillic `ОN`; full-width `ＯＮ`; "Ontario"; `__proto__` or `constructor` wrappers; `province_state` set to `__proto__`, `toString`, `true`, `null`, an object or 100 000 characters; a camel-case key → 200, `NONE`, 0 and the ruling's warning. Lower case, spaces, NBSP, BOM and a trailing newline around a real code read as that code. That leniency is safe, because the only writer (`platform/billing/account.ts:27`) stores the strict 13-code enum.
* **Registration**: no settings row, `tax_registered` false with a tax number, or not registered with no address → 0 with no warning. `true` without a number is refused by FO-7ts's CHECK. `"true"`, `1` and `new Boolean(true)` are not registered.
* **Sessions and keys**: no session, a garbage or tampered token, or a cookie with no bearer → 401. READ_ONLY (old or new token) → 403 `MISSING_PERMISSION`. A deactivated staff member's old token → 401 `STAFF_NOT_ACTIVE`.
* **Freeze after issue** (FO-7a, run as the table owner): un-issue, delete, SQL insert, a kind change or a rate change on the issued line, and deleting the invoice are all refused by the trigger. The route answers 409. The stored line is unchanged after the table and the firm's province were changed.
* **Budget**: 400 sequential calls in 4.4 s (p50 10 ms, p95 16 ms, max 24 ms). 100 concurrent calls in 0.8 s, all 200. Read only: nothing was written apart from sign-in audit lines.
* Not a finding: a seeded address with `country: "US"` and `province_state: "BC"` gets GST, because the route reads `province_state` only, as the brief says. The address writer cannot store a non-Canadian address.

**Verdict: Approve.** No Blocker or Major is open. m1 to m3 are Minor. m1 must be closed by part 1w's caller.
