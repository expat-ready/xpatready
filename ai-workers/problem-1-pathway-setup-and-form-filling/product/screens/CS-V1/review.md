# CS-V1 part 1 review: the input check over every case-side route (finder + allow-list)

Reviewer (fresh context, did not build it), 16 Nov. PR #2007, branch `claude/runtime-csv1-check`, **commit 8918577f2** (HEAD checked). Tests only (no screen): screen dimensions D1-D20 and the BIC table are N/A. I reviewed the code against the brief (`build-lead-c-briefs/CS-V1-1.md` on `claude/build-lead-c-647b40`, wins) and the spec (`design/briefs/CS-V1.md`, PR 1). My own copy ran on :4488 (`isolated.sh rev_csv1`, live AI off, US$0, stopped after). Journey report: `journey-test-reviewer-2026-11-16.md`, **7.5/10**.

## Evidence run
* `npx tsx tests/check_csv1_inputs.ts 4488`: **17 passed, 0 failed, exit 0**, 19 s. Measured 128 case-side routes in 25 files, 87 taking a body or query (88 inputs), 20 unparsed, the same as the PR body. DW3: 116 routes with an id, 232 asks, 196 answered 404, no 500.
* `tests/check_forms_qa53.ts 4488 xr_studio_rev_csv1`: **42/42**. `check_forms_qa53.ts` and `lib/ts-files.ts` are unchanged against `origin/main`. The diff is the 2 new files only (271 lines).
* Mutation on a copy of `api/src`: I took out `parse(PutAnswer, body)` (runtime.ts) and `parsed(ReviewDecision, body)` (review-rounds.ts). The finder then reports both runtime answer routes, both `/api/link` answer routes and `reviews/:id/decision` as unparsed, so check 3 fails when the rule is removed.
* **The PR body's claims, checked by reading each service method:**
  * All 68 "parsed" inputs parse the **whole** body or query with the file's own zod helper. Every local `parse`/`parsed` is `schema.safeParse` plus `problemFromZod` (case-checklist :49, case-documents :149, person-link :36, runtime :40, review-runs :88, and others).
  * review-rounds really parses all 5 (`parsed`, `review-rounds.ts:42`). Struck correctly.
  * person-link really parses all of its inputs: `send`, `takeBack`, `tick`, `linkByToken` ×2, `verify`, and the link answers through `Runtime.saveAnswer/saveRow/saveNoneApply`. Struck correctly.
  * `putAnswer` parses (`Runtime.saveAnswer`: `parse(PutAnswer, body)`).
  * The case-close bodies are checked by hand (`case-close.ts:34` `reasonOf`, `:41` `dateOf`) with no zod. Listing them keeps `main` green, and the PR raises a "Question for the tech lead" about it, which is the right way to handle the conflict with the brief.
  * I spot-read the listed readiness, sign-steps and runtime `list`/`mode` entries: all read by hand, as listed.

## The reviewer's tries (as the brief asks)
**(1) A planted unparsed route.** I used `planted()` with the finder's own `routes()` and `follows()`. It **catches**:
* a two-step delegation (`ctl → Svc.put → this.step2 → this.h.save`), and the parsed variant ends at `Helper.check`;
* a handler spread over many lines (decorators and arguments on separate lines);
* the controller prefix `"api/runtime/cases/:id"`;
* a body passed as `{ ...b }`, both unparsed and parsed;
* an unparsed `@Query()`;
* a `parse` of an unrelated value in the same method;
* a free-function delegation (flagged as unparsed, the safe direction).

It is **fooled into "parsed"** (Major 1 below) by:
* `parse(z.string().max(9), body.name)` (a partial parse);
* `parse(S, { name: env.body })`, where the service's parameter is named `body` (a property name matches);
* `[1].map((body) => parse(S, body))` (a shadowed name);
* `qs.parse(body)` and `path.parse(body)`;
* a parse only in a dead branch.

It **does not see the input at all** (Minor 1) for:
* a destructured `@Body() { name }`;
* `@Controller({ path: "api/runtime" })`;
* `@Controller(PREFIX)`;
* `@Req() req` read as `req.body`.

None of these patterns is in `api/src` today (grepped): no non-literal controller or route path, no destructured body, no `req.body`, no `qs`/`url`/`path.parse`.

**(2) An id with a NUL byte.** DW3 already asks `not-a-uuid%00` in every parameter of all 116 id routes, with no 500. By hand:
* `review-runs/:run/stop`, the one route DW3's `:…id` pattern skips, answers 404 to both probes.
* A NUL in queries never answers 500: `cases?q=%00`, `?after=%00`, `?client=%00`, `questionnaire?mode=%00`, `proposals?subject=%00`, `checks?state=%00`, `addable-forms?q=%00`.

**(3) A 5 MB string.** Against `PUT …/answers/s/f`:
* 5 MB + 10 bytes as `{value}`, and a bare 5 MB JSON string: **413** Problem Details, "larger than the 5 MB the server takes. Nothing was saved or started.", 8 ms.
* Just under 5 MB: the route answers 404 "No such question." in 28 ms.
* The same body under 5 MB to `warnings/:code/pass`, `form-additions/:id/remove`, `filings/:id/form-additions`, `checklist-lines/:id/providers` and `review-runs`: 400 or 404, under 40 ms, no 500.
* Whether an oversized string is stored on a real record is DW4's job (PR 2-3b), so it is not checked here.

## Issues (ranked)
**Major 1: a partial parse, or the input's name used as a property name, counts as "parsed".** This is the one way the check turns green without saying so.
* Where: `tests/lib/routes.ts:81-84`. `mentions()` matches any identifier with the input's name, including a property name (`x.body`, `{ body: … }`) and the object of a field read (`body.name`). `follows()` uses it both on the parse argument (`:113`) and on the hand-off to a service (`:125`, so `this.s.put(b.name)` into `parse(S, name)` also counts).
* Why it is a Major, not a theoretical gap: the minimal fix for today's hand-checked methods (`case-close`, `readiness pass`, `form-additions remove`) is `parse(z.string().max(n), body.reason)`. Check 5 would then **force** that method off the allow-list while the rest of its body is still read by hand. The list would shrink without the methods being fixed, against STANDARDS §6.
* Fix (about 10 lines, inside the touch list):
  * In `mentions`, skip a `PropertyAccessExpression`'s `.name` and a `PropertyAssignment`'s key.
  * Count a parse, or a hand-off, only when the value itself is passed: the identifier, or it wrapped in `??`, `||`, `as`, `!`, parentheses or `{ ...x }`. A field read (`x.f`, `x[k]`) does not count.
  * Add DW1 fail cases for `parse(S, body.x)` and `parse(S, { body: y })`.

**Minor 1: inputs the finder cannot read disappear instead of failing loudly** (`routes.ts:52,60`). These are a destructured `@Body()`/`@Query()`, a non-literal `@Controller(…)` prefix, and `@Req()` with `req.body`. Fix: fail check 1 when a `@Controller` or a verb decorator has a non-literal argument, or when a `@Body`/`@Query` parameter is not a plain name. A `@Req()` parameter whose `.body` or `.query` is read should be reported as unparsed.

**Minor 2: any `X.parse(…)` other than `JSON`, `Date` or `Number` counts as zod** (`routes.ts:77`). `qs.parse` and `path.parse` pass. Fix: also exclude `qs`, `querystring`, `url`, `path`, `URL`, or require the receiver to be a schema (a capitalised name, or one declared with `z.`).

**Minor 3: DW3 is weaker than "expects 404".**
* 18 routes (36 asks) are refused before the id is read: 401 for case-close without a bearer, 401/400 on `/api/link/*` without a link session, 400 for a body checked before the id, 403 for reconfirm. The 404 rule therefore holds only because of the ">half answer 404" threshold (`check_csv1_inputs.ts:128`).
* `:run` is not matched by `/:[a-z]*id\b/` (`:111`).
* Fix: keep a reviewed list of the routes that are refused before the id is read, and require 404 from every other route. Include `:run`, or every parameter that holds a database id.

**Minor 4: `@Head`, `@All` and `@Options` are not in `VERBS`** (`routes.ts:20`), although the file says "every verb". Only `HEAD cases/:id/prepare` uses one today, and it takes no input. Fix: add them, or say in the comment that they are left out.

Seen, not a finding for this PR: `GET /api/runtime/cases?q=%00` and `?after=not-a-uuid` answer 404 "Not found (it may have been removed by a reset)" on a **list**, through the NUL / uuid mapping in `main.ts:213`. That is `Runtime.list`, which is on the allow-list for PR 3b, where a schema would answer 400.

Limits that are inherent to a static scan, not findings: a parse only in a dead branch, or under a shadowed name, counts as parsed. That is acceptable for a guard backed by review.

## What I could not check
* The full `ci` on the head: the PR is a draft, so only the guard ran (green). One `pr-rules` run is red and one is green.
* The suites on `main` merged in.
* case-close and `/api/link` id handling with a real bearer or link session. Reading the code instead: case-close casts with `${id}::uuid`, which `main.ts:213` maps to 404.

Verdict: Changes requested. Major 1 (a partial parse or a property-name match counts as "parsed", `routes.ts:81-84,113,125`). Minors 1-4 (inputs that disappear, non-zod `.parse`, DW3's threshold and the skipped `:run`, verbs missing from `VERBS`).
