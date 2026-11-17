# PF-0bp review: body-parser errors are problem answers, never 500

* Branch `claude/runtime-pf0bp`, local commit **1c316e34212334fb2ecdd390696f08acc8eec755**, not pushed, no PR yet. Reviewed by the independent Opus reviewer only (P-303): no permissions, money or schema.
* Read: brief `lead-b-briefs/PF-0bp.md` (`origin/main`), `git diff origin/main...HEAD` (2 files, +98/-1), BACKLOG row PF-0bp (line 387), STANDARDS §6 line 40, `MODULE.core.md`, `public.ts` `publicFormBodyLimit`, and Nest's `routes-resolver.js` `mapExternalException` and `express-adapter.js` `useBodyParser`.
* Not a screen. Screen dimensions D8/D12-D14/D17/D20 and the BIC table (case-side screens only) are **n/a**. The journey score is in `journey-test-reviewer-2026-11-17.md`: **8.75/10, Pass**.

## What I ran
| Command | Result |
|---|---|
| `tsx --tsconfig api/tsconfig.json tests/check_pf0bp_body_errors.ts` (branch), twice | **12 passed, 0 failed** both times (about 18 s) |
| The same suite against `main`'s `main.ts` (scratch copy) | **6 passed, 6 failed**: DW1 ×3, DW2 pass, DW3 ×2 fail. Matches the builder |
| `tests/check_fo2_leads_prospects.ts` (DW5, FO-2 door) | **113 passed, 0 failed** |
| `tsc -p api/tsconfig.json --noEmit` | No error in `main.ts` or the new test |
| `check_cost_override.ts` (DW5, P-179 5 MB case) | **Not run.** `isolated.sh` needs the demo database ("start the demo database first"), and the demo is never used for tests. By inspection: its assert (line 238, 413 and `/5 MB/` in `detail`) still holds. The words are unchanged, and DW2 plus my probe show the same detail |
| Two copies, branch :4436 and main :4437 (runtime ports), probed by hand | Below, and in the journey report |
| `git merge-tree HEAD <PR #1959 head>` (the only open PR touching `main.ts`) | No conflict |

## The builder's finding and the middleware: agreed
* **The brief's premise is wrong, the builder's is right.** On main, a broken body is a 400 that repeats the parser: `{"a":` → "Unexpected end of JSON input". A bare `secret-marker-123` → `Unexpected token 's', "secret-marker-123" is not valid JSON`, which echoes the whole marker (seen on :4437). That is the leak the row exists to stop.
* **`ProblemErrors` alone cannot do it cleanly.** `mapExternalException` (routes-resolver.js:94-100) turns the `SyntaxError` into `new BadRequestException(err.message)`, which keeps no `type` and no `cause`. Inside the filter, the only remaining signal is V8's wording. Matching on that wording breaks when Node changes it, and could also catch unrelated 400s.
* **The one error middleware at `main.ts:242` is the narrow fix.** It sits after the app-wide parser and before the routes, which Nest registers at `listen`. It replaces only `type === "entity.parse.failed"` and passes every other error unchanged. It also covers the web-form door's own `express.json`: `public.ts:163` passes non-413 errors on, and that door now answers `BODY_NOT_JSON` too (main echoed `"{"note": secret-mar"…`).
* **Touch list:** the brief says "`main.ts` (`ProblemErrors` only)". The BACKLOG row's touch is "`main.ts` (the parser's error handler)", so the change is inside the row. The brief's rule still applies: ask Lead B in the PR ("Question for the tech lead") before asking for the label. This is a process step, not a code finding.

## Done when
| Line | Test | Fails when the rule is removed? |
|---|---|---|
| DW1: broken body → 400 problem+json `BODY_NOT_JSON` on leads and complaints; valid JSON reaches the handler | lines 57-65 | Yes (3 fails on main). The valid-JSON half is loose (m2) |
| DW2: 6 MB → 413 `BODY_TOO_LARGE`; door 33 KB → FO-2's `TOO_LARGE` | 68-72 | The first fails on main (no `code`). The second is a guard that FO-2 is unchanged and passes on both, as it should |
| DW3: marker absent from the answer and the log | 75-79 | Fails on main only through `notJson` and the "Unexpected/position" regex. The marker half cannot fail with this body (m1) |
| DW4: no handler reached; no 500 | 82-84 | Row count stands in for the brief's counting route (m3). The 500 check is real: request lines log `"status":500` |
| DW5: FO-2 door cases and P-179's case unchanged | FO-2 suite; cost suite by inspection | n/a |

## Issues (no Blocker, no Major)
* **m1 (Minor) DW3's body never puts the marker into the parser's message.** `tests/check_pf0bp_body_errors.ts:75` sends `{"note": "secret-marker-123", oops}`. V8 (Node 22 and 24) answers "Expected double-quoted property name in JSON at position 30", which contains no marker, so the "no secret-marker-123" assert passes on main too. Failure scenario: a later change re-exposes the parser's message for one error shape (for example strict-mode bodies). The full marker then leaks, and DW3 stays green as long as the wording dodges `/Unexpected|position|JSON at/`. **Fix:** add a case with the marker sent bare (`secret-marker-123`). Main answers it `Unexpected token 's', "secret-marker-123" is not valid JSON`, so the marker assert then fails on main by itself.
* **m2 (Minor) DW1's "reaches its handler" accepts any status under 500.** `tests/check_pf0bp_body_errors.ts:61-62`. Failure scenario: an expired token (401), a route rename (404) or a guard change (403) makes the line green when the handler never ran. The brief asks for "a 2xx or the handler's own 400". **Fix:** require the handler's own refusal. Today that is 422 `INVALID` for leads and 422 `COMPLAINT_FIELDS` for complaints. Keep PF-21i's (#2012) Idempotency-Key answer allowed for complaints. **On PF-21i:** the current check stays correct either way. A broken body is refused before any interceptor, so it is `BODY_NOT_JSON` with or without the key. The valid `{}` sends a key, so PF-21i yields `COMPLAINT_FIELDS` or its own key refusal, neither of which is a 500 or `BODY_NOT_JSON`.
* **m3 (Minor) DW4 counts rows instead of a test-only route.** `tests/check_pf0bp_body_errors.ts:52,82-83`. It is an acceptable substitute: a counting route would need app code outside the touch list, and the filter is wired only in `main.ts`. But it cannot fail in the likely regression. A broken body that did reach a handler would be refused there (422) and write no row either. The real proof that no handler ran is DW1's `BODY_NOT_JSON`, which no handler produces. **Fix:** say this in the PR as the named substitute, and rename the line so it does not claim more than it checks. Nit: `![...broken].length ||` at line 84 is a dead operand (always false).
* **m4 (Minor, pre-existing, not a regression) Two other body-parser refusals are still 500s.** With `Content-Encoding: foo` (body-parser `UnsupportedMediaTypeError`, 415, `encoding.unsupported`) or a body labelled gzip that is not gzip (`Z_DATA_ERROR`, 400), the error has a `type`/`status` that no branch takes. It falls to `main.ts:223-224`, so `console.error` and a 500. Both copies behave this way, and it needs no sign-in. Failure scenario: anyone can push the PF-23 error count up with one header. The row's title says "never 500", but the brief's "What to build" names only the parse and 413 cases, so this is not a block. **Fix (the Lead's call, no new scope asked here):** name it in the PR as outside the brief. Either a follow-up row, or one branch for any `expose`d body-parser 4xx (`e.expose && e.status < 500 && typeof e.type === "string"`) with fixed words.
* **m5 (Minor) The duplicate check misses QA-151.** `qa/BUGS.md:168` (QA-151: "a body that is not JSON answers 400 with the JSON parser's own words") is this bug. **Fix:** the PR's `Duplicate check:` line names QA-151 as fixed by this row, so qa can close it. `tests/qa/check_qa_vv_1102_probe.ts:37` ("fail today") should now pass.
* Nit: the second half of the condition at `main.ts:209` (`status 400 && expose && type startsWith "entity."`) cannot be reached by anything today, because the middleware already maps the only `entity.*` 400. It is harmless.

## Rules and other checks
* Words: plain, fixed, in the house pattern ("Request refused" / "… Nothing was saved or started."). The 413 words are unchanged and gain only `code`. Problem Details holds (STANDARDS §6 [M] **met** for these two paths).
* No migration, no `ports/` change, no new package, no event name, US$0, no names. The card invariants (`MODULE.core.md`) do not name the error answers. The PR body needs `Card unchanged: <reason>`, or module-cards CI fails.
* New suite: it is a plain `tsx` usage line, so `run-suites.sh` picks it up. It uses its own database and a free port, and drops the database at the end. `--changed` runs every suite, because `main.ts` is shared.
* Parallel: PR #1959 inserts a line between `publicFormBodyLimit` and the JSON parser and merges cleanly. Its raw body is read before the JSON parser and does not interact with the middleware. PF-4pc's path-match line is a different hunk.
* Graph (P-86): not run, because it rewrites `qa/GRAPH.md` and only this file and the journey report are mine to write. No page and no route were added.
* Could not check: `check_cost_override.ts` live (environment: needs the demo database), suites pf23, pf24 and pf4 (`isolated.sh`, same reason; CI runs them), and a screen reader or an intended user's walk (no UI).

Verdict: Approve 1c316e34212334fb2ecdd390696f08acc8eec755
