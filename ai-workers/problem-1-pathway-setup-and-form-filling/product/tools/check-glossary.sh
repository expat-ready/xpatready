#!/usr/bin/env bash
# LR-090 (SF:A1): check-docs.sh fails when an instruction file uses an ID code whose prefix has no row in
# product/GLOSSARY.md's "Codes with a dash" table (check-glossary.py). Throwaway copies, US$0, no network.
#   bash product/tools/check-glossary.sh
set -u
. "$(dirname "$0")/guard-test-lib.sh"
T=$(mktemp -d "${TMPDIR:-/tmp}/gloss.XXXXXXXX") && [ -d "$T" ] || { echo "no temp dir: nothing was checked"; exit 2; }; trap 'rm -rf "${T:?}"' EXIT
docs_copy "$T/c"; C="$T/c"; Q="$C/$PRODREL"; cp "$TOOLS/check-glossary.py" "$Q/tools/"
run() { o=$(bash "$Q/tools/check-docs.sh" 2>/dev/null); rc=$?; }
has() { grep -qF -- "$1" <<<"$o"; }
gloss() { { echo '# Glossary'; echo; echo '## Codes with a dash'; echo; echo '| Prefix | Plain name |'; echo '|---|---|'
  for p in "$@"; do echo "| $p | name |"; done; echo; echo '## Not codes'; echo; echo '| `ZZ-` | outside the table |'; } > "$Q/GLOSSARY.md"; }
skill() { mkdir -p "$C/.claude/skills/next"; printf '%s\n' "$@" > "$C/.claude/skills/next/SKILL.md"; }

run; ok "no glossary and no next skill (a throwaway copy): no GLOSSARY line, docs OK" "$([ "$rc" = 0 ] && ! has GLOSSARY && echo 1)" "$o"
skill 'Take row PF-22v (P-611).'; run
ok "the next skill without the glossary: fails, names the page" "$([ "$rc" = 1 ] && has 'GLOSSARY: product/GLOSSARY.md is missing' && echo 1)" "$o"
gloss '`PF-`' '`P-`'; run; ok "every prefix defined: docs OK" "$([ "$rc" = 0 ] && ! has GLOSSARY && echo 1)" "$o"
skill 'Take row PF-22v, then QA-526 and QA-527.'; run
ok "an undefined prefix fails once, names it and where it is first" "$([ "$rc" = 1 ] && has "code prefix 'QA-' (first at .claude/skills/next/SKILL.md:1)" && [ "$(grep -c "'QA-'" <<<"$o")" = 1 ] && echo 1)" "$o"
gloss '`PF-`' '`QA-`, `X-`'; run; ok "several prefixes in one first cell all count" "$([ "$rc" = 0 ] && echo 1)" "$o"
skill 'see NFR5-14'; gloss '`NFR`'; run; ok "trailing digits of a prefix are dropped (NFR5- -> NFR)" "$([ "$rc" = 0 ] && echo 1)" "$o"
skill 'read history/RULES-2026-11-28.md and TRACE-SA01B-2026 and x.QA-1'; gloss '`PF-`'; run
ok "a code joined to a path or word before it is skipped" "$([ "$rc" = 0 ] && echo 1)" "$o"
skill 'ZZ-1 here'; run; ok "a prefix outside the dash table is not defined" "$([ "$rc" = 1 ] && has "code prefix 'ZZ-'" && echo 1)" "$o"
skill 'fine'; mkdir -p "$C/.claude/agents"; echo 'see AB-3' > "$C/.claude/agents/a.md"; printf 'rule CD-1\n' > "$C/AGENTS.md"
printf 'row EF-2\n' > "$Q/WAY-OF-WORKING.md"; run
ok "agents, AGENTS.md and WAY-OF-WORKING.md are read too" "$([ "$rc" = 1 ] && has "'AB-'" && has "'CD-'" && has "'EF-'" && echo 1)" "$o"
rm -f "$C/.claude/agents/a.md" "$C/AGENTS.md" "$Q/WAY-OF-WORKING.md"
printf '# Glossary\n\nno table\n' > "$Q/GLOSSARY.md"; run; ok "a glossary with no dash table fails" "$([ "$rc" = 1 ] && has "has no '## Codes with a dash' table" && echo 1)" "$o"
gloss '`PF-`'; printf 'import sys\nsys.exit(3)\n' > "$Q/tools/check-glossary.py"; run
ok "check-glossary.py crashing: check-docs fails" "$([ "$rc" = 1 ] && has 'GLOSSARY: check-glossary.py failed (exit 3)' && echo 1)" "$o"
R="$(cd "$TOOLS/../../../.." && pwd)"
if [ -f "$TOOLS/../GLOSSARY.md" ]; then o=$(python3 -I "$TOOLS/check-glossary.py" --product "$TOOLS/.." --root "$R" 2>&1); rc=$?
  ok "the real glossary defines every prefix the real instruction files use" "$([ "$rc" = 0 ] && echo 1)" "$o"
else echo "SKIP  the real GLOSSARY.md: not in this copy (the mutation harness copies product/tools only)"; fi
finish
