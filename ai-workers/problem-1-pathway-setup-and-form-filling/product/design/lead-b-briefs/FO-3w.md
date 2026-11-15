# Brief: FO-3w, the public booking pages (map row 37's screens; rows 38, 40, 42) (cloud builder lane; row owner Lead B)

Drafted 16 Nov 02:2x IST by the shaping lane, for Lead B's approval (P-558). Row: BACKLOG **FO-3w** (rev 15; waits on FO-3pa, rev 16.23). The concept is approved: `screens/fo-3-booking/concept.md` r2 (FO-3sc, #1819, on `main`). With FO-3w on `main`, map row 37 has every part but J-37's walk. **Model: Opus 5.5, effort: high** (a public door and new screens; reviewer and breaker at high, P-605).

**Starts when:** FO-3pa **#1830** is on `main` (the list, the optional consent tick, the flags, the firm's contact lines, the `.ics` and the cancel reason are its answers; concept BR-5: "no interim ships on a public door"). **Branding (the firm's logo and colour, AG-4-16 rule 3) waits on PF-13**, which has no brief yet: see "Split" and "For Lead B".

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next screens FO-3w` and take **one row, FO-3w, the public booking pages**, end to end on a fresh branch from `origin/main`, one PR per part.

**Read only these:**
* the concept `product/screens/fo-3-booking/concept.md` §1, §3 **BR-1 to BR-11**, §4 "Public", §4c, §5 "Public" and "Manage", §6 the table and **FO-3w's journeys J-P1 to J-P9**, and its mock-up `screens/fo-3-booking/design/public.html`;
* requirement text, in full (`domain/requirements-2026-11-02/02-functional-requirements/agent/AG-04-consultation-and-booking_v2.1_2026-10-25.md`): **AG-4-16, -17, -18, -19, -20** (page, not-found, visitor's zone, form and consent, protection) and **AG-4-36, -37, -38** (manage link, limit, bad link), plus **BR-1, BR-3, BR-5** of Part C1. Every string comes from concept §5; where §5 has AG-04's words, AG-04 wins;
* on `main` after #1830: `api/src/front-office/booking/public.controller.ts` (the public routes and their answers) and FO-3pa's `tests/check_fo3pa_public_answers.ts` (what each answer holds);
* `web/src/modules.tsx` and `modules/README.md` (PF-1's seam), `web/src/modules/front-office/routes.tsx`, FO-4's hosted web-form page `sales/web-form-page.tsx` (the house pattern for a public page with no Studio shell and no staff session);
* the module card `web/src/MODULE.md` (web-shell).

**What to build:** new files under `web/src/modules/front-office/booking-public/` (pages, `contract.ts` with the zod shapes of FO-3pa's answers, a small public frame with the firm's name and no Studio shell), and their routes added to `web/src/modules/front-office/routes.tsx`: `/book/:firmKey` (list), `/book/:firmKey/:slug` (type → times → details → confirmation, three steps on one page), `/book/:firmKey/manage` (the token from `#…`, never sent in a query string or a log). Calls go to `/api/public/...` with plain `fetch` (no staff token, no `x-actor`). No API file: anything the API lacks is a question on FO-3pa's lane or a PR comment here.

**Done when** (P-606: list the cases in the PR body first; the reviewer ticks one per line). In `tests/check_fo3w_booking_browser.ts` (Playwright on the local stack; the concept's journeys, Sample firm `maple`):
* `FO-3w J-P1 pass/fail` (BR-1, AG-4-16): two public types, one not shown and one case type → two cards; no public type → the empty text with the firm's email.
* `FO-3w J-P2 pass/fail` (BR-3, AG-4-18): a Dubai browser sees Client F's 14:00 Toronto slot on Tue 20 Oct as 22:00 with "Times shown in Asia/Dubai (change)"; switching to Europe/London shows 19:00 and the booked UTC instant is unchanged.
* `FO-3w J-P3 pass/fail` (BR-5, AG-4-19): keyboard only, box unticked → "You are booked" with Add to calendar, Reschedule, Cancel and the join line; no marketing consent stored (read through the API); ticked → one consent with the wording id; a firm with no sentence → no box, booking works.
* `FO-3w J-P4 pass/fail` (BR-7, AG-4-36): the slot is taken between choosing and booking → "This time was just booked." and "Please choose another time.", answers kept, next free times shown; a double click books once.
* `FO-3w J-P5 pass/fail` (BR-4): Sun 1 Nov 2026 in America/Toronto shows no time twice and the DST note; Sun 14 Mar 2027 shows no 02:00-02:59 time.
* `FO-3w J-P6 pass/fail` (BR-8, AG-4-36 rule 3): the email link `/book/maple/manage#…` → Reschedule → "Booking updated…"; Cancel on the same page works with the new token; the old link shows the bad-link text; the cancel reason (optional, ≤500) is sent and never shown back.
* `FO-3w J-P7 pass/fail` (BR-9, AG-4-37): 3 h before the start → the limit sentence with "4 hours" and the firm's phone, no buttons; `allowCancel: false` → "This booking cannot be changed online…".
* `FO-3w J-P8 pass/fail` (BR-2, BR-10, AG-4-17, AG-4-38): a cancelled, expired or garbage token → one bad-link text; an unknown firm, unknown slug or a UUID → the identical "This page is not available."; no id appears in any page's text or address.
* `FO-3w J-P9 pass/fail` (BR-6, BR-11, AG-4-20): the type page in an iframe books normally; a filled honeypot is refused and nothing saved; the 21st request in a minute shows "Please try again in a minute."; every step works at 360 px with 44 × 44 px targets.
* `FO-3w DW10`: axe-core with no serious or critical finding on every page and state; layouts at 360, 375, 1024 and 1440; the network log shows no call to any host but the app (no outside fonts, maps or trackers).
* `FO-3w DW11`: `/book/*` overlaps no `APP_ROUTES` path (PF-1's test passes), and FO-4's web-form page suite passes unchanged.

**Duplicate check:** BACKLOG (FO-3w; FO-3pa is its API; FO-3st1-3 are the staff screens), open PRs (#1830 is the API; no PR adds `booking-public/` at 02:2x IST 16 Nov), `main` (no public booking page; FO-4's web-form page is a different door), BUGS (none); one `Duplicate check:` line after re-running it.

**Touch list:** new files under `web/src/modules/front-office/booking-public/`; `web/src/modules/front-office/routes.tsx` (three route lines); `tests/check_fo3w_booking_browser.ts`; `web/src/MODULE.md` only if an invariant changes (else `Card unchanged: <reason>`).

**Contract used:** FO-3pa's public answers and FO-3's public routes over HTTP (contracts `platform-and-front-office-contracts-2026-11-14.md` §2.2); zod shapes in `booking-public/contract.ts` (concept §2). No `ports/` change.

**Parallel safety:**
* `web/src/modules/front-office/routes.tsx` is one file for every front-office screen row (FO-4 parts 2-3, FO-3st1-3, FO-5s): each adds its own lines only; the second PR merges `main` in. No other file is shared.
* No API, schema or `ports/` line, so it runs beside every API lane once #1830 is merged.

**Split (P-610: each part under 800 changed lines, tests included):** part 1 the list, the type page with times, form and confirmation (J-P1-J-P5, J-P9, DW10, DW11); part 2 the manage pages (J-P6-J-P8). **Branding:** the firm's logo and colour arrive with PF-13; until then the public frame shows the firm's operating name only (from FO-3pa's answers).

**For Lead B (drafted, not settled):** the row waits on PF-13, which has no brief and needs FO-5's `FilesPort`. Either (a) FO-3w waits whole for PF-13, or (b) FO-3w ships parts 1-2 with the firm's name and PF-13 adds the logo and colour to this frame as its own Done when line. The draft follows (b) because AG-4-16 rule 3 says "No separate booking-page branding": the branding is PF-13's to apply everywhere, and J-37 needs the pages, not the logo.

**Reviewer and breaker** (P-278: new screens, a public door): the breaker tries the token in the address bar's history, a reload after booking, a zone of `Etc/GMT+14`, the honeypot by keyboard, and the page at 200 % zoom.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.
**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
