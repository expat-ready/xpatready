# qa after-merge, 17 Nov 2026 (13:1x to 14:0x IST): the 17 Nov app-code merges

**Run:** main **499bf07ef** (#2077 merged 13:4x IST; it changes only `tests/check_css1_index.ts`, so the app code is main 780b1552c's). Mac qa copy, branch `claude/lucid-bardeen-f90377`. Opus 5.5, medium (P-608). Live AI off: no STUDIO_*_LIVE, no priced button. US$0. Isolated copies only on :4471-:4474 (never :4400, never the main copy's database), each stopped after its run or by its TTL.
**Brief:** Lead 77 (local_baa78a6d), 17 Nov: test every app-code merge of 17 Nov like a person and underneath; a verdict for each in `qa/CAPABILITIES.md`.
**Scope:** the qa pass before this one was R1.77's score on main 6933695372a (`2026-11-17-r177/report.md`). The after-merge lane (`2026-11-16-after-merge-lane.md`) re-tested only rows whose parts were complete. So this round covers every 17 Nov app-code merge without a verdict.

## Verdict
No regression found. **QA-397 (Major) is fixed and closed.** Three new Minors: QA-504 and QA-505 (UX), QA-506 (Gap, no Complaints menu entry). No row moves to Works:
* C8.2 and C11.6 are no longer held by a bug. They wait only for a pack run on main's head on GitHub's runners (P-339).
* Every other row touched still has parts missing (P-606), so it gets no verdict.

| Merge (IST) | What | Row | Underneath | Like a person | Row now |
|---|---|---|---|---|---|
| #1945 PF-6m (03:34) | one money-keys audit line for both role doors | R1.6 | `check_pf6m_money_line.ts` 12/12 twice here; CI | Adding Admin wrote one `money_keys_granted` line (15 keys) | Partial: parts missing PF-6 part 2b, J-6 part 2. The QA-478 closure is in qa #2010 (open) |
| #1989 C9.5-fix (03:34) | Read the list again keeps Move off | C9.5 | `check_c95_release_update_browser.ts` 36/36 in 6 batches. In #1989's own batch it was quarantined (passed only on retry) | not walked (see limits) | Works stands |
| #1997 PF-Fd (03:34) | FilesPort.delete (enabler) | 65, 69, 85 | `check_pffd_delete.ts` 24/24 twice; CI | API only | Not built (routes and screens missing) |
| #2028 PF-Fp part 1 (04:00) | DocumentPdfPort.toPdf (enabler) | — | `check_pffp_pdf.ts` 41/41 twice (no Gotenberg here: its live step was skipped); CI | API only | enabler line |
| #1998 PF-21s part 3 (04:00) | complaints list and record page | R1.109 | `check_pf21s_complaints_browser.ts` 66/66 CI; database and audit read | walked, below | Partial: parts missing J-109 |
| #2002 CS-C1b (04:00) | case counts | R1.77 | scored in r177 | — | Partial (QA-502) |
| #1957 PF-5t part 1 (07:07) | a new terms version asks again (428) | R1.100 | `check_pf5t_terms.ts` 42/42 twice; CI | API only | Partial: parts missing PF-5t part 2, QA-481 |
| #2040 FO-6 part 2 (07:07) | SigningPort, fake, contract | R1.54 | `check_fo6_signing_port.ts` 16/16 twice; CI | API only | Partial: FO-6 routes and screens, FO-6v (held), FO-6d, FO-6ds |
| #2019 FO-2b (08:00) | Corporate prospects | R1.98 | `check_fo2b_corporate.ts` 61/61 twice; CI | API only | Partial: parts missing FO-8 |
| #2041 BK-21 (08:00) | open cases keep the released IRCC account | C8.2, C11.6, R1.77 | qa's QA-397 check 6/6 twice (was 5/6); `check_bk21_pinned_account.ts` 23/23 and `check_b171_account_words.ts` 14/14 in CI; C8.2 pack 19/19 twice on its fixture | (by the QA-397 check) | C8.2 and C11.6 Partial, held only for P-339 |
| #2044 PF-6 part 2a (08:00) | Team, Invite people, Person panel | R1.6 | `check_pf6_staff_browser.ts` 49/49 CI; database and audit read | walked, below | Partial (as #1945) |
| #2035 CS-S1 part 1 (10:24) | case party index and triggers (migration) | R1.102 | `check_css1_index.ts` 54/54 here before and after #2077; CI | no screen yet | Partial: later CS-S1 parts, PF-30a, PF-30s |

**CI run:** every check above is PASS in **run 44003529392**. That is the merge batch of #2043, #2020 and #2035. Its tree, 908b393f4, is the same as main 780b1552c's. Each PR's own merge batch was green too:
* 43957498093 (#1945, #1989, #1997)
* 43958090155 (#2028)
* 43958582809 (#1998)
* 43987278117 (#1957, #2040)
* 43992449758 (#2019, #2041)
* 43995560632 (#2044)

Lines read from the shard logs, for example: "check_pf6_staff_browser.ts | PASS | 14 s | 49/49 passed", "check_bk21_pinned_account.ts | PASS | 102 s | 23/23 passed".

## Walks (headed, browser pane, 1024 px, then 375 px; fresh copy `qa_walk` on :4472, `PLATFORM_IDENTITY=local`, Sample firms seeded)
**Team (PF-6 part 2a, R1.6). Persona: the firm's Owner.**
* Sign-in with a wrong firm key reads "No staff member signs in with that firm key and work email." Enter submits the form.
* Team lists 3 people and "3 of 5 seats used". Screenshot: `pf6-team-1024.jpg`.
* Invite people:
  * "not-an-address" is refused on the field: "That is not an email address (name@example.com)." (`pf6-invite-bad-email.jpg`)
  * An existing staff address is refused on the field: "This person is already on your firm's staff." (`pf6-invite-existing-staff.jpg`)
  * The money and licence groups fold out and list the keys in words ("Expense: create", "Invoice: list"). (`pf6-money-foldout.jpg`)
  * A new address, sent with a **double click**, made exactly one `platform_invitation` (72 h) and one `platform.invitation.created` audit line. The toast read "1 invitation sent" and the seat line moved to 4 of 5.
* Person panel: adding Admin to the second representative, then Save roles, gives the toast "Roles saved…" (`pf6-roles-saved.jpg`). Underneath: one `roles_changed` audit line (CASE_MANAGER → CASE_MANAGER, ADMIN) and one `money_keys_granted` line (15 keys). The invitation wrote no money line, as PF-6m DW1 intends (the line is written on accept).
* Accessible names: each role checkbox is inside its role's label, and each complaints field has its label. The browser tool's tree showed "on" and "Choose" because it lists values, not names. This is not a finding.
* **Wrong role by URL:** the Case Officer opening /platform/team gets "Not available" and has no Team menu entry. But the words show the raw key "(agent/staff:manage)": **QA-504** (`qa504-raw-key.jpg`).
* **375 px:** the page does not overflow, but Name and Email wrap one or two letters a line: **QA-505** (`qa505-team-375.jpg`).

**Complaints (PF-21s part 3, R1.109).**
* The Case Officer sees "Complaints you handle", with no Record button.
* The Owner presses Record a complaint with nothing filled. The three missing fields are named in a summary and on each field (`pf21s-empty-form-errors.jpg`).
* The Owner fills it with a non-English name and text, Email and Fees, then double-clicks Record. Underneath: one `plat_complaint` row and one `complaint.record` audit line.
* The record page shows "Acknowledge by Nov 19, 2026, 5:00 p.m. · 2 business days" (a Sample period), with dates in the firm's zone (`pf21s-record-page.jpg`).
* Back goes to the list: Open 1, All 1. At 375 px the list fits and its table scrolls inside (`pf21s-list-375.jpg`).
* **No menu entry reaches Complaints.** `web/src/modules/platform/account-sections.ts` lists only Profile and Team, so a person reaches the page only by typing its address: **QA-506** (Minor, J-109).

## Bugs
0 Blocker · 0 Critical · 0 Major · **3 Minor (new: QA-504, QA-505, QA-506)** · closed: **QA-397** (Major).

## Coverage
Not measured this round. c8 needs the API server under the tsx CLI, which this sandbox refuses (see limits). The floor is unchanged from the last report.

## What I could not test here, and why
The Mac qa sandbox refuses local sockets and `nohup`:
* The `tsx` CLI's IPC pipe fails (listen EPERM), and so does Chromium's profile lock (ProcessSingleton).
* So `tools/isolated.sh` cannot start a copy as written. I ran a scratch copy of it in which the server starts with `node --import tsx` and `nohup` is dropped, and the "Postgres running" check uses `pg_isready` (pg_ctl cannot signal the server from the sandbox). Same code, migrations, web build and TTL stop.
* Playwright's Chromium cannot launch, so the scripted browser checks (`check_pf6_staff_browser`, `check_pf21s_complaints_browser`, `check_c95_release_update_browser`, and the BK-21 and B171 browser parts) were **not re-run here**. Their evidence is the GitHub runners' PASS lines above. The person walks used the app's browser pane instead.
* Headless replays at 400, 1024 and 1440 px, run twice: not done (same reason). One headed walk at 1024 and 375 px instead.
* The C8.2 and C11.6 packs on the configured checkpoint, on GitHub: not dispatched, so as not to add jobs to a queue of ~70 runs. C8.2 ran on its fixture here.
* PF-Fp's live Gotenberg step: no container here.

## Questions for the tech lead, answered by Lead 77 (14:1x IST)
1. Complaints menu entry: log it as a Minor with J-109 as its source; the row owner adds the entry. Logged as **QA-506**.
2. C8.2 and C11.6 to Works: dispatch nightly C8.2 and C11.6 on the checkpoint once fewer than 20 runs are queued (54 at 14:1x), or after tomorrow's org move. Until then both wait on a P-339 runner run.
3. Sandbox tooling: no. `tools/isolated.sh` stays as it is (a shared launcher under the Lead's read). Browser checks are left to the GitHub-runner packs and recorded as "waits on P-339 runner run".

## Suggestions
* QA-504's fix in `guard.ts` changes the 403 words on every platform page. *Needed for the proof* · *Capability*.
