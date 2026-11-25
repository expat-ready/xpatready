# QA-779 part (a) review: a person's email on `PATCH /people/:id` and the prospect page's Contact block (R1.53)

Reviewer: independent (P-303), Opus 5.5. I did not build this. PR #3556, branch `claude/runtime-qa779-person-email`, **commit 76270bf84e0661eefbf768cdbd711bde75fd3f4c**, diff `origin/main...76270bf84` (13 files, +548 −7). Concept: the tech lead's ruling on #3532 (Lead 2, 23:5x IST) and the QA-779 row (a). Part (b) (the draft taking the email) is not in scope.

**Verdict: Ship (Approve).** 0 Blockers, 0 Majors, 4 Minors. Journey score **9/10, pass** (§5).
Reviewer: Approve 76270bf84e0661eefbf768cdbd711bde75fd3f4c

## 1. Runs (this commit; isolated copy rv779 on :4447, its own node_modules, web built with `npx vite build`; live AI off, US$0)
| Run | Result |
|---|---|
| `tests/check_qa779_person_email.ts 4447 xr_studio_rv779` | **23/23** |
| the same with main's `people/edit.ts` and `sales/prospects.ts` (copy restarted on them, then restored) | **0/23**, as the PR says |
| `tests/check_qa779_person_email_browser.ts 4447 xr_studio_rv779` | **15/15**. Its regenerated screenshots restored with `git checkout --` |
| `graph.mjs --check` | exit 0 (G1 0 · G2 0 · G4 0 · G5 0) |
| My API probes and Playwright walk (keyboard only, 400/1024/1440 px, 720 CSS px at 2x = 200 %, reload, double click, stale, races, non-ASCII) | findings below |

I did not run the browser check against the base: the copy cap was full (4442, 4444, 4449 belong to other sessions). Its only setup steps that pass without the fix are the template upload and "no page error". The other steps need `[data-person-email]` and Add email, which main does not have. So its 3/9 is believable.

## 2. API and safety (`api/src/front-office/people/edit.ts`, `sales/prospects.ts`)
* **Validation:** strict zod with `email` added (edit.ts:140). The `email` key routes to `editEmail` (edit.ts:149). A body without it goes to `editPhone`, which is byte-for-byte unchanged, and E8 checks the phone-only answer shape. `contactOf` (edit.ts:92-104) uses FO-2's rule and maps any 422 to the field's one sentence. It also refuses `\p{C}\p{Z}`, so U+0085 never reaches `fo_person_email_check` (E1: U+0000/0085/200B all 422).
  * Probed: `É`, `İ`, `ǅ`, `Σ`, `ẞ`, `Ⅷ`, `Ａ`, `ﬀ`. All saved lower-cased, no 500, so JS lower-casing and PostgreSQL's `lower()` agree here. `{email:["…"]}`, `[]`, a numeric `version` and a bad If-Match each get 422 or 409 in words.
* **Visibility and the lock:** `select … for update` then `seen()` inside the transaction. Another firm's person and an unseen person are both 404 (E2). Read-only is 403 (E3). The stale 409 comes after `seen`, so `current.email` goes only to someone who may open the person (edit.ts:116-118).
  * Races, probed: two different addresses at once, without a version, gave two serial writes. Their audit chain is `null→two`, then `two→one`: each line's before is the other's after. The same address twice at once gave **1** audit line.
* **Same-address no-op:** returns `changed: false`, with no write, no version bump and no audit line (E5). It is case-insensitive, because the address is lower-cased first.
* **Audit line:** `front_office.person.email_changed`, entity `fo_person`. The summary and detail hold ids only (E6 fail step). Before and after hold the address (E6 pass step). With `{email, phone}` there is one line per field changed. PF-23 is the logger rule: `var/isolated-rv779/api.log` holds **0** addresses after every run and probe.
* **Duplicate warning:** `Duplicates.check(ctx, {email})` names a person only when one of their leads is visible to the editor (service.ts:57-73). That is narrower than the editor's own `seen` rule, so the warning can never name more than the editor may open. Otherwise it gives `EMAIL_HIDDEN_MATCH` with no name and no count (E7).
  * The check runs before the transaction, and also for an id that then 404s. It returns nothing in that case, so there is no leak. A race that gives a third person the address between the check and the commit only loses a warning, never a block (P-574 (2)). Not a finding.
* **`prospects.ts:234-235` (`person.email`, `person.version`):** the prospect read is `agent/prospect:show` with own-or-all, the same key as the lead read, which already returns the email and phone (leads.ts:104).
  * The only reader who gains the email is someone who **owns the prospect but cannot open its lead**. Probed with "everyone sees all" off: Case Manager T owns the prospect and R owns the lead. T's lead read is 404, and T's prospect read now shows `email`.
  * That same person could already edit the person's phone (`seen()`'s prospect-owner branch), and will see the email in the retainer's `{client.email}` value. So this is consistent with the edit rule, not a widening.
  * Every route that answers with `this.read(...)` (engage, move, lose, convert) now carries the email too, to the same caller. Accepted.

## 3. The screen (`web/…/sales/person-email.tsx`, `prospect-page.tsx:135`)
* **Contact › Email** shows the address, or "Not given". **Add email** or **Edit email** shows only with `agent/prospect:edit` (J3: Read-only sees the email and no button). This matches the lead page's phone editor: a ghost `Button`, a shared draft, If-Match, `ConflictNotice` and `DraftLine`.
* **Keyboard (walked):** blocker link → Enter → Tab ×14 → Add email → Enter. Focus lands in the field, which has a label ("Email", `sr-only`) and a hint.
  * Typing and Enter save in 199 ms. Focus goes back to **Edit email**, then Tab reaches "Go to the conflict check", and Enter focuses `#fo-conflict` (`tabIndex=-1`).
  * Escape cancels with focus back on the opener (J2). It also works while the stale notice is open.
* **Errors:** empty → "Enter an email address."; "oto@example" → "This is not an email address. Check it, for example name@example.com.". Both use `role=alert` and `aria-invalid`, keep what was typed and keep focus. The error clears when you type.
* **Recovery and state:**
  * A reload keeps the typed draft, and "Unsaved changes to the email. Nothing is saved until you press Save." shows.
  * A double-click on Save gave **1** audit line.
  * Three saves in a row on one page each used the new version, with no false 409.
  * A colleague's save shows "Someone else saved this first", then "Saved now / Yours", then Keep mine (J5, and walked).
* **Stale-check line:** shows only after this save and only when the gate says `CONFLICT_CHECK_STALE` (person-email.tsx:95). It comes from the page's shared `useConflictList`, so it adds no extra request.
* **Sizes:** axe (WCAG 2.2 A/AA) found 0 violations with the field open at 400, 1024 and 200 %, and after the save. There is no sideways scroll, and long addresses wrap (`overflow-wrap:anywhere`). Screenshots: `screenshots/qa779-*-1440.png`; mine are in the session scratchpad.

## 4. D1–D20 (this fix's scope)
D1 5: (a) as ruled: optional additive `email`, strict zod, firm-scoped, an audit line, the same 422 shape, and the screen field where the blocker's link lands.
D2 5: lower-cased, no duplicate lines under a race or a double-click, stale 409, no-op on the same address, nothing saved on any refusal.
D3 5: reuses FO-2's `email`, FO-9a's `Duplicates`, `seen`, `ConflictNotice`, `useSharedDraft`.
D4 N/A. D6 N/A. D7 N/A (no AI).
D5 5: reload keeps the draft; double-click, stale save and Escape all recover.
D8 4: the Contact block sits under the prospect's own heading. Landing from the blocker has focus on BODY (m2, part (b)).
D9 4: the stale line links to the check. The retainer's own next step is part (b).
D10 4: plain second-person copy (P-473), except "the old email" when there was none (m1).
D11 5: toast, draft line, warning, stale line, busy Save.
D12 5: the team's components; it matches the phone editor.
D13 5: keyboard-complete, focus returned, axe 0 at 400, 1024 and 200 %.
D14 5: SalesFrame page; Notice, Button and Input from `controls`.
D15 5: a save in 199 ms; no per-row requests.
D16 4: every rule has a pass and a fail, and the check fails on the base. Gaps: m3.
D17 simulated only. D18 N/A. D19 3: (a) closes; sending still needs part (b), as planned. D20 simulated only.

## 5. Journey test (reviewer; the one score for this check)
Journeys: (1) main: the Owner, from the retainer's signer blocker, adds an email by keyboard; (2) not an email, then corrected; (3) empty; (4) Read-only; (5) reload mid-edit; (6) double-click Save; (7) a colleague saved first; (8) another person has the address; (9) 400, 1024 and 200 %; (10) across the boundary: back on the retainer the blocker stays (part (b), expected).

| Task done | Next step | Plain words | Feedback | Correct data | Recovery | A11y and sizes | Speed | Visual | Trust |
|---|---|---|---|---|---|---|---|---|---|
| 1 | ½ (m2) | ½ (m1) | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

**9/10, pass, no criterion at 0.** To raise it: fix m1's sentence, and in part (b) put focus on the Contact block when the page is reached from the blocker. Not tested: a real screen reader, and an intended user's own unaided walk (D17 and D20 stay with the founder).

## 6. The PR's two questions
1. **The address in before and after: keep it as built.** P-687 (the founder, 17 Nov) shows the Activity log's before and after values in full to holders of `agent/audit:read`. R1.8 needs both sides, and the phone in the same file does the same. PF-23 is the logger's redaction, and I verified the log holds no address.
   * The builder's plan on #3532 said "ids only, never the address". The PR body flags the change openly, so the tech lead's read line settles it.
2. **Read the email from the prospect read: yes.** It is the read the page already makes, its visibility is a subset of the edit's `seen()`, and the only new reader (a prospect owner without the lead) can already edit that person and sees `{client.email}` on the retainer (§2).

## 7. Could not check
The browser check on the base (copy cap; see §1). A real screen reader. Live mail (none is sent).

Verdict: Approve

**Blockers:** none. **Majors:** none.

**Minors** (fix in this PR or a follow-up; none blocks):
* **m1** `web/…/sales/person-email.tsx:23`: `CHECK_AGAIN` says "The conflict check was run with the old email". In QA-779's own case (a client with **no** email, walked as W1: Nia had none), there was no old email.
  * Fix: "The conflict check was run before this email was saved. Run it again before you send the retainer."
* **m2** (for part (b), `retainer-page.tsx` is untouched here): the blocker's "Add it on …'s record" link lands with focus on BODY. Add email is the 14th Tab stop.
  * Fix in (b): link to the Contact block (an anchor or focus on `[data-contact]`).
* **m3** `tests/check_qa779_person_email_browser.ts`: the gaps against the journey-test bar.
  * The main path is driven by clicks; only Escape is keyboard.
  * The widths are 375 and 1440 only (no 1024, no 200 %).
  * `tests/check_qa779_person_email.ts` has no step for `seen()`'s prospect-owner-not-lead-owner path (my probe P4 passed) and none for the same-address race (P2 passed: 1 line).
  * Fix: add those three steps.
* **m4** `person-email.tsx:68`: an empty Save is sent to the server to get "Enter an email address." The page's own rule (prospect-page.tsx:104: "said at the field before anything is sent") would say it locally. Today the server's 422 shows in the console.
  * Fix: refuse an empty value at the field before `save.mutate`.

## Round 2 (diff only, 640bb0746)
Scope: only `git diff 76270bf84 640bb0746`. It touches one file, `people/edit.ts:123-127` (+4 −3).
* **The change:** the shared `line` object no longer carries `entity`. Both `audit.record` calls now write `entity: "fo_person"` in their own literal, and a comment says why.
  * No value changes. The email line and the phone line keep the same action, summary, detail, before and after.
  * `editPhone` is untouched.
  * No other entity is used: the sweep's `fo_person` is already on its lists.
* **CI's failure, reproduced:** with the round-1 `edit.ts` put back, `check_case_feed.ts` gives **41/42**. It reports "front-office/people/edit.ts:124 (an AuditPort write with no entity the sweep can read)", which is CI's failure.
  * At 640bb0746 it gives **42/42**.
  * The file was restored with `git checkout --`, and the tree is clean.
* **Runs at 640bb0746** (fresh copy rv779r2 on :4447, after the container restart):
  * `check_qa779_person_email.ts`: **23/23**.
  * `check_fo9a_phone_edit.ts`: **37 passed, 0 failed**. Run with `tsx --tsconfig api/tsconfig.json` from `studio/`, because it needs the API's decorator setting.
  * `check_aud_values.ts`: **14 passed, 0 failed**.
  * In that copy's database, every `front_office.person.email_changed` line (10) and `phone_changed` line (2) has `entity = fo_person`.
* **Round 1:** its findings are unchanged. The minors m1–m4 still stand, and none blocks. I re-ran no browser check, since the diff has no web change.

Reviewer: Approve 640bb07461092c8daf4f57ab3b92e74e2f9b98fa

Verdict: Approve
