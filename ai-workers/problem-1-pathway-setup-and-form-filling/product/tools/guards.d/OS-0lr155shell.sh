# LR-155 slice (memory-enforcement audit top 15 no. 10, lab lane fast-route-2, 28 Nov): shell traps refused before they
# run (shell-trap-guard.py, PreToolUse on Bash); each row switches one part off, so check-shell-trap-guard.sh must fail.
TESTS="$TESTS check-shell-trap-guard.sh"
MUT="$MUT"'
LR155S pkill|product/tools/shell-trap-guard.py|s/^    if PKILL.search(cmd):/    if False:/|check-shell-trap-guard.sh
LR155S refspec|product/tools/shell-trap-guard.py|s/^    if m:$/    if False:/|check-shell-trap-guard.sh
LR155S crash|product/tools/shell-trap-guard.py|s/^    except ValueError:/    except KeyError:/|check-shell-trap-guard.sh
LR155S usage|product/tools/shell-trap-guard.py|s/^        return 1   # never 2/        return 2   # never 2/|check-shell-trap-guard.sh'
