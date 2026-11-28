# LR-155 slice (memory-enforcement audit top 15 no. 8, F-7Nov; lab lane fast-route-2, 28 Nov): no guard or test suite
# runs in the Lead's main copy (main-copy-suite-guard.py, PreToolUse on Bash); each row switches one part off, so
# check-main-copy-suite-guard.sh must fail.
TESTS="$TESTS check-main-copy-suite-guard.sh"
MUT="$MUT"'
LR155M deny|product/tools/main-copy-suite-guard.py|s/^    if not m or lane(cwd) not in ("lead", "lead-stale"):/    if True:/|check-main-copy-suite-guard.sh
LR155M stale|product/tools/main-copy-suite-guard.py|s/not in ("lead", "lead-stale")/not in ("lead",)/|check-main-copy-suite-guard.sh
LR155M crash|product/tools/main-copy-suite-guard.py|s/^    except ValueError:/    except KeyError:/|check-main-copy-suite-guard.sh
LR155M wired|../../.claude/settings.json|s/main-copy-suite-guard.py; \[ -f/main-copy-suite-guard-off.py; [ -f/|check-main-copy-suite-guard.sh
LR155M usage|product/tools/main-copy-suite-guard.py|s/^        return 1   # never 2/        return 2   # never 2/|check-main-copy-suite-guard.sh'
