# CodeAnt AI command line: set-up for the replay (A355, 24 Nov 2026)

Prepared only: nothing installed, no account, US$0. Choice as reported by Lead 23 (A355): CodeAnt AI, command line only, no App, no purchase. Background: `coderabbit-evaluation-2026-11-24.md`. Read 24 Nov from registry.npmjs.org and docs.codeant.ai (`/cli/setup`, `/cli/commands`, `/cli/review`).

## The package

| Item | Value |
|---|---|
| Package | `codeant-cli` **0.5.17** (latest; published 5 Nov 2026), MIT |
| Official source | https://registry.npmjs.org/codeant-cli/-/codeant-cli-0.5.17.tgz ; the CodeAnt set-up page names this package; source repository given as github.com/CodeAnt-AI/codeant-cli, commit `203d6d1911492ff5ad8774bfe560a8464f380da2` |
| Checksum (published) | `sha512-SoNXM6sbujFctuUxxljOo50JIqspxg5cXjp03mDm1NMZFqcGm+IAPQmVCdoI00m/G+IXCmqFNOCD1zEY27UcQQ==` |
| Publishing | npm signature and SLSA build provenance, published by GitHub Actions |
| Install scripts | No install, preinstall or postinstall script of its own; we also pass `--ignore-scripts` |
| Dependencies | 13 direct, by range, including `posthog-node` (analytics) and `@octokit/rest`. Versions are fixed by the lockfile made at install, kept as the record |
| Where | `~/codeant-replay/` on the Mac: `cli/` (program), `home/` (its key and settings), `bin/` (node only), `work/` (sample copies). Nothing global, nothing in the repository |

## Commands (the lane runs these after the founder's yes to C3; not run yet)

Make the folders and an environment with **no tokens and no `gh`** (`gh` sits next to node in Homebrew, so only node is linked; a separate home hides other sign-ins). One command:

```bash
umask 077; mkdir -p ~/codeant-replay/cli ~/codeant-replay/home ~/codeant-replay/bin ~/codeant-replay/work && ln -s /opt/homebrew/bin/node ~/codeant-replay/bin/node
```

Check that the registry still shows the recorded checksum:

```bash
npm view codeant-cli@0.5.17 dist.integrity
```

Install, then verify signatures; stop unless `package-lock.json` shows the recorded checksum:

```bash
cd ~/codeant-replay/cli && npm init -y && npm install --save-exact --ignore-scripts codeant-cli@0.5.17 && npm audit signatures && grep -A3 '"node_modules/codeant-cli"' package-lock.json
```

Write the one-line runner, which every later step uses:

```bash
printf '%s\n' '#!/bin/sh' 'exec env -i HOME="$HOME/codeant-replay/home" PATH="$HOME/codeant-replay/bin:/usr/bin:/bin" GIT_CONFIG_GLOBAL=/dev/null CODEANT_TELEMETRY_DISABLED=1 TERM=xterm node "$HOME/codeant-replay/cli/node_modules/codeant-cli/src/index.js" "$@"' > ~/codeant-replay/run && chmod 700 ~/codeant-replay/run
```

Prove no token is reachable (both checks must print nothing):

```bash
env -i HOME="$HOME/codeant-replay/home" PATH="$HOME/codeant-replay/bin:/usr/bin:/bin" sh -c 'command -v gh; command -v glab; env | grep -i token'
```

Turn analytics off, in its settings too:

```bash
~/codeant-replay/run set-telemetry false
```

**Each sample PR:** a fresh folder with two commits (the PR's parent tree, then its tree), no history and no `origin` remote; at most 10 files a run, sliced by `--include`:

```bash
~/codeant-replay/run review --headless --base-commit HEAD~1 --include '<slice>'
```

Never run: `set-token`, `pr`, `scans`, `mcp`, `api`, `track`, `resolve-pr-comments`.

**First run is a made-up 2-file sample, not our code.** It shows whether the review works without the App. If it asks for the App, a card or a Git token: stop.

## What data leaves

* Each changed file: its diff and **full content**; plus any file its agent opens in that folder (Read, Glob, Grep, LS). In our two-commit copies that is only code already public on GitHub. No client data, `sources/`, `code/`, keys or private notes: never placed in `work/`.
* Account details from sign-in. Usage data on their servers; command-line analytics off.
* To CodeAnt and its model providers; processed in the US, UK, India, or the EEA if chosen. Their policy [vendor claim]: source "Never stored. Deleted when each scan or review completes."; findings kept for the agreement, then up to 90 days; no training on customer data (terms 7.3). They may use our name and logo until told to stop (10.3). Trials are "as is" (4.3).
* The server address is not in the pages read; the lane records the hosts contacted in the made-up run before any of our code goes.

## The founder's clicks, one at a time (the tech lead asks before each)

| # | Click or answer | What it grants | Undo |
|---|---|---|---|
| C1 | Answer yes or no: send the sample PRs' public code to CodeAnt AI | The decision | Ask security@codeant.ai, subject "Privacy request"; cannot recall what models saw |
| C2 | Open https://www.codeant.ai/terms-and-conditions and https://www.codeant.ai/privacy-policy and read them | Nothing | - |
| C3 | Answer yes or no: install the package above on the Mac | Lane runs the commands above | Delete `~/codeant-replay` |
| C4 | Open https://app.codeant.ai, choose the sign-in that asks least (email if offered). **Stop if the screen asks for repository access, an App install or a card**; send the tech lead the words on it | An account; signing in may accept the terms and may start the 14-day trial (screen not seen by us) | Delete the account by the same email; revoke at https://github.com/settings/applications if GitHub was used |
| C5 | Say yes when the lane is ready to run `~/codeant-replay/run login`, then press approve in the browser page it opens, within 10 minutes. Use no other key screen | A CodeAnt key saved only in `~/codeant-replay/home/.codeant/config.json`; nobody reads or pastes it | `~/codeant-replay/run logout` |
| C6 | Say go after the lane shows the made-up run's result and hosts | Our sample code is sent | Stop; nothing further goes |
| C7 | After the verdict, say delete or keep | - | Lane logs out, deletes the folder; founder closes the account |

Passwords and any sign-in code are the founder's alone. The App is never installed.

## Replay: two arms

The same 28 PRs, at their original commits, same slices: **fresh Opus reviewer with the new checklist** against **CodeAnt command line**. Pass for CodeAnt: at least 4 of 14 known misses, at least half of its Major+ claims true, and at least 2 known misses the improved Opus reviewer did not find. Otherwise adopt the checklist alone. Dates: 25-26 Nov, if C1-C5 are done. Work about 7 hours. [estimate]

## Not known

Whether a review works with no App and no plan; the sign-in screens and scopes; whether the trial needs a card; hourly limit; model vendors (list: codeantai.trust.site/subprocessors, unread); whether `--base-commit` behaves with no remote (the made-up run tells). No command here has been run.

**Gate (STANDARDS 1):** as in the evaluation, section 9. Record the install in `required-tools.md` when done.
