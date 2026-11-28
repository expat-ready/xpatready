# OS-84 (A400): pipeline-watch.py posts each detector act on its PR once
TESTS="$TESTS check-pipeline-watch.sh"
MUT="$MUT"'
OS84 dedupe|product/tools/pipeline-watch.py|s/            if k in have or k in seen:/            if k in seen:/|check-pipeline-watch.sh
OS84 key|product/tools/pipeline-watch.py|s/    norm = re.sub(r"(?<!\[#.\\d\])\\d+(?:\[.:\]\\d+)\*", "N", text)/    norm = text/|check-pipeline-watch.sh
OS84 bot|product/tools/pipeline-watch.py|s/            if (c.get("user") or {}).get("login") != BOT:/            if False:/|check-pipeline-watch.sh
OS84 again|product/tools/pipeline-watch.py|s/            if now - t < AGAIN:/            if True:/|check-pipeline-watch.sh
OS84 sle|product/tools/pipeline-watch.py|s/(Q #\\d+: \.\*)/([A-Z] #\\d+: .*)/|check-pipeline-watch.sh
OS84 broken|product/tools/pipeline-watch.py|s/        if not out or (name in/        if False and (name in/|check-pipeline-watch.sh
OS84 ours|product/tools/pipeline-watch.py|s/        if n in ours:/        if n:/|check-pipeline-watch.sh
OS84 fork|product/tools/pipeline-watch.py|s/                if not p.get("isCrossRepository")}/                }/|check-pipeline-watch.sh
OS84 span|product/tools/pipeline-watch.py|s/`{text.replace(.`., chr(39))}`/{text}/|check-pipeline-watch.sh
OS84 writers|../../.github/workflows/pipeline-watch.yml|s/      contains(fromJSON(.\[.OWNER.,.MEMBER.,.COLLABORATOR.\].), github.event.comment.author_association)/      true/|check-pipeline-watch.sh
OS84 words|../../.github/workflows/pipeline-watch.yml|s/      \&\& (contains(github.event.comment.body, .lead.) .. contains(github.event.comment.body, .reviewer:.))//|check-pipeline-watch.sh'
