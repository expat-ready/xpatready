#!/usr/bin/env bash
# OS-33 (P-175, P-175b): live-ai-off.sh fails a STUDIO_*_LIVE switch that is on by default, read or set, and passes the
# repository as it is. Each planted break is its own throwaway git copy. US$0, no network.   bash product/tools/check-live-ai-off.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/liveoff.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
S=ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio; k=0
# plant <path> <line>: a copy holding a safe server file plus <line> in <path>; sets out and r.
plant() { k=$((k + 1)); local c="$T/c$k"; mkdir -p "$c/$S/api/src" "$c/$(dirname "$1")"
  printf 'export const aiLive = () => process.env.STUDIO_AI_LIVE === "approved";\n' > "$c/$S/api/src/sources.ts"
  printf '%s\n' "$2" >> "$c/$1"; git -C "$c" init -q; git -C "$c" add -A
  out=$(bash "$TOOLS/live-ai-off.sh" "$c" 2>&1); r=$?; }
bad() { plant "$2" "$3"; ok "fails: $1" "$([ $r = 1 ] && echo "$out" | grep -q "^FAIL  $2:" && echo 1)" "exit $r: $out"; }
good() { plant "$2" "$3"; ok "passes: $1" "$([ $r = 0 ] && echo 1)" "exit $r: $out"; }
bad "a read by !== \"off\" (on unless someone turns it off)" "$S/api/src/a.ts" 'export const on = () => process.env.STUDIO_AI_LIVE !== "off";'
bad "a read with a default of approved" "$S/engine/b.ts" 'const on = process.env.STUDIO_PEOPLE_AI_LIVE ?? "approved";'
bad "a bare truthy read by brackets" "$S/web/src/c.tsx" 'if (process.env["STUDIO_AI_LIVE"]) start();'
bad "an env write in server code" "$S/api/src/d.ts" 'process.env.STUDIO_AI_LIVE = "approved";'
bad "an object key in server code" "$S/api/src/e.ts" 'const env = { PORT: "1", STUDIO_AI_LIVE: "approved" };'
bad "a start script exporting it" "$S/start.sh" 'export STUDIO_AI_LIVE=approved'
bad "a workflow env line" ".github/workflows/ci.yml" '      STUDIO_AI_LIVE: approved'
bad "a Dockerfile ENV" "$S/Dockerfile" 'ENV STUDIO_AI_LIVE=approved'
bad "a JSON setting" "$S/deploy/env.json" '{ "STUDIO_PEOPLE_AI_LIVE": "approved" }'
good "the server's own exact read" "$S/api/src/f.ts" 'export const o = (env: NodeJS.ProcessEnv) => env.STUDIO_AI_LIVE === "approved" && env.STUDIO_PEOPLE_AI_LIVE === "approved";'
good "a comment naming the switch" "$S/api/src/g.ts" '// live needs STUDIO_AI_LIVE=approved at server start'
good "a message naming the switch in a string" "$S/contracts/h.ts" 'export const W = "AI is off unless started with STUDIO_AI_LIVE=approved";'
good "a test that turns it on for a fake launcher" "$S/tests/check_x.ts" 'const ENV = { STUDIO_AI_LIVE: "approved", STUDIO_FAKE_LAUNCHER: "1" };'
good "a script that blanks it" "$S/tools/isolated.sh" 'STUDIO_AI_LIVE= exec node api.js'
good "a workflow that sets it empty" ".github/workflows/ci.yml" '      STUDIO_AI_LIVE: ""'
# check-guards --mutate runs this in an untracked copy of the tools: there only the planted cases above count.
if [ -n "$(git -C "$TOOLS" ls-files 2>/dev/null | head -1)" ]; then out=$(bash "$TOOLS/live-ai-off.sh" 2>&1); r=$?
  ok "this repository passes (exit 0 on main)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
else echo "SKIP  this repository: its files are not tracked here (a check-guards mutation copy)"; fi
finish
