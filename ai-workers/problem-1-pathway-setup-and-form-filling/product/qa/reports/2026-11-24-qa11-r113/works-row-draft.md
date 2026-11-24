# R1.13 Works row: a draft, ready to go (qa 11)

## What to do
Fill in the two blanks below, then replace the start of the R1.13 row in `qa/CAPABILITIES.md`:
* change the status and as-of columns to `| Works | <main sha> <date> | j_13 |`;
* put this text before the existing "**qa 11 (Track C), 24 Nov ~23:5x IST" entry;
* keep the rest of the row after "Before:".

Then get a fresh reviewer's Approve, and open a records PR labelled `review: approved`.

## The two blanks
* `<P-row>`: the DECISIONS row in which the tech lead records the founder's own typed words that the 24 Nov 04:22Z (09:52 IST) alarm email reached him.
* `<ci run>`: a ci run on GitHub's runners whose tree is main's head, with `check_pf23_observability` 100/100, `check_pf23m_log_calls` 15/15 and `check_pf23w_jobs_wired` 31/31.
  * Use a merge batch run whose `prototype/studio` tree equals main's.
  * If `api/src` has changed since 9b5a93fce, j_13 must also be walked on that head.

## Row text
**qa 11 (Track C), 25 Nov (cloud qa, Opus 5.5 medium; US$0, no AWS call; `qa/reports/2026-11-24-qa11-r113/`): Works.**
* **Parts on main:**
  * PF-23 #1759
  * PF-23w #1800
  * PF-23r #1812
  * PF-23m #2626
  * PF-23c #2743
  * the recorded AWS answers, #3548 (`tests/fixtures/pf23c/`: byte copies of aws/2026-11-22-staging-proof 69b57dc9d, sha256 checked by j_13)
* **On GitHub's runners on main:**
  * walks 45477318897 on 9b5a93fce, job 138741284593 `walk j_13`: success (10/10, exit 0);
  * ci `<ci run>`: pf23 100/100, pf23m 15/15, pf23w 31/31.
* **Independent re-runs:**
  * j_13: 10/10 twice on b68869dde. That PR head's own walk, 45456377363, was green.
  * pf23 100/100, pf23m 15/15 and pf23w 31/31 on main b0448da8b.
* **An alarm reaches a person:**
  * Real 503s raised ALARM at 04:22:34Z, and the action ran on the on-call topic.
  * SNS delivered the message.
  * The topic has one confirmed email subscription.
  * The founder's own words: `<P-row>`.
* **Logs:** kept 90 days in ca-central-1.
* **Fresh reader:** Partial until the two blanks are filled; `reader-verdict.md`.
* **Open findings:** none Major or Critical name R1.13.
* **Minors:**
  * The subscription was read at 16:57Z, not at the time of the alarm.
  * `~/run25.sh` is not committed.
  * The error alarm is proved on one 503 route only.
  * QA-645 is still Open in BUGS.md, and qa should re-check it.
