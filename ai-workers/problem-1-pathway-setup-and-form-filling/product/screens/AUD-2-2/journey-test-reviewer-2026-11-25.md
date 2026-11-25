# AUD-2 part 2: journey test (reviewer role, 25 Nov 2026)

**Commit:** `2e20bdf93e17a3c89b1ac3f2c1f699816c105d02`.

**Scope:** the demo routes and the daily job, API only (no screen).
* The "person" is the configuration author on the demo, showing that the archive is write-once. The words returned are what a person reads.
* Run on isolated copy `aud22rv` at http://localhost:4436 (fresh database, the in-memory fake archive), never :4400. The copy was stopped afterwards.
* The probe journeys (P1-P4) ran on a scratch database with the real export and checker classes.

## Journeys (main path first)
| # | Persona · goal | Expected | Result |
|---|---|---|---|
| J1 | Author: "export today's chain now" | One file and one anchor per firm chain, kept 7 years | Held: 2 chains, `…/2026-11-25-1-3.jsonl` and `anchors/2026-11-25-3.json`, kept until 2033-11-25 |
| J1b | Same, a second click | Nothing new | Held, but the answer `{"exports":[]}` does not say why (today's anchor) |
| J2 | Author: "show me what is archived" | Keys, digests and dates, never bytes | Held |
| J3 | Approver (no author duty): export | 403 in words | Held: "Approver (simulated) does not hold the author duty" |
| J4 | Author: replace an anchor | 409 refused | Held: "Refused: an archived object is written once and never replaced." |
| J5 | Author: delete an anchor | 423 refused | Held: "Refused: kept until 2033-11-25T06:11:00.000Z; …" |
| J6 | Error: no key / bad `how` / key `../X` | 400 in words | No key and bad `how` gave 400. **`../X` gave 500** |
| J7 | Author: "check now" after the export | INTACT, no break | Held: 2 chains, no breaks |
| J8 | Error: "replace" on a mistyped (unwritten) anchor key, then check | Refused, not found | **`{"done":true}` and the object is written. Every later check answers 500** until a restart |
| P1 | Recovery: anchor put fails all day 26 Nov, the job runs again on 27 Nov | One file per line range | **Two files, 4-5 and 4-6** |
| P2 | Owner-level attacker: newest anchor hidden (S3 delete marker), lines after the older anchor rewritten | A finding | **No finding** (with the anchor visible: `anchor 6`) |
| P3 | Owner-level attacker: firm C's chain and its check row deleted | A finding | **No finding**: the chain is not in the pass |

## Data underneath
* The archived files hold every line once, in seq order, with hex hashes. Each firm's file holds only its own lines (also the suite's DW3/DW4).
* After J4 and J5 the archive was unchanged. After J8 it holds one more object.

## Break it
* Held: a wrong role, a second run, a replace, a delete, a missing key.
* Broke:
  * J6: a bad key gives 500 (Minor).
  * J8: a created key stops the check (Major).
  * P1: the duplicate file (Major).
  * P2/P3: the anchor check is bypassed (Major).
* Details and fixes are in `review.md`.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1, J2, J4, J5 and J7 do what the demo promises |
| Next step obvious | ½ | J1b: an empty answer with no reason |
| Plain words | 1 | Refusals and duty errors in plain words; keep-until date shown |
| Feedback and state | ½ | J8 says `done: true` for a write the route is meant to show as refused |
| Correct data | ½ | Main path exact; P1 duplicate, P2/P3 silent |
| Error recovery | 0 | J8: one mistyped key leaves the check at 500 until a restart; J6 is a 500 |
| Accessibility and screen sizes | N/A | No screen |
| Speed | 1 | 7-13 ms an export or a check on the copy |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Sample labelled; digests and keep-until shown, never bytes |

**Score: 6.9/10.** That is 5.5 of the 8 criteria that apply, scaled to 10; the two N/A criteria are left out.

**Verdict: Fail.** The score is below 8 and error recovery is at 0.

**Fixes that would raise it, most valuable first:**
1. The tamper route refuses an absent key (404), and a bad anchor is a finding, not a 500 (error recovery, feedback).
2. A bad key gives 400 (error recovery).
3. Resume on `fromSeq` across days, and the archived-chain and hidden-anchor checks (correct data).
4. J1b says "today's export is done" (next step).

**Could not test:** a real bucket (P-821), a screen reader and an intended user's walk (D17 and D20 stay with the founder), and the 404 outside the demo (read in the code).
