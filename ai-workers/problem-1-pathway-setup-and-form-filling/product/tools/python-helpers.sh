#!/usr/bin/env bash
# The Python form helpers (pypdf, cryptography, zxing-cpp) for the API's PY path, hash-pinned (P-82); cloud-setup.sh's
# step, a script of its own since LR-180 (qa #4083) so it can be tested. In a session it never stops the set-up: when the
# venv cannot be made or pip refuses the lock (a python3 whose wheels the lock does not pin), it prints one WARNING that
# names the gap (the Python version, the lock and pip's own reason), removes the half-made venv so the next run tries
# again, and exits 0. The API's PDF and barcode helpers fail until the gap is closed; everything else in the session works.
# In CI (CI set, as GitHub sets it) or with XR_HELPERS_STRICT=1 the same WARNING ends in exit 1 instead (review of #4101,
# Important 1): CI's tests call the venv's python, so its set-up step fails there with the reason, never later.
# requirements-linux.lock pins the Linux wheels for CPython 3.11 to 3.14.
#   bash product/tools/python-helpers.sh <venv> <lock>        Env: PYTHON (default python3). Test: check-python-helpers.sh.
# US$0 (PyPI downloads only).
set -u
VENV="${1:?venv}"; LOCK="${2:?lock}"; PY="${PYTHON:-python3}"
STRICT="${XR_HELPERS_STRICT:-}"; [ -z "$STRICT" ] && [ -n "${CI:-}" ] && STRICT=1
gap() { local tail="the rest of the set-up goes on"; [ "$STRICT" = 1 ] && tail="strict (CI or XR_HELPERS_STRICT=1): the set-up stops here"
  echo "WARNING: the Python form helpers are not installed: $1 ($("$PY" -c 'import platform; print("Python", platform.python_version())' 2>/dev/null || echo "no $PY"); lock $LOCK). The API's PDF and barcode helpers fail until this is fixed; $tail." >&2
  rm -rf "$VENV"; [ "$STRICT" = 1 ] && exit 1; exit 0; }
if [ ! -x "$VENV/bin/python" ]; then
  [ -f "$LOCK" ] || gap "the lock is missing"   # only when a venv is to be made: a missing lock never deletes a working one
  mkdir -p "$(dirname "$VENV")"
  "$PY" -m venv "$VENV" 2>/dev/null || gap "$PY -m venv failed (python3-venv missing?)"
  # pip's own reason, without its [notice] lines: the ERROR line cut at its first sentence, the package line with the
  # wheel's file name only (no URL, no "(from -r ...)") and the hash it got, so "Got <hash>" fits under the 400 cap
  # (LR-184, review of #4101: the full ERROR sentence and URL pushed it out).
  out=$("$VENV/bin/pip" install -q --require-hashes --no-deps --only-binary :all: -r "$LOCK" 2>&1) ||
    gap "pip refused the lock: $(printf '%s\n' "$out" | grep -v '^\[notice\]' | grep -E '==|DO NOT MATCH|Got|ERROR' \
      | sed -E '/^ERROR:/s/\. .*$/./; s#https?://[^ ]*/##; s# \(from -r .*$##; s/:$//' | tr -s ' \t' ' ' | sed 's/^ //' \
      | tail -4 | paste -sd ';' - | cut -c1-400)"
fi
"$VENV/bin/python" -c "import pypdf, cryptography, zxingcpp; print('pypdf', pypdf.__version__)" 2>/dev/null ||
  gap "the installed venv cannot import pypdf, cryptography and zxingcpp"
