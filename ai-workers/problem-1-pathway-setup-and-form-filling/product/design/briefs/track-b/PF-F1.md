# Brief: Row PF-F1 — private storage in Canada behind the same FilesPort, on a recorded fake client (Track B lane 4; cloud builder)

Written 22 Nov 11:3x IST by Lead B (Track B, P-785). Row owner: Lead B (Track B). Run `/next runtime PF-F1`; the row is one PR.
Model: Opus 5.5, effort: high (storage security; P-608 (2)).
Item: R1.65
**PR title:** `runtime: PF-F1 — the S3 files adapter in ca-central-1, on a recorded fake client`

**Start when:** now. No migration. No open PR changes a file on the touch list (checked 10:5x IST 22 Nov). Built and tested **with no network and no AWS account**; R1.65's Works proof also needs PF-F1c (the bucket, versioning, the KMS key) and the founder's AWS (an outside dependency the Lead holds; P-785 (4) staging work).

**The specification:** `product/BACKLOG.md` row **PF-F1**, exactly (Step 0, `s3-files.ts` with `put`/`get`/`exists`, firm-prefixed keys, write-once by a conditional put, KMS server-side encryption on every put, 5-minute signed GET links (Sample) for one firm and one person, versions as new keys, `PLATFORM_FILES=local|s3` failing closed, region by configuration with default `ca-central-1`) and its six tested cases. **Step 0:** a STANDARDS §1 entry in `product/design/tech-gate-files-s3-2026-11-22.md` for `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`: licence read at source, a version at least 14 days old and **the same 3.x line as the two `@aws-sdk/*` clients already in `package.json` (3.1161.0)**, and how CI tests with no network (a recorded fake client). Lead B (Track B) approves it in the PR (the row says so).

**Decisions (word for word):**
* **P-559 (row's source):** "Firm tables, real sign-in and multi-firm work are now ours for the platform and front-office modules (Lead 37 ruling, from the founder's P-549, P-553, P-558: our own build for 25-50 then 100 firms)."
* **P-586 (2):** "**112 capabilities: Build 101, Optional 8 (X-1 to X-8), Held 3 (X-22)**" (the baseline that holds map row 65, storage in Canada).

**Touches:**
- `api/src/platform/files/s3-files.ts`
- `api/src/platform/files/choose.ts`
- `api/src/platform/MODULE.rows/PF-F1.md`
- `product/design/tech-gate-files-s3-2026-11-22.md`
- `tests/check_pff1_s3_files.ts`
- `tests/fixtures/pff1-s3/`
- `prototype/studio/package.json`
- `prototype/studio/package-lock.json`

The two package files change for the two packages only. `ports/files.ts` stays as it is (the adapter implements it). If `choose.ts` must be wired where `FilesPort` is bound today, name that one line and its file in the PR; if it is `main.ts` or `runtime.ts`, ask first.

**Done when:** `tsx studio/tests/check_pff1_s3_files.ts` exits 0 with the row's six cases each passing and failing as named (firm B reads firm A's key as null; same bytes accepted, other bytes `FileKeyTaken`; every put carries the encryption header and a put without it fails a check over the adapter; a link for another firm or person, or past 5 minutes on the injected clock, gives 404; `PLATFORM_FILES` unset with `NODE_ENV=production` refuses to start; FO-5's tests pass unchanged with the local adapter), plus `check_pffd_delete.ts` and `check_pffp_pdf.ts` unchanged (exit 0); full `ci` green.

Duplicate check: 22 Nov 10:5x IST, main `01841047d`: `api/src/platform/files/` holds only `file-type.ts`; `git grep -n "client-s3\|S3Client" origin/main -- prototype/studio` finds nothing; no open PR adds an S3 adapter.

**Review:** an Opus reviewer at high **and the breaker** (storage, security). The Lead reads `package.json` and the tech-gate page before the label (P-423).

**Standard rules (copied from `build-lead-c-briefs/FO-7b.md`, adapted to Track B):** branch from `origin/main`. One part, one PR, under 800 changed lines with tests (P-610; records under `product/screens/<row>/` may pass it under P-775, stated in the body); if it must split, ask first in a PR comment. **PR rule (P-683):** get "Reviewer: Approve <head>" on the branch first, then open the PR as non-draft. Never push to an open PR unless it is a fix; never push to a PR that carries the `queued` label. Merge `main` only on a conflict (P-270). Live AI off, US$0, never a priced button (P-175). Push after every step (P-557). Questions go on the PR as "Question for the tech lead: …"; Lead B (Track B) answers within 30 minutes. Report to the current Lead (`tools/current-lead.sh`). If a site is blocked on the cloud network, write "Not verified: <site> blocked on the cloud network" and go on. Repository: `expat-ready/xpatready`. Opus 5.5, no model switch mid-session (P-605). Finish whole: if an item needs more than its touch list, stop and ask; never widen the row silently. No personal names in any file (AGENTS rule 5). Immigration and tax values only from official sources with page, quote and date, else "Sample"; legal points "Unconfirmed: no counsel" (AGENTS rule 4). Never run test or guard suites in the Mac's main copy. A row fragment goes in `MODULE.rows/<part>.md`, never in the shared `MODULE.md` card (collision map §B). A new route registers in its own `api/src/features/<feature>.ts` (P-214), never in `main.ts` or `runtime.ts`.

**Audit actors (Lead 80, 18 Nov):** a test or seed that writes an audit line uses `staff:<id>`, `person:<id>`, `system:<door>`, `seed:<row>` or one of the listed simulated people, never a bare word like `test`.
