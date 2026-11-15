# CS-C1a: the case routes cannot sit behind PF-4's guard inside the touch list (question for the tech lead)

Written 15 Nov 2026 by the runtime builder (CS-C1 part 1), checked against `main` d52b7274e. Brief: `design/briefs/CS-C1.md` at 07d389c23 ("If the case routes cannot sit behind PF-4's guard without touching files outside the touch list, stop and ask"). Nothing is built yet; this is the stop.

## Evidence
1. **core.ts's guard runs first and refuses every bearer token outside two path prefixes.** `prototype/studio/api/src/core.ts:92-93`:
   * line 92: `if (/^\/api\/(platform|front-office)(\/|$)/.test(path)) return true;` (PF-4's one line, Lead 43's OK on #1744);
   * line 93: any other path with `Authorization: Bearer …` (except `/api/link/*`) → **403 `link-only`** ("A person's own link reaches only their own questions").
   * Order: `ConfigReadGuard` is the `APP_GUARD` in `main.ts:225`'s own `@Module` list; `PlatformGuard` is added after it by `api/src/features/platform-identity.ts:11` ("after core.ts's own").
2. **PF-4's guard would take a case route** (it guards any route that declares its access, whatever its path: `platform/identity/guard.ts:57-58`), but the request never reaches it: a staff token on `POST /api/runtime/cases/:id/close` is refused by line 93 first.
3. **Every case route today reads `x-actor`** (e.g. `api/src/filing-record.ts:83-87`, `@Controller("api/runtime")`), and the firm is worked out from the simulated person (contract v0.1 §0 fact 1). DW2 (403 `NOT_ALLOWED` by key), DW5 (`agent/case:reopen`) and DW8 (no token → 401 `NOT_SIGNED_IN`; firm A's token on firm B's case → 404) need the bearer session and its keys, so the `x-actor` route shape cannot meet them.

## Options
* **A (recommended): one-line hook in `core.ts:92`** — leave to the platform guard any route that **declares** its access, as well as the two path prefixes:
  `if (/^\/api\/(platform|front-office)(\/|$)/.test(path) || this.reflector.getAllAndOverride(PLATFORM_ACCESS, [ctx.getHandler(), ctx.getClass()])) return true;`
  (plus the `PLATFORM_ACCESS` import from `platform/identity/keys.ts`). No route declares access outside those prefixes today, so nothing else changes; PF-4's start-up rule (`assertEveryRouteDeclared`) already covers declared routes on any path. The case routes then live at `/api/runtime/cases/:id/{decisions,withdraw,close,reopen}`, beside the other case routes, with `@PermissionKeys`. `core.ts` is on contract v0.1 §7's list of one-line-hook files ("`core.ts` `actorOf` … and the request-context guard"), each needing the release Lead's OK. Cost: one line + one import, outside the brief's touch list.
* **B: put the four routes under `/api/front-office/cases/…`** (or `/api/platform/cases/…`) — inside the touch list, no `core.ts` change, but case routes would sit in another module's namespace (contract §2.2: the case side owns cases); a later move breaks callers. Not recommended.
* **C: keep `x-actor` routes and check the simulated person's duties** — inside the touch list, but DW2, DW5 and DW8 cannot pass as written (no keys, no bearer, no 401 `NOT_SIGNED_IN`). Not recommended.

## What I build on an answer
A → the brief as written, plus the `core.ts` line (named in the PR's first line). B → the brief with the `/api/front-office/cases/` paths. Either way one migration, `DW1`-`DW8` and journey W1, under 800 lines.

## Answer and build notes (15 Nov, after Lead 58's OK of option A)
* **Hook narrowed:** the line OK'd ("declares → return true") made PF-4's break-M1 test fail (a staff token on `/api/Platform/me` answered 200, not core's 403). The line now also needs `path.startsWith("/api/runtime/")` (exact case). PF-4's start-up rule (`platformRoutes`) collects only platform and front-office paths, so it does not check these routes' keys; a wrong key would refuse, never open (review m6).
* **AG-7-33 rule 5 not built** (review m1): the decision does not set `Filing.status` to `DECIDED`. `case-prepare.ts:218,263` and `review-rounds.ts:369` treat only `SUBMITTED` as submitted, and the filing has no stage field (D9 Q54). The `case_decision` row is the record; the status move is a later row.
* **`withdrawn_at`** is when the withdrawal was recorded; the date staff gave is `case_decision.decided_on` of the WITHDRAWAL row (review m3).
* **`case.reopened` carries no `reason`** (contract §4 lists one): free text may hold personal data, so it stays in the audit line; the event carries `stageId` and `previousOutcome` (review m4).
* **Follow-up row needed (review m8):** "a closed case has no moves" holds on the four new routes only; the existing `x-actor` case routes do not read `Case.status` (outside this row's touch list).
