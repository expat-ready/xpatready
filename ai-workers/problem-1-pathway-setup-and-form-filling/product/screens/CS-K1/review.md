# CS-K1 part 1: independent review (the client record and a client on every case)

The Opus reviewer (P-303, effort high), 18 Nov. Branch `claude/amazing-cerf-wgea9w`. I was asked for 6bc567a36. The heads then moved to aa38bfa17 and **48abcd4e5**, and this verdict is for **48abcd4e5**. The branch head 6f5d6d4d5 only adds `screens/CS-K1/break-report.md`, with no code. Diff checked: `216aa33e6..48abcd4e5` under `prototype/studio/`. Spec: `build-lead-c-briefs/CS-K1.md` (this one wins) and the draft `briefs/CS-K1.md` part 1 (a7014c0bb). API and schema only, no screen. I changed no code. Live AI was off and nothing was spent. I used my own isolated copy `csk1_rev` on :4651 and stopped it afterwards.

## What I ran (results)
| Suite | Head | Result |
|---|---|---|
| `tests/check_csk1_client.ts 4651 xr_studio_csk1_rev` | 6bc567a36, aa38bfa17, 48abcd4e5 (fresh copy each time) | 50/50 each time |
| `tests/check_csw1_firm_id.ts` (CS-W1, must pass unchanged) | aa38bfa17 | **44/47**: three DW2 fails (see "Fixed while I reviewed") |
| `tests/check_csw1_firm_id.ts` | 48abcd4e5 | 47/47 |
| `check_csc1_count` 40/40, `check_a24_case_number_api` 23/23, `check_csc1_close` 55/0, `check_case_feed` 39/39, `check_a24_case_number_migration` 28/0, `check_css1_index` 53/0 | aa38bfa17 (48abcd4e5 changes only the fill trigger's firm id, re-checked by the two suites above) | all pass |
| Configured checkpoint load (C10.1) on the real copy server | 48abcd4e5 | 201. Its case got CL-00001 "Client A (Sample)" |
| `module-cards.py tree` | 48abcd4e5 | only FAIL: `api/src/front-office/MODULE.md` is 42 lines (the same on base 216aa33e6, not this row's) |
| `module-cards.py pr` on this diff with an empty body | 48abcd4e5 | FAIL: `api-demo` and `api-features` cards not touched (m1) |
| PR size vs 216aa33e6 | 48abcd4e5 | 11 files, +705 / -9 = **714 lines**, under 800 (P-610) |

## Done when: each case, with a real fail side
* **DW1:** 245 cases across three firm keys (240 of them for one firm) each get exactly one client. Counts match (cases = distinct client ids = clients). Clients are named from the profile, then the label, then "Client of <case number>", and numbered in opening order with no gap. Fail side: the migration text is patched so one case is skipped, run with `psql -1`. It stops in words before NOT NULL, and `case_client` does not exist afterwards. Held.
* **DW2:** gets the next code. Two openings at once get consecutive numbers, with no duplicate in the firm. Held. On the real server, two posts at once with the same idempotency key gave one case and one client.
* **DW3:** a reused client gives one client for two cases, with no new number spent. An unknown uuid, `not-an-id` and `""` all give 404 "No such client." and write nothing (counts compared). Held.
* **DW4:** a CORPORATE pathway gets COMPANY (backfill and opening). Family and INDIVIDUAL get PERSON. Held. `case_client_kind_of` reads the same PATHWAY-node rule as `case-count.ts`/`case-close.ts`.
* **DW5:** firm B gets 404 on reading firm A's client, an empty list, and 404 "No such client." when it passes `clientId` at opening. Firm A's row is unchanged (row compare). No token, or x-actor alone, gives 401. I repeated this on the real copy server with PF-4 local sign-in: firm B's read of A's client gave 404, its name search returned 0 rows, its opening with A's id gave 404, and its read of A's case gave 404. Held.
* **DW6:** a client with both front-office ids is refused (`case_client_one_front_office_check`). The same prospect twice in one firm is refused, and allowed across two firms. There is no foreign key into the front office. Held.
* **DW7:** under a full plan limit, a new-client opening and a reused-client opening both give 409 and leave nothing: cases, clients and counters are unchanged. The next allowed opening takes the next number. Held.
* **DW8:** the stamp is the newest and unique. `migrate diff` is empty. The 5 added functions are all `case_client_*` and none is `prosecdef`. The rollback text names every object, in an order that works. Applying the migration twice is refused. Held.
* **DW8a:** client firm_id equals case firm_id for every row. A case pointed at another firm's client is refused by the key. Forcing a client's firm_id to the other firm is refused by `runtime_case_client_id_firm_id_fkey`. A client row with a wrong firm id is refused by `case_client_firm_from_key`. When a key gains a platform firm later, the client follows (`case_client_follow_firm`). Held.
* **Ruling (1):** `case.closed` (withdraw and close) and `case.reopened` carry the case's `client_id` (`case-close.ts:131, :146, :162`), each tested. Held.

## Migration (P-423 points for the Lead)
The column is added nullable, then the backfill runs per case, in a stable order, through the same counter function, before the triggers exist. A check then raises in words, and only after it `SET NOT NULL` (`migration.sql:166-171`) and both keys run. Every function is SECURITY INVOKER with a pinned `search_path`. EXECUTE on `case_client_next_number`/`case_client_kind_of` is taken from PUBLIC and granted to `xr_data` (`:145-146`). The table rights come from PF-12's default privileges. `case_client` is not in PF-12's walled families (platform_/fo_/money_/msg_/auto_), the same as `runtime_case`. The counter is an `INSERT … ON CONFLICT DO UPDATE` (`:103`), safe under concurrency even for a firm's first client, and openings are already serialized per firm by CS-C1b's advisory lock. I found no lock-order inversion: `createCase` is the only code path that takes both counters (client, then case), and the only `tx.case.create` (`runtime.ts:323`).

## The builder's departures
1. **`client_record`, not `client`:** right. `web/src/runtime/cases.tsx:348, :353, :367` read `c.client` as the answering login. Renaming it would break screens outside this row. FO-8/CS-98b need to be told (m4).
2. **`firm_key` plus the double firm-matched key, and `case_client_follow_firm`:** right while CS-W1 part 1 leaves `firm_id` nullable. The key path always holds, and the firm-id path holds once both ids are filled. CS-W1 part 2 should move the per-firm uniques to `firm_id` (m5).
3. **The `case_client_for_case` fill trigger (ENABLE ALWAYS):** acceptable. It keeps about 15 fixtures and restores working with NOT NULL. It has one side effect, recorded as m2.
4. **An audit line only, no `client.created`:** as Lead 61 ruled. The line names the case (so `case-feed.ts` gives it to that firm only) and carries the code, never the name. Held.
5. **`demo.ts` deletes the clients and the counter on reset:** needed. `case_client` has no foreign key to `workspace`. A leftover in a deleted workspace is also caught by `sweepOrphans` (`demo.ts:606`, every `workspace_id` table).
6. **`employer-cases.ts` untouched:** right. It creates no case (grep: the only `case.create` is `runtime.ts:323`).

## Fixed while I reviewed (closed, recorded for the Lead)
* aa38bfa17 broke CS-W1's own suite (`check_csw1_firm_id.ts` 44/47: three DW2 fails, e.g. `"ERROR: case_client_firm_from_key: the firm id given is not the platform firm of key \"sample-firm\""`). The cause: on `runtime_case`, BEFORE INSERT triggers fire in name order, so `case_client_for_case` runs before CS-W1's `case_firm_from_key`. It passed the case's wrong `firm_id` to the new client, which was refused first, in the wrong words. 48abcd4e5 now gives the new client its key's firm (`migration.sql:127`), so CS-W1 refuses the case in its own words. Verified 47/47. Note for later rows: any new BEFORE INSERT trigger on `runtime_case` whose name sorts before `case_firm_from_key` sees an unfilled `firm_id`.

## Findings
No Blocker. No Major.
* **Minor m1, the module-card PR check:** `module-cards.py pr` fails on this diff unless the PR body carries `Card unchanged: <reason>` for `api-demo` (`demo.ts:564`) and `api-features` (`features/clients.ts`), or those cards change. `MODULE.demo.md` "Tables" does not list caseClient/caseClientCounter, though reset now deletes them, so updating that card is the better fix.
* **Minor m2, the fill trigger hides a missing client:** `case_client_for_case` (`migration.sql:122-134, :179-180`) gives any insert that lacks `client_id` a "Client of <case number>". NOT NULL therefore no longer catches an application path that forgets the client (FO-8 and CS-98b will call `createCase` with `clientId`). Fix: state in `MODULE.cases.md` that application code always passes or makes the client (`clients.ts newClient`) and that the trigger is for fixtures and restores only. Optionally, have the trigger's client carry `created_by = 'system:case_client_for_case'` always, so such clients can be found.
* **Minor m3, the client list query (breaker 7a, 7b; confirmed in code):** `clients.ts:60-63` passes the text straight to Prisma `contains`. A NUL (`query=%00`) answers 500. `%` and `_` act as wildcards, but only within the firm, so nothing leaks. Fix: refuse or strip control characters with the contracts' `clean`, and escape `%`, `_` and `\`.
* **Minor m4, the brief's words:** the brief names the field `client: {…}`; the code returns `client_record` (`runtime.ts:367`). Say so in the PR body for FO-8 and CS-98b.
* **Minor m5, keys to move later:** the client number and prospect uniques are per `(workspace_id, firm_key)` (`migration.sql:77-80`). That matches "per firm" today. CS-W1 part 2 (the identity switch to `firm_id`) should carry these with it. A note for that row, not a change here.
* **Minor m6, two firm rules for one table:** `newClient` (`clients.ts:28`) leaves `firm_id` to the column default (`app.firm_id`), while the fill trigger now uses the key's lookup. Both are checked by `case_client_firm_from_key`, so a wrong firm is refused either way. Only the refusal's wording differs.
* The breaker's other Minors (2a invisible characters reach names by the backfill, 1a backfill time at 100k cases, 15 replica role, 16a/16b firm-fill windows, 7c ASCII-only case folding) are confirmed as described in `break-report.md`. None blocks.

## Journey test (reviewer role, the one score for this check)
API journeys, with no browser and no screen. Report: `screens/CS-K1/journey-test-reviewer-2026-11-18.md`. Score **8.8 / 10**: 7 of the 8 applicable criteria scored. Accessibility, screen sizes and visual quality are N/A because part 1 has no screen. No criterion is at 0. **Pass.**

## What I could not check
Full `ci` on the head (that is the PR's CI, after #2125 merges and the stamp is re-taken). The re-stamped migration needs a diff-only Approve on its new head (Lead 81's chain).

**Verdict: Approve**

Reviewer: Approve 48abcd4e5
