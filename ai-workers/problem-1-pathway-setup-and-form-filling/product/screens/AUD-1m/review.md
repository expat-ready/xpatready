# AUD-1m part 1 review (reviewer, 18 Nov 2026), commit c6e9c6326f066cb2803f55b2cdf8648ec782f001

**Scope:** runtime row, no screen. Diff `1b2defdb..c6e9c632` (871c9465 = AUD-1b's review record, not reviewed). Spec: Build Lead C's brief `build-lead-c-briefs/AUD-1m.md` @a7014c0bb, Part 1 and its "Done when". Context read: AUD-1a migration, `platform/audit/`, `case-feed.ts`, `hook.ts`, `identity/guard.ts`.
**Skill verdict:** Rework (one Blocker, two Majors). Journey score **9.5 / 10** (pass): `journey-test-reviewer-2026-11-18.md`.

## What I ran (own worktree at c6e9c632; Postgres 127.0.0.1:54329; isolated copy `rv_aud1m` on :4438, runtime lane range, never :4400)
* `check_aud1m_case_writes.ts` **16 / 0**; `check_case_feed.ts` **42 / 42**; `check_aud1b_adapter.ts` **33 / 0**; `check_pf0p_ports.ts` **122 / 0**; `check_aud5_keep_periods.ts` **57 / 0**.
* **`check_aud1a_insert_only.ts 4438 xr_studio_rv_aud1m`: 40 passed, 1 failed** (Part A and Part B, demo reset included). The failing case is DW5 fail (line 104). At base 1b2defdb, with only `core.ts` swapped back, the same case passes (Major 1).
* typecheck: no new errors (15 known; the api run needs `--max-old-space-size=6144` here). Port contracts: 0 problems. count-any: 416 (baseline 433). `graph.mjs --check`: exit 0. Module cards: pass.
* Demo: on :4438, Load the finished story wrote about 3,700 lines through `Audit.log` with none refused. As the case officer, Generate a copy wrote `form copy` queued/generated lines. Each line had the request's correlation id, FIRM_STAFF and a null firm.

## Mutations (P-606; one change each, then the named suite)
| Rule removed | Red |
|---|---|
| CaseEntry's area-entity refine | CW2 fail ×2, CW6 fail |
| CaseActor accepts any word | CW2 fail |
| fake keeps case lines apart | CW2 pass, CW2 fail |
| caseIdOf's 8-character agreement | CW3 fail |
| caseId not passed / detail.case not read | CW3 pass |
| tx ignored (the first Audit's db used) | CW4 fail |
| firm from context → null | CW5 pass, CW6 pass |
| correlation id → null | CW5 pass |
| OUR_STAFF refusal / exact-actor refusal / alarm bypassed | CW6 fail (each) |
| `TYPED_WORD` mapping removed | the run aborts in CW5 (CaseActor refuses `rules`) |
| `actorWordOf` made the identity | CW5 fail |
| the new CLIENT / FIRM_STAFF branches of `actorTypeOfWord` | the run aborts through the trigger (no case names it) |
| adapter routing by `isCaseEntry` | the run aborts in CW3 |
| case line into `platform-audit` | CW7 pass, CW7 fail |
| sweep's case-line rule; case line read as port line | check_case_feed's AUD-1m fail; AUD-1m pass and fail |
| one more direct `auditEvent.create` | CW1 pass |
| **the four reader edits (`actorWordOf` in form-uses, library-items, lifecycle, peopleNames)** | **nothing fails** (minor 2) |

## Fail-closed survey (223 `Audit.log` calls; `req.platform` is set only on PLATFORM_ACCESS routes)
* Actors passed: `actor.id` (211), `w.id` (a simulated id or `person:<subject>`), `author.id`, `x.createdBy`, `opts.recompare.id`, the finder's `by` (`"system"`), and `"rules"` (findings.ts:86, review-runs.ts:161). Every one is a CaseActor word or one of the two mapped words. The AUD-1a trigger already refused anything else.
* No case-side `Audit.log` runs inside a platform-guarded request or a firm job today. Case-close's keyed routes still write `auditEvent.create` directly (part 2). So the exact-actor and OUR_STAFF refusals refuse no current caller, and every case line has a null firm. The demo reset's delete rule still holds (AUD-1a Part B green).
* My shape probe compared head against base on a scratch database. `detail: null`, `{}`, arrays and Dates still write. Three shapes are newly refused: an empty `action`, an `entityKey` over 2,000 characters, and an `undefined` key (`entityKey` is typed). No caller on main passes any of them. A non-uuid workspace or combination id was already refused by the database. The `entity` is now stored trimmed.
* Transactions: `new Audit(tx)` writes in the caller's transaction (CW4). The injected `Audit` writes on the client, as before. `audit_event` has no RLS, so the walled `Db` changes nothing.
* Alerts: one `audit_write_failed` per refusal, with ids only (`alertIds`). The firm comes from the context only (CW6).
* Display: the activity feed's Who column reads as before for the reviewer and the firm staff (screenshots below). `system:rules` and `system:studio` display as `rules` and `system`. The feed JSON now also carries `correlationId` (an id, not personal data).

## Issues (ranked)
1. **Blocker (Must): a symlink to a local folder is committed.** `prototype/studio/node_modules` (mode 120000, target `/home/user/xpatready/…/studio/node_modules`) was added in 278d7393. `.gitignore`'s `node_modules/` matches directories only, and the push guard did not catch it. On any clone with a real `node_modules` (the Mac's main copy, the :4400 demo update), checkout replaces or conflicts with the installed folder and leaves a link that points nowhere. AGENTS.md rule 1 forbids committing local tools. **Fix:** `git rm --cached` the link in a new commit (no history rewrite) and add `prototype/studio/node_modules` (without the trailing slash) to `.gitignore`.
2. **Major (Must): AUD-1a's suite no longer passes unchanged** (a "Done when" item). DW5 fail (`check_aud1a_insert_only.ts:103-105`) expects an unknown word to be refused "naming the word" (`actor word 'alice' has no actor type`). CaseEntry's zod error (`audit-event.ts:72`) now refuses it first, with a generic message. **Fix:** in `recordCase`, before `CaseEntry.parse`, refuse a word CaseActor does not accept with `AuditRefused("audit line refused: the actor word '<w>' has no actor type (staff:<id>, person:<id>, system:<door>, seed:<row> or a simulated person's id)")`, the trigger's own words. Keep the one alert. Then run AUD-1a in full (Part B on an isolated copy).
3. **Major (Must): "A case action's line carries its case_id" holds only for lines that already hold the full uuid.** `caseIdOf` (`core.ts:151-155`) needs the uuid in the key or `detail.case`. In the finished story, 11 of 613 case-naming lines got a `case_id`: `case fact` 0/368, `section` 0/94, `form copy` 0/62, `item` 0/28, `group` 0/23, `sign step` 0/6 (only `case`, `person` and some `filing` lines). My Generate a copy walk wrote "on case 4289e220" with a null `case_id`. CW3 pass uses keys no real caller writes (`cw3-${CASE}`). The brief says "parsed the same way case-feed.ts parses it today", and `caseOf` reads the words. **Fix:** when `caseOf` gives 8 characters and no uuid agrees, look the case up in the same workspace with the line's own `db`/`tx`, in one indexed range query (`id between '<8>-0000-0000-0000-000000000000' and '<8>-ffff-ffff-ffff-ffffffffffff'`). Exactly one match sets `case_id`; zero or several leave it null (never guessed). Add CW3 cases shaped like real callers (`form copy`, key `IMM 5257`, words "on case <8>"; two cases sharing 8 characters → null). If the tech lead rules otherwise, record that ruling in the PR body.
4. **Minor (Should): touch list.** The brief names "one line in `api/src/core` MODULE card". The builder changed `platform/MODULE.md` instead, and `MODULE.core.md` is unchanged. The edits to `audit-event.ts`, `context.ts` and the four readers are outside the touch list. List them in the PR body for the release holder's OK.
5. **Minor (Should, P-606): the reader mapping has no test.** Reverting `actorWordOf` in `form-uses.ts:45`, `library-items.ts:124`, `lifecycle.ts:222` or `studio.ts` `peopleNames` turns nothing red. Add a CW case: write a `"system"` line through `Audit.log`, check that `formUses` history shows "The studio", and that `peopleNames("system:rules")` gives `rules`.
6. **Minor (Should): the count.** CW1 leaves 30 writes in 22 files; the brief says 25 in 20. Three of them are platform writes (`platform/identity/audit.ts` ×2, `platform/settings.ts` ×1) that part 2's "20 files" do not cover. As written, the final grep ("only the adapter") can never pass after part 2. Put it in the PR body as "Question for the tech lead", with the 27 case-side writes named.
7. **Minor (PR body): forward notes.** (a) Name the two mapped bare words and their callers, as the brief asks: finder.ts:550 `system` → `system:studio`, and findings.ts:86 and review-runs.ts:161 `rules` → `system:rules`. (b) Once CS-W1 puts the actor on case routes, the rules' resolve-on-read lines inside a staff request will be refused by the exact-actor rule, and so would the reads. Name this for CS-W1. (c) `fakeAudit`'s `failOn` never applies to case lines, so a test cannot force a case-line failure through the fake.

## D1–D20 (runtime row; screens unchanged)
D1 Requirement fit 3 (issues 2 and 3) · D2 Data integrity 3 (case_id gap) · D3, D4, D7, D10, D14, D18 N/A · D5 Stability 4 (fail-closed, tx rollback CW4, demo reset green) · D6 Governance 4 (actor type and correlation on every case line) · D8, D9, D11, D12 4 (the activity and case pages are as before; screenshots) · D13 4 (axe 0 at 1440 and 1024; 400 px with no sideways scroll) · D15 4 (activity in 0.75–0.85 s) · D16 Testability 3 (issue 5; one case uses synthetic keys) · D17, D20 simulated only · D19 3 (the line exists; its case link does not, for most actions).

## BIC scorecard (EXPERIENCE §6)
BIC-01 to BIC-20: N/A. This row changes no case-side screen. The case page (Generate a copy at 1440 and 1024) and the firm feed read as before.

## Could not check
The builder's 185-suite case-side run (not run here, as asked) and full `ci`. A real screen reader. Real browser zoom at 200 %. The "same lines as before" check against a base-commit demo side by side; the feed filter is unchanged code, and CW7 covers the stored lines.
Screenshots (scratchpad): `/tmp/claude-0/-home-user-xpatready/638253a0-8bdc-51bf-9031-692e99a4266c/scratchpad/shots/`.

**Verdict: Block.** Fix 1 (Blocker), 2 and 3 (Major). Then re-review only the new commits.

## Round 2 (diff-only `c6e9c632..602f892d`, head 602f892d63f2856a322c367276125cb59cb96ec5)
Own worktree at 602f892d; isolated copy `rv_aud1m` on :4438 (stopped afterwards). Not run: the builder's 185-suite run and full `ci`.
* **B1 fixed.** The link is deleted in 602f892d. `.gitignore` gains a bare `node_modules` line, and `git check-ignore` confirms it now matches a link (`.gitignore:4`). The link stays in 278d7393's history, which is right: no rewrite.
* **M2 fixed.** `recordCase` refuses a word CaseActor does not accept with an `AuditRefused` in the trigger's words, before `CaseEntry.parse`, inside the alarm, so the one alert stays. **`check_aud1a_insert_only.ts 4438 xr_studio_rv_aud1m`: 41 passed, 0 failed** (Part A and Part B). Reverting the refusal, or changing its words, turns CW6 fail red.
* **M3 fixed.** `caseIdOf` takes caseOf's 8 characters and looks the case up in the line's workspace, in the caller's client or tx, with a primary-key range and `take: 2`. Exactly one match gives the case id. Checks on the finished story run on :4438:
  * **609 of 613 case-naming lines carry a `case_id`**: case fact 368/368, section 94/94, form copy 62/62, item, group, sign step and the rest in full.
  * The 4 without are direct `auditEvent.create` writes (`moved_release` and 3 filing `reviewed`), which part 2 moves.
  * Every stored `case_id` agrees with the 8 characters in its words (0 disagree).
  * `runtime_case` has no RLS under PF-12, so the walled `Db` reads it.
  * The two `detail.case` callers (readiness.ts:152, :174) also name the case in their words, so dropping the `detail.case` path loses nothing.
  * `opened` is logged after its transaction commits (runtime.ts:343).
* **M3 mutations:** each change turns a CW3 case red.

  | Change | Red |
  |---|---|
  | lookup removed | CW3 pass |
  | first of two twins taken | CW3 fail |
  | workspace filter dropped | CW3 fail |
  | range widened | CW3 pass |
* **m4 fixed:** the line is on the core card, plus its Tests line, and `platform/MODULE.md` is back to base. **m5 fixed:** reverting `actorWordOf` in form-uses.ts or in `peopleNames` turns CW5 red. m6 and m7 are for the PR body, as the builder says.
* **Re-run here:** check_aud1m 17/17, check_case_feed 42/42, check_aud1b 33/0, typecheck no new errors (15 known), port contracts 0 problems, count-any 416, module cards pass, `graph --check` exit 0. Activity answers 200 for the reviewer and firm staff in under 20 ms, and 403 for the client, as before.
* **Minor, not blocking (Should):** the case lookup runs in `Audit.log` before `auditEvent.record`, so it is outside `writeAuditWithAlarm`. If that read fails, the error still propagates (fail-closed in a tx) but raises no `audit_write_failed` alert. Move the lookup into the adapter's write callback, or name it in the PR body.
* Journey score, round 2: **10 / 10**. "Correct data" rises to 1: 609 of 613 case lines now carry their case, and the 4 left are part 2's.

**Verdict: Approve** (no open Blocker or Major) for 602f892d63f2856a322c367276125cb59cb96ec5. The PR body must carry m6 (as "Question for the tech lead"), m7 and the minor above.

## Round 3 (diff-only `602f892d..6145111e`, head 6145111e7a6bac6fae19c8436a03f9a7f2f661ef)
Own worktree at 6145111e (removed afterwards). Not run here: the copy-based suites (AUD-1a, C7.5, CS-W1). The builder reports them green.
* **The merge holds.** Excluding `.md` files, the c75 test and the old link, `git diff b3b0b2a0 6145111e` and round 2's approved `git diff 1b2defdb 602f892d` are **byte-identical** once the index lines are dropped. `git diff origin/claude/runtime-aud1b 6145111e` is part 1, the c75 line, and the records (AUD-1b review, AUD-1m build notes, this file).
* **The one conflict is resolved right.** `MODULE.core.md` keeps main's CS-W1 line and adds the Audit.log line, and its Tests line names both `check_csw1_firm_id.ts` and `check_aud1m_case_writes.ts`.
* **c10f8ead is right.** C7.5's m8 check read the stored word `rules`, and the mapping now stores `system:rules`. Asking the tech lead in the PR body is right, because the brief asks both "mapped" and "every case suite unchanged". I recommend keeping the mapping. (My round-1 grep missed this SQL read: my miss.)
* **The CS-W1 part 1 interaction holds.**
  * `runtime_case` still has no row-level security: no migration at 6145111e enables it on `runtime_case`, `case_stage` or `audit_event`. So `caseIdOf`'s read through the walled `Db` still sees the workspace's cases.
  * CW3's bare inserts run with `session_replication_role = replica`, so `case_firm_from_key` does not fire, and `firm_id`'s default (`app.firm_id`, unset) leaves it null. CW3 does not read `firm_id`.
  * Taking a case line's firm from `runtime_case.firm_id` would go beyond the brief ("request context, null otherwise, until the walls"). Naming it as a note for CS-W1 part 2 is the right call, not a finding here.
* **Main's new direct writes leave CW1's list unchanged.** Per-file `auditEvent.create` counts under `api/src` are identical at 602f892d and 6145111e (30 in 22). The new main writes since then are platform `AuditEntry` writes (FO-1p `fo_person`/`fo_company`, PF-18b support), with `firmId` and no `workspaceId`, so the case path does not take them.
* **Re-run in my worktree:** check_aud1m 17/17, check_case_feed 42/42. Each of these changes turns its named case red:

  | Change | Red |
  |---|---|
  | M3 lookup removed | CW3 pass |
  | twin cases accepted | CW3 fail |
  | workspace filter dropped | CW3 fail |
  | M2 word refusal removed | CW6 fail |
  | one new direct write | CW1 pass |
* **Note for part 2 (not a finding here):**
  * `lifecycle.ts:566` and `library-items.ts:174` write the bare `system` with `auditEvent.create`, and `platform/settings.ts` does too (`check_pf4_identity.ts:481` and `:544` read `actor = 'system'`). Moving them to `AuditPort.record` needs the same mapping, or CaseActor refuses them. Those suites' reads then follow, as c10f8ead did.
  * The round-2 minor (the case lookup sits outside the alarm) and m6/m7 stay for the PR body.

**Verdict: Approve** (no open Blocker or Major) for 6145111e7a6bac6fae19c8436a03f9a7f2f661ef.

## Round 4 (diff-only `6145111e..90ec40ac`, head 90ec40ac7d3cdab4d1b57da51396582155c92002)
Own worktree at 90ec40ac (removed afterwards). Not run here: the copy-based suites (CS-K1, AUD-1a, C7.5, CS-W1, PF-4). The builder reports them green.
* **The PR diff is only part 1.** `origin/main` has moved past the merged commit (now 4aa912c9), so I diffed against the merged main itself, 00378b40 (`d82d6273^2`): 16 files, +665/−24.
  * Code: excluding `.md` files and `check_aud1m_case_writes.ts`, the diff is **byte-identical** to round 3's approved `b3b0b2a0..6145111e` once index lines are dropped (part 1, the c75 line, `.gitignore`).
  * Records: additions only (AUD-1b review +183, AUD-1m build notes +76, this file), plus MODULE.core.md's two lines as approved.
* **90ec40ac is correct.** CW3's bare rows are now a parameterised `INSERT INTO runtime_case`, still in the replica-role transaction.
  * The insert gives an explicit `client_id`. CS-K1's `case_client_for_case` trigger is ENABLE ALWAYS, so it fires even in replica mode, and it keeps a client it is given.
  * The test reads only the ids and the workspace.
* **Main's merge, as it touches part 1:**
  * **New Audit.log caller** (runtime.ts:354, CS-K1): `"added"`, `"case client"`, keyed by the client id. The actor is `actor.id` (a CaseActor word). The entity is on `CASE_ENTITIES` (case-feed.ts:24, which is why check_case_feed is 42/42). The words are "… opened case <8> for a new client". `caseOf` reads `3185450e` from that shape (checked). The line is written after the case's transaction commits (after :351), so `caseIdOf` finds the case.
  * **Other new writes:** clients.ts writes no audit line itself. PF-15's new writes are platform `AuditEntry` writes (firmId, `system:platform.entitlements`, `platform_storage_over`), so the case path never takes them.
  * **No row-level security:** no migration at 00378b40 enables it, or adds a policy, on `runtime_case` or `audit_event`. CS-K1 adds `case_client` and a NOT NULL `client_id` with triggers only. So `caseIdOf`'s read through the walled `Db` is unchanged.
  * **CW1 holds:** per-file `auditEvent.create` counts under `api/src` are identical at 6145111e and 90ec40ac (30 in 22).
* **Re-run in my worktree:** check_aud1m 17/17, check_case_feed 42/42. Removing the lookup turns CW3 pass red, and accepting twin cases turns CW3 fail red.
* **The module-cards red is not this PR's:** it is main's own `platform/MODULE.md` (41 lines), which this PR does not touch.
* **Still for the PR body:** m6 (as "Question for the tech lead"), m7, the round-2 minor (the lookup sits outside the alarm), c10f8ead's Question 1, and the part-2 note on the bare `system` direct writes.

**Verdict: Approve** (no open Blocker or Major) for 90ec40ac7d3cdab4d1b57da51396582155c92002.
