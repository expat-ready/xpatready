#!/usr/bin/env bash
# gh with a way round a broken TLS (founder, 6 Nov ~03:00 IST: "tools work when gh is broken"; P-363: on the Mac gh fails
# TLS verification, x509 OSStatus -26276, while curl with `gh auth token` works). Runs the real gh; when it fails on TLS,
# the same read is answered by gh-fallback.py through curl, with one line on stderr saying so. Other failures pass
# through unchanged. Tools use it as:  gh() { bash "$TOOLS/gh.sh" "$@"; }   Test: check-gh-fallback.sh.
err=$(mktemp "${TMPDIR:-/tmp}/gh.XXXXXXXX"); trap 'rm -f "$err"' EXIT
# LR-174 (rules/github-limits.md): READS of expat-ready/xpatready go out on the org App's installation token (15,000/h)
# when it is configured (app-token.sh: the key file at XR_APP_KEY_FILE; cached), else on the user token as before. The App
# is installed only on xpatready and an installation token has no /user, so everything else stays on the user token:
# anything that may write (comments, labels, merges, edits, any non-GET api call, a body without -X GET; the lead-read
# and label gates check who commented), GraphQL, search, api user, any other repository (-R, or a repos/<other> path).
# An App read refused with 401, 403 or 404 is asked again once on the user token. One line per call goes to the meter's
# calls log (github-meter.sh calls): time, calling script, first two arguments. Tests: check-app-token.sh, check-github-budget.sh.
GH_TOOLS="$(cd "$(dirname "$0")" && pwd)"; GH_APP_REPO="expat-ready/xpatready"
gh_is_read() {  # 0 when this gh call can only read, and only expat-ready/xpatready
  local a prev="" body=0 path=""
  case "${1:-} ${2:-}" in
    "pr view"|"pr list"|"pr checks"|"pr diff"|"pr status"|"run view"|"run list"|"issue view"|"issue list"|"release view"|"release list"|"workflow list"|"workflow view"|"label list") ;;
    "api graphql") return 1;; "api "*) ;; *) return 1;;
  esac
  shift
  for a in "$@"; do
    case "$prev" in -X|--method) [ "$a" = GET ] || [ "$a" = get ] || return 1;; -R|--repo) [ "$a" = "$GH_APP_REPO" ] || return 1;; esac
    case "$a" in -X?*|--method=*) case "$a" in -XGET|--method=GET) ;; *) return 1;; esac;;
      -R?*|--repo=*) [ "${a#-R}" = "$GH_APP_REPO" ] || [ "${a#--repo=}" = "$GH_APP_REPO" ] || return 1;;
      --input|--input=*) return 1;; -f|-F|--field|--raw-field|-f?*|-F?*|--field=*|--raw-field=*) body=1;;
      -*) ;; *) case "$prev" in -X|--method|-R|--repo|-f|-F|--field|--raw-field|-H|--header|-q|--jq|-t|--template|--cache|-p|--preview|--hostname) ;; *) [ -z "$path" ] && path="$a";; esac;; esac
    prev="$a"
  done
  if [ "$_gh_verb" = api ]; then
    case "${path#/}" in "repos/{owner}/{repo}"|"repos/{owner}/{repo}/"*|"repos/{owner}/{repo}?"*|"repos/$GH_APP_REPO"|"repos/$GH_APP_REPO/"*|"repos/$GH_APP_REPO?"*|rate_limit) ;; *) return 1;; esac
    [ "$body" = 0 ] || case " $* " in *" -X GET "*|*" --method GET "*|*" -XGET "*|*"--method=GET"*) ;; *) return 1;; esac
  fi
  return 0
}
[ -n "${GH_SH_INNER:-}" ] || {
mc="${GH_METER_CALLS:-${GITHUB_METER_DIR:-${TMPDIR:-/tmp}/xr-github-meter}/calls.tsv}"
if mkdir -p "$(dirname "$mc")" 2>/dev/null; then
  caller="${GH_METER_SCRIPT:-$(ps -o args= -p "$PPID" 2>/dev/null | tr ' ' '\n' | grep -m1 -E '\.(sh|py|mjs)$' | sed 's#.*/##')}"
  printf '%s\t%s\t%s\n' "$(date +%s)" "${caller:-unknown}" "${1:-} ${2:-}" | cut -c1-200 >> "$mc" 2>/dev/null
fi
}   # once per call: the App attempt and its user-token retry are the same call
_gh_verb="${1:-}"
if [ -z "${GH_SH_INNER:-}" ] && gh_is_read "$@" && [ "$(bash "$GH_TOOLS/app-token.sh" kind)" = app ] && t=$(bash "$GH_TOOLS/app-token.sh" 2>/dev/null) && [ -n "$t" ]; then
  err2=$(mktemp "${TMPDIR:-/tmp}/gh.XXXXXXXX"); trap 'rm -f "$err" "$err2"' EXIT
  out=$(GH_TOKEN="$t" GH_SH_INNER=1 bash "$0" "$@" 2>"$err2"); rc=$?
  if [ "$rc" = 0 ] || ! grep -qE 'HTTP 40[134]|Bad credentials|Resource not accessible|Not Found' "$err2"; then
    [ -n "$out" ] && printf '%s\n' "$out"; cat "$err2" >&2; exit "$rc"; fi
  # refused on the App token: the same read once more on the user token (below, unchanged GH_TOKEN)
fi; unset t
# A run that met a TLS failure once (its flag file exists) does not try gh again: every later read goes straight to curl.
[ -n "${GH_TLS_NOTE_ONCE:-}" ] && [ -e "$GH_TLS_NOTE_ONCE" ] && GH_FALLBACK=always
if [ "${GH_FALLBACK:-auto}" != always ]; then
  out=$(command gh "$@" 2>"$err"); rc=$?
  if [ "$rc" = 0 ] || ! grep -qiE 'x509|tls: |tls handshake|certificate (verify|signed by unknown|is not trusted|has expired)|OSStatus -?[0-9]+|SSL_ERROR|SSL certificate|ssl handshake' "$err"; then
    [ -n "$out" ] && printf '%s\n' "$out"; cat "$err" >&2; exit "$rc"
  fi
  # GH_TLS_NOTE_ONCE=<file> (lead-watch.sh sets one per run, ENF-761 part 5): the notice only while that file is missing,
  # then the file is made, so a run says it once instead of once per read (93 times on 20 Nov).
  if [ -z "${GH_TLS_NOTE_ONCE:-}" ] || [ ! -e "$GH_TLS_NOTE_ONCE" ]; then   # a flag that cannot be made: said every time
    [ -n "${GH_TLS_NOTE_ONCE:-}" ] && : > "$GH_TLS_NOTE_ONCE" 2>/dev/null
    echo "gh: TLS failed ($(head -1 "$err" | cut -c1-120)); answered through curl with gh auth token (P-363)${GH_TLS_NOTE_ONCE:+; said once per run}" >&2
  fi
fi
python3 -I "$(cd "$(dirname "$0")" && pwd)/gh-fallback.py" "$@"
