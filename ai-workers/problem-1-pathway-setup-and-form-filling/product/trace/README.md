# Requirement trace (TR-1, P-595)

No PRD: each Release 1 BACKLOG row carries a `Source:`, and `tools/trace-requirements.py` cuts briefs, flags changed
requirements, lists gaps and conflicts, and renders the mapping into `MVP-CHECKLIST.md` §A. Ids and hashes only in git
(P-504); the requirement text is printed to the terminal, never committed. Standard library only (P-502). US$0.

## The line for briefs (row part 4)

> Cite your row's Source ids; read only the text `trace-requirements.py --brief <row>` prints.

For the Lead: add it to the brief rules in `RULES.md` (the line "every brief says …"); it is also printed at the top of
every `--brief`.

## `Source:` in a row

In the row's last cell (or any line of the row), ended by ` · ` or the cell's end:

```
Source: AG-2-4#9c2d4c90, AG-2-5#71f35252, P-566; official: laws-lois.justice.gc.ca SOR/2022-128 s. 24(3), 2026-11-13; deviates SA-4-4 by P-566
```

* `AG-2-4#9c2d4c90`: a team requirement id and the hash of its text in the newest `../domain/requirements-*/`
  (get it with `python3 product/tools/trace-requirements.py --hash AG-2-4 AG-2-5`).
* `P-566`: a founder decision. `official: <page>, <date>`: an official source with page and date.
* `deviates <id> by <P-id>`: the row deliberately does not build that requirement as written; `--gaps` lists it for
  the founder.
* Until a row owner writes them into the row, `trace/sources-seed.tsv` (row, ref, hash) holds Sources too (now
  FO-1a, FO-1b, FO-2, FO-3, FO-5; Lead 51's ruling, so this branch edits no BACKLOG row).

## Commands (from the repository root)

```bash
python3 ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/trace-requirements.py --brief FO-2
```

* `--brief <row>`: only that row's requirement text (each id's whole definition: its heading section, list item or
  table row in the module's own file), with a CHANGED or WITHDRAWN note when the text moved since the row was mapped.
* `--refresh <old> <new>` (folders or dates, e.g. `2026-10-19 2026-11-02`): added, removed, renumbered (same text, or
  90%+ alike in the same module) and changed ids, each with the rows it hits.
* `--gaps`: Release 1 rows shaped with no Source; checklist rows not shaped (unmapped); team ids no row covers, by
  module; to the founder: a row following an id a P-decision deviates from, declared deviations, struck-through
  P-ids; Source problems (stale hash, unknown id, undated official source).
* `--render [--check]`: the generated block in `MVP-CHECKLIST.md` §A between the `trace-requirements` markers
  (never hand-edited; deterministic, so twice gives no diff). Its headers differ from the hand tables', so
  `cockpit-data.py` and `cockpit-reconcile.py` never count its rows.
* `--ci <base ref or file>`: exit 1 when a Release 1 row shaped since the base has no Source (the CI step,
  `ci-step.yml.txt`, for the Lead to add, P-423).
* `--hash <id>...`: each id's current hash and where it is defined.

Release 1 rows: ids starting PF, FO, CS, AUD, MON, plus every row named in the checklist's §A "BACKLOG rows" column
(BK, AS). Shaped: the row's main line has a filled "Done when" cell (not "as X"). A requirement is defined only in its
module's versioned file (`AG-02-…_v2.6_….md` for AG-2-*); decision logs and hand-overs beside it are not homes. Its
hash: sha256 of the definition with whitespace collapsed and its own id(s) replaced by `<ID>`, first 8 hex digits.

Tests: `python3 -m unittest product/tools/test_trace_requirements.py` (fixture `tools/fixtures/trace/`, synthetic).

## Record: first runs (15 Nov 2026, branch `tr-1/trace-requirements`)

**`--refresh 2026-10-19 2026-11-02`:** ids 2154 → 2399; added 245 (SA-1B 119, AG-6 27, AG-2 25, AG-19 20 (the
PDF Studio module is new), AG-5 11, 43 more across 12 other modules); removed 0; renumbered 0 (the team's rule: "Requirement IDs are
permanent"); changed 617 (most in the rewritten AG-2, AG-4, AG-5, AG-6 and SA-1B); rows hit 5 (FO-1a, FO-1b, FO-2,
FO-3, FO-5: every seeded id's text changed between the two snapshots, so the seed hashes are 2 Nov's).

Spot-checked by hand against the files (grep and diff on the raw markdown, not the tool):

| Id | Tool says | In the files | Right |
|---|---|---|---|
| AG-1-70 | changed | 2 Nov adds a "Send path" sentence (25 Oct copy-on-emails knock-on) | yes |
| AG-1-4 | changed | the X-6 default-currency edit (22 Oct), 2 KB of diff | yes |
| AG-9-4 | changed | 2 Nov moves multi-page capture to phone scan (22 Oct, AG19-D10) | yes |
| AG-4-25 | changed, hits FO-1b, FO-3 | 19 Oct: a one-line list item; 2 Nov: a heading section shared with AG-4-26, AG-4-27 | yes |
| AG-1-1 | unchanged | the list item is byte-identical in both | yes |
| AG-19-1 | added | no AG-19 file and no mention of AG-19-1 in 19 Oct | yes |

**`--gaps` on BACKLOG at `lead/2026-11-07-lead31` dd13b636:** Release 1 rows 91; with a Source 5; shaped with no
Source 84; checklist rows not shaped (unmapped) 43; team ids in force 2320, no row covers 2264; to the founder 0;
Source problems 0.

**`--brief FO-2`:** 56,391 bytes against AG-02's 1,424,666 (4.0%): AG-2-4, AG-2-5, AG-2-84, AG-2-80, AG-2-49,
AG-13-30.
