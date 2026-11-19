# Regression set: the data each row's verdict counts on (qa's call; B77, P-322)

The protected regression set (`prototype/studio/tools/works-set.mjs`) runs each M2 Works row's pack on the six (Demo › Reset to the six), except a row named below with "checkpoint", which runs on Demo › Load the configured checkpoint, the data its verdict counts on (P-322). A line is `- C<n.n> checkpoint <reason>`; the reason names its run, a QA bug or a decision. One current line per row: history goes to git, not here (a line with "until", "since", "back on", "lifted", "no longer", a "?" or a second capability is not read).

- C4.8 checkpoint: release and case-step rows count as Works on the configured checkpoint (P-322); 11/11 on the checkpoint, re-test run 41876041638
- C9.1 checkpoint: a new edition's review and release counts on the configured checkpoint, where the newer IMM 5476 edition is held (P-322); 17/17 on the checkpoint, run 41919519444
- C8.2 checkpoint: filing records are a case step and count as Works on the configured checkpoint (P-322); 19/19 on the checkpoint, nightly run 44256761591 and re-run 44260362078 (main 39c1203cd, qa 18 Nov)
- C11.6 checkpoint: the channel per form on a case counts as Works on the configured checkpoint (P-322); 14/14 on the checkpoint, nightly run 44256761591 and re-run 44260362078 (main 39c1203cd, qa 18 Nov)
