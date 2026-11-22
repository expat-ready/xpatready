# Lead 9 check lines, 02:2x-03:0x IST 23 Nov (moved word for word from STATE.md to keep one page)

**Lead 9 check 02:2x-02:4x IST 23 Nov:** weekly 76%, context 12%, disk 11 GB. #2368 (R1.58) merged. Labelled: #3017 (R1.85, on green ci), #3042 (R1.29, after #2368), #3141 (qa Track A: R1.21 Works, records read). `@mergifyio requeue` #3001 (R1.56). `/run full` on #3041 head b91dc1eb9: label on green. Dispatched walks.yml j_102 on main 884d1a1ec (run 45069874951) for #3136/#3029 (R1.102). Waiting on the founder: R1.92 lane (session_01Ln6TiPzgv1F4fXY7mcuxqb) asks to move to the saved "xpatready" environment (allows www.canada.ca) to read the official licence-number format; a network change, so his call. Next: #3081 label on green; #2999 watch; #3041 label on green.

**Lead 9 check 02:3x IST:** #2602 (nightly fix) merged; j_102 walk run 45069874951 green on main 884d1a1ec. #3001 lost its label to the guard (failed batch 45057519565, shard 6 check_fo7q_reads before #2368's index): `/run full` + covered line posted; label on green. #3081, #3041 full runs going: label on green.

**Lead 9 check 02:4x IST:** #3029 merged: R1.102 Works on main (proven +1 today). #3081 full run 45068049653 green → labelled. #3041 full run 45069778762 all parts cancelled → re-ran (attempt 2); label on green. #3136 (duplicate R1.102 report, now carries run 45069874951) dequeued: qa lane decides. #2933 ci red (walk j_104 not its own + ci): lane's.

**Lead 9 02:5x IST:** #3042 (R1.29) dequeued before its batch (Lead B 2's catch, verified on f05ab1de3): migration stamp older than main's newest, and FKs re-added on walled fo_* tables outside F7's lift. Lane (session_01Ln6TiSBtR5PWM8nrYF9PUV) briefed on the PR and by prompt: merge main, re-stamp 20261123010000, lift shape, re-run checks, diff-only Approve, Lead B re-read; then Lead /run full + label.

**Lead 9 check 02:5x IST:** #3081's label was removed by the guard (failed batch 45036239918: shard 14 check_forms_qa53 from #2927's routes, shard 2 check_pf21_complaints; neither its own): covered line posted, relabelled. #3001 full run 45070511287 going; #3041 full run attempt 2 going.

**Lead 9 check 03:0x IST:** #3081 queued again. Runs on several branches were cancelled together at ~21:16Z (02:46 IST), cause unknown (no failed suite): #3001 full run 45070511287 re-run (attempt 2), #3041 on attempt 2. #3042 lane pushed 21a6416c5 (re-stamp under way).

