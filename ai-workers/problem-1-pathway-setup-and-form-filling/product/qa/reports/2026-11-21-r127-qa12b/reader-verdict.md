# R1.27 "Every lead carries a source": fresh reader's verdict (qa 12b, 21 Nov)

Reader: a fresh Opus 5.5 reader (P-339). I did not build or test this capability and ran nothing: I only read files, `git show`, and the REST `gh api` (PR #2612, walks.yml runs, job 136684206039's log). Main 2d036c65c has the same studio tree as ce1472916 (`git diff ce1472916 2d036c65c -- studio` is empty).

## 1. Each clause
- **Form (hosted):** met by screens. `j_27.ts:66-76` W1: a visitor fills the hosted form in the browser and it becomes a WEB_FORM lead with the form's source (WEBSITE). The lead shows "Website form" on Leads (W5, `:132-134`).
- **Embed with campaign:** met by browser test plus API. `:79-92` W2: the send is the script's POST with the Origin `https://firm.example` and UTM fields. It makes a WEB_FORM lead with the same source and `utm_campaign` stored. The lead's page shows "Website form · Website enquiry form" and the campaign (job log). This follows P-628: both stay "Website", and the form type is a detail on the lead.
- **Manual:** met by screens. `:95-110` W3: the Owner clicks Add a lead, presses Save with no source, sees "Pick a source." and nothing is saved. With "Phone call" it saves a MANUAL lead with that source, owned by the Owner, and the page shows it. The API also refuses it (`leads.ts:139` `required: true`; fo4al AL2 checks a 422 on `fields.source`).
- **Refused by the database:** met underneath. `:113-116` W4: inserting a NULL source fails, inserting a blank source fails, and no lead of the firm is without a source. qa's `check_r127_lead_source.ts` gave 5/5 twice.
- **Lists filter by source:** met by screens. `:119-134` W5: on Leads › All open, the Source "Phone call" filter shows only the manual lead and "Website form" shows only the two web leads. Pipeline is covered by `check_fo4sf_source_filter.ts` (34/34 twice). Import is dropped (QA-494 ruling).
- **The form switched on by SQL (`:48`), and the embed sent by script rather than drawn:** neither matters for R1.27.
  - Both are R1.26's steps, and R1.26 is Works by screens (j_26 switches the form on in Settings and walks the drawn embed in W2).
  - R1.27 is about the source each door stamps. The embed calls the same `submit` route, and W2 proves the source and campaign are kept and shown.
  - Non-blocking: #2612's own follow-up S5 says J-27 should use #2556's switch. That would be tidier.

## 2. Gate A
- **Start:** met in substance. J-26 ends on the Owner's Leads › Unassigned with two web leads (`j_26.ts:161`). J-27 rebuilds that state on a fresh copy (W1 and W2) and continues from it.
- **End:** met. J-27 ends on the manual lead's page (`:135-137`), which is R1.28's first step: the lead's page, where its consent is read.

## 3. #2612 Add a lead (merged 20 Nov 22:18 UTC, a4bd0f47f)
- **Source required:** in the panel (`add-lead-panel.tsx:35`, "Pick a source."), in the API (`leads.ts:139`), and in the database (NOT NULL plus the blank check).
  - Stored codes such as WEBSITE are not offered as suggestions (`:26-29`).
  - Minor, not in Done when: the server would still accept "WEBSITE" typed by hand.
- **Permissions:** `POST leads` needs `agent/prospect:create` (`routes.ts:45`). The button appears only with that key (`leads-page.tsx:75`). fo4al AL1: a Read-only user sees no button and the API answers 403 with nothing saved.
- **Audit:** the manual add goes through `arrive()`, which writes one `lead.created` audit line and an outbox event (`arrival.ts:105-112`). `check_fo2_leads_prospects.ts:368` checks one line per lead. fo4al does not check the audit line itself, but it uses the same server path.

## 4. Open rows
- **QA-606:** can close. Add a lead by screens is on main, with source required, the permission and the audit line, and it is walked by j_27 W3 and fo4al (27/27).
- **QA-501:** does not hold Works. It is a Minor about re-running the fo4sf pack on one database; fresh copies pass, and j_27 can be re-run because its names carry a run stamp.
- No other open row naming R1.27 blocks a clause.

## 5. Verdict
**Works, if the second walks.yml `j_27` run on main's head is green.** Confidence about 85%.
- **Proof so far:**
  - walks.yml run 44851612622 (job 136684206039) passed 11/11 on ce1472916, which has the same tree as 2d036c65c.
  - qa re-ran it locally on 2d036c65c: 11/11 twice.
  - This reader adds the fresh read.
- **Still needed:** at the time I read (02:0x UTC), no second walks dispatch was listed for main's head.
- **If that run fails, or is never run:** the verdict is Partial.
