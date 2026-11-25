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
