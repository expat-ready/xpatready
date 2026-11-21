# R1.26 fresh reader verdict (P-339), main 1aa4c7210 (app tree = c5967c56a)

Fresh Opus 5.5 reader. I did not build or test this capability, and I ran nothing: I read files, `git`, and the GitHub REST API, 20 Nov. Live AI off, US$0.

## 1. Each Done-when clause
| Clause | Met by | Evidence |
|---|---|---|
| A visitor's enquiry becomes a lead | Screens, **once the form is switched on by SQL** | j_26 W2 (embed from a campaign link: one WEB_FORM lead, attribution spring/google/cpc/GCLID, no cookie or storage) and W4 (hosted form: one lead, no campaign facts); 15/15 twice (`j26_1.txt`, `j26_2.txt`) |
| Bot, hidden field: refused, nothing said | Browser | j_26 W3 fail: thanked the same, no lead and no person; fo4b "bot fills the hidden field" (45/45 twice on ce8e05b1d) |
| Bot, too-fast send | Browser (fo4b only) | fo4b "a send under 2 s … thanked the same and nothing is saved". j_26 does not cover it |
| Bot, rate limit | Browser (fo4b only) | fo4b "past the per-address limit … 'Not sent' and a wait-and-retry line; no lead". j_26 does not cover it. The message tells a person to wait, but not that they were taken for a bot. I read that as within "without saying why" |
| The same send twice makes one lead | Browser (a replay through `fetch` in the visitor's page) | j_26 W3 (replay 201, leads = 1); fo4b "the same send twice makes one lead" |
| Each field's message is on its field | Screens | j_26 W4 fail (`aria-invalid`, "Enter your first name.", "Enter your email."); fo4b, and fo4 DW1 |

The fo4/fo4b runs are on ce8e05b1d. Since then the only change to the public path is `embed/snippet.ts` (4 lines), and j_26 W2 draws that snippet. So those runs still apply. item-proof run 44743324739 (job 136312494984, "prove (R1.26)") passed on c5967c56a. **No walks.yml run for j_26 exists yet on main's head** (the newest walks runs are on ce8e05b1d and older). The two GitHub walks are still owed.

## 2. Gate A: does not pass by screens
- **End: yes.** W5 ends on the Owner's Leads › Unassigned page with both new leads, which is R1.27's first step.
- **Start: no.** `j_26.ts:53-54` publishes a consent wording through `ConsentStore` and runs `update fo_web_form set enabled = true, … consent_wording_version_id, thank_you_text` before the Owner signs in.
  - A person would start as a new firm's Owner. On Sales › Settings › Web form they would read "This form is off … visitors see 'This form is not available'" (`web-form-settings-page.tsx:109`), and nothing on the page can turn it on.
  - `firm-seed.ts:118` creates every firm's form with `enabled: false`. Its comment at `:60` says the form "cannot be turned on without" a consent wording.
  - The only code that writes `fo_web_form` is the allowed-sites save (`web-form-settings.ts:96`).
  - So no firm, not even the demo's Sample firm, gets a visitor's enquiry without a database edit. #2525's "On the demo" steps would show "This form is not available", unless someone edited the demo database by hand (I did not check it).

## 3. QA-605 belongs inside R1.26. Recommendation: keep it on R1.26
- MVP-CHECKLIST row 26 gives R1.26's parts as FO-2, FO-4 and FO-4b. Those rows name the missing settings:
  - FO-2's BACKLOG row lists "web-form settings (on/off, allowed sites, consent wording version, thank-you text) … (Owner, Admin)".
  - FO-4's row lists "web form page (hosted) and its settings panel", and its test begins "form on → sent".
  - FO-4b's row says "the settings panel shows the snippet".
- **No other checklist row or capability owns these settings.** I grepped MVP-CHECKLIST.md and CAPABILITIES.md for "web form", "consent" and "settings":
  - Row 28 / R1.28 records consent per purpose. It does not choose the form's wording.
  - Row 50 covers notification settings.
  - PF-9, the firm set-up screen, is only "shaped next" and does not name the form.
- FO-4w's own code calls these settings "the panel's later parts" (`web-form-settings.ts:11`, page `:6`). That makes them unfinished parts of R1.26's rows, not another capability's job.
- "A visitor's enquiry becomes a lead" is a claim about firms. If a firm can only make it true through SQL, the clause is met by the pack, not by the product. That is the gap gate A by screens (P-317, P-348) is there to catch.
- **Recommendation:** add a small row under FO-2/FO-4 for the on/off switch, the consent wording version (the switch needs it first) and the thank-you text. Owner and Admin only, audited, on the existing Web form page. Then change j_26 W1 so the Owner switches the form on by screens, and delete the SQL at `:54`. It fits in one PR.

## 4. FO-4w defects on main
- **Confirmed fixed on main:**
  - Breaker M1: `listFor` (`:26`, `:102`) and `MAX_SITE_LENGTH` (`:21`, `:59`).
  - Breaker m1: the `HOST` check (`:24`, `:64`).
  - Breaker m2: messages move with their rows on Remove (page `:85`).
  - Breaker m3: focus after Remove (page `:87`).
  - Review m3: saving the same list again writes nothing (`:95`).
- **Still open, all Minor or Nit; no Blocker or Major in FO-4w's own scope:**
  - n1: Remove does not clear the summary that names refused rows (page `:83-88` never resets `said`).
  - A reordered list counts as a change and writes one "0 added, 0 removed" line (`:95`).
  - Unsaved rows are lost on reload with no warning.
  - No test runs two saves at once.
  - `focusedIsSite = true` is a constant in the suite.
  - http:// sites are accepted. The Lead still has to answer the PR's question on this.
- **Product finding (this is QA-605, shown on the screen):** the page warns that the form is off but offers no way to turn it on.

## 5. Verdict
**Partial, held by QA-605. Confidence 85%.**
- The four parts are merged, and every Done-when clause holds once the form is on (j_26 15/15 twice, fo4w 31/31 twice, fo4/fo4b 45/45 twice, item-proof PASS).
- Gate A by screens still fails at the start, and the missing settings belong to R1.26's own rows.
- If the Lead rules that switching the form on is outside R1.26, then R1.26 is **Works**, but only after two green walks.yml j_26 runs on main 1aa4c7210. That verdict would carry 80% confidence, with QA-605 kept open against FO-2/FO-4.
