# R1.4 reader verdict (fresh reader, ran nothing, P-303), main d5b20237d, 21 Nov

Read on `origin/main` d5b20237d (paths under `prototype/studio/`): `api/src/platform/firm-scope.ts`, migration `20261121120000_pf12b2_door_lookups`, the six door files, `identity/guard.ts`, `web-address/host.ts`, `firms/signup.ts`, `messages/send/{mail,messages}.ts`, `secret-box/reencrypt.ts`, `ports/jobs.ts`, the four suites, plus BUGS QA-499/500/608/609, CAPABILITIES R1.4, BACKLOG PF-12b2, P-339/305/606/607/616/780.

## Evidence
- **This folder (`2026-11-21-r14-main/`) did not exist when I read.** It is not in this copy, not on origin/main and in no commit on any ref. So I could not see `ci-44895043115-lines.txt` or `gate-a-main-{1,2}.txt`. I take qa's counts for them as claims only (pf12b_doors 31/31, pf12b_bypass_audit 56/56, pf12_walls 100/100, gate A 17/17 twice). They match the pre-run on #2752's head in `2026-11-21-r14-ready/`, which I did read (31/0, 56/0, 100/0, gate runs 3 and 4 at 17/17).
- **Gate A check 6 was rewritten between runs 2 and 3** (runs 1-2: 16/17, `logBefore 2 = logAfter 2`). The rewrite is legitimate. The old step asserted the bug: sign-in counted as a bypass use. The new step asserts 0 bypass uses and 0 audit lines for the sign-ins and staff routes. But the rewrite exists only on qa's branch. Main's `tests/qa/check_r14_walls_gate_a.ts:111` still expects at least one bypass use, so gate A as committed on main fails 16/17. "17/17 on main d5b20237d" means main's app plus qa's gate.

## (a) Done when, clause by clause
1. **The firm comes from the signed-in person only: MET.**
   - `guard.ts:108-109`: `authenticate` finds the firm through `platform_staff_firm(session staff id)` (`identity/service.ts:121-123`), then `setRequestFirm` (`firm-scope.ts:270-275`).
   - The host-routed firm covers public paths only (`host.ts:73-75`).
   - Tests: gate A R1.4 3 and 5 (header, query and body naming firm B never reach B; /me answers each person's own firm); pf12_walls 100/0.
2. **A query with no firm returns nothing: MET.**
   - `WalledPool.connect` sets `app.firm_id=''` and role `none` when no firm or bypass is in scope (`firm-scope.ts:301-308`). The API walls unscoped queries at load (`features/platform-firm-walls.ts:13,20`).
   - Tests: pf12_walls, gate A R1.4 2 and 7 (85 walled tables forced, policy on `platform_session_firm()`).
3a. **The bypass is used only through the named list: MET. "Only by named platform jobs": NOT MET as worded.**
   - `asBypass` refuses a use that is not on the list or not on its routes (`:156-162`), and the seven doors now count as such: `check_pf12b_doors` DW5 "asking the bypass for any of the seven doors by name is now refused".
   - Five request uses remain: `platform.firms.signup`, `platform.demo.inbox`, `platform.entitlements.limit-change`, `platform.account.mail`, `platform.demo.reset` (`:108-109,111,115,118`). This is QA-500, an open ambiguity, not a defect.
3b. **Every use writes an audit line: NOT MET for 4 of 12 uses.**
   - The doors are off the bypass. `BYPASS_USES` (`:106-119`) has 12 entries: 8 `per-firm` and 4 `none:`.
   - The doors now resolve their firm through definer lookups that return the firm id only (migration :13-44). The lookups are owned by `xr_wall_reader`; PUBLIC is revoked and EXECUTE is granted to xr_app and xr_staff_bypass (:46-55).
   - No door calls `asBypass` any more. My grep of `asBypass(` on main finds none of the six files; DW7 shows 0 lines.
   - For the 4 `none:` uses, `asBypass` writes only the server-log line (`:172`, `bypassLine` → `logPort.info`, `:142-144`). No `audit_event` row is written.
   - Lead 70's ruling (QA-499) says "a bypass use must write an audit_event row, not only a server-log line", with no log-only option and Done when unchanged.

The four `none:` uses. None of them reads or writes a firm's rows. Two of them do touch a walled table.

| Use | What it touches | Firm rows? |
|---|---|---|
| `job:platform.signup.purge` (`:110`) | `signup.ts:231-233`: one `deleteMany` on `platform_signup_pending`. Per the entry, that is our register with no firm_id. | No |
| `job:messages.send` (`:114`) | `messages.ts:238-256`: reads and updates `msg_outbox`, a walled msg_* table, only rows with `firm_id IS NULL AND audience='PLATFORM_ACCOUNT'` (:253-254, :240). | No (walled table, no-firm rows) |
| `platform.account.mail` (`:115`) | `mail.ts:39` and `messages.ts:146-155`: inserts one `msg_outbox` row with `firmId: null`, under an advisory lock. Its file goes to the platform space, not a table. | No (walled table, no-firm row) |
| `job:platform.secret_box.reencrypt` (`:116`) | `reencrypt.ts:58-60` refuses a job with no firm before any read, and `ports/jobs.ts:23,34` refuses to queue a no-firm job on any queue except `messages.send`. The entry is effectively unreachable: it can produce only a log line and then a refusal. | No (reads nothing) |

The engineering reasons hold, and the suite pins each use's line count to 0 (DW3, `check_pf12b_bypass_audit.ts:66,78`). But reasons are not the rule as written. BACKLOG PF-12b2 ("The four reasoned `none:` uses on main stay") sets a row's scope; it does not reword R1.4's Done when. The question on #2752 is unanswered.

## (b) The findings
- **QA-499: narrowed again, still open.** Suggested wording: "Narrowed (21 Nov, main d5b20237d): the own-firm half is fixed by #2752 (PF-12b part 2). The seven doors left `BYPASS_USES` for narrow definer lookups (pf12b_doors DW5-DW7 31/31). Still open: four `none:` bypass uses write no audit_event row (signup purge `firm-scope.ts:110`, messages.send `:114`, account.mail `:115`, re-encrypt `:116`). None reads or writes a firm's rows, and re-encrypt's entry is unreachable (`reencrypt.ts:60`, `ports/jobs.ts:34`). Expected: a platform-level `platform.bypass` row with firm_id null, fail-closed, or the use leaves the list (re-encrypt can go now), or a ruling exempts uses that touch no firm's rows (asked on #2752, unanswered)."
- **QA-608: close as Fixed.** BACKLOG has row PF-12b2 (`BACKLOG.md:385`, owner Lead B) and #2752 merged it.
- **QA-609: still valid, Minor.** `asBypass` (`:156-174`) still does not check that a `per-firm` use wrote a line. The suite still documents this limit (`check_pf12b_bypass_audit.ts:105-106`). Update its line refs from `:162-180` to `:156-174`.
- **QA-500: still open**, with five request uses on the bypass (as qa said).

## (c) Verdict: **Partial**
Clauses 1 and 2 are met, and 3a is met in substance. 3b is met for 8 of 12 uses: every per-firm use and every door is covered. It is not met for the four no-firm uses under Lead 70's ruling as written. A Major in BUGS disputes the row, so it is Partial (P-305 (3)). Works would need the four uses to write a row or leave the list, or a recorded ruling that rewords the Done when. Either way P-339 applies: the pack must be green on main's head on GitHub, with qa's gate on main.

**Where qa is right:** each count I could check, the door analysis, and QA-608's closure.
**Where qa is wrong or loose:** the main evidence folder is not committed (P-557), so the main-head claims cannot be checked. And "gate A 17/17 on main" used a gate that main does not have.

## (d) New finding
- **N1. Gap · Minor (qa records and tests).** Two parts:
  - Gate A's rewritten check 6 is not on main: main's `tests/qa/check_r14_walls_gate_a.ts:111` fails 16/17 on main's own tree.
  - `qa/reports/2026-11-21-r14-main/` (the CI lines and gate A logs behind today's claim) was not committed when this reader read.

  Expected: commit both, then cite the gate's commit in R1.4's row.
- No other new finding. The definer lookups return only the firm id or a yes/no, take no write, and pin their search_path. I have no objection to the migration.
