#!/usr/bin/env bash
# gh with a way round a broken TLS (founder, 6 Nov ~03:00 IST: "tools work when gh is broken"; P-363: on the Mac gh fails
# TLS verification, x509 OSStatus -26276, while curl with `gh auth token` works). Runs the real gh; when it fails on TLS,
# the same read is answered by gh-fallback.py through curl, with one line on stderr saying so. Other failures pass
# through unchanged. Tools use it as:  gh() { bash "$TOOLS/gh.sh" "$@"; }   Test: check-gh-fallback.sh.
err=$(mktemp "${TMPDIR:-/tmp}/gh.XXXXXXXX"); trap 'rm -f "$err"' EXIT
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
