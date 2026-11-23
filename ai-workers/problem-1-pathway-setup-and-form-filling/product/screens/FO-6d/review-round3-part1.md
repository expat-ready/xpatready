# FO-6d part 1, review round 3 (PR #3207, diff only)

* **Scope:** the tech lead allowed only the fix for round 2's Major, `git diff 8162df596 639e2514f`.
  * Fix commit: 9691d5539.
  * 639e2514f changes only `pr-body.md`.
* **Head reviewed:** 639e2514fd530ab7c42a83cf3ca41b1926e599e7 on `claude/nice-curie-tzbprl`.
* **Round 2 reports:** `review-round2-part1.md` and `break-round2-part1.md`.
* **What changed:** 6 files, +30/-10:
  * `signing/service.ts`
  * `signing/handlers.ts`
  * `any-document/service.ts`
  * `any-document/routes.ts`
  * `tests/check_fo6d_any_document.ts`
  * `pr-body.md`

## What I ran

| Run | Result |
|---|---|
| `npx tsx --tsconfig api/tsconfig.json tests/check_fo6d_any_document.ts` | **26 passed, 0 failed** |
| `tests/check_fo6_signing_api.ts` (RETAINER webhook path; CONSULTATION handler at :262) | **51 passed, 0 failed** |
| `tests/check_fo3c_consultation_agreement.ts` (CONSULTATION's registered handler) | **42 passed, 0 failed** |
| Mutation test. I built a copy of the head from `git archive` in the scratchpad (the branch was not touched) and put back the old condition `found.documentKind === "CONSULTATION"` in `signing/service.ts`. Then I ran the FO-6d suite on that copy. | **25 passed, 1 failed.** The failing check was the new "with no OTHER handler registered…" check, which got `{"received":true,"applied":true}`. The new test does fail on the round 2 defect. |
| `isGovernmentForm(bytes, "letter.pdf")` on every committed PDF in `official-sources/ircc/forms` (22 files) and `previous-editions` (2 files) | **24 of 24 caught.** `imm5782e` has no `/UR3` and is caught by `/NeedsRendering`. `imm5476e-2021` (no `/Encrypt`) is caught by `/AcroForm` + `/UR3`. |
| Inflate budget: 400 FlateDecode streams, each 64 MB of zeros (a 26 MB file) | `false`, **81 ms**. The budget stops it after 6 streams. |
| Inflate budget: 400 whole streams, each about 4 MB inflated (a 1.6 MB file) | `false`, **26 ms**. |
| Inflate budget: 400 **truncated** streams, each about 4 MB inflated (zlib data with its last 8 bytes cut; a 1.6 MB file) | `false`, **605 ms**. All 400 streams are inflated: about 1.6 GB of synchronous work, and none of it is counted (Minor 1 below). |
| Title rule, the exact regex from `routes.ts:20`, against 24 code points | Refused: NUL, TAB, LF, DEL, U+0085, U+009F, U+202A/C/E, U+2066/2069, U+2028/2029, U+200B, U+2060, U+FEFF, U+00AD, U+200E/200F, U+061C, U+E0041. Accepted: ZWNJ (Persian), ZWJ (Devanagari), and an emoji ZWJ sequence inside a lettered title. |
| `tsc --noEmit -p api/tsconfig.json` | No error in any changed file. The errors it does report are older ones in other suites. |

## Round 2's findings: fixed?

* **Major 1 (an OTHER request's webhook took the retainer path): fixed.**
  * `service.ts:129`: every kind except RETAINER now goes to `signingHandlerFor(found.documentKind)`.
  * `OtherKind` is now `"CONSULTATION" | "OTHER"`, and it matches the Prisma enum `FoSigningDocumentKind` (RETAINER, CONSULTATION, OTHER).
  * With no handler registered, the receipt is stored once in its own transaction, and the answer is `applied: false, reason: "no handler"`.
  * RETAINER still goes to `applyRetainer` (FO-6 suite 51/51).
  * CONSULTATION uses the same lookup as before (FO-6 :262 and FO-3c 42/42).
  * Nothing in part 1 registers an OTHER handler, so until part 2 merges, the "no handler" answer is what really runs.
  * The new check covers all of the following, and the mutation test above shows it fails on the old code:
    * one receipt
    * no `viewed_at`
    * status still SENT
    * no `signing.viewed` audit line
* **Minor 1 (certified DocMDP PDFs refused as government forms): fixed.**
  * The signal is now `/AcroForm` + `/UR3`.
  * A new pass check sends an AcroForm with `/Perms /DocMDP`; it gets 201.
  * All 24 committed IRCC files are still caught.
* **Minor 2 (the inflate cap was not a true total): partly fixed.**
  * Now fixed: an inflate that hits the 4 MB per-stream cap is charged the full cap, and the total is 24 MB. The bomb that round 2 used is now bounded (81 ms).
  * Not fixed: a stream that throws for any other reason is charged 0. That includes a valid zlib start that is cut short, which throws `Z_BUF_ERROR` only after it has inflated up to 4 MB. See Minor 1 below.
* **Minor 3 (ZWNJ and ZWJ titles refused): fixed.**
  * `(?![‌‍])\p{Cf}` keeps both characters.
  * The rule still refuses: C0, C1, the bidi embeddings, overrides and isolates, U+2028/2029, U+200B, U+2060 and U+FEFF.
  * A new pass check sends a Persian title with ZWNJ; it gets 201.

## Findings

### Blocker
None.

### Major
None.

### Minor
1. **The inflate budget still does not bound truncated streams** (`any-document/service.ts:60`).
   * The catch charges the cap only for `ERR_BUFFER_TOO_LARGE`. A cut-short deflate stream throws `Z_BUF_ERROR` after it has inflated nearly 4 MB, and it is charged 0.
   * Measured: 400 such streams in a 1.6 MB upload ran **605 ms** of synchronous inflate, about 1.6 GB. The comment says "24 MB inflated in all".
   * The worst case is now bounded by the 400-stream cap at about 1.6 GB (it was 6.4 GB in round 2). The route also needs a signed-in staff member with `agent/portal:request-work`. So this is Minor, not Major.
   * Suggested fix: pass `finishFlush: constants.Z_SYNC_FLUSH` to `inflateSync`.
     * I checked it: a truncated stream then returns its partial output (4,190,180 bytes) instead of throwing.
     * That output is then counted in `out` and searched for `/XFA`.
     * Keep the cap charge for `ERR_BUFFER_TOO_LARGE`.
   * If not fixed here, record it in the PR's "Left, said" list.

### Nit
* The title rule still refuses U+200E and U+200F (LRM and RLM) and U+061C (Arabic letter mark). Mixed Persian or Arabic and Latin titles sometimes carry these marks. This is not new, and round 2 asked only for ZWNJ and ZWJ. It could go in the PR body as a known limit.
* The "Minors taken" line in `pr-body.md` does not name round 2's three Minors (`/UR3`, the budget, ZWNJ/ZWJ). Only the commit message does.

## Journey score
Not applicable. This round is diff only, the change is API only, and no screen changed. FO-6ds owns the journey and its score. I ran the suites, the mutation test, the IRCC run and the inflate and title probes above instead. I wrote no journey-test report.

Verdict: Approve
