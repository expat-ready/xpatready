# CS-V1 part 1 review: the input check over every case-side route (finder + allow-list)

Reviewer (fresh context, did not build it), 16 Nov. PR #2007, branch `claude/runtime-csv1-check`. Tests only (no screen): D1-D20 and the BIC table are N/A. Reviewed against the brief (`build-lead-c-briefs/CS-V1-1.md` on `claude/build-lead-c-647b40`, wins) and the spec (`design/briefs/CS-V1.md`, PR 1). Live AI off, US$0, copies on :4488 stopped after each run. Journey report: `journey-test-reviewer-2026-11-16.md`, **8.5/10 on the re-review** (7.5 at the first round).

## Re-review (P-277): code diff 8918577f2..1da1a0ac5, head 993c283a2
Head 993c283a2 adds only my first-round records to 1da1a0ac5 (`git diff --stat 1da1a0ac5 993c283a2`: the two `.md` files). I read only the new diff: `routes.ts` +46/-16, `check_csv1_inputs.ts` +21/-3.

**Runs on a fresh copy (`isolated.sh rev_csv1 4488`):**
* `check_csv1_inputs.ts 4488`: **24 passed, 0 failed, exit 0**, 18 s.
* 129 case-side routes (the HEAD route on `main` is now found), 88 inputs, **still 20 unparsed**, the same list. Checks 3 and 5 are green.
* DW3: 118 routes, 236 asks, 198 answered 404, **no 500**. 19 routes are refused before the id is read; the new one is `HEAD cases/:id/prepare` with 405.
* `check_forms_qa53.ts`: 42/42. It and `ts-files.ts` are unchanged.
* My own dump of the finder on `api/src`: still 68 parsed and 20 unparsed. No route moved because of the narrower `whole()`.

**M1 (partial parse or property-name match counts as "parsed"): fixed.**
* `whole()` (`routes.ts:100-106`) accepts only the value itself, or it wrapped in parentheses, `as`, `!`, `satisfies`, a type assertion, the left side of `??`/`||`, or a `{ ...x }` spread. It is used at the parse (`:135`) and at the hand-off (`:147`).
* My first-round plants now come out right:
  * `parse(S, body.x)`: unparsed;
  * `parse(S, { name: env.body })`: unparsed;
  * a one-field hand-off: unparsed;
  * `{ ...b, id }` handed on and parsed there: parsed.
* The new DW1 cases cover each of these, with a pass case that proves the planted text was really replaced.

**m1 (inputs that disappeared): mostly fixed.**
* Fixed: a destructured `@Body()` is kept with an empty name and is unparsed (`:62`, `follows` returns null at `:125`). `@Req()` read as `r.body`/`r.query` is kept as an unparsed input (`:65-66`). Both are caught in my plants and have DW1 fail cases.
* Still not seen: a non-literal `@Controller({ path })` or `@Controller(PREFIX)`, and `const { body } = r` or `r["body"]` off `@Req()`. None of these is in `api/src`.

**m2 (`X.parse` other than JSON/Date/Number counted as zod): fixed for lower-case receivers.**
* `qs.parse` and `path.parse` are now unparsed.
* A capitalised receiver, or a receiver that is itself a property access or a call, still counts: `URL.parse(body as string)`, `YAML.parse(…)`, `path.posix.parse(…)` and `require("qs").parse(…)` each pass as "parsed". None of these is in `api/src` (grepped).

**m3: fixed.** DW3 now asks every route with any path parameter, `:run` included. The ">half 404" threshold is kept on purpose: the per-route rule is "no 500", and the non-404 answers are printed. I accept that as reasoned.

**m4: fixed.** `Head`, `Options` and `All` are in `VERBS`. HEAD and OPTIONS probes send no body, and `ALL` is asked as POST.

**Seen, for the case-close follow-up (not a finding).** The hand-off is now followed only for the whole value. `features/case-close.ts` hands on `body(b)`, a call, which is not followed. So when CaseClose's methods gain `parse(S, b)`, the handler must hand on `b` itself (or parse in the handler) before the line can leave `ALLOW`. Until then the check stays loud, which is the safe direction.

**Residual Minors (none blocks; all are the static scan's limits, and none occurs in today's code):**
1. A non-literal `@Controller` prefix, and `@Req()` body reads by destructuring or `r["body"]`, are still not seen (`routes.ts:52,65`). Fix: fail check 1 on a non-literal controller or route path.
2. A capitalised or property-access/call receiver of `.parse` counts as zod (`routes.ts:94`). Fix: also exclude `URL`/`YAML`, or require the receiver to be declared with `z.`.
3. A shadowed name or a dead-branch parse counts as "parsed": inherent to the scan, and accepted.
4. Detail lines are still cut at 600 characters (`check_csv1_inputs.ts:18`), so the refused-before-id list is cut off mid-entry.

## First round (commit 8918577f2), kept for the record
* **Verdict: Changes requested.** Major 1: `mentions()` matched property names and field reads, so `parse(S, body.x)` and `parse(S, { body: … })` counted as "parsed".
* Minors:
  1. destructured, `@Req` and non-literal-prefix inputs disappeared;
  2. `qs.parse` and `path.parse` counted as zod;
  3. DW3 skipped `:run` and relied on the ">half 404" threshold;
  4. `@Head`, `@All` and `@Options` were missing from `VERBS`.
* **Confirmed then and still true:**
  * all 68 "parsed" inputs are whole-body parses through each file's zod helper;
  * review-rounds (5) and person-link really parse, so striking them was right;
  * `putAnswer` parses in `Runtime.saveAnswer`;
  * case-close is checked by hand (`case-close.ts:34,41`), so listing it was right, as was the "Question for the tech lead" about it;
  * removing `parse(PutAnswer, body)` or `parsed(ReviewDecision, body)` makes check 3 fail.
* **The brief's tries:**
  * Planted unparsed routes were caught through two-step delegation, a multi-line handler, the `api/runtime/cases/:id` prefix and `{ ...b }`.
  * NUL-byte ids and NUL bytes in queries: no 500.
  * A 5 MB body: 413 Problem Details in plain words in 8 ms; just under 5 MB, the routes answer 400 or 404 in under 40 ms, no 500.
* **Not a finding here:** `GET cases?q=%00` and `?after=not-a-uuid` answer 404 on a list. That is `Runtime.list`, which is on the allow-list for PR 3b.

## What I could not check
* The full `ci` on the head: the PR is a draft. On 993c283a2, guard, module-cards and pr-rules have no result yet; the rest are skipped.
* The suites with `main` merged in.
* case-close and `/api/link` id handling with a real bearer or link session. Reading the code instead: case-close casts with `${id}::uuid`, which `main.ts:213` maps to 404.

Verdict: Approve 993c283a28850bad0c73e62f15d9f1ae7ef60a3c (code 1da1a0ac52090d37a61f6aa299460e75a9c376aa)
