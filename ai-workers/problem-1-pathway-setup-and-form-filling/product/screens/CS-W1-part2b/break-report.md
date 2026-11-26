# Break report: CS-W1 part 2b (#3878, head 207402be59), breaker

Scope: own diff `origin/claude/runtime-csw1-part2...HEAD` (migration 20261126170000_cases__csw1_rekey; runtime.ts reach,
list, createCase plus its replay, next number; studio.ts activity; case-close.ts view and lock). Attacked through the API on
an isolated copy (`zsh tools/isolated.sh rt_brk4 4499 start --ttl 60`, later `restart … PLATFORM_IDENTITY=local` for the
bearer routes), plus a scratch database `xr_studio_brk4mig` for the migration. I never touched :4400 or xr_studio_demo. The
copy and the scratch database were dropped afterwards. Scripts: the session scratchpad `brk4/a1.mjs`, `a2.mjs`, `a3.mjs`.
I edited no code. The PR's own `tests/check_csw1_part2b.ts 4499 xr_studio_rt_brk4` passes: 14/14.

## Findings (no Blocker, no Major)

**m1 (Minor): if a case's firm_id and firm_key disagree, the doors no longer agree on whose case it is.**
Steps: open a sample-firm case as user-O (no reference; number C-2026-00011, so it does not collide with the solo firm's
numbers). As the owner, run: `begin; set local session_replication_role = replica; alter table runtime_case disable trigger
case_firm_fixed; update runtime_case set firm_id = <sample-solo id> where id = X; alter table runtime_case enable always
trigger case_firm_fixed; commit;`. Without replica mode the composite FK `runtime_case_client_id_firm_id_fkey` refuses
the update, so the database needs two separate bypasses before this row can exist.
- Expected: one firm owns X at every door, or both firms get 404 at every door.
- Actual: reach, the list and activity go by firm_id, so user-S gets 200 on `GET /runtime/cases/X`, sees X first in its
  list and in its activity feed, and gets 200 on `/stages`, `/prepare`, `/filings`, `/forms`, `/checklist` and `/reviews`.
  user-O and user-R get 404. The header shows `team.firm = Sample immigration firm` with representative user-R, because
  team.ts reads by key. `GET /decisions` and `POST /close` give 404 to both firms' bearer sessions, because
  case-close.ts:55 and :100 still select `firm_key = ctx.firmKey` before the new firm_id comparison. The plan count
  (case-count.ts:27), the opening lock (runtime.ts:360) and the duplicate application-number checks (submission.ts:197,
  :228; filing-record.ts:55) also still go by key.
- Why Minor: the app cannot create such a row. case-close fails closed, and reads stay with the platform firm, which the
  contract names as the truth. Still, the "case-close's two firm checks" now test key AND id, while reach tests id only.
  One rule written down in MODULE.cases.md would settle it.

**m2 (Minor): the migration has no pre-check in words, and is half-applied if run statement by statement.**
Steps: on a scratch database migrated to 20261126160000, seed both firms. As the owner, with the guard off and in replica
mode, insert a solo case C-2026-00060 and a sample-firm case C-2026-00060, then set the second one's firm_id to the solo
firm's id. Then run the migration:
- As one script (`psql -c "$(cat migration.sql)"`, the way Prisma sends it): `could not create unique index
  "runtime_case_workspace_id_firm_id_case_number_key" … is duplicated`. Everything rolls back, so the old indexes and the
  old primary key remain. This held.
- With `psql -f` (statement by statement, the way check_csw1_part2b.ts and the a24 check apply migrations): the same raw
  error, and the database is left with the three firm_key indexes dropped, only two firm_id indexes created, no case-number
  rule at all, and the counter's primary key already moved to firm_id.
- Expected: as in part 2a, a check in words that names the rows and the `prisma migrate resolve --rolled-back` step, or the
  file wrapped so it cannot half-apply. Minor, because part 2a's guard and the FK make such a row unreachable in normal use.

**m3 (Minor): the new 409 has no API test, and on a read its words describe an opening.**
Steps: rename sample-solo's platform_firm key out of the way (owner, `platform_firm_key_fixed` off), then `restart …
PLATFORM_SAMPLE_SEED=off` so the cache starts empty.
- `POST /runtime/cases` as user-S: 409 "Sample solo practice has no account on the platform yet, so it cannot open a case.
  Nothing was created." A retry with the same idempotency key gets the same 409. No row was written. This held.
- `GET /runtime/next-case-number` as user-S: 409 with the same sentence. On a read, "cannot open a case. Nothing was
  created" is the opening's wording.
- The list gives 403 NO_FIRM (CS-W3's door, before this code), reach on its own old case gives 404, and the activity feed
  shows none of its case lines.
- check_csw1_part2b.ts tests only the database function's words. Nothing in tests/ or acceptance/ calls the API's new 409
  (runtime.ts:301-302 and :1064-1065).

**m4 (Minor, out of band only): the firm-id cache in firms.ts can go stale.**
- Demo reset: `POST /api/demo/reset` keeps both platform firm ids. It calls forgetFirmIds, numbering restarts at
  C-2026-00001 for both firms, and opening and reaching work afterwards. This held.
- Key removed while the cache is warm: opening gives the plan-limit 409 "no live subscription" instead of the new 409.
  Reads keep using the cached id.
- Id changed by the owner (replica mode) without a restart: opening gives 403 "not staff of your firm", because
  case-firm-door uses the same cache and asFirm differs from the fresh platformFirm. Reach still answers 200 for the
  case under the old id. Every path fails closed, nothing is written, and the app never changes a firm's key (trigger)
  or id.

## What held (as each Sample person)
- Opening: user-O, user-R and user-S get 201. user-A and user-Q get 403. user-P gets 409 client-in-two-firms (CS-W3's
  door, not this diff).
- Reach and list: each firm sees only its own cases. Clients reach only their own cases. user-A gets 403. A cursor
  (`after`) set to another firm's case id returns an empty page with no leak.
- Next number: each firm has its own sequence (sample-firm C-2026-00003, solo C-2026-00002). user-A and user-Q get 403.
- Activity: each firm sees only its own case lines. user-A (review duty) sees all lines, as before. Clients get 403.
- Decisions, close and withdraw (bearer, user-O, user-R, user-T, user-S): the other firm's case gives 404 "No such case in
  your firm." and its status stays OPEN. On its own firm's case, close gives the 409 not-decided rule and withdraw gives
  200. Sending only `x-actor` gives 401. A solo bearer token with `x-actor: user-O` gives 404.
- Idempotency across firms: the same key in both firms makes two separate cases (both created:true). The replay inside
  each firm returns the same id with created:false, also when another staff member of that firm replays. Another body
  with the same key gives 409.
- Reference: a reference already used in the other firm gets 201. One already used in the same firm gets 409 "A case
  with this reference already exists".
- Parallel openings: 8 at once across both firms all got 201. Numbers within each firm are gap-free (each counter was
  10 after 9 cases), and no number repeats within a firm_id. 6 parallel calls with one key in the solo firm made 1 case
  (1 created, 5 replays). One key used in parallel in both firms made exactly 2 cases.
- Migration on data from both firms: shared reference, number and idempotency key across the firms migrate cleanly. A
  duplicate within one firm is refused before the migration (firm_key rule) and after it (firm_id rule). Numbering
  carries on from each firm's counter, rolls over at the Toronto year, and a ghost or null key is refused in words. A
  counter row given another firm's id is refused by case_firm_from_key. The rollback steps in the header work as written
  (applied with `psql -1`, after which numbering works on firm_key again).

Verdict: Approve 207402be591c14c125117892e33a33c2476dff55
