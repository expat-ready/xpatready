# LR-136 (lab register CR-7, lane automation-measures-2, 28 Nov): the reviewer's test set from our own shipped bugs. Each
# row breaks one rule of the set's check, the blind brief or the scoring, so check-reviewer-eval.sh must then fail.
TESTS="$TESTS check-reviewer-eval.sh"   # LR-136: the reviewer's test set and its scoring
MUT="$MUT"'
LR136 approve|product/tools/reviewer-eval.py|s/    if v\[-1\].lower() == "approve":/    if False:/|check-reviewer-eval.sh
LR136 important|product/tools/reviewer-eval.py|s/        if re.search(r"\\bImportant\\b", para) and any/        if any/|check-reviewer-eval.sh
LR136 size|product/tools/reviewer-eval.py|s/def check(cases, repo, lo=10, hi=20):/def check(cases, repo, lo=0, hi=99):/|check-reviewer-eval.sh
LR136 blind|product/tools/reviewer-eval.py|s/Do not edit files or post anything.")/Do not edit files or post anything. Bug: " + c["bug"])/|check-reviewer-eval.sh
LR136 match|product/tools/reviewer-eval.py|s/            if not c.get("match") or re.search/            if True or re.search/|check-reviewer-eval.sh'
