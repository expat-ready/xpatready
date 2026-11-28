#!/usr/bin/env bash
# The Python form helpers (pypdf, cryptography, zxing-cpp) for the API's PY path, hash-pinned (P-82); cloud-setup.sh's
# step, a script of its own since LR-180 (qa #4083) so it can be tested. It never stops the set-up: when the venv cannot
# be made or pip refuses the lock (a python3 whose wheels the lock does not pin), it prints one WARNING that names the
# gap (the Python version, the lock and pip's own last line), removes the half-made venv so the next run tries again, and
# exits 0. The API's PDF and barcode helpers fail until the gap is closed; everything else in the session works.
# requirements-linux.lock pins the Linux wheels for CPython 3.11 to 3.14.
#   bash product/tools/python-helpers.sh <venv> <lock>        Env: PYTHON (default python3). Test: check-python-helpers.sh.
# US$0 (PyPI downloads only).
set -u
VENV="${1:?venv}"; LOCK="${2:?lock}"; PY="${PYTHON:-python3}"
gap() { echo "WARNING: the Python form helpers are not installed: $1 ($("$PY" -c 'import platform; print("Python", platform.python_version())' 2>/dev/null || echo "no $PY"); lock $LOCK). The API's PDF and barcode helpers fail until this is fixed; the rest of the set-up goes on." >&2
  rm -rf "$VENV"; exit 0; }
[ -f "$LOCK" ] || gap "the lock is missing"
if [ ! -x "$VENV/bin/python" ]; then
  mkdir -p "$(dirname "$VENV")"
  "$PY" -m venv "$VENV" 2>/dev/null || gap "$PY -m venv failed (python3-venv missing?)"
  out=$("$VENV/bin/pip" install -q --require-hashes --no-deps --only-binary :all: -r "$LOCK" 2>&1) ||
    gap "pip refused the lock: $(printf '%s\n' "$out" | grep -v '^\[notice\]' | grep -v '^ *$' | tail -1 | cut -c1-200)"
fi
"$VENV/bin/python" -c "import pypdf, cryptography, zxingcpp; print('pypdf', pypdf.__version__)" 2>/dev/null ||
  gap "the installed venv cannot import pypdf, cryptography and zxingcpp"
