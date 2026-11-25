# Review: QA-617 (Major, R1.26), switching the web form on links the firm's consent wording (PR #2649, draft)

I am a fresh-context reviewer and did not build this.

- **Commit:** `deab70f16bef348f5e4ffd133a59b423cf83ee5d` on `claude/blissful-heisenberg-c05ibg`; diff `origin/main...deab70f16`.
- **Size:** 17 files, +85/-32 (11 of them screenshots).
- **Ruling (narrowest fix):**
  - On switch-on, link the firm's current PF-19a wording through the server, never by SQL.
  - With none, say so and stay off.
  - If no screen sets a firm's wording, raise a Question rather than build one.
  - Remove j_26's SQL link.
- **Concept:** FO-4 r2 screen 2b, "On/off … consent wording (versioned; picking a new version never edits the old) … Owner/Admin". Choosing a wording is a later part, so it is not a finding.

**Verdict (skill wording): Ship.** No Blocker or Major. Two Minors, neither blocking.

## What I ran (exact head, own copies on :4537 and :4538 only; US$0, AI off)
- `check_fo4w_web_form_settings_browser.ts` **51/51 twice**. `j_26.ts` **18/18 twice**, which meets the row's "done when".
- **Probe** on :4537 (scratchpad `probe617.mjs`):
  - Race: 4×4 parallel switch-ons.
  - Audit shapes on switching on and off.
  - Keep-the-link after a newer wording.
  - A real 422: the firm's wordings deleted in the throwaway database.
  - The screen by keyboard at 1440, 1024 and 200 %.
- **Static checks:**
  - `tsc` shows no error in any touched file (15 errors elsewhere, all unrelated tests).
  - `check_aud_values.ts` 14/0.
  - `graph.mjs`: G1, G2, G4 and G5 are 0. G3 is the known `api()`/`staffApi` parser gap (#2525, #2556 reviews), not a finding.
- **Screens restored:** `git checkout -- '*.png'` after the runs; the worktree is clean apart from these two files.
- **Journey test:** `journey-test-reviewer-2026-11-20-qa617.md`, **9.5/10, pass**.

## The points I was asked to check hard
1. **"Current wording" choice: sound.**
   - `web-form-settings.ts:121,142` reads the newest of this firm's EMAIL/MARKETING wordings, by `publishedAt` then `version`. That is the same rule as `arrival-port.ts:26,94`.
   - The concept's consent tick is AG-2-83 marketing by email, "Send me news and offers from <firm> by email" (`concept.md:42`).
   - `public.ts:118-124` records the tick under the linked row's own channel, purpose and locale, so evidence and wording always agree.
   - **Locale:** `fo_web_form` has no locale column, and the booking page also ignores locale. Every firm today has one en-CA wording. A second locale belongs with the wording screen in the Question, not here.
   - **Ordering is effectively tested.** The pack's firm has the set-up v1 (en-CA) and a later test-published wording (pack :44). The link must equal the newer one (:132), so dropping the `orderBy` would fail. Dropping the 404/422 branch throws on `null.id` and fails :156.
2. **Concurrency: sound.**
   - The `FOR UPDATE` lock (:134) comes before the read (:135) and the version compare (:137). The wording read and the link happen under that lock.
   - Probe: every round gave `[200, 409, 409, 409]` with one line.
   - Wording rows are write-once (`msg_consent_wording_write_once`), so the linked id cannot change under the form.
3. **Audit before/after: correct.**
   - The line holds `{enabled, consentWordingVersionId}` both sides (:153). `flattenValues` (ports/audit.ts:47-56) keeps `consentWordingVersionId_before: null` on a link and drops the unchanged key on a switch-off.
   - Probe detail: `enabled_before false, enabled_after true, consentWordingVersionId_before null, consentWordingVersionId_after <id>`.
   - The `after` id comes from the variable, not a re-read. It is the value written in the same transaction, so this is equivalent.
4. **Keeping an existing link: sound.**
   - Re-linking on each switch-on would change what visitors agree to without anyone choosing it. The concept says picking a new version is a deliberate act.
   - The form's load stamp includes the wording id (`public.ts:115,172`), so even a later change forces a reload, never mixed evidence.
   - Probe: with a newer v101 present, switching on kept v1. The open "move to newer?" decision is correctly put in the Question.
5. **Stand-in fail test (pack :136-157): a real unit test of `saveEnabled`'s branch, not of the server path.**
   - It runs the real function: body parse, lock call, version compare, both reads and the refusal. It fails if the refusal is removed.
   - It does not reach Nest's route, guard or problem+json mapping, or the transaction rollback. My real-server probe did, and all held: 422, `code`, `fields.enabled`, row `false|none`, 0 lines, version unchanged. See m2.
6. **`page.route` 422 test (pack :228-235): valid for what it claims.** The screen shows the server's field words on the switch, no generic error, and still Off. The body is hand-built from `NO_WORDING`, so it would not notice drift in the real problem shape (covered by m2's fix).
7. **j_26 has no SQL consent link:** confirmed.
   - j_26.ts:60 writes only `enabled = false`, `allowed_sites` and `thank_you_text`.
   - j_26.ts:56 only reads the set-up wording.
   - j_26.ts:62 asserts `false|none`, and j_26.ts:102 asserts the link and the audit line came from the screen.
   - The `ConsentStore` and `auditEvent` imports are removed.

## Standards ([M] lines touched)
- **Optimistic concurrency, 409 on stale:** met (probe race; pack QA-605 lines).
- **RFC 9457 errors with field messages:** met (real 422, `fields.enabled`).
- **Server authorisation:** unchanged key, and the pack's 403 checks pass.
- **A rule's test fails when the rule is removed:** met (point 1).
- **axe on every state:** off and on states in the pack. The no-wording state is not axe-checked on the real server (see "Could not check").
- **Module card:** met. It is updated via `MODULE.rows/QA-617.md` (Tables: msgConsentWording read), as are the README line and `qa/built/R1.26.md`.
- **Records keep facts:** met.
- **No SQL or scaffolding in the demo step (P-33):** met. The scaffolding is gone from j_26.

## D1–D20 (1–5)
D1 5 (ruling followed; Question raised, no screen built) · D2 5 (lock, version, firm-scoped read, one winner) · D3 5 (reuses the booking page's rule) · D4 N/A · D5 5 (refusal writes nothing; focus kept) · D6 5 (line names the linked wording) · D7 N/A · D8 5 · D9 5 · D10 4 (m1) · D11 5 · D12 5 · D13 5 (keyboard, 1024, 200 %) · D14 5 · D15 5 · D16 4 (m2) · D17 simulated only · D18 4 (Owner not shown which wording is linked; a later part) · D19 5 (J-26 by screens end to end) · D20 simulated only.

## BIC (firm settings screen; most checks are case-side, N/A)
BIC-11 Met (one primary per panel) · BIC-13 Partly (m1: reason, no fix) · BIC-18 Met (failed save visible, Off kept) · BIC-19 Met (`rv617-1440/1024-no-wording.png`) · BIC-20 Met (keyboard, 200 %, no sideways scroll) · BIC-01–10, 12, 14–17 N/A.

## Issues, ranked
- **m1 Minor (Should): the refusal names no fix.**
  - **Where:** `api/src/front-office/sales/web-form-settings.ts:123`. The sentence ends "and no screen sets one yet"; it is plain, but it gives no fix (BIC-13) and uses builder language.
  - **Fix:** when the tech lead answers the Question, make it name the page, or the person, that sets the firm's consent wording. Until then, at least say "page" rather than "screen". This does not block, because the ruling defers "where to set one" to the Question.
- **m2 Minor (Should): the pack never refuses through the real server.**
  - **Where:** `tests/check_fo4w_web_form_settings_browser.ts:136-157` (stand-in) and `:230` (faked 422).
  - **Why it matters:** the PR says no set-up firm can lack a wording, but one can. `onFirmCreated` writes the wording in its own transaction (`firm-seed.ts:154`). If that fails, `seedCreatedFirms` (`firm-seed.ts:169`) never retries it, because the firm is already seeded.
  - **Fix:** in the pack, set up a firm with `seedFirmFrontOffice` only (no `ensureBookingWording`) and an Owner. Assert the HTTP 422 and the on-screen words with no `page.route`, plus axe on that state. Then the stand-in and the faked body can go.
- **Note for the tech lead's Question (not a finding):**
  - The booking page quietly creates the Sample wording when a firm has none (`arrival-port.ts:96-100`). The web-form switch refuses instead, as ruled.
  - After that firm's first booking-page view, the switch works. Worth one line in the wording-screen row.

## What I could not check
- A real screen reader, and an intended user's unaided walk (D17 and D20 stay with the founder).
- axe on the no-wording state on the real server.
- CI on this head (draft: guard only).

Reviewer: Approve deab70f16bef348f5e4ffd133a59b423cf83ee5d
