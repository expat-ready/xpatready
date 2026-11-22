# R1.49 gate A: J-49 recorded walks on GitHub's runners (P-700)

The Lead dispatched walks.yml on main 562754777 (journeys j_5, j_49, j_108) at 07:48Z and re-ran it at 08:08Z. Attempt 2 gives the second, independent walk: a fresh runner and a fresh isolated copy.

| Walk | Run · attempt | Job | Verdict | Artifact |
|---|---|---|---|---|
| 1 | [44881942787 · 1](https://github.com/expat-ready/xpatready/actions/runs/44881942787) | 136779057958 | exit 0 · **30 PASS, 0 FAIL, 0 HELD** · 9 videos, 4 traces, 36 step screenshots | `walk-j_49-562754777…` (ID 14698347019) |
| 2 | [44881942787 · 2](https://github.com/expat-ready/xpatready/actions/runs/44881942787/attempts/2) | 136783812969 | exit 0 · **30 PASS, 0 FAIL, 0 HELD** · 9 videos, 4 traces, 37 step screenshots | `walk-j_49-562754777…` (ID 14699251259) |

* **The walk's end (P-317):** the walk ends on visitor A's lead page after W4. That page shows the stopped marketing email as "Not sent: the person withdrew consent", the service email and the first marketing email as Sent, and the address masked. axe finds nothing, and there is no sideways scroll at 1024 or 1440 px. Map row 50 (in-app notifications) is Not built, so it has no first screen; this is the last screen the walk can reach (j_49.ts header).
* **Read from walk 2's log:**
  * DW2 NR: the stand-in fakeConsent never sees the door's withdrawal, so its judge fails, as it must.
  * W4: a marketing email queued before the click goes QUEUED, then SUPPRESSED "WITHDRAWN: MARKETING", stopped by the worker's re-check.
  * The service email after the unsubscribe is SENT, class SERVICE.
* **Recording note (not a finding):** walk 2 logged "record: no screenshot for step 18: … browser has been closed". That step's check is an in-process send and it passed. Only the step screenshot is missing.
* **Main moved after 19fdf28d7, the head scored here.** `git diff --name-only 19fdf28d7 0f2331dc4 -- …/studio` touches no message, consent, unsubscribe, person-link, support, storage, schema or j_49 file. The walk ran on 562754777, which is between the two.
* Artifact downloads are blocked from this cloud container, so the verdicts above are read from the job logs (P-700 replay: the Lead or the Mac can open the traces).
