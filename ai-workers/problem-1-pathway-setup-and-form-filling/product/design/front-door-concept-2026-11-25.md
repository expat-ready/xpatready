# Front door, journey map and Showcase firm: concept (25 Nov 2026)

**The ask.**
* Ask A391 (founder, 25 Nov ~16:3x IST): the product looks simulated and mixed. He wants one place to walk it end to end: pick a persona, be signed in as a seeded test user, do that persona's part, and see a map of who does what. No documents, no copied IDs or passwords.
* Addendum A392 (~16:4x IST): it must be the real product, with a guided walk beside the real sign-in (§7).
* The founder's rulings on #3758 (Lead 8's comments 7161444804 and 7161481594, ~17:2x-17:3x IST) are folded in throughout and listed in §8.

**About this file.** It follows the skill `screen-concept`. Records and design only: no product code in this PR. Screenshots are in `front-door-2026-11-25/`: 1440 px, main b7778cb74, the configured checkpoint loaded, live AI off, US$0.

**Environments (founder's ruling 4), named as large software companies name them: Local → Staging → Production.** No environment is called "demo".
| Environment | What it is | Value of `PLATFORM_ENVIRONMENT` |
|---|---|---|
| Local | each builder's machine and lane copies (today's :4400) | `local` |
| Staging | pre-production, the same as Production: real sign-in, invited test users, no shortcuts | `test` |
| Production | real firms | `production` |

Renaming the `test` value is not part of this concept. A per-change Preview copy may come later without changing this.

## 1. Job, personas, and how each signs in today (the walk on Local)

**Job.** Anyone shows or checks the product by walking one client's journey from enquiry to money, as each person who does a step. Each step happens in the shell that person really uses:
* the founder, a partner or qa on **Staging's Showcase firm**, through the real sign-in;
* a builder on **Local**, through the one-click walk.

**Personas, corrected from the code.**
* **Firm roles:** six (`PlatformRole`: OWNER, ADMIN, CASE_MANAGER, CASE_OFFICER, BILLING_FINANCE, READ_ONLY; `GET /api/platform/roles`).
* **Seeded firm users:** only four (`samples/firms.json`): Representative (Owner + Case Manager, licensed), Case officer, Second representative (Case Manager) and Solo representative. **No Admin, front office or money user is seeded**, so the Owner does those jobs today.
* **Our content team** (Configuration author, Content reviewer with the immigration SME duty, Approver) are simulated people (`web/src/lib/simulated-people.ts`).
* **Our console staff** have a separate sign-in (ops.sample@, support.sample@; `platform/system-identity/sample-staff.ts`).
* **Clients A and B** exist only as simulated people. The client login portal (R1.62) is **Not built**; clients reach their questions by a link (R1.101 Works).

**Three ways to sign in today, and they do not know about each other.** This is the root cause of most of the mix-ups.
| Way in | Who | How it works | Screens |
|---|---|---|---|
| `/sign-in` "Who are you today?" | 9 simulated people | a card stores `xr-actor` in the browser; the API trusts the `x-actor` header (`core.ts:104`) | Studio, cases, case page, client questions |
| `/home` "Sign in to your firm" | firm staff | type a **firm key** and a work email; local stand-in token (PF-4, `session/local`) | front office, money, team, settings, clients |
| `/system` | our console staff | type a work email; our own stand-in token (PF-4s) | console |

**What the walk found.**
| # | Persona | Screen walked | What looks simulated, mixed or not like a product |
|---|---|---|---|
| W1 | Anyone | `01-sign-in`, `02-home` | Two different sign-in doors with different people lists. "Simulated people: no passwords". The firm card asks for a "Firm key" and says it is the "local stand-in sign-in until the firm sign-in screens are built". |
| W2 | Configuration author (ours) | `03-author-programs` | Our own tool says "Every combination **your firm** can open". It also shows a "Prototype · demo workspace" chip, a Demo menu, an "Acting as" picker that lists clients, a footer "Simulated people; local PostgreSQL demo database … Not production", a "Release 1 screens" menu entry, and a link "Cases (as Case officer)" that **changes the person**. |
| W3 | Owner (Representative) | `07-owner-home` | The real firm shell, but the header shows the key `sample-firm`, not the firm's name. Home opens with a developer panel, "Release 1 screens: open any screen", that links to "Sign in · pick a simulated person". |
| W4 | Owner, then Cases | `12b-cases-after-firm-signin` vs `07` | **Two people at once.** Signed in as the Representative (Owner), the Cases page shows "Acting as **Case officer** · Simulated" and a link "Product Studio (as Configuration author)". The firm shell and its menu are gone. |
| W5 | Case officer | `04-caseofficer-cases`, `14-case-officer-case` | The case page says "Sign in as firm staff (under Decision and closing) to see and record government steps", so the case officer must sign in a second time. It also shows "Release 1 (as Configuration author)", "Stand-in" chips and "Hand to Client A (simulated)". |
| W6 | Client A | `06-clientA-cases`, `15-client-questionnaire` | The client's own page has the staff "Acting as" picker, offering Configuration author, Approver and Representative: a client can become staff in one click. |
| W7 | Front office, money | `08-fo-leads`, `10-money-invoices` | Empty: no lead, prospect, booking, retainer or invoice is seeded, yet Client A's case exists with nothing behind it. The story does not connect. |
| W8 | Owner, Team | `11-owner-team` | Works and looks real, but the Case officer's email `user-o@sample-firm.example.com` leaks the internal id. |
| W9 | Our console | `16-console-firms` | Looks real. It has its own sign-in and cannot reach the Studio, where our own content team works. |

## 2. (a) The journey map: who does each step
Statuses are read from `qa/CAPABILITIES.md` at 60103172f, 25 Nov 05:47Z: 63 Works · 17 Partial · 21 Not built.
| Step | Done by | Shell | R1 rows (status) |
|---|---|---|---|
| Set up the program (once) | Configuration author → Content reviewer → Approver (ours) | our console › Content (the Studio) | R1.84 Works, R1.83 Works |
| Enquiry | the visitor (no sign-in) | the firm's public pages | R1.26 Works, R1.27 Works, R1.28 Works |
| Lead | Front office (new seed: Admin role) | staff app › Sales | R1.30 Works, R1.32 Works, R1.29 Partial, R1.108 Works, R1.110 Works |
| Consultation | Front office books it; the Representative holds it | staff app › Calendar | R1.37 Works, R1.39 Works, R1.104 Works, R1.42 Works, R1.112 Not built |
| Retainer | the Representative sends it; the client signs by link | staff app; client link | R1.53 Works, R1.54 Partial, R1.55 Partial, R1.31 Works, R1.61 Partial |
| Case | the Case officer opens it; the Representative is of record | staff app › Cases | R1.72 Works, R1.73 Works, R1.74 Works, R1.75 Not built |
| Forms | the client answers; the Case officer prepares | client link (the portal later, R1.62); staff app | R1.101 Works, R1.80 Works, R1.63 Works, R1.62 Not built |
| Sign | the client signs by link | client link | R1.54 Partial |
| File | the Representative approves and records it | staff app › Case | R1.82 Works, R1.77 Works |
| Money | Accounts (new seed: Billing and finance role) | staff app › Money | R1.56 Partial, R1.58 Partial, R1.59 Works, R1.57 Not built, R1.60 Not built |
| Run the service | Support (ours) | our console | R1.93 Works, R1.87 Partial |

**The map is a help page everywhere (ruling 4): `/help/journey` on Local, Staging and Production, with no sign-in shortcut.**
* Each step names its persona, says what they do, and links to that screen, which asks for the normal sign-in like any page.
* Steps carry their row ids in `samples/walk-map.json`. Statuses are read from `CAPABILITIES.md` when the page is built (FD-3), so the map never says Works where qa does not.
* Statuses show on Local and Staging only. Production shows the steps without build status.
* A step with no working row says "Coming later" and has no link.

## 3. (b) The one-click persona walk: a Local-only developer tool (`/walk`)
* **Layout.** The Catalogue pattern (`EXPERIENCE.md` §3), in the team's tokens.
  * Banner: "Local developer tool · Sample data · not a real firm".
  * One row of **persona cards** in journey order: Front office, Representative, Case officer, Client A, Accounts, Owner, Our support, Our content team. Each card has the role's real name, the steps it does (for example "steps 2-3"), and one button, for example **Sign in as Front office (Sample)**.
  * Below the cards, a link to the journey map (§2). Beside them, the panel **Real sign-in**: the same sign-in page a firm uses.
* **One click.** `POST /api/walk/sign-in {persona}`.
  * The server finds that persona's seeded user and issues **that persona's real session**, through the same sign-in services and the same audit line, marked "walk sign-in":
    * firm staff get PF-4's token;
    * our console staff and the content team get PF-4s's token (IJ-4);
    * the client gets their own link (R1.101), and later the portal (R1.62).
  * It reuses the local stand-in sign-ins, so it can work only on Local.
  * Nothing is typed or shown: no ID, password or firm key.
  * "Back to the walk" sits in the account menu only, never in a product page.
* **Refused on Staging and Production.** Four locks:
  1. A new setting, `PLATFORM_GUIDED_WALK=on|off` (unset means off), read by the one settings loader. The loader **refuses to start** with `on` unless `PLATFORM_ENVIRONMENT=local`, and names the setting. This is the same rule as `PLATFORM_IDENTITY=local` today (`settings.ts:155`).
  2. The walk's routes and its seed register only when the setting is on. Otherwise `/api/walk/*` answers 404, like any unknown address.
  3. The CDK test fails any Staging or Production task definition that sets `PLATFORM_GUIDED_WALK` or `PLATFORM_SAMPLE_SEED` (the "PF-8b fail" pattern in `deploy/cdk/test/service.test.ts:48`).
  4. The page reads the flag from the open `GET /api/walk/status`, not from `/api/session`, which reads `x-actor` (`main.ts:63`). When that answers 404, the page shows only the real sign-in.
* **Fail tests (FD-1), one per mode:**
  * `loadSettings` with `PLATFORM_GUIDED_WALK:"on"` and all required settings throws ConfigRefused naming the setting, for `test` and for `production`.
  * A copy booted in each of those modes answers 404 to `POST /api/walk/sign-in` and `GET /api/walk/status`, and writes no audit line. This reuses the harness of `tests/check_qa621_persona_door_production.ts`.
  * The CDK test fails on a task definition carrying the setting.
  * Pass: on Local with the setting on, the Front office card's session reads `GET /api/platform/me` as the seeded Admin.

## 4. (c) One shell per persona; the worst mix-ups fixed first
| Shell | Who | Has | Never has |
|---|---|---|---|
| Staff app | firm staff, every role | the firm's name and logo, the menu its keys allow, the signed-in person, Sign out | "Acting as", simulated people, Studio links, "Release 1 screens", the firm key |
| Client portal | the client | the firm's branding, "Signed in as Client A", only their own case | any staff control or person picker |
| Our console | our staff: support, ops and the content team | Firms, Support, Content (the Studio), our sign-in | a firm's menu |

The demo data loads (today's Demo menu, P-35) move to the walk page's "Local data" fold-out, which exists on Local only.

**Fixed first (from §1):**
1. **Two people at once (W4, W5).** Case pages take the person from the firm session, never from `x-actor` (IJ-1 to IJ-3, then FD-6).
2. **The client can become staff (W6).** The client shell has no picker (FD-7).
3. **Signing in twice, and links that switch person (W2, W5).** "(as Configuration author)", "Cases (as Case officer)" and "Sign in as firm staff to see government steps" are removed (FD-6, IJ-6).
4. **Developer chrome in product screens (W1-W3, W5).** "Release 1 screens", "Prototype · demo workspace", the "Simulated people…" footer, the "Stand-in" chips and the firm key in the header are removed; the header shows the firm's name (FD-8).
5. **A story with gaps (W7).** One connected Sample story: enquiry → lead → consultation → signed retainer → Client A's case → invoice. It is seeded through the same services as the screens (FD-4; DEMO.md rule) on Local, and in the Showcase firm on Staging (FD-11).

## 5. (d) Rows to build (each one PR under 800 changed lines; IDs proposed, the Lead assigns)
**Duplicate check (all rows):**
* **BK-4a** (`/sign-in` persona cards with simulated people) is what the walk replaces. FD-3 reuses its card component, and IJ-6 retires the page. BK-4a's test `check_bk4a.ts` moves to FD-3.
* **PF-4 and PF-4s** are the sign-in services that FD-2 and IJ-4 call; no second token code.
* **PF-17** (our console) gains a Content area in IJ-6; it is not a second console.
* **The client portal** (PF-4p, PF-4pw, PF-4ps, FO-14; R1.62) is not merged. FD-7 is only a client shell over today's link pages, and R1.62 replaces its door.
* **The identity join** is the case-side contract's row (`design/case-side-contract-v0.1-2026-11-14.md:193`; changes need the release Lead's OK, `:205`, P-584 (9)). The Lead confirmed that no other row holds it (comment 7161444804). IJ-1 to IJ-3 are that row. IJ-4 to IJ-6 add the Studio (ruling 3); no row exists for that today (`simulated-people.ts` has no other plan).
* **`runtime.ts:32,288`** already refuses a simulated person's case opening, in production only. IJ-3 widens that.
* **`DEMO-LINK`** seeds the Sample consultation type only. FD-4 extends it, and FD-11 reuses FD-4's story functions for a firm it is given.
* **No row creates a Showcase or partner firm today.** Sample firms are seeded on Local only (`sample-seed.ts:28`; Staging never seeds, `deploy/cdk/README.md:74`).

| Row | What | Touch list | Done when (test) | Size |
|---|---|---|---|---|
| FD-1 | The walk setting and its four locks | `platform/config/settings.ts` (one `opt`), `api/src/walk/module.ts` (new), `features/walk.ts`, `deploy/cdk/test/service.test.ts` | `tests/check_fd1_walk_gate.ts`: loader fails in `test` and in `production`; a copy booted in each mode answers 404 (qa621 harness); CDK fails; pass on Local | ~250 |
| FD-2 | `POST /api/walk/sign-in`, `GET /api/walk/personas`, `GET /api/walk/status` (Local only) | `api/src/walk/` (new), `samples/walk-personas.json` (new), `samples/firms.json` (+ Front office as Admin and Accounts as Billing and finance, Sample) | `tests/check_fd2_walk_signin.ts`: each persona's session reads `me` as its seeded user with its roles; one audit line each; an unknown persona gives 422; a client gets their own link only | ~450 |
| FD-4 | One connected Sample story, as functions that take a firm | `api/src/walk/story-seed.ts` (new; calls the FO, retainer and money services), the Local data fold-out | `tests/check_fd4_story_seed.ts`: lead → prospect → booking → signed retainer → client → case → invoice, all linked; a second run changes nothing | ~600 |
| FD-3 | Walk page `/walk` (Local) and journey help page `/help/journey` (everywhere), after FD-2 | `web/src/modules/walk/` (new), `samples/walk-map.json`, `tools/walk-map.mjs` (statuses at build; CI checks only that the row ids exist) | `tests/check_fd3_front_door_browser.ts`: on Local, one click per card lands on that persona's home with their name in the header; with the walk off, `/walk` shows only the real sign-in and `/help/journey` has no sign-in shortcut; keyboard path; 1024 px | ~600 |
| IJ-1 | Identity join, part 1 (contract row): the case side takes the person from the firm staff session, with duties from permission keys, so the 357 `x-actor` uses in 81 files keep their shape | `core.ts` `actorOf` and the request context, `case-access.ts` | `tests/check_ij1_session_actor.ts`: an Owner token reads the case as that staff member; a token plus `x-actor: user-A` is still that staff member; an invited user with no `actor_id` gets the case pages their keys allow | ~600 |
| IJ-2 | Identity join, part 2: `firms.ts` reads the platform tables, not `samples/firms.json` | `firms.ts` and its callers | `tests/check_ij2_firm_from_platform.ts`: a firm made by sign-up opens a case; `firms.json` is not read outside the Local seed | ~500 |
| IJ-3 | Identity join, part 3: `x-actor` refused outside Local | `core.ts` guard, `runtime.ts:32,288` widened | `tests/check_ij3_no_actor_header.ts`, on copies booted in `test` and `production`: `x-actor` alone gets 401 on every case and Studio route | ~300 |
| IJ-4 | The Studio's API on our staff sign-in (ruling 3): configuration routes take the person from a PF-4s session, never a firm session; new keys `system/content:author`, `system/content:review`, `system/content:sme`, `system/content:approve` on three roles (content author, content reviewer, content approver); three Sample content staff seeded on Local | `platform/system-identity/keys.ts` (roles), `sample-staff.ts`, `core.ts` (`readerOf` and the configuration guard accept the system session), `main.ts` configuration routes' person | `tests/check_ij4_studio_session.ts`: a content author's token edits a combination as that staff member; a firm Owner's token is refused (403) on every configuration write; a support-only token is refused on author steps | ~600 |
| IJ-5 | Studio second-person rules on staff ids: author ≠ approver, SME sign-off, merge and rename by a second person (P-65, P-266) compare our staff ids; older history keeps its simulated ids readable | `studio.ts` review and release, `change-sets.ts`, `review-*.ts`, `core.ts` `actorWordOf` | `tests/check_ij5_second_person_staff.ts`: the same staff member cannot submit and approve one release; two different content staff can; an old line written as `user-A` still reads "Configuration author" | ~500 |
| FD-6 | Case pages inside the staff app (after IJ-1) | `web/src/runtime/cases.tsx`, `case-*.tsx`, `components/frame.tsx`, `lib/api.ts` | `tests/check_fd6_one_person_browser.ts`: signed in as Owner, Cases shows the staff shell and no "Acting as"; government steps show without a second sign-in | ~650 |
| IJ-6 | Studio pages inside our console, Console › Content (after IJ-4 and FD-6): `systemApi` session; the "Acting as" picker, `simulated-people.ts` and `/sign-in` retired | `App.tsx` Studio frame, `lib/api.ts`, `modules/system/` (Content entry), `pages/sign-in.tsx` | `tests/check_ij6_studio_console_browser.ts`: signed in to our console as content author, the Studio opens under Content with that person's name; no page anywhere shows "Acting as"; `/sign-in` sends you to the real sign-in | ~650 |
| FD-7 | Client shell over the link pages (after FD-6: same `frame.tsx`) | client pages in `web/src/runtime/`, `components/frame.tsx` (client area) | `tests/check_fd7_client_shell_browser.ts`: no person picker or staff link on any client page; the firm's branding shows | ~300 |
| FD-8 | No developer chrome in product shells (after FD-6 and IJ-6) | `modules/platform/home*.tsx`, the Studio frame, the wording of the firm sign-in card | `tests/check_fd8_no_demo_chrome_browser.ts`: on a copy booted in `test`, none of "Release 1 screens", "Prototype", "Simulated", "Stand-in", "demo" or "Firm key" appears on any staff, client or console page; the firm's name is in the header. Email-first sign-in belongs to R1.5's sign-in page row | ~400 |
| FD-11 | **The Showcase firm on Staging (ruling 4).** One Sample firm, "Showcase firm (Sample)", with seeded data for every persona, everyone signed in for real. Run by our ops staff from the console (`system/showcase:seed`), refused in Production. It creates the firm through firm creation (PF-5's path); invites one test-mailbox address per persona with its roles (PF-4b, staff and content team); and runs FD-4's story functions for that firm. Each person accepts the invitation and sets up their own two-step. No password is stored or shown. | `api/src/platform/showcase/` (new: seed job and console route), `samples/showcase.json` (personas, roles and mailbox addresses, Sample), `modules/system/` (one button) | `tests/check_fd11_showcase_seed.ts`, on a copy booted in `test` with the fakes: the firm exists; one invitation per persona with the right roles; the story is linked; a second run changes nothing; refused on a copy booted in `production`, and nothing is written | ~550 |
| FD-10 | Staging production-like pack (last) | `tests/journeys/` staging runner; the test mailbox (for two-step codes and invitations) read by the **test runner only** | §7 (4): every persona's journey in the Showcase firm through the real sign-in on Staging, from enquiry to money, with the program set up by the content team in our console; green on one run id; plus the fail tests on copies in `test` and `production` | ~500 |

**What each row is.**
* Every row is *Needed for the proof* of A391.
* FD-1 to FD-4 (the walk and its Local data) are developer tooling, labelled as such and never ported (P-33).
* IJ-1 to IJ-6, FD-6 to FD-8, FD-11 and FD-10 are the product itself.
* **Struck by ruling 1: FD-9** (the walk on Staging).

## 6. Copy (plain words)
* **Card button:** "Sign in as Front office (Sample)".
* **Walk banner:** "Local developer tool. Sample firm and people; nothing here is a real client."
* **Walk off:** "The one-click walk is only on a builder's own machine. Sign in with your email."
* **Journey map title:** "Who does what, from enquiry to money".
* **A step that is not built:** "Coming later".
* **Showcase banner on Staging:** "Showcase firm. Sample clients and cases for trying the product; nothing here is real."

## 7. From Local to Production (A392 and the rulings)
1. **The real product, not a fake one.** The walk is a Local door, not a mode. Every screen after a click is the Production screen, with the same session, roles, permission keys and audit lines. The journey map is help, not a shortcut. FD-8 proves the shells carry no developer words, and IJ-3 proves nothing outside Local trusts a simulated person.
2. **Two ways in.** There are two ways in, and on Staging only the real one exists.
   * **Real sign-in** is the way in on every environment: email, then two-step, a passkey once R1.5 lands, invitations (PF-4b), and roles. That includes our own staff and the content team (IJ-4 to IJ-6).
   * **The one-click walk** sits beside it on Local only.
   * **Partners** see the real product on Staging's **Showcase firm** (FD-11). The Lead or the founder invites them, or hands them a Showcase persona's mailbox, and they sign in for real.
3. **What changes from Local to Production:**

   | | Local | Staging (`test`) | Production |
   |---|---|---|---|
   | Users | seeded Sample users | invited test users in the Showcase firm (FD-11); partners invited | invited real users only (PF-4b) |
   | One-click walk and Sample seed | on | refused at start-up (FD-1) | refused at start-up (FD-1) |
   | Showcase firm | not needed (the Local story, FD-4) | yes (FD-11) | refused (FD-11) |
   | Journey map | help, with statuses | help, with statuses | help, without build status |
   | Our staff and content team | seeded Sample staff on PF-4s's stand-in | invited into our staff pool, real two-step | invited, real two-step |
   | Two-step and passkeys | the stand-in's second step | real Cognito two-step; codes in the test mailbox; passkeys when R1.5 lands | real |
   | Secrets | none needed | Secrets Manager `xr/staging/*` | Secrets Manager `xr/production/*` (R1.15) |
   | Addresses | localhost | per-firm addresses once R1.24's domain is on (no-domain mode today) | `<firm>.expatready.com` |
   | `x-actor` (a simulated person) | refused once IJ-6 lands | refused (IJ-3) | refused (IJ-3) |

4. **How each is tested and proven.**
   * **The walk:** FD-3's browser test on Local in CI.
   * **Staging:** FD-10 runs the journeys (`tests/journeys/j_*.ts`) as each persona of the Showcase firm through the real sign-in. Two-step codes and invitations come from the test mailbox, read by the **test runner only**: never by the app, never shown, never typed by a person. One run id, with a fresh reader (P-339).
   * **Staging and Production modes:** FD-1's fail tests, IJ-3, FD-8 and FD-11's refusal, each on a copy booted in that mode.
5. **Order.**
   * **In parallel with the 101 now** (new files, no busy file): FD-1, FD-2 and FD-4, then FD-3 after FD-2.
   * **One at a time on the case side and the Studio, under the release Lead** (the files P-584 (9) guards; P-576): IJ-1, IJ-2, IJ-3, IJ-4, IJ-5, then FD-6, then IJ-6 (it shares `App.tsx` and `lib/api.ts` with FD-6), then FD-7 and FD-8 (`frame.tsx`).
   * **After R1.5's real sign-in chain** (PF-4bc and the sign-in page): FD-11, the Showcase firm.
   * **Last**, after FD-11, R1.1 and R1.15: FD-10, the Staging production-like pack.

## 8. (e) The founder's rulings, and one point left open
| # | Question | Ruling (25 Nov) | Where it is folded in |
|---|---|---|---|
| 1 | The walk on Staging? | **Local only** (recommended option). Staging behaves like Production: invited test users, real sign-in, two-step through a test mailbox | §3 locks and fail tests per mode; FD-9 struck; §7 |
| 2 | The identity join now? | **Yes, as the case-side contract's row** (Lead's ruling). The Lead confirmed that IJ-1 to IJ-3 are free on main | §5 IJ-1 to IJ-3; §7 order |
| 3 | The Studio's simulated people? | **Real sign-in now, everywhere** (founder's choice; not the recommended option) | §5 IJ-4 to IJ-6; §4 shells; §7 |
| 4 | Names and partner access | **Local → Staging → Production**; no "demo". The walk is a Local-only developer tool; the journey map is help everywhere; partners use a **Showcase firm** on Staging with the real sign-in | the header; §2; §3; §5 FD-11; §6; §7 |

**Open, for the founder: the test mailbox.** Ruling 1 puts two-step codes on Staging in a test mailbox. That needs an inbox the test runner can read, and only the founder opens accounts (P-551).
* **(A, recommended)** Receive the Showcase addresses into the AWS account we already have: Amazon SES receiving on a staging subdomain, saving mail to a Staging bucket the test runner reads. No new vendor, and it stays in Canada's region, if SES receiving is offered there (Unverified: to check in AWS's documents before FD-10).
* **(B)** A hosted test-mailbox service. It needs a new account and a STANDARDS §1 gate.

**Definition of ready:**
* The founder answers the test-mailbox point, or takes A.
* The release Lead takes IJ-1 to IJ-6.
* The Lead moves the FD and IJ rows into BACKLOG with owners (P-841).
* Each row's Done-when test is named above.

## 9. Challenger's verdict (a fresh Opus context, 25 Nov; full text in `front-door-2026-11-25/challenge.md`)
**Build after these changes.** All of them are folded in. The founder's later rulings (§8) settle its questions.
| Point | Finding | Folded in |
|---|---|---|
| B1 | The identity join was undersized, and the case-side contract already owns it | IJ-1 to IJ-3, under the release Lead, three PRs |
| M1 | The Staging walk is unsafe: the server held the second step | ruling 1: Local only; FD-9 struck |
| M2 | The Studio cannot run on Staging once `x-actor` is refused | ruling 3: IJ-4 to IJ-6 move the Studio to our staff sign-in |
| M3 | The web rows collide on `frame.tsx` | the order is FD-6, then IJ-6, then FD-7 and FD-8 |
| M4 | The fail tests should boot a copy in each mode | FD-1, IJ-3, FD-8 and FD-11 use the `check_qa621_persona_door_production.ts` harness |
| m1 | The walk flag was read through `/api/session`, which reads `x-actor` | it comes from the open `GET /api/walk/status` |
| m2 | The Forms step said "client portal", which is Not built | it says "client link" |
| m3 | Email-first sign-in was new scope in FD-8 | it moves to R1.5's sign-in page row |
| m4 | A CI status-equality check would turn unrelated PRs red | CI checks only that the row ids exist |
| m5 | FD-2 works on Local only | the row says so |

The challenger also confirmed that every status matches `CAPABILITIES.md` (63 Works, 17 Partial, 21 Not built), and that the diagnosis matches the screenshots. IJ-4 to IJ-6 and FD-11 were added after the challenge, at the founder's rulings, and have not been challenged yet. The Lead decides whether they need a challenge before they are built.
