# OS-32 (LR-046, P-319, P-425): engine-hardcode.sh fails a form number or a key-literal branch in engine code (KNOWN warns).
TESTS="$TESTS check-engine-hardcode.sh"
MUT="$MUT"'
OS32 form|product/tools/engine-hardcode.sh|s/^            hits = \[("form", m.group(0)) for m in FORM.finditer(s)\] + /            hits = /|check-engine-hardcode.sh
OS32 branch|product/tools/engine-hardcode.sh|s/ + \[("branch", m.group(0)) for m in BRANCH.finditer(s)\]$//|check-engine-hardcode.sh
OS32 switch|product/tools/engine-hardcode.sh|s/bswitch/bswitchX/|check-engine-hardcode.sh
OS32 exit|product/tools/engine-hardcode.sh|s/^sys.exit(1 if new else 0)$/sys.exit(0)/|check-engine-hardcode.sh
OS32 line comment|product/tools/engine-hardcode.sh|s/^        out = re.sub(.*# line comment/        pass  # line comment/|check-engine-hardcode.sh
OS32 block comment|product/tools/engine-hardcode.sh|s/out += s\[:i\]; s = s\[i + 2:\]; block = True/out += s; break/|check-engine-hardcode.sh
OS32 block end|product/tools/engine-hardcode.sh|s/block = False; s = s.split("\*\/", 1)\[1\]; continue/block = False; s = ""; continue/|check-engine-hardcode.sh'
