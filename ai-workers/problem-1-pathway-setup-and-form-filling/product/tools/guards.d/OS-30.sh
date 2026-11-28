# OS-30 (LR-047, P-683; lab lane starter A451, 28 Nov): a ready PR with no "Reviewer: Approve <sha>" comment line gets a
# pr-rules warning; each part switched off in turn, check-ready-approve.sh must then fail.
TESTS="$TESTS check-ready-approve.sh"
MUT="$MUT"'
OS30 missing|product/tools/ready-approve.py|s/    if not shas:/    if False:/|check-ready-approve.sh
OS30 head|product/tools/ready-approve.py|s/    if a.head not in shas:/    if False:/|check-ready-approve.sh
OS30 line start|product/tools/ready-approve.py|s/APPROVE = re.compile(r"^\[ \\t\]\*Reviewer:/APPROVE = re.compile(r".*Reviewer:/|check-ready-approve.sh
OS30 full sha|product/tools/ready-approve.py|s/(\[0-9a-f\]{40})\\b")/([0-9a-f]+)")/|check-ready-approve.sh
OS30 unreadable|product/tools/ready-approve.py|/is not a JSON string/,/return 2/s/            return 2/            continue/|check-ready-approve.sh
OS30 draft|../../.github/workflows/pr-rules.yml|s/ \&\& !github.event.pull_request.draft \&\& github.event.pull_request.user.type/ \&\& github.event.pull_request.user.type/|check-ready-approve.sh
OS30 fail closed|../../.github/workflows/pr-rules.yml|/a ready PR carries the reviewer.s Approve comment line/,/ready-approve.py/s/          set -o pipefail/          true/|check-ready-approve.sh'
