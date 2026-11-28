# Lab proofs, ship-security lane (28 Nov 2026)

Evidence for the lane's "Built: prove" rows of `lab-register-2026-11-27.md`, run by the lab ship-security cloud lane
(Opus 5.5 medium, P-608, P-788) for the tech lead. The register itself is the Lead's (or the lab-prover lane's) to
update: each row below says the Status line it supports. Times from `TZ=Asia/Kolkata date`.

## LR-069 — shared test environment with PostgreSQL: Proven (evidence below)

Done when (register): "One cloud session in the environment runs tools/cloud-setup.sh and a Postgres suite green, run linked".

* **Environment:** the cloud environment `xpatready` (`get_environment`: env_01U626XjEupjjLNKWwMPC4gx, anthropic_cloud,
  limited network with package registries, repository expat-ready/xpatready, `is_current: true` for this session).
  The register's Status line says this lane's predecessor ran in Default; this session ran in `xpatready`.
* **Session (the run link):** https://claude.ai/code/session_01Ln6TiRnYiVgWdC8gBD5G6e, on main b7f16accf.
* **Step 1, 28 Nov ~13:05 IST:** `bash ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/cloud-setup.sh`
  → exit 0 in 1 min 7 s: Node 24.21.0, `npm ci` (688 packages), PostgreSQL 18.3 "from the npm registry (checksum
  verified)" (apt.postgresql.org is not on the environment's allow-list, the script's fallback took it), "cluster created",
  "cluster started", "migrations applied, client generated", "web app built", "cloud setup done".
* **Step 2, 28 Nov 13:18 IST:** a PostgreSQL suite on an isolated copy, as its own usage line says:
  `zsh studio/tools/isolated.sh runtime_aud1a 4606 start --ttl 60 && tsx --tsconfig studio/api/tsconfig.json studio/tests/check_aud1a_insert_only.ts 4606 xr_studio_runtime_aud1a`
  → "42 passed, 0 failed", exit 0 (scratch databases, the insert-only audit trigger, the demo reset); then
  `isolated.sh runtime_aud1a 4606 stop` → "database and files removed".
* **Supports the Status:** "Proven 28 Nov 13:18 IST: cloud-setup.sh exit 0 and check_aud1a_insert_only.ts 42/0 in the
  xpatready environment, session_01Ln6TiRnYiVgWdC8gBD5G6e (this file)".
* **Not covered:** whether claude.ai's "Where it runs" default for Steward names this environment is a claude.ai settings
  read (founder or Lead in the browser); the register's Done when does not ask for it.

## Built rows this lane could not prove from a cloud session (named blockers)

| Row | What the proof needs | Blocker |
|---|---|---|
| LR-066 | A read of the Claude Ship page in claude.ai: balance at or above US$150, expat-ready Connected, no "shared with another Claude organization" banner on Approvals | A signed-in browser: this cloud session has no built-in browser and no attached computer. Lead 11 planned the read (#4017). |
| LR-074 | The live walk of every route signed out and with a wrong role (0 unexpected 2xx) | Not built: Lead 11 on #4017 moved it to LR-161. LR-074 stays Built until LR-161 lands. |
| LR-130 | A Claude Code Review check run that shows REVIEW.md was read | No Code Review run exists: Code Review is not on (LR-067 waits for the top-up, a founder step). |
