# Fresh reader (P-339): R1.26 Public enquiry form, on main ca3b24fad (#2649 merged), 21 Nov

This reader did not build or test R1.26. It ran nothing that changes state. It read the code, `git show`, and the REST job logs.

## Verdict: **Works**, confidence high (about 85%). QA-617 can close. One Minor follow-up is below (F1).

## Runs (checked against GitHub)
* Runs 44837061226 (job 136636271818) and 44837165973 (job 136636623448): walks.yml, workflow_dispatch, head_sha ca3b24fad, conclusion success. The log says "walk j_26: 18 PASS, 0 FAIL" and "journey j_26: exit 0".
* The PASS/FAIL lines in each job log match qa's `walk_j26_job*.txt` line for line: 18 PASS each, no FAIL.
* `git diff --stat ce8e05b1d ca3b24fad -- S/api/src/front-office/sales/public.ts` is empty. So the fo4b pack (45/45 twice on ce8e05b1d) still carries the too-fast send and the rate limit. The only sales changes since then are audit before/after (`common.ts`) and the settings routes; neither touches the public door.

## 1. Each Done-when clause
* **An enquiry becomes a lead:** met. j_26 W2 (the embed from a campaign link: one WEB_FORM lead with attribution) and W4 (the hosted form: one lead, no campaign facts).
* **A bot is refused without saying why:** met.
  * The hidden field: j_26 W3 (thanked the same, nothing stored).
  * The too-fast send and the rate limit: the fo4b pack; `public.ts` is unchanged.
* **The same send twice makes one lead:** met. j_26 W3.
* **Each field's message on its field:** met. j_26 W4, by screens.
* **Switching on (QA-605) and linking the wording (QA-617), both in scope:** met. j_26 W1 switches the form on by screen. Its new check asserts that `consent_wording_version_id` equals the firm's set-up wording and that the audit `consentWordingVersionId_after` names it.

## 2. Gate A
* **The start:** where a new firm starts. `seedSampleFirmsFrontOffice` runs `seedFirmFrontOffice` and `ensureBookingWording`, the same pair `onFirmCreated` runs. The setup asserts the form is `false|none`: off, no wording.
* **The end:** W5, the Owner's Leads › Unassigned with both leads, which is R1.27's first step. Note: W5 opens it by URL, not by clicking the menu. This was accepted in qa12c and does not hold the gate.
* **Every SQL write left in the setup:** one, `j_26.ts:60`, `update fo_web_form set enabled = false, allowed_sites = '{}', thank_you_text = …`.
  * `enabled = false`: changes nothing on a fresh copy, because the seed creates the form off (`firm-seed.ts:118`). Not a capability step.
  * `allowed_sites = '{}'`: changes nothing, because the schema default is `[]`. W1 then adds the site by screen.
  * `thank_you_text`: outside R1.26 by ruling, and the seed already gives every form a thank-you text.
  * The wording link is gone. `firmWording` at `:56` is a read, not a write.
* **Gate A: met.**

## 3. A real new firm
* **The seed path:** `onFirmCreated` (`firm-seed.ts:151-155`) seeds the front office, then `ensureBookingWording` publishes the Sample EMAIL/MARKETING wording. `saveEnabled` (`web-form-settings.ts:139-146`) links that wording inside the switch's transaction. **So the Owner's switch succeeds with no database edit.**
* **A firm with no wording:** the switch answers 422 `NO_CONSENT_WORDING` on `enabled`, with nothing written. The page shows the message on the switch (`web-form-settings-page.tsx:127`): "This form cannot be switched on yet: your firm has no consent wording … and no screen sets one yet."
* **Is that reachable?** Yes, but only on a failure path. For example, the wording transaction fails after the seed transaction has committed. `seedCreatedFirms` then never retries, because it skips firms whose `seeded_at` is set. A firm seeded before part 3b is in the same position until someone opens its booking page.
* **The inconsistency:** the booking page heals this quietly (`arrival-port.ts:96-100` calls `ensureBookingWording`). The switch does not, and the message gives no way forward (review m1).

## 4. Defects in #2649
* **Right wording?** Yes. Same firm, EMAIL/MARKETING, the same rule as the booking page. `public.ts` shows and records that wording.
* **Newest-wording selection:** `publishedAt desc, version desc`. `publishedAt` is not null, so there is no NULLS FIRST trap.
  * There is no locale filter. That matches the booking page; only en-CA exists today.
* **Audit:** one line, with before and after `{enabled, consentWordingVersionId}`. Switching off keeps the link and the line names it unchanged. The second `findFirst` for `linked` is redundant but harmless.
* **Races:** `FOR UPDATE` row lock, then the version check (409 STALE), then the wording read, update and audit, all in one transaction. Of two concurrent switch-ons, one wins and the other gets STALE.
* **No defect found.** Two known Minors remain:
  * m1: the refusal names no fix.
  * m2: the pack's 422 case uses a stand-in database; the reviewer probed the real server by hand.
* **By design, not a defect:** a form keeps its first wording when a newer one is published, which preserves the consent evidence. Choosing another wording is a later part.

## 5. BUGS.md
* **QA-617 can close.** Its close condition is met: the switch links the wording through the server, no SQL link is left in j_26, and the walk is green twice on main's head.
* **Other open rows naming R1.26:** none. A search for R1.26, web form, FO-4 and J-26 finds only QA-501 (R1.27) and QA-606 (R1.27), and neither holds R1.26.
* **F1, a new Minor to log (it does not hold Works):** a firm that lacks a wording cannot switch its form on and is told nothing it can act on. The booking page self-heals in that case and the switch does not.
  * The narrow fix: call `ensureBookingWording(tx, firmId)` in `saveEnabled` before the read, or make `seedCreatedFirms` also retry a missing wording.
  * Either way, test the real refusal path (m2).

## 6. Verdict
**Works** on runs 44837061226 and 44837165973 (main ca3b24fad), with the fo4b pack and this reading. Confidence about 85%. The remaining doubt is F1's narrow failure path and W5 opening the page by URL.
