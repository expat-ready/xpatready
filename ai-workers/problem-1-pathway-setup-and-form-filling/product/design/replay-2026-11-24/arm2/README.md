# Replay arm 2: prepared, not run (24 Nov 2026)

Asked by Lead 27. **Nothing was run against CodeAnt, nothing sent, `~/codeant-replay/home` never opened.** C6 is the founder's go and is not given. The founder-click list is `../../codeant-replay-setup-2026-11-24.md`.

| File | What it is |
|---|---|
| `build_slices.py` | Builds the 41 slices offline: 28 local repositories, one branch a slice, two commits, no remote, at most 10 files |
| `manifest.json` | The 41 slices: files and the checksum of each diff, so a changed slice stops the run |
| `run_arm2.py` | The one unattended script: `check`, `madeup`, `real`, `selftest` |
| `stub.py` | The pretend reviewer used to test it |
| `PASS-RULE.md` | The proposed rule with no severity |

## Where the slices are
The sandbox refuses a Git repository inside this worktree (it protects `.git/config`), so the slices were built in the session's scratch folder (1.0 GB), which a clean-up can remove. Rebuild them anywhere outside a protected folder, from a clone that has `origin/main`:

```bash
python3 -I build_slices.py <repository root> <work folder>
```

The build gives the same diffs: its result must match `manifest.json` here, slice by slice. All slices are exactly the files arm 1's reviewers got, kept to one slice per review instead of relying on CodeAnt's `--include`.

## What the script will not do without a person
* `madeup` needs `<work>/GO-MADEUP`, `real` needs `<work>/GO-C6`: files with the founder's yes, word for word with its time, written by the tech lead. `real` also needs a clean made-up result. The file is a reminder and a record, not proof: anyone who can write the folder can make one.
* It stops, and writes `STOP`, if the output asks to sign in, pay, install an App, upgrade or give a token; at 3 failures or 2 timeouts in a row; if a diff, the package or the runner is not as recorded. `STOP` must be removed by a person.
* One review at a time, 20 minutes at most each, 20 seconds between; finished slices are skipped on a second start. Token-like text is masked before anything is kept.

Order after the go's: `check`, then `madeup` (its addresses are printed), then the founder's C6, then `real`. Keep the Mac awake for `real`:

```bash
caffeinate -i python3 -I run_arm2.py real <work folder>
```

## Tested (with the stub, no network)
41 of 41 slices; a second start redoes only a missing one; it stops on a sign-in request, on 3 failures, on output that is not JSON, and on a changed diff; a planted GitHub-style token is masked; `madeup` and `real` refuse with no GO file. `check` passed on this Mac: 41 slices as recorded, `codeant-cli` 0.5.17 with the recorded checksum, runner isolation lines present, no `gh` or `glab` reachable. No key-like text was found in the slices by a pattern search.

## Not tested, and not knowable without a run
CodeAnt's real JSON (the script expects a `suggestions` list, as its page shows), its exit codes, time per slice, whether it works with no App or plan, whether the words it prints trip a stop. Timeout handling was not exercised. Address recording is best effort and shows addresses, not names. No independent reviewer has read this script or rule.
