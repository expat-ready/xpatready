# qa capability R1.86: Works (qa 9), 25 Nov ~11:xx IST

Cloud qa lane qa 9, Opus 5.5 medium, under Lead 4. Main a92690801 (#3630's merge).

* **The walk on main.** Walks run 45555238390 ran on merge (ENF-733) on a92690801 and gave **j_86 27/27, PASS, exit 0**. Source: the "Walks on merge" comment on #3630.
* **Independent re-runs.** j_86 gave 27/27 twice on isolated copies of main 865614b05 with #3630's j_86 (qa 9), and 27/27 on #3630's fresh reader's copy (rd86).
* **Every part is on main:**
  * PF-21c (the register, its routes and notices);
  * AUD-3 part 1;
  * PF-21rs R0 (the notice words read back; QA-757 closed in #3630);
  * PF-21rs A1 (#3538, the Breaches page);
  * PF-21rs A2 (#3579, the breach's page).
* **W10** moved to R1.87 by Lead 2's ruling on #3538. qa 10 was told on #3533.
* **Open findings naming R1.86:** only QA-788 (Minor, #3666). It is a retry of the stale-edit step in `check_pf21rs_browser.ts`, and no wrong save was seen. No Major or Critical is open.
* **Fresh Opus reader:** its verdict is on this records PR.
