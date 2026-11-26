# Break report: PF-21d part 2b-2, the narrow exception for the insert-only rows (R1.85)

Attacked: head `70c939fc1` on branch `claude/runtime-pf21d-2b2`, diff `origin/claude/blissful-archimedes-x463xr..HEAD`. I did not build it.
Scratch databases on 127.0.0.1:54329 only, dropped afterwards; never :4400. I attacked as xr_app with `app.firm_id` set, in transactions
that were rolled back, plus one real `Erasure.run()`. There is no screen, so the UI items in the attack list are N/A (keyboard, 1024 px,
zoom, uploads or PDF, long or non-English text, 100 programs).
While I worked, the builder committed round 1, `8515f4c3d` (07:58 UTC). At `8515f4c3d`, `check_pf21d_fo_eraser` passes 48/48.

## Findings

**M1 (Major, closed in `8515f4c3d`). At `70c939fc1`, `msg_write_once` stopped refusing the other msg_* tables with their own error.**
* Reproduce: `begin; update msg_template_version set id = id where ctid = (select ctid from msg_template_version limit 1); rollback;`
  * Result: `42703 record "new" has no field "detail"`.
  * The same happens for UPDATE and DELETE on `msg_consent_wording` and `msg_consent_withdrawal`, and for their TRUNCATE.
  * Expected, and true before the migration: `23001 <table> is write-once: <op> refused`.
* Cause: the flat `IF` at migration.sql:87. The writes were still refused.
* `check_pf19a_messages_schema` (with BIN set to the Linux path) gave 91/94 at `70c939fc1`. With the nested `IF` now in
  `8515f4c3d` it gives 94/94.

**m1 (Minor). After rollback.sql, `prisma migrate deploy` never applies the migration again.**
* Reproduce:
  1. On a fresh database, run `prisma migrate deploy`.
  2. `psql -f .../20261126090000_shared__pf21d_fo_erasure_exception/rollback.sql`.
  3. `prisma migrate deploy` → "No pending migrations to apply".
  4. `fo_erasure_names` stays absent, because the `_prisma_migrations` row remains.
* That is start.sh:13's path. 18 of the 24 rollback.sql files in this repo delete their own row; this one does not, at either commit.
* The test re-applies with psql, so it cannot see this.

**m2 (Minor). A session-level `SET` leaks the pair into later transactions on the same connection.**
* Reproduce:
  1. `set role xr_app; set pf21d.erasing = '<req>'; set pf21d.claim = '<claim>';`
  2. In a later, separate transaction with `app.firm_id` set: `update fo_note set text = 'Erased.' where person_id = '<person>'` → it goes through.
* The definer cannot tell LOCAL from SET (migration.sql:22-23), and the pool does not run DISCARD.
* No code does this today: service.ts:194 uses `set_config(..., true)`.
* The exposure lasts as long as the claim: seconds, or until the next daily run when a claim is kept after an unrecorded commit.

**m3 (Minor). With the merge flag, the claim opens another person's note.**
* The header says the pair "only ever opens rows of the person already being erased" (migration.sql:8-9).
* Reproduce, in one transaction with `fo_dup.merging = on` and X's valid pair:
  1. `update fo_note set person_id = X where person_id = O and lead_id is null`
  2. `update fo_note set text = 'Erased.' where person_id = X` → O's note is blanked.
* It needs the claim, plus FO-9b's flag, which any session can set (that part is pre-existing).
* One UPDATE that both moves and blanks is refused (held).

**m4 (Minor). An undone merge loses the other, live party's half.**
* Reproduce: take a merge row `survivor = Q (live, not erased), loser = O`, undone. With O's pair:
  `update fo_dup_merge set loser_snapshot = '{"erased": true}', survivor_before = '{"erased": true}'` → Q's `survivor_before` is blanked.
* Source: eraser.ts INSERT_ONLY_SQL "merge records" and migration.sql:65. This matches review m7.

**m5 (Minor). "A firm's session can read neither the request id nor its claim time" (migration.sql:7-8) holds only while `app.firm_id` stays set.**
* Reproduce, in one xr_app transaction:
  1. `set_config('app.firm_id', '', true)`
  2. `plat_data_request_erasure_due(current_date, 501)` → the request id
  3. `plat_data_request_erasure_claim(id, current_date)` → the claim
  4. Set the pair, set `app.firm_id` back
  5. `update fo_note set text = 'Erased.'` → it goes through.
* This is PF-12's model, and that power can already run an erasure. The brief's unguessable `claim_id uuid` (brief.md:162) was not
  built (review m3). The comment should state the limit.

## What held (each tried)
* **The pair is checked.** Each of these was refused:
  * no settings;
  * a random request id with X's claim time;
  * the ACCESS request's id;
  * O's request and claim on X's note;
  * X's pair on O's note;
  * the claim 1 ms off;
  * `'now'`;
  * malformed settings.
* **Notation:** the same instant written `+00:00` is accepted, which is correct.
* **Other firms and no firm:** firm B's session, and a session with no firm, matched 0 rows.
* **Completed, cancelled or unclaimed requests** carry no claim:
  * `erasing_since` is null after finish, release or cancel;
  * the check `plat_data_request_erase_on_set` refuses a claim on ACCESS;
  * the guard refuses any status change while a request is claimed (tried for COMPLETED and HELD).
* **Columns:** the trigger lists cover every column of the four tables (checked against information_schema).
  * Each of these, in the same UPDATE, was refused:
    * fo_note: visibility, created_at, lead_id, `'Erased. '`, a person move;
    * attribution: platform, a partial null, a lead_id move, another lead;
    * fo_dup_merge: a single snapshot, an extra key, the undo stamp, choices, survivor_id;
    * msg_event: provider_event_id, `'{}'`, JSON `null`.
* **Delete and truncate:** refused on all four tables. fo_dup_merge DELETE is refused by `fo_dup_merge_no_delete`, and xr_app has no TRUNCATE.
* **A merge cycle** (P1↔P2) terminates in the definer. The job's `foPersonCheck` keeps merged-away records out of any run.
* **FO-9b's merging path:** unchanged.
* **Undo of an erased merge:** it re-reads the merge after `lockPair` (merge/service.ts:281-288), so it sees a concurrent
  erasure and refuses.
* **Rollback:** after it, functiondef md5, owner, ACL, prosecdef and proconfig are identical to the database before; the
  definer is gone; psql re-applies.
* **The job with a stale claim** (backdated by 1 h):
  * `Erasure.run()` retook it under a new claim and cleared notes 2, attribution 1, merge 1 and events 1001.
  * The request ended HELD with the message addresses kept, and O's rows were untouched.
  * The old claim then opened nothing, and a request claimed less than 30 minutes earlier was skipped.
* **Budget:** with 100k people in the firm, blanking 1,000 events of a merged-away record took 61 ms.

**Verdict: Ship at `8515f4c3d`.** No Blocker is open. The one Major (M1) is fixed in `8515f4c3d`. The exception held every
forging, scope, column and lifecycle attack. m1-m5 are Should.
