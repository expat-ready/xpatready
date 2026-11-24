#!/usr/bin/env python3
"""A pretend reviewer for `arm2.py selftest`: no network. STUB_MODE beside the results picks what it does."""
import json, os, subprocess, sys, time
a = sys.argv[1:]
assert a[:5] == ["review", "--headless", "--base-commit", "HEAD~1", "--include"] and a[6:] == ["--max-files", "10"], a
files = a[5].split(",")
w = os.path.dirname(os.getcwd()); m = os.path.join(w, "STUB_MODE"); m = open(m).read().strip() if os.path.exists(m) else "ok"
got = subprocess.run(["git", "diff", "--name-only", "--no-renames", "HEAD~1"], capture_output=True, text=True).stdout.split()
assert sorted(got) == sorted(files), (got, files)
assert subprocess.run(["git", "log", "--all", "--oneline"], capture_output=True, text=True).stdout.count("\n") == 2
P = lambda s: print(s, file=sys.stderr)
P(f"[progress] Reviewing {', '.join(files)} login token install...")
if m not in ("half", "login"): P(f"[progress] Done reviewing {', '.join(files[:5])}")
if len(files) > 5 and m != "login": P(f"[progress] Done reviewing {', '.join(files[5:])}")
P("[progress] 1 file have suggestions, running rejector...")
r = {"issues": [{"issue_content": "pretend: the login token is compared with ==", "relevant_file": files[0], "start_line": 1, "label": "x"}], "meta": {"reviewed_files": files, "total_changed": len(files), "skipped": [], "capped": False, "max_files": 10}, "error": None, "noFiles": False}
if m == "login": P("API Error: Access denied (403). Please run `codeant logout`"); r.update(issues=[], meta=None, error="Access denied (403). Please run `codeant login`")
if m == "batch": P(f"[error] Failed to review {files[0]}: HTTP error 500")
if m == "batchtoken": P(f"[error] Failed to review {files[0]}: token expired")
if m == "skip": r["meta"]["reviewed_files"] = files[1:]; r["meta"]["skipped"] = [{"file": files[0], "reason": "too large"}]
if m == "secret": P("using ghp_abcdefghijklmnopqrstuvwxyz0123")
if m == "bearer": r["issues"][0]["issue_content"] = "sends the Bearer token"; r["issues"].append({"issue_content": "the x-api-key: header; apiKey: undefined", "relevant_file": files[0], "start_line": 2, "label": "forbidden"})
if m == "size": P(f"[error] Failed to review {files[0]}: prompt is too long: 210000 tokens > 200000 maximum")
if m == "paysize": P("[error] Failed: PR too large for your plan. Upgrade your plan")
if m == "planner": P("[warning] Risk planner failed; continuing without hypotheses: x")
if m == "quota": P("API Error: monthly allowance exceeded for this workspace")
if m == "slow": time.sleep(60)
if m == "notjson": print("hello"); sys.exit(0)
print(json.dumps(r)); sys.exit(1 if r["error"] else 0)
