# CS-S1 part 2: review (R1.102, find a person or case; API only)

PR #2913, branch `claude/youthful-rubin-uk4f35`, **reviewed commit f61e49a6e195929bda2327d30cf39e035cf22909**. Reviewer: Opus 5.5, fresh context; I did not build this. 22 Nov 2026.
**Verdict: Ship after fixes** (two Majors, both small; no Blocker). The branch moved to 3f64fe084 during this review (f57ff5009 adds `search` to the cases card's `paths:`; 3f64fe084 is breaker fixes). This verdict covers f61e49a6e only.
The journey test is folded in here (§ Journey test), because I was asked to write this one file only.

**What I ran** (scratch copy = this branch + #2884 merged, PostgreSQL 127.0.0.1:54329; US$0):
* `tests/check_css1_search.ts`: **54 passed, 0 failed**, 6 s. PF-30a's `tests/check_fd1_find.ts` unchanged: 61/0. `tools/check-port-contracts.mjs`: 28 ports, 0 problems (PartySearchPort ×2). `check_case_feed.ts` 42/42. `tsc -p api/tsconfig.json`: no error in any file of this part (the errors listed are older, in `p2/`, `contracts/` and other tests). `graph.mjs --check`: G1/G2/G4/G5 0. The graph tracks C-numbers, so R1.102 is not in it and adds no gap.
* A Nest application context of `FindRegistry` plus `features/case-search.ts`'s providers: `CaseFinder` registers `"case"` at start-up and `Db` is injected. So the decorator-as-call wiring works.
* A breaker script outside the tree, built on the test's fixtures: 9 extra checks, all held (below). Mutation runs of party-search.ts and case-access.ts: 9 mutants, 7 caught, 2 survived (Majors/Minors below).
* **CI on f61e49a6e: `module-cards` failed.** I reproduced it locally (`module-cards.py pr` and `tree`).

## Who sees what, SQL, audit (the points that matter most)
* **Firm first:** `i.firm_id = scope.firmId` and the join `c.firm_id = i.firm_id` (party-search.ts:84-89). Cases: `c.firm_id =` (:110). The window counts only rows that pass that WHERE, so another firm is never read or counted. Removing the firm filter breaks DW9 and DW8 (7 FAIL). Removing the case-number firm filter breaks DW7 and DW9. Breaker check: firm B searching firm A's exact email, phone and name gets 0 matches and 0 hidden.
* **Scope:** `caseScope` follows the tech lead's ruling (comment 7070317623): `view.all`, else `view.own` = client's `file_owner` or an open team row, else none. The SQL and Prisma forms agree. Dropping `ended_at is null` breaks DW8 (7 FAIL). Breaker check: one person on case 1 (visible) and case 2 (hidden) is named once and counted once, and no door hit carries case 2's id or number.
* **Window before limit:** `count(*) filter (where not visible) over ()` (:92, :114) is computed before `LIMIT 50`. Breaker check: 55 visible + 60 hidden rows gives 50 named and **60** counted. Correct, but no committed test guards it (Major 2).
* **Injection and LIKE:** every value is a bound parameter (`Prisma.sql`); `Prisma.raw("c")` is a constant. The name pattern is escaped in SQL (`\`, `%`, `_`), and case numbers by `like()`. On the port path `%%`, `__`, `\\`, `%_` and `' or 1=1 --` match nobody and raise no error. Removing the escape breaks DW6 (`D_pont%`).
* **Nulls:** email and phone compare through `coalesce(..., false)`; a null name gives null similarity, so `coalesce 0`; a null or blank query, or junk email or phone, finds and counts nothing.
* **Audit:** one line per `PartySearchPort.search`, in the search's own transaction, fail-closed (tested). Summary: "Searched the firm's case people by name, email, phone: 1 shown, 1 not shown". Detail: `{fields, shown, hidden}`; actor `staff:<id>`. No searched value, found name or case number (DW11 scans for each one). An added value breaks DW11.

## Deviations in the PR body (my judgement)
1. No `hidden_count` on the find door: **accept**. `FindResult` is PF-30a's strict contract. On the door a hidden record is simply in no hit (tested). The tech lead still has to confirm it against the row's wording.
2. Word similarity ≥ 0.5 (Sample) instead of matching.ts's score at 0.3: **accept as Sample**. `name_norm` keeps accents, so matching.ts's folded key would not compare. Set to 0.3, "upon" matches and the test catches it.
3. File owner read from `case_client.file_owner`: **accept**. `Case` has no `fileOwner` on main (cases.prisma:124 is on `CaseClient`).
4. No audit line from the finder: **accept**. PF-30a forbids logging the query and the front office's finder writes none. The brief puts the audit on the port.
5. Decorators as calls: **accept**. `case-clients/live.ts` does the same, and the files are type-checked through `features/case-search.ts`.
6. FO-13c not wired to the adapter: **accept**. `front-office-conflict.ts` is outside the touch list. The Lead should name the follow-up in STATE so the real adapter does not sit unused.

## Issues (ranked)
* **Major 1 (Must): module-cards CI is red on the reviewed head.** `api/src/search/case-finder.ts` and `party-search.ts` are claimed by no card (`api/src/MODULE.cases.md:2-4`). `api/src/features/case-search.ts` touches the api-features card (`api/src/features/MODULE.md`) with no fragment and no `Card unchanged:` line. The brief's Done-when requires the module-card check to pass. Fix: f57ff5009 adds `search` to the cases card's paths. Still needed: a `features/MODULE.rows/CS-S1.md` fragment, or `Card unchanged: <reason>` in the body. Then CI must be green on that head.
* **Major 2 (Must): no test fails if the hidden count is taken after the 50-row cap.** Mutant: `party-search.ts:105` → `rows.filter(r => !r.visible).length`; all 54 checks still pass. With 50 or more visible matches, every hidden row falls past the cap, so `hidden_count` would be 0. FO-13c could then record NO_CONFLICT with no confirmation (contract §3.1 F18). Fix: one pass/fail pair in `check_css1_search.ts`, e.g. 55 visible + 60 hidden index rows → 50 named and 60 counted for `view.own`, 0 counted for `view.all`.
* **Minor 1 (Should): the ranking rule has no failing test.** The rule is exact email, then phone, then name (brief part 2). Mutant: `party-search.ts:94` → `order by visible desc, sim desc`; all checks still pass. The finder's own ranks (:103; case-finder.ts:29) are not tested either: DW6's email query matches only one person. Fix: a person whose name matches plus another whose email matches; the email one comes first on the port and on the door.
* **Minor 2 (Should, follow-up only): the name match scans every index row of the firm.** `extensions.word_similarity` in the select list (:87) means the GIN trigram index is never used. Measured: 97-156 ms at 20 000 rows (email 5 ms). That is within STANDARDS §9 (< 200 ms) at Sample size, and the PR body records it as a known limit. At a few times that size the case finder would pass PF-30a's 400 ms budget and be dropped quietly ("Some results could not be loaded").

## D1-D20 (1-5; API only, so screen dimensions are N/A)
D1 4: DW6-DW12 all present and passing; the door has no count (deviation 1) · D2 5: read-only; firm filter on both sides; FO-13 shape passes `fo_compliance_matches_ok` · D3 4: reuses `ports/party-search.ts`, `normaliseEmail` and part 1's `case_party_index_norm`; the name measure is its own (deviation 2) · D4 N/A · D5 4: audit fail-closed; a rolled-back answer leaves no trace · D6 5: one audit line per port search, field names and counts only · D7 N/A (no AI) · D8-D14 N/A (no screen; the find box is PF-30s) · D15 4: email 5 ms, name ≤ 156 ms at 20k rows · D16 3: 54/0 and contract ×2, but 2 rules survive mutation and module-cards is red · D17 simulated only · D18 4: `matched_on` on every hit, a score, the Sample threshold labelled · D19 N/A for one part (R1.102 also needs PF-30s) · D20 simulated only.

**BIC-01-BIC-20 (EXPERIENCE §6): N/A.** This part has no screen.

## Journey test (reviewer, API only: no screen, so no browser walk; scored on the API's behaviour)
Personas: case officer with `view.all`; case officer with `view.own`; firm B staff; FO-13c's conflict check (the port caller).
1. Main path: "Dupont", "DUPONT@x.com", "+1 416 555 0101" and "416-555-0101" find Marie, each hit opening `/cases/<id>` as "Marie Dupont · Principal · case C-2026-00001". **Held.**
2. Alternate: "Dupnt" (one letter off) and "Dup" (start of a word) find her. "upon" does not. **Held.**
3. Case number typed in lower case: its case comes first with the client named. "C-2026" lists 3 cases, the closed one labelled "Closed case". **Held.**
4. Empty: "Zz", another address and another number find nothing. Null, blank or junk port input finds nothing, counts nothing and raises no error. **Held.**
5. Wrong role: the `view.own` officer gets no name, id or number of case 2 anywhere on the door. The port gives `hidden_count` 1 and confirmers `FILE_OWNER`, `FIRM_ADMIN`. Without `agent/case:show` the door finds nothing. **Held.**
6. Another firm: firm B, using firm A's exact email, phone and name, gets nothing and a count of 0. **Held.**
7. Error: a case number on the port is refused. A failed audit write fails the search. LIKE metacharacters and a quote are harmless. **Held.**
8. Recovery: an answer edited later is found under its new value and not the old. A rolled-back answer leaves no trace. **Held.**
9. Boundary to FO-13c: every match passes `fo_compliance_matches_ok` in the database. 55 visible + 60 hidden gives 50 named and 60 counted. **Held** (not guarded by a test: Major 2).
10. Door: the finder registers at start-up (Nest context). Hits come grouped as `case` and `case_person`. PF-30a's slow-finder drop still passes. **Held.** The HTTP route was not called (see below).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | journeys 1-3, 9 |
| Next step obvious | 1 | every hit's `url` opens its case; the port names who confirms |
| Plain words | 1 | "Principal · case C-2026-00001", "Closed case", "Spouse or partner" |
| Feedback and state | ½ | the door leaves hidden matches out silently (deviation 1, pending the tech lead) |
| Correct data | 1 | FO-13 shape checked in the DB; recordId is the stable index id; audit row read back |
| Error recovery | 1 | journeys 7-8 |
| Accessibility and screen sizes | N/A | no screen |
| Speed | 1 | ≤ 156 ms at 20k rows, email 5 ms; Sample size is far below |
| Visual quality | N/A | no screen |
| Trust and sources | 1 | `matched_on` and score on every match; threshold labelled Sample |

**Journey score: 9.4 / 10** (7.5 of the 8 criteria that apply, scaled). **Pass**, no criterion at 0.

## What I could not check
* The HTTP route `GET /api/platform/find` on an isolated copy (:4433). The API does not boot in this cloud sandbox: sibling `prototype/*` folders import `ajv` through the tracked `prototype/node_modules` link to a Mac-only `.tools` path. For the same reason `check_features_registry.ts`, the demo reset and the checkpoint load were not run. In place of the route I verified the Nest wiring in isolation.
* Behaviour under the firm walls (the API's role vs. the test's superuser connection). Part 1 hands this over to CS-W1/CS-W4.
* A real screen reader and an intended user's walk (D17, D20): the founder's.
* Commits after f61e49a6e (f57ff5009, 3f64fe084).

**Verdict: Block** at f61e49a6e195929bda2327d30cf39e035cf22909. Fix Major 1 and Major 2; Minors 1-2 should follow. No Blocker. The code's access rules held under every probe; what blocks is CI and one missing guard test.
Reviewer: Changes f61e49a6e195929bda2327d30cf39e035cf22909

## Round 2 (diff only: f61e49a6e → dc95fa3447616efaa63796e6a74026d561a0d177)
Reviewer: Opus 5.5, fresh context; I did not build this. 22 Nov 2026. I read only `git diff f61e49a6e dc95fa344 -- prototype/studio`: 4 files, +50/−16 (`MODULE.cases.md`, `case-access.ts`, `search/party-search.ts`, `tests/check_css1_search.ts`). I did not re-review unchanged code.

**What I ran** (scratch copy = dc95fa344 + #2884 merged, PostgreSQL 127.0.0.1:54329; US$0):
* `tests/check_css1_search.ts`: **62 passed, 0 failed** (54 in round 1, plus 8).
* `module-cards.py tree`: **PASS** (15 cards). `BASE=origin/main module-cards.py pr <11 changed paths> <PR body>`: **PASS**. The api-features file is covered by the body's line `Card unchanged: api-features — features/case-search.ts is one more registration file under the seam rule (one file per feature).` (I read the PR body through the REST API; the PR head is dc95fa344.)
* Mutation runs in the scratch copy, each restored with `git checkout` afterwards (scratch tree clean). **6 of 6 caught:**

| Mutant | Result |
|---|---|
| M2: `return [hits, rows.filter((r) => !r.visible).length]` (count taken after the cap) | FAIL "cap, review M2": `{"n":50,"hidden":0}` |
| m4: `caseScope` membership check off and the `find` early return off | FAIL "breaker m4": firm A's people named |
| m4: only `find`'s `if (!scope.member) return` off | FAIL "breaker m4": `hidden_count 2` (counts would leak, so the early return carries weight and is guarded) |
| m1: SQL `case when char_length(...) >= 2 then k end` → `k` | FAIL "breaker m1": "d"+U+200B names people |
| m3: NUL stripping removed | the run aborts with `invalid byte sequence for encoding "UTF8": 0x00` (red) |
| review m1: `order by visible desc, prefix desc, by_email desc, by_phone desc` | both ranking checks FAIL |

### Round 1 findings
* **M1 fixed.** The cases card's second glob is now `{case-clients,case-deadlines,search}/*.ts` (`MODULE.cases.md:4`). It claims both files in `api/src/search/` (`case-finder.ts`, `party-search.ts`; there are no subfolders). The `Card unchanged:` line is in the PR body. Both checks pass locally. CI on dc95fa344 still has to go green for the merge.
* **M2 fixed.** The test indexes 55 visible + 3 hidden "Bulkname" people (setup check: 58 indexed). A `view.own` viewer gets 50 named and 3 counted, with 2 confirmers. A `view.all` viewer gets 50 named and 0 counted. The count-after-cap mutant now fails it.
* **Review m1 fixed.** Email over name, and phone over name, both on the port. The order mutant fails both checks. The door's own ranks (case-finder.ts) are still not tested on their own. That is unchanged code and Minor only.
* **Breaker m1, m3, m4 fixed**, each with a test that fails under its mutant (table above).
* Minor 2 (name scan at 20k rows) remains a recorded follow-up. Nothing in this diff touches it.

### The two changes asked about
* **`caseScope` membership (`case-access.ts:27-31`).** No new problem:
  * The staff row is read under `firmScope(firmId, { id })`, so a staff id from another firm gives `member: false`, whatever `keys` the caller passes.
  * The UUID regex runs before the query, so a non-UUID id gives no scope instead of a Prisma `@db.Uuid` error (`PlatformStaff.id` is `@db.Uuid`). It fails closed.
  * `caseScopeWhere` and `caseVisibleSql` both treat `!member` as no case (`id in []` / `false`).
  * `find` returns early with `hidden_count 0` (`party-search.ts:64`), so a non-member gets no count either (mutant above).
  * `teamIds` is unchanged for members: it is empty unless own-only, and then holds the staff id plus the actor id.
  * Cost: one indexed primary-key read per search, now also when `keys` are passed. Negligible.
  * Blast radius: `caseScope` is called only by `party-search.ts` (and the test). `CaseFinder` goes through `find`, so the door gets the same rule. No other case list changes.
* **SQL 2-character check after normalising (`party-search.ts:83`).**
  * The name is now always bound and normalised by `case_party_index_norm`. If fewer than 2 non-space characters are left, `n` is NULL.
  * Every use of `q.name` and `q.esc` is null-safe: `coalesce(word_similarity(...), 0)` and `coalesce(... like ..., false)`. A NULL name therefore matches no one by name, while email and phone still match (`by_email or by_phone` are coalesced). An empty name, which used to be passed as `''`, behaves the same.
  * The JS gate `[...name].length >= 2` stays as a cheap pre-filter. The SQL check is the real one, because it counts after the same normaliser the index uses.
  * Values stay bound parameters. LIKE escaping is unchanged. The 62 checks, including `%%`, `D_pont%` and the trigger checks, all pass.
  * Not new: a 2-letter name with an inner space ("a b") is still searched, as it was before.

### New findings
None at Blocker, Major or Minor.
* Nit (no fix required): `party-search.ts:125`. The audit's `fields` is taken from the raw query, so a name made only of NUL bytes is logged as "by name" while `find` searched nothing. The line is still truthful about counts (0 shown) and holds no value.
* Note, not a regression: `case-access.ts:27` checks firm membership but not `PlatformStaff.status`. `holdsKey` never checked it either. Sign-in is where a deactivated person is stopped. Flagged only so CS-W1/CS-W4 keep it in view.

### Journey test (reviewer), round 2
I re-ran the round-1 journeys against the API, with the same personas. Journey 9 (the count survives the cap) is now guarded by a test. Added and held:
* "d"+U+200B finds and counts nothing.
* "Du\u0000pont" and a case number ending in NUL still find, with no database error and no `partial` on the door.
* Firm A named with firm B's staff id gets nothing and counts nothing, even with `view.all` passed as keys.

The scores are unchanged: "Feedback and state" stays ½ because the door still leaves hidden matches out silently (deviation 1, pending the tech lead).
**Journey score: 9.4 / 10.** Pass, no criterion at 0.

### Still not checked
The HTTP route on an isolated copy, and the firm walls under the API's own database role (same reasons as round 1). CI on dc95fa344, which I could not see from here.

**Verdict: Approve** at dc95fa3447616efaa63796e6a74026d561a0d177. Both Majors and all four Minors are fixed and guarded by tests; no new Blocker or Major. Merge on green CI for this commit.
Reviewer: Approve dc95fa3447616efaa63796e6a74026d561a0d177

## Round 3 (diff only: 9e40aee7cd90b17a60788d864bbece4a8e59bdd0 → 25c882bb630e85e4578c4252f9c90cddc12a655f)
The tech lead allowed this round. 9e40aee7c is the merge of main on top of the round-2 record (de468fa05, which follows the approved dc95fa344). Two commits since then:
* **680346c3f, a merge of main (parents 9e40aee7c and 73c4e4dcd).** It is a pure merge. `git show --cc` prints no conflict hunks. None of the 44 files main brought in is one of this PR's 11 files. The stat over `case-access.ts`, `search/`, `features/case-search.ts`, `case-feed.ts`, `party-search-port.contract.ts`, `check_css1_search.ts` and `MODULE.cases.md` from 9e40aee7 to 25c882bb is empty, so `case-feed.ts` did not change either.
* **25c882bb6, one line in `.mergify.yml` (line 52).** The `case-side` scope now claims `.../studio/api/src/search/*.ts`.
  * It belongs there. The cases card (`api/src/MODULE.cases.md:4`) claims `api/src/{case-clients,case-deadlines,search}/*.ts`, and `case-clients/*.ts` and `case-deadlines/*.ts` already sit in `case-side`.
  * It is written like its neighbours: full quoted path, the same indent, and a trailing `# card api-cases (CS-S1 part 2, #2913)` in the form of the CS-DL1 line above it. It sits next to the other card subfolders.
  * `*.ts` covers both files (`search/case-finder.ts`, `search/party-search.ts`). The folder has no subfolders.
  * No other `.mergify.yml` line changed, and no other scope claims `api/src/search/`.

### Checks run (at HEAD 25c882bb6, clean tree)
* `bash product/tools/check-mergify-scopes.sh`: **PASS**, 102 checks.
* `python3 product/tools/module-cards.py tree`: **PASS**, 15 cards, tree checked.

### Findings
None. The code, tests, deviations and journey score (9.4 / 10) from round 2 still stand: no PR file changed.

### Not checked
CI on 25c882bb6, which I cannot see from here.

**Verdict: Approve** at 25c882bb630e85e4578c4252f9c90cddc12a655f. Merge on green CI for this commit.
Reviewer: Approve 25c882bb630e85e4578c4252f9c90cddc12a655f

## Round 4 (diff only: ad853d7972bf3a4288d76a20f1212367052a46fb → 8ef2e0926c23bf2103ae7011b543d47de0a09865)
The tech lead allowed this round. Merge batch #3070 failed on shard 17: CS-W3's census (`tests/check_csw3_firm_scope.ts`, section 4) found `api/src/search/party-search.ts` querying a case table without being on `ALLOW`. The tech lead ruled (PR comment 7079535941) that the entry goes on the list in this PR, because the file is firm-scoped. One commit, 8ef2e0926, one file, 3 lines in and 3 out.

### The change
* **Exactly what was ruled, nothing else.** The diff touches only `check_csw3_firm_scope.ts`:
  * `search/party-search` is now the first word of `ALLOW` (line 271);
  * the assertion now reads `ALLOW.length === 48`, and its label says "47 at part 1, 48 with CS-S1 part 2" (line 278);
  * the section comment names the file, the reason and the ruling (line 269).
  * The `extra.length === 0` check, the planted-file probe and the rest of the file are unchanged.
* **Spelling matches the census.** The census prints `api/src/search/party-search.ts`. `ALLOW` maps each word `f` to `api/src/${f}.ts`, so `search/party-search` gives exactly that path. It is written like the other subfolder entries (`case-clients/live`, `features/case-milestones`).
* **The reason holds.** `api/src/search/party-search.ts:90-91` joins `case_party_index i` to `runtime_case c on ... c.firm_id = i.firm_id` with `where i.firm_id = ${s.firmId}::uuid`. Line 113 reads `runtime_case` with `where c.firm_id = ${s.firmId}::uuid`. Both are firm-first, as the ruling says.

### Checks run (at HEAD 8ef2e0926, clean tree)
* `bash .../tests/fixtures/csw3/csw3-spike.sh census`: exit 0, `files: 48`. `api/src/search/party-search.ts` is one of them (1 `$transaction`, 2 raw SQL calls, 0 firm sets).
* Census list against the expanded `ALLOW`: both have 48 entries with no duplicates. `comm` finds no census file missing from `ALLOW` and no `ALLOW` entry missing from the census. So `ALLOW.length === 48 && extra.length === 0` holds, and the census assertion would now pass.
* I did not run the full `check_csw3_firm_scope.ts` suite, which needs a running API on an isolated copy. The builder reports 48/48 there.

### Findings
* Nit, not blocking (`tests/check_csw3_firm_scope.ts:267-270`): the comment still says "plus five merged on main after the spike" but now names six files, and "Only shrinks" is no longer true now that the list grew by a ruling. Reword both when this comment is next touched. Nothing to fix in this PR.
* None at Blocker, Major or Minor. The code, deviations and journey score (9.4 / 10) from rounds 2 and 3 still stand: no product file changed.

### Not checked
CI and the merge batch on 8ef2e0926, which I cannot see from here.

**Verdict: Approve** at 8ef2e0926c23bf2103ae7011b543d47de0a09865. Merge on green CI for this commit.
Reviewer: Approve 8ef2e0926c23bf2103ae7011b543d47de0a09865
