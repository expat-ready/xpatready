# OS-33 (LR-046, P-175, P-175b): live-ai-off.sh fails a STUDIO_*_LIVE switch that is on by default, read or set.
TESTS="$TESTS check-live-ai-off.sh"
MUT="$MUT"'
OS33 read|product/tools/live-ai-off.sh|s/^                if not OFF.match(rest):$/                if False:/|check-live-ai-off.sh
OS33 set|product/tools/live-ai-off.sh|s/^            print(f"FAIL  {f}:{n}: sets/            continue; print(f"FAIL  {f}:{n}: sets/|check-live-ai-off.sh
OS33 exit|product/tools/live-ai-off.sh|s/^sys.exit(bad)$/sys.exit(0)/|check-live-ai-off.sh'
