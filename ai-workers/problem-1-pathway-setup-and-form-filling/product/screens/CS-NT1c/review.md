# CS-NT1 part 3 (R1.76): independent review, PR #3649

Reviewed head: **bbd1ad9e275d023a15acd58c33014698ffc72c16**. The review started at 31ffaa4e7, followed 8afd05d8c (the migration folder renamed to `20261125100000_shared__csnt1c_case_client_note`; `git diff -M` shows 3 one-line reference edits and no change to SQL or code), and then bbd1ad9e2 (the breaker's F1-F5 fixed, with 5 new test lines). The reviewer did not build this item. It is API and schema only (D8-D14 N/A; the panel is part 4).
Requirement text: `design/briefs/CS-NT1.md` "Part 3" (AG-13-22, AG-13-30..34), BACKLOG row CS-NT1 (line 1092), AG-13-30..34 in `domain/requirements-2026-10-19/01-techno-functional/05-Doc-3-Agent-Console.md:6332`.

## Verdict: Ship after fixes (Reviewer: Changes). Not approved: one Major is open.

## What I ran (my own databases and ports; never :4400)
* A scratch worktree at each head. `check_csnt1_timeline.ts` gave **27/27** at 8afd05d8c and **32/32** at bbd1ad9e2. `check_csnt1_notes.ts` gave 56/56 and `check_case_feed.ts` 42/42. The tests' Postgres path (`/opt/homebrew/...`) points at the Mac, so I ran a copy of the tests with only that path changed.
* Mutation test 1: drop the firm check on lines written before AUD-1m (timeline.ts, the `r.firm_id` test). DW13 and DW14 go red, 3 lines in all, including the planted firm B line. Mutation test 2: never set the floor. `break F2` goes red. Neither rule passes when it is removed.
* `tests/journeys/j_76.ts` on an isolated copy at :4435, run at both heads: **24/27**. The only failures are W5 (CS-NT1t), W8 panel (part 4) and W8 prospect page (FO-4 part 2b), the same as the builder's run.
* Timing: 300,000 audit lines in a scratch database. The audit query of the timeline is a parallel seq scan at about 55 ms. The breaker measured the whole page at 109-126 ms with 200,000 lines.
* Break-it probes on the copy: multilingual text (German, Chinese, Arabic) → 201. Two adds at once with one idempotency key → two 201s and 1 row. 5,001 characters → 400 with the message in words. Firm B → 404 "No such client in your firm.". The case's timeline never shows a client note. Timeline 30-34 ms.
* Graph (P-86, `graph.mjs` run in the scratch copy): the new routes have no page (expected, part 4) and `testedBy: []`. The tool does not parse the tests' `call(BASE, …)` helper, and part 1's routes, which are tested, show `[]` the same way. This is a tool gap, not a finding.

## Issues (ranked)
| # | Sev | Where | Failure scenario | Fix |
|---|-----|-------|------------------|-----|
| M1 | **Major (Must)** | `api/src/case-notes/timeline.ts:13`, `service.ts:14`, PR body "Known scope choices" 1 | The brief's part 3 lists **@mentions** (AG-13-22, test DW12) and **the client's timeline** (AG-13-33, DW15). BACKLOG CS-NT1's Done-when also has "an @mention notifies once". The PR leaves both out. It says `ports/notifications.ts` (PF-18np's `NotificationPort`) "is not on main". **That is wrong.** The file has been on main since c299aaa57 (15 Nov) and is in this PR's own tree: `NOTIFICATION_KIND`, `notify(tx, recipient, kind, item)` and a `MENTIONS` group. Its real adapter is PF-18n, `platform/notifications/store.ts`, and it already has users (LEAD_ASSIGNED, CASE_STAGE_DEADLINE). No reason is given for leaving out AG-13-33 beyond "j_76 does not need it". The result: a Case Officer writes "@Case Manager please check" and no one is told. The row would be closed while missing a capability its brief and Done-when name. | Do one of these. (a) Build DW12: a `note-mention` line in `NOTIFICATION_KIND`, mentions by staff id from the firm only, another firm's staff → 400, one notify per person per version inside the note's transaction. Build DW15 too, or the client-visible subset on the portal read. (b) Get the release Lead's written split, with the premise corrected, as follow-up lines on row CS-NT1 in BACKLOG or `screens/CS-NT1c/challenge.md`, so the split is decided rather than assumed. |
| m1 | Minor (Should) | `timeline.ts:80` and `:131` | The brief says the sources go in one registry, `api/src/case-notes/timeline-sources.ts` (AG-13-34: a new source with no timeline code change). Here `SOURCES` sits inside the class, and `read()` handles `source === "audit"` as a special case for its floor. The first new source that filters in JavaScript (stage changes, `case_decision`, CS-DL1 deadlines) will have to edit `read()`. | Give each source its own `floor()` and move the list to `timeline-sources.ts`. Or write down in the PR why it differs from the brief. |
| m2 | Minor (Should) | `timeline.ts:89` and `:160` | The `a.case_id = $case` branch has no workspace limit, and `audit_event` has no `case_id` index, so every read scans the whole table. Since F2, one page can make up to 10 rounds × 3 queries. At 300k lines that is about 55 ms a query. A case with many dropped older lines could take more than 1 s, over STANDARDS §9's 200 ms. | Add `a.workspace_id = ${c.workspaceId}` to that branch. `caseIdOf` sets `case_id` only within the line's workspace, so this changes no result, and the query can then use `audit_event_workspace_id_at_idx`. Indexing `case_id` is scale work for the team. |
| m3 | Minor (Should) | `tests/check_csnt1_timeline.ts` DW13 | The 120 lines with one timestamp all come from the audit source. No test pages notes and audit lines that share one microsecond across a page boundary, where the cross-source floor and the `"C"` collation order matter. The breaker checked 70+70 by hand. If that case broke, a note could repeat across pages and this file would stay green. | Add a test with 70 notes written in one transaction and 70 audit lines at the same microsecond: 50/50/40, none skipped, none repeated. |
| m4 | Minor (note for part 4) | `timeline.ts:124` | After 10 rounds a page can still come back empty with `more: true`. This needs more than about 500 dropped older lines in a row. A panel that stops at an empty page would hide older lines. | Say so in part 4's concept (keep reading while `more` is true), or let the loop run until the page is full. |

**What held:**
* Migration: additive. Existing notes keep their case (DW17 on a copy that already holds a note). There is one check and one new trigger, and three functions are replaced with none added. TRUNCATE is still refused. The client row is held FOR KEY SHARE. The client's firm and workspace are checked. A next version keeps its subject. The rollback is written out.
* Authorisation: on the server, through PF-4's keys. Another firm gets 404 on every route. A note key on the wrong subject gets 404. After F5, every read also filters by the note's firm.
* Personal data: no note words in audit lines. A client line is `case client` with no case named. On the workspace Activity feed `firmMayRead` fails closed.
* Concurrency: per-note advisory lock, 409 NOTE_CHANGED, and idempotent replay.
* Cursor: keyset, `"C"` collation in SQL and in JavaScript. After F1 a value past bigint answers 400. Field errors name the field.
* Decisions come from their audit lines, which `case-close.ts:161`/`:177` write in the decision's own transaction. I accept that choice.

## D1-D20 (evidence: reviewer, script and API; no browser screen)
D1 Requirement fit **3** (M1) · D2 Data integrity **5** (database rules, F5, idempotency, DW18) · D3 Reuse **4** (one table and one service for both subjects) · D4 N/A · D5 Stability **4** (race between client delete and insert: no orphan rows, per the breaker; replay on a double click) · D6 Governance **4** (who and when on every line, version history) · D7 N/A (no AI) · D8-D14 N/A (no screen; part 4) · D15 Speed **4** (30-34 ms on the copy; m2) · D16 Testability **4** (pass and fail per case; mutations caught; m3) · D17 simulated only · D18 Provenance **4** (each line has actor, name, time and refId) · D19 Not yet evidenced (part 4, CS-NT1t) · D20 simulated only.

## BIC scorecard (EXPERIENCE §6)
BIC-04 **Met at API level**: invalid input is refused with 400 and the field named. BIC-13 **Met at API level**: errors say what is wrong and name the field, for example "Keep the note to 5000 characters.". BIC-01-03, 05-12 and 14-20 are **N/A**: there is no screen in this part, and the timeline and notes panel is part 4. No screenshots: there is no page.

## Journey score
**8/10, pass (no 0)**. The report is `screens/CS-NT1c/journey-test-reviewer-2026-11-25.md`.

## What I could not check
* The full `tsc` (it runs out of memory in this container).
* A real screen reader, keyboard use, 1024 px and 200 % zoom (no screen).
* An intended user's unaided walk (D17 and D20 stay with the founder).
* CI at bbd1ad9e2: the PR is a draft, so `ci` has not run. queue-fresh and lead-read are still pending.

**Verdict: Block** for the `review: approved` label until M1 is resolved (Reviewer: Changes bbd1ad9e275d023a15acd58c33014698ffc72c16). Fix list: M1 (Must); m1-m4 (Should).

## Round 2 (diff only, bbd1ad9e2..e0f270db3): reviewer, 25 Nov
Reviewed: `git diff bbd1ad9e2 e0f270db3` only (service.ts +39/-8, timeline.ts 4 lines, ports/notifications.ts 3 lines, check_csnt1_timeline.ts +37, challenge.md). About 770 changed code and test lines on the PR in all (P-610 limit 800).

**What I ran (ports 4435 only, never :4400).** At e0f270db3: `check_csnt1_timeline.ts` **36/36**, `check_csnt1_notes.ts` 56/56, `check_case_feed.ts` 42/42, `check_pf18np_port.ts` 11/11 (they match the builder's numbers). j_76 on isolated copy `rvnt1c2` at :4435 gave **24/27**. The same 3 later parts fail (W5 CS-NT1t, W8 part 4, W8 FO-4 2b). The copy was then stopped and its database dropped. Four mutations, each in a scratch worktree: (a) no self-filter gives 3 red; (b) no de-duplication gives 3 red; (c) the tie predicate `<` changed to `<=` gives 3 red, including the new m3 tie test; (d) the explicit `firmId` filter removed (service.ts:110) stays **green**. I looked into (d). The firm B id is still refused because the transaction's reads are walled to the request's firm (PF-3 row rules), so two layers enforce the rule and the test proves the behaviour. This is not a finding.

**Real adapter, end to end, on the copy** (DW12's test uses a counting fake port, so I checked the real `PrismaNotificationPort`):
* Firm A's Owner adds a note mentioning [T, O, the writer]. Result: 201 in 84 ms and 2 `msg_notification` rows (`note-mention`, item `case`). The writer gets none. The audit detail has `mentioned: [T, O]` and no note words. A replay with the same key gives 201 `replayed` and still 2 rows. The same key with other mentions gives 409 IDEMPOTENCY_KEY_REUSED, so the fingerprint holds.
* Firm B's staff gives 400 `fields.mentions` "Mention people of your firm only." and 0 notes written. 21 ids gives 400 "At most 20 people.". An upper-case id gives 201. An add with 2 mentions takes 32-40 ms.
* T's own list (`GET /api/platform/me/notifications/items`) shows the case mention as `C-2026-00003` with a link to `/cases/<id>`, so the notification is labelled and linked.

**Round-1 items**
* **M1 @mentions: resolved.** It matches the brief's part 3: picked by id, same firm only, 400 with nothing written, once per person per version inside the note's transaction, the writer never told, one `NOTIFICATION_KIND` line and its MENTIONS group.
* **M1 client's timeline (AG-13-33, DW15): no longer a Major.** challenge.md states the split, corrects the premise, gives its reason (P-610: about 770 lines now, plus about 120 more) and its evidence, and proposes "CS-NT1 part 3b". I checked the evidence. Row CS-NT1's Done-when and Source do not name AG-13-33 (BACKLOG:1092). The row's client half ("a CLIENT_VISIBLE note appears in the portal read") is part 1's `clientNotesOf`. No j_76 step reads a client timeline. That meets round 1's fix (b), except that the decision is not yet recorded: the tech lead's yes on #3649 is still to come. Scope is the tech lead's decision, not this review's. If the tech lead rules "build it here", this verdict no longer applies and the new code needs a round 3.
* **m2: fixed.** The workspace limit is applied first on both audit queries (timeline.ts:89, :160). `case_id` is set only within its workspace, so no result changes.
* **m3: fixed.** 30 notes and 40 audit lines share one microsecond and page 50 + 20, with no skip and no repeat, notes first at the tie. Mutation (c) shows the test fails when the tie order breaks.
* **m1, m4: open as Minors**, as the PR body says (line 29).

**New in this diff (none Blocker or Major)**
| # | Sev | Where | Failure scenario | Fix |
|---|-----|-------|------------------|-----|
| m5 | Minor (Should) | service.ts:114 (new `case-client` item kind); store.ts:52 sends non-case kinds to `NotificationLabels`; bell.tsx:88 | A mention on a **client** note reaches the person (row written), but no labeller is registered for `case-client`. Their list shows `label: null, link: null` (seen on the copy), and the bell renders "Something needs you · This item can no longer be opened". That is false, and `/clients/:id` exists. | Register a `case-client` labeller from the case-notes feature (client code, `/clients/<id>`, firm-scoped), as front-office does for `lead`. Or point the item at a case kind. Before or in part 4. |
| m6 | Minor (Should) | service.ts:114 versus brief part 3 (`{ kind: "case-note", id }`, AG-13-22 "linking to the note") | The item is the case, not the note. With PF-18n's one row per person, item and kind, mentions on two notes of one case become one row, marked unread again, and the link opens the case, not the note. The person is still told ("duplicate beats a miss"), but this is a silent departure from the brief. | Write the choice and its reason in the PR's "Known scope choices" or in challenge.md, or use a `case-note` item kind with a labeller. |
| m7 | Minor (Should) | service.ts:110 | A **deactivated** colleague passes the check: 201, and the audit lists them as `mentioned`, but the adapter writes nothing (seen: no new row). The writer believes they were told. | Add `status: "ACTIVE"` to the check (400 "…is no longer at your firm"), or leave them out of `mentioned`. |
| m8 | Minor (note for part 4) | service.ts:263 | An edit that adds a mention but keeps the same words answers 200 `unchanged: true`, and no one is told. The caller gets no error. | Part 4's picker sends mentions only with a text change, or the API says so (400 or a flag). |
| m9 | Minor (Should) | check_csnt1_timeline.ts DW12 | The 503 MENTIONS_UNAVAILABLE path (no port bound) has no test, and DW12 runs only against a fake port. The real adapter path was proven only by this review's manual run. | Add one fail line with no port bound (503, nothing written). Optionally run one DW12 line through `PrismaNotificationPort`. |

Also seen, not this PR's touch list: the bell's word map (`web/src/modules/platform/notifications/contract.ts:30`) has no `note-mention` entry, so a mention reads "Something needs you". This belongs to part 4 or PF-18ns.

**Scores changed from round 1:** D1 **4** (mentions built; DW15 split, waiting for a ruling) · D15 **4** (m2 fixed; adds with mentions take 32-40 ms) · D16 **4** (m3 and DW12 tests added, mutations caught; m9). The rest are as in round 1. BIC: unchanged (API only). Journey: **8/10, pass**. See the Round 2 section of `journey-test-reviewer-2026-11-25.md`.

**Could not check:** CI at e0f270db3. The PR is a draft, so only the guard checks ran, and they are green. The full `tsc` runs out of memory here. There is no screen, and D17/D20 stay with the founder.

**Verdict: Approve** (Ship): no open Blocker or Major. Open Minors to list on the PR: m1, m4, m5-m9. For the tech lead, not a review finding: the yes or no on challenge.md's CS-NT1 part 3b.

Verdict: Approve e0f270db3e47a994ca02c17e152b12e1f8206992

## Round 3 (diff only, b1af31e21..7669263d8): reviewer, 25 Nov
Reviewed: `git diff b1af31e21 7669263d8` only. One commit, two files: `timeline.ts` (+14/-5) and `tests/check_csw3_firm_scope.ts` (+5/-2). Nothing else changed: no route, no SQL, no source, no other test, no record.

**What I ran (ports 4438 and 4439 only, never :4400).** Copies `rvnt1c3` (:4438, `PLATFORM_IDENTITY=local`) and `rvcsw3` (:4439). Both were stopped afterwards and their databases dropped.
* `check_csv1_inputs.ts 4438`: **100/100**. `check_csw3_firm_scope.ts 4439` (with `--tsconfig api/tsconfig.json`): **48/48**, census "files: 56". `check_csnt1_timeline.ts`: **36/36**. These match the builder's numbers. j_76 on :4438: **23/26**. The 3 failures are the same later parts (W5 CS-NT1t, W8 part 4, W8 FO-4 2b). There is one line fewer than in round 2 because the copy already held the configured checkpoint, so the conditional "Demo › Load" setup line did not run.
* Rule removed, test fails: CS-V1's route finder (`tests/lib/routes.ts follows`) reads the timeline query as parsed at `CaseTimeline.read` at 7669263d8 and as **null** at b1af31e21. That null is the merge batch's red.
* **CI's type check (`product/tools/typecheck.mjs`, api project, 12 GB heap as in ci.yml:537): FAIL, 3 new errors**, all in this diff (b1af31e21's timeline.ts has 0). The PR's `types` job was still queued when I checked, so it has not reported yet.

**The census reason (check_csw3_firm_scope.ts:276-278) is true of timeline.ts.**
* `read()` (timeline.ts:120-122): only the zod parse runs before `notes.subjectFor`, and the parse touches no table. `subjectOf` (service.ts:123-131) finds the case by `firmKey: ctx.firmKey` and checks `platformFirm.id === ctx.firmId`, so any other case is a 404. Every query after it uses `c` from that call: the author lookup (`firmId: c.firmId`, :125) and `names()` (`where: { firmId }`, :181).
* Notes (:114): `n.firm_id = ${c.firmId}`. The `first_at` sub-select is keyed by a note_key from that filtered row.
* Audit (:98-107): limited to `a.workspace_id = c.workspaceId`. A line is shown only if its `case_id` is this case, or if `case_id` is null and its `firm_id` is null or this firm and case-feed.ts's rule names this case. `auditFloor` (:161) has no JavaScript filter, but it returns only a key, never a line. That is unchanged from round 2.

**The 400s, probed on :4438.** An unknown filter (`?limit=5`) → 400 `fields.limit` "Only cursor, kinds, author, from and to.". A repeated filter (`kinds`, `author`, `cursor` each twice) → 400 "Give it once." on that field. A bad kind, an impossible day (`from=2026-02-30`, `to=2026-13-01`), a range ending before it starts, and `cursor=abc` → 400 on the field, with the same words as before. `?kinds=` and `?cursor=` → 200 (blank still means no filter, as DW14 expects). Each 400 took 10-16 ms.

**Issues**
| # | Sev | Where | Failure scenario | Fix |
|---|-----|-------|------------------|-----|
| M2 | **Major (Must)** | `timeline.ts:62` (TS7053), `:64` and `:65` (TS7006) | `one = (k: string) => o[k]` indexes the zod-inferred type with a plain string. Under `strict`, `o[k]` is an implicit `any`, so `kindsText.split(",").map((k) => …)` and the `.some((k) => …)` on the next line have untyped parameters. The 3 errors are not in `typecheck-known.txt`, so CI's `types` job fails and the merge batch goes red a third time. tsx does not check types, which is why the three suites pass. | `const one = (k: keyof typeof o) => …`. I checked this one-line change in a scratch worktree: 0 errors in timeline.ts and its imports. Re-run `node product/tools/typecheck.mjs` before pushing. |
| m10 | Minor (note) | `timeline.ts:53` | zod 4 drops a `__proto__` key without an issue. `?__proto__=1` now answers 200; b1af31e21's `Object.keys` check answered 400. Nothing is stored or shown, and every strictObject in the API behaves the same way, so this is not a leak. It is the one unknown filter that lost its 400. | None needed. If the builder wants it exact, refuse `__proto__` before the parse. |
| m11 | Minor (Should) | `timeline.ts:55-60` against `service.ts:71-76` | This is a second copy of `parsed` in the same feature folder. It differs only in reading `keys[0]` for an unknown key; service.ts falls back to "body". | Export one helper from service.ts with the `keys[0]` fallback and use it in both files. Can wait for m1's `timeline-sources.ts` move. |

Also seen, not this diff: when a request has two problems at once (an unknown key plus a repeated one), zod now names the repeated field first, where the old check named the unknown key first. Either way the answer is a 400 naming a real field.

**Scores changed from round 2:** D16 Testability **3** (until M2 is fixed: the change passes its suites but fails the type check). The rest are as in round 2. BIC: unchanged (API only). Journey: **8/10, pass**, unchanged. See Round 3 in `journey-test-reviewer-2026-11-25.md`.

**Could not check:** the PR's own `types` and `parts` results at 7669263d8 (queued or running when I looked). There is no screen, and D17/D20 stay with the founder.

**Verdict: Block** for the `review: approved` label until M2 is fixed (Reviewer: Changes 7669263d8b4ada9c1431853d5edf9cc34d8b214b). Fix list: M2 (Must). m10 and m11 are optional, and m1, m4 and m5-m9 stay open as listed in round 2. After the fix, a round 4 on the one-line diff and a green `types` job will be enough.

Verdict: Changes 7669263d8b4ada9c1431853d5edf9cc34d8b214b

## Round 6 (diff only, f9a8eb281..075bde483): reviewer, 26 Nov
The request named this "Round 3 (diff only, 075bde483)". It is filed as round 6 because this file already has a Round 3 (7669263d8, Block on M2). Rounds 4 (Approve ca7a3e0ea, M2 closed) and 5 (Approve f9a8eb281, the first merge of main) were posted only as PR comments. The reviewer did not build this item.

Reviewed: 075bde483 is the merge commit (parents f9a8eb281 and main 791c6f82f). PR #3649's head on GitHub is 075bde483 and its base is 791c6f82f. I compared the PR's own diff before and after the merge: `git diff -M 9f6a44ad5 f9a8eb281` (the old merge-base) against `git diff -M 791c6f82f 075bde483`. Both have the same 15 files and the same +985/-59, apart from the migration folder's new name. With index lines and hunk offsets removed, the only differences are:
* **The re-stamp.** The folder `20261125140100_shared__csnt1c_case_client_note` is now `20261126100000_shared__csnt1c_case_client_note`, and `git diff -M` reports **100% similarity**, so the SQL is unchanged. Its 3 references were updated: `CS-NT1c.md:2`, the `case-notes.prisma:8` comment and `check_csnt1_timeline.ts:29` (`NEW`). `git grep` finds no code or schema reference to the old name. Only earlier review and break records still name old stamps, as history.
* **The stamp is unique and comes after main's newest.** Main's newest is `20261125150000_front-office-signing__fo5d_decline_reason` (origin/main was fetched again and is still 791c6f82f). No other folder starts with `20261126100000`. The re-stamp was needed: main's `20261125140100_client-money__r196_payment_plans` now takes the old stamp. `migration-slots.py check 791c6f82f..075bde483` returned **PASS**, exit 0.
* **`ports/notifications.ts`.** Against main the PR adds 3 things: `NOTE_MENTION` after main's `RETAINER_DECLINED`, its group `MENTIONS` after `[RETAINER_DECLINED]: "NEEDS_YOU"`, and `"case-client"` after main's `"retainer"` in `NOTIFICATION_ITEM_KIND`, with the comment covering both. Against f9a8eb281 the merge adds only main's 3 FO-5d entries. Nothing was dropped or reordered (`LEAD_ASSIGNED`, `KEEP_PERIOD_PASSED`, `TRUST_TO_MOVE_WAITING` and their groups are kept), so the port's "only ADD lines" rule holds. Every kind has a group (`Record<NotificationKind, …>`). The only code that reads item kinds, `labels.ts`, uses a Map with a run-time membership check and nothing exhaustive, so adding `"retainer"` breaks nothing in this PR.
* **Nothing else of the PR changed.** The other files (`service.ts`, `timeline.ts`, routes, the census allow-list, tests) are identical in both diffs. The other 11 prisma files in the commit-to-commit diff come from main (PF-19m, PF-F2, R1.96, FO-5d), not from this PR.

**What I ran at 075bde483**, in my own detached worktree (`git worktree add`), Postgres :54329 scratch databases, no server, never :4400:
* `check_csnt1_timeline` **36/36**, `check_csnt1_notes` **56/56**. I re-ran both after the builder's note that the shared tree, whose node_modules and Prisma client the worktree borrows, was on main for a few minutes. Both results stand.
* `check_pf18np_port` **11/11** and `check_fo5d_decline_withdraw` **41/41**: main's FO-5d notification still works next to `NOTE_MENTION`.
* CI's type check (`product/tools/typecheck.mjs`, `NODE_OPTIONS=--max-old-space-size=12288` as in ci.yml): **PASS, no new type errors** (api 15 known, web 0).

**Issues:** none new. No Blocker or Major. Open Minors as listed in rounds 2 and 3: m1, m4, m5-m9, m10, m11.
**Process note (not a finding):** the migration path changed again, so the Lead's P-423 read and the label have to be redone on 075bde483. The queue gate asks for this by itself.
**Scores:** unchanged from round 5. BIC: unchanged (API only). Journey: **8/10, pass**, unchanged (no step a person takes changed; see Round 6 in `journey-test-reviewer-2026-11-25.md`).
**Could not check:** the PR's CI and full run on 075bde483 (not looked up). D17 and D20 stay with the founder.

**Verdict: Approve**: no open Blocker or Major.

Verdict: Approve 075bde483ef269a8e48bbb659240d4d6f6603edf
