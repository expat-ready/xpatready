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

## Round 3 (4bcbf9c41)

Diff-only re-review (Opus 5.5, effort high; round 3 allowed by the tech lead on PR #3042), commit `4bcbf9c4119fb844ebf91e6f07628a01995cd586`. I read `git diff ae52eabd6 4bcbf9c41 -- …/prototype/studio` (follow.ts, service.ts, the migration, the check) and the writers it locks against (`calls.ts`, `arrival.ts`, `arrival-port.ts`, `corporate/service.ts`, `people/edit.ts`). **Journey test: not applicable, no score** (still no screen and no route; R1.29's step comes after part 2 and FO-9s).

**What I ran** (Postgres 127.0.0.1:54329, my own scratch databases `xr_rv_*`, all dropped; no app port, never :4400; US$0):
* `check_fo9b_merge.ts`: **75/75, exit 0**.
* Regressions, all exit 0: fo9b_port 20, fo9a_duplicates 53, fo9a_won_duplicates 25, fo9b_phone_doors 26, pf12_walls 110, fo2b_corporate 61, fo2p4_calls_timeline 30, fo2_leads_prospects 116, fo1a_sales_schema 124, fo10p2_sharing 37, fo13c_conflict 46, fo2p3_prospects 44, fo1p_person_port 35, fo1b_booking_schema 80, fo9a_phone_edit 37, fo3_booking 133 (run alone).
* Rollback: every migration, then `rollback.sql`, against a database built without this migration. The catalog hash (constraints, trigger definitions, functions with owner, config and source, columns, policies) is **identical**. Only the `_prisma_migrations` delete fails, because a raw-applied database has no such table.
* Catalog: `fo_dup_live_party` and `fo_dup_merge_write` are SECURITY DEFINER, owned by `xr_wall_reader`, `search_path=pg_catalog, public, pg_temp`. So the unqualified `format('… %I …', TG_TABLE_NAME)` resolves to `public` and runs past the wall. The seven triggers are DEFERRABLE INITIALLY DEFERRED.
* **Mutation runs** on a scratch copy: one change at a time, then the 75 cases (race cases 2-3 times).
* **Probes** (my own script, not committed), quoted below. To check whether a problem is new, I ran the same script on an extracted copy of `ae52eabd6`.

### Round-2 findings: fixed, and does the test fail without the fix?
| Finding | Fixed | Mutation (fix removed) |
|---|---|---|
| B1 (lead flagged as a possible match of the survivor) | Yes: flags between the pair are cleared before the leads move (`service.ts:102-103`), and Undo reverses them in order | Clean-up moved back after the lead move: **red** (DW1 B1). DW5 B1 checks Undo restores flag and lead exactly |
| M1 (deadlocks, persons) | Yes for persons: `lockRows` (moved rows, `order by id`), then loser, then survivor; Undo locks its moved rows, then loser, then survivor | No `lockRows`: **red 3/3** (15-16 deadlocks). No Undo row locks: **red 3/3**. Undo survivor-before-loser: **red 2/2**. My probe: 12 merges against engage, addNote, logCall and Add-with-personId on the loser, plus 12 Undos against Add and two notes, gave **0 deadlocks** and 0 rows on a tombstone. **But the company side is new Major M1 below** |
| M1, the deferred guard itself | Present | **Making it NOT DEFERRABLE stays green 3/3**; dropping its `FOR KEY SHARE` stays green. See m2 below |
| m1 (arrival refused when its possible match is merged meanwhile) | **No.** See m1 below | (no case) |
| m2 (consent permanence) | Yes: only live copies refuse; the reason now says to withdraw it first; withdrawals are not counted | `withdrawnAt: null` removed: **red** |
| m3 (clocks) | Yes: `reaching()` compares ids, so no clock is involved. `at` is still `clock_timestamp()`, but it is only compared with other merges' `at` | `present` check disabled: **red** (7 cases, including the port contract) |
| m4 (test gaps) | Yes: the trigger arguments are tied to MOVE (DW2), and the fo_lead guard is tested alone | Column dropped from the fo_prospect guard: **red**. fo_lead guard removed: **red** (3) |
| m5 (follow.ts comment) | Yes | n/a |
| m6 (break m4 remainder) | Partly. The stamp guard is in the DB, and Undo checks `lo.merged_into_id = s` | Stamp guard off: **red**. **Tombstone check removed: stays green** (m3 below) |

Undo stamp order is right: the tombstone ends (`:266`) before the stamp (`:283`), and the stamp guard reads both `fo_person` and `fo_company` past the wall. Cost at commit is fine. A loser and a survivor with 400 leads and 400 notes each: merge 228 ms, Undo 235 ms (`ae52eabd6`: 197 / 160). With 2,000 each: 1.1 s / 1.4 s (`ae52eabd6`: 1.6 s / 1.6 s). The `reaching` snapshot stores 75 KB for 1,607 ids and 366 KB for 8,007 ids (TOASTed jsonb). That is acceptable for one person; note it for part 2's automatic merges. Re-reading the current row (`cur`) is needed and covered: reading `NEW` turns DW1 B1 red, because the merge's own flag-clear UPDATE event names the loser. The same-transaction shape (a note written on L, then L merged in that transaction) commits with the note on the survivor.

### New findings
**Blocker**: none.

**Major**
* **M1. Company merges and Undos now deadlock with the corporate contact writers (new in this commit).** `lockRows` takes `fo_company_contact` and `fo_prospect` rows before the company records (`service.ts:172`, the comment at `:29-31`). Undo does the same (`:238-240`). But the corporate writers lock the company row first and the contact rows after it: `changeRole` and `endContact` (`corporate/service.ts:269` then `:275`/`:291`; `:306` then `:310`). The comment's rule "a row it writes, then the record" holds for the person writers, not for these.
  * Deterministic probe: a third session holds the loser company `FOR KEY SHARE`, so the merge stops after `lockRows`. Then `endContact` on a link of the survivor runs, and the hold is released. Result: **`endContact` gets "deadlock detected" (40P01, a raw 500); the merge commits.** Same with `changeRole(… PRIMARY)`. On `ae52eabd6` the same script gives `writer=ok` both times.
  * Random race, 12 company merges against an `endContact` and a `changeRole` on the survivor: **3/12 merges lost to 40P01** (0/12 on `ae52eabd6`).
  * No data was wrong.
  * Fix: on the company side take the records first (sorted, or loser then survivor), then the rows, as the corporate writers do. Engage and change-type lock a lead or an Individual prospect first, which a company merge never locks, so that order has no cycle that I can find. Keep rows-first for persons. Or map 40P01 through `api/src/busy.ts` to a retryable answer. Either way, add a race case: `endContact`/`changeRole` against a company merge and against its Undo. The Undo half is from reading the code; I did not probe it.

**Minor**
* **m1. Round-2 m1 is not fixed and not listed in the PR.** Probe: a merge S ← L is held open after the tombstone. Add a lead with `confirmedNew` and L's email. It fails with **`ForeignKeyConstraintViolation`**, now at COMMIT through the deferred guard; no flag lands on either record. `possibleMatch` (`arrival.ts:47`) still reads without a lock. Web and booking arrivals share `arrive()`. Fix: follow the match through a locking read, or list it in the PR as a part-2 item.
* **m2. The deferred guard has no case that needs the deferral, and its comment's reasoning is off.** Every guarded column also has a foreign key. Its RI check takes `FOR KEY SHARE` on the person or company at the statement, not at commit. So "at commit the writer already holds its own rows, so its locks run row, then record" is not what orders the locks: `lockRows` is. The mutations agree: NOT DEFERRABLE stays green 3/3, and no `FOR KEY SHARE` in the trigger stays green. It is harmless as it stands (errors now come at COMMIT). Either correct the comment, or go back to an immediate check, or add a case that fails without the deferral.
* **m3. The Undo tombstone check (break m4) has no case of its own.** The crafted-record case copies another pair's `survivorAfter`, so the "edited after the merge" check refuses it first. With `lo.row.merged_into_id !== s` removed the suite stays green. Give the crafted record the target survivor's own `survivorAfter`. Residual for the PR (Minor, as before): a crafted record for a real standing pair, inserted with a later `at`, still passes every check, and its `changes` can name other people's rows that currently hold `to`. It needs INSERT on `fo_dup_merge`.
* **m4. A writer racing a merge on the loser's lead gets 404 "No such lead in your firm."** Seen several times in my person race; no deadlock. Cause: `calls.ts:56` assumes "a lead's person never changes; moved meanwhile = changed" → 404. The lead exists on the survivor, and a retry works. This is outside the touch list, so list it for part 2 or FO-9s (409 "changed, reload", or follow the lead).

Kept as is, per the brief: size (P-805), the three edits outside the touch list, STAYS, consent, and the flag questions in the PR.

**Verdict: Changes** on `4bcbf9c4119fb844ebf91e6f07628a01995cd586`. Fix M1 (company-side lock order, or retry on 40P01), with a race case that fails without the fix. Fix m1-m4 or list them in the PR. Do not add `review: approved` for this commit.

Reviewer: Changes 4bcbf9c4119fb844ebf91e6f07628a01995cd586

## Round 4 (c5b957bb7)

This is a diff-only re-review (Opus 5.5, effort high; round 4 allowed by the tech lead on PR #3042, Lead 4 17:09 IST) of commit `c5b957bb73ddca910a8e14a33b4e09a799ad6e76`. I read `git diff 4bcbf9c41 c5b957bb7 -- …/prototype/studio` (service.ts, arrival.ts, the migration and rollback, the check), plus the writers it orders against: `corporate/service.ts` (engage, link, addContact, changeRole, endContact, changeType), `calls.ts`, `arrival.ts`, `arrival-port.ts`, `people/edit.ts`, `booking/service.ts`, and the FO-1a triggers. **Journey test: not applicable, no score.** There is still no screen and no route; R1.29's step comes after part 2 and FO-9s.

**What I ran.** Postgres 127.0.0.1:54329. The cluster was down when I started (a stale `postmaster.pid`), so I started it with `pg_ctl` and left it running. I used my own scratch databases (`xr_rv4_*`, plus the check's own), all dropped. No app port, never :4400. US$0.
* `check_fo9b_merge.ts` from `prototype/`: **81/81, exit 0**.
* **Mutations** on an extracted copy of c5b957bb7: one change at a time, then the whole check.

  | Mutation | Result |
  |---|---|
  | Company merge takes rows before records | **red**: the company race case, plus a round-2 race case |
  | Person merge without the company lock | **red**: the loser's-company case |
  | `ROW_ORDER` with prospects after leads | **red**: the prospect→lead case |
  | Tombstone `merged_at` comparison removed | **red**: its own new case |
  | `possibleMatch` without the locking re-read | **red**: DW1m (`ForeignKeyConstraintViolation`) |
  | `fo_dup_merge_one_standing` dropped from the migration | **red** |
  | Person Undo without the company lock (`lockRowsByOrder` instead of `lockForPersons`) | **green** (m1) |
  | Company Undo with rows before records | **green** (m1) |

* **Migration.** I built a database from every migration and ran `prisma migrate diff --from-config-datasource --to-schema prisma/schema`: **"No difference detected."** The index is `UNIQUE (firm_id, loser_id) WHERE undone_at IS NULL`. Rollback test: every migration, then `rollback.sql` in one transaction (with a stub `_prisma_migrations`), compared with a database built without this migration. The catalog hash (indexes, constraints, triggers, functions with owner, config, definer and source, columns, policies, types) is **identical**. No `fo_dup_merge_one_standing` is left.
* **Probes.** I wrote my own script (not committed) and ran it on c5b957bb7 and on an extracted 4bcbf9c41, so I can tell new problems from old ones. A raw "holder" takes lock 1, waits 500 ms, then takes lock 2, as the round-3 cases do. Real-service races were run 12 or 30 times.

  | Probe | 4bcbf9c41 | **c5b957bb7** |
  |---|---|---|
  | P1 Engage-as-Corporate order (lead FOR UPDATE, then company FOR UPDATE) vs person merge; company linked to the loser | ok | **merge 40P01** |
  | P1 same; company linked to the survivor | ok | **merge 40P01** |
  | P1r real `Corporate.engage(lead of L, {companyId: C})`, C linked to S, vs person merge ×12 | 12 ok | **12/12 deadlock** (engage lost 8, merge lost 4) |
  | P2 change-type order (Individual prospect FOR UPDATE, then company) vs person merge | ok | **merge 40P01** |
  | P2r real `Corporate.changeType(P, CORPORATE, {companyId: C})` vs person merge ×12 | 12 ok | **8/12 deadlock** (4 each side) |
  | P3 company Undo vs changeRole order on the survivor company (company, then the moved link) | 40P01 | ok |
  | P3b company Undo vs a holder of the loser company, then the moved link | 40P01 | ok |
  | P4 person Undo vs changeRole order (company, then the moved link) | 40P01 | ok |
  | P4b person Undo vs prospect-writer order (moved prospect, then its lead) | 40P01 | ok |
  | P5 company merge coS ← coL plus person merge S ← L at once, S linked to coS, L to coL, id(coL) > id(coS), ×30 | 30 ok | **15/30 deadlock** (person merge lost) |
  | Rows naming a merged-away person after all of the above | 0 | 0 |

### The tech lead's ruling, checked
* **The three race cases exist and each fails without its fix** (mutations above). The builder's 80/81 revert matches mine.
* **Undo: fixed, but no case.** P3, P3b, P4 and P4b all deadlocked at 4bcbf9c41 and all finish now. But no Undo race case exists (m1).
* **Merge for persons follows the ruling** (companies, prospects, links, leads and the rest, then loser, then survivor): `service.ts:72-76, :194`.
* **Merge for companies takes the records first** (`:193`), but in loser-then-survivor order, not sorted. See M2.
* **The ruling's order cannot be met for person merges.** See M1. The builder applied it faithfully, so this goes back to the tech lead as well as to the code.

### Round-3 Minors
* **m1 (`possibleMatch`): fixed.** It takes a `FOR KEY SHARE` re-read with `merged_into_id is null` (`arrival.ts:51`) and falls back to the next match.
  * The recursion ends. Under READ COMMITTED, the re-read waits for the merge, then re-checks the row (the tombstone drops out). The next `findFirst` is a new statement, so it sees the committed tombstone and excludes it. Under REPEATABLE READ the locking read raises a serialization error instead of looping.
  * The two callers that pass `this.db` (`corporate/service.ts:224`, `leads.ts:157`) run it as an autocommit statement. The lock only makes them wait, which is fine.
  * The new lock makes no cycle: the booking door holds prospects before it, as the merge does.
* **m2 (deferred guard comment): fixed.** The comment now says FK columns lock at the statement and `fo_booking.person_id` has none.
* **m3 (tombstone check): fixed, with its own case.** `merged_at` must equal the record's `at` (`service.ts:263`). Both columns are `TIMESTAMPTZ` and both are written from the same JS `Date`, and `Date.parse` reads the offset, so the server's time zone does not matter. Removing the comparison turns the new case red. The `merged_into_id` half is still covered by the `merged_at` half: the tombstone CHECK makes a live loser's `merged_at` null, so it is refused anyway.
* **Break m4′: fixed.** The partial unique index refuses a second standing record for a loser (mutation red). Migration and rollback are clean, as above.
* **Consent message:** it no longer advises a withdrawal that would cancel the survivor's own consent. The code comment at `:267-268` still says "Withdrawing the copy first lets the Undo run". That is true, but it is the path the message now avoids. A nit.

### New findings
**Blocker**: none.

**Major**
* **M1. Person merges now deadlock with Corporate Engage and with Change type to Corporate (new in this commit).** `lockForPersons` takes every company either person is linked to (live or ended), FOR UPDATE, before the leads and prospects (`service.ts:73`). Two writers take those locks the other way round:
  * Engage locks the lead (`corporate/service.ts:118`), then the company in `link()` (`:95`).
  * Change type locks the Individual prospect (`:331`), then the company (`:95`).

  So when staff engage a lead of S or L as Corporate, or change S's or L's prospect to Corporate, picking a company either person is already a contact of, during a merge of the pair, one side gets a raw 40P01 (500).

  Evidence: P1/P2 are deterministic. With the real services, P1r deadlocked 12/12 and P2r 8/12; at 4bcbf9c41 both were 0/12. The losing side is often the writer (the Engage lost 8 of 12), so mapping the merge's own error does not cover it. The comment at `:61-66` ("So no cycle forms") is wrong.

  **No fixed order can work.** Engage takes lead → company. changeRole takes company → Corporate prospect (`:269` → `:282`). A note or call on a Corporate prospect takes prospect → lead (`calls.ts:43` → `:54`). Whatever order the merge uses for a company, a Corporate prospect and a lead, it disagrees with one of those three writers.

  Fix options, the builder's or the tech lead's choice:
  * (a) Make the merge and Undo never wait while holding a lock. Take the lock phase with `NOWAIT` inside a savepoint; on 55P03 roll back to the savepoint, back off and retry a few times, then refuse with a worded 409/503 Busy. The writers then only ever wait for the merge, and the merge never waits for them.
  * (b) Keep the order but turn 40P01 into Busy for the merge and for these writers (`busy.ts` `isBusy` already recognises it). This touches writers outside the touch list.

  Either way, add a race case for Engage-as-Corporate and for Change type against a person merge, and raise the ruling's gap in the PR or `challenge.md` (never deviate silently).
* **M2. A company merge and a person merge at once deadlock (new in this commit).** A company merge (and its Undo) locks the loser company, then the survivor (`service.ts:193, :260`). A person merge locks the same companies `order by id` (`:73`). When the two persons are contacts of the two companies and the loser company's id is the higher one, each merge holds one company and waits on the other: **15/30 runs deadlocked** in P5, against 0/30 at 4bcbf9c41.

  Fix: take the two company records in id order, in merge and in Undo (for example, sort `[lId, sId]` and `find` in that order, then assign `l`/`s`). Add a case for it (two merges at once, linked across).

**Minor**
* **m1. No Undo race case.** The ruling says every race has its own test and names merge and Undo. Person Undo without the company lock stays **green**, and so does company Undo with rows first. My probes P3, P3b, P4 and P4b show the code is right: they deadlocked at 4bcbf9c41 and finish now. Add at least the changeRole-order holder against a person Undo and against a company Undo.
* **m2. `lockIds` (`service.ts:68-70`) is never called.** Remove it.
* **m3. A small window remains.** `lockForPersons` reads the company set in one statement and locks the link rows in a later one. Under READ COMMITTED, a link to a new company C2 committed between the two is locked as a row without C2 being locked. At commit, FO-1a's `fo_company_contact_still_linked` then takes C2 FOR NO KEY UPDATE, which is round 3's changeRole cycle again. The window is microseconds, and fix (a) of M1 closes it too. Note it if (b) is chosen.

**Not a defect (checked).** The company lock is FOR UPDATE where FOR NO KEY UPDATE would do. Only `fo_company_contact` and `fo_prospect` reference `fo_company`. Every app writer that inserts or re-points those rows already takes the company FOR UPDATE first (`link()`, addContact, changeRole, endContact). So no KEY SHARE holder now waits longer than it did before; the wait is the merge's length (about 0.2-1 s for large histories). These writers held no cycle with the merge in my probes:
* staff phone edit (person only);
* close lead (no prospect lock);
* the booking door (prospects, then persons);
* booking status writers (booking row, then person at commit);
* `livePersonId` (loser, then survivor).

Kept as is, per the brief: size (P-805), the edits outside the touch list, STAYS, consent and flag items, and the `calls.ts` 404 race (part 2).

**Verdict: Changes** on `c5b957bb73ddca910a8e14a33b4e09a799ad6e76`. Fix M1 and M2, each with a race case that fails without the fix; for M1, take the ruling's gap back to the tech lead. Fix m1-m3 or list them in the PR. Do not add `review: approved` for this commit.

Reviewer: Changes c5b957bb73ddca910a8e14a33b4e09a799ad6e76

## Round 5 (ade4a847c)

This is a diff-only re-review (Opus 5.5, effort high; round 5 allowed by the tech lead on PR #3042, Lead 5 17:4x IST) of commit `ade4a847c369f4d564e4046620e923ad660a3543`. I read `git diff c5b957bb7 ade4a847c -- …/prototype/studio`, which covers `duplicates/merge/service.ts` and `tests/check_fo9b_merge.ts`. For context I also read what runs after the lock phase or at commit: the FO-1a deferred triggers, `fo_dup_live_party`, `ConsentStore.record`/`withdraw`, `ensureMessagesFirm`, `AuditEventAdapter.record`, `module_event_next_seq`, and the booking door (`booking/service.ts:535-570`, `arrival-port.ts:83-170`). No file outside the touch list changed, so the other writers are untouched. **Journey test: not applicable, no score.** There is still no screen and no route; R1.29's step comes after part 2 and FO-9s.

**What I ran.** Postgres 127.0.0.1:54329. The cluster was running and I left it running; I never stopped it. I used my own scratch databases (`xr_rv5_*`, `xr_rv5old_*`, plus the check's own), all dropped afterwards. No app port, never :4400. US$0.
* `check_fo9b_merge.ts` from `prototype/`: **88/88, exit 0**.
* **Mutations** on an extracted copy of ade4a847c. I made each change, ran the whole check, then restored the file.

  | Mutation | Result |
  |---|---|
  | NOWAIT reverted to FOR UPDATE (all three statements) | **85/88**: engage-order, change-type-order and Busy cases red (the builder saw 84/88; the round-2 race is timing-dependent) |
  | No NOWAIT, and person Undo without `lockCompaniesOf` | **84/88**: adds the Undo contact-edit case |
  | No NOWAIT, and `ROW_ORDER` with leads before prospects | **83/88**: adds the round-3 note case and the Undo note-on-prospect case |
  | No NOWAIT, and company records in loser-then-survivor order (no sort) | **85/88**: the round-4 M2 cross-merge case stays **green** (m4) |
  | ALREADY_MERGED pre-check removed | **87/88**: the crafted-record case red |

* **Probes.** I wrote my own script (scratchpad, not committed) and ran it on ade4a847c. I ran the A probes on an extracted c5b957bb7 as well, so I can tell new problems from old ones.

  | Probe | Result at ade4a847c |
  |---|---|
  | A: staff-booking order (booking `person_id` = L with no FK, outbox row, held 400 ms, commit) vs person merge S ← L, ×3 | **3/3 deadlock** (merge lost). Same 3/3 at c5b957bb7 |
  | A3: the same with the outbox row and commit back to back, during a 3000-note merge, ×4 | **3/4 deadlock** (writer lost; in the 4th run the writer committed before the merge's locks). Same 3/4 at c5b957bb7 |
  | A2: any module-event writer holding the outbox lock for 1.5 s | the merge waits **1.4 s** while holding every lock |
  | B: two person merges of different pairs sharing one company, at once, ×20 | **40 ok, 0 Busy**, slowest pair 145 ms |
  | B2: a big merge (2000 person notes, 40 leads), then 20 ms later a small merge sharing its company | big ok at 276 ms; small ok at 446 ms (it backed off, then went through) |
  | C: KEY SHARE on the loser (livePersonId's lock) held 0.5 s / 2 s | ok at 913 ms / **Busy** at 888 ms, then ok when tried again |
  | D: a merge that succeeds after retries (a lead held for 120 ms) | complete: 1 record, 1 event, 0 loser leads, 0 rows on a tombstone. **A `fo_dup_locks` savepoint is left open** (m2) |
  | D2: the caller's own `savepoint fo_dup_locks`, then a retried merge, then the caller's `rollback to savepoint fo_dup_locks` | the rollback lands on the merge's leftover savepoint. The merge is undone, but **the caller's own work after its savepoint survives** (m2) |
  | E: a pause of 400 ms injected between the row locks and the record locks (probe only); a lead of L committed in it, then locked by a lead writer that next takes L | **merge 40P01** (m3) |
  | F: Undo against a lead held for 1.5 s | Busy; the caller's transaction is still usable; ok when tried again |
  | Rows naming a merged-away person, after every probe | 0 |

### The tech lead's ruling, checked
* **Every lock is NOWAIT inside a savepoint.** `find` (`service.ts:49`), `lockCompaniesOf` (`:86`) and `lockRowsByOrder` (`:117`) all use NOWAIT, and they run only inside `lockAll` (`:74-84`).
  * `take` only locks; it writes nothing. So rolling back to the savepoint drops the locks and leaves no partial state (D).
  * A non-lock error also rolls back to the savepoint, then is thrown again.
  * `lockHeld` matches 55P03 in the message or in `meta`. The PrismaPg adapter's 55P03 is caught (C, F, and the Busy case).
* **The back-off is bounded.** `BACKOFF_MS` adds up to 775 ms of sleep over 6 tries; observed Busy came at about 890 ms.
  * Under ordinary use it is not Busy too often. Two merges sharing a company went through 40/40, and a small merge queued behind a 276 ms big merge still went through (B, B2).
  * A merge cannot succeed while any transaction holds KEY SHARE (or a row lock) on its rows for more than about 0.8 s (C). This is by design, and asking again works. I found no front-office path that holds such a lock that long: arrival, booking door and Add are request-scoped.
* **Busy leaves the caller's transaction usable** (the check's case, and F for Undo), and nothing is merged. `isBusy(new MergeBusy())` is true.
* **Company records are taken in id order** (`:97`).
* **Round 4's items are fixed:**
  * The crafted standing record now gives ALREADY_MERGED (`:229`); the mutation turns its case red.
  * `lockIds` is gone.
  * The company read-then-lock window is closed by the second `lockCompaniesOf` after the record locks. Any link that commits later needs the record's key, which is now locked.
* **Undo race cases exist.** Both turn red once the order they test is broken as well as NOWAIT. They cannot turn red on NOWAIT alone, because the order still serves them.
* **After the lock phase, one statement can still wait on another session: the outbox row.** See m1. The rest cannot wait:
  * The deferred triggers at commit (`fo_dup_live_party`, `fo_prospect_contact_linked`, `fo_company_contact_still_linked`; `fo_prospect_lead_engaged` does not fire) only lock persons, companies and link rows that the lock phase already holds.
  * The consent copy, the audit line and `fo_dup_merge` take no row or advisory lock. `msg_firm`'s upsert could wait only on a firm's very first messages write.
  * The second `find` (`:260`) re-locks a row the merge already holds.
* **The savepoint name.** A nested savepoint with the same name as a caller's is legal, but a retry leaves one behind. See m2.

### Findings
**Blocker**: none.

**Major**: none.

**Minor**
* **m1. The outbox row can still make the merge wait while it holds every lock, and that wait closes a deadlock (old: the same at c5b957bb7).** `emit` (`:271`, Undo `:340`) inserts into `module_event`. Its trigger `module_event_next_seq` takes one global advisory lock, held until commit, with no NOWAIT.
  * The cycle needs a writer that writes its outbox row and then, at commit, waits on a lock the merge holds. The staff booking does exactly that (`booking/service.ts:547-557`). For a person with no prospect, `bookingForPerson` takes no lock on the person (`arrival-port.ts:87-89`). `fo_booking.person_id` has no FK. So the booking's first lock on the person is `fo_dup_live_party`'s KEY SHARE at commit, after its outbox row.
  * Probes A (3/3) and A3 (3/4) deadlock, and either side can lose.
  * No data was wrong. When the booking loses, it retries on 40P01 (`isContention`): for the survivor it then succeeds; for the loser it then fails on the tombstone, as it would without the deadlock (the m5′ class, part 2). When the merge loses, it gets a raw 40P01, which `busy.ts` reads as Busy (part 2's 503).
  * So the harm is a 1 s stall and an occasional Busy merge. But the comment at `:61-66` ("A transaction that never waits cannot be part of a deadlock, so the other writers always finish") is not true as written, and A2 shows the merge waiting 1.4 s with every lock held.
  * Fix options, the builder's or the tech lead's choice, since the outbox is shared and the booking is outside the touch list:
    * (a) Before the outbox row, take the outbox lock with `pg_try_advisory_xact_lock(hashtext('module_event_seq'))` under the same back-off, and on failure give Busy. The whole merge then needs to sit in a savepoint so "nothing merged" holds.
    * (b) Have the staff booking take KEY SHARE on the person before its outbox row, or give `fo_booking.person_id` its FK. Both are outside the touch list.
    * (c) At least, reword the comment and record the gap in the PR.
* **m2. A retry leaves a savepoint open in the caller's transaction (new).** `ROLLBACK TO SAVEPOINT` keeps the savepoint. The next try's `SAVEPOINT fo_dup_locks` nests a second one, and `RELEASE` (`:77`) frees only the newest. So after any retry, one `fo_dup_locks` stays open until the transaction ends (D).
  * It is harmless unless the caller uses the same name. D2 shows what happens then: the caller's `rollback to savepoint fo_dup_locks` lands on the merge's leftover savepoint and keeps the caller's own work.
  * Fix: `release savepoint fo_dup_locks` right after the `rollback to savepoint` in the catch (`:78`), or a name with a random suffix.
* **m3. The row-lock/record-lock window is still open for rows (new remainder of round 4's m3).** `lockPairFor` locks the rows (`:103`) before the records (`:104`). A lead of L that commits between the two is not locked, because the inserter's KEY SHARE on L is already gone when `find(L)` runs. A lead writer that then locks that lead and next needs L makes the merge's `move` UPDATE wait on it: a deadlock (E, which needed an injected pause to widen the window).
  * Without the pause, the window is the few milliseconds between those statements, and a second writer is needed. So this is Minor.
  * Fix, as for companies: run `lockRowsByOrder` once more after the record locks. Or, since NOWAIT makes the order irrelevant to deadlocks, take the two records first.
* **m4. The round-4 M2 cross-merge case (`check:390-401`) never fails.** It stayed green with NOWAIT reverted (two runs), and with NOWAIT reverted plus the id-order sort removed. Ten `Promise.all` pairs do not overlap enough to show the round-4 deadlock (my round-4 P5 used 30 runs with a holder). It adds no coverage. Either make it overlap (a holder on the higher-id company, as in P5) or say in the PR that it only smoke-tests.
* **Nit (carried from round 4).** The comment at `:298` still says "Withdrawing the copy first lets the Undo run".

Kept as is, per the brief: the addContact/engage foreign-key errors (a Minor row for part 2), size (P-805), STAYS, consent and flag items, and the `calls.ts` 404 race (part 2).

**Verdict: Approve** on `ade4a847c369f4d564e4046620e923ad660a3543`. No Blocker or Major is open. m1 to m4 go in the PR, or get fixed in a follow-up. m1 should go to the tech lead, because it is the one place where the ruling's "never waits" does not hold.

Reviewer: Approve ade4a847c369f4d564e4046620e923ad660a3543
