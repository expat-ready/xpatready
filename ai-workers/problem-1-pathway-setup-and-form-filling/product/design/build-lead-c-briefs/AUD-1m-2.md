# Brief: AUD-1m parts 2a and 2b, the case side's direct audit writes move to the port, with J-8 inside 2b (cloud builder lane; row owner Build Lead C)

Written 19 Nov 11:5x IST by Build Lead C (2). **Approved for building after the drain (P-723, about 13:30 IST).** This is Release 1 row **R1.8** ("Audit trail nobody can edit", journey map J0). It follows AUD-1m part 1 (#2214, `claude/admiring-mendel-weh2i4`, head ee835cc53), which made `Audit.log` a caller of `AuditPort.record` and added `tests/check_aud1m_case_writes.ts` (CW1-CW7). The row text is BACKLOG `AUD-1m`; the part-1 brief is `AUD-1m.md` next to this file. Where this page differs, this page wins.

**Model:** Opus 5.5, effort high (audit trail, many files). **Lane:** the lane that built part 1 ("AUD-1m part 1 · audit"), which owns R1.8 under P-719. A fresh lane reads this page and `AUD-1m.md`, nothing bigger.

**Ready when:** #2214 is on `main`. Part 2a branches from `main` after that. Part 2b branches from part 2a's head (overlap rule: build and get the Approve on the branch; open the PR only when 2a merges, then merge `main` once and take a diff-only Approve).

**Why two parts:** P-610 (under 800 changed lines with tests). The list is CW1's `LEFT` map on #2214's head (counted 19 Nov at ee835cc53): 30 writes in 22 files. 20 files are the case side's; 2 are the platform's (see "The two platform files").

## Part 2a: cases, documents and people (11 writes, 10 files)
| File (under `api/src/`) | Writes |
|---|---|
| `case-close.ts` | 1 |
| `case-prepare.ts` | 1 |
| `document-providers.ts` | 1 |
| `document-sets.ts` | 1 |
| `document-supplies.ts` | 2 |
| `earlier-facts.ts` | 1 |
| `employer-link.ts` | 1 |
| `person-link.ts` | 1 |
| `readiness.ts` | 1 |
| `section-background.ts` | 1 |

**PR title:** `runtime: AUD-1m part 2a — case, document and person audit writes through AuditPort`

## Part 2b: forms, library, review and lifecycle (16 writes, 10 files), with J-8
| File (under `api/src/`) | Writes |
|---|---|
| `form-library.ts` | 2 |
| `forms-demo.ts` | 1 |
| `library-changes.ts` | 1 |
| `library-items.ts` | 2 |
| `lifecycle.ts` | 3 |
| `must-verify.ts` | 2 |
| `official-pages.ts` | 1 |
| `release-update.ts` | 1 |
| `review-rounds.ts` | 2 |
| `review-stamp.ts` | 1 |

**PR title:** `runtime: AUD-1m part 2b — form, library and review audit writes through AuditPort; J-8 joined and walked`

## How each write moves (both parts)
* Each direct `tx.auditEvent.create(...)` / `this.db.auditEvent.create(...)` becomes one `AuditPort.record` call (or `Audit.log` with `tx`, where the caller already has `Audit`), keeping the caller's transaction when it has one.
* Entity words go through part 1's `CaseEntry` schema. A word the schema does not know is added to it in this PR and listed in the PR body; never a bare `any`.
* Actor words are AUD-1a's typed words (`staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>`, or a listed simulated person). An untyped word a caller passes today is listed in the PR body and mapped, not silenced, as part 1 did.
* `case_id` is filled where the entity or key names a case (part 1's parser). A line that names no case keeps `case_id` null.
* Update CW1's `LEFT` map in the same PR: 2a removes its 10 files; 2b removes its 10. CW1 keeps its pass and fail lines.
* No schema and no migration. If one is needed, ask first (P-600 slot).

## The two platform files (question for the tech lead, open)
`platform/identity/audit.ts` (2 writes: `auditStaff`, `auditInvitation`) and `platform/settings.ts` (1 write) are the platform's, not the case side's. The BACKLOG row's check says "`git grep auditEvent.create` under `api/src` finds only the adapter". Two ways, for Lead 90 to decide with Lead B:
1. **Recommended:** part 2b also moves these 3 writes (one line each, `AREA_ENTITY` already covers `platform_staff` and `platform_invitation`), with Lead B's OK on the touch list in the PR body. Then CW1's final `LEFT` is empty and the row's check holds as written.
2. They stay, named in CW1's final `LEFT` with a reason, and a Lead B row moves them later. Then R1.8's check is met only when that row merges.
Until the answer comes, build 2b without them and leave CW1 naming them.

## J-8 inside part 2b (P-728)
R1.8's capability line (`product/qa/CAPABILITIES.md` line 145 on `main`): "Every create, change and delete on PF/FO tables writes who, when, before and after; UPDATE or DELETE on the audit table refused by the database even for the app's role (fail case); a line with another firm's id refused". qa lists the parts left as AUD-1b (merged #2124), AUD-1m parts 1, 2a, 2b, and PF-0a. **PF-0a is Lead B's;** if it is not on `main` when 2b is ready, J-8 names it as not yet joined and Lead 90 decides whether R1.8 waits for it.

Add `tests/journeys/j_8.ts` on an isolated copy (`tools/isolated.sh`, own database and port, never :4400), as `tests/journeys/j_6.ts` does:
* **Swaps shown real (DW lines; each also fails against its stand-in, the "NR" lines):**
  * **DW1, one writer:** a case action, a document action and a library action each write exactly one line through the adapter; the grep check (CW1) passes on the tree. Fail: a stand-in direct write is caught.
  * **DW2, typed actor and case id:** each line carries `staff:<id>` (or the simulated person's word) and, for the case action, the case id. Fail: an act with no session gets 401 and writes no line.
  * **DW3, insert-only:** as the app's role `xr_app`, UPDATE on `audit_event` is refused ("permission denied") and DELETE is refused by the trigger. Fail: none needed beyond the refusal itself; the stand-in is a direct UPDATE that must not change the row.
  * **DW4, firm walls:** a line with another firm's id is refused (AUD-1b's rule), and firm A's case feed never shows firm B's lines.
  * **DW5, transactions:** an action that fails after its audit line rolls the line back with it.
* **The walk (W lines), in a visible browser (HEADED=1) and as a scripted check, Sample rows only:**
  * **W1:** staff open a Sample case, record an answer and move a stage; the case's feed shows both lines with who and when.
  * **W2:** staff supply a document on the case; the feed shows it.
  * **W3:** a configurator user changes a library item; the platform trail shows the line with before and after.
  * **W4:** the walk ends at the next capability's first step: the case's timeline (R1.77's walk) or the firm audit view if it exists (R1.88 is not built: say so, do not build it).

## Done when (P-606), both parts
* `tests/check_aud1m_case_writes.ts` passes, with its `LEFT` map updated, every CW line with a pass and a fail.
* Every case suite passes unchanged, and AUD-1a's and AUD-1b's suites (`check_aud1a_insert_only.ts`, `check_aud1b_adapter.ts`) and `check_case_feed.ts` pass unchanged.
* The firm's case feed shows the same lines as before on the demo (compare one Sample case before and after).
* `node studio/tools/check-port-contracts.mjs` exits 0; module cards: card lines or `Card unchanged: <reason>` for each module touched; full `ci` is green.
* 2b only: `tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_8.ts` exits 0 on its own isolated copy, every DW and W line passes and every DW line fails against its stand-in; axe-core clean on each screen walked; 1024 and 1440 px with no sideways scroll. The PR body says "Completes: R1.8" only if PF-0a is on `main`; otherwise "Completes: R1.8 (pending PF-0a)".

**Duplicate check:** `git grep -lE "j_8\.ts|J-8\b" origin/main -- prototype/studio/tests` → 0 files (checked 19 Nov 11:5x IST).

**Review:** an Opus reviewer (the row says reviewer only).

**Standard rules:**
* One part, one PR. Get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft (P-683).
* A dequeued PR merges `main` again within 30 minutes and takes a diff-only Approve (P-721).
* Never push to an open PR unless it is a fix. Push after every step (P-557).
* Live AI off, US$0, never a priced button (P-175). Sample facts only.
* Questions go on the branch or the PR as "Question for the tech lead: …"; Build Lead C answers within 30 minutes.
* If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on.
* Repository: `expat-ready/xpatready`.
