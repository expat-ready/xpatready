# OS-29 and bundle A1 "hooks fail closed" (LR-046): every guard hook runs through hook-fail-closed.sh, whose runner
# hook-fail-closed.py blocks on an error, a timeout, junk output or unreadable input, with no shell watchdog to race;
# Stop timeouts are 60 s; stop-check.sh notes unpushed work (OS-29) and fails, not passes, when it cannot enter the copy.
# Tests: check-hook-fail-closed.sh, check-stop-check.sh.
TESTS="$TESTS check-hook-fail-closed.sh"
MUT="$MUT"'
A1 fc error|product/tools/hook-fail-closed.py|s/^    refuse(f"guard {guard} failed with exit/    sys.exit(0)  # refuse(f"guard {guard} failed with exit/|check-hook-fail-closed.sh
A1 fc timeout|product/tools/hook-fail-closed.py|s/            refuse(f"guard {guard} timed out after {limit} s/            sys.exit(0)  # refuse(f"guard {guard} timed out after {limit} s/|check-hook-fail-closed.sh
A1 fc input|product/tools/hook-fail-closed.py|s/        refuse(f"the hook input is empty or not one JSON object/        pass  # refuse(f"the hook input is empty or not one JSON object/|check-hook-fail-closed.sh
A1 fc one|product/tools/hook-fail-closed.py|s/        return isinstance(json.loads(raw), dict)/        return True/|check-hook-fail-closed.sh
A1 fc wait|product/tools/hook-fail-closed.py|s/def read_input(deadline=5.0):/def read_input(deadline=600.0):/|check-hook-fail-closed.sh
A1 fc junk|product/tools/hook-fail-closed.py|s/        if out.strip() and not one_object(out):/        if False:/|check-hook-fail-closed.sh
A1 fc leftover|product/tools/hook-fail-closed.py|s/        killpg(p.pid, signal.SIGKILL)   # a child/        pass  # a child/|check-hook-fail-closed.sh
A1 fc missing|product/tools/hook-fail-closed.py|s/        refuse(f"guard {guard} is missing")/        pass/|check-hook-fail-closed.sh
A1 fc jq|product/tools/hook-fail-closed.sh|/jq is missing, so the guards/d|check-hook-fail-closed.sh
A1 fc python|product/tools/hook-fail-closed.sh|/python3 is missing, so the hook/d|check-hook-fail-closed.sh
A1 fc launcher|product/tools/hook-fail-closed.sh|s/^refuse "hook-fail-closed.py ended with exit \$rc" "\$@"$/exit 0/|check-hook-fail-closed.sh
A1 stop enter|product/tools/stop-check.sh|s/exit 1; }   # fail closed (LR-046)/exit 0; }   # fail closed (LR-046)/|check-hook-fail-closed.sh
OS29 note|product/tools/stop-check.sh|/unpushed commit(s) on/d|check-stop-check.sh'
