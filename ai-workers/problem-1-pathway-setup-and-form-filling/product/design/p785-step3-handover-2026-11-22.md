# P-785 (2) step 3 hand-over: web route and menu registration, one file per feature (22 Nov, 00:1x IST 23 Nov)

Written by the runtime lane that built steps 1 and 2, at the tech lead's request (Lead 7: the session is at 70% context,
so a fresh lane takes step 3). Nothing of step 3 is built yet; this note is the plan, the facts found, and the traps hit
in steps 1 and 2.

## Where the row stands
| Step | What | PR | State |
|---|---|---|---|
| 1 | Events: one file per owner module under `ports/events/`; `ports/events.ts` only re-exports, frozen; guard `tests/check_ports_events.ts` | #2919 | merged 22 Nov 12:48 UTC |
| 2 | Bypass uses (`firm-scope.ts`): a new use is declared in `<module>/<name>.bypass.ts` under api/src; `BYPASS_USES` frozen at 15; the list closes at start-up; guard `tests/check_bypass_uses.ts` | #3032 | merged 22 Nov 18:16 UTC |
| 3 | Web routes and menu, one file per feature | none yet | this note |
| 4 | Test allow-lists (forms_qa53, pf12 walls, pf12b bypass audit, pf28 allow-list) as markers or one file per part; PF-28 last | none yet | not started |
| 5 | Module cards generated from `MODULE.rows/` | none yet | not started |

Owed by the tech lead (Lead 7 takes it): two lines in `product/tools/lead-read-paths.txt`, so a new bypass use is never
labelled without the Lead's read (P-423). The queue gate labelled #3032 by itself because neither path is on the list:
```
# Bypass uses: a use that crosses the firm walls is a permissions change (P-423, P-785 (2))
/api/src/.*\.bypass\.ts$
/api/src/platform/firm-scope\.ts$
```

## The three PRs step 3 waited on: all merged
#2904 (PF-18s part 3, My account → Notifications), #2906 (PF-18s part 2, the "?" button and Help & support) and #2910
(PF-13 part 2, the Branding panel) each edited `web/src/modules/platform/routes.tsx` and `account-sections.ts`. All three
are merged (checked 22 Nov 18:3x UTC). Before you build, run the same check on every open PR's branch again, the way step 1
did (fetch each open app PR's branch, `git diff --name-only $(git merge-base origin/main <branch>) <branch>` against the
files below). On 22 Nov at 18:3x UTC there were 60 open PRs.

## The shared files today (origin/main)
* `studio/web/src/modules/front-office/routes.tsx` (42 lines, 17 routes, 12 PRs in 7 days),
* `studio/web/src/modules/platform/routes.tsx` (44 lines, about 15 routes plus `...complaintRoutes`, 9 PRs),
* `studio/web/src/modules/platform/account-sections.ts` (23 lines, the My account menu; order matters; the file has no
  imports on purpose, "so a test reads it in Node"; 8 PRs). Its readers: `platform/frame.tsx` and the browser suites
  `check_pf6a_frame_browser.ts`, `check_pf13_branding_browser.ts`, `check_pf5s2_billing_browser.ts`,
  `check_pf5t_terms_browser.ts`, `check_fo3st2_availability_browser.ts`, `check_aud4s_activity_log_browser.ts`.

The seam already exists one level up: `studio/web/src/modules.tsx` (PF-1) gathers `./modules/*/routes.tsx` with
`import.meta.glob(..., { eager: true, import: "routes" })`, skips `_*` fixture folders unless `VITE_MODULE_FIXTURES=1`,
and stops the app on a path that overlaps App.tsx's own (`APP_ROUTES`, `overlaps()`). Its test is
`tests/check_pf1_module_routes.ts`; the how-to is `web/src/modules/README.md`.

## The plan (the tech lead agreed it, 22 Nov 23:4x IST)
1. **Routes:** a feature adds `web/src/modules/<module>/<feature>/<feature>.routes.tsx` exporting `routes: ModuleRoute[]`.
   Each module's `routes.tsx` keeps its existing entries, frozen, and appends what an eager glob of
   `./**/*.routes.tsx` in its own folder returns. Alternatively, `modules.tsx` itself globs
   `./modules/*/**/*.routes.tsx` beside `./modules/*/routes.tsx`; that is one place instead of two, and it reuses
   `overlaps()` for free. My recommendation: extend `modules.tsx`, the existing seam, and leave both module files frozen.
2. **Menu:** a feature adds `<feature>.account-section.ts` exporting `section: AccountSection & { order: number }`, with
   no imports, as today. `ACCOUNT_SECTIONS` stays as it is (frozen) and gets an implicit order (10, 20, 30, …). The
   collected sections are merged by `order`, so a new entry lands between two existing ones without editing either.
   Keep `visibleSections()` as the one reader. The Node-side tests read `account-sections.ts` directly, so either keep
   the glob out of that file (collect in `frame.tsx`, or a small `sections.ts` that Vite builds), or give the tests a
   Node reader of the same files (`readdirSync`; see the trap about `web/src` below).
3. **Route order:** `/book/:firmKey/manage` must win over `/book/:firmKey/:slug` (QA-496). React Router 6+ ranks
   routes by specificity, not declaration order, but prove it with a test before relying on it.
4. **Guard** (a new `tests/check_web_registrations.ts`, or added to `check_pf1_module_routes.ts`):
   * the frozen lists hold exactly today's entries (an anchor, as in steps 1 and 2), and a fixture that adds one to
     the old file exits 1 under an `--old-file` flag;
   * every `*.routes.tsx` and `*.account-section.ts` has the expected shape;
   * no path is declared twice; no menu `order` or path is used twice;
   * a before/after test: a new feature's route is one new file, no shared file edited.
5. `DEVELOPING.md`: one paragraph. Propose the `/next` instruction line in the PR (the skills are the Lead's).
6. **Labelling:** per the task, the builder may label step 3 itself (no shared contract, no permissions), after
   `Reviewer: Approve <head sha>`.

## Traps hit in steps 1 and 2 (save yourself the rounds)
* **`select-suites.mjs` reads the text:** a suite whose text names `web/src` (or `api/src`) and calls `readdirSync` is
  a "scanner", run for every change in that folder. `check-select-suites.sh` then fails "that page chooses fewer than
  30 suites". For step 3 the guard must read `web/src`, so expect to raise that limit with the Lead, or keep the guard's
  folder list out of its text (build the path from pieces only if the Lead agrees: it hides the dependency).
* **`ci-memory.mjs` `startsSomething`:** any of `spawn`, `execFile`, `exec(`, `fork(`, `DATABASE_URL`, `PrismaClient`,
  `localhost` in a suite's text marks it as starting something, so the static sweeps (before the label) skip it. Write
  `str.match(re)`, not `re.exec(str)`.
* **The static sweeps** (`product/tools/static-sweeps.mjs`) pick a suite only if its text names `api/src`, `web/src`
  or `"src"`. That file is the Lead's: the runtime copy's stop hook refuses edits under `product/tools/`.
* **Anchors race the queue:** #3046 added a 15th bypass use while #3032 waited in the queue; three merge batches failed
  on it, each needing a "Batch failures covered: <run id>: <parts>" line and a green `/run full`. Before labelling,
  re-check the anchor against origin/main, and count from the anchor (`ANCHOR.length`), never a written number.
* **Slash commands:** the GitHub tool in the cloud copy inserts separators into a comment starting with `/run`, so
  `comment-run` skips it. Ask the Lead to post `/run full`.
* **GitHub's test-merge ref goes stale** (main from hours earlier) until the branch is pushed: a records row on main
  (a size exception, say) is not seen by `pr-rules` until you merge main in. A pure merge of main that touches none of
  the PR's files keeps the Approve (P-318 (1)), but still needs a `Reviewer: Approve <new head>` line for the queue gate.
* **`review-rounds`** counts every `Reviewer:` line, including a confirmation of a pure merge; past round 2 each needs
  the Lead's `Lead allows round N:`. A fresh reviewer is the Lead's choice, not the builder's.
* **Stacked drafts:** a draft built on an unmerged branch carries its parent's lines in `pr-rules`' size count, and
  any merge batch stacked on its old head can fail later and hold it (the label guard names each one).
* **Size:** stay under 800 changed lines, or ask the Lead for a DECISIONS row before the label (step 1 needed P-804).

## Evidence and records
* Collision map (why): `product/design/collision-map-two-tracks-2026-11-22.md` section B, on `lead/2026-11-07-lead31`.
* Step 1's and step 2's PRs carry every review round, the breaker reports' findings and the exit codes.
