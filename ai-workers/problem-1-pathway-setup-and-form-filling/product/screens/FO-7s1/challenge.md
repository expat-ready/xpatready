# FO-7s1 (R1.56 invoices screens): Question for the tech lead (screens lane, 22 Nov)

Started by Lead 4 (A286, 14:4x IST 22 Nov) on `/next screens FO-7s1`. Stopped before building (skill `next` step 2, "Not ready"; brief `design/briefs/FO-7s1.md`, "Parallel safety": *if a route the concept names is missing on `main`, stop and ask; never add an API line in a screen row*). No code written; nothing to undo.

## What the Done-when needs and what exists (checked on `main` 73c4e4dcd and on #2953's head bb83bcec7)

| Done-when line | Route it needs | On main / #2953 |
|---|---|---|
| list with filters and FO-7b's status words | `GET /api/front-office/money/invoices?status&party&case&issuedFrom&issuedTo&overdue&cursor` (FO-7q, brief part 1's "Ready when") | **missing**: `invoices/routes.ts` on #2953 has only `POST /`, `POST :id/lines`, `GET :id`, `POST :id/issue`, `:id/send`, `:id/payments`, `:id/credit-notes`, the PDFs. No FO-7q PR is open. |
| builder: party search for won people and companies only (AG-6-1 r1) | a money read of won people and companies (concept contract gap (2)) | **missing**. The one find door (`GET /api/platform/find`, PF-30a) returns people and companies with a prospect subtitle ("Won P-…"), needs `agent/prospect:show`, and caps at 8; filtering its words in the screen would make the screen the only wall. FO-7b's draft route does not refuse a non-won person either (`drafts.ts` create checks only that the person exists in the firm). |
| draft with an editable **Bill-to province** and its tax (P-797) | a draft field for the bill-to province, and `tax-default` reading it (source `PARTY_PROVINCE`, fallback the firm's province) | **missing**: `DraftIn` takes `personId`, `companyId`, `currency` only; `tax/defaults.ts` says the party's province is FO-7g part 3's ("no person or company has an address on main"). The draft line route still takes `ratePpm` from the request. |
| issue | `POST :id/issue` | on #2953 (queued) |

Building the province on the screen alone (a web copy of the cited rate table, the rate sent as `ratePpm`) would make the browser the tax authority and store no bill-to province: a silent deviation from P-797, so not done.

## Question for the tech lead (recommendation first)
1. **Recommended:** add three API pieces before this screen, in the FO-7g part 1w lane (it already touches `client-money/invoices/`) or as an FO-7q part:
   (a) `GET …/money/invoices` list with the filters above, keyset paging 50, `statusWord`, per-currency figures, no sums across currencies;
   (b) `GET …/money/parties?q=` won people and companies only (plus FO-7b's create refusing a non-won party with 409), answering each party's Canadian province when one is on file;
   (c) `billToProvince` on the draft (set at create from the party's Canadian address, else null; `PATCH …/invoices/:id` while a draft), and `tax-default` / the line route computing the rate from it, falling back to the firm's province (P-797; CRA GST/HST Memorandum 3-3-6), the request never carrying a rate.
   Then FO-7s1 builds list + builder (bill-to province select, tax per line, government line without tax) + issue on them, `tests/check_fo7s1_screens.ts` at 400/1024/1440.
2. Alternative: start FO-7s1 now with the parts that have routes (module seam, invoice detail from `GET :id`, the issue dialog) and leave list, party search and bill-to province to a second part. It does not meet this lane's Done-when (list filters, bill-to province), so not recommended.

Duplicate check: searched BACKLOG*.md, open PRs (FO-7s1, FO-7q, FO-7g, "party search", "bill-to province"), `main`'s `web/src/modules/` (no client-money module) and `api/src/client-money/`; none for FO-7s1.
