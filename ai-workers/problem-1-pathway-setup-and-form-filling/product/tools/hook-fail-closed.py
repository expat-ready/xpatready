"""The fail-closed hook runner (bundle A1, LR-046), started by hook-fail-closed.sh; see that file for the rules.

  python3 -I hook-fail-closed.py <tools dir> <seconds> <guard> [args...]   (hook input on stdin)

Exit 0 with the guard's one JSON object (or nothing), or exit 2 with the reason on stderr: never anything else. No shell
background jobs or traps (round 2 of #3971: a watchdog subshell killed early ran the parent's EXIT trap and deleted the
input; about 2% of denies came back empty): the input is read with select under a 5 s deadline, the guard runs in its own
session from temporary files, and its whole process group is killed at the limit and again once it has answered.
"""
import json
import os
import select
import signal
import subprocess
import sys
import tempfile
import time

TOOLS = sys.argv[1] if len(sys.argv) > 1 else "?"
ARGS = sys.argv[2:]


def refuse(why):
    sys.stderr.write(f"Blocked (hooks fail closed, LR-046): {why}. Fix the hook: "
                     f"bash {TOOLS}/hook-fail-closed.sh {' '.join(ARGS[:2]) or '<seconds> <guard>'}\n")
    sys.exit(2)


def one_object(raw):
    try:
        return isinstance(json.loads(raw), dict)   # two values raise "Extra data"; null, a list or a number are not one
    except (ValueError, UnicodeDecodeError):
        return False


def read_input(deadline=5.0):
    try:
        os.fstat(0)
    except OSError:
        refuse("no hook input (stdin is closed)")
    data = []
    end = time.monotonic() + deadline
    while True:
        left = end - time.monotonic()
        if left <= 0:
            refuse(f"no hook input within {deadline:g} s")
        try:
            ready, _, _ = select.select([0], [], [], left)
        except (OSError, ValueError) as e:
            refuse(f"the hook input could not be read ({e})")
        if not ready:
            refuse(f"no hook input within {deadline:g} s")
        try:
            chunk = os.read(0, 1 << 20)
        except OSError as e:
            refuse(f"the hook input could not be read ({e.strerror})")
        if not chunk:
            return b"".join(data)
        data.append(chunk)


def killpg(pid, sig):
    try:
        os.killpg(pid, sig)
    except (ProcessLookupError, PermissionError):
        pass


def main():
    if len(ARGS) < 2 or not ARGS[0].isdigit():
        refuse(f"the wrapper needs <seconds> <guard>, got '{' '.join(ARGS)}'")
    limit, guard, rest = int(ARGS[0]), ARGS[1], ARGS[2:]
    if not guard or "/" in guard or guard.startswith(".."):
        refuse(f"guard '{guard}' must be a file name in {TOOLS}")
    raw = read_input()
    if not one_object(raw):
        refuse(f"the hook input is empty or not one JSON object ({len(raw)} bytes read)")
    path = os.path.join(TOOLS, guard)
    if not os.path.isfile(path):
        refuse(f"guard {guard} is missing")
    cmd = ([sys.executable, "-I", path] if guard.endswith(".py") else ["bash", path]) + rest
    with tempfile.TemporaryFile() as fin, tempfile.TemporaryFile() as fout, tempfile.TemporaryFile() as ferr:
        fin.write(raw)
        fin.seek(0)
        p = subprocess.Popen(cmd, stdin=fin, stdout=fout, stderr=ferr, start_new_session=True)
        try:
            rc = p.wait(timeout=limit)
        except subprocess.TimeoutExpired:
            killpg(p.pid, signal.SIGTERM)
            try:
                p.wait(timeout=1)
            except subprocess.TimeoutExpired:
                pass
            killpg(p.pid, signal.SIGKILL)
            p.wait()
            refuse(f"guard {guard} timed out after {limit} s (an outage, not a refusal: the guard did not answer)")
        killpg(p.pid, signal.SIGKILL)   # a child the guard left behind writes nothing after the answer is read
        fout.seek(0)
        ferr.seek(0)
        out, err = fout.read(), ferr.read()
    if rc == 0:
        if out.strip() and not one_object(out):
            refuse(f"guard {guard} printed output that is not one JSON object: "
                   f"{out[:200].decode('utf-8', 'replace')!r}")
        sys.stdout.buffer.write(out)
        sys.stderr.buffer.write(err)
        sys.exit(0)
    if rc == 2:
        sys.stdout.buffer.write(out)
        sys.stderr.buffer.write(err)
        sys.exit(2)
    tail = err[:600].decode("utf-8", "replace").replace("\n", " ").strip()
    refuse(f"guard {guard} failed with exit {rc if rc >= 0 else 'signal ' + str(-rc)}{': ' + tail if tail else ''}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except BaseException as e:   # the runner's own crash blocks too
        refuse(f"the wrapper itself failed ({type(e).__name__}: {e})")
