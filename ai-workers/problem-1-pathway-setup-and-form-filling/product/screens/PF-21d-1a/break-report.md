# PF-21d part 1a: break report (API + schema, no screen)

Commit `43e53cec9`, scope `git diff c62d4bcb3...43e53cec9` only. Brief: `product/screens/PF-21d/brief.md` decision 1 and
"Split of part 1" (accepted on #3189: minimal `plat_switch` with insert-only events, key `system/compliance:dsr-manage`,
Platform Owner only, Sample). Run on 23 Nov in a throwaway worktree on a scratch database (Postgres 18, :54329), and an
in-process Nest app on a random port (never :4400). Harness: a copy of `tests/check_pf21d_switch.ts` with attacks added
(`brk_pf21d_1a.ts`, not committed; the worktree has been removed). First, the builder's own check: 20 passed, 0 failed.
Paths below are under `prototype/studio/`.

## Findings (no Blocker, no Major)

| # | Attempt | Expected | Actual | Sev | Where |
|---|---|---|---|---|---|
| m1 | Owner turns the switch off/on with a reason of only invisible or empty-looking characters: `​`, `​‌‍`, `⁠`, `﻿​`, Hangul filler `ㅤ`, `ﾠ`, two combining accents, `...`, `-` | Refused with "Give the reason", following the house rule in `reasonOf` (breaker m4 on PF-4s: once invisible characters are removed, at least one letter or digit remains) | All 9 were **200**: the event stores the invisible text as the reason, so a "reason required" change has no readable reason. The ALLOWED audit line for the same call has `reason = null`, because the guard's `reasonOf` strips the text, so the event and the trail disagree. The DB check `btrim(reason) <> ''` does not catch these either | Minor | `api/src/platform/switches/service.ts:20-21`; `migration.sql` (event CHECK) |
| m2 | Owner sends `POST /api/system/switches/platform.data-erasure%00` | 404 (unknown switch) | **500 Internal server error** (Postgres refuses a NUL byte in the text parameter). The REFUSED line's target reads `{"key":"platform.data-erasure"}` with code `ERROR`, because `lineText` strips the NUL. So the trail names the real switch for a call that was about a different key | Minor | `service.ts:44` (key passed unchecked); `service.ts:49-50` |
| m3 | 20 simultaneous POSTs (10 "on", 10 "off") from the Owner | Each 200 answers with the state that caller just set | 7 of the 200 answers reported the **opposite** state. `set` re-reads the list after commit, so it picks up another caller's later change. A future screen would confirm "off" to someone who just turned it on, or the reverse. Events and audit lines stayed correct | Minor | `service.ts:53` |
| m4 | As the table owner / `set role xr_wall_reader` (the definers' owner, BYPASSRLS): `UPDATE plat_switch SET is_on = not is_on, changed_by='staff:forged'`; `INSERT INTO plat_switch_event (… at) VALUES (… '2001-01-01')`; `INSERT INTO plat_switch (key,is_on) VALUES ('platform.ghost', false)` | The schema doc says the switch is "changed only through plat_switch_set with a reason". So the state changes only together with its event | All three succeed. The state flipped with **no event and no reason**, a backdated event was written that matches no change, and a switch that was never on appeared in `GET` (name = key). `plat_switch_kept` only blocks key changes, deletes and truncates. Owner or definer-owner level only (same depth as #3189's register) | Minor | `migration.sql:36-47`, `:24` (`at` is writable) |
| m5 | `xr_app` with no `app.firm_id`: `select plat_switch_set('platform.data-erasure', …, 'staff:00000000-…')` | (By design the gate is the code's: as the register's definers in #3189) | **SET**: the switch flipped under a forged `staff:` actor, with no audit line. This is the accepted pattern, recorded so 1b knows that any unscoped SQL as `xr_app` can trip it | Minor | `migration.sql:57,65,81` |
| m6 | ErasureRegistry: register `{module:"mut.one"}`, change `.module`, register `"mut.one"` again, then change it back. Also a getter that returns `"flip.ok"` and then `"Bad Name!"` | One module, one eraser; only valid names listed | `erasers()` listed `mut.one` **twice** and `Bad Name!`. The name is checked once and never fixed (no snapshot or freeze). Needs in-process code | Minor | `ports/erasure.ts:51-55` |
| m7 | Register `{module:"no.erase"}` with no `erase`, and `{module:"erase.str", erase:"x"}` | Refused at start-up | Both accepted. The 1b job would fail at run time on a TypeError, not at registration | Minor | `ports/erasure.ts:51-55` |
| m8 | A 300-emoji reason (300 characters a person can see) | Accepted (limit 500) | 422 "At most 500 characters": zod counts UTF-16 units (600), while the guard and the DB count code points. Non-BMP scripts get half the limit, with a message that is wrong | Minor | `service.ts:20` |
| m9 | A firm session calls `plat_switch_list()` / `plat_switch_set` | Refused, with a message about switches | Refused (held), but the message reads "plat_data_request: only ExpatReady's own staff read or work the register of requests made to ExpatReady" | Minor | `migration.sql:57,65` |

Nits (no severity): module names `a-` and `a--b` are accepted (`ports/erasure.ts:22`). A too-long reason gets 400
`REASON_TOO_LONG` from the guard, while every other reason fault gets 422 `SWITCH_FIELDS`. The event's `at` is
`CURRENT_TIMESTAMP` (transaction start), while `plat_switch.changed_at` is `clock_timestamp()`. A JSON body with a
`__proto__` key passes `strictObject` (no pollution: `on` was applied as sent). Note for 1b: `PlatSwitches.isOn` inside
`withFirm` throws 42501. That fails closed, so the job must read the switch outside a firm scope.

## What held
* **Roles:** GET and POST refused for Support, Admin, Auditor, Billing, Content publisher, a staff member holding every
  role except Owner (403 + one REFUSED `MISSING_PERMISSION` line each), a firm token (403), no token and a garbage token
  (401). Upper-case path variants (`/API/SYSTEM/…`) are still guarded. The state never changed and no events were written.
* **Bodies:** none, `{}`, `[]`, `[{…}]`, string, number, `null` literal, `on` as `"false"`/`0`/`null`, `on` missing,
  reason as number/array/object, extra `by:"staff:forged"`, whitespace-only reason, 501 and 10 000 characters, RLO,
  NUL, LRM, NEL, isolate controls, text/plain, form-encoded, 2 MB (413). All 4xx, nothing changed. Arabic, Chinese,
  Hindi, emoji, zalgo, a SQL-looking reason (`'); delete …`), HTML and 500 characters were stored verbatim (parameters
  are bound).
* **Keys:** a different letter case, encoded space/newline, `..%2F..%2Fsession`, `%2e%2e`, U+2010 hyphen, SQL text,
  5000 characters, emoji, `platform..data-erasure`, `constructor`, `__proto__`, `toString`: all 404. `%ZZ` gives 400.
  PUT, PATCH and DELETE give 404, as does GET on a single key. `%2E` and a trailing slash only reach the real key.
* **Races:** 10 simultaneous "off" calls gave exactly one 200 and nine 409, with one event. In 20 mixed calls and then 60
  more: one event per 200, events strictly alternate, the last event equals the state, no 5xx. Every HTTP-made event has
  exactly one ALLOWED line, and there is no ALLOWED line without an event (`FOR UPDATE` in `plat_switch_set` works).
* **DB walls:** in a firm session the definers refuse, including after `set local role xr_staff_bypass` and with a
  malformed firm id. `xr_app` and `xr_staff_bypass` cannot select, update or insert on either table. `set role
  xr_wall_reader` and `set role xr_studio` from `xr_app` are refused. A temp table `plat_switch` and a `pg_temp`
  function shadowing `plat_data_request_system_only` did not fool the definers (`pg_temp` comes last in search_path).
  `xr_app` cannot create functions in `public`. A NULL `on` or NULL reason through the definer is refused. Delete and
  truncate are refused, events cannot be updated, a key change is refused, `changed_by` NULL is refused, a duplicate
  `seq` is refused, and the trigger forces `changed_at` to the database's own time.
* **Registry:** the contract passes on both. It refuses `""`, `A`, ` a`, `a\n`, `a\0`, `a..b`, `a.`, `.a`,
  `__proto__`, `toString`, 61 characters, `ä`, `1a`, a number, a `String` object, null and undefined. Changes to the
  returned list do not reach the registry, and Nest gives one instance per app.

**Verdict: Approve**

## Round 3 (24 Nov, diff only: 7d6a7a8fa → d6186236088f2623c5fb9a9ff1ffe544454e09fc)
Diff: the merge of origin/main (a79e246c6), the re-stamp to `20261124080000_pf21d_switch` (462cac84d) and a comment-only
commit (d61862360). `git diff a79e246c6 d6186236` touches only this PR's 14 files. The migration differs from the approved
one only in its F4 comment, which now names `20261123200000_pf21b_data_requests`. Run in a worktree at d6186236 against
Postgres 18 on :54329, never :4400.

**Attempts**
* **Order:** applied all 163 migrations by hand, in order, to a new database. Expected: they apply, `20261124080000` last.
  Actual: they apply; it comes last, after `20261124032000_fo3c2_require_agreement` (origin/main is still a79e246c6). Held.
* **Shipped suite** `check_pf21d_switch.ts`: 20/20. It covers "after every one before it", the run right after the
  migration on an empty and a demo copy, and an empty `prisma migrate diff`. Held.
* **Collisions with main since 23 Nov:** `pf12_walls` 110/110, `pf12b_doors` 33/33, `features_registry` 27/27,
  `pf17_support` 29/29 (keys `20261124030000`), `pf17_console` 38/38, `pf4s_system_signin` 104/104 (system staff catalogue),
  `pf21b_requests` 27/27, `pf21c_breaches` 48/48, `pf21w_routes` 83/83, `pf21j_handler_key` 19/19, `pf8b_f4`–`f8` all
  passed (9, 14, 26, 17, 15) and `pff1c_catchup_walls` 14/14. Nothing else on main defines `plat_switch*`. The `dsr-manage`
  key has one seed row (`platform-owner`, from #3189). This migration seeds no key. pf21b's and pf21c's `*_system_only` have
  other names. Held.
* **Walls by hand** (fully migrated database): `xr_app` with no firm can list the switch. With `app.firm_id` set, list
  and set are refused by `plat_switch_system_only`, as is `set local role xr_staff_bypass` with a firm; with no firm, the
  bypass role selecting the table is permission denied. `pg_temp` copies of `platform_session_firm()` or the helper do not
  get past the refusal. A temp `plat_switch` table with the row `shadow.key` is ignored. Both tables are forced with 0
  policies; the three functions belong to `xr_wall_reader`, executable by `xr_data` only; `public`'s ACL no longer lists
  `xr_wall_reader` after the hand-over. Held.
* **Round-1 attack script re-run** with the new stamp: no new findings. Its BROKE lines are the ones round 1 already ruled
  on (no-firm setting by design, the owner's direct writes, the `%2E` and trailing-slash aliases, duplicate-key JSON).
  One new BROKE line ("E: from a firm session…") is a fault in my script: its temp row held `false` while the real switch
  was already `false`, so the result could not be read. Repeated by hand with a distinct key, it held (above).

**Notes (not findings for 1a)**
* 1b (`origin/claude/runtime-pf21d-erasure`, 4689c3469) still carries `20261123110000_pf21d_switch`. Its
  `20261123120000_pf21d_erasure` now sorts before 1a's migration, so 1b must be rebased and re-stamped after `20261124080000`.
* `check_fo3c2_consultation_agreement` fails locally with `requireAgreement` unknown. The cause is the stale shared Prisma
  client (`studio/node_modules/.prisma/client`, generated 23 Nov 06:03), not this PR. The switch is read through raw SQL
  only (`switches/service.ts:47,51,65`).
* I left the databases `xr_studio_pf21ds_*_7133` and `_9007` because they belong to other sessions. Mine and my worktree
  are removed.

**What held (round 3):** the re-stamped migration applies last on an empty copy and on a demo copy. It does not collide
with anything merged since 23 Nov: migrations, PF-12's walls, the staff catalogue, PF-17's keys, the features registry and
the dsr-manage seed. The definer walls, the forced tables and the hand-over also hold.

**Verdict: Approve** for d6186236088f2623c5fb9a9ff1ffe544454e09fc (no open Blocker or Major).
