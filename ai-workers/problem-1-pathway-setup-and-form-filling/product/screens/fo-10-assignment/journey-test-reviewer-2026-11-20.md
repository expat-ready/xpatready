# FO-10 part 1: journey test, reviewer role, 20 Nov 2026 (PR #2476, reviewed commit 0d8b42d68)

API only (no screen in this part), so there is no browser walk. Each journey ran as plain HTTP calls on an isolated copy, `tools/isolated.sh fo10rev 4432` (the runtime ports), signed in through the local stand-in. The data was then read with psql. The front office was seeded with FO-1a's Sample seed, and the Sample web form got its firm's consent wording so that it could be enabled (both are setup only, not FO-10's capability). The copy and its database were stopped and dropped afterwards.
**Which code:** the shared checkout moved to 981dea1 (the breaker fixes) at 09:20 UTC, before the copy restarted, so the live walk ran on 981dea1. Results that differ at 0d8b42d are marked; for them the evidence is the PR's suite, the mutation runs and the probe on an archive of 0d8b42d (see `review.md`).

## Journeys (persona · goal · result)
1. **Main.** Owner (user-R): "share new web enquiries fairly among my team". `GET` rules returns `[]`. `POST {"door":"WEB_FORM","strategy":"ROUND_ROBIN"}` returns 200 (18 ms) with the stored rule. Three public web-form enquiries return 201 each, about 20-40 ms. They become L-00001, L-00002 and L-00003, owned by Case officer, Representative and Second representative in turn. The lead's timeline shows "Lead L-00001 arrived by the web form, assigned to staff 6594d861-… by round robin." **Held.**
2. **Alternate: service beats door; booking rule; switched off.** Proven by the suite (`check_fo10_assignment.ts:132-153`) and by the precedence mutation (it fails when the order is swapped). **Held.**
3. **Error.** A MANUAL rule returns 422 with "A lead added by hand belongs to the person who added it…" and a door field error. A bad owner id returns 422 with an ownerStaffId field error. `{}` returns 422 with "Choose one person or round robin." A non-list turn returns 422. **Held.**
4. **Wrong role.** A Case Officer's `GET` and `POST` of rules each return 403 `MISSING_PERMISSION`, which names `agent/prospect:configure-source`. **Held.**
5. **Recovery: repeat and double click.** The same BOOKING save sent twice gives one row (same id), with the cursor kept. Off sent twice returns 200 both times, and only the first writes an audit line. A forced audit failure on `lead.created` rolls back the arrival and the cursor (suite). **Held.**
6. **Empty.** No rule, or nobody in the turn active: the lead goes to Unassigned, and the audit line gives the reason (`NO_ELIGIBLE`, suite). **Held.**
7. **Other firm.** sample-solo's Owner gets `[]` from the list. Off on firm A's rule returns 404 "No such assignment rule in your firm.", and a non-uuid id returns 404. **Held in the app.** In the database the table has no PF-12 policy (review B1).
8. **Hand-over across the boundary: a role change in staff settings.** The Owner changes the Case Officer to READ_ONLY (`PATCH /api/platform/staff/:id/roles` returns 200), and `/me` no longer lists `agent/prospect:edit`. On 981dea1 the next 4 leads alternate between Representative and Second representative. **At 0d8b42d the probe gave the ended-role person the lead (review M1).**
9. **Inactive named owner.** The lead goes to Unassigned, and the timeline gives the reason (suite lines 144-150). At 0d8b42d a Read-only owner is accepted (review M2). **Partly held.**

## Break-it (15 min)
* **Parallel arrivals.** 20 parallel arrivals give 6/7/7. Without the row lock they give [3,11,6] and [5,10,5], so the suite catches the race.
* **Duplicate saves.** The upsert is atomic: the breaker ran 8 parallel first saves and got 1 row.
* **Wrong role by URL** is refused, and so is **another firm's id**.
* **Very long or non-English text:** the rules have no free text (ids and enums only), so there was nothing to try.
* **A hostile file:** not applicable.

## Score (adapted to an API row, as for FO-1a and FO-2)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1: rule saved, three leads placed in turn over HTTP |
| Next step obvious | ½ | each 422 names its field; at 0d8b42d a field the strategy does not use is dropped silently with a 200 (breaker m4) |
| Plain words | ½ | error texts are plain; the timeline line shows a raw staff id and does not name the rule in words (review m3) |
| Feedback and state | 1 | save returns the stored rule; repeat off is idempotent; audit lines carry the rule id and the fallback reason |
| Correct data | ½ | one row per criteria, fair cursor, rollback exact; at 0d8b42d an ended-role person or a non-sales owner gets leads (M1, M2) |
| Error recovery | 1 | audit failure rolls back the arrival and the cursor; repeat save keeps the row and the cursor |
| Access (stands in for accessibility and screen sizes) | ½ | firm scoping and the key hold at the API (J4, J7); the database wall is missing (B1) |
| Speed | 1 | calls 15-45 ms, submissions 20-40 ms, suite 9 s; OWNER rules serialise more than needed (m2) |
| Consistency (stands in for visual quality) | ½ | follows FO-1a's area-file, trigger and check pattern; breaks PF-12's "every later firm table ships its policy"; reads the key differently from the guard (ended grants) |
| Trust and sources | 1 | AG-2-13a/b/d cited; the PF-20 deviation is stated in the PR, not silent; no immigration values |

**7½/10, no criterion at 0: below the bar (8).** Fixes, most valuable first:
1. The PF-12 policy on `fo_assignment_rule` (access, consistency).
2. Ended grants and the OWNER key check, both in 981dea1 (correct data).
3. Refuse fields the strategy does not use, also in 981dea1 (next step).
4. Name the person and the rule in words on the timeline, in the screen part (plain words).

## Not tested
* A screen: none in this part, so no keyboard, axe, widths or screenshots.
* A real screen reader.
* An intended user's unaided walk (D17/D20 stay with the founder).
* The automation action and the "needs you" item: part 2, not built.
