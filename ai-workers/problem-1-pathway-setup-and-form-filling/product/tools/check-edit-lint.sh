#!/usr/bin/env bash
# LR-181: the edit-time eslint hook (edit-lint.sh). Throwaway copies with a stub eslint, US$0, no network; the last
# cases use the real studio eslint when node_modules is installed (else SKIP: CI's guards job has no studio install).
#   bash product/tools/check-edit-lint.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/editlint.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
C="$T/c"; Q="$C/$PRODREL"; S="$C/ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio"
mkdir -p "$Q/tools" "$S/node_modules/.bin" "$S/web/src/pages" "$S/node_modules/x" "$S/evidence" "$S/api/src"
cp "$TOOLS/edit-lint.sh" "$Q/tools/"; : > "$S/eslint.edit.config.js"
cat > "$S/node_modules/.bin/eslint" <<'EOF'
#!/usr/bin/env bash
echo "$PWD $*" >> "$STUB_LOG"; [ "${STUB_RC:-0}" = 1 ] && echo "  1:7  error  'x' is assigned a value but never used  no-unused-vars"; exit "${STUB_RC:-0}"
EOF
chmod +x "$S/node_modules/.bin/eslint"; export STUB_LOG="$T/log"
for f in web/src/pages/a.tsx web/src/b.md node_modules/x/c.ts evidence/d.ts api/src/e.d.ts api/src/f.ts; do echo 'x' > "$S/$f"; done
echo 'x' > "$Q/STATE.md"; mkdir -p "$C/packages/p"; echo 'x' > "$C/packages/p/g.ts"
hook() { : > "$STUB_LOG"; err=$(printf '{"tool_name":"Edit","tool_input":{"file_path":"%s"}}' "$1" | bash "$Q/tools/edit-lint.sh" --hook 2>&1 >/dev/null); rc=$?; }
called() { [ -s "$STUB_LOG" ]; }

STUB_RC=1 hook "$S/web/src/pages/a.tsx"
ok "a studio .tsx with new findings: exit 2, the file and the finding on stderr" "$([ "$rc" = 2 ] && grep -q 'new problems in web/src/pages/a.tsx' <<<"$err" && grep -q "no-unused-vars" <<<"$err" && echo 1)" "rc=$rc $err"
ok "eslint runs in the studio folder with the edit config, the suppressions pass, on the one relative path" "$(grep -q "^$S -c eslint.edit.config.js --pass-on-unpruned-suppressions --no-warn-ignored -- web/src/pages/a.tsx$" "$STUB_LOG" && echo 1)" "$(cat "$STUB_LOG")"
STUB_RC=0 hook "$S/web/src/pages/a.tsx"; ok "a clean studio file: exit 0, nothing printed" "$([ "$rc" = 0 ] && [ -z "$err" ] && called && echo 1)" "rc=$rc $err"
STUB_RC=1 hook "$S/api/src/f.ts"; ok "an api .ts is linted too" "$([ "$rc" = 2 ] && echo 1)" "rc=$rc"
STUB_RC=2 hook "$S/web/src/pages/a.tsx"; ok "eslint crashing (exit 2): exit 0, the edit is not nagged" "$([ "$rc" = 0 ] && [ -z "$err" ] && echo 1)" "rc=$rc $err"
STUB_RC=1 hook "$Q/STATE.md"; ok "a file outside the studio: eslint not run" "$([ "$rc" = 0 ] && ! called && echo 1)" "rc=$rc"
STUB_RC=1 hook "$C/packages/p/g.ts"; ok "a .ts file outside the studio (packages/): eslint not run" "$([ "$rc" = 0 ] && ! called && echo 1)" "rc=$rc"
STUB_RC=1 hook "$S/web/src/b.md"; ok "a studio file that is not source (.md): eslint not run" "$([ "$rc" = 0 ] && ! called && echo 1)" "rc=$rc"
n=0; for f in node_modules/x/c.ts evidence/d.ts api/src/e.d.ts; do STUB_RC=1 hook "$S/$f"; { [ "$rc" = 0 ] && ! called; } && n=$((n + 1)); done
ok "node_modules, evidence and .d.ts files: eslint not run" "$([ "$n" = 3 ] && echo 1)" "$n of 3"
STUB_RC=1 hook "$S/web/src/pages/missing.tsx"; ok "a path that does not exist: exit 0, eslint not run" "$([ "$rc" = 0 ] && ! called && echo 1)" "rc=$rc"
: > "$STUB_LOG"; err=$(echo 'not json' | STUB_RC=1 bash "$Q/tools/edit-lint.sh" --hook 2>&1); rc=$?
ok "unreadable hook input: exit 0" "$([ "$rc" = 0 ] && ! called && echo 1)" "rc=$rc $err"
mv "$S/node_modules/.bin/eslint" "$T/eslint"; STUB_RC=1 hook "$S/web/src/pages/a.tsx"
ok "a copy without the studio's node_modules: exit 0, silent" "$([ "$rc" = 0 ] && [ -z "$err" ] && echo 1)" "rc=$rc $err"
mv "$T/eslint" "$S/node_modules/.bin/eslint"
NB="$T/notimeout"; mkdir -p "$NB"; for d in /usr/local/bin /usr/bin /bin; do for b in "$d"/*; do n=$(basename "$b"); case "$n" in timeout|gtimeout) continue;; esac; [ -e "$NB/$n" ] || ln -s "$b" "$NB/$n"; done; done
: > "$STUB_LOG"; err=$(printf '{"tool_input":{"file_path":"%s"}}' "$S/web/src/pages/a.tsx" | STUB_RC=1 PATH="$NB" bash "$Q/tools/edit-lint.sh" --hook 2>&1 >/dev/null); rc=$?
ok "no timeout and no gtimeout on PATH (a Mac without coreutils): eslint still runs, uncapped, and its findings show" "$([ "$rc" = 2 ] && called && grep -q no-unused-vars <<<"$err" && echo 1)" "rc=$rc $err"
R="$(cd "$TOOLS/../../../.." && pwd)"
if [ -f "$R/.claude/settings.json" ]; then
  w=$(python3 -I - "$R/.claude/settings.json" <<'EOF'
import json, re, sys
d = json.load(open(sys.argv[1]))
for g in (d.get("hooks") or {}).get("PostToolUse") or []:
    m = g.get("matcher") or ""
    if all(re.search(m, t) for t in ("Edit", "Write", "MultiEdit")) and not re.search(m, "Bash"):
        if any("edit-lint.sh --hook" in (h.get("command") or "") for h in g.get("hooks") or []):
            print("wired"); break
EOF
)
  ok "settings.json: a PostToolUse hook on Edit, Write and MultiEdit runs edit-lint.sh --hook" "$([ "$w" = wired ] && echo 1)" "$w"
else echo "SKIP  settings.json: not in this copy"; fi
RS="$R/ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio"
if [ -x "$RS/node_modules/.bin/eslint" ] && [ -f "$RS/eslint.edit.config.js" ]; then
  cfg=$(cd "$RS" && node_modules/.bin/eslint -c eslint.edit.config.js --print-config web/src/runtime/questionnaire.tsx 2>&1)
  on=$(python3 -I -c 'import json,sys
r=json.loads(sys.stdin.read())["rules"]; s=lambda k: (r.get(k) or [0])[0]
print(s("react-hooks/rules-of-hooks"), s("react-hooks/exhaustive-deps"), s("react-hooks/static-components"), s("@typescript-eslint/no-unused-vars"))' <<<"$cfg" 2>&1)
  ok "real edit config: rules-of-hooks and exhaustive-deps on, the compiler rule off, the CI rules kept" "$([ "$on" = "2 2 0 2" ] && echo 1)" "$on"
  s=$(date +%s%N); (cd "$RS" && node_modules/.bin/eslint -c eslint.edit.config.js --pass-on-unpruned-suppressions --no-warn-ignored -- web/src/runtime/questionnaire.tsx >/dev/null 2>&1); lrc=$?; e=$(( ($(date +%s%N) - s) / 1000000 ))
  ok "real eslint, edit config, the largest React file: it lints (exit 0 or 1) under 2 s cold (LR-083's bar)" "$([ "$lrc" -le 1 ] && [ "$e" -lt 2000 ] && echo 1)" "exit $lrc, ${e} ms"
else echo "SKIP  the real studio eslint: node_modules not installed in this copy"; fi
finish
