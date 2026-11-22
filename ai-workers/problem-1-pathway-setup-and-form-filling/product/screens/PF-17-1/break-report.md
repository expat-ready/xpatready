# PF-17 part 1 break report: `GET /api/system/firms` and `GET /api/system/firms/:id`

Breaker, 22 Nov 2026. Branch `claude/stoic-newton-if7dgz`, head `27e8b406a09a215357e9fa3bbd4930bbbefcb21d`. US$0, no live AI, no code changed.
Paths below are under `prototype/studio/`.

**How I ran it.** I made a `git archive` copy of the exact commit in my scratchpad. A small Nest app, modelled on `tests/check_pf17_console.ts`, ran there on a scratch database on 127.0.0.1:54329, with the system and firm stand-ins, fake failed jobs and fake stored bytes. I did not start the full studio and did not use :4400. In my copy the builder's suite passes 34/34.
**Shared tree note (not a code finding).** While I worked, another process kept changing `api/src/platform/system-console/firms.ts` in the shared checkout (mtime 09:29:55). Two runs of the suite there failed for that reason only: "seats 6/5 over:false". So use isolated copies for this row.
**Out of scope.** This row is API only. I skipped all screen attacks: keyboard, 1024 px, 200 % zoom, reload/back, uploads and the planted-instruction PDF.

## Breaks

**M1 (Major): every list call writes one `platform.bypass` line on every firm's trail, and the brief said to ask the tech lead before choosing this.**
- `firms.ts:81` reads every firm that matches `q` (all firms when there is no `q`). `:131` then touches each of them, even when the health filter or the page returns none of those rows.
- Measured: `?health=HELD` returned 0 rows with 100 firms and wrote 100 lines; with 400 firms it wrote 400 lines. `?page=2` behaves the same way.
- After about 40 test calls, firm A's own trail held 42 `platform.bypass` lines. A firm sees these lines in its activity log (AUD-4 does not filter them out).
- The brief says (Touches section): "If the per-firm audit mode would write one line per firm per list call, ask before choosing (a question for the tech lead), do not pick silently."
- I found no such question or ruling on the branch: not in the commits, not in `MODULE.rows/PF-17-1.md`. No PR exists yet.
- This finding drops to resolved if the PR body cites the tech lead's ruling. Otherwise one of these is needed: a ruling, a "platform"-mode line per call, or touching only the firms actually returned.

**m1 (Minor): the API does several queries per firm on every call, and the cost grows with the number of firms.**
- Per firm per call (`firms.ts:109-117`): 1 case-count query, 1 seats query, 4 `limitOf` calls, a walk of the firm's file tree, and 1 audit transaction (`touchEachFirm`).
- Timings:

| Firms | Plain list | `?health=HELD` | 5 lists at once | `?q=` search | One firm |
|---|---|---|---|---|---|
| 100 | 611-626 ms | 564 ms | 1.7 s | 6-8 ms | 10-11 ms |
| 400 | 2.4-3.7 s | 2.8 s | 6.6 s | 6-8 ms | 10-11 ms |

- With the Sample data (2-4 firms) the STANDARDS §9 budgets hold, and scale work is the team's. But §5 asks for "no N+1" [M], and a filter on 100 firms is already 564 ms against "< 200 ms".
- Part of this is forced by the brief, which says to reuse PF-15's per-firm reads and "never a second count". Recorded so part 4's screen does not inherit it unknowingly.

**m2 (Minor): the health word says "OK" for firms that are clearly not fine.**
- A `SECURITY_LOCK` firm → `OK`.
- `ABANDONED` → `OK`.
- `DELETED` with an ENDED subscription → `OK` with limits 0/0.
- A firm with no live subscription → `OK`, `plan:null`, every limit 0, no reason given (`firms.ts:158-170`). PF-15 refuses every hard metric for such a firm (`limits.ts:47`, `noLivePlan`).
- The brief's health list only names over-limit, trial-ending, overdue and hold, so this is not a defect against the brief. It will mislead part 4's screen; a reason line such as "no live plan" or "security lock" would fix it.

**m3 (Minor): two input edge cases.**
- `?q=%` and `?q=_` match every firm: Prisma `contains` does not escape LIKE wildcards. No leak, because the caller may list all firms anyway; just odd search behaviour.
- `?health[]=OK` and `?health[a]=OK` are ignored without a word: 200, unfiltered. `?health=OK&health=HELD` correctly gives 400.

## Attempts that held (expected = actual)
- **Forged or cross-signed tokens** (both routes):
  - Firm token plus `plane:"system"`, firm key → 403 FIRM_SESSION_REFUSED.
  - Firm token plus system issuer and `sub` = our owner, firm key → 401.
  - Firm payload signed with the system key → 401.
  - Same with `plane`+`iss` set to the system's → 401 UNKNOWN_STAFF.
  - Payload changed but original signature kept → 401. `alg:none` → 401.
  - System-key token whose `sub` is a firm staff id → 401 UNKNOWN_STAFF.
  - System token with a `FirmID` claim → 401. One-step session → 401 TWO_STEP_REQUIRED.
  - Token in `?access_token=` or a cookie → 401. `Basic` scheme → 401.
- **Mixed case.** `/API/System/Firms`, `/api/SYSTEM/firms/<id>`, and `/api/system/FIRMS/<ID in upper case>`:
  - Owner → 200, with one guard audit line and the bypass lines.
  - Firm token → 403, Content publisher → 403, no token → 401.
  - No refusal body contained "usage".
- **Content publisher.** 403 MISSING_PERMISSION on the list, on one firm, under mixed case and with HEAD. It writes a REFUSED audit line and returns no firm data. A Support member whose grant was ended → 403.
- **Ids from another environment and SQL-looking input:**
  - Random UUID, the all-zero UUID, `x' or '1'='1`, `1;select pg_sleep(3)` (4 ms), a 5,000-character id, `..%2F..%2Fplatform`, the firm key instead of its id, full-width text, `{}`, `null`, the id plus `%20` or `%00`: all → 404 "There is no firm with that id.", never 500.
  - The guard's audit target is cut to 200 characters.
  - SQL-looking `?q=` (`' or 1=1 --`, `%' --`, `\`, `a\`) → 200 with 0 rows, never 500.
- **Can the bypass be reached elsewhere?**
  - `/api/system/me` (another controller) writes no bypass line.
  - POST, PUT, PATCH, DELETE and OPTIONS → 404 with no lines.
  - `/api/system//firms`, `/api/system/./firms`, `/api/system/x/../firms`, `/api/system/firms%2F<id>`, `firms;x`, `firms.json`, `firms/<id>/x` → 404 with no lines. `//api/system/firms` → the PF-4s wall answers 403.
  - HEAD and a trailing slash run as GET, as `firm-scope.ts` `routeOf` intends, with the same lines.
  - The service is called only from `routes.ts`, and the use's regex (`firm-scope.ts:122`) admits only the two GET paths.
- **Figures against PF-15.**
  - Firm with 1 active + 1 suspended + 1 deactivated staff, 1 open and 1 expired invitation, and 1 stored byte. Console: seats 3/5, storage 1/25600, cases 0/150 and 0/30. PF-15's own `seatsUsed`/`limitOf`/`PgCaseCount`/`mbOf` gave exactly the same, and `checkDowngrade(solo)` agrees (3 staff).
  - Over is counted only above the limit, as PF-15 counts it.
  - Not exercised: non-zero active cases. Both sides use the same `PgCaseCount` by firm key.
- **Private data.** Neither the list nor one firm's answer contains:
  - staff names or emails;
  - `contactEmail`, `ownerEmail` or `ownerPhone`;
  - a country or address;
  - a dead letter's key or error text (I planted `dl-secret-key…` and `…passport-123`).
  - A failed job appears only as its queue name (`sourceName`, code) and its time. An upper-case firm id in a dead letter still counts for its firm.
- **A firm session reading console figures.** The firm token got 403 on every path variant and on HEAD. No firm route uses `SystemConsoleFirms`. A system session on `/api/platform/*`, in either letter case → 403.
- **Fail closed.**
  - Bypass audit port throwing → 500 "could not be written…" on the list and on one firm, with no data.
  - Port failing for one firm only → 500 with no data. The lines of the other 6 firms read were still committed, which over-records rather than under-records.
  - `plat_system_audit` refusing inserts → 500, no data, and 0 bypass lines (the guard stops first).
- **Size limits on the query:**
  - `?q=`: 100 characters → 200; 101 → 400; 20k and 2 MB → 431 from Node.
  - `?page=`: 999999 → 200 and empty; 1000000, `1e3`, `01`, `-1`, `1.5`, `0x10`, `NaN`, 20 digits → 400.
- **Repeated parameters.** Repeating `?health=`, `?q=` or `?page=` → 400 "Give … once".
- **Other text.** Control-only, zero-width-only and space-only `q` act as no filter. Non-English, emoji and `<script>` text → 200 with 0 rows (the answer is JSON only).

Verdict: Changes
