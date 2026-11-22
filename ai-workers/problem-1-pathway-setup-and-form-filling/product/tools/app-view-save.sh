#!/bin/bash
# Saves the app view (B197 (2), founder A110, 16 Nov): app-view.js's text from stdin, with the IST time, to
# product/state/app-view-latest.txt (gitignored, one per copy). lead-watch.sh (app-view-check.sh) reads its age and its
# FLAG lines; lead-check-guard.sh will not let a check turn end while it is over 15 min old (P-798).
# Save through "lead-watch.sh app-view-read", which refuses a summary with no rows=N.
#   bash product/tools/app-view-save.sh <<'EOF'   (the page's answer)   EOF
# Refused: empty input, or text that is not app-view.js's (first line "app view ..." or "UNREADABLE ..."): a check that
# could not read the page saves the UNREADABLE line, so the record says so instead of a silent pass.
# Env (tests): APP_VIEW_FILE, NOW (epoch seconds). Test: check-app-view.sh.
TOOLS="$(cd "$(dirname "$0")" && pwd)"
f="${APP_VIEW_FILE:-$TOOLS/../state/app-view-latest.txt}"; now="${NOW:-$(date +%s)}"
body=$(tr -d '\r' | sed -e '/./,$!d')   # drop leading blank lines
first=$(printf '%s\n' "$body" | head -1)
case "$first" in
  "app view "*|UNREADABLE*) ;;
  *) echo "refused: not app-view.js's output (first line: ${first:-empty}); run tools/app-view.js in the browser and paste its answer" >&2; exit 2;;
esac
ist=$(TZ=Asia/Kolkata date -d "@$now" '+%d %b %H:%M IST' 2>/dev/null || TZ=Asia/Kolkata date -r "$now" '+%d %b %H:%M IST')
mkdir -p "$(dirname "$f")" && printf 'saved %s epoch %s\n%s\n' "$ist" "$now" "$body" > "$f.$$" && mv -f "$f.$$" "$f"
echo "saved $(printf '%s\n' "$body" | grep -c '^FLAG') flagged of $(printf '%s\n' "$body" | grep -cE '^(FLAG|ok) ') sessions at $ist to $f"
