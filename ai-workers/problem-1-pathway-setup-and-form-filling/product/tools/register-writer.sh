#!/usr/bin/env bash
# LR-178 (Lead 13, 28 Nov; records PR #4100): one writer for the lab register. Only the lab-register records lane changes
# design/lab-register-2026-11-27.md, in records-only PRs; every other lane puts "Register: LR-NNN Built (evidence)" or
# "Register: LR-NNN Proven (evidence)" lines in its PR body, and the records lane writes them in each hour. (On 28 Nov five
# PRs left the queue on register conflicts.) pr-rules runs this on a PR that is not records-only.
#   <the PR's file list, both sides of a rename> | register-writer.sh
# Exit 0 when the register is not in the list; 1 (one ::error line naming the file) when it is; 2 when the list cannot be read.
# Test: check-register-writer.sh.
set -u
REG="ai-workers/problem-1-pathway-setup-and-form-filling/product/design/lab-register-2026-11-27.md"
files=$(cat) || { echo "::error title=Lab register (LR-178)::the PR's file list could not be read, so this step fails (LR-043, fail closed)"; exit 2; }
if printf '%s\n' "$files" | grep -qxF "$REG"; then
  echo "::error title=Lab register (LR-178)::REGISTER WRITTEN BY A CODE PR: this PR changes $REG. Only the lab-register records lane writes it (LR-178). Drop the register change and put a line in the PR body instead: \"Register: LR-NNN Built (PR, evidence)\" or \"Register: LR-NNN Proven (command → result, or a run link)\"; the next hourly records batch writes it in."
  exit 1
fi
echo "lab register: not changed by this PR (LR-178)"
