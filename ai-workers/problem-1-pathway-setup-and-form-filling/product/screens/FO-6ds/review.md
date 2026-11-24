# FO-6ds review: "Send for signature" and "Signature requests" on the prospect page

Reviewer: screen-review agent, fresh context (did not build it), 24 Nov 2026. PR #3367, commit **7d30fe3ef3b1f2149b7351dc7a8f331f5e39e74e**. Read: `concept.md` (r2 with Lead corrections (a), (b)), `challenge.md` on `claude/nice-curie-tzbprl-fo6ds`, the diff, FO-6d `routes.ts`/`service.ts`, STANDARDS, EXPERIENCE, QUALITY, the PR body (its three recorded deviations). Ran on my own isolated copy `fo6ds_rev` on :4581 (never :4400), live AI off, US$0.

**Verdict: Block** (skill scale: Ship after fixes; one Major, a small fix). Journey score **9/10** (pass), `journey-test-reviewer-2026-11-24.md`.

## Evidence run
* `check_fo6ds_send_browser.ts 4581 fo6ds_rev`: **47/47 PASS, exit 0** (re-run on the exact commit by someone other than the builder).
* My own walk (Playwright script, scratchpad only, not committed): 10 journeys incl. keyboard at 1024 px and at 200 % zoom (512 px CSS, scale 2), wrong role, races, two tabs, Persian text, load error, download 410. Data checked in the database each time.
* `graph.mjs`: G1 0 (no route the web calls is missing). G3 lists the list, signers and download-link routes as "no page uses it". That is a gap in the tool: it does not parse `staffApi(...)` calls. The browser test does reach all three. qa should know about it; it is not this PR's fault.

## Findings
### Blocker
None.

### Major
**MJ-1. After the three "reload" refusals, the panel keeps a choice the person can no longer see or change, so every Send after that is refused again.** The concept (§4d) says SIGNER_NO_EMAIL and SIGNER_NOT_ON_PROSPECT reload the list and FIRM_SIGNER_NOT_IN_FIRM reloads the select, so the person can fix the choice in place. In the build the reload happens, but `picked` and `firm` are never cleared.
* `web/src/modules/front-office/sign/signature-requests.tsx:53` only refetches. `:122` renders `checked={picked.includes(...)}` together with `disabled={!p.hasEmail}`, so the row is ticked and locked. `:130-132` binds the select to a `firm` id that is no longer an option.
* What I saw on :4581:
  * **No email (J4):** Client E is ticked, then E's email is removed and the person clicks Send. They see "Client E Sample has no email address. Add an email first." The row reloads ticked **and** disabled (`[checked true, disabled true]`). The second Send gets the same refusal and adds no row.
  * **Not on the prospect (J4b):** Client D leaves the company. After the refusal D's row is gone, but D's id is still in `picked`. The person ticks B and clicks Send: "Each signer must be a person on this prospect." again.
  * **Firm signer (J4c):** the chosen firm signer is suspended. After the refusal the select **shows "No firm signer"** (value "") while `firm` still holds the suspended id, and "Signs after the clients." disappears. The second Send gets "The firm signer must be an active person of your firm." again. The screen shows one choice and sends another.
* The only way out is Cancel, which throws away the file, title and ticks. That fails EXPERIENCE §2.10 [M] (an error says how to fix it, on the field) and journey criterion "error recovery".
* The test does not catch it: `tests/check_fo6ds_send_browser.ts:161-162` makes the firm person active again and picks "" before the next send, which steps around this exact state.
* **Fix:** when a signers answer arrives, drop from `picked` every id that is not listed with `hasEmail`. Clear `firm` when it is not among `firmPeople`. Add a fail test for each of the three codes: after the refusal, the row or select shows the true choice and the next Send records one row.

### Minor
* **mn-1. A disabled signer's accessible name runs two words together.** The label reads "Client C SampleNo email: add an email first". The `ml-1` margin is visual only. `signature-requests.tsx:124`. Fix: put a text separator (": " or " - ") inside the span.
* **mn-2. Role on the prospect is not shown in "Who signs".** Concept §4(4) wants "Primary contact" / "Company contact". The signers route returns `personId, name, hasEmail` only, so the builder stated this deviation in the PR body. It is not silent, but it is not written into the concept's §6b "Not built" or into a build note. Fix: one line there. It is the same gap as challenge m5.
* **mn-3. States the concept draws but no test reaches**, and STANDARDS §7 [M] "axe-core on every screen state" is only partly met (axe runs on the empty page, the open panel and 375 px only). Untested: 403 words in the panel, the 404 read state, list load error plus Try again, download 410, the "No one on this prospect has an email" warning with Send disabled, and the three reloads in MJ-1. I walked the load error, 410 and nobody-has-email by hand and their words match §4d. Fix: add them to the browser test with axe on the panel showing a field error and the nobody state.

### Noted, not this PR's scope (FO-6d API, unchanged here)
* Two tabs that each send the same file make two requests (J7: 2 rows). The POST has no idempotency key (STANDARDS §4 [M] idempotent creates). The screen's double-click guard holds (BR-6), and the M4 wording covers a lost answer.
* The firm-signer list offers every active staff member, including Read only people. That is `signersFor`'s rule, not the screen's.

## Concept fit (what gets built)
* **Met:** BR-1 to BR-10 (each has a passing and a failing test, all green), the §5 copy word for word (notice, toast, pill words and tips, all §4d errors from the API), "Recorded" wording with no "Sent", a won prospect gets the button (J6), a Lost one keeps its list without the button, the kind stays OTHER, and "from a client" is said in a one-line hint.
* Rows are a list laid out in columns, not a `<table>`, and the tooltip is visible text. Both are stated in the PR, and both are accessible (BIC-14 asks for help needed to act to be visible). Accepted.
* **Gaps:** MJ-1 (the §4d reloads) and mn-2.

## D1-D20 (1-5; script = browser check, reviewer = my walk)
D1 Requirement fit 4: every BR is mapped and tested; MJ-1 breaks §4d's recovery. · D2 Data integrity 4: one row per Send, double click gives one row, the API guards all rules; two tabs give 2 rows (API). · D3 Reuse 5: Field, Panel, Notice and Pill are the team's; signers are picked, never typed. · D4 Rule integrity N/A (no dependent questions). · D5 Stability 3: reload, Esc and double click are fine, but MJ-1 traps the panel. · D6 Freshness and governance 4: audit line `signing.request_sent` (1 per send, db). · D7 AI trust N/A (no AI). · D8 Orientation 5: Sales › Pipeline › Prospect trail and section heading. · D9 Flow 5: button, panel, Send, toast, focus on the new row; one person with an email is pre-ticked. · D10 Language 4: plain, honest "no one is emailed"; mn-1. · D11 Feedback 4: Recording…, toast, field errors; J4c select shows the wrong choice. · D12 Visual 4: team look, outline button (Convert stays the filled one), native file input as in the identity panel. · D13 Accessibility 4: axe clean, keyboard path, 200 % zoom with no sideways scroll, Send 44 px at 375; mn-1. · D14 Team look 4. · D15 Speed 5: page with the section 453 ms; Send to row 115 ms; one list request, none per row. · D16 Testability 4: 47 checks re-run by me green; mn-3. · D17 simulated only. · D18 Provenance 4: recorded and expiry dates, each signer's step, origin of the signed copy (sha checked). · D19 N/A per screen. · D20 simulated only.

## [M] lines (STANDARDS, EXPERIENCE) that apply
* **Met:**
  * The team's stack and Query, with zod at the edge (`sign/contract.ts` mirrors the API, as the concept asked; the FO pattern is a web-local contract).
  * Authorisation on the server for every route (RO gets 403 on signers and POST; Billing gets the list without downloads).
  * Problem Details with field errors shown on the field.
  * No per-row requests; no `any`; comments say why.
  * "Card unchanged: <reason>" is in the PR body.
  * Uploads are checked by type and size on the server.
  * Status shown by shape and text; one primary action per area; path on the page.
  * Keyboard path, visible focus ring, 1024 px and 200 % zoom.
  * Empty, loading, error and read-only states are drawn; plain words.
* **Partly:**
  * EXPERIENCE §2.10 (MJ-1).
  * STANDARDS §7 axe on every state (mn-3).
  * STANDARDS §4 idempotent creates (the API's).
* **Not met:** none beyond these.

## Scorecard
BIC §6 is case-side scope. This is a front-office screen, and concept §4c chose the screen laws instead, so BIC-01 to BIC-20 are N/A. UXL (screenshots `section-states-1440`, `section-1024`, `section-375`, `panel-375` in `screenshots/`, plus my 1024 and 200 % walk):

| Id | Score | Evidence |
|---|---|---|
| UXL-01 | Met | Section uses an outline button; Send is the only filled button in the panel |
| UXL-02 | Met | Labels sit on their own Field (`panel-1024`) |
| UXL-03 | Met | The section owns "Send for signature"; each row owns its downloads (aria-labels name the title) |
| UXL-04 | Met | One link style for downloads |
| UXL-05 | Met | Cancel left, Send right |
| UXL-06 | Met | At most 4 controls per row |
| UXL-07 | Met | No ids shown |
| UXL-08 | N/A | No nav list |
| UXL-09 | Met | Send 44 px at 375 (test); signer rows `min-h-11` |
| UXL-10 | Met | scrollWidth = viewport at 375, 1024, 1440 and 512@2x |
| UXL-11 | Met | Rows stack at 375 (`section-375`) |
| UXL-12 | Met | Loading, empty and error states, plus Try again (J10) |
| UXL-13 | Met | Title trimmed (Persian title with spaces at both ends stored trimmed, J6) |
| UXL-14 | Met | Pills are words; en only (the page is not bilingual) |

## Retrofit mapping
Concept §2 maps the team's `envelope-builder-page.tsx` to File, Title, Who signs and Firm signer, marked Unverified (no `code/` capture in the cloud). That is recorded; I could not check it either.

## Could not check
A real screen reader (mn-1 judged from the accessible-name string), Safari and Firefox downloads, the team's mock (`code/` capture), D17 and D20 (an intended user's unaided walk is the founder's), and whether removing the `lock` ref alone makes the double-click test fail (the Button's `busy` may also guard it; I did not mutate code).

Reviewer: Block 7d30fe3ef3b1f2149b7351dc7a8f331f5e39e74e
