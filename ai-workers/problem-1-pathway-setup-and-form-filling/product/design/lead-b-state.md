# Lead B — state and hand-over (P-557: always committed, always resumable)

**Lead B (3) (session `local_59938793…`, worktree `lead-b-front-office-238861`) took over 14 Nov 09:44 IST from Lead B (2) (`local_0dd43ee4…`, stopped at ~45% context, P-565; idle and clean when checked).** Lead B (2) ran from 14 Nov 07:56 IST. Hand-over written 14 Nov 07:53 IST by Lead B (1) (session `local_9bced770…`) at ~52% context, per P-565. A fresh Lead B starts here, on branch `lead-b-front-office` (GitHub), in its own worktree. Do not run `/lead` (the release holder's skill).

**Lead B (4)** (session titled "Lead B (4) · 15 Nov 07:42 IST", transcript `8d7cbb10…`, same worktree and branch) took over 15 Nov 07:42 IST from Lead B (3) (`local_cc58440f…`, parked at 53%). Its own START HERE is written at its hand-over; until then the section below stands.

**Lead B (5)** (session titled "Lead B (5) · 15 Nov 10:02 IST", transcript `af59e652…`, same worktree and branch) took over 15 Nov 10:02 IST from Lead B (4) (`local_64f5d828…`, ~43% context, P-565); started by Lead 53 (`local_cbc405f5…`). Start read: RULES.md as of P-607 (from `origin/lead/2026-11-07-lead31`; this branch's copy is older) and the START HERE below. Its own START HERE is written at its hand-over.

**Lead B (6)** (session titled "Lead B (6) · 15 Nov 13:42 IST", transcript `af87b6ec…`, same worktree and branch) took over 15 Nov 13:42 IST from Lead B (5) (`local_552b9387…`, old account) on the new account; started by Lead 56 (`local_119f0fcb…`). Start read: RULES.md as of P-612 (from `origin/lead/2026-11-07-lead31`) and the START HERE below. Its own START HERE is written at its hand-over.

**Lead B (6) live (07:3x IST 16 Nov):** the current Lead is **Lead 64** (`local_7cc4b360…`; before it Lead 63 `local_cdb44e83…`, Lead 62 `local_be1be806…`, Lead 61 `local_14ad6773…`). Latest rev 16.52 (P-630: `lead-b-briefs/P-630-amendments.md`, gate entries 15-17) (P-627/P-629 amendments: `lead-b-briefs/P-627-amendments.md`; P-626 order: `lead-b-briefs/P-626-order.md`; batch 6 #1908 comes after it); the feeding Lead is Lead 57 (`local_bef741db…`). Lanes running on Lead B rows: FO-4 (#1822), PF-19b (#1824), PF-21w (#1823), PF-21s stage 1, FO-3sc (#1819, approved r2), PF-Lc, FO-2 (#1813), PF-4b (#1816), PF-5 (#1815), FO-3sr (#1811, held for its AG-4-67 fix). Rows rev 16.17-16.26 are all in BACKLOG (the last copy is 797268043). Briefs are ready and waiting on #1811: FO-3pa, FO-3sa, FO-3m. Owed: PF-6 and PF-5s briefs when PF-4b lands; FO-7mv when FO-7a #1758 merges. Scan: `lead-b-tools/scan-pr-questions-gql.py`, one GraphQL call every 3 min.

**Lead B (6) live (14:29 IST):** the current Lead is **Lead 58** (`local_5bec64f9…`); the feeding Lead is Lead 57 (`local_bef741db…`). The founder started cloud lanes for FO-4 (brief 9ebb5da30), PF-19b (9446bd33a), PF-21w, PF-21s stage 1 and FO-3sc; Lead 57 holds a PF-Lc card (cec0fc01c). Rulings given today on PR comments: #1813 FO-2, #1815 PF-5, #1816 PF-4b. Rows rev 16.17-16.20 are waiting for Lead 58 to copy. Owed: PF-6 and PF-5s briefs when PF-4b lands; FO-7mv when FO-7a #1758 merges. GitHub REST is shared by all sessions (ran out 14:2x); the scan loop posts through GraphQL when it must.

## START HERE: hand-over Lead B (5) → Lead B (6), written 15 Nov 13:24 IST before the account switch (Lead 55's ask)

**Lead B (5):** session titled "Lead B (5) · 15 Nov 10:02 IST" (transcript `af59e652…`), worktree `lead-b-front-office-238861`, branch `lead-b-front-office`.
* Push with `git push origin HEAD:refs/heads/lead-b-front-office` (allowed domain github.com).
* **The current Lead is Lead 55** (`local_1ddb0c4c…`, from 11:49 IST). Always check `tools/current-lead.sh` on `origin/lead/2026-11-07-lead31` first; Leads changed three times today.
* **RULES:** read the copy on `origin/lead/2026-11-07-lead31`; this branch's copy is old. Since P-607, two rules matter here:
  * **P-610:** a PR stays under 800 changed lines, tests included; a brief names its split point; re-review reads only the new commits.
  * **P-612:** the three sign-off keys need a licence record, a recorded departure from SA-6-27.

**All Lead B rows up to rev 16.16 are in BACKLOG** (the Leads confirmed each copy; nothing is left to copy). Briefs are in `lead-b-briefs/`: PF-6b, FO-3h, PF-0c, PF-23w, FO-5f2 and J-rows (J-24 to J-48).

**PRs at 13:24 IST:**

| PR | Row | State | Next step |
|---|---|---|---|
| #1800 | PF-23w | labelled, queued | Merges by itself. Rulings given: the walk is API-only, W4 moved to J-37; two assertions changed in `check_pf23_observability.ts` |
| #1808 | PF-6b | open, not labelled | P-612 passed (comment 6891179666), and Q2/Q3 agreed. Watch for review findings. **Shares `retainers/service.ts` with #1809:** the second to merge merges `main` in |
| #1809 | FO-5f2 | draft | Q1-Q3 accepted (comment 6891234464): async rendering, four more allowed parts with customXml still read for tags, and the python-docx Word sample for now |
| #1758 | FO-7a | draft | The split was confirmed: FO-7a keeps the base tables, fixes B-20/B-21 and gets one diff-only pass. The move list is the new row **FO-7mv** (rev 16.14; brief not written yet) |
| merged today | FO-3f #1785, FO-5f #1791, PF-0c #1797, FO-3h #1799, FO-13 #1755 | — | — |

**Owed and next, in order:**
1. **Watch:** restart the scan loop (it stops only on questions):

   `cd design/lead-b-tools && while true; do out=$(./scan-pr-questions.sh 2026-11-15T04:00:00Z | grep -E "WATCH-ERROR|^#.*[Qq]uestion"); [[ -n $out ]] && { echo $out; exit; }; sleep 180; done`

   `seen.txt` holds what was handled (not committed).
2. **Briefs to write** (P-606 named DWn cases; the P-610 split point; the standard rules line from `FO-3f.md` plus the P-610 sentence):
   * **FO-7mv**, when FO-7a merges (rev 16.14 has the row);
   * FO-3sr's brief exists as `ROW-w.md`; check it against P-606/P-610 before its lane starts.
3. **J-rows:** each starts only when every part it waits on is on `main`. J-24, J-38 and J-37 also wait on FO-3w (no public booking page on `main` yet), and J-38/J-37 on PF-4b's demo-inbox mail adapter (the running app's booking mail is `fakeMail` in memory).
4. **Known gaps recorded:**
   * a reminder that comes due after a restart sends nothing until FO-2 (`fakeArrival` is in memory);
   * qa's QA-470 check needed three job lines; qa did it in #1805.
5. **Concepts still due** (skill screen-concept): FO-3sc first, then FO-7s0, PF-R3, PF-29f, PF-30s, FO-9s, FO-12s, FO-13s, PF-19s, PF-20s, PF-21s/rs, PF-17, PF-18s.
6. **Founder questions:** none open from Lead B.

**Lessons from Lead B (5):**
* Read every cited requirement line **in full** (the trace tool prints it) before ruling. I read 400 characters of SA-6-27 and missed "the permission system never checks licence" (it became P-612).
* The duplicate check covers **row ids** too: FO-7m already existed, so the new row became FO-7mv.
* Before naming a walk's screen or mail path, check it exists on `main` (#1800).
* Check the row's facts against `main` before briefing. Rows assumed a permission catalogue table, custom roles (X-1), MailPort's real adapter and office time zones, none of which exist.
* In zsh, backticks inside double quotes run as commands: write PR comments to a file and post with `python3 -I` + curl.
* `$TMPDIR` is shared: a stray `grp.py` there broke Python; run scripts from the session scratchpad with `python3 -I`.
* Times only from `TZ=Asia/Kolkata date`: I wrote "10:2x" once and fixed it.

## START HERE: hand-over Lead B (4) → Lead B (5), written 15 Nov 09:3x IST at ~43% context (P-565)

**Lead B (4):** session titled "Lead B (4) · 15 Nov 07:42 IST" (transcript `8d7cbb10…`), worktree `lead-b-front-office-238861`, branch `lead-b-front-office`. Push with `git push origin HEAD:refs/heads/lead-b-front-office` (allowed domain github.com). The Lead B (3) section below is an earlier record.

**The current Lead and release holder** is **Lead 53** (`local_cbc405f5…`, from 15 Nov ~09:5x IST; earlier Lead 52 `local_e0cd21a4…`) unless `tools/current-lead.sh` names a later one. Report to the current Lead. It copies our rows into BACKLOG, labels PRs, reads migrations and CI diffs (P-423), and takes questions to the founder one at a time.

**What Lead B (4) did (all pushed; each item is in the log below):**
* **Rows rev 16.7 to 16.11** (`design/lead-b-rows-2026-11-14.md`):
  * 16.7: migration tests in a parallel world, added to the schema briefs;
  * 16.8: FO-5f, FO-3f, PF-4f;
  * 16.9: a `Source:` for every PF/FO row;
  * 16.10: qa R1 rows (PF-6b, FO-3h, case-side drafts CS-DL1 and CS-NT1);
  * 16.11: **P-606**, the DWn test-case naming rule, J-rows (join and walk), PF-0c (port contract tests), and the **19 started capabilities ranked, with their missing parts and pull order**.
  * **All of revs 16.7 to 16.13 and Batch 5 are in BACKLOG** (Lead 53 checked line by line: e500e3a7c, a859caa70). Earlier status: 16.10, 16.11, **16.12** (edits to existing rows, the X additions, P-607) and Batch 5 have been sent to Lead 52 to copy. 55 shaping rows are in BACKLOG (6005ba666).
* **P-604 shaping lanes, all reviewed:** `design/lead-b-shaping-approvals-2026-11-15.md`, Batches 1-4. **Batch 5 is the consolidated platform rails**, after Lead 52's ruling that platform owns tasks (PF-29a-f), find (PF-30a/s), reports (PF-R*) and the file rail (PF-F2 on tus, PF-F3, PF-F4); the case side registers on them. Duplicates of the release holder's case-side draft 2 were dropped.
* **College facts read at source:** `design/lead-b-college-facts-2026-11-15.md` (client files kept 6 years after closing; a monthly trust reconciliation within 90 days; the licence number has no published format). This closes open item 16.
* **Briefs written:** FO-5f, FO-3f, PF-4f. FO-2 and FO-6 gained carried lines.

**Open for Lead B (5):**
1. **Watch:**
   * restart `design/lead-b-tools/scan-pr-questions.sh 2026-11-15T04:00:00Z` (row questions on PF/FO PRs) in a background until-loop; its `seen.txt` holds what was already handled;
   * the shaping branches are finished, so `watch-shaping.sh` is not needed.
2. **PRs in flight:**
   * FO-3f #1785 (reviewer and breaker running);
   * PF-4f #1784 (labelled);
   * FO-5f #1791 (draft);
   * FO-13 #1755 (re-stamp after #1777, which has merged);
   * FO-7a #1758 (stale since 14 Nov 19:55 IST; round 4 agreed);
   * #1782 (PF-23's CI step, the Lead's).
   * When FO-3f merges, PF-23w, FO-3h and FO-3sr can start.
3. **Briefs to write next (P-606 rules: name the DWn cases, J-rows last):** PF-6b, FO-3h, PF-0c, PF-23w (S1's row text plus rev 16.10's lines and amendment C), then J-row briefs in rev 16.11's rank order. Use rev 16.11's pull order.
4. **Founder questions: all answered on 15 Nov as P-607** (as recommended, except LMIA, which stays in Release 1 and is scheduled last). Rev 16.12 applies them. The list as it was asked:
   * S3 Q2: trust never below zero;
   * S3 Q4: a typed government-fee line;
   * S3 Q7: ZIP refused;
   * S2 Q1: LMIA timing;
   * S2 Q2: which provincial streams;
   * S2 Q5: review before sharing;
   * S1 Q1: the domain;
   * S1 Q3: fail-closed audit;
   * S1 Q4: Object Lock compliance on the **audit archive** only (PF-8rc's backup vault stays in governance mode, a separate resource);
   * S1 Q5: support sessions.
   * Amend a row only if the founder says no.
5. **Concepts still due** (skill screen-concept): FO-3sc, FO-7s0, PF-R3, PF-29f, PF-30s, FO-9s, FO-12s, FO-13s, PF-19s, PF-20s, PF-21s/rs, PF-17, PF-18s. The founder's look at FO-4, PF-6, FO-5s and PF-5s is still due.

**Lessons from Lead B (4):**
* **The duplicate check must include the release holder's draft files** that are not yet in BACKLOG (`design/case-side-rows-draft2-…` on the lead branch). Missing them let the shaping lanes duplicate 13 case-side rows.
* **A ruling that departs from the team's requirement is only a recommendation:** the founder confirms it (P-566). Check the lane's "founder" marks before ruling.
* **Use timestamps only from `TZ=Asia/Kolkata date`.** Lead B (4) guessed "+1 hour" three times and had to correct it.
* **Weekly use rose from 79% to 86% in two hours** (the founder switches accounts at 95%, A68). Keep turns small, and do mechanical checks by script before reading rows.

## START HERE: hand-over Lead B (3) → Lead B (4), written 14 Nov 23:03 IST at ~46% context (P-565)

**Lead B (3)** is session `local_59938793…`, worktree `lead-b-front-office-238861`, branch `lead-b-front-office` (push with `git push origin HEAD:refs/heads/lead-b-front-office`; `.git/config` can't be written from the sandbox). The sections below this one are earlier hand-overs, kept as records (P-188).

**Release holder now:** **Lead 50** (`local_1ee10674…`), unless `tools/current-lead.sh` names a later one. **P-602:** only the founder's typed turn starts sessions. Lead 49 hands next rows to the warm cloud lanes through their prompt boxes.

**The rows:**
* `design/lead-b-rows-2026-11-14.md`, all revs **through 16.6**. Everything through 16.5 is copied into BACKLOG (16.5 at 03b87cc7b); **16.6 is copied too (e5c681a94)**.
* Key rulings since rev 14:
  * **P-599:** Release 1 (production grade) by 24 Nov.
  * **P-600:** any number of schema rows at once, under five conditions: own file and migration folder; add only to own tables, with a shared model changed only directly under its own PF-0p slot comment (rev 16.6); area-prefixed functions; the stamp later than `main`'s newest, so the later PR re-stamps; the release holder reads each migration.
  * **P-601:** complaint keys.
  * **P-603:** trust money leaves only by withdrawal to an issued invoice or a refund to the client; a correction names only a withdrawal or a deposit.
  * **Rev 16.4:** a row merges as "part 1 of 2", and its staff routes follow in `<row>w`.
  * **Rev 16.5:** `PLATFORM_ENVIRONMENT` fails closed (PF-24w).

**Briefs:** `design/lead-b-briefs/` has 30-plus paste-ready briefs. Every brief carries:
* the `ports/` rule;
* `ports/events.ts` names;
* area-prefixed functions;
* run the red suites before the label;
* the P-600 re-stamp step (schema briefs).

The newest are PF-0p, PF-21, PF-23, PF-23r, PF-23m, PF-24, PF-25, **ROW-w.md** (PF-21w, FO-3sr, PF-25w) and PF-4t.

**PRs at hand-over** (read fresh from the GitHub API; `gh` can't reach GitHub from the sandbox, so use curl with `gh auth token`):

| PR | Row | State | Next |
|---|---|---|---|
| merged | PF-3, FO-1b, FO-1a, PF-L, PF-0p, PF-24 | on `main` | — |
| #1744 | PF-4 | labelled, queued | on merge, Lead 49 gives PF-4t to the PF-4 lane; PF-21w, FO-3sr and FO-5 part 2 go to their lanes once part 1 is in |
| #1759 | PF-23 | labelled, queued | Lead 48 applies its CI step after merge; then PF-23r and PF-23m (briefs ready; PF-23m has the release holder's conditions) |
| #1761 | FO-5 part 1 | ready, carries the FO-1a stray-function fix | merges before FO-13 |
| #1755 | FO-13 | draft | after #1761: merge main, re-stamp after 20261114210000, re-review (lane confirmed) |
| #1763 | PF-25 | trigger removed per Lead B; reviewer approved rounds 4-5 | Lead 49's migration read, then the label |
| #1758 | FO-7a | draft, round 4 (the last) on B-12 | another Major → the row splits (Lead 48) |
| #1760 | FO-3 | draft, round 3 | a new Major goes to the release holder first |
| #1757 | PF-14 | open | — |
| #1754 | PF-19a | draft | moves its lines under its slot; FO-1k collects its web-form key if missing |
| #1753 | PF-21 part 1 | draft | routes in PF-21w after PF-4 |

**Watching:** builders' row questions arrive as PR comments ("Question for the tech lead" or "Lead B"). Lead B (3) ran `design/lead-b-tools/scan-pr-questions.sh SINCE` (committed; run it in place, its working files are git-ignored) (curl and python, paged, skipping our own comments) in a background until-loop. **Lesson:** Python's urllib reads fail through the proxy; use curl with `--retry 3`, and print errors rather than swallowing them.

**Lessons from today:**
* Never suggest a test that lists other areas' names (the FO-13 dequeue); an area's checks look only at its own prefix.
* No trigger on another area's table (PF-25).
* Cloud lanes are one-way: post the answer on the PR, then send a message.
* Row-shape questions are Lead B's; review rounds, labels and migration reads are the release holder's.

**Open for Lead B (4):**
1. (Done: rev 16.6 is in BACKLOG at e5c681a94.)
2. Answer row questions on the PRs above.
3. Keep briefs two ahead: next are FO-1k (written; it collects every key the start-now rows left), FO-7b after FO-7a, PF-12 after FO-7a, FO-2 after PF-4 and PF-19a, PF-4b, PF-4s (PF-25w needs it), PF-5, PF-18a.
4. Concepts still to make: FO-9s, FO-12s, FO-13s, FO-7s, PF-19s, PF-20s, PF-21s/rs, PF-17, PF-18s, FO-3w, FO-3st. The founder's look at FO-4, PF-6, FO-5s and PF-5s is still due.
5. **Follow-up minors to shape as rows:** FO-3 #1760's open Minors (listed in its PR body for Lead B), PF-4t #1775 round 2's m1 (the sign-in door rule `status < 400` also passes a 404 or 5xx) and m2 (assert the doors are exactly `["POST /api/platform/session/local"]`), both in `check_forms_qa53.ts` (a case-side file: the release holder's OK); **FO-5f** from FO-5 part 2 #1777's PR-body list (B-19 to B-23, r3-m1, and the "missing" list using the template's newest placeholders); and any later PR's "Minors for Lead B" list.
6. Open item 16: the Zoom app review and the College's licence-number format (step 0 in FO-3v and PF-4c). The College's site is unreachable from cloud lanes, so the Lead reads it from the Mac.

## Who is who
* **Lead B** owns the new platform (firm sign-up, plans, subscriptions, staff sign-in and roles, walking skeleton) and front-office (enquiry → lead → prospect → booking → retainer → e-signature → payment) modules, all fenced (P-550, P-558). Writes rows and briefs on this branch; never edits `STATE.md`, `RULES.md`, `DECISIONS.md`, `BACKLOG.md`.
* **Release holder:** the current Lead (`tools/current-lead.sh`; Lead 39 `local_84c512dc…` until ~08:00 IST 14 Nov, then Lead 40 `local_7a6756d1…`, Lead 41 `local_eb5559e3…`, Lead 42 `local_110605c6…` (09:50 IST), Lead 43 `local_b5840dd3…` (by 11:22 IST), Lead 44 `local_dbdab60d…` (by 12:37 IST), Lead 45 `local_24e909a3…` (13:5x IST), Lead 46 `local_3cc8e2ba…` (by 15:46 IST), Lead 47 `local_a358e18f…` (by 17:07 IST), Lead 48 `local_1aede380…` (by 18:52 IST), Lead 49 `local_93551126…` (by 20:24 IST), now **Lead 50 `local_1ee10674…`** (by 23:22 IST)). Copies Lead B's rows into BACKLOG (section "Full MVP: platform (PF) and front office (FO)" on `lead/2026-11-07-lead31`), starts builder lanes at the founder's typed turns, asks the founder questions, holds AUD-1 (audit), the case side, firm walls and the identity join. Earlier holders: Lead 37, Lead 38 (their rulings stand).

## The files (all under `ai-workers/problem-1-pathway-setup-and-form-filling/product/`)
* `design/platform-and-front-office-contracts-2026-11-14.md` — contracts, draft 4; **§7 is binding** and overrides earlier lines; §0.8 sizing (P-562).
* `design/lead-b-rows-2026-11-14.md` — the rows; **current: rev 5.1 + P-564 (e330ac8b)**, all copied into BACKLOG by the release holder.
* `design/lead-b-requirements-trace-2026-11-14.md` — register: §A followed by requirement, §B by the CICC Code, §C Lead B decisions, §D founder questions. Evidence: `design/lead-b-trace-2026-11-14/t1..t8`.
* `design/lead-b-briefs/PF-3.md`, `FO-1a.md`, `FO-1b.md` — builder briefs (paste-ready).
* `design/tech-gate-boldsign-residency-2026-11-14.md` (BoldSign Canada: documents/audit/signers in Toronto; its email, AI, ID check in the US → our own emails, no vendor AI/ID, no integrations); `design/tech-gate-atomic-crm-2026-11-14.md` (design reference only, no code copied — Lead 39 ruling). PF-2's own tool gate is on `main`: `design/tech-gate-platform-front-office-2026-11-14.md`.
* Concepts, both **approved by Lead B after a fresh challenge (P-223 (4))**: `screens/fo-4-sales/` (concept r2, board r2, challenge with Lead response) and `screens/pf-6-staff/` (concept r2, board r1, challenge with Lead response). The founder's half-hour look at both is still due (changes become follow-up rows).

## Rows and where each stands (rev 5.1)
| Row | What | State | Next |
|---|---|---|---|
| PF-1 | web module seam | **merged** (#1711) | — |
| PF-2 | tool gate | **merged** (#1712) | PF-2b residency done by Lead B (file above) |
| PF-7 | container + CI smoke | started by Lead 37's card (check its PR with the release holder) | — |
| PF-3 | platform tables + settings home + seed | **#1728 labelled and queued** (P-423 read passed, Lead 40) | when merged: FO-1a, FO-1b and PF-4 start side by side |
| FO-1a / FO-1b | sales tables / booking tables | briefs written | start **side by side** after PF-3 merges (P-559 (3), Lead 38); FO-1a also fixes DEVELOPING.md's stale one-migration line |
| PF-4 | sign-in, roles, permission keys | **brief written** (`lead-b-briefs/PF-4.md`) | start when PF-3 merges (schema-free, so it may run beside FO-1a/1b) |
| PF-4b | staff reads, session, accept invitation, step-up, provider emails via MailPort | **brief written** (`lead-b-briefs/PF-4b.md`) | start when PF-4 merges; builder verifies 4 Cognito facts first (step 0) |
| PF-5 | sign-up + subscription (SA-04) | **rev 8.3; brief written** (`lead-b-briefs/PF-5.md`, step 0 checks Stripe) | after PF-4, holding the schema baton |
| FO-2 / FO-2b | leads + Individual prospects API / Corporate | **FO-2 brief written** (`lead-b-briefs/FO-2.md`); FO-2b shaped | FO-2 after FO-1a and PF-4 |
| FO-3 | booking API (AG-04) | shaped | after FO-1b and FO-2 |
| FO-4 / FO-4b | sales screens / script embed | shaped (concept approved) | after FO-2 and PF-1 |
| FO-5 | retainers (AG-05 rules, FilesPort, docxtemplater) | shaped | after FO-1a, PF-4 |
| FO-5b | Code s. 24(3) checklist | **build it** (Q4 decided under P-566 (3)) | after FO-5 |
| FO-6 | signing, vendor-neutral (+ P-564 email code) | shaped | after FO-5, PF-4 |
| FO-6v | BoldSign adapter, 4 conditions checked first | released by P-563 | after FO-6; needs the founder's BoldSign sandbox key for Lead B's one Mac check |
| PF-6 | staff screens (concept approved) | shaped (Q3 decided: required for all, reset button) | after PF-4b, PF-1 |
| FO-5s | retainer and signing screens | **concept r2 approved** after the fresh challenge (`screens/fo-5s-retainer-signing/`) | after FO-5, FO-6, FO-4, PF-1; founder's look due |
| FO-7a / FO-7b / FO-7c / FO-7t | money tables / invoices+receipts+offline / card via Connect Standard / trust ledger | **shaped (rows rev 7)** | FO-7a after FO-1a+PF-3; then 7b; then 7c and 7t side by side |
| PF-5s | pricing, sign-up, trial, profile, billing, hold screens | **concept r2 approved** after the fresh challenge (`screens/pf-5s-saas/`) | after PF-5, PF-4b, PF-6, PF-1; founder's look due |
| FO-3c | consultation agreement before the first consult (Code s. 23) | **shaped (rows rev 9)** | after FO-3, FO-5, FO-6 |
| PF-12 | database walls (row-level security) on PF/FO tables | **shaped (rows rev 9.1)** | after PF-4, FO-1a, FO-1b |
| PF-13, FO-9a/9b/9s, FO-10, FO-11, FO-7p | P-574: branding extras, duplicates, assignment rules, WhatsApp, payment plans | **shaped (rows rev 10)** | see each row's waits on; FO-10 needs map row 36 (automation) shaped and owned; FO-11 needs rows 48/49 (case side) |
| PF-L, PF-14, FO-12a/b/c/s | libraries in one PR, background jobs (pg-boss), automation engine, recipes, message many, screens | **shaped (rows rev 11)**; order of work by P-576 in the rows file | PF-L after PF-4; PF-14 after PF-L |
| FO-13, FO-13c/k/i/s | P-579: conflict check, complaints record, identity check | **shaped (rows rev 12)** | FO-13 after FO-1a; APIs after FO-9a/FO-5/PF-14 |
| Shaped next (no rows yet) | FO-3b paid consults (after FO-7) · PF-11 firm data download (before any real firm goes live) · FO-7s money screens (concept first, after FO-7b) · FO-8 `prospect.won` with the case side · PF-8 cloud deploy (founder's Canadian cloud account) · PF-9 firm set-up checklist and settings screen · PF-10 import with a dry run (AG-18) | | shape two ahead |

## Rulings received (all stand)
P-559 (App.tsx line; schema folder rule; P-335/P-357 amended for PF/FO) · P-560 (FO follows AG-02; `prospect.won`; a person opens the case) · Lead 37: one audit trail (`audit_event` + `AuditPort.record(tx,…)`, AUD-1, release holder's; no audit table in our modules); front office owns the lead/prospect/client activity timeline (read view); firm settings are platform's typed settings home; representative of record = Case Manager with a licence, no rename in case code (`user-R`) · Lead 38: FO-1a/1b side by side · Lead 39: Atomic CRM design reference only · founder 22:3x 13 Nov: Corporate pipeline and script embed in month one · **P-561** BoldSign on 4 conditions → **P-563** confirmed after stream 4's comparison · **P-562** size for ~100 Canadian firms (50 to start where it saves effort) · **P-564** email one-time code before signing, firm setting on by default · **P-565** sessions past ~half context hand over.

## Founder questions
All closed 14 Nov: 1 by P-561/P-563; 2 by **P-566** (self-serve SaaS sign-up); 3-5 decided by Lead B under **P-566 (3)** with evidence (register §C2, contracts §7): two-step required for all; build the s. 24(3) checklist; trust (b). The three deviations from the team's requirements (AG-1-40; AG-05 l.539-550; AG-6-70's optional trust card account) were **confirmed by the founder as P-567**. From now on, best-practice questions are decided by Lead B with evidence (P-566 (3)); only real preferences or conflicts with the team's requirements go up.

## Next step for the fresh Lead B (Lead B (3); written 14 Nov 09:31 IST by Lead B (2))
1. Read this file, then `RULES.md` on `lead/2026-11-07-lead31` (as of the newest P-), then the DECISIONS rows P-566 to P-579 touching PF/FO (P-566 self-serve sign-up; P-567 three deviations; P-571 demo reset, seed line, AUD-2; P-574 branding extras, duplicates, assignment, WhatsApp, payment plans; P-575 client money module; P-576 order of work; P-578 payment plans kept; P-579 conflict, complaints, identity). Then only what the step needs.
2. **The plan:** rows file `design/lead-b-rows-2026-11-14.md`, all sections through **rev 12**, every one copied into BACKLOG by Lead 41; the **"Order of work (P-576)"** under rev 11 plus rev 12's order line. Contracts `design/platform-and-front-office-contracts-2026-11-14.md`: §7 binding, §8 client money (owner Lead B, ids FO-7*).
3. **Briefs ready (paste-ready, `design/lead-b-briefs/`):** FO-1a, FO-1b, PF-4, PF-4b, PF-5, FO-2, PF-L, PF-14, FO-5, FO-3, **FO-7a (with rev 13's write-off and move tables)**, **FO-6**, **FO-13**, **FO-9a**, **FO-2b**, **FO-7b**, **PF-4t (next start after PF-4)**, **PF-19a (next schema slot after FO-1a)**, **PF-12 (after FO-7a, before FO-7b)**, **FO-1k (after PF-19a and FO-7a, ahead of FO-13)**, rev 16 start-now: **PF-0p, PF-21, PF-23, PF-24, PF-25** (PF-3 merged 11:25 IST). **Write next, two ahead in the P-576 order:** PF-20 (was FO-12a) and PF-4c/PF-4s, then FO-7c, FO-7t; rev 13's rows (PF-4s, PF-4c, PF-15 …) after them in its own order line.
4. **Watch:** #1728 (PF-3; approved at 2cdc2e986, in the merge queue). When it merges, Lead 41 starts FO-1a, FO-1b and PF-4 at the founder's next typed turn; then PF-L → PF-14.
5. **Concepts approved, founder's look due:** FO-4, PF-6, FO-5s, PF-5s. **Concepts still to make** (skill screen-concept: drafter → fresh Fable challenger → Lead B approves): FO-9s, FO-12s, FO-13s, FO-7s (after their APIs).
6. **Waiting on others:** the founder's four account openings (AWS for PF-4b's Cognito proof; BoldSign sandbox key for FO-6v; a Stripe platform test account for PF-5 and FO-7c; a Meta developer account and test number for FO-11), on his list in STATE; the case side's party-search read port (FO-13c) and client merge (FO-9b) in Lead 41's case-side contract v0; AUD-1 (hash chain) and AUD-2 (daily Object Lock export) are Lead 41's.
7. Push at every change (P-557); times only from `TZ=Asia/Kolkata date`; report row changes to the current Lead (`tools/current-lead.sh`; Lead 41 `local_eb5559e3…`); replace this session past about half its context (P-565).

## In flight
| What | Session | Branch | PR |
|---|---|---|---|
| PF-3 platform tables | cloud builder (started by the release holder) | its own | #1728 (approved at 2cdc2e986; in the merge queue) |

## Log
* 13 Nov 22:25 IST: rows sent to Lead 37 (one line each, with four asks); delivered, not yet answered.
* 13 Nov 22:26 IST: at Lead 37's ask, read RULES (as of P-557) and AGENTS rules 9-10 from `lead/2026-11-07-lead31`; rows and contracts unchanged; RULES amendment ask (P-335/P-357) still open.
* 13 Nov 22:27 IST: P-559 folded into contracts (draft 2) and PF-3; Lead 37 told.
* 13 Nov 22:31 IST: contracts draft 3 + rows revision 2: front office follows the team requirement AG-02 (neutral lead; Engage makes a prospect; WON by signature, Signed offline or Convert; a person opens the case; payment not a WON condition); FO-1, FO-2, FO-3, FO-4 rewritten; `engagement.ready` replaced by `prospect.won` + `client.created`/`case.opened`. Lead 37 to re-copy.
* 13 Nov 22:34 IST: Lead 37 recorded P-560 (FO follows AG-02; amends P-559 (4)); FO-1..FO-4 re-copied from 242e1cb8; RULES as of P-560 (PF/FO exempt from the no-multi-tenant line); Lead 37 shapes the case-side row consuming `prospect.won` beside FO-8.
* 13 Nov 22:38 IST: founder (typed 22:3x, via Lead 37): "Let's build both and try to fit in" — Corporate pipeline and the script embed with campaign tracking both in month one. Lead B sized both (not very hard: embed ~3-4 changes <1 day off the critical path; Corporate ~8-12 changes ~1 day with a parallel lane, no AG-17 dependency); folding into FO-1a/1b, FO-2/2b, FO-4/4b with the trace.
* 13 Nov 22:47 IST: all 8 traces folded: register + contracts draft 4 + rows rev 3; FO-4 concept r2 approved after the challenge (2 Blockers, 7 Majors fixed). Founder questions (5) and row changes sent to Lead 37.
* 13 Nov 22:48 IST: Lead 37 ruling (audit one trail on `audit_event`/AUD-1; timeline front office; settings platform) folded → rows rev 3.1, contracts §7; Lead 37 handed over to Lead 38; package sent to Lead 38.
* 13 Nov 22:50 IST: Lead 38 copied rev 3.1 into BACKLOG; asking the founder question 1 (signing). Added to PF-2 and contracts §7: BoldSign only with Canadian data residency confirmed at source (team RFP l.243).
* 13 Nov 22:52 IST: PF-2b done by Lead B from the Mac: BoldSign CA region keeps documents, audit, signer data in Toronto; its emails, AI and ID verification run in the US → usable only with our own emails (MailPort/SES CA), no vendor AI or ID check (`design/tech-gate-boldsign-residency-2026-11-14.md`).
* 14 Nov 01:22 IST: DB-SPLIT #1709 and PF-1 #1711 merged (~01:1x). PF-3 brief written: `design/lead-b-briefs/PF-3.md` (schema folder `prisma/schema/platform.prisma`; no audit table; demo reset must pass). Lead 38 starts its cloud lane at the founder's next typed turn; PF-3 holds the schema baton.
* 14 Nov 01:22 IST: FO-1a and FO-1b briefs written (`design/lead-b-briefs/`), ready for after PF-3 merges; parallel vs serial waits on Lead 38 (DEVELOPING one-migration rule vs P-559 (2)).
* 14 Nov 01:23 IST: Lead 38 ruling: FO-1a and FO-1b side by side after PF-3 (P-559 (3), P-228); FO-1a also fixes DEVELOPING.md line ~29. Briefs and FO-1a touch list updated.
* 14 Nov 05:21 IST: release holder is now Lead 39 (`local_84c512dc…`). Open with it: founder question 1 (signing) and 2-5; PF-3 lane to start at the founder's typed turn (brief `lead-b-briefs/PF-3.md`); FO-1a/1b after PF-3, side by side; FO-1a touch list re-copy.
* 14 Nov 05:23 IST: Lead 39 confirms: FO-1a touch list already in BACKLOG; question 1 (signing) with the founder, away overnight; Lead 39 forwards his answer word for word, then asks 2-5; PF-3 lane at his next typed turn. Lead B idle until then (no work waiting; rows ready ahead: PF-3, FO-1a, FO-1b briefed; PF-4, PF-5, FO-2, FO-2b, FO-3, FO-4, FO-4b shaped).
* 14 Nov 07:08 IST: P-561 (founder: BoldSign on 4 conditions). Rows rev 4: FO-5 (retainers, FilesPort, docxtemplater), FO-5b (Code s.24 checklist, waits on Q4), FO-6 (SigningPort + BoldSign, conditions checked first; Mac sandbox check by Lead B), PF-6 (staff screens, concept next). Contracts §7 updated (P-561; D-6 dropped per AG-5-61).
* 14 Nov 07:10 IST: PF-6 concept r1 + board pushed (0687eefd); fresh challenger running. Rows rev 4 sent to Lead 39.
* 14 Nov 07:10 IST: Lead 39: founder wants the vendor re-checked (FO-5r: platform vs per-firm accounts, the team's own signer, paid product). Rows rev 4.1: FO-6 vendor-neutral (fake adapter only); vendor adapter held as FO-6v.
* 14 Nov 07:11 IST: Lead 39: rev 4 copied; FO-6 waits on FO-5r; the email one-time code is an open founder point (P-561 (3) vs AG-5-61 r13), kept in contracts §7 and FO-6 (built behind a setting).
* 14 Nov 07:12 IST: Lead 39 copied FO-6 (rev 4.1) and FO-6v from d81baea2; the per-account question is inside FO-5r.
* 14 Nov 07:19 IST: PF-6 challenge (2 Blockers, 9 Majors) answered; concept r2 approved (P-223 (4)); rows rev 5: PF-4b (staff reads, session, accept invitation, step-up, provider email via MailPort) and PF-6 rewritten; founder Q3 reframed with Cognito's per-pool limit: (a) required for all (recommended) vs (b) AG-1-40 as written.
* 14 Nov 07:20 IST: Lead 39 copied rev 5 (PF-4b, PF-6). Founder questions queued after FO-5r, in order: P-561 confirm/amend, email code, Q2, Q3 (a/b), Q4, Q5. Team legacy e-signer: no tests, image-only, no seal (AG-05: do not copy).
* 14 Nov 07:26 IST: P-562 (size for ~100 firms; 50 to start where it saves effort) added to contracts §0.8; no PF/FO row assumed more (checked). P-561 waits on stream 4's open-source vs own-build comparison (~09:45 IST); FO-6v held; FO-6 unaffected.
* 14 Nov 07:48 IST: P-563 (BoldSign confirmed) → FO-6v released (waits on FO-6 and the sandbox key). Atomic CRM weighed (`tech-gate-atomic-crm-2026-11-14.md`): lift presentational pieces only into FO-4 (~5-8 changes saved, not 20-25; no ra-core/Supabase); FO-2 unchanged; licence-notice rule asked of Lead 39. Rows rev 5.1.
* 14 Nov 07:49 IST: Lead 39 ruling: Atomic CRM is a design reference only (no code copied, no licence file); FO-4 row and tech-gate note aligned.
* 14 Nov 07:50 IST: P-564 (email one-time code before signing, firm setting on by default) folded into contracts §7 and FO-6. Q2 (sign-up link) goes to the founder next.
* 14 Nov 07:53 IST: hand-over written (P-565); Lead B stops.
* 14 Nov 07:56 IST: Lead B (2) (session `f68b2550…`, worktree `lead-b-2-front-office-1e7bc9`) took over from 851ebfd6 at Lead 40's go; read this file + RULES (as of P-565). PF-3 #1728 approved at c5ba30f8, waits on the release holder's P-423 diff read and label. Next: PF-4 brief.
* 14 Nov 07:57 IST: PF-4 brief written (`lead-b-briefs/PF-4.md`): API only, no schema, so it can start beside FO-1a/1b once PF-3 merges; two-step switch built with a `PLATFORM_POOL_MFA_REQUIRED` flag so question 3 changes config, not code. Rows file: brief rules now point to the current Lead and this file, not a session id.
* 14 Nov 07:58 IST: PF-4b brief written (`lead-b-briefs/PF-4b.md`); step 0 checks the four Cognito facts at AWS's docs before code. Next: FO-5s concept (skill screen-concept).
* 14 Nov 07:59 IST: FO-5s concept drafting started (in-process Opus drafter → `screens/fo-5s-retainer-signing/concept-draft.md` + `design/board.html`); then a fresh challenger, then Lead B approval (P-223 (4)). If this session ends first, a fresh Lead B re-runs the draft from the skill screen-concept.
* 14 Nov 08:03 IST: P-566 folded (contracts §7 §1.1, rows rev 6: PF-5 rewritten, PF-5s shaped). Q3-Q5 decided under P-566 (3) with evidence (register §C2; contracts §7 §1.2, §2.3-2.4, §2.5); PF-4, PF-4b, PF-6, FO-5b and the PF-4/PF-4b briefs aligned.
* 14 Nov 08:07 IST: FO-5s concept r1 + board written (`screens/fo-5s-retainer-signing/`); the drafter's 10 gaps decided and folded (rows rev 6.1: FO-5, FO-6 amended, FO-5s added). Fresh challenger next.
* 14 Nov 08:14 IST: FO-5s fresh challenge (Fable): 2 Blockers, 6 Majors, 10 Minors, all accepted; concept r2 approved (P-223 (4)); rows rev 6.2. Next: FO-7 shaping.
* 14 Nov 08:16 IST: FO-7 shaped as rows rev 7 (FO-7a schema, FO-7b invoices, FO-7c card via Connect Standard, FO-7t trust ledger); Lead B decisions inside (Connect Standard; firm-set tax rates; trust per §7 §2.5).
* 14 Nov 08:25 IST: P-567 (founder confirmed the three deviations) marked in register §C2 and contracts §7. PF-3 #1728 labelled and queued. Lead 40 copied rev 6.1; rev 6.2 (FO-5s r2 changes) and rev 7 (FO-7) still to copy. Stream 4 (2)'s map picked Keycloak for sign-in; Lead 40 asked it to align with Cognito or argue with evidence.
* 14 Nov 08:27 IST: rows rev 8: PF-5 aligned with A46 draft 2 (Cognito verification, Stripe Checkout no-card trial, Customer Portal, Stripe Tax, terms acceptance tables). Lead 40 copied rev 6.2 + 7. PF-5s concept drafting next against draft 2; re-check at 12:00 IST.
* 14 Nov 08:31 IST: rows rev 8.1 + contracts §7 §2.5: checked FO-3, FO-7b, FO-7c, FO-7t against map draft 3 (deposits never card-payable; direct trust-bank deposits with evidence; card at booking held). Lead 40 copied rev 8.
* 14 Nov 08:37 IST: PF-5s concept r1 + board (`screens/pf-5s-saas/`); 14 gaps decided, Q1 settled by P-566; rows rev 8.2 (PF-5 amended, PF-11 shaped); contracts §7 §1.1 wording. Fresh challenger next.
* 14 Nov 08:42 IST: PF-5s fresh challenge (Fable): 1 Blocker, 6 Majors, 9 Minors, all accepted; concept r2 approved; rows rev 8.3 (PF-5 amended, PF-5s row added, PF-11 in Shaped next).
* 14 Nov 08:43 IST: FO-2 and PF-5 briefs written (two ahead).
* 14 Nov 08:51 IST: #1728 red in the merge batch (check_case_feed.ts: `platform_firm_setting` on no audit list); Lead 40 commented the fix. Lead B answered the PR body questions 1-2 on the PR (insert-only outbox accepted; seed line in PF-4); contracts §0.5 updated; PF-4 brief gains two-step fixed on, input checks m4/m6/m9/m10, seed line; PF-4, PF-5, FO-2 briefs: outbox row last (m8). Question 3 (B-6, demo reset vs settings audit) is the release holder's (AUD-1).
* 14 Nov 08:55 IST: rows rev 9 from the A49 Fable challenge: F5 passkeys (replacement, not second step; TOTP second step) in contracts §7, PF-4b, PF-6 concept; F7 Connect controller properties in contracts §7 §2.5 and FO-7c; F11 FO-3c row (FO-5 templates and FO-6 requests kind-aware); F15 audit chain = AUD-1's (recommendation to Lead 40). PF-3's two-step default: PF-4 brief registers it fixed on.
* 14 Nov 09:02 IST: release holder is now Lead 41 (`local_eb5559e3…`). Open with it: rows rev 9 to copy (FO-3c, FO-5, FO-6, FO-7c, PF-4b); F15 recommendation (AUD-1); #1728 fix and re-approval; PF-3 PR question 3 (B-6).
* 14 Nov 09:08 IST: Lead 41: rev 9 copied; P-571 rules B-6 (reset via settings write path, audit line), the seed line (Sample setting default off, production test) and F15 (AUD-1 chain + AUD-2 daily Object Lock export). Rows rev 9.1: PF-4 brief updated; PF-5 "closed after 90 days" with archive and download conditions (contracts §7 §1.1 Firm exit, map row 105); new row PF-12 database walls (RLS), named in contracts §0.
* 14 Nov 09:09 IST: Lead 41 copied rev 9.1 and accepted the firm-exit rule (retention and our processor role after exit on the counsel list, not the founder); PF-12 split accepted. All Lead B rows are in BACKLOG. Waiting: #1728 merge → FO-1a, FO-1b, PF-4 start.
* 14 Nov 09:21 IST: rows rev 10 (P-574): PF-13, FO-9a, FO-9b, FO-9s, FO-10, FO-11, FO-7p; size 12-16 PRs (Hypothesis). Context ~36% (Lead 41's reading); hand-over at 45% (P-565).
* 14 Nov 09:23 IST: rev 10 part 2 (P-575 (1), A51 §12): client money its own module (contracts §8; tables `money_*` in `client-money.prisma`, code `api/src/client-money/`); one completion event `signing.completed`; governance file split recommended to the release holder.
* 14 Nov 09:25 IST: Lead 41 answers: FO-12 (map row 36) is Lead B's; FO-11's sending-layer line OK'd; the case side's client merge is Lead 41's. P-576 order of work → rows rev 11: PF-L (libraries, one lockfile PR), PF-14 (jobs, pg-boss, fake clock), FO-12a/b/c/s, the lane and wave order; Meta test number needs the founder's developer account (P-551).
* 14 Nov 09:27 IST: PF-L and PF-14 briefs written.
* 14 Nov 09:27 IST: Lead 41 copied rev 10 part 2; client money's owner is Lead B for now (FO-7* ids kept); governance split and `signing.completed` accepted. Contracts §8 updated.
* 14 Nov 09:28 IST: P-578 (founder: payment plans and saved-card autopay for earned fees kept) cited in FO-7p. Rev 11 copied; order of work accepted; account openings on the founder's list.
* 14 Nov 09:30 IST: rows rev 12 (P-579): FO-13 schema, FO-13c conflict check (blocks Send/Convert/Signed offline without a check), FO-13k complaints, FO-13i identity check (warns, never blocks), FO-13s screens; duties read at the Code (s. 5, 15, 16, 24, 29, 35, 37; current to 2026-10-19); the College's by-laws not yet read (FO-13k reads them first).
* 14 Nov 09:31 IST: FO-5 and FO-3 briefs written. Lead B (2) stops new work (~45% context, P-565); hand-over above is current.
* 14 Nov 09:44 IST: Lead B (3) took over at Lead 41's start: told Lead B (2) to stop; it was idle with a clean worktree and nothing new pushed after 37bd72a9e. Read this file, RULES (as of P-581) and P-580 to P-582. FO-5 and FO-3 briefs were already pushed. Now: rows rev 13 for P-581's minimums (dup check done against BACKLOG, `main` and the 11 open PRs: none).
* 14 Nov 09:52 IST: rows rev 13 (P-581 minimums; 5b76929da): new PF-4s (our staff's sign-in), PF-4c (multi-row invite, licence typo warning), PF-15 (limits, downgrade check), PF-16 (plan changes on our page, trial controls, billing emails), PF-17 (our console: health and usage, overdue list, trial extension, refunds, sign-up links, tickets), PF-18a/b/s (notification settings, offices and time zones, support tickets), FO-3v (video links), FO-5p (retainer preview), FO-6d/FO-6ds (send any document), FO-7r (statement, write-offs, exports), FO-14 (progress stream, last update); FO-7a, FO-7t (AG-6-73 in full), PF-5 (portal plan switching off; brief line added) amended. Map ID corrections: AG-12-91 is the test send (preview is AG-12-89..91), AG-15-33 withdrawn, licence check is AG-1-34. Sent to Lead 41 with four asks (row 62 owner, case-count port, configurator staff on PF-4s, row 43 owner) and four X lines.
* 14 Nov 09:5x IST: Lead 41 handed over to **Lead 42** (`local_110605c6…`, 09:50 IST); rev 13 and the four asks re-sent to Lead 42 (queued). FO-7a brief written (`lead-b-briefs/FO-7a.md`, rev 13 tables included).
* 14 Nov 09:54 IST: FO-6 brief written (`lead-b-briefs/FO-6.md`; waits on FO-5, PF-4, PF-4b for `MailPort`, PF-14 for the expiry job; kind enum left open for FO-6d's `OTHER`).
* 14 Nov 09:5x IST: FO-13 and FO-9a briefs written (`lead-b-briefs/`); FO-9a may add one call each in FO-2's sales handlers (Lead B OK as owner of both).
* 14 Nov 09:5x IST: FO-2b and FO-7b briefs written; FO-7b derives `Written off` from FO-7a's rev 13 table and owns `ClientMoneyPort.hasMoney`.
* 14 Nov 10:01 IST: P-584 (module homes), P-585 (Lead 42's answers: map rows 62 and 43 are Lead B's; case-count port to desk 02; configurator staff onto PF-4s later, Lead 42's row) and P-586 (baseline draft 6; items 14-16) folded as **rows rev 14** (0a164b2d0): PF-19a/b/c/s messages, consent gate and templates (incl. the AG-12-89..91 preview); FO-12a → PF-20, PF-20s; FO-13k → PF-21, PF-21s; `money_*` in PF-12 now and FO-7b waits on PF-12; FO-1a drops the consent tables (PF-19a), FO-2 waits on PF-19a; PF-L adds nodemailer and the SES client; FO-7r adds AG-6-30/-29; PF-18a reconciled with PF-3 (staff office link, host's office decides closed days); X-14 narrowed; shaped next PF-4p, PF-22, FO-3s, PF-19m, FO-15. Briefs FO-1a, FO-2, PF-L, FO-13, FO-7b, PF-4b updated; contracts §9 (d3d8babf6). Open item 16 (Zoom app review; College licence-number format) is Lead B's.
* 14 Nov 10:02 IST: Lead 42 copied rev 14 from 89d9df2e1 (FO-12a and FO-13k marked moved; X-14 narrowed; BACKLOG header says the briefs win for FO-1a, FO-2, PF-L, FO-13, FO-7b, PF-4b); one platform consent store agreed. FO-1a starts from d3d8babf6 when #1728 merges (needs the founder's typed turn).
* 14 Nov 10:1x IST: case-side contract v0.1 (P-588) folded as rows rev 14.1: `ports/` folder rule in every brief; PF-15 on CaseCountPort (SA-3-47, checked in the case-open transaction); FO-9a creates `ports/matching.ts`, no DuplicateCheckPort; FO-9b implements PersonMergePort, client merges via ClientMergePort; FO-13/13c PartySearchPort with hidden matches confirmed; FO-15 EligibilityPort; CaseSummaryPort reads; PersonPreference recorded under PF-4s, moved by the identity join.
* 14 Nov 10:17 IST: Lead 42 copied rev 14.1 from 0304a153a; PersonPreference split confirmed (its identity-join row moves it into platform.prisma when it re-keys the simulated actor ids; PF-4s does not).
* 14 Nov 11:22 IST: Lead 42 says the current Lead is now **Lead 43** (`local_b5840dd3…`); rows through rev 14.1 are in BACKLOG; nothing waits on Lead B. Next: FO-1a, FO-1b and PF-4 when #1728 (PF-3) merges.
* 14 Nov 12:26 IST: Lead 43 sent two PR questions. FO-1b #1741: Lead B OK'd the four `platform.prisma` back-relation lines and real foreign keys in FO-1b's own migration (comment 6873446019, release holder agrees). PF-4 #1744 item 4 (tsconfig include) is shaped as **PF-4t** in rows rev 14.2.
* 14 Nov 12:30 IST: Lead 43 copied rev 14.2 into BACKLOG, OK'd PF-4t's one `api/tsconfig.json` line, and made PF-4t the next start after PF-4. Brief written (`lead-b-briefs/PF-4t.md`). Lead 43 hands over to **Lead 44** at about its next check.
* 14 Nov 12:37 IST: the current Lead is now **Lead 44** (`local_dbdab60d…`). Lead 43 removed FO-1b #1741's label because its head still had the stand-in triggers; FO-1b must apply the rev 14.2 foreign keys, get a re-review and relabel.
* 14 Nov 12:44 IST: Lead 44 is the release holder (12:4x IST). Its MVP-CHECKLIST gap ask is shaped as **rows rev 15**, 13 rows (plus addenda PF-26s, PF-18ns): PF-23, PF-23c, PF-24, PF-25, PF-26, PF-18n, PF-21b, PF-21c, PF-21d, PF-21rs, FO-3a, FO-3w, FO-3st, plus X-27..X-31. Map rows 85 and 86 accepted as Lead B's, homed in Platform (SA-11). Map item 8 is settled by SA-2-27 (sub-domain).
* 14 Nov 12:46 IST: Lead 44 copied rev 15 into BACKLOG (c334a7618) and accepted 85/86 in Platform. Rulings: PF-23's main.ts hook is a yes as one line; its CI step is a yes if it adds no new required job and states its minutes, and over ~1 min it goes in an existing job. The case-side asks go into Lead 44's CS- rows.
* 14 Nov 13:48 IST: the current Lead and release holder is now **Lead 45** (`local_24e909a3…`, from 13:5x IST).
* 14 Nov 13:55 IST, per Lead 45:
  * PF-3 merged at 11:25.
  * FO-1a #1742: approved at f4eaad629, then red on a B164 false positive; the fix is in Lead 44's comment.
  * FO-1b #1741: applied rev 14.2 (491231d07), re-approved at 53ce323a4 and labelled.
  * PF-4 #1744: unlabelled, `skeleton` red (local sign-in 400).
  * Brief **PF-19a** written (next schema slot after FO-1a; FO-2 waits on it). It adds the `fo_web_form` → `msg_consent_wording` foreign key FO-1a left, with one back-relation line OK'd by Lead B.
* 14 Nov 13:56 IST: brief **PF-12** written (walls; runs right after FO-7a, before FO-7b; it adds a missing-policy check so later tables can't skip their policy). Told Lead 45 that PF-19a, FO-13 and FO-7a can start once FO-1a merges, two schema rows at a time (P-559 (3)).
* 14 Nov 13:57 IST: Lead 45 set the schema start order (STATE c3dc42691): **PF-19a + FO-7a** once FO-1a merges, then FO-13 when a slot frees. FO-7a goes first because money has the longest chain (FO-7a → PF-12 → FO-7b).
* 14 Nov 15:17 IST: Lead 45 reported FO-1b #1741 merged (15:1x) and FO-1a #1742 re-approved at 0e7b715df and queued.
  * Lead B answered FO-1a's two questions on #1742 (comment 6875438964). Back-relation lines and keys → new row **FO-1k**; the seed → **FO-2** (brief updated).
  * Rows rev 15.1: FO-1k; FO-2 amended; event names from `ports/events.ts` (sentence added to every brief); the qa-testable Done when note (P-592).
* 14 Nov 15:18 IST: Lead 45 copied rev 15.1 into BACKLOG (ccf7e8150) and kept FO-1k's slot as proposed.
  * It OK'd the demo-reset seed hooks on three conditions: they only call the seeds; `check_s7_reset` and `check_d1_reset_to_six` stay green; no platform audit line is deleted (P-571). The FO-2 brief is updated.
  * The founder's name is now **"Release 1 (production grade)"**, not "MVP", in new text.
* 14 Nov 15:46 IST: the current Lead and release holder is now **Lead 46** (`local_3cc8e2ba…`).
* 14 Nov 15:46 IST: brief **FO-1k** written (keys after FO-1a, next slot after PF-19a and FO-7a). Lead 46 told the order and the ready briefs.
* 14 Nov 16:19 IST: Lead 46 reported FO-1a #1742 red (fo_firm_fixed clash with merged FO-1b; FO-1a's stamp is older).
  * Lead B confirmed it from the CI log, posted the fix on #1742 (comment 6876146313) and sent it to the FO-1a cloud lane (one-way; not confirmed read).
  * Rows rev 15.2: per-area function prefixes and the later-stamp rule, added to every brief.
* 14 Nov 17:08 IST: the current Lead and release holder is now **Lead 47** (`local_a358e18f…`).
  * The FO-1a lane applied the fix: it merged main (4cb10ae08) and re-stamped its migration as 20261114153000 with fo_sales_ function names (421f887ce). Reviewer round 6 approved it at 421f887ce, and the head is f364eb377.
  * `ci` is pending and the PR has no label: the release holder relabels on green.
* 14 Nov 17:10 IST: Lead 47 read FO-1a's migration at f364eb377 (P-423): OK. It labels when ci run 43587658447 is green. Schema order noted; rev 15.2's rule goes into BACKLOG at its next records pass.
* 14 Nov 17:23 IST: Lead 47 reported two red PRs.
  * **FO-1a #1742**, red again at f364eb377: its seed command crashes in 2 of its own tests. The cause is hidden because the test keeps only the tail of stderr. Steps posted (comment 6876868394): show the error head, find and record the root cause, never crash on one firm, a pg_proc name test if a renamed function is still called by its old name.
  * **PF-4 #1744**: B164 flags bare event names. Steps posted (comment 6876868536): after #1742 merges, add EVENT.STAFF_ROLES_CHANGED and STAFF_DEACTIVATED to ports/events.ts; green `skeleton` too.
  * Both cloud lanes were messaged (one-way). They may need the prompt box.
* 14 Nov 18:23 IST: P-599 (Release 1 (production grade) by 24 Nov). Lead 47 asked for rows that start now on fakes. **Rows rev 16:** new **PF-0p** (port contracts and fakes, plus reserved back-relation slot lines) and 11 rows moved to start now: PF-L, PF-14, PF-19a, FO-7a, FO-13, PF-21, PF-23, PF-24, FO-5, FO-3, PF-25 (after PF-0p). New briefs: PF-0p, PF-21, PF-23, PF-24, PF-25; seven briefs got start-now blocks. Every brief got the run-red-suites-before-label line. Open for the release holder: the two-at-once schema limit and PF-0p's interim AuditPort adapter.
* 14 Nov 18:25 IST: Lead 47 copied rev 16 into BACKLOG. Ruling **P-600**: any number of schema rows at once under five conditions, and PF-0p's interim AuditPort OK. The re-stamp step is now in every schema brief. Lanes for the 12 start at the founder's next typed turn, PF-0p first.
* 14 Nov 18:35 IST: the founder said go. Lead 47 requested 9 cloud lanes: PF-0p, PF-L, PF-14, PF-19a, FO-7a, FO-13, PF-21, PF-23, PF-24. FO-5, FO-3 and PF-25 are cards for the founder (app limits: 10 sessions per message, 5 working at once). Row questions come to Lead B as PR comments; Lead B watches PF/FO PR comments with a GitHub poll monitor (every 2 min).
* 14 Nov 18:50 IST: lanes are open as PRs: PF-L #1751 (ready), PF-0p #1752, PF-21 #1753, PF-19a #1754, FO-13 #1755, PF-24 #1756, PF-14 #1757, FO-7a #1758, PF-23 #1759 (drafts). FO-3, FO-5 and PF-25 are running.
  * FO-13's questions answered (comment 6877883591): keep the narrowed FO-1b test line; five back-relation lines OK (into the compliance slot after PF-0p); open choices OK.
  * The FO-13c confirmer must be able to see the hidden matches (PartySearchPort); PF-21d will anonymise through fo_compliance_erase().
* 14 Nov 18:52 IST: the current Lead and release holder is now **Lead 48** (`local_1aede380…`).
  * Lead 47 answered PF-21 #1753 (comment 6877890040), ruling **P-601**: `agent/complaint:record` goes to OWNER, ADMIN and CASE_MANAGER, `agent/complaint:read` to OWNER and ADMIN; the handler reads their own complaints. Catalogue rows are added in PF-21's migration as P-600's one written exception. Events go in after #1742; both PF-21 slot lines are used. The College's site is unreachable from cloud lanes, so fields stay Sample.
  * Lead B's watch missed that question (only the first 100 comments were read); the watch now pages.
* 14 Nov 18:55 IST: FO-1a #1742 is green and labelled by Lead 48.
  * Root cause of the seed crash, found by the lane (22ff3b010): run-suites.sh gives tsx a repo-relative --tsconfig, and tsx passes it to child processes.
  * Re-approved at round 7.
  * PF-4 #1744 will be nudged after #1742 merges.
* 14 Nov 19:18 IST: Lead 48 sent PF-23 #1759's open minors. Shaped as **rows rev 16.1**: PF-23r (redaction hardening, brief written) and PF-23m (~20 case-side e.message log calls → logPort.error; needs the release holder's OK on the case-side touch list). FO-13 #1755's migration was read OK; it is labelled on green.
* 14 Nov 19:19 IST: Lead 48 copied rev 16.1 into BACKLOG and OK'd PF-23m's case-side touch list on three conditions: one-line call-site changes only; start only when no open PR touches a listed file (BK-25 and BK-26 first; `case-prepare.ts` needs Lead 48's baton); diff-only re-reviews. **PF-23m brief written.**
* 14 Nov 19:23 IST: the watch missed FO-7a #1758's and FO-13 #1755's breaker questions (Python HTTP reads failing through the proxy were swallowed); rebuilt on curl. Answered both (6878284021, 6878284222). **Rows rev 16.2:** FO-1k collects the keys rows left; PF-12 gets a non-superuser, non-owner app role and terse error logging; PF-23r strips DETAIL and meta. PF-12, FO-1k and PF-23r briefs updated.
* 14 Nov 19:24 IST: Lead 48 copied rev 16.2 into BACKLOG and agreed: PF-12's non-superuser, non-owner app role is a must before any real firm's data.
* 14 Nov 19:34 IST:
  * FO-7a #1758: Lead B agreed to tax_rate_ppm (comment 6878441686) and recommended a diff-only third round plus a breaker re-run (the release holder decides).
  * PF-0p #1752 approved round 3 (job keys unique per job name).
  * Rows rev 16.3; FO-7b brief updated.
* 14 Nov 19:35 IST: Lead 48 agreed FO-7a round 3 as proposed (diff-only, same reviewer, plus a breaker re-run). A new Major goes to Lead 48 before any round 4 (comment 6878449242). PF-0p #1752 is labelled on green at 8f64ca4e5. Rev 16.3's sha (b01906236) sent.
* 14 Nov 19:41 IST: FO-3 #1760 round 3 agreed by Lead 48 as Lead B proposed: diff-only, same reviewer, breaker re-checks B-3 and R2-1. A new Major goes to Lead 48 first (comment 6878537086).
* 14 Nov 19:53 IST: FO-7a round 3: the reviewer approved, and the breaker found new Major B-12 (a correction of a return re-opened the trust cap). Lead B supported round 4 and set the trust rule (comment 6878721249; rows file note). Round 4 is Lead 48's call.
* 14 Nov 19:56 IST: Lead 48 agreed FO-7a round 4 and recorded the trust rule as **P-603** (s. 32(f) Unconfirmed: no counsel). If round 4 finds another Major, the row splits: the clean part merges and the rest becomes its own row; there is no round 5.
* 14 Nov 20:02 IST: PF-21 #1753 asked two things, answered (rows rev 16.4): routes go in **PF-21w** once PF-4 is on main (a rule for every start-now row: `<row>w`), and the PF-3 test's key count is scoped through a named `ADDED_BY_LATER_ROWS` list.
* 14 Nov 20:03 IST: Lead 48 copied rev 16.4 into BACKLOG and agreed to the part 1 of 2 / `<row>w` split. PF-4's lane got its next step at 19:5x (events into ports/events.ts); Lead 48 reads its permissions diff before the label.
* 14 Nov 20:24 IST: the current Lead and release holder is now **Lead 49** (`local_93551126…`). PF-4 #1744 is approved at eae96d3d9 and waits on the release holder's permissions read and label.
* 14 Nov 20:27 IST: Lead 49 read PF-4's permissions (passes) and labels it on green. Lead 49's ask: PLATFORM_ENVIRONMENT defaults to local. Rows rev 16.5: new row **PF-24w** (the setting is required, no default, fail closed) and PF-8's Done when (explicit production settings; smoke refuses a local token).
* 14 Nov 20:28 IST: Lead 49 copied rev 16.5 into BACKLOG (03b87cc7b) and OK'd PF-24w's launch-file lines. Lines under .github/ need its diff read (P-423).
* 14 Nov 21:51 IST: FO-13 #1755 was dequeued (batch #1766): main's FO-1a stray-function check (from Lead B's own #1742 suggestion) rejected fo_compliance_ functions. The fix rides on FO-5 #1761 (2b087d7ad). Order per Lead 49: #1761 first, then FO-13 merges main and re-stamps after 20261114210000. FO-13's lane was messaged; if it doesn't move after #1761 merges, Lead 49 starts a fresh lane.
* 14 Nov 22:21 IST: PF-4 #1744 is labelled and queued (Lead 49). Brief **ROW-w.md** is written for PF-21w and FO-3sr (start when PF-4 is on main), and PF-25w (after PF-4s). FO-5's part 2 is its own API PR. PF-4t's brief is ready.
* 14 Nov 22:52 IST: PF-25 #1763's round 3 approved. As row owner, Lead B asked it to drop its AFTER INSERT trigger on platform_firm in favour of a firm.created consumer (6881377523). Lead 49 was asked to hold the label. The watch now runs as a one-shot background wait (3 min polls) instead of 30-min monitors.
* 14 Nov 22:59 IST: PF-25 dropped its platform_firm trigger (c4d3f5a8e). Its reset-hook question was answered: FO-2's shared reset step now includes PF-25's catch-up. FO-13 keeps the slot comment with its lines under it. Rows rev 16.6; FO-2 and the slot wording updated across the briefs.
* 14 Nov 23:03 IST: **hand-over written** (START HERE section at the top), at ~46% context, for Lead B (4) (P-565).
* 14 Nov 23:04 IST: Lead 49 copied rev 16.6 into BACKLOG (e5c681a94). Lead B (4) starts at the founder's morning typed turn. Until then Lead B (3) answers row questions only, in short turns, with no new work past ~50%.
* 14 Nov 23:15 IST: Lead 49 ruled round 3 for PF-21 #1753: same reviewer, diff 540ebf88c..4688525, and the breaker re-runs (the migration changed). A new Major splits the row, and Lead B shapes the split.
* 14 Nov 23:22 IST: the current Lead and release holder is now **Lead 50** (`local_1ee10674…`).
* 15 Nov 00:28 IST: FO-3 #1760 round 3 approved (B-3 and R2-1 fixed, no Major); it goes ready and labels on green. Its open Minors are listed in the PR body for Lead B (4) to shape (added to the hand-over list).
* 15 Nov 01:08 IST: PF-4t #1775 went red because check_forms_qa53.ts now sees PF-4's routes. Lead B proposed a PLATFORM_PATH pattern (not a list) checked as 401 / no data (comment 6883123596). Lead 50 OK'd it (6883128053), adding a guard that asserts PLATFORM_PATH's source exactly, so widening it fails, and nudged the lane.
* 15 Nov 01:14 IST: PF-4t #1775 was approved round 2 at d66b3a00 (check_forms_qa53 34/34). Its lane is near its context limit and wrote a hand-over in the PR. Minors m1 and m2 are added to Lead B (4)'s list.
* 15 Nov 01:21 IST: FO-5 part 2 #1777: five row questions answered on the PR. FO-8 gets a won-event catch-up, and the size limits are set at 5 and 10 MB.
* 15 Nov 01:46 IST: FO-3 #1760 hit B164: FO-1b's `visitorTimeZone` field read as a program word. Lead B OK'd the rename to `bookerTimeZone` (@map keeps the column). Lead B (4): when writing FO-3a's brief, add "field names avoid program words (B164)".
* 15 Nov 02:11 IST: PF-21 #1753 found that migration tests assumed 'newest of all' (its own, and PF-25's on main), which turns later schema PRs red. Lead B OK'd fixing PF-25's line in PF-21's PR. Rule recorded as rows rev 16.7; Lead B (4) adds it to the schema briefs.
* 15 Nov 02:13 IST: Lead 50 set the migration slots: PF-21 20261114234500, FO-13 20261115003000, PF-19a 20261115004500 (dequeued: its stamp was older than main), FO-5 part 2 20261115010000. PF-21 merges first with the check_pf25 fix (not yet pushed at a42406377; the lane was messaged). Rev 16.7 goes into BACKLOG at Lead 50's next records pass.
* 15 Nov 02:18 IST: PF-21 #1753 has a diff-only Approve with the check_pf25 fix and is ready for Lead 50's label. FO-5 part 2 #1777: Devin found two real reds (a stale save on fees; a download after access is lost). Lead B's view: fix both in this PR, (a). The rest go to FO-5f for Lead B (4).
* 15 Nov 02:19 IST: Lead 50 labels PF-21 #1753 on green. It ruled (a) for FO-5 part 2 #1777: one push with both fixes and tests, a diff-only re-Approve, and the breaker re-attacks those two paths. Anything new goes to FO-5f, with no further round.
* 15 Nov 02:29 IST: Lead 50 ruled B-24 (stale save on Send and Signed offline) is fixed in FO-5 part 2 #1777 (comment 6884109569): diff-only reviewer, and the breaker re-attacks only edit, send, signed offline and download. It is the last allowance: any further Major leaves the PR unlabelled for Lead B (4).
* 15 Nov 04:06 IST: FO-5 part 2 #1777 is labelled at eb9004a0a (all CI green); FO-3 #1760 is labelled and in Mergify. **Lead B (3) is parked at 53% context** (weekly use 77%), as Lead 49 instructed: the PR watch is stopped, and row questions wait for Lead B (4) unless the release holder messages a blocking one. Lead B (4) restarts the watch with `design/lead-b-tools/scan-pr-questions.sh`, scanning from this time.
* 15 Nov 07:42 IST: **Lead B (4) took over** (weekly use 79%). PRs read fresh: PF-21 #1753, FO-3 #1760, PF-4t #1775 merged; FO-5 part 2 #1777 left the queue on a conflict with main after PF-21, was re-approved on the merge at 622ee139f, and waits on the release holder's label; PF-19a #1754 re-stamped and rename re-read OK (Lead 50); FO-13 #1755 waits for #1777 then re-stamps to 20261115013000; FO-7a #1758 draft, no push since 14 Nov 19:55 IST (round 4 agreed). No new row questions since 04:06 IST.
* 15 Nov 07:5x IST: **rows rev 16.8**: FO-5f, FO-3f, PF-4f shaped from the review Minors, with Lead B decisions (`retainer.request_ended`; `expectedStatus` on Edit and Withdraw; Signed offline names the signed version and copies it forward; B-15 accepted with a header test; slot reads per IP only, noted in contracts §0.6). Briefs FO-5f, FO-3f, PF-4f written; FO-2 and FO-6 briefs gain the carried items. Rev 16.7's sentence is in the 11 schema briefs.
* 15 Nov 07:5x IST: Lead 51 (current Lead, `local_7e5e5b99…`) OK'd both rev 16.8 asks (PF-4f's case-side file; FO-5f's `main.ts` line). It labels PF-19a #1754 on green, then #1777, so neither re-stamps. FO-3f and PF-4f may start now; FO-5f after #1777. Lead B (3) stood down (last commit 128730149).
* 15 Nov 08:0x IST: **rows rev 16.9**: a `Source:` for all 88 PF/FO rows (P-595, Lead 51 ask), ids checked by script against the 2 Nov requirements copy; hashes left to TR-1.
* 15 Nov 08:27 IST: the current Lead is now **Lead 52** (`local_e0cd21a4…`), told of revs 16.7-16.9. FO-3f #1785 built (122/122; reviewer and breaker running); the used-stamp item needed no schema, so no FO-3f2.
* 15 Nov 08:3x IST: Lead 52 confirmed revs 16.7-16.9 are in BACKLOG (16.8 ruling at line 541; 92 Source: lines). PF-4f lane exists (#1784, draft); FO-5f waits for #1777 (batch #1783). Report to Lead 52 from here on.
* 15 Nov 09:0x IST: **P-604 fast-track specifying** (Lead 52): cloud lanes S1 (Platform + Audit, 17 capabilities, `shaping/s1-platform-audit`), S2 (Front office + Case side, 11, `shaping/s2-front-office-case`), S3 (Client money + Not named, 15, `shaping/s3-money-unassigned`, a card for now) write `design/shaping-s<n>-...-2026-11-15.md` in our row format. **Lead B approves them in batches as they land** (as for our revs); Lead 52 copies approved rows into BACKLOG. Lead B does not re-specify those capabilities (P-526). P-605: Opus 5.5, medium effort for builders, high for reviews and money/schema/permissions rows. Watch: `lead-b-tools/watch-shaping.sh` in a background loop.
* 15 Nov 09:1x IST: **shaping batch 1 reviewed** (`design/lead-b-shaping-approvals-2026-11-15.md`): S1 6 rows, S2 9 front-office rows (CS rows are the release holder's), S3 11 money rows; amendments on PF-8a, PF-8rc (governance-mode vault lock), PF-28 (webhook raw body), FO-3s1 (slot line), FO-7s3b; rulings Q1 (build FO-7m), Q3, Q4, Q5; Q2 (trust never below zero vs AG-6-75 r4) to the founder via Lead 52.
* 15 Nov 09:2x IST: **shaping batch 2 reviewed**: 21 Lead B rows approved, 6 cross-lane findings (keep-period port owner, one area file per schema row, ScanPort is PF-F3, /api/platform/files, PF-27 firmAllows at client doors, rev 16.7); Q5, Q6, Q7 ruled; Q4 waits for the lane text. Weekly use 84%.
* 15 Nov 09:2x IST: **shaping batch 3 reviewed** (S2 and S3 finished): tasks become PF-29a-f (platform service; PF-27 taken), find PF-30a/PF-30s (case finder CS-30c), PF-R1/R2fo/R2cm/R3 and the PF-21rs amendment approved; Q4 badge and Q8 dashboards ruled; corrected: S3 Q4, Q7 and S2 Q5 depart from the team requirements, so they are founder confirmations. S1 last batch pending.
* 15 Nov 09:2x IST: **shaping batch 4 reviewed; all three lanes done.** S1 mailbox/portal/bell rows approved; amendments: one OAuth helper and one app registration per provider (PF-19mc with FO-3s2/3s3), PF-4p in its own area file, PF-23w after FO-3f; Q7, Q8 and IMAP ruled; Q3, Q4, Q5 to the founder with views.
* 15 Nov 09:2x IST: Lead 52 is copying batches 1-3 into BACKLOG (amendments, renames, the six cross-lane changes; MVP-CHECKLIST rows 85 and 86 to Shaped). Founder questions go one at a time. Budget: the founder switches accounts at 95% (A68).
* 15 Nov 09:3x IST: **College facts read at source** (`design/lead-b-college-facts-2026-11-15.md`): client files kept 6 years after closing (Client File Management Regulation 2021-001 s. 7.2); monthly trust reconciliation within 90 days, records 6 years (Client Account Regulation s. 9.1); licence number = "registration number" (Code s. 23/24) / "College ID" (register), no published format (R+6 digits is Sample). Closes open item 16.
* 15 Nov 09:3x IST: **rows rev 16.10** (qa R1 findings, Lead 52 list): (1)(2) = PF-23w (Done when lines added), (5) = FO-3sr after FO-3f, QA-474 = CS-C1 (draft 2); new PF-6b (own vs all, money and licence apart), FO-3h (QA-470), case-side drafts CS-DL1 (deadlines remind) and CS-NT1 (case notes and timeline). Also flagged to Lead 52: shaping lanes duplicate case-side draft 2 (tasks, find, reports, export, erasure, file rail, documents); hold those rows from the copy until settled.
* 15 Nov 09:3x IST: Lead 52 ruled platform owns the shared rails; **Batch 5 consolidated** written (PF-29a-f, PF-30a/s, PF-R1/R2fo/R2cm/R3, PF-F2 on tus with UploadDoorPort, PF-F3 gate inside FilesPort, PF-F4 bytes decide the type); dropped CS-26e, CS-P1, CS-30c, PF-R2cs, S3 CS-D2-D4.
* 15 Nov 09:3x IST: **rows rev 16.11 (P-606)**: Done-when case naming rule (DWn), J-row pattern (join and walk), FO screens first, PF-0c port contract tests (CI guard), 19 started capabilities ranked with missing parts and J-rows, PF/FO pull order.
* 15 Nov 09:3x IST: P-607 (the founder answered all nine; LMIA kept in R1, last). **Rows rev 16.12**: exact copy text for the existing-row edits (FO-3st pointer, FO-6/FO-7c/PF-4p firmAllows, PF-21rs Done when, PF-6, PF-23w, FO-3sr waits, P-607 decision lines) and the X additions.
* 15 Nov 09:5x IST: FO-5f #1791 row questions answered (comment 6889086217); **rows rev 16.13** carries m-2 (expectedStatus on Signed offline) and the filed-version signer into FO-6 and FO-8 Done when.
* 15 Nov 09:5x IST: the current Lead is now **Lead 53** (`local_cbc405f5…`), told what is waiting to be copied (revs 16.10 to 16.13 and Batch 5, unless Lead 52 already copied them).
* 15 Nov 09:5x IST: Lead 53 confirmed everything is in BACKLOG (e500e3a7c: rev 16.10, Batch 5, rev 16.11, the 16.12 edits and X additions; a859caa70: rev 16.13). Nothing is left to copy. PF-23w, then FO-3h, then FO-3sr, when FO-3f merges.
* 15 Nov 10:02 IST: **Lead B (5)** took over (78bb4536d). Lead 53 and Lead B (4) told; the PR-question scan was restarted in a background loop.
* 15 Nov 10:0x IST: **PF-6b brief** (a27965558). Lead B rulings in it:
  * a new catalogue table `platform_permission_key` in its own area file (P-600);
  * custom-role copy lines go to X-1;
  * own versus all is decided by the `view.all` key AND the firm setting.
  * It starts after FO-5f #1791. The BACKLOG amendments for PF-6b and PF-6 were sent to Lead 53.
* 15 Nov 10:0x IST: **#1791 round-3 question**: as row owner, recommended (a), a diff-only high-effort re-Approve, with r2-m1 and r2-m2 folded in (comment 6889254325). The (a)/(b) call is Lead 53's.
* 15 Nov 10:08 IST: **FO-3h brief** (f9be2a5f8). `hostZone()` returns the firm zone until PF-18a, and PF-18a takes over the office-zone line; the attendance mail is included. Starts after FO-3f.
* 15 Nov 10:1x IST: **PF-0c brief** (af22dd7a1). The port list was checked against `main`: AlertPort and DocumentRenderPort added, MailPort out (no real adapter yet). Starts now.
* 15 Nov 10:11 IST: **PF-23w brief** (ba55198ee). It is the join row for map rows 9 and 13, with the J-9 walk; one injection line in the booking feature is OK'd. Starts after FO-3f #1785, which is queued. Each of the four briefs was reported ready to Lead 53.
* 15 Nov (Lead 53 message): **PF-6b's three rulings accepted, and BACKLOG amended** (b70e40a78 on the lead branch):
  * PF-6b's copy and direct-grant lines and PF-6's custom-role line moved to X-1;
  * Touch names the new area file and `platform_permission_key`.
  * **#1791 goes with (a):** a fresh high-effort diff-only review, the breaker re-runs the six ways in, and r2-m1/m2 are folded in.
  * If M-1 is still open or a new Major appears, the clean part merges and **FO-5f2** goes to the top of the pull order.
  * Lead 53 asks for each brief as it is pushed.
* 15 Nov (Lead B (4) message): it stood down; its scan is stopped and its last commit was 308315966.
* 15 Nov 10:14 IST: **J-row briefs** J-24 to J-48 (976dcbbef, `lead-b-briefs/J-rows.md`), sent to Lead 53. **FO-7a #1758 split:** row-owner comment 6889325432; **rows rev 16.14** (da42902ae) has the FO-7a amendment and the new **FO-7mv** (renamed by Lead 53; FO-7m is the monthly trust check) (move list, B-18, B-19, correction kinds). Lead 53 asked to confirm and copy. The scan loop was restarted after the #1758 hit.
* 15 Nov (Lead 53 message): the FO-3h, PF-18a and PF-0c edits are in BACKLOG (e901a2049). PF-0c's lane is a card for the founder. The PF-23w, FO-3h and FO-3sr lanes (FO-3sr's brief is `lead-b-briefs/ROW-w.md`) wait for the founder's next typed turn after #1785 merges.
* 15 Nov (Lead 53 message): FO-7a split confirmed on #1758; rev 16.14 is in BACKLOG as **FO-7mv** (bfd5425a3). FO-7a's kept part gets a diff-only pass at high effort, with the breaker on B-20/B-21 only; one more Major and that part leaves too.
* 15 Nov 10:24 IST: #1791 split as ruled (round 4 Block on M-1 and N-1); **FO-5f2 shaped** (rows rev 16.15, 9cb0d9bcc) on the root cause: an allowlist, a worker with resource limits, the library's own tags, no delimiter change. Brief `lead-b-briefs/FO-5f2.md`. It runs beside PF-6b (different file).
* 15 Nov (Lead 53 message): FO-5f2 (rev 16.15) is in BACKLOG under FO-5f (6b1483ccb) and its design is agreed. Its lane starts in the founder's next typed turn once #1791 is on main.
* 15 Nov: **PF-0c #1797** is running. Its lane's hook refused the edit to ci.yml, and the builder posted the step's YAML for the P-423 read (comment 6889615261). Lead B recommended (a): the Lead OKs it and the step goes back in as one commit (comment 6889622648). Lead 53 was asked. The scan was restarted.
* 15 Nov 10:46 IST: the current Lead is now **Lead 54** (`local_dc187db5…`, confirmed in STATE). PF-0c #1797's ci.yml step is in Lead 53's hand-over list. Report to Lead 54 from now on.
* 15 Nov: Lead 54 replied that it is a standby with no "take over now", although STATE and current-lead.sh name it current. The report was re-sent to Lead 53 with the mismatch named, asking it to send the go or correct STATE.
* 15 Nov: mismatch resolved. Lead 53 sent Lead 54 "take over now" at 10:47 IST, and Lead 54 is the current Lead. The report (PF-0c #1797's P-423 read, the ready briefs) was re-sent to Lead 54.
* 15 Nov (Lead 54 message): PF-0c #1797 option (a) OK'd by Lead 54 (comment 6889675458). **FO-3f #1785 merged**, so PF-23w, FO-3h and FO-3sr start in the founder's next typed turn; PF-6b and FO-5f2 start after #1791.
* 15 Nov: **#1800 PF-23w question:** the J-9 walk assumed a public booking page and a mail path that `main` lacks (my brief's mistake). Ruled (a) (comment 6889832067): W1 through the API plus W2 and W3; W4 and the browser step move to J-37. **J-rows.md corrected:** J-24, J-38 and J-37 now wait on FO-3w, and J-38/J-37 also on the demo-inbox mail adapter (and FO-2 for J-37). PF-0c #1797 has the reviewer's Approve. Lesson: check that a walk's screen exists on `main` before naming it.
* 15 Nov: **rows rev 16.16**: (a) one signing event, `signing.completed`, with `retainer.executed` retired; (b) optional `prepareRetainer` on `booking.completed`, added by FO-3a part 2; (c) a `case_` audit prefix proposed to the release holder; (d) P-610 (PRs under 800 lines, re-review of new commits only) added to the PF-6b, FO-5f2 and J-rows briefs and to the standard rules line for new briefs.
* 15 Nov (Lead 54 message): rev 16.16 copied into BACKLOG and both contracts. (c) agreed: `case_`, added to `AREA_ENTITY` by whichever of CS-W1 or AUD-1 lands first. P-610's time corrected to 11:0x.
* 15 Nov: **FO-3h #1799:** qa's QA-470 check has been out of date since #1785 (mail now goes through jobs). Accepted the builder's patched run as evidence, not committed; the three lines were sent through Lead 54 to qa. The scan was restarted.
* 15 Nov 11:50 IST: the current Lead is now **Lead 55** (`local_1ddb0c4c…`, from 11:49 IST, confirmed in STATE). Report to Lead 55.
* 15 Nov: **PF-23w #1800 B1:** OK'd changing two assertions in `check_pf23_observability.ts`: ok === true, and failing = exactly {database, job_queue}. The suite must pass 65/65 on an isolated copy before the label. Lead 55 was told. The scan was restarted.
* 15 Nov: **PF-6b #1808 Q1, a conflict:** SA-6-27 says "never checks licence", while map row 6 / R1.6 says "licence apart". It was sent to Lead 55 as a founder question, recommending to keep the check as a recorded departure. Meanwhile the row builds as written: no route declares a LICENCE key, and it is reversible. Lead 55 was asked to hold any route declaring a LICENCE key until the founder answers. Q2 (show route only) and Q3 (read view.all from grants) agreed. **Lesson:** read every cited requirement line in full before ruling; I read only the first 400 characters of SA-6-27. The scan loop now stops only on questions.
* 15 Nov: **P-612** (founder 13:08 IST): keep the licence check, a recorded departure from SA-6-27. Passed to the #1808 builder; the hold is lifted.
* 15 Nov: **FO-5f2 #1809:** accepted Q1 (async plus six awaits in service.ts; the builder's "no PF-6b PR" was wrong, since #1808 is open, so the second to merge merges main in), Q2 (four allowlist additions, with customXml still read for tags) and Q3 (the python-docx Word sample for now). The scan was restarted.

**Lead B (6) live (16 Nov, 01:xx IST):**
* **The shaping lane (Lead 61) now drafts the PF/FO "Shaped, no brief" rows.** This includes PF-6, PF-5s and PF-4bc, which PF-4b's merge unblocked. Lead B wrote none of these three.
* **Lead B's duty:** approve or correct each of the lane's batch records PRs (about 5 briefs each) as row owner (P-558).
* **The batches must carry three things:**
  - PF-6 part 1 is the platform frame plus the staff session holder (rev 16.28), and PF-21s waits on it;
  - FO-4's later parts follow revs 16.21 and 16.29 (the assignees list is every active staff member);
  - every rule is checked against `domain/requirements-2026-11-02/` before it is written (revs 16.29 and 16.30 were corrections for missing this).
