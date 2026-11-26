# Review: FO-7s3b part 1a (R1.58): Money › Trust (shortfall list) and a client's Money view (summary, trust held, ledger)

Independent reviewer (Opus 5.5, did not build it), 26 Nov 2026. Commit reviewed: **`a66e6a13a12487ac0e8db6fe283ed92a44cf7ec1`** on `claude/vigilant-wozniak-5twm2p`, PR #3805, diff `origin/main...a66e6a13a` under `prototype/studio` (screens only; no `api/`, `ports/` or `prisma/`). I judged it against `concept-trust.md` (e), `concept-invoices.md` (a), `concept.md` BR-1, BR-3, BR-4 and C5, and brief `design/briefs/FO-7s3b.md`, part 1 as the PR body narrows it: Pay from trust, Refund and `/money/cases/:id` move to part 1b, To move to part 2. Isolated copy `rv3b` on :4761 (never :4400), `AI_LIVE=off PLATFORM_IDENTITY=local`, US$0. Journey report: `journey-test-reviewer-fo7s3b-p1-2026-11-26.md`.

## Verdict: Block (in screen-review's terms, Ship after fixes). 1 Major (Must), 9 Minor (Should). Journey score 8/10 (pass)
**Suites on my copy:** `check_fo7s3b_ledger_browser.ts 4761 xr_studio_rv3b` passed **21/21 twice**, on a fresh database and then on the same database (13 s each). The screenshots the runs rewrote were restored with `git checkout`, and the copy is stopped.

## Concept fit and business rules
* **Menu (a): met.** Trust shows only while the shortfall probe answers 200 (`area.tsx:18`). With trust Unanswered (suite DW8) and in the solo firm with no answer (my J4), the menu reads Invoices · Payments only. With trust on, it reads Invoices · Payments · Trust, and the item is reachable by keyboard.
* **BR-1: met.** With trust off, `/money/trust` reads only "Not available · This page is not available for your firm.", and the Money view has no trust row, section or word (suite DW8; my J4).
* **BR-3: met on every state the suite draws.** Money › Trust shows "−CAD 200.00" in red, labelled "Trust shortfall after a reversal", with the concept's words and "Unconfirmed: no counsel". The summary's Trust held, the notice and the ledger balance are all red and labelled.
  * **Not met when a client holds money in two places in one currency and one of them is below zero:** see M1.
* **BR-4: met.** The summary has one column per currency. "Trust held" is one line per currency. Client B shows CAD 1,130.00 and USD 50.00 apart, and "1,180.00" appears nowhere.
* **C5: met.**
  * Every bad address gives one plain "Client not found" with no figure: an unknown kind, `not-a-uuid`, an unknown UUID, another firm's person, a person asked for as `company`, and an upper-case kind (my J3).
  * The suite's DW9: a Billing person who cannot see Client H gets the same page.
  * With sees-all off, the shortfall API gives the Case Officer 0 rows and the Billing person only their own 2.
* **(e) as built:**
  * Summary: Billed, Paid, Paid from trust (trust only), Credited, Written off, Refunded, Owed, Oldest overdue, Trust held (trust only), Credit, and Unbilled as "Not tracked yet".
  * Trust held: "CAD 1,300.00 (2 cases, CAD 150.00 before a case)" form.
  * Ledger: Date · Entry · Reference · Payer · Amount · Balance, newest first, with the server's running balance and Show more (60 entries: 50, then 60 in 80 ms).
  * Gaps the PR names: the invoice link, "Correction — Returned" and G15.
  * Part 1b items (actions, `/money/cases/:id`) are not counted.
* **Code:**
  * Reads only. Figures are parsed with zod at the edge, and a party view makes 2 requests, none per row.
  * The server holds every key: `agent/invoice:show` on the shortfall, ledger and summary routes, and `agent/invoice:list` on the party search.
  * Spot-check that each rule's test fails when the rule is removed. The DW8, DW7, DW3 and DW9 pass lines would fail without `TrustOnly`, `Short`, `heldWords` or the 404 branch. The "fail" lines only test the scanner on a planted string (m8).
* **Graph (P-86):** `graph.mjs` lists the summary, shortfall and ledger routes as G3 ("no page uses it"). It does not parse PF-1 module routes: no `/money/*` page is among its 29 pages, including FO-7s1's. The suite reaches all three routes in a real browser, so this is not counted against the PR.

## D1-D20
* D1 Requirement fit, 3: (a) and (e) are built for part 1a, with BR-3 broken in one state (M1).
* D2 Data integrity, 4: every figure is the server's, but the browser adds up "Trust held" again (m1). D3 Reuse, 4: the shared `money()` and team controls, but a second date format (m4). D4 N/A.
* D5 Stability, 4: reload and Back hold; focus is lost after Show more (m5). D6 N/A (no writes). D7 N/A (no AI).
* D8 Orientation, 3: the path is "Money › Client" and the tab says "Client", with no client name and no active menu item (m3). D9 Flow, 4: Trust, then a shortfall row, then the client, in 2 clicks.
* D10 Language, 4: see m2. D11 Feedback, 4: skeletons, empty states for the list and the ledger, not found.
* D12 Visual, 4. D13 Access, 4: axe 0 at 1440; no sideways scroll at 375, 1024 and 200 %; m5, m6. D14 Team look, 4.
* D15 Speed, 5: the trust page in 100 ms, the Money view in 139 ms, Show more in 80 ms, the menu probe in 458 ms.
* D16 Testability, 3: 21/21 twice, but m8. D17 simulated only. D18 Provenance, 4: the server's figures, and every legal reading marked. D19 not yet evidenced (parts 1b and 2). D20 simulated only.

## BIC scorecard (EXPERIENCE §6, concept §4c)
| Check | Score | Evidence |
|---|---|---|
| BIC-01 Ask once | N/A | read-only pages |
| BIC-02 Asked for a reason | Met | no trust row, section or menu item while trust does not show (suite DW8, `j4-trust-off-1440`) |
| BIC-03 No stale answers | N/A | no dependent answers |
| BIC-04 Incomplete is normal | N/A | the only input is the finder: "Type at least 2 letters of the name." |
| BIC-05 to BIC-10 | N/A | no AI, documents, applications, roles or task list |
| BIC-11 One primary | Met | no filled button on either page; Show more is outlined |
| BIC-12 Check before it leaves | N/A | the issue dialog belongs to part 1b |
| BIC-13 Errors in place | Met | the finder and the Money view show the API's words on their own section (`home.tsx:28`, `party.tsx:71`) |
| BIC-14 Tooltips | Not met | no figure has one; "Refunded CAD 0.00" sits above a ledger row reading "Refunded to client CAD 200.00 out" (`j1-party-R-1440`; m2) |
| BIC-15 to BIC-17 | N/A | no filing or review |
| BIC-18 States | Met | skeletons, "No client is below zero…", "No trust entries for this client yet.", not found, not available |
| BIC-19 Low load | Met | one heading per section, red only for shortfalls (`j1-trust-1440`, `j5-party-R-1024`) |
| BIC-20 Accessible | Partly | the keyboard path is in the suite, and no sideways scroll at 1024 or 200 %; focus drops to the page after the last Show more (m5) |
Screen laws (§7), scored at 1440, 1024 and 375 (I took no 1280 shot): UXL-01 to UXL-08 met. UXL-10 is Partly: at 375 px the ledger's Balance column sits off-screen inside the table's own scroll, with no cue (m6).

## Issues, ranked
* **M1 (Must, BR-3 / DW7): a bare negative trust figure.** `contract.ts:74-75` (`heldWords`) prints the before-a-case part with no sign handling, and `party.tsx:78` builds the line whenever the currency's total is 0 or more.
  * Reproduced on my copy with the real routes. A client has CAD 500.00 on a case (C-2026-00002). The same client's pre-case cheque of CAD 200.00 is refunded and then reversed as Returned. The page then reads **"Trust held: CAD 300.00 (1 case, −CAD 200.00 before a case)"** in plain text, neither red nor labelled, and shows no shortfall notice (`edge-precase-negative-1440`).
  * Mirror case: a case at −200 inside a positive total is counted as one more "case", and no figure shows it at all.
  * **Fix:** take the total from the summary's own `trustMinor`. Show each negative part red with "Trust shortfall after a reversal", or leave it out of the brackets and show the shortfall notice for it. Then add this state to DW7 (the case route exists: POST `/runtime/cases`, as j_58 uses it).
* **m1 (Should, STANDARDS §7: no logic duplicated between web and API):** `contract.ts:74` adds up the cases' trust again in the browser, while the summary's `totals[].trustMinor` already carries the figure. Use the server's figure.
* **m2 (Should, BIC-14, EXPERIENCE §2.10):** add tooltips to the summary rows that need context: Refunded (refunds of invoice payments, not trust), Credit, Oldest overdue and Paid from trust (concept §4c).
* **m3 (Should, D8):** `party.tsx:110` names the crumb and the tab "Client". Two client views open side by side read the same. Name the client in the crumb, and mark Trust as the active menu item.
* **m4 (Should):** `party.tsx:30` adds a second date format ("Nov 26, 2026") on a UTC day, while the Money area uses `day()` ("26 Nov 2026", `invoices/contract.ts:59`). An evening entry in Canada shows the next day.
* **m5 (Should, keyboard):** when the last Show more removes its button (`party.tsx:61`), focus falls to the page's start. Move focus to the first new row.
* **m6 (Should, UXL-10):** at 375 px the ledger's Balance (the red figure) is reachable only by scrolling the table sideways, with no cue (builder's `fo7s3b-party-shortfall-375`). Keep Balance visible and hide Date, or show the scroll cue.
* **m7 (Should):** the finder sends one request per keystroke (5 while typing 6 letters, `home.tsx:20-21`). Debounce it.
* **m8 (Should, D16):** the "fail" lines (DW8, DW7, DW3) assert on planted strings, not on a page with the rule broken. The finder, Show more, C5 on the shortfall list and M1's mixed state have no test line.
* **m9 (Should, PR body):** list the contract gaps that are still open. G8 (payer per entry): the ledger's `payer` is the party's own name for every row (`trust/reads.ts:69`). A refund's reference shows "—", because the ledger read does not join `refund_reference` (`trust/reads.ts:63`, AG-6-60 r8).

## Could not check
* A real screen reader, a headed browser (headless in the cloud), and an intended user's walk (D17 and D20 stay with the founder).
* Trust "No with money held". Nothing on the screen decides it: the server's 404 does.
* Outside this PR, for the Lead: FO-7v's shortfall list is per party, so M1's client is on no list even though one part of its money is below zero. Concept (h) lists shortfalls per case. This is FO-7v's question, not this PR's.

Reviewer: Block a66e6a13a12487ac0e8db6fe283ed92a44cf7ec1

Verdict: Block on a66e6a13a12487ac0e8db6fe283ed92a44cf7ec1. Blockers: none. Majors: M1 (`contract.ts:74-75`, `party.tsx:78`). Minors: m1-m9.
