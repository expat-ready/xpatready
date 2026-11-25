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
| Forms | Client answers; Case officer prepares | client link (portal later, R1.62); staff app | R1.101 Works, R1.80 Works, R1.63 Works, R1.62 Not built |
| Sign | Client signs by link | client link | R1.54 Partial |
| File | Representative approves and records it | staff app › Case | R1.82 Works, R1.77 Works |
| Money | Accounts (new seed: Billing and finance role) | staff app › Money | R1.56 Partial, R1.58 Partial, R1.59 Works, R1.57 Not built, R1.60 Not built |
| Run the service | Support (ours) | our console | R1.93 Works, R1.87 Partial |

The front door shows this map live. Map steps are tagged with their row ids in `samples/walk-map.json`. The page reads each status from `CAPABILITIES.md` when it is built (FD-3), so the map never says Works where qa does not. A step with no working row shows "Not built yet" and offers no button.

## 3. (b) The front door page (`/walk`, guided walk)
* **Layout:** the Catalogue pattern (`EXPERIENCE.md` §3), on the team's tokens. Top: "Guided walk · Sample data · not a real firm". One row of **persona cards** in journey order: Front office, Representative, Case officer, Client A, Accounts, Owner, Our support, Our content team. Each card has the role's real name, "does steps 2-3", and one button: **Sign in as Front office (Sample)**. Below: the journey map (§2), where each step names its persona and links to the screen with that persona signed in. To the right, the panel **Real sign-in** (§7): "Sign in with your email", the same page a firm uses.
* **One click:** `POST /api/walk/sign-in {persona}`. The server looks up the seeded user for that persona and issues **that persona's real session**. It goes through the same service and audit line as the firm sign-in ("walk sign-in", as that firm): staff get the PF-4 token, our console staff the PF-4s token, and the client gets their own link (R1.101), later the portal (R1.62). It reuses the local stand-in sign-ins, so it works on `local` only. Then it opens that persona's home. No ID, password or firm key is typed or shown. A "Back to the guided walk" link sits in the account menu only, never in the product's pages.
* **Refused outside the demo** (the founder asked for demo and staging; question 1 recommends the demo only). Environments in the code are `local` (the Mac demo and lane copies), `test` (staging) and `production` (`config/settings.ts`). Four locks:
  1. A new setting, `PLATFORM_GUIDED_WALK=on|off` (unset means off), read by the one loader. The loader **refuses to start** with `on` when `PLATFORM_ENVIRONMENT=production` and names the setting, the same way `PLATFORM_IDENTITY=local` is refused today.
  2. The walk's routes and its seed register only when the setting is on; otherwise `/api/walk/*` answers 404 like any unknown address.
  3. The CDK test fails a production task definition that sets `PLATFORM_GUIDED_WALK` or `PLATFORM_SAMPLE_SEED`, following `deploy/cdk/test/service.test.ts` "PF-8b fail".
  4. The page reads the flag from the open `GET /api/walk/status`, not from `/api/session`, which reads `x-actor` (`main.ts:63`). When that answers 404, the page shows only the real sign-in.
* **Fail tests (FD-1):**
  * `loadSettings({PLATFORM_ENVIRONMENT:"production", PLATFORM_GUIDED_WALK:"on", …all required})` throws ConfigRefused naming `PLATFORM_GUIDED_WALK`.
  * A copy booted in production mode (the harness of `tests/check_qa621_persona_door_production.ts`) answers 404 to `POST /api/walk/sign-in` and `GET /api/walk/status`, and writes no audit line.
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
1. **M1, two people at once (W4, W5).** Case pages take the person from the firm session, never from `x-actor` (IJ-1 to IJ-3, then FD-6).
2. **M2, the client can become staff (W6).** The client portal shell has no picker (FD-7).
3. **M3, signing in twice and links that switch person (W2, W5).** "(as Configuration author)", "Cases (as Case officer)" and "Sign in as firm staff to see government steps" go (FD-6).
4. **M4, developer chrome in product screens (W1-W3, W5).** "Release 1 screens", "Prototype · demo workspace", the "Simulated people…" footer, "Stand-in" chips and the firm key in the header go; the header shows the firm's name (FD-8).
5. **M5, a story with gaps (W7).** One connected Sample story: an enquiry becomes a lead, then a consultation, then a signed retainer, then Client A's existing case, then an invoice. It is seeded through the same services as the screens (FD-4; DEMO.md rule "the seed calls the same services").

## 5. (d) Rows to build (each one PR under 800 changed lines; IDs proposed, the Lead assigns)
**Duplicate check (all rows):**
* **BK-4a** (`/sign-in` persona cards, simulated people) is what the front door replaces. FD-3 keeps its card component and retires the page's role as the one way in. BK-4a's test `check_bk4a.ts` moves to FD-3.
* **PF-4, PF-4s** are the sign-in services FD-2 calls, with no second token code.
* **PF-4p, PF-4pw, PF-4ps, FO-14** (the client portal, R1.62) are not merged. FD-7 is only the client shell over today's link pages, and R1.62 replaces its door.
* **The identity join already has an owner** (found by the challenger). The case-side contract names it: `design/case-side-contract-v0.1-2026-11-14.md:193`, "`actorOf` reads a platform session; `firms.ts` reads platform tables". Each change to those case files needs the release Lead's OK (`:205`, P-584 (9)). So IJ-1 to IJ-3 below are **that contract row, under the release Lead**, not new FD rows.
* `runtime.ts:32,288` already refuses a simulated person's case opening, but in production only. IJ-3 widens that.
* `DEMO-LINK` seeds the Sample consultation type only, so FD-4 extends it and does not duplicate it.

| Row | What | Touch list | Done when (test) | Size |
|---|---|---|---|---|
| FD-1 | Walk setting and its four locks | `platform/config/settings.ts` (one `opt`), `api/src/walk/module.ts` (new), `features/walk.ts`, `deploy/cdk/test/service.test.ts` | `tests/check_fd1_walk_gate.ts`: the loader fails in production; a copy booted in production mode answers 404 (the harness of `check_qa621_persona_door_production.ts`); the CDK test fails; the pass on `local` | ~250 |
| FD-2 | `POST /api/walk/sign-in`, `GET /api/walk/personas`, `GET /api/walk/status` (`local` only: they reuse the stand-ins, `service.ts:185`) | `api/src/walk/` (new), `samples/walk-personas.json` (new), `samples/firms.json` (+ Front office as Admin, Accounts as Billing and finance, Sample) | `tests/check_fd2_walk_signin.ts`: each persona's session reads `me` as its seeded user with its roles; one audit line each; an unknown persona gives 422; a client gets their own link only | ~450 |
| FD-4 | One connected Sample story | `api/src/walk/story-seed.ts` (new; calls the FO, retainer and money services), the Demo fold-out | `tests/check_fd4_story_seed.ts`: lead → prospect → booking → signed retainer → client CL-00001 → C-2026-00001 → invoice, all linked; run twice, changes nothing | ~600 |
| FD-3 | The `/walk` page: cards, map, Real sign-in panel (after FD-2) | `web/src/modules/walk/` (new), `samples/walk-map.json`, `tools/walk-map.mjs` (reads statuses at build time; CI checks only that the row ids exist, so a qa re-score never turns an unrelated PR red) | `tests/check_fd3_front_door_browser.ts`: one click per card lands on that persona's home with their name in the header; keyboard path; 1024 px | ~550 |
| IJ-1 | Identity join, part 1 (contract row, release Lead). The case side takes the person from the staff session, with duties from the permission keys, so the 357 `x-actor` uses in 81 files keep their shape | `core.ts` `actorOf` and the request context, `case-access.ts` | `tests/check_ij1_session_actor.ts`: an Owner token reads the case as that staff member; a token plus `x-actor: user-A` is still that staff member; an invited user with no `actor_id` gets the case pages their keys allow | ~600 |
| IJ-2 | Identity join, part 2: `firms.ts` reads the platform tables, not `samples/firms.json` | `firms.ts` and its callers | `tests/check_ij2_firm_from_platform.ts`: a firm made by sign-up opens a case; `firms.json` is not read outside the seed | ~500 |
| IJ-3 | Identity join, part 3: `x-actor` refused outside `local` | `core.ts` guard, `runtime.ts:32,288` widened | `tests/check_ij3_no_actor_header.ts`, on a copy in production mode: `x-actor` alone gets 401 on every case and Studio route | ~300 |
| FD-6 | Case pages inside the staff app (after IJ-1) | `web/src/runtime/cases.tsx`, `case-*.tsx`, `components/frame.tsx`, `lib/api.ts` | `tests/check_fd6_one_person_browser.ts`: signed in as Owner, Cases shows the staff shell and no "Acting as"; government steps show without a second sign-in | ~650 |
| FD-7 | Client shell over the link pages (after FD-6: same `frame.tsx`) | client pages in `web/src/runtime/`, `components/frame.tsx` (client area) | `tests/check_fd7_client_shell_browser.ts`: no person picker or staff link on any client page; the firm's branding shows | ~300 |
| FD-8 | No demo chrome in product shells (after FD-6) | `modules/platform/home*.tsx`, the Studio frame in `App.tsx`, the wording of the firm sign-in card | `tests/check_fd8_no_demo_chrome_browser.ts`: with the walk off, none of "Release 1 screens", "Prototype", "Simulated", "Stand-in" or "Firm key" appears on any staff or client page; the firm's name is in the header. Email-first sign-in is R1.5's sign-in page row, not this one | ~400 |
| FD-10 | Staging production-like pack (last) | `tests/journeys/` staging runner; TOTP seeds or a test mailbox for the **test runner only** | §7 (4): every persona's journey through the real sign-in on staging, starting from a published release; green on one run id; plus the production-mode fail tests | ~500 |
| FD-9 | *Not built unless the founder picks question 1 B*: the guided walk on staging, after its own security challenge | `api/src/walk/cognito.ts`, Cognito grants beyond today's eight (`deploy/cdk/lib/service.ts:49-50`), a Secrets Manager grant | the staging walk journey | ~400, plus an AWS step |

Every row is *Needed for the proof* of A391. FD-1 to FD-4 are scaffolding labelled as demo-only (P-33, never ported). IJ-1 to IJ-3 and FD-6 to FD-8 are the product itself.

## 6. Copy (plain words)
* Card button: "Sign in as Front office (Sample)". Banner: "Guided walk. Sample firm and people; nothing here is a real client."
* Walk off: "The guided walk is off on this server. Sign in with your email."
* Map step with no working row: "Not built yet (R1.57)."

## 7. From demo to production (A392)
1. **The real product, not a fake demo.** The walk is a door, not a mode. Every screen after a click is the production screen, with the same sign-in session, roles, permission keys and audit lines. The map is an optional guide that a person can close. Nothing behind the door has a demo-only branch: FD-8's test proves the shells carry no demo words, and IJ-3 proves no screen trusts a simulated person outside the demo.
2. **Two ways in, side by side.** On `/walk` the left side is the **Guided walk**: cards, one-click sign-in, map. The right side is **Real sign-in**, the page a firm uses: email, then two-step, a passkey once R1.5 lands, invitations (PF-4b), and roles. Any walk can be done either way.
   * On the demo, the seeded users have Sample emails and two-step set up, so the real path works through the stand-in's second step.
   * On staging, the real path is the only way in (question 1). A partner signs in as an invited test user with their own authenticator. The Lead or the founder sends the invitations, so no password is ever copied.
3. **What changes from demo to production:**

   | | Demo (`local`) | Staging (`test`) | Production |
   |---|---|---|---|
   | Users | seeded Sample users | test users invited into the Cognito pool (staging never seeds, `deploy/cdk/README.md:74`) | invited real users only (PF-4b invitations) |
   | Guided walk and Sample seed | on | off (question 1 A); FD-9 only on 1 B | refused at start-up; proven off by FD-1's fail tests |
   | Two-step and passkeys | stand-in second step | real Cognito MFA (TOTP); passkeys when R1.5 lands | real |
   | Secrets | none needed | Secrets Manager `xr/staging/*` | Secrets Manager `xr/production/*` (R1.15) |
   | Addresses | localhost | per-firm addresses once R1.24's domain is on (no-domain mode today) | `<firm>.expatready.com` |
   | `x-actor` (simulated person) | allowed, for the Studio | refused (IJ-3) | refused (IJ-3) |
   | Content team (the Studio) | simulated people (question 3) | not used: FD-10 starts from an already published release | not used until the X-row moves it onto our staff sign-in |

4. **How each is tested and proven.**
   * **Guided walk:** FD-3's browser test on `local` in CI.
   * **Real sign-in:** FD-10 runs the journeys (`tests/journeys/j_*.ts`) as each persona on staging through the real sign-in. The second step comes from a TOTP seed, or a test mailbox for email codes, held by the **test runner only**: never by the app, and never shown. Results go on one run id with a fresh reader (P-339).
   * **Production mode:** FD-1's fail tests and IJ-3, both on a copy booted in production mode.
5. **Order.**
   * **In parallel with the 101 now** (new files, no busy file): FD-1, FD-2 and FD-4, then FD-3 after FD-2.
   * **One at a time on the case side, under the release Lead** (the files P-584 (9) guards; P-576): IJ-1, IJ-2, IJ-3, then FD-6, then FD-7 and FD-8 (they share `frame.tsx` with FD-6).
   * **Last**, after R1.5's real sign-in chain (PF-4bc and the sign-in page), R1.1 and R1.15: FD-10, the staging production-like pack, and FD-9 if chosen.

## 8. (e) Questions for the founder (recommendation first)
1. **Guided walk on staging?** (A, recommended) No. The one-click walk runs on the local demo only. On staging a partner signs in for real as an invited test user (FD-10), which is exactly what production will be. The challenger found that a server doing the second step with stored codes makes two-step meaningless on a public address, and it needs AWS grants that the service may not have today. (B) Yes, as FD-9, after its own security challenge and one AWS step by you.
2. **The identity join (IJ-1 to IJ-3, then FD-6).** (A, recommended) Do it now as the case-side contract's own row under the release Lead, in three PRs. It is the only real fix for "two people at once", and without IJ-3 production would trust a simulated-person header. (B) Hide the picker only and keep two identities until after Release 1. That looks fixed but is not.
3. **Our content team.** (A, recommended) For Release 1 the Studio keeps its simulated people on the demo only. It is reached only from our console › Content and the walk's "Our content team" card, labelled as ours and never linked from a firm's app. Moving the content team onto our staff sign-in (PF-4s) becomes an X-row after Release 1. (B) Move it now: about 3 more rows.

**Definition of ready:**
* The founder answers 1-3, or takes the recommendations.
* The release Lead accepts IJ-1 to IJ-3 as the contract's row.
* The Lead adds the FD rows to BACKLOG with owners.
* Each row's Done-when test is named above.

## 9. Challenger's verdict (fresh Opus context, 25 Nov; full text `front-door-2026-11-25/challenge.md`)
**Build after these changes.** All of them are folded in above.
| Point | Finding | Folded in |
|---|---|---|
| B1 | The identity join was undersized, and the case-side contract already owns it | IJ-1 to IJ-3 under the release Lead, three PRs; FD-5 removed |
| M1 | The staging walk is unsafe: the server held the second step | question 1 now recommends local only; FD-9 only on B, after a security challenge |
| M2 | The Studio cannot run on staging once `x-actor` is refused | the Content team row in §7; FD-10 starts from a published release |
| M3 | The web rows collide on `frame.tsx` | order: FD-6, then FD-7 and FD-8 |
| M4 | The production fail test should boot a production-mode copy | FD-1 and IJ-3 reuse the `check_qa621_persona_door_production.ts` harness |
| m1 | The walk flag was read through `/api/session`, which reads `x-actor` | it comes from the open `GET /api/walk/status` |
| m2 | The Forms step said "client portal", which is Not built | it now says "client link" |
| m3 | Email-first sign-in was new scope in FD-8 | moved to R1.5's sign-in page row |
| m4 | A CI status-equality check would turn unrelated PRs red | CI checks only that the row ids exist |
| m5 | FD-2 works on `local` only | the row says so |

Confirmed by the challenger: every status matches `CAPABILITIES.md` (63 Works, 17 Partial, 21 Not built), and the diagnosis matches the screenshots.
