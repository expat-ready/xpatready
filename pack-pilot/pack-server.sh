#!/usr/bin/env bash
# Pilot B kit (claude/lead-o2-pack, never merged). NOT RUN YET: buy nothing; a run waits for the founder's typed yes on the
# exact server and cap. On a FRESH, DISPOSABLE Ubuntu 24.04 server, as root: builds one image of one public commit, runs a
# whole full run split over 16, 30, 50 and 70 containers at once (each its own database and ports), three times each, writes
# the numbers, then removes containers, image, code and Docker. Public code and Sample data only: no token, no secret, no
# runner registration, no cloud key, live AI off. It cannot delete the server itself (that needs a provider key): whoever
# bought it deletes it after copying the results.
#   PACK_DISPOSABLE=$(hostname) bash pack-server.sh <40-hex commit of claude/lead-o2-pack>
# LEVELS="16 30 50 70" REPS=3 SOFT_STOP_MIN=600 (no new run starts after that many minutes)
# Results: /root/pack-results (summary.tsv, red.tsv, done.txt and each red part's table). A wall time over 30 min is a miss, not stopped.
set -uo pipefail
die() { echo "pack-server: $*" >&2; exit 2; }
SHA="${1:-}"; [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || die "give the 40-hex commit"
[ "$(id -u)" = 0 ] || die "run as root"
. /etc/os-release 2>/dev/null; [ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = 24.04 ] || die "Ubuntu 24.04 only"
[ "${PACK_DISPOSABLE:-}" = "$(hostname)" ] || die "set PACK_DISPOSABLE=\$(hostname) to confirm this server is disposable: Docker and its data are removed at the end"
[ ! -e /root/pack-work ] && ! command -v docker >/dev/null || die "not a fresh server (Docker or /root/pack-work exists)"
bad=$(compgen -e | grep -E 'TOKEN|SECRET|PASSWORD|API_KEY|^AWS_|^ANTHROPIC|^GITHUB_|^OPENAI' || true); [ -z "$bad" ] || die "unset these first: $bad"
for f in /root/.aws /root/.config/gh /root/.netrc /root/.git-credentials /root/.docker/config.json; do [ ! -e "$f" ] || die "a credential file exists: $f"; done
LEVELS="${LEVELS:-16 30 50 70}"; REPS="${REPS:-3}"; SOFT_STOP_MIN="${SOFT_STOP_MIN:-600}"
[[ "$REPS" =~ ^[1-9]$ && "$SOFT_STOP_MIN" =~ ^[1-9][0-9]*$ ]] || die "REPS 1-9, SOFT_STOP_MIN minutes"
for k in $LEVELS; do [[ "$k" =~ ^([2-9]|[1-9][0-9])$ ]] || die "LEVELS: 2 to 99"; done
W=/root/pack-work; RES=/root/pack-results; IMG=pack:pilot; mkdir -p "$W" "$RES"; T0=$SECONDS
wipe() {
  docker ps -aq 2>/dev/null | xargs -r docker rm -f >/dev/null 2>&1; docker system prune -af --volumes >/dev/null 2>&1
  systemctl stop docker docker.socket containerd >/dev/null 2>&1
  DEBIAN_FRONTEND=noninteractive apt-get purge -y -qq docker.io >/dev/null 2>&1
  rm -rf /var/lib/docker /var/lib/containerd "$W"
  echo "wiped $(date -u +%FT%TZ); left: $RES only" | tee "$RES/wiped.txt"
  echo "NOW: copy $RES off this server, then DELETE THE SERVER at the provider (this script holds no key to do it)."
}
trap wipe EXIT
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq docker.io git python3 >/dev/null || die "apt failed"
systemctl start docker || die "Docker did not start"
echo "cpus $(nproc), $(grep MemTotal /proc/meminfo), swap $(grep SwapTotal /proc/meminfo)" | tee "$RES/machine.txt"
cat > "$W/Dockerfile" <<'D'
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive CI=1 PGPORT=54329
RUN apt-get update -qq && apt-get install -y -qq git curl ca-certificates gnupg xz-utils python3 python3-venv python3-yaml python3-pip openssl lsof procps zsh locales jq poppler-utils tesseract-ocr coreutils build-essential sudo util-linux >/dev/null && locale-gen en_US.UTF-8
ARG SHA
RUN curl -fsSL https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1
RUN git init -q /src && cd /src && git remote add origin https://github.com/expat-ready/xpatready.git && git fetch -q --depth 1 origin "$SHA" && git checkout -q FETCH_HEAD && test "$(git rev-parse HEAD)" = "$SHA"
WORKDIR /src
ENV P=ai-workers/problem-1-pathway-setup-and-form-filling
RUN bash $P/product/tools/cloud-setup.sh && cd $P/prototype/studio && ./node_modules/.bin/playwright install --with-deps chromium chrome && cd /src && pg_ctl -D /src/.tools/solution-1-prototype/pg18-data -m fast -w stop
D
docker build -q --build-arg SHA="$SHA" -t "$IMG" "$W" > "$RES/build.txt" 2>&1 || { tail -30 "$RES/build.txt"; die "the image did not build"; }
# One container: start its own database, run part i of k, print the table.
PART='cd /src && pg_ctl -D /src/.tools/solution-1-prototype/pg18-data -o "-p 54329 -k /tmp -h 127.0.0.1" -l /tmp/pg.log -w start >/dev/null && COPY_PREFIX= timeout 4500 bash $P/product/tools/run-suites.sh --demo --skip-quarantined --shard $I/$K'
cat > "$W/sample.py" <<'PY'
import sys, time, signal
rows = []
def cpu(): v = [int(x) for x in open('/proc/stat').readline().split()[1:9]]; return sum(v), v[3] + v[4], v[7]
def vm(): d = dict(l.split() for l in open('/proc/vmstat')); return int(d['pswpout'])
def mem(): m = {l.split(':')[0]: int(l.split()[1]) for l in open('/proc/meminfo')}; return (m['MemTotal'] - m['MemAvailable']) / 1048576, (m['SwapTotal'] - m['SwapFree']) / 1048576
def stop(*_):
    p = lambda v, q: sorted(v)[min(len(v) - 1, int(q * len(v)))] if v else 0
    c = [r[0] for r in rows]; s = [r[1] for r in rows]; m = [r[2] for r in rows]; w = [r[3] for r in rows]
    print('\t'.join('%.2f' % x for x in (100 * sum(c) / max(1, len(c)), 100 * p(c, .95), 100 * sum(s) / max(1, len(s)), 100 * max(s or [0]), sum(m) / max(1, len(m)), max(m or [0]), max(w or [0]), vm() - v0)), flush=True); sys.exit(0)
signal.signal(signal.SIGTERM, stop); v0 = vm(); a = cpu()
while True:
    time.sleep(5); b = cpu(); d = b[0] - a[0]
    if d: rows.append((1 - (b[1] - a[1]) / d, (b[2] - a[2]) / d, *mem()))
    a = b
PY
printf 'level\trep\twall_min\tslowest_part\tparts_not_0\tred_suites\tcpu_mean%%\tcpu_p95%%\tsteal_mean%%\tsteal_max%%\tmem_mean_gb\tmem_max_gb\tswap_max_gb\tpages_swapped_out\n' > "$RES/summary.tsv"
: > "$RES/red.tsv"; tested=""
for k in $LEVELS; do for rep in $(seq 1 "$REPS"); do
  if [ $(( (SECONDS - T0) / 60 )) -ge "$SOFT_STOP_MIN" ]; then echo "SOFT_STOP_MIN reached before level $k run $rep" | tee -a "$RES/done.txt"; break 2; fi
  L="$W/l$k-r$rep"; mkdir -p "$L"; python3 "$W/sample.py" > "$L/sample" & sp=$!; t=$SECONDS
  for i in $(seq 1 "$k"); do ( a=$SECONDS; docker run --rm --init --shm-size=1g -e I="$i" -e K="$k" "$IMG" bash -c "$PART" > "$L/$i.out" 2>&1; echo "$? $((SECONDS - a))" > "$L/$i.rc" ) & done
  for j in $(jobs -p); do [ "$j" = "$sp" ] || wait "$j"; done
  wall=$((SECONDS - t)); kill -TERM "$sp"; wait "$sp" 2>/dev/null
  red=$(grep -hE '^\| check_' "$L"/*.out | awk -F' *\\| *' '$3 != "PASS" && $3 != "quarantined" && $3 != "skipped" { print $2 }' | sort -u)
  notzero=$(awk '$1 != 0' "$L"/*.rc | wc -l); norows=$(grep -LE '^\| check_' "$L"/*.out | wc -l)
  printf '%s\t%s\t%.1f\t%s s\t%s (%s with no table)\t%s\t%s\n' "$k" "$rep" "$(awk "BEGIN{print $wall/60}")" "$(awk '{print $2}' "$L"/*.rc | sort -n | tail -1)" "$notzero" "$norows" "$(wc -w <<< "$red")" "$(cat "$L/sample")" | tee -a "$RES/summary.tsv"
  for f in $red; do printf '%s\t%s\t%s\n' "$k" "$rep" "$f" >> "$RES/red.tsv"; done
  mkdir -p "$RES/l$k-r$rep"; for i in $(seq 1 "$k"); do read -r rc _ < "$L/$i.rc"; [ "$rc" = 0 ] || tail -200 "$L/$i.out" > "$RES/l$k-r$rep/part$i.txt"; done
done; done
# Every red suite once more, alone on the quiet machine: green there means packing caused it or it is flaky.
echo "== red suites alone (PACK_UNITS, one container each, one at a time)"
for f in $(cut -f3 "$RES/red.tsv" | sort -u); do
  docker run --rm --init --shm-size=1g -e I=1 -e K=2 -e PACK_UNITS="$f" "$IMG" bash -c "$PART" > "$W/alone" 2>&1; rc=$?
  # The unit list holds check_runtime_r1a.ts for the whole R1 group; r1c and r1d have no unit of their own.
  r=$(grep -E "^\| $f \|" "$W/alone" | awk -F' *\\| *' '{ print $3 }'); printf 'alone\t%s\t%s\t%s\n' "$f" "${r:-no row}" "$rc" | tee -a "$RES/alone.tsv"
done
echo "finished $(date -u +%FT%TZ), $(( (SECONDS - T0) / 60 )) min" | tee -a "$RES/done.txt"
