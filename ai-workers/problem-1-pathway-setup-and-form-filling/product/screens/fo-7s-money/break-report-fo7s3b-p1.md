# Break report: FO-7s3b part 1a (PR #3805, head a66e6a13a)

Breaker, 26 Nov 2026. Isolated copy `br3b` on :4762 (`AI_LIVE=off PLATFORM_IDENTITY=local`), stopped afterwards; never :4400. US$0, no model call. Scope: concept-trust (e) Summary, Trust section, Ledger; concept-invoices (a) the Trust menu item; BR-1, BR-3, BR-4, C5. Pay from trust, Refund, To move, Send statement and `/money/cases/:id` are not built here (part 1b and later), so they are not findings.
Baseline: the PR's own check `check_fo7s3b_ledger_browser.ts` passes 21/21 on this copy.
Seed (API as Owner user-R, as the check does; probe scripts in the copy's var folder, now removed): a client with 1 USD deposit, then 300 CAD deposits, then 1 more USD deposit (302 entries); a USD-only client; a company client below zero; a client named `<img src=x onerror=…><b>Bold</b>`; a 300-character name; a non-English name; a client with a case below zero and money held before a case; a client in the other Sample firm (sample-solo).

## Findings

**M1 (Major): a case below zero is hidden inside "Trust held" (BR-3).**
Steps: client Casey. Deposit CAD 500.00 before a case. Deposit a CAD 200.00 cheque on case C-2026-06169. Refund CAD 200.00 from that case. Reverse the cheque (Returned). The database now holds case −CAD 200.00 and CAD 500.00 before a case, CAD 300.00 in all. Open `/money/parties/person/<Casey>` as the Billing person.
Expected: the case's −CAD 200.00 is shown, red, with "Trust shortfall after a reversal". The concept gives Trust held per case and before a case, and the Owner's item reads "case trust is short".
Actual: the page says "Trust held: CAD 300.00 (1 case, CAD 500.00 before a case)". That counts the short case as a case holding money and shows no figure, no red and no label. There is no shortfall notice, because the notice checks only the currency total. No ledger row is red, because the running balance covers the whole party (700 → 500 → 300). The client is also missing from Money › Trust, whose list works per party.
The API's answer has the figure (`cases[]`: `{caseId: b750…, trustMinor: -20000}`), so the screen throws it away.
Code: `trust/contract.ts:72-76` (`heldWords` adds negative case rows into the total and counts them in "n cases"); `trust/party.tsx:78-79` (`held` and `short` look only at `totals`).

**M2 (Major): the ledger is not newest first once a client has two currencies.**
Steps: client Ledger. 1 USD 10.00 deposit, then 300 CAD 1.00 deposits, then USD 20.00 (the newest entry of all). Open the client's Money view and press "Show more" until it is gone (6 presses).
Expected: USD 20.00 at the top. The page promises "newest first" (`party.tsx:4`); the concept asks for a ledger in date order.
Actual: the first row is the last CAD deposit. USD 20.00 is row 300 of 302 and USD 10.00 is row 302. You only see them after 6 "Show more" presses. Each currency on its own is right: 300 distinct CAD balances, falling from CAD 300.00 to CAD 1.00, with no duplicate or missing row (302 = 302). Across currencies the order follows `seq`, and `seq` is counted separately for each party and currency (`prisma/migrations/20261118210000_fo7lk_trust_lock/migration.sql:151`; FO-7t `api/src/client-money/trust/reads.ts:67` `order by v.seq desc, v.currency`).
The screen shows that order unchanged (`party.tsx:41`). With entries on different days, the Date column visibly jumps around. The fix may belong to FO-7t's read, but the defect shows on this screen.

**m1 (Minor): the finder says a visible client does not exist.**
Steps: Money › Trust. The shortfall list shows "Pine Bakery kjtk" and "ClientR… Sample" (the PR check's own Client R). Type "Pine" in Find a client.
Actual: "No client you can see matches “Pine”." The same happens for "Zoë" and "Ledger": each holds trust money and is visible, but none is found. FO-7q's party search returns only won or case clients (`api/src/client-money/reads/parties.ts:96-104`). Trust money can be held for any visible person before a win (`trust/service.ts:106`). So for these clients the Money view can only be reached from the shortfall list or by typing the address, and the words "you can see" are false.
Code: `trust/home.tsx:21-31`. The PR's check never uses the finder. "Le" found only a won/case client, through "Sample".

**m2 (Minor): keyboard focus is lost on "Show more".**
Steps: Tab to "Show more" and press Enter.
Actual: `document.activeElement` is BODY while the page loads and stays BODY after it (seen on all 6 presses). `busy` disables the button (`components/ui/controls.tsx:37`), so the browser drops focus. The next Tab starts again from the page header.
Code: `trust/party.tsx:61`.

**m3 (Minor): when a later page fails, the rows already loaded disappear.**
Steps: load the 302-entry ledger, then make the 2nd ledger request fail (500, intercepted).
Actual: the 50 loaded rows are replaced by "Could not load the trust ledger" (50 → 0 rows). `q.isError` replaces the whole table.
Code: `trust/party.tsx:39`.

**m4 (Minor): at 375 px, one long name pushes every red figure out of view.**
Steps: a client with a 300-character unbroken name below zero; open Money › Trust at 375 px.
Actual: the page itself does not scroll sideways (0 px), but the Client column grows wide enough that no row's "Trust balance" (the red figure and its label) is visible without scrolling the table sideways. The table region is focusable, so the figures can still be reached.
Code: `trust/home.tsx:63`: the name cell has no `[overflow-wrap:anywhere]`, which the Money view's heading has (`party.tsx:82`). Screenshot taken on the copy (removed with it).

**m5 (Minor): ledger dates are UTC days, not the firm's.**
`trust/party.tsx:30` formats with `timeZone: "UTC"`. An entry made after 19:00 in Toronto (EST) shows the next day's date. Low impact; check this against the convention other money pages use.

## What held
* BR-1: no Trust menu item, "This page is not available for your firm." and no trust word on the Money view, the invoice list or the menu while trust is Unanswered (sample-firm in the check, sample-solo here), or No with nothing held (sample-solo PUT NO → `held: []`; shortfall read 404). No with money held (sample-firm) correctly shows Trust in the menu, the shortfall list and the trust section. Yes put back afterwards.
* BR-3: every party-level negative (Client R −CAD 200.00, Pine Bakery −CAD 50.00, the hostile-name client −CAD 15.00, the long-name client −CAD 25.00) is red with "Trust shortfall after a reversal" on the list, in the summary cell, in the notice and in the ledger balance.
* BR-4: a USD-only client gives one USD column and "Trust held: USD 75.00"; with both currencies (CAD 300.00 / USD 30.00) no figure adds them.
* C5 and addresses: `/money/parties/PERSON/…`, `/Person/…`, `/x/…`, a malformed id, `../../trust/shortfall` encoded, a person id under `company` and a company id under `person`, an unknown UUID, a trailing space, and another firm's client by address all show the plain "Client not found" with no figure. An upper-case id opens the right client.
* Company client `/money/parties/company/<id>`: summary, notice and ledger are correct.
* Hostile and non-English text: the `<img onerror>` / `<b>` name shows as plain text everywhere (no script ran, no element injected). "Zoë… Ñandú-Øster 李" shows correctly. A 101-character search gets the API's words, and 1 letter or spaces trimmed to 1 letter sends no request.
* Switching to another firm's person and reloading gives "Client not found". Signing out on the Money view leads to sign-in, and Back shows no figure.
* Keyboard order on Money › Trust is header, menu, table region, rows, finder. axe finds 0 serious or critical issues on every page probed, including after 6 "Show more" presses. No sideways page scroll at 375, 1024, 1440 px or at 200 % zoom (720 and 512 CSS px).

Breaker: fail on a66e6a13a12487ac0e8db6fe283ed92a44cf7ec1
