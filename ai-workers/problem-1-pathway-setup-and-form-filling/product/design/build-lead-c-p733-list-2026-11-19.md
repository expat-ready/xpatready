# Build Lead C (2): items nearest to done under P-733 (19 Nov ~12:35 IST; updated 12:5x IST)
Accepted by Lead 91 as ordered (12:4x IST). P-734: this file feeds the focus-list guard (ENF-733) to the evening of 22 Nov; keep it current.
Case side, audit and client money. Brief paths are under product/design/build-lead-c-briefs/ on claude/build-lead-c-647b40. "In flight" PRs are already built; the part counted is what is left after them.

## Nothing left after an in-flight PR
1. R1.80 IRCC forms per applicant: #2235 MERGED 18:06 IST; proof due. Proof is automatic at its merge; qa walks it (IRCC forms). No lane.

## One part left
2. R1.77 decide, withdraw, close, reopen: #2169 MERGED 15:20 IST; J-77 is #2263 (6ef02a932, queued) → J-77 (`J-77.md`, branch claude/j77-journey c81ed249d). Clash: none. Line, after #2169 merges: "Read J-77.md; merge origin/main into claude/j77-journey; diff-only Approve; open the PR as non-draft."
3. R1.74 deadlines: #2000 (bd19821aa, migration 20261119071700, queued) → CS-DL1b with J-74 (`CS-DL1b.md`). Clash: one add-only line in ports/notifications.ts, shared with CS-NT1. Line, after #2000 merges: "Build CS-DL1b with J-74 inside, from CS-DL1b.md, branched from main."
4. R1.67 file-type check: **CS-D1t with J-67** (`CS-D1t.md`; shaping in `CS-D1-shaping.md`): the two case upload doors call PF-F4's checkFile; ~300 lines, no schema, no trigger. PR #2253 (3a2b58918, queued). Clash: none in flight. Line: "Build CS-D1t with J-67 inside, from CS-D1t.md, branched from main."

## Two parts left
5. R1.8 audit trail: #2214 (7b68d9cdc, queued) → AUD-1m 2a → 2b with J-8 and PF-0a (`AUD-1m-2.md`). Clash: 2a touches person-link.ts, case-prepare.ts and document-*.ts (CS-V1 PR 3 and CS-D1 too); 2b touches platform/settings.ts (PF-19b part 3, Lead B). Line, after #2214 merges: "Build AUD-1m part 2a, then 2b with J-8 inside, from AUD-1m-2.md, back to back in one lane."
6. R1.72 case with applicants: FO-8 = PR #2255 (0f1a6ad1a, queued) → CS-K1 part 2 with J-72 (`CS-K1-2.md`). Clash: runtime.ts and cases.prisma plus a migration (CS-NT1 also wants cases.prisma). One lane runs FO-8 then CS-K1 part 2, after the one-part items have lanes.
7. R1.10 input checks: CS-V1 PR 3 (person-link.ts, runtime.ts, case-prepare.ts, sign-steps.ts; NO brief; waits on CS-D1b) + PF-28 (Lead B). Clash: AUD-1m 2a (person-link.ts, case-prepare.ts). After AUD-1m 2a.

## Three or more left, or waiting on others (no lane under P-733 until the above have one)
* R1.59 money arithmetic: #2204 (your money read) → FO-7ts part 3 → FO-7b → FO-7g with J-59 (`FO-7ts-3.md`, `FO-7b.md`, `FO-7g.md`). 3 parts after #2204; FO-7g needs a cited tax table.
* R1.105 keep periods: #2197 merged; AUD-2 (mine, S3 Object Lock, STANDARDS §1) + Lead B's PF-5 close and PF-11c, then J-105.
* R1.3 firm walls: CS-W2, CS-W3, CS-W4 (one PR per area file).
* R1.102 find a person or case: CS-S1 part 2 after Lead B's PF-30a and PF-30s.
* R1.56, R1.58 (money), R1.106 (assessment AS-1g/s/c), R1.98 (FO-8 + LMIA), R1.76 notes (Not built: CS-NT1 parts 1-4, `CS-NT1-1.md`).

## Recommended post-drain order (replaces CS-DL1b, AUD-1m, CS-NT1)
J-77 (on #2169's merge) → CS-DL1b (on #2000's merge) → CS-D1t (any time) → AUD-1m 2a then 2b (on #2214's merge) → FO-8 then CS-K1 part 2 → CS-V1 PR 3 (after 2a). R1.65 (CS-D1 parts 1-2) after these. CS-NT1 drops below them (R1.76 has 4 parts). R1.59 stays behind these; no second money lane (Lead 91, 12:4x IST).
