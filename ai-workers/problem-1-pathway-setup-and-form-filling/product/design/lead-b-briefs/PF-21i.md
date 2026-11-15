# Brief: PF-21i, recording a complaint is idempotent (map row 109) (cloud builder lane; row owner Lead B)

Drafted 16 Nov 02:0x IST by the shaping lane, for Lead B's approval (P-558). Row: BACKLOG **PF-21i** (rev 16.24, #1823 M1). Map row 109 (complaints record) has PF-21 and PF-21w on `main`; PF-21v is in PR #1848; PF-21i is the last API part before PF-21s's build and J-109. **Model: Opus 5.5, effort: high** (schema; reviewer and breaker at high, P-605).

**Starts when:** PF-21v **#1848** is on `main` (it changes `complaints.ts` and `routes.ts`, both on this touch list; P-526).

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-21i` and take **one row, PF-21i, one complaint per request**, end to end on a fresh branch from `origin/main`, one PR.

**Read only these:**
* the BACKLOG row PF-21i (rev 16.24) and STANDARDS §4 line 27 ("[M] Idempotent creates and job launches"); the complaint rules are the row's own Sources (Code SOR/2022-128 s. 24(3)(r)(v), 29, 37, as PF-21 cites them; Unconfirmed: no counsel): this row adds no complaint rule, only the safe repeat;
* the IETF draft "The Idempotency-Key HTTP Header Field" (httpapi working group, `draft-ietf-httpapi-idempotency-key-header`): read its newest version at datatracker.ietf.org and quote, with the date read, the lines on the header's form, the reuse with a different payload, and the concurrent-request answer (P-170); where this brief differs from the draft, the brief's answer stands and the PR says so;
* on `main`: `prisma/schema/platform-register.prisma` (`PlatComplaint`), `api/src/platform/complaints/complaints.ts` (`record`, `commit`, the reminder job and `complaint.received` outbox line), `complaints/routes.ts` (`@Post()`), `tests/check_pf21w_routes.ts` (the create calls you add the header to);
* the module card `api/src/platform/MODULE.md`.

**What to build:**
1. **Schema** (one migration in `platform-register.prisma`, stamp later than `main`'s newest, P-600): `plat_complaint.request_key text NULL` and `request_hash text NULL` (SHA-256 of the canonical request body), with a partial unique index on `(firm_id, request_key)` where `request_key IS NOT NULL` (existing rows keep NULL).
2. **Route:** `POST /api/platform/complaints` reads `Idempotency-Key` (1-255 visible ASCII characters; a quoted string per the draft is accepted with its quotes stripped). No header → 400 problem "Send an Idempotency-Key header with each new complaint." (`code: "IDEMPOTENCY_KEY_MISSING"`).
3. **Service:** `record(ctx, input, key)` looks the key up inside the transaction under `pg_advisory_xact_lock` on `plat-complaint-key:<firm>:<key>` (the FO-3 lock pattern); a found row with the same `request_hash` returns that complaint's view with **200** and writes nothing (no second event, audit line, outbox row or reminder job); the same key with a different body → **422** "This request key was already used for a different complaint." (`code: "IDEMPOTENCY_KEY_REUSED"`); a new key creates as today (**201**).

**Done when** (P-606: list the cases in the PR body first; the reviewer ticks one per line). In `tests/check_pf21i_idempotent.ts`:
* `PF-21i DW1 pass/fail`: three posts with one key and one body → one `plat_complaint`, one `RECEIVED` event, one `complaint.record` audit line, one `complaint.received` outbox row, one reminder job (counted); the second and third answer 200 with the first's id.
* `PF-21i DW2 pass/fail`: the same key with a different summary → 422 with the words above, and nothing new is written.
* `PF-21i DW3 pass/fail`: two parallel posts with one key → one row, one answer 201 and the other 200 with the same id (run 20 times).
* `PF-21i DW4 pass/fail`: no key → 400 `IDEMPOTENCY_KEY_MISSING`, nothing written; a 256-character key → 400.
* `PF-21i DW5`: the same key in firm A and firm B makes one complaint in each (the key is per firm); firm B's answer never names firm A's id.
* `PF-21i DW6`: the migration test in a parallel world (rows rev 16.7): migrate up on a copy of `main`'s schema with existing complaints; PF-21, PF-21w and PF-21v's suites pass with only the header added to their create calls.

**Duplicate check:** BACKLOG (PF-21i; PF-21s's "fresh `Idempotency-Key` on Record" is the screen half), open PRs (#1848 touches the same files, hence the wait; no PR adds an idempotency key at 02:0x IST 16 Nov), `main` (no `Idempotency-Key` anywhere in `api/src`), BUGS (none); one `Duplicate check:` line after re-running it.

**Touch list:** `prisma/schema/platform-register.prisma` + one migration folder, new `api/src/platform/idempotency.ts`, `api/src/platform/complaints/complaints.ts` (`record` only), `complaints/routes.ts` (the `@Post()` line and the header read), `tests/check_pf21i_idempotent.ts`, `tests/check_pf21w_routes.ts` and `tests/check_pf21v_views.ts` (the header on their create calls only), `api/src/platform/MODULE.md` (invariant "a complaint create is idempotent by `Idempotency-Key`"; tests line).

**Contract used:** none new; PF-21's `complaint.received` event (`ports/events.ts`) is unchanged. **Contract gap (named in the batch PR):** this is the first `Idempotency-Key` door on `main`; STANDARDS §4 asks it of every create. The parsing, lock and hash are written as one small helper in `api/src/platform/idempotency.ts` so later creates reuse it; a cross-module use would move it to `ports/`.

**Parallel safety:** waits on #1848 (same `complaints.ts`, `routes.ts`, `MODULE.md`, `check_pf21w_routes.ts`). `platform-register.prisma` is also PF-21b's and PF-21c's file (not started): whichever of them starts second waits for this one (one schema PR per file at a time, P-600). PF-21s stage 2 builds after this row (rev 16.24).

**Reviewer and breaker** (P-278: schema): the breaker tries parallel posts, a reused key across firms, a key with control characters, and a body that differs only in key order (the canonical hash must treat it as the same).

**P-610:** under 800 changed lines (estimate ~350); no split.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.
**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
