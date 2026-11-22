#!/usr/bin/env bash
# SPD-1 self-test (founder 22 Nov, P-802): the merge queue routes a PR by the paths it touches. Shows, by evaluating
# .mergify.yml itself (track-route.py route, B119's evaluator), the queue for a Track A PR, a Track B PR, a PR touching
# both tracks, a records PR and the neighbours; that the track queues keep product's conditions word for word with batch
# size 3; that .mergify.yml and track-paths.txt agree (and a drift is caught); that breaking a track queue on purpose is
# caught; and the batch-proof tool and workflow (part 2). Exit 0 all pass, 1 any fails. US$0, no network.
#   bash product/tools/test-spd-1.sh
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; ROOTD="$(cd "$TOOLS/../../../.." && pwd)"
S=ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio; R=ai-workers/problem-1-pathway-setup-and-form-filling/product
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok() { if [ "$2" = "$3" ]; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1 (want $3, got $2)"; fail=$((fail+1)); fi; }
route() { printf '%s\n' "$@" | python3 -I "$TOOLS/track-route.py" route; }

echo "## routing, read from .mergify.yml"
ok "Track A path (platform firms) joins track-a"            "$(route $S/api/src/platform/firms/service.ts)" track-a
ok "Track A path (front-office booking) joins track-a"      "$(route $S/api/src/front-office/booking/slots.ts)" track-a
ok "Track B path (client money) joins track-b"              "$(route $S/api/src/client-money/invoices/drafts.ts)" track-b
ok "Track B path (platform files, inside platform/) joins track-b" "$(route $S/api/src/platform/files/x.ts)" track-b
ok "Track B path (case side) joins track-b"                 "$(route $S/api/src/filing.ts)" track-b
ok "a PR touching both tracks joins the shared queue product" "$(route $S/api/src/platform/firms/service.ts $S/api/src/client-money/invoices/drafts.ts)" product
ok "app files in neither track join the shared queue product" "$(route $S/web/src/pages/start.tsx)" product
ok "a Track A file plus a file of neither track stays in track-a" "$(route $S/api/src/platform/firms/service.ts $S/web/src/pages/start.tsx)" track-a
ok "a records PR joins records"                              "$(route $R/STATE.md $R/qa/BUGS.md)" records
ok "pipeline work alone joins pipeline"                      "$(route .mergify.yml $R/tools/track-paths.txt)" pipeline

echo "## one list, kept in step"
python3 -I "$TOOLS/track-route.py" check > "$TMP/check.log" 2>&1; ok ".mergify.yml uses track-paths.txt's regexes; every track glob matches a file" "$?" 0
{ cat "$TOOLS/track-paths.txt"; echo "track-a web/src/pages/start.tsx"; } > "$TMP/paths.txt"
TRACK_PATHS="$TMP/paths.txt" python3 -I "$TOOLS/track-route.py" check > "$TMP/drift.log" 2>&1; ok "a path added to track-paths.txt but not to .mergify.yml is caught" "$?" 1
python3 -I "$ROOTD/$R/screens/B119/check-queue-rules.py" > "$TMP/b119.log" 2>&1; ok "B119's queue rules still hold (check-queue-rules.py)" "$?" 0

echo "## the track queues keep every gate"
python3 -I - "$ROOTD/.mergify.yml" > "$TMP/same.log" 2>&1 <<'PY'
import sys, yaml
q = {x["name"]: x for x in yaml.safe_load(open(sys.argv[1]))["queue_rules"]}
bad = []
strip = lambda cs: [c for c in cs if not (isinstance(c, str) and c.lstrip("-").startswith("files ~= ^ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/"))]
for t in ("track-a", "track-b"):
    if strip(q[t]["queue_conditions"]) != q["product"]["queue_conditions"]: bad.append(f"{t}: queue_conditions differ from product's")
    if q[t]["merge_conditions"] != q["product"]["merge_conditions"]: bad.append(f"{t}: merge_conditions differ from product's")
    if q[t].get("batch_size") != 3: bad.append(f"{t}: batch_size {q[t].get('batch_size')}, want 3")
    if len(q[t]["queue_conditions"]) != len(q["product"]["queue_conditions"]) + 2: bad.append(f"{t}: not exactly two track lines")
for b in bad: print(b)
sys.exit(1 if bad else 0)
PY
ok "track-a and track-b keep product's queue and merge conditions word for word, batch size 3" "$?" 0
cat "$TMP/same.log"
# Break on purpose: without its "-files ~= <other track>" line, track-a takes a both-tracks PR (the check must see it).
python3 -I - "$ROOTD/.mergify.yml" "$TMP/broken.yml" <<'PY'
import sys, yaml
c = yaml.safe_load(open(sys.argv[1]))
for x in c["queue_rules"]:
    if x["name"] == "track-a": x["queue_conditions"] = [k for k in x["queue_conditions"] if not (isinstance(k, str) and k.startswith("-files ~= ^ai-workers"))]
yaml.safe_dump(c, open(sys.argv[2], "w"), sort_keys=False)
PY
ok "broken on purpose (track-a without its exclusion): a both-tracks PR would join track-a" \
   "$(printf '%s\n' $S/api/src/platform/firms/service.ts $S/api/src/client-money/invoices/drafts.ts | TRACK_MERGIFY="$TMP/broken.yml" python3 -I "$TOOLS/track-route.py" route)" track-a
TRACK_MERGIFY="$TMP/broken.yml" python3 -I "$TOOLS/track-route.py" check > /dev/null 2>&1; ok "and track-route.py check refuses that configuration" "$?" 1

echo "## qa proof on the batch (part 2)"
node "$TOOLS/batch-proof.mjs" --self-test > "$TMP/bp.log" 2>&1; ok "batch-proof.mjs self-test" "$?" 0
python3 -I - "$ROOTD" > "$TMP/wf.log" 2>&1 <<'PY'
import os, sys, yaml
root = sys.argv[1]; bad = []
w = yaml.safe_load(open(os.path.join(root, ".github/workflows/batch-proof.yml")))
on = w.get(True) or w.get("on")
if "pull_request" not in on: bad.append("not started by pull_request")
j = w["jobs"]
if "mergify[bot]" not in j["detect"]["if"] or "mergify/merge-queue/" not in j["detect"]["if"]: bad.append("detect is not limited to Mergify's batch PRs")
if j["prove"].get("name") != "batch-proof ${{ matrix.item }}": bad.append("the check is not named batch-proof R1.n")
steps = " ".join(str(s) for s in j["prove"]["steps"])
for need in ("pull_request.head.sha", "walk.mjs", "item-proof.mjs\" scan", "item-proof.mjs\" plan"):
    if need not in steps: bad.append(f"prove lacks {need}")
if "concurrency" in w or any("concurrency" in x for x in j.values()): bad.append("a concurrency group could cancel a run")
if j["report"].get("permissions", {}).get("pull-requests") != "write" or any("checkout" in str(s) for s in j["report"]["steps"]): bad.append("report must comment and run no batch code")
if "batch-proof" in open(os.path.join(root, ".mergify.yml")).read().split("queue_rules:", 1)[1]: bad.append("batch-proof is read by a queue rule: it must start report-only (P-717 (b))")
for b in bad: print(b)
sys.exit(1 if bad else 0)
PY
ok "batch-proof.yml: Mergify batches only, check batch-proof R1.n on the batch head, report-only, never cancelled" "$?" 0
cat "$TMP/wf.log"

echo "test-spd-1: $pass passed, $fail failed"
[ "$fail" = 0 ]
