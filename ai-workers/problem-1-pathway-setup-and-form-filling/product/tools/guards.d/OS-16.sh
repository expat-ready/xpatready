# OS-16 (P-615): the start read; each row switches one of start-read.py's rules off.
TESTS="$TESTS check-start-read.sh"
MUT="$MUT"'
OS16 fail|product/tools/start-read.py|s/^    if total > o.fail:/    if False:/|check-start-read.sh
OS16 warn|product/tools/start-read.py|s/^    elif total > o.warn:/    elif False:/|check-start-read.sh
OS16 level|product/tools/start-read.py|s/^            if m and len(m.group(1)) <= level:/            if m:/|check-start-read.sh
OS16 rows|product/tools/start-read.py|s/^        if r and int(r.group(1)) > asof:/        if r:/|check-start-read.sh
OS16 missing|product/tools/start-read.py|s/^            if miss:/            if False:/|check-start-read.sh
OS16 wired|product/tools/check-docs.sh|s/^if \[ -f "\$PH\/LEAD-START.md" \]; then/if false; then/|check-start-read.sh'
