# Review: FO-9b part 1, merge and Undo of two person records, the PersonMergePort adapter (R1.29)

Independent reviewer (Opus 5.5, effort high; did not build it), 22 Nov. Branch `claude/serene-hopper-xuvdzf`, commit `4f36b1f031b459966d8fd2f20d4804cf27a98d7b`. Spec: brief `design/briefs/track-b/FO-9b-1.md` (at `fbe24aa20`), "Part 1, merge and Undo" of `design/lead-b-briefs/FO-9b.md` (main), `ports/person-merge.ts` and its contract, BACKLOG FO-9b. API and schema only: no screen and no route, so I reviewed code and tests and did not walk a screen. **Journey test: not applicable, no score** (nothing for a user to walk until part 2's routes and FO-9s's screens exist). This file replaces the R1.33 phone-doors review; that one is still in git at `cc1e5afc5`.

## What I ran (Postgres 127.0.0.1:54329; no app port, never :4400; US$0)
* `check_fo9b_merge.ts`: **53/53, exit 0**. `check_fo9b_port` 20/20, `check_fo9a_duplicates` 53/53, `check_fo9a_won_duplicates` 25/25, `check_fo9b_phone_doors` 26/26, `check_fo13c_conflict` 46/46, `check_pf12_walls` 110/110, `check_fo1a_sales_schema` 124/124. `graph.mjs --check`: G1 0, G2 0.
* `prisma migrate diff` (all migrations applied vs `prisma/schema`): **No difference detected**. `rollback.sql` on that database, then a catalog hash (constraints, columns, functions with body, owner and config, triggers, types) compared with a main-only database: **identical**.
* **Not run:** `check_fo9s_duplicates_browser.ts`, because it needs an isolated running copy with its own database (part 1 changes no screen). Full `ci`.
* **Mutation runs** on a scratch copy (one change at a time; 53 cases each). These make the suite go red: no `lockPair` (DW4: 3 of 3 merges succeed), no `set_config` flag (merge aborts), the trigger's `text` check or flag check removed (DW1 fail lines), no `copyConsent` (DW3), no `fresh` query (DW5 plus the contract), no later-merge rule (contract), no tombstone filter in `Duplicates.check` (DW1m), no follow in `arrive` (DW1m). These **stay green**: no filter in `possibleMatch`, no filter in `wonDuplicates`, no "moved row changed since" check in Undo.
* **Scenario probes** (my own script on the same harness, not committed). Results are quoted under each finding.

## Done-when, line by line
| Case | Result |
|---|---|
| DW1: guided pick per field; every row on the survivor; flag unset → note `person_id` UPDATE refused; flag set → text UPDATE refused | Met (and the trigger mutations turn it red) |
| DW1m: tombstone absent from the check / the 409, and a picked one resolves to its survivor | Check and pick: met. **409 and possible match: pass, but do not fail when the rule is removed (M4)** |
| DW2: column test from the live schema; a fake column turns it red | Met |
| DW3: withdrawn consent copied; attribution never lost | Met. The "never lost" assertion is weak (m4) |
| DW4: parallel merges → one 409; self 400; person with company 409; firm B 404 | Met. The race really runs in parallel (with no lock, all 3 succeed) |
| DW5: exact restore; refused after a new note; second Undo 409 | Met as written. **Gaps: M2, M3, m3** |
| DW6: forced last-step failure leaves nothing | Met |
| DW9: shared contract; a rolled-back caller merges nothing | Met. The own-transaction adapter fails the contract |

Also checked and sound: ordered advisory locks taken before any read; firm-scoped re-reads (another firm's record → 404, no hint it exists); `fo_dup_merge` is write-once with only the Undo stamp allowed, has PF-12's forced policy plus the firm-first trigger, and its functions are owned by `xr_wall_reader`. The trigger exception lists every `fo_note` column (`id, firm_id, lead_id, prospect_id, visibility, text, by_actor, created_at`). Attribution and stage moves still refuse every update. The audit line holds ids and field names only. `person.merged`/`person.unmerged` are written last and carry ids only. Every identifier in raw SQL comes from a code constant (with the exception in m6). Values are passed as `$n`.

## Findings

### Major
**M1. Rule 5 breaks under a concurrent writer: a row can be left on the tombstone.** `merge/service.ts:139-167` serialises merges only with other merges (advisory locks on both ids). It takes no row lock on `fo_person`, and the writers do not re-check the tombstone under a lock (`follow.ts:15` is a plain read; `arrival.ts:93`). The tombstone update is NO KEY UPDATE, so foreign-key inserts that point at the loser do not wait. Probe: while the merge transaction was open, a second connection ran Add a lead with `personId: loser`. It waited, then committed **after** the merge, and left "fo_lead on tombstone: 1". A note on no lead, inserted at the same moment, also stayed on the loser. Part 2's automatic merge runs at the arrival match point, which makes this more likely. **Fix:** lock both person rows `FOR UPDATE` right after the advisory locks (`find`), and make `livePersonId` read `FOR SHARE` when called in a writer's transaction (`arrive`). Then a writer either commits first, and its row is moved, or waits and follows to the survivor. Add a DW4 race case, for example the probe above. Any writer left uncovered goes in the PR as a residual for Lead B.

**M2. After Undo, the survivor keeps the loser's live consent and can be sent marketing on it.** `service.ts:163` copies consent. Undo (`service.ts:212-237`) deliberately keeps the copies, and DW5's `state()` leaves consent out, so the test cannot see this. Probe: the survivor had no consent and the loser had a live EMAIL MARKETING consent. Before the merge, `allows` returned `NO_CONSENT`. After merge plus Undo it returned `{"allowed":true,"reason":"CONSENT"}`, with 1 live row on the survivor. Undo exists for a wrong merge, so this leaves another person's consent on a separate record. That breaks "Undo restores both records" (brief DW5; the port's `unmergePersons` doc), and the snapshot lists `copied` ids for exactly this reason. **Fix (within the touch list):** refuse Undo (409 UNDO_REFUSED, with the reason) while any consent copy it wrote is still live, and add a DW5 fail case. If Lead B wants Undo to end the copies instead, that needs a ConsentPort method: put it to the tech lead on the PR as a question. Legal effect: Unconfirmed, no counsel.

**M3. The Undo refusal skips prospects for persons, so after Undo a prospect and its lead name different people.** `service.ts:197-203` checks fo_lead, fo_note, fo_call, fo_arrival_receipt, fo_booking and fo_company_contact. `fo_prospect` is missing, although the comment at `:195` lists "a prospect", and the company branch at `:204-205` does check it. Probe: merge, then Engage the moved lead (prospect created with subject S), then Undo. Undo **ran**, leaving "prospect subject: S, its lead's person: L". **Fix:** add `fo_prospect` (`subject_person_id` or `primary_contact_person_id` = survivor, `created_at > at`) to the person query, with a DW5 fail case.

**M4. DW1m's 409 and possible-match cases do not fail when the rule is removed.** In `check_fo9b_merge.ts:185-190`, the loser's email `maya.rao@…` is also held by the flagged third person, who was created later. `possibleMatch` orders by `createdAt desc`, so it returns the third person with or without `mergedIntoId: null` (`arrival.ts:47`). The mutation stays 53/53, so the brief's "409 … fails as named" is not shown. **Fix:** use an email or phone held only by the loser (expect `possibleMatch` → null and no 409), or make the third person older than the loser.

### Minor
* **m1.** A refusal comes after writes. In a company merge, `service.ts:108-109` refuses "Both companies have a primary contact" only after step 1 has written the survivor's name (`:154-157`) and `endDuplicateLinks` has ended links. The port promises "a refusal changes nothing". Probe: a caller that caught the refusal and committed was left with the survivor renamed "New Name (Sample)" and 0 merge records. Fix: check before any write.
* **m2.** `fo_dup.merging` stays `on` for the rest of the caller's transaction (`service.ts:61, 159, 212`; the adapter runs in CS-K2's transaction). Probe: after `mergePersons` returned, the caller re-pointed an unrelated note that has no lead. Fix: `set_config('fo_dup.merging', 'off', true)` before returning from merge and from Undo.
* **m3.** Undo silently overwrites edits made to the survivor after the merge (`service.ts:221-223`, `survivorBefore`). Probe: staff set the survivor's phone to +14165550199 after the merge (PeopleEdit `editPhone`). Undo restored +14165550144, with no refusal and no audit of the change. Fix: refuse when the survivor's merge fields differ from what the merge wrote, or name it in the PR as accepted.
* **m4. Test gaps** (each mutation stays green): Undo's "moved row changed since" refusal (`service.ts:208-211`), the `wonDuplicates` tombstone filter (`duplicates/service.ts:109, 122`), the `fo_booking` MOVE (no booking in any fixture), and company merges with links or prospects (contract case only). DW3's "no attribution lost" compares firm A's count with the total count, which is trivially equal (`check_fo9b_merge.ts:178`).
* **m5. Clocks.** The merge's `at` comes from the app clock (`service.ts:165`), while `fresh` compares it with database `created_at`/`received_at`. With skew, a note written just after the merge escapes the refusal. `valid_to` is compared as text (`:209-210`), which depends on the session's TimeZone. Fix: take `at` from the database (`now()`) and compare values as typed.
* **m6. Second-order identifiers.** Undo builds SQL identifiers from `loser_snapshot` JSON stored in the database (`c.t`, `c.c` at `service.ts:209, 220`), quoted but not escaped. Fix: whitelist them against `COLUMNS` MOVE plus `fo_company_contact.valid_to` before use.
* **m7. Process (state each in the PR body).** The change is 851 lines in studio (837 added, 14 removed), above the 800 limit: the brief says to ask in a PR comment, or split Undo out. `sales/leads.ts:152` is outside the touch list, but needed: a tombstone has no visible lead, so without it Add a lead with the picked tombstone returns 404 and DW1m's pick case cannot pass. `check_fo9b_port.ts:59` was edited although the brief said "unchanged": justified, because the guard now counts the adapter's contract run as well (×2). `check_fo1a_sales_schema.ts:441-442` adds the brief's own `fo_dup_` prefix: justified. Also list the P-600 (b) exception lines, and state that the tombstone is on the slot lines rather than in `fo_dup_merge`, and that `features/front-office-merge.ts` is left to part 2 (no route).

Out of scope, noted: the `arrival-port.ts:87` `bookingForPerson` path and the booking module can still write on a tombstone id. The brief's M3 named only the check, the 409 and the pick.

**Verdict: Changes** on `4f36b1f031b459966d8fd2f20d4804cf27a98d7b`. Fix M1-M4, each with a case that fails without the fix. The Minors should be fixed or answered in the PR. Do not add `review: approved` for this commit.

Reviewer: Changes 4f36b1f031b459966d8fd2f20d4804cf27a98d7b

## Round 2 (ae52eabd6)

Diff-only re-review (Opus 5.5, effort high; P-277), commit `ae52eabd60b9c22715b5880c46485fb5ea38b5f4`. I read `git diff 4f36b1f03 ae52eabd6 -- …/prototype/studio` and the context it needs. **Journey test: not applicable, no score** (still no screen and no route).

**What I ran** (Postgres 127.0.0.1:54329, my own scratch databases, all dropped; no app port, never :4400; US$0):
* `check_fo9b_merge.ts`: **66/66, exit 0**.
* Regressions, all green: fo9b_port 20, fo9a_duplicates 53, fo9a_won 25, fo9b_phone_doors 26, fo13c 46, pf12_walls 110, fo1a 124, fo1b 80, fo1p 35, fo2 116, fo2b 61, fo2p3 44, fo2p3b 53, fo2p4 30, fo2w 19, fo3_booking 133, fo9a_phone_edit 37, fo10p2 37, fo13i 27, pf12b_doors 33, pf15_booking 42, fo3a2_feed 26, fo2pv 27, fo10 42. fo3_booking failed once while my other runs were running, because its advisory-lock count is cluster-wide; it passed 133/133 when run alone.
* `graph.mjs --check`: G1 0, G2 0.
* Rollback: a database with every migration and then `rollback.sql`, compared with one built without this migration. The catalog hash (constraints, triggers, functions with owner and config, columns, policies, the wall reader's CREATE) is **identical**. In my raw-applied database only the last line fails, the `_prisma_migrations` delete, because that table does not exist there.
* **Not run:** fo8_prospect_won, r130_prospect_source, csk1_client (each needs an isolated running copy), the browser suites, full `ci`.
* **Mutation runs** on a scratch copy (one change at a time, then the 66 cases).
* **Probes** (my own script, not committed), quoted below.
* Privileges: `xr_wall_reader` has BYPASSRLS and SELECT+UPDATE on fo_person/fo_company (PF-12's grants, nothing new). So `FOR KEY SHARE` in the trigger works whatever the firm setting. `xr_app` has UPDATE too, so `livePersonId` works on the production client. Probe: Add with `personId` set to a tombstone, through the walled client, is followed to the survivor.

### Round-1 findings: fixed, and does the test fail without the fix?
| Finding | Fixed | Mutation (fix removed) |
|---|---|---|
| Review M1 = break M1 (row left on the tombstone) | Yes: `find … for update`, `livePersonId … for key share`, `fo_dup_live_party` on the 7 MOVE tables (the trigger arguments match `columns.ts` MOVE exactly) | No `for update`: 3 red. No `for key share`: red. No fo_note guard: red. **No fo_lead guard: stays green** (m4) |
| Review M2 (live consent kept after Undo) | Refused while a copy is live | Red |
| Review M3 = break M3 (prospect, consent after the merge) | Yes, prospect line plus msg_consent and withdrawal lines | Red, both |
| Review M4 (409, possible match) | Yes: the loser's own email | Filter removed in `possibleMatch`: red |
| m1 = break m2 (refusal after writes) | Yes, checked before step 1 | Red |
| m2 (flag left on) | Yes, set off after the move and after Undo | Red |
| m3 = break M2 (Undo overwrote survivor edits) | Yes, compared with `survivorAfter` | Red |
| m4 (test gaps) | wonDuplicates case, booking MOVE, moved-row case, real DW3 attribution | wonDuplicates filter removed: red. Moved-row check removed: red |
| m5 (clocks) | Partly: `valid_to` is now compared as typed, but see m3 below | (no test, acceptable) |
| m6 = break m4 crafted column | Yes, whitelist (`UNDOABLE`) | Red. **Break m4 rest still open** (m6 below) |
| Break m1 (Undo racing a note) | Yes. Probe: a note held uncommitted on S makes Undo wait and then refuse | **Undo's row locks removed: stays green** (m4) |
| Break m5 (a request per row) | Batched by table, column and value | (timing only) |

### New findings
**Blocker**
* **B1. The usual merge fails: newer into older, when the newer person's lead is flagged as a possible match of the older one.** The code is unchanged since round 1, and I missed it. The breaker found it in round 2 and I reproduced it. Probe: Add with `confirmedNew` and the old person's email flags the new lead at the old person. `mergePersons(old ← new)` then returns raw `23514 fo_lead_links_check` (P2010, a 500, not a refusal), and nothing is merged. The reverse direction works. Cause: `service.ts:93` moves L's leads onto S while `possible_match_person_id = S`. The clean-up at `:98` (`s → null where person_id = s`) runs only after that move, so it never gets a chance. This is the pair the duplicate list exists for. **Fix:** clear S-flags on L's leads (record the Change) before `:93`, and let Undo reverse it in order. Add a DW1 case for this pair.

**Major**
* **M1. New deadlocks between merge or Undo and ordinary writers on the same person (new in this commit).** Merge and Undo lock the person rows first (`find … for update`, `:49`, Undo `:209-210`) and the leads after that (`:93`, `:212`). Writers lock in the opposite order. `Activity.addNote`/`logCall` (`calls.ts:52-53`, the person's leads `for update`), engage and close-with-note lock the leads first. Then their insert takes `FOR KEY SHARE` on the person through `fo_dup_live_party`. `livePersonId` locks loser then survivor (`follow.ts:19`), while Undo locks survivor then loser. Probes:
  * Undo against a writer following the tombstone: **Undo got 40P01 "deadlock detected"**.
  * A random stress (as xr_app: merges, Undos, Add with personId, notes): 1 Add and 1 merge lost to 40P01. No row ended up on a tombstone.
  * The breaker measured 22 deadlocks in 48 aligned races at this commit, against 0 at `4f36b1f03`.

  Data stays safe, but ordinary note, call and engage requests, and merges, fail as raw 500s. **Fix:** take locks in the writers' order: the persons' leads (`order by id for update`) before the person rows, and in Undo the loser before the survivor. Or map 40P01 through `api/src/busy.ts` to a retryable answer. Either way, add a race case (addNote against a merge, Undo against a follow).

**Minor**
* **m1. A legitimate arrival is refused when its possible match is merged while it is in flight (new).** `possibleMatch` (`arrival.ts:47`) reads without a lock. The lead insert (`:120`) then waits in the guard, sees the tombstone, and fails with P2003. Probe: Add with `confirmedNew` and the loser's email while the merge is open fails, where it should succeed with the flag on the survivor. Web and booking arrivals share `arrive()`, and part 2's automatic merge runs at the arrival match point. Fix: follow the match through a locking read (as `livePersonId` does), or list it for part 2.
* **m2. Once a live consent is copied, Undo can never run.** Probe: after staff withdraw the copy on S, Undo is still refused, now by the `msg_consent_withdrawal` line (`:230`). Its reason, "Something reached the merged record … contact details", misleads. The PR should say "never" rather than "while live", and the reason should name the consent.
* **m3. Undo's "after the merge" test now mixes two clocks.** `at` is the database's `clock_timestamp()` (`:66`). Prisma fills `created_at` itself: probe, a note's `created_at` was 702 ms after its transaction began, which is the app's time when it was written. So skew still lets a row slip past the check, now for rows written through Prisma, and the comment "rows' database times" is wrong. Fix: use one clock (for example `at` from `now()` plus the database default everywhere this check reads), or record it as a residual.
* **m4. Test gaps.**
  * Undo's row locks (break m1) have no case: removing them stays green, although my probe shows they work.
  * Of the seven guards only fo_note's fails alone. The "lead re-pointed" case passes through the fo_note cascade, and removing the fo_lead guard stays green.
  * No check ties the trigger arguments to `columns.ts` MOVE, so a future MOVE column would go unguarded. Add a schema check, as DW2 does.
* **m5. Nit.** `follow.ts:2` still says "Reads only"; it now locks.
* **m6. Break m4 is still partly open (Minor, as in round 1).** Undo ignores its own `find(l)` (`:210`) and never checks `l.merged_into_id = s`. The breaker's crafted record, with a live "loser", still moves another person's lead and writes the crafted `survivor_before`. A forged Undo stamp is still accepted. List them in the PR, or add the tombstone check.

Kept as is, per the brief, to be listed in the PR: break m3 / review m2's design (the flag is now set off after use), Undo leaving consent copies (now refused, see m2), the size (~990 lines), and the three edits outside the touch list.

**Verdict: Changes** on `ae52eabd60b9c22715b5880c46485fb5ea38b5f4`. Fix B1 and M1, each with a case that fails without the fix. Fix the Minors or list them in the PR. Do not add `review: approved` for this commit.

Reviewer: Changes ae52eabd60b9c22715b5880c46485fb5ea38b5f4
