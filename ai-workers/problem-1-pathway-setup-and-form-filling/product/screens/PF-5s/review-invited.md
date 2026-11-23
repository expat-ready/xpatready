# Review: PF-5s S8 invited sign-up (PR #3202, R1.90), reviewer, 23 Nov 2026

Commit `65e4e1fa39bc666f0a71e89f42f4ab366c3ccf77`; scope `git diff origin/claude/runtime-r190-invited..65e4e1fa3` (the door, #3040, already approved). Concept: `pf-5s-saas/concept.md` r2 on `lead-b-front-office` (§4 S8, BR-13, §5, §7b M4, m8). Isolated copy :4613 (`rev_pf5si`, local identity stand-ins, fake BillingPort, live AI off, US$0). Journey test: `journey-test-reviewer-invited-2026-11-23.md` (**8.5/10, pass**).

**Verdict: Ship after fixes.** One Major (M4 dropped on a reading of the requirements that does not hold), six Minors. The page is well built: the token leaves the address, one firm per link, every link state draws, axe clean, and keyboard works at 375 px and at 200 % zoom.

## What I ran
* `check_pf5s_invited_browser.ts 4613 xr_studio_rev_pf5si`: **32/32, exit 0, twice** (two fresh copies).
* `j_90.ts rev_pf5si 4613`: 31/33. **W4 4/4 pass.** The 2 reds are W3 (the trial banner, `GET /api/platform/billing/banner` 404), PR #2935, outside this PR.
* `web` tsc clean. `graph.mjs --check` exit 0 (G1 0 · G2 0 · G4 0 · G5 0).
* Own walk (scratch Playwright, not committed): the main path at 1440 with a double click; reload mid-form; server field refusals at 1024; a long firm name with non-English letters; two tabs on one link; a link for an email that already has a firm; the link's plan withdrawn; 200 % zoom (640 CSS px at 2x) with axe and the tab order; staff route with no token; the dead page → Sign in; 429.

## D1–D20 (1–5)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 3 | BR-13 dead page, m8 and BR-3 are met word for word. §7b M4 (plan line with Change) is not built (Major 1). The BR-13 email check is kept, a sound deviation (below). |
| D2 Data integrity | 5 | Double click → 1 pending (`1/1`). Two tabs → 2 pending, 1 live, **1 firm**. The firm is TRIAL on the link's plan and period. 3 terms rows. The link is marked used with its firm. |
| D3 Reuse | 5 | Uses S2's `Terms`/`Resend`, `api.ts` helpers and `Frame`. No copied logic. |
| D4 Rule integrity | N/A | No rules engine involved. |
| D5 Stability and recovery | 4 | A second link in the same tab replaces the page (IV3 fail line). A reload loses what was typed and calls a working link dead (Minor 1). |
| D6 Governance | 4 | Audit: `firm.created` "by invited sign-up, from a private link", Owner created, terms accepted, subscription created. |
| D7 AI trust | N/A | No AI. |
| D8 Orientation | 4 | Header and trail read "Sign up" / "Sign-up link". Heading in order. |
| D9 Flow | 4 | Form → Check your email (focus on the heading) → the email's Confirm. One primary action. |
| D10 Language | 4 | Concept copy is exact. Two wordings mislead (Minors 1 and 2). |
| D11 Feedback | 5 | Loading, busy, summary plus field errors, sent, dead, plan withdrawn, 429 and a load error are all drawn. |
| D12 Visual | 4 | Calm card, team tokens, one filled button. The 375 px primary button is 40 px (Minor 4). |
| D13 Accessibility | 4 | axe clean on every state checked, 1280/1024/375 and 200 % zoom with no sideways scroll, keyboard path, focus moves. The summary does not link to fields (Minor 3). |
| D14 Team look | 4 | Same frame and components as S2. |
| D15 Speed | 5 | Form send → Check your email in 113–126 ms. One GET per view. |
| D16 Testability | 4 | Each fail line fails when its rule is removed (token strip → IV1; hashchange → IV3; client terms check → IV2's POST count). PLAN_GONE, 429, server 422 and Resend have no test (Minor 5). |
| D17 First use | – | Simulated only. |
| D18 Provenance | 4 | "Set by your invitation", "This invitation is for this email only", terms versions shown. |
| D19 Closure | 4 | Link → form → email → Confirm → one firm in Trial, by screens. The staff console is Not built (§2). |
| D20 Wow | – | Simulated only. |

## [M] lines
**Met:**
* Authorisation on the server: making a link with no token → 401, by a firm Owner → 403 (j_90). Public doors are scoped by token.
* Problem Details 422 with named fields, shown on the fields (J3).
* Idempotent create and duplicates under a race: double click and two tabs (D2).
* Personal data minimised: the password never appears in an address or in storage, and the token is out of the URL (IV1, IV5).
* No `any`. Comments carry their reasons. Module row `MODULE.rows/PF-5s8.md`.
* axe on the form, refused, sent and dead states at 1280 and 375. A 0-day plan reads "Sign up".
* Each business rule has a pass and a fail test, except the gaps in Minor 5.

**Not met:** concept fit for §7b M4 (Major 1).

**Not a finding:** links made through `POST /api/system/signup-links`, and j_90 seeding a staff member by SQL. Our staff's console is on the concept's Not built line (P-26).

## Deviations (`challenge.md`, bottom section)
* **M4, plan fixed: not sound as argued.** `challenge.md` says SA-4-4 ties the plan to the link our staff chose. It does not. SA-4-4 only keeps INTERNAL plans out of self-serve. The newest requirement says the opposite:
  * SA-2-22 v2.24 (`domain/requirements-2026-11-02/.../SA-02-tenant-firm-management_v2.24_2026-10-12.md` l.460): "The sign-up page offers only Active, Public plans."
  * The complexity register, row 1 (l.323): "The link lets a firm pick its plan itself."

  The cost also shows in the build: when the link's plan is withdrawn (J6), the person reaches a dead end ("This link's plan is not offered … Ask us for a new link"). A Change would let them go on.
* **BR-13, the email check kept: sound.** In this part our staff hand the link over themselves (`signup.ts` makeLink: "no email from us in this part"). Holding the link does not prove the person owns the mailbox. Keeping the provider's check stops someone creating an account on another person's address. `challenge.md` should give this reason, and the Lead should amend BR-13's text.

## BIC (EXPERIENCE §6, the concept's §4c choices; evidence: own screenshots at 1440 and 1024, builder's at 1280 and 375)
| Id | Score | Evidence |
|---|---|---|
| BIC-01 | Met | Email, country and plan come from the link and are never typed. The firm name is carried to the firm (J1). |
| BIC-02 | Met | Password, firm name and the tick only. |
| BIC-04 | Met | No asterisks. Fixed values are shown as text. |
| BIC-11 | Met | One filled button, "Start free trial". |
| BIC-13 | Partly | Errors appear on the field and in a summary, and typed input is kept. Summary items do not name or link their field ("Not only spaces.", j3 at 1024). Should. |
| BIC-14 | Met | The country help is a visible hint. No chips or icons. |
| BIC-18 | Met | Loading, refused, sent, dead, plan withdrawn and 429 are all drawn. |
| BIC-19 | Met | 2 inputs plus the tick. One heading and one primary per panel. |
| BIC-20 | Met | Keyboard at 375 (IV5). 200 % zoom with no sideways scroll. axe empty. |
| Others | N/A | As in concept §4c. |

UXL-09: Not met. The primary button is 40 px at 375 (`Button size="lg"` = `h-10`). It is shared with S2, so it is a Should.

## Issues, ranked
1. **Major (Must): §7b M4 is not built, and the deviation's argument misreads SA-4-4** (`invited-page.tsx:169`; `signup.ts` `InvitedBody`). Fix one of two ways:
   * (a) Give S8 S2's in-place Change picker: the link's plan and period as the default, choices from the Active Public plans of `GET /api/public/plans`. `InvitedBody` accepts an optional `planCode`/`period`, checked active and public on the server. Add a pass and a fail test.
   * (b) Lead B rules in writing to keep the plan fixed: amend concept M4 with the right citation and correct `challenge.md`.
2. **Minor (Should): a reload calls a working link dead** (`invited-page.tsx:60`; j2 at 1440). The heading reads "This sign-up link doesn't work" and the page says "To ask for a new link, reply…", but the link still works. Fix: the heading "Open your invitation link again" and `ask: false`.
3. **Minor (Should): the 429 words on submit** (`invited-page.tsx:28,90`). "Wait a minute, then open the link again" makes people reopen the link and lose what they typed. The door says "a few minutes". Fix: "Wait a few minutes, then press Start free trial again."
4. **Minor (Should): BIC-13 summary items do not name or link their field** (`invited-page.tsx:160`; same in S2 `signup-page.tsx:121-127`).
5. **Minor (Should): UXL-09 at 375.** The primary button is 40 px (needs 44, P-795). The standalone "Already set up? Sign in" link is 17 px tall (needs 24, WCAG 2.5.8). The button is a shared component; fix it or list a follow-up row.
6. **Minor (Should): untested branches** (`invited-page.tsx:43-44,82-92,108-117`): PLAN_GONE (a link state of BR-13), the server 422 on the fields, Resend on S8, and 429. Add browser lines for PLAN_GONE and the 422 at least.
7. **Minor (records):** `challenge.md` should state the stronger BR-13 reason (above).
8. Nit: Country is hard-coded "Canada" (`invited-page.tsx:168`) and ignores `invite.countryCode`. Harmless while the door accepts only CA.

## Not checked
* A real screen reader. An intended user's unaided walk (D17 and D20 stay with the founder).
* Resend after 60 s: the copy's 10-minute per-IP limit blocked it. The code shares `post()` with the send.
* `GRAPH.md` does not index the platform pages, and it lists `GET|POST /public/signup/:token` as `testedBy: []` because test paths are template strings. That is a gap in the graph. `check_r190_invited_signup.ts` and this check do call both routes.
* Live mutation runs (rebuild per mutation). The test-fails-without-the-rule check above is by reading the code.
* **The head moved while I reviewed.** The builder committed `fd282071a` (j_90 screenshots) and `d5e3782d4` (break round 1, 06:35 UTC) in this same checkout. The second run of each suite (second copy, started about 06:30 UTC) may have used a tree being edited; the first run and every walk above were on `65e4e1fa3` (the old reload and 429 words show it). `d5e3782d4` says it fixes Minors 2–4. Not reviewed. It leaves the plan line, so Major 1 still applies there.
* `break-report-invited.md` (the breaker's) was not read.

Verdict: Changes at 65e4e1fa39bc666f0a71e89f42f4ab366c3ccf77 (one open Major, so not an Approve; the builder does not label `review: approved`).
Reviewer: Changes 65e4e1fa39bc666f0a71e89f42f4ab366c3ccf77
