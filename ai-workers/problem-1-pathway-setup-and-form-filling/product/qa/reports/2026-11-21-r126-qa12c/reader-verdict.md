# R1.26 Public enquiry form, hardened against abuse: fresh reader's verdict (P-339)

Reader: independent, read-only (files, `git show`, REST `gh api`), 21 Nov 2026, main 3abfe81cc (merge of #2556). Ran nothing. P = `product/`, S = `prototype/studio/`.

**Verdict: Partial (confidence: medium-high).** QA-605's close condition is met as written, but the switch cannot switch on a new firm's form, so a new firm still needs a database edit before any enquiry can reach it. That is the gap the ruling set out to remove. If the tech lead confirms the ruling stands with this known, R1.26 is Works on its letter.

## Evidence on main 3abfe81cc (GitHub)
- walks.yml run 44823507364 (job 136590488197) and run 44823699814 (job 136591027527): both dispatched by the Lead (workflow_dispatch), both on 3abfe81cc, each **17 PASS, 0 FAIL, "17/17 passed"**, with video and traces.
- item-proof run 44822723735 on 3abfe81cc: `prove (R1.26)` success. It ran only `tests/journeys/j_26.ts` (17/17) plus the recording scan.
- The too-fast send and the rate limit are not walked by j_26. They have no run on main's head. Their evidence is qa's fo4b pack, 45/45 twice, on ce8e05b1d (`reports/2026-11-20-r126-qa12/fo4b_*.txt`: "a send under 2 s ... thanked the same and nothing is saved"; "past the per-address limit ... Not sent ... no lead"). `sales/public.ts` is unchanged from ce8e05b1d to 3abfe81cc, so I count it as carried, not as re-proven.

## 1. Done when, clause by clause
- **A visitor's enquiry becomes a lead:** met by browser test. j_26 W2 (embed, attribution kept) and W4 (hosted) each make one `WEB_FORM` lead, on both walks. Caveat: the form's consent wording is linked by SQL first (see 3).
- **Bot refused without saying why:**
  - Hidden field: met by browser test (j_26 W3, the bot is thanked the same and nothing is stored).
  - Too fast: met by browser test (fo4b, ce8e05b1d).
  - Rate limit: met by browser test (fo4b, ce8e05b1d). The limit answers "Too many requests. Please wait a minute", which is a retry hint for a person, not the bot rules. I accept it.
- **The same send twice within minutes makes one lead:** met by API inside the browser walk (j_26 W3: the replay answers 201, and there is 1 lead).
- **Each field's message on its field:** met by screens (j_26 W4: an empty send shows each message on its field and nothing is stored).

## 2. Gate A
- **The end:** met. The walk ends at R1.27's first step: W5 shows both leads in the Owner's Leads › Unassigned.
- **The start:** only partly met.
  - What changed: setup now leaves the form off (`enabled = false`, asserted as `f`). W1 first proves the off state: the page says "This form is off" and the public read and send both answer 404 "not available". The Owner then presses "Switch the form on". j_26 checks the stored value (`t`) and exactly one audit line `fo.web_form.enabled_changed` with before false and after true.
  - What is still not where a firm starts: the setup SQL still writes `consent_wording_version_id` (a wording published through ConsentStore) and `thank_you_text` (j_26.ts:58-60). A new firm's form has no wording (`firm-seed.ts:118`). `saveEnabled` refuses to switch on a form with no wording: 422 `NO_CONSENT_WORDING` (`web-form-settings.ts:134-136`, which enforces the DB check `fo_web_form_consent_check`). No route or screen links a wording to a form. So from a real firm's start, the switch always answers "cannot be switched on yet".

## 3. Can QA-605 close?
- **By the letter: yes.** The switch merged, and j_26 walks green twice on main with no SQL `enabled = true`.
- **SQL left in j_26:**
  - Thank-you text: outside the ruling, and harmless, because the seed already gives every form a thank-you text.
  - Consent wording link: outside the ruling by its words ("consent wording ... a later part"). But it now blocks the very switch the ruling asked for, which goes against the ruling's reason ("a firm that can only take enquiries after an SQL change does not have the capability").
- **My recommendation:** close QA-605 and open a new Major row: a new firm cannot switch its form on by screens, because no wording is linked. Or the tech lead re-rules. The builder raised the same question in #2556's body, and the reviewer recorded it as m4 with D19 = 3 and journey "Task completed" ½.
- **A cheap fix I noticed:** `ensureBookingWording` (`firm-seed.ts:143`) already publishes a Sample EMAIL marketing wording for each firm. Linking the form to it at seed, or offering "use this wording" on the page, would let the switch work.

## 4. Defects in #2556's switch
- **Route:** `PUT web-forms/:id/enabled` (`routes.ts:39-40`). It uses the key `agent/prospect:configure-form`, which is granted only to OWNER and ADMIN (`prisma/migrations/20261114015002_pf3_platform_tables/migration.sql:931-932`). The fo4w pack covers Read-only 403, Case Officer 403, nobody signed in 401, another firm's form 404, stale version 409, and a bad body 422.
- **Audit and locking:** the row is locked, the version is checked, and the update and the audit line are written in one transaction with `before` and `after` in full. Sending the state the form already has writes nothing.
- **Off really closes the door:** the public read and the public send both go through `form()` (`public.ts:153-158`), which answers "not available" unless `enabled` is true and the firm is TRIAL or ACTIVE. The send re-reads the form, so switching off takes effect at once.
- **Defects found:** none beyond m4: the switch is offered before a wording exists, and the refusal only shows after the press.

## 5. Open BUGS.md rows naming R1.26
- **QA-605** (Open) is the only one. It holds Works until qa closes it. No other open row names R1.26.

## 6. Verdict
**Partial, medium-high confidence.** Every clause has evidence and QA-605's condition is met, but a firm still cannot take its first enquiry without SQL (the consent-wording link). That goes to the tech lead to rule on, not for this reader to settle. If the tech lead keeps the ruling as written, the verdict becomes Works.
