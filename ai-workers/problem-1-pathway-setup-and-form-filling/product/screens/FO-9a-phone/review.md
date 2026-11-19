# Review: FO-9a phone part (R1.33, staff phone edit), journey J-33

Reviewer agent (did not build it), 19 Nov. Commit `b6b6b3d484506b76a133408524956317b463597b` on `claude/confident-mendel-v60owc`. Scope: only the brief's "Amendment (19 Nov 11:23 IST, Lead B)" (`origin/lead-b-front-office:…/design/lead-b-briefs/FO-9a.md`); the duplicate check already on main is out of scope. The brief stands in for the concept (no `concept.md` or `build-notes.md` for this item). Journey score and walk: `journey-test-reviewer-2026-11-19.md` (this folder).

**Screen-review verdict: Ship after fixes** (two Majors with one shared fix, below).

## What I ran
* `tests/check_fo9a_phone_edit.ts` (scratch database): **27/27 pass**.
* `tests/journeys/j_33.ts rev33 4434` on an isolated copy (PLATFORM_IDENTITY=local): **16/16 pass**, in 7 s. (The run rewrites the five committed J-33 screenshots; I restored them with `git checkout` so this review changes no tracked file.)
* My own walk on :4434: keyboard only, 1024 px, 400 px, 200 % zoom (720 px CSS at scale 2), a read-only role, a second staff member, two tabs, a double click, reload, network failure, 15 odd inputs. Details are in the journey-test report.
* Mutation spot-check (STANDARDS §7 [M]): each rule removed one at a time in a scratch copy of `edit.ts`, then the check re-run. The check catches 7 of 9 mutants. Not caught: the prospect-owner path and the inactive-owner-as-Unassigned path (m3).
* `tsc --noEmit` for the web and the API: clean. `graph.mjs --check`: G1 0, G2 0.

## The brief, line by line
| Brief line | Result |
|---|---|
| Impossible number → 422 `fields.phone` with the exact sentence | Met for "12", "555-01", "call me", "1-800-FLOWERS", 16-digit +1. **Not met for a 7-digit local number (M1)** |
| Valid number keeps its country (E.164), clears Fix number | Met: +44 20 7946 0000 → +442079460000. "(416) 555-0199" → +14165550199. Arabic-Indic and full-width digits are read correctly |
| `PATCH /api/front-office/people/:personId`, `{ phone }` only, key `agent/prospect:edit`, own or all as FO-2v | Met. Another key → 422. Read-only role → 403. Case Manager with "everyone sees all" off → 404 (check E2). Firm B → 404 (J-33 W4, check E5 under the walls) |
| Audited with ids only, never the number (PF-23) | Met: one line `front_office.person.phone_changed`, entity `fo_person`, detail ids only (check E4, J-33 W3) |
| Phone row gets an edit control; Fix number opens it | Met: the pill is a real button with a tooltip and opens the field focused with the number in it. Edit is shown only with the edit key. A read-only viewer sees the pill as plain text |
| J-33's four steps | Met: W1–W4, each with the data read underneath |
| No migration (phone_e164 on fo_person) | Met: none added; the FO-9a trigger fills `phone_e164` |

## Issues, ranked
**M1 (Major, Must). A 7-digit local number is saved as a fake "E.164" and clears Fix number.** `api/src/front-office/people/edit.ts:47` accepts whatever `phoneE164()` returns. `duplicates/phone.ts:11` uses `isPossible()`, which libphonenumber-js 1.13.15 also returns true for local-only lengths. Evidence: Add a lead with phone "555 0100" → main keeps it as typed with Fix number (FO-2 `common.ts phone()`). Then Phone → Fix number → "555 0100" → Save gives 200: the row shows `+15550100`, Fix number disappears, and the database holds `+15550100|true|+15550100` (the area code is lost and the number cannot be dialled). Same for "4165550" → `+14165550`. The same digits typed as "+1 555 0100" are refused. This breaks the brief's own rule ("refuses an impossible number"; "a valid number keeps its country") on a common input (staff taking a local number on a call), and it clears the flag that exists to catch exactly this. **Fix:** accept only when the E.164 result is itself possible, e.g. `parsePhoneNumberFromString(n.number)?.isPossible()`, or use `isValid()`; both still accept "+1 416 555 0100", "(416) 555-0199" and "+44 20 7946 0000". Then add a failing line to `check_fo9a_phone_edit.ts` ("555 0100" → 422, nothing saved).

**M2 (Major, Must). A "possible" number longer than 15 digits gives a 500 instead of the field's sentence.** I confirmed this independently of the breaker's F1 (`break-report.md`, this folder). libphonenumber-js reads "+49 23456789012345" as possible: `+4923456789012345`, 16 digits. `edit.ts:56` then writes it with `phoneReadable: true`, which FO-1a's `fo_person_phone_check` (`^\+[1-9][0-9]{1,14}$`, migration `20261114153000_fo1a_front_office_sales`, line 700) refuses. The transaction rolls back (no data harm), but staff get the server's "Something went wrong" under the field instead of what to fix (STANDARDS §6 [M], field-level errors). The opposite edge has the same cause: "+43 2345" is saved as `+432345` with Fix number cleared and `phone_e164` NULL, so it can never match a duplicate. **Fix (same change as M1):** accept only an E.164 result matching `^\+[1-9][0-9]{6,14}$` that is itself possible. Add failing lines for "+49 23456789012345" and "+43 2345".

**m1 (Minor, Should). Focus drops to `<body>` after Save, Cancel or Escape.** `web/…/sales/lead-page.tsx:33,43,45` unmount the form without moving focus back to Edit. A keyboard or screen-reader user has to start again from the top of the page (WCAG 2.4.3; EXPERIENCE §2.12). Fix: return focus to the Edit button, for example with a ref and an effect when `editing` turns false.

**m2 (Minor, Should). No stale-save protection.** STANDARDS §4 [M] asks for optimistic concurrency, and EXPERIENCE §4 [M] asks for a conflict state. Two tabs both open the editor on "12": tab 2 saves +1 416 555 0122, then tab 1 saves +1 416 555 0133 with no warning (two audit lines; the last write wins). I rate it Minor because the brief fixes the body as `{ phone }` only and both writers mean to set the same field. The Lead should rule on whether an `If-Match`/version is needed here; if not, record the exception in the PR.

**m3 (Minor, Should). Two visibility branches have no failing test.** Removing the prospect-owner clause (`edit.ts:37`) or the inactive-owner-as-Unassigned mapping (`edit.ts:36`) still passes 27/27 (STANDARDS §7 [M], "a rule's test fails when the rule is removed"). Both mutants only narrow access, so there is no leak. Add one line for each. The rule is also now a third copy of the one in `compliance/identity/service.ts:118-124` (STANDARDS §3.3); a shared helper would keep the copies from drifting.

**m4 (Minor, Should). A double click on Save sends two PATCHes.** Two audit lines for one change; `busy` does not block a fast second click (`lead-page.tsx:44`). The data is unharmed. Fix: ignore a submit while `save.isPending`.

**m5 (Minor, Should). An extension is silently dropped.** "+1 416 555 0100 ext. 22" is saved as +14165550100 with no message (the extension is lost). Fix: refuse it with the field's sentence, or say that extensions are not kept.

**m6 (Minor, Should). Graph G3 lists `PATCH /front-office/people/:personId` as "no test reaches it, no page uses it".** In fact j_33 and the lead page call it (through a local `api()` helper and `staffApi` with a template path). The traceability graph cannot see either call. The same gap exists for the identity-check routes on main. Fix: cite the route in the test in the form graph.mjs reads, or note the gap in the PR.

Not findings (out of scope or pre-existing): the saved number shows as raw `+14165550100` (main's display of readable numbers); inline edit rather than a drawer (the brief asks for an edit control on the Phone row); "0044 …" refused with default region CA (the sentence tells staff to add the country code).

Note, not reviewed: while I worked, another session left an uncommitted `phoneE164Exact` in `duplicates/phone.ts` in this working tree. As written it still accepts "555 0100" (the typed digits equal the national number), so it would not close M1.

## D1–D20 (1–5)
D1 4: every brief line is met except M1 · D2 3: M1 and M2 (a broken number is stored, or a 500), m2 last-write-wins, m5 · D3 4: reuses the one normaliser and `sees()`; the visibility rule is copied (m3) · D4 N/A: no configuration rules · D5 4: a 500 on over-long input (M2); reload and network failure are safe, the input is kept; double click (m4) · D6 5: one audit line, ids only · D7 N/A: no AI · D8 5: the trail is unchanged · D9 5: Fix number leads straight to a focused field · D10 4: the brief's sentence and a hint; raw E.164 shown (pre-existing) · D11 4: toast, inline error with role alert, aria-invalid; no conflict state · D12 4: team Input, Button and Pill · D13 4: axe clean at 1440, 1024, 400 and 200 %, no sideways scroll; focus loss (m1) · D14 4: team components · D15 5: first view 248 ms, save 26 ms · D16 4: 27 + 16 checks, 7 of 9 mutants caught (m3, m6) · D17 simulated only · D18 4: audit trail; the duplicate match reads the saved E.164 · D19 4: web form → list → page → fix → list closes · D20 simulated only.

## BIC scorecard (EXPERIENCE §6)
§6 covers case-side screens; this is a front-office sales screen, so it is out of §6 scope. For reference, the checks that touch this control: BIC-11 Met (Save is the only filled button in the row) · BIC-13 Partly (the error is inline on the field with the input kept; a summary is not needed for one field; M1 lets a wrong value through) · BIC-14 Met (the Fix number tooltip shows on hover and focus) · BIC-18 Partly (saved, saving and failed are shown; no conflict state, m2) · BIC-19 Met · BIC-20 Partly (keyboard path works, but focus is lost, m1). BIC-01 to 10, 12, 15 to 17: N/A (no questions, documents, cases, signing or review here).

## Checks 6 and 7, and what I could not check
* Retrofit mapping: no build notes for this item. The module card fragment `MODULE.rows/FO-9a-phone.md` is present and matches the route. I found no team equivalent screen.
* Not checked: a real screen reader; an intended user's unaided walk (D17, D20 stay with the founder); CI lint (the local eslint config did not load); Safari and Firefox.

**Verdict: Block** for commit `b6b6b3d484506b76a133408524956317b463597b`. Fix before approval: **M1** and **M2** (`api/src/front-office/people/edit.ts:47` with `api/src/front-office/duplicates/phone.ts:11`: accept only a full E.164 of 7 to 15 digits that is itself possible, with failing tests for "555 0100", "+49 23456789012345" and "+43 2345"). The Minors m1–m6 should be fixed, or listed with a follow-up row.

## Re-review (diff only) on 5cbdee05
Reviewer agent, 19 Nov. I read only `git diff b6b6b3d4 5cbdee05` (`duplicates/phone.ts`, `people/edit.ts`, `lead-page.tsx`, `check_fo9a_phone_edit.ts`). I ran the check six times, j_33 once on :4434 (16/16; screenshots restored with `git checkout`), a short UI pass, and the mutation spot-check again in a scratch copy.

**Closed:**
* **M1.** `phoneE164Exact` re-parses the E.164 with no default region. "555 0100" and "4165550" now give 422 with the sentence, and nothing is saved. I saw it on screen and the database row stayed `12|false|-`. Removing the re-parse line fails E6 (M1).
* **M2.** The E.164 must be 7–15 digits: "+49 23456789012345" and "+43 2345" give 422, not a 500 or a key-less save. Removing the shape test fails 4 E6 lines.
* **Breaker F3 and F7.** The typed digits must equal the number, and an extension is refused. Every refusal is now the one sentence. Common spellings still read: +1 (416) 555-0101, 1-416-555-0101, 416.555.0101, +44 (0) 20 7946 0958, 011 44 …, +39 06 …, +33, +91, +61, +52, +86, Arabic-Indic and full-width digits. "0044 …" is still refused (as before; the sentence covers it). Removing the exact-digits rule fails E6. The extension test is now covered by the exact-digits rule as well, so removing it alone changes nothing.
* **m1.** Focus returns to Edit after Save, Cancel or Escape, including Escape pressed from the Save button. When Fix number opened the field, focus also returns to Edit, because the pill is gone after a save. That is acceptable.
* **m3.** The prospect-owner and deactivated-owner paths now each have a pass and a fail. Both mutants are caught (the prospect one by the check stopping on an uncaught 404).
* **m4.** A double click sends one PATCH, writes one audit line and shows one toast (UI pass). The same number saved again writes nothing.

**Left for the tech lead, as stated:** m2 (no version), m6 (graph cannot see helper calls), and the third copy of the visibility rule. These are not blocking.

**New finding:**
**R1 (Major, Must). `check_fo9a_phone_edit.ts` is flaky: it failed in 5 of my 6 runs at this commit (one of the official runs, 36/36, passed), so CI will usually be red.**
* `tests/check_fo9a_phone_edit.ts:155` saves four spellings on the same person with `Promise.all`. Which one lands last depends on lock order. Line 157 then saves "416 555 0109" and expects no new audit line, which holds only when the full-width "…0109" happened to land last. It failed 4 of 5 times, each with `{"n6":4,"after":5}`.
* `:141` (E4) checks every phone audit line's summary and detail against `/4165550|\+44|7946|555/`. The detail holds random UUIDs (firm, staff, person), and a UUID with "555" or "7946" in it fails the line with no number present. That happened once in 5 runs. The line is older than this diff, but the extra persons raise the odds.
* The product code is right. Only the check is unreliable.
* **Fix:** run the spellings one after another (`for … of`), or check "the same number again" on its own person. For E4, remove UUIDs before matching (e.g. `all.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "")`), or match only phone-shaped text.

**Not checked:** `tsc -p web` is clean. `tsc -p api` reports 15 errors, all in `tests/check_x2b_bulk_apply.ts`, which this diff does not touch, so they are not this item's. Lint, a screen reader and other browsers were not checked, as before.

**Verdict: Block** for commit `5cbdee053dc48e2d1c1788cfd7db1f300e4c3f90`. Fix: **R1** (`tests/check_fo9a_phone_edit.ts:155-157` and `:141`). M1, M2, m1, m3 and m4 are closed; with R1 fixed and the check green twice in a row, this is an Approve.

## Check on 97b02043 (R1 only)
Reviewer agent, 19 Nov. I read `git diff 5cbdee05 97b02043`. The only code change is in `tests/check_fo9a_phone_edit.ts`; no product code changed.
* E6's spellings are now saved one after another, so the "same number again" line checks a known last value.
* E4 replaces UUIDs with `<id>` before looking for a number.
* The check passed **6 of 6 runs, 36/36 each**.
* Both lines still fail when their rule is removed, tested in a scratch copy:
  * dropping the "same number writes nothing" return fails E6 (F4);
  * putting the number in the audit detail fails E4.

R1 is closed. No Blocker or Major remains open. As stated before, m2, m6 and the third copy of the visibility rule are left for the tech lead.

**Verdict: Approve** for commit `97b020430e19edb5b224e41d40e821daead8f7ba`.

## Merge of main at 0b0b946c
Reviewer agent, 19 Nov. This is a merge of `origin/main` (3ab13f55) into the branch, resolving one conflict, in the import header of `lead-page.tsx`.
* **The resolution:** the union of both import lists (`Input`, plus main's `Panel`, `useNavigate`, `Prospect`, `useLock`, `useReturnFocus`) and both header comments. Against main, the file differs only by `Input` and this PR's comment, `PhoneRow` and the Phone row line. Apart from imports main already had, that is the same change set as this PR's own. The merge left this PR's API, normaliser and test files unchanged (0 lines against 6c95c697).
* **No clash, read in the code:**
  * `PhoneRow` keeps its own state and focus effect.
  * Main's Engage lives in `LeadBody` (`engaging`, `panel`, `focus = useReturnFocus()`, `lock`). No name, state or query key is shared: PhoneRow invalidates `["fo","leads"]`, Engage invalidates `["fo"]`.
* **No clash, walked on :4434 (merged tree, Sample firms):**
  * With the phone field open, I opened Engage and closed it with Escape. The phone field stayed open with its value, and focus returned to Engage.
  * Saving the phone then cleared Fix number, showed the toast, and returned focus to Edit.
  * Engage then opened and cancelled normally, with focus back on Engage. No page errors.
* **`git diff origin/main 0b0b946c --stat`:** 17 files, all this PR's own: the API, normaliser, route line, card fragment, lead page, the two tests, R1.33, J-33 screenshots and this folder's three reports.
* I did not run j_33 or the type check again; the coordinator reports both green on the merged tree. J-33 and fo-4-sales screenshots in the working tree are being rewritten by the coordinator's runs, and I left them alone.

**Verdict: Approve** for commit `0b0b946c67d1b2e6102fc490903bb22026b823b6`.
