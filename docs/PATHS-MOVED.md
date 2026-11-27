# Paths moved (repository clean-up, 2026-11)

Records keep their facts (P-188): an old record names a path as it was. This table says where each path went, stage by stage (`ai-workers/problem-1-pathway-setup-and-form-filling/product/design/repo-cleanup-plan-2026-11-17.md`). A removed path is still in git history at tag `history/pre-cleanup-2026-11`: `git show history/pre-cleanup-2026-11:<old path>`.

| Stage | Old path | Now | Merged |
|---|---|---|---|
| 1 | `ai-workers/illustrations/`, `checks/`, `requirements/`, `research/`, `commercial/`, `problem-2-ai-across-case-and-business/` | removed (tag) | |
| 1 | `ai-workers/NEXT.md`, `PROGRESS.md`, `README.md`, `START-HERE.md`, `assumptions.md`, `terminology-register.md` | removed (tag) | |
| 1 | `ai-workers/tools/` (all but `prompt-log.sh`, `freshness.sh` and `s3-working/`) | removed (tag); `s3-working/` kept: `prototype/tests/p2_acceptance.py` imports `s3_data.py` from it | |
| 1 | `delivery-reset-2026-10-21/`, `playbook/`, `requirements-planning/`, `fresh-start-prompt.md` | removed (tag) | |
| 1 | `ai-workers/problem-1-pathway-setup-and-form-filling/devin-review/` | removed (tag) | |
| 1 | `ai-workers/decisions.md` (October AIW-D rows) | kept; moves with the docs in stage 6 | |
