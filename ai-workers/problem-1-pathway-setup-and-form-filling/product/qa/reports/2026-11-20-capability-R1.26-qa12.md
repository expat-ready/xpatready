# qa 12 — R1.26 Public enquiry form, hardened against abuse: parts missing on main ce8e05b1d, 20 Nov

qa 12 is a cloud session (Opus 5.5, effort medium), run as `/qa capability R1.26, then R1.27, then R1.30`. It used isolated copies only, never :4400. Live AI off, US$0.

FO-4b (the embed script, #2451) merged as ce8e05b1d. That was the last part MVP-CHECKLIST row 26 listed.

## Verdict
**Partial, parts missing: FO-4w. No verdict (P-606).**
* **What FO-4w is:**
  * FO-2's web-form settings API;
  * FO-4's settings panel, with the snippet and a Copy button;
  * `tests/journeys/j_26.ts`.
* **This matches the Lead's ruling on #2451:** "the settings panel … and `tests/journeys/j_26.ts` with `Completes: R1.26` are the next row, FO-4w … R1.26 stays Partial until then".
* **The failing clause, by screens (gate A):** a firm cannot switch its web form on, set its consent wording or allowed sites, or get the snippet through the product. So by screens, no visitor's enquiry reaches a new firm: **QA-604**, new.
* **No GitHub walks:** no `j_26.ts` exists, so walks.yml has nothing to run and none was asked for.

## The runs (main ce8e05b1d, here, fresh isolated copies)
| Pack | Result | What it shows (with the form switched on by SQL) |
|---|---|---|
| `tests/check_fo4_sales_browser.ts` (`2026-11-20-r126-qa12/fo4_{1,2}.txt`) | 45/45 twice | The hosted form: each field's message on the field, the thank-you, a form switched off, an unknown token |
| `tests/check_fo4b_embed_browser.ts` (`2026-11-20-r126-qa12/fo4b_{1,2}.txt`) | 45/45 twice | The embed on an allowed site: one lead per submission, campaign onto attribution, honeypot and too-fast send refused without saying why, 429 "Too many requests" with answers kept, field messages, no cookie or storage |

## Each Done-when clause (fresh Opus reader, `2026-11-20-r126-qa12/reader-verdict.md`; checked by qa)
| Clause | Hosted form | Embed |
|---|---|---|
| An enquiry becomes a lead | met (browser) | met (browser) |
| A bot refused without saying why (hidden field, too fast, rate limit) | met by API (`public.ts:117`, `:174-180`, `:161-169`) | met (browser) |
| The same send twice makes one lead | met by API (`intakeKey`, `public.ts:122`) | met (browser; the breaker sent 8 at once and got 1 lead) |
| Each field's message on the field | met (browser) | met (browser) |

All of these hold only after a database edit. The firm's side has no screen: `firm-seed.ts:118` creates the form with `enabled: false`, and no route writes `fo_web_form`.

## Findings
* **QA-604, new** · Gap · Major · R1.26 and R1.27.
  * **The gap:** no product path switches a firm's web form on or sets it up.
  * **The records:** FO-4w, which the Lead promised on #2451, is in no BACKLOG row. MVP-CHECKLIST row 26 still says "part missing FO-4b".
  * **The number:** self-assigned; the Lead may renumber it.
* **Reader notes, kept here (no new rows):**
  * *Minor:* the rate limit is an in-memory map in each process (`public.ts:162-169`). It resets on restart and is not shared between instances. Note it before a multi-instance deploy.
  * *Minor, FO-2 wording:* a first name of "!!!" gets "this is required." on the field. That is the wrong reason.
* **#2451's accepted Minors stay as the PR records them:**
  * a body over 32 KB, or a site removed while the visitor fills the form, reads as "check your connection";
  * the suite fills the address's minute limit;
  * graph.mjs does not see the OPTIONS route.

## Questions for the tech lead
1. **Please shape row FO-4w** (QA-604), and include FO-2's settings API, not only the panel and snippet:
   * on/off;
   * consent wording;
   * thank-you text;
   * allowed sites;
   * Owner and Admin only, audited.

   Also update MVP-CHECKLIST row 26's parts.
2. **QA-604's number** is self-assigned. Please confirm it or give a block.
