# Brief: CS-X1, the case side's section of one person's export (PF-26's `PersonExportPort`; map row 34; case side registers its exporter; cloud builder lane; row owner the release Lead)

Drafted 16 Nov 03:4x IST by the case-side shaping lane from BACKLOG row CS-X1 (line 833; Lead B's ask (a)), checked against `main` 81505985f and CS-C1a's head e59e0c030 (#1818, approved, not merged). **Draft until the release Lead approves it.** Model: Opus 5.5, effort: high (personal data, completeness, cross-firm; breaker yes). **Ready when:** part 1 needs all of these on `main`:
* PF-26 part 1 (`ports/person-export.ts` with its fake and contract; not on `main`);
* CS-K1 **part 2** (`case_client.fo_person_id` filled; part 1 ships the column empty, so before part 2 no front-office person id reaches a case);
* CS-D1 (`CaseDocument.storage_key`, documents behind `FilesPort`);
* PF-F3 (`FilesPort.scanState`, the CLEAN gate);
* CS-C1a (#1818: `closedAt`, `case_decision`);
* CS-X3 part 1 (the case-side model discovery its guard exports, reused by DW7).

Part 2 (family members) after part 1, CS-K1 part 2's `FoPersonPort` row, and the `cases.prisma` baton (after CS-K1, CS-T1 and CS-W1, P-526b, P-576). Part 3 (notes) after CS-NT1. **Three parts, three PRs** (the row says 1 PR; SA-11-40 adds the family-member path, ruled below, and notes have their own ready-when).

**Points the release Lead confirms in the approval (the requirement or `main` corrects the row):**
* **A family member's own export is in the requirement, and the row leaves it out.** SA-11-40@13537758:
  * rule 1: the request names one person record and lists "the client's people by name and role on the case";
  * rule 2: Client J's copy holds her own answers;
  * rule 8: staff run a minor's request on the child's record;
  * the test: "Client J's copy holds hers".

  The row exports only "the subject who is this client". It is right that a family member is never swept into the **client's** package, but a daughter's own request must find her answers. On `main`, people are per case (`Party` per workspace, `cases.prisma:205`), and only the client gets a front-office person id (CS-K1, P-607 Q10). Nothing links a spouse's or child's case-side `Party` to a person record. Per Lead 61's ruling (comment 6900282370 on #1867), a requirement is not cut by shaping: **part 2** builds it once the link exists.

  **Ruled (Lead 61, comment 6900882993 on #1876, item 1): `Party` gains a nullable `fo_person_id`.** No BACKLOG row adds it (`grep "Party.fo_person\|fo_person_id" BACKLOG.md` finds only `case_client`'s), so **part 2 of this row adds it with its migration**. It is set through CS-K1's `FoPersonPort.ensureForClient` when staff add a person to a case, and by a one-time `JobPort` job for people already on cases. CS-X2 and CS-X3 match family members through it.

  Until part 2, a party that matches no case client gets a section saying so in plain words, never a silent empty list (SA-11-40 rule 7, "the screen says so").
* **A person can be the client on several `case_client` rows.** CS-K1's backfill makes one client per existing case. Until CS-K2 merges them, the same person may have several rows, each given its own `fo_person` by CS-K1 part 2's job. The exporter therefore reads **every** `case_client` whose `fo_person_id` is the party (SA-11-40 §12: a person on two cases has one export). A person split across two `fo_person` ids is FO-9b's merge (PF-26 reads the merge lineage), and the PR names it.
* **Documents attached, or listed as references?** SA-11-40 rule 2 says the copy "holds the answers, documents and consent records". AG-2-93@743b3642 rule 4 (AG-02 v2.6, the newer file) lists "documents and assessments (as references)". PF-26 says "complete and unmasked". The row attaches `CLEAN` files.
  * **Ruled for the build (Lead 61, comment 6900882993 on #1876, item 2): documents are listed first** (type, name, date, size, `sha256`, scan state), and **attaching is a switch**, the constant `CASE_EXPORT_ATTACH_FILES` in `exporter.ts`, **off**. When on, a `CLEAN` file is also attached.
  * **Waiting on the founder:** two requirement files differ, so the switch's setting is the founder's (AGENTS rule 2). The recommendation is to attach, since the access right is to a copy of the data (a legal reading: Unconfirmed: no counsel).
* **Rules the row leaves out.** These are built here:
  * AG-2-93 rule 9's **completeness check**: every case-side table that holds data about a person is either an export section or on the excluded list with a written reason, and a test fails otherwise.
  * Rule 4's **assessments**: the case's runs, overrides and reviews (`filings.prisma` `Assessment*`).
  * Rule 11's **deleted items marked**: tombstoned answer rows here, and CS-NT1's Recently deleted notes in part 2.
  * SA-11-40 rule 5: **government numbers** (UCI and application numbers) travel with the person, as answers and as `filing_person_record` rows.
* **Tasks are no longer the case side's.** Batch 5 moved the task table to PF-29a's `plat_task` (CS-T1's brief: "no schema in any part"), so the row's "tasks (CS-T1)" line leaves this row. **Ruled (Lead 61, comment 6900882993 on #1876, item 3):** neither PF-26 nor PF-29a-f names an exporter for tasks (PF-26 lists the platform's and front office's sections without tasks; no PF-29 row mentions export), so **PF-29 registers the tasks exporter**. The PR body says so, for the PF-29 lane.
* **Secrets never go in the package.** `PersonLink.tokenHash` and `codeHash`, sessions and tries are access secrets, not data about the person; they go on the excluded list with that reason. The link's address, sent and accepted dates go in.
* **The exporter writes nothing.** PF-26's job writes the audit line (requester, party, time, file hash) and the file. The exporter only reads, in one read-only transaction, so the package is one consistent moment.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime CS-X1` and take **one part of row CS-X1** end to end on a fresh branch from `origin/main`, one PR per part.

**The row:** `product/BACKLOG.md` row **CS-X1**, read with the points above. Requirement text (cite these, read only this text):
* **AG-2-93@743b3642** rules 3 (one person record, merged records included), 4 (what is in it), 5 (complete and unmasked), 9 (completeness check) and 11 (deleted rows included and marked);
* **SA-11-40@13537758** rules 1, 2, 5 and 7 (per person record; never another person's answers; government numbers travel with the person; a person with no record has nothing to export, and the screen says so), with §11's tests and §12 (one person on two cases: one export);
* **SA-11-36@a5e1fc3d**: the copy is never masked; no portal button;
* AG-07 **BR-28** (`AG-07-case-core-and-delivery_v3.12_2026-10-28.md:671`): one person record is one client;
* decisions **P-588 (2)** (people stay per case; the client stores the front office's id) and **P-607** (S1 Q10: every case client gets an `fo_person`).

**Read only these:** `ports/person-export.ts` and its contract (PF-26's); `ports/files.ts` (with PF-F3's `scanState`); `prisma/schema/cases.prisma` (`Case`, `case_client`, `CaseStage`, `CaseParticipant`, `Party`, `PartyProfile`, `case_decision`), `answers.prisma`, `evidence.prisma`, `filings.prisma`, `submission.prisma`, `links.prisma`, `review.prisma` (models only); `api/src/clients.ts` (CS-K1); `api/src/case-close.ts` (CS-C1a, the firm from `platform_firm` by key); `api/src/features/platform-complaints.ts` (an `onModuleInit` registration that runs once); `api/src/MODULE.cases.md`.

## Part 1 (CS-X1a): the client's section and the completeness check (expected ~650 lines)
* **`api/src/case-export/person-tables.ts`:** one typed table that names, for **every** case-side model (discovered as CS-X3's guard discovers them: the `.prisma` files are parsed and `Case`, `AnswerSubject`, `Party` and every model reachable from them through relation fields are taken; today they sit in `cases`, `answers`, `evidence`, `filings`, `submission`, `links` and `review`), one of three things:
  * `EXPORT` with its section;
  * `EXCLUDED` with a reason: no person data (`Route`, `FirmCaseCounter`, `PackWorkPin`); access secrets (`PersonLinkTry`, `PersonLinkSession`); a person's own view choice (`PersonPreference`, a staff setting);
  * `VIA` another section (e.g. `AnswerSubject` through answers).

  CS-X2's eraser reads the same table.
* **`api/src/case-export/exporter.ts`:** `caseSideExporter(firmId, partyId)`. It reads only, inside one `REPEATABLE READ, READ ONLY` transaction. Firm A's id never reads firm B's rows: `case_client.firm_id`, then cases by `platform_firm.key = Case.firmKey` (until CS-W1).
  * Clients: every `case_client` of the firm with `fo_person_id = partyId`, with client code, display name, kind, contact and created date.
  * Per case of those clients, open and closed:
    * number, combination name, status, `closedAt`, close reason;
    * stages with `startedAt` and `endedAt`;
    * `case_decision` rows (decisions and withdrawals);
    * the team by role (staff names, as the firm's record of who handled it).
  * **Only the principal participant's subject** (the case client's person, `case_participant_one_principal`):
    * answers: every `ClientCanonicalAnswer` row, current and superseded, oldest first, with status and dates;
    * `ClientFactRecord` rows, tombstones marked **"deleted"** (AG-2-93 rule 11's word), and `ClientGroupAnswer` rows;
    * the case's `CaseTask` rows (`after_filing_change` to-dos, with words and dates; `EXPORT` under the case);
    * the documents' read values and checks (`ReadValue`, `AnswerCheck`, `DocumentReview`);
    * assessments with their overrides and reviews;
    * person links (address, sent, accepted, voided; never hashes);
    * filings where the person applies, with `FilingRecord` and `FilingPersonRecord` (application numbers, UCI), corrections, sign steps, signed scans and fee receipt files.
  * **Documents:** each `CaseDocument` of the subject with type, file name, media type, size, `sha256`, uploaded at and current or superseded. With `CASE_EXPORT_ATTACH_FILES` on, a file whose `scanState` is `CLEAN` goes in `files[]` (`{ key, name, sha256 }`; PF-26's job fetches the bytes through `FilesPort.get`, so the exporter holds none), and any other state is listed with "Not attached: <state in words>". With it off (the default) every file is listed and none attached. A generated or validated form copy, signed scan or fee receipt still on local disk (not yet moved by CS-D1) is listed with its `sha256` and "Stored outside the file store; not attached". The PR lists each such kind.
  * No client for the party → `{ module: "case-side", sections: [], words: "No case files are linked to this person." }`, never an error.
  * The return follows PF-26's section shape. If PF-26 gives none, it is `{ module, sections: [{ key, title, rows }], files, words? }`, a contract gap below.
* **Registration:** new `api/src/features/case-export.ts` registers the exporter with `PersonExportPort.register("case-side", …)` once at start (the `onModuleInit` pattern of `features/platform-complaints.ts`, guarded so a second start registers nothing).
* **Named test cases** (P-606), file `tests/check_csx1_export.ts`, a pass and a fail each:
  * **CS-X1 DW1:** a client on two cases (one `case_client`, two cases) and a person with two `case_client` rows of the same `fo_person_id` → every case is in the package; a third case of another client is not.
  * **CS-X1 DW2:** the spouse on the same case → none of the spouse's answers, documents, links or filings are in the client's package; the principal's are (the fixture gives both people answers on the same fields).
  * **CS-X1 DW3:** a removed (tombstoned) row → in it, marked "deleted"; a superseded answer → in it as history; the current answer is marked current.
  * **CS-X1 DW4:** switch off → every document listed with its `sha256` and `files[]` empty; switch on → a `CLEAN` file is in `files[]`, and a file still scanning or quarantined is listed "Not attached" and absent from `files[]`.
  * **CS-X1 DW5:** a party with no case client → the plain words, empty sections and no throw; an unknown uuid → the same, never another firm's data.
  * **CS-X1 DW6:** firm A's export of a party never holds firm B's case, even when firm B has a `case_client` with the same `fo_person_id` (forced fixture).
  * **CS-X1 DW7 (completeness):** the test parses `prisma/schema/*.prisma` (Prisma's DMMF does not say which file a model sits in) with CS-X3's discovery, and every discovered model is in `person-tables.ts`, including `CaseTask` (`EXPORT`) and `DemoMessage` (`EXCLUDED`: "the demo's Sample outbox, not a sent message; it holds one-time codes"). A throwaway `.prisma` text with one extra model related to `Case` → the check fails naming it; an `EXCLUDED` entry with an empty reason fails.
  * **CS-X1 DW8:** a closed case (past client) is in the package with its decision and withdrawal rows and stage dates.
  * **CS-X1 DW9:** the export changes nothing: the table row counts and the newest audit id before and after are equal; no `tokenHash`, `codeHash` or session value appears in the serialised package (string search).
  * **CS-X1 DW10:** `runContract(personExportPortContract, …)` (PF-26's) passes with this exporter registered on the fake, and the package holds a `case-side` section.
* **Touch (part 1, nothing else):** new `api/src/case-export/person-tables.ts`, new `api/src/case-export/exporter.ts`, new `api/src/features/case-export.ts`, new `tests/check_csx1_export.ts`, `api/src/MODULE.cases.md` (paths gain `case-export/*`; the exporter under Entry points).

## Part 2 (CS-X1b): family members (expected ~550 lines; schema; ruled)
* **Schema** in `cases.prisma` with one migration folder (stamp later than every migration before it and unique; functions `case_party_*`): `party.fo_person_id` (uuid, null, no foreign key to front-office files, as CS-K1's columns), indexed with the workspace.
* **Set:** one hook where staff add a person to a case (`api/src/runtime.ts` `addPerson`, `:394`, route `POST cases/:id/people`; the release Lead's OK, contract §7's one-line hooks) calls `FoPersonPort.ensureForClient` in the same transaction. A one-time `JobPort` job links people already on cases, and a re-run changes nothing.
* **Read:** a party matching a case-side `Party` (not a client) gets **their own** answers, documents, links and filings from each case they are on, with their role on the case. The client's package never includes them, and theirs never includes the client's.
* **Named test cases**, a pass and a fail each:
  * **CS-X1 DW11:** Client J's (a daughter's) package holds her answers and not her mother's, and her mother's holds hers and not Client J's (SA-11-40 §11 test 1).
  * **CS-X1 DW13:** an adult family member's data is never in the principal's package, whoever runs it (SA-11-40 rule 8).
  * **CS-X1 DW14:** adding a spouse gets a person id in the same transaction (rolled back with it); the job leaves no participant unlinked, and a re-run changes nothing; firm A's person never gets firm B's id.
  * **CS-X1 DW15:** the migration test follows rev 16.7 (it measures right after its own migration and never assumes it is the newest); `migrate diff` is empty.
* **Touch (part 2):** `prisma/schema/cases.prisma` + one migration folder, `api/src/runtime.ts` (the one hook), the job file `api/src/case-export/link-people.ts`, `api/src/case-export/exporter.ts`, `tests/check_csx1_export.ts`.

## Part 3 (CS-X1c): notes (expected ~200 lines; after CS-NT1)
* CS-NT1's notes on the person's cases go in (a client-visible flag shown), with Recently deleted notes marked "deleted" (AG-2-93 rule 11); `person-tables.ts` gains CS-NT1's tables.
* **CS-X1 DW12:** a note in Recently deleted → in it, marked "deleted"; a purged note → absent.
* **Touch (part 3):** `api/src/case-export/exporter.ts`, `api/src/case-export/person-tables.ts`, `tests/check_csx1_export.ts`.

**Done when:** `tsx studio/tests/check_csx1_export.ts` exits 0, with each DW case of the part passing and failing as named. These must pass unchanged: PF-26's suite `check_pf26_person_export.ts`, `check_csk1_client.ts`, `check_csc1_close.ts`, `check_case_feed.ts` and every case suite; `node studio/tools/check-port-contracts.mjs` exits 0. The module-card check passes and full `ci` is green on the head.

**Duplicate check:** BACKLOG (PF-26 builds the port, job, package and link and says "the case side registers its own"; PF-26s is the button; CS-X2 shares `person-tables.ts`), open PRs (`person-export`, `PersonExportPort`, `exporter`), `git grep -n "PersonExport\|exporter" api/src ports` on `main` (empty); no exporter on `main`; one `Duplicate check:` line.

**Parallel safety:**
* Part 1 adds only new files, plus `api/src/MODULE.cases.md` (one paragraph; merge `main` on a conflict).
* No schema in part 1, so it does not hold the `cases.prisma` baton; part 2 holds it (the ruled column), after CS-K1, CS-T1 and CS-W1 have released it (P-526b, P-576), and its `runtime.ts` hook does not run alongside CS-C1b's or CS-K1's `createCase` work.
* **CS-X2 runs after part 1** (it imports `person-tables.ts`). Any later case row that adds a table with person data must add its line to `person-tables.ts` in its own PR, or DW7 turns red (intended; tell its builder).
* `runtime.ts`, `core.ts`, `case-feed.ts` and `ports/` are untouched.

**Contract gap (for the PR body):**
* `PersonExportPort` is not on `main` and in neither contract's ports list (case-side §3, platform §7).
* PF-26 names `(firmId, partyId)` but not the section or file shape a module returns: this brief proposes `{ module, sections: [{ key, title, rows }], files: [{ key, name, sha256 }], words? }`, with PF-26's job fetching bytes.
* `FilesPort.scanState` is PF-F3's, not on `main`.
* **A case-side family member has no person id until part 2** (ruled; `FoPersonPort` is still CS-K1 part 2's gap).
* Tasks' exporter is PF-29's (ruled), and no PF-29 row says so yet.

**Reviewer and breaker** (personal data, cross-firm; P-278). The breaker tries:
* DW2 with a spouse who answered the same fields;
* DW6 with the same front-office id in two firms;
* a quarantined file renamed `.pdf`;
* a deleted (tombstoned) row whose answers were re-added;
* a 5,000-answer subject (one consistent read, no N+1: query count in the PR).

**Rules (standard):** Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask in a PR comment headed "Question for the tech lead"; never widen the row silently. One part, one PR, under 800 changed lines tests included (P-610); Opus reviewer (P-303); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). Never push to a PR that carries the `queued` label. Before asking for the label, run on `main` merged into your branch the suites of every CI part that was red on any earlier head plus every suite in your shard's demo database, and paste the result lines. Live AI off, US$0 (P-175). Push after every step (P-557). Report to the current Lead (`tools/current-lead.sh`). Read only the files named here and the code you change (P-556). Re-review reads only the diff since the last Approve (P-277, P-610).
---
