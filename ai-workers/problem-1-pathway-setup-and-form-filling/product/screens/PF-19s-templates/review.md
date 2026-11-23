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
