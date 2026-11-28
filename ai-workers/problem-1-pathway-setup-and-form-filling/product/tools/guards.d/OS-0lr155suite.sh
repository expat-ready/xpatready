# LR-155 slice (memory-enforcement audit top 15 no. 8, F-7Nov; lab lane fast-route-2, 28 Nov): no guard or test suite
# runs in the Lead's main copy (main-copy-suite-guard.py, PreToolUse on Bash); each row switches one part off, so
# check-main-copy-suite-guard.sh must fail.
TESTS="$TESTS check-main-copy-suite-guard.sh"
MUT="$MUT"'
LR155M deny|product/tools/main-copy-suite-guard.py|s/^            lead = lane(cwd) in ("lead", "lead-stale")/            lead = False/|check-main-copy-suite-guard.sh
LR155M stale|product/tools/main-copy-suite-guard.py|s/lane(cwd) in ("lead", "lead-stale")/lane(cwd) in ("lead",)/|check-main-copy-suite-guard.sh
LR155M crash|product/tools/main-copy-suite-guard.py|s/^    except ValueError:/    except KeyError:/|check-main-copy-suite-guard.sh
LR155M usage|product/tools/main-copy-suite-guard.py|s/^        return 1   # never 2/        return 2   # never 2/|check-main-copy-suite-guard.sh
LR155M exempt|product/tools/main-copy-suite-guard.py|s/^EXEMPT = {"check-docs.sh"}/EXEMPT = set()/|check-main-copy-suite-guard.sh
LR155M elsewhere|product/tools/main-copy-suite-guard.py|s/^        if where is None or (where != cwd and toplevel(where) != toplevel(cwd)):/        if False:/|check-main-copy-suite-guard.sh
LR155M quoted|product/tools/main-copy-suite-guard.py|s/^    text = blank_text(cmd)/    text = cmd/|check-main-copy-suite-guard.sh'
