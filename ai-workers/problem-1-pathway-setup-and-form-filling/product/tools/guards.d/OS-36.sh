# OS-36 (lab bundle A5 "Product safety checks", LR-045, LR-074; Lead 10, 28 Nov): the migration check's rules and the
# report-only wiring of safety.yml, each switched off in turn; check-safety-tools.sh must then fail. route-sweep.ts needs
# the studio's packages, which the guards job does not install: its planted cases run in safety.yml.
TESTS="$TESTS check-safety-tools.sh"
MUT="$MUT"'
OS36 statements|prototype/studio/tools/safety/migration-check.py|s/        hit = next((k for k, rx in STATEMENT_RULES if rx.search(text)), None)/        hit = None/|check-safety-tools.sh
OS36 clauses|prototype/studio/tools/safety/migration-check.py|s/hit = next((k for k, rx in CLAUSE_RULES if rx.search(cl)), None)/hit = None/|check-safety-tools.sh
OS36 add not null|prototype/studio/tools/safety/migration-check.py|s/if not hit and ADD_COLUMN.search/if False and ADD_COLUMN.search/|check-safety-tools.sh
OS36 do block|prototype/studio/tools/safety/migration-check.py|s/            if re.fullmatch(r"/            if False and re.fullmatch(r"/|check-safety-tools.sh
OS36 plpgsql|prototype/studio/tools/safety/migration-check.py|s/        while (p := PLPGSQL.match(text)):/        while False and (p := PLPGSQL.match(text)):/|check-safety-tools.sh
OS36 waiver place|prototype/studio/tools/safety/migration-check.py|s/                if not "".join(buf).strip():/                if True:/|check-safety-tools.sh
OS36 stamp|prototype/studio/tools/safety/migration-check.py|s/        elif m.group(1) <= newest:/        elif False:/|check-safety-tools.sh
OS36 history|prototype/studio/tools/safety/migration-check.py|s/            if folder in names:/            if False:/|check-safety-tools.sh
OS36 report only|../../.github/workflows/safety.yml|0,/continue-on-error: true/s/continue-on-error: true/continue-on-error: false/|check-safety-tools.sh'
