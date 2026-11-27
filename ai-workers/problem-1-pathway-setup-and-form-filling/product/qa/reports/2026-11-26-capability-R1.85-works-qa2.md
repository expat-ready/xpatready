# qa 2: R1.85 Works, 26 Nov

**Row:** R1.85, the data-request register with legal hold. **Verdict: Works** on main 0c47ce729 (the merge of #3841, its last part). Cloud qa 2, Opus 5.5 medium, under Lead 5; isolated copies, live AI off, US$0.

## Parts (MVP-CHECKLIST row 85: PF-21b, PF-21d, PF-21rs)
All merged: PF-21b; PF-21d parts 1a, 1b, 2a (#3583), 2b-1 (#3713) and 2b-2 (#3841; Lead 3 ruled it inside R1.85 on #3809); PF-21rs B1 (#3818) and B2 (#3836).

## Evidence
* **GitHub's runners on main 0c47ce729:** walks run 45860876172 has j_85 PASS 21/21, 0 FAIL, 18 s (walk on merge, recorded: video, trace, a screenshot per step). Item-proof run 45860876248 is PASS: the journey plus the scan for key or secret values in the recording.
* **Here:** j_85 ran twice on fresh isolated copies of 0c47ce729: 21/21, exit 0, both times.
* **Earlier on GitHub:** j_85 green on e13169736 (run 45785023537) and on a1fd1b69e (qa 1b, run 45854351074). It has been stable across 2b-1 → 2b-2.

## Done-when, walked
A privacy request is logged in our console (Privacy › Requests) with its target date and an audit line. It is worked In progress → Completed. A legal hold placed in the console stops an approved deletion. An approved DELETION with no hold is carried out on day 7: the person is anonymised in place and the kept classes are named. A held deletion ends HELD, never Completed.

## Not covered
A person can't walk headed in this cloud copy: there is no ffmpeg, so `walk.mjs` cannot record locally. The recorded GitHub walk stands in for it. Legal points are "Unconfirmed: no counsel" (SA-11; the Sample keep-classes, P-819).

## Bugs
None new.
