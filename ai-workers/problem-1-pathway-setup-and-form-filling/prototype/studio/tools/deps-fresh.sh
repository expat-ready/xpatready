#!/usr/bin/env bash
# The studio's packages match the committed lockfile (P-82; Lead 3, 25 Nov: main's demo went red at 9b5a93fce, demo-update
# run 45474652245: #3500 added pdfjs-dist, but start.sh ran npm ci only when node_modules was missing, so the demo copy
# kept an old node_modules and vite's pdfjs plugin hit MODULE_NOT_FOUND).
#   npm ci runs when node_modules is missing, or holds no stamp, or its stamp is not package-lock.json's SHA-256; the
#   stamp (node_modules/.lock-sha256) is written only after npm ci succeeds, so a failed install runs again next time.
#   The PATH's Node must have package.json's "engines" major (24): another Node installs nothing (exit 1).
# Usage: bash tools/deps-fresh.sh [studio dir]   (start.sh runs it). Exit 0 fresh or installed, 1 refused or npm ci failed.
# Test: studio/tests/check_deps_fresh.ts.
set -u
D="${1:-$(cd "$(dirname "$0")/.." && pwd)}"; cd "$D" || { echo "studio packages: no folder $D"; exit 1; }
want=$(node -p 'require("./package.json").engines.node' 2>/dev/null); have=$(node -v 2>/dev/null); have=${have#v}
if [ -z "$want" ] || [ "${have%%.*}" != "${want%%.*}" ]; then
  echo "studio packages: Node ${want:-?} needed (package.json engines), the PATH has ${have:-no node}: nothing installed"; exit 1
fi
[ -f package-lock.json ] || { echo "studio packages: no package-lock.json in $D"; exit 1; }
hash=$( (sha256sum package-lock.json 2>/dev/null || shasum -a 256 package-lock.json) | cut -d' ' -f1)
stamp=node_modules/.lock-sha256
if [ ! -d node_modules ]; then why="node_modules missing"
elif [ ! -f "$stamp" ]; then why="node_modules has no lock stamp (installed before this check)"
elif [ "$(cat "$stamp")" != "$hash" ]; then why="package-lock.json changed since node_modules was installed"
else exit 0; fi
echo "studio packages: $why: npm ci (Node $have)"
npm ci || { echo "studio packages: npm ci failed"; exit 1; }
mkdir -p node_modules && printf "%s\n" "$hash" > "$stamp"
