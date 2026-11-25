# Journey test: FO-2 part 3 prospects (API only), reviewer, 18 Nov 2026, commit d09490d99

There is no screen; FO-4 part 2a builds one later. So the journeys were walked as a person's calls over HTTP, signed in through local identity, on an isolated copy at :4431 (runtime range, database `xr_studio_screens_fo4sf`, stopped afterwards). After each journey I checked the data underneath in the database. The probe scripts stayed in the session scratchpad and are not committed.

## Journeys (persona · goal · result)
1. **Main path.** Case Manager T: "I take Mira on, move her to Qualified, make her a client, then undo it because I picked the wrong person."
   * Add lead: 201 (95 ms). Engage: 201 (67 ms), P-00001 in Engaged with a version. Move with the version: 200, Qualified.
   * The board (`pipelines/individual/board`) shows CAD 1200.00 per stage and open.
   * Convert: 200, WON, with "Retainer not signed. Work can start…". Undo without a reason: 422 at the field. Undo with a reason: 200, back to Qualified.
   * **Held.**
2. **Alternate.** T engages the same lead again: 201, `again: true`, "This lead already had a prospect (P-00001). This is another one." Marking it lost as Duplicate of another prospect: 200, Lost. **Held.**
3. **Empty.** The Lost filter with owner O: 200 `[]`. **Held.**
4. **Errors.**
   * Move into Won: 422 with AG-2-26 rule 3's words. Lost without a reason: 400 naming the field. `from=2026-02-30`: 400.
   * **`from=0000-01-01` → 500** (m1).
5. **Wrong role and firm.** Firm B reading firm A's prospect: 404. Engage with no sign-in: 401. The key per route is checked in `check_fo2p3` (the Read-only role holds no write key). **Held.**
6. **Recovery.**
   * Stale version: 409 "Second representative (Sample) moved this to Qualified. Reload it."
   * Convert clicked twice, one after the other: 409 "This prospect is already a client."
   * **Held.**
7. **Two tabs at once.** T and R move P-00001 with the same version at the same moment: **200 and 404 "No such prospect in your firm."** It should be 409 STALE (M1). In-process the same happens for move vs Mark lost and for Convert vs Convert.
8. **Across the boundary.** R filters leads by owner T: 200, 33 rows, every one T's. The board reached through FO-2b's route carries `totals`. **Held.**

## Data underneath (journey 1's prospect)
* **Audit:** one line per write (`lead.engaged`, `prospect.stage_moved` ×2, `prospect.won`, `prospect.unconverted`), each with actor `staff:<id>`.
* **Outbox, in order:** `lead.engaged`, `prospect.stage_moved`, `prospect.won`, `prospect.unconverted`, `prospect.stage_moved`.
* **Moves:** PERSON, PERSON, CONVERT, PERSON, PERSON.
* **Note:** one INTERNAL note "Convert undone: Converted the wrong person". The reason is in no audit line and no payload.
* **Prospects:** two on the lead (journey 2). Nothing else changed.

## Break-it pass (about 15 min)
* **Races:** M1 (Major).
* **Array query values** (`owner`, `from`, `stage` sent twice): 400, not a crash.
* **`version` sent as a number:** accepted.
* **A stale version on Mark lost:** 409 STALE.
* **Hostile and long text:** covered by `common.ts` `text()`, already tested in FO-2's suite.
* **Year 0000:** 500 (m1).

## Score (each 0, ½ or 1)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1-3, 5, 6 and 8 complete through the API alone |
| Next step obvious | ½ | Refusals name the next step ("Use Convert to client", "Reopen it first", "Reload it"), but the race loser is told the prospect does not exist (J7) |
| Plain words | 1 | Messages are plain; AG-2-26 rule 3 and AG-2-47 rule 16 are quoted exactly |
| Feedback and state | ½ | `again`, `warning`, `version`, `retainerSigned` all returned; the race answer gives the wrong state (J7) |
| Correct data | 1 | One record, one audit line and one outbox row per write; typed actor; firm-scoped |
| Error recovery | ½ | Stale 409 with a reload is good; race → 404; year 0000 → 500 |
| Accessibility and screen sizes | N/A | No screen (FO-4 part 2a) |
| Speed | 1 | Every call under 100 ms on the Sample data; no request per row |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | Each move records its cause and who made it; the stale message names the person; no AI |

**6.5 of 8 applicable = 8.1/10, no 0: passes on score.** The verdict is still Block because of review M1 and M2.

**Fixes that would raise the low criteria, most valuable first:**
1. Lock the prospect alone, so a race loser gets 409 STALE or ALREADY_WON (next step, feedback, recovery).
2. Refuse year 0000 with a 400 (recovery).

## Could not test
* No browser, axe or screen sizes: there is no page.
* No real screen reader.
* No intended user's unaided walk: D17 and D20 stay with the founder.
