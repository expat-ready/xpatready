#!/usr/bin/env bash
# The eight guards of 6 Nov, B134's label sweep (7 Nov), B170a's engine test PDFs (L1, 11 Nov), D3's comment trigger (P-506, 12 Nov), rule triage (guard 14) and B194's queue gate (guard 15, 16 Nov), B206's runs waiting (guard 30, 20 Nov), ENF-758's queue blocked by checks (guard 37, 20 Nov, P-758), P-789 (2)'s app view rows and running jobs (guard 36, 22 Nov), ENF-763's founder-click guard (guard 31, 20 Nov, P-763), E14's index integrity (guard 33, 21 Nov, P-772), ENF-738's constraint section (guard 29, 20 Nov), CI-SPEED-3's queue depth (CS3, 21 Nov, A254), E2's report-only PR suites (guard 35, 21 Nov, P-772), B193 part 2's Lead hooks (18-23, 16 Nov), CK-1's conformance check (guard 24) and CK-2's heartbeat (guard 25, 17 Nov), ENF-733's focus list (guard 26) and workflow lock (guard 27, 19 Nov, P-734), B204's waves (guard 28, 20 Nov, P-745) with ENF-761's under-cap ACTs (761c) (founder, ~03:00 IST: "fix it so that it becomes a hard rule and it never messes up"), each
# with its test. --mutate also proves each test fails without its guard: in a throwaway copy of the tools, the guard is
# switched off by one edit and its test must go red. Run by .github/workflows/guards.yml. US$0, no network.
#   bash product/tools/check-guards.sh [--mutate]
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"; ROOTD="$(cd "$TOOLS/../../../.." && pwd)"; P=ai-workers/problem-1-pathway-setup-and-form-filling
TESTS="check-lead-merge.sh"
bad=0
for t in $TESTS check-deps-line.sh check-pr-concurrency.sh; do bash "$TOOLS/$t" > "${TMPDIR:-/tmp}/guard-$$.log" 2>&1; r=$?; echo "$( [ $r = 0 ] && echo PASS || echo FAIL )  $t ($(tail -1 "${TMPDIR:-/tmp}/guard-$$.log"))"
  [ $r = 0 ] || { bad=1; grep '^FAIL' "${TMPDIR:-/tmp}/guard-$$.log" | sed 's/^/      /'; }; done
rm -f "${TMPDIR:-/tmp}/guard-$$.log"
[ "${1:-}" = --mutate ] || exit $bad
# guard | file the edit goes in | sed edit that switches the guard off (no | or ' in it: .. stands for || and . for ') | the test that must then fail
# Rows 36 deadlock and 36 wfname add a line with GNU sed's \n in the replacement (CI runs on ubuntu; BSD sed would not).
pyparse() { python3 -I -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" "${@: -1}"; }   # "$sh -n FILE" for a .py
jsparse() { node --check "${@: -1}"; }   # "$sh -n FILE" for a .js (guard 36: app-view.js; bash -n cannot read JavaScript)
MUT='38 source|product/tools/private-sync.sh|s/^if \[ ! -d "\$NOTES" \] .*then$/if false; then/|check-lead-upkeep.sh
38 rev-parse|product/tools/private-sync.sh|s/^if ! git rev-parse -q --verify HEAD .*then$/if false; then/|check-lead-upkeep.sh
38 note file|product/tools/private-sync.sh|s/ -type f ! -path / -type f -path /|check-lead-upkeep.sh
38 after copy|product/tools/private-sync.sh|s/^if \[ -z "\$(git ls-files -s -- notes\/side-session-notes\/ .*then$/if false; then/|check-lead-upkeep.sh
38 origin|product/tools/private-sync.sh|s/^if ! same_repo .*then$/if false; then/|check-lead-upkeep.sh
38 pull|product/tools/private-sync.sh|s/^if ! git pull -q --ff-only; then$/if ! git pull -q --ff-only \&\& false; then/|check-lead-upkeep.sh
38 dot path|product/tools/private-sync.sh|s/ grep -v -E .(^.\/)\[.\]. / cat /|check-lead-upkeep.sh
38 ahead|product/tools/private-sync.sh|s/ && \[ "\$ahead" = 0 \]; then$/; then/|check-lead-upkeep.sh
38 stored|product/tools/private-sync.sh|s/git config --get remote.origin.url/git remote get-url origin/|check-lead-upkeep.sh
38 slash|product/tools/private-sync.sh|s/local a="\${1%\/}" b="\${2%\/}"/local a="$1" b="$2"/|check-lead-upkeep.sh
38 symlink|product/tools/private-sync.sh|s/\$1 == "100644" .. \$1 == "100755"/$1 != "160000"/|check-lead-upkeep.sh
38 gitlink|product/tools/private-sync.sh|s/^if \[ -n "\$subs" \]; then$/if false; then/|check-lead-upkeep.sh
38 undo|product/tools/private-sync.sh|s/^undo() { git reset -q -- notes;/undo() { git reset -q --hard HEAD;/|check-lead-upkeep.sh
38 pushurl|product/tools/private-sync.sh|s/^  \[ -z "\$u" \] /  true /|check-lead-upkeep.sh
38 branch|product/tools/private-sync.sh|s/"HEAD:refs\/heads\/\${up#origin\/}"/HEAD/|check-lead-upkeep.sh
38 F4 upstream|product/tools/private-sync.sh|/^case "\$up" in origin\/?\*) ;; \*) echo "private-sync: refused, the working copy tracks no branch/d|check-lead-upkeep.sh
38 F4 pushinsteadof|product/tools/private-sync.sh|s/^  case "\$u" in "\$v"\*) same_repo/  case "$u" in nomatch) same_repo/|check-lead-upkeep.sh
38 F4 add|product/tools/private-sync.sh|s/^if ! adderr=\$(git add -A notes 2>\&1); then$/git add -A notes; if false; then/|check-lead-upkeep.sh
37 paths|product/tools/queue-blocked.py|s/^    return bool(files) and all(any(r.search(f) for r in CHECK_ONLY) for f in files)/    return True/|check-queue-blocked.sh
37 approve|product/tools/queue-blocked.py|s/^    return bool(re.match(.*/    return True/|check-queue-blocked.sh
37 head|product/tools/queue-blocked.py|s/approve\[sd\]?\\s+%s\\b" % re.escape(head)/approve" % ()/|check-queue-blocked.sh
37 trusted|product/tools/queue-blocked.py|s/c.get("author_association") not in TRUSTED or //|check-queue-blocked.sh
37 who|product/tools/queue-blocked.py|s/ or (c.get("user") or {}).get("login") not in who:/:/|check-queue-blocked.sh
37 source|product/tools/queue-blocked.py|s/ and main_like(r.get("head_branch"))\]/]/|check-queue-blocked.sh
37 measured|product/tools/queue-blocked.py|s/"" if note else "main.s guards green, "/"main.s guards green, "/|check-queue-blocked.sh
37 pages|product/tools/queue-blocked.py|s/^        if len(page) < 100 or enough(page):/        if True:/|check-queue-blocked.sh
37 rename|product/tools/queue-blocked.py|s/, f.get("previous_filename"))/,)/|check-queue-blocked.sh
37 running|product/tools/queue-blocked.py|s/ or any(r.get("status") != "completed" for r in mine)//|check-queue-blocked.sh
37 batchpr|product/tools/queue-blocked.py|s/ or str((p.get("head") or {}).get("ref") or "").startswith("mergify\/")//|check-queue-blocked.sh
37 label|product/tools/queue-blocked.py|s/^            if "review: approved" not in labels:$/            if True:/|check-queue-blocked.sh
37 cancelled|product/tools/queue-blocked.py|s/ and r.get("conclusion") not in ("cancelled", "skipped")//|check-queue-blocked.sh
37 window red|product/tools/queue-blocked.py|s/ and (r is last or (when(r.get("created_at")) or now) >= since)\]/ and r is last]/|check-queue-blocked.sh
37 reviewers|product/tools/queue-blocked.py|s/^            rv = gh("api", .*/            rv = ""/|check-queue-blocked.sh
37 cap|product/tools/queue-blocked.py|s/^    raise Unread("more than %d pages" % cap)/    return out/|check-queue-blocked.sh
37 ci|product/tools/queue-blocked.py|s/^    return max(mine, .*/    return True/|check-queue-blocked.sh
37 guards|product/tools/queue-blocked.py|s/^            if red:/            if False:/|check-queue-blocked.sh
37 batch|product/tools/queue-blocked.py|s/str(r.get("head_branch") or "").startswith("mergify\/merge-queue\/") and/str(r.get("head_branch") or "").startswith("never\/") and/|check-queue-blocked.sh
37 window|product/tools/queue-blocked.py|s/^WINDOW_H = 2 /WINDOW_H = 999 /|check-queue-blocked.sh
37 dequeued|product/tools/queue-blocked.py|s/.get("name") == "dequeued"/.get("name") == "never"/|check-queue-blocked.sh
37 green|product/tools/queue-blocked.py|s/^    if not why and not warn:/    if False:/|check-queue-blocked.sh
37 unread|product/tools/queue-blocked.py|s/^    if not why and not warn:/    if not why:/|check-queue-blocked.sh
37 draft|product/tools/queue-blocked.py|s/if p.get("draft") or /if False and p.get("draft") or /|check-queue-blocked.sh
37 read|product/tools/queue-blocked.py|s/^        if read:$/        if True:/|check-queue-blocked.sh
37 read who|product/tools/queue-blocked.py|s/ not in TRUSTED or not c.get("created_at"):/ is None:/|check-queue-blocked.sh
37 read edited|product/tools/queue-blocked.py|s/^        if (c.get("created_at") if u is None else u) != c.get("created_at"):/        if False:/|check-queue-blocked.sh
37 read head|product/tools/queue-blocked.py|s/^            if m and m.group(1).lower() == head.lower():$/            if m:/|check-queue-blocked.sh
37 read drop|product/tools/queue-blocked.py|s/^        for d in DROP:$/        for d in []:/|check-queue-blocked.sh
37 read code|product/tools/queue-blocked.py|s/^            if line.startswith("    ") or line.startswith(.\\t.):$/            if False:/|check-queue-blocked.sh
37 read blank|product/tools/queue-blocked.py|s/^LEAD_READ = re.compile(r"^\[ \\t\\v\\f\]\*lead read/LEAD_READ = re.compile(r"^[\\s\\xa0]*lead read/|check-queue-blocked.sh
37 read leads|product/tools/queue-blocked.py|s/^        if leads and (login not in leads or login == asc(str(author or ""))):$/        if False:/|check-queue-blocked.sh
37 read unread|product/tools/queue-blocked.py|s/^                ll = None$/                ll = ""; continue/|check-queue-blocked.sh
37 read org|product/tools/queue-blocked.py|s/^                    continue$/                    break/|check-queue-blocked.sh
37 read nul|product/tools/queue-blocked.py|s/^    if any("\\x00" in b for b in counted):/    if False:/|check-queue-blocked.sh
37 read ascii|product/tools/queue-blocked.py|s/^    return re.sub(r"\[A-Z\]", lambda m: m.group().lower(), x)$/    return x.lower()/|check-queue-blocked.sh
37 read empty|product/tools/queue-blocked.py|s/os.environ.get("QB_LEAD_LOGINS")/os.environ.get("LEAD_LOGINS")/|check-queue-blocked.sh
37 read asciire|product/tools/queue-blocked.py|s/, re.I . re.A)   # grep/, re.I)   # grep/|check-queue-blocked.sh
37 read split|product/tools/queue-blocked.py|s/\[^\\S\\x1c-\\x1f\]/\\s/|check-queue-blocked.sh
37 read 404|product/tools/queue-blocked.py|s/^                if e.notfound:$/                if True:/|check-queue-blocked.sh
37 read 404 text|product/tools/queue-blocked.py|s/returned error: 404\\b/never/|check-queue-blocked.sh
37 F2 head|product/tools/queue-blocked.py|s/% (n, title, head, head))/% (n, title, head[:7], head[:7]))/|check-queue-blocked.sh'
echo "--- each test without its guard (must FAIL)"
while IFS='|' read -r g f edit t; do
  M=$(mktemp -d "${TMPDIR:-/tmp}/guard.XXXXXXXX") && [ -d "$M" ] || { echo "no temp dir: nothing was checked"; exit 2; }; mkdir -p "$M/$P/product" "$M/$P/prototype/studio" "$M/.claude" "$M/.github/workflows" "$M/$P/product/qa"
  cp -R "$TOOLS" "$M/$P/product/"; cp -R "$ROOTD/$P/prototype/studio/tools" "$M/$P/prototype/studio/"
  cp "$ROOTD/$P/product/qa/CAPABILITIES.md" "$M/$P/product/qa/"; mkdir -p "$M/$P/product/design"; cp "$ROOTD/$P/product/design/waves.tsv" "$ROOTD/$P/product/design/waves.md" "$M/$P/product/design/"; cp "$ROOTD/$P/product/focus-list.md" "$M/$P/product/"; cp -R "$ROOTD/.claude/skills" "$ROOTD/.claude/settings.json" "$M/.claude/"
  cp "$ROOTD/.github/workflows/"*.yml "$M/.github/workflows/"; cp "$ROOTD/.mergify.yml" "$M/"; git -C "$M" init -q   # every workflow: check-label-guard parses two
  for x in $(cd "$ROOTD" && ls packages/xfa-engine/fixtures/synthetic/*.pdf packages/xfa-engine/src/__tests__/fixtures/*.pdf 2>/dev/null); do mkdir -p "$M/$(dirname "$x")"; cp "$ROOTD/$x" "$M/$x"; done   # guard 11 needs the real bytes
  before=$(cksum < "$M/$P/$f"); sed -i.bak "$edit" "$M/$P/$f"; rm -f "$M/$P/$f.bak"
  sh=bash; head -1 "$M/$P/$f" | grep -q zsh && sh=zsh; case "$f" in *.yml|*.txt) sh=true;; *.py) sh=pyparse;; *.js|*.mjs) sh=jsparse;; esac   # a .yml or .txt list is read by its test; a .py by ast (B192)
  if [ "$before" = "$(cksum < "$M/$P/$f")" ]; then echo "FAIL  guard $g: the edit '$edit' changed nothing in $f"; bad=1
  elif ! $sh -n "$M/$P/$f" 2>"$M/log"; then echo "FAIL  guard $g: the edit '$edit' breaks $f's syntax, so its test failing proves nothing ($(head -1 "$M/log"))"; bad=1
  elif bash "$M/$P/product/tools/$t" > "$M/log" 2>&1; then echo "FAIL  guard $g: $t still passes with the guard off"; bad=1
  else echo "PASS  guard $g off → $t fails ($(tail -1 "$M/log"); first: $(grep -m1 '^FAIL' "$M/log" | cut -c7-90))"; fi
  rm -rf "$M"
done <<< "$MUT"
exit $bad
