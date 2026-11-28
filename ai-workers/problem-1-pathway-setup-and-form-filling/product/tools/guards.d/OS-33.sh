# OS-33 (LR-046, P-175, P-175b): live-ai-off.sh fails a STUDIO_*_LIVE switch that is on by default, read or set.
TESTS="$TESTS check-live-ai-off.sh"
MUT="$MUT"'
OS33 read|product/tools/live-ai-off.sh|s/^                    elif not APPROVED\[k\].match(m.group("x")):$/                    elif False:/|check-live-ai-off.sh
OS33 set|product/tools/live-ai-off.sh|s/^                elif not off(m.group("x"), v):$/                elif False:/|check-live-ai-off.sh
OS33 destructure|product/tools/live-ai-off.sh|s/^                    fail(f, n, f"takes {v} out/                    pass; (f, n, f"takes {v} out/|check-live-ai-off.sh
OS33 shell start|product/tools/live-ai-off.sh|s/^SH = r"(?:^\\s\*/SH = r"(?:^X\\s*/|check-live-ai-off.sh
OS33 exit|product/tools/live-ai-off.sh|s/^sys.exit(bad)$/sys.exit(0)/|check-live-ai-off.sh'
