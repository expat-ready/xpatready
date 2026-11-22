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

## Round 2 (ae52eabd6)

Commit `ae52eabd60b9c22715b5880c46485fb5ea38b5f4`. This is a diff pass with the same method as round 1: scratch databases `xr_brk_fo9b_*`, all dropped; port 4400 never used; US$0. To check whether a problem is new, I ran the same script against an extracted copy of `4f36b1f03`. The repo check (`tests/check_fo9b_merge.ts`, run on a scratch copy with the database renamed) gives 66 passed, 0 failed.

### Round-1 findings, re-run
- **M1 fixed.** R1: 0 rows on the tombstone. R1b: the merge waits for the in-flight Add, then moves its lead and receipt.
- **M2 fixed.** U1 is refused and the staff phone edit is kept. N7: an edit that sets the same value still allows Undo. N8: an edit made during a merge waits for it, and Undo is then refused.
- **M3 fixed.** A prospect (U2) and a consent (U3) added after the merge each make Undo refuse.
- **m1 fixed.** R2: Undo waits for the note writer's lock, sees the note, and refuses.
- **m2 fixed.** K1 now refuses before anything is written: the name and links are unchanged.
- **m4 partly fixed.** A crafted column name is now refused. Still open, from the app role:
  - N6: a crafted record whose "loser" is live and whose change names another person's lead passes every check. Undo moved person V's lead to X and wrote the crafted `survivor_before` onto Y (now named "PWNED", with an attacker's email).
  - G2: a forged Undo stamp is still accepted.
  - Stays Minor (it needs code that writes `fo_dup_merge`).
- **m5 fixed.** 400 leads + 400 lead notes: Undo 154 ms (was 895). Q1, with 400 leads, 400 person-only notes and 50 flags: merge 152 ms, Undo 131 ms, all restored.
- **m3 by design.** G1 behaves as in round 1.

### Findings
**B1 — Blocker (in unchanged code; round 1 and DW1 missed it). The usual merge fails: keep the older record when the newer one's lead is flagged as its possible match.**
- Repro (N0, Q0):
  1. S exists. Add a lead with S's email (or phone) and `confirmedNew: true`. `arrive()` flags the new lead `possible_match_person_id = S`, and every web or booking arrival does the same.
  2. `mergePersons(S ← L)`.
- Actual: raw `23514 fo_lead_links_check` (no PersonMergeRefused, so a 500). Nothing is merged. The reverse direction (L ← S) works and clears the flag.
- Cause:
  - `service.ts:93` moves L's leads to S while one still has `possible_match_person_id = S`, which breaks `possible_match_person_id IS DISTINCT FROM person_id` (fo1a migration :739).
  - The clean-up at `:98` (`s → null where person_id = l`) runs after the leads have moved, so it can never match.
- Expected: the flag is cleared (rule 10, as `:95` says) and the merge succeeds. It must happen before `:93`; Undo then reverses it in order.

**M1 — Major (new in this commit). Merge and Undo now deadlock with ordinary writers on the same person; most often the writer loses, with a raw 500.**
- Lock order:
  - The merge and Undo lock the person rows first (`find … for update`, `service.ts:49`), then lead rows (`:93`, and Undo `:212`).
  - The writers lock the lead first: `prospects.ts:169` (engage), `leads.ts:240` `change()` (close or reopen with a note), `calls.ts:54` (addNote, logCall). They then lock the person through `fo_dup_live_party`'s `FOR KEY SHARE` (migration `:111`) on their insert.
- Deterministic repro (N3a):
  1. A second session holds L's company-link row `FOR UPDATE`, so the merge stops after locking S and L.
  2. `Activity.addNote(lead of L)`: it locks the leads, then waits on L.
  3. Release the link row. addNote fails with `deadlock detected` (40P01; no HTTP status, so a 500); the merge commits.
- Random-offset races, 12 of each (N3b):

| Race | At ae52eabd6 | At 4f36b1f03 |
|---|---|---|
| engage vs merge | 6 deadlocks | 0 |
| close + note vs merge | 5 | 0 |
| addNote vs merge | 5 | 0 |
| logCall vs merge | 6 | 0 |
| addNote vs Undo | 2 | 0 |

  Of the 24 deadlocks, the writer lost 13 and the merge or Undo lost 11.
- Same class (Q2): `livePersonId` locks L and then S (`follow.ts:19`), while Undo locks S and then L, so the Undo got 40P01.
- None of these writers turns 40P01 into a 409 or a retry. A `busy.ts` pattern for that already exists.
- No data was wrong in any run: no row on a tombstone.

**m1 — Minor (new). A legitimate Add is refused when its possible match is merged while the Add is in flight.**
- Repro (N2): a merge S ← L is held open after tombstoning L (a slow `emit`). Meanwhile, Add a lead with `confirmedNew: true` and L's email.
- What happens: `possibleMatch` (`arrival.ts:47`, read without a lock) still sees L as live. The lead insert (`:119`) then waits in the trigger, sees the tombstone and gets `foreign_key_violation`. The Add fails (500).
- At 4f36b1f03 the same race added the lead with its flag on the tombstone. Web and booking arrivals share `arrive()`, so a public enquiry can fail this way. A retry succeeds.

**m2 — Minor (new). Undo's "after the merge" test mixes two clocks.**
- The merge time is the database's `clock_timestamp()` (`service.ts:66`). Rows' `created_at` comes from the app: Prisma fills `@default(now())`. N4 shows it: a lead from a transaction begun before the merge got `created_at > at`.
- Q3: with the app clock simulated 2 s behind the database, a note added right after the merge has `created_at < at`. Undo returns `{restored:true}` and the note stays on S.
- N4b: a writer that leaves the database default (`now()` = its transaction start) is missed the same way.
- The window equals the clock difference (zero on one host).

**m3 — Minor (new; the tech lead's call). Once the loser had any live consent, Undo can never succeed.**
- N5: Undo is refused while the copy is live (as review M2 asked). After withdrawing the copy on S, it is still refused, now by the `msg_consent_withdrawal` line of `fresh`.
- The second message is misleading: "Something reached the merged record … may have come by the other record's contact details".
- The review said "while any consent copy … is still live"; the code makes it "forever".

### What held (new)
- **Trigger matrix (N1).** On fo_lead (person and flag), fo_note, fo_call, fo_arrival_receipt, fo_company_contact (person and company) and a re-point on update, every row naming a tombstone is refused. Ending a live link (`valid_to`) passes.
- **Locks run as `xr_wall_reader`.** It has BYPASSRLS, so the trigger sees the row whatever the firm setting.
- **Merges among themselves.** R3 crossed merges ×10 and R4 random merge and Undo stress: no deadlock, 0 rows on tombstones, every tombstone has its record.
- **Undo.**
  - Batched writes restore exactly (DW5, K1's shared PRIMARY, K2 prospects, B1 booking, Z1 chain order).
  - A caller cannot keep the partial B1 state: the failed statement aborts its transaction (Q0).
- **Unchanged from round 1.** F1 walls, I1 inputs, C1 consent.

Verdict: Block ae52eabd60b9c22715b5880c46485fb5ea38b5f4
