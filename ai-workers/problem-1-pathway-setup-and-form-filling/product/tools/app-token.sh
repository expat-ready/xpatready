#!/usr/bin/env bash
# LR-174 (founder A455; Lead 13, 28 Nov): the organization GitHub App "expat-ready-lead" (owned by expat-ready, installed
# only on xpatready) has 15,000 REST requests/hour on Enterprise Cloud; the Lead's user token (gho_) has 5,000 and ran
# out at 14:03 and again by 15:19 IST on 28 Nov. This mints the App's 1-hour installation token.
#   bash app-token.sh          prints the installation token (cached), exit 0; exit 3 when the App is not configured
#   bash app-token.sh kind     prints "app" when the key file is there (and XR_APP is not off), else "user"; no network
# Configured by three variables, each with the App's default (Lead 13, 28 Nov 15:4x IST: App ID and installation ID
# are not secret; the key stays on the Lead's Mac, mode 600): XR_APP_ID (5964540), XR_APP_INSTALLATION_ID (186772580) and
# XR_APP_KEY_FILE (~/.config/expat-ready/lead-app.pem, OUTSIDE the repository). The App is in use when the key file exists;
# XR_APP=off switches it off. The key is never read from inside the repository and never printed; the push guard
# refuses any .pem. The token is for READS and measures only: comments and labels stay on the founder's user token,
# because the lead-read and label gates check the commenter (gh.sh decides per call; rules/github-limits.md).
# The JWT is RS256, signed with openssl (no new package; STANDARDS §1). The token is cached in $TMPDIR with mode 600 and
# reused until 5 min before it expires. XR_GITHUB_API replaces https://api.github.com (the test's stand-in).
# gh.sh and github-meter.sh use it when it is configured, and the user token when not. Test: check-app-token.sh.
set -u
TOOLS="$(cd "$(dirname "$0")" && pwd)"
XR_APP_ID="${XR_APP_ID:-5964540}"; XR_APP_INSTALLATION_ID="${XR_APP_INSTALLATION_ID:-186772580}"
XR_APP_KEY_FILE="${XR_APP_KEY_FILE:-$HOME/.config/expat-ready/lead-app.pem}"
configured() { [ "${XR_APP:-on}" != off ] && [ -f "$XR_APP_KEY_FILE" ]; }
if [ "${1:-}" = kind ]; then configured && echo app || echo user; exit 0; fi
configured || { echo "app-token: not configured (no key file at XR_APP_KEY_FILE, or XR_APP=off); use the user token" >&2; exit 3; }
case "$XR_APP_ID$XR_APP_INSTALLATION_ID" in *[!0-9]*) echo "app-token: XR_APP_ID and XR_APP_INSTALLATION_ID must be numbers" >&2; exit 2;; esac
key="$XR_APP_KEY_FILE"
[ -f "$key" ] && [ -r "$key" ] || { echo "app-token: XR_APP_KEY_FILE is not a readable file" >&2; exit 2; }
# Never a key from inside the repository (this tools copy's, or the copy the caller stands in).
real=$(python3 -I -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$key")   # a symlink into the repository is caught too
for r in "$(git -C "$TOOLS" rev-parse --show-toplevel 2>/dev/null)" "$(git rev-parse --show-toplevel 2>/dev/null)"; do
  [ -n "$r" ] || continue; r=$(cd "$r" && pwd -P)
  case "$real" in "$r"/*) echo "app-token: refused: the key file is inside the repository ($r); keep it outside, e.g. ~/.config/expat-ready/lead-app.pem" >&2; exit 2;; esac
done
umask 077
cache="${TMPDIR:-/tmp}/xr-app-token.$XR_APP_INSTALLATION_ID"; now=${NOW:-$(date +%s)}
if [ -f "$cache" ] && [ ! -L "$cache" ] && [ -O "$cache" ]; then
  read -r exp tok < "$cache" 2>/dev/null || exp=""
  case "$exp" in ''|*[!0-9]*) ;; *) if [ -n "${tok:-}" ] && [ "$now" -lt $(( exp - 300 )) ]; then printf '%s\n' "$tok"; exit 0; fi;; esac
fi
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
hdr=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
pay=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' $((now - 60)) $((now + 540)) "$XR_APP_ID" | b64url)
sig=$(printf '%s.%s' "$hdr" "$pay" | openssl dgst -sha256 -sign "$key" 2>/dev/null | b64url)
[ -n "$sig" ] || { echo "app-token: openssl could not sign with the key file (not an RSA private key?)" >&2; exit 2; }
api="${XR_GITHUB_API:-https://api.github.com}"
# The JWT goes in on stdin (-H @-), never on the command line where ps would show it.
resp=$(printf 'Authorization: Bearer %s.%s.%s\nAccept: application/vnd.github+json\nX-GitHub-Api-Version: 2022-11-28\n' "$hdr" "$pay" "$sig" \
  | curl -sS --max-time 20 -X POST -H @- "$api/app/installations/$XR_APP_INSTALLATION_ID/access_tokens" 2>&1) \
  || { echo "app-token: the token request failed: $(head -c 200 <<<"$resp")" >&2; exit 2; }
line=$(python3 -I -c '
import json, sys, calendar, time
try:
    d = json.loads(sys.stdin.read()); t = d["token"]
    e = calendar.timegm(time.strptime(d["expires_at"], "%Y-%m-%dT%H:%M:%SZ"))
except Exception as x:
    print("bad", type(x).__name__, (str(d.get("message", "")) if isinstance(locals().get("d"), dict) else "")[:120]); sys.exit(0)
print(e, t)' <<<"$resp")
case "$line" in bad*|'') echo "app-token: GitHub gave no token (${line#bad })" >&2; exit 2;; esac
tmp=$(mktemp "${TMPDIR:-/tmp}/xr-app-token.XXXXXXXX") && printf '%s\n' "$line" > "$tmp" && chmod 600 "$tmp" && mv -f "$tmp" "$cache"
printf '%s\n' "${line#* }"
