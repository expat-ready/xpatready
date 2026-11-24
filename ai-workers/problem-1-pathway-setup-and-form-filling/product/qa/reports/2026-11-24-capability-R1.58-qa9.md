# qa capability R1.58 (qa 9), 24 Nov ~23:xx IST

Cloud qa lane qa 9 (Track A), Opus 5.5 medium, under Lead 32. Main 4cd0091f4 (after #3442, FO-7t part 2, merged as 3049b8d21). FO-7t part 3 is #3493 (open, head 3ed855a66, no migration), run here merged with main 4cd0091f4 (a clean merge). Isolated copies `q9w158` (:4474, main) and `q9h3493` (:4472, #3493 + main). Live AI off, US$0, no Stripe call.

## Verdict
**Partial, parts missing: FO-7t part 3 (#3493), the move-to-case route (no row), FO-7v, a shortfall read (no row), FO-7s3a, FO-7s3b, FO-7m. No verdict (P-606).**

## The journey alignment (this PR, `tests/journeys/j_58.ts`)
* **W3 on a real case** (qa 8's open item; the Lead's ask). #3442 lets staff see an invoice on a case only when its case is a real `runtime_case` they can see (`client-money/reads/visibility.ts:27`; `visibility-adapter.ts` caseLinks: `case_client.fo_person_id`). The setup now loads the configured checkpoint (Demo › Load, `POST /demo/load {sample:"configured"}`, as j_74 and j_76 do) and firm A's case officer opens a case (`POST /runtime/cases`, vv.single). Its case client is born linked to its own front-office person (CS-K1 part 2): that person is **client C**, and the case is **CASE2** (was `randomUUID()`).
* A deposit names only its own client's case (`trust/service.ts` caseOf: "This case is another client's"), so client B's 300.00 still reaches C's case by a SQL move (stand-in, printed: no move route). The invoice is put on its case by SQL (stand-in, printed: no draft route takes a case yet).
* The pick sends #3442's key `pick: { personId, reason }` (was `otherFundsPick`).
* W5's refund: #3493 (round 4) asks first when a cheque has not cleared (409 `UNCLEARED`); the journey confirms with `unclearedAcknowledged: true`, as a person does. On main the first request is taken.
* The checkpoint step is one step on every run (a second run finds it loaded), so the count is the same both runs.
* Labels: W2 and W4's Pay from trust now name FO-7t part 2 (#3442) as on main.

## Results (from the journey's header, `npx --prefix studio tsx`, twice each)
| Where | j_58 | Same steps both runs |
|---|---|---|
| main 4cd0091f4 + this journey | **17/24**, 17/24 | yes |
| #3493 3ed855a66 merged with main + this journey | **20/24**, 20/24 | yes |

Passing on main: setup (checkpoint, client C's case, firms, clients); W0 trust answer; W1 trust and operating (API and database); W2 Pay from trust and refund over the balance refused in words, and the database's refusal; W3's move refusal underneath; **W3's pick on client C's real case** (300.01 refused, "Only CAD 300.00 is available."; 200.00 taken as a pick with its reason) and its rule underneath; W4 Pay from trust 300.00 and the database's To move line; W5 the database's reversal below zero and `money_trust_shortfall`; W6 roles (200, 404, 401).
Passing only with #3493: W4's To move list names the line; a 300.01 batch is 409 MOVE_REFUSED with nothing written; "I moved these" for 300.00 takes it off the list and leaves the balance.

## Failing steps
| Step | Answer | Part |
|---|---|---|
| W3 move to a case over the pre-case money (route guessed `POST /trust/moves-to-case`) | 404 | the move-to-case route (ruled "a new FO-7t part", no row name) |
| W4 To move list / batch / I moved these (main only) | 404 | **FO-7t part 3**, #3493 |
| W5 the Returned reversal through the API | 404 | **FO-7v** |
| W5 the shortfall list read (route guessed `GET /trust/shortfall`) | 404 | no row names one |
| W5 Money › Trust shows the client in red | no such page | **FO-7s3b** (and the shortfall screen, no row) |

## Not tested
FO-7m (the monthly check) has no j_58 step yet. Headed walk and 400/1024 px wait on the screens (P-606). walks.yml j_58 on main: asked of the Lead for when #3493 merges (P-439).

## Questions for the Lead
* The move-to-case route and a shortfall read still have no BACKLOG row name. Are they in FO-7ts or FO-7t part 4?

## Suggestions
* None new.
