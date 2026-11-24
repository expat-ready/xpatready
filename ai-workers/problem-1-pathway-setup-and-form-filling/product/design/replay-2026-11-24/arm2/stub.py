#!/usr/bin/env python3
"""A pretend reviewer for run_arm2.py selftest: no network. STUB_MODE file beside the work folder picks what it does."""
import json, os, subprocess, sys
assert sys.argv[1:] == ["review", "--headless", "--base-commit", "HEAD~1"], sys.argv
m = os.path.join(os.path.dirname(os.getcwd()), "STUB_MODE"); m = open(m).read().strip() if os.path.exists(m) else "ok"
n = subprocess.run(["git", "diff", "--name-only", "HEAD~1", "HEAD"], capture_output=True, text=True).stdout.split()
assert 1 <= len(n) <= 10
if m == "login": sys.stderr.write("Please login first: codeant login\n"); sys.exit(2)
if m == "fail": sys.stderr.write("internal error\n"); sys.exit(5)
if m == "notjson": print("hello"); sys.exit(0)
if m == "secret": sys.stderr.write("using ghp_abcdefghijklmnopqrstuvwxyz0123\n")
print(json.dumps({"suggestions": [{"file": n[0], "message": "pretend: the login token is compared with =="}]})); sys.exit(1)
