# OS-58 / LR-060 (full-power #165): one door for GitHub writes. github-write-guard.py refuses a typed command that writes
# to the GitHub API (curl, wget, httpie, gh api with a field, inline code), wherever the client sits in a command (after
# sudo, xargs, if, do, braces, bash -lc), over continued lines, with the host in a variable; heredoc bodies are text
# unless a shell or an interpreter reads them; settings.json runs it on every Bash call, fail closed. And LR-046
# (full-power #56): every curl a product tool runs follows a redirect (-L).
# Tests: check-github-write-guard.sh, check-curl-follows.sh.
TESTS="$TESTS check-github-write-guard.sh check-curl-follows.sh"
MUT="$MUT"'
OS58 clients|product/tools/github-write-guard.py|s/        if prog in CLIENTS and any(hosted(a) for a in args) and not elsewhere(args):/        if False:/|check-github-write-guard.sh
OS58 elsewhere|product/tools/github-write-guard.py|s/ and not elsewhere(args):/:/|check-github-write-guard.sh
OS58 targets|product/tools/github-write-guard.py|s/            elif a.startswith("-"):/            elif False:/|check-github-write-guard.sh
OS58 unclosed|product/tools/github-write-guard.py|s/            continue   # no closing line/            end = len(lines)   # no closing line/|check-github-write-guard.sh
OS58 body|product/tools/github-write-guard.py|s/                if c in "dF" and not get or c == "T":/                if False:/|check-github-write-guard.sh
OS58 request|product/tools/github-write-guard.py|s/        if a.startswith("--request"):/        if False:/|check-github-write-guard.sh
OS58 gh field|product/tools/github-write-guard.py|s/ if field and not get else ""/ if False else ""/|check-github-write-guard.sh
OS58 code|product/tools/github-write-guard.py|s/ and hosted(args\[k + 1\]) and CODE_WRITE/ and False and CODE_WRITE/|check-github-write-guard.sh
OS58 heredoc code|product/tools/github-write-guard.py|s/    if interp_heredoc_write(text):/    if False:/|check-github-write-guard.sh
OS58 heredoc text|product/tools/github-write-guard.py|s/^        if shell:$/        if True:/|check-github-write-guard.sh
OS58 shell c|product/tools/github-write-guard.py|s/        if prog in SHELLS:   # bash -c/        if False:   # bash -c/|check-github-write-guard.sh
OS58 shell flags|product/tools/github-write-guard.py|s/r"^-\[A-Za-z\]\*c\[A-Za-z\]\*\$"/r"^-c$"/|check-github-write-guard.sh
OS58 anywhere|product/tools/github-write-guard.py|s/    for i, w in enumerate(words):/    for i, w in enumerate(words[:1]):/|check-github-write-guard.sh
OS58 hostvar|product/tools/github-write-guard.py|s/        return HOST.search(a) or any(/        return HOST.search(a) or False and any(/|check-github-write-guard.sh
OS58 for url|product/tools/github-write-guard.py|s/        if w == "for" and words\[j + 2\] == "in"/        if False/|check-github-write-guard.sh
OS58 continued|product/tools/github-write-guard.py|s/strip_heredocs(text.replace("\\\\\\n", " "))/strip_heredocs(text)/|check-github-write-guard.sh
OS58 fallback gh|product/tools/github-write-guard.py|s/            if re.search(r"\\bgh\\s+api\\b", text)/            if False/|check-github-write-guard.sh
OS58 token|product/tools/github-write-guard.py|s/\\bGH_TOKEN\\b/\\bNO_SUCH_TOKEN\\b/|check-github-write-guard.sh
OS58 nocmd|product/tools/github-write-guard.py|s/        raise SystemExit("github-write-guard: no command in the hook input")/        return 0/|check-github-write-guard.sh
LR46 curl tool|product/tools/label-guard.sh|s/curl -sSL --fail-with-body/curl -sS --fail-with-body/|check-curl-follows.sh
LR46 curl lead-pr|product/tools/lead-pr.sh|s/H=(-sL -H/H=(-s -H/|check-curl-follows.sh
LR46 curl py|product/tools/cockpit-data.py|0,/\["curl", "-sSL",/s/\["curl", "-sSL",/["curl", "-sS",/|check-curl-follows.sh
LR46 curl check|product/tools/check-curl-follows.sh|s/                if "L" not in m.group(1)/                if False/|check-curl-follows.sh'
