# Front door concept (25 Nov 2026): fresh challenge

Challenger: a fresh agent that did not write the concept. Read: the concept, 3 screenshots (06, 12b and the sign-in pages' code), the files below, `qa/CAPABILITIES.md` at 60103172f, `BACKLOG.md`, `design/case-side-contract-v0.1-2026-11-14.md`. Paths below are under `prototype/studio/` unless they start with `product/`.
Sides that do not apply: (1) product logic and (5) immigration fit. This is a sign-in door, not a configuration screen, and it sets no immigration values.

## Verdict: Build after these changes
The diagnosis is right. The three ways to sign in, the "two people at once" problem (seen in 12b) and the client's person picker (seen in 06) are real. So is the claim that the case side trusts `x-actor` everywhere. Three things need fixing before the rows go to BACKLOG: the size and owner of the identity join (FD-5), the staging walk (FD-9), and the order of the web rows.

## Objections

### Blocker
**B1. FD-5 is much bigger than ~600 lines, and an existing plan already owns it.**
* What breaks: the case side gets its person and firm from the simulated lists in every environment, not only through `core.ts:104`.
  * `actorOf` looks the header up in `ACTORS`/`RUNTIME_ACTORS` (`api/src/core.ts:63-67`).
  * 336 handler arguments in 82 files read `@Headers("x-actor")` directly.
  * The firm comes from `samples/firms.json` (`api/src/firms.ts:9,12`; 27 callers, including `runtime.ts`, `readiness.ts`, `team.ts`, `client-money/invoices/money.ts`).
* Effect: an invited production user has no `actor_id` (`seed-sample-firms.ts:93-96` sets it only for the seeded users). Such a user gets no case page at all. Re-keying `actorOf` alone does not fix that.
* Already planned: the case-side contract names this exact dependency, "the identity join (`actorOf` reads a platform session; `firms.ts` reads platform tables)", in `product/design/case-side-contract-v0.1-2026-11-14.md:193`. It falls under P-584 (9)'s rule that each hook into existing case-side files needs the release Lead's OK (`:205`). The concept's duplicate check found only BACKLOG line 462 and missed this.
* Existing pattern: case routes already move one by one to permission keys, which hand off to the platform guard (`core.ts:96`, CS-C1a). 58 such routes exist today: case-notes, case-close, client-money and others. Duties already come from keys (`platform/identity/keys.ts:42-52`).
* Fix:
  * Make FD-5 the contract's identity-join row, owned by the release Lead.
  * Split it into (a) a request-context person built from the staff session, with duties from `dutiesOf(keys)`, read by `actorOf`, so the 336 call sites stay as they are; (b) `firms.ts` reading platform tables instead of `firms.json`; (c) refusing `x-actor` outside `local`.
  * Each part needs a pass and a fail test and must stay under 800 lines. Expect 3 or more PRs.
* Confidence: high on the facts; medium on the split. Needed for the proof.

### Major
**M1. The FD-9 staging walk is a public door with real sessions, and it is not possible inside the present limits.**
* What breaks:
  * `POST /api/walk/sign-in` on staging lets anyone who reaches the address become the Sample Owner. Doing the second step on the server with stored TOTP seeds makes two-step meaningless for those accounts (P-567).
  * Staging never seeds: "`PLATFORM_SAMPLE_SEED` is never set" (`deploy/cdk/README.md:74`).
  * Enrolling TOTP for seeded users needs `AssociateSoftwareToken`/`VerifySoftwareToken`. The task role may call exactly eight Cognito actions (`deploy/cdk/lib/service.ts:49-50`), and `signInTaskFindings` refuses any other grant (`deploy/cdk/test/sign-in-task.test.ts`). Reading `xr/staging/walk/*` is a new Secrets Manager grant as well.
* Fix: take question 1's option (B), the walk on `local` only. Staging is proven by FD-10 through the real sign-in, with seeds kept by the test runner and never by the app. If the founder still wants (A), it needs its own security challenge, written changes to README:74 and the sign-in task test, and a gate in front of it (for example the staging load balancer allowing only listed addresses).
* Confidence: high. Needed for the proof (question 1).

**M2. The Studio card cannot work on staging, and the concept says both things.**
* What breaks: §7's table refuses `x-actor` on staging (FD-5). Question 3 (A) keeps the Studio on simulated people for Release 1. The Studio reads only `x-actor` (`readerOf`, `core.ts:72-76`). So "Our content team" works only on `local`, and the map's first step ("Set up the program") cannot be walked on staging.
* Fix: say it in the map. The content-team step is `local` only until the X-row that moves it to PF-4s. FD-10's staging pack starts from a release that is already published.
* Confidence: high. Needed for the proof.

**M3. The "parallel" web rows touch the same files, in the wrong order.**
* What breaks:
  * FD-6, FD-7 and FD-8 all change `web/src/components/frame.tsx`.
  * FD-8 removes "Acting as" from the staff shells. Until FD-6 lands, the case pages still need the stored `xr-actor` (`web/src/lib/api.ts:10,36`), so local case pages lose their only way to pick a person.
  * FD-3's "lands on that persona's home" for the Case officer still shows two people until FD-5/FD-6.
* Fix:
  * Run FD-1, FD-2, FD-4 in parallel now.
  * Run FD-3 after FD-2.
  * Run FD-7 and FD-8 one after the other, after FD-6, or have FD-8 keep the picker on case pages until FD-6.
  * Name `frame.tsx` as a busy file.
* Confidence: high. Needed for the proof.

**M4. The production fail test should boot in production, and the concept misses existing work to reuse.**
* What breaks: FD-1's "a booted copy with the walk off answers 404" proves only that the setting was off. It does not prove that production refuses the walk.
* Existing work the concept misses:
  * `tests/check_qa621_persona_door_production.ts` already boots an isolated copy with `PLATFORM_ENVIRONMENT=production` and generated settings.
  * `runtime.ts:32,288` already refuses the simulated person's case opening in production (`SIMULATED_PERSON_REFUSED`). That makes the concept's §7 statement "x-actor allowed everywhere" slightly overstated: one door is closed today, in production only, not in `test`.
* Fix: FD-1 and FD-5(c) reuse QA-621's harness. Boot in production: the walk setting is refused at start-up, and `/api/walk/*` answers 404 with no audit line. FD-5(c) widens QA-621's refusal to every `x-actor` request in `test` and `production`.
* Confidence: high. Needed for the proof.

### Minor
* **m1. Lock 4 reads the flag from `/api/session`, which reads `x-actor`** (`api/src/main.ts:63`, `actorOf`). Once FD-5(c) lands, that route refuses outside `local`. Fix: read the flag from an open route, for example `GET /api/walk/personas` answering 404 when off. High. Needed for the proof.
* **m2. Persona map, Forms row.** The shell reads "client portal", but R1.62 is Not built. It should read "client link (R1.101)". Every status checked matches CAPABILITIES (63/17/21; R1.29, 54-58, 61, 87 Partial; R1.57, 60, 62, 75, 112 Not built). R1.31 under Retainer means "won by signature", which is fine. High. Needed for the proof.
* **m3. FD-8 adds "email first; firm found from the address, PF-25".** That is new sign-in behaviour, not chrome removal, and no-domain staging has no firm address (`deploy/cdk/README.md:84-89`). Fix: FD-8 only removes words and shows the firm's name; email-first sign-in goes to the R1.5 sign-in page row. High. Not built.
* **m4. FD-3's CI check ties every PR to qa's file.** The check that map statuses equal `CAPABILITIES.md` turns unrelated PRs red whenever qa re-scores. Fix: read the statuses when the page is built and show the date; check only that the row ids exist. Medium. Needed for the proof.
* **m5. FD-2 works only on `local`.** It reuses `localSignIn`, which is refused unless `PLATFORM_IDENTITY=local` (`platform/identity/service.ts:185`). That is correct, but the row should say so, so nobody expects it to work on staging. High. Needed for the proof.

## What is sound
* Lock 1 copies a proven rule (`config/settings.ts:155,158`). Lock 3 extends a real test (`deploy/cdk/test/service.test.ts:48`). Lock 2 fits `features.ts` `registerFeatures`.
* Sample seeding already refuses production (`platform/identity/sample-seed.ts:28`). The walk adds nothing new to production when off.
* One click issues the persona's real session through PF-4/PF-4s, so there is no second token code. FD-4 seeds through the same services as the screens (DEMO.md). Scaffolding is labelled P-33.
* The three-shell table and M1-M5 match the screenshots and the code. The size estimates for FD-1, FD-2 and FD-7 are realistic.

## Questions for the founder (recommendation first)
1. **Guided walk on staging:** (B, recommended) the walk on the local demo only; staging is proven by FD-10's real sign-in. (A) The server signs in with stored TOTP seeds. This needs new AWS grants, a reversal of "staging never seeds" and its own security challenge (M1).
2. **Identity join:** (A, recommended) do it now as the case-side contract's identity-join row under the release Lead, in 3 or more PRs (B1). (B) Hide the picker only until after Release 1. Then production still trusts `x-actor`, so Release 1 cannot ship.

## Lead response

## Agreement
