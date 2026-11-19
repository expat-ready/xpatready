# Brief: FO-9a, duplicate warning on key fields (cloud builder lane; row owner Lead B)

Start only after **FO-2 and PF-L have merged** (FO-2 brings the routes that call the check; PF-L adds `libphonenumber-js`). Sales lane: FO-1a → FO-2 → FO-2b → FO-9a → FO-9b (P-576); it edits `front-office-sales.prisma`, so no other row may hold that file at the same time. Paste into a new cloud session on the repository (default branch `main`):

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime FO-9a` and take **one row, FO-9a**, end to end on a fresh branch from `origin/main`, one PR (split schema → API if over ~800 lines, P-436 (4)).

**The row:** `ai-workers/problem-1-pathway-setup-and-form-filling/product/BACKLOG.md`, row **FO-9a** (rows rev 10, P-574 (2)). Read with it, and only these: `product/design/platform-and-front-office-contracts-2026-11-14.md` §2.1 and **§7 (binding)**; `product/design/tech-gate-platform-front-office-2026-11-14.md` (the `libphonenumber-js` entry, PF-L); the AG-02 cards the row cites (AG-2-16, -78, -96, -97, -98, -99; `domain/requirements-2026-11-02/02-functional-requirements/agent/AG-02-…`, those cards only); on `main`: `prisma/schema/front-office-sales.prisma`, `api/src/front-office/sales/*.ts` (FO-2), `api/src/features/README.md`.

**What to build:**
* In `front-office-sales.prisma` with one migration folder (**you hold the schema baton for this file**): enable `pg_trgm` in the migration's SQL; trigram indexes on person and company names; a normalised phone column on `fo_person` (E.164 by `libphonenumber-js`, default region CA) and a lower-cased email index; backfill existing rows in the migration.
* The shared match rules (normalise email and phone; name similarity score) in new **`prototype/studio/ports/matching.ts`** (pure, `zod` only), which the case side's `PartySearchPort` also calls (contract v0.1 §3.1). One match service in new `api/src/front-office/duplicates/*.ts` on top of it: email exact, phone exact, name similarity at or above a **Sample** threshold 0.6; a score 0-100 with its reasons.
* `POST /api/front-office/duplicates/check`, used by Add a lead, Engage, add contact and the arrival path; it returns only matches the caller may see, each with "use the existing one" (which links the new activity to the existing person and creates nothing).
* **No `DuplicateCheckPort`** (rows rev 14.1): the duplicate result travels on `prospect.won` (contract v0.1 §4); if BACKLOG's row still names the port, this brief wins.
* **The public form never reveals a match** (FO-2's rule stands): it answers the same with or without one.
* Register in new `api/src/features/front-office-duplicates.ts`. Every change through `AuditPort.record(tx, …)`; outbox row last. Test `tests/check_fo9a_duplicates.ts` covering every line of the row's Done when, a pass and a fail each: `+1 (416) 555-0101` and `416.555.0101` match; the same first name alone scores below the threshold; a match the viewer may not see is never named; "use the existing one" creates nothing; the public form answers the same either way; 20 parallel checks stay under the speed budget on Sample data at 100 firms.

**Touch list (nothing else):** `prisma/schema/front-office-sales.prisma` (the column and indexes only) and one migration folder; new `prototype/studio/ports/matching.ts`, new `api/src/front-office/duplicates/*.ts`, `api/src/features/front-office-duplicates.ts`, `tests/check_fo9a_duplicates.ts`; **plus one call each** in FO-2's Add a lead, Engage, add-contact and arrival handlers under `api/src/front-office/sales/` (OK'd by Lead B as owner of both rows, 14 Nov; list the lines in the PR).

**Re-stamp step (P-600, schema rows in parallel):** your migration folder's stamp must be later than `main`'s newest when you ask for the label. Whenever another migration merges to `main` before yours: (1) merge `main`; (2) rename your folder to a stamp later than `main`'s newest; (3) show `npx prisma migrate diff` empty and `migrate reset` clean on `main` + your branch; (4) re-run CI and the suites of every red part; (5) a diff-only re-Approve. P-600's five conditions apply: own schema file and migration folder; add only to your own tables (a shared model changes only through your own slot line); area-prefixed functions and triggers; the later stamp; the release holder reads your migration diff before the label.

**Migration tests in a parallel world (rows rev 16.7):** your migration test measures **right after your own migration** (apply up to and including it, check, then apply the rest), and never assumes your migration is the newest of all. The stamp check is "later than every migration before it, and unique", never `all.at(-1)`. A test that assumes it is newest turns every later schema PR red.

**Must still be true:** every existing suite, the demo reset and the checkpoint load (C10.1) pass unchanged; FO-1a's and FO-2's suites pass unchanged.

**Duplicate check (P-526):** BACKLOG, open PRs, `main`'s code (`git grep -i 'pg_trgm\|libphonenumber\|duplicate'` under `api/src` and `prisma`) and BUGS; one `Duplicate check:` line.

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); **breaker yes (schema)**; re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. The release holder reads the migration first (P-423). Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---

## Amendment (19 Nov 11:23 IST, Lead B): R1.33's last part, the staff phone edit, with its J-test (J4 lane 4)
* **What is on `main`:**
  * an unreadable phone at a public door is kept as typed, with the "Fix number" pill on the leads list and the lead page;
  * `front-office/duplicates/phone.ts` normalises with `libphonenumber-js`.
* **What is left (rev 17.21 ruling):**
  * a **staff edit** of a person's phone **refuses an impossible number**: 422 with `fields: { phone: "This is not a phone number we can read. Add the country code, for example +1 416 555 0100." }`;
  * a valid number **keeps its country** (stored as E.164 beside what was typed) and clears "Fix number".
* **The route:** `PATCH /api/front-office/people/:personId` with `{ phone }` only in this part (key `agent/prospect:edit`, own or all as FO-2v). It is audited with ids only, never the number (PF-23).
* **The screen:** the lead page's Phone row gets an edit control. Fix number opens it.
* **The J-test (J-33) in this PR:**
  * a web-form lead with "12" shows Fix number;
  * staff enter "12" → the field's sentence, and nothing is saved;
  * staff enter "+1 416 555 0100" → it is saved, the pill goes away, and the list no longer flags it;
  * firm B's person → 404.
* **Touch list:** a new `api/src/front-office/people/edit.ts` and its route line, the phone row in `lead-page.tsx`, `tests/check_fo9a_phone_edit.ts`, `tests/journeys/j_33.ts`. No migration if the E.164 column exists on `fo_person` (check at start; if it doesn't, one migration with a stamp later than main's newest, P-600). About 300 lines.
