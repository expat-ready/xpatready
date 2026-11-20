# PF-12b part 1, main merge (#2029, R1.4, Wave 1): two new bypass uses classed, the sweep combined

Item: R1.4 (Wave 1, P-745). Row owner: Lead B (8). Written 20 Nov 06:2x IST at the current Lead's (Lead 98) ask. One lane takes **#2029 on its own branch `claude/runtime-pf12b-bypass-audit`** (head 865df8f2e) to merge. It is not a new PR. A builder plus the reviewer, because this is audit design (P-699 did not fit: not a mechanical merge).

## Why
#2029 gives every `BYPASS_USES` entry in `platform/firm-scope.ts` a typed `audit` field: "per-firm" (the use calls `touchFirm(tx, firmId)` for each firm whose rows it reads or writes) or "none: <why>". A use without it doesn't compile. Since #2029 branched, main gained (PF-19p, #1961) two bypass uses without `audit`, plus changes in the same files, so #2029 conflicts with main (P-270).

## Ruling (row owner): how the two new uses are classed
* **`job:messages.send`** → `audit: "none: a platform job sends one PLATFORM_ACCOUNT message, a row with no firm; it reads and writes no firm's rows (PF-19p). A firm's send job runs as its firm, not on this use."`
* **`platform.account.mail`** → `audit: "none: a platform account email (sign-up's verification, before any firm exists) writes its PLATFORM_ACCOUNT outbox row; no firm's rows (PF-19p)."`
* Both stay `outside: true` with main's `routes` and `direct` as they are; only `audit` is added.
* **If either use is found to read or write a firm's row** (a firm-scoped table, or a row with a non-null firm_id), it's "per-firm" instead. Stop and say so on #2029 before writing it; the test below catches it.

## The merge, file by file (conflicts named by Lead 98)
1. **`platform/firm-scope.ts` `BYPASS_USES`:** take main's entries, keep #2029's `audit` on every old entry, and add the two `audit` lines above. Nothing else changes.
2. **`platform/messages/send/messages.ts`, the outbox sweep:** keep both behaviours. Main's `PLATFORM_ACCOUNT` retry block (rows with no firm are retried under the platform use, not a firm's), **and** #2029's failed-firm skip (one firm's failure skips that firm and the sweep goes on) with `if (error) throw error` after the loop. A PLATFORM_ACCOUNT row is never counted as a firm and never gets a `touchFirm`. Its imports: the union of both sides.
3. **`platform/demo-inbox.ts` imports:** keep main's `fileKeyOf`, `filesSpaceOf` and #2029's `touchFirms`.
4. **Any other conflict:** keep both sides. Never drop a `touchFirm`/`touchFirms` call, and never delete or skip an audit line to make a test pass.
5. The DW3 change already on the branch (`check_aud1a_insert_only.ts`: no old platform line lost by id, plus exactly one `platform.bypass` line per Sample firm the reset touches) stays as it is.

## Done when (tests, on GitHub's runners)
* `tests/check_pf12b_bypass_audit.ts` gains, for each of the two new uses:
  * a **pass**: the entry has `audit` beginning "none:";
  * running the use (a platform account message sent by the job; a sign-up verification email) writes its PLATFORM_ACCOUNT row and **no** `platform.bypass` audit line, and touches no firm-scoped row;
  * a **fail**: a stand-in entry with no `audit`, or "per-firm" on a use that calls no `touchFirm`, is reported by the check.
* The sweep: one test with one firm's row failing and one PLATFORM_ACCOUNT row due. The other firms' rows still send, the failing firm is skipped and logged, the PLATFORM_ACCOUNT row is retried under the platform use with no `touchFirm`, and the sweep then throws the first error.
* #2029's existing suites green: `check_pf12b_bypass_audit.ts` (all old cases), `check_aud1a_insert_only.ts` (DW3), the firm-walls suites the PR names; plus PF-19p's (`check_pf19p_*`) and PF-19b's suites from main.
* `types` green, and no `BYPASS_USES` entry without `audit` (it won't compile).
* The reviewer's diff-only Approve names the new head; the head is posted on #2029. The Lead dispatches the full run and labels (P-731).

## Touch
`platform/firm-scope.ts`, `platform/messages/send/messages.ts`, `platform/demo-inbox.ts`, `tests/check_pf12b_bypass_audit.ts`, plus only the files git reports as conflicting. No migration.

Source: #2029's own rows (PF-12b, QA-499, R1.4 "every use writes an audit line"), PF-19p (#1961), P-571 (1), P-607, AG-1-45, P-270, P-745.
