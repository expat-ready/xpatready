# CS-V1 part 1: journey test (reviewer role), 16 Nov

PR #2007 at commit 8918577f2. Tests only, so there is no screen. The "user" here is a builder who adds or fixes a case-side route, plus the reviewer reading the check's output. The copy ran on :4488 (`isolated.sh rev_csv1`, live AI off, US$0, stopped after). Scratch scripts were kept outside the repository. Criteria that apply only to screens (accessibility and screen sizes, visual quality) are scored on the console output.

## Journeys
1. **Main path.** A builder runs the check on `main` and it is green: 17/17 and exit 0 in 19 s. One summary line gives the counts (128 routes, 25 files, 88 inputs, 20 unparsed).
2. **A new route with an unparsed body (error).** Planted in a subfolder, through a two-step delegation, a multi-line handler, the prefix `api/runtime/cases/:id` and `{ ...b }`: every one was caught, and the failure names `<file> <VERB> <path> body`.
3. **The builder fixes a listed method (alternate).** Taking out a real parse makes check 3 fail, naming the route (mutation run). A method that is fixed but still listed fails check 5 (DW2).
4. **The builder "fixes" a method with a partial parse (break).** `parse(S, body.x)` passes as "parsed". **Not held** (review Major 1).
5. **A route the finder cannot read (break).** A destructured `@Body()`, `@Controller({path})`, `@Controller(PREFIX)` or `req.body` makes the input disappear, and nothing reports it. **Not held** (Minor 1).
6. **No copy running (recovery).** The check says "DW3: a copy answers on :N" with the start command, and the code checks still run.
7. **A malformed id or a NUL byte (error).** 232 asks, no 500. `:run` is skipped but answers 404 by hand. 18 routes are refused before the id is read.
8. **A 5 MB string body (break).** 413 Problem Details in plain words in 8 ms. Just under 5 MB: 400 or 404, under 40 ms, no 500.
9. **The step across the boundary.** PR 2-3b shrink `ALLOW` and check 5 forces each line off when its method is fixed. This works, except for journey 4.

## What held
* The finder covers every verb used today, prefixes, `features/` and `/api/link`.
* The hand-off into the service is followed by argument position, up to 4 steps.
* The allow-list is exact. Every claim in the PR body matched the service code (review.md, "Evidence run").
* `check_forms_qa53.ts` is unchanged and passes 42/42.

## Score
| criterion | score | evidence |
|---|---|---|
| task completed | 1 | 17/17, exit 0; DW1-DW3 each pass and fail as named |
| next step obvious | 1 | a failure names file, verb, path and input; the missing copy gives its start command |
| plain words | 1 | check names read as sentences |
| feedback and state | 1 | summary counts, plus the 404 / refused-before-id breakdown |
| correct data | ½ | 68 of 68 parsed inputs are real whole-body parses, but a partial parse or a property-name match is accepted (Major 1) |
| error recovery | ½ | the check fails loudly on an unparsed route, but stays silent on routes it cannot read (Minor 1) |
| accessibility and screen sizes | 1 | N/A as a screen; text output only, no colour codes |
| speed | 1 | 19 s for 232 HTTP asks plus the code scan |
| visual quality | ½ | the detail lines are cut at 600 characters, so the DW3 refused list is cut off mid-entry |
| trust and sources | 1 | each allow-list line carries its reason; STANDARDS §6 and `main.ts` are cited; no AI |

**7.5 / 10, no criterion at 0: below the pass mark of 8.** Fixes, most valuable first:
1. Count only a whole-value parse or hand-off, and skip property names in `mentions` (Major 1). This raises correct data.
2. Fail loudly on a non-literal controller or route path and on a destructured or `@Req` input (Minor 1). This raises error recovery.
3. Print the refused-before-id list in full, or as a reviewed list (Minor 3). This raises visual quality.

## Could not test
* The full `ci` (the PR is a draft).
* The id handling on case-close and `/api/link` with a real bearer or link session.
* An intended user's unaided walk (D17/D20 stay with the founder; not applicable to a test).
