# qa capability R1.10 (Checking every input) — 21 Nov ~22:4x IST, main b6daec801

qa lane Q7 · Opus 5.5, effort medium (P-781) · isolated copies :4476 and :4473 only, never :4400 · live AI off · US$0.
Asked by: Lead 17, after #2619 (PF-28 part 1) merged at 22:16 IST.

## Verdict: **Partial** (was Partial; carried 19 Nov at 4c47c1bad)
The case side is finished and the PF/FO **rule and sweep** are on main, but the sweep **measures** the PF/FO gaps rather than closing them:
327 allow-listed entries (83 inputs that reach no zod parse, 244 probes that answer otherwise), each owned by PF-28 parts 2-6, none of which is built or has a BACKLOG row. #2619 itself says so ("No route is fixed here. Parts 2–6 fix them"; no `Completes: R1.10` line).
Per P-606 a row with parts missing gets no Works; the status stays Partial with the gap list below.

## R1.10 clause by clause (Done when, `qa/CAPABILITIES.md`)
| Clause | On main b6daec801 | Met? |
|---|---|---|
| Every PF/FO route checks body, query and params against one schema | One rule exists (`api/src/platform/http/input.ts`, `parseInput`); 102 PF/FO inputs, **83 reach no zod parse** (allow-listed) | **No** |
| Wrong type, missing, unknown, over-long each answer a problem answer naming the field in plain words | 196 PF/FO routes, 488 probes: **244 answer otherwise** (allow-listed), e.g. `POST /api/platform/staff/invitations` with an unknown field → 400 `EMAIL_REQUIRED`, field not named | **No** |
| …status code | Row says 400; the ruling on #2619 (Lead 9, comment 7056094303; BACKLOG PF-28 amendment 18 Nov) is **422 on PF/FO, 400 on the case side**. The row's words are out of date (question 2) | n/a (ruling applies) |
| qa probes every route in the route table | `check_pf28_inputs` reads Nest's route table: 196 routes, 488 probes, 59 public-door probes with no token, 0 NOT TESTED for lack of a token | **Yes** |
| Case side (CS-V1, the other half of map row 10) | CS-V1 parts 1, 2, 3 merged (part 3: `ALLOW` and `ALLOW_500` empty, `tests/check_csv1_inputs.ts:27-29`) | **Yes** |
| Body-size limit | 256 KB on PF/FO doors; 1 MB → 413 `BODY_TOO_LARGE` (DW3) | **Yes** |
| Webhook doors (`/api/hooks`, amendment 1) | `/api/hooks/stripe` not on main: DW6 **NOT TESTED** (P-405) | **Not tested** |
| No input answers 500 | **QA-507 still open:** an unknown charset or Content-Encoding on a JSON body → 500 (2/4 on this commit) | **No** |

## Gap list (what R1.10 still needs to reach Works)
1. **PF-28 part 2 (platform):** 23 unparsed inputs, 81 probes.
2. **PF-28 part 3 (front-office sales):** 35 unparsed, 61 probes.
3. **PF-28 part 4 (booking):** 17 unparsed, 72 probes.
4. **PF-28 part 5 (retainers):** 8 unparsed, 23 probes.
5. **PF-28 part 6 (money):** 7 probes.
   (Counts from `tests/pf28-allow-list.json` on b6daec801: 83 + 244 = 327. #2619's body quoted 81 + 238; the list was re-based for main's newer doors before merge, and DW7 caps it at 83/244.)
6. **DW6, the Stripe webhook door:** a signed event verifies after PF-28, one byte changed → 400, nothing stored. Due with #1959.
7. **QA-507:** body-parser 415s (charset, encoding) mapped to a problem answer, not 500.
8. **The allow-list's "judge, not fix" entries** (#2619 review m6): complaint DELETE 405 by design, invitation token 200 `NOT_VALID` / 410, the SNS door's 300 KB, `session/callback` 401 under local identity. Each must leave the list as a named exception or be fixed; until then the list is not empty.
9. **No journey `tests/journeys/j_10.ts` exists**, so walks.yml cannot run R1.10's journey (API-only capability; see question 3).
10. **Over-long field per field:** a probe per bounded string at max+1 → 422 naming that field (today only the 1 MB body-limit probe).
11. **Case side probed per route:** CS-V1's DW4 covers a sample; R1.10's "qa probes every route" wants the case routes in a sweep like PF-28's.
12. **Case-side field naming:** an unknown field on a case route is named "body", not by its own name ("naming the field in plain words").

## Evidence
* **GitHub, main's tree:** ci run **44923556962** (merge queue "merged #2619", head f40ae1b53, tree d0ecddea2 = main b6daec801's tree): conclusion success, 24/24 shards and 5 regression jobs green. The sweep passes there because the gaps are allow-listed, not because they are closed.
* **item-proof:** none: #2619 carries no `Completes: R1.10` line (correctly, parts missing), so item-proof has no verdict to cite.
* **walks j_10:** not requested: no `j_10.ts` journey file (gap 9).
* **Independent re-run, twice, fresh copy each (`isolated.sh qa_r110 4476`, PLATFORM_IDENTITY=local), main b6daec801:**
  | Suite | Run 1 | Run 2 |
  |---|---|---|
  | `tests/check_pf28_inputs.ts` | 24/24, exit 0 | 24/24, exit 0 |
  | `tests/check_csv1_inputs.ts` | 100/100, exit 0 | 100/100, exit 0 |
  | `tests/check_pf0bp_body_errors.ts` | 13/13, exit 0 | 13/13, exit 0 |
  | `tests/qa/check_qa507_body_charset.ts` (:4473) | 2/4, exit 1 (B1, B2: 500) | — |
* Sweep output (run 1): "code: 102 inputs under the PF/FO doors, 83 reach no zod parse (allow-listed: 83)"; "probes: 488 on 196 routes; 244 not as the rule says (allow-listed: 244); NOT TESTED (no Sample token holds the keys): 0"; "NOT TESTED PF-28 DW6: /api/hooks/stripe is not on main".
* **Fresh Opus reader (P-339):** see "Reader" below.

## Reader
Fresh Opus subagent, read-only, given the code and the row (not this verdict): **Partial, confidence high.** It agrees on the 83 + 244 allow-listed entries by part (it counts **105 distinct routes**; by probe: unknown 74, wrong type 58, missing 57, id 29, unknown query 19, unreached 6, 1 MB 1), the DW6 NOT TESTED, the case side's empty `ALLOW`/`ALLOW_500`, and that the row's 400 is out of date. It also adds three points (kept as gaps 10-12):
* its "skipped for lack of keys" point does not apply on this commit: the sweep printed **0** NOT TESTED for that reason (both runs);
* the 1 MB probe tests the body limit (413), not each field's own maximum length, so "over-long field → named field error" is not proven per field (gap 10);
* CS-V1's static check proves a parse is reached, not that the schema is strict, and its bad-field probes (DW4) cover a sample of files, not every case route (gap 11); a case-side unknown field is named "body", not by its own name (gap 12).

## Bugs
No new rows. QA-507 (Bug · Minor, runtime) re-seen on b6daec801 and named as an R1.10 gap.

## What I could not test
DW6 (no webhook route on main); a recorded walk (no j_10). No browser walk: R1.10 is API-only.

## Questions for the Lead
1. **#1959 will turn `check_pf28_inputs` red unless it writes DW6.** `tests/check_pf28_inputs.ts:225` fails by design the day `/api/hooks/stripe` appears. #1959 (PF-5 part 2, the Stripe webhook) is in CI with main merged in. Please make sure its builder adds the DW6 case (signed event verifies; one byte changed → 400, nothing stored) in #1959, or the merge queue goes red on shard 4.
2. **R1.10's Done when says 400;** the ruling on #2619 says 422 on PF/FO, 400 on the case side. Reword the row (Lead's records) to "422 Problem Details on PF/FO routes (400 only for an unparseable body), 400 on case-side routes". I scored against the ruling.
3. **PF-28 parts 2-6 have no BACKLOG rows.** The allow-list names them by area; shaping them (five PRs, one area each, sizes above) is what moves R1.10. Should R1.10 also get a journey `j_10` (an API-only probe journey), or is the sweep its proof?

## Suggestions
* Shape PF-28 parts 2-6 as five rows with the counts above as their Done when (each lowers the DW7 cap to its area's zero). *Needed for the proof* · *Capability*.
* Fold QA-507 into PF-28 part 2 (same `main.ts` error mapper). *Needed for the proof* · *Capability*.

Duplicate check: open PRs and qa reports for R1.10 / PF-28 since #2619's merge: none; the last R1.10 score is the 19 Nov carry-forward (#2160).
