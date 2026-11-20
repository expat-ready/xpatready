# CS-NK1 break report: the shared-field name key (`canonical_field_name_key`)

Breaker (Opus 5.5), 17 Nov 2026. Branch `claude/runtime-csnk1`, exact commit `91f92691ad1d854b4afeadafa11be4e682a70b13`.
Scope: the brief's "Done when" and breaker list, plus the extra attacks the Lead asked for. Nothing in app code or the
migration was changed. Isolated copy `runtime_csnk1b` on :4639 (database `xr_studio_runtime_csnk1b`), PostgreSQL 18.3,
Node 24.21. Scratch database `xr_studio_csnk1b_old` (every migration before `20261117123500`, then this one). Both are
dropped now. All names are Sample.

**Verdict: no Blocker, no Major.** The fix does what it says on the brief's corpus, on every single code point and under
50-way races. Five Minor findings follow. F1 and F2 are cases where the two keys still differ (the database is stricter
in some and looser in others). F3 to F5 are edges of the `''` key and of the backfill. F3 was already on `main`.

## Findings

**F1, Minor: a capital sigma at the start of a name, after punctuation or another case-ignorable character, gets a
different key (the database is both stricter and looser).** For 2,526 code points X (`'` `.` `:` `^` `` ` `` soft hyphen,
`·`, modifier letters, combining marks…), `X+"Σ"` gives `ς` in the database but `σ` in `normalizeLabel`. With a cased
letter before X (`"Α X Σ"`) the two keys agree, except for the 54 residual cases the builder listed.
* Stricter, through the API (rename door): rename field 1 to `'Σ' <u>` (200), then rename field 2 to `ς <u>`. The app
  keys differ (`σu` and `ςu`), so the app allows it. Expected 200. Actual **409** "is already a field's name in this group".
* Looser: `.Σ. <u>` and `Σ <u>` are equal under `normalizeLabel`. One after the other: 200 then 409 (held). At the same
  moment: **both 200 in 10 of 10 runs**, which is the defect class this row fixes.
* The builder's listed residual is also stricter, not only looser: `"ΑΣ𖺠"` and `"Ας𖺠"` (U+16EA0) differ in the app
  (`ασ𖺻` and `ας𖺻`) but are equal in the database.
* Why DW1 missed it: `tests/check_csnk1_name_key.ts:91` tests a sigma only after `"ΑΣ"`, never at the start after a
  case-ignorable character. The cause looks like PostgreSQL 18's Final_Sigma check reaching the start of the string.
  Real field names rarely start with `'Σ`, so this is Minor. But it is a counterexample to DW3's "never".

**F2, Minor: PostgreSQL 18 does not reorder 34 Unicode 17 combining marks, so the database is looser for them.** The
marks are U+1ACF–1ADD, U+1AE0–1AEB, U+10EFA–10EFB, U+1E6E3, U+1E6E6, U+1E6EE, U+1E6EF and U+1E6F5. PostgreSQL 18 uses
Unicode 16 and has no combining class for them, so `normalize(…, NFKC)` keeps their order. Node does reorder them.
* `"a᫏̴ <u>"` and `"a̴᫏ <u>"` are equal in the app but have different database keys. One after the
  other: 200 then 409. At the same moment: **both 200 in 10 of 10**.
* DW1 tests one code point per name, so it cannot see a reordering. The migration header says a Unicode upgrade "shows
  there" (in DW1), but this case does not show. The marks are rare, so this is Minor.

**F3, Minor (on `main` already, not caused by this diff): names with an empty key are refused one at a time but not at
the same moment.** The rename door accepts names that are only punctuation: `NameBody` (`api/src/library-sources.ts:298`)
checks only 2–80 characters, not `labelProblem`'s "letters or digits". The names `"!!!"`, `"—·—"` and `"😀😀"` all get
the key `''`, and the index skips `''` (`WHERE name_key <> ''`). But `sameName` treats every `''` key as the same name:
a second one is refused with 409 "is already the name of !!! in this group".
* Two renames at the same moment to `"!!!"` and `"—·—"`, in 3 fresh groups (case, employer, address): **both 200 in
  3 of 3**. A third name afterwards: 409. So "the index refuses exactly what the app refuses" fails for this class.

**F4, Minor: the backfill takes the newest version's label, which is not always the label the trigger reserved.** Steps,
in the scratch database: field `person.r1` has v1 PUBLISHED "Ålder" and v2 DRAFT "Ärende". Then v1 is set to RETIRED (as
`api/src/library-items.ts:179` does, without checking for a draft). The trigger rewrites the reservation from v1:
`Ålder`. A second field `person.r2` "ärende" is then allowed. After the migration, r1 holds `ärende` (from v2), and r2
is **listed as a legacy duplicate and loses its key**. Its live reservation never collided with anything. The migration
comment says "as the trigger wrote it" (migration.sql line 21), which does not hold here. Whether the app can retire a
field with an open draft was not checked through the API.

**F5, Minor: a listed legacy duplicate cannot be changed afterwards, and its NOTICE is never seen.** After the backfill,
`person.z_cafe` (PUBLISHED "Café crème", listed) refuses any write that fires the trigger. A new version (as an edit of
its meaning would write) fails with 23505 on `canonical_field_name_unique`, and so does `update … set status='RETIRED'`.
Only a rename or a merge frees it. The 25 Oct migration had the same property. But `start.sh:13` and
`tools/isolated.sh:77` send `prisma migrate deploy` to `/dev/null`, so the NOTICE list reaches nobody on the demo path.
Only the SQL comment at the end (`… WHERE name_key = ''`) remains. The sample data has no duplicates: the demo load
succeeded on the new key.

## What held (attempt → result)
* **DW2 at 50:** 3 rounds of 50 parallel renames, using 10 spellings of one name: hyphen, case, `_`, decomposed `é`,
  ZWSP, full width, dots, extra spaces, soft hyphen, `«»—`. Each round: **exactly one 200**, the rest 409 (10 of them
  refused by the app for invisible characters), and one row holds the key.
* **50 parallel across scripts** (Greek, Cyrillic, Devanagari, Thai; 10 spellings): exactly one winner per distinct
  `normalizeLabel` key, 5 in all. Accented and unaccented Greek count as different names, which is correct because marks
  are kept.
* **Long names:** the rename door's limit is 80 characters, not 120. Names of 81 and 120 characters are refused with 400
  "under 80 characters". For 80-character ASCII and Devanagari names, the stored key equals `normalizeLabel`. Two
  80-character renames at the same moment: one 200 and one 409, 10 of 10.
* **Key equality:** no differences on 200,000 random triples of code points, on 19,200 base-plus-mark compositions or on
  1,254 Hangul jamo sequences. 300,000 dense Latin, Greek and Cyrillic pairs differ only on the F1 sigma cases.
  `Σ` followed by any code point: 0 differences.
* **NULL and empty:** NULL gives NULL (`STRICT`; the trigger's COALESCE gives `''`), and an empty label gives `''`.
  The demo has no field with a NULL label.
* **Speed:** 10,000 keys in 137 ms, and an 11,000-character label in 6 ms.
* **Back and forth in one transaction:** 21 renames of one field between `Ñandú`, `ÑANDÚ-x` and `ñandú!` commit, and
  the final key is right. A swap of two names through a temporary name in one transaction commits.
* **Merged, other group, retired:** a merged-away holder frees its name (200). The same name in another group is allowed
  (200), and so is the same name in another workspace (it keeps its key after the backfill). A retired holder keeps its
  name (409), which is by design (`api/src/rule-facts.ts:243`) and the same for ASCII names on `main`.
* **Backfill:** run on 25 Oct keys with conflicting non-ASCII names. A two-way collision (`Café crème` / `Café-crème`)
  and a three-way one (`ÑOMBRE` / `ñombre` / `Ñombre!`) are listed, and the smallest field key keeps the name. A NULL
  group gets its default. A second run changes nothing and lists the same 4 rows.
* **Builder's check** (`tests/check_csnk1_name_key.ts 4639 …`): 14 of 16 passed. The two DW2 failures over the API (a 409
  on load, then 404s) were caused by the environment, not by the build: at 12:49:22 UTC another agent's copy
  (`runtime_csnk1s`) started on port 4639 and replaced my server. Every API result above was taken before that, on my
  own server (`var/isolated-logs/runtime_csnk1b-api.log`). My copy was then stopped by hand (timer ended, database
  dropped), so as not to stop the other agent's server.
* **PostgreSQL 18 only** (`pg_unicode_fast`): this is not new, because `main` already needs it
  (`20261117004500_css1_case_party_index`). The migration stamp is later than `main`'s newest.
