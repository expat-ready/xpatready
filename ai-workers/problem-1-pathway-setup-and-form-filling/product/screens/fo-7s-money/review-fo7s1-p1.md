# Review: FO-7s1 part 1 (R1.56): the Money area, the invoice list and the invoice detail

Independent reviewer (Opus 5.5, did not build it), 23 Nov 2026. Head `01dbfa799a3a27fb7693080596153b4511126604`, branch `claude/screens-fo7s1-invoices`, draft PR #3305. Spec read: brief `design/briefs/FO-7s1.md` part 1 and DW1 (detail half), DW3, DW6, DW7, DW9, DW10; BACKLOG row FO-7s1; `concept.md` BR-1, BR-4, BR-6, BR-7, BR-10, BR-11; `concept-invoices.md` (a), (b); `design/contract.html`. Isolated copy `fo7s1rev` on :4752 (never :4400), live AI off, US$0. Journey report: `journey-test-reviewer-fo7s1-p1-2026-11-23.md`.

## Verdict: Ship (no Blocker, no Major). Journey score 8.5/10 (pass)

**Suite:** `check_fo7s1_invoices_browser.ts 4752 xr_studio_fo7s1rev` gave **27/27 twice**. The second run was on a database holding 60+ invoices: it passed with Show more on screen. The copy is stopped, and the screenshots the run rewrote are restored (`git checkout`).

## The Lead's instructions
* **Client-money arithmetic stays in the API: met.** The page adds, subtracts and derives no money figure. Every figure is a FO-7q/FO-7b field shown through one formatter (`contract.ts:50` `money()`). `creditableMinor` is the API's (`reads/invoices.ts:143`). The only number work is `centsOf` (`contract.ts:87`), which turns the typed credit amount into cents; the API re-checks it (over-credit refused: "Only CAD 1,285.00 is left to credit on INV-0001. Nothing was saved."). The history list is sorted by date and nothing is summed.
* **Trust shows counts, never a negative figure (P-607): met in scope.** The only trust figure is "Paid from trust" (`detail.tsx:79`). It appears only when the read answers `trustPaidMinor` (the API answers it only while trust shows) and only when it is above 0. With trust Unanswered, no trust word appears on the list, the detail or the panel (DW9 pass and fail; my walk agrees).
* **The government-fee line takes no tax: met on the detail.** The Tax cell says "Government fees are never taxed" and shows no figure. The total is the API's CAD 1,385.00 (Fee 1,000 + HST 130 + Gov 255). Typing the line is part 2.
* **Keyboard, axe-core, 375/1024/1440: met, with three Should items** (m1-m3). Keyboard path: Tab to an invoice, Enter opens it, Tab to "Use a credit note", Enter opens the panel on its first field, Escape returns focus. axe-core found 0 serious or critical in the suite, and 0 on the whole page at 1440 and at 1024 px with 200 % zoom (512 CSS px, DPR 2). No sideways scroll at 375, 512, 1024 or 1440.

## The known gaps: is the handling acceptable?
* **No party or case names (Bill to "A person" / "A company"; no Case column, party and case filters, or search): acceptable as an interim, waiting on the tech lead's answer.** FO-7q answers ids only, and `contract.html` has no element for names, so this is a contract gap, not a code fault. The builder did not invent names and did not add an API line in a screen row. They asked on the PR with a recommendation (an FO-7q part for `billTo{kind,name}`, `caseLabel` and G2). That is the brief's "stop and ask" rule. The cost is real: at scale every row reads "A person" (list screenshot at 1024, 57 rows), so a person cannot find Client B's invoice except by its number. Journey "task completed" is ½ for this reason. The names must land before FO-7s1 counts as Done.
* **G2 missing, New invoice / builder / issue in PR 2, no credit-note preview (FO-7s4 part 1): acceptable.** Each is out of part 1's scope by the brief's split. The panel makes no preview arithmetic of its own (`credit-note-panel.tsx:3`).

## D1-D20 (independent reviewer; browser/script evidence)
D1 Requirement fit 4: list, detail and actions match concept (a) and (b) and BR-1/4/6/7/10/11; the names, case and search gap is stated · D2 Data integrity 4: a double click gives one credit note; two tabs cancelling at once give one note, and the second tab shows the API's words · D3 Reuse 4: one formatter, team controls, zod parse at the edge · D4 N/A (no dependent questions) · D5 Stability 4: reload, Back keeps `?status=OPEN`, the double-click guard (`credit-note-panel.tsx:23`) · D6 Governance 4: one audit line per credit note (`audit_event`, 2 lines for 2 notes); a History section · D7 N/A (no AI) · D8 Orientation 3: path Money › Invoices › Invoice, but Money cannot be reached from Home and Bill to is not a name · D9 Flow 4: one primary per status; a credit note takes 4 steps · D10 Language 4: plain words; tooltips work on hover only; "This is required." (m4) · D11 Feedback 4: skeleton, toast, balance refreshed from the API, refusals on the panel · D12 Visual 4 · D13 Access 4: see m1-m3 · D14 Team look 4 · D15 Speed 5: list API 15-32 ms, first view 206 ms, one request per page · D16 Testability 4: 27 lines, each with a pass and a fail, re-run by me; paging and full cancel have no test line (m7) · D17 simulated only · D18 Provenance 4 · D19 not yet evidenced (builder and issue are part 2) · D20 simulated only.

## BIC scorecard (EXPERIENCE §6)
| Check | Score | Evidence |
|---|---|---|
| BIC-01 Ask once | N/A | asks for no facts |
| BIC-02 Asked for a reason | Met | no "Received into" or trust field while Unanswered (DW9) |
| BIC-03 | N/A | |
| BIC-04 Incomplete / invalid | Met | an amount that is empty or "abc" is refused at its field: "An amount in CAD, for example 100.00." |
| BIC-05-10 | N/A | no AI, documents, applications, roles or task list |
| BIC-11 One primary | Met | detail-1440: "Use a credit note" filled, PDF outline; panel: "Issue credit note" |
| BIC-12 Check before it leaves | N/A | the credit preview is FO-7s4 part 1 |
| BIC-13 Errors | Partly | an empty reason shows "This is required." at the field and "The reason is needed." at the top (m4) |
| BIC-14 Tooltips | Partly | status chips use `title` on a span that takes no focus (`controls.tsx:140`), so keyboard users never see them (m6) |
| BIC-15-17 | N/A | |
| BIC-18 States | Partly | loading, no-match, refused, not-found and read-only are drawn; the empty state offers no first action (New invoice is PR 2) |
| BIC-19 Cognitive load | Met | one h1, h2 per section; one primary; only document numbers shown |
| BIC-20 Keyboard / zoom | Partly | keyboard path and 200 % work; focus drops to `<body>` after Show more (m2) |

UXL-09 Not met (the primary button is 36 px at 375 px; P-795 asks 44). UXL-10 Partly (m3). The others are met or N/A.

## Issues, ranked (all Should; none Must)
* **m1 (Should, UXL-09/P-795):** at 375 px "Use a credit note" is 36 px tall. Fix: use a 44 px primary below `sm` on the detail (`detail.tsx:68`).
* **m2 (Should, WCAG 2.4.3):** after the last "Show more" the button unmounts and focus falls to `<body>`. Fix: move focus to the first new row's link (`list.tsx:67`).
* **m3 (Should, UXL-10):** at 375 px the lines table clips Tax ("CAD 13…", "Governn…") with no cue that it scrolls, so P-607's "never taxed" words are off-screen. Fix: stack the tax under the amount below `sm`, or show a scroll cue (`detail.tsx:86-93`).
* **m4 (Should, BIC-13):** an empty reason goes to the API and comes back as "This is required." Fix: check it in the panel, as the amount is checked, with words such as "Add a reason, for example Goodwill." (`credit-note-panel.tsx:25`).
* **m5 (Should, D8/D9):** Money has no link from Home ("Release 1 screens") or any menu, so the only way in is typing `/money/invoices`. `release-one-menu.tsx` is outside the touch list. Fix: name a follow-up line in the PR, or ask the tech lead to widen the touch list by one line.
* **m6 (Should, BIC-14):** status-chip tooltips are hover-only. This is team-wide (`Pill`); fix it with the shared tooltip, or list it as a follow-up.
* **m7 (Should, D16):** the suite has no line for Show more (keyset, no duplicates), Cancel the invoice (full → Credited, PDF only), a PDF download that succeeds, or no sideways scroll at 1440. I checked each by hand and each held: 50 + 7 rows, 0 duplicates; Credited with `[DOWNLOAD_PDF]`; `INV-0001.pdf` starts `%PDF-`.
* **m8 (nit):** a draft row shows "Balance due CAD 0.00" next to a total of CAD 10.00 (the API's `dueMinor`). Showing "—" for a draft would read better; this is display only.

## Code checks
* **Server authorisation:** a Case Officer's POST of a credit note gives 403.
* **No request per row:** one keyset request per page.
* **Field errors:** mapped from the problem's fields (`credit-note-panel.tsx:33`).
* **An unknown action is dropped:** zod filter at `contract.ts:36`, and each button is rendered only when named.
* **No migration or API change.** The card is added (`MODULE.rows/FO-7s1.md`).
* **Rule removal spot-check:** without the GOVERNMENT_FEE branch at `detail.tsx:93`, DW1 would read "No tax" and fail. Without the number check in the DW3 fail line, a draft's credit button would fail it.

## Could not check
* A real screen reader.
* An intended user's unaided walk (D17 and D20 stay with the founder).
* The trust-Yes state's "Paid from trust" on screen (I set up no trust data).
* The graph's view of this screen: `graph.mjs` (G1 0, G4 0, G3 239) lists only App.tsx pages, so module pages are absent and the money routes show as G3 "no page uses it". This is a tool limit, not this PR.
* CI on the head: the PR is a draft, most jobs were skipped, and `pr-rules` shows one failure (cause not read).

Reviewer: Approve 01dbfa799a3a27fb7693080596153b4511126604
