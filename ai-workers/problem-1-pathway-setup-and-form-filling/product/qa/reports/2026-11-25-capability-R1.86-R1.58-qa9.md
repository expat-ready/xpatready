# qa capability R1.86 and R1.58 (qa 9), 25 Nov ~10:xx IST

Cloud qa lane qa 9, Opus 5.5 medium, under Lead 4. Main 865614b05 (after #3579 PF-21rs A2 and #3593 FO-7t R4-1). Isolated copies, live AI off, US$0. Each journey was run twice from its header with `npx --prefix studio tsx`.

## R1.86
* **j_86 on main: 27/28 twice.** The only FAIL is W10.
* W10 ("our staff's read of this breach lands on firm A's own chain") **moves to R1.87**. This is Lead 2's ruling on #3538, quoted in #3579's body: "W10 moves to R1.87, which makes it 27/27". This PR takes W10 out of j_86 and leaves a note in its header saying where it went. R1.87 is qa 10's row and has no j_87 yet.
* **j_86 without W10: 27/27 twice** on main.
* **QA-757 closed.** It was fixed by PF-21rs R0 (0d756d5ed, merged with #3492): `breaches/service.ts:42` reads each notice's words back through MessageWordsPort. W6 passes (the breach's page lists firm A's and firm B's notices with their time and subject).
* No open row in `qa/BUGS.md` names R1.86.
* **Not yet Works**, because the green walk on main comes after this PR merges: walks run on merge (ENF-733). Next step: read the "Walks on merge" comment and expect j_86 27/27. Then a fresh reader, then the Works record.
* Gate A note: j_86 used to end at R1.87's first step (W10). By the ruling, its last step is now W9 (the console's Breaches page at 400, 1024 and 1440 px).

## R1.58
* **j_58 on main: 22/24 twice**, the same steps.
  * FAIL W3: the move-to-case route (no row).
  * FAIL W5: Money › Trust in red (FO-7s3b).
* W5 already calls the reverse preview first, on main since #3594, so no journey change was needed.
* Parts missing: FO-7s3a and FO-7s3b (the R1.58 lane builds them next), and the move-to-case route, which has no row.
