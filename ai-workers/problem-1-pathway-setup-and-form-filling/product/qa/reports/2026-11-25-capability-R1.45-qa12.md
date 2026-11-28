# qa capability R1.45 — 25 Nov 2026, ~22:xx IST (cloud qa, under Lead 10)

**Run:** `/qa capability R1.45` on main **373cf8d8c** (after #3769; j_45 merged in #3645 at 11:42 IST over #3179's PF-19s screens and thin PF-19c part 1). Live AI off, US$0, no priced button, never :4400 (cloud copy: the read-only demo walk was not done).

## Verdict: **Partial** — the message templates work; the retainer templates' preview with a real record (FO-5p) is not built
Every clause of the row's Done when passes by screens for the firm's **lead message templates** (My account › Templates). But the row's own parts list is PF-19c, PF-19s, **FO-5p**, and AG-12-89 asks for a preview "with a real lead, client, case or organisation chosen by the user". FO-5p (preview a retainer or consultation agreement with a real record) is "not built" in BACKLOG; `api/src/front-office/retainers/routes.ts` has no preview route, and Sales › Retainer templates offers no real-record preview. PF-19c's later part (drafts AG-12-45/-65, must-keep fields, French, "Send me a test") is also not built; drafts are named out of j_45 in the builder's note. New **QA-796 (Gap · Major)** names FO-5p; it keeps the row Partial (P-305). If the Lead rules R1.45's scope to the message templates only (#3645's shape), QA-796 moves to R1.52's row and R1.45 is Works on this same evidence — **Question for the tech lead** below.

## Pack on GitHub's machines, main's head (P-339)
| Run | What | Result |
|---|---|---|
| walks [45662478296](https://github.com/expat-ready/xpatready/actions/runs/45662478296) (dispatched by qa, ref main = 373cf8d8c) | j_45 recorded walk, job 139376206631 | success |
| item-proof [45662555034](https://github.com/expat-ready/xpatready/actions/runs/45662555034) (pr=3645, by hand on main's head) | R1.45 pack (j_45) + secret scan | **PASS** |
| on merge: walks [45558883772](https://github.com/expat-ready/xpatready/actions/runs/45558883772), item-proof [45558883751](https://github.com/expat-ready/xpatready/actions/runs/45558883751) (main 649e520a9) | j_45 | PASS 13/13 |

## Walk by screens (gate A, P-348c) — isolated copy, headless (no display in a cloud copy; the walks video stands in)
`isolated.sh qa_j45 4472 start --ttl 30`, j_45 twice on one copy: **13/13 and 13/13, exit 0**.
* W1: the Owner signs in, My account › Templates; Follow-up is "ExpatReady's wording" until the firm publishes (AG-12-44); Insert field offers exactly the registry's lead fields (no passport or financial field); a picked field goes in as `{{ key }}`; nothing stored before Publish.
* W2: "Preview with a real lead": the Owner picks a lead; the preview names it and fills its first name, number and the firm's name as the database holds them (AG-12-89, lead half). "Use the Sample lead" goes back. The Case Officer (own leads only) finds no such lead; the API answers 404.
* W3: `{{ passport_number }}` is marked "not a field" in the preview; Publish says "Not published", the message is aria-invalid and its note names the field; nothing stored; API 422 on the field, and on the subject for `{{ client_income }}`. With it removed, version n+1 is stored with picker fields only and the list says "Your wording, version n+1".
* W4: 1440 px, no sideways scroll, axe clean, no page error.
* **W5 = the next capability's first step:** R1.46's plain text box, ready to type in. PASS.

## My own probes (`tests/qa/probe_r129_r145.ts`, committed with the R1.29 records PR #3789): template part all PASS
* 400 and 1024 px: Templates list and the Follow-up editor — no sideways scroll, axe WCAG 2.2 A/AA clean, no page error.
* API: the Case Officer may not publish (403, Problem Details "Not allowed"); a stale `baseVersion` 409 "Someone published version 1 of this message after you opened it. Reload to see it…"; empty subject 422 "Write a subject." on `fields.subject`; a 400-character subject 422 "The subject is 400 characters; at most 200."

## Bugs
0 Blocker · 0 Critical · **1 Major (QA-796, new, Gap)** · 0 Minor new.
Builder-listed, not re-logged (the Lead's Minor list): the preview's value highlight adds a visible gap ("Dear  Amira ,"; `px-0.5`, pre-existing from #3179); j_45's console filter also drops an unchecked 500 (m2 gap); axe runs on one state (m4).

## Suites underneath
`check_pf19s_templates_browser.ts`, `check_fo5f2_template_safety.ts` (local `run-suites.sh --only`, main 373cf8d8c): in a PR comment.

## What I could not test
Headed browser pane; the shared demo :4400; coverage (c8) not run this round. Client, case and organisation records in the preview: no template kind for them exists yet (registry has lead kinds only), so nothing to walk.

## Questions for the Lead
* **Question for the tech lead:** does R1.45 include the retainer templates' real-record preview (FO-5p, listed in the row's parts and in `design/release1-end-to-end-review-2026-11-18.md` D3)? My recommendation: yes, keep FO-5p in R1.45 (AG-12-89 is one rule for all firm templates), so R1.45 stays Partial until FO-5p merges. If you rule it out, I move QA-796 to R1.52 and mark R1.45 Works on runs 45662478296 / 45662555034 without a new walk.

## Suggestions
* FO-5p reuses PF-19c's field list and record resolver (D3) — *Needed for the proof*, *Capability*.
