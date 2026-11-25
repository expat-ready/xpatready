# qa 12 — R1.26 Public enquiry form: proof after FO-4w, main 1aa4c7210, 20 Nov

qa 12 is a cloud session (Opus 5.5, effort medium). It used isolated copies only, never :4400. Live AI off, US$0. It was asked by the tech lead (Lead 4, series 3), after FO-4w (#2525) merged at c5967c56a: "prove R1.26 now on main's head".

Main's head is `1aa4c7210`. Its app tree is the same as c5967c56a's, and it is unchanged up to `f0b4fb03c`.

## Verdict
**Partial, held by QA-605 (Gap · Major).** All the parts named on #2451 have merged, and every Done-when clause holds once the form is switched on. But no screen switches the form on, or sets its consent wording and thank-you text. So gate A by screens cannot start where a firm starts.
* **If the tech lead rules that switching the form on is outside R1.26,** R1.26 becomes Works after two green walks.yml `j_26` runs on main's head. QA-605 then stays open against FO-2 and FO-4.
* **The fresh Opus reader** reached the same verdict independently: Partial, held by QA-605, about 85%.

## The runs
| Run | Where | Result |
|---|---|---|
| item-proof (Completes: R1.26), on c5967c56a | GitHub, [run 44743324739](https://github.com/expat-ready/xpatready/actions/runs/44743324739), prove job 136312494984, artifact 14631837332 | PASS (`j_26.ts`) |
| walks.yml `j_26` on main's head, twice | asked of the Lead on #2525 (comment 7041019248, 13:41 UTC) | **not dispatched** by 14:4x UTC. The Lead's two dispatches at 14:06 UTC walked `j_48` |
| `tests/journeys/j_26.ts`, fresh copy, twice | here (`2026-11-20-r126-qa12b/j26_{1,2}.txt`) | 15/15 twice |
| `tests/check_fo4w_web_form_settings_browser.ts`, twice | here (`fo4w_{1,2}.txt`) | 31/31 twice |
| `check_fo4_sales_browser.ts` and `check_fo4b_embed_browser.ts` on ce8e05b1d | `2026-11-20-r126-qa12/` | 45/45 twice each. These cover the too-fast send and the rate limit, which j_26 does not walk. The public path has not changed since, except `snippet.ts`, which j_26 W2 draws |

## Each Done-when clause, once the form is on
* **A visitor's enquiry becomes a lead:** by screens.
  * j_26 W2: the embed from a campaign link; one lead, door WEB_FORM, attribution spring/google/cpc plus the click id; no cookie or storage left.
  * j_26 W4: the hosted form.
* **A bot refused without saying why:**
  * the hidden field: j_26 W3, by screens;
  * a too-fast send and the rate limit: the fo4b pack, in the browser.
* **The same send twice makes one lead:** j_26 W3.
* **Each field's message on the field:** j_26 W4, by screens.

## Gate A
* **It ends at R1.27's first step: PASS.** j_26 W5 shows both leads on the Owner's Leads › Unassigned.
* **It starts after an SQL edit: FAIL (QA-605).** `j_26.ts:54` runs `update fo_web_form set enabled = true, … consent_wording_version_id = …, thank_you_text = …`.
  * **What a person sees:** a new firm's Owner opening Sales › Settings › Web form reads "This form is off" (`web-form-settings-page.tsx:109`) and has no way to switch it on. `firm-seed.ts:118` creates every firm's form switched off.
  * **The code:** the only write to `fo_web_form` is FO-4w's allowed-sites save (`web-form-settings.ts:96`).
  * **#2525's own body** says on/off, consent wording and thank-you text "are not in this row".

## The fresh reader (Opus, fresh context, ran nothing)
`2026-11-20-r126-qa12b/reader-verdict.md`.
* **Verdict:** Partial, held by QA-605, 85%.
* **Who owns these settings:** they are R1.26's own parts. FO-2's row says "web-form settings (on/off, allowed sites, consent wording version, thank-you text) …"; FO-4's row says "its settings panel", and its test starts "form on → sent". No other capability owns them: row 28 records consent per purpose, and row 50 is notification settings.
* **FO-4w on main:** no Blocker or Major in its own scope. The breaker's and review's items are fixed. The Minors left:
  * Remove does not clear the summary of refused rows;
  * a reordered list writes an audit line;
  * unsaved rows are lost on reload;
  * the http:// sites question still waits on the Lead.

## The tech lead's ruling recorded here
On the Source question (P-628, reversible), embed and hosted leads both keep the source "Website". The form type is a detail on the lead; an X-row for a separate source comes later. It does not block R1.26 or R1.30.

## Findings
* **QA-605**, open: re-seen after FO-4w, with the evidence added to its row.
* No new rows.

## Questions for the tech lead
1. **QA-605:** please rule on one of two options.
   * **Inside R1.26 (the reader's and qa's view):** shape one small FO-2/FO-4 row for the on/off switch, the consent wording version and the thank-you text, on the existing Web form page, Owner and Admin, audited. j_26 W1 then switches the form on by screens.
   * **Outside R1.26:** R1.26 becomes Works on two green `j_26` walks.
2. **Please dispatch walks.yml `j_26` twice on main's head:** `gh workflow run walks.yml --ref main -f journeys="j_26"`. The two runs at 14:06 UTC walked `j_48`.
