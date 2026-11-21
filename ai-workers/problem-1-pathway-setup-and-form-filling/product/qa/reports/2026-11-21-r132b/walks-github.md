# R1.32 gate A: J-32 recorded walks on GitHub's runners (P-700)

The Lead dispatched walks.yml on main 2821fb787, `journeys="j_32"`, twice, at 10:20Z.

| Walk | Run | Job | Verdict | Artifact |
|---|---|---|---|---|
| 1 | [44893829112](https://github.com/expat-ready/xpatready/actions/runs/44893829112) | 136815302127 | exit 0 · **11 PASS, 0 FAIL, 0 HELD** · 7 videos, 7 traces, 24 step screenshots | `walk-j_32-2821fb787…` (ID 14703605354) |
| 2 | [44893841111](https://github.com/expat-ready/xpatready/actions/runs/44893841111) | 136815344185 | exit 0 · **11 PASS, 0 FAIL, 0 HELD** · 7 videos, 7 traces, 24 step screenshots | `walk-j_32-2821fb787…` (ID 14703341851) |

## What the logs show (both walks)
* **W2:** the history reads "Second representative (Sample) assigned it to Case officer (Sample)", with the time. The audit line underneath names who, to whom, from nobody, and when.
* **W3:** the Case Officer gets 403.
* **W4:** both lines are in the history, oldest first.
* **W5:** the history reads "Case officer (Sample) took it".
* **W6:** the rule is saved (200) for "Sample service (J-32)". An enquiry for no service waits in Unassigned leads, owner Nobody.
* **W7:** `inUnassigned` is 0. The Mine row reads "… Sample service (J-32) · Website form · Case officer (Sample)". The walk ends on `/front-office/leads/<id>`, R1.33's first step (P-317).

## Notes
* Main moved after a28b9c4f3, the head scored by the pack and the first re-runs. `lead-page.tsx` and `sales/contract.ts` changed in #2717 (FO-3st1 part 2, the consult record panel).
  * The walks ran on 2821fb787, after that change.
  * j_32 was re-run here twice more on main c0c442267 (`j32-local-{c,d}.txt`, 11/11 each), together with `check_fo10_assignment` 42/42 and `check_fo10p2_sharing` 37/37 (`*-c.txt`).
* Artifact downloads are blocked from this cloud container, so the verdicts are read from the job logs.
