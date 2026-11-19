# qa gate A walks, night of 18-19 Nov 2026 (22:5x to 07:0x IST): platform rows as they merged

**Run:** Mac qa copy (branch `claude/qa-after-merge-1117`; walks from exports of main at each merge). Opus 5.5, medium (P-608). Live AI off: no STUDIO_*_LIVE, no priced button. US$0. Isolated copies only, on :4473-:4476 (never :4400, never the main copy's database).
**Brief:** Lead 81 (20:23 IST): gate A walks, to the next capability's first step, for each product PR merged tonight. qa-4 took the front-office and case rows, this session the platform rows. Report product rows only (P-703). Then Leads 82-85 in turn; P-707 (founder, 00:0x IST): Proven first.
**Sandbox:** a later `isolated.sh stop` cannot signal the copy's server and also ends its own timer, so four ports stayed stuck at 503. The founder's kill freed 4473-4475; 4476 still waits. From 23:17 IST each copy ended at its `--ttl` only. Chrome cannot launch here (ProcessSingleton), so browser steps used the app's browser pane.

## Verdict
Every walked row passes gate A. No row moves to Works: each still has a part missing (P-606), named per row below. No new bug row; evidence was added to QA-187 and QA-504.

| Merge (IST) | Row | Main walked | Gate A | Row now (parts missing) |
|---|---|---|---|---|
| #2009 PF-18a part 1 (19:47) | R1.92 | 628742f00 | PASS (API) | Partial: PF-18a part 2, PF-18s, PF-4c part 2, PF-5s |
| #2003 AUD-1a (18:32) | R1.8 | 628742f00 | PASS | qa-4's carry-forward (row unchanged here) |
| #2014 PF-8r (18:39) | R1.14 | 2ad701363 | PASS (nightly job) | Partial: PF-8rc (AWS account) |
| #2135 PF-5t part 2 (23:09) | R1.100 | b403d310d | PASS | qa-4 scores the row with #1959 |
| #2134 PF-21s part 4 (23:09) | R1.109 | b403d310d | PASS | Partial: PF-21i (#2012), J-109 |
| #2064 PF-18b (23:33) | R1.93 | 2c9231ab4 | PASS (API) | Partial: PF-4s, PF-17, PF-18s |
| #2128 PF-F4 (02:49) | R1.67 | 34c5e1e99 | PASS (enabler) | Partial: CS-D1 |
| #2127 PF-6 part 2b (03:56) | R1.6 | 2ad701363 | PASS | Partial: J-6 part 2 (#2172, queued) |

Also, on qa-4's ask (06:34 IST, main 9d440b2f4): the R1.28 walk. The four R1.28 lines and R1.30's Leads at 400/1024/1440 px pass; axe was not run. qa-4 records it.

## Walks
**AUD-1a (R1.8):**
* The demo reset and the configured checkpoint load (220 s; ~88 s on 17 Nov in the same sandbox; not pinned on a PR) work with the insert-only triggers.
* A direct UPDATE or DELETE of an audit line is refused in words. All 3,450 lines have an actor type. New lines leave `firm_id` empty, as AUD-1a's brief says (AUD-1b fills it).
* Case › Review › Add finding, double-clicked: one finding and one `added` line. Two "Finding added" toasts show (cosmetic, QA-297's pattern; `aud1a-review-finding-double-toast.jpg`).

**PF-18a part 1 (R1.92), over HTTP as the Owner:**
* Alberta pre-fills America/Edmonton, and a non-English office name saves.
* Four bad zones get 400 "Choose a time zone from the list". A duplicate name in other letter case gets 409.
* The Case Officer gets 403, and another firm gets 404. A stale version gets 409; two saves at once give one 200 and one 409.
* A closed day in office B leaves the first office open. `POST {}` answers in the validator's words (QA-187).

**PF-5t part 2 (R1.100):**
* With Sample versions published, the Owner is stopped by "We've updated our privacy notice and terms of service." (`pf5t-terms-page.jpg`).
* A double-clicked I accept recorded one acceptance per version, then landed the Owner back on Team › Invited at the same address (`pf5t-back-on-team-invited.jpg`).
* A version published mid-session asks at the next click. Settings › Terms lists every acceptance. The Case Officer is asked only for the privacy notice, and Sign out works.

**PF-21s part 4 (R1.109):**
* The one filled button goes Acknowledge → Add a handling step → Record the response sent → Close.
* Refusals show in the panel, with a summary and on the field: an acknowledgement before the received time, a future date, an empty note, a close with no outcome.
* Double clicks write one event and one audit line each. A closed complaint shows Add a note only, and the register reads Closed 1.
* Over the API: another firm, or the Case Officer who is not the handler, gets 404. A step or a second close on the closed complaint gets 409.
* The toast comes ~3 s before "What happened" refreshes.

**PF-18b (R1.93), over HTTP:**
* A raised ticket keeps non-English text and a PDF. Refused, each in words: an empty body, a fake PDF, a file over 10 MB, 4 files, a full URL as the page.
* Own tickets versus all versus another firm (404). The attachment by link is the same bytes. Audit lines hold ids only. A message cannot be changed.
* Two identical replies sent at once both land: PF-18s must guard (sent to Lead B).
* The support-inbox email: **not checked** (Lead 82: test it on PF-18s's walk).

**PF-F4 (R1.67):**
* `check_pff4_file_type.ts` 78/78 twice. A break probe passed: empty, truncated, GIF, SVG named `.png`, hex-escaped `/JavaScript`, path and right-to-left names.
* Known limit (file-type.ts:118): scripts inside a compressed object stream are not flagged. Lead 83 adds "opens every PDF" to CS-D5's Done when, and a name-length cap to PF-F2.

**PF-6 part 2b (R1.6):**
* Invitation (a known token set, as the row's own check does) → Continue, double-clicked: one staff row, one `accepted` line. The person lands signed in on Profile.
* Own licence saved. The Owner's Licences list, where a stale save is refused. Security shows the two-step line only.
* The number is in no audit, event, outbox row or API log. A Case Officer opening by URL sees the raw key (QA-504).
* Known gaps from the deleted `qa/built/PF-6.md` (asked on #2127; no bug row yet): Reset two-step on the Person panel; the provider's two-step set-up link not returned by the API. Carried into R1.6's note.
* Note, ruled by Lead 84: the seed stores codes (`rcic`/`CICC`) and the screen stores words. The case-side IMM 5476 adoption row maps both to one code.

**PF-8r (R1.14):** the 01:53 IST schedule did not run, so I dispatched nightly run 44412299740 (04:00 IST, Lead 83's go). Job 135183381279 green: 10/10, restore in 23 s (the run as a whole ended cancelled: its job suites (3) was cancelled; only the drill job is scored). On tiny data the RTO is not shown.

## Bugs
0 Blocker · 0 Critical · 0 Major · 0 new Minor. Evidence added: QA-187 (two routes), QA-504 (/platform/licences). QA-508's closure now points at DECISIONS P-694 (reaching main with #2173), as does R1.58's note.

## Not tested here, and why
* The scripted Playwright replays (400/1024/1440, twice) and axe could not run: Chrome cannot launch in this sandbox. Each row's browser check passed on GitHub's runners in its merge batch.
* The PF-18b support email (above). The PF-8r drill at real volume.

## Questions for the tech lead
None open: each was answered during the night (Leads 81-85).

## Suggestions
* Run the restore drill once on the configured checkpoint, or a larger seed, so DW4 says something about the 4 h RTO. *Later* · *Scaffolding*.
* `isolated.sh stop` should keep the copy's timer when it cannot stop the server (recorded by Lead 81 as a row to shape). *Needed for the proof* · *Scaffolding*.
