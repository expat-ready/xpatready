# qa 12 — R1.27 Every lead carries a source: parts missing on main ce8e05b1d, 20 Nov

qa 12 is a cloud session (Opus 5.5, effort medium), run as `/qa capability R1.26, then R1.27, then R1.30`. It used isolated copies only, never :4400. Live AI off, US$0.

FO-4b (the embed, #2451) merged as ce8e05b1d. That was the "part missing" in the earlier records.

## Done when, amended (QA-494, the tech lead's ruling: a wording fix)
"Every lead has a source (form, embed with campaign, manual; import when AG-18's engine lands); a lead without one refused by the database (fail case); lists filter by source."
* **Import is dropped:** AG-2-7 is an adapter on AG-18's engine, which has no row yet (AG18-D2).
* **MVP-CHECKLIST row 27** already says this.
* **QA-494 is closed** in `qa/BUGS-CLOSED.md`.

## Verdict
**Partial, parts missing. No verdict (P-606).** The missing parts:
* **FO-4w** (allowed sites and the snippet; in flight as #2525) **and the web-form on/off, consent wording and thank-you settings** (no row; QA-605, from R1.26's record, #2533);
* **an Add a lead screen:** QA-606, new;
* **J-27:** `tests/journeys/j_27.ts`, a BACKLOG row that is not built.

No `j_27.ts` exists, so walks.yml has nothing to run and none was asked for.

## Each clause (fresh Opus reader, `2026-11-20-r127-qa12/reader-verdict.md`; checked by qa)
| Clause | On main ce8e05b1d | By screens? |
|---|---|---|
| Form | The hosted send writes door WEB_FORM and source WEBSITE (`public.ts:122-123`). `check_fo4_sales_browser.ts` 45/45 twice (`2026-11-20-r126-qa12/fo4_{1,2}.txt`). | Visitor's side yes. The firm cannot switch the form on: **QA-605** |
| Embed with campaign | utm and click id go onto the lead's attribution. `check_fo4b_embed_browser.ts` 45/45 twice (`2026-11-20-r126-qa12/fo4b_{1,2}.txt`; the reader's file cites them under r127-qa12, where they were first written). | No: allowed sites are set by SQL (**QA-605**) |
| Manual | `POST /api/front-office/leads` requires a source (`leads.ts:139`). | **No: there is no Add a lead control in `web/src` (QA-606)** |
| Refused by the database | `source TEXT NOT NULL`, `door NOT NULL`, and a CHECK refuses a blank source (fo1a migration). qa's `tests/qa/check_r127_lead_source.ts` 5/5 twice (`r127src_{1,2}.txt`). | n/a (underneath) |
| Lists filter by source | Source control on Leads and on Pipeline (List and board), inside visibility. `check_fo4sf_source_filter.ts` 34/34 twice (`fo4sf_{1,2}.txt`). | Yes |

**Gate A: FAIL.**
* By screens, a firm can make no lead at all: no form lead, no embed lead and no manual lead.
* Only the source filter and the database refusal are met.

## Findings
* **QA-606, new** · Gap · Major · R1.27, screens (FO-4).
  * **What is missing:** no screen adds a lead by hand, so a phone or walk-in enquiry cannot be recorded.
  * **The tracking gap:** FO-4's row names Add a lead, but no merged part built it and no open row tracks it.
  * **The number:** self-assigned.
* **QA-605** (opened with R1.26's record, #2533, merged) also holds R1.27's form and embed doors.
* **Reader notes, kept here (no new rows):**
  * *Observation, for the founder:* an embed send and a hosted send are recorded the same way: door WEB_FORM, source WEBSITE (AG-2-5). Only the attribution differs; the embed adds the landing and referring page.
    * The Source filter cannot tell hosted leads from embed leads.
    * The hosted page sends no attribution, so a hosted visit with `?utm_campaign=` loses the campaign.
  * *Test gap, Minor:* qa's `check_r127_lead_source.ts` does not try an empty or whitespace source. The CHECK constraint covers it, but no check proves it; qa adds the line in a later round.
  * *Records:* J-27's row (BACKLOG) waits only on FO-2 and FO-4. It should also wait on FO-4b, FO-4w, the QA-605 settings and the Add a lead panel.
* **QA-501** (Minor: the source-filter pack is not re-runnable on one database) stays open.

## Questions for the tech lead
1. **Add a lead (QA-606):** is it part of the web-form settings row QA-605 asks for, or a row of its own? J-27 needs it for the "manual" door.
2. **Founder question:** should "came by the embed" be its own source, so leads can be filtered by it? Or is attribution enough (AG-2-5 says WEBSITE)? Should the hosted page also send utm values?
3. **QA-606's number** is self-assigned.
