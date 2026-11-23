# QA-758 review: notarisation needed shows on the checklist line (R1.70, Lead 14's ruling on #3323)

PR #3327 · branch `claude/runtime-qa758-notarisation` · reviewed head `4230c38e7a1f7388f002fb68bf1a94321cbd475e` · base origin/main · reviewer (fresh context, did not build it) · 2026-11-23

**Verdict: Approve** (Ship). No open Blocker or Major. Two Minor items and two Nits below, none a reason to hold the PR.

## What I ran (isolated copies from run-suites, ports +14000, never :4400, live AI off)
* `run-suites.sh --only check_csd5_flags_browser.ts` on the head: **40/40, exit 0** (66 s). Includes QA-758 fail step, "line keeps its state", axe 0 serious/critical at 400 px, no sideways scroll at 1440 and 400 px, the Provided pass, the type's-default (Not required) pass, audit count 13, no console errors.
* **Red before (mutation):** I disabled only the new push (`if (false && notarisation === "REQUIRED")`, case-document-flags.ts:54) and re-ran the suite: **FAIL "QA-758 fail: ... naming notarisation — []"**, exit 1. The test fails when the rule is removed. Restored with `git checkout`; this matches the builder's 39/40 at 6ba7df238.
* `check_csd5_flags.ts` 41/41 and `check_c76_readiness.ts` 91/91, both exit 0. `graph.mjs --check` exit 0 (G1 0, G2 0, G4 0, G5 0).
* `flagWarnings` / `flagsOf` called directly for seven staff/type pairs (a throwaway script, deleted). Results: (null, REQUIRED) gives key `notarisation|doc|type`; (REQUIRED, null) and (REQUIRED, REQUIRED) give `|staff`; (null, NOT_REQUIRED), (null, null), (PROVIDED, REQUIRED) and (NOT_REQUIRED, REQUIRED) give none. In every case `flagsOf().notarisation` shows the same value the warning uses.
* I restored the CS-D7 screenshots the suite rewrote. The tree is clean apart from this file and the journey report.

## The questions asked
* **Was putting the rule in the API needed and right? Yes.** The panel's own rule (panel.tsx:2) is "every rule is the server's". The line's `flag_warnings` already comes from `flags.warnings` (case-checklist.ts:208), so a rule only in checklist.tsx would copy a server rule into the client. It would also leave readiness out, and AG-7 (Reviewer deficiencies, "a missing translation or notarisation") asks readiness to name it. One line in `flagWarnings` reaches three places: the line, the flags dialog's warning list (panel.tsx:87) and readiness (case-prepare.ts:681 → readiness.ts:256). The PR body states the change from the touch list and why ("never deviate silently" is met).
* **Effective value:** `d.notarisation ?? t?.notarisation_rule` (case-document-flags.ts:53) matches `flagsOf` (lines 69–70). `t` is the type from the case's pinned release, the same input expiry and age already use. Lines marked not applicable or waived get no warning (case-checklist.ts:208; flagWarningsOf skips `off`).
* **Pass key** `notarisation|<doc>|staff|type`: it does not change from day to day; a new file has a new id and so a new key. A pass given for the type's Required does not cover a Required that staff set later (#3180 R3-m3). Correct.
* **Readiness:** a new `document_flag` warning, which can be passed with a reason, now appears wherever notarisation is Required and not Provided. It is never added as a block (readiness.ts:256 calls only `warn`). No released type sets `notarisation_rule = REQUIRED` today (the only seeds/tests use NOT_REQUIRED), so no existing case changes until staff or the library set Required.
* **Words:** "Needs notarisation: when it is notarised, mark it Provided in Document flags with who notarised it and when. Nothing is blocked." They are plain, accurate (the menu item and the dialog are "Document flags", and the detail hint asks "who notarised it and when") and follow the expiry warning's pattern. One stale label in readiness: m1.
* **Chip:** Lead 14's ruling allows "a chip or warning", so the warning meets the row. AG-9 3.9 also describes chips on the Document row that show the flag state, such as Provided. That is wider than this row's ruling, so it is not a finding (P-26).
* **Test:** keyboard only (tabTo/type/Enter); axe 0; 400 px; the Provided and Not-required steps really go through the save path. The DB reads `PROVIDED`, then `notarisation is null` (back on the type's NOT_REQUIRED), and the audit count confirms both saves. **9 → 13 is correct:** Provided + its detail = 2 lines; back to the default + detail cleared = 2 lines.

## Issues, ranked
| # | Sev | Where | Issue | Fix |
|---|---|---|---|---|
| m1 | Minor (Should) | engine/runtime/readiness.ts:328 (and the type comment at :93) | `CODE_WORDS.document_flag` = "A document flag (expiry, age or translation)". A notarisation item now sits under a heading that does not name it. | "A document flag (expiry, age, translation or notarisation)"; update the :93 comment to match. |
| m2 | Minor (Should) | tests/check_csd5_flags_browser.ts:137–153; tests/check_csd5_flags.ts:28 | Only the staff-set Required is tested. With the type's default Required, the `\|type` key and the readiness item there is no test: removing `?? t?.notarisation_rule` (case-document-flags.ts:53) keeps every suite green. | In check_csd5_flags.ts, add an API step on a type with `notarisation_rule: "REQUIRED"` (cited). Assert `flags.warnings` has "Needs notarisation", readiness has a `document_flag` warn with `part` `notarisation\|<doc>\|type` and no block, and staff Required then raises `\|staff`, which that pass does not cover. |
| n1 | Nit | api/src/case-document-flags.ts:12–13 | The header's rule (4) lists expiry and age only. | Add "or a notarisation Required and not Provided (QA-758)". |
| n2 | Nit | api/src/case-document-flags.ts:54 | Staff Required on top of the type's Required changes the key, so an earlier pass is asked again although the value in force did not change. This follows the #3180 lesson, recorded only. | None needed. |

## D1–D20 (1–5, scoped to this row)
D1 5: matches Lead 14's ruling, AG-9 3.9 and AG-7 rule 4 · D2 5: a value worked out on read, nothing stored, audit 13 · D3 5: reuses flagWarnings, no second copy · D4 4: type-default path untested (m2) · D5 5: the 409 version path is unchanged · D6 n/a · D7 n/a (no AI) · D8 5: on the person's line · D9 5: the words name the next step · D10 4: m1 · D11 5: the warning goes on save · D12 5: same text-warn style as expiry (CSD7-05 screenshots) · D13 5: keyboard, axe 0, 400 px · D14 5: same component · D15 5: computed in the existing loop, no request per row · D16 4: red on removal confirmed; m2 · D17 simulated only · D18 4: the dialog shows the source ("from the document type"); the line does not, as for expiry · D19 5: line → dialog → Provided → gone; readiness by code · D20 simulated only.

## BIC (EXPERIENCE.md §6), only those this change touches
BIC-04 Met: a warning, never a refusal · BIC-13 Met: the existing "Provided needs its detail" refusal is unchanged · BIC-14 N/A: no new chip or icon · BIC-18 Met: no warning when nothing is needed · BIC-19 Met: one line of text, no new button · BIC-20 Met: keyboard path and axe 0 at 400 px (no new 1024 shot for this state; the expiry state at 1024 uses the same component) · the other BIC checks N/A (no questions, forms or sign/submit touched).

## Journey score (reviewer, the one score for this check): **9/10, pass**. Details in `journey-test-reviewer-2026-11-23.md`.

## Not checked
qa's j_70 (not on main; the builder reports 29/29). A real screen reader. 200 % zoom (no layout change). An intended user's unaided walk (D17/D20 stay with the founder).

Reviewer: Approve 4230c38e7a1f7388f002fb68bf1a94321cbd475e
