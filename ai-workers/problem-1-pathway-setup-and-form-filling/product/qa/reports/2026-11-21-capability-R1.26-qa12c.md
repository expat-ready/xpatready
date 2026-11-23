# qa 12 — R1.26 Public enquiry form: proof after #2556, main 3abfe81cc, 21 Nov

qa 12 is a cloud session (Opus 5.5, effort medium), asked by the tech lead (Lead 8): "score R1.26 on main's head with a fresh Opus reader", after #2556 (the web form's on/off switch, QA-605) merged at 03:12 IST. Live AI off, US$0.

## Verdict
**Partial, held by QA-617 (Gap · Major, new).** No real firm can switch its form on:
* the new switch refuses a form that has no consent wording;
* no seed, route or screen links one.

`j_26` passes only because its setup links a wording by SQL (`j_26.ts:58-60`).
* **If the tech lead rules the wording link outside R1.26** (the QA-605 ruling put consent wording out of the Done when), R1.26 is Works on the runs below.
* **qa and the fresh reader's view:** that ruling's own reason, "a firm that can only take enquiries after an SQL change does not have the capability", applies here too.

## The runs (main 3abfe81cc)
| Run | Where | Result |
|---|---|---|
| Pack: walks.yml `j_26` | GitHub, [run 44823507364](https://github.com/expat-ready/xpatready/actions/runs/44823507364), job 136590488197, artifact 14672836971 | 17 PASS, 0 FAIL (`2026-11-21-r126-qa12c/walk_j26_job136590488197.txt`) |
| Independent re-run: walks.yml `j_26` | GitHub, [run 44823699814](https://github.com/expat-ready/xpatready/actions/runs/44823699814), job 136591027527, artifact 14672508701 | 17 PASS, 0 FAIL (`walk_j26_job136591027527.txt`) |
| item-proof on 3abfe81cc | GitHub, run 44822723735 | success (j_26 17/17 and the recording scan) |
| fo4 and fo4b packs on ce8e05b1d | `2026-11-20-r126-qa12/` | 45/45 twice each. They carry the too-fast send and the rate limit; `sales/public.ts` is unchanged since |

Both walks were dispatched by the Lead, together with j_100.

## Each Done-when clause, once a wording is linked
* **An enquiry becomes a lead:** j_26 W2 (the embed from a campaign link, with attribution) and W4 (the hosted form). One WEB_FORM lead each.
* **A bot refused without saying why:**
  * the hidden field: j_26 W3;
  * a too-fast send and the rate limit: fo4b ("Too many requests. Please wait a minute" is a person's retry hint; it says nothing about bots).
* **The same send twice makes one lead:** j_26 W3 (the replay answers 201; one lead).
* **Each field's message on its field:** j_26 W4, by screens.

## Gate A and QA-605
* **The start, now:**
  * the form is off at setup;
  * W1 proves the off state: the page says so, and the public read and send both answer 404;
  * the Owner switches it on by screens, with one audit line (before false, after true).
* **QA-605 is closed** by the close condition in the tech lead's ruling. Both walks are green on main, with no SQL `enabled = true`.
* **The end:** W5 lands on Leads › Unassigned with both leads, which is R1.27's first step.
* **Still before W1, by SQL** (`j_26.ts:58-60`):
  * the thank-you text: harmless, because the seed already gives every form one;
  * the consent wording: **not harmless**. `saveEnabled` answers 422 NO_CONSENT_WORDING without it (`web-form-settings.ts:134-136`). `firm-seed.ts:118` creates every form without one, and outside the tests nothing writes `consent_wording_version_id`. So a real Owner's press is always refused, and the page offers the switch before that is known (#2556's review m4). #2556's builder asked the same question in its PR body.

## #2556's switch (the reader read the code)
* **The route:** `PUT web-forms/:id/enabled`, key `agent/prospect:configure-form`, held by Owner and Admin only. The fo4w pack covers Read-only and Case Officer 403, signed-out 401, another firm's form 404, a stale version 409, and a bad body 422.
* **The write:** one transaction with the row locked and its version checked, plus one audit line. Sending the same state again writes nothing.
* **Off closes the public door:** the read and the send go through one check (`public.ts:153-158`). The send re-reads the form.

## Findings
* **QA-605: closed** (`qa/BUGS-CLOSED.md`).
* **QA-617, new** · Gap · Major.
  * **The gap:** no real firm can switch its web form on, because the switch needs a consent wording and nothing links one.
  * **A cheap fix the reader proposes:** link each form at seed to the firm's Sample email-marketing wording, which every firm already gets (`ensureBookingWording`, `firm-seed.ts:143`). Or let the Web form page choose a wording.
  * **The number:** self-assigned. QA-608 to QA-616 are taken by open PRs or main.

## Questions for the tech lead
1. **QA-617:** is linking a consent wording inside R1.26? This is the same reason as your QA-605 ruling.
   * **If yes:** a small row (the seed link, or a wording picker on the Web form page). j_26 then drops the wording SQL and is re-walked twice.
   * **If no:** R1.26 is Works on runs 44823507364 and 44823699814, and QA-617 stays open on its own.
2. **Please read and label this records PR.**
