# Brief: PF-0c, one shared contract test per port (P-606 (8)) (cloud builder lane; row owner Lead B)

**Start now.** It waits on nothing. There is no schema change, and it touches only new files plus one call line in each adapter's own test file and one CI step. It may run beside any row (rev 16.11 (e)). Builder at medium effort, reviewer at high (P-605). **The release holder reads the CI step before the label** (P-423). Paste into a new cloud session on the repository (default branch `main`):

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-0c` and take **one row, PF-0c**, end to end on a fresh branch from `origin/main`, one PR.

**The row:** `ai-workers/problem-1-pathway-setup-and-form-filling/product/BACKLOG.md`, row **PF-0c** (rows rev 16.11 (d)), with the port list corrected below. Read only these with it:
* the requirement text `python3 product/tools/trace-requirements.py --brief PF-0c` prints (P-604);
* `product/design/lead-b-rows-2026-11-14.md`, section "Rev 16.11", parts (a) (the DWn naming) and (d) (the row);
* on `main`: each file under `prototype/studio/ports/`, and the real adapters named below, read only for their public methods.

**Lead B rulings (row owner, 15 Nov; the port list checked against `main`):**
1. **The ports in scope.** These are the ports that have a fake in `ports/` **and** a real adapter on `main` today:

   | Port (`ports/…`) | Fake | Real adapter(s) on `main` |
   |---|---|---|
   | `JobPort` (`jobs.ts`) | `fakeJobs` | `api/src/platform/jobs/pgboss-jobs.ts`, `platform-jobs.ts` |
   | `FilesPort` (`files.ts`) | `fakeFiles` | `api/src/front-office/files.ts` (local disk) |
   | `SecretBoxPort` (`secret-box.ts`) | `fakeSecretBox` | `api/src/platform/secret-box/aes-gcm.ts` |
   | `ClockPort` (`clock.ts`) | `FakeClock` | `systemClock` |
   | `AuditPort` (`audit.ts`) | `fakeAudit` | `api/src/platform/audit/audit-event.ts` |
   | `ConsentPort` (`consent.ts`) | `fakeConsent` | `api/src/platform/messages/consent/consent-store.ts` |
   | `AlertPort` (`alert.ts`) | `fakeAlerts` | `api/src/platform/observability/alerts.ts` (`LogAlerts`) |
   | `DocumentRenderPort` (`render.ts`) | `fakeRender` | `api/src/front-office/retainers/docx.ts` (`DocxRender`) |
   | `IdentityPort` (`api/src/platform/identity/port.ts`) | — | `LocalIdentity`, `CognitoIdentity` |

   * **`MailPort`, `ArrivalPort` and the staff port have no real adapter yet**, so they are out of this row. The guard (ruling 3) makes the row that adds their first real adapter (PF-18n or PF-19b, FO-2) add their contract.
   * The row text names `MailPort` and leaves out `AlertPort` and `DocumentRenderPort`; this table supersedes it. Lead B tells the current Lead so BACKLOG is amended.
2. **`IdentityPort`'s Cognito half.** `LocalIdentity` runs the contract in CI. `CognitoIdentity` calls the same contract, which reports `NOT TESTED: no AWS credentials` and exits 0 when no credentials are set. It is never counted green (P-405), and PF-4b's proof runs it for real. If `IdentityPort` moves into `ports/` later, the contract moves with it.
3. **The guard `tools/check-port-contracts.mjs`** reads the files statically. A port is a type or interface named `…Port` exported from `ports/` or `api/src/platform/identity/port.ts`. A real adapter is a class with `implements <X>Port`, or an exported value typed `: <X>Port`, under `api/src/`. The guard fails in either of these cases:
   * a port with a real adapter has no `ports/contracts/<port>.contract.ts`;
   * an adapter's own test file does not call its port's contract.

   Fakes count as adapters for that second check.
4. **Each contract is behaviour, not shape.** It is a function `(makeAdapter) => cases`, holding the cases the port's callers rely on. Examples: a keyed job runs once; a file key is write-once and another firm's key reads as absent; a sealed secret opens only for its owner; an audit line is append-only and firm-scoped; a consent decision for a withdrawn purpose is refused; a render of the same data gives the same bytes. Take each case from the port file's own comments and the callers' tests. Invent no new rule: a behaviour you are unsure of goes in the PR's Questions.

**Named test cases (P-606: list them in the PR body before writing code; the reviewer ticks one per line).**
* `PF-0c DW1 pass/fail`: the guard passes on `main` with the new contracts. It fails on a test port with a real adapter and no contract, shown once in the PR, then removed.
* `PF-0c DW2`: for each port in ruling 1, the fake and every real adapter pass its contract (`PF-0c DW2 <Port> <adapter>`, one line each; Cognito prints NOT TESTED).
* `PF-0c DW3 fail`: a deliberately wrong `JobPort` fake, which runs a keyed job twice, fails the contract.
* `PF-0c DW4`: the guard runs in under 10 s, timed in CI's output.
* `PF-0c DW5`: every existing suite that uses these fakes and adapters passes unchanged.

**Touch:** new `prototype/studio/ports/contracts/*.contract.ts`, new `tools/check-port-contracts.mjs`, one CI step in the workflow that runs the other guards, and one call line in each adapter's and fake's own test file. Nothing else.

**Duplicate check (P-526):** BACKLOG, open PRs (including records PRs), `main`'s code (`contract`, `ContractTest`) and BUGS (QA-452, QA-453); one `Duplicate check:` line.

**Breaker: no.** The reviewer runs at high effort.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
