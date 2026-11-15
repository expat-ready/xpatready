# Verdicts · capability platform group · main e593acccc (tree 32ac4601f) · reader: fresh Opus, high effort, ran nothing (P-303) · 16 Nov 2026

Read: `qa/CAPABILITIES.md` rows R1.2, R1.9, R1.11, R1.12, R1.16; `RULES.md` (P-339, P-348c, P-305, P-405, P-439, P-606) and `rules/works.md`; `MVP-CHECKLIST.md` rows 11, 12, 16 (all "Merged"); `qa/BUGS.md` QA-449, 450, 451; qa skill §2, §4 and Gate A; the two 15 Nov verdicts; every file in this folder; `tests/qa/check_r112_module_seam_walk.ts`; the `check_pf1_module_routes.ts` header; `.github/workflows/skeleton.yml`; `deploy/compose.test.yml`; `Dockerfile.dockerignore`; `web/src/modules/front-office/**`; `api/src/platform/identity/service.ts:138-150`.
**My own reads:** `git rev-parse` (3e36ca662 and e593acccc both have tree 32ac4601f); `git diff d52b7274e..e593acccc` on `web/src/App.tsx` and `web/src/modules.tsx` is empty; the web diff is only `modules/front-office/**` and five `MODULE.md`. In the suite file: 493 PASS, 0 FAIL, 17 quarantined; pf1 28/28 sits under shard 7, job 132899216252. "20 jobs, 18 success, 2 skipped" and skeleton run 43742297506 "skipped" are the tester's GitHub quotes; I did not open GitHub. A grep of `modules/front-office` finds no `style={`, hex or `rgb(` colour. `git log` on `skeleton.yml` and `.mergify.yml` shows no trigger change since QA-449 was opened.

### R1.11 Server framework — Partial (was Not tested), held by QA-449 (Major)
Every clause but the last is met **locally** on main's code (`skeleton-local-replay-e593acccc-mine.txt`):
* one image built with no cache: the build context is the working copy, but `Dockerfile.dockerignore` leaves out `tests/` and the records, so the untracked qa files never enter;
* PostgreSQL beside it, migrations first: "All migrations have been successfully applied", migrate exited 0 before the app started;
* health, first page and bundle 200; `/me` 200; non-root (uid 1000); no secret in 7 env names and 17 layers;
* seeded fail 1, database stopped: `FAIL health … 503`, exit 1;
* seeded fail 2, root image with a key: `FAIL non-root` and `FAIL no secret`.
**Not met:** "all on main's code on GitHub's runners". Batch run 43742297506 skipped the skeleton. The newest green PR run, 43747509665, is on e59e0c03: tree c53c957ae, a merge of **194b10a41, main before #1822**, so it does not even hold FO-4's module.
The replay changes two things, both stated: it uses `docker build -f Dockerfile.qa` and not `docker compose build --pull`, and the proxy CA goes into the two build-stage RUNs. The diff shows that only those RUNs differ. That makes it good supporting evidence, not P-339's run. It is more than "Not tested" (P-405: a pack and a server on main's code), so the status is Partial. It reaches Works when the Lead dispatches `skeleton.yml` on main (P-439) and it is green, or when QA-449 is fixed.

### R1.12 Screen framework, one UI kit — Works (was Partial)
Each Done-when clause:
* **A module's pages appear by adding its own `routes.tsx` only:** met. FO-4 part 1 added `modules/front-office/routes.tsx` (3 routes), and `App.tsx` and `modules.tsx` are unchanged (my diff). PF-1 checks 2 and 6.
* **Existing pages unchanged:** met. PF-1 check 3, and the walk's `/`, `/sign-in`, `/cases` headings at 3 widths × 2 rounds.
* **A clash names both sides and stops the app:** met. PF-1 check 4, with pass and fail cases.
* **`check_pf1_module_routes.ts` green on main's head on GitHub's runners:** met. 28/28, ci 43742297658, job 132899216252, tree 32ac4601f = main's. Independent re-run 28/28 twice (P-290).
* **Later screens judged against the one kit in qa's walks:** met for the first real module. The walk (71/71, twice) shows FO-4's pages inside the app's one `Frame` (`data-frame`, 56 px header like `/cases`, place line "Sales"), with no sideways scroll and axe clean. The module imports `Frame`, `useWhere`, `Button`, `Field`, `Input`, `Notice`, `Pill`, `Table` and `Skeleton` from the kit, with tokens only. It uses two raw elements: the filter chip `<button>` and the consent checkbox. The kit has no Chip and no Checkbox, so this is not a deviation.
**Gate A by screens:** the walk goes from the module's own address through a visible sign-in (a refused try, then a pass) to the Leads page, the first step of the front-office lead capabilities.
No open Major or Critical names R1.12. QA-450 and QA-451 are Minor, and P-305 holds a row only on a Major or Critical.

### R1.16 Automated testing — Partial (unchanged), held by QA-449 (Major)
* **Met:** every non-quarantined suite ran on the batch that made main's head, all green: 493 PASS, 0 FAIL in 8 shards, plus 5 checkpoint jobs, `types` and `ci` (quoted).
* **Not met:** the container smoke and its seeded fails on main's code on GitHub (QA-449).
* **Not shown this round:**
  * "a red suite blocks it": there was no red batch to watch;
  * "an API error never reads green": no evidence in this folder; it rests on PF-7's review commit 3a523edcd;
  * "Release 1 packs join the protected set" (Question 2): not addressed.
* Earlier Minor still stands: the 17 quarantined suites skip batches. Three of them are due back on 16 Nov.

### Rulings
* **QA-450: close, as met by its own second option.** Its Expected allows "the Lead rules that the kit half is judged only in qa's walks of each new screen". The row's Done when already says that, and this round has the first such walk.
  * The Done-when text was written by qa (510b9352d), not ruled by the Lead. So the Lead confirms the wording when closing.
  * Its line "Keeps R1.12 Partial" was never right under P-305 for a Minor, so it does not hold R1.12 either way.
  * Accepted risk: nothing stops a future module from skipping `Frame` except the next qa walk. A lint on `web/src/modules/` is a *Later · Scaffolding* suggestion.
* **QA-451: stays open (Minor, records only).** PF-1 check 5 shows that only a missing export stops `vite build`; a clash stops the app at load. Amend the BACKLOG row.
* **QA-449: stays open (Major).** It holds R1.11 and R1.16.
* **New finding: UX · Minor, capability R1.5 (PF-4's local sign-in, seen through FO-4), owner runtime.** For a wrong firm key, the form that asks for "Firm key" and "Work email" answers "No staff member of that firm signs in with that name." (`service.ts:145`, also line 150).
  * The person typed no name. "That firm" points at a firm that does not exist.
  * One combined message is right, because it does not reveal which half was wrong. The words should match the fields: "No staff member signs in with that firm key and work email."
  * Minor: it is the local stand-in only (`PLATFORM_IDENTITY=local`), until PF-4b and PF-6 bring the firm's sign-in. It does not hold R1.12, because the refusal shows on the form in the kit's Notice.
  * Replay: the walk's step 2 should assert the new text.

### Weak or unverified evidence (none changes a verdict)
1. The walk, these notes and the shots are **untracked** in this copy (git status `??`). Commit them before the row cites them (P-557).
2. **Headless only.** The skill (§2) asks for a headed walk first, and this cloud session has none. I count headless Playwright as "by screens"; the Lead may ask for a headed pass on the Mac.
3. **The walk is narrow:**
   * axe runs only on the sign-in, not on the Leads page;
   * the public `/front-office/web-form/:token` page is never opened. It renders its own `<main>` outside `Frame`, as a public page plausibly should, but nobody has judged it against the kit;
   * header comment 1 says "with the kit's fields", but no line asserts a kit component;
   * check 5's "same data-frame attribute shape" compares only header height ("outside" vs "cases");
   * step 2 asserts that the Notice is there, not its words.
4. The tester calls e59e0c03 "after main's head", but it was merged from main's previous commit. Main's tree is still not proven on GitHub.
5. Quoted, not verifiable here: the job counts, the skipped skeleton runs and the 403 on dispatch.

### For the Lead
* **R1.11:** dispatch `skeleton.yml` on main e593acccc (P-439). If green, R1.11 is Works on the next reader's look. R1.16 still waits on QA-449's fix: a batch or push trigger, and a required check.
* **R1.12:** move it to Works once the walk is committed. Confirm the Done-when line "judged in qa's walks" as your ruling, and close QA-450.
* **New UX Minor on R1.5:** agree it and qa logs it; the fix is one line in `service.ts` plus the walk's assertion.
