# Tester's notes (facts only) · qa retest QA-478 · main 388e5a6fd (tree 357315b62) · 17 Nov 2026

* Fix parts on main: PF-6m #1945 ("one money-keys audit line for role change and invitation accept (fixes QA-478)", merged 16 Nov 22:04 UTC) and PF-6m2 #2045 (inviter re-check, sign-up money line; merged 17 Nov 11:16 UTC).
* `tests/qa/check_qa478_479_r16_breaks.ts` on an isolated copy (port 4479, PLATFORM_IDENTITY=local, PLATFORM_SAMPLE_SEED=on; never :4400; US$0): **7/7 twice** (`qa478-479-retest-{1,2}-mine.txt`).
  * QA-478: an invitation into Billing/Finance accepted through `POST /api/public/invitations/:token/accept` writes one `platform.staff.money_keys_granted` audit line for its 12 money keys (before 0, after 1).
  * QA-479 (closed 16 Nov): take on another person's lead still answers 404 NOT_FOUND.
* Verdict: QA-478 closed (moved to `history/qa-bugs-closed-2026-11-17-qa478-retest.md`). R1.6 stays Partial: PF-6 part 2 (role editor screens) and J-6 part 2 are not on main.
