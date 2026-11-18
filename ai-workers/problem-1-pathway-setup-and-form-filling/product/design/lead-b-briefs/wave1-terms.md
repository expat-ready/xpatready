# Wave 1 start sheet: the Terms lane (PF-5t part 2, then PF-5v part 2) (row owner Lead B / Build Lead A)

Written 18 Nov 19:xx IST by Lead B (6) at Lead 80's request (Wave 1, P-697, P-698). It targets R1.100. **This sheet amends `PF-5t.md` (Part 2) and `PF-5v.md` (§PF-5v part 2); read them too.**

## What each part waits on (corrected)
Lead 80's ask said "PF-5t part 2 after PF-5 part 2". The briefs say otherwise:
* **PF-5t part 2 can start now** (P-663 permitting). It waits only on PF-5t part 1 (#1957, on `main`: `api/src/platform/terms/{gate,routes,service}.ts`) and PF-6 part 1's `PlatformFrame` (on `main`: `web/src/modules/platform/frame.tsx`). It does not use PF-5 part 2's billing.
* **PF-5v part 2** (the verification email, QA-481) waits on **PF-19p (#1961)** and **PF-19e**, not on PF-5 part 2 (#1959). Its condition (Lead 67, P-423) is that the code is never stored unsealed in the outbox.
* PF-5 part 2 (#1959) matters only to R1.19 and R1.21, not to this lane.
* **R1.100 still needs the real texts.** The terms, privacy notice and data agreement texts do not exist (review G9, C24). The founder writes them with counsel. Until then every version is "Sample". *Unconfirmed: no counsel.* The lane can reach Works on Sample texts, and launch still needs the real ones.

## PF-5t part 2: the terms screens (screens, Opus 5.5 medium, reviewer + breaker)
`PF-5t.md` "Part 2, screens" stands as written. In short:
* On a `428 TERMS_PENDING` answer, the frame shows one page instead of the content: "We've updated our <kind>." with the link, "I accept" and Sign out.
  * Accepting calls `POST /api/platform/me/terms/accept` and returns the person to where they were.
  * Each kind is listed if several are pending.
  * A non-Owner sees only the privacy notice they must accept. Firm terms an Owner has not yet accepted never block them (part 1's rule).
* **Settings → Terms** shows `GET /api/platform/terms/acceptances` (who, when, which version). It is one entry in `account-sections.ts`.

**Done when:**
* **`PF-5t DW6`:** the journey. Publish a version (test seed), sign in, the page shows it, accept, carry on at the same address.
* **`PF-5t DW7`:** keyboard only, axe-core, and 375, 1024 and 1440 px.

Added 18 Nov:
* **`PF-5t DW8`:** a 403 from accept (a non-Owner forcing firm terms) shows the server's words.
* **`PF-5t DW9`:** Sign out from the terms page works while terms are pending.

**Touch list:**
* new `web/src/modules/platform/terms/*`;
* `web/src/modules/platform/frame.tsx` (the 428 branch only, a few lines), `routes.tsx` and `account-sections.ts` (one entry each);
* `tests/check_pf5t_terms_browser.ts`.

Nothing in `api/`.

**Size (P-610):** about 250 lines.

**Clash:** the Identity lane (PF-6 part 2b, J-6 part 2) also edits `web/src/modules/platform/`. Merge in series, and merge `main` only on a conflict (P-270).

## PF-5v part 2
`PF-5v.md` §"PF-5v part 2" stands as written, including `PF-5v DW4`: no code or token in clear in the stored outbox file. **Starts when #1961 (PF-19p) and PF-19e are on `main`.** #1961 is open with a conflict, its merge-main step was posted at 12:4x IST 18 Nov, and PF-19e is not started. So this part is Wave 1 only if those land in time.

## Duplicate check (P-526; 18 Nov 19:xx IST)
* **Open PRs:** no open PR names PF-5t or PF-5v. #1959 (PF-5 part 2) touches `firms/` billing, not terms. #2109 (PF-4dn) touches `identity/`, not `terms/`.
* **Branches:** none for terms.
* **`main`:** `web/src/modules/platform/` has no `terms/` folder. Part 1's API is merged.
* Each PR writes its own `Duplicate check:` line.

## Rules
The standard PF/FO rules at the end of `wave1-sales.md` apply.
