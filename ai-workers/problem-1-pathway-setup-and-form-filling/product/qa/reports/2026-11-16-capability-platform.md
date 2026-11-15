# qa · capability platform group · main e593acccc (tree 32ac4601f) · 16 Nov 2026, 00:3x IST

Lane: qa, platform group (P-613 (4)), cloud copy. Rows: MVP-CHECKLIST 11, 12, 16 (all "Merged") = R1.11, R1.12, R1.16. Verdicts by a fresh Opus reader at high effort who ran nothing (P-303, P-339): `2026-11-16-capability-platform/verdicts.md`. Tester's facts: `…/tester-notes.md`. Live AI off; no priced button; nothing on :4400.

## Verdict
| Row | Was (d52b7274e) | Now (e593acccc) | Held by |
|---|---|---|---|
| R1.11 Server framework (PF-7) | Not tested | **Works** (main af7df6d62, after the Lead's dispatch; Partial at first) | — (QA-449 no longer holds it) |
| R1.12 Screen framework, one UI kit (PF-1) | Partial | **Works** | nothing (QA-451 Minor, records) |
| R1.16 Automated testing (PF-7) | Partial | **Partial** | QA-449 (Major) |

Release 1 at qa Works: +2 (R1.12; R1.11 after the Lead's dispatch of `skeleton.yml`, run 43752888288, a fresh reader's re-score in `verdicts.md`).

## What works
* **Every non-quarantined suite is green on the batch that made main's head.** ci 43742297658 (merge batch "merged #1822", head 3e36ca662, the same tree as main e593acccc): 8 shards, 493 PASS, 0 FAIL, 17 quarantined (P-205); 5 checkpoint jobs, types and ci green. The suite lines were read from the job logs: `ci-43742297658-suite-lines.txt`.
* **R1.12, PF-1's seam with its first real module.** FO-4 part 1 (#1822) adds `/front-office/web-form/:token`, `/front-office/leads` and `/front-office/leads/:id` through `web/src/modules/front-office/routes.tsx` only; `App.tsx` and `modules.tsx` are unchanged since d52b7274e. `check_pf1_module_routes.ts` passes 28/28 on GitHub's runners (job 132899216252) and in qa's re-runs (28/28, twice).
* **R1.12 gate A, by screens:** `tests/qa/check_r112_module_seam_walk.ts` (new), **74/74 twice** at 400, 1024 and 1440 px. The walk:
  * opens the module's address inside the app's one Frame (56 px header, same as `/cases`), with the place line "Sales";
  * types a wrong firm key and is refused in words;
  * types the firm key and the Case Manager's work email, presses Sign in, and the **Leads** page opens (the next capability's first step);
  * checks that `/`, `/sign-in` and `/cases` keep their headings;
  * finds axe WCAG 2.2 AA clean on the sign-in and on Leads, no sideways scroll, no page error.

  The module uses the kit's components only, with no inline style and no hex colour. Screenshots are in `…/shots/`.
* **R1.11, the container proof replayed locally on main's code** (`skeleton-local-replay-e593acccc-mine.txt`):
  * no-cache build; migrations applied before the app;
  * smoke 6/6: health, the first page and its bundle, `/api/platform/me` 200, non-root uid 1000, no secret (7 env names, 17 layers);
  * seeded fail 1, database stopped: FAIL health (503);
  * seeded fail 2, a root image with a key: FAIL non-root and FAIL no secret.

  Two deviations were forced by the sandbox and are stated in `skeleton-local-Dockerfile.qa.diff`. The base image was pulled first because Docker Hub answered 429; the base is pinned by digest. The proxy CA went in as a BuildKit secret, in the two build-stage RUNs only, so the run stage is main's. This is supporting evidence, not P-339's run.

## Bugs
0 Blocker · 0 Critical · 0 new Major · 1 new Minor.
* **QA-476 (new): UX · Minor, R1.5, runtime (PF-4).** The staff sign-in's refusal reads "No staff member of that firm signs in with that name." The form asks for a firm key and a work email; the person typed no name. Keep one combined message (it must not tell which half was wrong), but use the form's words. Check: `tests/qa/check_qa476_signin_words.ts` passes 2/3 today, as intended (`qa476-mine.txt`).
* **QA-449 (Major) re-seen.**
  * `skeleton.yml` was skipped on main's batch (43742297506).
  * The newest green PR run (43747509665, #1818) was on main's previous commit 194b10a41, without #1822.
  * qa's `workflow_dispatch` on `main` returned 403 from this cloud session (P-439).
* **QA-450 closed** (`history/qa-bugs-closed-2026-11-16-platform-group.md`). Its own second option is met: R1.12's Done when judges the kit in qa's walks, and FO-4 passed. The Lead confirms that wording, because qa wrote it (510b9352d).
* **QA-451 (Minor, records) stays open.** It does not hold R1.12 (P-305).

## Coverage and suites
* Suites: the CI batch above (P-85). qa ran no full local suite run.
* Not run this round: c8 coverage and `graph.mjs`. This was capability mode on three platform rows with no app-code change by qa, and the floor was last measured on the R1 rounds.

## Could not test
* **A headed walk.** This cloud copy has no visible browser, so the walk is headless Playwright only. The Lead may want a headed pass on the Mac.
* **`skeleton.yml` on GitHub's runners on main's head:** dispatch returned 403.
* **R1.16's other clauses:**
  * "a red suite blocks the batch": no red batch occurred to watch;
  * "an API error never reads green": rests on PF-7's 3a523edcd;
  * "Release 1 packs in the protected set": Question 2, open.
* **The public web-form page** (`/front-office/web-form/:token`) is not judged against the kit. It renders its own `<main>` outside the Frame, as a public page plausibly should.
* **The shared demo :4400** cannot be reached from the cloud copy, so there was no read-only walk on it.

## Questions for the Lead
1. **R1.11:** please dispatch `skeleton.yml` on main e593acccc, or on main's next head (P-439). If it is green, qa re-scores R1.11 to Works within 4 h. R1.16 also needs QA-449's fix: a merge-batch or push trigger, and a required check.
2. **QA-450:** confirm R1.12's Done-when line "later screens judged against the one kit in qa's walks" as your ruling. If you want a pack instead, qa reopens QA-450 and R1.12 goes back to Partial.
3. **QA-476:** agree the finding and the words. The fix is one line in `service.ts`, and qa's check flips to 3/3.

## Suggestions
* A lint that refuses raw styling or a missing `Frame` in `web/src/modules/`. *Later* · *Scaffolding*.
* A merge-batch or push trigger for `skeleton.yml`, as QA-449 asks. *Needed for the proof* · *Scaffolding*.

## Stay-on (P-613 (4))
qa re-scores each platform row within 4 h of its last part merging, and a fixed one within 4 h of its fix:
* R1.11 after a green `skeleton.yml` on main;
* R1.16 after QA-449's fix;
* R1.5 after QA-476's fix.
