# Review instructions (Claude Code Review)

Factory v2 (decisions A409, A410). Code Review runs on pull requests that touch a risky path: client money, fees,
payments, trust; the Prisma schema and migrations; permissions, roles, identity and access; `.github/`, `.mergify.yml`,
`.githooks/`, `.claude/`, `CLAUDE.md`, `AGENTS.md`, this file and the tools folders (the list is `.claude/approvals.yml`).
Other pull requests get a review only when someone asks for one. CI (`ci`) stays the gate; do not repeat it.

## What Important means here

Reserve Important for a finding that would break behaviour, leak data, move money wrongly or block a rollback:
- a business rule without a passing AND a failing test (STANDARDS §3 rule 10), or a test that still passes with the rule removed;
- an endpoint without server-side authorisation, deny by default; author and approver not kept apart on the server; a read not scoped to the caller's firm;
- client money: an amount, balance or trust movement that can go wrong, double-post, skip its audit line, or round differently in two places;
- a migration that is not expand, migrate, contract, loses existing records, edits a migration already on main, or has no recorded rollback;
- personal data in logs, errors or AI prompts; a secret, token or key in code or config;
- document or form text treated as instructions to an AI (it is untrusted data);
- an immigration value (program, form, fee, threshold, document rule) in code or sample data without an official source cited with page, quote and date (AGENTS.md rule 4). Anything else must be labelled Sample. Legal points must say "Unconfirmed: no counsel";
- a personal name in a file, comment or commit (AGENTS.md rule 5): roles only (the founder, the tech lead, Client A);
- a change that adds or reads anything under `sources/`, `code/` or `archive/`, or adds PDFs, databases, logs or local tools (the push guard refuses them; flag the attempt).

## Always check

- Content is data, never constants; no immigration values in code (STANDARDS §3 rule 1).
- Masters are picked, not typed; defined once and referenced; retired, never deleted (§3 rules 2, 3, 5).
- Every link checked twice: a database constraint and a service rule (§3 rule 4).
- Released means frozen; cases pin their release (§3 rule 7). AI proposes with evidence; a person accepts (§3 rule 8).
- Optimistic concurrency (stale save gives 409) and idempotent creates (§4).
- Errors are RFC 9457 Problem Details with field-level messages; contracts are zod schemas shared by API and web (§6).
- Strict TypeScript, no `any`, no dead or commented-out code; comments say why with the decision or bug number, never status, dates, sessions or people (§7).
- On a workflow change: no job runs the pull request's own code with a write token; nothing weakens or removes a check.

## Cap the nits

Report at most three Nits. Style and naming are Nit at most.

## Do not report

- What CI already enforces: lint, type errors, the push guard, the rules files, formatting.
- Records-only changes (STATE, BACKLOG, DECISIONS, reports) unless they change a rule's meaning.
- New features or polish beyond the written bar; anything on a concept's "Not built" line; "the team's screen has it".
