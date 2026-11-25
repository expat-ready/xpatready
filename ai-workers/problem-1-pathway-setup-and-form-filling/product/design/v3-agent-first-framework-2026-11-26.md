# Xpat Ready v3: agent-first build framework (pointer)

Written 26 Nov 2026 by the tech lead for the founder (ask: a fresh v3 build by 3 to 4 people plus Claude Code agents, 2 to 3 months to a production-ready beta). Full document (Claude Doc, private until shared): https://claude.ai/artifact/X5VbZjbCF7DCbgVa8Se52i

Inputs: requirement snapshot `domain/requirements-2026-11-02/` (SA-01..SA-12, AG-01..AG-19, client portal, architecture record, Program Charter V2); lab numbers from `design/lean-team-plan-2026-11-26.md` and `design/why-targets-missed-2026-11-24.md`.

Key choices, in short:
* Progress is measured only in proven capabilities (journey test passes on QA and an independent tester walked it), never lines of code or PR counts (founder, 26 Nov).
* Team: founder (scope, acceptance), CTO (architecture, pipeline, risk), one senior developer (second approver, integrations, outside accounts); optional QA hire from week 9. About 20 agents at once.
* Stack as the architecture record: NestJS + Prisma 7, PostgreSQL 18 with forced RLS, AWS ca-central-1, in-house identity with three pools, rail ports.
* PRs at most 800 changed lines (400 hand-written product code), one row each, merge queue, required checks only (no warnings), human approval on money, permissions, schema, security.
* Environments dev, QA, staging, production by Terraform; production needs one person's approval.
* 12 weeks, gates G0 (wk 1) to G5 (wk 12); about 110 capabilities; lab rate 4.7/day vs about 2.5 to 3/day needed; re-forecast at end of week 4.
* Cost about US$9,000 to 12,000 a month (approximate, not looked up), plus pen test and counsel review.

Open: founder chooses the beta cut (all Release 1 at launch minimum, or one journey first).
