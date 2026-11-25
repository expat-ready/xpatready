# Review: PF-5s part 1, the public sign-up pages (S1 Pricing, S2 Sign up, S3 Check your email, S3b Confirm)

PR #2608 · commit `fd662e5ba8c9c96d2a4f85e21d9383108e007d50` · independent reviewer (Opus; I did not build it) · 20 Nov 2026. Read: brief `lead-b-briefs/PF-5s1.md` (aa024670a); concept `pf-5s-saas/concept.md` r2 (lead-b-front-office), §3, §4, §5 and §7b; PF-5's door on main (`api/src/platform/firms/signup.ts`, `routes.ts`); the diff against origin/main. I walked my own isolated copies on :4596, never :4400. Journey test: `journey-test-reviewer-2026-11-20.md` (**9/10, pass**).

**Verdict (skill scale): Ship.** No Blocker, Major or Must is open. The Shoulds below are listed, each with a follow-up.

## The tech lead's acceptance point: holds
* **Client check:** I filled the form, left the tick unticked and pressed Start free trial. The page shows "Please accept the terms to continue." on the tick and in the summary, and focus moves to the summary. After 4 s there were 0 POSTs to `/api/public/signup`, 0 pending rows, 0 firms and 0 emails. Once ticked, the sign-up goes through to Check your email, the link, Confirm, the firm key and the sign-in. The firm, its Owner and 3 acceptances are stored, and the sign-in does not ask again.
* **The door's refusal when a version changes while the page is open:** I published a new ToS version after the page loaded and then pressed Start free trial with the tick ticked. The door refused it (1 POST, nothing stored). The page shows "The terms have changed since this page opened…" plus the door's words on the tick, clears the tick, lists the new version and keeps every answer. Pressed again unticked, it is refused on screen with 0 POSTs. Ticked, it finishes, and the stored acceptance is **the new version** (`signup-page.tsx:69-74`).
* A test fails if the rule is removed. Without the `!v.agree` check (`signup-page.tsx:59`), DW2 and W0 fail on `signupPosts === before`. Without the refetch-and-untick, DW2's version step fails on "tick cleared, new version listed".
* My re-runs on fresh copies at this commit: `check_pf5s1_signup_browser.ts` **48/48**, `j_100.ts` **27/27** (W0 plus the 22 that already existed).

## The three deviations from the brief: all sound
1. **Routes `/pricing`, `/sign-up`, `/sign-up/verify`** instead of `/signup`, `/signup/check`, `/signup/confirm`. Sound. The door on main writes `${appUrl}/sign-up/verify#token=…&code=…` (`signup.ts:183`) and its Checkout returns `/sign-up/trial*` (`signup.ts:257`). Changing the door is outside the touch list. Making Check your email a state of `/sign-up` keeps the password out of the address and history. I checked this: only `?plan=&period=` appear in the URL.
2. **No code input on S3** (concept BR-5). Sound. `VerifyBody` needs the token from the link as well as the code (`signup.ts:97`), so a code typed alone cannot confirm without a door change. The binding §7b M1 (the link opens S3b with the code filled in) is met. The gap belongs to PF-5 part 2 (S2 below).
3. **One tick for all three documents.** Sound and binding (concept BR-3). Two-of-three can only be sent to the door directly, and that refusal is proven in j_100 W1, which still passes.

## D1–D20 (independent reviewer, browser and script; 1–5)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | BR-1 to BR-5 and §7b M1, m2, m4, m5 (part), m7 are present; R1.19 and R1.100 shown on screen; the S3 code entry is deferred with a reason |
| D2 Data integrity | 5 | a double click on Start sent 1 POST and a double click on Confirm made 1 firm; the door's lock and single-use token; the stored versions are exactly the ones shown |
| D3 Reuse | 4 | reuses `safeUrl` from the terms module, Frame, Field and Notice; the web zod `Plans` is local (house pattern, as in `terms/contract`) |
| D4 Rule integrity | 5 | a version change re-reads the terms; plan and period are carried; the `RELOAD` path keeps the person's answers |
| D5 Stability and recovery | 4 | restart and version change recover; a reload on Check your email loses the email (journey F5) |
| D6 Freshness and governance | 4 | audit lines for firm, Owner, terms and subscription (door); versions named on the tick |
| D7 AI trust | N/A | no AI |
| D8 Orientation | 4 | trail "Pricing › Sign up" and a page title on every page |
| D9 Flow | 5 | Pricing to signed-in Owner; one primary per card or form |
| D10 Language | 4 | concept §5 words; "expired or already used" is wrong after 5 wrong codes; "Price not shown" is unexplained |
| D11 Feedback and state | 4 | busy state, focused summary, resend countdown; the tick's error stays after ticking |
| D12 Visual quality | 4 | calm public frame and team controls (`s2-terms-refused-1440.png`) |
| D13 Accessibility and responsive | 5 | axe clean on every state; keyboard path; 375, 1024 and 200 % with no sideways scroll |
| D14 Team look | 4 | team tokens and components; public Frame `area="outside"` like the other public pages |
| D15 Speed | 5 | Pricing 123 ms, Sign up 325 ms; the up-to-3.3 s hold after Start is PF-5's minimum fill time |
| D16 Testability | 4 | DW1–DW5 and W0, each with a pass and a fail; re-run by me; screenshots at 375, 1024 and 1440 |
| D17 First use | simulated only | no intended user walked it |
| D18 Provenance | 3 | Sample marks and version names, but the document links do not open the documents (S1) |
| D19 Closure | 4 | this part's slice closes (sign-up → signed-in Owner); the trial hand-off is part 2's |
| D20 Pain and wow | simulated only | |

## BIC scorecard (concept §4c chose it; my steps, plus the builder's screenshots at 1440 and 1024)
| BIC | Score | Evidence |
|---|---|---|
| 01 Ask once | Met | plan and period carried from S1 (`?plan=firm&period=YEARLY` → "Firm (Sample), yearly"); the email is never retyped (Check your email names it) |
| 02 Asked for a reason | Met | 3 inputs, each needed by PF-5's body |
| 03 | N/A | concept |
| 04 Incomplete vs invalid | Met | a public form, so blanks are refused at the field in words; no asterisks |
| 05–08, 10, 12, 15–17 | N/A | concept §4c |
| 09 | N/A | concept |
| 11 One primary | Met | one filled button per form; S1 fills the middle card only (`s1-pricing-1440.png`, `pricing-1024.png`) |
| 13 Errors on the field and in a summary | Met | the same words on the field and in the summary, answers kept, focus to the summary; the door's "2 to 120 characters." has no subject (Minor) |
| 14 Help in place | Met | country help is a visible hint (needed to act); no chips or icon-only buttons |
| 18 States | Partly | loading, error, refused, link states and resend are drawn; no-price-at-all shows "Price not shown" with no reason (S3) |
| 19 Low load | Met | 3 inputs plus a fixed country, plan and tick (at most 5); one heading per panel; red only for errors |
| 20 Accessible | Met | keyboard walk, visible focus, 200 % and 1024 px, headings in order |

## [M] lines (STANDARDS and EXPERIENCE) relevant to this item
Met: §3.4 checked twice (client tick plus the door's current-version check); §3.10 a pass and a fail per rule; §6 RFC 9457 errors shown per field (`api.ts:24-37`); server authorisation (public door, rate-limited per IP; nothing on these pages needs a role); §5 personal data (the password is in a POST body only, never in the URL or storage: DW4 plus my URL check); §7 strict TypeScript, no `any` in the new web files, comments give reasons with concept references, module card `MODULE.rows/PF-5s1.md`; axe on every state; EXPERIENCE §1 one primary; §2.10 errors on the field; §2.12 accessible; §4 states (except S3); demo chrome is absent from the public frame. N/A: migrations (none), engine, AI, uploads. One gap: §7 "no duplicated logic web/API". The 12-character and email checks are repeated client-side for field feedback (house pattern; the door stays the authority).

## Issues, ranked (no Must)
* **S1 Should (follow-up, owner PF-5t):** the version links go to `/legal/terms`, `/legal/privacy`… (seed, `prisma/migrations/20261115180000_pf5_signup_terms/migration.sql:140`). No page serves them, so a new tab opens the internal Product Studio and the person cannot read the terms they accept. This predates the PR and the data is outside its touch list. Fix: a Sample document page for each kind and version, or seed URLs that resolve.
* **S2 Should (follow-up row, PF-5 part 2):** BR-5's "code typed on S3" needs a door that confirms by email and code (or a token held by the page). Record it in `screens/PF-5s/challenge.md` or as a PF-5 part 2 gap so it is not lost in the PR body.
* **S3 Should:** with no plan priced (the demo and CI seed, `pricesAvailable: true`), every card reads "Price not shown" with no reason. Fix: show the "Prices unavailable" notice when no plan has a price as well (`pricing-page.tsx:90`).
* **S4 Should:** `post()` sends every current term id whatever the tick says (`signup-page.tsx:46`). Only line 59 stops an unticked send. Fix: `acceptedTerms: values.agree ? data.terms.map((t) => t.id) : []`, so that a future slip in the client check is refused by the door rather than recorded as an acceptance.
* **Minor:** after 5 wrong codes the screen says "expired or was already used" (the door's single 404; §7b m5 wants "too many tries"). The tick's error stays after ticking. The `RELOAD` words appear only in the summary. After "Send it again" the first email's link is dead, but S3 does not say to use the newest email. The password hint is static, where BR-2 says "as you type".

## Graph (P-86) and capability
I ran `graph.mjs`: G1 0, G2 0. The graph does not see module pages (its `pages` list is empty for `/pricing` and `/sign-up`), so it lists `GET /public/plans` and `POST /public/signup/verify` under G3. Both are exercised in a browser by `check_pf5s1_signup_browser.ts` and `j_100.ts`. This is a limitation of the tool (`call()` builds `/api/public/${path}`), not an untested route. Every element serves S1–S3b. No step relies on scaffolding: the demo inbox stands in for the mailbox (labelled stand-in SI-20).

## Retrofit mapping
`MODULE.rows/PF-5s1.md` records the entry points and tests. The routes sit in the platform module's `routes.tsx`, not `APP_ROUTES` (DW5).

## Not checked
A real screen reader; real Cognito and Stripe; the 2-hour stamp expiry (simulated by a restart); the 429 wording in a browser; an intended user's walk (D17, D20).

**Blockers:** none. **Majors:** none.

Verdict: Approve fd662e5ba8c9c96d2a4f85e21d9383108e007d50

## Re-review (diff only: `git diff fd662e5ba..df097cb79`, 20 Nov 2026)
I read the three code files, `challenge.md`, `break-report.md` and the list of changed screenshots. I did not re-walk or re-run anything. I rely on the builder's re-runs at e992a1991 (the same code as df097cb79): `check_pf5s1_signup_browser.ts` 48/48 and `j_100.ts` 27/27.
* **S4, fixed:** `acceptedTerms` is now `values.agree ? ids : []` (`signup-page.tsx`, `post`). The door is now the second check of the tick. `again` posts the `v` that was sent (agree true), so Send it again is unaffected.
* **S3, fixed:** "Prices unavailable" also shows when no plan has a monthly or yearly price (`pricing-page.tsx:38`).
* **The tick's error clears on ticking:** fixed (the `onChange` drops `acceptedTerms` only when `b` is true).
* **Breaker m1, fixed:** an `inFlight` ref is set before the first `await` in `send`, `again` and `confirm`, and cleared in `finally`. On Confirm, `done` stops any further submit, and a late failure returns from `catch` without replacing the done view (`finally` still runs).
* **Breaker m2, fixed:** when Send it again meets `RELOAD` or an `acceptedTerms` refusal, the page re-reads the terms, clears the tick, returns to the form and shows the door's words on the tick. This matches `send`, and the key acceptance point is unchanged.
* **Breaker m7, words fixed:** "filled in" appears only for a 6-digit code from the link.
* **S1, S2 and m3–m6:** recorded in `challenge.md`, each with its owner. That meets "never silent".
* **New Minors (not blocking):**
  - When m2 sends the person back to the form, focus is not moved to the summary.
  - Its words "The terms have changed since you signed up" are also shown for `RELOAD`, where the real cause is a page that is too old.
  - A garbled `#code=` is still pre-filled as typed (`useState(link.current?.code ?? "")`). The submit check refuses it with "Type the 6 digits from the email.", so no harm comes of it.

**Blockers:** none. **Majors:** none.

Verdict: Approve df097cb7906ae78641abba50140fc47df0f1fe58
