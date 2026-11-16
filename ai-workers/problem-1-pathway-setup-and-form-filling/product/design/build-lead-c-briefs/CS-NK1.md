# Brief: CS-NK1, the database's field-name key matches the app's rule for every script (bug row; cloud builder lane; row owner Build Lead C)

Written 16 Nov 23:0x IST by Build Lead C, at Lead 70's request. **New bug row, shaped here.** Found by CS-SD1's breaker (#2017, `screens/CS-SD1/break-report.md` F2: **Major, on `main`, not caused by #2017**). Configurator group (map row 84, shared-field names; BR-6). It guards R1.84's proven names rule against a race.
**PR title:** `migration — runtime: CS-NK1 — the shared-field name key in the database equals normalizeLabel for every script`
**Model: Opus 5.5, effort: high** (schema functions, a backfill of a uniqueness key). Decisions: BR-6 (names equal "ignoring case, spaces and punctuation", `contracts/programs.ts` `normalizeLabel`), P-600 (d), P-278, P-423; the 25 Oct design note in `20261025100000_field_name_unique`: "the database never refuses what the app's own rule allows".
**Ready when:** **now.** No lane holds `canonical_field_name`'s functions. CS-SD1 (#2017) only adds an `@@ignore` model for the table, with no migration, so stamp this migration later than every one on `main` and merge `main` if #2017 lands first. The configurator group has nothing waiting for qa, so the WIP limit does not stop it.

**The defect (break report F2, reproduced there):**
* The app compares names with `normalizeLabel`: NFKC, then `toLocaleLowerCase("en-CA")`, ignorable code points dropped, then everything but letters, numbers and marks (`[^\p{L}\p{N}\p{M}]+`) removed.
* The database reserves names with `canonical_field_name_key`. ASCII names keep only `[A-Za-z0-9]` and are lower-cased, which matches. **Any non-ASCII name** is only space-tidied and `lower()`ed under the database's C collation. That keeps punctuation and leaves `Ñ` upper case.
* Run one after the other, the app refuses the second name (409). At the same moment, both pass the app's check and the index lets both in: `"Café-crème name"` and `"Café crème name"` in one group.

**The fix:** make the database key **equal** to `normalizeLabel` for every input, so the index refuses exactly what the app refuses, no more and no less. Pick the narrower of these two and say why in the PR:
* **(A) SQL function:** replace `canonical_field_name_key` (`CREATE OR REPLACE`, same name and signature, so the trigger is unchanged) with `normalize(label, NFKC)`, a Unicode-aware lower case (a collation that exists on PG17+, such as `pg_unicode_fast` or ICU `und-x-icu`; check which the database has), removal of default-ignorable code points, and removal of everything but letters, numbers and marks. Take it only if the corpus test (DW1) proves the two keys equal on every case. PostgreSQL's regex has no `\p{M}`, so prove the marks cases.
* **(B) App-written key:** if (A) cannot be made exactly equal, the app writes the key. A `name_key` column on `canonical_field` is filled from `normalizeLabel` by every writer, the database refuses a NULL, and the trigger copies it. Take this only if (A) fails DW1, because it touches every writer of `canonical_field` (list them in the PR).

**Backfill:** recompute `name_key` for every existing row in the same migration. A row whose new key collides with another in its group gets `''`, exactly as the 25 Oct migration did for legacy duplicates. The migration lists those rows in a NOTICE, and the PR body pastes the list from the demo data. No row is deleted or renamed.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-NK1` and take this one bug row end to end on a fresh branch from `origin/main`, one PR.

**Read only these:** `contracts/programs.ts` `normalizeLabel` and `cleanLabel`; migrations `20261025080100_field_name_default` and `20261025100000_field_name_unique`; `api/src/rename-door.ts` lines 60-160; `api/src/rule-facts.ts` line 243; #2017's break report section (c), for the race recipe.

**Touch (nothing else):** one new migration folder. For (B) only, also `prisma/schema/library.prisma` (one column) and the writers of `canonical_field` (list them). New `tests/check_csnk1_name_key.ts`.

**Done when** (P-606), in `tests/check_csnk1_name_key.ts`, a pass and a fail each:
* **CS-NK1 DW1 (equality):** on a corpus, the database key (`SELECT canonical_field_name_key($1)`, or the stored key for (B)) equals `normalizeLabel` for every case. The corpus covers ASCII names with punctuation and spacing variants, accented Latin (`Café-crème`, `ÑOMBRE`), German `ß`, a Turkish dotted `İ`, full-width characters (NFKC), Hindi and Thai with combining marks (`किसान` is not `कसान`), Arabic, CJK, emoji, a zero-width joiner and a right-to-left mark. Fail case: the 25 Oct function gives a different key on at least the `Café` and `Ñ` cases.
* **CS-NK1 DW2 (the race):** two renames at the same moment to `"Café-crème name"` and `"Café crème name"` in one group: exactly one succeeds and the other answers 409 "already exists". Run it 20 times. Fail case: the same race on the old function lets both in.
* **CS-NK1 DW3 (never stricter):** a name the app allows (`normalizeLabel` different from every other in the group) is never refused by the index, including names that differ only by a combining mark.
* **CS-NK1 DW4 (backfill):** after the migration, every row's `name_key` equals its label's `normalizeLabel`, or `''` for a listed legacy duplicate. Run once more, the backfill changes nothing.
* The rename-door, rule-facts and library suites, `check_prisma_schema.ts`, `check_cssd1_no_drift.ts` (if merged), demo reset and checkpoint load pass unchanged; full `ci` green.

**Review:** Opus reviewer **and breaker** (schema, a uniqueness guard; P-278). The breaker runs DW2 with 50 parallel renames across scripts, a name that is only punctuation, a 120-character name, and a rename back and forth in one transaction. **The Lead reads the migration before the label** (P-600 (5), P-423).

**Holds / parallel safety:** `canonical_field_name_key` and the backfill. `library.prisma` only under (B): then you take the configurator's baton and tell CS-D7c's lane.

**Duplicate check:** BACKLOG (`normalizeLabel`, `canonical_field_name`, `BR-6`), BUGS (search "name" and "Café"), open PRs (`rename-door`, `library`). Add one `Duplicate check:` line to the PR.

**Note:** CI is saturated (Lead 70, 23:0x IST). Keep the PR a draft until the reviewer approves the head, then mark it ready once.

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label, run on `main` merged into your branch the suites of every CI part red on any earlier head plus every suite sharing your shard's demo database, and paste the result lines. **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files the draft brief names and the code you change (P-556).
