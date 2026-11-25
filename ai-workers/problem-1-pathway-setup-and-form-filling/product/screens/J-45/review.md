# J-45 review: R1.45 "Firm templates, field picker, preview with a real record" (test-only PR #3645)

Reviewer (independent, fresh context), 25 Nov, head `1a3c28f46f468bcb8e3da0160f27ea2f3e3fddb4`, branch `claude/zen-babbage-ia7em0`, diff `origin/main...1a3c28f46`
(merge base `63f5cc913`): `tests/journeys/j_45.ts` (236 lines), `qa/built/R1.45.md` (1 line), 6 screenshots. No product file changed.
Runs: isolated copy `j45r` on :4457 (`xr_studio_j45r`, PLATFORM_IDENTITY=local, AI off, US$0); never :4400 or :4455.
**j_45: 13/13 on a fresh copy, 13/13 on a rerun of the same copy (versions 1 → 2), 13/13 on a second fresh copy; about 8 s each.**
Reviewer walk (keyboard, 400/512/1024/1440, break pass): `journey-test-reviewer-2026-11-25.md`. **Journey score: 9½/10 (pass).**

## Verdict: Ship (no Blocker, no Major; 6 Minor and 2 Nit, all Should)

## 1. Is the claim true? (main's product code against the Done-when)
| Clause / requirement | On main (#3179) | Evidence |
|---|---|---|
| "uses only picker fields" (AG-12-70) | Met | Picker = `t.fields` from the read (`templates-page.tsx:186-189`), which is `FIELDS[kind.recordType]` (`templates.ts:169`): the 5 lead fields, no passport or financial key (`registry.ts:16-24`). A typed field not in it refuses publish (`templates.ts:187-191`), so a stored version holds picker fields only. |
| "preview fills it from a chosen real record" (AG-12-89) | Met | Search lists only leads the person may open (`template-records.ts:270-280`, `leadsSeenWhere`); values 404 unless `sees` (`:283-291`); preview needs `agent/prospect:show` (`templates.ts:233`). Walk: "Dear Noor, … Sample immigration firm … Ref. Noor Rahimi…", record line "Noor Rahimi… (L-00001)". |
| "an unknown field refused on save, named" (AG-12-66) | Met | 422 `fields.body` / `fields.subject` "{{ x }} is not a field of this message. Insert fields from the list." (`templates.ts:189,199`); screen puts it on the field, aria-invalid (`templates-page.tsx:156`, `controls.tsx:60-62`). Reviewer: `{{ Lead_First_Name }}` and a lone `{{` in the subject also refused on the subject field. |
| AG-12-44 ExpatReady's wording until the firm publishes, no copy stored | Met | `read` returns the starter without writing (`templates.ts:163-171`); list "ExpatReady's wording" at version 0 (`contract.ts:27`). |
| AG-12-45 firm version used once published | Met for the publish half | New write-once version, list "Your wording, version n" (`templates.ts:208-209`). The draft half ("SHALL create a firm draft") is not built: PF-19c part 2 (`templates.ts:107`, concept BR-3); the row text does not need it (see m5). |

**Rules fail when removed (STANDARDS.md:48), reviewer mutations on :4457, each restored:** (1) `unknownFields` returns `[]` → 3 FAIL (W3 screen, W3 API, W3 pass); (2) `find` without `leadsSeenWhere` → W2 fail FAIL (`oNone:false`); (3) `values` without the `sees` check → W2 fail FAIL (`oPrev:200`). No false pass found.

## 2. Does j_45 prove each clause, pass and fail, loudly?
* W1 pass (picker list equals the registry; picked field lands as `{{ lead_full_name }}`; nothing stored) · W2 pass (real lead) and fail (Case Officer: none on screen, API 404 for lead read and preview, no first name leaked) · W3 fail (screen + API, body and subject) and pass (version n+1 stored exactly, list updated). Each `ok` has a condition that can be false; `seen`/`until` return false, never hang; a throw becomes a FAIL (`j_45.ts:231-232`); exit code is the FAIL count (`:236`, `runtime/api.ts:31`).
* Conventions: header names the clauses word for word and the run line in the `isolated.sh … start --ttl 30 … && trap … stop` form `walk.mjs:26` parses (`j_45.ts:25`); port 4455 is in the forms range 4450-4459 (`WAY-OF-WORKING.md:18`); refuses :4400 (`:44`); Sample data only; screenshots in `screens/J-45/screenshots/`; same shape as `j_46.ts`. `qa/built/R1.45.md` matches the other built lines.

## D1–D20 (1–5)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 5 | Every Done-when clause met and walked, pass and fail (table above). |
| D2 Data integrity | 5 | Refused publish stores nothing (versions and newest body unchanged, `j_45.ts:190,196`); one version per publish. |
| D3 Reuse | 4 | Journey reuses `recorder`, `client`, product seeds; product reuses the leads' own-or-all rule. |
| D4 Rule integrity | 5 | Unknown, wrong-case and stray-brace fields all refused by name; mutation tests above. |
| D5 Stability/recovery | 4 | Typed text kept after a refusal; rerun on the same copy passes. |
| D6 Governance | 4 | "Your wording, version n"; audit line exists (checked by j_46, not j_45). |
| D7 AI trust | N/A | No AI. |
| D8 Orientation | 5 | My account menu entry, trail "My account › Templates › Edit", "← All templates". |
| D9 Flow | 5 | Menu → Open → Insert field → Preview with a real lead → Publish. |
| D10 Language | 4 | Plain refusals; "purpose: Service" fragment (known from PF-19s). |
| D11 Feedback/state | 5 | "[not a field: …]" in the preview before Publish, "Not published …", "Published: version n" with focus moved. |
| D12 Visual quality | 4 | Team shell; preview value padding reads "Dear  Amira ," (n1). |
| D13 Accessibility/responsive | 5 | axe 0 at 400, 1024, 1440, refused state, Case Officer state; no sideways scroll at 512 px (1024 at 200 %); keyboard-only insert, pick, publish. |
| D14 Team look | 4 | Same Field/Notice/Table/Pill as My account pages. |
| D15 Speed | 5 | Editor and preview shown in 204 ms after navigation. |
| D16 Testability | 4 | Assertions fail under mutation; gaps m1–m4 below. |
| D17 First use | simulated only | Reviewer walk only. |
| D18 Provenance | 5 | Record named with its number; Sample lead "(made-up details)"; starter "Sample". |
| D19 Capability closure | 4 | Ends at R1.46's first step (W5); send path out of scope. |
| D20 Pain/wow | simulated only | No intended user. |

## BIC (configuration screen, §6 optional; scored where it applies)
BIC-04 Met (refused at the field with its fix) · BIC-11 Met (one primary, "Publish") · BIC-13 Partly (on the field, but the summary notice sits below Publish, not at the top: `templates-page.tsx:202-204`) · BIC-14 Met (pills are text, hints visible) · BIC-18 Partly (loading is text, not a skeleton: `templates-page.tsx:27,128`; read-only says why) · BIC-19 Met (one heading and one primary per panel at 1440 and 1024) · BIC-20 Met (keyboard walk, 200 % zoom) · BIC-01–03, 05–10, 12, 15–17 N/A (no case facts, documents, AI, signing or review step).

## Issues (none Must)
* **m1 (Should)** W4's real-lead precondition is not asserted: `until` result is dropped (`j_45.ts:218`), so axe at `:219` can run on the Sample preview and `:222` still says "with a real lead's preview". Fix: keep the boolean and add it to the `ok`.
* **m2 (Should)** Only `pageerror` is collected (`j_45.ts:91,95`); journey-test §3 also asks for console errors. Fix: collect console errors, allowing the expected 422/404 resource lines.
* **m3 (Should)** "exactly the lead's fields" compares the screen with the product's own registry (`j_45.ts:63,126,129`): a non-lead field added to `FIELDS.lead` would still pass (only passport/financial names are caught). Fix: pin the concept §5 list (`screens/PF-19s-templates/concept.md:52-54`).
* **m4 (Should)** axe only on one state at 1440, `main` only (`j_45.ts:219`); STANDARDS.md:48 "[M] axe-core on every screen state". The W3 refused and W2 Case Officer states are not checked here (reviewer ran both: 0 violations; j_46 covers 400/1024/1440). Fix: axe those two states.
* **m5 (Should)** Records cite AG-12-45 as proved (`j_45.ts:4,18`, `qa/built/R1.45.md`), but its draft half is not built (`templates.ts:107`). Fix: say "AG-12-45 publish half; drafts PF-19c part 2".
* **m6 (Should)** `j45-w3-unknown-field-refused-1440.png` shows the sticky app header painted mid-page (full-page shot of a scrolled page, `j_45.ts:92`); the state is still readable. Fix: scroll to top before the shot.
* **n1 (Nit, #3179 code, not this diff)** preview values padded `px-0.5` read as a space before punctuation (`templates-page.tsx:56`).
* **n2 (Nit)** setup sets the lead owner by SQL (`j_45.ts:83`) and puts the cursor by DOM `evaluate` (`:133`); setup only, the capability is walked on screens (Ctrl+End works, reviewer walk).

Graph (P-86): `graph.mjs` lists the four `/platform/templates` routes with `testedBy: []`; it does not read `tests/journeys/` (known from PF-19s review finding 3), so this is not new to this PR.

## Could not check
A real screen reader; an intended user's unaided walk (D17, D20 stay with the founder); CI on this head (not watched).

Reviewer: Approve 1a3c28f46f468bcb8e3da0160f27ea2f3e3fddb4

Verdict: Approve
