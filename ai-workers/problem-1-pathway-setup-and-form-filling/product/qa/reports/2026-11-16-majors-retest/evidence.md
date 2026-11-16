# Majors retest, 16 Nov 2026: evidence (PASS/FAIL lines word for word)

Copied from each run's output; only the PASS, FAIL, STOP, total and exit lines are kept (the raw output is not committed, AGENTS rule 1).
Each block is one run: check, width in px, commit, start time (UTC). Every run was headless Playwright on its own isolated copy (ports 4470-4475), started and stopped in the same command, live AI off, US$0.

**Commits.** `74b0a25fb` is origin/main as given. `daa6211c9` is `74b0a25fb` plus a checkpoint commit made on this branch during the runs; it adds only these qa check files and screenshots, so the app under test is the same. The before-fix runs used scratch worktrees (removed afterwards) at each fix's first parent:
* `5dc5e8e1c`, the first parent of #1644 (QA-421). It is also before #1652, so QA-427's check ran there too.
* `3316ae6c0`, the first parent of #1643 (QA-439).
* `494b45060`, the first parent of #1671 (QA-445).
* `fc31b1e95`, the first parent of #1678 (QA-446).

Each worktree had its own copy of `node_modules`, and its web bundle was built at start (`tools/web-fresh.sh`). One local, uncommitted edit was made in each worktree's `tools/isolated.sh`: it points at the shared database's real path, because the sandbox refused that path through a symlink.

**Before the fix, one run ended early.** On `5dc5e8e1c`, QA-427's check stops at step 3 (`STOP … [data-household-to-confirm]`): that attribute came later, with QA-417. Before the stop, the row's own point had already failed: "Client A done: … Next: Client A answers on their phone".

## QA-445 · check_qa445_save_and_continue.cjs

### qa445-main-run1 width 1024 commit 74b0a25fb 03:44:52Z

```
PASS QA-445 Visitor visa setup: a case opens
PASS QA-445 setup: part 1 is Details of visit to Canada
PASS QA-445 setup: the part saved
PASS QA-445 fail today: Save and continue on part 1 opens another part (or the overview), not part 1 again
PASS QA-445 Visitor visa: Save and continue never stays on the part it was pressed on (10 presses)
PASS QA-445 Visitor visa: each press opens the next part that is not done (the client's own view; the overview when none)
PASS QA-445 Study permit setup: a case opens
PASS QA-445 Study permit: Save and continue never stays on the part it was pressed on (10 presses)
PASS QA-445 Study permit: each press opens the next part that is not done (the client's own view; the overview when none)
all passed
# exit 0
```

### qa445-main-run1 width 1440 commit 74b0a25fb 03:48:51Z

```
PASS QA-445 Visitor visa setup: a case opens
PASS QA-445 setup: part 1 is Details of visit to Canada
PASS QA-445 setup: the part saved
PASS QA-445 fail today: Save and continue on part 1 opens another part (or the overview), not part 1 again
PASS QA-445 Visitor visa: Save and continue never stays on the part it was pressed on (10 presses)
PASS QA-445 Visitor visa: each press opens the next part that is not done (the client's own view; the overview when none)
PASS QA-445 Study permit setup: a case opens
PASS QA-445 Study permit: Save and continue never stays on the part it was pressed on (10 presses)
PASS QA-445 Study permit: each press opens the next part that is not done (the client's own view; the overview when none)
all passed
# exit 0
```

### qa445-main-run1 width 400 commit 74b0a25fb 03:48:04Z

```
PASS QA-445 Visitor visa setup: a case opens
PASS QA-445 setup: part 1 is Details of visit to Canada
PASS QA-445 setup: the part saved
PASS QA-445 fail today: Save and continue on part 1 opens another part (or the overview), not part 1 again
PASS QA-445 Visitor visa: Save and continue never stays on the part it was pressed on (10 presses)
PASS QA-445 Visitor visa: each press opens the next part that is not done (the client's own view; the overview when none)
PASS QA-445 Study permit setup: a case opens
PASS QA-445 Study permit: Save and continue never stays on the part it was pressed on (10 presses)
PASS QA-445 Study permit: each press opens the next part that is not done (the client's own view; the overview when none)
all passed
# exit 0
```

### qa445-main-run2 width 1024 commit daa6211c9 04:09:24Z

```
PASS QA-445 Visitor visa setup: a case opens
PASS QA-445 setup: part 1 is Details of visit to Canada
PASS QA-445 setup: the part saved
PASS QA-445 fail today: Save and continue on part 1 opens another part (or the overview), not part 1 again
PASS QA-445 Visitor visa: Save and continue never stays on the part it was pressed on (10 presses)
PASS QA-445 Visitor visa: each press opens the next part that is not done (the client's own view; the overview when none)
PASS QA-445 Study permit setup: a case opens
PASS QA-445 Study permit: Save and continue never stays on the part it was pressed on (10 presses)
PASS QA-445 Study permit: each press opens the next part that is not done (the client's own view; the overview when none)
all passed
# exit 0
```

### qa445-before-494b45060 width 1024 commit 494b45060 03:56:20Z

```
PASS QA-445 Visitor visa setup: a case opens
PASS QA-445 setup: part 1 is Details of visit to Canada
PASS QA-445 setup: the part saved
FAIL QA-445 fail today: Save and continue on part 1 opens another part (or the overview), not part 1 again: {"part":"1","head":"Client questionnaire\nBack\n✓ Saved\n\nPart 1 of 56 · Details of visit to Canada\n\nDetails of visit to Canada\n\nAnswered once for the whole application.\n\nDeclared: th"}
FAIL QA-445 Visitor visa: Save and continue never stays on the part it was pressed on (10 presses): [{"press":1,"part":"Details of visit to Canada|Answered once for the whole application.","screen":"Part 1 of 56 · Details of visit to Canada"},{"press":2,"part":"Details of visit to Canada|Answered once for the whole application.","screen":"Part 1 of 56 · Details of visit to Canada"},{"press":3,"part":"Details of visit to Canada|Answered once for the whole application.","screen":"Part 1 of 56 · Details of visit to Canada"}]
PASS QA-445 Visitor visa: each press opens the next part that is not done (the client's own view; the overview when none)
PASS QA-445 Study permit setup: a case opens
FAIL QA-445 Study permit: Save and continue never stays on the part it was pressed on (10 presses): [{"press":1,"part":"Details of intended study in Canada|Answered once for the whole application.","screen":"Part 1 of 52 · Details of intended study in Canada"},{"press":2,"part":"Details of intended study in Canada|Answered once for the whole application.","screen":"Part 1 of 52 · Details of intended study in Canada"},{"press":3,"part":"Details of intended study in Canada|Answered once for the whole application.","screen":"Part 1 of 52 · Details of intended study in Canada"}]
PASS QA-445 Study permit: each press opens the next part that is not done (the client's own view; the overview when none)
3 failed
# exit 1
```


## QA-446 · check_qa446_confirm_rule.cjs

### qa446-main-run1 width 1024 commit 74b0a25fb 03:45:07Z

```
PASS C6.3 C8.3 QA-446 Visitor visa setup: a family case (Client A, spouse 38, child 10) with Client A's answers (262)
PASS C6.3 C8.3 QA-446 Visitor visa 1 the principal's and the child's tabs show nothing to confirm; the spouse's shows some
PASS C6.3 C8.3 QA-446 Visitor visa 1 the household line ("82 to confirm") = the sum of the tabs = the Agent view underneath
PASS C6.3 C8.3 QA-446 Visitor visa 2 on "National identity document" (0 to confirm), Confirm section is disabled or explained (disabled: false)
PASS C6.3 C8.3 QA-446 Visitor visa 2 it confirms nothing: the section still reads "0 to confirm", its answers stay Declared (none marked Confirmed), the reply confirmed 0
PASS C6.3 C8.3 QA-446 Visitor visa 3 after Confirm section on every section with something to confirm (the spouse's and the relatives' tabs), the household reads "0 to confirm"
PASS C6.3 C8.3 QA-446 Visitor visa 4 setup: round 1 sent with every filing (3); the representative's review shows one Values line per filing
PASS C6.3 C8.3 QA-446 Visitor visa 4 the principal (Client A)'s filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"
PASS C6.3 C8.3 QA-446 Visitor visa 4 the child's filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"
PASS C6.3 C8.3 QA-446 Visitor visa 4 the spouse's filing says "confirmed by" and "0 to confirm"
PASS C6.3 C8.3 QA-446 Visitor visa 4 the spouse's "confirmed by Case officer" count (68) = the answers the officer confirmed on the spouse's tabs (68)
PASS C6.3 C8.3 QA-446 Visitor visa 4 every filing's Values line adds up (facts = declared + confirmed + to confirm)
PASS C6.3 C8.3 QA-446 Study permit setup: a family case (Client A, spouse 38, child 10) with Client A's answers (288)
PASS C6.3 C8.3 QA-446 Study permit 1 the principal's and the child's tabs show nothing to confirm; the spouse's shows some
PASS C6.3 C8.3 QA-446 Study permit 1 the household line ("94 to confirm") = the sum of the tabs = the Agent view underneath
PASS C6.3 C8.3 QA-446 Study permit 2 on "National identity document" (0 to confirm), Confirm section is disabled or explained (disabled: false)
PASS C6.3 C8.3 QA-446 Study permit 2 it confirms nothing: the section still reads "0 to confirm", its answers stay Declared (none marked Confirmed), the reply confirmed 0
PASS C6.3 C8.3 QA-446 Study permit 3 after Confirm section on every section with something to confirm (the spouse's and the relatives' tabs), the household reads "0 to confirm"
PASS C6.3 C8.3 QA-446 Study permit 4 setup: round 1 sent with every filing (3); the representative's review shows one Values line per filing
PASS C6.3 C8.3 QA-446 Study permit 4 the principal (Client A)'s filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"
PASS C6.3 C8.3 QA-446 Study permit 4 the child's filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"
PASS C6.3 C8.3 QA-446 Study permit 4 the spouse's filing says "confirmed by" and "0 to confirm"
PASS C6.3 C8.3 QA-446 Study permit 4 the spouse's "confirmed by Case officer" count (78) = the answers the officer confirmed on the spouse's tabs (78)
PASS C6.3 C8.3 QA-446 Study permit 4 every filing's Values line adds up (facts = declared + confirmed + to confirm)
PASS C6.3 C8.3 QA-446 no page errors
25 passed, 0 failed
# exit 0
```

### qa446-main-run1 width 1440 commit 74b0a25fb 03:54:03Z

```
PASS C6.3 C8.3 QA-446 Visitor visa setup: a family case (Client A, spouse 38, child 10) with Client A's answers (262)
PASS C6.3 C8.3 QA-446 Visitor visa 1 the principal's and the child's tabs show nothing to confirm; the spouse's shows some
PASS C6.3 C8.3 QA-446 Visitor visa 1 the household line ("82 to confirm") = the sum of the tabs = the Agent view underneath
PASS C6.3 C8.3 QA-446 Visitor visa 2 on "National identity document" (0 to confirm), Confirm section is disabled or explained (disabled: false)
PASS C6.3 C8.3 QA-446 Visitor visa 2 it confirms nothing: the section still reads "0 to confirm", its answers stay Declared (none marked Confirmed), the reply confirmed 0
PASS C6.3 C8.3 QA-446 Visitor visa 3 after Confirm section on every section with something to confirm (the spouse's and the relatives' tabs), the household reads "0 to confirm"
PASS C6.3 C8.3 QA-446 Visitor visa 4 setup: round 1 sent with every filing (3); the representative's review shows one Values line per filing
PASS C6.3 C8.3 QA-446 Visitor visa 4 the principal (Client A)'s filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"
PASS C6.3 C8.3 QA-446 Visitor visa 4 the child's filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"
PASS C6.3 C8.3 QA-446 Visitor visa 4 the spouse's filing says "confirmed by" and "0 to confirm"
PASS C6.3 C8.3 QA-446 Visitor visa 4 the spouse's "confirmed by Case officer" count (68) = the answers the officer confirmed on the spouse's tabs (68)
PASS C6.3 C8.3 QA-446 Visitor visa 4 every filing's Values line adds up (facts = declared + confirmed + to confirm)
PASS C6.3 C8.3 QA-446 Study permit setup: a family case (Client A, spouse 38, child 10) with Client A's answers (288)
PASS C6.3 C8.3 QA-446 Study permit 1 the principal's and the child's tabs show nothing to confirm; the spouse's shows some
PASS C6.3 C8.3 QA-446 Study permit 1 the household line ("94 to confirm") = the sum of the tabs = the Agent view underneath
PASS C6.3 C8.3 QA-446 Study permit 2 on "National identity document" (0 to confirm), Confirm section is disabled or explained (disabled: false)
PASS C6.3 C8.3 QA-446 Study permit 2 it confirms nothing: the section still reads "0 to confirm", its answers stay Declared (none marked Confirmed), the reply confirmed 0
PASS C6.3 C8.3 QA-446 Study permit 3 after Confirm section on every section with something to confirm (the spouse's and the relatives' tabs), the household reads "0 to confirm"
PASS C6.3 C8.3 QA-446 Study permit 4 setup: round 1 sent with every filing (3); the representative's review shows one Values line per filing
PASS C6.3 C8.3 QA-446 Study permit 4 the principal (Client A)'s filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"
PASS C6.3 C8.3 QA-446 Study permit 4 the child's filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"
PASS C6.3 C8.3 QA-446 Study permit 4 the spouse's filing says "confirmed by" and "0 to confirm"
PASS C6.3 C8.3 QA-446 Study permit 4 the spouse's "confirmed by Case officer" count (78) = the answers the officer confirmed on the spouse's tabs (78)
PASS C6.3 C8.3 QA-446 Study permit 4 every filing's Values line adds up (facts = declared + confirmed + to confirm)
PASS C6.3 C8.3 QA-446 no page errors
25 passed, 0 failed
# exit 0
```

### qa446-main-run1 width 400 commit 74b0a25fb 03:51:45Z

```
PASS C6.3 C8.3 QA-446 Visitor visa setup: a family case (Client A, spouse 38, child 10) with Client A's answers (262)
PASS C6.3 C8.3 QA-446 Visitor visa 1 the principal's and the child's tabs show nothing to confirm; the spouse's shows some
PASS C6.3 C8.3 QA-446 Visitor visa 1 the household line ("82 to confirm") = the sum of the tabs = the Agent view underneath
PASS C6.3 C8.3 QA-446 Visitor visa 2 on "National identity document" (0 to confirm), Confirm section is disabled or explained (disabled: false)
PASS C6.3 C8.3 QA-446 Visitor visa 2 it confirms nothing: the section still reads "0 to confirm", its answers stay Declared (none marked Confirmed), the reply confirmed 0
PASS C6.3 C8.3 QA-446 Visitor visa 3 after Confirm section on every section with something to confirm (the spouse's and the relatives' tabs), the household reads "0 to confirm"
PASS C6.3 C8.3 QA-446 Visitor visa 4 setup: round 1 sent with every filing (3); the representative's review shows one Values line per filing
PASS C6.3 C8.3 QA-446 Visitor visa 4 the principal (Client A)'s filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"
PASS C6.3 C8.3 QA-446 Visitor visa 4 the child's filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"
PASS C6.3 C8.3 QA-446 Visitor visa 4 the spouse's filing says "confirmed by" and "0 to confirm"
PASS C6.3 C8.3 QA-446 Visitor visa 4 the spouse's "confirmed by Case officer" count (68) = the answers the officer confirmed on the spouse's tabs (68)
PASS C6.3 C8.3 QA-446 Visitor visa 4 every filing's Values line adds up (facts = declared + confirmed + to confirm)
PASS C6.3 C8.3 QA-446 Study permit setup: a family case (Client A, spouse 38, child 10) with Client A's answers (288)
PASS C6.3 C8.3 QA-446 Study permit 1 the principal's and the child's tabs show nothing to confirm; the spouse's shows some
PASS C6.3 C8.3 QA-446 Study permit 1 the household line ("94 to confirm") = the sum of the tabs = the Agent view underneath
PASS C6.3 C8.3 QA-446 Study permit 2 on "National identity document" (0 to confirm), Confirm section is disabled or explained (disabled: false)
PASS C6.3 C8.3 QA-446 Study permit 2 it confirms nothing: the section still reads "0 to confirm", its answers stay Declared (none marked Confirmed), the reply confirmed 0
PASS C6.3 C8.3 QA-446 Study permit 3 after Confirm section on every section with something to confirm (the spouse's and the relatives' tabs), the household reads "0 to confirm"
PASS C6.3 C8.3 QA-446 Study permit 4 setup: round 1 sent with every filing (3); the representative's review shows one Values line per filing
PASS C6.3 C8.3 QA-446 Study permit 4 the principal (Client A)'s filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"
PASS C6.3 C8.3 QA-446 Study permit 4 the child's filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"
PASS C6.3 C8.3 QA-446 Study permit 4 the spouse's filing says "confirmed by" and "0 to confirm"
PASS C6.3 C8.3 QA-446 Study permit 4 the spouse's "confirmed by Case officer" count (78) = the answers the officer confirmed on the spouse's tabs (78)
PASS C6.3 C8.3 QA-446 Study permit 4 every filing's Values line adds up (facts = declared + confirmed + to confirm)
PASS C6.3 C8.3 QA-446 no page errors
25 passed, 0 failed
# exit 0
```

### qa446-main-run2 width 1024 commit daa6211c9 04:05:03Z

```
PASS C6.3 C8.3 QA-446 Visitor visa setup: a family case (Client A, spouse 38, child 10) with Client A's answers (262)
PASS C6.3 C8.3 QA-446 Visitor visa 1 the principal's and the child's tabs show nothing to confirm; the spouse's shows some
PASS C6.3 C8.3 QA-446 Visitor visa 1 the household line ("82 to confirm") = the sum of the tabs = the Agent view underneath
PASS C6.3 C8.3 QA-446 Visitor visa 2 on "National identity document" (0 to confirm), Confirm section is disabled or explained (disabled: false)
PASS C6.3 C8.3 QA-446 Visitor visa 2 it confirms nothing: the section still reads "0 to confirm", its answers stay Declared (none marked Confirmed), the reply confirmed 0
PASS C6.3 C8.3 QA-446 Visitor visa 3 after Confirm section on every section with something to confirm (the spouse's and the relatives' tabs), the household reads "0 to confirm"
PASS C6.3 C8.3 QA-446 Visitor visa 4 setup: round 1 sent with every filing (3); the representative's review shows one Values line per filing
PASS C6.3 C8.3 QA-446 Visitor visa 4 the principal (Client A)'s filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"
PASS C6.3 C8.3 QA-446 Visitor visa 4 the child's filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"
PASS C6.3 C8.3 QA-446 Visitor visa 4 the spouse's filing says "confirmed by" and "0 to confirm"
PASS C6.3 C8.3 QA-446 Visitor visa 4 the spouse's "confirmed by Case officer" count (68) = the answers the officer confirmed on the spouse's tabs (68)
PASS C6.3 C8.3 QA-446 Visitor visa 4 every filing's Values line adds up (facts = declared + confirmed + to confirm)
PASS C6.3 C8.3 QA-446 Study permit setup: a family case (Client A, spouse 38, child 10) with Client A's answers (288)
PASS C6.3 C8.3 QA-446 Study permit 1 the principal's and the child's tabs show nothing to confirm; the spouse's shows some
PASS C6.3 C8.3 QA-446 Study permit 1 the household line ("94 to confirm") = the sum of the tabs = the Agent view underneath
PASS C6.3 C8.3 QA-446 Study permit 2 on "National identity document" (0 to confirm), Confirm section is disabled or explained (disabled: false)
PASS C6.3 C8.3 QA-446 Study permit 2 it confirms nothing: the section still reads "0 to confirm", its answers stay Declared (none marked Confirmed), the reply confirmed 0
PASS C6.3 C8.3 QA-446 Study permit 3 after Confirm section on every section with something to confirm (the spouse's and the relatives' tabs), the household reads "0 to confirm"
PASS C6.3 C8.3 QA-446 Study permit 4 setup: round 1 sent with every filing (3); the representative's review shows one Values line per filing
PASS C6.3 C8.3 QA-446 Study permit 4 the principal (Client A)'s filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"
PASS C6.3 C8.3 QA-446 Study permit 4 the child's filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed"
PASS C6.3 C8.3 QA-446 Study permit 4 the spouse's filing says "confirmed by" and "0 to confirm"
PASS C6.3 C8.3 QA-446 Study permit 4 the spouse's "confirmed by Case officer" count (78) = the answers the officer confirmed on the spouse's tabs (78)
PASS C6.3 C8.3 QA-446 Study permit 4 every filing's Values line adds up (facts = declared + confirmed + to confirm)
PASS C6.3 C8.3 QA-446 no page errors
25 passed, 0 failed
# exit 0
```

### qa446-before-fc31b1e95 width 1024 commit fc31b1e95 04:04:26Z

```
PASS C6.3 C8.3 QA-446 Visitor visa setup: a family case (Client A, spouse 38, child 10) with Client A's answers (262)
PASS C6.3 C8.3 QA-446 Visitor visa 1 the principal's and the child's tabs show nothing to confirm; the spouse's shows some
PASS C6.3 C8.3 QA-446 Visitor visa 1 the household line ("82 to confirm") = the sum of the tabs = the Agent view underneath
FAIL C6.3 C8.3 QA-446 Visitor visa 2 on "National identity document" (0 to confirm), Confirm section is disabled or explained (disabled: false): {"disabled":false,"beside":"National identity document for Sample Client A 1 answered · 0 to confirm Fill this from documents Confirm section","toast":"National identity document for Sample Client A: 1 answer confirmed."}
FAIL C6.3 C8.3 QA-446 Visitor visa 2 it confirms nothing: the section still reads "0 to confirm", its answers stay Declared (none marked Confirmed), the reply confirmed 0: {"after":"Signature for Sample Client A 1 answered · 0 to confirm Fill this from documents Confirm section","stillDeclared":true,"confirmedMarks":0,"reply":{"confirmed":1}}
PASS C6.3 C8.3 QA-446 Visitor visa 3 after Confirm section on every section with something to confirm (the spouse's and the relatives' tabs), the household reads "0 to confirm"
PASS C6.3 C8.3 QA-446 Visitor visa 4 setup: round 1 sent with every filing (3); the representative's review shows one Values line per filing
FAIL C6.3 C8.3 QA-446 Visitor visa 4 the principal (Client A)'s filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed": "Values confirmed: 1 fact, by Case officer (Sample)"
FAIL C6.3 C8.3 QA-446 Visitor visa 4 the child's filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed": "Values confirmed: none yet"
FAIL C6.3 C8.3 QA-446 Visitor visa 4 the spouse's filing says "confirmed by" and "0 to confirm": "Values confirmed: 54 facts, by Case officer (Sample)"
FAIL C6.3 C8.3 QA-446 Visitor visa 4 the spouse's "confirmed by Case officer" count (0) = the answers the officer confirmed on the spouse's tabs (68): {"shown":0,"officerConfirmed":68,"ws":"Values confirmed: 54 facts, by Case officer (Sample)"}
FAIL C6.3 C8.3 QA-446 Visitor visa 4 every filing's Values line adds up (facts = declared + confirmed + to confirm): ["Values confirmed: 1 fact, by Case officer (Sample)","Values confirmed: 54 facts, by Case officer (Sample)","Values confirmed: none yet"]
PASS C6.3 C8.3 QA-446 Study permit setup: a family case (Client A, spouse 38, child 10) with Client A's answers (272)
PASS C6.3 C8.3 QA-446 Study permit 1 the principal's and the child's tabs show nothing to confirm; the spouse's shows some
PASS C6.3 C8.3 QA-446 Study permit 1 the household line ("81 to confirm") = the sum of the tabs = the Agent view underneath
FAIL C6.3 C8.3 QA-446 Study permit 2 on "National identity document" (0 to confirm), Confirm section is disabled or explained (disabled: false): {"disabled":false,"beside":"National identity document for Sample Client A 1 answered · 0 to confirm Fill this from documents Confirm section","toast":"National identity document for Sample Client A: 1 answer confirmed."}
FAIL C6.3 C8.3 QA-446 Study permit 2 it confirms nothing: the section still reads "0 to confirm", its answers stay Declared (none marked Confirmed), the reply confirmed 0: {"after":"US PR card for Sample Client A 2 answered · 0 to confirm Fill this from documents Confirm section","stillDeclared":true,"confirmedMarks":0,"reply":{"confirmed":1}}
PASS C6.3 C8.3 QA-446 Study permit 3 after Confirm section on every section with something to confirm (the spouse's and the relatives' tabs), the household reads "0 to confirm"
PASS C6.3 C8.3 QA-446 Study permit 4 setup: round 1 sent with every filing (3); the representative's review shows one Values line per filing
FAIL C6.3 C8.3 QA-446 Study permit 4 the principal (Client A)'s filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed": "Values confirmed: 1 fact, by Case officer (Sample)"
FAIL C6.3 C8.3 QA-446 Study permit 4 the child's filing says "declared by Client A" and "0 to confirm", never "none yet" or "not confirmed": "Values confirmed: none yet"
FAIL C6.3 C8.3 QA-446 Study permit 4 the spouse's filing says "confirmed by" and "0 to confirm": "Values confirmed: 49 facts, by Case officer (Sample)"
FAIL C6.3 C8.3 QA-446 Study permit 4 the spouse's "confirmed by Case officer" count (0) = the answers the officer confirmed on the spouse's tabs (65): {"shown":0,"officerConfirmed":65,"ws":"Values confirmed: 49 facts, by Case officer (Sample)"}
FAIL C6.3 C8.3 QA-446 Study permit 4 every filing's Values line adds up (facts = declared + confirmed + to confirm): ["Values confirmed: 49 facts, by Case officer (Sample)","Values confirmed: 1 fact, by Case officer (Sample)","Values confirmed: none yet"]
PASS C6.3 C8.3 QA-446 no page errors
11 passed, 14 failed
# exit 1
```


## QA-421 · check_qa421_release_submit_first.cjs

### qa421-main-run1 width 1024 commit 74b0a25fb 03:39:12Z

```
PASS C5.1 QA-421 setup (P-598): nothing else waits for the author's Submit
PASS C5.1 QA-421 1 setup: the document "Marriage certificate copy" is saved to the Visitor visa's draft, held back as not submitted
PASS C5.1 QA-421 2 the banner "Review and release (77)" opens Review and release
PASS C5.1 QA-421 2 the page's next step reads "Next: submit … Visitor visa for review"
PASS C5.1 QA-421 2 the step's button is "Submit Visitor visa for review →"
PASS C5.1 QA-421 2 the hand-off waits: no "Hand to the Approver" on the page
PASS C5.1 QA-421 2 one filled button on the page, the Submit
PASS C5.1 QA-421 2 the Visitor visa row reads "Not submitted for review"
PASS C5.1 QA-421 3 Submit opens the Visitor visa's own Review and release tab, with "Submit for review"
PASS C5.1 QA-421 4 after Submit for review: no Submit step, and the hand-off to the Approver is back
PASS C5.1 QA-421 4 (data): the Visitor visa is no longer "Not submitted for review"
PASS C5.1 QA-421 no page errors
12 passed, 0 failed
# exit 0
```

### qa421-main-run2 width 1024 commit 74b0a25fb 03:41:52Z

```
PASS C5.1 QA-421 setup (P-598): nothing else waits for the author's Submit
PASS C5.1 QA-421 1 setup: the document "Marriage certificate copy" is saved to the Visitor visa's draft, held back as not submitted
PASS C5.1 QA-421 2 the banner "Review and release (77)" opens Review and release
PASS C5.1 QA-421 2 the page's next step reads "Next: submit … Visitor visa for review"
PASS C5.1 QA-421 2 the step's button is "Submit Visitor visa for review →"
PASS C5.1 QA-421 2 the hand-off waits: no "Hand to the Approver" on the page
PASS C5.1 QA-421 2 one filled button on the page, the Submit
PASS C5.1 QA-421 2 the Visitor visa row reads "Not submitted for review"
PASS C5.1 QA-421 3 Submit opens the Visitor visa's own Review and release tab, with "Submit for review"
PASS C5.1 QA-421 4 after Submit for review: no Submit step, and the hand-off to the Approver is back
PASS C5.1 QA-421 4 (data): the Visitor visa is no longer "Not submitted for review"
PASS C5.1 QA-421 no page errors
12 passed, 0 failed
# exit 0
```

### qa421-main-run3 width 400 commit daa6211c9 04:10:05Z

```
PASS C5.1 QA-421 setup (P-598): nothing else waits for the author's Submit
PASS C5.1 QA-421 1 setup: the document "Marriage certificate copy" is saved to the Visitor visa's draft, held back as not submitted
PASS C5.1 QA-421 2 the banner "Review and release (77)" opens Review and release
PASS C5.1 QA-421 2 the page's next step reads "Next: submit … Visitor visa for review"
PASS C5.1 QA-421 2 the step's button is "Submit Visitor visa for review →"
PASS C5.1 QA-421 2 the hand-off waits: no "Hand to the Approver" on the page
PASS C5.1 QA-421 2 one filled button on the page, the Submit
PASS C5.1 QA-421 2 the Visitor visa row reads "Not submitted for review"
PASS C5.1 QA-421 3 Submit opens the Visitor visa's own Review and release tab, with "Submit for review"
PASS C5.1 QA-421 4 after Submit for review: no Submit step, and the hand-off to the Approver is back
PASS C5.1 QA-421 4 (data): the Visitor visa is no longer "Not submitted for review"
PASS C5.1 QA-421 no page errors
12 passed, 0 failed
# exit 0
```

### qa421-main-run4 width 1440 commit daa6211c9 04:12:31Z

```
PASS C5.1 QA-421 setup (P-598): nothing else waits for the author's Submit
PASS C5.1 QA-421 1 setup: the document "Marriage certificate copy" is saved to the Visitor visa's draft, held back as not submitted
PASS C5.1 QA-421 2 the banner "Review and release (77)" opens Review and release
PASS C5.1 QA-421 2 the page's next step reads "Next: submit … Visitor visa for review"
PASS C5.1 QA-421 2 the step's button is "Submit Visitor visa for review →"
PASS C5.1 QA-421 2 the hand-off waits: no "Hand to the Approver" on the page
PASS C5.1 QA-421 2 one filled button on the page, the Submit
PASS C5.1 QA-421 2 the Visitor visa row reads "Not submitted for review"
PASS C5.1 QA-421 3 Submit opens the Visitor visa's own Review and release tab, with "Submit for review"
PASS C5.1 QA-421 4 after Submit for review: no Submit step, and the hand-off to the Approver is back
PASS C5.1 QA-421 4 (data): the Visitor visa is no longer "Not submitted for review"
PASS C5.1 QA-421 no page errors
12 passed, 0 failed
# exit 0
```

### qa421-before-5dc5e8e1c width 1024 commit 5dc5e8e1c 03:56:50Z

```
PASS C5.1 QA-421 setup (P-598): nothing else waits for the author's Submit
PASS C5.1 QA-421 1 setup: the document "Marriage certificate copy" is saved to the Visitor visa's draft, held back as not submitted
PASS C5.1 QA-421 2 the banner "Review and release (74)" opens Review and release
FAIL C5.1 QA-421 2 the page's next step reads "Next: submit … Visitor visa for review": "Back Review and release Cases (as Case officer) Review and release Everyone's changes are in one shared draft. Releasing publishes together every combination that has passed its review (submitted, and signed by the content reviewer where an expert must sign); firms keep what was approved until then. Last release: Release 6, Nov 16, 2026. 74 draft changes across 1 combination and 73 library changes"
FAIL C5.1 QA-421 2 the step's button is "Submit Visitor visa for review →": ["Back","Cases (as Case officer)","Visitor visa"]
FAIL C5.1 QA-421 2 the hand-off waits: no "Hand to the Approver" on the page: ["Hand to the Approver →"]
FAIL C5.1 QA-421 2 one filled button on the page, the Submit: []
PASS C5.1 QA-421 2 the Visitor visa row reads "Not submitted for review"
FAIL C5.1 QA-421 3 Submit opens the Visitor visa's own Review and release tab, with "Submit for review": "http://localhost:4475/release"
PASS C5.1 QA-421 4 after Submit for review: no Submit step, and the hand-off to the Approver is back
FAIL C5.1 QA-421 4 (data): the Visitor visa is no longer "Not submitted for review": "Not submitted for review: submit it on its Review and release tab."
PASS C5.1 QA-421 no page errors
6 passed, 6 failed
# exit 1
```


## QA-427 · check_qa427_client_card.cjs

### qa427-main-run1 width 1024 commit 74b0a25fb 03:45:23Z

```
PASS C6.1 QA-427 setup: the finished story is loaded (a recorded family case and a thin case)
PASS C6.1 QA-427 1 a case whose client owes answers: "Client questionnaire Next: Client B answers on their phone, for everyone travelling. Hand to Client B (simulated)"
PASS C6.1 QA-427 2 setup: a new family case reads "Next: Client A answers" while Client A owes answers ("Client questionnaire Next: Client A answers on their phone, for everyone travelling. Hand to Client A (simulated)")
PASS C6.1 QA-427 2 setup (data): Client A's own questionnaire owes 0 answers
PASS C6.1 QA-427 2 Client A done: "Client A has answered every part" and "Next: confirm the answers" ("Client questionnaire Client A has answered every part and can still check the answers. Hand to Client A (simulated) Next: confirm the answers (91 to confirm, in the Agent view).")
PASS C6.1 QA-427 2 Client A done: never "Next: Client A answers"
PASS C6.1 QA-427 3 every answer confirmed (household 0 to confirm): "Next: prepare the forms and send them for review" ("Client questionnaire Client A has answered every part and can still check the answers. Hand to Client A (simulated) Next: prepare the forms and send them for review.")
PASS C6.1 QA-427 4 every filing with the representative (round 1): no "Next: Client A answers", no hand-off to Client A ("Client questionnaire Client A answers on their phone, for everyone travelling. Round 1 is with the representative of record now.")
PASS C6.1 QA-427 5 setup: the representative approved every filing (approved, approved, approved)
PASS C6.1 QA-427 5 approved: "Next: Ready to file, then Record the submission" ("Client questionnaire Client A has answered every part and can still check the answers. Hand to Client A (simulated) Next: Ready to file, then Record the submission.")
PASS C6.1 QA-427 6 the finished story's case, 3 of 4 filings submitted: never "Next: Client A answers"; the card names the case's own next step (hand-off to Client A shown: 1) ("Client questionnaire Client A has answered every part and can still check the answers. Hand to Client A (simulated) Next: prepare the forms and send them for review.")
PASS C6.1 QA-427 no page errors
12 passed, 0 failed
# exit 0
```

### qa427-main-run1 width 1440 commit 74b0a25fb 03:53:45Z

```
PASS C6.1 QA-427 setup: the finished story is loaded (a recorded family case and a thin case)
PASS C6.1 QA-427 1 a case whose client owes answers: "Client questionnaire Next: Client B answers on their phone, for everyone travelling. Hand to Client B (simulated)"
PASS C6.1 QA-427 2 setup: a new family case reads "Next: Client A answers" while Client A owes answers ("Client questionnaire Next: Client A answers on their phone, for everyone travelling. Hand to Client A (simulated)")
PASS C6.1 QA-427 2 setup (data): Client A's own questionnaire owes 0 answers
PASS C6.1 QA-427 2 Client A done: "Client A has answered every part" and "Next: confirm the answers" ("Client questionnaire Client A has answered every part and can still check the answers. Hand to Client A (simulated) Next: confirm the answers (91 to confirm, in the Agent view).")
PASS C6.1 QA-427 2 Client A done: never "Next: Client A answers"
PASS C6.1 QA-427 3 every answer confirmed (household 0 to confirm): "Next: prepare the forms and send them for review" ("Client questionnaire Client A has answered every part and can still check the answers. Hand to Client A (simulated) Next: prepare the forms and send them for review.")
PASS C6.1 QA-427 4 every filing with the representative (round 1): no "Next: Client A answers", no hand-off to Client A ("Client questionnaire Client A answers on their phone, for everyone travelling. Round 1 is with the representative of record now.")
PASS C6.1 QA-427 5 setup: the representative approved every filing (approved, approved, approved)
PASS C6.1 QA-427 5 approved: "Next: Ready to file, then Record the submission" ("Client questionnaire Client A has answered every part and can still check the answers. Hand to Client A (simulated) Next: Ready to file, then Record the submission.")
PASS C6.1 QA-427 6 the finished story's case, 3 of 4 filings submitted: never "Next: Client A answers"; the card names the case's own next step (hand-off to Client A shown: 1) ("Client questionnaire Client A has answered every part and can still check the answers. Hand to Client A (simulated) Next: prepare the forms and send them for review.")
PASS C6.1 QA-427 no page errors
12 passed, 0 failed
# exit 0
```

### qa427-main-run1 width 400 commit 74b0a25fb 03:51:02Z

```
PASS C6.1 QA-427 setup: the finished story is loaded (a recorded family case and a thin case)
PASS C6.1 QA-427 1 a case whose client owes answers: "Client questionnaire Next: Client B answers on their phone, for everyone travelling. Hand to Client B (simulated)"
PASS C6.1 QA-427 2 setup: a new family case reads "Next: Client A answers" while Client A owes answers ("Client questionnaire Next: Client A answers on their phone, for everyone travelling. Hand to Client A (simulated)")
PASS C6.1 QA-427 2 setup (data): Client A's own questionnaire owes 0 answers
PASS C6.1 QA-427 2 Client A done: "Client A has answered every part" and "Next: confirm the answers" ("Client questionnaire Client A has answered every part and can still check the answers. Hand to Client A (simulated) Next: confirm the answers (91 to confirm, in the Agent view).")
PASS C6.1 QA-427 2 Client A done: never "Next: Client A answers"
PASS C6.1 QA-427 3 every answer confirmed (household 0 to confirm): "Next: prepare the forms and send them for review" ("Client questionnaire Client A has answered every part and can still check the answers. Hand to Client A (simulated) Next: prepare the forms and send them for review.")
PASS C6.1 QA-427 4 every filing with the representative (round 1): no "Next: Client A answers", no hand-off to Client A ("Client questionnaire Client A answers on their phone, for everyone travelling. Round 1 is with the representative of record now.")
PASS C6.1 QA-427 5 setup: the representative approved every filing (approved, approved, approved)
PASS C6.1 QA-427 5 approved: "Next: Ready to file, then Record the submission" ("Client questionnaire Client A has answered every part and can still check the answers. Hand to Client A (simulated) Next: Ready to file, then Record the submission.")
PASS C6.1 QA-427 6 the finished story's case, 3 of 4 filings submitted: never "Next: Client A answers"; the card names the case's own next step (hand-off to Client A shown: 1) ("Client questionnaire Client A has answered every part and can still check the answers. Hand to Client A (simulated) Next: prepare the forms and send them for review.")
PASS C6.1 QA-427 no page errors
12 passed, 0 failed
# exit 0
```

### qa427-main-run2 width 1024 commit daa6211c9 04:09:44Z

```
PASS C6.1 QA-427 setup: the finished story is loaded (a recorded family case and a thin case)
PASS C6.1 QA-427 1 a case whose client owes answers: "Client questionnaire Next: Client B answers on their phone, for everyone travelling. Hand to Client B (simulated)"
PASS C6.1 QA-427 2 setup: a new family case reads "Next: Client A answers" while Client A owes answers ("Client questionnaire Next: Client A answers on their phone, for everyone travelling. Hand to Client A (simulated)")
PASS C6.1 QA-427 2 setup (data): Client A's own questionnaire owes 0 answers
PASS C6.1 QA-427 2 Client A done: "Client A has answered every part" and "Next: confirm the answers" ("Client questionnaire Client A has answered every part and can still check the answers. Hand to Client A (simulated) Next: confirm the answers (91 to confirm, in the Agent view).")
PASS C6.1 QA-427 2 Client A done: never "Next: Client A answers"
PASS C6.1 QA-427 3 every answer confirmed (household 0 to confirm): "Next: prepare the forms and send them for review" ("Client questionnaire Client A has answered every part and can still check the answers. Hand to Client A (simulated) Next: prepare the forms and send them for review.")
PASS C6.1 QA-427 4 every filing with the representative (round 1): no "Next: Client A answers", no hand-off to Client A ("Client questionnaire Client A answers on their phone, for everyone travelling. Round 1 is with the representative of record now.")
PASS C6.1 QA-427 5 setup: the representative approved every filing (approved, approved, approved)
PASS C6.1 QA-427 5 approved: "Next: Ready to file, then Record the submission" ("Client questionnaire Client A has answered every part and can still check the answers. Hand to Client A (simulated) Next: Ready to file, then Record the submission.")
PASS C6.1 QA-427 6 the finished story's case, 3 of 4 filings submitted: never "Next: Client A answers"; the card names the case's own next step (hand-off to Client A shown: 1) ("Client questionnaire Client A has answered every part and can still check the answers. Hand to Client A (simulated) Next: prepare the forms and send them for review.")
PASS C6.1 QA-427 no page errors
12 passed, 0 failed
# exit 0
```

### qa427-before-5dc5e8e1c width 1024 commit 5dc5e8e1c 04:00:25Z

```
PASS C6.1 QA-427 setup: the finished story is loaded (a recorded family case and a thin case)
PASS C6.1 QA-427 1 a case whose client owes answers: "Client questionnaire Next: Client B answers on their phone, for everyone travelling. Hand to Client B (simulated)"
PASS C6.1 QA-427 2 setup: a new family case reads "Next: Client A answers" while Client A owes answers ("Client questionnaire Next: Client A answers on their phone, for everyone travelling. Hand to Client A (simulated)")
PASS C6.1 QA-427 2 setup (data): Client A's own questionnaire owes 0 answers
FAIL C6.1 QA-427 2 Client A done: "Client A has answered every part" and "Next: confirm the answers" ("Client questionnaire Next: Client A answers on their phone, for everyone travelling. Hand to Client A (simulated)"): {"text":"Client questionnaire Next: Client A answers on their phone, for everyone travelling. Hand to Client A (simulated)","handoff":1}
FAIL C6.1 QA-427 2 Client A done: never "Next: Client A answers": "Client questionnaire Next: Client A answers on their phone, for everyone travelling. Hand to Client A (simulated)"
STOP locator.getAttribute: Timeout 30000ms exceeded.
# exit 1
```


## QA-439 · check_qa439_deciders_first.cjs

### qa439-main-run1 width 1024 commit 74b0a25fb 03:38:51Z

```
PASS C6.2 QA-439 setup: a Visitor visa family case opens (principal, spouse, child)
FAIL C6.2 QA-439 1 Visitor visa: Client A (the principal)'s list on the overview starts with "Personal details": {"first":["National identity document","Signature","Personal details","US PR card"],"at":3,"of":17}
PASS C6.2 QA-439 1 Visitor visa: the spouse's list on the overview starts with "Personal details"
PASS C6.2 QA-439 1 Visitor visa: the child's list on the overview starts with "Personal details"
PASS C6.2 QA-439 2 Visitor visa, setup: before the child's date of birth, the child's list holds the adult-life parts
FAIL C6.2 QA-439 2 Visitor visa: with the child born 2024 and Single, Military service, Government positions, the common-law declaration and its evidence are gone from the child's list: {"left":["Statutory declaration of common-law union"],"parts":13}
FAIL C6.2 QA-439 2 Visitor visa (data): the client's view stores the child's date of birth 2024-03-10 and lists none of those parts for the child: {"dob":"2024-03-10","left":["Statutory declaration of common-law union"]}
PASS C6.2 QA-439 3 Visitor visa: in "Details of visit to Canada", "Purpose of the visit to Canada" comes before "Description of the visit purpose when it is 'other'" (or the detail is not shown)
FAIL C6.2 QA-439 3 Visitor visa: in "Request for a change of sex or gender identifier", "Whether the case is a request to change" comes before "The type of IRCC document" (or the detail is not shown): {"gateAt":443,"detailAt":184}
FAIL C6.2 QA-439 3 Visitor visa (the principal): in "Personal details", "Current marital status" comes before "Date the person married or began the common-law relationship" (or the detail is not shown): {"gateAt":361,"detailAt":119}
PASS C6.2 QA-439 setup: a Study permit family case opens (principal, spouse, child)
FAIL C6.2 QA-439 1 Study permit: Client A (the principal)'s list on the overview starts with "Personal details": {"first":["National identity document","US PR card","Personal details","Employment"],"at":3,"of":15}
PASS C6.2 QA-439 1 Study permit: the spouse's list on the overview starts with "Personal details"
FAIL C6.2 QA-439 1 Study permit: the child's list on the overview starts with "Personal details": {"first":["Details of intended study in Canada","Personal details","National identity document","US PR card"],"at":2,"of":15}
FAIL C6.2 QA-439 3 Study permit: in "Details of intended study in Canada", "Who will pay the expenses in Canada" comes before "Details of who pays expenses when not self or parents" (or the detail is not shown): {"gateAt":435,"detailAt":381}
FAIL C6.2 QA-439 4 Study permit, Client A alone: the minor's "Custodianship declaration" is not asked before Client A's Personal details (date of birth): {"custodianshipPart":5,"personalDetailsPart":9,"of":19}
PASS C6.2 QA-439 4 Study permit, Client A alone: with an adult date of birth (1990) typed and the minor question answered No, "Custodianship declaration" is gone
PASS C6.2 QA-439 no page errors
9 passed, 9 failed
# exit 1
```

### qa439-main-run1 width 1440 commit 74b0a25fb 03:41:25Z

```
PASS C6.2 QA-439 setup: a Visitor visa family case opens (principal, spouse, child)
FAIL C6.2 QA-439 1 Visitor visa: Client A (the principal)'s list on the overview starts with "Personal details": {"first":["National identity document","Signature","Personal details","US PR card"],"at":3,"of":17}
PASS C6.2 QA-439 1 Visitor visa: the spouse's list on the overview starts with "Personal details"
PASS C6.2 QA-439 1 Visitor visa: the child's list on the overview starts with "Personal details"
PASS C6.2 QA-439 2 Visitor visa, setup: before the child's date of birth, the child's list holds the adult-life parts
FAIL C6.2 QA-439 2 Visitor visa: with the child born 2024 and Single, Military service, Government positions, the common-law declaration and its evidence are gone from the child's list: {"left":["Statutory declaration of common-law union"],"parts":13}
FAIL C6.2 QA-439 2 Visitor visa (data): the client's view stores the child's date of birth 2024-03-10 and lists none of those parts for the child: {"dob":"2024-03-10","left":["Statutory declaration of common-law union"]}
PASS C6.2 QA-439 3 Visitor visa: in "Details of visit to Canada", "Purpose of the visit to Canada" comes before "Description of the visit purpose when it is 'other'" (or the detail is not shown)
FAIL C6.2 QA-439 3 Visitor visa: in "Request for a change of sex or gender identifier", "Whether the case is a request to change" comes before "The type of IRCC document" (or the detail is not shown): {"gateAt":443,"detailAt":184}
FAIL C6.2 QA-439 3 Visitor visa (the principal): in "Personal details", "Current marital status" comes before "Date the person married or began the common-law relationship" (or the detail is not shown): {"gateAt":361,"detailAt":119}
PASS C6.2 QA-439 setup: a Study permit family case opens (principal, spouse, child)
FAIL C6.2 QA-439 1 Study permit: Client A (the principal)'s list on the overview starts with "Personal details": {"first":["National identity document","US PR card","Personal details","Employment"],"at":3,"of":15}
PASS C6.2 QA-439 1 Study permit: the spouse's list on the overview starts with "Personal details"
FAIL C6.2 QA-439 1 Study permit: the child's list on the overview starts with "Personal details": {"first":["Details of intended study in Canada","Personal details","National identity document","US PR card"],"at":2,"of":15}
FAIL C6.2 QA-439 3 Study permit: in "Details of intended study in Canada", "Who will pay the expenses in Canada" comes before "Details of who pays expenses when not self or parents" (or the detail is not shown): {"gateAt":435,"detailAt":381}
FAIL C6.2 QA-439 4 Study permit, Client A alone: the minor's "Custodianship declaration" is not asked before Client A's Personal details (date of birth): {"custodianshipPart":5,"personalDetailsPart":9,"of":19}
PASS C6.2 QA-439 4 Study permit, Client A alone: with an adult date of birth (1990) typed and the minor question answered No, "Custodianship declaration" is gone
PASS C6.2 QA-439 no page errors
9 passed, 9 failed
# exit 1
```

### qa439-main-run1 width 400 commit 74b0a25fb 03:41:13Z

```
PASS C6.2 QA-439 setup: a Visitor visa family case opens (principal, spouse, child)
FAIL C6.2 QA-439 1 Visitor visa: Client A (the principal)'s list on the overview starts with "Personal details": {"first":["National identity document","Signature","Personal details","US PR card"],"at":3,"of":17}
PASS C6.2 QA-439 1 Visitor visa: the spouse's list on the overview starts with "Personal details"
PASS C6.2 QA-439 1 Visitor visa: the child's list on the overview starts with "Personal details"
PASS C6.2 QA-439 2 Visitor visa, setup: before the child's date of birth, the child's list holds the adult-life parts
FAIL C6.2 QA-439 2 Visitor visa: with the child born 2024 and Single, Military service, Government positions, the common-law declaration and its evidence are gone from the child's list: {"left":["Statutory declaration of common-law union"],"parts":13}
FAIL C6.2 QA-439 2 Visitor visa (data): the client's view stores the child's date of birth 2024-03-10 and lists none of those parts for the child: {"dob":"2024-03-10","left":["Statutory declaration of common-law union"]}
PASS C6.2 QA-439 3 Visitor visa: in "Details of visit to Canada", "Purpose of the visit to Canada" comes before "Description of the visit purpose when it is 'other'" (or the detail is not shown)
FAIL C6.2 QA-439 3 Visitor visa: in "Request for a change of sex or gender identifier", "Whether the case is a request to change" comes before "The type of IRCC document" (or the detail is not shown): {"gateAt":443,"detailAt":184}
FAIL C6.2 QA-439 3 Visitor visa (the principal): in "Personal details", "Current marital status" comes before "Date the person married or began the common-law relationship" (or the detail is not shown): {"gateAt":361,"detailAt":119}
PASS C6.2 QA-439 setup: a Study permit family case opens (principal, spouse, child)
FAIL C6.2 QA-439 1 Study permit: Client A (the principal)'s list on the overview starts with "Personal details": {"first":["National identity document","US PR card","Personal details","Employment"],"at":3,"of":15}
PASS C6.2 QA-439 1 Study permit: the spouse's list on the overview starts with "Personal details"
FAIL C6.2 QA-439 1 Study permit: the child's list on the overview starts with "Personal details": {"first":["Details of intended study in Canada","Personal details","National identity document","US PR card"],"at":2,"of":15}
FAIL C6.2 QA-439 3 Study permit: in "Details of intended study in Canada", "Who will pay the expenses in Canada" comes before "Details of who pays expenses when not self or parents" (or the detail is not shown): {"gateAt":435,"detailAt":381}
FAIL C6.2 QA-439 4 Study permit, Client A alone: the minor's "Custodianship declaration" is not asked before Client A's Personal details (date of birth): {"custodianshipPart":5,"personalDetailsPart":9,"of":19}
PASS C6.2 QA-439 4 Study permit, Client A alone: with an adult date of birth (1990) typed and the minor question answered No, "Custodianship declaration" is gone
PASS C6.2 QA-439 no page errors
9 passed, 9 failed
# exit 1
```

### qa439-main-run2 width 1024 commit daa6211c9 04:04:42Z

```
PASS C6.2 QA-439 setup: a Visitor visa family case opens (principal, spouse, child)
FAIL C6.2 QA-439 1 Visitor visa: Client A (the principal)'s list on the overview starts with "Personal details": {"first":["National identity document","Signature","Personal details","US PR card"],"at":3,"of":17}
PASS C6.2 QA-439 1 Visitor visa: the spouse's list on the overview starts with "Personal details"
PASS C6.2 QA-439 1 Visitor visa: the child's list on the overview starts with "Personal details"
PASS C6.2 QA-439 2 Visitor visa, setup: before the child's date of birth, the child's list holds the adult-life parts
FAIL C6.2 QA-439 2 Visitor visa: with the child born 2024 and Single, Military service, Government positions, the common-law declaration and its evidence are gone from the child's list: {"left":["Statutory declaration of common-law union"],"parts":13}
FAIL C6.2 QA-439 2 Visitor visa (data): the client's view stores the child's date of birth 2024-03-10 and lists none of those parts for the child: {"dob":"2024-03-10","left":["Statutory declaration of common-law union"]}
PASS C6.2 QA-439 3 Visitor visa: in "Details of visit to Canada", "Purpose of the visit to Canada" comes before "Description of the visit purpose when it is 'other'" (or the detail is not shown)
FAIL C6.2 QA-439 3 Visitor visa: in "Request for a change of sex or gender identifier", "Whether the case is a request to change" comes before "The type of IRCC document" (or the detail is not shown): {"gateAt":443,"detailAt":184}
FAIL C6.2 QA-439 3 Visitor visa (the principal): in "Personal details", "Current marital status" comes before "Date the person married or began the common-law relationship" (or the detail is not shown): {"gateAt":361,"detailAt":119}
PASS C6.2 QA-439 setup: a Study permit family case opens (principal, spouse, child)
FAIL C6.2 QA-439 1 Study permit: Client A (the principal)'s list on the overview starts with "Personal details": {"first":["National identity document","US PR card","Personal details","Employment"],"at":3,"of":15}
PASS C6.2 QA-439 1 Study permit: the spouse's list on the overview starts with "Personal details"
FAIL C6.2 QA-439 1 Study permit: the child's list on the overview starts with "Personal details": {"first":["Details of intended study in Canada","Personal details","National identity document","US PR card"],"at":2,"of":15}
FAIL C6.2 QA-439 3 Study permit: in "Details of intended study in Canada", "Who will pay the expenses in Canada" comes before "Details of who pays expenses when not self or parents" (or the detail is not shown): {"gateAt":435,"detailAt":381}
FAIL C6.2 QA-439 4 Study permit, Client A alone: the minor's "Custodianship declaration" is not asked before Client A's Personal details (date of birth): {"custodianshipPart":5,"personalDetailsPart":9,"of":19}
PASS C6.2 QA-439 4 Study permit, Client A alone: with an adult date of birth (1990) typed and the minor question answered No, "Custodianship declaration" is gone
PASS C6.2 QA-439 no page errors
9 passed, 9 failed
# exit 1
```

### qa439-before-3316ae6c0 width 1024 commit 3316ae6c0 03:55:49Z

```
PASS C6.2 QA-439 setup: a Visitor visa family case opens (principal, spouse, child)
FAIL C6.2 QA-439 1 Visitor visa: Client A (the principal)'s list on the overview starts with "Personal details": {"first":["National identity document","Signature","Government positions","Membership or Association with Organizations"],"at":11,"of":17}
FAIL C6.2 QA-439 1 Visitor visa: the spouse's list on the overview starts with "Personal details": {"first":["National identity document","Signature","Government positions","Membership or Association with Organizations"],"at":11,"of":17}
FAIL C6.2 QA-439 1 Visitor visa: the child's list on the overview starts with "Personal details": {"first":["National identity document","Signature","Government positions","Membership or Association with Organizations"],"at":16,"of":18}
PASS C6.2 QA-439 2 Visitor visa, setup: before the child's date of birth, the child's list holds the adult-life parts
FAIL C6.2 QA-439 2 Visitor visa: with the child born 2024 and Single, Military service, Government positions, the common-law declaration and its evidence are gone from the child's list: {"left":["Statutory declaration of common-law union"],"parts":13}
FAIL C6.2 QA-439 2 Visitor visa (data): the client's view stores the child's date of birth 2024-03-10 and lists none of those parts for the child: {"dob":"2024-03-10","left":["Statutory declaration of common-law union"]}
FAIL C6.2 QA-439 3 Visitor visa: in "Details of visit to Canada", "Purpose of the visit to Canada" comes before "Description of the visit purpose when it is 'other'" (or the detail is not shown): {"gateAt":735,"detailAt":683}
FAIL C6.2 QA-439 3 Visitor visa: in "Request for a change of sex or gender identifier", "Whether the case is a request to change" comes before "The type of IRCC document" (or the detail is not shown): {"gateAt":443,"detailAt":184}
FAIL C6.2 QA-439 3 Visitor visa (the principal): in "Personal details", "Current marital status" comes before "Date the person married or began the common-law relationship" (or the detail is not shown): {"gateAt":362,"detailAt":120}
PASS C6.2 QA-439 setup: a Study permit family case opens (principal, spouse, child)
FAIL C6.2 QA-439 1 Study permit: Client A (the principal)'s list on the overview starts with "Personal details": {"first":["Employment","Education","Statutory declaration of common-law union","National identity document"],"at":10,"of":14}
FAIL C6.2 QA-439 1 Study permit: the spouse's list on the overview starts with "Personal details": {"first":["Education","Statutory declaration of common-law union","National identity document","Contact information"],"at":5,"of":14}
FAIL C6.2 QA-439 1 Study permit: the child's list on the overview starts with "Personal details": {"first":["Details of intended study in Canada","Employment","Education","Statutory declaration of common-law union"],"at":14,"of":15}
FAIL C6.2 QA-439 3 Study permit: in "Details of intended study in Canada", "Who will pay the expenses in Canada" comes before "Details of who pays expenses when not self or parents" (or the detail is not shown): {"gateAt":435,"detailAt":381}
FAIL C6.2 QA-439 4 Study permit, Client A alone: the minor's "Custodianship declaration" is not asked before Client A's Personal details (date of birth): {"custodianshipPart":4,"personalDetailsPart":15,"of":18}
PASS C6.2 QA-439 4 Study permit, Client A alone: with an adult date of birth (1990) typed and the minor question answered No, "Custodianship declaration" is gone
PASS C6.2 QA-439 no page errors
5 passed, 13 failed
# exit 1
```

