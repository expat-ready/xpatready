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

## Re-break of 8f298699c

Scope (P-277): only the diff `8a243502f..8f298699c`:
* `drafts.ts`: `money_text_ok` is asked before the write; adding to another person's draft needs `agent/invoice:edit` through `holdsKey`; GET reads in one REPEATABLE READ transaction.
* `ports/client-money.ts`: the 500-character limit is counted in code points.

Setup: a fresh isolated copy `brk7b` on :4479 at `8f298699c`, the same Sample setup as before (user-T is a Case Manager, with no `:edit`). The copy was stopped at the end.

### Findings (Minor only)

**Minor 3: about 200 or more requests at once on one draft give a 500 (P2028), now on GET as well.**
* **Requests:** one draft, then 200 `POST …/lines` and 200 `GET …/:id`, all sent at once.
* **Results over four runs:**
  * add: 26-47 × 500 per run;
  * GET: 0, 43, 89 and 74 × 500;
  * 300 adds alone: 122 × 500.
* **Cause:** the api.log shows `PrismaClientKnownRequestError P2028`: the interactive transaction did not start within Prisma's default 2 s `maxWait`.
* **Row state:** the lines stored equal the 201 answers, and line rows equal `invoice.line_added` audit rows (2,182 = 2,182). Nothing is lost and nothing is extra.
* **Below that load it held:** 100 adds + 100 GETs, 600 GETs alone, 150 adds alone, and 5 drafts × (20 adds + 20 GETs) gave no 500.
* **Why Minor:** the add path was a transaction already at `8a243502f` (my first run went only to 60 at once). The GET path is new to this commit. This repository already rates this case as a break (`api/src/busy.ts` `busyWords`, "C9.5 (break m7)"; `api/src/runtime.ts:374`, "Prisma's default 2 s and 5 s answered a 500 (P2028)").
* **Fix:** pass `{ maxWait: 10_000, timeout: 15_000 }` to both `$transaction` calls in `drafts.ts`, and wrap them in `busyWords`, so the answer is a worded 503 and never a 500.

**Minor 4: under the same load, two adds sometimes take the same position; the database refuses one of them with a 409 that reads as a duplicate.**
* **Requests:** 300 adds at once, or 200 adds + 200 GETs.
* **Results:** 2 or 3 adds answered `409 "Already exists" … "This already exists, or someone else saved the same thing at the same moment."` (the P2002 mapping in `main.ts:216`).
* **What the database log says** (`pg18-data/server.log`):
  * `duplicate key value violates unique constraint "money_invoice_line_firm_id_invoice_id_position_key"` on the line INSERT;
  * near the same times, `WARNING: there is already a transaction in progress`.
  So when the connection pool is exhausted, the `FOR UPDATE` lock on the invoice row did not always make adds wait their turn.
* **Row state:** positions are still unique and run without gaps (1..n on every draft), because the unique index catches it. Nothing wrong was saved.
* **Fix:** the same as Minor 3 (longer `maxWait` and `busyWords`). Map P2002 on `money_invoice_line_firm_id_invoice_id_position_key` to the 503 "busy, try again" answer. Root cause (a reused connection still inside a transaction) is unconfirmed: it sits in the Prisma adapter or pool layer, not in this row.

### What held at 8f298699c
* **Major 1 fixed.** All seven of my strings get `400` at `description`, nothing written:
  * `​`, `Fee \u0085 x`, `Fee \u0080`, `Fee ‮…`, `Fee ⁦x⁩`, `́́` and `ㅤ`;
  * and also `\u009f`, `‪`, `⁨`, ZWJ, WJ, LRM, ALM, a tag character alone, VS16 alone, Braille blank and a skin-tone modifier alone.
  * 40 adds at once, half of them with a bidi override: 20 × 201 and 20 × 400, no 500.
* **Other text, no 500:**
  * NUL → 400 "no tabs or control characters";
  * a lone high or low surrogate is stored as U+FFFD (201);
  * `Fee ‏` (RLM) is accepted by both rules alike;
  * "💸", "€", "+", Arabic, mixed scripts, SQL text, `$$ ${x}` and backslashes are stored as sent.
* **Minor 1 fixed:**
  * 499 a + 💸 (500 code points) → 201; 501 code points → 400;
  * 500 × 💸 → 201; 501 × 💸 → 400;
  * 250 × "é" written as e + U+0301 (500 code points) → 201; 251 → 400;
  * a 1,000,000-character description → 400.
* **Key rule:**
  * Case Officer on the Owner's draft → 403 `MISSING_PERMISSION` naming `agent/invoice:edit`, 0 lines written. This holds with bad text or a USD line too: 403 comes before 400.
  * Case Officer on their own draft → 201. Owner on the Case Officer's draft → 201.
  * Case Manager (no `:edit`) on the Owner's draft → 403; on their own draft → 201.
  * BILLING_FINANCE granted by SQL during a session → 201 on the same token. The grant ended mid-session → 403 on the next add, own draft still 201. `holdsKey` reads live grants (`ended_at is null`).
  * All roles of the Case Officer ended → 403 on create, add and read.
  * No audit row for any refused add.
* **Read snapshot:** 10 rounds of 20 adds + 40 GETs at once on one draft: 400 GETs, each with `totalMinor` = Σ(amount + tax) of its own lines = subtotal + tax (0 that disagree).

Verdict: Approve 8f298699cb7f80954e9b72c4a7c0732b9437e101
