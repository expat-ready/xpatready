# qa capability — R1.3 Walls between firms (platform + case side), 21 Nov (main b6daec801)

**Ask (Lead 17, ~22:2x IST):** score R1.3 on main's head after CS-W3 part 1 #2349 (the case-side door) merged (15:16Z). qa lane Q8 (cloud); Opus 5.5, effort medium (P-781); isolated copies :4471-:4473 only, never :4400; live AI off; US$0.

## Verdict
**Partial** (unchanged; P-606: parts missing, so no Works claim is possible). The platform half (PF/FO tables) holds and is gated; the case side has its door but **no wall**: no case-side table has row-level security on main, and eight case-side tables have no firm column.

| Clause of the Done when | Met on b6daec801? | Evidence |
|---|---|---|
| Every PF/FO table refuses a read and a write of the other firm's row at the database, even with no firm filter | **Yes** | `check_pf12_walls.ts` 100/100 in GitHub run 44923556962 (job 136905826328) and twice locally |
| Every case-side table (once it has a row) refuses the other firm's row at the database | **No** | Probe below: 0 of the case-side tables have `FORCE ROW LEVEL SECURITY`; `check_csw3_firm_scope.ts` turns walls on only from a test fixture (`tests/fixtures/csw3/csw3-spike-walls.sql`: "a SCRATCH COPY ONLY ... Never a migration") |
| The cross-firm test is a merge-queue gate | **Platform: yes. Case side: no** | `check_pf12_walls` runs on the batch shards; the case side's gate test (`tests/check_csw4_walls.ts`, CS-W4) does not exist |

## Gaps and the rows that close them
1. **Case-side tables without a firm column** (8 found: `case_document`, `case_task`, `case_team_member`, `case_participant`, `case_client_counter`, `person_link`, `person_link_session`, `person_link_try`; also `filing`, `party` per the spike fixture) → **CS-W2** (the firm column on every case-side table; not started, no open PR).
2. **Case-side calls not yet all firm-scoped:** the census allow-list is 47 files at part 1 and only shrinks as later parts land; the demo reset, background jobs and start-up recovery run with no firm (spike causes 2-3) → **CS-W3 part 2** (census per area) and **CS-W3 part 3** (reset per Sample firm, jobs in their case's firm, count port). Neither merged, no open PR.
3. **Walls switched on and gated:** `FORCE ROW LEVEL SECURITY` + one policy per case-side table, the app's role owning no table, the release-gate test with its two named exceptions → **CS-W4** (waits on CS-W2, CS-W3). Not merged, no open PR.
4. Note (no new bug): #2349 adds role-only `case_lookup_read` policies on `runtime_case`, `person_link`, `person_link_session` (migration lines 32-34); they do nothing until those tables are forced (CS-W4), as the PR states.

## Evidence
* **(1) item-proof:** not available. #2349's body has no `Completes: R1.3` line (it is part 1 of 3 of one of four case-side rows), so no item-proof ran; nothing cited.
* **(2) GitHub, main's head:** merge-queue run **44923556962** (merged #2619; head f40ae1b53, tree d0ecddea27 = main b6daec801's tree), all 24 shards green: `check_pf12_walls.ts` PASS 100/100 (job 136905826328), `check_csw1_firm_id.ts` PASS 47/47 (job 136905826309), `check_csw3_firm_scope.ts` PASS 48/48 (job 136905826344).
* **(3) Independent re-run, twice, on main b6daec801** (each round its own isolated copy, started and stopped in one command; `tsx --tsconfig api/tsconfig.json` as `run-suites.sh` does):

  | Suite | Round 1 (:4471) | Round 2 (:4472) |
  |---|---|---|
  | `check_pf12_walls.ts` | exit 0, 100 passed, 0 failed | exit 0, 100/0 |
  | `check_csw1_firm_id.ts 4471/4472 xr_studio_qa_r13_n` | exit 0, 47/47 | exit 0, 47/47 |
  | `check_csw3_firm_scope.ts 4471/4472 xr_studio_qa_r13_n` | exit 0, 48/48 (census 47 files) | exit 0, 48/48 |

  (A first attempt without `--tsconfig` failed to compile the decorators: my invocation, not the app; discarded.)
* **Database probe** (isolated copy :4473 of main, every migration applied; `pg_class` for schema `public`): 199 tables; 79 forced; **case-side tables all `relrowsecurity = f`, `relforcerowsecurity = f`**: with `firm_id` — `runtime_case`, `case_client`, `case_stage`, `case_decision`, `case_milestone`, `case_party_index`; without — the eight in gap 1.
* **(4) Walk (walks.yml):** not asked for. No `tests/journeys/j_3.ts` exists and none is added here: R1.3 is a database property with no screen of its own, the verdict cannot move while CS-W2-W4 are missing (P-606), and a screens walk would prove nothing a wall test does not. Deviation from the ask, said here: the journey belongs with CS-W4 (a two-firm walk that ends at the other firm's case 404).
* **(5) Fresh Opus reader:** see "Fresh reader" below.

## Fresh reader
Fresh Opus reader (no build context, read-only, given the Done when and the evidence, not this verdict): **Partial**. Gaps it names: the case-side clause (no shipped migration enables or forces RLS on a case-side table; CS-W2, CS-W3 parts 2+, CS-W4 close it) and the case-side gate (`check_csw3_firm_scope.ts:9,191` applies `csw3-spike-walls.sql`, so its 48/48 proves the door under test-only walls, not a wall on main; CS-W4 closes it). It confirms the PF/FO gate (`check_pf12_walls.ts:28,48-49` via a catalogue query; every non-quarantined suite runs in the queue, `ci.yml:10-13`) and that #2349's `case_lookup_read` policies do nothing while RLS is off. It could not itself verify the probe counts or the GitHub run (no network).

## Done when
`check_pf12_walls.ts` exit 0 (100/100), `check_csw1_firm_id.ts` exit 0 (47/47), `check_csw3_firm_scope.ts` exit 0 (48/48), each twice locally on main b6daec801 and once in GitHub run 44923556962 (tree = main's); verdict Partial, because the case-side wall (CS-W2, CS-W3 parts 2-3, CS-W4) is not on main.

Duplicate check: `git log origin/main --grep "CS-W"` (only CS-W1 part 1 and CS-W3 part 1 merged); open PRs searched for `CS-W` (none); `qa/BUGS.md` and `scout/FINDINGS.md` for R1.3 / case-side walls (no row; the gap is the unbuilt rows, so no new QA row is logged).

## Questions for the Lead
* **Question for the tech lead: reviewer please** (records only).
* R1.3 cannot reach Works this cycle: three rows (CS-W2, CS-W3 parts 2-3, CS-W4) are unbuilt and none has an open PR. Should R1.3 come off the 15-proven target list for this cycle?

## Suggestions
* *Needed for the proof · Capability:* when CS-W4 is shaped, add `tests/journeys/j_3.ts` to it (staff of firm B opens firm A's case by URL → 404; client link of firm A cannot reach firm B), so gate A has a walk.
