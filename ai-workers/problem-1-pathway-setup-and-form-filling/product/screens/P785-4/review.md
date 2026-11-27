# Review: P-785 (2) step 4, CONTRIBUTING.md + PR template + check-contributing.sh (PR #2939)

**Verdict: Changes** (Ship after fixes): no Blocker, 4 Major, 11 Minor. Head reviewed `dfeab892cd773741f4f821f3dea9ae45115fbf21`, diff `origin/main...HEAD` (4 files, +98/-1). Independent reviewer, did not build it.

## What I ran
* `bash product/tools/check-contributing.sh` on the head: **exit 0**, 27 passed, 0 failed.
* Mutations, each restored after (worktree clean at the end):
  * template deleted: exit 1 (`.github/pull_request_template.md exists` FAIL).
  * template made to pass unfilled (Done when and Duplicate check pre-filled): exit 1 (`an unfilled template fails ... exit 0`).
  * only the Duplicate check pre-filled: exit 1 (names-both row).
  * link broken (`qa/BUGS.md` → `qa/BUGZ.md`): exit 1 (`missing: .../qa/BUGZ.md`).
  * template's `Completes:` example made a bare line: exit 1 (detect reads `R1.77`).
  * **a broken link carrying an anchor** (`[x](product/OLD-GUIDE.md#start)` appended): **exit 0**, not caught (m11).
* Each line form the template shows, run through its real parser (item-proof detect, the module-cards.py:143 regex, the deps-line-check.sh:51 sed, pr-size.sh with the size row P-779), as shown (in backticks) and bare. Results are in M1 and m10.
* Main's ruleset (read only, `gh api repos/{owner}/{repo}/rules/branches/main`): the one required status check is `ci`.

## Major
**M1. A `Completes:` line pasted the way the template shows it is silently ignored.** `.github/pull_request_template.md:19-23` shows each form in backticks and says "add the line on its own". With the backticks kept, `` `Completes: R1.77` `` gives `{"items":[],"bad":[]}`: item-proof.mjs:50 is anchored `^[\s>*-]*`, so pr-rules passes and the item's proof never runs at merge. Only a runtime/screens title naming the row gets a warning (`claim`). The same happens when the example is edited in place inside the comment. `` `Card unchanged: …` `` and `` `STANDARDS §1: …` `` in backticks fail loudly (no regex match / empty reason). `` `Size exception: P-779` `` passes either way. The backticks are what keep the example inert (bare and indented, detect reads it, see the mutation above), so keep them, but say so.
*Fix:* in the comment, "type the text inside the backticks at the start of its own line, without the backticks". In check-contributing.sh, strip the backticks from each form and run the real parser on it: detect gives `R1.77`, module-cards matches, deps-line gives a reason, pr-size passes with a real size row. That replaces the self-referential greps (m12).

**M2. The step from draft to ready is missing, so a newcomer's PR stalls.** CONTRIBUTING.md:15 says to open the PR as a draft, and §5 never says to mark it ready. A draft push runs only the push guard; the full `ci` runs only when the PR is marked ready (ci.yml:49-50, 99-103; WAY-OF-WORKING.md:23, :47). Every Mergify queue requires `-draft` (.mergify.yml:159, 176, 213, 230). So an approved, labelled draft never merges.
*Fix:* one sentence in §5: "When the reviewer approves, mark the PR ready for review: the full `ci` runs then, and a draft never joins the queue."

**M3. The "guards" row points to the wrong workflow.** CONTRIBUTING.md:22 links `guards.yml` for "no sources/, code/, archive/, PDFs, … personal names". guards.yml does something else: it runs the guards' own tests with mutation rows (`check-guards.sh --mutate`), only when guard files change, and it is "not a merge condition" (guards.yml:1-3, 7-21). The push guard in CI is a step of `ci` that runs `product/tools/push-guard.sh` (ci.yml:99-102, 270-273).
*Fix:* rename the row "push guard (a step of `ci`)" and link `.githooks/pre-push` and `product/tools/push-guard.sh`.

**M4. check-contributing.sh does not run when the files it guards change.** It runs only through check-guards.sh in guards.yml. guards.yml's `paths:` (lines 7-21) lists `product/tools/**` but not `CONTRIBUTING.md`, `.github/pull_request_template.md` or `prototype/studio/tools/item-proof.mjs`, and `ci` does not run it (ci.yml:305-326). So a later PR that breaks a link, or makes the template pass unfilled, merges with no check run: the gap this PR closes can reopen unseen.
*Fix (smallest):* add `bash "$P/tools/check-contributing.sh"` to ci.yml's "the tools' own checks" step (seconds, every ready PR). Or add the three paths to guards.yml `paths:`, which is non-blocking and takes 20-35 min. Either touches `.github/`, which this PR already does (Lead's read, P-423).

## Minor
* **m1** The template (:2-3) and check-contributing.sh:4 say "pr-rules and the label guard read" the body lines. label-guard.sh reads only PR comments and reviews (label-guard.sh:53-57). The body lines are read by pr-rules and module-cards (and item-proof.yml at merge). *Fix:* "pr-rules and module-cards read them".
* **m2** §3 is titled "The checks your PR must pass". Only `ci` is required by GitHub (ruleset). `queue-fresh` is needed only by the product queue, and only for `prototype/` files (.mergify.yml:192-194). pr-rules is not yet a gate (pr-rules.yml:9; RULES.md P-610, P-526: "not yet a required check"), and neither are module-cards or guards. `xfa-engine` and `skeleton` conditions (.mergify.yml:184-186, 200-202) are not named. *Fix:* one line under the table saying which ones gate and that the reviewer expects the rest green.
* **m3** §5 (:35) "A new push removes the label": a pure merge of main keeps it (label-guard.sh:4-8; WAY-OF-WORKING.md:25). "Nobody merges by hand": P-691 keeps an emergency hand merge for the tech lead (rules/tech-lead.md:104). It is also unclear who puts the label on. queue-gate.sh:4-8 auto-labels on an owner/REVIEWERS Approve plus green `ci` when no lead-read path is touched; otherwise the builder or the Lead does (WAY-OF-WORKING.md:25). *Fix:* reword those three points.
* **m4** §4 (:29): the summary of lead-read-paths.txt is off. The file has no permission entry (permissions come from P-423 and lead-read-guard.sh's SENSITIVE). It also lists `.claude/`, `AGENTS.md`, `CLAUDE.md` and `prototype/studio/tools/` (lead-read-paths.txt:12-15), which a newcomer would not read as "the guards". *Fix:* "(agent rules and skills, CI's gate scripts, …)", plus "or touching permissions (P-423)".
* **m5** §4 (:30): the status `lead-read` does not exist on main until #2920 merges. *Fix:* merge after #2920, or mark the line "(from #2920)".
* **m6** §2 (:15) "Open the PR as a draft at your first commit" follows WAY-OF-WORKING.md:23 and next/SKILL.md:26. RULES.md:146 (P-683, active) says "Approve on the branch first, then open the PR non-draft". This conflict was already in the rule files. *Fix:* name it in the PR for the tech lead; do not settle it silently.
* **m7** §2 (:12) "Take a row that is ready" leaves out BACKLOG.md:8-9 ("One owner per row … never build another owner's rows") and the open waves (B204, `outside-wave`). *Fix:* add "unowned, or given to you by the tech lead".
* **m8** §2 (:15) "under 800 changed lines of code and tests": pr-size counts every file except `product/screens/` and `product/qa/` (pr-rules.yml:55-56), and records-only PRs are exempt. *Fix:* match that wording.
* **m9** The template leaves out WAY-OF-WORKING.md:33's "before/after screenshots for anything visible" and "context share". CONTRIBUTING leaves out WAY-OF-WORKING.md:36: builders never edit `STATE.md`, `DECISIONS.md` or `qa/CAPABILITIES.md`. *Fix:* add a line each.
* **m10** Accidental pass: with the Duplicate check line moved above and Done when left empty, brief-check.sh exits 0. Its Done-when reader (brief-check.sh:13-15) runs on into the optional-lines comment ("each is read by a check"). *Fix:* move that comment block above `**Done when:**`, so Done when is followed directly by `Duplicate check:`.
* **m11** check-contributing.sh:14 (`[^)#]+`) skips any link that has a `#`. A broken anchored link passes (demonstrated above). *Fix:* `grep -oE '\]\([^)]+\)'`, then `sed 's/#.*//'`, and skip empty targets.
* **m12** Lines 19-21 and 23-24 check the document's own words, not what the tools accept. For example, nothing pipes `Lead read the diff: <40 hex>` through lead-read-guard.sh's grep, or `Reviewer: Approve <40 hex>` through queue-gate's parser. Only brief-check and detect are run for real. *Fix:* fold into M1's parser runs.

## Against AGENTS.md and the bar
No personal names (roles only: the tech lead, a member, the reviewer). It replaces no rule file, and line 3 says the rule file wins. 39 lines, one page, plain words. No new technology, US$0. The PR touches `.github/` and `product/tools/`, so it needs the Lead's read (P-423) before the label.

## Journey score
Not applicable as a browser journey: no screen or app route changed, so the journey-test browser, axe, width and data steps cannot run. Instead I did a newcomer walk, simulated by reading only: following CONTRIBUTING.md and the template from "Read first" to "merged". **6/10**:

| task completed 0 (M2 stall) | next step obvious ½ (M2) | plain words 1 | feedback and state ½ (m2) | correct data ½ (M1) |
|---|---|---|---|---|
| **error recovery 1** (§6 question line) | **access/sizes n/a → 1** (plain markdown) | **speed 1** | **visual 1** | **trust and sources ½** (M3, m1) |

Below the pass mark of 8, with a 0. Fixing M1-M3 raises it to about 9.

## Could not check
The lead-read workflow from #2920, which is not on main. Fork PR behaviour on GitHub (read from queue-gate.yml:15-16 only). The repository variable REVIEWERS.

Reviewer: Changes dfeab892cd773741f4f821f3dea9ae45115fbf21
