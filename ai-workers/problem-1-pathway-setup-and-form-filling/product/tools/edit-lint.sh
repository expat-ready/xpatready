#!/usr/bin/env bash
# LR-181 (LR-083's hook half): the edit-time eslint hook. A PostToolUse hook on Edit, Write and MultiEdit in
# .claude/settings.json runs this with the hook's JSON on stdin. When the edited file is a studio source file
# (prototype/studio, .ts .tsx .js .mjs .cjs .mts .cts; not node_modules, evidence, dist or .d.ts), it lints that one file
# with prototype/studio/eslint.edit.config.js (the CI rules minus the React Compiler rules: about 1 s, not 2-2.6 s) and the
# studio's bulk suppressions, so only findings the edit adds show. New findings: printed on stderr, exit 2, so the agent
# sees them and fixes them (the edit itself already happened; nothing is blocked). Anything else exits 0 silently:
# another file, a copy without node_modules, eslint crashing or over its 15 s cap (CI's studio-lint still lints all).
#   echo '{"tool_input":{"file_path":"…/prototype/studio/web/src/x.tsx"}}' | bash edit-lint.sh --hook
# Test: check-edit-lint.sh.
set -u
[ "${1:-}" = "--hook" ] || { echo "usage: edit-lint.sh --hook  (hook JSON on stdin)" >&2; exit 0; }
STUDIO="$(cd "$(dirname "$0")/../../prototype/studio" 2>/dev/null && pwd -P)" || exit 0
f=$(python3 -I -c 'import json,sys
try: print((json.load(sys.stdin).get("tool_input") or {}).get("file_path") or "")
except Exception: print("")' 2>/dev/null)
[ -n "$f" ] && [ -f "$f" ] || exit 0
f="$(cd "$(dirname "$f")" && pwd -P)/$(basename "$f")"
case "$f" in "$STUDIO"/*) ;; *) exit 0 ;; esac
rel="${f#"$STUDIO"/}"
case "$rel" in *.d.ts | node_modules/* | */node_modules/* | evidence/* | dist/* | */dist/*) exit 0 ;; esac
case "$rel" in *.ts | *.tsx | *.js | *.mjs | *.cjs | *.mts | *.cts) ;; *) exit 0 ;; esac
[ -x "$STUDIO/node_modules/.bin/eslint" ] && [ -f "$STUDIO/eslint.edit.config.js" ] || exit 0
# GNU timeout: `timeout` on Linux, `gtimeout` (Homebrew coreutils) on the Mac. Neither: run uncapped; the hook's own 20 s
# timeout in settings.json still ends it (review of #4158: a bare `timeout` gave 127 on the Mac, so the hook said nothing).
CAP="$(command -v timeout || command -v gtimeout || true)"
out=$(cd "$STUDIO" && ${CAP:+"$CAP" 15} node_modules/.bin/eslint -c eslint.edit.config.js --pass-on-unpruned-suppressions --no-warn-ignored -- "$rel" 2>&1)
rc=$?
[ "$rc" = 1 ] || exit 0
{ echo "edit-lint (LR-181): eslint found new problems in $rel. Fix them now; CI's studio-lint job reports them too."
  echo "To accept one on purpose: npx eslint $rel --suppress-rule <rule> in prototype/studio."
  printf '%s\n' "$out"; } >&2
exit 2
