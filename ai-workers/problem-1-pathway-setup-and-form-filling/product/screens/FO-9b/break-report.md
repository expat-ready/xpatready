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

## Round 3 (4bcbf9c41)

Commit `4bcbf9c4119fb844ebf91e6f07628a01995cd586`. This is a diff pass (`git diff ae52eabd6 4bcbf9c41 -- …/studio`) using the same method as before: scratch databases `xr_brk_fo9b_*`, all dropped; port 4400 never used; US$0. Each race was run 12 times. To tell new problems from old ones, every new attack was also run against an extracted copy of `ae52eabd6`. The script is `scratchpad/brk/break4.mts`.

### Round-2 findings, re-run
- **B1 fixed.** Merging the newer record into the older one works by email and by phone, and Undo restores the lead exactly. Also checked: the reverse direction, two-way flags (each lead flags the other person, all cleared) and Undo after them.
- **M1 fixed for the writers it named.** Merge races ×12 each against engage, close, addNote, logCall and Add with `personId`, plus Undo races against addNote, Add with `personId` and livePersonId: 0 deadlocks in 96. At ae52eabd6 the same races gave 23 deadlocks. Q2 (livePersonId locking L then S, against Undo): both finish. 0 rows on any tombstone. The same class is still open for other writers: see M1′.
- **m1 not fixed.** N2 again: with the merge held open, an Add with `confirmedNew` and the loser's email fails at commit with a raw `ForeignKeyConstraintViolation` (500). `possibleMatch` still reads without a lock (`arrival.ts:47`). A retry works.
- **m2 fixed.** Undo now compares ids instead of times:
  - Q3 (app clock 2 s behind; the note's `created_at` is earlier than the merge's `at`): Undo refused.
  - N4 (Add in a transaction begun before the merge): refused.
  - N4b (raw note on the survivor from an older transaction): refused.
- **m3 fixed as asked:** once the copy is withdrawn, Undo runs. It leaves a side effect: see m3′.
- **m4 partly fixed.** A crafted record whose loser is live is refused and moves nothing. A forged Undo stamp on a merge that still stands is refused (42501). The remainder is still open: see m4′.

### Findings
**M1′ — Major. Merge and Undo still deadlock with ordinary writers that lock a record before its rows. The writer, or the merge, gets a raw 40P01 (500).** No data was wrong in any run, and no row was left on a tombstone.

| Race (×12) | Deadlocks at 4bcbf9c41 | At ae52eabd6 |
|---|---|---|
| Company merge vs `Corporate.changeRole` on the loser company | 5 | 0 (new) |
| Company merge vs `Corporate.endContact` on the loser company | 7 | 0 (new) |
| Person merge vs changeRole, where L is the old primary | 7 | 9 |
| Person merge vs endContact of L's link | 9 | 4 |
| Undo vs changeRole | 8 | 5 |
| addNote on a prospect vs merge | 1 | 6 |
| logCall on a prospect vs merge | 2 | 3 |
| addNote on a prospect vs Undo | 1 | 5 |

- **New in this commit (D5, deterministic):**
  1. Session A runs `select … from fo_company where id = coL for update`.
  2. Start a company merge `coS ← coL`. `lockRows` (`service.ts:64-67, :172`) locks coL's link rows first, then waits on coL.
  3. A runs `update fo_company_contact set valid_to = now()` on a link of coL. The merge dies with 40P01.
  - At ae52eabd6 the merge took the company first and simply waited.
  - The corporate writers take the company first, then its links: `corporate/service.ts:269→:275` (changeRole) and `:306→:310` (endContact). So the order the comment at `service.ts:61-63` says "every writer uses" is not the order these writers use.
- **Still open since round 1 (person merge and Undo):**
  - The merge moves L's link rows. At commit, FO-1a's deferred `fo_company_contact_still_linked` (fo1a migration `:824`) takes the company `FOR NO KEY UPDATE`. changeRole holds the company and waits on that same link row.
  - D1 (deterministic, real `changeRole`): the writer dies with 40P01. D1b (raw) is the same.
- **Prospect path (D3, deterministic):** `Activity.locked` takes the prospect, then the person's leads (`calls.ts:43→:54`). The merge takes the leads first (`lockRows`), then the prospects, so logCall on a prospect dies with 40P01.
- Expected: one lock order across every writer of these tables, or 40P01 turned into a 409 or retry (`busy.ts`).

**m3′ — Minor (new). The advised way to Undo withdraws the survivor's own consent.**
- Repro: S and L both have a live EMAIL/MARKETING consent. Merge S ← L; Undo is refused with "withdraw it there first".
- `ConsentStore.withdraw(S, EMAIL, MARKETING)` ends every live consent of that key (`consent-store.ts:99-103`), here 2. Undo then succeeds, but S's own pre-merge consent stays WITHDRAWN.
- No API withdraws only the copy, so following the message silently cancels a consent the person gave.

**m4′ — Minor (remainder, same class as before; it needs code that writes `fo_dup_merge`).**
- The new check only asks whether the loser's tombstone names the survivor (`service.ts:242`).
- Repro: make a real merge Y ← X. From the app role, insert a second record for the same pair, copying the real snapshot and adding the change `{fo_lead V's lead, person_id, from X, to V}`, with `survivor_before` set to `{givenNames: "PWNED", email: attacker}`.
- Undo of that record returns `{restored:true}`: V's lead moves to X, and Y becomes "PWNED attacker@example.org". The real merge stays unstamped while X is live.

**m5′ — Minor (pre-existing since round 1; seen in many runs here). A note or call on a lead that the merge moves is refused with 404 "No such lead in your firm".**
- `calls.ts:56` treats a changed `person_id` as not found ("a lead's person never changes"), but a merge now changes it.
- Rate: addNote 5/12, logCall 8/12, addNote vs Undo 3/12, against similar rates at ae52eabd6. The lead exists; a retry works.

### What held (new)
- **Deferred guard (`fo_dup_live_party`).** 0 rows on any tombstone, across all nine MOVE columns, after every race above. It re-reads the row as it stands (a flag cleared, then moved). It runs as `xr_wall_reader` with `search_path = pg_catalog, public, pg_temp`, so a temp table cannot shadow the table it re-reads.
- **R4 stress:** 48 random merges and Undos over 8 people with random cross-flags: no deadlock, 0 rows on tombstones.
- **Undo by ids.**
  - A note on a moved prospect after the merge: refused.
  - D6: Undo of S ← L while a later merge T ← S commits mid-flight is refused, with or without moved rows.
  - Not a regression: a new enquiry by the loser's email, flagged as a match of S, does not block Undo; the old clock check behaved the same.
- **Cost. Not a spike.**
  - Merge, 400 leads + 800 notes + 50 flags: 251 ms (ae52eabd6: 244); Undo 221 ms (184).
  - With 400 leads + 2000 notes on S: merge 327 ms (256), Undo 403 ms (340). The `present` list holds 3,600 ids, 164 KB in the snapshot. It grows with the survivor's history.
  - 10,000 plain note inserts: about 0.045 ms per row for the guard (700–900 ms with it vs 260–330 ms without; at ae52eabd6, 500–620 ms vs 430).

Verdict: Changes 4bcbf9c4119fb844ebf91e6f07628a01995cd586

## Round 4 (c5b957bb7)

Commit `c5b957bb73ddca910a8e14a33b4e09a799ad6e76`. This is a diff pass (`git diff 4bcbf9c41 c5b957bb7 -- …/studio`) using the same method as before: scratch databases `xr_brk_fo9b_*`, all dropped; port 4400 never used; US$0. To tell new problems from old ones, every new attack was also run against an extracted copy of `4bcbf9c41`. The script is `scratchpad/brk/break5.mts`. The repo check (`tests/check_fo9b_merge.ts`, run on an extracted copy with the database renamed) gives 81 passed, 0 failed.

### Round-3 findings, re-run
- **M1′ fixed for every writer named in round 3.** The same races, ×12 each, and the deterministic cases, all at c5b957bb7:

| Race | Deadlocks at 4bcbf9c41 | At c5b957bb7 |
|---|---|---|
| Company merge vs changeRole / endContact | 5 / 7 | 0 / 0 |
| D5 (company held, then its link) | merge 40P01 | both finish |
| Person merge vs changeRole / endContact | 7 / 9 | 0 / 0 |
| D1 / D1b (person merge vs changeRole) | writer 40P01 | both finish |
| Person Undo vs changeRole | 8 | 0 |
| Company Undo vs changeRole / endContact | 3 / 10 | 0 / 0 |
| addNote / logCall on a prospect vs merge | 1 / 2 | 0 / 0 |
| addNote on a prospect vs Undo | 1 | 0 |
| D3 (logCall on a prospect) | 40P01 | both finish |

  M1b (engage, close, addNote, logCall, Add by id, Undo vs addNote, Add, livePersonId) and R4 random stress: 0 deadlocks. 0 rows on any tombstone after any run. Other writers still deadlock: see M1″.
- **m1 fixed.** N2: with the merge held open, an Add with `confirmedNew` and the loser's email now waits, then saves.
  - Survivor kept its own email: no flag.
  - Survivor took the loser's email: the survivor is flagged.
  - Undo in flight: the Add saves.
  - Random races (Add vs merge, Add vs Undo, ×12 each): 24 of 24 succeed.
- **m3′ fixed as worded.** The message no longer advises withdrawing: "…consent records are never removed; it cannot be undone while that copy is live." Withdrawing on S still ends S's own consent too (`consent-store.ts:99-103`), but nothing steers staff there now. The code comment at `service.ts:268` still says "Withdrawing the copy first lets the Undo run".
- **m4′ fixed.**
  - A crafted copy of a real standing merge, even with the same `at`, gets `23505 fo_dup_merge_one_standing`.
  - A forged stamp on the real merge is refused.
  - The real Undo restores exactly, and V's lead is untouched.
  - New remainder: see m4″.
- **m5′ unchanged, as listed for part 2.** `calls.ts` is not in the diff (the line is now `:56`). The 404 "No such lead" rates are addNote 5/12, logCall 6/12, Undo vs addNote 5/12.

### Findings
**M1″ — Major. Merge still deadlocks with three ordinary writers. The new lock order causes two of them, and cuts the third from 7/12 to 2/12; the loser gets a raw 40P01 (500).** No data was wrong in any run.
- **X1, new: company merge vs person merge, where one contact is linked to both duplicate companies** (the usual case for duplicate companies).
  - The two merges take the same two companies in opposite orders:
    - `lockForPersons` locks the companies in id order (`service.ts:73`).
    - The company merge locks loser, then survivor (`find` at `:193`).
  - Deterministic repro:
    1. coS has the lower id. A session takes `select … from fo_company where id = coL for update`.
    2. Start `merge(COMPANY coS ← coL)`; it queues on coL.
    3. Start `merge(PERSON Y ← X)`; it locks coS, then queues on coL.
    4. Commit the session. The person merge dies with 40P01.
  - With the ids the other way round, both finish.
  - Random races: 8 of 20 deadlock at c5b957bb7, 0 of 20 at 4bcbf9c41.
- **X2, new: `Corporate.engage` of the loser's lead with a company the loser is already linked to.**
  - Engage locks the lead (`corporate/service.ts:118`), then the company (`:126` → `:95`). The merge now locks the company first, then the leads.
  - Deterministic repro:
    1. A session holds the company `FOR UPDATE`.
    2. Start the merge; it queues on the company.
    3. Run `corp.engage(R, L's lead, { companyId })`; it locks the lead, then queues on the company.
    4. Commit the session. Engage dies with 40P01.
  - Random races: 9 of 12 deadlock (writer 5, merge 4); 0 of 12 at 4bcbf9c41.
- **X3, improved, still open: `Corporate.changeType` to Corporate of L's individual prospect, with a company L is linked to.**
  - changeType locks the prospect (`:331`), then the company (`:351` → `:95`). The merge locks company, then prospects.
  - Deterministic repro: same steps as X2, with changeType instead of engage. changeType dies with 40P01.
  - Random races: 2/12 (was 7/12).
  - Corporate.engage vs Undo: 2/12 (was 10/12).
- The tech lead's ordering (companies, then prospects, then leads) is the reverse of the order these two Corporate writers take. Either they change, or 40P01 becomes a 409 or a retry (`busy.ts`). The two company merges also need one order between their records (for example by id).

**m6 — Minor (pre-existing; at 4bcbf9c41 too). `lockForPersons` reads the links without a lock, so a link committed after that read leaves its company unlocked.**
- Repro (X4):
  1. Session H inserts an OTHER link of L at company coN and does not commit.
  2. Start a slow merge S ← L. Its company read misses coN, and `find(L)` waits on H's key share.
  3. H commits. The merge moves the new link and stalls in `emit`.
  4. Writer W runs `select … from fo_company where id = coN for update`, then ends that link.
- Observed: at commit, the merge's deferred company lock meets W, and the merge dies with 40P01.
- Three concurrent actions are needed, so it is Minor.

**m4″ — Minor (new; same class as m4: it needs code that writes `fo_dup_merge`). A crafted standing record for a live loser blocks every later merge of that loser with a raw unique violation (500).**
- Repro (X7):
  1. Make a real merge Y ← X, then Undo it.
  2. As `xr_app`, insert a record (Y, X) with `undone_at` null.
  3. Merge Y ← X again.
- Observed: `tx.foDupMerge.create` (`service.ts:231`) throws P2002. It is not a `PersonMergeRefused`, and the merge cannot run. Undo of the crafted row is refused (the tombstone does not match). The app role can still stamp it, which frees the slot.

### What held (new)
- **Unique index.**
  - These all work: merge → Undo → re-merge of the same pair; the reversed pair; another survivor (T ← L); company merge → Undo → re-merge.
  - A stale record cannot be undone again (ALREADY_UNDONE).
  - Two merges of one loser into two survivors at once: one ok, the other ALREADY_MERGED (the advisory lock refuses it before the index is reached).
  - The `merged_at` check passes with the Node process in UTC, America/Toronto and Asia/Kolkata.
- **`possibleMatch` cannot loop.**
  - Under READ COMMITTED, each `findFirst` takes a fresh snapshot that excludes the tombstone.
  - A REPEATABLE READ caller gets one 40001 after 44 ms.
  - Every `arrive()` caller is READ COMMITTED.
  - Its new key-share lock deadlocked nothing: Add vs merge and Add vs Undo, ×12 each, 0 deadlocks.
- **Other writers vs merge and Undo, ×12 each, 0 deadlocks:**
  - `Prospects.engage`, close with a note.
  - Staff phone edit on S and on L (`people/edit.ts:60`).
  - A booking row writer (`FOR UPDATE`, then update).
  - The person port (`ensureForClient` by prospect, then a note).
  - `Corporate.addContact` while the company merge runs.

### Noted, not graded (pre-existing writers that do not follow a tombstone; same class as m5′)
Each answers a raw `ForeignKeyConstraintViolation` (500) rather than a 409:
- `Corporate.addContact(personId: L)` during a person merge: 11/12.
- `Corporate.engage` with the loser company during a company merge: 8/12 (7/12 at 4bcbf9c41).

Nit: `lockIds` (`service.ts:68`) is never used.

Verdict: Changes c5b957bb73ddca910a8e14a33b4e09a799ad6e76

## Round 5 (ade4a847c)

Commit `ade4a847c369f4d564e4046620e923ad660a3543`. This is a diff pass (`git diff c5b957bb7 ade4a847c -- …/studio`: `lockAll`, `lockPairFor`, `MergeBusy`, the standing-record check). Method as before: scratch databases `xr_brk_fo9b_*`, all dropped; port 4400 never used; the cluster was never stopped; US$0. The script is `scratchpad/brk/break6.mts`. The repo check (`tests/check_fo9b_merge.ts`, run on an extracted copy with the database renamed) gives 88 passed, 0 failed.

### Round-4 findings, re-run
- **M1″ fixed. No deadlocks in any re-run.**

| Attack | At c5b957bb7 | At ade4a847c |
|---|---|---|
| X1 deterministic, lower id = survivor / loser | person merge 40P01 / both finish | both merges ok / both ok |
| X1r random ×20 (company merge vs person merge) | 8 deadlocks | 20 of 20 both ok |
| X2 deterministic (Corporate.engage vs merge) | engage 40P01 | engage ok, merge ok (within its back-off) |
| X3 deterministic (changeType vs merge) | changeType 40P01 | both ok |
| X23r ×12: engage / changeType vs merge | 9 / 2 deadlocks | 0 / 0 (all ok) |
| X23r ×12: engage / changeType vs Undo | 2 deadlocks | 0; Undo is refused when engage added a row first (by design) |

  0 rows on any tombstone after any run.
- **m6 (X4) fixed in its round-4 form.** A link inserted before the merge holds a KEY SHARE on L, so `find(L)` NOWAIT fails and the merge backs off.
  - Insert committed after 300 ms: the merge finishes at 1268 ms and moves the new link to S. The company writer then waits, ends the link, and finishes.
  - Insert held 1500 ms: the merge answers Busy after 844 ms. The link stays on L and the writer finishes.
  - The same gap remains for rows other than links: see m6′.
- **m4″ fixed.** A crafted standing record for a live loser X now gets `409 ALREADY_MERGED` ("This record has a merge that is not undone."), both for Y ← X and for Z ← X. Nothing is written: X's lead stays on X and no audit line is added. Merging W into X (X as survivor) still works, which is correct.

### Findings
**m6′ — Minor. A row naming L that commits between `lockRowsByOrder` and `find(L)` is not locked, and the merge's move then waits on it.** `service.ts:101-104` re-locks companies after the records, but not rows. The comment at `:91` ("none can commit after") holds only from `find` on.
- Repro G1. A Proxy on `tx` adds 400 ms before `find(L)` (the natural gap is a few round trips: the fo_note, fo_call, fo_arrival_receipt and fo_booking lock statements, then `find`), plus 700 ms before `fo_dup.merging` is set.
  1. Session H inserts a lead NL for L and does not commit.
  2. Start `merge(S ← L)`.
  3. After 150 ms, H commits.
  4. After 500 ms more, `Prospects.engage(R, NL)` locks NL, then waits on L's KEY SHARE.
  5. The merge's `update fo_lead set person_id` reaches NL.
- Observed: engage dies with 40P01. The merge commits and moves NL to S.
- Control without the delay: H's KEY SHARE makes `find(L)` fail, the merge retries, sees NL, and both finish.
- Three concurrent actions in a window of milliseconds are needed, so it is Minor (the same class as m6).
- With NOWAIT the order no longer matters for deadlocks. Taking the two records first, or running `lockRowsByOrder` again after `find`, would close the gap.

**m7 — Minor. Three statements after the lock phase can still wait while the merge holds every lock.**
- **The outbox insert waits on the global `pg_advisory_xact_lock(hashtext('module_event_seq'))`**, which every firm's event writer holds until it commits (`pf3_platform_tables/migration.sql:435`; called at `service.ts:271` and `:340`).
  - N1: another firm's open transaction held it for 2 s. The merge waited, sitting on all its locks, and finished at 2059 ms. A note on S's lead queued behind it for 1.5 s.
  - N1b (shape only): a transaction that writes an event and then a note on S, while a merge is in flight, gives the merge a raw 40P01.
  - I found no app writer that writes after its event. Arrival and booking, Corporate, Prospects, Retainers and Booking all emit last, and each locks the shared rows first. So this is a latent trap, not a live deadlock.
- **The consent copy (`copyConsent`, `:254`) updates S's live consents.** N2: a withdrawal on S in flight made the merge wait 1.2 s (`Lock:transactionid`).
- **`ensureMessagesFirm`'s insert can wait**, but only on a firm's first messages write.
- The comment at `:65-66` ("a transaction that never waits cannot be part of a deadlock") therefore overstates what the code guarantees.

**m8 — Minor. Savepoints from a failed attempt are never released (`:78`).** `rollback to savepoint` keeps the savepoint, so each Busy attempt leaves one nested `fo_dup_locks` behind. A caller that uses the same name gets the wrong savepoint.
- N7, Busy case: the caller runs `savepoint fo_dup_locks`, writes a note, gets Busy from the merge, then runs `rollback to savepoint fo_dup_locks`. Its note is still there after the rollback, and it commits.
- N7, Busy-then-ok case (holder 120 ms): the merge succeeds after a back-off. The caller's rollback-to goes to the merge's stale savepoint: the merge is undone, but the caller's note is kept and committed.
- Releasing the savepoint after rolling back to it (or a unique name) would fix both.

**m9 — Minor (contract). `MergeBusy` is not part of the port.**
- `ports/person-merge.ts:74` still says "Refuses with PersonMergeRefused", and `MERGE_REFUSAL` has no Busy code.
- The case side's ClientMergePort (CS-K2) can only import the class from `service.ts`; otherwise it must rely on `busy.ts`'s regex. `isBusy(new MergeBusy())` is true.

### What held (new)
- **Busy leaves nothing (N6, N8b).**
  - Merge Busy after 806 ms. The caller's transaction stays usable: its earlier write and a later write both commit. Nothing moved, and the loser stays live.
  - Undo Busy after 805–846 ms for each kind of holder (company, prospect, lead, link, a KEY SHARE on S). The state is unchanged (leads, tombstone, `undone_at`), and a retry succeeds.
  - Row locks from a failed attempt are released: the other session's later merge succeeds.
  - One more wait: the pair's advisory locks stay held until the caller's transaction ends, so another session's merge of the same pair waited 2088 ms on `pg_advisory_xact_lock` (no NOWAIT) without answering Busy. It holds no row locks while it waits.
- **Undo under the holders (N8), 300 ms holds on company, prospect, lead and link, in both orders:** holder ok, Undo ok, 0 deadlocks.
- **Deferred triggers at commit (N3).** S ← L where L's lead flags P, raced against Q ← P, and the same with the Undo of S ← L: ×12 each, all ok, 0 deadlocks. The KEY SHARE on a third person at commit cannot meet a merge, because that merge would lock the same lead.
- **Mixed stress (N9).** 8 jobs × 8 rounds of person and company merges, Undos and link writers over shared people and companies: 0 deadlocks, 0 Busy, 0 rows on tombstones. 5 of the writers' inserts on a tombstone gave a raw FK error (the known part-2 Minor).
- **Starvation needs a long lock or traffic far above normal.**
  - One open transaction holding any lock in the set (an uncommitted note on S, or a plain FOR KEY SHARE on S): Busy every time, after about 840 ms. That is the ruling as written.
  - Steady traffic, 10 merges each:

| Traffic | Rate | Merges |
|---|---|---|
| addNote on S's lead, 2 writers back-to-back | 162/s | 8 Busy, 2 ok |
| addNote on S's lead | 21/s, 6/s, 2/s | 10 of 10 ok |
| Link inserts on the loser's company, back-to-back | 393/s | 7 Busy, 3 ok |
| Link inserts on the loser's company | 5/s | 10 of 10 ok |
| Corporate.engage with that company | 13/s | 10 of 10 ok |

Verdict: Approve ade4a847c369f4d564e4046620e923ad660a3543
