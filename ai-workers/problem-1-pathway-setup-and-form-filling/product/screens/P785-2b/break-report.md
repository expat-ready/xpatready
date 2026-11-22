# Break report: PR #2971, check-mergify-scopes.sh (path owners follow-up + one source)

Commit 71d225edd, diff against 9ddd8bdd6, script only. Breaker, 22 Nov. Throwaway copy, nothing committed. Baseline `bash product/tools/check-mergify-scopes.sh` gives `PASS  mergify scopes: 300 checks`, exit 0. Each attack below was one edit, run, then restored.

**Verdict: Changes.** There is one Major: the self-test no longer guards the "unknown module folder" refusal. There are seven Minors. Nothing is wrong on today's config, and #3006's list is caught as intended.

## Findings

**M1 (Major): the "names no area" refusal can be deleted and the self-test stays green.**
- **Edit** (line 84): `want = FOLDERS.get(area, "")` becomes `want = FOLDERS.get(area)`. A second version, `if want is None:` becoming `if not want:` at line 85, behaves the same.
- **Result:** the run gives `PASS 300 checks`, exit 0. With that edit, a new `web/src/modules/billing/page.tsx` (`git add -f`) also gives PASS, exit 0. Unedited, the same file correctly gives `FAIL path owners: web/src/modules/billing/ names no area`, exit 1.
- **Cause:** the diff removed the base self-test rows `web/src/modules/_money/x.tsx` and `web/src/modules/client money/x.tsx` (base line 116). They were the only rows that added a folder missing from FOLDERS. Now that `None` means "skip", a one-word edit can turn the guard off.
- **Why it matters:** the comment at lines 106–107 says this self-test stands in for mutation testing. Without the guard, a builder lane's new module folder lands in no scope. It is then batched with every scope-less PR, which the design calls its largest cross-scope risk, and that can happen across about 14 lanes.
- **Smallest fix:** a self-test row stating that `owners_bad(src, files + [ST + "web/src/modules/billing/x.tsx"])` contains "names no area".

**m2 (Minor): a `None` entry is not checked at all.**
- **Edits to FOLDERS:**
  - `"forms": None, "forms-engine": None`, or `"money": None`, gives PASS, exit 0. With `"forms": None`, a new `web/src/modules/forms/page.tsx` in no scope also passes.
  - `"billing": None`, with `web/src/modules/billing/**` added to both platform and case-side, gives PASS, exit 0. So "left out of every scope" is never verified.
- **What is caught:** only `"case-side": None` (self-test row line 119) and client-money (row 123).
- **Fix:** refuse a `None` for any name that is in `OWN`/`src` or is an alias of an area. For a `None` folder, add a "no scope holds it" check (`other` must be empty).

**m3 (Minor): `_` folders are trusted by name.**
- **Attacks:** a new `web/src/modules/_platform-pages/page.tsx` gives PASS, exit 0. A new `web/src/modules/_cases/routes.tsx` gives PASS, exit 0.
- **Why it matters:** the README and modules.tsx:28 drop only `_*/routes.tsx` from the default build. A real module can still import other files from a `_` folder, and those ship in the bundle.
- **Fix:** skip only folders that hold nothing but `routes.tsx`/fixtures, or list the fixture folders by name (`_example`) and refuse other `_` folders.

**m4 (Minor): the other new rules can each be gutted with the self-test green.** Each edit gives `PASS 300`, exit 0, and the real violation shown then passes too:
- **(a) money / front-office exception restored** (line 79/80): `if twice and not (scope=='money' and twice==['front-office'])`. With `tests/check_fo7*` added to front-office: exit 0. Unedited: `FAIL ... money (tests/check_fo7) are also in scope(s) ['front-office']`.
- **(b) second-scope rule limited to tests** (line 78): `pat.startswith("tests/")` only. With `api/src/features/platform-*.ts` added to front-office: exit 0. Unedited: FAIL.
- **(c) pipeline exempted** (line 79): `k not in (scope,"pipeline")`. With studio `tests/**` added to pipeline: exit 0. Unedited: FAIL on platform, front-office and money.
- **(d) named-feature rule loses migrations/pipeline** (line 102): `k not in (scope,'migrations','pipeline')`. With `features/clients.ts` added to pipeline: exit 0. Unedited: `FAIL ... clients.ts belongs to scope case-side and is also in scope(s) ['pipeline']`.
- **(e) one source refuses only tests copies** (line 227): `if g in own and '/tests/' in g`. The demo contains only `tests/` copies, so nothing notices.
- **Fix:** one row per edit, i.e. fo7 in front-office, `features/platform-*.ts` in front-office, `check_pf*` in pipeline, `clients.ts` in pipeline, and an `api/src/features/...` copy in the demo.

**m5 (Minor): the one-source wiring is never tested.**
- **Edit:** with #3006's `track-paths.txt` in place and staged, change line 229 from `track-paths.txt")` to `track-path.txt")`, or change line 230 to `if False and ...`.
- **Result:** PASS 300, exit 0. Unedited, the run gives 8 FAILs, exit 1.
- **Why it matters:** the rule is dormant whenever the file is missing. If #3006 renames or moves the file, or a typo creeps in, the rule goes quiet forever and nothing turns red.
- **Fix:** if `track-route.py` exists then `TP` must exist, or run `track_copies` on the real file plus one planted copy line.

**m6 (Minor): copies that are spelled differently but match the same files get through.**
- **Result:** with a track list of `prefix <studio>/`, `track-a scope:platform`, plus one line, each of these passes (exit 0):
  - `track-a web/src/modules/platform/**/*`
  - `.../platform/**/**`
  - `tests/check_pf**`
  - `tests/**/check_pf*`
  - `/.github/**/*`
- **Confirmation:** with #3006's `glob_rx`, each matches exactly the files of the scope pattern: 48/48, 48/48, 76/76, 76/76 and 23/23. These are true second copies, and they can drift.
- **Not evasions:** `./tests/check_pf*` and `tests/check_PF*` match 0 files in track-route, so they are dead lines rather than copies (track-route only warns).
- **Also missed:** `ambiguous()` is never applied to track lines, so `check_pf**` is not refused.
- **Fix:** refuse a raw line whose set of matched tracked files equals that of some scope include, and apply `ambiguous()` to track globs.

**m7 (Minor): `!` lines and scope sharing are not checked.**
- `track-a scope:platform` plus `track-a !api/src/platform/**` passes (exit 0). The `!` line is a verbatim copy of platform's pattern and hollows out the `scope:` line.
- `track-a scope:case-side` with `track-b scope:case-side` passes (exit 0). As a result every case-side PR touches both tracks and falls to "product". Neither this check nor `track-route.py check` notices.
- **Fix:** refuse a `!` glob that is a scope include, and refuse the same `scope:` in two tracks.

**m8 (Minor): legitimate input is refused, and some errors are not printed as FAIL lines.**
- **(a)** `track-b api/src/clients.ts` gives `FAIL one source ... write 'track-b scope:case-side' (or name a sub-folder)`, exit 1. Case-side has about 30 single-file includes. A track cannot claim one of them alone, and the advice given in the message cannot be followed.
- **(b)** A legal YAML override (`capacities: {<<: *caps, pipeline: 1}` with `pipeline` already in `caps`) or a merge list `<<: [*c1, *c2]` with overlapping keys gives `FAIL .mergify.yml gives the key 'pipeline' twice`, exit 1. YAML defines the explicit key, or the first one, as the winner, so this config is legitimate.
- **(c)** Two `<<:` keys in one mapping with disjoint keys give PASS, exit 0. That is a key given twice, which the rule promises to refuse, and other parsers reject it.
- **(d)** `<<: *scalar` or a list used as a key crashes with a Python traceback on stderr (exit 1). It fails closed, but contrary to point (4) of this PR there is no FAIL line on stdout.
- **(e)** The demo self-test at line 234 depends on the real `src`. Adding `check_pf*` to migrations also yields a misleading `self-test: a track list repeating scope patterns is not caught exactly`.
- **Fix:** allow a raw line equal to a single-file include. Refuse `<<` given twice before flattening and allow a merged key that is overridden. Catch `yaml.YAMLError` into a FAIL line. Build the demo from a fixed scope dict.

## What held (exit 1 with the right FAIL unless noted)
- **#3006's list, placed and staged:** exactly the 8 copies are flagged, at lines 22, 29, 30, 31, 41, 42, 43 and 44. The sub-folder lines (`front-office/sales/**`, `platform/files/**`), `!api/src/platform/files/**` and `scope:` lines pass. Note that #3006 as written goes red once both PRs are on main, which is the intent.
- **One-source evasions that were caught:** the `/` root form, trailing spaces, a tab plus a `# comment`, CRLF, a trailing NBSP, a double space, a different `prefix` line (`studio/tests/check_pf*`), and a root pipeline pattern `/.github/**`.
- **Second scope:**
  - `check_pf*` in migrations, `**/check_pf*` in pipeline, studio `tests/**` in pipeline, and `check_fo7*` in front-office are all caught.
  - `features/platform-*.ts` in front-office and `features/*.ts` in platform are caught.
  - `features/clients.ts` in pipeline and `features/answer-keys.ts` in migrations are caught.
  - `web/src/modules/**` in pipeline is caught.
- **New test files:** a new `tests/check_FO7_x.ts` is reported as not held by money. A new unknown module folder is refused (unedited).
- **YAML:** a plain merge, a nested merge, a plain duplicate, a nested merge that creates a duplicate, and a duplicate scope merged into `scopes.source.files` are all handled correctly. Removing `flatten_mapping` (line 29) is caught, because the merge self-test row crashes.
- **Self-test catches these guts:** `"case-side": None`, skipping any folder containing `_` or `-`, and dropping the one-source root form or prefix.

Out of this diff, noted only: feature folders (`api/src/features/case-foo/index.ts`) are owned by no one and pass. Scope `exclude:` lists are ignored by the whole script.

## Round 2: commit 2383b5303 (diff against 71d225edd, script only)

Breaker, 22 Nov. Throwaway copy, nothing committed, each attack restored. Baseline run gives `PASS  mergify scopes: 196 checks`, exit 0. With #3006's `track-paths.txt` + `track-route.py` placed and staged, the run flags the same 8 lines (22, 29, 30, 31, 41, 42, 43, 44), exit 1. The check count fell from 300 to 196 only because the glob loop now counts as one check.

**Verdict: Changes.** There is one Major: the file-set comparison makes a builder's app PR fail over the track list. There are six Minors.

### Round-1 findings replayed
- **Now fail as they should:**
  - M1: `FOLDERS.get(area)`, or `if not want`, gives `FAIL self-test: a new web module folder that names no area`, exit 1.
  - m2: partly fixed (see R2-m1). `"forms": None` fails its self-test row. `billing: None` held by platform and case-side gives `... recorded with no scope, yet scope(s) ['case-side', 'platform'] hold it`. A `None` for `pipeline` gives "is an area".
  - m3: `_platform-pages/page.tsx` gives "names no area".
  - m4 a–d: real violations are still refused even with each gut in place, because the new loop at lines 103–107 holds every test and feature file to one scope. Removing that loop fails its own row (`visitor-visa-filings.ts`).
  - m4e: caught by the demo row.
  - m5: with a typo in `TP` and #3006's files present, the run gives `track-route.py exists but track-paths.txt does not`, exit 1.
- **Respellings (m6), `!` copies and two tracks per scope (m7):** `**/*`, `**/**`, `check_pf**`, `tests/**/check_pf*`, `/.github/**/*`, `check_pf*.*`, `!api/src/platform/**`, its `!/` root form, `!…/platform/**/*` and `scope:case-side` named in both tracks are all refused. A legitimate sub-folder line and the money split (`invoices/**` and `tax/**`) pass.
- **m8:**
  - (a) one file of a scope in the other track: now passes.
  - (d) a YAML syntax error, a scalar merge and a list used as a key: now print `FAIL .mergify.yml cannot be read as YAML: …`, exit 1.
  - (b) merge override: now passes, as intended.
  - (c) two `<<:` keys: still pass, left as agreed.
- **Gutting the new rules is caught by the self-test:** `_` by name only, the AREA_NAMES test dropped, the held test dropped, one scope per track relaxed to `> 2`, the exact-file exemption removed, the set comparison turned off. Each gives exit 1 with its own row.

### New findings

**R2-M1 (Major): the file-set comparison (lines 241–242, 259–260) makes an unrelated app PR fail over the Lead-owned track list.**
- **Run:** `fast.py` executes the script's own functions; `rx` is cached, which does not change any result.
  - Today, `track-b tests/check_fo6_signing_port*` passes.
  - Remove `tests/check_fo6_signing.ts` from the file list, as a front-office PR deleting that test would. The same line then gives `FAIL one source: ... matches exactly the files of scope front-office's pattern tests/check_fo6*`.
  - The natural line for #3006's signing split, `track-b tests/check_fo6_signing*`, is refused today. Both fo6 tests happen to start with `signing`. The advice to "name the scope or a sub-folder" cannot be followed for test files, and the line would pass again as soon as someone adds `check_fo6_other.ts`.
- **Why it matters:** the outcome depends on the file count, not on what the line intends. A builder lane's delete or rename PR, or a batch carrying one, goes red over a list it does not own. `track-route.py:110` deliberately made this kind of failure a WARN (its review M1, "an app PR that deletes a file must not turn ci red over a Lead-owned list").
- **Smallest fix:** keep exact text, the `/**/*` normalisation and `ambiguous()` as FAILs. Print equality of matched file sets as a WARN only, or apply it only when `track-paths.txt` itself changes.

**R2-m1 (Minor): AREA_NAMES (line 72) is built from FOLDERS itself, so a `None` on an alias with no sibling erases that alias.**
- **Edit:** `"cases": None` in the FOLDERS literal.
- **Result:** PASS, exit 0. Adding `web/src/modules/cases/page.tsx` in no scope also passes, exit 0. `client-money: None` is caught only by an unrelated row ("only partly in money").
- **Also:** `"platform-admin": None` with a `platform-admin/` folder passes. The name says platform, but the check cannot know.
- **Fix:** write AREA_NAMES as a separate literal (`platform, front-office, client-money, money, case-side, cases, forms, forms-engine`), add one self-test row per alias, and refuse `None` for `<area>-*` names.

**R2-m2 (Minor): the exact-file exemption lets a scope's file list be copied.**
- **Result:** case-side's 41 single-file includes, copied verbatim into track-a, pass. `track-b scope:case-side` plus `track-b api/src/clients.ts`, a pure redundant copy, also passes, and demo2 (line 305) asserts that it passes.
- **Fix:** exempt a single-file line only when another track names that file's scope (the split case), and refuse it when its own track names that scope.

**R2-m3 (Minor): the check is now five times slower.**
- **Timings:** 5.0 s at 71d225edd becomes 25.2 s on this commit while the rule is dormant, and 41.9 s with #3006's list (this machine, CPU shared with another session).
- **Cause:** cProfile shows `rx()` rebuilt 713,476 times inside `track_copies` (lines 241 and 259, once per file × pattern), which is 103 of 123 profiled seconds. demo2 alone triggers it on every run.
- **Impact:** the run is on every PR and batch in jobs "fast" and "ci", and the step's name says "seconds".
- **Fix:** add `@functools.lru_cache` on `rx`, or compile once per glob. With the cache, the same run takes 7.0 s.

**R2-m4 (Minor): the `_` rule (line 88) also accepts nested `routes.tsx` files.**
- **Result:** `_cases/routes.tsx` plus `_cases/sub/routes.tsx`, or `_shared/deep/routes.tsx` alone, gives PASS, exit 0.
- **Why it matters:** Vite's exclusion covers only `modules/_*/routes.tsx`. A nested `routes.tsx` is never globbed, and if a real module imports it, it ships.
- **Fix:** skip the folder only when `mine == [<modules>/<area>/routes.tsx]`.

**R2-m5 (Minor): four guts still pass with the self-test green.** Each gives exit 0:
- `if os.path.exists(TP): pass` (line 267), with #3006's files present. The real file is never checked.
- The real-file call made without `files`. Respellings in the real list would then pass.
- `ambiguous()` turned off for track lines. A non-copy such as `api/src/{a,b}.ts` would no longer be refused.
- The `except yaml.YAMLError` branch removed.
- **Fix:** move the wiring into a function and test it on a temporary file holding one respelled copy. Add a row for an ambiguous non-copy track glob and a row for `load_once("a: [")`.

**R2-m6 (Minor): read errors other than YAML errors still crash.**
- An empty `.mergify.yml`, a top-level list (`AttributeError`) and a non-UTF-8 byte (`UnicodeDecodeError`, line 40 opens the file without an encoding) each print a traceback on stderr, exit 1. They fail closed but print no FAIL line.
- **Fix:** add `isinstance(cfg, dict)`, and open with `encoding="utf-8"` inside the `try`.

Nit: the FAIL text now says `'track-a scope:<name>'` even when the scope is known; round 1 printed `scope:platform`.

### Held in round 2
- The `./` and case-changed forms are dead lines (they match 0 files), not copies.
- `tests/check_p*` and `/**/check_pf*` are supersets that match other files, and pass as such.
- A scope pattern that matches nothing is kept out of the comparison (`if m:`).
- The same scope named twice by one track passes.
- A plain duplicate key is refused. A merge override and merge lists pass.

## Round 3: commit 5e1248808 (diff against 2383b5303, script only)

Breaker, 22 Nov. Throwaway copy, nothing committed, each attack restored. Baseline run gives `PASS  mergify scopes: 199 checks`, exit 0, in 8.3 s. With #3006's list placed and staged, the run flags the same 8 lines, exit 1, in 9.1 s.

**Verdict: Changes.** There is one Major, and its fix is one line: a self-test now ties every PR to the layout of `tests/`. There are four Minors.

### Round-2 findings replayed
- **R2-M1 fixed.** `track-b tests/check_fo6_signing*` is now a WARN only. So is `check_fo6_signing_port*` after `check_fo6_signing.ts` is deleted.
- **R2-m1 fixed.** The FOLDERS literal edits `"cases": None` and `"platform-admin": None`, each with its folder planted, give `... is recorded with no scope, but ... is an area`, exit 1.
- **R2-m2 fixed.** Case-side's 41 single-file includes, copied into track-b (which names case-side), give 41 FAILs. The rule is order-blind: a `scope:` line written after the file line, even under a later `prefix`, still gives FAIL. Copied into track-a, the same lines are allowed as a split.
- **R2-m3 fixed.** Runtime is 25.2 s → 8.3 s. `rx` cache info shows 138 misses and 20.0 M hits.
- **R2-m4 fixed.**
  - `_cases/routes.tsx` plus `_cases/sub/routes.tsx` gives "names no area", exit 1, and so does `_shared/deep/routes.tsx`.
  - `_cases/routes.tsx` alone passes.
  - `_example/README.md` now needs a FOLDERS entry.
- **R2-m6 fixed.** An empty file, a top-level list and a non-UTF-8 byte each give a FAIL line, exit 1. Two `<<:` keys, or two `!!merge`-tagged keys, give `gives the key '<<' twice`. A merge list and a merge override pass.
- **R2-m5 partly fixed.** `real_list()` is tested on a temporary file. Removing its `files` argument (WARNs lost) still gives exit 0. The call site at line 286, `bad += fails` changed to `bad += []`, with #3006's files present also still gives exit 0.
- **Held under gutting:**
  - The one-file rule, the two-merge-key rule, `ambiguous()` on track lines and the YAMLError branch each give exit 1. The YAMLError case fails by crashing in the `a: [` row.
  - `rx`'s cache is keyed by the glob string only, and `rx` is pure, so the `mutated()` copies in the self-test cannot see stale patterns.

### New findings

**R3-M1 (Major): the demo2 self-test (lines 322–328) depends on the real files, so an unrelated PR that adds a file turns ci red. No track list needs to exist.**
- **Run:** plant `tests/qa/check_pf3_walk.ts` (qa keeps its own `check_*` files in `tests/qa/`; 145 files today), or `tests/fixtures/check_pf_data.json`, and `git add -f` it.
- **Result:** `FAIL self-test: the one-source FAIL and WARN lines are not exactly as meant (...)`, exit 1.
- **Cause:** demo2 expects `tests/**/check_pf*` to WARN. That holds only while no file named `check_pf*` sits in a sub-folder of `tests/`.
- **Why it matters:** this is R2-M1's mechanism moved into the self-test, and it now fires on every PR even while the rule is dormant. A qa or builder PR is blocked by a message that says nothing about its own files. The commit's own promise is that "a PR … never turns ci red over the track list".
- **Smallest fix:** give demo2 a fixed, made-up file list (for example `files=[ST+"tests/check_pf1.ts"]`) in place of the real `files`.

**R3-m1 (Minor): the one-file rule refuses the `!` carve-out, so the split it allows never routes.**
- **Run:** `track-b scope:case-side` + `track-b !api/src/clients.ts` + `track-a api/src/clients.ts`.
- **Result:** `FAIL ... 'track-b !api/src/clients.ts' repeats a file of scope case-side, which track-b already names`.
- **Why it matters:** without the `!` line, both tracks match `clients.ts`, and a PR touching it falls to "product". The `!` form is #3006's documented way to make a file another track's.
- **Fix:** exempt `!` lines from the one-file rule (line 269), or allow one only when another track claims that file.

**R3-m2 (Minor): `is_area()` (line 78) is too wide in one direction and too narrow in the other.**
- **Too wide:** `"forms-kit": None` (shared widgets, not an area) gives `forms-kit is an area: give it its scope`, exit 1. The only ways out are renaming the folder or giving it a scope.
- **Too narrow:** `"case": None` and `"frontoffice": None`, each with its folder planted, give exit 0.
- **Not tested:** removing the `<area>-*` clause still gives exit 0, because there is no row for it.
- **Fix:** add a row for `platform-admin: None`, and an explicit allow-list for `<area>-*` folders that are deliberately scope-less.

**R3-m3 (Minor): some true copies now only WARN.**
- `…/platform/**/**`, `/.github/**/**` and `tests/check_pf*.*` give WARN only. `dir/**/**` always names the same files as `dir/**`.
- **Fix:** normalise `/**/**` to `/**` next to `/**/*` (line 267), so these stay FAIL.

**R3-m4 (Minor): gutting these still passes, and some YAML shapes still crash.** Each gut gives exit 0:
- The call site at line 286 (see R2-m5).
- The not-a-mapping check; an empty file then crashes with a traceback.
- WARN printing removed.
- `encoding="latin-1"`.
- Same-track redundant sub-parts, `track-b api/src/case-clients/live.ts` or `track-a api/src/platform/files/**`, pass. These are the general form of R2-m2.
- **YAML shapes still crash with tracebacks** (exit 1, fail closed): `scopes: [x]`, an include entry `[a, b]` (`TypeError: unhashable`, now raised from the cache), and an include entry `5`.

### Answers to the round-3 questions
- **Can a real copy hide as a WARN?** Yes, the forms in R3-m3.
- **Does a deleting PR still turn ci red some other way?**
  - Yes, through R3-M1 (for an adding PR).
  - Outside this diff: the "every scope pattern matches a tracked file" check fails if someone deletes `tests/check_case_feed.ts` or `tests/check_fo8_prospect_won.ts` (each the only match of its pattern). The `without("case-side", "tests/check_case_")` self-test row fails too.
- **Order of `scope:` lines:** no effect (held).
- **Temporary-file self-test:** works, but it does not pin the call site.
- **lru_cache:** sound.
- **YAML:** a BOM loads fine. Two `<<` keys, whether written plainly or as `!!merge` tags, are refused. A quoted `"<<"` key beside a merge passes, as plain YAML reads it.
