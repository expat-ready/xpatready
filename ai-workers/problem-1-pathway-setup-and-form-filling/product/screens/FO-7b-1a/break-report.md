# Break report: FO-7b part 1a (draft invoice lines, tax per line, half to even)

Breaker (money row, P-278/P-303), 20 Nov. Commit `8a243502ffebdb617436004a8b6507e55a218ac0`, branch `claude/gifted-feynman-i60t6w`.
Isolated copy `brk7b` on :4479 (database `xr_studio_brk7b`, `PLATFORM_IDENTITY=local`), stopped at the end. Setup is the Sample setup from `j_59.ts`: `seedSampleFirms` and `seedSampleFirmsFrontOffice`, a `money_payment_settings` row per firm, one `fo_person` and one `fo_company` per firm, and sign-in for user-R (sample-firm), user-S (sample-solo), user-O (Case Officer) and user-T (moved to READ_ONLY by SQL). The only thing I wrote is this file.

## Findings

### Major 1: some line descriptions pass the zod parse, then the database refuses them and the route returns 500
* **Request:** `POST /api/front-office/money/invoices/:id/lines` as user-R, `{ "kind":"FEE", "description": D, "unitMinor":100, "ratePpm":130000 }` on a CAD draft. Each D below on its own gives the same result:
  * `"​"` (zero-width space only)
  * `"Fee \u0085 x"` or `"Fee \u0080"` (C1 controls)
  * `"Fee ‮ gnp.exe"` (bidi override)
  * `"Fee ⁦x⁩"` (bidi isolate)
  * `"́́"` (combining marks only)
  * `"ㅤ"` (Hangul filler)
* **Expected:** 400 at `description`, in words, and nothing saved. The brief says "A 500 is a fail", and every body goes through a zod parse with a 400 at the field.
* **Actual:** `500 {"title":"Server error","detail":"Something went wrong on the server. …"}`. The api.log shows a `DriverAdapterError` from `money_invoice_line_text_check` (`money_text_ok(description, 500)`, migration lines 446-529). Row state: no line row and no audit row were written (the transaction rolled back). So no data is harmed, but a user gets a server error from text they typed or pasted, and the bidi override case is a known spoofing input.
* **Cause:** `ports/client-money.ts` `LineIn.description` refuses only `\u0000-\u001f`, `\u007f`, ` ` and ` `, and JS `trim()` strips only whitespace. The database also refuses `[[:cntrl:]]` (C1 included), `‪-‮` and `⁦-⁩`, and it requires at least one visible letter, number or punctuation mark once invisible and combining characters are removed.
* **Suggested fix:** make the zod rule match `money_text_ok`:
  * refuse `[\u0080-\u009f‪-‮⁦-⁩]`;
  * require `/[\p{L}\p{N}\p{P}]/u` after removing `\p{M}`, `\p{Cf}` and the fillers.
  Or, as a backstop, map SQLSTATE 23514 on `money_invoice_line_text_check` to a 400 at `description`. Add each string above to `check_fo7b_invoices.ts`.

### Minor 1: the 500-character limit counts UTF-16 units, not characters
* **Request:** a description of 300 × "🙂" (300 characters, 600 UTF-16 units).
* **Expected:** accepted. The database's `char_length ≤ 500` holds it.
* **Actual:** `400 "At most 500 characters."`. That message is untrue for text outside the BMP (emoji, some CJK extension characters). Nothing is saved, so the only harm is a false refusal.
* **Fix:** `.refine(s => [...s].length <= 500)` instead of `.max(500)` (`ports/client-money.ts`, `LineIn.description`).

### Minor 2: a draft can grow past what an invoice can hold, with no warning
* **Request:** 500 lines at about 42,950 each, sent in batches of 50 at once. Or a single R8 line: 21,474,836.47 at 15 %, which gives 24,696,061.94 with tax.
* **Actual:** 201 for each line. The read returns `totalMinor` 4,768,334,665 (exact, a safe integer). Issuing such an invoice by SQL is refused: `money_invoice: a total of 4295080365 cents is more than one invoice can hold (21,474,836.47)`. So the draft can never be issued, and the person who built it learns that only at issue time.
* **Note:** R8 in `FO-7b.md` asks for the single huge line to be accepted, so this is by design for part 1a. The arithmetic is right.
* **Suggested fix:** when a line would take `money_invoice_total` past 2,147,483,647, refuse it in words (409 "An invoice can hold at most 21,474,836.47 …") in `drafts.ts` `addLine`. Otherwise part 1b must refuse it in words at issue, never as a 500.

## What held
* **taxForLine** (`api/src/client-money/invoices/tax-round.ts`):
  * 400,000 random cases, checked against Python `Fraction` with half-to-even `round()`: 0 mismatches. The cases were full int32 × full ppm range, small amounts at 5/13/14/15/14.975/9.975 %, 101,215 exact halves, and the int32/1,000,000 corner.
  * It throws on −1, 1.5, NaN, Infinity, 2^53 and rate −1 / 1,000,001 / 0.5.
* **Every stored line** (592 rows) was re-checked in SQL with exact numeric half to even: 0 wrong, and 0 government-fee lines with tax.
* **Half cents through the route:** 0.10 and 0.30 at 5 %, 0.50 and 1.50 at 13 %, 0.25 and 0.75 at 14 %, 0.10, 0.30, 0.70 and 0.90 at 15 % all gave 0, 2, 6, 20, 4, 10, 2, 4, 10 and 14 cents. R8 gave 21,474,836.47 at 15 % → 322,122,547 (exact). 21,474.00 × 100,000 at 999,999 ppm → 2,147,397,853 (exact).
* **Basis points:** 1300 is stored as 1300 ppm (850.00 → 1.10, half to even from 1.105), not corrected. Rate 1,000,000 is accepted.
* **Bad rates and amounts:** each of these gave 400 at the field: rate −1, 1,000,001, 130000.5, "130000", null or true; unitMinor 100.5, −100, 1e300, "100", 9007199254740993 or 1e26; quantity 0, 1.5, 100,001 or null; quantity × unit past the int32 limit.
* **Client-sent figures:** a sent `taxMinor` or `amountMinor` (999999, 5, or `{ "$gt": 1 }`) is ignored and the stored tax is the server's. `firmId`, `totalMinor` and other unknown keys → 400. A `__proto__` key changes nothing (rate stored 0). With duplicate JSON keys, the last one wins.
* **Totals:** `totalMinor` = `money_invoice_total` = Σ(amount + tax) = subtotal + tax on every read. Always integers, and exact past 2^32.
* **Many lines at once:** 60 lines sent at once to one draft gave 60 × 201, positions 1-60 unique and contiguous, and the total equal to the sum. 550 lines sent in batches of 50 gave 500 × 201 and 50 × 409 `TOO_MANY_LINES`, positions 1-500 unique. 20 drafts created at once: all 201.
* **Currency:** USD on a CAD draft and CAD on a USD draft → 400 with the brief's words, nothing saved. Lowercase "cad" → 400. A draft in EUR → 400. A USD draft works.
* **Firm walls:**
  * firm B reading or adding to firm A's invoice → 404;
  * a draft for firm B's person or company, a random uuid, or a person id sent as a company id (and the reverse) → 404;
  * `x-firm-id` and Host headers are ignored (the draft goes to the session's firm);
  * `firmId` in a body → 400.
* **Who can call:**
  * no token or a bad token → 401;
  * READ_ONLY → 403 `MISSING_PERMISSION` on all three routes;
  * a Case Officer can create, add and read, as the PF-3 catalogue grants (`agent/invoice:create` and `:show`).
* **"Prices include tax" on:** create and add-line → 409 in words, nothing saved. Reading is still allowed.
* **An issued invoice** (issued by SQL as the owner) receiving any line, in another currency, or with bad text → 409 `ISSUED`, nothing saved.
* **Ids and bodies:**
  * malformed ids (`abc`, `../x`, `%00`, a 5,000-character id, SQL text, a uuid with "x" appended) → 404, never a 500; an uppercase uuid works;
  * null, string or invalid JSON bodies → 400 `BODY_NOT_JSON`; an array body → 400 at the fields;
  * urlencoded and text/plain bodies → 400; a 20 MB body → 413;
  * PUT, PATCH, DELETE and GET on the list → 404.
* **Text:** Arabic, Hindi, Chinese, French with "—" and "n°", "€", emoji, SQL text and `<script>` are all stored as sent. Exactly 500 characters is accepted and 501 is refused. Tab, U+2028, empty and spaces-only → 400. A lone surrogate is stored as U+FFFD.
* **Audit:** exactly one `invoice.draft_created` or `invoice.line_added` row per successful write (633 = 41 drafts + 592 lines), the actor is `staff:<id>`, and there is no row for a refused write.
* **Performance:** reading a 500-line draft takes 20 ms. 550 line writes take 10.5 s (50 at a time on one locked row).

## Not tested live
* A firm with no payment settings (`PAYMENTS_NOT_SET_UP`). Both seeded firms needed settings for the rest of the run. This was checked by code reading only (`drafts.ts` `settingsOrRefuse`).

Verdict: Changes requested
