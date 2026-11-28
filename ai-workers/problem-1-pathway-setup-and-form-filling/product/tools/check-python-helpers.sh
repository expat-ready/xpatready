#!/usr/bin/env bash
# LR-180 (qa #4083): cloud-setup.sh finishes on the cloud image. python-helpers.sh, run with a stub python3 whose venv's
# pip refuses or accepts the lock: a refusal is one WARNING that names the gap (Python version, lock, pip's last line),
# removes the half-made venv and exits 0; a working install prints the pypdf version. Then cloud-setup.sh calls it (no
# bare pip install left under its set -e), and requirements-linux.lock pins the cp311 wheels of cffi and zxing-cpp.
# Offline, US$0. With XR_NET_TESTS=1 and a python3.11 on the machine, it also installs the real lock on 3.11 (PyPI).
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
  printf '#!/usr/bin/env bash\nif [ "${FAKE_PIP:-ok}" = fail ]; then echo "ERROR: THESE PACKAGES DO NOT MATCH THE HASHES FROM THE REQUIREMENTS FILE."; echo "    cffi==2.0.0 from cffi-2.0.0-cp311-cp311-manylinux2014_x86_64.whl"; echo "[notice] A new release of pip is available"; exit 1; fi\ntouch "%s/installed"\n' "$3" > "$3/bin/pip"
  printf '#!/usr/bin/env bash\n[ -f "%s/installed" ] && echo "pypdf 6.19.0" || exit 1\n' "$3" > "$3/bin/python"
  chmod +x "$3/bin/pip" "$3/bin/python"; exit 0
fi
[ "$1" = -c ] && { echo "Python 3.11.9"; exit 0; }
exit 1
STUB
chmod +x "$T/python3"
run() { out=$(PYTHON="$T/python3" bash "$H" "$1" "$2" 2>&1); r=$?; }

touch "$T/lock"
FAKE_PIP=fail run "$T/v1" "$T/lock"
ok "H1: pip refusing the lock exits 0 (the set-up goes on)" "$([ $r = 0 ] && echo 1)" "exit $r: $out"
ok "H2: the WARNING names the gap: Python version, the lock and pip's own last line (not its [notice])" \
  "$(echo "$out" | grep -q '^WARNING: the Python form helpers are not installed: pip refused the lock: .*cffi==2.0.0.*Python 3.11.9; lock '"$T"'/lock' && ! echo "$out" | grep -q notice && echo 1)" "$out"
ok "H3: the half-made venv is removed, so the next run tries again" "$([ ! -e "$T/v1" ] && echo 1)" "$(ls "$T")"
run "$T/v2" "$T/lock"
ok "H4: a working install prints the pypdf version and exits 0, no WARNING" "$([ $r = 0 ] && [ "$out" = "pypdf 6.19.0" ] && echo 1)" "exit $r: $out"
run "$T/v2" "$T/lock"
ok "H5: run again over the venv it made: nothing reinstalled, the version again" "$([ $r = 0 ] && [ "$out" = "pypdf 6.19.0" ] && echo 1)" "exit $r: $out"
run "$T/v3" "$T/missing.lock"
ok "H6: a missing lock is a named gap, exit 0" "$([ $r = 0 ] && echo "$out" | grep -q 'not installed: the lock is missing' && echo 1)" "exit $r: $out"
FAKE_VENV=fail run "$T/v4" "$T/lock"
ok "H7: no venv module is a named gap, exit 0" "$([ $r = 0 ] && echo "$out" | grep -q 'venv failed' && echo 1)" "exit $r: $out"
mkdir -p "$T/v5/bin"; printf '#!/usr/bin/env bash\nexit 1\n' > "$T/v5/bin/python"; chmod +x "$T/v5/bin/python"
run "$T/v5" "$T/lock"
ok "H8: an old venv that cannot import the helpers is a named gap and is removed" "$([ $r = 0 ] && echo "$out" | grep -q 'cannot import' && [ ! -e "$T/v5" ] && echo 1)" "exit $r: $out"

CS="$TOOLS/cloud-setup.sh"
ok "C1: cloud-setup.sh runs python-helpers.sh for the venv and lock" "$(grep -q 'bash "$P/product/tools/python-helpers.sh" "$VENV" "$LOCK"' "$CS" && echo 1)"
ok "C2: cloud-setup.sh has no pip install of its own left (under set -e it stopped the set-up)" "$(grep -q 'pip" install' "$CS" || echo 1)"

cffi=$(awk '/^cffi==/{f=1;next} /^[a-z]/{f=0} f' "$LOCK"); zx=$(awk '/^zxing-cpp==/{f=1;next} /^[a-z]/{f=0} f' "$LOCK")
ok "L1: the lock pins cffi's cp311 wheel (8941aaad…, PyPI) beside the cp312-cp314 ones" \
  "$(echo "$cffi" | grep -q 8941aaadaf67246224cee8c3803777eed332a19d909b47e29c9842ef1e79ac26 && [ "$(echo "$cffi" | grep -c hash=)" = 4 ] && echo 1)" "$cffi"
ok "L2: the lock pins zxing-cpp's cp311 wheel (8a5b32d7…) beside the cp312-abi3 one" \
  "$(echo "$zx" | grep -q 8a5b32d719a5448f1b2f474e04d2db6ce41cc6973fb5c705d47dbe899361e5f9 && [ "$(echo "$zx" | grep -c hash=)" = 2 ] && echo 1)" "$zx"

if [ "${XR_NET_TESTS:-}" = 1 ] && command -v python3.11 >/dev/null; then
  out=$(PYTHON=python3.11 bash "$H" "$T/real" "$LOCK" 2>&1); r=$?
  ok "N1: the real lock installs on Python 3.11 (PyPI)" "$([ $r = 0 ] && echo "$out" | grep -q '^pypdf ' && echo 1)" "exit $r: $out"
else echo "note  N1 not run (XR_NET_TESTS=1 and a python3.11 run it; it downloads from PyPI)"; fi
finish
