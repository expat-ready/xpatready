# FO-9b part 1 — break report (merge and Undo of two person or company records)

Commit `4f36b1f031b459966d8fd2f20d4804cf27a98d7b`, branch `claude/serene-hopper-xuvdzf`. Breaker run, 22 Nov. There is no screen and no route in this part, so I attacked `PersonMergeAdapter` (`api/src/front-office/duplicates/merge/*.ts`) and the database directly.
Method: a scratch script (outside the repo) builds its own database `xr_brk_fo9b_<pid>` the same way `tests/check_fo9b_merge.ts` does: every migration, both Sample firms, merges run as `xr_app` under the firm walls (`walledPool` + `withFirm`). A second `pg` connection holds transactions open to force the races. The database is dropped at the end; port 4400 was never used. Cost US$0. Every value is Sample.
The repo's own check passes on this commit: `tests/check_fo9b_merge.ts` gives 53 passed, 0 failed.

## Findings

**M1 — Major. A row written to the loser while the merge runs ends up on the tombstone. This breaks AG-2-16 rule 5 ("No row ever points to a tombstone after the commit").**
Repro, real app path (R1b):
1. Persons S and L each have a lead.
2. A second session takes `select … from fo_sales_setup where firm_id = A for no key update`. This holds the lead-number row a moment, so Add stays in flight.
3. Call `Leads.add(R, { personId: L, … })`. `arrive()` resolves L as live (`sales/arrival.ts:93`, `livePersonId`) and then waits at the lead-number trigger.
4. Run `mergePersons(S ← L)`. It commits.
5. Release the second session.

Observed: Add returns `person.id = L`. One `fo_lead` and one `fo_arrival_receipt` now name the tombstone L.
Raw variant (R1), the pattern `arrival-port.ts` uses: a session takes `select … from fo_person where id = L for update`, inserts a person-only `fo_note` and a `fo_lead` on L, and does not commit yet. The merge meanwhile runs `update … where person_id = L` (`service.ts:86` and the lines after it) and cannot see those uncommitted rows. It then waits on the person row lock, and tombstones L once the session commits. Result: the lead and the note both sit on the tombstone.
Expected: the new rows land on the survivor, or the writer gets an error (for example a 409).
Why it happens: the merge serialises only against other merges (advisory locks on the pair, `service.ts:139`). It never takes the person rows `FOR UPDATE` before it moves rows, and nothing stops an insert from naming a tombstone.
Possible fix: lock both `fo_person`/`fo_company` rows `FOR UPDATE` right after `lockPair`, plus a guard that refuses an insert naming a tombstone.

**M2 — Major. Undo silently overwrites edits made to the survivor after the merge (two sessions saving the same record).**
Repro (U1): merge S (phone +1 416 555 0201) ← L. Staff then change S's phone through `PeopleEdit.editPhone` (PATCH people/:id) to +1 416 555 0299. Then Undo.
Observed: `{restored:true}`, and S's phone is back to +14165550201. The staff edit is gone, with nothing said; only its audit line remains.
Expected: Undo is refused (409), or it keeps fields that changed after the merge.
Cause: `service.ts:223` / `:226` write `survivor_before` over the survivor unconditionally. The "fresh" check (`:197`) and the moved-row check (`:208`) never look at `fo_person`/`fo_company` itself.
The arrival path's `keepPhone`, which fills an empty phone on the survivor, is reverted the same way.

**M3 — Major. The Undo "fresh" check has gaps for persons: a prospect created after the merge leaves the records inconsistent.**
Repro (U2): merge S ← L, then `Prospects.engage(R, <L's old lead, now on S>)`, then Undo.
Observed: `{restored:true}`. The lead goes back to L, but the new prospect keeps `subject_person_id = primary_contact_person_id = S`. The prospect now names the survivor while its lead belongs to the loser.
Expected: Undo is refused, as the code comment at `service.ts:195-196` promises ("a lead, a booking, a link, a prospect").
The PERSON branch of `fresh` (`:197-203`) has no `fo_prospect` line.
Same gap (U3): a consent recorded for S after the merge (it may have come by L's email) does not block Undo either; `msg_consent` is not in the check.

**m1 — Minor. Undo racing a new note (the brief's breaker item).**
Repro (R2): merge S ← L. A second session inserts a note on L's moved lead (`person_id = S`) and a person-only note on S, but does not commit. Undo runs; the second session commits during it.
Observed: Undo returns `{restored:true}`. The lead-level note was carried back to L by the cascade. The person-level note created after the merge stays on S.
Expected: Undo is refused, as DW5 fail requires.
The `fresh` check runs before the rows move, and nothing holds note writers back. The window is short (the length of the Undo transaction); it closes with the same row-lock approach as M1.

**m2 — Minor. A refusal after writes leaves partial changes when the caller catches it.**
The port promises: "A refusal changes nothing" (`ports/person-merge.ts`, MERGE_REFUSAL).
Repro (K1): companies CS and CL each have a different live PRIMARY contact, plus a shared HR contact, and CL's `updated_at` is newer. In one transaction the caller catches the `PersonMergeRefused` and commits.
Observed: `Refused(INVALID_INPUT)`, yet CS is renamed to CL's name (rule 1's default was written first, `:154`). CL's HR link was ended (`endDuplicateLinks`), and only after that the PRIMARY check refuses (`:109`).
Expected: every refusal happens before the first write. Only callers that catch the refusal are hit (CS-K2 may be one), so this is Minor.

**m3 — Minor. The database guard for notes comes down to a setting any session can turn on.**
Repro (G1): as `xr_app`, in an ordinary transaction, run `select set_config('fo_dup.merging','on',true); update fo_note set person_id = <another person> where id = <person-only note>`.
Observed: 1 row updated. The private note now sits on another person, and no merge record exists.
A session-wide `SET fo_dup.merging = 'on'` is also accepted. On a pooled connection it would persist.
This is a design accepted by Lead B (migration lines 9-13). It is guarded only by a source grep (DW1). Recorded so the trade-off stays visible.

**m4 — Minor. The merge record is trusted by Undo, and it can be forged by the app role.**
- Forged Undo stamp (G2): `update fo_dup_merge set undone_at = now(), undone_by = 'staff:forged'`, run as `xr_app`, is accepted. L stays a tombstone. A real Undo then answers ALREADY_UNDONE, and a "later merge" no longer blocks an earlier Undo.
- Crafted row: `xr_app` may INSERT into `fo_dup_merge`. A row whose snapshot `changes[0].c` is `given_names" = 'PWNED', "family_name` is executed by Undo (`service.ts:220`, the same at `:209`). Result: `{restored:true}`, and `fo_person.given_names` becomes `PWNED`. Undo also does not check that the loser is actually `merged_into_id = survivor`.
- Both need code that already writes this table, so they are Minor. A suggested hardening: accept only `t`/`c` values listed in `COLUMNS`, and check the tombstone before restoring.

**m5 — Minor. Undo costs one database request per moved row.**
P1: for a loser with 400 leads and 400 notes, merge takes 127 ms (snapshot 70.9 kB) and Undo takes 895 ms. The check loop at `:208` and the group updates at `:219-220` issue more than 800 statements. STANDARDS §9 says "no request per row".

## What held
- **Parallel merges of one pair.**
  - DW4 (the repo's check) holds.
  - Crossed pairs A→B, B→C, C→A and B→A all at once, ×10: always exactly two merges succeed and the rest get ALREADY_MERGED.
  - No deadlock, no cycle, one merge record per tombstone.
- **Random stress.** 40 merges and Undos at random over 8 linked persons: no deadlock, no 500, no note or link on a tombstone, every tombstone matches exactly one open merge record.
- **Undo order on chains.** For C→B then B→A, undoing the first merge is refused until the later one is undone; after both, everything is back. Two merges in one caller transaction keep that order too (distinct `at`).
- **Firm walls.** Five crafted cross-firm calls, including one through the owner client that bypasses RLS: all NOT_FOUND, and nothing in firm B changed.
- **Inputs.**
  - SQL in an id is refused, and so is SQL in the merge reference.
  - A `__proto__` choice is harmless.
  - `mergedIntoId` as a choice, an extra `automatic` field, a 501-character reason and a blank reason are all refused.
  - A 500-character non-English reason with an emoji, and uppercase ids and merge reference, all work.
- **Merge record.** Delete, truncate and snapshot edit are refused (by trigger or grant).
- **Consent.** A loser's consent older than the survivor's withdrawal is copied withdrawn; a newer one is copied live, so the withdrawal wins correctly.
- **Company contacts.** The same person as PRIMARY of both companies: the loser's link is ended, one PRIMARY remains, and Undo restores both.
- **Prospects and bookings.** Individual and corporate prospects (subject and primary contact) move and come back; deferred link triggers are satisfied. A booking moves and comes back.
- **Rollback.** A forced last-step failure leaves nothing behind (DW6).

## Noted, not graded (outside part 1's list)
- PATCH people/:id edits a tombstone's phone (`people/edit.ts` has no `merged_into_id` filter) when the firm setting "everyone sees all" is on.
- A guided merge of a case client leaves `case_client.fo_person_id` on the tombstone. The case side is responsible for that column (CS-K2), and "a client with a case is never merged here" is part 2's DW7.

Verdict: Changes — commit 4f36b1f031b459966d8fd2f20d4804cf27a98d7b. Fix M1–M3 before approval; m1–m5 can go into the same PR or be recorded as follow-ups.
