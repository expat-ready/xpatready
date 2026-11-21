# qa ready lane: preparation, 21 Nov (cloud, Opus 5.5 medium, live AI off, US$0)

Rows in order: R1.3 (#2349), R1.4 (PF-12b2, #2752), R1.13/R1.24/R1.5 cloud halves (#2743 merged 07:07Z, #2748), R1.90.
Main at start: 47a2a1809. Watching for merges every 20 min (GitHub API).

## What each row can reach today (on main 47a2a1809; P-606: scored only when all parts have merged)
| Row | After its named PR | Why |
|---|---|---|
| R1.3 | **parts missing, no verdict** | #2349 is CS-W3 part 1 only; CS-W2 (one PR per area file), the rest of CS-W3 and CS-W4 have no open PR. Question for the tech lead on #2349. |
| R1.4 | **Works possible**, only if the tech lead rules on the four `none:` uses | #2752 takes the seven doors off the bypass. Four no-firm uses (purge, messages.send, account.mail, re-encrypt) still write no audit_event row; Lead 70's ruling on #1999 (QA-499) requires one. Question for the tech lead on #2752. |
| R1.13, R1.24, R1.5 cloud halves | **no Works** | Synth only; P-780 (1): AWS-proof lines count only after the founder's AWS proof runs. R1.13 also needs PF-23m. R1.5's on-prem half is another lane's (#2762, duplicate check Q3). |
| R1.90 | **parts missing** | PF-5 part 2 (#1959) open; PF-5s and PF-16 have no PR (PF-16 starts after #1959). |

## R1.4 pre-run on #2752's head 4f7009ead (not a proof: P-339 needs main's head on GitHub)
* `check_pf12b_doors.ts` 31/31 · `check_pf12b_bypass_audit.ts` 56/56 · `check_pf12_walls.ts` 100/100 (`2026-11-21-r14-ready/check_*-pr2752-a.txt`).
* Gate A by API (P-616; no screen), `tests/qa/check_r14_walls_gate_a.ts` on isolated copy :4477: 16/17 twice before qa's check update (step 6 expected sign-in to be a bypass use, which #2752 removes on purpose); **17/17 twice** after it (`gate-a-pr2752-{1..4}.txt`). Step 6 now asserts sign-ins and staff routes make 0 bypass uses and 0 bypass audit lines. The walk ends at R1.5's first step (/me answers each person's own firm).
* Requirement slice (P-604): `trace-requirements.py --brief PF-12b2` → AG-1-1@ca84eb07, AG-1-3@95ab42da, AG-1-45@a4057ff0, P-780.

## Next
When #2752 merges: rerun the pack on main's head on GitHub (CI run id), run gate A twice, get a fresh Opus reader, then open one records PR for R1.4. QA-499's four `none` uses decide whether that is Works or Partial.
