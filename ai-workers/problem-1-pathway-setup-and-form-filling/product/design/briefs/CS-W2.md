# Brief: CS-W2, the firm column on every case-side table, one area file at a time (walls steps 2, 2a, 3, 4, contract §8; map row 3; case side; cloud builder lane; row owner the release Lead)

Drafted 16 Nov 01:4x IST by the case-side shaping lane from BACKLOG row CS-W2 (line 845), checked against `main` 81505985f and CS-C1a's head e59e0c030 (#1818). **Draft until the release Lead approves it.** Model: Opus 5.5, effort: high (schema and a backfill on every case table; breaker yes). **Ready when:** CS-W1 is on `main`, which brings `firm_id`, `@@unique([firmId, id])` on `Case` and the generic fill function `case_firm_fill()`. CS-W3 part 0 (the §8 spike) has reported. Then each part waits for its own file's holder (the plan below). **Ten parts, ten PRs** (P-610). Each is expected at 300-650 lines, tests included.

**Points the release Lead confirms in the approval (the requirement and the code correct the row's text):**
* **The default alone would break every insert until CS-W3 lands.** The row's default `current_setting('app.firm_id')::uuid` raises an error when the setting is missing, and today nothing sets it (`git grep "app.firm_id"` on `main`: none). So each table gets two things. First, Prisma's `@default(dbgenerated("nullif(current_setting('app.firm_id', true), '')::uuid"))`. That keeps P-588 (4) condition 1: Prisma omits the field and no file must pass it. Second, a `BEFORE INSERT` trigger using CS-W1's `case_firm_fill()` that **fills a null `firm_id` from the row's parent and refuses a value that differs** (contract §8 condition 1 allows it: "where a child's parent is known, a trigger may instead copy the parent's firm"). Inserts then work before CS-W3, and after CS-W3 the setting and the parent must agree. **Question for the tech lead:** confirm this pairing.
* **Prisma refuses a composite key on an optional `SetNull` relation** (`firm_id` is required, and `SetNull` would null it). Three relations on `main` are like this: `review.prisma:42` (`ReviewFinding.filing`), `evidence.prisma:64` (`CaseDocument.line`), `links.prisma:36` (`PersonLink.supersededBy`). For these three, consistency is a `case_firm_match` trigger check, not a composite foreign key, and each is named in its part's test. Relations to platform-wide parents (`Combination`, `ConfigRelease`, `CanonicalField`, `FormEdition`) get no composite key.
* **Parents across files force an order.** A composite key needs the parent's `(firm_id, id)`. Measured on `main`:
  * `CaseStage` points at `AnswerSubject` (answers).
  * `CaseTask` points at `Filing` and `FilingItem` (filings).
  * `EnteredSection` points at `FilingItem`.
  * `SubmissionGroup` and `Filing` point at `CaseStage`.

  These are circular between `cases`, `answers` and `filings`. So **each area part adds keys only to parents that already carry `firm_id`** (`Case` always, from CS-W1), and **a last part, "keys", adds the cross-file composite keys** that were left (listed below). The trigger fill already holds every row's firm in the meantime.
* **Counted on `main`:** 52 firm-owned case-side tables (the contract's 48 is from `f1d0d403e`):
  * `cases` 11 (`Route` is platform-wide);
  * `answers` 8, `filings` 9, `review` 7, `submission` 6, `evidence` 5;
  * `links` 3 and `extension` 3, besides the two named exceptions `PersonLinkTry` and `ExtensionCodeTry` (P-588 (5)).

  Born after: `case_decision` (CS-C1a), `case_client` (CS-K1), `case_client_merge` (CS-K2), `case_note` (CS-NT1). These already have `firm_id` and get only the default, the fill trigger and the composite key. `AuditEvent` is AUD-1a's. Each part's PR lists its tables, and any difference from 52 is explained there.
* **Party is set in code** (step 3): `runtime.ts:292` and `:436` are the only `party.create` calls. They pass the case's `firmId`, two lines.
* **Step 4 (the §2.7 tables) waits for CS-W3 part 1.** `ExtensionPairing` and `ExtensionSession` have no parent, `PersonPreference` (`studio.ts:154`) has no case, and `RecaptureTask` hangs off a platform-wide `FormEdition`. Their firm can only come from the staff member's setting, so their `NOT NULL` lands after CS-W3 sets the firm on those routes. No extension code writes them on `main` today (only `demo.ts:564` deletes).

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-W2 <part>` (parts: `filings`, `links`, `cases`, `answers`, `review`, `submission`, `evidence`, `notes-and-born`, `keys`, `s27`) and take **one part of row CS-W2**, end to end on a fresh branch from `origin/main`, one PR.

**The row:** `product/BACKLOG.md` row **CS-W2**, read with the points above. Sources (cite these): case-side contract v0.1 **§8** conditions 1-3 and steps 2, 2a, 3, 4 (the column with a Prisma default, the backfill from the case, `NOT NULL` after it; composite keys on the multi-parent tables because foreign-key checks ignore row-level security; triggers with the caller's rights; `Party` by code; one cross-firm test per area file), **§2.7** (the eight tables and who sets their firm), **§1** rule 2 (columns are filled by the database; code is not rewritten to fit); decisions **P-588 (4)**, **P-588 (5)**, **P-575**, **P-600** (schema rows in parallel: own file, own migration, area-prefixed functions, a later stamp); **AG-1-1@ca84eb07** (every firm-owned record is scoped by `firm_id`), **AG-1-45@a4057ff0** (no endpoint returns another firm's data).

**Read only these:**
* your part's one area file in `prisma/schema/`;
* CS-W1's migration folder (`case_firm_fill()`, `case_firm_from_key()`) and `tests/check_csw1_firm_id.ts` (the harness to copy);
* `prototype/studio/DEVELOPING.md` "Database schema: one file per area";
* for part `cases` also `api/src/runtime.ts:285-300` and `:430-440`.

**What to build, in every part:**
* **For each of the part's tables:**
  * `firmId String @default(dbgenerated("nullif(current_setting('app.firm_id', true), '')::uuid")) @map("firm_id") @db.Uuid`;
  * a backfill from the case (or from the one parent, for a table with no `case_id`), then `SET NOT NULL` in the same migration;
  * an index `(firm_id, …)` beside the existing `(workspace_id, …)` one;
  * `@@unique([firmId, id])` when another table points at it;
  * the fill trigger `case_<area>_firm_fill` calling CS-W1's `case_firm_fill()` with its parent;
  * composite keys `(firm_id, parent_id) → (firm_id, id)` to parents that already carry `firm_id`, with the `case_firm_match` trigger for the three `SetNull` relations.
* **Migration rules:** one migration folder per part; its stamp is later than every migration before it and unique; functions are named `case_<area>_*`; every trigger is `SECURITY INVOKER`.
* **The parts and what each holds (order, and the parent each table fills from):**
  1. **`filings`** (9 tables; after CS-W1). Fill from the case; `FilingApplicant`, `AssessmentOverride` and `AssessmentReview` fill from their same-file parent. Keys to `Case` and to the file's own parents; `SubmissionGroup → CaseStage` waits for part 3.
  2. **`links`** (3; after CS-W1). `PersonLink` fills from the case; `PersonLinkSession` and `DemoMessage` fill from the link. `supersededBy` gets a match trigger. `PersonLinkTry` is untouched, a named exception.
  3. **`cases`** (10 old tables + the default and trigger on `case_decision`, `case_client`, `case_client_merge`; after CS-K2 holds and releases the baton). `Party` is set in code (the two lines). `PartyProfile` and `PartyRelationship` fill from `Party`; the rest fill from the case. Keys to `Case`, `Party` and (part 1 being merged) `CaseTask → Filing, FilingItem`; `CaseStage`/`CaseParticipant → AnswerSubject` go to part 9. `PersonPreference` and `Route` are untouched.
  4. **`answers`** (8; after part 3 and after CS-D1b's `ValidatedCopy` change). `AnswerSubject` fills from `Party`; the three client answer tables fill from `AnswerSubject`; `ValidatedCopy` fills from `FormInstance`; the rest fill from the case.
  5. **`review`** (7; after part 1). `FilingReview` and `ReadinessPass` fill from `Filing`. `ReviewRoundForm` (7 parents) and `ReviewRoundFiling` (4) get keys to every firm-owned parent present. `ReviewFinding.filing` gets a match trigger.
  6. **`submission`** (6; after part 1 and after CS-D1b's `SignedScan`/`FeeReceiptFile` change). `FilingPersonRecord` and `FilingRecordCorrection` fill from `Filing`.
  7. **`evidence`** (5; after part 4 and CS-D1, which brings `CaseDocument`'s firm column; this part adds only its default, trigger and keys). `CaseDocument` fills from `AnswerSubject`; `CaseDocument.line` gets a match trigger. In series with CS-D6 and CS-D7 (same file).
  8. **`notes-and-born`**: `case-notes.prisma` (CS-NT1's `case_note`) and any case-side file born before CS-W1 gets the default, the trigger and the composite key to `Case`.
  9. **`keys`** (last of 1-8): the composite keys whose parent's part had not merged when the child's part did. Each earlier part lists in its PR the ones it left. With the order above this is at least `CaseStage → AnswerSubject`, `CaseParticipant → AnswerSubject`, `Filing → CaseStage`, `SubmissionGroup → CaseStage` and `PersonLink → AnswerSubject`, plus `ReviewFinding → CaseStage` and `SignStep → FormInstance` if part 3 or 4 is later than 5 or 6. **These are relation lines only, in several files.** It needs every file free at once, so the release Lead gives it one baton slot.
  10. **`s27`** (step 4; after CS-W3 part 1). `ExtensionPairing`, `ExtensionSession`, `RecaptureTask` (`extension.prisma`, the forms lane's file: their OK in the PR) and `PersonPreference` (`cases.prisma`). Column with the default, no fill trigger (no parent), `NOT NULL` once the routes that write them set the firm. `ExtensionCodeTry` is untouched.
* **Named test cases**, one file per part, `tests/check_csw2_<part>.ts`, a pass and a fail each (`<n>` is the part number):
  * **CS-W2 DW<n>.1:** after the migration no row of the part's tables has an empty `firm_id`, and each equals its case's firm. This is checked on a copy holding cases of both Sample firms, measured right after this migration (rev 16.7). A forced row whose parent is missing stops the migration with words.
  * **CS-W2 DW<n>.2:** an insert with no firm gets its parent's firm. An insert naming the other Sample firm is refused. With `app.firm_id` set to firm B, an insert under a firm A parent is refused.
  * **CS-W2 DW<n>.3** (the cross-firm test, per area file): a child cannot point at another firm's parent, through each composite key and each match trigger of the part (one fail per key).
  * **CS-W2 DW<n>.4:** the earlier migrations still apply to a copy of the demo data and `migrate diff` is empty. Every new function is `case_<area>_*` and `SECURITY INVOKER`.
  * **CS-W2 W<n>** (journey, no browser): the area's main path on the API (for `filings`: open a case, add a filing, fill a form) runs unchanged, with every new row carrying the case's firm.
* **Touch (nothing else), per part:**
  * the part's one area file + one migration folder;
  * the part's test file;
  * part `cases` also `api/src/runtime.ts` (the two `party.create` lines);
  * part `keys` the relation lines in the files listed;
  * part `s27` `extension.prisma` and the `PersonPreference` model.

**Done when:** for the part, `tsx studio/tests/check_csw2_<part>.ts` exits 0 with its DW cases each passing and failing as named, and W<n> passes. These pass unchanged: `check_csw1_firm_id.ts`, `check_prisma_schema.ts`, the area's existing suites (named in the PR, found with `tools/check-select-suites.sh`), the demo reset, the checkpoint load (C10.1) and `check_d1_reset_to_six.ts`. Full `ci` is green on the head. After part 9, CS-W4's census check (every case-side table has a non-null `firm_id`) passes.

**Duplicate check:** searched BACKLOG (CS-W1, CS-W3, CS-W4, CS-D1 (`CaseDocument`'s firm column), CS-D1b, CS-D6, CS-D7, CS-K1, CS-K2, CS-NT1, CS-S1, CS-98a, AUD-1a, PF-12), open PRs (`firm_id` in any case-side area file), `git grep -n "firmId\|firm_id" prisma/schema/{cases,answers,filings,review,submission,evidence,links,extension}.prisma` on `main` (only the three CS-W1 tables once it lands) and BUGS. No case-side table but CS-W1's three has a firm column.

**Parallel safety:**
* **Per file, the other schema rows:**
  * `cases.prisma` is a baton: #1818 → CS-K1 → CS-W1 → CS-K2 → part 3.
  * `answers.prisma` and `submission.prisma`: CS-D1b first (it waits on CS-D1), then parts 4 and 6, or the reverse when CS-D1b is later. One holder at a time; the release Lead names it in STATE.
  * `evidence.prisma`: CS-D1 → part 7 → CS-D6/CS-D7 (in series).
  * `filings.prisma`: CS-C1a's one line merges first.
  * `review.prisma` and `links.prisma`: no other schema row; parts 1, 2 and 5 can run beside every other row.
  * `extension.prisma`: the forms lane's (their OK).
* **New case-side files born after CS-W1** (CS-S1 `case-search.prisma`, CS-98a `case-corporate.prisma`, CS-NT1 if later) ship with this pattern in their own migration: tell their builders; they need no part here.
* **Parts that may run at the same time:** 1 and 2 together; 5 and 6 after 1; part 3 when the baton is free. Each takes its own stamp and re-stamps on top of `main` before the label (P-600's five steps).
* **Bake's tag** (P-499): the row holds the busiest files until the tag. **Question for the tech lead:** which files? Recommended: `cases` and `answers` wait for it, the others need not.
* No `core.ts`, `ports/`, `events.ts` or module-card change.

**Contract gap (for the PR body):**
* §8 condition 1's default text needs `current_setting(…, true)` and `nullif` to work before CS-W3, and the fill trigger as the backstop (first point). The same applies to PF-12's policy text: tell Lead B.
* §8 step 2a's "24 multi-parent tables" is measured per part, and the `SetNull` three are checked by trigger, not by key.

**Reviewer and breaker** (schema on every case table; P-278), per part. The breaker tries cross-firm parents through every key and trigger, inserts with the setting unset, empty and wrong, and the migration on a copy with both firms' cases. The release holder reads each migration before the label (P-600 (5)).

**Rules (standard):** Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask in a PR comment headed "Question for the tech lead"; never widen the row silently. One part, one PR, under 800 changed lines tests included (P-610); Opus reviewer (P-303); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). Never push to a PR that carries the `queued` label. Before asking for the label, run on `main` merged into your branch the suites of every CI part that was red on any earlier head plus every suite in your shard's demo database, and paste the result lines. Live AI off, US$0 (P-175). Push after every step (P-557). Report to the current Lead (`tools/current-lead.sh`). Read only the files named here and the code you change (P-556).
---
