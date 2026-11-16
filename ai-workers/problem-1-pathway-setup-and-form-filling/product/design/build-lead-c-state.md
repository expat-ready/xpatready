# Build Lead C: state (P-644; case side, money-and-audit, forms, release, CS-*, BK-*, AUD-*, AS-*, J-* and evidence rows)

updated: 16 Nov 2026 21:0x IST by Build Lead C (local_d5287293, Opus 5.5 medium; branch `claude/build-lead-c-647b40`). Reports to the current Lead (`tools/current-lead.sh`): **Lead 70, local_9ae95739** since 21:52 IST 16 Nov (took over from Lead 69, local_28bf6046; seven start lines were queued with Lead 69: CS-C1b, CS-DL1 part 1, CS-V1 part 1, AUD-1a, FO-7s0 (lane 13), AUD-5 part 1 (lane 14), CS-SD1).

**Sources read:** RULES.md as of P-644 and MVP-CHECKLIST.md on `origin/lead/2026-11-07-lead31`; `qa/CAPABILITIES.md` R1 table on `main` d66bcfd2d; merged and open PRs from the GitHub API (21:0x IST); the case-side shaping lane's draft briefs `design/briefs/*.md` on `main` (#1867-#1877, #1882, #1883, #1886).

**Split rule used:** a row is in my group when it has a non-PF/FO part; I own those parts only. PF-* and FO-* parts are Lead B's (P-558), **except client money**: FO-7 (all but FO-7a2 #1991, which Lead B keeps until it merges) is mine (Lead 69, 21:1x IST 16 Nov). PF-F file parts stay Lead B's. Mixed rows are finished only when Lead B's parts merge too.

**Today's target (P-644):** at least 5 of my group's rows fully built a day.

## 1. My group's unproven rows, fewest of my parts left first
PRs = pull requests per the drafts (P-610). "Ready" = every wait in the draft is on `main` now.

| R1 row | Capability | My parts left (PRs) | Lead B parts left | Ready now | Waits on |
|---|---|---|---|---|---|
| R1.80 | IRCC forms per applicant | 0 (BK-10, BK-16, BK-22..24 merged) | — | — | qa (Prove Lead) only |
| R1.77 | Submission number, UCI; decide, close, reopen | **CS-C1b (1)**; QA-397 fix (C8.2, Major, not shaped) | — | CS-C1b | QA-397 to shape (me) |
| R1.74 | Deadlines that remind; working days | **CS-DL1a, CS-DL1b (2)** | — | CS-DL1a | b after a |
| R1.68 | Preview for staff review | CS-D5 (2) | — | no | CS-D1 parts 1-2 (which wait on PF-F rail) |
| R1.10 | Checking every input | **CS-V1 PR 1, 2, 3a, 3b (4)** | PF-28 | PR 1 | PR 3a/3b: Bake tag (P-499), CS-D1b, CS-K1, CS-NT1 p1, CS-W1 |
| R1.70 | Expiry, translation, notarisation flags | CS-D7c (1), CS-D7 (2) | — | no | Bake tag, `library.prisma` baton, two Lead answers |
| R1.69 | Read log, fingerprint, keep period | CS-D6 (3) | — | no | CS-D1, CS-D5, AUD-5 |
| R1.72 | Case with applicants, representative | CS-K1 (2) | FO-8 | no | CS-C1b (createCase series); part 2: FoPersonPort |
| R1.102 | Find a person or case | CS-S1 (2) | PF-30a, PF-30s | **part 1** | part 2: PF-30a, CS-K1, CS-K3 |
| R1.79 | Dashboards and reports | CS-R1 (2) | PF-R1, R2fo, R2cm, R3 | no | PF-R1 `MetricRegistry` |
| R1.88 | Firm reads its own audit log | AUD-4 (1), AUD-4s (concept + build) | — (PF-6 p1 merged) | AUD-4s concept | AUD-1a, AUD-1b; AUD-1c p2 |
| R1.105 | Keep periods; leaving firm closed | AUD-5 (2) | PF-11c, PF-5 | **part 1** (`AUD-5-1.md`) | part 2: PF-21b |
| R1.76 | Notes; one timeline | **CS-NT1 (4)** | FO-2 rest | p1 after CS-C1b leaves `runtime.ts` | — |
| R1.8 | Audit trail nobody can edit | **AUD-1a (1), AUD-1b (1), AUD-1m (3)** | — | AUD-1a | series |
| R1.34 | One person's export | CS-X1 (3) | PF-26, PF-26s | no | PF-26 port |
| R1.64 / R1.67 | Resumable upload / file-type check | CS-D1 (3) | PF-F2 / PF-F4 | no | PF-F rail |
| R1.97 | Tamper-evident chain | AUD-1c (2), AUD-2 (2), AUD-2c (2) | — | no | AUD-1a; AUD-2c: AWS (PF-8a/8b/8c) |
| R1.87 | Our access logged and shown | AUD-3 (3), AUD-3b (3) | PF-4s | no | PF-4s, AUD-1b, AUD-1m p1 |
| R1.75 | Tasks, Unassigned, handover | CS-T1 (5) | PF-29a..f | no | CS-K3, PF-29a |
| R1.3 | Walls between firms (case tables) | CS-W1 (2), CS-W2 (many), CS-W3 (spike + parts), CS-W4 (2) | (PF-12 merged) | CS-W3 part 0 spike | CS-W1: CS-K1 + `cases.prisma` holder |
| R1.106 | Assessment AS-1 | CS-106c (2); AS-1m, AS-1g, AS-1s, AS-1c (no briefs yet) | FO-15a, b, s | no | AS-1 briefs to write (me); FO-8 |
| R1.107 | Assessment AS-2 | AS-2c, AS-2cs, AS-2e, AS-2d1, AS-2d2 (no briefs) | — | no | founder card on streams (P-607 (9)) |
| R1.98 | Corporate clients, LMIA | CS-98r (2), 98a, 98b (2), 98c (2), 98d, 98e, 98s1 (concept + 2), 98s2 (2), 98s3 (proposed) | FO-2b, FO-8 | CS-98s1 concept | P-607 (5): last; CS-98r step 0 on the Mac |

**Client money (mine since 21:1x IST):** merged FO-7a #1758, FO-7mv #1924; FO-7a2 #1991 open (Lead B). One chain on `client-money.prisma`: FO-7ts p1 → p2 → p3 → FO-7b → FO-7c ∥ FO-7t (3) → FO-7v, FO-7m, FO-7p, FO-7g (2), FO-7r (3), FO-7q; screens FO-7s0 (concept, **ready now**) → FO-7s1, s2, s3a, s3b, s4, s5. No lane touches `money_move_line_write`, `money_trust_entry_moves`, `money_to_move`, `money_move_batch`, `money_trust_entry_write`, `money_credit_note_write` until #1991 merges.

| R1 row | Capability | My parts left | Ready now |
|---|---|---|---|
| R1.59 | Money arithmetic | FO-7b (tax per line) | no (after FO-7ts p1-2) |
| R1.60 | Deposit invoice on signature | FO-7b | no |
| R1.56 | Invoices, tax, government fee | FO-7b, FO-7g, FO-7q, FO-7s0, FO-7s1 | FO-7s0 |
| R1.57 | Card payment into operating | FO-7c, FO-7s2 | no (FO-7c also needs PF-5's Stripe hook) |
| R1.58 | Trust or operating; ledger; to move | FO-7ts (3), FO-7t (3), FO-7s3a, FO-7s3b, FO-7m | FO-7ts p1 after #1991 |
| R1.96 | Reversals, refunds, credit notes, plans | FO-7p, FO-7r, FO-7v, FO-7s4 | no |
| R1.111 | Statement and exports | FO-7r, FO-7s5 | no |

Rows proven or Lead-B-only are not listed. R1.77 finishes on CS-C1b + QA-397; R1.74 on CS-DL1b.

**New row CS-SD1 (16 Nov 21:5x IST, Lead 69):** main's schema drifts on 5 statements (PF-8r #2014). The schema is behind the database: the four `id` fields get `dbgenerated("gen_random_uuid()")`, because migrations insert rows without an id. `canonical_field_name` is kept as an `@@ignore` model, because it is the live guard for unique shared-field names. Its group is the configurator, so the WIP limit does not stop it.

## 2. Lanes (8 slots; two ready briefs each, P-599)
**Night queue (P-645, Lead 70's `design/night-queue-2026-11-16.md`):** AUD-1b, CS-DL1 part 2, CS-V1 part 2 (the last one moved back to #2007's lane by Lead 70; its scope was ruled on #2007, comment 6923205608), plus my night lines from 22:0x IST: AUD-1c part 1, AUD-4s part 1, CS-S1 part 1 (only while the case side has fewer than 2 rows waiting for qa) and CS-W3 part 0. The running lanes do not take their follow-ons; the night queue does.
**Running (pushed, read 21:56 IST 16 Nov):** #2002 CS-C1b (`claude/runtime-csc1b`) · #2000 CS-DL1 part 1 (`claude/runtime-csdl1a`) · #2007 CS-V1 part 1 (`claude/runtime-csv1-check`) · #2003 AUD-1a (`claude/upbeat-planck-5h4zoh`; its title says "AUD-1a part 1", which is wrong because AUD-1a is a whole id) · #2008 AUD-5 part 1 (`claude/upbeat-bardeen-k2tdqn`). Not yet pushed: FO-7s0, CS-SD1.

| Lane | Now | Next | Status |
|---|---|---|---|
| C1 | `build-lead-c-briefs/CS-C1b.md` | `CS-NT1-1.md` (after CS-C1b leaves `runtime.ts`) | start asked 21:0x IST |
| C2 | `CS-DL1a.md` | `CS-DL1b.md` | start asked 21:0x IST |
| C3 | `CS-V1-1.md` | `CS-V1-2.md` | start asked 21:0x IST |
| C4 | `AUD-1a.md` | `AUD-1b.md` | start asked 21:0x IST |
| C5 | `FO-7s0.md` (concept, now) | `FO-7ts-1.md` (after #1991) | start asked 21:1x IST |
| C6 | `AUD-5-1.md` (now) | — | start asked 21:2x IST |
| C7 | `CS-SD1.md` (schema drift, now; Lead reads the diff) | — | start asked 21:5x IST |
| C8 | to fill: CS-S1 part 1, CS-W3 part 0 spike, AUD-4s concept, CS-98s1 concept (briefs next) | | |

**Holders (P-438b, P-526b):** C1 holds `api/src/runtime.ts` `createCase`; C4 holds `governance.prisma` / new `audit.prisma`; C2 touches Lead B's `leads.ts`/`open-minutes.ts` import lines only. Nobody in my group holds `prisma/schema/cases.prisma` or `api/src/case-prepare.ts` now.

## 3. To do next (me)
1. Briefs for lanes C5-C8 (CS-S1 part 1, CS-W3 part 0, AUD-4s concept, CS-98s1 concept).
2. Shape QA-397 (R1.77's other half) as a brief.
3. AS-1 parts (AS-1m, AS-1g, AS-1s, AS-1c): briefs from BACKLOG, values from canada.ca (page, quote, date).
4. Done 21:2x IST: the College citation (Client File Management Regulation 2021-001 s. 7.2, page 7, read 16 Nov 2026) is in `build-lead-c-briefs/AUD-5-1.md`; AUD-5 part 1 is ready now.
5. Each check: read my lanes' PRs and pushes; a lane counts only after a push (P-326); answer "Question for the tech lead" comments within 30 min.

**WIP (P-623, Lead 69's reading 21:1x IST): when 2 capabilities of one module group wait for qa, that group starts no new build row.** Per group now:
* **Case side:** 1 waiting (R1.80). It reaches **2 when CS-C1b merges (R1.77)**. From then until qa clears one, start no new case-side row (CS-NT1, CS-S1, CS-K1, CS-T1, CS-W*, CS-D*, CS-X1, CS-R1, CS-98*). Parts of rows already started (CS-DL1 part 2, CS-V1 part 2) carry on, and stopped lanes fix case-side qa bugs first.
* **Audit:** 0 waiting (AUD-1a, AUD-1b, AUD-5 part 1 free to start).
* **Client money:** 0 waiting (FO-7s0 free; FO-7ts part 1 after #1991).
* **Configurator / assessments (AS-*):** 0 waiting.
