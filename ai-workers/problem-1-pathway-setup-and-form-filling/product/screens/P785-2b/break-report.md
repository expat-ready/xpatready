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
