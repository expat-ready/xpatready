#!/bin/bash
# SessionStart hook (P-189): tell the session which copy it is in, its one command, and the one-page state.
# The session's own copy comes from the hook input (in lane sessions $CLAUDE_PROJECT_DIR is the main copy).
input=$(cat 2>/dev/null); cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
ROOT=$(git -C "${cwd:-.}" rev-parse --show-toplevel 2>/dev/null) || ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
PH="$ROOT/ai-workers/problem-1-pathway-setup-and-form-filling/product"
cd "$ROOT" || exit 0; LANE=$(bash "$PH/tools/lane.sh" whoami 2>/dev/null)
# P-87: the pre-push hook refuses pushes to main; switch it on in every copy (GitHub cannot lock main on this plan).
[ -n "$(git config core.hooksPath)" ] || git config core.hooksPath .githooks 2>/dev/null
# Pull at start (P-82): refresh origin and warn when this branch is behind; never fails the hook.
# A clean copy is fast-forwarded to its upstream here, so the founder never has to pull by hand (Mac or cloud).
behind=""
if ! timeout 15 git fetch -q origin 2>/dev/null; then
  behind="NOTE: GitHub could not be reached at session start: this copy may be behind. Run git fetch and pull before working (P-82)."
elif n=$(git rev-list --count HEAD..@{upstream} 2>/dev/null) && [ "$n" -gt 0 ]; then
  if [ -z "$(git status --porcelain --untracked-files=no 2>/dev/null)" ] && git merge -q --ff-only @{upstream} >/dev/null 2>&1; then
    behind="Pulled $n new commit(s) from GitHub at session start (P-82). Skills and hooks that changed take effect in the next session."
  else behind="NOTE: this branch is $n commit(s) behind GitHub and could not fast-forward (local changes or diverged): pull before working (P-82)."; fi
fi
# LR-156 (founder A433/A434, trunk-based development): the Lead copy runs live main and writes on a lead/<date> branch
# under 24 h. After the fetch, a lead/* copy whose records are all on main, or whose base is over 24 h old, is recut onto
# lead/<today IST> from origin/main; one that cannot be (unpushed work, changed files) gets a loud warning with the
# exact commands (lead-age.sh recut, never losing work). Then the copy's age line.
age=""
case "$LANE" in lead|lead-stale)
  age=$(case "$behind" in "NOTE: GitHub could not be reached"*) LEAD_FETCH_FAILED=1;; *) LEAD_FETCH_FAILED=;; esac; LEAD_FETCH_FAILED=$LEAD_FETCH_FAILED bash "$PH/tools/lead-age.sh" recut 2>/dev/null)
  LANE=$(bash "$PH/tools/lane.sh" whoami 2>/dev/null)
  age=$(printf '%s\n%s' "$age" "$(bash "$PH/tools/lead-age.sh" line 2>/dev/null)" | sed '/^$/d');;
esac
case "$LANE" in
  lead-stale) head="STALE LEAD COPY (LR-156): this lead branch is over 24 h old or over 200 commits behind origin/main and could not be recut; fix it before anything else (the command is below).";;
  lead) head="This is the tech lead's main copy (Mac). The founder types /lead here. Builders run /next <area> in their own copies; qa runs /qa. Way of working: product/WAY-OF-WORKING.md.";;
  screens|forms|evidence|runtime|qa) head="This is the $LANE builder's copy (branch $(git branch --show-current)). Command: /next $LANE (qa: /qa <mode>). Way of working: product/WAY-OF-WORKING.md; work list: product/BACKLOG.md.";;
  *) head="This copy is not bound yet: /next <area> (screens, forms, runtime, evidence) or /qa binds it. Way of working: product/WAY-OF-WORKING.md.";;
esac
ctx=$([ -n "$age" ] && { echo "$age"; echo; }; echo "$head"; [ -n "$behind" ] && { echo; echo "$behind"; }; echo; echo "--- product/STATE.md ---"; cat "$PH/STATE.md")
jq -n --arg c "$ctx" '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
