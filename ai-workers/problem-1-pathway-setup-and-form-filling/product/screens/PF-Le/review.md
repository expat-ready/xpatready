# PF-Le review: the message editor's libraries (dependencies only; P-630, P-576 (4))

Independent reviewer (P-303), 16 Nov 2026. PR #1919 (draft), branch `claude/runtime-pfle`, **commit reviewed c2e67a341** (base `origin/main` 1d0c740a7, which is also the merge base; two commits, 4620a7be3 and c2e67a341). Brief: row PF-Le in `design/lead-b-briefs/P-630-amendments.md` on `lead-b-front-office`. `git diff --stat` shows 4 files: `package.json` (+28), `package-lock.json` (+3,149 / -715 by git's count), the gate file (+96) and `tests/check_pfle_libraries.ts` (new, 86 lines).

**Not a screen.** PF-Le has no UI, route or journey. As in PF-L's review, these do not apply: screen-review steps 2–3 and 6–7, D1–D20, the BIC table and the graph. **Journey score: N/A (no screen to walk).** No journey-test report is written. I checked every claim myself with Node 24.21.0 and npm 11.19.0 (`.tools/node-v24.21.0`), in scratch copies only.

## What I checked (evidence)
* **Exact versions.** `package.json` adds `@react-email/editor` 1.7.18, `react-email` 6.11.6 and 26 `@tiptap/*` at 3.32.2, all with no range. The 26 are exactly the `@tiptap/*` names in the editor 1.7.18 `dependencies`, each asked as `^3.32.0`. `@tiptap/html` is among them. Peers `react`/`react-dom` `^18 || ^19` are met by 19.2.7.
* **Lockfile (compared entry by entry with node, main vs c2e67a341).** Still lockfile version 3. **179 added, 0 removed.** 37 of the added are nested copies. All 33 `@tiptap/*` entries are 3.32.2, none below 3.30.5. No added entry has an install script. Licence fields: 169 MIT, 9 BSD-2/3-Clause, 1 CC0. **54 existing entries changed, but only in their flags** (Minor 1). No version, `resolved` or `integrity` value moved.
* **Integrity and age rule.** For all 179 added entries, `integrity` and `resolved` match the registry. Every registry `time[version]` is on or before 2026-11-02T23:59:59Z. The newest is prosemirror-changeset 2.4.6 (2 Nov 19:23Z), then ws 8.22.1 (31 Oct), prosemirror-view 1.42.9 (31 Oct) and the editor 1.7.18 (30 Oct 18:58Z). Spot checks: socket.io 4.8.4 (25 Sep), engine.io 6.6.11 (24 Sep), @react-email/render 2.2.0 (28 Oct), prompts 2.4.2 (2021), react-email 6.11.6 (29 Oct), @tiptap/core 3.32.2 (30 Oct), prismjs 1.30.0 (Mar 2025), @babel/parser 7.29.12 (29 Oct).
* **Install.** I ran `npm ci --ignore-scripts` on the PR's package.json and lockfile in a scratch folder: 630 packages, exit 0. `npm ls --all` exits 0. `npm install --package-lock-only` rewrites the lockfile byte for byte, so it was not hand-edited.
* **`npm audit` (my own runs).**
  * Before: 17 (8 moderate, 9 high). After: 19 (10 moderate, 9 high).
  * The two new rows are `react-email` (via `glob`) and `@react-email/editor` (via `react-email`), both moderate. npm's fix is editor 1.8.7.
  * `glob` 13.0.6 was already flagged (GHSA-3g3m-2fjr-6pw4) and now also counts `react-email` among its effects. No advisory names an added package directly. This matches the addendum.
  * `react-email` asks `glob ^13.0.6`. The only file of its `dist` that imports glob is `dist/cli/index.mjs`.
* **Gate file.**
  * `diff` of Lead B's file (`origin/lead-b-front-office`, 595ba8f74) against the PR's copy: the only difference is the PF-Le addendum paragraph (lines 11–12), placed right after the PF-Lc addendum.
  * Main's copy has no line that is missing from Lead B's, so nothing on main is lost.
  * The addendum's facts hold: 179/37/33, the 11 `@babel/*` entries at 7.29.x, esbuild 0.28.2, chokidar 5.0.0 and tailwindcss 4.3.1 already present, prismjs 1.30.0, socket.io 4.8.4 and engine.io 6.6.11. Two of its statements are not exact (Minors 1 and 2).
  * No personal names were added; the copyright holders are companies.
* **The new check.** `tsx --tsconfig studio/api/tsconfig.json studio/tests/check_pfle_libraries.ts` gives 16/16 PASS in 1.4 s. Its usage line makes it a plain suite for `run-suites.sh`.
  * I added `import { EmailEditor } from "@react-email/editor"` to `web/src/main.tsx` in a scratch copy, as the PR body says it did. Result: 15/16, and only the import check FAILs, as intended.
  * With that import, the build is clean by my independent sourcemap check below too. The 19 "babel" strings in its output are prettier's parser names (`parser:"babel"`), not @babel code.
* **Can the check fail?** I planted real imports in the scratch `main.tsx`, built the web app and ran the check's own markers on the output:
  * caught: `@babel/parser`, `@babel/traverse`, `socket.io` (server) and `esbuild`;
  * **missed: `chokidar`, `engine.io-parser` and `socket.io-parser`.** All three build for the browser without errors, and the markers find nothing (Major 1).
  * The lockfile checks and the version compare can fail; the compare has a self-test.
  * The import regex covers `export … from`, `export * from`, `import type`, side-effect imports, multi-line imports and `import x = require()`. It misses template-literal `import(\`…\`)`, and some folders are not scanned (Minor 3).
* **Types.** `typecheck.mjs` gives `PASS no new type errors (15 known, 0 fixed)` (web 0 errors). Note: in this sandbox, tsc api ran out of memory on the default heap, so I ran it with `--max-old-space-size=6144`. That is not caused by this PR: `tsc -p api --listFilesOnly` loads no tiptap, react-email or prosemirror file.
* **The extra test file (beyond the touch list).** It is justified. The Done-when asks for "a scripted check", and as a suite it keeps guarding the rule when PF-19s starts importing. The PR body says this openly (no silent deviation).

## Findings
**Blocker:** none.

**Major 1: the browser-build check cannot catch chokidar or socket.io's browser-capable parts** (`tests/check_pfle_libraries.ts:46-51`).
* The markers are literal strings: `/chokidar/`, `/socket\.io|engine\.io/`. Minified chokidar contains neither, and engine.io-parser and socket.io-parser do not contain the literal `engine.io` or `socket.io`.
* The planted sample at line 52 is a made-up string (`chokidar.watch()`), not real bundled code. So the self-test passes even though the rule can be broken unseen, and this Done-when line exists to guard PF-19s's import.
* **Fix:** build into the temp folder with `--sourcemap` and test each `.map` file's `sources` against `node_modules/(socket\.io[^/]*|engine\.io[^/]*|@?esbuild|chokidar|readdirp|@babel/[^/]+|prompts)/`.
  * I ran exactly this. It finds chokidar (plus readdirp), engine.io-parser and prompts when they are planted.
  * It is empty for main's web app, and empty again with `EmailEditor` imported.
* Make the self-test plant a real import, or a `.map` with such a source path.

**Major 2: merge gate, P-610 (1).** `pr-rules` is red on c2e67a341: "REFUSED: 4074 changed lines, over 800 (P-610 (1))". The lockfile makes up most of that count. The PR body has no `Size exception:` line.
* **In flight:** Lead B's PR comment says the exception now exists as **P-631** ("generated lockfile lines in a libraries-only PR do not count toward P-610's 800"). It reaches main with records PR #1917, which is not merged yet: P-631 is on neither `origin/main` nor `lead-b-front-office` at the time of this review.
* **Fix:** add `Size exception: P-631` to the body and re-run `pr-rules` after #1917 merges. This closes the Major. It is a body edit, so it needs no re-review of the code.

**Minor 1: the gate addendum and the PR body say "none changed or removed". That is not exact.**
* 54 existing entries drop `dev: true` (42: esbuild, its 26 `@esbuild/*` platform builds, glob, minimatch, lru-cache, tailwindcss, …) or `devOptional: true` (12: chokidar, readdirp, @types/react(-dom), ajv, semver, …).
* Versions and integrity are unchanged, but these packages are now production dependencies. Today's Dockerfile runs a full `npm ci` (line 36), so this has no effect yet. It matters for the pruned image that Dockerfile line 18 leaves to PF-8.
* Lead B has accepted the flag changes (PR comment 6906158629), and names "the browser-bundle check" as their guard, which makes Major 1 matter more.
* **Fix:** say it in the addendum. While I was reviewing, an uncommitted edit of the gate file appeared in this working tree that lists the 54 entries. I did not review it, because it is not commit c2e67a341. Once it is committed, the next diff-only round checks it.

**Minor 2 (wording):** the addendum says "entries 15–17 above", but they are below it (§15–§17). It also says glob is used by react-email's "CLI and file walking on the server", but only `dist/cli/index.mjs` imports it. **Fix:** "below"; "used only by react-email's CLI".

**Minor 3: the import scan's reach** (`check_pfle_libraries.ts:68-70`).
* It skips `tests/`, `deploy/`, `prisma/`, `web/*.ts` (for example `vite.config.ts`) and `../contracts`, which the web app imports (`../../../../contracts/…`).
* Its extension pattern misses `.cts`, and the regex misses backtick dynamic imports.
* **Fix:** walk the studio tree (skipping node_modules, dist, var, evidence and this file) plus `../contracts`; use `/\.c?m?[jt]sx?$/`; allow a backtick quote.

**For PF-19s (not a finding here):** importing `EmailEditor` raises the web bundle from 1.89 MB to about 4.2 MB. That is `index` 2.88 MB, `code-block-email` 0.62 MB (prismjs languages), `server.browser` 0.19 MB and prettier's `standalone` and `html` 0.24 MB. Weigh it against STANDARDS §9 when the editor lands (for example, load the editor only on its own route).

## Open on the PR (not findings against this commit)
* The PR is a draft. ci/shard/types/packs were skipped on c2e67a341; only guard and module-cards are green. "`npm ci` and every suite pass unchanged" therefore waits on CI (the lockfile change selects all suites).
* I did not run the database or browser suites. Nothing imports the packages and no existing version moved, so they cannot change behaviour; CI is the check.
* Any new head needs a diff-only re-review (P-277).

**Verdict: Changes requested** (commit c2e67a341).
* Blockers: none.
* Majors: 1 (the bundle check misses chokidar and socket.io's parsers; switch to sourcemap sources) and 2 (pr-rules size gate red; add `Size exception: P-631` once #1917 merges).
* Minors: 1 (the dev-flag changes are not stated), 2 (wording: "above", glob), 3 (the import scan's reach).
