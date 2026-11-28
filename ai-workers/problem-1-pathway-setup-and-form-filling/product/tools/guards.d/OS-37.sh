# OS-37 / LR-051 (lab lane fast-route-2, 28 Nov): every hook guard's refusal carries its rule id, the reason and the
# allowed fix; each row switches one part of refusal-triple.py (or one guard's marker) off, so check-refusal-triple.sh
# must then fail.
TESTS="$TESTS check-refusal-triple.sh"
MUT="$MUT"'
OS37 rule|product/tools/refusal-triple.py|s/^RULE = re.compile(.*/RULE = re.compile(r"")/|check-refusal-triple.sh
OS37 fix|product/tools/refusal-triple.py|s/^FIX = re.compile(.*/FIX = re.compile(r"")/|check-refusal-triple.sh
OS37 bound|product/tools/refusal-triple.py|s/^            lo = max(i - WINDOW, at\[k - 1\] + 1 if k else 0)/            lo = max(0, i - WINDOW)/|check-refusal-triple.sh
OS37 below|product/tools/refusal-triple.py|s/^            hi = min(i + WINDOW, /            hi = min(i, /|check-refusal-triple.sh
OS37 missing|product/tools/refusal-triple.py|s/^            bad.append(f"{g}: missing, so its refusals were not checked"); continue/            continue/|check-refusal-triple.sh
OS37 printed|product/tools/away-guard.sh|s/Rule P-388: the founder/The founder/|check-refusal-triple.sh
OS37 part|product/tools/stop-check.sh|s/reasons="- Rule P-314: this \$LANE copy/reasons="- This $LANE copy/|check-refusal-triple.sh
OS37 parts|product/tools/refusal-triple.py|s/- (?!note:)/- (?!)/|check-refusal-triple.sh'
