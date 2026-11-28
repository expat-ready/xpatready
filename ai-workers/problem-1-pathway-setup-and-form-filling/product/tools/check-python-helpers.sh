#!/usr/bin/env bash
# LR-180 (qa #4083): cloud-setup.sh finishes on the cloud image. python-helpers.sh, run with a stub python3 whose venv's
# pip refuses or accepts the lock (the stub prints pip's real hash-mismatch lines in pip's order): in a session a refusal
# is one WARNING that names the gap (Python version, lock, pip's reason), removes the half-made venv and exits 0; in CI
# (CI set) or with XR_HELPERS_STRICT=1 the same WARNING exits 1; a working install prints the pypdf version. Then
# cloud-setup.sh calls it (no bare pip install left under its set -e), and requirements-linux.lock pins the cp311 wheels
# of cffi and zxing-cpp. Offline, US$0. With XR_NET_TESTS=1 it also installs the real lock on each of python3.11, 3.12
# and 3.13 the machine has (PyPI).
#   bash product/tools/check-python-helpers.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
H="$TOOLS/python-helpers.sh"; LOCK="$TOOLS/../../prototype/env/requirements-linux.lock"
T=$(mktemp -d "${TMPDIR:-/tmp}/pyhelp.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "$T"' EXIT

# The stub: "python3 -m venv DIR" makes DIR/bin/pip (FAKE_PIP=fail refuses like pip's hash check) and DIR/bin/python.
cat > "$T/python3" <<'STUB'
#!/usr/bin/env bash
if [ "$1" = -m ] && [ "$2" = venv ]; then
  [ "${FAKE_VENV:-ok}" = fail ] && exit 1
  mkdir -p "$3/bin"
  printf '#!/usr/bin/env bash\necho x >> "%s/../pip-calls"\nif [ "${FAKE_PIP:-ok}" = fail ]; then echo "ERROR: THESE PACKAGES DO NOT MATCH THE HASHES FROM THE REQUIREMENTS FILE. If you have updated the package versions, please update the hashes."; echo "    cffi==2.0.0 from https://files.pythonhosted.org/packages/x/cffi-2.0.0-cp311-cp311-manylinux2014_x86_64.whl:"; echo "        Expected sha256 3e17ed538242334bf70832644a32a7aae3d83b57567f9fd60a26257e992b79ba"; echo "        Expected     or c8d3b5532fc71b7a77c09192b4a5a200ea992702734a2e9279a37f2478236f26"; echo "             Got        8941aaadaf67246224cee8c3803777eed332a19d909b47e29c9842ef1e79ac26"; echo ""; echo "[notice] A new release of pip is available: 26.2.2 -> 26.3"; exit 1; fi\ntouch "%s/installed"\n' "$3" "$3" > "$3/bin/pip"
  printf '#!/usr/bin/env bash\n[ -f "%s/installed" ] && echo "pypdf 6.19.0" || exit 1\n' "$3" > "$3/bin/python"
  chmod +x "$3/bin/pip" "$3/bin/python"; exit 0
fi
[ "$1" = -c ] && { echo "Python 3.11.9"; exit 0; }
exit 1
STUB
chmod +x "$T/python3"
run() { out=$(env -u CI -u XR_HELPERS_STRICT PYTHON="$T/python3" bash "$H" "$1" "$2" 2>&1); r=$?; }   # a session (GitHub sets CI)

touch "$T/lock"
FAKE_PIP=fail run "$T/v1" "$T/lock"
ok "H1: pip refusing the lock exits 0 (the set-up goes on)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
ok "H2: the WARNING names the gap: pip's DO NOT MATCH line, the package and the hash it got, the Python version and the lock (no [notice], no runs of spaces)" \
  "$(echo "$out" | grep -q '^WARNING: the Python form helpers are not installed: pip refused the lock: ERROR: THESE PACKAGES DO NOT MATCH.*;cffi==2.0.0 from .*;Got 8941aaad.*(Python 3.11.9; lock '"$T"'/lock).*the rest of the set-up goes on' && ! echo "$out" | grep -q -e notice -e '  ' && echo 1)" "$out"
ok "H3: the half-made venv is removed, so the next run tries again" "$([ ! -e "$T/v1" ] && echo 1)" "$(ls "$T")"
rm -f "$T/pip-calls"; run "$T/v2" "$T/lock"
ok "H4: a working install prints the pypdf version and exits 0, no WARNING" "$([ $r = 0 ] && [ "$out" = "pypdf 6.19.0" ] && echo 1)" "exit $r: $out"
run "$T/v2" "$T/lock"
ok "H5: run again over the venv it made: pip is not called again (one call in all), the version again" "$([ $r = 0 ] && [ "$out" = "pypdf 6.19.0" ] && [ "$(wc -l < "$T/pip-calls")" -eq 1 ] && echo 1)" "exit $r: $out; pip calls $(wc -l < "$T/pip-calls")"
run "$T/v2" "$T/missing.lock"
ok "H5b: a missing lock with a working venv keeps the venv (the lock is read only to make one)" "$([ $r = 0 ] && [ "$out" = "pypdf 6.19.0" ] && [ -x "$T/v2/bin/python" ] && echo 1)" "exit $r: $out"
run "$T/v3" "$T/missing.lock"
ok "H6: a missing lock is a named gap, exit 0" "$([ $r = 0 ] && echo "$out" | grep -q 'not installed: the lock is missing' && echo 1)" "exit $r: $out"
FAKE_VENV=fail run "$T/v4" "$T/lock"
ok "H7: no venv module is a named gap, exit 0" "$([ $r = 0 ] && echo "$out" | grep -q 'venv failed' && echo 1)" "exit $r: $out"
mkdir -p "$T/v5/bin"; printf '#!/usr/bin/env bash\nexit 1\n' > "$T/v5/bin/python"; chmod +x "$T/v5/bin/python"
run "$T/v5" "$T/lock"
ok "H8: an old venv that cannot import the helpers is a named gap and is removed" "$([ $r = 0 ] && echo "$out" | grep -q 'cannot import' && [ ! -e "$T/v5" ] && echo 1)" "exit $r: $out"

out=$(CI=true PYTHON="$T/python3" FAKE_PIP=fail bash "$H" "$T/v6" "$T/lock" 2>&1); r=$?
ok "H9: in CI (CI=true, as GitHub sets it) the same refusal is the WARNING and exit 1, the venv removed" "$([ $r = 1 ] && echo "$out" | grep -q 'pip refused the lock.*strict (CI or XR_HELPERS_STRICT=1): the set-up stops here' && [ ! -e "$T/v6" ] && echo 1)" "exit $r: $out"
out=$(env -u CI XR_HELPERS_STRICT=1 PYTHON="$T/python3" bash "$H" "$T/v7" "$T/missing.lock" 2>&1); r=$?
ok "H10: XR_HELPERS_STRICT=1 outside CI makes a gap exit 1 too" "$([ $r = 1 ] && echo "$out" | grep -q 'the lock is missing' && echo 1)" "exit $r: $out"
out=$(CI=true XR_HELPERS_STRICT=0 PYTHON="$T/python3" bash "$H" "$T/v8" "$T/missing.lock" 2>&1); r=$?
ok "H11: XR_HELPERS_STRICT=0 in CI keeps the session behaviour (exit 0)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"

CS="$TOOLS/cloud-setup.sh"
ok "C1: cloud-setup.sh runs python-helpers.sh for the venv and lock" "$(grep -q 'bash "$P/product/tools/python-helpers.sh" "$VENV" "$LOCK"' "$CS" && echo 1)"
ok "C2: cloud-setup.sh has no pip install of its own left (under set -e it stopped the set-up)" "$(grep -q 'pip" install' "$CS" || echo 1)"

if [ -f "$LOCK" ]; then   # a guards.d mutation copy holds product/tools only: there the lock rows are not read
  cffi=$(awk '/^cffi==/{f=1;next} /^[a-z]/{f=0} f' "$LOCK"); zx=$(awk '/^zxing-cpp==/{f=1;next} /^[a-z]/{f=0} f' "$LOCK")
  ok "L1: the lock pins cffi's cp311 wheel (8941aaad…, PyPI) beside the cp312-cp314 ones" \
    "$(echo "$cffi" | grep -q 8941aaadaf67246224cee8c3803777eed332a19d909b47e29c9842ef1e79ac26 && [ "$(echo "$cffi" | grep -c hash=)" = 4 ] && echo 1)" "$cffi"
  ok "L2: the lock pins zxing-cpp's cp311 wheel (8a5b32d7…) beside the cp312-abi3 one" \
    "$(echo "$zx" | grep -q 8a5b32d719a5448f1b2f474e04d2db6ce41cc6973fb5c705d47dbe899361e5f9 && [ "$(echo "$zx" | grep -c hash=)" = 2 ] && echo 1)" "$zx"
else echo "note  L1, L2 not run: no lock at $LOCK (a check-guards.sh copy of product/tools)"; fi

if [ "${XR_NET_TESTS:-}" = 1 ]; then
  for v in 3.11 3.12 3.13; do
    command -v "python$v" >/dev/null || { echo "note  N1 $v: no python$v on this machine"; continue; }
    out=$(env -u CI PYTHON="python$v" bash "$H" "$T/real$v" "$LOCK" 2>&1); r=$?
    ok "N1 $v: the real lock installs and imports on Python $v (PyPI)" "$([ $r = 0 ] && echo "$out" | grep -q '^pypdf ' && echo 1)" "exit $r: $out"
  done
else echo "note  N1 not run (XR_NET_TESTS=1 runs it on each python3.11, 3.12 and 3.13 the machine has; it downloads from PyPI). In CI the runner's own python3 is proved by cloud-setup.sh, strict there (H9)"; fi
finish
