# PF-19s review: Templates list, plain-text editor, preview (R1.46; thin PF-19c part 1)

Reviewer (independent, fresh context), 23 Nov, commit `e263986fc8dc16c794b003d3466e612b9b4eb190`, branch `claude/screens-pf19s-templates`, PR #3179.
Evidence: suite `tests/check_pf19s_templates_browser.ts` rerun by the reviewer on its own isolated copy (:4464, `xr_studio_rev_pf19s`, AI off):
**28/28 passed**, 42 s. Reviewer's own browser walk (Playwright, 10 journeys): `journey-test-reviewer-2026-11-23.md`. Code read at HEAD.
**Journey score: 9/10 (pass).**

## Verdict: Ship (no open Blocker or Major; 5 Minor, Should)

## D1–D20 (1–5, independent reviewer, browser/script)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | BR-1..BR-8 each present and walked (journey file J1–J9); one-pass-one-fail per BR in the suite. Starters as PLATFORM rows deferred (challenge B1, an open question for the Lead). |
| D2 Data integrity | 5 | Advisory lock + baseVersion: two tabs → 200 then 409 naming version 3; double-click Publish → exactly one new version; versions = audit lines 1:1 (5/5 in DB); version rows write-once (trigger error in T4). |
| D3 Reuse | 4 | Uses PF-19a tables, PF-19b `fillFields` token form, the leads read's `visibilityOf`/`sees`/`leadsSeenWhere` through a port. Subject rule duplicates the send path's regex (same text, two places). |
| D4 Rule integrity | 5 | Unknown `{{ x }}`, `{{ Lead_Name }}`, lone `{{`/`}}` refused by name on the field; picker offers only lead fields; no passport/financial field. |
| D5 Stability/recovery | 4 | Reload with unsaved changes warns (beforeunload); Discard confirms. After a 409 the only path is reload, which drops the typed wording (as the concept says). |
| D6 Governance | 4 | `platform.template.publish` audit with key + version, never wording; `publishedBy` actor; whose-wording shown per row. History view deferred (PF-19c part 2). |
| D7 AI trust | N/A | No AI on this screen. |
| D8 Orientation | 5 | Trail "My account › Templates › Edit", "← All templates", My account menu entry. |
| D9 Flow | 5 | Menu → list → Open → type → Insert field → Preview → Publish: 5 actions, one primary per area. |
| D10 Language | 4 | Plain words; "[missing: Lead's first name]", "[not a field: {{ x }}]". Meta line "purpose: Service" lower-case fragment. |
| D11 Feedback/state | 5 | "Unpublished changes", "Published: version n" with focus moved to it, field errors with aria-invalid, conflict notice, read-only notice. |
| D12 Visual quality | 4 | Team shell and components; four one-off hex colours (finding 2); Insert button sits a hint-row below the select. |
| D13 Accessibility | 5 | axe WCAG 2.2 A/AA: 0 at 375/1024/1440 and at 1024 px 200 % zoom (512 css px); keyboard-only publish (T6); focus returns to the field after Insert. |
| D14 Team look | 4 | Same frame, Field/Input/Notice/Table/Pill as other My account pages. |
| D15 Speed | 5 | API list 20 ms, read 21 ms, preview 10 ms; editor shown 41 ms after Open; one query per view, no per-row requests. |
| D16 Testability | 4 | 28 checks pass/fail; race test would 500 without the lock. But the B1 send-path check copies the query instead of calling the send (finding 1) and the graph sees no test for the routes (finding 3). |
| D17 First use | simulated only | Reviewer walk only; no intended user. |
| D18 Provenance | 4 | "ExpatReady's wording" / "Your wording, version n"; Sample wording and Sample lead "(made-up details)" labelled. |
| D19 E2E closure | 3 | Publish decides the wording the send path picks (DB check), but no automation sends these keys yet and unchanged starters are not sendable (B1 deferred). |
| D20 Pain/wow | simulated only | Live preview with a real lead, typed text shown as the lead receives it. |

## BIC-01–BIC-20 (EXPERIENCE §6)
All **N/A**: a firm settings screen, not case-side, and the concept did not opt in (§6 "Scope"). Screen laws (§7, 375/1280 px via suite 375/1440 shots): UXL-01 Met (one filled button), 02 Met, 03 Met, 04 Met, 05 Met, 06 Met (list has 3 rows), 07 Met (L-00001 short), 08 N/A, 09 Not checked at 44 px, 10 Met (no sideways scroll at 375), 11 Met (preview stacks under editor), 12 Met (loading/error/none states), 13 Met (`{{lead_first_name}}` without spaces accepted), 14 Met (missing/unknown marked with text, not colour only; English only per AG16-88).

## [M] lines (STANDARDS, EXPERIENCE) — met unless listed
Met: server authorisation deny-by-default on all 5 routes (403 CO publish, 403 Read-only preview, 401 no token, 404 other's lead equals the lead read's 404); optimistic concurrency 409 with what changed; Problem Details with field messages; no N+1; personal data not logged (audit has no wording/names); module cards updated; preview beside the editor; text-only rendering (`<img onerror>` lead name shown literally, nothing ran); comments say why.
Not met (Minor, see 2, 4): team tokens only; in-page confirmation for destructive actions. Loading is text, not skeleton (same as other platform pages: retrofit, not scored).

## Issues (ranked)
1. **Minor (Should)** — `tests/check_pf19s_templates_browser.ts:217-219`: the "send path uses the published version" check re-types the send path's `findFirst` instead of calling `MessagePort.send({templateKey:"lead.follow_up"})` and reading the outbox `template_version_id`, which challenge B1(c) asked for and the Lead response says was done. If the send lookup changes, this test still passes (STANDARDS §7 "a rule's test fails when the rule is removed"). Fix: call the real send (stub transport) and assert the outbox row's `template_version_id` equals the new version's id; or correct the Lead response.
2. **Minor (Should; breaks [M] "team tokens only")** — `web/src/modules/platform/messages/templates/templates-page.tsx:55,57,95`: `bg-[#fde2e1] text-[#7a1712]`, `bg-[#fdecc8] text-[#5c3c00]`, `text-[#1f2933]`. Fix: use the danger/warning surface and text tokens the Notice component uses.
3. **Minor (Should; graph P-86)** — `product/qa/graph.json`: routes `GET /platform/templates/records`, `GET|PUT /platform/templates/:key`, `POST …/preview` show `testedBy: []`, `webUse: false`, and the suite claims no capability (`caps: []`), although the suite does call them. Fix: name the routes/capability in the form `graph.mjs` reads (as other suites do) so traceability shows.
4. **Minor (Should; [M] §2.8)** — `templates-page.tsx:197`: Discard uses `window.confirm`, not an in-page confirmation (precedent in 14 other files). Fix: an in-page confirm row, or leave with a follow-up row.
5. **Minor (Should)** — `api/src/platform/messages/templates/templates.ts:141`: the one-line check runs on the untrimmed subject while the length and stored value use the trimmed one, so a trailing tab/newline is refused as "must be one line" instead of trimmed. Fix: test `s`, not `subject` (the send path then checks the same stored value).

## Open, not scored
* Challenge B1 (starters as PLATFORM rows by data-only migration) is deferred to PF-19c part 2 as a question for the Lead; `challenge.md` "Agreement" is still empty. Within R1.46's scope the footer copy is honest.
* The shared checkout had **uncommitted changes by another party** to `templates.ts` / `routes.ts` (moving `parseInput` to the controller, "PF-28") during this review; they are not reviewed here. The review is of HEAD `e263986`.

* During the review the branch gained `1a9c94e` (screenshots only, no code change); the code verdict holds for it, but the Approve is for `e263986`.

## Could not check
A real screen reader; an intended user's unaided walk (D17, D20 stay with the founder); 44 px touch-target height at 375 px (UXL-09); the send path end to end with a real transport.

**Verdict: Approve** — no open Blocker or Major. Minors 1–5 are Shoulds: fix or list as follow-up rows.

Reviewer: Approve e263986fc8dc16c794b003d3466e612b9b4eb190

## Re-review (diff e263986..15386831c)
*Diff-only, 23 Nov. Scope: `git diff e263986 15386831c -- ':!*.png'`. No app started. The builder reports `check_pf28_inputs.ts` 48/48 and `check_pf19s_templates_browser.ts` 29/29 on this head. My `tsc --noEmit -p api/tsconfig.json` shows no errors in `api/src` or `tests/check_pf*`; the errors it does show are in other suites' tests and were there before.*

**Earlier review Minors**
1. m1 (send-path test): the Lead response in `challenge.md` now says the test runs the send path's own lookup query, not a real send. That is the "or correct the Lead response" option. **Closed** (wording now honest). A test through `MessagePort.send` is still the stronger proof; PF-19c part 2 can take it.
2. m2 (tokens): `templates-page.tsx` now uses `bg-danger/12 text-text-danger`, `bg-warn/15 text-text-warn`, `bg-surface text-text`. These tokens exist in `tokens.css` and other pages use them (Tailwind 4.3, so `/12` is valid). **Closed.**
3. m3 (graph naming) and m4 (`window.confirm`): listed as follow-ups for PF-19c part 2 under "Build discoveries". **Accepted as follow-ups**, as the earlier verdict allowed.
5. m5 (one-line check on the trimmed subject): `refusals` now tests `s`. A trailing tab or newline is trimmed, not refused, and the stored value is what was checked. **Closed.**

**Breaker Minors (break-report.md)**
* m1 (NUL makes a 404): the body now refuses `[\u0000-\u0008\u000b-\u001f\u007f-\u009f]` as a 422 on `body`. This runs after CRLF is normalised, so line breaks and tabs still pass. A test covers it. **Closed.**
* m2 (subject does not wrap): `[overflow-wrap:anywhere]` is now on the subject `<p>`. **Closed** (the test does not check this; the breaker can re-check at 1024 px).
* m3 (lone surrogates stored as U+FFFD): `LONE_SURROGATE` is refused on the subject and the body as a 422. I checked the regex: it matches a high surrogate with no low after it, and a low surrogate with no high before it. A test covers the subject. **Closed.**
* m6 (limit counted before normalising): the schema cap is now `2 * LIMITS.body`, and the real limit is counted in `refusals` on the normalised body. The breaker's 12,000/8,000 case now passes. **Closed.**
* m4 (filled subject breaks the send rule) and m5 (a value holding `{{ }}`): listed as follow-ups for PF-19c part 2. **Accepted.**

**PF-28 change**
* The route now parses the body and query with `parseInput`. `knownKind(key)` runs first, so a bad key is 404 before any field error. The permission guard still runs before both. The service signatures now take the parsed types. The `:key` entry in the REAL map is `lead.follow_up`, a real key in `registry.ts`. The browser test checks for 404 on `PUT /platform/templates/not-a-key` with an unknown field. Nothing new to fix.
* `challenge.md` "Agreement" now records that the build followed the builder's recommendation after 30 minutes with no objection, and B1's migration stays a question for the tech lead. This fits P-223.

**Note:** the working tree has an uncommitted change to `screenshots/pf19s-3-real-lead-preview.png` that is not mine. PNGs are outside this diff.

**Journey score:** stays 9/10 from the earlier walk. These changes do not alter any journey's flow, and no new walk was needed for a diff this size.

**Verdict: Approve** for `15386831c46378d852a176bde579c0acef6fa8c2`. No Blocker or Major is open. The remaining Minors (review m3, m4; breaker m4, m5) are recorded follow-ups for PF-19c part 2.

## Re-review (diff 7a197a325..b64247632)
*Diff-only, 23 Nov. Scope: `git diff 7a197a325..b64247632` (3 files: `registry.ts`, `templates.ts`, `check_pf19s_templates_browser.ts`). Head `b64247632268762f5afb277d81442f269b5aa374`.*

**1. Audit line (check_aud_values, `fast`)**
* `publish` now passes `before: now ? { version: now.version } : null, after: { version }`, and `detail` is `{ key }` only. This fits `AuditEntry` (`ports/audit.ts`): `AuditValues` takes a flat number, `version` is a valid field name and not a secret, and `detail` has no `_before`/`_after` key (the refine passes). `flattenValues` gives a lone `version_after: 1` on the first publish (a create). On a later publish it gives `version_before: n` and `version_after: n+1`; they always differ, so neither is dropped. The template wording is not in the audit line (AG-12-95).
* No reader used `detail.version`. A grep of `api/src`, `web/src` and `tests` for `detail.version`, `detail->>'version'` and `platform.template.publish` finds only the action name and the T4 check. AUD-4's `changesOf` now shows the line as "version: → 1", which is the intended shape.
* Static sweeps on my copy (`static-sweeps.mjs --base <merge-base>`): 18/18 PASS, including `check_aud_values.ts`.

**2. Field pattern (CodeQL polynomial-redos) and `replaceAll`**
* Old: `/\{\{\s*([^{}]*?)\s*\}\}/g`. New: `/\{\{([^{}]*)\}\}/g`, and `fieldsIn` and `partsOf` call `.trim()` on the name. Both match the same spans, because `\s` is a subset of `[^{}]`. JS `\s` and `String.prototype.trim` strip the same set (WhiteSpace plus LineTerminator, ECMA-262), so the trimmed name is what the lazy capture used to give. I tested this with 300,000 random strings over `{ } space tab \n NBSP U+2028 U+FEFF a _ x`. Match index, match length, name and `replace(…, "")` (the `strayBraces` input) were identical every time: 0 mismatches. Timing on my run: the old pattern took 14.2 s on `{{` + 5,000 spaces + `x`. The new pattern took 0.2 ms on 50,000 spaces and 0.2 ms on `{{a` × 30,000. Runs of `[^{}]` cannot overlap, so the total work stays linear.
* Send path unchanged. `fillFields` (`studio/ports/messages.ts:103`) has its own pattern, `/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g`, and this diff does not touch it. That pattern is not polynomial, because its name class cannot match a space. It strips the same `\s` that `trim()` now strips. So a `{{ name }}` that passes `unknownFields` here fills there exactly as before. No other code uses `FIELD_RE`, `fieldsIn` or `partsOf`; the web side has no `{{` pattern of its own.
* Other patterns in the PR's code (`git diff origin/main...HEAD`, the 11 `.ts`/`.tsx` files): `split(/\s+/)`, `LONE_SURROGATE` (lookarounds on single code units), the control-character classes, `/\r\n?/g`, `/\{\{|\}\}/`, `UUID.test`, and the test-only `/…/.test(...)` checks on short API strings. None has nested or adjacent quantifiers that can match the same text, so I found no other ReDoS-prone pattern. The other two CodeQL alerts may be the second copy of the pattern in the test (now changed too) and the `.replace("_", " ")` that is now `replaceAll`. I could not see the alert list, so I cannot confirm they close. The next CodeQL run on this head shows whether they did.

**3. New checks**
* The linear-time fail test (`{{` + 50,000 spaces + `x`, under 500 ms, and `strayBraces` still true) does guard the regression. Nit, not scored: the old pattern would hang the suite (about 25 minutes by quadratic extrapolation) instead of printing a FAIL, so the CI step timeout is what reports it. A smaller input (about 3,000) would fail within seconds.
* The T4 audit check now asserts `|none|1` (no `version_before`, `version_after` 1). Nit, not scored: the second publish's line (`version_before` 1, `version_after` 2) is not asserted. `check_aud_values` already covers the general shape, so this is optional.
* My isolated copy (`pf19srv` on :4471, `AI_LIVE=off PLATFORM_IDENTITY=local`): `check_pf19s_templates_browser.ts` 30/30, exit 0. The T4 audit line read `1|Template lead.follow_up (Follow-up): version 1 published|none|1`, and the linear-time check took 0.21 ms.

**Journey score:** stays 9/10. This diff does not change what the user sees or does.

**Verdict: Approve** for `b64247632268762f5afb277d81442f269b5aa374`. No Blocker or Major is open. The two nits above are optional, and the earlier follow-ups (review m3, m4; breaker m4, m5) stand for PF-19c part 2.
