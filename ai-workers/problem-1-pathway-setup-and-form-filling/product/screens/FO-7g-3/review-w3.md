Verdict: Approve 267f25dfa54d7d43c8e19d7945d222116de64236

# FO-7g part 3, j_56 W3 (PR #3190): the tax default for one invoice reads its Bill-to

Reviewer (Opus 5.5; I did not build it), 23 Nov. Diff `git diff origin/main...267f25dfa5` (base `8f487df4be`): 7 files,
`tax/routes.ts`, `tax/defaults.ts`, the MODULE row, `check_fo7g3_bill_to.ts` (B8), `check_fo7g_tax_defaults.ts` (2 pure
cases), `journeys/j_56.ts` (W3) and one J-56 screenshot. **Verdict: Approve (Ship).** No Blocker, no Major; Minors below.
Row: BACKLOG "FO-7g part 3"; decision P-797 (CRA GST/HST Memorandum 3-3-6 para 20, Example 6; Unconfirmed: no accountant).
While I reviewed, the branch gained `9529477ba4` (the breaker's `break-report-w3.md` only, no code). This verdict is for
`267f25dfa5`; the code at both heads is the same.

## Runs (Postgres 127.0.0.1:54329; never :4400; US$0, live AI off)
| Run | Result |
|---|---|
| `check_fo7g3_bill_to.ts` at 267f25dfa5 | **28/0** |
| `check_fo7g_tax_defaults.ts` | **78/0** |
| `node product/tools/typecheck.mjs` | PASS, no new type errors (15 known, 0 fixed) |
| `j_56.ts` on an isolated copy `j56rv`, runtime port **:4436** (stopped, database dropped afterwards) | 15/18. **W3 and W3 fail pass**; W4 stores `FEE:150000:140000:21000` (NS 14 % from the Bill-to). W1 (retainerId) and the two W9 steps fail, and their labels name parts not merged yet (P-606) |
| Mutant M1 (scratch worktree): the route ignores the stored Bill-to | 27/1: B8 pass fails |
| M2: the invoice lookup drops the party filter (`personId`/`companyId`) | 27/1: B8 walls fails |
| M3: no "equal to the firm's province" rule | 27/1: B8 fallback fails |
| M5: a missing invoice answers the firm's default instead of 404 | 27/1: B8 walls fails |
| M4: pure `taxDefault` ignores `partyProvince` | 76/2: both new pure cases fail |
| My probe (a copy of the check on its own scratch database, then dropped) | 7/7: a COMPANY invoice with Bill-to QC gives QC, PARTY_PROVINCE; a person's invoice asked as a company, and the reverse, gives 404; an upper-case invoiceId reads the same; an empty invoiceId gives 422; the read writes no audit line; firm province unset with Bill-to NB gives NB, the same rate addLine stores; after the firm moves ON → QC, a draft that stored ON gives ON (the rate addLine stores) but **source PARTY_PROVINCE** (m1) |
Each new rule has a test that fails when the rule is removed.

## Correctness (money path)
* **Rate:** only `taxDefault` over `PROVINCE_TAX_RATES`. `partyProvince` goes through `provinceCode` (two ASCII letters, one
  of the 13) and `Object.hasOwn(table, …)`. A non-code falls back to the firm's province and is never guessed (pure "fail"
  case: "Nova Scotia", ZZ, empty, 13, null, `["NS"]`). Rule 5 comes first: not registered gives 0 and NONE (B8 fail).
* **Same as the line:** for every case (Bill-to differs, equals, null, firm province unset or not a code), the route's
  `ratePpm` equals what `addLine` stores (`drafts.ts:104`: stored Bill-to first, then the firm's). Probe and breaker agree.
* **Walls (404 sameness):** the party is looked up in the firm first. The invoice is then looked up with `firmScope` **and**
  `personId`/`companyId = found.id`. Another client's invoice, firm B's invoice and a random id all give the same detail,
  "No such invoice for this client in your firm." (B8 asserts equal `detail`; M2 and M5 prove it). Firm B asking with
  firm A's party stops at the party 404, so firm A's invoice ids are never probed.
* **Inputs (422):** `strict` schema; `invoiceId: z.guid().optional()`. Malformed, repeated and empty values give 422
  with no rate (B8 inputs, probe). The breaker covered `__proto__`/array smuggling.
* **Read only:** one RepeatableRead transaction, no write, no audit line (probe: the `audit_event` count is unchanged).
* **Authorisation:** unchanged. The existing tax-default key; no session gives 401 (j_56 W8).

## j_56 W3 alignment: honest
Before: PATCH the person's address to NS, PATCH the invoice `{billToProvince}`, then the default **for the party**,
expecting PARTY_PROVINCE. Neither PATCH exists. After: `PUT …/invoices/:id/bill-to {province:"NS"}` must give 200 with
`billToProvince` NS, and the default **for that invoice** must give 14 % with source PARTY_PROVINCE. A new fail step adds
ZZ, which must give 422 and leave the database at NS. W4 then proves the line stores 14 %.
This is stronger on what exists: the old step did not check the save status, the new one does.
What is no longer walked is the address-driven Bill-to. The row defers it ("Until a row gives a person or company an
address, the default is the firm's province"), and the header comment says so. Not a weakening of this row (see m4).

## Issues
* **m1 (Minor):** the stored Bill-to does not say whether it was copied from the firm or chosen, so `source` can mislabel.
  (a) The firm moves province after a draft is created: the old fallback copy answers PARTY_PROVINCE (probe; breaker m1).
  (b) Staff explicitly bill an Ontario client of an Ontario firm: the answer is FIRM_PROVINCE (`routes.ts:10`, `:44`).
  The rate is right in both cases, and no screen reads `source` yet (`grep tax-default web/src`: none).
  Fix (before a screen shows `source`): record that the Bill-to was chosen (a flag, or the audit line
  `invoice.bill_to_changed`), or compare against the province the draft was created with.
* **m2 (Minor, stale comment):** `tax/routes.ts:5-6` still says the request carries "no province" and the answer comes
  "only from the firm's stored province". Lines 7-10 contradict it. Fix: reword lines 5-6 to name the Bill-to read.
* **m3 (Minor, test strength):** B8 covers PERSON only, and has no upper-case invoiceId case. My probe shows both work.
  Fix: add one COMPANY invoice case and one cross-kind 404 case to B8.
* **m4 (Minor, records):** R1.56 "adds the client's province's tax" is now proven through a staff-set Bill-to only. When
  the address row lands, its PR should restore the address → Bill-to step in j_56 W3.
* **n1 (Nit):** the check's header lists B1-B6 and B8 but not B7 (in the body since round 3). The committed
  `J-56/screenshots/w9-money-invoices-1440.png` shows W9's "Page not found". It is the failing step's evidence (parts
  not merged), not this row's output.

## Not checked
* No screen in this item, so no keyboard, 1024 px, 200 % zoom or BIC-01 to BIC-20 checks: all N/A.
* Timings against STANDARDS §9 were not measured; responses were immediate in the run.
* The graph (`graph.mjs`) was not run: it rewrites `qa/GRAPH.md`, which is outside my write scope.
* D17 and D20 stay with the founder.
* Journey score: **8/10, pass** (`journey-test-reviewer-2026-11-23-w3.md`).

Reviewer: Approve 267f25dfa54d7d43c8e19d7945d222116de64236

## Round 2 (diff-only)

Reviewer and breaker (Opus 5.5, fresh; I did not build it), 23 Nov. Scope: `git diff 267f25dfa5..f3a72087c1 -- ':!*.md'`
(`tax/routes.ts` header and 9 lines of B8 in `check_fo7g3_bill_to.ts`). Postgres 127.0.0.1:54329; never :4400; US$0.

| Run | Result |
|---|---|
| `check_fo7g3_bill_to.ts` at f3a72087c1 | **30/0** (28 before + 2 new) |
| Mutant MA (scratch worktree): the invoice lookup drops `companyId: found.id` only | 29/1: the new B8 fail (kind mismatch) catches it; the person-only walls did not cover it |
| Mutant ME: a COMPANY invoice ignores its stored Bill-to | 29/1: the new B8 pass catches it |
| Mutant MD: no `toLowerCase()` on `invoiceId` | 30/0: survives, as expected; `money_invoice.id` is a `UUID` column, so Postgres matches either case. The upper-case case pins the behaviour, not that line (n2) |
Worktree removed; no `xr_studio_fo7g3_scratch*` database left.

* **m2 closed.** The header now says the answer comes only from stored facts, and with `invoiceId` that invoice's stored
  Bill-to. That matches `forParty`: no rate or province is read from the request, and the Bill-to is the stored one.
* **m3 closed.** The company case is real: the fo_company row is in firm A, the draft is created through the route (201
  asserted), and the firm is in ON, so NB with source PARTY_PROVINCE can only come from the stored Bill-to. `personInvAsCo`
  is the true cross-kind wall (MA). `coAsPerson` stops at the party 404, which is also right.
* **n2 (Nit):** the label "the same 404" on the kind-mismatch case checks the status only. The two details differ ("No
  such person…" and "No such invoice…"). Either compare `personInvAsCo.body.detail` with the walls' detail or say "a 404".
  The `toLowerCase()` on `invoiceId` is redundant with the UUID column; it is harmless.
* m1 and m4 stay open as Minors (unchanged by this diff); n1 too.

No Blocker, no Major. Journey score unchanged: **8/10** (round 1; this diff touches no journey step).

Verdict: Approve f3a72087c179df337dbe5b0383cc56a7acb306a5
