# CS-V1 part 2 review: PR #2042 (first pass at 52e39187, re-review at 3b08d781)

The reviewer, in a fresh context (did not build it), on 16 Nov. Branch `claude/runtime-csv1-schemas`, diffed against origin/main (merge base bfac889d). This is an API input-check row with no screen, so D1-D20 and the BIC table are N/A. It was reviewed against Build Lead C's ruling (#2007, comment 6923205608), STANDARDS §6 and the PR body. Journey test: `journey-test-reviewer-part2-2026-11-16.md`, **9.5 / 10, pass**.

## What I verified (not trusted)
* **The check:** `check_csv1_inputs.ts 4494 xr_studio_rev_csv1b` gives 61 passed, 0 failed, exit 0.
* **DW2:** main's ALLOW held 20 entries. The PR removes the 15 the ruling names for readiness, form-additions, case-documents, case-close, assessments and fill-case, and leaves exactly the 5 for parts 3a/3b. The ruling says "16", but it lists "the 4 query entries" and names only 3, so 15 is the full set.
* **Touched suites, unchanged, on my copy:**
  * `check_csc1_close.ts` 55/0
  * `check_c76_readiness_api.ts` 34/34
  * `check_c65_documents_api.ts` 74/74
  * `runtime/check_c78_added_forms.ts` 20/20
  * `C7.2.test.ts` 11/11 (downloads `?original=1`)
  * `check_c69_runs.ts` 94/0
  * Browser suites: `check_c76_ready_browser.ts` 53/53, `C6.5-screen.test.ts` 33/33, `check_c69_page_browser.cjs` 54/54
  * `acceptance/C7.8.test.ts` gives 14/20 here. **origin/main's code on a second copy gives the identical 14/20, with the same six failures**: the library lacks a barcode-blank form and a third blank pick, and the setup step "PUT /api/library/fees" is missing on both. That is the environment, not this PR. The PR body reports only `runtime/check_c78_added_forms.ts` for "the C7.8 suites"; the acceptance pack should be named with its baseline.
* **Case-close: "its words and checks exactly".** I ran a differential test: CS-C1a's `reasonOf`, `dateOf` and decide checks copied verbatim from origin/main, against the new schemas plus `parsed()`, over 167,128 bodies (types, blanks, zero-width characters, NUL and control characters, the 1000/1001 and 2000 limits, emoji, impossible dates, keys, non-object bodies). **0 differ** in status, title, code, field, words or value. The invisible-character class is byte-identical (U+200B-U+200D, U+2060, U+FEFF). The only differences are the declared ones: unknown fields, the decide order, and a filingId over 200 characters (404 before, now 400 INVALID).
* **Callers:** no screen or suite sends a field the schemas refuse. Checked:
  * Screens: readiness.tsx:232/280, add-form.tsx:51/111/125/170, documents-drawer.tsx:47/77, eligibility.tsx:94, forms.tsx:260. `lib/api.ts` adds no query parameter.
  * The API's own finished-story.ts:273/275.
  * Every body and query the tests/ and acceptance/ suites send to these routes (keys tallied, plus the `add()` helper in C7.8).
* **Break-it on the PR copy:**
  * About 40 requests, with row counts taken before and after each: 4.9 MB strings on every body field (the body limit is 5 MB), 10 KB queries, NUL in bodies and queries, arrays for every scalar query, `x[a]=1` queries, unknown fields, array bodies, and null for every optional add field (still 201).
  * Every refusal is a 400 naming its field and stores nothing. No 500.
  * 403 and 404 still come first on review, pass, remove, proposals, checks and assessments.
  * Removal reasons over 500 characters are still cut to 500.
* **CI:** `module-cards` and `pr-rules` pass at this commit. `ci` is *skipped* on the PR at this commit, so I could not confirm the body's "full ci is green".

## Blockers
None.

## Majors
* **M1. Two schemas answer an over-long value in zod's default English, and `?original=` does not name its field.** The ruling's rule is "400 Problem Details naming the field in plain words".
  * `CopyFileOriginal` (contracts/runtime.ts:495), read by fill-case.ts:272-273 through `problemFromZod` on a bare scalar:
    * `?original=12345678901` answers `errors[0].field: "body"`, "Too big: expected string to have <=10 characters".
    * `?original=1&original=1` also names `body`.
  * `FormAdditionBody.signature` (runtime.ts:484) uses `z.string().max(40)` with no words. `signature` of 41 characters to 4.9 MB answers "Too big: expected string to have <=40 characters". The field is named, but the words are zod's.
  * DW4 encodes the wrong field (`check_csv1_inputs.ts:202` expects `field: "body"`) and has no over-long or wrong-type case for fill-case.
  * **Fix:**
    * Give both caps words, e.g. `.max(10, "Give original once (original=1).")` and `.max(40, "signature is NONE (no signature) or left out.")`.
    * Name `original` as the field: map the issue path, or answer like assessments.ts:96 (`fieldError("original", …)`).
    * Make DW4 expect `original` and add the over-long `signature` case.

## Minors
* **m1. The body's claim "403 and 404 still come before 400" does not hold for both addable GETs** (form-additions.ts:317 and :328 parse before `this.filing()`):
  * A client asking `addable-forms?q=a&q=b` gets 400, not 403.
  * An unknown filing gets 400, not 404.
  * Only refused requests change and nothing leaks. Move the parses after `this.filing()`, or correct the body.
  * (`add` refused a missing form before the filing lookup on main too.)
* **m2. Raw-length caps vs trimmed route checks.**
  * `FilingReviewBody.note` caps raw length at 4000 and `WarningPassBody.reason` at 3000, but the routes trim before their own 400/300 checks.
  * So a short note padded past 4000 characters with spaces was accepted before and is now refused.
  * No screen can send that. If kept, record it in the PR body as the one accepted input now refused.
* **m3. The decide order change also covers replays.** Same key with a bad outcome was 409 IDEMPOTENCY_KEY_REUSED and is now 400. Same key with an extra field was a 200 replay and is now 400. Both are refused or unknown-field inputs, so this is acceptable, but the body names only the closed-case case.
* **m4. Weak DW4 passes.**
  * Review's "pass" is a 409 (stale facts_hash) and fill-case's is a 404 (no such copy): they prove only that the schema let the request through.
  * Real successes are covered by `check_c76_readiness_api.ts` and `C7.2.test.ts` (both pass), so this is a note.
* **m5. Pre-existing, not introduced.**
  * A NUL byte in a form-addition `reason` or `signature_reason`, or in a removal `reason`, passes the new schemas and reaches Postgres. main.ts:213 maps it to 404 "Not found (it may have been removed by a reset)". Nothing is stored.
  * NUL is outside the ruling's four refusal kinds. It is worth a bug row, not this PR.
* **m6. The filingId cap.** A filingId over 200 characters now answers 400 INVALID with the 404's words, "No such filing on this case in your firm.". It is over-long, so the 400 is allowed; the words are odd.

## Could not check
* Case-close over HTTP: it needs PF-4's staff sign-in. It is covered in-process (55/0) and by the differential test.
* A real screen reader, or an intended user's unaided walk (D17/D20).
* `ci` at this commit (skipped).

First-pass verdict at 52e39187: Changes requested (M1).

## Re-review: 52e39187..3b08d781 (P-277), 16 Nov
The diff covers fill-case.ts, form-additions.ts, contracts/runtime.ts and check_csv1_inputs.ts, plus these two reports committed as they stood. I re-ran everything on a fresh copy on :4494, now stopped.

**Results**
* `check_csv1_inputs.ts`: **64 passed, 0 failed**, exit 0.
* `check_csc1_close.ts` 55/0, `check_c76_readiness_api.ts` 34/34, `runtime/check_c78_added_forms.ts` 20/20.
* `acceptance/C7.8.test.ts` 15/20. Its five failures are among the six that also fail on origin/main's baseline copy, and C7.8-16 now passes. No new failure.
* The break-it probe, re-run: about 40 requests, nothing stored on any refusal, no 500.

**Each finding**
* **M1 closed.**
  * `?original=` over 10 characters, and given twice, answers 400 `errors[].field: "original"` with "Give original once (original=1)." (fill-case.ts:579 renames the field; runtime.ts `CopyFileOriginal` gives the cap words).
  * `signature` of 41 characters or 4.9 MB answers "signature is NONE (no signature) or left out." on `signature`.
  * DW4 now expects `original`, and adds an oversized `original` and an oversized `signature`. Both fail and pass as named.
* **m1 closed.** Both addable GETs look up the filing first (form-additions.ts:134, :170). Over HTTP, a client with `?q=a&q=b` gets 403, and an unknown filing gets 404 "No such filing." before the query is read. (`add` still refuses a body before the filing lookup, as it did on main.)
* **m2 closed.** `upToTrimmed` caps the review note and the pass reason as the routes read them. A new DW4 pass covers padded text, and 4.9 MB values still answer 400 with the routes' words.
* **m6 closed.** An over-long filingId says "filingId: at most 200 characters."
* **m3, m4, m5 and the 15-vs-16 count:** these go to the PR body. m5 (a NUL byte answering 404 via main.ts:213) is a main bug for its own row. None needs code here.

No Blocker, Major or minor is open in code. Not checked, as before: case-close over HTTP (it needs PF-4's staff sign-in), a real screen reader, and `ci` at this commit.

Verdict: Approve 3b08d781a79a2bc3d60cd3680d2c651087b5bfe3
