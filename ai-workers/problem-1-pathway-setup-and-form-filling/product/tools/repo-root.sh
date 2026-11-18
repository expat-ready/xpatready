# Sourced by the tools (bash): repo_root prints the repository root, the nearest folder at or above this file's folder
# (or the folder given) that holds the file AGENTS.md. Never counts folder levels, so the tools can move (repository
# clean-up, stage 2a; the TypeScript twin is packages/repo-paths/index.ts, same rules). REPO_ROOT, when set, wins only
# if it is an absolute path without . or .. parts that holds the file AGENTS.md; otherwise, or with no root, exit 1.
repo_root() {
  local d
  if [ -n "${REPO_ROOT:-}" ]; then
    d="$REPO_ROOT"; while [ "${#d}" -gt 1 ] && [ "${d%/}" != "$d" ]; do d="${d%/}"; done
    case "$d" in /*) ;; *) echo "repo-root: REPO_ROOT must be an absolute path (got $REPO_ROOT)" >&2; return 1;; esac
    case "$d/" in */./*|*/../*) echo "repo-root: REPO_ROOT must have no . or .. parts (got $REPO_ROOT)" >&2; return 1;; esac
    [ -f "$d/AGENTS.md" ] || { echo "repo-root: REPO_ROOT has no AGENTS.md file: $REPO_ROOT" >&2; return 1; }
    printf '%s\n' "$d"; return 0
  fi
  d="$(CDPATH='' cd -- "${1:-$(dirname "${BASH_SOURCE[0]}")}" && pwd)" || return 1
  while :; do
    [ -f "$d/AGENTS.md" ] && { printf '%s\n' "$d"; return 0; }
    [ "$d" = "/" ] && break; d="$(dirname "$d")"
  done
  echo "repo-root: no AGENTS.md at or above ${1:-$(dirname "${BASH_SOURCE[0]}")}: set REPO_ROOT" >&2; return 1
}
