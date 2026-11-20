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

## Re-review 9bab80a24 (diff only: `git diff 48abcd4e5..9bab80a24 -- …/prototype`)
* **m3, breaker 7a/7b: closed.** `clients.ts:62-68` now drops the contract's `INVISIBLE` set (NUL included) from the search, turns tabs and line breaks into spaces, and escapes `\ % _` before Prisma `contains`, which passes LIKE wildcards through as written. A new test case shows `%`, `_`, `\` and `Sample<NUL>Client` each answer 200 and match nothing. A lone NUL is dropped and answers 200 with the firm's own full list, not a 500.
* **Breaker 2a: closed.** `case_client_display_name_check` now also refuses the contract's invisible characters (U+200B, U+200E, U+200F, U+2028-U+202E, U+2066-U+2069, U+FEFF) and names made of spaces only (ASCII, NBSP, U+2000-U+200A, U+3000). This is the same set as `contracts/runtime.ts:22` beyond `[[:cntrl:]]`. The backfill removes those characters and folds runs of space and control characters into one space before naming, so a name it cannot clean falls back to the label or the case number. The opening cannot hit the check: `principal.displayName` already passes `clean`, and JS `trim` removes every space the check refuses. The test adds NBSP, ZWSP, RLO and U+3000 names, all refused.
* **m2: closed.** `MODULE.cases.md` says the fill trigger is for fixtures and restores only and that application code always passes a client.
* **m1: partly closed.** `MODULE.demo.md` Tables now names caseClient and caseClientCounter. `module-cards.py pr` on `216aa33e6..9bab80a24` still flags `api-features` (`features/clients.ts`; that card lists no feature files). It needs a one-line `Card unchanged: a new feature file, the registration seam is unchanged` in the PR body. The only other FAIL is the 42-line `front-office/MODULE.md`, which is already on base and not this row's.
* **m4, m5, m6:** to go in the PR body, as you said. Nothing in the code changed for them.
* **Re-run by me on 9bab80a24** (fresh `csk1_rev` copy on :4651, stopped afterwards): `check_csk1_client.ts` 51/51, `check_csw1_firm_id.ts` 47/47, `check_prisma_schema.ts` 8/0.
* **Size:** the P-610 count (pr-rules.yml leaves out `product/screens/`) is 729 changed lines of code and tests against 216aa33e6, under 800.
* No new finding. No Blocker, no Major.

**Verdict: Approve**

Reviewer: Approve 9bab80a24

## Re-review 479f23131 (merge of main)
* **Merge:** 479f23131 has parents 695aeec36 (the branch: since 9bab80a24 only the review and break records, no code) and 34c5e1e99 (main, with #2125). I compared the row's diff against main, `git diff 34c5e1e99 479f23131 -- …/studio`, line for line with the reviewed `216aa33e6..9bab80a24` diff (`cmp` of the +/- lines): **identical**, 12 files, +719 / -10. The merge changed none of this row's lines.
* **Migration order:** main brings in `20261117120000_pf18a_offices`, `20261118073000_pf18b_support` and `20261118140000_fo13i_identity_check_key`. All three are earlier than `20261118230000_csk1_case_client`, which is still the newest and unique. None of them touches `runtime_case`, `case_client`, CS-W1's case triggers, `case_lookup` or the default privileges. The only privilege change is PF-18a's column-level UPDATE on `platform_staff_office`.
* **New case writers:**
  * No line main added calls `case.create`, `createCase`, `/api/runtime/cases` or `clientId`. `runtime.ts:323` is still the only `tx.case.create`. The callers of `createCase` are the same as before (`runtime.ts:1058`, `sample-case.ts:64`).
  * One new test writes `runtime_case` directly: `tests/check_pf18a_offices.ts:83-84`, a replica-role fixture inserted before PF-18a's migration, which later migrations then run over. CS-K1's backfill gives that case a client. I ran it on 479f23131: **87 passed, 0 failed**.
* **Main's ports:** `ports/events.ts` adds only `support.ticket_created` and `identity.checked`. `CaseClosedPayload`/`CaseReopenedPayload` still take `clientId: Uuid.nullable()`, which holds the case's client id. Main's new `ports/fo-person.ts` (FO-1p) is part 2's port; no part-1 code uses it.
* **Paths:** `docs/PATHS-MOVED.md` has no moved rows yet, and the merge renames nothing. The suite's usage line (`check_csk1_client.ts:12`) is in the form `product/tools/run-suites.sh` expects for an isolated suite, so the merge queue will pick it up.
* **Re-run by me on 479f23131** (fresh `csk1_rev` copy on :4651, stopped and dropped afterwards): `check_csk1_client.ts` 51/51, `check_csw1_firm_id.ts` 47/47, `check_pf18a_offices.ts` 87/0. I did not run the typecheck or the module-cards tree check myself; you report both passing.
* **Size:** the P-610 count against main is unchanged at 729 lines of code and tests.
* **Still open for the PR body:** m1 (`Card unchanged:` for `api-features`), m4, m5 and m6, as you said.
* No new finding. No Blocker, no Major.

**Verdict: Approve**

Reviewer: Approve 479f23131

## Part 2 review (17b41633f)

The Opus reviewer, fresh context, effort high, 19 Nov. Branch `claude/awesome-allen-4pfgcj` at **17b41633f**. Diff: `git diff origin/main...17b41633f` (17 files, +574 / -26; 522 lines outside `product/screens/`, under 800). Spec, in this order: `build-lead-c-briefs/CS-K1-2.md` on `claude/build-lead-c-647b40`, rulings 1-4 of 20 Nov winning; `RESUME-part-2.md` "Carried over from FO-8"; the builder's three points on #2255 (comment 7019181906). Rules: `STANDARDS.md`, `MODULE.cases.md`, `platform/MODULE.md`, `firm-scope.ts`. I changed no code. Live AI was off and nothing was spent. My copies were `csk1r2` on :4733 and `j72r` on :4734 (never :4400, :4641 or :4472). I stopped both, and removed my scratch worktree.

### What I ran
| What | Where | Result |
|---|---|---|
| `tests/check_csk1_client.ts 4733 xr_studio_csk1r2` | 17b41633f, fresh copy | **62/62** |
| `tests/journeys/j_72.ts j72r 4734` (`PLATFORM_IDENTITY=local PROSPECT_WON_POLL_MS=500`) | 17b41633f merged with #2321's head 38d96cf3f (clean merge, no schema or web change) | **26/26** |
| The same J-72, with FO-8's merge-value read switched off (`prospect-won.ts`: `representativeActorId` never set) | same | **26/26: W8 still passes** (M2) |
| `rollback.sql`, then `migration.sql` again, in one transaction on the validated copy | csk1r2 | Both clean. After the rollback: no column, no check, no function, no `_prisma_migrations` row, and all 12 links kept. After re-applying: the check is back as NOT VALID |
| The live job: a pending client inserted, then `isolated.sh restart` | csk1r2 | `cases.client_link:<firm>` completed as the firm (xr_app, withFirm). The client was linked, and the check was validated by the definer |
| The same again with a second pending client of that firm | csk1r2 | **never linked** (the job key is used up), and the validated check accepts it (M1) |
| After validation: insert a PERSON client of `sample-firm` with no `fo_person_id` and `fo_link_pending = true`; set a linked client's `fo_person_id = null, fo_link_pending = true` | csk1r2 | **both accepted** (M1) |
| `fo_person.created_by` after a simulated (`x-actor`) opening | j72r | `staff:user-O` (m1) |
I did not re-run fo1p, pf12, pf25, aud1m, csc1s, c617, `check_fo8_prospect_won` 43, `check_csc1_count` 40 or `check_case_feed` 42; those results are the builder's. I did not run full `ci`.

### Done when: does each pass and fail as named?
* **DW9: held.** The new client and its `fo_person` share one `xmin`, so they were written in one transaction. A throw forced in `inTx` leaves no client and no party. Both sides fail if the rule is removed.
* **DW10: held as a function test.** It runs `linkFirmClients` as the suite's bypass role, not as the app does. I ran the app path myself (above), and it works. The fail side ("a re-run links nothing") is real.
* **DW11: held.** Firm B's opening links to firm B's party. A link asked with firm B's id for firm A's client throws `linked meanwhile`, and B's new party rolls back.
* **DW12: pass held; the fail side is weak.** "No COMPANY client names an fo_person" is a count over the copy, not an input that must be refused. The check's refusal of a COMPANY client with only `fo_person_id` is in DW13, which covers it.
* **DW13: held for unflagged rows only.** The rows the builder's point 1 says DW13 tests ("cannot skip the link without setting the flag on purpose") are not tested. `newClient` sets the flag itself. See M1.

### The builder's three points
* **(a) `fo_link_pending` and `firm_id IS NULL`.** The `firm_id IS NULL` carve-out is sound: a key with no platform firm has no front office to link to. The flag is needed for the two triggers, which cannot call the port. As built, though, it is a permanent escape that any writer can set, so VALIDATE does not mean what the brief says. That is M1.
* **(b) `withFirm(case_firm_id_of_key(opener's key))`: sound in effect.**
  * The firm comes from the server's own data (the simulated opener's firm key), never from the body.
  * A staff scope of another firm gets 403 (`runtime.ts:322`).
  * The scope covers only the opening's transaction, which is narrower than `enterFirm`.
  * Two things for the Lead's firm-scope read. First, an `x-actor` request with no session now writes walled `fo_person`/`fo_company` rows and their audit lines; it also seeds the firm's front office when the firm has none (`fo-person-port.ts setup`). Second, `withFirm`'s doc (`firm-scope.ts:73`, "a job's firm; a test") and `platform/MODULE.md:13` (the list of allowed contexts) do not name this use (m5).
  * No test covers the 403 branch.
* **(c) SECURITY DEFINER `case_client_validate_link_check()`: sound.**
  * It takes no arguments, has a pinned `search_path` and no dynamic SQL, and EXECUTE is revoked from PUBLIC and granted to `xr_data` (xr_app inherits it).
  * VALIDATE takes SHARE UPDATE EXCLUSIVE, so writes go on. Two firms' jobs validating at once queue, which is harmless.
  * DW8 now pins exactly this one definer.
* **The `by` parameter (AUD-1m fault): right.** The `opened` and `added` lines now name `staff:<id>` in a signed-in open-case (`runtime.ts:261`). J-72 W3 is its failing case. No unit suite covers it, because `check_fo8` has no AUD-1m request context.

### Concurrency, bypass, poller, rollback
* **The job against an opening: held.** A new client is invisible to the job until its commit, and by then it is already linked. The job takes `FOR UPDATE`, re-reads, and writes only while both ids are null (`clients.ts:46`). A loser throws, and its port party rolls back.
* **Two openings at once: held** by CS-C1b's per-firm lock. A direct opening takes no prospect, so the "one prospect twice" race is FO-8's advisory lock plus its unique key.
* **FO-8's kind change against the job: held.** FO-8's clients are always linked (its update sets one id and nulls the other), so the job never selects them, and the row lock orders any overlap.
* **Firm scope:** `withFirm` inside `asBypass` drops the bypass, so every write runs as its own firm.
* **The poller's single-flight: held** (`tick`). `run` catches everything, and the timer is `unref`'d.
* **The poller's shutdown:** `onApplicationShutdown` clears the timer and waits for the run on `app.close()`. On SIGTERM, PlatformJobs exits the process first, which is harmless because each prospect is its own transaction.
* **The bypass's scope:** it also wraps the `case_client` query and `jobs.enqueue` (`live.ts:51-53`), which need no bypass (m7).
* **The rollback file: correct.** The functions match part 1 exactly, the order works, and the links are kept (run above).

### Findings
* **Major M1: the link check can be bypassed by application code, and pending clients made after a firm's one job are never linked.**
  * `newClient` writes `foLinkPending: true` (`clients.ts:33`), and the check passes any row with the flag (`migration.sql:21`). So a future caller of `newClient` that forgets `linkClient` passes the check: exactly the bug the check exists to catch.
  * Any code can also unlink a client by setting the flag; both were accepted after VALIDATE (run above).
  * The job is queued once per firm for ever (`live.ts:50-53`, the pg-boss key). A trigger-made pending client that comes later stays unlinked even after a restart (run above). Meanwhile `case_client_validate_link_check()` returns false for good.
  * Fix:
    1. Make `newClient` link first and insert with the id: call the port, then `create` with `foPersonId`/`foCompanyId` and no flag (`linkClient` keeps its guarded update for the job).
    2. Add a BEFORE INSERT OR UPDATE trigger on `case_client` that refuses `fo_link_pending = true` when `pg_trigger_depth() < 2` (on insert, or on update from false), so only the two triggers can set it.
    3. Add DW13 fail cases: an insert with the flag from code, and an update that unlinks with the flag, are both refused.
    4. Queue the link job again while pending rows exist, e.g. key `cases.client_link:<firm>:<highest pending client number>`, or have the poll's first run link pending rows directly.
* **Major M2: J-72 W8 does not discriminate (ruling 1).**
  * The signed version names `rep = R` (`j_72.ts:148, :151`), and user-R is also `sample-firm`'s `defaultRepresentative`, which `openingTeam` uses when the offer gives none.
  * With FO-8's merge-value read switched off, J-72 still passed 26/26. So "FO-8's first real run of that branch" is unproven.
  * Fix: have the version's `representative.staff_id` name user-T's staff id (user-T represents and is a platform staff member). Keep `fo_retainer.representative_staff_id` as R, which proves the version is read rather than the row. Then assert `benRep === "user-T"` at `:164`.
* **Minor m1:** a simulated opener's port actor becomes `staff:user-O` (`runtime.ts:342`), a staff word that names no staff member, on `fo_person.created_by` and on a FIRM_STAFF audit line. Fix: map it to `platform_staff.id` by `actor_id` in the firm, else use a `system:` word (for example `system:runtime.open-case`).
* **Minor m2:** a client the job fails on is only logged, and the job completes (`live.ts:33-35`), so it never retries. Fix: throw when `r.failed.length` is not zero; the handler is idempotent.
* **Minor m3:** a database with nothing to link at the first poll never validates the check (`live.ts:50-53`; the j72r copy ended with `convalidated = f`). Fix: call `case_client_validate_link_check()` once when the firm list is empty.
* **Minor m4, J-72 against ruling 1/2:**
  * DW-d does not assert `offAfter` (`:182-183`). It was 200 in my run, but a refused signing would pass the step without testing anything.
  * W2's wait is `3 * POLL + 2_000` (`:84`); the ruling allows at most three intervals.
  * The prospect screen has axe but no 1024/1440 check.
  * W5 is FO-5's route, because `web/src` has no Signed offline action (grep). Label it "API step: …" as W3 is.
* **Minor m5, the cards:**
  * `MODULE.cases.md:27` still says "Nothing delivers events while the app runs", and `:28` says "`fo_person_id`, `fo_company_id` empty until part 2".
  * Add the link invariant, the flag, the definer function and the opening's `withFirm`. Invariant lines are not frozen.
  * Name the case-opening context and the second definer in `platform/MODULE.md:13`, and widen `firm-scope.ts:73`'s doc.
* **Minor m6:** DW12's fail side is a count, not a refusal. Add a COMPANY client passed with only `fo_person_id` through `linkClient`'s update, or point to DW13.
* **Minor m7, the bypass's scope:** move the `case_client` query and `enqueue` out of `asBypass` (`live.ts:47-53`). Note for the Lead: one `platform_bypass` line per poll is 8,640 a day at 10 s (310 in my four-minute J-72 run at 500 ms).
* **Carried over from FO-8: all done.** The `Tests:` line is back (`MODULE.cases.rows/FO-8.md`). The q + U+0301 cut case is in and fails on a code-point cut. The `case.opened` words are reworded. `OFFER_REFUSED.CHANGED` is updated.

### Journey test (reviewer role, the one score for this check)
Report: `screens/CS-K1/journey-test-reviewer-2026-11-19.md`. Score **8.5 / 10**. No criterion is at 0, so it passes the bar. "Correct data" is ½ because of M1 and M2.

### What I could not check
* Full `ci` on the head.
* The suites listed above that I did not re-run.
* A real screen reader.
* An intended user's unaided walk (D17 and D20 stay with the founder).
* J-72 on `main` after #2321 merges: I ran it on a local merge only.

Verdict: Changes needed. Blockers: none. Majors: M1 (`clients.ts:33`, `migration.sql:21`, `live.ts:50-53`), M2 (`j_72.ts:148-164`). Minors: m1-m7 as listed above.

## Part 2 re-review (4715e7873)

Diff only (P-277): `git diff 17b41633f..4715e7873 -- …/prototype` (11 files, +92 / -49). The commits after it touch records only: c25bd2f38 (`qa/built/R1.72.md`) and 19348c3f3 (`screens/CS-K1/`). I changed no code. Live AI was off and nothing was spent. I worked in a scratch worktree at 4715e7873 merged locally with #2321's head (38d96cf3f, a clean merge), with copies `csk1r3` on :4735 and `j72r3` on :4736. I stopped both and removed the worktree afterwards.

### What I ran
| What | Result |
|---|---|
| `check_csk1_client.ts 4735 xr_studio_csk1r3` (fresh copy) | **64/64** |
| `j_72.ts j72r3 4736` (`PLATFORM_IDENTITY=local PROSPECT_WON_POLL_MS=500`) | **27/27**: W8 reads `"user-T"`, and W2 took 239 ms |
| The same J-72 with FO-8's merge-value read switched off (the mutation from my first review) | **26/27: W8 now FAILS with "user-R"**, so the test now catches it |
| On the validated copy: insert an unlinked PERSON client with `fo_link_pending = true`, and unlink a linked one while setting the flag | both refused by `case_client_pending_guard` |
| Unlink a linked client without setting the flag | refused by `case_client_front_office_link_check` |
| Live, with no restart: a pending client via a direct case, wait about 20 s, then a second one, wait again | **both linked**: two `cases.client_link` jobs completed, under keys taken from each one's oldest waiting client |
| `rollback.sql`, then `migration.sql` again, in one transaction | clean. After the rollback there is no column, trigger, function, check or `_prisma_migrations` row, and all 19 links are kept. Re-applying brings the trigger back |
| `fo_person.created_by` after a simulated opening (j72r3) | `system:runtime.case-opening` |
| Five breaker-style names `POST`ed as `x-actor` user-O | three answered as expected (two 201, one 400). **Two still answer 500** (see m8) |

I did not re-run fo8 (the builder reports 43/43), the typecheck or full `ci`.

### My findings
* **M1: closed.**
  * `newClient` gets the party through the port and inserts the client already linked (`clients.ts:154-160`). It never writes the flag.
  * `case_client_pending_guard` (`migration.sql:27-35`) refuses the flag below trigger depth 2. App writes run at depth 1, while the two database triggers' writes run at depth 2 or deeper, so the guard tells them apart. It fires only on `UPDATE OF fo_link_pending`, which is enough: the flag can only change if it is named in the SET list.
  * The new DW13 fail case covers both of my writes and an unlink without the flag.
  * The job is now queued again on every run while any client waits (`live.ts:107-109`); I watched it link two clients in a row.
  * One residue, raised to the Lead below as m9: if the oldest waiting client of a firm fails on every retry, its key stays the same, so the clients behind it in that firm wait as well.
* **M2: closed.** The signed version names user-T, while the retainer row and the firm default name user-R. The assertion is `benRep === "user-T"` together with the retainer row still naming R (`j_72.ts:148-167`), and the mutation now fails it.
* **m1: closed.** A simulated opener's port actor is now `system:runtime.case-opening`, and a signed-in opener stays `staff:<id>` (`runtime.ts:340`).
* **m2: closed.** The handler throws on any failure, so pg-boss retries (`live.ts:36`).
* **m3: closed.** With nothing waiting, the poll validates once (`live.ts:110`). It ended as `convalidated = t` on j72r3.
* **m4: closed.** W2 waits at most 3 intervals, the prospect screen gets the 1024/1440 check, W5 is labelled as an API step, and DW-d asserts the 200.
* **m5: closed.** `MODULE.cases.md:27-28`, `platform/MODULE.md:13` and `firm-scope.ts:73` are updated.
* **m6: closed.** DW12's fail side is now a refusal by the database.
* **m7: closed.** Only `catchUpProspectsWon` is inside `asBypass` now (`live.ts:105`). The `case_client` query, the enqueue and the validation run with no scope, which is correct: `case_client` is not walled.
* **Breaker F1: mostly closed.** The Persian ZWNJ name, the soft hyphen and "!!" open and are linked, with the new DW9 case.

### New or remaining
* **Minor m8, two names still answer 500, with nothing written (F1 residue):**
  * `"Ab⁥cd Sample"`: U+2065 is unassigned (Cn), so `NOT_KEPT` keeps it. The port's text rule refuses U+2060-U+2069 by range.
  * `"ாாா"`: combining marks only. `hasWord` (Alphabetic) is true, but the port's `HAS_WORD` (`\p{L}\p{N}`) is false.
  * The api log shows `FoPersonInvalidInput` both times.
  * Neither is a realistic name.
  * Fix (`clients.ts:134-135`): in `partyFor`, catch `FoPersonInvalidInput` and retry once with `Client <code>`. That holds whatever the port's rule becomes. Or test with both `hasWord(v) && /[\p{L}\p{N}]/u.test(v)` and strip `[⁠-⁯]`.
* **Minor m9, for the Lead (no change needed now):** the job key is taken from the firm's oldest waiting client (`live.ts:108-109`). If that one client fails on every retry, the key stays used, so the clients behind it in that firm wait too, until it is fixed by hand. Recording the dead job in the log is enough for now.
* **F4 (an `x-actor` request with no session writes front-office rows): rightly left as a firm-scope question for the tech lead.** It is the same point as my first review's note on (b). It does not block this verdict.
* **Size:** the PR stays well under 800 lines; this diff adds only 43 net.

### Journey score
The journey score was not re-scored for this diff-only check. "Correct data" was ½ only because of M1 and M2, and both are now closed. My first walk's 8.5 / 10 stands as the score of record.

No Blocker. No Major. Open Minors: m8, m9.

Verdict: Approve

Reviewer: Approve 4715e7873

## Part 2 re-review (40639a2de)

Diff only (P-277): `git diff 4715e7873..40639a2de -- …/prototype`, which changes 2 files: `clients.ts` (+7 / -3) and `check_csk1_client.ts` (+2 / -2). The rest of the commit is records. I changed no code. Live AI was off and nothing was spent. I worked in a scratch worktree at 40639a2de with my copy `csk1r4` on :4737; I stopped the copy and removed the worktree afterwards.

* **m8: closed.**
  * `partyFor` (`clients.ts:35-43`) asks the port with the cleaned name. On `FoPersonInvalidInput` only, it asks once more with `Client <code>`, and any other error is still thrown.
  * Carrying on in the same transaction is safe. The port's `parsePersonInput`/`parseCompanyInput` is its first line (`fo-person-port.ts`), so a refusal is a JS throw before any SQL runs, and PostgreSQL never marks the transaction as failed.
  * The fallback always passes the port's rule: "Client CL-00001" has letters and digits for both the person and the company rule.
  * The job's `linkClient` goes through the same `partyFor`, so the job is covered too.
* **What I ran:**
  * `check_csk1_client.ts 4737 xr_studio_csk1r4` on a fresh copy: **64/64**. The DW9 (breaker F1) case now holds five names, my two included.
  * My own five names, posted as `x-actor` user-O:
    * `"Ab⁥cd Sample"` gave 201, and its party is "Client CL-00017".
    * `"ாாா"` gave 201, and its party is "Client CL-00018".
    * A tag character gave 201, and its party is "Abcd Sample".
    * U+2028 gave 400 in words, from the case side's own check.
    * Two emoji gave 201, and the party is named by its code.
  * Every client is linked, and none is waiting.
* **A small gap in the test, not a finding:** the new DW9 names are checked for 201 and a link, not for the party's name. My run above shows both are named by their code.
* I did not re-run J-72 (this diff does not touch it), `check_fo8`, the typecheck or full `ci`.

No Blocker. No Major. Still open: m9 (the Lead's note on the job key) and F4 (the firm-scope question for the tech lead), as recorded at 4715e7873.

Verdict: Approve

Reviewer: Approve 40639a2de

## Part 2 re-review (c84e1eb08, main merged)

Diff only (P-683, Lead 81's chain). c84e1eb08 has two parents: 0cf50a5cb, the branch, and abf2176ef, main with #2321 (FO-2w). After my Approve at 40639a2de the branch's own commits touch only `screens/CS-K1/*.md` (+121 lines, no code). I changed no code. Live AI was off and nothing was spent. I worked in a scratch worktree at c84e1eb08 with my copy `fo8r5` on :4738; I stopped the copy and removed the worktree afterwards.

* **The row's diff is unchanged by the merge.** I compared `git diff abf2176ef c84e1eb08 -- …/prototype` (the row against today's main) with `git diff 37d1b196d 40639a2de -- …/prototype` (the reviewed row against its old base), using `cmp` on the +/- lines. They are **identical**: 581 changed lines, 18 files, +549 / -32.
* **Of my touched files, the merge changed only the two you named, and only main's own lines:**
  * `firm-scope.ts` gains PF-19p's two BYPASS_USES entries (`job:messages.send`, `platform.account.mail`), which sit beside `cases.prospect-won.catch-up` (still exactly one entry).
  * `runtime.ts` gains CS-V1 part 3's `CaseListQuery`/`QuestionnaireQuery` parsing in `list`, the new `questionnaire` method and two controller lines. None of that touches `createCase`, `by`, `newClient`, the opening's `withFirm` or the FO_PERSON_PORT injection.
  * Every other file of the row is the same at 40639a2de and c84e1eb08.
* **The migrations still line up.** Main adds `20261119163000_pf19p_platform_account_mail`, `20261119170000_pf18bk_support_keys`, `20261119173000_pf4dn_invitation_display_name` and `20261119180000_pf18a_notification_prefs`. All four are earlier than `20261120100000_csk1_client_link_check`, which is still the newest and unique, and is the slot Lead 98 confirmed. None of them names `case_client`, `runtime_case`, `case_lookup`, `fo_person`, `fo_company` or the default privileges.
* **Main adds no new writers or harnesses that this row affects:**
  * Main's changes outside FO-2w add no `createCase`, `newClient`, `case_client` write, port call or `prospect.won` reader.
  * No suite that puts `Runtime` in a Nest module is missing the `FO_PERSON_PORT` binding: I grepped every `providers: … Runtime` in `tests/`.
* **FO-2w's payload matches what FO-8 and J-72 read:**
  * `winProspect` builds the payload with `wonPayload` (`front-office/sales/prospects.ts:96-112`): `won_via: via`, and `retainer_id` set to the retainer that made the win. For Signed offline that retainer is the one `retainers/service.ts:609` names. Both go through `ProspectWonPayload.parse`, where `won_via` is the enum E_SIGNED/SIGNED_OFFLINE/CONVERTED and `retainer_id` is a nullable uuid.
  * FO-8's `offerOf` reads `retainer_id` and takes the representative from that retainer's version merge value. It deliberately does not take the payload's `representative_staff_id`, which comes from the retainer row.
  * J-72 W8 (user-T in the version, user-R on the row) is exactly what tells the two apart. `won_via` goes only into FO-8's audit detail, and J-72 W5 asserts `won_via = SIGNED_OFFLINE` with this `retainer_id`.
* **What I ran on c84e1eb08** (fresh copy): `check_fo8_prospect_won.ts` **43/43** and `check_fo2w_won_event.ts` **19/19**, the two suites where FO-2w and this row now meet, with the copy's own poll running. `check_csk1_client` and J-72 are being run by the builder (twice each); I did not repeat them. I also did not run full `ci` or the typecheck.

No new finding. No Blocker, no Major. Still open from before: m9 (the job key, a note for the Lead) and F4 (the firm-scope question with the tech lead).

Verdict: Approve

Reviewer: Approve c84e1eb08
