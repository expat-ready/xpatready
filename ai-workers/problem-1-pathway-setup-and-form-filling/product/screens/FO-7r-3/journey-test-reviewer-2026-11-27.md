# Journey test: FO-7r part 3 (period exports API), reviewer, 27 Nov 2026

Head `bd0c92a7560b5ef3a87c4fcf37dc14ea75bf13e3`. **API only:** part 3 has no screen, so there was no browser walk, no axe check and no width check. The journeys were walked over HTTP and in the database in two runs. Neither used :4400.
* **The builder's check.** A Nest app on an ephemeral 127.0.0.1 port with PF-4's guard, the firm walls, `fakeJobs` and `fakeFiles`; fixtures go through the real money routes.
* **My probe.** The same harness on the scratch database `xr_studio_brk7r3_<pid>`, dropped after each run.

## Journeys (persona: Billing and finance or the Owner, preparing files for the firm's bookkeeper)
| # | Journey | Expected | Result |
|---|---|---|---|
| J1 | Export all six kinds for a period, then download them | 202 QUEUED, then READY with six links; CSVs with AG-6-31's columns, own currency, no total row | Held (E2, E3) |
| J2 | Reconcile a month against the client's statement | the files' sums equal the statement's INVOICES change; trust amounts equal the TRUST change | Sums held (E1). **The trust ledger's running balances are in random order** (8 deposits: 1560, 1600, 1510, 1860, …), and the last one is not the closing (review Major 1) |
| J3 | Export a period with no rows | header-only files; audit counts 0 | Held (E4) |
| J4 | Download before the export is ready; after a failure; after 7 days | 409 "still being prepared"; 409 "failed … make a new export"; 410 | Held (E3, E8). A failure that PF-14 then retries shows "failed" before it turns READY (m4) |
| J5 | Wrong role, other firm, no session | 403, 404, 401 | Held (E5, E6) |
| J6 | Ask for the trust ledger with trust off; with trust No and money held | 422 naming `kinds`; accepted | Held (E7; probe B6) |
| J7 | Double click: the same id three times at once; the same id with another period | one job; 409 | Held (B4, B4b, E7) |
| J8 | A very large period (over 25 MB) | FAILED with "choose a shorter period" | Held (B7), but it took 41 s and +174 MB first (m5) |
| J9 | A hostile name `=1+2` / `@SUM(A1)`; a reference with quotes and commas | inert `'=…`, quoted correctly | Held (B3, E9) |

## Data underneath
* There is one `money_export.created` audit line per finished export, with `staff:<id>`, the period and the row counts. A failed run writes none.
* No `money_*` row is written.
* The files sit under `money-exports/<id>/` for the requesting firm only.

## Break-it findings
* **Major:** row order (review Major 1).
* **Minor:**
  * a retry after a rename cannot finish (m3);
  * the state reads FAILED while a retry is pending (m4);
  * memory and time on a huge period (m5);
  * the app clock is compared with the database clock (m6);
  * there is no BOM (m7).

## Score (0, ½ or 1, each with evidence)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1 and J3 complete through the routes |
| Next step obvious | ½ | QUEUED gives no hint of when to look again; READY lists the links |
| Plain words | 1 | "This export is still being prepared.", "There is no trust ledger: trust is off and no money is held." |
| Feedback and state | ½ | FAILED is shown while a retry is pending; a crashed worker reads QUEUED for 7 days (m4) |
| Correct data | ½ | The sums are right; the trust ledger's running-balance order is wrong (Major 1) |
| Error recovery | ½ | A new export always works; a retry after a rename never finishes (m3) |
| Accessibility and sizes | ½ | No screen. The CSV has no BOM, so non-ASCII names garble in Excel (m7) |
| Speed | 1 | 10,000 invoices in 187 ms; a cursor page uses its index |
| Visual quality | 1 | Header names follow AG-6-31 rule 2; one row per fact |
| Trust and sources | 1 | Amounts stay in their own currency; Sample constants are labelled; requirements are cited |
| **Total** | **7.5 / 10** | **Below the pass mark (8).** Fixing Major 1 raises Correct data; then m4 and m3 |

Not tested: a real spreadsheet application opening the files, a real screen reader, and an intended user's unaided walk (D17 and D20 stay with the founder).
