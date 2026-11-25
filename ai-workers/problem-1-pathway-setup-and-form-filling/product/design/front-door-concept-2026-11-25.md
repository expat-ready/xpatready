# Demo front door: concept (25 Nov 2026)

Ask A391 (founder, 25 Nov ~16:3x IST): the demo looks simulated and mixed. He wants one place to walk it end to end: pick a persona, be signed in as a seeded test user, do that persona's part, and see a map of who does what. No documents, no copied IDs or passwords. Addendum A392 (~16:4x IST): it must be the real product, with a guided walk beside the real sign-in (§7). Skill `screen-concept`. Records and design only: no product code in this PR. Screenshots are in `front-door-2026-11-25/` (1440 px, main b7778cb74, the configured checkpoint loaded, live AI off, US$0).

## 1. Job, personas, and how each signs in today (the walk)

**Job:** someone showing the product (the founder, a partner, qa) walks one client's journey from enquiry to money as each person who does a step. Each step happens in the shell that person would really use, signed in as a seeded user, with no setup.

**Personas, corrected from the code.** There are six firm roles (`PlatformRole`: OWNER, ADMIN, CASE_MANAGER, CASE_OFFICER, BILLING_FINANCE, READ_ONLY, see `GET /api/platform/roles`). Only four firm users are seeded (`samples/firms.json`): Representative = Owner + Case Manager, licensed; Case officer; Second representative = Case Manager; Solo representative. **No Admin, front office or money user is seeded**, so front office work and money are done today by the Owner. Our own side has two sets of people. The Studio's content team (Configuration author, Content reviewer / immigration SME duty, Approver) are simulated people (`web/src/lib/simulated-people.ts`). The console staff are on a separate sign-in (ops.sample@, support.sample@). Clients A and B exist only as simulated people: a client login portal (R1.62) is **Not built**, and clients reach their questions by a link (R1.101 Works).

**Three ways to sign in today, and they do not know about each other** (root cause of most of the mix-ups):
| Way in | Who | How it works | Screens |
|---|---|---|---|
| `/sign-in` "Who are you today?" | 9 simulated people | Picking a card stores `xr-actor` in the browser. The API trusts the `x-actor` header (`core.ts:104`) | Studio, cases, case page, client questions |
| `/home` "Sign in to your firm" | firm staff | Type a **firm key** and work email; local stand-in token (PF-4, `session/local`) | front office, money, team, settings, clients |
| `/system` | our console staff | Type a work email; our own stand-in token (PF-4s) | console |

| # | Persona | Screen walked | What looks simulated, mixed or not like a product |
|---|---|---|---|
| W1 | Anyone | `01-sign-in`, `02-home` | Two different sign-in doors with different people lists. "Simulated people: no passwords". The firm card asks for a "Firm key" and says "local stand-in sign-in until the firm sign-in screens are built". |
| W2 | Configuration author (ours) | `03-author-programs` | Our own tool says "Every combination **your firm** can open". Shown at the same time: the chip "Prototype · demo workspace", a Demo menu, an "Acting as" picker listing clients, a footer "Simulated people; local PostgreSQL demo database … Not production", a "Release 1 screens" menu entry, and a link "Cases (as Case officer)" that **changes the person** |
| W3 | Owner (Representative) | `07-owner-home` | The real firm shell, but the header shows the key `sample-firm`, not the firm's name. Home opens with a developer panel, "Release 1 screens: open any screen", with a link to "Sign in · pick a simulated person". |
| W4 | Owner, then Cases | `12b-cases-after-firm-signin` vs `07` | **Two people at once.** Signed in as Representative (Owner), the Cases page shows "Acting as **Case officer** · Simulated" and a link "Product Studio (as Configuration author)". The firm shell and its menu are gone. |
| W5 | Case officer | `04-caseofficer-cases`, `14-case-officer-case` | The case page says "Sign in as firm staff (under Decision and closing) to see and record government steps", so the case officer must sign in a second time. Also shown: "Release 1 (as Configuration author)", "Stand-in" chips, and "Hand to Client A (simulated)". |
| W6 | Client A | `06-clientA-cases`, `15-client-questionnaire` | The client's own page has the staff "Acting as" picker, offering Configuration author, Approver and the Representative. A client can become staff in one click. |
| W7 | Front office, money | `08-fo-leads`, `10-money-invoices` | Empty: no lead, prospect, booking, retainer or invoice is seeded. Yet Client A's case exists with nothing behind it, so the story does not connect. |
| W8 | Owner, Team | `11-owner-team` | Works and looks real. The Case officer's email `user-o@sample-firm.example.com` leaks the internal id. |
| W9 | Our console | `16-console-firms` | Looks real. A separate sign-in, and it cannot reach the Studio, where our own content team works. |

## 2. (a) Persona map: who does each step (status read from `qa/CAPABILITIES.md` at 60103172f, 25 Nov 05:47Z: 63 Works · 17 Partial · 21 Not built)
| Step | Done by (seeded user) | Shell | R1 rows (status) |
|---|---|---|---|
| Set up the program (once) | Configuration author → Content reviewer → Approver (ours) | our console › Content (the Studio) | R1.84 Works, R1.83 Works |
| Enquiry | the visitor (no sign-in) | firm's public pages | R1.26 Works, R1.27 Works, R1.28 Works |
| Lead | Front office (new seed: Admin role) | staff app › Sales | R1.30 Works, R1.32 Works, R1.29 Partial, R1.108 Works, R1.110 Works |
| Consultation | Front office books, Representative holds it | staff app › Calendar | R1.37 Works, R1.39 Works, R1.104 Works, R1.42 Works, R1.112 Not built |
| Retainer | Representative sends; client signs by link | staff app; client link | R1.53 Works, R1.54 Partial, R1.55 Partial, R1.31 Works, R1.61 Partial |
| Case | Case officer opens; Representative of record | staff app › Cases | R1.72 Works, R1.73 Works, R1.74 Works, R1.75 Not built |
| Forms | Client answers; Case officer prepares | client portal; staff app | R1.101 Works, R1.80 Works, R1.63 Works, R1.62 Not built |
| Sign | Client signs by link | client link | R1.54 Partial |
| File | Representative approves and records it | staff app › Case | R1.82 Works, R1.77 Works |
| Money | Accounts (new seed: Billing and finance role) | staff app › Money | R1.56 Partial, R1.58 Partial, R1.59 Works, R1.57 Not built, R1.60 Not built |
| Run the service | Support (ours) | our console | R1.93 Works, R1.87 Partial |

The front door shows this map live. Map steps are tagged with their row ids in `samples/walk-map.json`. A build step reads each status from `CAPABILITIES.md` (FD-3), so the map never says Works where qa does not. A step with no working row shows "Not built yet" and offers no button.

## 3. (b) The front door page (`/walk`, guided walk)
* **Layout:** the Catalogue pattern (`EXPERIENCE.md` §3), on the team's tokens. Top: "Guided walk · Sample data · not a real firm". One row of **persona cards** in journey order: Front office, Representative, Case officer, Client A, Accounts, Owner, Our support, Our content team. Each card has the role's real name, "does steps 2-3", and one button: **Sign in as Front office (Sample)**. Below: the journey map (§2), where each step names its persona and links to the screen with that persona signed in. To the right, the panel **Real sign-in** (§7): "Sign in with your email", the same page a firm uses.
* **One click:** `POST /api/walk/sign-in {persona}`. The server looks up the seeded user for that persona and issues **that persona's real session**. It goes through the same service and audit line as the firm sign-in ("walk sign-in", as that firm): staff get the PF-4 token, our console staff the PF-4s token, and the client gets their own link (R1.101), later the portal (R1.62). Then it opens that persona's home. No ID, password or firm key is typed or shown. A "Back to the guided walk" link sits in the account menu only, never in the product's pages.
* **Refused unless demo or staging.** Environments in the code are `local` (the Mac demo and lane copies), `test` (staging) and `production` (`config/settings.ts`). Four locks:
  1. A new setting, `PLATFORM_GUIDED_WALK=on|off` (unset means off), read by the one loader. The loader **refuses to start** with `on` when `PLATFORM_ENVIRONMENT=production` and names the setting, the same way `PLATFORM_IDENTITY=local` is refused today.
  2. The walk's routes and its seed register only when the setting is on; otherwise `/api/walk/*` answers 404 like any unknown address.
  3. The CDK test fails a production task definition that sets `PLATFORM_GUIDED_WALK` or `PLATFORM_SAMPLE_SEED`, following `deploy/cdk/test/service.test.ts` "PF-8b fail".
  4. The page itself reads the flag from `/api/session` and shows only the real sign-in when it is off.
* **Fail tests (FD-1):**
  * `loadSettings({PLATFORM_ENVIRONMENT:"production", PLATFORM_GUIDED_WALK:"on", …all required})` throws ConfigRefused naming `PLATFORM_GUIDED_WALK`.
  * A booted copy with the walk off answers 404 to `POST /api/walk/sign-in` and writes no audit line.
  * The CDK test fails on a production task definition carrying the setting.
  * Pass test: on `local` with the setting on, the Front office card's session can `GET /api/platform/me` as the seeded Admin.

## 4. (c) One shell per persona; the worst mix-ups fixed first
| Shell | Who | Has | Never has |
|---|---|---|---|
| Staff app | firm staff, every role | the firm's name and logo, the menu its keys allow, the signed-in person, Sign out | "Acting as", simulated people, Studio links, "Release 1 screens", firm key |
| Client portal | the client | the firm's branding, "Signed in as Client A", only their own case | any staff control or person picker |
| Our console | our staff (support, ops, content team) | Firms, Support, Content (the Studio), our sign-in | a firm's menu |

The Demo menu and checkpoint loads stay in one place, the front door's "Demo data" fold-out (P-35), and only while the walk is on.

**Fixed first (from §1):**
1. **M1, two people at once (W4, W5).** Case pages take the person from the firm session, never from `x-actor` (FD-5, FD-6).
2. **M2, the client can become staff (W6).** The client portal shell has no picker (FD-7).
3. **M3, signing in twice and links that switch person (W2, W5).** "(as Configuration author)", "Cases (as Case officer)" and "Sign in as firm staff to see government steps" go (FD-6).
4. **M4, developer chrome in product screens (W1-W3, W5).** "Release 1 screens", "Prototype · demo workspace", the "Simulated people…" footer, "Stand-in" chips and the firm key in the header go; the header shows the firm's name (FD-8).
5. **M5, a story with gaps (W7).** One connected Sample story: an enquiry becomes a lead, then a consultation, then a signed retainer, then Client A's existing case, then an invoice. It is seeded through the same services as the screens (FD-4; DEMO.md rule "the seed calls the same services").

## 5. (d) Rows to build (each one PR under 800 changed lines; IDs proposed, the Lead assigns)
**Duplicate check (all rows):**
* **BK-4a** (`/sign-in` persona cards, simulated people) is what the front door replaces. FD-3 keeps its card component and retires the page's role as the one way in. BK-4a's test `check_bk4a.ts` moves to FD-3.
* **PF-4, PF-4s** are the sign-in services FD-2 calls, with no second token code.
* **PF-4p, PF-4pw, PF-4ps, FO-14** (the client portal, R1.62) are not merged. FD-7 is only the client shell over today's link pages, and R1.62 replaces its door.
* BACKLOG line 462 names an "identity join (the release Lead's row)" that re-keys simulated ids to staff ids, but no row text exists for it. FD-5 and FD-6 are that row; **the Lead must confirm that no release Lead row already holds it.**
* `DEMO-LINK` seeds the Sample consultation type only, so FD-4 extends it and does not duplicate it.
| Row | What | Touch list | Done when (test) | Size |
|---|---|---|---|---|
| FD-1 | Walk setting and its four locks | `platform/config/settings.ts` (one `opt`), `api/src/walk/module.ts` (new), `features/walk.ts`, `deploy/cdk/test/service.test.ts` | `tests/check_fd1_walk_gate.ts`: the production fail, the 404 when off, the CDK fail, the pass on local | ~250 |
| FD-2 | `POST /api/walk/sign-in` and `GET /api/walk/personas` | `api/src/walk/` (new), `samples/walk-personas.json` (new), `samples/firms.json` (+ Front office as Admin, Accounts as Billing and finance, Sample) | `tests/check_fd2_walk_signin.ts`: each persona's session reads `me` as its seeded user with its roles; one audit line each; an unknown persona gives 422; a client gets their own link only | ~450 |
| FD-3 | The `/walk` page: cards, live map, real sign-in panel | `web/src/modules/walk/` (new), `samples/walk-map.json`, `tools/walk-map.mjs` (status from CAPABILITIES.md, checked in CI) | `tests/check_fd3_front_door_browser.ts`: one click per card lands on that persona's home with their name in the header; the map's statuses equal CAPABILITIES.md; keyboard path; 1024 px | ~550 |
| FD-4 | One connected Sample story | `api/src/walk/story-seed.ts` (new; calls the FO, retainer and money services), the Demo fold-out | `tests/check_fd4_story_seed.ts`: lead → prospect → booking → signed retainer → client CL-00001 → C-2026-00001 → invoice, all linked; run twice, changes nothing | ~600 |
| FD-5 | Identity join, API: case and Studio routes take the person from the platform session | `core.ts` (ConfigReadGuard), `case-access.ts`, `firms.ts` (`actorOf` from `platform_staff.actor_id`) | `tests/check_fd5_case_session.ts`: an Owner token reads the case as user-R; a token plus `x-actor: user-A` is still user-R; `x-actor` alone is refused outside `local` | ~600 |
| FD-6 | Identity join, web: case pages inside the staff app | `web/src/runtime/cases.tsx`, `case-*.tsx`, `components/frame.tsx`, `lib/api.ts` | `tests/check_fd6_one_person_browser.ts`: signed in as Owner, Cases shows the staff shell and no "Acting as"; government steps show without a second sign-in | ~650 |
| FD-7 | Client shell over the link pages | `web/src/runtime/` client pages, `components/frame.tsx` (client area) | `tests/check_fd7_client_shell_browser.ts`: no person picker or staff link on any client page; the firm's branding shows | ~300 |
| FD-8 | No demo chrome in product shells | `modules/platform/home*.tsx`, `App.tsx` Studio frame, sign-in card (email first; the firm found from the address, PF-25) | `tests/check_fd8_no_demo_chrome_browser.ts`: with the walk off, none of "Release 1 screens", "Prototype", "Simulated", "Stand-in" or "Firm key" appears on any staff or client page; the firm's name is in the header | ~400 |
| FD-9 | Guided walk on staging (last) | `api/src/walk/cognito.ts`, the CDK walk secrets `xr/staging/walk/*` | the staging pack's walk journey: each card signs in by the real Cognito chain, nothing shown | ~400, plus the founder's AWS step |
| FD-10 | Staging production-like pack (last) | `tests/journeys/` staging runner, test mailbox or TOTP seeds | §7 (4): every persona's journey through the real sign-in on staging, green on one run id, plus the production-mode fail tests | ~500 |

Every row is *Needed for the proof* of A391. FD-1 to FD-4 are scaffolding labelled as demo-only (P-33, never ported). FD-5 to FD-8 are the product itself.

## 6. Copy (plain words)
* Card button: "Sign in as Front office (Sample)". Banner: "Guided walk. Sample firm and people; nothing here is a real client."
* Walk off: "The guided walk is off on this server. Sign in with your email."
* Map step with no working row: "Not built yet (R1.57)."

## 7. From demo to production (A392)
1. **The real product, not a fake demo.** The walk is a door, not a mode. Every screen after a click is the production screen, with the same sign-in session, roles, permission keys and audit lines. The map is an optional guide that a person can close. Nothing behind the door has a demo-only branch: FD-8's test proves the shells carry no demo words.
2. **Two ways in, side by side.** On `/walk` the left side is the **Guided walk** (demo and staging only: cards, one-click sign-in, map). The right side is **Real sign-in**, the page a firm uses: email, then two-step, a passkey once R1.5 lands, invitations (PF-4b), and roles. Any walk can be done either way. The seeded users have real emails in the Sample domain and two-step set up, so the real path works on the demo too: on `local` through the stand-in's second step, on staging through Cognito.
3. **What changes from demo to production:**
| | Demo (`local`) | Staging (`test`) | Production |
|---|---|---|---|
| Users | seeded Sample users | seeded test users in the Cognito pool | invited real users only (PF-4b invitations) |
| Guided walk and seed | on | on (FD-9) | refused at start-up; proven off by FD-1's fail test |
| Two-step and passkeys | stand-in second step | real Cognito MFA, TOTP; passkeys when R1.5 lands | real |
| Secrets | none needed | Secrets Manager `xr/staging/*` | Secrets Manager `xr/production/*` (R1.15) |
| Addresses | localhost | per-firm addresses when R1.24 is on (no-domain mode today) | `<firm>.expatready.com` |
| `x-actor` | allowed only without a session (Studio) | refused (FD-5) | refused (FD-5) |
4. **How each is tested and proven.**
   * **Guided walk:** FD-3's browser test on `local` in CI, and FD-9's walk journey on staging.
   * **Real sign-in:** FD-10 runs the journeys (`tests/journeys/j_*.ts`) as each persona on staging through the real sign-in. The second step comes from a TOTP seed kept in Secrets Manager, or from a test mailbox for email codes. No password is copied or typed by a person. Results go on one run id with a fresh reader (P-339).
   * **Production mode:** FD-1's fail tests, and FD-5's "`x-actor` refused outside local", run against the production configuration.
5. **Order.**
   * **In parallel with the 101 now** (new files, no busy file): FD-1, FD-2, FD-3, FD-4, FD-7, FD-8.
   * **One at a time with the case-side lane** (they touch `core.ts` and the case pages, P-576): FD-5, then FD-6.
   * **Last**, after R1.5's real sign-in chain (PF-4bc and the sign-in page), R1.1 and R1.15: FD-9 and FD-10, the staging production-like pack.

## 8. (e) Questions for the founder (recommendation first)
1. **Guided walk on staging.** (A, recommended) Staging is the one place a partner sees, so its cards sign in by the real Cognito chain from the server. The test users' secrets and TOTP seeds stay in Secrets Manager and are never shown (FD-9). This needs one AWS step by you. (B) The walk runs on the local demo only; on staging people use the real sign-in.
2. **The identity join (FD-5, FD-6).** (A, recommended) Do it now, the two rows one after the other alongside the case-side lane. It is the only real fix for "two people at once", and production must refuse `x-actor` anyway. (B) Hide the picker only, and keep two identities until after Release 1.
3. **Our content team.** (A, recommended) For Release 1 the Studio keeps its simulated people, but you reach it only from our console › Content and the walk's "Our content team" card, labelled as ours and never linked from a firm's app. Moving the content team onto our staff sign-in (PF-4s) becomes an X-row after Release 1. (B) Move it now: about 3 more rows.

**Definition of ready:** the founder answers 1-3 (or takes the recommendations). The Lead confirms the duplicate check on the identity join and adds FD-1 to FD-10 to BACKLOG with owners. Each row's Done-when test is named above.

## 9. Challenger's verdict
(Filled in after the fresh challenge below.)
