# Break report: P-785 (2) step 1, lead-read gate (PR #2920, commit 6d7b5a42a)

**Verdict: Changes.** 2 Blockers, 6 Majors, 5 Minors. Both Blockers are one-line fixes. The PR's own test passes (65/0).

Harness: the test's stand-in `curl` was copied unchanged. Each fixture writes `pr-7.json`, `files-7.json` and `comments-7.json`. Command for each: `PATH=stub:$PATH FX=fx GH_TOKEN=x REPO=o/r API=https://api.test PR=7 bash lead-read-gate.sh judge`, then the same with `LEAD_READ_GATE=block … status`. No network, no GitHub. `S` = `ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio`. Default head: `1111111aaaaaaa1111111aaaaaaa1111111aaaaa`.

## Blockers
**B1. Any author can skip the whole gate by naming their branch `mergify/…`. This includes a fork author.** (lead-read-gate.sh:62)
- Fixture: `head.ref = "mergify/merge-queue/x"` with `.github/workflows/ci.yml` patch `+    permissions: write-all`. A second fixture uses `head.ref = "mergify/evil"` with `$S/api/src/platform/settings/offices/routes.ts` `+  @Get("x") @AnyStaff("all")`.
- Observed: `judge exit=0: OK a merge-queue batch: each of its PRs is judged by itself`. With block: `STATUS 1111111… lead-read success`.
- Why it matters: `head.ref` is just the branch name, and the PR author picks it. A fork's branch name counts the same way. No comment is needed.
- Fix: grant the batch skip only when `.user.login == "mergify[bot]"` and `.head.repo.full_name == $REPO`. Otherwise judge the PR as usual. Add a fixture.

**B2. Changes to the guard itself pass with `success`.** (lead-read-paths.txt; rule (b) at lead-read-gate.sh:43)
- Fixtures, all observed `OK no path or line that keeps the Lead's read` / block `success`:
  - (a) `$S/api/src/platform/identity/guard.ts`: `-    if (access.kind === "sign-in") return true;` / `+    if (access.kind === "sign-in" || access.kind === "any-staff") return true;`. This lets any-staff routes through with no session.
  - (b) `…/identity/keys.ts`: `PLATFORM_PATH` loses `|front-office`. Every front-office route drops out of the guard.
  - (c) `…/identity/catalogue.ts`: `MONEY_AREAS` cut to `["refund","trust"]`. The money keys become ordinary keys.
  - (d) `$S/api/src/core.ts`: ConfigReadGuard reduced to `return true;`.
- Why it matters: P-423 covers permissions. These are the most direct permission changes possible, and none of them holds a quoted key or a decorator.
- Fix: add lines to the one list:
  - `/api/src/platform/identity/`
  - `/api/src/core\.ts$`
  - `/api/src/platform/(firm-scope|terms/gate)\.ts$`
  - `/api/src/features/platform-terms\.ts$`

## Majors
**M1. Access written in ordinary TypeScript gets past rule (b).** All of the following observed `OK` / `success`:
- Decorator split over lines, only the argument changed. `…/platform/audit/firm-read/routes.ts`, patch `@@ -20,4 +20,4 @@`, context ` @Get("audit")` and ` @PermissionKeys(`, then `-    AUDIT_READ,` / `+    AUDIT_READ_OWN,`.
- A key built from a template: `` +const k = (verb: string) => `agent/support:${verb}`; ``. Also `` `agent/${AREA}:list` ``.
- A key built by concatenation: `+export const SUPPORT_LIST = "agent/" + "support:list";`.
- A seed grant through a constant: `…/identity/sample-seed.ts` `+  { role: ROLE.ADMIN, keys: [...MONEY] },`.

The real code already passes keys as constants, e.g. `@PermissionKeys(LEGAL_SETTINGS_KEY)` (keep-period/routes.ts:13). So the split-line case is one keystroke away. Fix: in walled modules, hold every changed line of `routes.ts` and `keys.ts`. Widen the key pattern to a quote or `${` followed by `(agent|system)/`.

**M2. Files outside the `.ts` pattern are not read.**
- `$S/samples/notification-groups.json`: `-"whoSeesIt": { "kind": "key", "key": "agent/invoice:list" }` / `+"whoSeesIt": { "kind": "everyone" }`. Observed `OK` / `success`. This is a real access rule today (settings/notifications/groups.ts:18 reads it). The edit opens billing notifications to every staff member.
- Also `OK`:
  - `…/platform/settings/keys.mts` with a quoted key
  - `…/routes.js` with `@AnyStaff(`
  - `…/keys.json`
  - `routes.ts` renamed to `routes.mts` with a key line (the new name is not `.ts`, and the old name is ignored for (b))

  tsconfig allows `resolveJsonModule`.
- Fix: `SRC='/prototype/studio/(api/src/.*\.(c|m)?[jt]sx?|api/src/.*\.json|samples/.*\.json)$'`. Also test `previous_filename` against SRC and WALLED.

**M3. A short read can be reused after a push by grinding the new commit's SHA prefix.** (lead-read-gate.sh:81-82)
- Fixture: comment `MEMBER: Lead read: OK 1111111aa`, made for an older head `1111111aa000…`. The new head is `1111111aafff…0`. A second fixture uses a 7-character read and head `1111111fff…`.
- Observed: `OK the Lead read 1111111aa` / block `success`.
- Why it matters: 7 hex characters is 2^28 SHA-1 tries and 9 is 2^36. Public tools (lucky-commit style) find a matching commit in seconds to minutes. The hold message itself tells the Lead to write 9 characters.
- Fix: accept only the full 40-character SHA, and print the full SHA in the hint.

**M4. The PR's own author, or any writer, can free the PR.** (:80)
- Fixture R2: comment `{login:"author", author_association:"COLLABORATOR", body:"Lead read: OK <head>"}`, where the PR's `user.login` is `author`. Observed `OK` / `success`.
- Fixture R6: the Lead's old comment (`OWNER`, `updated_at` later than `created_at`) edited to name the new head. Observed `OK`. On GitHub, anyone with write access can edit anyone's comment, and the REST `author_association` stays the original author's. The `issue_comment edited` trigger passes the workflow's `if:`.
- Fix: count only logins in a repository variable `LEAD_LOGINS`, never the PR's `user.login`. Ignore edited comments (`updated_at != created_at`), or read the editor through GraphQL `lastEditedAt`/`editor`.
- Caveat: if the agents and the Lead share one account, no check in this script can tell them apart. That must be recorded.

**M5. A `lead-read` status is a plain commit status, so any write token can forge it.**
- A same-repository PR touching `.github/` (which this gate holds) can add a `pull_request` job with `permissions: { statuses: write }` and post `lead-read success` on its own head. The PR's own workflow file is the one that runs. The last status posted wins.
- Any agent holding the write token can do the same with `gh api …/statuses/<sha>`.
- Fix, before the block switch: queue-gate.sh (main's copy) runs `lead-read-gate.sh judge` itself before it labels, rather than trusting the status. An alternative is a dedicated app token pinned in a ruleset.

**M6. The planned queue rule `-check-failure = lead-read` lets a PR through when no status exists** (header :27, lead-read.yml:9).
- When the job did not run, the queue sees no failure. This happens:
  - from a push until the run lands
  - when Actions is down
  - for a PR opened against another branch and then retargeted to main: `pull_request_target` types lack `edited` and `branches: [main]` filters the first run, so it never gets a status
- Fix: `check-success = lead-read`, and add `edited` to the types.

## Minors
- m1. Read lines that say no are still counted as a read:
  - `Lead read: OK 1111111aa is NOT what I can give: blocker` → `OK`
  - `Lead read the diff: 1111111aa. Verdict: Block (money line unguarded)` → `OK`
  - `Lead read the diff 1111111aa` (no colon) → `OK`

  Fix: require end of line (optional `.`) after the SHA.
- m2. Hidden or template lines count: a read line inside `<!-- … -->` (invisible on GitHub) → `OK`; inside a code fence (the backticks are stripped at :81) → `OK`. Fix: drop fenced blocks and HTML comments before matching.
- m3. Patch lines whose content starts `-- ` or `++ ` are skipped as file headers (:72): `--- @Get("x")` → `OK`. GitHub's `patch` never contains `---`/`+++` headers, so drop the exclusion. A newline inside a walled file's name (`platform/a\nb/routes.ts`, `+ @Get("x")`) → `OK`, because `.*` stops at the newline.
- m4. `LEAD_READ_GATE=BLOCK` (or any spelling other than `block`) silently stays report-only: `lead-read pending`. Fix: lower-case the value, and fail when it is neither `report` nor `block`.
- m5. False holds (report-only now, but they will stall PRs at block):
  - The real list has no `# --- records-exempt` line, so `screens/R1.58/fees-panel.png`, `product/screens/B-invoice-list/break-report.md` and `web/…/coffee-pricing-copy.tsx` are held.
  - A key quoted in a comment of `api/src/forms.ts` is held. So is `// see @Get( above` in a walled file.
  - An NBSP in `Lead read: OK`, or a read given only as a review body, is not counted.

  Edits that take a read back are also not re-judged: if the edit removes the words "Lead read", the workflow's `if:` skips the run and the old `success` stays.

## Attacks that failed (the gate held)
- Kept paths: `.GitHub/…` and `prisma/MIGRATIONS/…` hold (case-insensitive). A migration's SQL holds. A quoted key on a removed line holds (keys.ts DUTY_KEYS, audit keys.ts). A rename out of a kept path holds.
- An empty patch with `changes > 0` holds as "too large". A files answer that is an object returns exit 2, with block `failure` (fails closed).
- Read-line forms that correctly failed: a 6-character SHA, 41 hex characters, an older head (different prefix), and a `> ` quote, including an indented one. A list item (`- Lead read: …`) also holds.
- Read-line forms that correctly freed it: uppercase words and SHA, and a CRLF body.
- Bad comment data held: a `null` body, a comment with no association, and NONE / CONTRIBUTOR / FIRST_TIME_CONTRIBUTOR / MANNEQUIN authors. The workflow `if:` also drops comments by outsiders.
- Odd file names: spaces, quotes and unicode do not crash. A newline only adds names, which means a false hold. Workflow-command text in a name never reaches the start of a log line: `tick` and `paste` join the names onto one line.
- A non-numeric PR number in the event payload is refused. The PR's code is never checked out: `ref: main`, sparse checkout, `persist-credentials: false`, no `${{ }}` inside `run:`.
- The token goes into a mode-600 header file that is removed on exit, and is never echoed. The only write scope is `statuses`.
- A pure rename, or a change with `changes: 0` and no patch, is correctly not held.
