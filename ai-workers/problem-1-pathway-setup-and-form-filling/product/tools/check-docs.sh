#!/bin/bash
# Keeps agent instructions small and links working (P-188, P-189): skills and agents under 100 lines and 10 KB (P-203: over it, merge duplicates only, never cut a unique rule; overflow moves to WAY-OF-WORKING.md with a pointer), root
# CLAUDE.md/AGENTS.md under 60 lines (long instruction files lower agents' success: design/research-agent-teams-2026-10-31.md);
# records have no size limit (git history is the archive); backticked product paths must exist next to the citing file,
# in the product or problem folder, or at the root. Prints problems; exit 1 if any. Used by the Stop hook and the tech lead.
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"; PH="$ROOT/ai-workers/problem-1-pathway-setup-and-form-filling/product"
out=$(mktemp "${TMPDIR:-/tmp}/check-docs.XXXXXXXX"); trap 'rm -f "$out"' EXIT
# Private split (PS-1b, design/private-split-plan-2026-11-27.md): the Lead's records (STATE.md, history/, lanes/, inbox/,
# reports/, ops/, two Lead pages) move to the private repository. RD is where they are now (records-dir.sh: the Lead's
# private copy, else this copy's product/ while they are still here); empty in CI and builder copies once they have left.
RD=$(bash "$PH/tools/records-dir.sh" 2>/dev/null) || RD=""; [ -f "$PH/tools/records-dir.sh" ] || RD="$PH"
check() { local max=$1 kb=$2; shift 2; for f in "$@"; do [ -f "$f" ] || continue; n=$(wc -l < "$f"); b=$(wc -c < "$f")
  [ "$n" -gt "$max" ] && echo "TOO LONG ($n lines > $max): ${f#$ROOT/}"
  [ "$kb" -gt 0 ] && [ "$b" -gt $((kb * 1024)) ] && echo "TOO BIG ($((b / 1024)) KB > $kb KB): ${f#$ROOT/}"; done; }
{
  check 100 10 "$ROOT"/.claude/skills/*/SKILL.md "$ROOT"/.claude/agents/*.md
  check 60 0 "$ROOT/CLAUDE.md" "$ROOT/AGENTS.md"
  # STATE.md (or else the newest origin/lead/* branch's) names the current Lead on exactly one line, so every lane can
  # find whom to report to (founder, 6 Nov ~03:00 IST: "a hard rule and it never messes up"; tools/current-lead.sh reads it; test: check-current-lead.sh).
  # Since PS-1b the line lives in CURRENT-LEAD.md (public: lanes read it when STATE.md is private); when that file is
  # here it alone is judged, and STATE.md's own line, if any, is ignored.
  C="$PH/CURRENT-LEAD.md"
  if [ -f "$C" ]; then
    n=$(grep -c '^current_lead: ' "$C")
    [ "$n" -eq 1 ] || echo "CURRENT LEAD: CURRENT-LEAD.md has $n current_lead lines, needs exactly one (current_lead: <session id> <title>)"
    [ "$n" -eq 1 ] && ! grep -qE '^current_lead: [A-Za-z]+_[A-Za-z0-9_-]{8,} .*Lead [0-9]+' "$C" && echo "CURRENT LEAD: CURRENT-LEAD.md's current_lead line needs a session id, then a title naming \"Lead N\""
  elif [ ! -f "$PH/STATE.md" ]; then echo "CURRENT LEAD: no CURRENT-LEAD.md (and no STATE.md): lanes cannot find the Lead; add CURRENT-LEAD.md with one current_lead: line"
  fi
  S="$RD/STATE.md"
  if [ -n "$RD" ] && [ -f "$S" ] && [ ! -f "$C" ]; then
    n=$(grep -c '^current_lead: ' "$S")
    # The tech lead keeps STATE on its lead/* branch (P-336), so main's STATE.md may carry no line: then the line must be
    # on an origin/lead/* branch, read by current-lead.sh (no fetch here; a copy without those refs: git fetch origin
    # 'refs/heads/lead/*:refs/remotes/origin/lead/*').
    if [ "$n" -eq 0 ]; then
      w=$(bash "$PH/tools/current-lead.sh" --no-fetch --where 2>&1); v=$(bash "$PH/tools/current-lead.sh" --no-fetch 2>/dev/null)
      case "$w" in
        refs/remotes/origin/lead/*) echo "$v" | grep -qE '^[A-Za-z]+_[A-Za-z0-9_-]{8,} .*Lead [0-9]+' || echo "CURRENT LEAD: the current_lead line on ${w#refs/remotes/} needs a session id, then a title naming \"Lead N\"";;
        *) echo "CURRENT LEAD: STATE.md has 0 current_lead lines and current-lead.sh read none from an origin/lead/* branch (it read: $w), needs exactly one (current_lead: <session id> <title>)";;
      esac
    fi
    [ "$n" -gt 1 ] && echo "CURRENT LEAD: STATE.md has $n current_lead lines, needs exactly one (current_lead: <session id> <title>)"
    [ "$n" -eq 1 ] && ! grep -qE '^current_lead: [A-Za-z]+_[A-Za-z0-9_-]{8,} .*Lead [0-9]+' "$S" && echo "CURRENT LEAD: STATE.md's current_lead line needs a session id, then a title naming \"Lead N\""
  fi
  if [ -n "$RD" ] && [ -f "$S" ]; then
    # One page (6 Nov: it reached 34 KB and every Lead re-read it; test: check-state-page.sh).
    b=$(wc -c < "$S"); [ "$b" -gt 12288 ] && echo "STATE TOO BIG ($((b / 1024)) KB > 12 KB): move the earlier page to product/history/STATE-<date>-<time>-<lead>.md and keep one page"
  fi
  # P-440 (9 Nov, founder): RULES.md is a new Lead's start read; it may lag DECISIONS by at most 3 rows, so a new Lead
  # never again reads ~85 rows (~75k tokens) at start. Test: check-rules-lag.sh.
  R="$PH/RULES.md"; D="$PH/DECISIONS.md"
  if [ -f "$R" ] && [ -f "$D" ]; then
    a=$(sed -nE '1s/.*as of \*\*P-([0-9]+)\*\*.*/\1/p' "$R"); t=$(grep -oE '^\| P-[0-9]+ ' "$D" | grep -oE '[0-9]+' | sort -n | tail -1)
    if [ -z "$a" ]; then echo "RULES LAG: RULES.md's first line needs 'as of **P-NNN**'"
    elif [ -n "$t" ] && [ $((t - a)) -gt 3 ]; then echo "RULES LAG: RULES.md is as of P-$a but DECISIONS reaches P-$t ($((t - a)) rows behind, at most 3): fold the newer rows into RULES.md, keep the old page in product/history/ (P-440)"; fi
  fi
  # ENF-733 (b) (founder 19 Nov, P-734 (1), (2)): the engine is locked to the evening of 22 Nov. A DECISIONS row newer than
  # P-734, dated 19 to 22 Nov, that changes the workflow is refused unless its text carries the word "fix" and says what
  # is broken ("Broken: ..."). "Changes the workflow" is decision-impact.sh's own split, not a second one: a row listed in
  # its EXEMPT is a workflow, tooling or scope row; any other row must already show as a capability or a build row there.
  # A struck-through (withdrawn) row is not checked. DECISIONS dates carry no year: this block goes when the lock ends
  # (a follow-up for the Lead after 22 Nov), or a row dated 19 to 22 Nov next year would meet it. Test: check-workflow-lock.sh.
  if [ -f "$D" ]; then
    ex=$(sed -nE 's/^EXEMPT="([^"]*)".*/\1/p' "$PH/tools/decision-impact.sh" 2>/dev/null | head -1)
    grep -E '^\| P-[0-9]+ \|[^|]*\b(19|20|21|22) Nov\b[^|]*\|' "$D" | while IFS= read -r row; do
      id=$(printf '%s\n' "$row" | sed -E 's/^\| (P-[0-9]+) .*/\1/'); [ "${id#P-}" -gt 734 ] || continue
      if [ -z "$ex" ]; then echo "WORKFLOW LOCK: $id is dated 19 to 22 Nov and newer than P-734, but the EXEMPT list in tools/decision-impact.sh could not be read, so nothing says whether it changes the workflow (P-734)"; continue; fi
      case "$ex" in *" $id "*) ;; *)
        # Not in EXEMPT: decision-impact.sh passes it on a capability row or a backlog row naming it (same two lookups
        # here). When no capability row does and every such backlog row is tooling, qa, records or the Lead's (its area
        # cell), nothing a person can see carries it: it changes the workflow too (P-618, P-619, P-631 passed this way).
        grep -qE "^\| C[0-9.]+ .*\b$id\b" "$PH/qa/CAPABILITIES.md" 2>/dev/null && continue
        areas=$(grep -hE "^\| (B[0-9]+[a-z]?|BK-[0-9]+[a-z]?|PF-[0-9]+[a-z]?|FO-[0-9]+[a-z]?|AUD-[0-9]+) .*\b$id\b" "$PH"/BACKLOG*.md 2>/dev/null | cut -d'|' -f3)
        [ -n "$areas" ] || continue
        printf '%s\n' "$areas" | grep -qviE '^ *(tooling|qa|records|tech lead|lead) *([(;,:./]|$)' && continue;;
      esac
      printf '%s\n' "$row" | grep -qiE '\bfix(es|ed|ing)?\b' && printf '%s\n' "$row" | grep -qiE '\bbroken: *[^ |]' && continue
      # Founder exceptions to the P-734 lock (founder 20 Nov 16:0x IST chose "Exception for my approvals"; P-765): the rows
      # below quote his typed approval (P-760 is a scope ruling, not a workflow change); from P-765 on, a row approved by
      # him says "Lock: founder exception." and passes by itself. Anything he did not approve stays locked.
      case " P-754 P-755 P-756 P-757 P-758 P-759 P-760 P-761 P-762 P-763 P-764 " in *" $id "*) continue;; esac
      printf '%s\n' "$row" | grep -qE 'Lock: founder exception\.' && continue
      echo "WORKFLOW LOCK: $id changes the workflow (it is in decision-impact.sh's EXEMPT, or only tooling, qa, records or Lead backlog rows carry it) and is dated before 23 Nov, while P-733 runs unchanged to the evening of 22 Nov (P-734 (1)). Keep it for 23 Nov, or, if it fixes something broken, say so in the row: the word fix, and \"Broken: <what is broken, with its evidence>\""
    done
  fi
  # P-611, P-615 (row G-3): RULES.md is a rule register, one row per rule `| ID | Rule | Enforced by | As of |` under that
  # header; a row with no enforcer field (a hook, CI step, script, or "prose") or a page over 25 KB fails, so the start
  # read stays small and every rule says what enforces it. Long text goes to product/rules/*.md. Test: check-rule-register.sh.
  if [ -f "$R" ]; then
    b=$(wc -c < "$R"); [ "$b" -gt 25600 ] && echo "RULES TOO BIG ($((b / 1024)) KB > 25 KB): move long text word for word to product/rules/<topic>.md and keep one line per rule (P-611)"
    grep -qE '^\| ID \| Rule \| Enforced by \| As of \|' "$R" || echo "RULES REGISTER: RULES.md has no '| ID | Rule | Enforced by | As of |' table (P-611)"
    # A header spelled differently would leave its rows unchecked.
    grep -nE '^\| *ID *\|' "$R" | grep -vE '^[0-9]+:\| ID \| Rule \| Enforced by \| As of \|$' | sed 's/^\([0-9]*\):.*/RULES REGISTER: line \1 is a register header not spelled exactly "| ID | Rule | Enforced by | As of |"/'
    awk -F'|' '/^\| ID \| Rule \| Enforced by \| As of \|/ { t = 1; next } t && /^\|-/ { next }
      t && /^\|/ { for (i = 2; i <= 5; i++) { c[i] = $i; gsub(/^[ \t]+|[ \t]+$/, "", c[i]) }
        if (NF != 6) { print "RULES REGISTER: line " NR " needs exactly 4 cells (ID | Rule | Enforced by | As of): " substr($0, 1, 60); next }
        if (c[2] !~ /^[A-Z]+-[0-9A-Za-z.]+$/) print "RULES REGISTER: line " NR " has no rule ID (like P-611, P-611b or IDX-1): " substr($0, 1, 60)
        else if (seen[c[2]]++) print "RULES REGISTER: rule ID " c[2] " appears twice (line " NR ")"
        if (c[3] == "") print "RULES REGISTER: " c[2] " has no rule text"
        if (c[4] !~ /^((hook|CI|script): [^ ]|prose( |$))/) print "RULES REGISTER: " c[2] " has no enforced-by (hook: <name>, CI: <name>, script: <name> or prose), found \"" c[4] "\""
        if (c[5] == "") print "RULES REGISTER: " c[2] " has no as-of"; next }
      { t = 0 }' "$R"
    # E7 (P-772, P-611a): an enforcer file the "Enforced by" cell names (a word ending .sh, .py, .mjs, .cjs, .js, .ts, .yml
    # or .yaml, bare or with a path) is a file on this branch, tracked or new and not ignored, by that path or ending in
    # "/<it>", so the register never claims a check that is not there (the audit of 21 Nov found 5 stale cells). A cell
    # that says "owed" claims nothing yet. KNOWN_STALE: the cells stale when this check landed; the tech lead fixes them
    # in RULES.md (the proposed patch is on the E7 PR), then deletes the ID here: P-690 (plan-watch.py, never built);
    # IDX-23 on the Lead's branch (resource-claim-guard.sh arrives with #2590). Test: check-rule-register.sh.
    KNOWN_STALE=" P-690 IDX-23 "
    git -C "$ROOT" ls-files -z --cached --others --exclude-standard 2>/dev/null | python3 -I -c '
import re, sys
files = [f for f in sys.stdin.buffer.read().decode("utf-8", "replace").split("\0") if f]
if not files: print("RULES REGISTER: git could not list this copy'"'"'s files, so no enforcer file was checked (E7)"); sys.exit()
have = set(files) | {f[i + 1:] for f in files for i, c in enumerate(f) if c == "/"}   # every path and every "/"-suffix
stale = set(sys.argv[2].split()); t = False
for line in open(sys.argv[1], encoding="utf-8"):
    if re.match(r"^\| ID \| Rule \| Enforced by \| As of \|", line): t = True; continue
    if t and line.startswith("|-"): continue
    if not (t and line.startswith("|")): t = False; continue
    c = line.split("|")
    if len(c) != 6: continue
    rid, cell = c[1].strip(), c[3]
    if rid in stale or re.search(r"\bowed\b", cell, re.I): continue
    for f in sorted(set(re.findall(r"[A-Za-z0-9_./-]+\.(?:sh|py|mjs|cjs|js|ts|yml|yaml)\b", cell))):
        if f.removeprefix("./") not in have:
            print(f"RULES REGISTER: {rid} is enforced by {f}, but no such file is on this branch: fix the Enforced by cell (prose, or the real file), or write \"owed\" if it is not built yet (E7, P-611a)")
' "$R" "$KNOWN_STALE" || echo "RULES REGISTER: the enforcer-file check stopped with an error, so no enforcer file was checked (E7)"
  fi
  # E14 (P-772; IDX-1, -2, -4, -5): an index row stands for DECISIONS rows, so every P-ID an IDX row lists (one by one,
  # or "P-a to P-b", every number between) is a row of DECISIONS.md or of a side file in decisions/ (struck-through
  # rows count: the row is still there). IDX rows are read in RULES.md and in rules/*.md, where the moved full lists
  # live. A lettered ID (P-348c) is found by its own row or its number's. Test: check-idx-integrity.sh.
  if [ -f "$D" ]; then
    python3 -I - "$PH" <<'PY' || echo "INDEX: the IDX check stopped with an error (python exit $?), so no index row was checked (E14)"
import glob, os, re, sys
ph = sys.argv[1]; have = set()
for f in [os.path.join(ph, "DECISIONS.md")] + sorted(glob.glob(os.path.join(ph, "decisions", "*.md"))):
    for l in open(f, encoding="utf-8"):
        m = re.match(r"^\| *~*(P-[0-9]+[a-z]?)\b", l)
        if m: have.add(m.group(1))
for f in [os.path.join(ph, "RULES.md")] + sorted(glob.glob(os.path.join(ph, "rules", "*.md"))):
    if not os.path.exists(f): continue
    name = os.path.relpath(f, ph)
    for n, l in enumerate(open(f, encoding="utf-8"), 1):
        if not l.startswith("| IDX-"): continue
        c = l.split("|"); rid = c[1].strip(); txt = c[2] if len(c) > 2 else ""
        ids = set(re.findall(r"\bP-[0-9]+[a-z]?\b", txt))
        for a, b in re.findall(r"\bP-([0-9]+) to P-([0-9]+)\b", txt):
            a, b = int(a), int(b)
            if b < a or b - a > 200: print(f"INDEX: {name} line {n} ({rid}) has the range P-{a} to P-{b}, which runs backwards or spans over 200 rows (E14)"); continue
            ids |= {f"P-{i}" for i in range(a, b + 1)}
        miss = sorted((i for i in ids if i not in have and re.sub(r"[a-z]$", "", i) not in have), key=lambda i: int(re.sub(r"\D", "", i)))
        if miss: print(f"INDEX: {name} line {n} ({rid}) lists {', '.join(miss)}, not a row of DECISIONS.md or decisions/*.md: fix the ID or the index row (E14)")
PY
  fi
  # B193 part 5 (P-619 step 6; P-188, P-611): rows moved out of the register are never lost. Each rules/rule-id-map-*.tsv
  # lists every ID the register had before a triage: "kept" is still a RULES.md row; "merged" and "retired" rows sit word
  # for word (same sha256 as the old line) in the paired rules/merged-and-retired-*.md, and a merged row's target is still
  # a RULES.md row; the ID count equals old_rows. A map never expires: a later removal of a row it lists as kept marks it
  # merged or retired there (or a new dated map lists it). Test: check-rule-triage.sh.
  for M in "$PH"/rules/rule-id-map-*.tsv; do
    [ -f "$M" ] && [ -f "$R" ] || continue
    python3 -I - "$M" "$R" "$(dirname "$M")/merged-and-retired-$(basename "$M" .tsv | sed 's/^rule-id-map-//').md" <<'PY' || echo "RULE MAP: the check of $(basename "$M") stopped with an error (python exit $?), so nothing in it was checked: fix the map's format"
import sys, re, os, hashlib
m, r, sf = sys.argv[1:4]; mn = os.path.basename(m)
rid = lambda l: (lambda c: c[1].strip() if len(c) > 2 else "")(l.split("|"))
pat = re.compile(r"^\| [A-Z]+-[0-9A-Za-z.]+ \|")
reg = {rid(l) for l in open(r).read().split("\n") if pat.match(l)}
# P-686: a rule moved into rules/*.md under an index row is present when the IDX row names it in parentheses.
reg |= {i for l in open(r).read().split("\n") if l.startswith("| IDX-") for g in re.findall(r"\(([^)]*)\)", l) for i in re.findall(r"\bP-[0-9]+[a-z]?\b", g)}
side = {}
if os.path.exists(sf):
    for l in open(sf).read().split("\n"):
        if pat.match(l) and l.count("|") == 5: side.setdefault(rid(l), set()).add(hashlib.sha256(l.encode()).hexdigest()[:16])
want = None; seen = set(); n = 0
for l in open(m).read().split("\n"):
    if l.startswith("# old_rows="): want = int(l.split("=", 1)[1]); continue
    if not l.strip() or l.startswith("#") or l.startswith("id\t"): continue
    f = l.split("\t"); n += 1
    if len(f) != 4: print(f"RULE MAP: {mn} line \"{l[:40]}\" needs 4 tab-separated fields (id, outcome, where, line_sha)"); continue
    i, o, w, h = f
    if i in seen: print(f"RULE MAP: {i} is listed twice in {mn}")
    seen.add(i)
    if o == "kept":
        if i not in reg: print(f"RULE MAP: {i} is kept but is not a RULES.md row: put it back, or move its line word for word to {os.path.basename(sf)} and mark it merged or retired (B193 part 5)")
    elif o in ("merged", "retired"):
        if h not in side.get(i, ()): print(f"RULE MAP: {i} is {o} but its old line is not word for word in {os.path.basename(sf)} (sha {h})")
        if o == "merged" and w not in reg: print(f"RULE MAP: {i} is merged into {w}, which is not a RULES.md row")
    else: print(f"RULE MAP: {i} has outcome \"{o}\" (kept, merged or retired)")
if want is None: print(f"RULE MAP: {mn} has no '# old_rows=N' line")
elif n != want: print(f"RULE MAP: {mn} lists {n} IDs but the register had old_rows={want}: an old ID is missing")
PY
  done
  for f in "$PH"/*.md "$PH"/domain/*.md "$PH"/rules/*.md "$ROOT"/.claude/skills/*/SKILL.md "$ROOT"/.claude/agents/*.md; do
    grep -o '`[A-Za-z0-9_./-]*\.md`' "$f" | tr -d '`' | sort -u | while read -r ref; do
      # Retired files (P-188, P-189) live in git history; old decision rows and records may still name them.
      case "$ref" in WORKFLOW.md|LANES.md|CHARTER.md|LEAD.md|RETRO.md|WAVE-1.md|SCREENS.md|REQUESTS.md|PLAN.md|WAY-OF-WORKING-draft.md|TEAM.md) continue;; esac
      case "$ref" in */NN*|*NN-*|*"<"*|concept.md|challenge.md|build-notes.md|review.md|break-report.md|lead-check.md|plan.md|journey-test.md|concept-draft.md) continue;; esac
      [ -f "$PH/$ref" ] || [ -f "$ROOT/$ref" ] || [ -f "$(dirname "$f")/$ref" ] || [ -f "$PH/domain/$ref" ] || [ -f "$PH/../$ref" ] && continue
      # A moved record (PS-1b) is looked up where the records are; with none here (CI, builders) it is taken as moved.
      m=${ref#product/}
      case "$m" in history/*|lanes/*|inbox/*|reports/*|ops/*|STATE.md|RESUME-ON-NEW-ACCOUNT.md|SECOND-MAC.md)
        { [ -z "$RD" ] || [ -f "$RD/$m" ]; } && continue;; esac
      echo "MISSING LINK in ${f#$ROOT/}: $ref"
    done
  done
} | sort -u > "$out"
# Times are read, not guessed (6 Nov; E9, P-302: 17 breaks 13-16 Nov, so now a failure): STATE's "updated: YYYY-MM-DD
# HH:MM IST" (or "HH:Mx IST", any minute of that ten) must be within 30 minutes of the time it was committed (now, while
# STATE.md has uncommitted changes); an "updated:" line in neither form fails too. It fails when this branch wrote the
# time: STATE.md uncommitted, or changed by a commit not yet on STATE_TIME_BASE (default origin/main; none = this branch).
# A time already on main only warns, so one bad merge never stops every lane. Test: check-state-page.sh.
if [ -n "$RD" ] && [ -f "$RD/STATE.md" ] && grep -q '^updated:' "$RD/STATE.md"; then
  ul=$(grep -m1 '^updated:' "$RD/STATE.md")
  u=$(printf '%s\n' "$ul" | sed -nE 's/^updated: ([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-5][0-9x]) IST.*/\1/p')
  mine=1; c=""
  # The time is judged against this branch's newest STATE commit not yet on the base, merges left out: CI's test merge,
  # or a merge of main, is never taken for it (it is dated when it is made). None: the time came from the base (warn).
  if (cd "$RD" && git diff --quiet HEAD -- STATE.md 2>/dev/null); then
    b="${STATE_TIME_BASE:-origin/main}"
    if (cd "$RD" && git rev-parse -q --verify "$b^{commit}" >/dev/null); then
      c=$(cd "$RD" && git log -1 --no-merges --format=%ct "$b..HEAD" -- STATE.md 2>/dev/null)
      [ -n "$c" ] || { mine=0; c=$(cd "$RD" && git log -1 --no-merges --format=%ct -- STATE.md 2>/dev/null); }
    else c=$(cd "$RD" && git log -1 --no-merges --format=%ct -- STATE.md 2>/dev/null); fi
  fi
  [ -n "$c" ] || c=$(date +%s)
  if [ -z "$u" ]; then msg="STATE TIME: STATE.md's first updated: line cannot be read: write 'updated: YYYY-MM-DD HH:MM IST' (or HH:Mx) from TZ=Asia/Kolkata date"
  else msg=$(python3 -I -c 'import sys, datetime as d
ist = d.timezone(d.timedelta(hours=5, minutes=30))
lo = d.datetime.strptime(sys.argv[1].replace("x", "0"), "%Y-%m-%d %H:%M").replace(tzinfo=ist)
hi = lo + d.timedelta(minutes=9 if sys.argv[1].endswith("x") else 0); c = d.datetime.fromtimestamp(int(sys.argv[2]), ist)
m = max((lo - c).total_seconds(), (c - hi).total_seconds(), 0) / 60
if m > 30: print("STATE TIME: STATE.md says updated %s IST, but it was committed %s IST (%d min apart): read the time with TZ=Asia/Kolkata date, never guess" % (sys.argv[1], c.strftime("%Y-%m-%d %H:%M"), m))' "$u" "$c"); fi
  if [ -n "$msg" ]; then [ "$mine" = 1 ] && echo "$msg" >> "$out" || echo "WARN  ${msg#STATE TIME: } (already on ${STATE_TIME_BASE:-origin/main})"; fi
fi
cat "$out"; [ -s "$out" ] && exit 1; echo "docs OK"; exit 0
