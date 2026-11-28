#!/usr/bin/env bash
# LR-181 (lab register; LR-083's hook half): the edit-time lint hook. A PostToolUse hook on Edit, Write and MultiEdit
# (.claude/settings.json). When the edited file is a studio source file (prototype/studio/**/*.{ts,tsx,js,mjs,cjs}, not
# .d.ts, node_modules, evidence or dist), it lints that one file with studio/eslint.hook.config.js (CI's rules minus the
# React Compiler rules: the hook stays under 2 s per file, measured by lint-hook-timing.sh) and the bulk suppressions, so
# only new findings show. Findings go back to the agent on stderr with exit 2 (the edit is already made; the agent reads
# them and fixes). Every other file, a copy without the studio's node_modules, an eslint that crashes or takes over
# LINT_HOOK_TIMEOUT seconds (default 15): exit 0 and nothing printed, so the hook never stops work. US$0, no network.
# Test: check-lint-hook.sh.
#   echo '{"tool_input":{"file_path":"/abs/path/file.tsx"}}' | bash product/tools/lint-hook.sh
set -u
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
S="$ROOT/ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio"
ESLINT="${LINT_HOOK_ESLINT:-$S/node_modules/.bin/eslint}"
# The edited path and the studio path, both resolved (a relative path joins ROOT; symlinks such as macOS /tmp ->
# /private/tmp resolve on both sides, so a studio edit is never skipped for its spelling).
f=$(ROOT="$ROOT" python3 -I -c 'import json,os,sys
try: p=json.load(sys.stdin).get("tool_input",{}).get("file_path","")
except Exception: p=""
print(os.path.realpath(os.path.join(os.environ["ROOT"],p)) if p else "")' 2>/dev/null)
[ -n "$f" ] || exit 0
S=$(cd "$S" 2>/dev/null && pwd -P) || exit 0
case "$f" in "$S"/*) ;; *) exit 0 ;; esac
rel="${f#"$S"/}"
case "$rel" in *node_modules/*|evidence/*|*/dist/*|dist/*|*.d.ts) exit 0 ;; esac
case "$rel" in *.ts|*.tsx|*.js|*.mjs|*.cjs) ;; *) exit 0 ;; esac
[ -f "$f" ] && [ -x "$ESLINT" ] || exit 0
# GNU timeout (gtimeout from Homebrew coreutils on a Mac); without either, eslint runs unwrapped and the hook's own
# 20 s limit in .claude/settings.json still bounds it. Never a silent no-op for want of timeout.
T=$(command -v timeout || command -v gtimeout || true)
out=$(cd "$S" && ${T:+"$T" "${LINT_HOOK_TIMEOUT:-15}"} "$ESLINT" --config eslint.hook.config.js --pass-on-unpruned-suppressions \
  --format stylish -- "$rel" 2>&1)
rc=$?
[ "$rc" = 1 ] || exit 0   # 0 clean; 2 config or crash, 124 timeout: never block the edit on the hook's own trouble
printf 'eslint (LR-181 edit-time hook) found new problems in %s; fix them before you go on:\n%s\n' "$rel" "$out" >&2
exit 2
