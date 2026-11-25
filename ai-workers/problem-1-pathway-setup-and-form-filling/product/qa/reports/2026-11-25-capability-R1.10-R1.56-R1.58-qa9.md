# qa capability R1.10, R1.56, R1.58 (qa 9), 25 Nov ~04:xx IST

Cloud qa lane qa 9, Opus 5.5 medium, under Lead 3 (his ask, 25 Nov 04:0x IST). Main d717a6ffd. Isolated copies, live AI off, US$0. Each journey was run from its header with `npx --prefix studio tsx`, twice. The container had restarted, so the database was started with `pg_ctl` (the demo on :4400 was not touched). `npm ci` was needed, because main's web build has a new dependency.

## Verdicts (none is Works; P-606)
| Row | Result on main | Parts missing |
|---|---|---|
| R1.10 | j_10 **14/19 twice**, the same steps | A2, A5 |
| R1.56 | walks run 45477318897: j_56 **16/18** (Lead 3) | FO-7w1, FO-7c, FO-7s2 |
| R1.58 | j_58 **22/24 twice**, the same steps; walks run 45499943772 on 044c86389: 21/24 (before this PR's W5 alignment) | the move-to-case route (no row), FO-7s3a, FO-7s3b, FO-7m |

## R1.10 (j_10, unchanged journey)
* Pass:
  * W1, the field error on screen;
  * W2 route table (316);
  * W2 front-office sales: 292 probes, 0 not as ruled (A3, #3531);
  * W2 retainers: 72 probes, 0 not as ruled (A3);
  * W2 money: 168 probes, 0 not as ruled;
  * every route probed;
  * W3 run-time schemas: 19;
  * W4: nothing stored, no 500;
  * W6, W7, W8;
  * no page error.
* Fail:
  * W2 platform: 17 of 441 probes on 4 routes, among them `POST /api/public/sign/:token/code`. Part: A2.
  * W2 booking: 20 probes on 5 routes (run 1), then 25 on 6 (run 2). Part: A2.
  * W3 over-long fields. Part: A2.
  * W3: 9 public booking doors reach no zod schema. Part: A2.
  * W5 case side: a malformed id answers 400, not 404 (`POST /api/runtime/documents/:id/flags`). Part: A5.
* **Minor (journey's, no bug row):** the booking count moved between runs (20 on 5 routes, then 25 on 6), and so did W3's field count (500, then 490). The step fails either way. The journey should report a stable count; a likely cause is the Sample booking slots, which depend on the time.

## R1.58 (j_58 W5 aligned, this PR)
* W5 now follows #3552:
  * the preview: `GET payments/:id/reverse-preview` (balanceAfterMinor −20000, and its `hash`);
  * the reversal: `POST payments/:id/reverse {reasonCode: "RETURNED", previewHash}` (balanceAfterMinor −20000, one CORRECTION naming the deposit);
  * `GET trust/shortfall`: `items[]` names the client at −200.00 CAD with that `reversalEntryId`.
* The reversal stand-in no longer runs.
* Still failing:
  * W3's move-to-case route: no row, route guessed.
  * W5's screen: Money › Trust in red, FO-7s3b.
* The two Minors from #3529's reader are still open: W3's move step uses a made-up case, and the time placeholders.

## Questions for the Lead
* The move-to-case route still has no BACKLOG row. It is R1.58's only API part left.
