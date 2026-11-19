# Build Lead C hand-over, 19 Nov 2026 11:4x IST

Written by Build Lead C (session local_d5287293, branch `claude/build-lead-c-647b40`) at Lead 87's request, because an account switch is near (plan at 96%). The next Build Lead C, or the current Lead, resumes from here, with `build-lead-c-state.md` next to this file as the dated log. Times are IST.

## Rules in force
* **P-719:** finish by capability; one lane owns an item's whole chain.
* **P-721:** protect the merge path. A dequeued PR merges main again within 30 minutes.
* **P-722:** proof per item.
* **P-723:** the drain runs to about 13:30 IST.
* **P-724 / P-726:** my track is J1 (R1.80), then J7, then J8, then J9.
* **P-728:** an item's J-test merges in the same PR as its last part. J-77 stays separate.
* **P-701:** GST/HST only.
* **P-711 / P-720:** size exceptions for #2169 and #2204.
* **P-703:** report in product terms.

Cloud lanes don't wake on messages: the Lead types into idle ones. `gh` doesn't work from this sandbox; use `git ls-remote` and curl on github.com.

## Items and lanes

| Item | State now | Next step | Lane (session) | PR / branch |
|---|---|---|---|---|
| **R1.80** IRCC forms per applicant (J1) | **The Adobe Validate run is done (19 Nov ~11:29).** Validate passed on the first press; 5/5 barcodes; 186/186 agree; read back 75/75; certification intact. | 1. Evidence PR: copy the JSON over `prototype/studio/evidence/c7-2-adobe-validate/result.json`, with "Completes: R1.80" in the body. Asked of the "AUD-5 part 2" lane 11:3x; check it opened. 2. The next Lead labels it. 3. qa closes QA-165 and re-scores R1.80. 4. The founder spot-checks one form. | "AUD-5 part 2 · R1.105 file retention check" (cloud) | evidence branch, not yet seen |
| **R1.77** decide, withdraw, close, reopen | #2169 (CS-C1s part 2) failed batch #2221: `check_bk2_fold_outs.ts` at `case-decision.tsx:179`. Fix sent; new head c49ba82c1. | Check c49ba82c1 has a matching "Reviewer: Approve"; then the Lead relabels. When #2169 merges, J-77 merges main, takes a diff-only Approve, and opens as non-draft (Lead 87's yes under P-722). | "CS-C1s part 2 · case outcome screen build" (cloud) | #2169 c49ba82c1; J-77 `claude/j77-journey` c81ed249d (Approve not yet seen) |
| **R1.74** deadlines | #2000 (CS-DL1 part 1) is labelled at 093d9829b and in the queue. | After the drain and #2000's merge: CS-DL1b with J-74 inside the same PR (P-728), from `build-lead-c-briefs/CS-DL1b.md`. The Lead types it. | "CS-DL1 part 1 · R1.74 (Build Lead C)" (cloud) | #2000 093d9829b |
| **R1.8** audit trail | #2214 (AUD-1m part 1), head ee835cc53. It needs the module-card fix (5 modules: card lines or `Card unchanged: <reason>`) and a diff-only Approve, then the Lead labels. AUD-1b #2124 is merged. | After the drain: AUD-1m parts 2a and 2b, then J-8 inside the last part's PR. No brief yet for 2a and 2b: use BACKLOG `AUD-1m` "the 20 files". | "AUD-1m part 1 · audit (after #2124's main merge)" (cloud) | #2214 ee835cc53 |
| **R1.59** invoices, money | #2204 (FO-7ts part 2) has an Approve and the breaker's pass on 7ea0132d9; P-720 size exception. It waits for #2219 (DECISIONS to P-720) to merge, then the Lead labels. | **Paused (P-721 proof sprint):** no FO-7ts part 3 until told. Then FO-7ts part 3 → FO-7b → FO-7g → J-59 (inside FO-7g's PR, P-728). | "Money · FO-7lk then FO-7ts part 2 (overlap on #2106)", session_018BSQJqfvWxXK1qEMwL7ewL (cloud) | #2204 7ea0132d9 |
| **R1.72** case with applicants | #2167 (CS-K1 part 1) merged. | CS-K1 part 2 (`build-lead-c-briefs/CS-K1-2.md`, with J-72 inside under P-728) **only once FO-8 exists**. Lead B says FO-8 is the case side's (the release Lead's), not built, no brief. Queued. | "CS-K1 part 1 · client record (overlap on #2125)" (parked) | — |
| **R1.76** notes | Lead B's FO-2 note routes are #2181, expected to merge today. | CS-NT1 part 1 (`CS-NT1-1.md`), in series with CS-K1 part 2 on `runtime.ts`, after the drain. Needs a new lane. | none yet | — |
| **R1.102** find a person or case | Queued until PF-30a is on main. | CS-S1 part 2. | — | — |
| **R1.105** keep periods | #2197 (AUD-5 part 2) labelled at be65d001d. #2194 is superseded, left open with no label. | It waits on Lead B's PF-11 and PF-11c (2-3 days). J-105 after them. The lane parks after #2197 merges. | "AUD-5 part 2 · R1.105 file retention check"; "AUD-5 part 1 · R1.105 file retention (Build Lead C)" (park) | #2197 be65d001d; #2194 3518f667f |
| R1.48 | Moved to Lead B (P-719): the PF-19b part 3 lane runs `J-48.md`. | — | Lead B | — |

**Parked lanes:** "CS-K1 part 1", "CS-W1" (after CS-W3 part 0), "#2129 AUD-1c part 1", "AUD-5 part 1", "CS-V1 PR 2" (a duplicate of #2042, merged; told to stop).

## R1.80 evidence paths
* **Evidence JSON:** `product/design/build-lead-c-evidence/c7-2-adobe-validate-result-2026-11-19.json` on `claude/build-lead-c-647b40`, commit 9b1c1ce50.
* **Validated PDF** (not committed): `/private/tmp/claude-501/r180/out/imm5257-paper-imm5257-paper-child18-validated-copy.pdf`, sha256 d0a2e9446231c0144629aa27cb0df1d57a3e5eb7467535919b8dfbea94732b3b. The copy it was made from is `/private/tmp/claude-501/r180/out/imm5257-paper-child18-copy.pdf`, sha256 ca33c678….
* **Screenshots** (not committed): `~/Library/Application Support/Claude/side-session-notes/local_28bf6046-9c98-4f67-8b04-7f1801873579/r180-adobe-2026-11-19/`, four JPGs: opened and certified, Validate message, barcode page, after save.
* **Isolated copy:** main 4aa912c92 in `/private/tmp/claude-501/r180`, port 4461, database `xr_studio_r180`. It stays up for the founder's spot-check until about 11:55 IST, then I stop it. If it is still up, drop the database with `dropdb -h 127.0.0.1 -p 54329 -U xr_studio --force xr_studio_r180`.
* **How it was run, for the next time:**
  * `git archive origin/main` of the problem-1 tree into a scratch folder.
  * `npm ci --ignore-scripts` (the main checkout's node_modules lacks `pg-boss`), and Prisma generate with `XDG_CACHE_HOME` in the scratch folder.
  * The server started with `node --import tsx`, because the sandbox blocks tsx's IPC pipe. `STUDIO_VAR` must be the `/private/tmp/...` real path, or file checks fail.
  * Finished story: `POST /api/demo/checkpoints/finished-story {"confirm":"RESET"}` as user-A.
  * Upload: `POST /api/runtime/form-copies/<id>/validated` as user-O.

## Briefs ready (in `build-lead-c-briefs/`)
* J-77
* CS-DL1b, with J-74 inside
* CS-K1-2, with J-72 inside
* AUD-1m (part 1, now PR #2214)
* FO-7ts-3, FO-7b, FO-7g
* CS-NT1-1
* AUD-5-2 (built as #2197)
* J-48 (now Lead B's)

## Not written yet
* AUD-1m 2a/2b brief
* J-8, J-59 (inside their last parts)
* J-105

## Watches I had running
Merge watch for #2000, #2169, #2197 and #2204, and the 20-minute :4461 stop timer. Both end with this session; nothing else is running.
