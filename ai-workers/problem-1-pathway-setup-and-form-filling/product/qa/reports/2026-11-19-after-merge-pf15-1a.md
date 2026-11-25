# qa after-merge, 19 Nov 2026 09:0x IST: batch #2201 (qa 2)

**Run:** after-merge, main 00378b402 (merge of batch #2201: #2130 PF-15 part 1a, #2124 AUD-1b, #2167 CS-K1 part 1, #2176 ci re-registration, #2173 records). Opus 5.5 medium. US$0, live AI off, no isolated copy (no Works claim, P-606).
**Verdict:** no item completes; no row moves. R1.20 and R1.8 stay Partial with parts missing.

## Evidence
CI run 44444356499 (ci, `mergify/merge-queue/538519e97`, head 01e4acd30, tree 92d53561d = main 00378b402's tree): success, 8 shards and 5 regression jobs.
| Check | Result | Row |
|---|---|---|
| `check_pf15_limits.ts` | 69 passed, 0 failed | R1.20 (PF-15 part 1a) |
| `check_aud1b_adapter.ts` | 33 passed, 0 failed | R1.8 (AUD-1b) |
| `check_csk1_client.ts` | 51/51 passed | CS-K1 part 1 (client record on every case) |
Shard jobs holding them: 135294529662, 135294529751, 135294529889.

## Parts missing (P-606)
* R1.20: rest of PF-15 (case-limit checks, downgrade booking, day-15 storage job), PF-4c part 2, PF-6 batch invite screen.
* R1.8: AUD-1m parts 1, 2a, 2b; J-8.

## Not tested
No walk: both rows are API-only so far and carry no verdict. The guards job in this batch failed `check-isolated-ttl.sh` once ("dropdb xr_studio_qa_a", Lead 86 08:39); not seen on qa copies, not logged.

## Questions for the Lead
None.

## Suggestions
None.
