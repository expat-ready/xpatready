#!/usr/bin/env bash
# LR-174 (Lead 13, 28 Nov): app-token.sh mints the org App's installation token with an RS256 JWT signed by openssl,
# caches it (mode 600) until 5 min before expiry, refuses a key inside a repository and never prints the key; gh.sh and
# github-meter.sh use it when XR_APP_ID, XR_APP_INSTALLATION_ID and XR_APP_KEY_FILE are set, and the user token when not.
# A throwaway RSA key made by openssl in a temp dir; a stand-in curl plays GitHub (it checks the JWT's signature with the
# public half). No network, US$0.   bash product/tools/check-app-token.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
command -v openssl >/dev/null && command -v python3 >/dev/null || { echo "openssl or python3 is missing; nothing was checked"; exit 2; }
T=$(mktemp -d "${TMPDIR:-/tmp}/apptok.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/keys" "$T/tmp" "$T/meter"
openssl genrsa -out "$T/keys/app.pem" 2048 2>/dev/null && openssl rsa -in "$T/keys/app.pem" -pubout -out "$T/keys/pub.pem" 2>/dev/null \
  || { echo "openssl could not make a throwaway key; nothing was checked"; exit 2; }
KEYLINE=$(sed -n 2p "$T/keys/app.pem")   # a line of the key body: must never appear in any output
FAKE_APP="ghs_FakeInstallation""0000000000000000000000"; FAKE_USER="gho_FakeUser""00000000000000000000000000000000"
cat > "$T/bin/curl" <<'EOF'
#!/bin/bash
# stand-in GitHub: POST .../app/installations/<id>/access_tokens checks the JWT; GET /rate_limit answers headers.
echo "argv: $*" >> "$FX/argv.log"; m=GET; u=""; d=""; hin=""
while [ $# -gt 0 ]; do case "$1" in -X) m=$2; shift;; -D) d=$2; shift;; -o) shift;; -H) [ "$2" = @- ] && hin=$(cat); shift;; http*) u=$1;; esac; shift; done
auth=$(sed -n 's/^Authorization: Bearer //p' <<<"$hin")
case "$m $u" in
  "POST "*/app/installations/*/access_tokens)
    echo "mint $u" >> "$FX/calls.log"
    [ "${FAKE_MODE:-ok}" = bad ] && { echo '{"message":"A JSON web token could not be decoded"}'; exit 0; }
    jwt=$auth; h=${jwt%%.*}; rest=${jwt#*.}; p=${rest%%.*}; s=${rest#*.}
    python3 -I -c 'import base64,sys; x=sys.argv[1]; sys.stdout.buffer.write(base64.urlsafe_b64decode(x+"="*(-len(x)%4)))' "$s" > "$FX/sig.bin"
    if printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -verify "$FX/keys/pub.pem" -signature "$FX/sig.bin" >/dev/null 2>&1; then echo "sig ok" >> "$FX/calls.log"; else echo "sig BAD" >> "$FX/calls.log"; fi
    python3 -I -c 'import base64,sys,json; x=sys.argv[1]; print(base64.urlsafe_b64decode(x+"="*(-len(x)%4)).decode())' "$h" >> "$FX/claims.log"
    python3 -I -c 'import base64,sys,json; x=sys.argv[1]; print(base64.urlsafe_b64decode(x+"="*(-len(x)%4)).decode())' "$p" >> "$FX/claims.log"
    printf '{"token":"%s","expires_at":"%s","permissions":{}}\n' "$FAKE_TOK" "${FAKE_EXP:-2099-01-01T00:00:00Z}";;
  "GET "*/rate_limit)
    echo "rate $auth" >> "$FX/calls.log"
    h=$(printf 'HTTP/2 200\r\nx-ratelimit-limit: %s\r\nx-ratelimit-used: 10\r\nx-ratelimit-remaining: %s\r\nx-ratelimit-reset: 1800000000\r\n\r\n' \
      "$(case "$auth" in ghs_*) echo 15000;; *) echo 5000;; esac)" "$(case "$auth" in ghs_*) echo 14990;; *) echo 4990;; esac)")
    if [ "$d" = - ]; then printf '%s' "$h"; else printf '%s' "$h" > "$d"; fi;;
  *) echo "unexpected $m $u" >> "$FX/calls.log"; exit 22;;
esac
EOF
printf '#!/bin/sh\n[ "$1 $2" = "auth token" ] && { echo "%s"; exit 0; }\necho "gh saw ${GH_TOKEN:-none}" >> "$FX/gh.log"; echo "[]"\n' "$FAKE_USER" > "$T/bin/gh"
chmod +x "$T/bin/curl" "$T/bin/gh"
export FX="$T" FAKE_TOK="$FAKE_APP" XR_GITHUB_API="https://stand-in.invalid" GITHUB_METER_DIR="$T/meter" GH_METER_CALLS="$T/meter/calls.tsv"
A=(XR_APP=on XR_APP_ID=123456 XR_APP_INSTALLATION_ID=98765 XR_APP_KEY_FILE="$T/keys/app.pem")
export HOME="$T/home"; mkdir -p "$HOME"   # the default key path (~/.config/expat-ready/lead-app.pem) is empty here
at() { out=$(cd "$T" && env PATH="$T/bin:$PATH" TMPDIR="$T/tmp" "$@" bash "$TOOLS/app-token.sh" 2>&1); r=$?; printf '%s\n' "$out" >> "$T/all-out.log"; }
mints() { grep -c '^mint ' "$T/calls.log" 2>/dev/null || echo 0; }

at env -u XR_APP_ID -u XR_APP_INSTALLATION_ID -u XR_APP_KEY_FILE XR_APP=on; ok "no key file at the default path: exit 3, no request (fall back to the user token)" "$([ $r = 3 ] && [ "$(mints)" = 0 ] && echo 1)" "exit $r: $out"
k=$(env -u XR_APP_KEY_FILE XR_APP=on bash "$TOOLS/app-token.sh" kind); ok "kind: no key file says user" "$([ "$k" = user ] && echo 1)" "$k"
k=$(env "${A[@]}" bash "$TOOLS/app-token.sh" kind); ok "kind: a key file says app" "$([ "$k" = app ] && echo 1)" "$k"
k=$(env "${A[@]}" XR_APP=off bash "$TOOLS/app-token.sh" kind); ok "kind: XR_APP=off says user even with a key" "$([ "$k" = user ] && echo 1)" "$k"
mkdir -p "$HOME/.config/expat-ready" && cp "$T/keys/app.pem" "$HOME/.config/expat-ready/lead-app.pem"
at env -u XR_APP_ID -u XR_APP_INSTALLATION_ID -u XR_APP_KEY_FILE XR_APP=on; ok "defaults: the App 5964540, installation 186772580, key at ~/.config/expat-ready/lead-app.pem" "$([ $r = 0 ] && grep -q 'app/installations/186772580/access_tokens' "$T/argv.log" && grep -q '"iss":"5964540"' "$T/claims.log" && echo 1)" "exit $r: $out $(cat "$T/claims.log")"
rm -rf "$HOME/.config" "$T/tmp/"xr-app-token.* "$T/claims.log" "$T/calls.log"

at env "${A[@]}"; ok "configured: prints the installation token, exit 0" "$([ $r = 0 ] && [ "$out" = "$FAKE_APP" ] && echo 1)" "exit $r: $out"
ok "the stand-in verified the RS256 signature with the key's public half" "$(grep -qx 'sig ok' "$T/calls.log" && ! grep -q 'sig BAD' "$T/calls.log" && echo 1)" "$(cat "$T/calls.log")"
ok "the JWT says alg RS256, iss = XR_APP_ID, lives at most 10 min" "$(python3 -I -c '
import json,sys; L=[json.loads(l) for l in open(sys.argv[1])]; h,p=L[0],L[1]
sys.exit(0 if h["alg"]=="RS256" and p["iss"]=="123456" and 0 < p["exp"]-p["iat"] <= 600 else 1)' "$T/claims.log" && echo 1)" "$(cat "$T/claims.log")"
ok "the JWT is sent on stdin, never on curl's command line" "$(! grep -q 'Bearer' "$T/argv.log" && grep -q 'app/installations/98765/access_tokens' "$T/argv.log" && echo 1)" "$(cat "$T/argv.log")"
C="$T/tmp/xr-app-token.98765"
ok "the token is cached in TMPDIR with mode 600" "$([ -f "$C" ] && [ "$(stat -c %a "$C" 2>/dev/null || stat -f %Lp "$C")" = 600 ] && echo 1)" "$(ls -l "$C" 2>&1)"
at env "${A[@]}"; ok "a second call uses the cache: no new request" "$([ $r = 0 ] && [ "$out" = "$FAKE_APP" ] && [ "$(mints)" = 1 ] && echo 1)" "mints $(mints): $out"
exp=$(cut -d' ' -f1 "$C")
at env NOW=$((exp - 301)) "${A[@]}"; ok "301 s before expiry: still the cache" "$([ $r = 0 ] && [ "$(mints)" = 1 ] && echo 1)" "mints $(mints)"
at env NOW=$((exp - 299)) "${A[@]}"; ok "under 5 min before expiry: a fresh token is minted" "$([ $r = 0 ] && [ "$(mints)" = 2 ] && echo 1)" "mints $(mints)"

rm -f "$C"; at env FAKE_MODE=bad "${A[@]}"; ok "GitHub refuses the JWT: exit 2, its message said, nothing cached" "$([ $r = 2 ] && grep -q 'could not be decoded' <<<"$out" && [ ! -e "$C" ] && echo 1)" "exit $r: $out"
m0=$(mints); mkdir -p "$T/repo" && git -C "$T/repo" init -q && cp "$T/keys/app.pem" "$T/repo/app.pem"
out=$(cd "$T/repo" && env XR_APP=on PATH="$T/bin:$PATH" TMPDIR="$T/tmp" XR_APP_ID=123456 XR_APP_INSTALLATION_ID=98765 XR_APP_KEY_FILE="$T/repo/app.pem" bash "$TOOLS/app-token.sh" 2>&1); r=$?; printf '%s\n' "$out" >> "$T/all-out.log"
ok "a key inside a repository is refused (exit 2), no request" "$([ $r = 2 ] && grep -q 'inside the repository' <<<"$out" && [ "$(mints)" = "$m0" ] && echo 1)" "exit $r: $out"
at env XR_APP=on XR_APP_ID=12x XR_APP_INSTALLATION_ID=98765 XR_APP_KEY_FILE="$T/keys/app.pem"; ok "a non-numeric App id: exit 2" "$([ $r = 2 ] && echo 1)" "exit $r: $out"

# gh.sh and the meter: reads on the App token when configured, the user token when not; writes always on the user token.
rm -f "$C"
ghs() { (cd "$T" && env PATH="$T/bin:$PATH" TMPDIR="$T/tmp" GH_TOKEN="$FAKE_USER" "$@" >/dev/null 2>&1); tail -1 "$T/gh.log" | sed 's/^gh saw //'; }
[ "$(ghs "${A[@]}" bash "$TOOLS/gh.sh" api repos/o/r/pulls)" = "$FAKE_APP" ]; r1=$?
[ "$(ghs XR_APP=off bash "$TOOLS/gh.sh" api repos/o/r/pulls)" = "$FAKE_USER" ]; r2=$?
ok "gh.sh: a read goes on the App token when configured, the user token when not" "$([ $r1 = 0 ] && [ $r2 = 0 ] && echo 1)" "$(cat "$T/gh.log" 2>&1)"
for c in "pr view 5" "pr list" "api graphql -f query={viewer{login}}" "api -X GET search/issues -f q=x" "run list"; do
  # shellcheck disable=SC2086
  got=$(ghs "${A[@]}" bash "$TOOLS/gh.sh" $c); ok "gh.sh read on the App token: gh $c" "$([ "$got" = "$FAKE_APP" ] && echo 1)" "$got"; done
for c in "pr comment 5 --body Reviewer" "pr edit 5 --add-label review" "pr merge 5" "issue comment 5 --body x" "api -X POST repos/o/r/issues/5/comments" "api --method PATCH repos/o/r/pulls/5" "api repos/o/r/issues/5/labels -f labels[]=x" "api graphql -f query=mutation{x}" "api repos/o/r/pulls --input body.json" "label create x"; do
  # shellcheck disable=SC2086
  got=$(ghs "${A[@]}" bash "$TOOLS/gh.sh" $c); ok "gh.sh write stays on the user token (the gates check the commenter): gh $c" "$([ "$got" = "$FAKE_USER" ] && echo 1)" "$got"; done
ok "gh.sh logs one line per call for the meter" "$([ "$(grep -c 'api repos/o/r/pulls' "$T/meter/calls.tsv" 2>/dev/null)" -ge 2 ] && [ "$(grep -c 'pr comment' "$T/meter/calls.tsv")" = 1 ] && echo 1)" "$(cat "$T/meter/calls.tsv" 2>&1)"
top=$(cd "$T" && env PATH="$T/bin:$PATH" TMPDIR="$T/tmp" GH_TOKEN="$FAKE_USER" "${A[@]}" bash "$TOOLS/github-meter.sh" top 2>&1); printf '%s\n' "$top" >> "$T/all-out.log"
ok "meter top line with the App: installation kind, 15000/h, 'org App token in use (reads)', the user token's remaining for writes" "$(grep -q 'org App installation (ghs_) · limit 15000/h · used 10 · remaining 14990' <<<"$top" && grep -q 'org App token in use (reads) · user token (writes) remaining 4990 of 5000' <<<"$top" && echo 1)" "$top"
top=$(cd "$T" && env XR_APP=off PATH="$T/bin:$PATH" TMPDIR="$T/tmp" GH_TOKEN="$FAKE_USER" bash "$TOOLS/github-meter.sh" top 2>&1); printf '%s\n' "$top" >> "$T/all-out.log"
ok "meter top line without: user OAuth (gho_), 5000/h, 'org App token not in use'" "$(grep -q 'user OAuth (gho_, gh CLI) · limit 5000/h' <<<"$top" && grep -q 'org App token not in use' <<<"$top" && echo 1)" "$top"
rm -f "$C"; top=$(cd "$T" && env PATH="$T/bin:$PATH" TMPDIR="$T/tmp" GH_TOKEN="$FAKE_USER" FAKE_MODE=bad "${A[@]}" bash "$TOOLS/github-meter.sh" top 2>&1); printf '%s\n' "$top" >> "$T/all-out.log"
ok "App set but minting fails: the user token is used and the top line says so" "$(grep -q 'user OAuth' <<<"$top" && grep -q 'org App token set but failed' <<<"$top" && echo 1)" "$top"
ok "the key never appears in any output" "$(! grep -qF -- "$KEYLINE" "$T/all-out.log" && ! grep -q 'PRIVATE' "$T/all-out.log" && echo 1)" "key text found in output"
finish
