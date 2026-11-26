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

## Round 2 (diff only): head `8eccabb30738e88a1df5289078babeb128c58d50`
Scope: `git diff 0cfb49afd..8eccabb30` without part 2's files, plus `filter.ts`. Evidence: the new V9 cases, and my break run against the same scratch database on :54329 (`break2.ts`, `break3.ts` in the reviewer's scratchpad; the database was dropped afterwards). The harness has no global `IfMatchVersion`, so I checked If-Match only by reading: the feature `platform-if-match.ts` registers it app-wide.

### Round 1 items
| Item | Now | Evidence |
|---|---|---|
| Major 1 (challenge M3) source for `view.own` | **Partly**: the 422 is gone, but see R2-1 | V9 "Web leads"; my run |
| Major 2 values checked at save | Closed | view, type, from/to and source → 400 naming the part (V9) |
| Major 3 version on PATCH/DELETE | Closed | 409 STALE_VERSION with `current` (V9). `version` is optional, as on PF-22a's field PATCH (house pattern). |
| Major 4 idempotent create | **Partly**: see R2-2 | V9 passes only for an empty filter |
| Major 5 decimal ranges | Closed | `filter.ts` splits on the first ".." (V9 cases in and out of range) |
| Major 6 oversized filter gets a 500 | Closed for realistic input; one path is left (R2-3, Minor) | V9 "Huge" → 422 |
| Minor 1 sort null, Minor 3 words, Minor 4 BR-13 pass half | Closed | V9; `saved-view-lists.ts:75` |
| Minor 2 per-view queries | Open, deferred by the builder to a follow-up | Acceptable at sample scale (44 ms / 22 views) |
| Minor 5 400 vs 422 | Stated in the PR; the Lead records it in the row | |

### New and remaining issues
**R2-1 Major (Must): a source part is dropped whole, so the view widens to every source.** `saved-view-lists.ts:57-60` drops all of `source` when any one value is unseen. Break run:
- Steps: the Admin shares `{view:"all", source:["Web form","Phone call"]}`. An Agent who has Phone call leads but no Web form lead opens it.
- Result: `applies` = `{view:"all"}` and `dropped` = source, so the Agent gets all of their leads from every source, not their Phone call leads.
- This is inside their visibility (BR-13 holds), but the view's meaning is lost.

When no value is seen, the build drops the part and shows all of the Agent's own rows. Challenge M3 names exactly that as wrong ("the source is dropped and the Agent sees **all** their leads. Both are wrong"), and its back-end plan's test says "own rows or empty, never all". The deviation is not recorded in `challenge.md` or in the PR body (CLAUDE.md: never deviate silently).

Fix:
- Drop only the unseen values and keep the seen ones.
- For the all-unseen case, either build M3 as written (keep the part; the list answers an empty page when the source exists in the firm), or write the disagreement in `challenge.md`/the PR so the Lead decides. The Lead's confirmation is what M3 asks for.
- Add a mixed-source pass/fail case.

**R2-2 Major (Must): a real retry gets 409 REQUEST_REUSED (STANDARDS §4 [M] idempotent creates).** `service.ts:131` compares `JSON.stringify(v.filter)` with `JSON.stringify(f)`. PostgreSQL's jsonb stores keys reordered (shorter first, then byte order), so the two strings differ whenever zod's key order differs from jsonb's. Break run:
- `{view:"all", from:"2026-01-01"}` sent twice with one `requestId` → 201, then **409**. One row was kept.
- Two parallel POSTs of `{stage:"QUALIFIED", owner:<id>}` (a double click) → **409** and 201.

A client that retries after a timeout is told its request id was misused, and may resend with a new id, which makes the duplicate. Fix: compare key-order-free (sort keys deep, or compare list and name only), and add a V9 case with two or more filter keys.

**R2-3 Minor (Should): the size limit does not measure what the database measures.** `service.ts:33` counts `JSON.stringify` (no spaces). The check counts `filter::text`, and jsonb text adds a space after every ":" and ",". Break run: 36 MULTI_SELECT fields × 100 values, 14,967 characters stringified → **500** (check violation). This is contrived, since it needs 36 fields and a hand-built request. Fix: allow one character per array element and per key in the count, or cap well below the database's limit (for example, 12,000).

**R2-4 Minor (Should): words.**
- `filter.ts:98`: a cf filter over 30,000 matches, when it happens in a view check, is dropped as "The value no longer fits the custom field" (`saved-view-lists.ts:75`).
- `saved-view-lists.ts:52`: one bad date drops both `from` and `to`.
- `service.ts:33`: a filter value containing the literal six characters `\u0000` is refused as a NUL.

### Round 2 journey score: 7.5 / 10 (6 of 8 scored; still below 8)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | |
| Next step obvious | ½ | R2-1 |
| Plain words | 1 | Dropped reasons are now worded as reasons |
| Feedback and state | ½ | A 409 on a double click (R2-2) |
| Correct data | ½ | The source part widens the view (R2-1) |
| Error recovery | ½ | Version is fixed; the retry gets 409 (R2-2) |
| Speed | 1 | |
| Trust and sources | 1 | |

Closing R2-1 and R2-2 raises next step, feedback, correct data and recovery.

D1 4 · D2 3 · D5 3 · D10 4 · D11 3 · D16 4 (V9 adds a fail test per fix; a multi-key retry and mixed sources are missing). Others as in round 1.

Verdict: Changes 8eccabb30738e88a1df5289078babeb128c58d50

## Round 3 (diff only): head `21fce934c89868b4855446f450c56ec5ac89170b`
Scope: `git diff 8eccabb30..21fce934c` without the record files. Evidence: the new V9 cases (suite 39/39 per the builder), and my break run `break4.ts` against a scratch database on :54329 (dropped afterwards).

### Round 2 items
| Item | Now | Evidence |
|---|---|---|
| R2-1 source dropped whole | Closed | Only unseen sources are left out ("the other sources still apply"). With none seen, the view answers `empty: true` ("shows nothing for you"), never all of the viewer's leads (V9 mixed and none cases). The screen (and the Board, challenge M1) must honour `empty`, as stated in the PR. A sharer is judged at save by the firm's sources. |
| R2-2 retry gets 409 | Closed | `canonicalJson` compares regardless of key order (V9, three keys in another order → same id, 201). A replay after a take-back → 409. |
| R2-3 size limit | Closed | Each ":" and "," counts once more, which is never less than the database's text form. My 36-field × 100-value filter that gave a 500 now gets **422**. |
| R2-4 words | Closed | One bad date names itself; a reversed range names `to`; the >30,000 case has its own words; literal `\u0000` text is accepted, a real NUL is refused. |
| DELETE version | Fine | `?version=` → 409 STALE_VERSION when stale (my run); no version → 200, the same optional pattern as PATCH. If-Match on DELETE now gets PF-31's 422, as documented. |
| Per-view queries on GET (round 1 Minor 2) | Open, follow-up | As before |

### New, Minor only
**R3-1 Minor (Should): a personal save can confirm that a source another person's leads have exists in the firm.** `saved-view-lists.ts` "save" mode judges sources by the whole firm for every caller. Break run: a `view.own` Agent saves a personal view `{source:"Secret referral"}` (another Agent's lead) and gets **201**, while a made-up source gets 400. No source is named, but a guess is confirmed, which edges against QA-533 (another person's free-text source is never revealed). Fix: judge by the firm only when the caller saves a shared view with the share key, or sees all; otherwise judge by the viewer's own sources.

**R3-2 Minor (Should): a source no lead in the firm has any more opens empty, not dropped with the rest applied (BR-14; challenge M3's last sentence).** Break run: the Admin (everyone-sees-all on) saves `{view:"all", source:"Secret referral"}`. The only such lead's source is then edited. On read: `empty: true`, "…so the view shows nothing for you", and `droppedLine` "1 filter part no longer applies". Nothing is widened, and the result is truthful (no lead has the source). But BR-14 says a removed source is dropped and the rest applied. In the viewer-only case, "no longer applies" is the wording the challenge called wrong. Fix: one firm-wide check. Gone from the firm → drop and apply the rest. Gone only for this viewer → `empty` with "None of the leads you may see match this view" (not counted in `droppedLine`). Or the Lead accepts the current reading.

### Round 3 journey score: 9.4 / 10 (7.5 of 8 scored; pass, no criterion at 0)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | |
| Next step obvious | 1 | `empty` and the named sources |
| Plain words | ½ | R3-2 wording |
| Feedback and state | 1 | |
| Correct data | 1 | |
| Error recovery | 1 | Version, retry, stored filter kept |
| Speed | 1 | |
| Trust and sources | 1 | |

D1 4 · D2 4 · D5 4 · D10 4 · D11 4 · D16 4 (a pass and a fail for each round fix). Others as in round 1. No Blocker or Major is open; R3-1, R3-2, the per-view queries and the 400/422 note go to the follow-up and the Lead.

Verdict: Approve 21fce934c89868b4855446f450c56ec5ac89170b

## Round 4 (diff only): head `277dbeda616cd36136a30df7eff5fc44640fd233`
Scope: `git diff 21fce934c..277dbeda6` without the record files (4 files, +19/−12). I reran `check_pf22v_saved_views` on this commit: **40/40**.

| Item | Now | Evidence |
|---|---|---|
| R3-1 a personal save confirms another person's source | Closed | `service.ts` `checked()` uses the "share" mode (firm-wide) only when the view is shared and the caller holds the share key. Every personal save, and every change of a personal view, is judged by what the saver sees. In `change()`, `b.shared ?? (owner === null)` parses as intended. New V9 fail case: a personal save naming another Agent's "Web form" gets 400 "…you can see", the same answer as a made-up source. |
| Breaker R3-m2 cf part past the match limit | Fine | The part is left out and the view opens `empty` with words ("…so the view shows nothing; narrow it"), never wider. At save the same reason gives a 400. |
| R3-2 a source gone from the whole firm opens empty, not dropped | Left for the Lead | Stated in the PR. A share-key holder's label now says "No lead in the firm has…", which helps. Nothing is widened. It stays a Minor for the Lead's decision, not a merge condition. |

No new findings. Open for the follow-up or the Lead, none blocking: R3-2, the per-view queries on GET (round 1 Minor 2), the 400/422 row note, and the screen honouring `empty` (PF-22s, Board included).

Journey score unchanged: **9.4 / 10, pass** (plain words ½ for R3-2). D-scores as in round 3.

Verdict: Approve 277dbeda616cd36136a30df7eff5fc44640fd233
