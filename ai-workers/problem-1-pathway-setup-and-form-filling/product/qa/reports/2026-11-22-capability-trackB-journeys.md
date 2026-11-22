# qa capability — Track B journeys written ahead (A286), 22 Nov 2026

**Lane:** Track B's qa lane (cloud; the founder's ask A286, Lead 4's brief). **Main:** 73c4e4dcd. **Model:** Opus 5.5, medium (P-788). Isolated copies only (never :4400); US$0; live AI off; no model call; no product code changed.

**Verdict:** six journeys written before their builds finish, so qa only runs each when its last part merges. Each one follows its CAPABILITIES "Done when" as steps. Run twice on isolated copies, each fails today only on steps whose parts are not merged (P-606), and each failing label names the missing part. **R1.106 re-walk: Partial, unchanged** (only AS-1m merged). No row changes status. No verdict on R1.56, R1.29, R1.55, R1.85 or R1.105 (parts missing).

## The journeys and what fails today

| Journey | PR | Today (both runs) | Failing steps, each with the missing part it names |
|---|---|---|---|
| `j_56.ts` R1.56 | 1 | 7/17 | W1: FO-7b's draft from a signed retainer's fee rows; FO-7s1 "Start from retainer" · W3: FO-7g part 3 and a person address row (client's province) · W4 ×2, W5 refusal: FO-7g part 1w · W7 ×3: FO-7b part 1b (#2953), issue, frozen tax, PDF · W9: FO-7s1, FO-7q (Money › Invoices); R1.57's first step: FO-7c |
| `j_29.ts` R1.29 | 1 | 12/22 | W2: FO-9b part 2 (`GET duplicates/review`), FO-9s part 2 (People to merge menu) · W3 ×2: FO-9b part 1 (merge, tombstone, audit) · W4 ×2: FO-9b part 2 (the money pair and the case pair on the review list, needsCaseSide) · W5 ×3: FO-9b part 1 Undo, part 2 `GET duplicates/merges`, FO-9s parts 2-3 · W6: FO-9b part 2 (401/403 on review and merge) |
| `j_55.ts` R1.55 | 2 | 27/34 | W1 ×3: FO-6 signing request, FO-5s Withdraw, FO-6 withdraw stops the link · W3 ×3: FO-6 decline reason, FO-6 public signing door, FO-5s Declined state · W4: FO-5s Signed offline panel |
| `j_85.ts` R1.85 | 2 | 4/19 | PF-4s part 1 (#2927, `/api/system`) · PF-21b part 2 (`plat_data_request`, `plat_legal_hold`: log, move, overdue, hold, Owner 403) · PF-21d (erasure) · PF-21rs and PF-17 (console Privacy pages); W7 also PF-21c |
| `j_105.ts` R1.105 | 3 | 17/21 | W3: Conflict "read-only" vs 402 on reads (Lead B settles from SA-02) · W2: AUD-5's callers (PF-21d erasure, PF-11c purge) · W4: PF-11 data download, PF-11s panel · W5: PF-11c close at 90 days, with AUD-2 |
| `j_106.ts` R1.106 | 3 | 4/10 | W1 ×2: AS-1g, AS-1c (FSW assessable, grid tables) · W2: AS-1s, AS-1c (score lines) · W3: AS-1s, AS-1c (missing answer line) · W4: FO-15a, FO-15b, FO-15s · W5: CS-106c |

Run (from `prototype/`): `zsh studio/tools/isolated.sh jNN <port> start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh jNN <port> stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_NN.ts jNN <port>`.

## What passes underneath today (merged parts, no Bug found)
* R1.56: the tax default reads Ontario's HST (13 %) from the cited CRA table, and every row cites canada.ca (URL, quote, read date). A rate in the request is refused (422). A government fee is stored at 0 tax. Totals are integer cents and equal the sum of the lines. Another firm gets 404 and no session gets 401.
* R1.29: in Add a lead, a similar name with the same phone typed differently, and the same email in other capitals, each name the person with the reason before Save. Save stays enabled, the warning saves nothing, the panel is axe clean, and a first name alone names no one. The walk reaches R1.30's Leads list and its filters. "A person with money or a case is never merged by itself" passes today only because no merge runs yet: it bites when FO-9b part 2 merges.
* R1.55: withdraw with a reason, re-issue as version 3, and Signed offline (file, PDF and reason required; the prospect is Won once with its audit line and event).
* R1.105: keep periods per record kind with the College's rule cited. Below 6 years without a reason → 422, a Case Officer → 403, an audit line on save. The audit log cannot be deleted. A held firm's billing page says data is kept until day 90.

## Independent review (fresh reader, 22 Nov) and what changed
Majors fixed before labelling:
* j_29 now covers a person with a case (seeded as the case side's client row).
* j_85 signs our staff in through PF-4s and sends the token on every console call. It logs a 40-day-old request to check OVERDUE, counts events per request, and attempts the erasure.
* j_55 declines through the signing door with a reason, read back word for word.
* j_105's W2 attempts a real delete inside the keep period, and W5 runs the closing job at once instead of waiting a day.

Minors left as they are:
* Four placeholder screenshots are identical: each shows a page that is not built.
* j_106's W5 is a source check, because no released program can run.

## Stand-ins (said in each file)
* j_56 seeds the signed retainer as its rows (R1.53/R1.54 walk it). The firm's Ontario address and tax registration are seed lines (R1.21 walks the address; Getting paid is FO-7s1, not on main).
* j_55 writes the decline by SQL, as FO-5's own pack does (no decline route on main).
* j_85's `/api/system/...` paths and j_29's `/front-office/duplicates` page path, j_56's `/money/invoices` page path and `PATCH /front-office/people/:id` address are taken from the briefs and concepts. qa aligns them to the built routes when the parts merge.
* j_105 adds a second, newer hold line dated 91 days ago to simulate day 91 (`module_event` is insert-only). W5 sends the closing job by its schedule name into `platform_jobs.job`.
* j_29's case pair is a seeded `case_client` row linked to the person (CS-K1), not a full case.

## New finding
* **QA-745** (Bug · Minor, test isolation; from the tech lead): `check_fo9s_duplicates_browser.ts` fails at D8 when re-run on the same copy. Not yet reproduced by qa.

## Answers from the tech lead (Lead 4, 15:04 IST, on #2992)
1. **Province:** settled as P-797 (CRA GST/HST Memorandum 3-3-6, para 20 and Example 6). The tax follows the client's province, read from the client's Canadian address through an editable Bill-to province, and falls back to the firm's province. The part is FO-7g part 3. j_56's W3 is written to P-797 and names it. The Done-when stands.
2. **From a signed retainer:** a missing part. j_56's W1 names "invoice from retainer (row to be named by Lead B)".
3. **FO-7g part 1w:** the Lead posts on #2992 when its PR opens.
4. **R1.105:** PF-11 and PF-11s belong on checklist row 105. MVP-CHECKLIST.md is the tech lead's file, so this lane proposes the edit and does not make it: the parts column of row 105 gains `; PF-11, PF-11s ("exported": the firm's data download and its panel)`. "Read-only" vs 402 is Lead B's to settle from SA-02, so j_105's W3 read step fails as the named Conflict until then.

## Questions for the Lead (as asked, 14:4x IST)
1. **R1.56 "the client's province":** FO-7g part 1 reads the firm's province only. The client's province is FO-7g part 3, and part 3 waits on a row that gives a person or company an address. The brief says no BACKLOG row adds one. So R1.56 cannot be Works after FO-7b part 1b and FO-7g part 1w alone. Should the address row be shaped, or should the Done-when read "the firm's province" (P-701)? The founder decides.
2. **R1.56 "from a signed retainer":** no part on main or in #2953 drafts from a retainer's fee rows. Which row builds it (FO-7b later part, or FO-7s1's "Start from retainer" with an API)?
3. **R1.105 checklist:** row 105 names neither PF-11 nor PF-11s, but "exported" needs them, and PF-11c needs AUD-2. Should they be added to the checklist row?
4. **R1.105 "read-only" (possible Conflict):** a held firm gets 402 on reads of its own data too. Does "read-only" mean "read only through the data download (PF-11)", or should list reads stay open?

## Suggestions
* *Needed for the proof · Scaffolding:* when FO-7b part 1b (#2953) and FO-7g part 1w merge, re-run j_56. W4, W5 and W7 should turn green. R1.56 stays Partial on W1, W3 and W9 until the questions above are answered.
