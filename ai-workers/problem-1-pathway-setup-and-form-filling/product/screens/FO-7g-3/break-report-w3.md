# FO-7g part 3, j_56 W3: break report (tax-default `invoiceId`, PR #3190)

Verdict: Approve 267f25dfa54d7d43c8e19d7945d222116de64236

Scope: `GET /api/front-office/money/tax-default?partyKind=&partyId=&invoiceId=` (`studio/api/src/client-money/tax/routes.ts`)
and `taxDefault({ partyProvince })` (`tax/defaults.ts`), diff `origin/main...267f25dfa5`. Isolated copy `brk_fo7g3` on
:4472 (`PLATFORM_IDENTITY=local`, Postgres 127.0.0.1:54329), seeded like `tests/journeys/j_56.ts`. Firm A in ON, firm B in NB,
both registered. Firm A has clients PA and PA2 and company CA; firm B has client PB. Owner tokens for A and B, plus A's Case
Officer. A scratch script outside the repo made the calls. US$0, no model call, :4400 not touched. The copy was stopped
afterwards and its database removed.

Also run at this head: `tests/check_fo7g3_bill_to.ts` 28/0, `tests/check_fo7g_tax_defaults.ts` 78/0, and `j_56` on :4472
15/18. W3 and W3-fail pass. W1 and W9 fail, and their labels name parts not yet merged (P-606), so they are not findings here.

## Findings

**m1 (Minor): the stored copy of the firm's old province is reported as the client's province (PARTY_PROVINCE).**
A new draft copies the firm's province into `bill_to_province` (`invoices/drafts.ts:71`). The route assumes that a copy always
equals the firm's current province (`tax/routes.ts:44`, `// the fallback copy is the firm's`). Once the firm's province
changes, that assumption fails.
Repro: firm A in QC → `POST /front-office/money/invoices {personId: PA}` (I3 stores `QC`) → firm address set to ON →
`GET tax-default?partyKind=PERSON&partyId=PA&invoiceId=I3` gives `200 50000 GST source PARTY_PROVINCE`.
Nobody set a Bill-to for this client: QC is the firm's old province. The **rate** matches what a line on I3 stores
(`tax_rate_ppm 50000`, `drafts.ts:104`), so no wrong amount comes out. Only the source label is wrong. Nothing in the web app
reads this endpoint yet (`grep tax-default web/src` finds nothing).
The reverse case is documented in the code comment (`routes.ts:10`): staff explicitly set Bill-to ON for an ON firm, and the
answer is `FIRM_PROVINCE`. Same rate, label understated.
The cause is the same in both cases: the row does not record whether the Bill-to was copied or chosen. A fix would add a flag
or compare against the province the draft was created with. This PR gives no wrong rate or amount.

**n1 (Nit): the header comment is partly stale.** `routes.ts:5-6` still says the request carries "no province" and that the
answer comes "only from the firm's stored province". The paragraph added at lines 7-10 contradicts that. Doc only.

## What held (attempt → result)

- Own invoice with Bill-to NS → 200, 140000 ppm, HST, PARTY_PROVINCE. Upper-case `partyId` and `invoiceId` → the same answer.
- Cross-firm and cross-client each gave a 404 with no rate, all with the same text, "No such invoice for this client in your
  firm.":
  - PA2's invoice asked with PA;
  - firm B's invoice asked with A's party;
  - B's token with B's party and A's invoice;
  - a random uuid;
  - the nil uuid.
  None of these reveals whether the invoice exists.
- Kind mismatch:
  - company invoice asked as PERSON PA → the invoice 404;
  - person invoice asked as COMPANY CA → the invoice 404;
  - PERSON with a company id, or COMPANY with a person id → the party 404 (existing text, checked before the invoice).
  - B's token with A's party → "No such person" (existing behaviour; the party is checked first, so firm A's invoice ids are
    never probed).
  - Company invoice asked as COMPANY CA → 200 FIRM_PROVINCE (its Bill-to is the ON copy).
- Malformed values all → 422 at `invoiceId`, no rate:
  - `not-a-id`, empty, `{uuid}`, no hyphens, `urn:uuid:`;
  - space-padded, `%00`-suffixed, 5000 characters, `null`.
  A repeated `invoiceId` → 422 "must be text".
- Prototype-pollution and smuggled keys all → 422, "This field is not allowed here", with nothing read:
  - `invoiceId[]=`, `invoiceId[a]=`;
  - `__proto__=x`, `__proto__[invoiceId]=<B's id>`, `constructor[prototype][invoiceId]=`;
  - smuggled `partyProvince=QC` and `billToProvince=QC`.
- Stored values: `ns`, `ZZ`, ` NS` and `''` written straight to `money_invoice.bill_to_province` are refused by the CHECK.
  `PUT bill-to {province:"ns"}` → 422. An issued invoice's Bill-to UPDATE is refused by `money_invoice_bill_to_frozen`.
- Not registered (`tax_registered=false`) with Bill-to NS → 0, NONE, `registered:false` (rule 5).
- Firm without an address, Bill-to NS → 140000 PARTY_PROVINCE with no warning. Without `invoiceId` → 0, NONE plus the warning.
- Firm province `" on "` with Bill-to ON → FIRM_PROVINCE (normalised, not mislabelled). Firm province `"Ontario"` (not a code)
  with Bill-to ON → PARTY_PROVINCE 130000. That is correct: the firm's own value is unknown.
- A Bill-to that is null (a draft from before the migration) → the firm's ON, FIRM_PROVINCE, the same as a line would get.
- An issued invoice with Bill-to NS → 140000 PARTY_PROVINCE.
- Discarding a draft through `DELETE` is not a route (404). The row stays, and its default is still answered (130000).
- Rates: across every 200 above, `ratePpm` was always 0 or one of the cited `PROVINCE_TAX_RATES` entries. No figure outside
  the table appeared. `taxDefault` reads the table only through `Object.hasOwn` and `provinceCode`'s check of two ASCII
  letters against the 13 codes.
- Roles: no token → 401. A Case Officer (`agent/invoice:create`, the existing key) → 200, as before.
- Consistency: in every case tried, the rate this endpoint gives for an invoice equals the rate `addLine` stores for that
  invoice (`drafts.ts:104`). Both read the stored Bill-to first, and an equal code gives an equal rate.
