# Journey test (reviewer): PF-11 part 2, the firm's full data download with front-office sections, round 3, 26 Nov 2026

Head 938387bd130e3328ea8109cebbab0f38e7f2985c, on an isolated copy of a `git archive` on runtime port 4436 (database xr_studio_pf11r3rev, removed afterwards), with `PLATFORM_IDENTITY=local`. Never :4400.
The download has no web page: the requests, list and download are API routes (`/api/platform/firm-export`). The walk is therefore by API, as a person's client would call it, with the zip opened afterwards.

## Journeys
1. **Main path.** The Owner (Representative, Sample) wants all of the firm's data.
   - Request: 201, QUEUED, 41 ms.
   - The list shows READY within about 2 s, with a size, a sha256 and a 7-day expiry.
   - Download: 200 application/zip, 14,509 bytes, 34 ms.
   - The zip has 51 entries: 15 platform CSVs, 35 front-office CSVs and README.txt last.
2. **Double click.** The same operationId sent twice returns the same record (id 0d389201…). There is one row in `platform_firm_export`.
3. **Wrong role.** The case officer (user-T) requesting gets 403.
4. **Wrong firm.** The sample-solo Owner downloading the sample firm's export id gets 404.
5. **Bad input.** A request with no operationId gets 422: "One field needs a change: operationId: This is required. Nothing was saved."
6. **A lost stored file.** Not walked live: the sample firm has no signing documents. It is covered by the suite's real `build`: READY, the README names the file once as missing, and the other files are present (the tightened Major 4 line, 70/0). A direct `buildPackage` probe confirmed one line per file.
7. **Across the boundary (the money amounts a firm reads in a spreadsheet).** The headers are `quoted_fee_minor,quoted_fee_currency`, `value_cents,currency` and `amount_minor,currency`. Each amount sits beside its own currency, as the README says.

## Data underneath
- `platform_firm_export`: 1 row, DOWNLOADED, size 14509, `downloaded_at` set.
- `audit_event`: one line each for `platform.firm_export.requested`, `.ready` and `.downloaded`.
- The README opens with "Nothing in this download is masked…", the formula-safety rule and the minor-units rule, then one line per section with its row count, then the front office's words.

## Break it (diff-focused)
- A cap crossed on a later module's sections, after an earlier module with files: refused, but the earlier file was read first (review Minor 1; no effect in today's module order).
- A `_minor` column naming a non-text currency, a missing currency, or holding a fraction: each refused by `checkModuleExport` in words.
- All 21 `_minor` and `_cents` columns in the schema mapped through `tableSection`: each names a text currency.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journey 1: requested, ready and downloaded; 35 front-office sections present |
| Next step obvious | ½ | The list gives the state, expiry and size. There is no screen in this item to judge. |
| Plain words | ½ | The README and the error words are plain. "(1 rows)" is part 1's. |
| Feedback and state | 1 | QUEUED → READY → DOWNLOADED; the 422 and 403 answers are in words |
| Correct data | 1 | One row, three audit lines, headers and minor/currency pairs as the rule says |
| Error recovery | 1 | Double click is idempotent; a lost file never blocks the download (suite) |
| Accessibility and screen sizes | ½ | No UI. The CSVs are UTF-8 with header rows, and text cells are formula-safe. |
| Speed | 1 | 41 ms request, under 2 s to READY, 34 ms download |
| Visual quality | ½ | No UI. The README is tidy plain text. |
| Trust and sources | 1 | Unmasked is said plainly; every stored file has its sha256; a missing file is named |

**Total 8/10: pass (8 or more, no 0).** To raise it:
1. "row"/"rows" agreement in the README (part 1).
2. The two review Minors.

Could not test: a real screen reader, a real object store, live front-office money and file rows (the sample firm has none), and an intended user's unaided walk (D17 and D20 stay with the founder).
