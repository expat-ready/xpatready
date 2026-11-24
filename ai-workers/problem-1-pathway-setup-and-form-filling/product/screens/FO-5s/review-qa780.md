# FO-5s: QA-780 review (a draft's template can be changed)

PR #3541 · branch `claude/screens-qa780-template` · head `85d4feebb05d5155c0b076b5225f8cf6597e3cea` · reviewed against `origin/main...85d4feebb` · independent reviewer (did not build it) · 2026-11-24 · Live AI off, US$0.

**Verdict: Ship after fixes.** The main path works: the pick, the refusal's "Choose a template that prints it", Save from the chosen template, then Send. Two realistic paths still fail. (1) The new query reuses the Retainer templates page's cache key with a narrower shape, so going from a retainer to Settings › Retainer templates crashes that page. Both the notice's own link and the side menu go there. (2) When the disclosure is added as a new version of the draft's own template, the pick claims "version 1 · prints the conflict disclosure". The offered fix is then a dead end, so the QA-780 failure comes back.

## What was run (isolated copies only; never :4400)
* Branch: `vite build`, `isolated.sh rev780 4445`, `check_fo5s_retainer_screens_browser.ts 4445 xr_studio_rev780`: **48/48** in 17.6 s.
* Main's code with this PR's test file: `git archive origin/main` into a scratch folder, built, started on :4440 (`rev780m`), then stopped. **42/45**: the setup line passes, and there are three FAIL lines (pick, switched-off, the combined "need the Template pick"). The tests truly fail on main. The bounded `waitFor` is read as true or false and then asserted, so no wait is silent.
* Reviewer probes (scratchpad, not committed): the no-template-prints-it path and its link; the disclosure added as version 2 of the same template; axe, keyboard and 1024/1440 px on the refusal state.
* Merges: `git merge-tree` with PR #3424 and with PR #3532 are both clean. This diff leaves #3424's react-router-dom import and `warnings` state line untouched (context only), and #3532's Check and send hunks untouched.

## Issues, ranked
1. **Major (Must): the shared cache key crashes Settings › Retainer templates** (`web/.../retainers/retainer-page.tsx:37` uses `["fo","retainer-templates","all"]`, which is `templates-page.tsx:42`'s key). `Templates.parse` strips `warnings` and `updatedAt`. `templates-page.tsx:87` reads `t.warnings.length` from the cached rows before its refetch finishes, and the page crashes.
   *Scenario:* as the Owner, with a Potential conflict and no active template that prints the disclosure, press Send. Then follow the notice's "Add {conflict.disclosure} to one in Retainer templates", or the side menu's Retainer templates. The page shows "This page could not be shown" with `TypeError: Cannot read properties of undefined (reading 'length')` (probe B; screenshot `B2-templates-after-link.png`). The suite misses this because the error boundary swallows it: no `pageerror` fires.
   *Fix:* use a key of its own under the same prefix, for example `["fo","retainer-templates","pick"]`, so the page's prefix invalidation still refreshes it. Or parse the full row. Add a step that goes from the retainer page to Retainer templates and asserts its table renders.
2. **Major (Must): a newer version of the current template is mislabelled and cannot be chosen** (`retainer-page.tsx:79` and `:127`, `changed` at `:75`, the PATCH at `:51`).
   * `prints()` reads the list row, which holds the template's newest placeholders. The label shows `r.template.version`, the version the draft was made from.
   * Because `templateId === r.template.id`, `changed` stays false and the PATCH never sends `templateId`, so the edit keeps the old file (`service.ts` `currentTemplateFile`).
   *Scenario:* draft on "Plain", version 1. The Owner uploads version 2 of "Plain" with `{conflict.disclosure}`, which is the natural reading of "Add {conflict.disclosure} to one…, then choose it here".
   * The pick then shows "Plain · version 1 · prints the conflict disclosure" (false). "Choose a template that prints it" focuses a pick that is already on it, and Save stays disabled.
   * After changing a fee, Save makes version 2, still from template version 1, with `conflict.disclosure` null. Send is refused 409 again (probe A; `A-same-template-v2.png`).
   *Fix:* when the list's version is newer than `r.template.version`, offer the current template's newest version as its own choice. Base "prints" on the version that will actually be used, and send `templateId` when that version is chosen. The API already moves to the newest version when `templateId` is sent (`templateFor`). Add a test.
3. **Minor (Should): broken punctuation in the copy** (`retainer-page.tsx:112`). A person who can draft but not configure templates (Case Officer, Case Manager) reads "Ask your firm's Owner or Admin to add {conflict.disclosure} to a retainer template., then choose it here." Drop the full stop inside the string.
4. **Minor (Should): "None of your firm's templates prints it yet" can be false** (`:111-112`). `options.some(prints)` is false while the templates request is pending or has failed: `options` then holds only the made-up current entry. *Scenario:* `GET /retainer-templates` fails or is slow, Send is refused, and the notice says none prints it. Show the fix only once `templates.isSuccess`.
5. **Minor (Should): a 422 "switched off" leaves the pick stale** (`:45-49`; only a 409 refetches). After "This template is switched off." on Save, the pick still offers that template without " · switched off". Invalidate `["fo","retainer-templates"]` on a `templateId` field error.
6. **Minor (Should): test gaps** (`tests/check_fo5s_retainer_screens_browser.ts:179-229`). Neither "none prints it" branch is tested (with and without `configure-template`), there is no step into Retainer templates (finding 1), and the same-template newer version is untested (finding 2).

Not this PR's: at 1024 px the fee row's "what it is for" input is squeezed and "Remove" is clipped inside the card (`refused-1024.png`). The fee grid is unchanged by this diff.

## Correctness checklist (the brief)
| Point | Result |
|---|---|
| Option list | Active templates of this kind, plus the current one. Met. |
| Switched-off current | Stays listed with " · switched off". Met (code). |
| Removed current | Shown as "(removed)" and cannot print. Met (code). |
| Kind filter | `t.kind === r.kind`; the API also refuses another kind. Met. |
| `changed`, PATCH only when changed | Met for another template. Not met for a newer version of the same one (finding 2). |
| 422 on the pick | Shown on the field and nothing saved (suite). Met, apart from the stale list (finding 5). |
| Query key | No data clash with the card's exact key `["fo","retainer-templates"]`. Clashes with the templates page (finding 1). |
| Permissions | Everyone who can draft holds `retainer:list` (migration grants). Without `configure-template`, the "Ask your Owner or Admin" text shows (finding 3). Send is held only by drafters, so the read-only Send case cannot happen. |
| Accessibility | Labelled Select with its hint in `aria-describedby`. The link-style button moves focus to the pick, with visible focus. axe WCAG 2.2 AA shows no serious or critical finding at 1024 and 1440 px. No sideways scroll. Met. |

## D1–D20 (this fix only)
D1 Requirement fit ½: R1.53 / FO-13c main path met; the newer-version path fails (2) · D2 Data integrity 1: the gate holds, nothing is sent on refusal, v2 values are exact · D3 Reuse ½: duplicates the templates page's key with another shape (1) · D4 Rule integrity: N/A · D5 Stability ½: the templates page crashes (1) · D6 Freshness: N/A · D7 AI trust: N/A · D8 Orientation 1 · D9 Flow ½: the offered next step dead-ends (2) · D10 Language ½: the ".," error (3) · D11 Feedback ½: a false "prints" label (2) and a stale list (5) · D12 Visual 1 · D13 Accessibility 1 · D14 Team look 1: Field and Select as elsewhere · D15 Speed 1: one list request, no per-row requests · D16 Testability ½: the tests fail on main, but the gaps in (6) remain · D17 and D20: simulated only · D18 Provenance ½: the version shown is not the one that prints · D19 Closure ½: (1) and (2) break the Owner's fix-and-return loop.

## BIC (case-side scorecard; this fix's states)
Met: BIC-11 (one primary action per panel), BIC-12 (the gate refuses before the item leaves), BIC-19, BIC-20. Partly: BIC-13 (the refusal says what to do and where, but finding 2 dead-ends it), BIC-18 (finding 4). The other BIC checks are N/A to this fix (forms, documents and case structure).

## Journey test (reviewer role; the one score for this check)
Journeys: J1 a Case Manager or Owner with a Potential conflict and a draft on the starter: refused, "Choose a template that prints it", pick, Save v2, Send. Held: suite and a keyboard-only probe. J2 error: the chosen template is switched off before Save, gets a 422 on the field, and nothing is saved. Held. J3 empty: no template prints it, so the Owner follows the link. Broken: the page crashes (1). J4 alternate: the Owner adds the placeholder as v2 of the same template and comes back. Dead end (2). J5 wrong role: a Case Officer reads "Ask your Owner or Admin…" (copy defect 3; read in code, not walked). J6 recovery: reload after the refusal clears the notice, and Check and send asks again. Held.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | J1 yes; J3 and J4 no |
| Next step obvious | ½ | the action is offered; dead end in J4 |
| Plain words | ½ | "template., then" |
| Feedback and state | ½ | false "prints" label; stale pick after 422 |
| Correct data | 1 | v2 `conflict.disclosure` equals the check's text; v1 never sent; PATCH sends `templateId` only when changed |
| Error recovery | ½ | the 422 is handled; the recovery link leads to a crash |
| Accessibility and screen sizes | 1 | axe clean; keyboard path; focus moves to the pick; 375/1024/1440 px no sideways scroll |
| Speed | 1 | 48 steps in 17.6 s; no wait over 1 s seen |
| Visual quality | 1 | team Field and Select; the notice action sits right |
| Trust and sources | ½ | the pick claims the version prints the disclosure when it does not |

**Score 7/10. Below the pass mark (8, no 0); no criterion is at 0.** Most valuable raises: fix 2 (task, next step, feedback, trust), then 1 (recovery), then 3.

## Could not check
* An intended user's unaided walk (D17, D20) and a real screen reader.
* Real browser zoom at 200 %: I used the 375 px reflow check instead, because CSS zoom is not a fair stand-in.
* `graph.mjs`: not run, because it rewrites `qa/GRAPH.md` and this review may write only this file.
* The headless browser only; no visible-browser walk.

Reviewer: Changes 85d4feebb05d5155c0b076b5225f8cf6597e3cea
