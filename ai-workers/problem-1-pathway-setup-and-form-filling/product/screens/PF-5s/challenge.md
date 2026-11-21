# PF-5s part 1: gaps found while building (PR #2608; never silent)

* **Typing the code on Check your email (concept BR-5) needs a door change.** On main, `POST /api/public/signup/verify` takes the email link's token as well as the 6-digit code (`api/src/platform/firms/signup.ts`, `VerifyBody`), so a person who has only the code cannot confirm from Check your email. Part 1 sends them to the link (Confirm shows the code filled in and editable, §7b M1). Fix belongs to PF-5 part 2 (or a PF-5 follow-up): a verify by email + code, rate limited as today. Raised by the reviewer of #2608 (S2).
* **The terms documents' addresses do not resolve.** The seeded versions point at `/legal/terms`, `/legal/privacy`, `/legal/data-processing` (`prisma/migrations/20261115180000_pf5_signup_terms/migration.sql`); no page serves them, so the link opens the app's home. Predates this PR; outside its touch list. Fix: Sample document pages, or seeded addresses that resolve (PF-5t follow-up). Reviewer of #2608 (S1).
* **"Too many tries" (§7b m5):** after 5 wrong codes the door answers 404 like a used or expired link, so the screen cannot tell them apart and says "This link has expired or was already used." A distinct door answer is needed to show "too many tries".

## Breaker's Minors not fixed in #2608 (break-report.md), with the owner
* m3 `safeUrl` (`modules/platform/terms/contract.ts`, PF-5t's) accepts `/\t/evil.example/terms`, which browsers resolve off-site; needs write access to the terms table. Fix in PF-5t's file: refuse control characters and backslashes.
* m4 focus falls to the page body after Change, Done and Wrong email? Start again; m5 the door's field refusals in the summary do not name the field; m6 "too many tries" (above). Screens follow-up, one small PR.
* Outside this PR (PF-5's door): after Wrong email? Start again, the mistyped address's pending sign-up stays live for 24 hours.
