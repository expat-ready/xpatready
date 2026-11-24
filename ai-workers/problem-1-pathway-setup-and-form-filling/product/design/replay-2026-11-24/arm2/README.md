# Replay arm 2: prepared, not run (24 Nov 2026)

**Nothing was run against CodeAnt, nothing sent, `~/codeant-replay/home` never opened.** The bar is in `../PLAN.md` ("Arm 2"); `PASS-RULE.md` is an unused proposal.

| File | What it is |
|---|---|
| `arm2.py` | Builds the samples and runs the 41 reviews; one file, resumable |
| `manifest.json` | The 41 slices, each pinned by commit and tree id |
| `FILES.txt` | Every file path that is in any folder (code files only) |
| `stub.py` | The pretend reviewer used in the tests |

## Starting it (the founder, in Terminal; Mac on power, lid open, window left open)

```bash
caffeinate -i python3 -I ~/Desktop/Xpatready/.claude/worktrees/friendly-gauss-dbd512/ai-workers/problem-1-pathway-setup-and-form-filling/product/design/replay-2026-11-24/arm2/arm2.py run ~/Desktop/Xpatready/.claude/worktrees/friendly-gauss-dbd512 /Users/Shared/arm2 --founder-go "Yes, send the 28"
```

The same command again carries on where it stopped. **Time:** the made-up review of 2 files took about 3.5 minutes; 41 reviews of up to 10 files should take **about 3 to 7 hours** (estimate). **Disk:** about 21 MB for the store, one folder of up to about 40 MB at a time, deleted after each; it stops under 500 MB free.

## What is sent
* For each slice, its files' changes and full text. CodeAnt's agent can also read **any other file in that folder**: the app's whole code at that commit (up to about 2,100 files), not only the 28 PRs' files. All of it is in commits reachable from the public `main`; records, `.md`, `.json`, samples and screenshots are left out.
* Paths of the folder, `/Users/Shared/arm2/current/...`. **CodeAnt's Glob tool fails with an error that shows `/Users/<Mac user name>/codeant-replay/cli/...`,** so the Mac user name is likely sent; the made-up run probably sent it too. CodeAnt already has the account holder's identity.
* Its Grep can be made by the server to compare lines of another file on the Mac with the sample (a yes or no, never the text). Found by reading its source; not a sign that it is used.

## When it stops by itself
It writes `/Users/Shared/arm2/STOP` with the reason: anything naming an app, card, plan, token or sign-in; a changed sample, program or runner; 3 unfinished slices in a row. Delete STOP only when the reason is settled. A slice gets two attempts at most.
