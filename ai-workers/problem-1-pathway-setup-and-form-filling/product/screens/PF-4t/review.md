# PF-4t review: module folders under the type check (api/tsconfig include; PF-4's decorators)

Reviewer (did not build it), 14 Nov 2026. Commit **50ad8acd42395381d1a93fb6e11eaa9be1090bd7**, branch `claude/trusting-curie-xt7wox`, PR #1775.

* **Read:** brief `lead-b-briefs/PF-4t.md` (on `lead-b-front-office`), the PR body and `git diff origin/main...50ad8acd`. The diff is 5 files under `studio/api`, +40/−47. The merge base is `b91ab10ad`.
* **Scope:** no screen, no schema and reviewer only. So the UI walks, the 1024 px / 200 % checks, the BIC table and the breaker are N/A.
* **Journey test:** in the section below, because I was told to write only this file. Score **9 / 10**.

## What I ran (copy `pf4trev` on :4545; never :4400; copy stopped; tree left clean)
* `node P/tools/typecheck.mjs`: **PASS**.
  * api: 811 files, **15 known errors, 0 new**. web: 0.
  * `bash P/tools/check-typecheck.sh`: **14 passed, 0 failed**.
* `tsc -p api/tsconfig.json --listFilesOnly` lists all **29/29** tracked `.ts` files under `src/platform/` and `src/front-office/`. `src/client-money/` does not exist yet, as the brief allows.
* PF-4's suite on a fresh copy (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`): **113/113 passed**.
  * The brief's command runs it with the default `STUDIO_DB=xr_studio_pf4`, which fails on a `pf4trev` copy. It needs `STUDIO_DB=xr_studio_pf4trev`; this is a command-line note, not a code issue.
* **Metadata comparison:**
  * I extracted `main` (b91ab10ad) into a scratch folder.
  * I imported `routes.ts`, `service.ts` and `guard.ts` from both trees with `tsx --tsconfig api/tsconfig.json`.
  * I dumped every `Reflect` metadata key on each class, on each handler, and on `(class, method)` (where route arguments live).
  * The two dumps are **identical once key order is normalised**. The raw dumps differ only in insertion order (see point 5).
* **Live probes** on :4545, no session:
  * The 9 declared staff routes answer **401** "Sign in again". This covers GET/POST `staff/invitations`, `invitations/:id/resend`, `invitations/:id/revoke`, PATCH `staff/:id/roles`, PUT `staff/:id/credential` and POST `staff/:id/deactivate`.
  * `session/local` reaches its handler: `@Body` is bound and the service answers 400 FIRM_REQUIRED or EMAIL_INVALID.
  * Undeclared methods and paths answer 404, for example DELETE `staff/:id/roles`.
* **Proof:** CI run 43627811422, job 132548865130 ("types") on head `0707de4a7`.
  * It failed at the step "type check, api and web": `FAIL 1 new type error(s) … api/src/platform/pf4t-type-proof.ts(3): TS2322`.
  * The proof file is imported by nothing, so only the new include reaches it. This shows the include line does real work.
  * `git diff 0b1efc5f3 50ad8acd` is empty, so the proof's net diff is nil.

## Main job: every changed line outside tsconfig.json changes only how decorators are applied
1. **Routes, methods, HttpCode: same.**
   * `routes.ts:15-44`: the 10 routes have the same paths and verbs (GET/POST/PUT/PATCH = metadata 0/1/2/4).
   * `HttpCode(200)` is on the same 5 routes: local, resend, revoke, deactivate, reactivate.
   * The class path is `api/platform` (`routes.ts:10`).
   * The metadata dump is identical to `main`.
2. **Permission declarations: same.**
   * Every `platform:access` value is equal, including the exact `why` strings of `StaffSignIn` and `AnyStaff`.
   * `agent/role:assign` is on `roles` only; `agent/staff:manage` is on the other 5 keyed routes.
3. **Parameter decorators: same.**
   * `__routeArguments__` holds the same `type:index` entries per method, for example `0:0` Req, `5:1` Param("id"), `3:2` Body.
   * `Param` data is still `"id"`.
4. **Injection tokens: same tokens in the same positions.**
   * Controller: `0 → PlatformIdentity`.
   * Service (`service.ts:78`): `0 → Db`, `1 → IDENTITY_PORT`, `2 → PlatformClock`.
   * Guard (`guard.ts:52`): `0 → Reflector`, `1 → ModulesContainer`, `2 → PlatformIdentity`.
   * `IDENTITY_PORT` is declared at `service.ts:20`, above the class. The decorators now run when the class is defined, so there is no TDZ risk. There is no import cycle back into service, guard or routes.
5. **Order of application: no difference Nest can see.**
   * Method decorators still apply last-first, as `decorate` did by reversing its list.
   * Legacy `__decorate` applies parameter and constructor decorators *before* the method or class decorators. The old code applied them after.
   * They write disjoint metadata keys, so the only visible difference is the order of entries in `self:paramtypes` and in `__routeArguments__`.
   * Nest 11.1.29 places both by index, not by order:
     * `injector.js:222`: `paramtypes[index] = param`;
     * `context-utils.js:21-24` with `router-execution-context.js:150`: `args[index]`.
   * The new order is the one every other `@`-decorated controller in `api/src` already produces.

## Other checks
* **`decorate` helper:** it is removed from `keys.ts`, along with its note. `git grep 'decorate('` finds no remaining user in `api/` or `tests/`, outside tsc's own `__decorate`.
* **Loaders:**
  * Every launcher of `main.ts` already passes `--tsconfig api/tsconfig.json`: `tools/isolated.sh:83` and `Dockerfile:56`. It has to, because `api/src/*.ts` and `features/` already use `@` decorators.
  * `features/platform-identity.ts` is loaded only through `main.ts`.
  * The only other importer is the suite, which runs with the same tsconfig.
  * So no runtime path loads the new `@` parameter decorators without `experimentalDecorators`.
* **Guard start-up rule:** it still sees the routes.
  * `platformRoutes` reads `PATH_METADATA` and `METHOD_METADATA` (`guard.ts:19-36`), and both are present on all 10 handlers.
  * The suite's "a platform route with no declared keys stops the start-up, naming it" and "the rule itself accepts declared agent/* routes" pass.
  * The copy started, so `onModuleInit` ran over the real routes.
* **Touch list:** only `api/tsconfig.json:15` and four existing `.ts` files under `src/platform/identity/`. No `any`, `@ts-ignore` or `@ts-expect-error` was added. No type fixes were needed (0 errors in the three folders, per the PR's Step 0 and my run).
* **Include side effects:** the only compiler option newly applied to these files at run time is `experimentalDecorators`.
  * It changes nothing in files without decorators.
  * No other file in the three folders uses `@`. `platform/observability/health.ts:58-63` still applies its decorators as calls, which the brief allows: it names only PF-4's calls, and the PR body records it as a follow-up for its owner.

## Findings
* **Blocker:** none.
* **Major:** none.
* **Minor:** none in the code.
* **Note (not a finding):** the PR body's "Next" line still lists these runs before the label:
  * the brief's "Must still be true" suites: PF-3's, the demo reset and C10.1;
  * the rows rev 16 pre-label run on `main` merged in.
  * CI at 50ad8acd was still pending while I reviewed (`ci` run 43628472633).
  * The label requires green CI anyway; paste those result lines as the brief asks.

## Dimensions (/5; only those this row touches)
D1 5 (brief met line by line) · D2 N/A · D5 5 (start-up rule unchanged; the copy starts) · D14 5 (decorators now in the same `@` form as the rest of `api/src`) · D15 5 (decorators run once at load; request path unchanged) · D16 5 (113/113 rerun by me; the CI type gate is proven red under `src/platform/`) · D8–D13, D17–D20 N/A (no screen; D17 and D20 stay with the founder). BIC-01–BIC-20: N/A (no case-side screen).

## Journey test (reviewer, 14 Nov 2026; API and CI only, no screen)
Journeys:
1. **Builder, main path.** A builder adds a type error to an unimported file under `src/platform/`. CI "types" goes red, naming the file, line and TS code. The proof run above shows this.
2. **Staff member.** A staff member signs in locally and asks who they are. Covered by the suite.
3. **Wrong role.** A missing key gets 403 (suite); no session gets 401 (my probe).
4. **Error.** An undeclared platform route stops the start-up, naming it (suite).
5. **Recovery.** With the proof removed, the local type check is green again (15 known, 0 new).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Journeys 1-5; the suite 113/113 |
| Next step obvious | 1 | The CI failure names the file, line and TS code |
| Plain words | 1 | `FAIL 1 new type error(s) (not in typecheck-known.txt)`; problem answers unchanged |
| Feedback and state | 1 | Types step red at 0707de4a7 and green locally at 50ad8acd |
| Correct data | 1 | Normalised metadata identical to `main`; the same 401/404 answers live |
| Error recovery | 1 | The start-up rule still refuses an undeclared route by name |
| Accessibility and screen sizes | N/A | No screen |
| Speed | ½ | Not timed; the decorators run once at load and the handlers are unchanged |
| Visual quality | N/A | No screen |
| Trust and sources | 1 | The proof run and job are linked; Step 0 counts are in the PR body |

**7.5 / 8 applicable → 9 / 10. Pass.** To raise speed: time the suite's real-server checks against `main`.

## Could not check
* CI at 50ad8acd: still running.
* PF-3's suite, the demo reset and C10.1: the builder's pre-label runs.
* A real screen reader and an intended user's walk: N/A here.

**Verdict: Approve 50ad8acd42395381d1a93fb6e11eaa9be1090bd7**
