# AUD-1c part 2 (chain checker, alert, integrity reads): break report, round 1

Head `7d86eb32f`, detached in `/home/user/wt-p2`. Isolated copy `p2brk` on :4631 (`xr_studio_p2brk`), restarted once with `PLATFORM_SYSTEM_IDENTITY=local` and once with `STUDIO_WORKSPACE_KEY=brkws`, then stopped (database dropped). Tampering was done as the table owner with `aud_event_no_change` switched off; re-chaining used `canonical.ts` `entryHash`. `tests/check_aud1c_verify.ts` at this head gives **17 passed, 0 failed**, but every chain in it stays under 10 lines (see 1). For timing and concurrency past finding 1, I used a scratchpad copy of `verify.ts` that differs only in `order by audit_event.seq`, run as `xr_app` with the real `LogAlerts`. It is labelled "patched" below. Paths are relative to `prototype/studio/`.

## Findings

**1. Blocker: the checker reads lines in text order, so every chain of 10 or more lines is reported BROKEN and never recovers.**
- What I did: added 20 lines to sample-firm's chain (seq 7..26) as the owner, with no tampering, then ran `POST /api/demo/audit-chain/check`.
- Expected: INTACT.
- Actual: incremental pass `gap` 7..26; full pass `gap` 2..26.
- At 211,929 lines a full pass flagged every chain of 10+ lines with `gap` from 2: firm A, firm B and the 200k firm. The only chains it did not flag were my tampered ones (each at its real seq) and the clean ones under 10 lines.
- Cause: `LINES` selects `seq::text seq`, and the page query ends `order by seq limit …` (`api/src/platform/audit/chain/verify.ts:40,85`). ORDER BY binds to the output column, which is text, so the order is "1", "10", "11", …, "2".
- Effects: every weekly pass flags every real chain, and since a BROKEN chain is re-read from seq 1 (`:77`) it stays BROKEN at every 30-minute run. An incremental pass whose new lines cross a power of ten (9 to 10, 99 to 100) also breaks. AUD-4's integrity read shows BROKEN for a chain nobody touched, and each firm gets a false page.
- With only that ORDER BY changed (patched copy), the same data verified with no false findings.

**2. Major: a break the checker found clears itself on the next pass when the chain verifies from seq 1. Tail deletion and re-chaining are each caught once and then reported INTACT for good.**
- What I did (8-line chains verified at 8): c004, deleted seq 7 and 8 as the owner; c007, changed seq 3's summary and re-chained 3..8 with `canonical.ts`.
- Expected: the chain stays BROKEN, because the checker's own verified_hash proves it was cut or rewritten.
- Actual: first incremental pass, c004 BROKEN `missing` 8..8 and c007 BROKEN `verified-changed` 8..8, one alert each. Next incremental pass: both INTACT (c004 verified to 6, c007 to 8 with the new hash); later full passes keep them INTACT.
- Cause: once BROKEN, the pass ignores `verified_hash` and starts from 0 (`verify.ts:77`). The upsert then writes INTACT and replaces `verified_seq`/`verified_hash` (`:96-99`), so the evidence is gone within 30 minutes. The firm read and the system read both say INTACT afterwards.
- I accept that the chain alone cannot see these changes (part 3's anchor). Here, though, the checker did see them and then forgot them.

**3. Major: one row in `aud_chain_check` whose key is not shaped like an id stops every pass: no chain is checked and no heartbeat is written.**
- What I did: as `xr_app`, `insert into aud_chain_check (chain_key, verified_seq) values ('0 not a chain', 5)` (part 1 minor 5: `xr_app` can write this table).
- Expected: the row is skipped or reported; the other chains are still checked.
- Actual: every pass returns **500**. The log shows `ZodError` at `LogAlerts.raise` ← `audit-chain.ts:14` ← `AuditChainVerifier.found`.
- Cause: the key sorts first and reaches `found()` as `missing`. `alerts.raise` is called directly rather than through a raise-safely wrapper (`verify.ts:109`), and `AlertDetail` refuses `entityKey` with a space, so the pass throws (`verify.ts:57`). The new chain c009 stayed un-checked until I deleted the row.
- The scheduled job fails the same way, so it depends on PF-23c's heartbeat-absence alarm, which is not built here.

**4. Minor: a moved break is recorded as raised even when the alert adapter dropped it.**
- What I did: the false break on sample-firm moved from 7 to 2 between two demo checks 14 s apart.
- Expected: a second alert with 2..26, or the row keeping 7.
- Actual: `alert_repeat` (LogAlerts' 5-minute window, `observability/alerts.ts:35-39`). The row now holds `failing_from_seq=2`, so `verify.ts:108` never raises 2..26. The page shows 7..26.
- The same happened when c001 was re-found 30 s after its first alert.
- Only reachable within 5 minutes: the demo check-now, or a weekly pass next to a 30-minute run.

**5. Minor: `xr_app` can hide a break until the weekly pass, or silence a future one.**
- What I did: set BROKEN c001 to `INTACT`, `verified_seq=8`, `verified_hash` = the real hash at 8; the next incremental pass kept it INTACT. Pre-set c008 to `BROKEN`, `failing_from_seq=3`, then had the owner tamper with seq 3; the full pass found `hash` 3..8 and raised **no alert**.
- What the weekly pass catches: the full pass re-found c001 (`hash` 3..8). It catches anything except finding 2's cases and c008's pre-armed silence.
- Severity: hiding needs both an app compromise and the owner. This is a consequence of part 1 minor 5, recorded here because the checker trusts the row.

**6. Minor: the demo route answers every firm's chain ids and broken ranges to anyone who sends `x-actor: user-A`, with no sign-in.**
- `routes.ts:34-42` returns `breaks: r.findings` for all chains; the same data on `/api/system/audit/integrity` needs `system/audit-log:list` and writes a `cross_tenant.access` line. Demo-only (404 under `STUDIO_WORKSPACE_KEY=brkws`), ids and seq only. Unthrottled: a full pass at 212k lines takes 2.8 s, two at once 7 s (patched copy).

**Note (not counted): the alert is raised inside the chain's transaction, before commit (`verify.ts:109`).** If the commit then fails, the alert has gone out but the row is not BROKEN, so the next pass raises it again. I did not reproduce this.

## Tamper matrix (real code, chains of 8 lines; same seq results in the patched copy)
- **Old line changed (c001):** incremental none (by design), full `hash` 3..8.
- **Rewritten and re-chained (c007):** incremental `verified-changed` 8..8, then INTACT (finding 2). The full pass cannot see it.
- **Middle line deleted (c003):** incremental none, full `gap` 4..8.
- **Newest lines deleted after a check (c004):** incremental `missing` 8..8, then INTACT (finding 2).
- **Seq 3 and 5 swapped (c005):** full `link` 3..8.
- **Forged prev_hash at 5 (c006):** full `link` 5..8.

## What held
- **Ranges:** every tamper was reported on the right chain at the right first seq, with the chain's head as `toSeq`. No other chain was marked.
- **One break, one alert:** two passes in two processes at once on a new break in c009 gave exactly one alert (`2..3`); the advisory check lock and the row de-duplicated it. Repeated passes on unchanged breaks raised nothing.
- **Concurrency (patched copy), 12 `xr_app` writers on 3 chains (the 200k chain among them), about 3,000 lines/s:**

  | Run | Lines written | Errors | p50 | p95 | p99 | Max |
  |---|---|---|---|---|---|---|
  | Writers alone | 18,252 | 0 | 3 ms | 5 ms | 10 ms | 100 ms |
  | With two full passes at once | 17,641 | 0 | 4 ms | 8 ms | 12 ms | 43 ms |

  The second run had no deadlock, no false finding, and appended lines were read in later pages. The checker never takes the chain lock.
- **Demo reset during checks:** 12 patched passes (page size 50) over a 5,000-line `sample:` chain while `POST /api/demo/reset` ran (201 in 0.88 s): no `sample:` finding, no error; the old chain's check row was removed and the new chain is INTACT at seq 1.
- **Scale (patched copy), 200,000 lines on one firm:** full pass 2.75 s; incremental 91 ms (27 lines read for 12 chains); RSS 475 MB, heap about 200 MB; no transaction timeout (the 120 s limit at this rate is about 8.7M lines per chain).
- **Walls:** firm A's and firm B's tokens each read only their own chain (a `firmId` query or `x-firm-id` header is ignored). Case Officer 403 (`agent/audit:read`); firm token on the system route 401; system token on the firm route 403; `platform-support` 403 (`system/audit-log:list`); `platform-owner` 200 with one `cross_tenant.access` line. Demo route: user-B and user-C 403, unknown or missing actor 401, firm bearer 403 (link-only), bad mode 400, outside the demo workspace 404.
- **No content leaks:** the alert lines carry only rule, firmId, entity, entityKey, fromSeq and toSeq. Neither the answers nor the heartbeat carry summary, detail or actor (I planted "secret summary/detail" text).

Breaker verdict: Block 7d86eb32f00c18814a67abd9865132a45390c5a6
