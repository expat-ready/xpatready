# Brief: CS-K1, the case's firm id and client record (cloud builder lane; row owner Build Lead C)

Written 18 Nov by Build Lead C. **Draft until Build Lead C approves it.** The specification is the draft `product/design/briefs/CS-K1.md` on `main` (16 Nov, case-side shaping lane), part 1; where this page differs, this page wins. BACKLOG row **CS-K1** (`product/BACKLOG.md` line 1079 on `main` 15c75cd52). Release 1 row **R1.72** (map 72, "Case with applicants, representative, pinned release"); it sits on the internal critical path AUD-1b → CS-W1 → **CS-K1** → FO-8 → CS-98r (end-to-end review of 18 Nov, line 552).
**PR title:** `runtime: CS-K1 part 1 — the client record and a client on every case`
**Model:** Opus 5.5, effort high (schema, a backfill on every case, a hook in `createCase`).

**Ready when:** **CS-W1 is merged on `main`.**
* CS-W1 (the text firm key becomes the platform firm id) is in flight in a cloud lane. **CS-W1 PR: not yet open (18 Nov)**: no CS-W1 commit in the last 400 commits of `main`, no CS-W1 branch on the remote, and BACKLOG still lists it as a row.
* Both rows touch `prisma/schema/cases.prisma` and add a migration folder, so they go in series (P-526b, P-576). The `cases.prisma` holder in STATE is CS-W1 until it merges, then this lane.
* CS-C1a (#1818) and CS-C1b (#2002) are on `main` (verified: `api/src/case-close.ts`, `api/src/case-count.ts`, `tests/check_csc1_close.ts`, `tests/check_csc1_count.ts`).
* Part 2 (CS-K1b, the `fo_person` link through a front-office port) is **not** in this brief: it waits on a `FoPersonPort` row that does not exist yet (draft, "Contract gap").

**What to build:** the draft's part 1, exactly, with these changes for CS-W1 having landed first:
* **Firm id:** `case_client.firm_id` is the case's own `firm_id` that CS-W1 adds to `Case`, not a look-up of `platform_firm` by `firmKey` as the draft says (the draft was written before the swap; BACKLOG CS-W1 says "swap allowed"). Not verified: CS-W1's final column name; read it on `main` after it merges.
* **Schema** in `cases.prisma` and **one** migration folder (stamp later than every migration before it; functions named `case_client_*`): `case_client` with id, `firm_id`, `workspace_id`, `client_number` (per firm, shown as "Client code" `CL-00001`, from a per-firm counter in the same transaction, never reused), `display_name` (1-200 characters, CS-C1a's text checks), `display_kind` `PERSON | COMPANY`, `fo_person_id` and `fo_company_id` (uuid, null, at most one set, a CHECK), `prospect_id` (uuid, null, unique per firm when present), `file_owner` (null), `contact` (json, null), `created_by`, `created_at`. `Case.client_id` with a firm-matched foreign key to `case_client`. **No foreign key** into `front-office-sales.prisma` (contract §1 rule 4).
* **Backfill in the same migration:** one client per existing case (people stay per case, §5), named from the principal's display name; `COMPANY` when the case's pathway is `CORPORATE` (Lead 60's ruling 4 on #1818: the pathway node's client type; `case-close.ts:72` already reads `client_type` this way). Then `SET NOT NULL` on `client_id`.
* **`createCase`** (`api/src/runtime.ts:248`; the only direct `tx.case.create` in `api/src` is `runtime.ts:315`, verified): `NewCase` in `contracts/runtime.ts` gains optional `clientId`. Given → it must be a client of the session's firm, else 404 "No such client."; it is reused. Not given → a new client is made in the opening transaction, after CS-C1b's limit check and before the case row. An opening refused by the plan limit (409) leaves no client.
* **Read routes** behind PF-4's guard, like `features/case-close.ts`: `GET /api/runtime/clients?query=` (paged 50) and `GET /api/runtime/clients/:id` (with its cases' ids and numbers), key `agent/case:show` (present in PF-3's seed, `migrations/20261114015002_pf3_platform_tables/migration.sql:593`). The case read gains `client: { id, number, display_name, display_kind }`.
* **`client.created`** is not written here (Lead 61, comment 6900282370 on #1867): a directly opened case writes an audit line only.

**Done when (P-606):**
* `tsx studio/tests/check_csk1_client.ts` exits 0. The draft's cases DW1 to DW8 each pass and fail as named:
  * **DW1:** after the migration every existing case has a client (counted against the case count); the migration refuses `NOT NULL` while one is missing (forced fixture).
  * **DW2:** a directly opened case gets the next client number; two openings at once get two numbers with no gap.
  * **DW3:** an existing client of the firm is reused (one client, two cases); an unknown id → 404.
  * **DW4:** a case on a `CORPORATE` pathway gets a `COMPANY` client; a family case a `PERSON` client.
  * **DW5:** firm B cannot pick, list or read firm A's client (404 on every route); firm A's client is unchanged.
  * **DW6:** both front-office ids set → refused by the database; the same `prospect_id` twice in one firm → refused; in two firms → allowed.
  * **DW7:** an opening refused by the plan limit (CS-C1b's test port) leaves no client.
  * **DW8:** the migration test follows rev 16.7; `migrate diff` empty; every function is `case_client_*`.
* One more case: **DW8a:** the client's `firm_id` always equals its case's `firm_id` (CS-W1's column); a forced mismatch is refused by the foreign key.
* `check_csw1_firm_id.ts` (CS-W1's), `check_csc1_close.ts`, `check_csc1_count.ts`, `check_a24_case_number_api.ts`, `check_case_feed.ts`, every case suite, the demo reset and the checkpoint load (C10.1) pass unchanged.
* The module-card check passes; full `ci` is green.

**Duplicate check:** `git grep -n "case_client\|caseClient\|clientId" origin/main -- studio/api/src studio/prisma/schema` → no client record; the only hits are `clientId: null` in the `case.closed`/`case.reopened` events (`case-close.ts:131, :146, :162`) and the sign-in settings' `clientId`.

**Touch list:**
* `prisma/schema/cases.prisma` and one new migration folder
* `contracts/runtime.ts` (`NewCase` gains optional `clientId`)
* `api/src/runtime.ts` (the hook in `createCase`; the case read's `client` field)
* new `api/src/clients.ts` (service and the one helper loaders use)
* new `api/src/features/clients.ts` (the two read routes)
* `api/src/employer-cases.ts` (named by the BACKLOG row; Not verified: what it needs, since it has no `createCase` or `case.create` call on `main`; if nothing, leave it untouched and say so in the PR)
* `api/src/case-feed.ts` (one line: `case client` in `CASE_ENTITIES`)
* `api/src/MODULE.cases.md`
* new `tests/check_csk1_client.ts`

No screen.

**Review:** an Opus reviewer **and the breaker** (schema, a backfill on every case, P-278). **The Lead reads the migration (P-423)** before the label. The breaker tries:
* DW1 on a copy with many cases and a case whose principal has no profile;
* DW2 with openings in parallel;
* DW5 through the API with firm B's session;
* a `clientId` of another firm passed in the opening body.

**Holds and parallel safety:**
* `cases.prisma` is a baton: **after CS-W1**, **before** CS-T1, CS-K2, CS-K3 and CS-W2.
* `createCase` in `runtime.ts`: after CS-C1b (on `main`); FO-8 and CS-98b call it later with a `clientId`.
* `case-feed.ts`: one line, as others add theirs.
* `ports/`, `ports/events.ts` and `core.ts` are untouched. The events' `clientId: null` stays until the tech lead answers the question below.

**Questions for the tech lead (in the PR):** (1) should `case.closed` and `case.reopened` now carry the case's `client_id` instead of `null` (`case-close.ts:131, :146, :162`; one line each, outside this touch list)? (2) Part 2's `FoPersonPort` row and who builds it (draft, "Contract gap").

**Standard rules:** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610); if it must split, ask first in a PR comment (the draft's split: the read routes and DW5 move to part 2). **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Build Lead C answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`.

**Audit actors (Lead 80, 18 Nov, after #2003 AUD-1a):** the audit trail refuses an actor word with no type. A test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people (`user-A/B/C/O/R/T/S` staff, `user-P/Q` clients), never a bare word like `test`. Once #2003 is on `main`, merge `main` before the first push.

**Build Lead C rulings (18 Nov):**
* (1) Yes. `case.closed` and `case.reopened` carry the case's `client_id` once the client record exists. `case-close.ts:131, :146, :162` join the touch list for those three lines only, with a test case for each.
* (2) The `FoPersonPort` row is a front-office row and goes to the current Lead to assign. Part 2 stays out of this brief.
* `employer-cases.ts`: drop it from the touch list unless the build shows a case is created there. If one is, say so in the PR body.
