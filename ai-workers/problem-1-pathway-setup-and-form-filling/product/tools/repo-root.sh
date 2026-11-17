# Sourced by the tools (bash): repo_root prints the repository root, the nearest folder at or above this file's folder
# (or the folder given) that holds AGENTS.md. Never counts folder levels, so the tools can move (repository clean-up,
# stage 2a; the TypeScript twin is packages/repo-paths/index.ts). REPO_ROOT, when set, wins. Exit 1 if there is none.
repo_root() {
  if [ -n "${REPO_ROOT:-}" ]; then printf '%s\n' "$REPO_ROOT"; return 0; fi
  local d; d="$(cd "${1:-$(dirname "${BASH_SOURCE[0]}")}" && pwd)" || return 1
  while :; do
    [ -f "$d/AGENTS.md" ] && { printf '%s\n' "$d"; return 0; }
    [ "$d" = "/" ] && break; d="$(dirname "$d")"
  done
  echo "repo-root: no AGENTS.md at or above ${1:-$(dirname "${BASH_SOURCE[0]}")}" >&2; return 1
}
