# PF-22v review, round 1: SavedViewPort, saved-view routes, cf.<key> filter (API only)
Reviewer: a fresh context that did not build it. Commit `0cfb49afd19945dd638146427fec577ef8bc47c9`, diff `claude/runtime-pf22a-routes..HEAD` (13 files). Read against: BACKLOG row PF-22v (Done-when list), PF-22s `concept-draft.md` §3 BR-11 to BR-16 and §6, `challenge.md` (B1, M1, M2, M3, M5, m1), STANDARDS §4 to §7, and migration `20261126063100_shared__pf22a_custom_fields`. Evidence: the builder's suites (listed as exit 0) and my own break run. The run is the builder's harness copied to the scratchpad with ~40 extra HTTP calls, on a scratch database on :54329 that was dropped afterwards. Journey report: `journey-test-reviewer-2026-11-26.md` (6.9/10, below the bar).

## Verdict: Ship after fixes
The port, the registry, the walls, the personal/shared split, dropped parts worked out per viewer (challenge M2) and the cf.<key> filter on both list routes (challenge B1) are sound and tested. Six Majors stay open: one challenge objection (M3) is not handled, two STANDARDS §4 [M] lines are not met, and three are correctness gaps in the filter language. No Blocker. Each fix is contained.

## Concept, challenge and row fit
| Item | Status | Evidence |
|---|---|---|
| B1 cf.<key> on leads and prospects | Met | `routes.ts` LEADS/PROSPECTS_QUERY use `customFieldQuery`. Leads match through `personId` (fo_person), Pipeline through the prospect id. An unknown key gets 422 naming it (V8). |
| M2 dropped parts per viewer, stored filter kept until Replace | Met | `service.ts:69` `show()` runs `reg.check` for each viewer. `filter` is kept and `applies` is returned (V4). |
| M3 a shared view's source part for a `view.own` viewer | **Not met** | See Major 1 |
| M1 Board | N/A here | The Board's gating belongs to the screen (PF-22s). `applies` gives the screen what it needs. |
| M5 saved-view PATCH/DELETE versioned | **Not met** | See Major 3 |
| Row Done-when: personal / 403 share / view.own / dropped stage / unknown field 400 / twins / leaver / firm wall | Met, each with a pass and a fail | V2 to V7. The view.own half (BR-13) is weakened, see Minor 4. |
| Row "an invalid filter is refused by the server" | **Partly** | See Major 2 |
| Choice: share key holders change shared views | Fine | Matches the concept's question 3 recommendation and the challenge. The founder's answer is still open. |
| Choice: refuse at save, drop at read | Fine | Consistent with M2. |
| Choice: no `type` in a pipeline view | Fine | The list name fixes the pipeline (V5). |
| Choice: 422 on lists, 400 on view save | Acceptable | The row's test line says 400 and challenge m1 says 422. Both carry `code` and `fields`. The Lead should settle this in the row (see Minor 5). |
| Choice: CHECKBOX "false" matches only an explicit no | Acceptable | Documented in `filter.ts:7`. The screen must word it as "answered no" (Minor 3). |

## Issues, ranked
**Major 1 (Must): a shared view with a source gets a 422 for a `view.own` Agent (challenge M3).** `saved-view-lists.ts:38-57` never looks at `source`. Failing scenario (break run): the Admin saves the shared view `{view:"all", source:"Web form"}`. An Agent with no web-form lead opens it. `GET /saved-views?list=fo.leads` returns `applies` with the source and `dropped: []`. `GET /front-office/leads?view=all&source=Web form` then answers **422 UNKNOWN_SOURCE**. Fix, as M3 says: keep the source part, and the list shows its own rows or none. The part counts as dropped only when no lead in the firm has that source. Add the "view.own opens shared Web form leads" pass/fail from the challenge's back-end plan.

**Major 2 (Must): a filter's values are not checked at save, so a filter that cannot work is stored.** `service.ts:52-58` `checked()` runs only the shape schema and `check()`, and `check()` covers only stage, owner and cf.*. Break run: each of these got **201** and `dropped: []`:
- fo.leads `{source:"No Such Source"}`
- fo.leads `{view:"bogus"}`
- fo.prospects `{type:"SPACESHIP"}`
- fo.leads `{from:"31/31/2026"}`

Each view then makes its list answer 422 every time it is opened. AG-2-23 says "an invalid filter is refused by the server", and BR-16 agrees. Fix: the FO `check` validates `view`, `type`, `from`/`to` (with the list's own `dayRange` or its rules) and `source` (see Major 1 for a source missing in the firm). Then save refuses with 400 naming the part. Add one fail case per word.

**Major 3 (Must): no optimistic concurrency on PATCH/DELETE (STANDARDS §4 [M]; challenge M5).** `routes.ts:23,26` have no `@Versioned()`, and `ChangeView` (`service.ts:33`) has no `version`. Break run: two share-key holders replace the same shared view one after the other. The second write silently overwrites the first. Sending `version` gets 422 INVALID, because the field does not exist. Fix: use the house pattern (as on PF-22a's field PATCH). Return `version` (`updatedAt`) on every view, take it on PATCH/DELETE, and check it under the existing `FOR UPDATE`. A stale one gets 409 with the view as it is now.

**Major 4 (Must): creates are not idempotent (STANDARDS §4 [M]).** `service.ts:98` has no `requestId`, and same-name views are kept by design. Break run: two parallel POSTs of "Dbl" made **2 rows**. A double click on "Save view" leaves two identical views. Fix: an optional `requestId` replayed within the firm and owner, as `leads.add` does.

**Major 5 (Must): NUMBER ranges with a decimal end are refused.** `filter.ts:35`: `range()` matches `^([^.]*)\.\.([^.]*)$`, so any end that contains "." fails the match. The whole text is then read as one number, which is NaN. Break run: `cf.budget=1000..2500.75` and `cf.budget=2500.25..` both got **422** "Type a number, for example 2500 or 2500.50.", which is the very value the message suggests. This is a contract bug in the shared filter language (FO-12c reuses it). Fix: split on the first `..` (for example `/^(.*?)\.\.(.*)$/`), and add a decimal case to V8.

**Major 6 (Must): an oversized filter gets a 500.** The DB check limits `filter::text` to 16,384 characters. The zod rules allow 50 sources × 500 characters, or 100 cf values × 500. Break run: 40 sources of 500 characters got **500** (check violation), not a Problem Details response (STANDARDS §6 [M]). Fix: a `refine` on the parsed filter's JSON length (16,384) in `checked()`, giving 400 INVALID_FILTER.

**Minor 1 (Should): `sort: null` cannot clear a sort.** `service.ts:135` writes `b.sort ?? undefined`, and Prisma reads that as "leave unchanged". Break run: PATCH `{sort:null}` got 200, and the old sort stays. Fix: `Prisma.DbNull`. Columns and sort are Not built on the screen, but the API accepts them.

**Minor 2 (Should): database reads for every view on GET (STANDARDS §5 "no N+1").** `show()` calls `check()` for each row: a stage count, a staff read, a field read and a full value query for each cf part (`saved-view-lists.ts:50` runs `customFieldIdsWhere` only to validate). Measured: 22 views in 44 ms. The concept's scale is 200 views, which works out to about 800 queries. Fix: batch the stages, staff and fields once per list, and validate cf parts without running the value query. Also, in `change()`, `checked()` runs on the pool while holding the transaction's connection (`service.ts:133`). Validate before the transaction.

**Minor 3 (Should): dropped-part words.** A dropped cf part reuses the list's error text as its reason: "Choose from the listed choices for Referral partner." or "No such field here (it may have been archived).". These read as instructions, not as the concept's "the stage “Consult” was removed". The repeated or empty text value says "Type 1 to 200 characters" (`filter.ts:62`). The screen must say what CHECKBOX "no" means ("answered no").

**Minor 4 (Should): BR-13's pass half is not proven.** `check_pf22v_saved_views.ts:172` asserts that the Admin sees **0** through "All open". With EVERYONE_SEES_ALL off, nobody sees everything, so no viewer shows that a seesAll person gets all rows through the same shared view. Add that viewer.

**Minor 5 (Should, Lead): status codes.** The row and the concept say 400, and challenge m1 says 422. The build answers 422 on lists and 400 on view save. Record the choice in the row so PF-22s maps both.

## What I could not check
- Screen use, keyboard, 1024 px or 200 % zoom, PRODUCT §3–§4 menu words, and the BIC-01 to BIC-20 scorecard: N/A, because this part is API-only (the concept's §4c says not case-side).
- D17 and D20: simulated only.
- I did not run `graph.mjs`, because it rewrites `qa/graph.json` and I may only write this folder. By hand: all four new routes are exercised by `check_pf22v_saved_views` (V2 to V8).
- Rule-removal spot-check was done by reading, not by mutating the code. Removing `check` from `checked()` fails V5. Removing the share-key test in `mine()` fails V3. Removing `firmScope` in `list()` fails V7.

## D1–D20 (of 5; screen-only dimensions N/A)
D1 3: B1, M2 and the row met; M3 and "invalid filter refused" are not. · D2 2: a filter that cannot work can be saved; double create makes 2 rows; stale write overwrites. · D3 4: one filter language, one registry; the port is shared by the real adapter and the fake. · D4 3: decimal ranges cannot be expressed. · D5 2: no idempotency, no version; a 500 on oversize. · D6 4: one audit line for each change, filter keys only. · D7 N/A (no AI). · D8, D9 N/A (API). · D10 3: dropped-part words (Minor 3). · D11 3: `droppedLine`, `canChange` and `canShare` are given, but opening a shared source view gets a 422. · D12, D13, D14 N/A. · D15 4: 44 ms for 22 views; N+1 at scale. · D16 4: a pass and a fail for each Done-when; BR-13's pass half is weak. · D17 simulated only · D18 4: owners labelled, a leaver shown as "Former staff member"/inactive, dropped parts named. · D19 N/A (no screen yet) · D20 simulated only.

Verdict: Changes 0cfb49afd19945dd638146427fec577ef8bc47c9
