# Brief: AUD-4, the firm reads its own activity log (API), then AUD-4s part 2 (the screen) with J-88 (cloud builder lane; row owner Build Lead C)

Written 19 Nov 20:5x IST by Build Lead C (3), at Lead 94's word (P-740: about 9 Proven a day). The draft `product/design/briefs/AUD-4.md` on `main` is the specification for AUD-4. **This page approves it, as row owner**, after checking it against `main` 6f2caced0. **This page wins** where they differ. Release 1 row **R1.88** (`qa/CAPABILITIES.md` line 216, Not built): "An Owner or Admin filters by person, record and date and exports; other roles refused".

**One lane, two PRs, back to back (P-733):** AUD-4 (API), then AUD-4s part 2 (the Activity log page) with **J-88** inside. Proof is automatic at the second merge.

**PR title (first):** `runtime: AUD-4 — the firm reads and exports its own activity log (agent/audit:read)`
**Model:** Opus 5.5, effort high (permissions, cross-firm reads). Reviewer **and breaker** (the draft's breaker list).

**Ready when:** now. AUD-1a (#2003), AUD-1b (#2124) and AUD-1m part 1 (#2214) are on `main`. Checked on `main` 6f2caced0:
* `audit_event` has `firm_id`, `case_id`, `actor_type` (FIRM_STAFF, OUR_STAFF, CLIENT, SYSTEM, SEED) and `support_session_id`, with the index `(firm_id, at)`.
* Every file in the draft's "Read only these" exists. `api/src/platform/audit/firm-read/` and `csv.ts` do not exist yet.
* `git grep "audit:read" api/src` finds nothing, so there is no firm-side read yet.

**Corrections to the draft (as of 19 Nov):**
1. **No integrity line.** AUD-1c is parked (#2129, P-707), so there is no `GET /api/platform/audit/integrity`. R1.88's line doesn't need one. This row neither adds nor calls one, and `check_aud1c_verify.ts` is not in Done when.
2. **The case side's lines now have a `firm_id`.** AUD-1m part 1 is merged and part 2a (#2289) is queued. Show case lines under "Cases" from the start. Name in the PR body any case writes still direct (CW1's `LEFT` map on `main` at the time).
3. **The Person filter has a source** (the AUD-4s challenge, Major M1). `GET /api/platform/audit` also answers `people: [{ staffId, name, active }]`: the firm's staff who have at least one line in the firm's log, deactivated people kept. Add case **AUD-4 DW9**: a person deactivated before the read is in `people` with `active: false`, and filtering by them returns their lines. Fail: another firm's staff are never in `people`.
4. **Setting lines' value shapes.** AUD-1m part 2c (ruling (A1) on #2289) will store a long or nested setting value as pieces that join back (`fromJson` / `toJson`). Keep the "field: old → new" pair reader in one function in `render.ts`. If 2c is on `main` before this PR opens, read the pieces too, with a pass line. If not, 2c adds that shape to this function (Build Lead C tells 2c's lane).
5. **Our staff's names:** "ExpatReady staff" outside a support session, as the draft says. PF-4s's name read is not on `main`.

**What to build, touch list, DW1-DW8, Done when, breaker list:** as the draft, with the corrections above.

**Then AUD-4s part 2 (second PR, same lane), after AUD-4 merges:**
* **Concept first.** Build Lead C approves the concept and writes `product/screens/AUD-4s/concept.md` from `concept-draft.md` and `challenge.md`'s seven Majors (on `main`). Do not start the screen until `concept.md` is on `main` or on `claude/build-lead-c-647b40`. Build Lead C writes it while AUD-4 is in review.
* **Build:** the screen from `concept.md` and the draft `design/briefs/AUD-4s.md` part 2. It calls only AUD-4's two routes.
* **J-88 inside**, `tests/journeys/j_88.ts`, run on an isolated copy (`tools/isolated.sh`), in the J-77 pattern:
  * DW lines, each failing against its stand-in: the firm comes from the session; a role without the key is refused in the screen's words; the export writes its line before its data.
  * The walk (W): an Owner filters by person (including one who left), by record and by dates, opens a line's "field: old → new" and its Advanced details, and exports a CSV. Then an Admin does the same, and a Case Officer is refused.
  * axe-core clean, at 1024 and 1440 px.
* **PR title:** `screens: AUD-4s part 2 — the firm's Activity log page; J-88 joined and walked`. The body says "Completes: R1.88".

**Parallel safety:** all new files except `api/src/platform/MODULE.md` (one sentence). No migration, and no edit to `ports/`, `audit-event.ts` or `case-feed.ts`, so it runs beside AUD-1m 2a/2b/2c and CS-NT1. AUD-3 part 2 imports `csv.ts` and starts after this merges. A new index in the `audit.prisma` series is a stop-and-ask.

**Duplicate check:** `git grep -nE "audit:read|firm-read|audit/csv" origin/main -- prototype/studio/api` returns 0 files, and no open PR touches `api/src/platform/audit/` other than #2129, which is parked (checked 19 Nov 20:5x IST).

**Rules (standard, every Build Lead C brief, P-644):** Opus 5.5 at the effort above, no model switch mid-session (P-605, P-608). **Whole part first** (P-644 (1)): this PR finishes the part named here; if it must split (over 800 changed lines, P-610), stop and ask in a PR comment before coding, so Build Lead C lists the sub-parts first. Finish whole: an item that needs more than the touch list → stop and ask in a PR comment headed **"Question for the tech lead"** (Build Lead C answers within 30 min); never widen the row silently, never leave a piece for later (P-606). One part, one session, one PR from a fresh branch off `origin/main`; new files only as listed. Duplicate check (P-526): one `Duplicate check:` line in the PR body. A **fresh Opus reviewer** (P-303); re-review reads only the new commits (P-277). The label `review: approved` only after `Reviewer: Approve <sha>` on the exact head, as a line of its own, **and** green CI on that sha (P-277, P-385); the Lead applies it (P-384); never push to a PR carrying `queued`. Merge `main` only on a conflict (P-270). Before asking for the label after a failed merge batch, name the failing suites and show them covered (P-731 (2)). **Live AI off, US$0, never a priced button, no real keys** (P-175). Times only from the clock port (P-607). Push after every step (P-557). Event names from `ports/events.ts`. Report to the current Lead (`tools/current-lead.sh`) for the queue and to **Build Lead C** (row owner, branch `claude/build-lead-c-647b40`, state file `product/design/build-lead-c-state.md`) for the row. Read only the files this page and the draft name and the code you change (P-556).

**PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix.

**Part 2 notes after #2339 (Build Lead C (4), 23:1x IST 19 Nov; Lead 96 agreed):** `screens/AUD-4s/concept.md` is on `main` (#2314, 89512b745). Read it with these two facts of the merged API, which win over C4 and C7 where they differ: (1) the page renders the answer's `areas` (seven: adds "Configuration" and "Other"), never a fixed list; (2) the page shows `who` exactly as the API gives it ("ExpatReady support" in a support session, "ExpatReady staff" otherwise). The shortcut's query parameter is `ours=1`.
