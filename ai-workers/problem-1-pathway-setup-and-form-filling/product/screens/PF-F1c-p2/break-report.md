# Break report: PF-F1c part 2 (R1.24), PR #3216, head 2c11a5e1e

Breaker (Opus), 23 Nov. Scope: the web-address catch-up command (`api/src/platform/web-address/firm-created.ts`, `asEachFirm`, the skip list, discovery through `module_event` and the Sample keys) and its test `tests/check_pff1c_catchup_walls.ts`. No repository file was edited.

**Set-up.** Postgres 18 at 127.0.0.1:54329. Throwaway databases `xr_studio_brk_*` (all migrations plus `seedSampleFirms`), all dropped afterwards; `xr_studio_demo` was never touched. The runner `xr_brk_rds` was `login nosuperuser nobypassrls`, granted `xr_studio` and `xr_wall_reader`, as the PR's test sets it up. The real command was run each time: `DATABASE_URL=… node_modules/.bin/tsx api/src/platform/web-address/firm-created.ts`. "Copy A" keeps `case_lookup_read`; "copy B" drops it.

## Findings

No Blocker or Major was found.

**m1 (Minor): finding the firms is all-or-nothing.** `firmsBehindWalls` (firm-created.ts:131-137) runs before any firm is worked. It reads `samples/firms.json` and calls `firmOfKey` for each key, and neither has a guard around it. If either fails, the command stops with `{"error":…}` and exit 1 before any firm is worked, including firms that have a `firm.created` event. That goes against the header's "One firm that fails never stops the others" (line 10).
Reproduction: copy B. Runner `xr_brk_own`, `nosuperuser nobypassrls`, granted `xr_studio` only. Add firm `firm-m` with a `firm.created` event, then run the command. Output: `{"error":"… Code: 42501. Message: permission denied for function platform_firm_of_key"}`, exit 1, and `firm-m` gets no address.
This is not RDS-faithful: PF-12 (migration `20261116013000`, line 149) grants `xr_wall_reader` to the migration role WITH INHERIT, SET. So it is Minor, a robustness gap. A missing or corrupt `firms.json` fails the same way. Suggestion: wrap the Sample lookup per key and fall back to the events alone.

**m2 (Minor): the cost grows with every firm, on every run, including as superuser.**
* The command always passes `asEachFirm: true` (line 148). It therefore opens one transaction for every firm that ever had `firm.created`, and each transaction takes `select … for no key update` on the firm's row (line 49), even when every firm already has an address.
* On main, a superuser run first reads only the firms with no address.
* Measured: 2,000 firms, all with an address. A run that changes nothing took 9.5 s as the RDS role and 8.6 s as superuser. A run on a small database takes about 1.1 s. During the run, every firm row is briefly locked against a sign-up or a staff address change.
* Under the walls, firms with the same name cost a number of refusals that grows with the square of their count (the skip list is per firm). Measured: 60 firms named "Maple Immigration" took 7.6 s as RDS against 1.3 s as superuser. It stays bounded at 50 refusals per firm, and the addresses were the same as the superuser run's (`diff` was empty).
* It is a one-off command (no app start, no request), so this is Minor. Possible fix: pass `asEachFirm` only when `current_user` cannot bypass RLS, or filter the event list with the narrow lookup first.

**m3 (Minor, wording): "the event subscriber [is] unchanged" (PR body; header line 19) is not quite true.**
* `onFirmCreated`'s retry loop is shared with `WebAddressCatchUp` (routes.ts:48). It changed from 3 attempts to the skip list, at most about 51 tries plus 3 (lines 90-105).
* The behaviour is the same under a bypass, because the read sees every row. `check_pf25_web_address.ts` gives 72 passed, 0 failed.
* The `++races >= 3` branch (line 103) is in practice unreachable: `tried.address` is new on each try and is never already in `skip`. The real bound is the length of the suggestion list.
* Suggestion: fix the wording.

**Seen before this PR, not counted (main has the same code, unchanged here):**
* `candidates()` (line 40) offers a firm its own key first whenever the key starts with `sample-`. A real firm named "Sample Clinic" is given the key `sample-clinic-<hex>` at sign-up (firms/signup.ts:230). If it has no address, it gets `sample-clinic-1a2b3c4d`, a `sample-` address that `checkAddressChoice` refuses to people. Reproduced in copy B.
* The owner's read (line 116) also picks up any `key like 'sample-%'` firm with no event. In copy A and as superuser, `sample-evil` (no event, not in firms.json) got `sample-evil`. In copy B it got none, because discovery there uses only the keys in firms.json.

## What held (expected = actual)
1. **Another firm's or a held address.** Firm Q has `maple-immigration` and firm Z holds `maple-immigration-2` (90-day history). In copy A and copy B, firm M got `maple-immigration-3`. The unique key and the held-address trigger (`platform_firm_web_address_rules`, SECURITY DEFINER, `xr_wall_reader` BYPASSRLS) refused the hidden ones, and Q's and Z's rows were untouched.
2. **Reserved or invalid addresses.** Names tried: `www` → `www-firm`; "Staging" → `staging-firm`; `xn--abc` → `xn-abc`; Chinese, Arabic and blank names → `my-firm`, `my-firm-2`, `my-firm-3`; "Sample Firm" → `firm` (no `sample-` address); a 220-character name colliding 3 times → 63-character addresses ending `-2` and `-3`; hyphen runs → `abc-x`, `ab-firm`. Every one passed `platform_web_address_allowed`.
3. **No endless loop.** With all 50 suggestions taken by hidden firms, the run took 1.2 s and ended in `failed: no free suggestion`, exit 1, with the other firms done. 60 colliding firms: 50 got addresses, 10 were named failed, all 52 addresses distinct.
4. **No writes to another firm's rows.** Each transaction is `firmInTransaction(tx, event.firmId)`, followed by an address row and an audit line for that same firm only. Audit lines equalled address rows equalled distinct firms in every run (12:12, 52:52, 50:50).
5. **No event, or a firm that left.** In copy B, a firm with no event that is not a Sample firm got none. DELETED and ABANDONED firms with events got `address:null, assigned:false`.
6. **Bad `module_event` rows.** A null `firm_id` or a missing firm is refused by the schema (NOT NULL, FK RESTRICT). A dangling row forced in with `session_replication_role=replica` was named in `failed` ("is no platform firm") and the other firms still got their addresses. A non-uuid id gets `firmScope` refusal; an unknown uuid is a clean throw.
7. **Concurrent runs.** 3 commands at once (2 RDS and 1 superuser; then 3 RDS, three rounds of 48 colliding firms) never gave a firm a second address or a duplicate audit line, and none failed. Example: 50 rows, 50 distinct addresses, 50 firms, 50 audit lines. The firm-row lock and the address advisory lock serialise the runs.
8. **Stopped half-way.** SIGKILL after 3 s left 24 rows and 24 audit lines. The re-run completed to 52/52/52 distinct.
9. **The app path cannot reach `asEachFirm`.**
   * Only the command's main block passes the option.
   * As `xr_app` with `asEachFirm`, every firm fails with "never the app's role" and nothing is written.
   * Inside `withFirm`, it is refused with "inside a request, job or firm scope".
   * Under a bypass, current_user is `xr_staff_bypass` (BYPASSRLS). Setting `app.firm_id` there changes nothing.
   * `WebAddressCatchUp` is unchanged (`asBypass(...)`, no options), and the PF-25 suite gives 72/0.
10. **The PR's own test** gives 14 passed, 0 failed, exit 0 (the runner's role is not superuser or BYPASSRLS; copy B gives the same addresses; the superuser run gives the same addresses).

Not applicable (no screen in this item): keyboard, 1024 px, 200 % zoom, uploads, the 100-program / 400-combination budgets.

**Verdict: Approve**
