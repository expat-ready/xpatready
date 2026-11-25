# R1.62 shape: client login portal; progress stream with "last update" (J-62)

Shaped 25 Nov by the screens lane on `main` 63f5cc913 (P-526, P-604, P-606). Requirement text read: the PF-4p, PF-4pw, PF-4ps
and FO-14 rows of `BACKLOG.md` (`trace-requirements.py --brief R1.62` prints nothing: R1.62 is not a BACKLOG row id) and
`qa/CAPABILITIES.md` row R1.62.

**Done when (CAPABILITIES R1.62):** "A client signs in and sees only their own cases and the progress stream with 'last
update'; another client's case by URL refused".

**Duplicate check (25 Nov):** searched open PRs for PF-4p, PF-4pw, PF-4ps, FO-14, R1.62, "portal", "progress stream",
"client-identity" (none names them; #3544 says "portal" only in passing; #3214, #3217 are the staff pool); `main`'s code
(`api/src/**`, `web/src/**`, `prisma/schema/**`: no `/api/portal`, no client account table, no `PortalActivityPort`; the
case side's `person-link.ts` link pages are per-link answers, not an account, and stay); `qa/BUGS.md` (none). None.

## What main has, and what it lacks
* Has: the firm-staff pool and guard (PF-4, local stand-in `identity/local.ts`), our own staff's pool walled from it
  (PF-4s `system-identity/*`: own key, own issuer, `plane` claim, a wall middleware); the case side's client record
  `case_client.fo_person_id` → `runtime_case.client_id` (so "own cases" = cases whose client names the account's person);
  each case's stages with a client-facing name (`case_stage.client_name`, state `CURRENT`); the demo inbox (`MailPort`).
* Lacks: a client account, a client token, `/api/portal/*`, any client screen, and a "Tell the client" send (AG-10-73):
  FO-14's "last update" is defined as the date of the last such send, and nothing on main sends one.

## Parts (one PR each, each under 800 lines)
| # | Part (row) | What a person gets | Touch |
|---|---|---|---|
| 1 | **PF-4p p1: client pool, guard, own cases (API)** | a client token on its own plane; `/api/portal/me`, `/api/portal/cases`, `/api/portal/cases/:id` (own only; another client's → 404); a staff token on `/api/portal` → 401, a client token on `/api/platform` → 401 | `prisma/schema/platform-client-identity.prisma` + 1 migration, `api/src/platform/client-identity/*.ts`, `api/src/features/platform-client-identity.ts`, `tests/check_pf4p_client_identity.ts`, module card row |
| 2 | **PF-4p p2 + PF-4pw (invite and activate)** | staff invite the principal applicant (`agent/portal:invite`), resend; the client activates from the demo inbox link (7 days, single use) and sets a password (local: scrypt; cloud: the client Cognito pool, later); sign-in by email and password; failed tries audited; suspend and revoke end sessions at once | `api/src/platform/client-identity/{activation,staff}/*.ts`, 1 migration (catalogue rows), `tests/check_pf4pw_portal_access.ts` |
| 3 | **FO-14: progress stream and "last update"** | `fo_portal_activity_event` (insert-only) via `PortalActivityPort.record`; a staff **"Tell the client"** update on a case (see Q2) that the client reads in the stream; `GET /api/portal/stream` → entries newest first + `lastUpdate` (the newest successful update; never an automatic line) | `prisma/schema/front-office-activity.prisma` + 1 migration, `api/src/front-office/activity/*.ts`, `api/src/features/front-office-activity.ts`, `tests/check_fo14_activity.ts` |
| 4 | **PF-4ps p1: client portal screens** (concept first, screen-concept skill, Lead approval P-223 (4)) | Sign in, Activate, Home (own cases with stage, the progress stream, "Last update: <date>"), "Your access is paused" page, a neutral not-found for another case; 375 / 1024 / 1440, keyboard, axe clean | `web/src/modules/portal/*`, `tests/check_pf4ps_portal_browser.ts`, `screens/R1.62/concept.md` |
| 5 | **PF-4ps p2: staff Portal access panel + J-62** | on the client record: state, Invite, Resend, Suspend, Revoke, a "Tell the client" box; `tests/journeys/j_62.ts`; `Completes: R1.62` | `web/src/modules/platform/client-access/*`, one embed line in FO-4's record (owner's OK), `tests/journeys/j_62.ts` |

Order: 1 → 2 → 3 (3 can run beside 2: different files) → 4 → 5. Parts 1-3 carry the breaker (identity, permissions, schema,
client data); 4-5 the breaker (new public screens).

## J-62 (tests/journeys/j_62.ts, isolated copy, `PLATFORM_IDENTITY=local`, never :4400)
* **W1** the Owner opens a client's record → Portal access → Invite; the email lands in the demo inbox.
* **W2** in a second browser the client opens the link → Activate (password) → Home: the firm's name, their own case(s) with
  the current stage's client name, the progress stream.
* **W3** the Case Manager → "Tell the client" on the case ("Your biometrics letter arrived") → the client's Home shows it
  first in the stream and "Last update: <today>".
* **W4** the client types another client's case URL (`/portal/cases/<id of Client B's case>`) → "We can't find that case";
  the API answers 404; Client B's case number and stream lines appear nowhere in the client's answers.
* **DW1** a staff token on `/api/portal/me` → 401; the client's token on `/api/platform/me` → 401.
* **DW2** a failed "Tell the client" (refused send) does not move "last update"; an automatic line (sign-in) never does.
* axe on Sign in, Activate, Home; 375 and 1440 screenshots in `screens/R1.62/screenshots/`.

## Questions for the tech lead (each with my recommendation)
1. **Thin cut for R1.62.** R1.62's Done when needs parts 1-5 but not every PF-4pw action. Recommend: part 2 builds invite,
   resend, activate, sign-in, suspend and revoke (each tested); "end all sessions", re-invite after expiry, the access-state
   history and the imported-client rule (AG-15-7, -8, -9, AG-18-43) go to a follow-up row PF-4pw2, not R1.62.
2. **What sets "last update".** FO-14 ties it to the case side's "Tell the client" send (AG-10-73), which is not on main and
   has no owner. Recommend: part 3 builds the smallest such send itself, front-office side (`POST
   /api/front-office/people/:personId/updates`, key `agent/portal:invite`'s holders, text up to 2,000 characters, optional
   case id of that person, delivered in the portal and, behind the consent gate, to the demo inbox as `TRANSACTIONAL`);
   "last update" = its date when delivered; the case side can call the same port later.
3. **Password in the local stand-in.** The staff stand-in signs in by firm key and email only. A client portal without a
   password would let anyone who knows an email in. Recommend: the client stand-in stores a scrypt hash (node:crypto, no new
   library, tech gate entry 2 as PF-4) and checks it; Cognito's client pool (PF-4b's construct) replaces it in the cloud.
   Part 1 also has a **local-only** `POST /api/portal/session/local` (firm key + email, refused outside
   `PLATFORM_ENVIRONMENT=local`, like the staff stand-in's) for its tests until part 2 lands.
4. **firmAllows (PF-27)** is not on main: part 1 adds the stub that allows all, with a pending test, as PF-4p's row says.
