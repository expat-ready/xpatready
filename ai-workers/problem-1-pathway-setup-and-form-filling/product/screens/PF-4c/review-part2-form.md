# PF-4c part 2: the College's format and the warning on the licence field. Review of PR #3173

Reviewed commit **dc200625e0adcb0fda403400b7a47bf924e06470** (branch `claude/runtime-pf4c-2`), 23 Nov 2026. The reviewer is a fresh session that did not build it.
Scope: the 7 code and data files and the J-92 screenshots in `git diff origin/main...dc200625e`, against backlog row PF-4c (AG-1-34, AG1-D19, AG-1-31) and the PR body.

**Verdict: Rework (Block).** There is 1 Blocker: an existing PF-6 browser suite now fails because of this change. There is also 1 Major: the Licences panel reports a false "Someone else changed this licence" after a warning.

## What I ran (isolated copies only, never :4400; live AI off; US$0)
* Web bundle rebuilt (`npx vite build`). Web `tsc --noEmit` shows no error in the touched files.
* `COPY_PREFIX=rvpf4c run-suites.sh --only "check_pf4c_licence_format.ts check_pf6_staff_browser.ts"`. A plain run was refused because the builder's own `--changed` run held the `runtime` slot in this checkout.
  * `check_pf4c_licence_format.ts`: **PASS, 18/18.**
  * `check_pf6_staff_browser.ts`: **FAIL**, a TimeoutError after line 81 "a person with no record is listed with Add licence" (see Blocker 1).
* `j_92.ts` on `rvj92c` :4784, run twice: **21/22 both times.** The only FAIL is W1 (no Firm profile page, PF-5s S5). All W6 lines pass, including axe in the warning state and the Licences panel. The copy is stopped.
* A reviewer break-it script on the same copy (results below). The screenshots my runs overwrote (J-92, pf-6-staff) were checked out back to the committed files. The A24-2 and A24-3 screenshots that show as modified come from the builder's concurrent suite run in this checkout, not from me.

## The citation (item 1): consistent and verified
I fetched `https://college-ic.ca/protecting-the-public/working-with-an-immigration-consultant` on 23 Nov 2026 (HTTP 200).
* The quote in `representative-bodies-ca.json:11` matches the page word for word, including the curly ‘R’, under the heading "Other items to note".
* The page's `last-modified` meta is "Fri, 22 Mar 2024", as the `page` field says.
* The url, page, quote and date (`2026-11-23`, the read date) are consistent.
* `R[0-9]{6}` is exactly "begins with the letter ‘R’ and is followed by 6 numbers".
* No other body has a pattern. That is correct: none was read.

## Correctness checks that hold
* **Never refuses.** A wrong shape gets 200 and is stored (j_92 W6; break D1).
* **Never holds the number.** The warning for `ZZ-SECRET-123` does not contain the number. GET `me/account` has no `warning` key. Neither `R123456` nor a Chambre record gets a warning (D2-D4).
* **Clears on change.** Typing in the number clears the warning, and so does changing the type or the body (A2, B2). It is not kept across a reload (C3).
* **Not invalid.** The field has no `aria-invalid`. `aria-describedby` points at the note, which reads the warning and then the hint (A1).
* **Contrast.** `text-text-warn` measures rgb(102,50,0) at 14 px, weight 500. That is about 10.4:1 on the panel's white and about 9.7:1 on `#f7f7f7`. axe is clean at 400, 1024 and 1440 px.
* **Licences panel.** It stays open on a warning, with focus on Save. A good save closes it. Escape after a warning closes it without asking and returns focus to the row's Change button (B1, B3, B4).
* **`PUT me/account`.** `staff-read/service.ts:95-98` passes the warning through and changes nothing else.
* **`LicenceSaved`** (`licence-form.tsx:16`, `{ warning?: string } | void`) type-checks against both callers: `licence-page.tsx:30` returns `{warning} | undefined` and `licences-page.tsx:47` returns `{warning} | undefined`.

## Findings
**Blocker 1. `tests/check_pf6_staff_browser.ts` now fails (DW6 to DW8 stop with a TimeoutError).**
* The suite saves College records with numbers like `PF6M<run>` and `${LIC}-A` (`check_pf6_staff_browser.ts:271, :321, :328`). These no longer match the College pattern, so they get a warning, and the Licences panel now stays open (`licences-page.tsx:47`).
* At `:327` the "Add licence" click is then blocked by the still-open dialog ("…role=dialog… subtree intercepts pointer events"). The later checks never run: DW8 focus after Add (`:330`), the discard confirm (`:331-334`), axe on Licences at 1440, 375 and 1024 px (`:335-336`) and BR-8's no-number-in-logs (`:340+`).
* This is a regression in a suite that passes on main.
* **Fix:** in this PR, give the PF-6 suite College-shaped numbers, for example `R` plus 6 digits from the run (`LIC`, `LIC2`, `${LIC}-A`, `${LIC}-NEW`). Or have it close the panel after a warned save and assert the warning. Then re-run it green.

**Major 1. After a warning, the Licences panel's next save is refused as a false conflict when the number had surrounding spaces** (`licences-page.tsx:47`).
* When the panel stays open, `editing.start` is rebuilt from the form's fields `l` as typed. The server stores the number trimmed (`identity/service.ts:99-101`, `textOf` returns `v.trim()`).
* The next save's fresh read (`:40-41`) then differs from `start`, and `sameLicence` fails.
* Reproduced as the Owner:
  1. Change, `X-77 ` (trailing space), Save: saved as `X-77`, with the warning.
  2. Type `R222222` and Save: **"Not saved. Someone else changed this licence since you opened it."** Nothing is saved, and the field is reset to `X-77`.
* The claim is untrue, and the person's typed correction is thrown away. A pasted number with a trailing space is common.
* **Fix:** set `start` from the stored record, not from the typed fields. Either take it from the fresh `GET /platform/licences` after the invalidate, or at least trim `licenceNumber` the way the server does.
* Add a test line: a warned save followed by a corrected save closes the panel with no conflict. Today no test covers the "conflict check after the panel stays open" path, which is how this slipped through.

**Minor 1.** `licence-form.tsx:82`: the `role="status"` span is mounted together with its words. Some screen readers do not announce a live region that arrives already filled. `Field`'s own `calm` mode (`controls.tsx:60`) keeps its region mounted for exactly this reason. The "saved" toast is announced, so the warning may go unheard until the field is focused again. Consider keeping an empty status region mounted in the note. I could not check this with a real screen reader.

**Minor 2.** `j_92.ts:27, :35`: the default port 4783 is outside the runtime range 4430-4439 (`WAY-OF-WORKING.md:18`). The earlier J-92 review (Minor 5) raised the same point for 4492. Either take a free port in the range or record why one is outside it.

**Minor 3.** No test asserts "the warning clears on change", only my break-it pass. Add one line to j_92 W6 or the PF-6 suite: type one character and expect `[data-licence-warning]` to be gone.

**Note, not a finding of this PR.** The R1.92 line in `qa/CAPABILITIES.md:163` reads "a licence number in the wrong shape refused on the field". That contradicts AG-1-34 (warned, never refused). Whoever owns that file should correct it.

## "Completes: R1.92"
This is justified under the tech lead's ruling (J-92 passes except W1). I measured 21/22 twice, with only W1 failing. Be aware that `item-proof.yml` will still post a red j_92 verdict at merge because of W1 (PF-5s S5 is still open, as the PR says). It must not land while Blocker 1 is open.

## Dimensions (1-5, the changed form only; the rest is unchanged from the PF-6 review)
* D1 4: AG-1-34, AG1-D19 and AG-1-31 are met. The false conflict (Major 1) breaks the Licences flow.
* D2 3: the false conflict refuses a valid save.
* D5 4: survives a reload, and Escape works.
* D6 5: the source is cited with its date.
* D10 5: "Check it. It was saved."
* D11 5: the toast and the field note agree.
* D13 4: axe clean, 10:1 contrast, linked by describedby; the live-region caveat (Minor 1) remains.
* D16 2: the regression suite is red, and there is no test for the clear-on-change or post-warning save path.
* D18 5: the hint says "We never verify licences".
* D17 and D20: simulated only.
* BIC-01 to BIC-20: N/A. This is a platform screen, not a case-side one.

Not run: `graph.mjs`, because it rewrites the tracked `qa/GRAPH.md` and this review may write only its own files. Not checked: a real screen reader, a 200% zoom pass, and the full `--changed` CI set.

Journey score (reviewer): **8.5/10, pass**. See `journey-test-reviewer-2026-11-23.md`.

**Must fix before Approve:** Blocker 1, Major 1.

Reviewer: Block dc200625e0adcb0fda403400b7a47bf924e06470
