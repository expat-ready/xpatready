#!/bin/bash
# Are the tools being run main's newest? One line; exit 0 yes, 1 no (then the line is an ACT). Yes = this folder is in a
# clone lead-run.sh made, at the origin/main it fetched at most 10 minutes ago (a check takes minutes), with no tool file changed.
# Used by lead-watch.sh (its first line), takeover.sh and founder-report.py (which prints no report without it). Test: check-lead-run.sh
H="$(cd "$(dirname "$0")" && pwd)"; G=$(git -C "$H" rev-parse --absolute-git-dir 2>/dev/null); now=${NOW:-$(date +%s)}
no() { echo "ACT   tools: not main's newest: $1. Run: git fetch -q origin main && git show origin/main:ai-workers/problem-1-pathway-setup-and-form-filling/product/tools/lead-run.sh | bash -s -- <tool>"; exit 1; }
[ -n "$G" ] && [ -f "$G/lead-run" ] || no "this is $H, a working copy ($(git -C "$H" log -1 --format='newest commit %cd' --date=format:'%d %b %H:%M' 2>/dev/null))"
at=$(cat "$G/lead-run"); case "$at" in ''|*[!0-9]*) no "the copy's stamp is unreadable";; esac
sha=$(git -C "$H" rev-parse HEAD); [ "$sha" = "$(git -C "$H" rev-parse refs/remotes/origin/main 2>/dev/null)" ] || no "the copy is at ${sha:0:9}, not at the main it fetched"
[ $((now - at)) -le 600 ] || no "main was fetched $(( (now - at) / 60 )) min ago"
git -C "$H" diff --quiet HEAD -- . 2>/dev/null && [ -z "$(git -C "$H" ls-files -o --exclude-standard -- . | grep -v __pycache__)" ] || no "a file in the tools was changed"
ct=$(git -C "$H" log -1 --format=%ct); echo "tools  main ${sha:0:9}, committed $(TZ=Asia/Kolkata date -r "$ct" '+%H:%M' 2>/dev/null || TZ=Asia/Kolkata date -d "@$ct" '+%H:%M') IST ($(( (now - ct) / 60 )) min old), main's head at $(TZ=Asia/Kolkata date -r "$at" '+%H:%M' 2>/dev/null || TZ=Asia/Kolkata date -d "@$at" '+%H:%M') IST: yes"
