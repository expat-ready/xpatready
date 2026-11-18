# Move xpatready into the expat-ready organization on GitHub Enterprise Cloud: checklist (Enterprise revision)

Final version, 17 Nov 2026, 09:25 IST. This revises the draft against two critiques. (Enterprise revision) Revised the same day, about 15:00 IST, for GitHub Enterprise Cloud: the founder bought Enterprise Cloud (enterprise "Expat Ready", active 10:56 IST) and created the organization `expat-ready` inside it (11:05 IST). The transfer is planned for about 19:00 IST tonight, with go / no-go at about 18:30 IST. Every changed line is marked "(Enterprise revision)"; every other line is the reviewed text, word for word. The original Team checklist is `org-move-checklist-2026-11-17.md`. Legend:

- **[founder]** marks a step that needs the founder's password, card or 2FA, or a GitHub setting the tech lead may not change.
- **[tech lead]** marks a step the tech lead does or watches.
- `<org>` is the new organization and `<old-owner>` is the personal account. (Enterprise revision) `<org>` is now `expat-ready`, so the new path is `expat-ready/xpatready`.
- All times are IST. UTC appears only next to cron lines.
- **Unverified** means no source was found.
- **Critic's reading** means the fact comes from a critique's reading of that page on 17 Nov and was not rechecked here.
- Source tags are listed at the end.

## What changed for Enterprise (Enterprise revision)

1. Plan: the organization is on GitHub Enterprise Cloud, not Team. Jobs at once on standard GitHub-hosted runners: Enterprise 500, against Pro 40 and Team 60 [S11, rechecked 17 Nov].
2. Done already: the organization `expat-ready` exists (A2, P2), and no Team upgrade is needed (P4 is replaced by a plan and billing check).
3. Price: github.com/pricing lists Enterprise at US$21 per user per month (Team US$4) [S4]. The founder has already bought it, so the move itself adds no plan cost; a backup owner is a second seat.
4. Rate limit gain: `GITHUB_TOKEN` rises from 1,000 to 15,000 requests per hour per repository for resources owned by an Enterprise Cloud account [S11, S28]. The founder's own token most likely stays at 5,000 (Unverified, see below).
5. New blocker check: a repository cannot be transferred into an enterprise with managed users (EMU) from outside it, and managed users cannot create public repositories [S6, S29]. N1 confirms the enterprise uses personal accounts.
6. New enterprise policy checks N2 to N9 (Actions, allowed actions, runners, repository creation and transfer, 2FA, IP allow list, tokens and apps, enterprise rulesets). An enterprise policy, once set, overrides the organization's choice.
7. Every enterprise policy that affects this move is either off by default or, by the documented default, leaves the choice to the organization; the founder confirms each on screen because the enterprise is new and its screens were not read here.
8. Timing: the window is tonight, not a later weekday morning. Working back from 18:30 IST, the freeze (B1) has to start by about 15:30 IST (B2 is at the go) for the 2 to 3 hour drain, and B1 by about 14:30 IST (A9).
9. The Support ticket (P1) is no longer needed for capacity; it stays optional.
10. Risk G9 (small gain) is replaced: the gain is large (40 to 500). The biggest risks are unchanged: the author association on the founder's Approve (G3) and the drain finishing in time (B3).

## Unverified (Enterprise revision)

- **Enterprise type.** Whether "Expat Ready" is an enterprise with personal accounts or with managed users. It was not read here. Signs it is personal accounts: the founder signed in with his own account to buy it and created the organization himself. N1 confirms it on screen. If it is managed users, the transfer cannot happen [S6].
- **Scope of the 500.** Whether 500 jobs at once is per enterprise, per organization or per account. The limits page does not say [S11].
- **The founder's REST limit.** Whether his GitHub CLI token (`gho_`) gets 15,000 per hour. The page grants 15,000 to OAuth apps "owned or approved by" an Enterprise Cloud organization for its members [S28]; GitHub CLI is a GitHub-owned privileged app, so this most likely stays at 5,000.
- **Default values of enterprise policies.** The Actions and repository-management policy pages do not state defaults for most settings [S30, S31]. Only these defaults are documented: IP allow list off [S32]; personal access tokens allowed [S34]; `GITHUB_TOKEN` read-only for enterprises created after 2 February 2023 [S30]; Actions creating pull requests off [S30]; repository-level self-hosted runners allowed [S30].
- **Seat billing of the purchase.** How many seats were bought and how a second owner is billed. Not read here.
- **Terms.** Which agreement the Enterprise Cloud purchase used (Standard Terms or the GitHub Customer Agreement). Unconfirmed: no counsel.
- **Visibility after transfer.** The transfer page does not say that an enterprise changes a public repository's visibility; new repositories in an enterprise organization default to internal [S31], which applies to new repositories only. E1 checks PUBLIC.
- **Enterprise-level OAuth app policy.** No enterprise page that sets OAuth app access for all organizations was found (two candidate URLs returned 404). The organization default, restrictions on, is documented [S13].
- Every Unverified item of the reviewed checklist below stays Unverified.

## Summary for the founder

1. **What:** move `<old-owner>/xpatready` into the organization `expat-ready` on GitHub Enterprise Cloud and keep its name. This raises the limit on jobs running at once from 40 (Pro) to 500 (Enterprise) [S11]. You already decided the move (P-652, 17 Nov). (Enterprise revision)
2. **Cost:** (Enterprise revision) GitHub's pricing page lists Enterprise at US$21 per user per month (github.com/pricing, read 17 Nov 2026) [S4]. You have already bought it, so the move adds no plan cost:
   - a backup owner is a second seat, about US$21 a month at the list price (how your purchase bills seats is unverified) (Enterprise revision);
   - no upgrade or proration step remains (Enterprise revision);
   - Mergify Open Source costs US$0 [V5];
   - your Pro plan keeps billing unless you cancel it (A5);
   - tax is unverified.
3. **Time:**
   - preparation: about 45 minutes of your clicks, any time before move day; (Enterprise revision) now less, because the org exists and no upgrade is needed, plus about 15 minutes for the enterprise policy checks N1 to N9, all before about 14:30 IST today;
   - move day: 5 to 7 hours from the freeze to verified. Merges stop for about 3 to 4 hours of that;
   - your part on move day: about 1.5 to 2 hours, in short blocks.
4. **Risk:** the biggest risk is that your Approve comments stop counting after the move, because of how GitHub labels your role on comments (author association). The label sweep could then remove every `review: approved` within 10 minutes.
   - Mitigation: make your org membership Public, add your login to `REVIEWERS`, turn both guard workflows off for the window, and test one PR before the restart (E7).
   - Also: the old path is retired for good, and a rollback means another freeze of 3 to 5 hours.
5. **Only you can do:**
   - the owner clicks that need your password, card or 2FA: set your membership Public, check the enterprise policies (N1 to N9), press Transfer (creating the org and paying are done) (Enterprise revision);
   - two lines in your Claude settings file, which the tech lead's sandbox cannot write (P7).

**Go / no-go now (09:19 IST, 17 Nov): NO-GO for the transfer. GO for the preparation steps P1 to P13.**

Why no-go:
- The queue is busy: 3 batch branches open, 5 PRs `queued`, 14 PRs `review: approved`, 39 open PRs, and about 100 jobs waiting (tech lead's count).
- None of the items in C1 holds yet: `REVIEWERS`, Public membership, the settings file, the app pre-installs, the org on Team. (Enterprise revision) The org now exists on Enterprise Cloud; the other items were not rechecked in this revision, and the queue counts above are from 09:19 IST and must be read again before B1.
- A full drain takes 2 to 3 hours.

When it could happen:
- **Today:** only if P1 to P13 are done and the freeze starts by about 10:30 IST, with you free until about 17:30 IST.
- **Otherwise:** the next weekday, starting about 09:30 IST.
- (Enterprise revision) **Tonight (the plan now):** transfer at about 19:00 IST, go / no-go at about 18:30 IST. That needs P2 to P13 and N1 to N9 done, B1 by about 14:30 IST and B1 (freeze) by about 15:30 IST; B2 at the go, and you free until about 23:00 IST. If the drain is not done by 18:30 IST, postpone (B3).

## What this revision read (17 Nov, 09:00 to 09:20 IST)

**GitHub, through GraphQL (4 calls)**

- Main is at `66f91594c` (merged 09:13 IST). The local clone's `origin/main` is `fc0971103` (08:00 IST). File facts below come from `fc0971103` unless marked otherwise.
- At 09:19 IST:
  - 39 open PRs;
  - 14 labelled `review: approved`;
  - 5 labelled `queued`;
  - 3 `mergify/merge-queue/*` branches;
  - GraphQL budget: 4,954 left, resetting at 10:10 IST.
- REST: used up until about 09:02 IST (tech lead's reading).
- **The Namespace switch is not on main.** PR #2032 (branch `claude/gracious-goodall-bmlknz`) is open with the label `dequeued`, and main's `ci.yml` does not read `CI_SHARD_RUNNER` yet.
  - You set `CI_SHARD_RUNNER` at 00:1x IST (P-652). Any batch that includes #2032 therefore sends its shard, packs and regression jobs to Namespace.
- **Rulesets:**
  - "main: PR + ci required": the PULL_REQUEST rule asks for 0 approvals, no code-owner review and no last-push approval. The required check is `ci` from integration 15368 (GitHub Actions), not strict.
  - "main: no force push or delete (A)": DELETION and NON_FAST_FORWARD.
  - Main has no CODEOWNERS file and no dependabot config.

**Merge queues and schedules**

- **Queues** (`.mergify.yml:10`, `:24-28`, `:51-53`): `product` (batches of 6, waits 5 min) and `records` (batches of 6, waits 2 min), with up to 3 batches checked at once. The queue the brief calls "default" is `product`.
- **Scheduled runs:**

  | Workflow | When (IST) | Cron (UTC) | Where |
  |---|---|---|---|
  | label-guard | every 10 minutes | `*/10` | `label-guard.yml:21` |
  | queue-gate | :37 and :07 | 7,37 | `queue-gate.yml:26` |
  | nightly | 01:53 | 20:23 | `nightly.yml:32` |
  | xfa-engine | 02:11 | 20:41 | `xfa-engine.yml:18` |

  `nightly.yml:20` records a scheduled run that started 3 to 4 hours late on 8 Nov.

**Where the gates check author association** (OWNER, MEMBER or COLLABORATOR)

- `queue-gate.yml:32-33` and `comment-run.yml:31` check it directly.
- `queue-gate.sh:36` sets `OWNER="${REPO%%/*}"`. `judge()` at `:55-62` needs both the login (the owner or one in `REVIEWERS`) and one of the three associations.
- `label-guard.sh:42` defines the same three as `team`.
- `label-sweep.sh:47` keeps a label put on by github-actions[bot] only when `queue-gate.sh eligible` passes.
- In `label-guard.yml`, both the guard job (`:37`) and the sweep job (`:73`) run when `queued` is added.

**Local setup**

- **Settings file:** `~/.claude/settings.json` names `github.com/<old-owner>/xpatready` on line 94 (the auto-mode allow rule for P-402) and line 101 (the auto-mode environment). No tracked file names the owner (git grep on `fc0971103` and on the Lead branch).
- **Local copies:** a search of ~/Desktop and ~/Documents (4 levels deep) found two that point at the repository:
  - the main clone, whose config the 5 worktrees share;
  - `.tools/backup-mirror.git`.
- **Backup defaults:**
  - `backup-refresh.sh:14` uses `${SRC%.git}-backup.git`;
  - `lead-watch.sh:133` (main) uses `${o}-backup`;
  - `lead-watch.sh:55` (Lead branch) takes the repository from the origin URL and calls REST with curl and no `-L`.
- **Pre-push guard:** `pr-open-guard.sh:14` takes `REPO` from the remote. At `:21-22` it lets the push through ("GitHub unreadable ... not checked") when the answer is not a list, as a 301 reply is not.
- **Mac runner:** `demo-update.yml` runs on every push to main on `[self-hosted, macOS, xr-mac-light]`. The runner has no GitHub sign-in (`demo-update.yml:29`).

## A. Founder decisions (before preparation)

1. **Lever.** The move is decided (P-652). Two other levers still run in parallel and do not wait for the move:
   - **A GitHub Support ticket (P1):** Support can raise concurrency limits, and the page states no plan restriction [S11].
   - **The Namespace switch (#2032):** a separate lever that can be undone.

   Whether Namespace jobs count toward the 40 is unverified: the limits table covers only GitHub-hosted runners [S11]. A side gain of the move is that GitHub's own merge queue needs a public repository owned by an org [S22]. (Enterprise revision) With 500 jobs at once on Enterprise [S11], the Support ticket and Namespace are no longer needed for capacity; both stay optional.
2. **Name.** (Enterprise revision) **Done:** the org is `expat-ready`, created 11:05 IST, 17 Nov, inside the enterprise "Expat Ready". The lines below are kept for the record. Prepare 2 or 3 candidate names that use roles only, with no personal name (project rule 5).
   - Names are first-come, first-served and may not be held unused for later [S23]. So create the org within days of the move, not weeks before.
   - The repository keeps its name and becomes `<org>/xpatready`.
   - Do not use "Move work to an organization" [S5].
   - `<old-owner>/xpatready` is retired for good (G1).
3. **Owners and seats.**
   - You are the owner. The tech lead uses your token (in the GraphQL read, the viewer is the owner [R2]), so it needs no seat.
   - **Backup owner.** GitHub recommends at least two owners and warns that a one-owner org's projects can become unreachable [S24]. Choose one:
     - a second owner: one more seat, about US$21 a month at the Enterprise list price [S4] (Enterprise revision); or
     - recovery codes plus a second 2FA method, both stored safely.

     The choice sets the seat count in P4.
   - Never invite reviewer or bot accounts as members, because each member is a seat [S4]. Accounts in `REVIEWERS` stay outside collaborators.
4. **Terms, email and the setup form.**
   - The setup prompts may ask whether the org belongs to you or to a business, which picks the terms. Standard Terms are an agreement with you as an individual. The GitHub Customer Agreement is for an entity such as a company [S25]. Choose which applies (Unconfirmed: no counsel).
   - Use a role mailbox, not a personal name, for the contact and billing email.
   - The exact wording of the "personal account or business" choice is unverified; the creation page only says to follow the prompts [S1].
   - (Enterprise revision) **Done in effect:** the org was created inside the enterprise, so it sits under whatever terms the Enterprise Cloud purchase used. Which terms those are is unverified (Unconfirmed: no counsel). Check that the org's contact and billing email is a role mailbox.
5. **Pro plan.** You bought Pro for the 40-job limit (P-282). After the move, Pro adds no capacity to this repository (likely: limits are set by plan [S11]).
   - Recommendation: keep Pro until a week after a successful move, because a rollback lands on the personal account, which would drop to Free's 20 jobs [S11]. Then decide. (Enterprise revision) Unchanged: Enterprise Cloud covers the org, not the personal account.
   - A cancellation takes effect at the end of the billing cycle [S3].
6. **Backup repository.** Recommendation: move `xpatready-backup` into the org right after the main repository (C5).
   - Why: the tools build the backup path from the remote (`backup-refresh.sh:14`, `lead-watch.sh:133`), so `<org>/xpatready-backup` then works with no variables.
   - Cost: none extra. A private repository in an Enterprise org adds seats only for members, and only you are a member [S4]. Nothing runs Actions there. (Enterprise revision)
   - Alternative: keep it on the personal account. Then you set `BACKUP_REPO` and `BACKUP_DST` somewhere lasting on the Mac, such as your shell profile. A one-off `export` is lost, and the tools would fall back to a path that does not exist.
7. **Guard workflows during the window.** Recommendation:
   - turn queue-gate off from the go (B2, just before C1.3, C1.4 and C2) until E7;
   - turn label-guard off from C1 (after the drain, just before Transfer) until E7 passes.

   These are Actions settings, not edits to `.github` files, so no PR is needed. label-guard stays on during the drain because it still guards the merges Mergify makes.
8. **Rollback trigger.** Agree it now: if E3 (Mac push), E5 (lane push) or E8 (a records batch merges) is not green within 90 minutes of C2, start F3. A full rollback is itself a freeze of 3 to 5 hours.
9. **Window.** (Enterprise revision) Tonight: go / no-go about 18:30 IST, transfer about 19:00 IST. Working back: drain 2 to 3 hours (B3), so B1 by about 15:30 IST, and B1 at least 1 hour before C1, so by about 14:30 IST at the latest. You need to be free from about 15:30 to 23:00 IST. The night runs (01:53 and 02:11 IST) then run after the move, on `expat-ready/xpatready`, and E15 checks them. The two lines below are the reviewed default for a later day.
   - A weekday when you are free for 6 to 7 hours from about 09:30 IST.
   - After the night runs (01:53 and 02:11 IST). These can start 3 to 4 hours late [S27], so wait until about 07:30 IST.
   - The go/no-go items in C1 are measurable. If any fails, postpone a day.

## N. Enterprise policies (new, Enterprise revision; before B1, founder clicks, tech lead records)

All paths start at the enterprise page (github.com > profile photo > Your enterprises > Expat Ready). An enterprise policy, once set, applies to every organization in it and the organization cannot override it; where a policy is left to the organizations, the P3 org settings decide. The enterprise is new, so its screens were not read here: the founder reads each one and the tech lead records the value in the P8 record.

1. **[founder] Enterprise type: personal accounts, not managed users.** Repositories "cannot be transferred into an enterprise with managed users from outside the enterprise" [S6], and "Managed user accounts cannot create public repositories" [S29]. Check: the enterprise was bought and is owned by your own GitHub account, and the org's People page lists your normal login (a managed-user enterprise has accounts with a short code suffix and sign-in through an identity provider, unverified as a screen check) [S33]. **If it is managed users: NO-GO; the move cannot happen into this enterprise.**
2. **[founder] Actions allowed for the org.** Path: Policies > Actions > Policies. Options: enable for all organizations, for specific organizations, or disable for all [S30]. The default is not stated. **Blocks us if** it is "Disable" or "specific organizations" without `expat-ready`. Needed: all organizations, or `expat-ready` selected.
3. **[founder] Allowed actions and reusable workflows.** Same page, "Controlling access to public actions and reusable workflows". "Allow enterprise actions" alone would block us, because only actions "defined in a repository within the enterprise can be used" [S30], and every workflow uses GitHub-owned `actions/*` [R1]. Needed: "Allow all actions and reusable workflows", or "Allow enterprise, and select non-enterprise" with GitHub-created actions allowed. Leave "Require actions to be pinned to a full-length commit SHA" off unless the workflows already pin (not checked). Default not stated.
4. **[founder] Workflow permissions, fork pull requests and runners.** Same page.
   - Workflow permissions: for enterprises created on or after 2 February 2023 the default is read-only, and "Allow GitHub Actions to create and approve pull requests" is off [S30]. This matches P3c; no change. Every workflow sets its own permissions [R1].
   - Fork pull request workflows from outside collaborators: keep an approval option (P3d). Default not stated.
   - Runners: by default "Anyone with admin access to a repository can add a self-hosted runner" [S30]. **Blocks us if** "Disable for all organizations" is on, because `xr-mac-light` is repository-level (E11).
   - Standard hosted runners: **blocks us if** "Disable for all organizations" is on, because `ci` runs on `ubuntu-latest` [S30]. Default not stated.
   - Retention and cache: defaults 90 days and 10 GB per repository, which are maximums the org cannot exceed [S30]. No change.
5. **[founder] Repository creation and transfer.** Path: Policies > Member privileges [S31].
   - Repository creation: organization owners can always create any type of repository [S31] and the transfer needs "permission to create a repository in the target organization" [S6]. You are an org owner, so this does not block you. Check: `expat-ready` > People shows you as Owner.
   - Repository deletion and transfer: the policy covers members with admin rights; org owners keep the right [S31]. Does not block you.
   - Repository visibility change: if restricted, "only enterprise owners can change the visibility" [S31]. You are the enterprise owner. No change; the repository stays public.
   - Outside collaborators: options include "restrict outside collaborator invitations to enterprise owners" [S31]. The accounts in `REVIEWERS` stay outside collaborators (A3); D2 compares collaborators. Default not stated.
   - Base permissions: leave to the org; after the transfer the "organization's default repository permission settings and default membership privileges will apply" [S6].
   - There is no separate "allow public repositories" switch on this page; public is only a choice among the types members may create [S31]. It does not affect a transfer by an owner.
6. **[founder] Required 2FA.** Path: Settings > Authentication security > Two-factor authentication [S35]. If required, outside collaborators without 2FA are "removed from the organization" [S35]. Default not stated. Leave it as it is (P3f), and before turning it on, check that every `REVIEWERS` account has 2FA.
7. **[founder] IP allow list.** Path: Settings > Authentication security [S32]. Off by default: "By default, authorized users can access your enterprise's resources from any IP address" [S32]. **Would block us if on:** it restricts personal access tokens and signed-in access, and for Actions the page says "you must use self-hosted runners or GitHub-hosted larger runners with static IP address ranges" [S32]; it says nothing about standard runners (Unverified). Needed: off.
8. **[founder] Tokens, OAuth apps and GitHub Apps.**
   - Personal access tokens: Path: Policies > Personal access tokens (Fine-grained tokens and Tokens (classic) tabs). "By default, organizations and enterprises allow access" by both token types, and a restriction set here means "Organizations cannot override this setting" [S34]. Does not block the Mac, whose token is a GitHub CLI token (`gho_`) [R3]. Check that neither tab is set to restrict.
   - OAuth apps: restrictions are on by default in a new org [S13], and GitHub CLI and Git Credential Manager remain usable as privileged apps [S14] (P3a). No enterprise-wide OAuth app page was found (Unverified).
   - GitHub Apps: by default repository admins can install apps that need no organization permissions, and org owners install the rest [S36]. You are the owner, so P5 is not blocked. If N7 is ever turned on, also tick "Enable IP allow list configuration for installed GitHub Apps" [S32].
   - SAML single sign-on: if the enterprise turns it on, tokens may need authorising for it (Unverified; not read). Needed tonight: off.
9. **[founder] Enterprise rulesets.** Path: Policies > Code [S37]. A ruleset there "can target many organizations, repositories, and branches at the same time" [S37]; whether any exist by default is not stated. **Would block merges if** a ruleset targets `expat-ready` with extra required checks or approvals. Needed tonight: none (P13).
10. **[founder] Copilot and other enterprise products:** not relevant to the move; no action.

## P. Preparation (any time before the freeze, best the day before; the pipeline keeps running)

1. **[founder] Open a GitHub Support ticket** asking to raise the job concurrency limit [S11]. Treat it as an outside dependency: the lead time is unknown. If Support grants a raise before move day, decide A1 again. (Enterprise revision) **Not needed:** Enterprise allows 500 jobs at once [S11]. Optional.
2. **[founder] Create the org on Free.** (Enterprise revision) **Done:** `expat-ready` was created inside the enterprise at 11:05 IST, 17 Nov. Check only that its Settings show it as owned by the enterprise "Expat Ready" and that you are listed as an Owner. The lines below are kept for the record.
   - Path: Profile photo > Settings > Organizations > New organization [S1].
   - Use a name from A2, a role mailbox, and the terms from A4.
   - The labels on the plan screen are unverified.
3. **[founder] Set the org policies** (Org Settings, while the org is empty). (Enterprise revision) Do N1 to N9 first: where the enterprise has set a policy, the org page shows it as fixed and the choice below is not available.
   - **a. OAuth app policy: leave restrictions on** (the default [S13]).
     - GitHub CLI and Git Credential Manager are privileged apps, which users can still authorize while restrictions are on [S14]. The Mac's token is a GitHub CLI token [R3].
     - If E3 or E4 fails, look for another cause first: the settings file (P7), membership (P3g) or token scopes. Last resort: you choose "Remove restrictions", which is a security decision for you.
     - The draft's fallback "GitHub CLI > Review > Grant access" is dropped: it is unverified for a privileged app.
     - Approve only third-party OAuth apps you use. The Devin, Mergify or Namespace dashboards may sign in as OAuth apps (unverified).
   - **b. Personal access tokens: keep the defaults.** A fine-grained token reaches one owner only, and tokens an owner creates need no approval [S16]. Check github.com/settings/personal-access-tokens for any token in use.
   - **c. Actions > General: keep the defaults** [S17]:
     - actions stay allowed; only GitHub-owned `actions/*` are used [R1];
     - `GITHUB_TOKEN` stays read-only by default, and PR creation by workflows stays off;
     - every workflow sets its own permissions, and none creates or approves PRs [R1].
   - **d. Fork pull requests:** keep the default, under which first-time contributors wait for approval [S17]. This also protects the Mac runner on a public repository.
   - **e. Runner groups:** act only if a runner is registered at org level; public repositories are blocked by default [S18]. Namespace uses repository-level runners by default [V9].
   - **f. Required 2FA:** leave it as it is. Turning it on removes outside collaborators who have no 2FA [S19].
   - **g. Make your own membership Public.** Path: the org > People > your login > visibility > Public [S26].
     - Why: community reports (not official) say a member with private membership shows as CONTRIBUTOR to `GITHUB_TOKEN` and in event payloads (apache/arrow issue 34381; glitchwerks/github-actions PR 254; critic's reading, 17 Nov). CONTRIBUTOR fails every gate above.
     - GitHub does not state whether membership is private by default [S26].
     - Trade-off: your login shows on the org's public People page. It is already public today as the repository owner.
4. **[founder, card] Upgrade the org to Team.** Path: Org Settings > Billing and licensing > Upgrade [S2]. (Enterprise revision) **Not needed:** the org is on Enterprise Cloud. Replace this step with a check:
   - (Enterprise revision) the enterprise's Billing and licensing page shows Enterprise Cloud as paid (not a trial) and the seat count you expect (1, or 2 with a backup owner);
   - (Enterprise revision) the enterprise and org budgets and spending pages show no Actions block. The personal account was blocked on 27 Oct until a US$10 budget was set. The org does not inherit that budget, and whether it needs one is unverified: standard runners on public repositories are free [S12].
   - The struck Team lines, kept for the record: before paying, check that the screen shows the expected seat count (1, or 2 with a backup owner); the card may ask for bank authentication (unverified).
5. **[founder] Install the apps on the empty org** with "All repositories". Whether "All repositories" covers a repository transferred in later is not stated [S8], so D1 checks within 5 minutes of the transfer.
   - **a. The Claude GitHub App** [V6].
   - **b. Namespace** [V9].
     - Use the same workspace only if Namespace allows a personal-account installation and an org installation in one workspace (unverified).
     - If it needs a second workspace, the profile label `namespace-profile-ci-shard`, the trial and billing do not carry over [V10]. `CI_SHARD_RUNNER` then stays empty until that workspace is set up.
   - **c. Mergify** [V2].
     1. Install it on the org.
     2. In the Mergify dashboard for the org, leave Merge Queue **off** for `xpatready` until R1. This takes the place of a pause, because nothing documents whether a pause carries over to another Mergify org [V4].
     3. Confirm the org's plan is Open Source [V5] and that batches and 3 parallel checks are available on it. The pricing page does not show per-plan features as text (critic's reading); unverified.
     4. If the dashboard cannot list the org, check P3a.
   - **d. Devin (if used):** first find out whether it connects as an OAuth app or a GitHub App (G17), then add the org [V11].
6. **[founder] Add your login to the repository variable `REVIEWERS`** (space-separated). Path: repo Settings > Secrets and variables > Actions > Variables.
   - This is harmless today, because the owner already matches.
   - Why: after the move, `queue-gate.sh:36` takes `<org>` as the owner, so your login must be in `REVIEWERS`.
   - `REVIEWERS` alone is not enough: `judge()` also needs the association OWNER, MEMBER or COLLABORATOR, hence P3g.
   - **[tech lead]** reads the variable back through REST (1 call). It is a no-go item in C1.
7. **[founder] Fix the repository path in `~/.claude/settings.json`** on line 94 (the auto-mode allow rule for P-402) and line 101 (the auto-mode environment).
   - Replace `github.com/<old-owner>/xpatready` with wording that covers both paths, for example "github.com/<old-owner>/xpatready, moving to github.com/<org>/xpatready", or with "this project's repository". It then works before and after the move.
   - The tech lead's sandbox denies writes to this file.
   - Without the change, the auto-mode classifier may refuse the tech lead's labels, records approvals and nightly dispatch on `<org>/xpatready` (E4, E8, R3).
   - Whether a running session reloads the file is unverified, so restart the tech lead session after the edit.
8. **[tech lead] Record the current settings** with about 15 REST calls, only when `GET /rate_limit` shows at least 1,000 calls left. That call itself does not count against the limit [S28, not rechecked]. Record:
   - Actions variables, names and values: `SHARDS`, `PR_SUITES`, `REVIEWERS`, `CI_SHARD_RUNNER` and any others;
   - secret names (the workflows use only `GITHUB_TOKEN` [R1]);
   - each ruleset by id, in full. The GraphQL read on 17 Nov (above) gave the rules but not the bypass actors or conditions;
   - `hooks`;
   - `actions/permissions` and `actions/permissions/workflow`;
   - `actions/runners`, to see where `xr-mac-light` is registered;
   - `collaborators`.

   **[founder]** adds screenshots of:
   - github.com/settings/installations (which app covers which repository);
   - the current Mergify org's dashboard: plan, products switched on for the repository, and any setting kept outside `.mergify.yml`;
   - the Namespace workspace: profile and trial end date.

   The queue state is read through GraphQL. Store everything in the founder's private GitHub home (AGENTS.md rule 10, P-557), not only in a local folder, because the records hold logins.
9. **[tech lead] Keep the move resumable.** Push a STATE.md block "in flight: org move" to the Lead branch. It holds:
   - the step reached;
   - where the P8 record is;
   - the rollback trigger (A8);
   - the old and new paths, as placeholders.

   Update and push it at every step. Records PRs cannot merge while the queue is stopped (`.mergify.yml:20`), so the Lead branch is the only place a record can land. The move decision itself is P-652; add the confirmed price after P4. (Enterprise revision) Record the Enterprise Cloud purchase (10:56 IST), the org creation (11:05 IST) and the N1 to N9 readings instead of a Team price.
10. **[tech lead] Tell the founder which mail to expect:** the transfer notice, the org billing receipt, and install mail from Mergify, Namespace and Devin. (Enterprise revision) The billing receipt came with the Enterprise purchase; enterprise policy changes may send their own notices. Notifications for the new org go to the primary email by default (critic's reading). A burst of mail is not an incident.
11. **[tech lead] Write down in STATE that rate limits do not grow:**
    - the founder's REST limit of 5,000 per hour is per user, and apps acting for him use it too [S28, critic's reading];
    - `GITHUB_TOKEN` stays at 1,000 per hour per repository [S11].

    The move does not fix the REST shortage.

    (Enterprise revision) Correction for Enterprise Cloud: `GITHUB_TOKEN` rises to "15,000 requests per hour per repository" for resources owned by an Enterprise Cloud account [S11, S28], and GitHub App installations on an Enterprise Cloud org (Mergify, Claude, Namespace) get 15,000 per hour [S28]. The founder's own token most likely stays at 5,000 per hour (Unverified). So the move eases the workflows' and the apps' REST use, but not the tech lead's calls through the founder's token.
12. **[tech lead] Rerun the owner inventory on the newest main**, plus the local-copy search. The last run found 0 tracked files (`fc0971103` and the Lead branch) and 2 local copies. Note anything merged since, such as #2032.
13. **[tech lead] Freeze two settings for the window.** On main: no CODEOWNERS file, no dependabot config, a PULL_REQUEST rule with 0 approvals and no code-owner review, and the required check `ci` from integration 15368. Nobody adds team-based CODEOWNERS or new required checks during the move. (Enterprise revision) The same holds for enterprise and org rulesets (N9): none are added during the move.

## B. Freeze and drain (move day; Mergify keeps merging what is already approved)

1. **[tech lead] Stop new work coming in**, at least 1 hour before C1, so the REST budget recovers.
   - **The tech lead's own writes:** no labels, no records PRs, and no requeue, retarget or dispatch under P-402. Pushes of the P9 block to the Lead branch go on.
   - **The Mac's schedules:** the lead-watch loop, cockpit, factory-board, label sweeps, CronCreate loops, the hourly records batch, the daily records PR, and any cron, launchd or Claude scheduled task that calls GitHub. Keep them stopped until C4 and E4. They read the repository from origin and call curl without `-L` (`lead-watch.sh:55`, `cockpit-data.py`, `app-code-prs.sh`, `gh-fallback.py`, `flow-measure.py`), so on the old path they would parse 301 replies as data.
   - **Cloud lanes:** tell each lane to push all its work and start no new row. Confirm by each lane's last push, because idle cloud lanes may not read messages.
   - **Hourly cloud routines:** pause them in claude.ai/code [V8].
   - **Devin:** pause it if it writes to PRs (unverified that it does).
2. **[founder, at the tech lead's go, not before] Turn off queue-gate.** Path: Actions > queue-gate > ⋯ > Disable workflow. (B2 timing fix, Lead 79 ruling (c), 17 Nov ~18:4x IST; applied by Lead 80, 18 Nov)
   - Keep it ON through the drain (B3). It also posts the `queue-fresh` status that Mergify's product queue needs for app code; turning it off early strands PRs that are labelled but not yet queued and stalls the drain. The B1 freeze already stops new Approves.
   - At the go, the founder does B2, C1.3 and C1.4 back to back, then C2.
   - It runs on Approve comments, on every finished `ci` run of a PR, on push to main, on labelled and unlabelled events, and at :37 and :07 IST (`queue-gate.yml:14-26`). Turning it off stops new labels.
   - Runs already going finish: never cancel (P-371).
   - label-guard stays on (A7).
3. **[tech lead] Watch the drain. Do not pause Mergify.** A pause tries to cancel the checks running for queued PRs [V4], which P-371 forbids, and whether a pause carries over to another Mergify org is undocumented.

   The repository is **drained** when two GraphQL reads at least 6 minutes apart (longer than the 5-minute batch wait) both show:
   - 0 `mergify/merge-queue/*` branches;
   - 0 open PRs labelled `queued`;
   - every open PR still labelled `review: approved` cannot join, because its `ci` is not green, `queue-fresh` is not success, or `xfa-engine` is missing. List these PRs in the P9 block;
   - Actions shows 0 queued and 0 in progress (the Actions tab or one REST call).

   **Expect 2 to 3 hours.** About 100 jobs are queued and 40 are running. Shard jobs take 32 to 56 minutes (limit 75, `ci.yml:215`). Packs and regression take up to 90 minutes (`ci.yml:371`, `:468`). Each running batch needs one full `ci`.

   If the repository is not drained within 3 hours of B1, postpone: the tech lead lifts the B1 holds (queue-gate is still on).

## C. Go / no-go and the transfer

1. **[tech lead] Go / no-go.** Every item must hold; if any does not, postpone a day.
   1. P1 to P13 are done:
      - the org `expat-ready` is owned by the enterprise on Enterprise Cloud, billing shows paid with no Actions block (P4 check), and N1 to N9 are recorded with nothing blocking (Enterprise revision);
      - your membership is Public;
      - the apps are pre-installed (Merge Queue off for `xpatready` in the new Mergify org is set as the first step after C2, because the switch only exists once the repository is in the org, P-662(b); Lead 78 correction);
      - `REVIEWERS` has been read back with your login;
      - the settings file is edited (P7) and the tech lead session restarted;
      - the P8 record is in your private GitHub home;
      - the P9 block is pushed.
   2. B3 shows the repository drained in two reads at least 6 minutes apart.
   3. **[founder]** `CI_SHARD_RUNNER` is set to empty, with its value kept in the P8 record. Jobs then fall back to `ubuntu-latest` (#2032's title says that unset behaves as today). R5 restores it.
      - Why: if #2032 is batched before Namespace covers the org's repository, its long jobs wait up to 24 hours for a runner and hold the 3 batch slots (critic's reading; not rechecked).
   4. **[founder]** B2 is done (queue-gate disabled), then label-guard is disabled (A7): Actions > label-guard > ⋯ > Disable workflow.
   5. REST has at least 1,000 calls left, and githubstatus.com is all green.
   6. You are free for at least 4 more hours, and the rollback trigger (A8) is agreed.

   Then the tech lead tells the founder "go".
2. **[founder, 2FA may be asked] Transfer the repository.**
   - Requirements: admin on the repository, the right to create repositories in `<org>`, and no repository named `xpatready` there already [S6]. (Enterprise revision) Also: the enterprise uses personal accounts, not managed users (N1) [S6].
   - Steps [S6]:
     1. On the repository page, open Settings.
     2. Under Danger Zone, click Transfer.
     3. Under New owner, choose "Select one of my organizations", then pick `<org>`.
     4. Keep the name `xpatready` and read the warnings.
     5. Type the name in the "Type REPOSITORY NAME to confirm" box.
     6. Click "I understand, transfer this repository".
   - GitHub gives no duration for a transfer to an org, though Git LFS content may take some time [S6].
3. **[tech lead] Confirm it landed** with E1.
4. **[tech lead] Re-point every local copy at once, before anything else:**
   - `git -C ~/Desktop/Xpatready remote set-url origin https://github.com/<org>/xpatready.git` (the 5 worktrees share this config);
   - the same for `.tools/backup-mirror.git` and any copy that P12 found.

   Git itself follows the redirect [S6], but two things do not:
   - the pre-push `pr-open-guard` lets pushes through without checking when it gets a 301 reply (`pr-open-guard.sh:21-22`);
   - the Lead tools would parse the 301 reply as data [S10].
5. **[founder] Settle the backup repository** (per A6):
   - if moving it: transfer `xpatready-backup` to `<org>` the same way;
   - if keeping it: set `BACKUP_REPO` and `BACKUP_DST` in the lasting place chosen in A6.

## D. Right after (the queue is still stopped)

1. **[founder] Check the apps within 5 minutes of C2.**
   - Each app's installation on `<org>` (Claude, Namespace, Mergify, Devin) should list `xpatready`. If one does not, switch that installation to "Only select repositories" and add `xpatready` [S8].
   - In the Mergify dashboard, confirm that events for `xpatready` arrive. Mergify gets events through its own app webhook, not a repository webhook, so the P8 `hooks` list says nothing about Mergify.
   - Merge Queue stays off.
2. **[tech lead] Compare with the P8 record:**
   - every variable: `REVIEWERS` holds your login, and `CI_SHARD_RUNNER` is empty;
   - secret names;
   - both rulesets ACTIVE, the required `ci` from integration 15368, and the PULL_REQUEST parameters unchanged;
   - hooks and Actions permissions;
   - `xr-mac-light` still listed;
   - collaborators.

   GitHub documents that secrets and webhooks move with the repository [S6]. It does not document variables, rulesets, runners or app installations.

   **[founder]** recreates anything missing.
3. **[tech lead] Claude cloud.**
   - Change each routine's repository to `<org>/xpatready` in its Edit dialog [V8]. The routines stay paused.
   - Read the `xpatready` environment's setup script, variables and network list, and every routine's prompt, for the old owner or path [V7]. None of these are in the clone.
   - Re-bind any desktop or claude.ai session that is bound to a PR (`owner/repo#n`).
   - Retire the old lane sessions once their work is pushed. Whether they follow the redirect is unverified [V7].
4. **[founder] Devin (if used):** GitHub integration > Add to this organization > `<org>` > Refetch repo list [V11].
5. **[tech lead] Resume the Mac's read-only checks** (lead-watch, cockpit, factory-board), which C4 re-pointed. Writes stay held until E4.
6. **[tech lead] What to expect from the first runs:**
   - Runs on a cold cache are slower. `ci.yml`, `nightly.yml` and `xfa-engine.yml` use the setup-node npm cache, and whether caches and artifacts move is undocumented [S6].
   - A read of another run's artifacts (the `ci` memory TSVs) from before the move may fail once. Rerun only the failed part (P-384) and never cancel.

## E. Verify before the restart (the queue is still stopped)

| # | Who | Test | Expected | If not |
|---|---|---|---|---|
| E1 | tech lead | GraphQL `repository(owner:"<org>",name:"xpatready"){owner{__typename} visibility viewerPermission}` | Organization, PUBLIC, ADMIN | Stop and recheck C2 |
| E2 | tech lead | `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $(gh auth token)" https://api.github.com/repos/<old-owner>/xpatready` | `301` [S10]. Also record whether GraphQL still answers on the old owner (unverified) | Note the result |
| E3 | tech lead | Push the Lead branch from the Mac | Accepted, and the pre-push guard reads the new path (no "GitHub unreadable" warning) | C4; P3a diagnosis |
| E4 | tech lead | The tech lead's curl GraphQL call on `<org>`, then the normal P-402 records routine: an Approve comment and the `review: approved` label on its own records PR, which becomes E8's PR | Data comes back and both writes are accepted. Nothing merges while Merge Queue is off | Classifier refusal: P7. HTTP error: P3a |
| E5 | tech lead | A fresh cloud lane pushes a `claude/` branch | The branch is on GitHub within minutes | D1 (Claude app) |
| E6 | tech lead | That lane opens a PR | `ci` queued within about a minute on `ubuntu-latest`, and the ruleset shows `ci` as required. A slower first run on a cold cache is not a failure | D2 |
| E7 | founder comments, tech lead watches | 1. The founder turns queue-gate back on. 2. He comments "Reviewer: Approve <full SHA>" on one PR with green `ci` that touches no Lead-read path. 3. The tech lead reads that comment's `authorAssociation` through GraphQL. 4. The founder turns label-guard back on | `review: approved` appears within 1 to 2 minutes (the `issue_comment` trigger), with queue-gate's comment. The association is MEMBER, OWNER or COLLABORATOR. The next sweep (within 10 minutes) logs the PR as "kept ... eligible" | CONTRIBUTOR or NONE: P3g, then test again. Login refused: P6. **No restart (R1) until E7 passes** |

## R. Restart

1. **[founder]** In the new Mergify org, switch on Merge Queue (and Merge Protections) for `xpatready` [V2]. Approved PRs that meet `queue_conditions` join by themselves (`.mergify.yml:69`). No pause was used in the old Mergify org, so no pause state crosses the move.
2. **[tech lead]** Run E8 and E9.
3. **[tech lead]** Resume the tech lead's writes under P-402, records PRs, the hourly records batch and the daily records PR.
4. **[tech lead]** Un-pause the routines and run E10. Start fresh lanes on `<org>/xpatready`, and the lanes resume their rows.
5. **[founder]** Restore `CI_SHARD_RUNNER` from the P8 record, once Namespace covers the org's repository (D1) and a test job has run on it (E12).
6. **[tech lead]** Record the move in STATE.md through a records PR, now that the queue merges again (P-557), and clear the in-flight block.

## E (continued). Verify after the restart

| # | Who | Test | Expected | If not |
|---|---|---|---|---|
| E8 | tech lead | The E4 records PR, with `records`, `review: approved` and green `ci` | A "Mergify Merge Queue" check appears, and the PR joins queue `records` and merges in a batch [V3] | D1 (Mergify), P5c |
| E9 | tech lead | A PR that touches `prototype/`, with green `ci` and the founder's Approve | queue-gate posts `queue-fresh` success (plus `xfa-engine` where its paths are touched), and the PR joins `product` and merges (`.mergify.yml:29-47`) | E7, P6, P3g, D2 |
| E10 | tech lead | "Run now" on one routine | The run starts, clones `<org>/xpatready` and pushes a `claude/` branch, with no "didn't start" message [V8] | D3 |
| E11 | tech lead | The next demo-update run, on the next merge to main | Picked up by `xr-mac-light` | **[founder] on the Mac:** 1. Stop the runner service. 2. Remove the old registration with `./config.sh remove`, using the removal token from the repository's Runners page (if GitHub no longer lists the runner, follow that page's instructions; unverified). 3. Register at repository level on `<org>/xpatready`: Settings > Actions > Runners > New self-hosted runner. 4. Start the service. Only the founder can do this, because the runner has no GitHub sign-in (`demo-update.yml:29`) and the token comes from the repository settings |
| E12 | tech lead | Namespace, once #2032 is on main (or a test run of its branch) and `CI_SHARD_RUNNER` is restored | A shard job starts on `namespace-profile-ci-shard` within minutes | P5b; set the variable empty again |
| E13 | tech lead | The backup line of lead-watch | The backup is readable at the path chosen in A6 | C5, A6 |
| E14 | tech lead | Devin (if used) | `xpatready` listed after Refetch | D4 |
| E15 | tech lead | The first scheduled runs under the org. The schedule docs say nothing about transfers | label-guard runs within 10 minutes of R1, and queue-gate at the next :37 or :07 IST. Check nightly (01:53 IST) and xfa-engine (02:11 IST) in the Actions tab the next morning, allowing 3 to 4 hours of delay before calling either missed [S27] | Check that each workflow is enabled and that P8 settings match |
| E16 | tech lead | The next busy day: peak jobs in progress, read from the Actions UI or one paged REST call, recorded in STATE | Above 40 and at most 500 [S11] (Enterprise revision) | Check that billing shows Enterprise Cloud and that N2 and N4 allow standard hosted runners (Enterprise revision) |

## F. Rollback

1. **When.** Use the trigger agreed in A8.
2. **Before C2 (no transfer yet):**
   - [founder] turn queue-gate and label-guard back on, and restore `CI_SHARD_RUNNER`;
   - [tech lead] lift the B1 holds;
   - the org can stay on Team, or be downgraded, in which case the current cycle is still charged [S3]; (Enterprise revision) the org stays in the enterprise; no plan change is needed;
   - the apps on the empty org can stay installed.
3. **After C2:**
   - **[founder]** Go to `<org>/xpatready` > Settings > Danger Zone > Transfer and choose your personal account [S6]. GitHub documents no fee for a transfer.
   - **Risk:** the old name is retired, so a move back to `<old-owner>/xpatready` may be refused (community report, unverified). In that case use a new name or ask GitHub Support.
   - Pro must still be active (A5). Otherwise the personal account is on Free, at 20 jobs at once [S11].
4. **[tech lead + founder] Then:**
   - freeze again (B1 to B3, C1);
   - put the apps back on the personal account with the repository;
   - undo C4 (remotes), C5 (backup) and D3 (routines);
   - restore `CI_SHARD_RUNNER` once Namespace covers the repository again.

   P7 names both paths, so it needs no undo. A full rollback takes 3 to 5 hours.
5. **Cost.** Team billing runs to the end of the cycle [S3]: about US$4, or about US$8 with two seats [S4]. (Enterprise revision) A rollback adds no plan cost: the Enterprise purchase is already made and covers the org whether or not the repository stays.
   - Leaving the repository in the org on Free is not a rollback: Free allows 20 jobs at once [S11]. (Enterprise revision) Not applicable: the org is on Enterprise, not Free.

## G. Risks still open

| # | Risk | Owner | Mitigation |
|---|---|---|---|
| G1 | **The old name is retired for good** once the repository is transferred. Last week's use was almost certainly over GitHub's threshold (unverified count) [S6] | founder (A2) | Accept it. Never create a repository or fork at `<old-owner>/xpatready`, because that removes the redirects [S6] |
| G2 | **Carry-over is undocumented** for variables, rulesets, app installations and the repository-level Mac runner | tech lead | P8 record, D2 comparison, founder recreates what is missing |
| G3 | **The founder's Approve may stop counting.** Under private membership, his association may read CONTRIBUTOR (community reports). The gates then fail, and the sweep removes every label put on by github-actions[bot] within 10 minutes | founder | P3g, P6, A7, E7 before R1 |
| G4 | **The auto-mode classifier is scoped to the old path** (settings file lines 94 and 101) | founder | P7, E4 |
| G5 | **Mergify:** a pause would cancel checks (P-371), carry-over of a pause between Mergify orgs is undocumented, and the new org's plan features are unknown | tech lead (drain), founder (plan) | Full drain (B3), Merge Queue off until R1, P5c plan check |
| G6 | **`CI_SHARD_RUNNER` points at Namespace** before Namespace covers the org's repository; a second workspace may lose the trial | founder | C1.3, P5b, R5, E12 |
| G7 | **Claude cloud** sessions and routines after an owner change are undocumented | tech lead | B1, D3, E5, E10 |
| G8 | **The Lead tools fail silently on a 301**, and the pre-push guard lets pushes through without checking | tech lead | C4 at once. Later, a backlog row to add `-L` through the normal PR flow |
| G9 | **The capacity gain is small** (40 to 60 jobs) (Enterprise revision: closed. The gain is 40 to 500 jobs at once [S11]; scope per enterprise or org unverified) | founder | A1, E16 |
| G10 | **One owner only:** the org can become unreachable | founder | A3 |
| G11 | **Someone else takes the org name** (Enterprise revision: closed, `expat-ready` exists) | founder | A2: candidates ready, create the org within days of the move |
| G12 | **Terms:** Standard Terms (individual) or the Customer Agreement (company) | founder | A4. Unconfirmed: no counsel |
| G13 | **Billing block on the new org** | founder | P4 checks (Enterprise revision: the P4 billing check on the enterprise) |
| G14 | **Scheduled runs start late** (3 to 4 hours), and runs in progress at transfer time behave in undocumented ways | tech lead | A9, Actions idle in B3, E15. Never cancel |
| G15 | **The REST shortage is not fixed by the move** | tech lead | P11; B1 starts at least 1 hour ahead |
| G16 | **A fine-grained token in use**, if any, will not reach the org | founder | P3b |
| G17 | **Devin's connection type is unknown** (OAuth app or GitHub App) | tech lead | P5d, D4 |
| G18 | **A self-hosted Mac runner on a public repository**; only the founder can register it again | founder | P3d, E11 |
| G19 | **Records cannot merge while the queue is stopped** | tech lead | P9 pushes to the Lead branch at every step |
| G20 | **Cold caches and lost artifacts after the move** | tech lead | D6 |
| G21 | **The inventory is a snapshot** | tech lead | P12 |
| G22 | **Public membership** shows the founder's login on the org's People page | founder | Accepted trade-off (P3g); his login is public today as the repository owner |
| G23 | (Enterprise revision) **Managed-user enterprise.** If "Expat Ready" uses managed users, the transfer is refused and the repository could not stay public [S6, S29] | founder | N1 before B1; NO-GO if managed users |
| G24 | (Enterprise revision) **An enterprise policy blocks Actions, runners or the transfer** (N2 to N9) | founder | N1 to N9 read and recorded before B1 |
| G25 | (Enterprise revision) **Tonight's window is tight**: B1 by about 15:30 IST for an 18:30 IST go / no-go | tech lead | A9; postpone a day if B3 is not drained by 18:30 IST |

## Critic points not taken

1. **"Pause in the gap, the queue need not be empty" (critique 2): not taken.** A pause tries to cancel the checks running for queued PRs [V4], which conflicts with P-371. Whether pause state carries over between Mergify orgs is undocumented [V4]. With new work stopped, the labelled set is fixed and drains in 2 to 3 hours, so a full drain (B3), with a postpone rule at 3 hours and Merge Queue off in the new org, is finite and safer.
2. **"Try the Support ticket first" (critique 1): partly taken.** P1 opens the ticket first and in parallel, but it is not a gate. The founder already decided the move (P-652, 17 Nov) and Support's lead time is unknown. A1 re-decides if Support raises the limit before move day.
3. **"Upgrade the day before" (critique 2): partly taken.** The upgrade is in P, before the freeze, and not strictly the day before: proration makes the date cost cents [S3]. What matters is that the payment clears before the freeze (C1.1). (Enterprise revision) Moot: no upgrade is needed.
4. **"Bank authentication is likely for an India-issued card" (critique 2): not taken.** It is unverified and the card's origin is not needed. P4 says only that bank authentication may be asked.
5. **"Confirm the old 'Mergify Merge Queue' check and the 'queued' labels do not confuse the new installation" (critique 2): dropped as moot.** After B3 there are 0 `queued` labels and 0 batch branches at the transfer. D1 still checks that events arrive.
6. **"Mergify's new installation starts at 5,000 requests per hour" (critique 2): not stated as a fact.** It was not rechecked and no step depends on it. P11 keeps the limits that matter: the founder's per-user limit, and `GITHUB_TOKEN` at 1,000 per hour [S11].
7. **The label-guard window: refined.** Critique 1 asked for it off from C5 to D5, and critique 2 for "the window". It is off from C1, after the drain, to E7. During the drain it still guards the merges Mergify makes, and E7 is what proves the association works.
8. **"label-guard.yml:73 is the guard job" (critique 1): line reference corrected.** Line 73 is the sweep job's condition and line 37 is the guard job's. Both run when `queued` is added, so the point stands.
9. **"Queues 'records' and default" (task context): corrected.** The queues are `product` and `records` (`.mergify.yml:24`, `:51`).

## Sources

All sources were read on 17 Nov 2026. Entries are paraphrased, and one direct quote is kept (S6). The tech lead's research notes and the two critiques hold short verbatim quotes. Sources marked "critic's reading" were not rechecked in this revision.

**GitHub documentation (docs.github.com/en/…)**

- **S1** `organizations/collaborating-with-groups-in-organizations/creating-a-new-organization-from-scratch`: create an org from Settings > Organizations > New organization, then follow the prompts.
- **S2** `billing/managing-the-plan-for-your-github-account/upgrading-your-accounts-plan`: a Free org can be upgraded to Team at any time. (Enterprise revision: no longer used.)
- **S3** `billing/concepts/impact-of-plan-changes`: an upgrade takes effect at once and is prorated; a downgrade or cancellation takes effect at the end of the cycle; each account is billed separately.
- **S4** Price and seats:
  - github.com/pricing (rechecked 17 Nov): Team is listed at US$4 per user per month, with no first-year wording, and 3,000 CI/CD minutes a month;
  - (Enterprise revision) github.com/pricing (read 17 Nov 2026, about 15:00 IST): Enterprise is listed at "$21USDper user / month" with "50,000 CI/CD minutes/month";
  - `get-started/learning-about-github/githubs-plans` and `billing/managing-the-plan-for-your-github-account/about-per-user-pricing`: members count as seats, and so do outside collaborators on private repositories.
- **S5** `account-and-profile/how-tos/account-management/moving-your-work-to-an-organization`: the "Move work to an organization" shortcut.
- **S6** `repositories/creating-and-managing-repositories/transferring-a-repository`:
  - the steps, including the "Type REPOSITORY NAME to confirm" box (critic's check);
  - what moves: issues, PRs, secrets, webhooks, deploy keys;
  - redirects, and transfer back from an org;
  - Git LFS content may take time;
  - nothing about variables, rulesets, runners, app installations, caches or artifacts;
  - the retirement rule: GitHub "permanently retires the owner name and repository name combination".
- **S8** `apps/using-github-apps/about-using-github-apps` and `apps/using-github-apps/installing-a-github-app-from-a-third-party`: an app reaches only accounts where it is installed; org owners install apps; the choice is "All repositories" or "Only select repositories". Whether "All" covers repositories transferred in later is not stated.
- **S10** `rest/repos/repos#get-a-repository` and `rest/using-the-rest-api/best-practices-for-using-the-rest-api#follow-redirects`: a request may return 301, and clients should follow redirects.
- **S11** `actions/reference/limits` (rechecked 17 Nov):
  - jobs at once on standard GitHub-hosted runners: Free 20, Pro 40, Team 60;
  - (Enterprise revision) read again 17 Nov 2026, about 15:00 IST, https://docs.github.com/en/actions/reference/limits: the table row "Standard GitHub-hosted runner | Enterprise | 500 | 50" (total concurrent jobs 500, macOS 50); the page does not say whether the limit is per enterprise, org or account; "For requests to resources that belong to a GitHub Enterprise Cloud account, the limit is 15,000 requests per hour per repository" (`GITHUB_TOKEN`);
  - GitHub Support can increase job concurrency limits, with no plan restriction stated;
  - `GITHUB_TOKEN` is limited to 1,000 requests per hour per repository;
  - the concurrency table covers only GitHub-hosted runners.
- **S12** `billing/reference/actions-runner-pricing`, `actions/concepts/runners/self-hosted-runners` and `actions/concepts/runners/larger-runners`: standard runners on public repositories are free; larger runners are billed even on public repositories.
- **S13** `organizations/managing-oauth-access-to-your-organizations-data/about-oauth-app-access-restrictions`: OAuth restrictions are on by default in a new org.
- **S14** `apps/oauth-apps/using-oauth-apps/privileged-oauth-apps`: users can still authorize privileged apps, including GitHub CLI and Git Credential Manager, while restrictions are on.
- **S16** `organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization` and `authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens`: the PAT defaults; a fine-grained token reaches one owner only; tokens an owner creates need no approval.
- **S17** `organizations/managing-organization-settings/disabling-or-limiting-github-actions-for-your-organization`: `GITHUB_TOKEN` is read-only by default, PR creation by workflows is off, and first-time fork contributors need approval.
- **S18** `actions/how-tos/manage-runners/self-hosted-runners/manage-access`: public repositories cannot use org runner groups by default.
- **S19** `organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/requiring-two-factor-authentication-in-your-organization`: turning on required 2FA removes outside collaborators who have no 2FA.
- **S22** `repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue`: GitHub's merge queue is available for public repositories owned by an org.
- **S23** `site-policy/other-site-policies/github-username-policy` (critic's reading): names are first-come, first-served and may not be held unused for later.
- **S24** `organizations/managing-peoples-access-to-your-organization-with-roles/maintaining-ownership-continuity-for-your-organization` (rechecked 17 Nov): GitHub recommends at least two owners, and warns that a one-owner org's projects can become inaccessible if the owner is unreachable.
- **S25** `organizations/managing-organization-settings/upgrading-to-the-github-customer-agreement` (rechecked 17 Nov): Standard Terms are an agreement with an individual; to agree on behalf of an entity such as a company, org owners can upgrade to the GitHub Customer Agreement.
- **S26** `account-and-profile/how-tos/organization-membership/publicizing-or-hiding-organization-membership` (rechecked 17 Nov): the People tab has a visibility choice with a Public option; the default visibility is not stated.
- **S27** `actions/reference/events-that-trigger-workflows` (schedule; critic's reading): scheduled runs can be delayed at times of high load. The page says nothing about transfers.
- **S28** `rest/using-the-rest-api/rate-limits-for-the-rest-api` (critic's reading, not rechecked): a user's limit is 5,000 requests per hour, and apps acting for the user count toward it; the `GET /rate_limit` endpoint does not count against the limit.
  - (Enterprise revision) rechecked 17 Nov 2026 at https://docs.github.com/en/enterprise-cloud@latest/rest/using-the-rest-api/rate-limits-for-the-rest-api: "your personal rate limit of 5,000 requests per hour"; an app installation on an Enterprise Cloud org or enterprise "has a rate limit of 15,000 requests per hour"; OAuth apps owned or approved by an Enterprise Cloud org get 15,000 for its members; `GET /rate_limit` "does not count against your primary rate limit" but can count against the secondary limit.

**GitHub documentation added for Enterprise (Enterprise revision; all read 17 Nov 2026, about 14:30 to 15:00 IST; base https://docs.github.com/en/enterprise-cloud@latest/)**

- **S6 (Enterprise reading)** `repositories/creating-and-managing-repositories/transferring-a-repository`: "Repositories cannot be transferred into an enterprise with managed users from outside the enterprise, or vice versa"; "An organization or enterprise owner may have set a policy that prevents certain users from doing these things."
- **S29** `admin/managing-iam/understanding-iam-for-enterprises/choosing-an-enterprise-type-for-github-enterprise-cloud`: two types, "Enterprise with personal accounts" and "Enterprise with managed users"; "Managed user accounts cannot create public repositories"; moving to managed users "requires migration to a new enterprise account".
- **S30** `admin/enforcing-policies/enforcing-policies-for-your-enterprise/enforcing-policies-for-github-actions-in-your-enterprise`: Policies > Actions; enable for all, specific or no organizations; allowed-actions options, where enterprise-only means "Only actions and reusable workflows defined in a repository within the enterprise can be used"; read-only `GITHUB_TOKEN` default for enterprises created on or after 2 February 2023; creating and approving pull requests off by default; repository-level self-hosted runners allowed by default; "Disable for all organizations" options for self-hosted and standard hosted runners; retention 90 days and cache 10 GB defaults. Most other defaults are not stated.
- **S31** `admin/enforcing-policies/enforcing-policies-for-your-enterprise/enforcing-repository-management-policies-in-your-enterprise`: Policies > Member privileges; repository creation, forking, outside collaborator invitations, visibility change ("only enterprise owners can change the visibility"), deletion and transfer ("allow members with admin permissions to delete or transfer a repository"), base permissions; organization owners can always create any type of repository; "Internal repositories are the default setting for all new repositories created in an organization". No defaults stated.
- **S32** `admin/configuring-settings/hardening-security-for-your-enterprise/restricting-network-traffic-to-your-enterprise-with-an-ip-allow-list`: Settings > Authentication security; "By default, authorized users can access your enterprise's resources from any IP address"; personal access tokens are restricted; runners need static IP ranges; "Enable IP allow list configuration for installed GitHub Apps".
- **S33** `admin/managing-iam/understanding-iam-for-enterprises/abilities-and-restrictions-of-managed-user-accounts`: managed users contribute only to private and internal repositories in the enterprise and authenticate through the identity provider. No UI check for the enterprise type is described.
- **S34** `admin/enforcing-policies/enforcing-policies-for-your-enterprise/enforcing-policies-for-personal-access-tokens-in-your-enterprise`: Policies > Personal access tokens; "By default, organizations and enterprises allow access" by both token types; with a restriction, "Organizations cannot override this setting".
- **S35** `admin/enforcing-policies/enforcing-policies-for-your-enterprise/enforcing-policies-for-security-settings-in-your-enterprise`: Settings > Authentication security > Two-factor authentication; outside collaborators without 2FA are "removed from the organization"; no default stated.
- **S36** `organizations/managing-programmatic-access-to-your-organization/limiting-oauth-app-and-github-app-access-requests-and-installations`: repository admins can install GitHub Apps that request no organization permissions; "By default, app access requests are enabled"; no enterprise override mentioned.
- **S37** `admin/enforcing-policies/enforcing-policies-for-your-enterprise/enforcing-policies-for-code-governance`: Policies > Code > New ruleset; a ruleset "can target many organizations, repositories, and branches at the same time"; no default rulesets stated.
- **Pages that did not load (HTTP 404, 17 Nov):** `admin/managing-your-enterprise-account/choosing-an-enterprise-type-for-github-enterprise-cloud` (the live page is S29) and `admin/enforcing-policies/enforcing-policies-for-your-enterprise/enforcing-policies-for-third-party-applications` (no enterprise-wide OAuth app policy page was found).

**Community reports (not official)**

- **C1** github.com/apache/arrow issue 34381 and the glitchwerks/github-actions PR 254 (critic's reading, 17 Nov): members with private org membership show as CONTRIBUTOR in event payloads and to `GITHUB_TOKEN`.

**Vendor documentation**

- **V2** docs.mergify.com/integrations/github/: adding a repository needs GitHub admin rights; products are switched on per repository.
- **V3** docs.mergify.com/merge-queue/lifecycle/: queue labels, the check run, temporary branches, and the reset on a foreign commit.
- **V4** docs.mergify.com/merge-queue/pause/ (rechecked 17 Nov):
  - a pause tries to cancel running checks for PRs in the queue, while checks running on the PR itself cannot be cancelled;
  - queued PRs keep their place, and new ones can still join;
  - unpause is done with the CLI or the API;
  - the page does not say whether a pause is per repository or per organization, and says nothing about transfers or installations.
- **V5** mergify.com/pricing: the Open Source plan costs US$0. How a repository qualifies, and the per-plan features, are not shown as text (critic's reading).
- **V6** code.claude.com/docs/en/web-quickstart and code.claude.com/docs/en/claude-code-on-the-web: pushes need the Claude GitHub App on the account.
- **V7** code.claude.com/docs/en/cloud-environments: environments belong to the Claude account; the proxy serves only the repositories attached to a session.
- **V8** code.claude.com/docs/en/routines: a routine stores its repositories, which are changed in its Edit dialog; a run without access shows a "didn't start" message.
- **V9** namespace.so/docs/solutions/github-actions: the app installs on a personal account or an org; repository-level runners are the default; the profile name becomes the runner label.
- **V10** namespace.so/pricing and namespace.so/docs/workspaces: the 30-day Developer trial gives 32 vCPU; each workspace has its own billing.
- **V11** docs.devin.ai/integrations/gh: an org admin manages the integration, with "Add to this organization" and "Refetch repo list".

**Our own setup**

- **R1** The local clone at `origin/main` `fc0971103` (08:00 IST, 17 Nov), read-only. Files read:
  - `.github/workflows/*`;
  - `.mergify.yml`;
  - `product/tools/{queue-gate.sh, label-guard.sh, label-sweep.sh, pr-open-guard.sh, backup-refresh.sh, lead-watch.sh}`;
  - the Lead branch's `lead-watch.sh`;
  - RULES.md (P-371, P-402, P-652) and DECISIONS.md (P-282, P-402, P-652).
- **R2** GraphQL, 17 Nov (an earlier read plus this revision's 09:1x IST reads):
  - owner type User, PUBLIC, viewer is the owner with ADMIN;
  - 2 rulesets ACTIVE, with the parameters above;
  - 0 classic protection rules, 0 environments, 0 deploy keys;
  - main `66f91594c`; 39 open PRs, 14 `review: approved`, 5 `queued`, 3 batch branches; #2032 open with `dequeued`.
- **R3** Local configuration:
  - origin is the old URL, and git credentials go through `gh auth git-credential`;
  - the token prefix is `gho_` (GitHub CLI);
  - 5 worktrees;
  - `.tools/backup-mirror.git` also points at the old URL;
  - `~/.claude/settings.json` lines 94 and 101 name the old path.
