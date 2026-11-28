# LR-090 (lab register; source SF:A1, no OS row, so the name only fits OS-85's pattern): the glossary check.
# Each row switches one of check-glossary.py's rules, or its wiring in check-docs.sh, off.
TESTS="$TESTS check-glossary.sh"
MUT="$MUT"'
LR090 undefined|product/tools/check-glossary.py|s/^                bad.setdefault(p, .*$/                pass/|check-glossary.sh
LR090 digits|product/tools/check-glossary.py|s/ or p.rstrip("0123456789") in known//|check-glossary.sh
LR090 table|product/tools/check-glossary.py|s/^    if not known:/    if False:/|check-glossary.sh
LR090 wired|product/tools/check-docs.sh|s/^if \[ -f "\$PH\/GLOSSARY.md" \]; then/if false; then/|check-glossary.sh
LR090 missing|product/tools/check-docs.sh|s/^elif \[ -f "\$ROOT\/.claude\/skills\/next\/SKILL.md" \]; then echo "GLOSSARY/elif false; then echo "GLOSSARY/|check-glossary.sh
LR090 stoplist|product/tools/check-glossary.py|s/^                if p in skip:/                if False:/|check-glossary.sh
LR090 joined|product/tools/check-glossary.py|s/(?<!\[A-Za-z0-9\/_.\\-\])//|check-glossary.sh
LR090 firstcell|product/tools/check-glossary.py|s/first = line.split(.*$/first = line/|check-glossary.sh
LR090 crash|product/tools/check-docs.sh|s/^  if \[ "\$glc" -gt 1 \] /  if false /|check-glossary.sh'
