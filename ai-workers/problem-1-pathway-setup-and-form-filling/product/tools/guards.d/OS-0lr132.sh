# LR-132 (lab register CR-3, lane automation-measures-2, 28 Nov): Claude Code Review's verdict read by script, title first,
# a missing severity line = no verdict. Each row breaks one rule, so check-code-review-verdict.sh must then fail.
TESTS="$TESTS check-code-review-verdict.sh"   # LR-132: Code Review's verdict by script (report-only)
MUT="$MUT"'
LR132 missing|product/tools/code-review-verdict.py|s/        return 3, "no verdict", f"no severity line/        return 0, "pass", f"no severity line/|check-code-review-verdict.sh
LR132 head|product/tools/code-review-verdict.py|s/ and c.get("head_sha") == head\]/]/|check-code-review-verdict.sh
LR132 last|product/tools/code-review-verdict.py|s/MARK.match(lines\[-1\].strip())/MARK.search((out.get("text") or ""), re.M)/|check-code-review-verdict.sh
LR132 title|product/tools/code-review-verdict.py|s/    if NO_RUN.match(title):/    if False:/|check-code-review-verdict.sh
LR132 repeat|product/tools/code-review-verdict.py|s/    if "not repeated" in title.lower():/    if False:/|check-code-review-verdict.sh'
