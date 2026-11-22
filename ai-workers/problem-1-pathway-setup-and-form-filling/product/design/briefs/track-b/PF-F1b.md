# Brief: Row PF-F1b — the server uses the file store PLATFORM_FILES names (Track B; cloud builder; LX943)

Written 22 Nov 13:4x IST by Lead B (Track B). Row: `product/BACKLOG.md` row **PF-F1b** (on branch `lead-b/2026-11-22-track-b` until the Lead's records PR lands). Run `/next runtime PF-F1b`.
Model: Opus 5.5, effort: high (storage security; P-608 (2)).
Item: R1.65
**PR title:** `runtime: PF-F1b — bind the chosen files adapter`

**Start when:** #2955 (PF-F1) is merged. No migration.

**What to build (the row, exactly):** PF-F1's `chooseFiles(env)` (`api/src/platform/files/choose.ts`) is bound where `FilesPort` is bound today, in one place, so every caller (FO-5's retainer files, PF-Fd, PF-Fp, PF-15's usage) gets `LocalFiles` on the Mac, lanes and CI and `S3Files` where `PLATFORM_FILES=s3`; `S3FileLinks` is bound beside it with the server's link key (a PF-24 secret setting, `opt(...)` so a server without it still starts on the local adapter). No caller changes. **First find where `FilesPort` is bound** (`git grep -n "FILES_PORT\|FilesPort" api/src`) and name that file in the PR; if it is `main.ts` or `runtime.ts`, ask first on the PR.

**Decisions (word for word):**
* **P-559:** "Firm tables, real sign-in and multi-firm work are now ours for the platform and front-office modules (Lead 37 ruling, from the founder's P-549, P-553, P-558: our own build for 25-50 then 100 firms)."

**Touches:**
- `api/src/platform/files/choose.ts`
- `api/src/platform/config/settings.ts`
- `tests/check_pff1b_bind.ts`
- `api/src/platform/MODULE.rows/PF-F1b.md`

Plus the one binding file you find (named in the PR body as outside this list, with the line).

**Done when:** `tsx studio/tests/check_pff1b_bind.ts` exits 0 with the row's four cases each passing and failing as named (unset outside production → local adapter, FO-5's suites unchanged; `PLATFORM_FILES=s3` with the recorded fake client serves a put and a get through the bound port; production with it unset refuses to start; a link opened for another firm → 404); `check_pff1_s3_files.ts`, `check_pffd_delete.ts`, `check_fo5_retainers.ts`, `check_pf24_secrets.ts` and `check_pf24w_environment.ts` pass unchanged (exit 0); full `ci` green.

Duplicate check: 22 Nov 13:4x IST: `chooseFiles` is called nowhere on `main` (PF-F1's own note: "Not bound in any feature in this row"); no open PR binds it.

**Review:** an Opus reviewer at high **and the breaker** (storage). The Lead reads the binding line and `settings.ts` before the label.

**Standard rules (copied from `build-lead-c-briefs/FO-7b.md`, adapted to Track B):** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610; records under `product/screens/<row>/` may pass it under P-775, stated in the body); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix; never push to a PR that carries the `queued` label. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Lead B (Track B) answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`. Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask; never widen the row silently. No personal names in any file (AGENTS rule 5). Immigration and tax values only from official sources with page, quote and date, else "Sample"; legal points "Unconfirmed: no counsel" (AGENTS rule 4). Never run test or guard suites in the Mac's main copy. A row fragment goes in `MODULE.rows/<part>.md`, never in the shared `MODULE.md` card (collision map §B). A new route registers in its own `api/src/features/<feature>.ts` (P-214), never in `main.ts` or `runtime.ts`.

**Audit actors (Lead 80, 18 Nov):** a test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people, never a bare word like `test`.
