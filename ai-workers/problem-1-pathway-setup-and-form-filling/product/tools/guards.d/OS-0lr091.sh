# LR-091 (lab register; source SF:CP4, no OS row, so the name only fits OS-85's pattern): BACKLOG's done rows moved word for
# word to history/BACKLOG-done-*.md are still read by the by-id readers. Each row drops one reader's done files.
# (cockpit-data.py, cockpit-reconcile.py and trace-requirements.py are proven by their unittest files, not this harness.)
MUT="$MUT"'
LR091 focus|product/tools/focus-check.py|s/ + sorted(glob.glob(os.path.join(BACKLOG_DIR, "history", "BACKLOG-done-\*.md")))//|check-focus-list.sh
LR091 ready|product/tools/ready-gate.py|s/ + sorted(glob.glob(os.path.join(BACKLOG_DIR, "history", "BACKLOG-done-\*.md")))//|check-ready-gate.sh'
