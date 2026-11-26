# Break report: CS-W2 part links (PR #3823, head 8ddd1cdc7bde48962cd6297a0b69e2ca00358034)

Breaker, 26 Nov. Migration `prisma/migrations/20261126091000_links__csw2_firm_id/migration.sql` ("the migration" below). Scratch databases were on 127.0.0.1:54329: every migration before this one, then Sample firms F1 (`sample-firm`) and F2 (`sample-solo`), cases K1 (F1), K2 (F2), K3 (`ghost-firm`, no firm) and K4 (`ghost-two`, no firm), one link b1..b4 per case, one session c1..c4 and one demo message per link, then the migration. Each attack ran as the owner, inside `begin … rollback`, unless the entry says `set local role xr_app`. An isolated copy also ran on :4499 (`rt_brkl`); it was stopped and its database dropped. All scratch databases were dropped. I edited no code.

## Major

**M-1. The match trigger checks one direction only. A link can end up superseded by another firm's link through the PR's own follow, or through a direct update as `xr_app`.**
`case_links_firm_match` (lines 89, 94) runs only on the row that holds `superseded_by_id`. It lets that row through while the target link's firm is empty (`other IS NOT NULL`). When the target link gets a firm later, nothing checks the rows that point at it.
```sql
-- (a) via the follow: b1 (F1) superseded by b3 (K3, no firm); then the ghost key gets a platform firm F3
update person_link set superseded_by_id = 'b3' where id = 'b1';                 -- allowed (other is null)
insert into platform_firm (id, key, …) values ('F3', 'ghost-firm', …);
select case_firm_backfill();                                                    -- K3 := F3, follow: b3 := F3
select l.firm_id, s.firm_id from person_link l join person_link s on s.id = l.superseded_by_id;  -- F1 | F3
-- (b) as the app's role: set local role xr_app; same first update; then
update person_link set firm_id = 'F2' where id = 'b3';                          -- keep allows null→F2; result F1 | F2
```
- Expected: refused (brief DW<n>.3: "a child cannot point at another firm's parent … through each match trigger"; the migration header says the trigger "refuses a link whose superseded_by_id names another firm's link").
- Actual: the link pair is stored with two different firms, and the keep trigger then stops either firm being corrected.
- Part `keys` (person_link → runtime_case) would stop (b) but not (a), because in (a) b3 gets its own case's correct firm.
- Not reachable through today's API: the app supersedes only inside one case. Still, the database guard does not hold the invariant it states.

## Minor

**m-1. A half-empty cross-firm pair passes the migration's stop check, then makes every later firm backfill fail.**
The stop check (line 70) requires both firms to be set. Data that passes it:
```sql
-- before the migration: b3 (K3, no firm) superseded by b1 (F1)
update person_link set superseded_by_id = 'b1', voided_at = now(), void_why = 'superseded' where id = 'b3';
-- the migration applies (exit 0). Later, once ghost-firm is registered:
select case_firm_backfill();
-- ERROR case_links_firm_match … via case_links_firm_follow() line 6, inside case_firm_backfill() line 4
```
- The single `UPDATE runtime_case` statement rolls back, so no case anywhere gets its firm.
- `fillCaseFirmIdsOnStart` and the demo reset log the error and carry on (`api/src/firms.ts:41`, `api/src/demo.ts:47`). Every later start and reset then fails the same way.
- The same failure happens with no pre-existing data if M-1's mirror is made live: `update person_link set superseded_by_id = 'b1' where id = 'b3'` is allowed today.
- The refusal itself is correct. What is missing is that the migration does not stop and name this pair.

**m-2. A forced row whose parent is missing does not stop the migration.**
The brief's DW<n>.1 says: "A forced row whose parent is missing stops the migration with words."
```sql
set session_replication_role = replica;
insert into person_link_session (id, link_id, token_hash, expires_at) values (gen_random_uuid(), '…dead', 'orph', now());
insert into demo_message (…, link_id, …) values (…, '…dead', …);
-- the migration then applies (exit 0); both rows keep firm_id null; the composite keys skip them (MATCH SIMPLE)
```
Neither the migration nor `tests/check_csw2_links.ts` covers this case.

**m-3. A child row with an empty firm can sit under a link that has a firm. The keys skip it and the follow never comes back to it.**
- (a) A race between an insert and the follow: transaction 1 runs `begin; update person_link set firm_id = 'F1' where id = 'b4';` and holds it. Transaction 2 then runs `insert into person_link_session (…, link_id, …) values (…, 'b4', …)`. Its fill reads the link's firm as null before the foreign-key lock blocks it, and it inserts with firm null after transaction 1 commits. Result: session e1 has firm null under link b4, which has F1.
- (b) An update: `update person_link_session set link_id = 'b2' where id = 'c3'` succeeds. Session c3 keeps firm null under b2 (F2).
- `case_links_firm_backfill()` would repair both, but nothing in the app calls it: line 62 revokes it from PUBLIC, it is not granted to `xr_data`, and it is not wired into `fillCaseFirmIds`.
- No row becomes another firm's. These rows will block part 2's NOT NULL step.

**m-4. Passing an explicit null firm gets around "the setting and the parent must agree".** This comes from CS-W1's `case_firm_fill`.
```sql
begin; set local role xr_app; set local app.firm_id = 'F2';
insert into person_link (…, case_id, …, firm_id) values (…, 'K1', …, null) returning firm_id;   -- F1, accepted
```
The same works on `person_link_session`. Brief DW<n>.2 asks that, with `app.firm_id` set to firm B, an insert under a firm A parent is refused. That holds only when the default is used. CS-W4's `WITH CHECK` will catch this later.

## Not findings (documented deferrals or another row's work)
- `update person_link set case_id = 'K2' where id = 'b1'` is allowed, so a link of F1 now sits in an F2 case.
- A link on a firm-less case can be given any firm with `update person_link set firm_id = 'F2' where id = 'b3'` as `xr_app`. Its children follow that firm, and the keep trigger then locks it in after K3 gets F3.
- Both of these are held by part `keys` (person_link → runtime_case (case_id, firm_id)), which the PR says is left to that part.
- `runtime_case` firm F1 → null → F2 leaves its links on F1. Update guards on runtime_case are CS-W1 part 2's work.

## What held
- **Fill, all three tables:**
  - A null firm is filled from the parent.
  - Naming the other firm is refused (23514).
  - `app.firm_id` set to the other firm, or to an unknown uuid, is refused.
  - `app.firm_id = F1` under a firm-less link is refused.
  - `app.firm_id = ''` is read as none.
  - `app.firm_id = 'garbage'` fails loudly (22P02); it never fills silently.
- **Keys:**
  - Moving c1 (F1) onto b3 (no firm) is refused.
  - Moving a session onto another firm's link is refused.
  - Inserting under another firm's link with the fill disabled is refused.
  - Changing a link's id while it has sessions cascades and stays consistent.
- **Keep, all three tables:**
  - Emptying or changing a set firm is refused, including through `insert … on conflict do update set firm_id = null`.
  - As `xr_app`, `session_replication_role` and `disable trigger` are refused, so there is no way round it.
- **Match:**
  - A direct cross-firm `superseded_by_id` is refused on insert, on update, and in a multi-row single statement.
  - Deleting the superseding link sets the pointer to null and keeps the firm.
- **Deletes:** a case delete cascades links, sessions and messages; `truncate person_link cascade` works.
- **Demo reset** on the copy: 201, with links removed through the case cascade.
- **CS-W3 lookups:** `case_firm_of_link` and `case_firm_of_link_session` still answer F1, and null for the ghost case.
- **Follow:** filled the ghost case's links, sessions and messages, in the PR's suite and in mine.
- **The migration stops** on a pair where both firms are set and differ.
- **PR suite:** `tests/check_csw2_links.ts 4499 xr_studio_rt_brkl` passed 22/22, including W2 through the API.

Verdict: Changes 8ddd1cdc7bde48962cd6297a0b69e2ca00358034
