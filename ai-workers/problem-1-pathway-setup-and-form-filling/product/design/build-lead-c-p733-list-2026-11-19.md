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

## Update 19 Nov 20:3x IST, Build Lead C (3), for P-740 (Release 1 stays 29 Nov; about 9 Proven a day)
Done since 12:5x: R1.80 (#2235, merged 18:06; qa 8 proves it) and R1.77 (#2263 J-77, merged 19:50; qa 8). #2214 (AUD-1m part 1) merged 18:15; #2289 (2a) is queued.

Lanes, in order. "Trigger" is the merge that makes the part startable. Every lane's touch list is disjoint from the others' and from in-flight PRs, except where noted.
1. **R1.67** #2253 queued: proven when it merges. Then the **same lane** goes on to CS-D1 part 1 (R1.65, `CS-D1-1.md`), because it uses the same two door files.
2. **R1.72** #2255 queued: its lane goes on to CS-K1 part 2 with J-72 (`CS-K1-2.md`).
3. **R1.74** CS-DL1b with J-74 (`CS-DL1b.md`): trigger #2000 (in batch #2292).
4. **R1.8** AUD-1m 2a (#2289) → 2b (built on `claude/zen-brown-c0s4iz-2b`) → 2c (settings, ruling (A1)), J-8 in the last; lane task_8b2e00b1.
5. **R1.10** CS-V1 part 3 (`CS-V1-3.md`; 5 methods in one PR; the case half's last part): trigger #2289. Lead to confirm the Bake's tag wait (P-499) is lifted. PF-28 is Lead B's.
6. **R1.59** FO-7ts part 3 → FO-7b → FO-7g with J-59 (one lane, the `client-money.prisma` chain): trigger #2204. FO-7g needs a cited tax table.
7. **R1.3** CS-W3 part 0 spike (`CS-W3-0.md`): records only, ready now, no product files.
8. **R1.76** CS-NT1 part 1 (`CS-NT1-1.md`, 4 parts): ready now. Its new `case-notes.prisma` is free; it shares one read hook in `runtime.ts` with #2255/CS-K1-2, and one add-only line in `ports/notifications.ts` with CS-DL1b (whichever merges second merges main).
9. **CS-NK1** #2101 (bug, Approve 5819dd091 since 17 Nov, never got the Lead's read): its migration `20261117123500` is earlier than main's newest, so it needs a merge of main, a new stamp (P-600), a diff-only Approve, then the Lead's read.
Not ready: **R1.97 / R1.105**: AUD-2 (`AUD-2.md`) waits on AUD-1c parts 1-2 (#2129 parked, P-707) and STANDARDS §1. J-105 (`J-105.md`) also waits on Lead B's PF-5 close and PF-11c. R1.102 CS-S1 part 2 waits on Lead B's PF-30a/30s. R1.88 AUD-4 (draft on main; AUD-1a/1b merged) is a candidate once the Lead approves the draft.

**20:5x IST (Lead 94):** the Bake tag (P-499) is lifted, so CS-V1-3 stands. #2101 went to fixer B. CS-D1 part 1 was typed to the CS-D1t lane. R1.105 is provable without AUD-2, so J-105 needs only Lead B's PF-5 close, PF-11c and PF-11. #2129 stays parked. **R1.88 AUD-4 then AUD-4s part 2 with J-88** (`AUD-4.md`), one lane. Lanes 1-6 start at the founder's next typed turn: CS-DL1b, the R1.59 chain and CS-V1-3 on their triggers; CS-W3-0, CS-NT1-1 and AUD-4 now. **Owed by me:** `screens/AUD-4s/concept.md`, while AUD-4 is in review.

* 21:0x IST 19 Nov: **Lead B (7) bug (PF-15c breaker, #2307 comment 7013468221):** `CaseClose.reopen` skips the plan limit and the opening lock, so a reopen can take a firm over its case limit. Shaped as bug row **CS-C1r** (`CS-C1r.md`): one `checkOpening` shared by createCase and reopen; the advisory lock before the row lock; the same EntitlementPort binding; DW1-DW4 (409 at limit, group, race, one rule); ready after #2307 and #2289 (both change case-close.ts or the binding). **Lead B's R1.72 rows:** FO-2w (Signed offline raises prospect.won) is IN R1.72's chain before proof (J-72 walks both wins; CS-K1-2 opens after FO-2w); FO-5rp and FO-2u are follow-ups after proof. CS-K1-2.md updated.
