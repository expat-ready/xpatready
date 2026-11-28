# LR-136 (lab register CR-7, lane automation-measures-2, 28 Nov): the reviewer's test set from our own shipped bugs. Each
# row breaks one rule of the set's check, the blind brief or the scoring, so check-reviewer-eval.sh must then fail.
TESTS="$TESTS check-reviewer-eval.sh"   # LR-136: the reviewer's test set and its scoring
MUT="$MUT"'
LR136 approve|product/tools/reviewer-eval.py|s/    if v\[-1\].lower() == "approve":/    if False:/|check-reviewer-eval.sh
LR136 important|product/tools/reviewer-eval.py|s/        if tagged and any(names_file(f, body) for f in c\["files"\]):/        if any(names_file(f, body) for f in c["files"]):/|check-reviewer-eval.sh
LR136 size|product/tools/reviewer-eval.py|s/def check(cases, repo, lo=10, hi=20):/def check(cases, repo, lo=0, hi=99):/|check-reviewer-eval.sh
LR136 blind|product/tools/reviewer-eval.py|s/Do not edit files or post anything.")/Do not edit files or post anything. Bug: " + c["bug"])/|check-reviewer-eval.sh
LR136 match|product/tools/reviewer-eval.py|s/            if not c.get("match") or re.search/            if True or re.search/|check-reviewer-eval.sh
LR136 whole|product/tools/reviewer-eval.py|s/        new = bool(START.match(line)) or /        new = bool(BULLET.match(line)) or bool(START.match(line)) or /|check-reviewer-eval.sh
LR136 path|product/tools/reviewer-eval.py|s/            if not re.match(r"\[\\w.\/-\]", before) and/            if/|check-reviewer-eval.sh
LR136 reset|product/tools/reviewer-eval.py|s/^                    section, level = "", 0$/                    pass/|check-reviewer-eval.sh
LR136 bullet|product/tools/reviewer-eval.py|s/ or (bool(BULLET.match(line)) and not titled)$//|check-reviewer-eval.sh
LR136 prefix|product/tools/reviewer-eval.py|s/    text = PREFIX.sub(" ", text)$/    pass/|check-reviewer-eval.sh
LR136 tag|product/tools/reviewer-eval.py|s/bool(IS_IMPORTANT.match(first))/bool(re.search(r"Important", first))/|check-reviewer-eval.sh
LR136 heading|product/tools/reviewer-eval.py|s/ and not line.lstrip().startswith("#")   # a heading is no title$//|check-reviewer-eval.sh
LR136 fence|product/tools/reviewer-eval.py|s/        if fence or line.lstrip().startswith("```"):/        if False:/|check-reviewer-eval.sh
LR136 depth|product/tools/reviewer-eval.py|s/                if not level or depth <= level:/                if True:/|check-reviewer-eval.sh
LR136 title|product/tools/reviewer-eval.py|s/                lines = \[title\] + \[l for l in lines\[1:\] if l.strip()\]/                lines = [l for l in lines[1:] if l.strip()] or [""]/|check-reviewer-eval.sh'
