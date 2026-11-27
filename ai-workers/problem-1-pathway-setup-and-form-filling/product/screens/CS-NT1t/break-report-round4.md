# CS-NT1t round 4 break pass: person timeline vs. firm scope and caseScope (PR #3829 at 4d584155f)

The tech lead set the same condition on #3822. The goal: make `PersonTimeline.read` (`api/src/case-notes/person-timeline.ts`) show another firm's cases, or cases outside the reader's caseScope. The way in is the query the CS-W3 census entry now allows: `db.case.findMany({ where: { clientId: s.id } })`, then `CaseTimeline.pageAfter` for each case.

**Setup.** An isolated copy, `br4_csnt1t`, on :4436 (AI_LIVE=off, PLATFORM_IDENTITY=local, PLATFORM_SAMPLE_SEED=on), with Postgres on :54329. Never :4400, no prisma generate.
* Firm A is sample-firm and firm B is sample-solo.
* Cases were opened with POST /api/runtime/cases as in `tests/check_csnt1t_person_timeline.ts`:
  * A1: person P, user-O on the team.
  * A3: P re-pointed to it by SQL; user-T is officer, user-O is not on it.
  * B1 and B2: firm B, each with its own person.
* Notes were written through the API, each with a run tag. The ones planted in firm B contain "secret".
* Ways around the database's own guards, used only where a guard refused the plant:
  * `session_replication_role = replica` turns off the foreign keys and ordinary triggers.
  * The three ALWAYS triggers on `runtime_case` (`case_firm_fixed`, `case_firm_from_key`, `case_client_for_case`) were turned off inside one transaction and turned back on as ALWAYS before commit.
* The script is a scratch file, not committed. Everything changed was put back and checked afterwards:
  * no `runtime_case` or `case_client` firm mismatch;
  * CASE_OFFICER has `agent/case:view.all` again;
  * no team row from the test is left;
  * the three triggers are back to `A`.
* The copy was then stopped: database and files removed, :4436 free.

## Attempts

| # | What I did | Expected | Actual | Result |
|---|---|---|---|---|
| 1a | Firm B case B1, `client_id` set by SQL (FKs off) to firm A's person P. A's representative reads P's timeline. | No B1 line, id or case number | 200. None of B1's note words, id or case number appear | Held |
| 1b | Firm B's Owner reads P (which now "holds" B1) | 404 | 404, the run tag nowhere in the body | Held |
| 2a | B1 with `firm_key=A`, `firm_id=B`, client P (triggers off). A reads P, then B1's own timeline. | B1 left out; 404 | B1 absent; case timeline 404. The `firmKey` + `caseScopeWhere{firmId}` pair needs both columns | Held |
| 2b | B1 with `firm_id=A`, `firm_key=B`, client P | B1 left out | Absent | Held |
| 2c | B1 relabelled to firm A in both columns; its note rows still say firm B | B's note words hidden | Note words hidden: the note source keeps `n.firm_id = case firm`. Two B audit lines did show (see m1) | Held (see m1) |
| — | Plain SQL `update runtime_case set firm_key=…` without the bypass | Refused | Refused: `case_firm_fixed: a runtime_case row keeps its firm`. Moving a client with cases: composite FK, ON UPDATE RESTRICT | Held (data layer) |
| 3a | CASE_OFFICER without `view.all` (view.own only). user-O has a team row on A1, none on A3, and is not the file owner. | A1 shows, A3 does not | A1 shown; A3's words and id absent | Held |
| 3b | Same, with user-O's A1 team row ended | No case line | 0 case lines (P's own notes still shown; see n2) | Held |
| 3c | Same, with P's `file_owner` = user-O | A1 and A3 show (the intended rule) | Both shown | Held |
| 3d | Same file owner, plus firm B's B2 pointed at P (FKs off) | B2 left out | Absent | Held |
| 3e | Plus a `case_team_member` row on B2 naming user-O's staff id | B2 left out | Absent: `caseScopeWhere` pins `firmId` before the team OR | Held |
| 4a | Cursor from page 1 of B's person (B1 has 70 planted audit lines) used on A's person P | 200, A positions only, no B words | 200, 0 lines (the position is older than all of A's lines), no B words | Held |
| 4b | The same cursor on B's person, read as A | 404 | 404 | Held |
| 4c | Forged cursor: max µs, source note/audit/prospect, id = B1's note key, on P | Only A lines | Only A lines, no "secret" | Held |
| 4d | Cursor id `x' or 1=1--` | 400 | 400 | Held |
| 4e | Walk every page of B's person | Never reaches A's lines | 2 pages, no A line | Held |
| 5a | P moved to firm B (key and id, FKs off). A reads P. | 404 | 404 | Held |
| 5b | Firm B reads the moved P | 200 with none of A's notes, cases or ids | 200, 0 lines. A's cases fail the case gate; P's notes fail `n.firm_id = s.firmId` | Held |
| 5c | Half moved: `firm_key=B`, `firm_id=A` | B sees nothing of A's; A gets 404 | B: 200 with 0 lines. A: 404 | Held |
| 5d | Half moved: `firm_key=A`, `firm_id=B` | A reads (key is A); B gets 404 | A: 200 with 7 lines. B: 404 | Held |
| 5e | Moved P linked by SQL to firm A's prospect, read by B | No prospect line | None. `Prospects.read` and every source in `lines()` filter by `ctx.firmId` | Held |
| 5f | A's P linked by SQL to firm B's prospect, read by A | No B prospect line, and no 500 | 200, no B prospect line | Held |
| 6 | The route called with `x-actor: user-O`, `x-actor: user-P` (client), a forged bearer, and a non-UUID id | Refused | 401 for all four | Held |
| 7 | Census: `csw3-spike.sh census` | 60 files, person-timeline listed | 60 files, `person-timeline.ts 0 0 0`, matches `ALLOW.length === 60` | Held |

## Findings

No Blocker or Major.

**m1 (Minor, not in this PR's code, not reachable without disabling an ALWAYS trigger).** In attempt 2c, once `runtime_case` B1 is relabelled to firm A in both firm columns, A's reader sees B1's two firm-B audit lines on P's timeline:
* "Solo representative opened case 592d57ec for a new client, CL-00007"
* "...opened case ... representative of record Solo representative (Sample)..."

Cause: the audit source in `api/src/case-notes/timeline.ts:112` accepts any row where `r.case_id === c.id` without checking `r.firm_id`. The note source does check it (`timeline.ts:121`, `n.firm_id = ${c.firmId}`).
* Unchanged by this PR: the PR's `timeline.ts` diff only splits `read` into `keyed` and `pageAfter`.
* The same lines show on B1's own case timeline.
* `case_firm_fixed` (ALWAYS) refuses the relabel, so this is defence in depth only.

Repro: open B1 as user-S. Then, in one transaction, set `session_replication_role = replica` and turn off `case_firm_fixed`, `case_firm_from_key` and `case_client_for_case`. Run `update runtime_case set firm_key='sample-firm', firm_id=<A>, case_number='C-9999-99999', client_id=<P> where id=<B1>`, turn the triggers back on as ALWAYS, and commit. Then GET `/api/runtime/clients/<P>/timeline` as A's representative: the lines with `caseId = B1` show B's audit summaries.

**n1 (note, not a finding).** The case query at `person-timeline.ts:66` has no `firmId`/`firmKey` in its `where`. When a firm B case is planted onto P, it is loaded into memory, refused by `pageAfter` (404) and dropped, so nothing leaks (1a, 3d). Adding `firmId: s.firmId` there would make the query scoped on its own and would not rely on the composite FK.

The census entry is file-level. Once `person-timeline.ts` is listed, a later unscoped query in the same file would pass the census unnoticed. That is true of all 60 entries; CS-W3's design, not this PR.

**n2 (note, the existing rule).** A view.own reader on none of P's cases still reads P's own notes and P's won prospect's lines (3b). The client gate (`subjectFor(ctx, "client")`, `service.ts:139`) has no caseScope. Already true before this PR:
* GET `/api/runtime/clients/:id` and `/notes` (`clients.ts:121`) behave the same;
* the module comment says the person read is firm-scoped only.

It is not a case leak: no case line, id or number reached that reader.

## What held
* The client gate: firm key, then firm id against the session. 404 for another firm's person, including half-moved rows (5a–5d).
* The per-case gate in `pageAfter` → `keyed` → `subjectFor("case")`:
  * both `firm_key` and `firm_id` must match;
  * caseScope is applied on top (1a, 2a, 2b, 3a–3e);
  * out-of-scope cases are skipped without being named (no id, no number);
  * a refused case does not break the read (200, never 500).
* Note rows stay with their firm (`n.firm_id`) even when the case row is relabelled (2c).
* Cursors carry only a position, so a cross-firm or forged cursor reveals nothing. Bad cursor input gets a 400 (4a–4e).
* Prospect lines are firm-filtered at every source, and a cross-firm link gives 200 with nothing shown (5e, 5f).
* Database guards: `case_firm_fixed`, `case_firm_from_key` and the composite FKs `(client_id, workspace_id, firm_key)` and `(client_id, firm_id)` refuse every one of these plants without the bypass.
* The census lists 60 files, matching the entry.

Repro script (scratch, not committed): `/tmp/claude-0/-home-user-xpatready/03ad3f9a-1ae7-5be8-9606-3f55e7c8834f/scratchpad/br4.mjs`.

Verdict: Approve 4d584155fe34de599c2f77b00b8834f79bc57ed6
