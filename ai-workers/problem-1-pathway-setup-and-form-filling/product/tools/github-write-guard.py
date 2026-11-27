#!/usr/bin/env python3
"""One door for GitHub writes (LR-060, OS-58, full-power #165; P-384, P-387).

PreToolUse hook on Bash (through hook-fail-closed.sh). The deny lines in .claude/settings.json stop `gh` writes, but a
raw HTTP call to the GitHub API passed them (docs, permissions: "Rules are evaluated in order: deny, then ask, then
allow"; a curl line matches no gh rule). This guard refuses a command line that itself writes to the GitHub API:
  * curl, wget, httpie (http, https) or xh aimed at api.github.com, uploads.github.com or a github.com/api/ path, with a
    method other than GET or HEAD, or a body (curl -d/--data*/--json/-F/--form*/-T/--upload-file; wget --post-*,
    --body-*, --method);
  * `gh api` with a field or input (-f, -F, --field, --raw-field, --input: gh then sends a POST) and no -X GET;
  * inline python, node, ruby or perl code that names the GitHub API and a write method or body.
Commands inside `bash -c "..."`, `$(...)` and quotes are read too. The door: the reviewed scripts in product/tools
(lead-pr.sh, gh.sh and the like), run by name, keep their own writes; a line typed in a session does not.
Reads (GET) pass. A command line that cannot be split (an open quote) is judged on its whole text.
Test: check-github-write-guard.sh.
"""
import json
import re
import shlex
import sys

HOST = re.compile(r"(?:^|[/@.\s'\"])(?:api|uploads)\.github\.com\b|github\.com/api/|\bGH_TOKEN\b|\bGITHUB_TOKEN\b|gh auth token", re.I)
CLIENTS = {"curl", "wget", "http", "https", "xh"}
READ = {"GET", "HEAD"}
CURL_BODY_LONG = ("--data", "--json", "--form", "--upload-file")   # --data-raw, --data-binary, --form-string ...
WGET_BODY = ("--post-data", "--post-file", "--body-data", "--body-file")
SEP = {";", "&&", "||", "|", "&", "(", ")", "|&", "{", "}", "!"}
SUB = " __SUB__ ; "   # stands for $( <( >( and backticks: the command inside is judged as a command of its own
CODE = re.compile(r"\b(?:python3?|node|ruby|perl)\b")
CODE_WRITE = re.compile(r"method\s*[=:]\s*['\"]?(?:POST|PUT|PATCH|DELETE)|['\"](?:POST|PUT|PATCH|DELETE)['\"]|"
                        r"\.(?:post|put|patch|delete)\s*\(|->(?:post|put|patch|delete)\b|Net::HTTP::(?:Post|Put|Patch|Delete)|"
                        r"\bdata\s*=|\bbody\s*:", re.I)
INTERP = {"python", "python3", "node", "ruby", "perl"}
SHELLS = {"bash", "sh", "zsh", "dash"}


def split(text):
    lex = shlex.shlex(text, posix=True, punctuation_chars=";&|()")
    lex.whitespace_split = True
    lex.commenters = ""
    return list(lex)


def curl_write(args):
    get = any(a in ("-G", "--get") or re.match(r"^-[A-Za-z]*G[A-Za-z]*$", a) for a in args)   # -G: -d becomes the query
    i = 0
    while i < len(args):
        a = args[i]
        if a.startswith("--request"):
            m = a.split("=", 1)[1] if "=" in a else (args[i + 1] if i + 1 < len(args) else "")
            if m.upper() not in READ:
                return f"curl {a.split('=')[0]} {m}"
        elif a.startswith(CURL_BODY_LONG) and not get:
            return f"curl {a.split('=')[0]} (a body is a POST)"
        elif re.match(r"^-[A-Za-z]+", a) and not a.startswith("--"):
            flags = a[1:]
            for j, c in enumerate(flags):
                if c == "X":
                    m = flags[j + 1:].lstrip("=") or (args[i + 1] if i + 1 < len(args) else "")
                    if m.upper() not in READ:
                        return f"curl -X {m}"
                    break
                if c in "dF" and not get or c == "T":
                    return f"curl -{c} (a body is a POST)"
                if c in "HoAeuUrwbcKEmyYz":   # flags that take a value: the rest of the cluster is that value
                    break
        i += 1
    return ""


def wget_write(args):
    for i, a in enumerate(args):
        if a.startswith(WGET_BODY):
            return f"wget {a.split('=')[0]}"
        if a.startswith("--method"):
            m = a.split("=", 1)[1] if "=" in a else (args[i + 1] if i + 1 < len(args) else "")
            if m.upper() not in READ:
                return f"wget --method {m}"
    return ""


def httpie_write(args):
    for a in args:
        if a.upper() in {"POST", "PUT", "PATCH", "DELETE"}:
            return f"{a.upper()} request"
        if not a.startswith("-") and re.match(r"^[\w.\[\]-]+(?::=|=(?!=)|@)", a):   # name=value, name:=json, name@file; name==v is a query
            return "a request body"
    return ""


def gh_api_write(args):
    get = False
    field = ""
    for i, a in enumerate(args):
        nxt = args[i + 1] if i + 1 < len(args) else ""
        m = nxt if a in ("-X", "--method") else (re.match(r"^(?:-X=?|--method=)(\w+)$", a) or [None, None])[1]
        if m:
            if m.upper() not in READ:
                return f"gh api {a.split('=')[0]} {m}"
            get = True
        if re.match(r"^(-f|-F|--field|--raw-field|--input)(=|$)", a) or re.match(r"^-[fF].", a):
            field = a[:2] if not a.startswith("--") else a.split("=")[0]
    if "graphql" in args and "--input" not in [a.split("=")[0] for a in args] \
            and not any(re.search(r"\bmutation\b", a) for a in args):
        return ""   # a GraphQL query is sent as a POST but reads; a mutation, or a query from a file, is refused
    return f"gh api {field} (gh sends a POST)" if field and not get else ""


def judge_words(words, hostvars, depth):
    """A simple command's words: the HTTP client, gh api, an interpreter or a shell may sit after any prefix
    (sudo -u x, env -i, xargs -I %, watch, time, if, do, then ...), so every word is tried as the program."""
    def hosted(a):
        return HOST.search(a) or any(re.search(r"\$\{?" + v + r"\b", a) for v in hostvars)
    for i, w in enumerate(words):
        prog = w.rsplit("/", 1)[-1]
        args = words[i + 1:]
        if prog in CLIENTS and any(hosted(a) for a in args):
            why = {"curl": curl_write, "wget": wget_write}.get(prog, httpie_write)(args)
            if why:
                return why
        if prog == "gh" and args[:1] == ["api"]:
            why = gh_api_write(args[1:])
            if why:
                return why
        if prog in INTERP:   # python -c, node -e, ruby -e, perl -MLWP -e: the code follows the first -c, -e or -E
            k = next((j for j, a in enumerate(args) if a in ("-c", "-e", "-E")), None)
            if k is not None and k + 1 < len(args) and hosted(args[k + 1]) and CODE_WRITE.search(args[k + 1]):
                return "inline code writing to the GitHub API"
        if (prog in SHELLS and args[:1] == ["-c"] or prog == "eval") and args:
            why = judge(args[1] if prog in SHELLS else " ".join(args), depth + 1, hostvars)
            if why:
                return why
    return ""


def judge(text, depth=0, hostvars=()):
    if depth > 4:
        return "commands nested too deep to read"
    if CODE.search(text) and "<<" in text and HOST.search(text) and CODE_WRITE.search(text):
        return "inline code (a heredoc) writing to the GitHub API"
    text = text.replace("\\\n", " ")   # a line continued with a backslash is one command
    marked = re.sub(r"`|\$\(|<\(|>\(", SUB, text).replace("\n", " ; ")
    try:
        words = split(marked)
    except ValueError:   # an open quote: judge the whole text
        if HOST.search(text) and re.search(r"\b(curl|wget|xh|http)\b", text) and re.search(
                r"(^|\s)(-[A-Za-z]*[XdFT]|--(request|data|json|form|upload-file|post-|body-|method))", text):
            return "a GitHub API write in a command that cannot be split"
        return ""
    hostvars = set(hostvars) | {m.group(1) for w in words for m in [re.match(r"^([A-Za-z_]\w*)=(.*)$", w, re.S)]
                                if m and HOST.search(m.group(2))}
    seg = []
    for w in words + [";"]:
        if w in SEP or set(w) <= set(";&|()"):
            why = judge_words(seg, hostvars, depth)
            if why:
                return why
            seg = []
        else:
            seg.append(w)
    for w in words:   # a substitution inside quotes: "$(curl ...)"
        if "__SUB__" in w and w.strip() != "__SUB__":
            why = judge(w.replace("__SUB__", " ").replace(")", " ; ").replace("`", " ; "), depth + 1, hostvars)
            if why:
                return why
    return ""


def main():
    data = json.load(sys.stdin)   # unreadable input raises: the wrapper blocks (fail closed)
    if data.get("tool_name") not in (None, "Bash"):
        return 0
    cmd = (data.get("tool_input") or {}).get("command")
    if not isinstance(cmd, str):
        raise SystemExit("github-write-guard: no command in the hook input")
    if not re.search(r"github|\bgh\b|GH_TOKEN", cmd, re.I):
        return 0
    why = judge(cmd)
    if not why:
        return 0
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse", "permissionDecision": "deny",
        "permissionDecisionReason": (
            f"GitHub writes go through one door (LR-060, P-384): this command writes to the GitHub API ({why}). "
            "Use gh's allowed commands (gh pr create, gh pr comment, gh pr edit --add-label \"review: approved\") or "
            "the reviewed script in product/tools that does this write; reads (GET) pass. "
            "Ask on the PR with \"Question for the tech lead\" if no allowed way exists.")}}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
