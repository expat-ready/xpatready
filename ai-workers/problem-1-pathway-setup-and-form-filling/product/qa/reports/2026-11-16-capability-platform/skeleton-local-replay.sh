set -u
cd /home/user/xpatready
S=ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio
COMPOSE=$S/deploy/compose.test.yml
P=4480
echo "== commit $(git rev-parse HEAD)"
echo "== build (scratch Dockerfile.qa: proxy CA as a build secret only)"; DOCKER_BUILDKIT=1 docker build --no-cache --progress=plain -f /tmp/claude-0/-home-user-xpatready/fb627326-28af-5ea1-a73c-e2a2fabb1380/scratchpad/Dockerfile.qa --secret id=ca,src=/root/.ccr/ca-bundle.crt -t studio-skeleton:test . > /tmp/claude-0/-home-user-xpatready/fb627326-28af-5ea1-a73c-e2a2fabb1380/scratchpad/build.log 2>&1; echo "build exit $?"; tail -3 /tmp/claude-0/-home-user-xpatready/fb627326-28af-5ea1-a73c-e2a2fabb1380/scratchpad/build.log
echo "== up"; docker compose -f "$COMPOSE" up -d --no-build --wait --wait-timeout 180; echo "up exit $?"
docker compose -f "$COMPOSE" logs migrate | tail -2; docker compose -f "$COMPOSE" ps -a
echo "== smoke"; [ -f "$S/api/src/features/platform-identity.ts" ] && export PLATFORM_ME=required
bash "$S/tools/skeleton-smoke.sh" "http://127.0.0.1:$P" --image studio-skeleton:test; echo "smoke exit $?"
unset PLATFORM_ME
echo "== seeded db stop"; docker compose -f "$COMPOSE" stop db
bash "$S/tools/skeleton-smoke.sh" "http://127.0.0.1:$P"; echo "seeded smoke exit $? (must be non-zero, FAIL health)"
echo "== seeded image"
printf 'FROM studio-skeleton:test\nUSER root\nENV SEEDED_SIGNING_KEY=made-up-value DB_URL=postgresql://u:made-up@db/x\n' | docker build -q -t studio-skeleton:seeded - >/dev/null
bash "$S/tools/skeleton-smoke.sh" "http://127.0.0.1:$P" --image studio-skeleton:seeded | grep -E '^(FAIL|PASS)  (non-root|no secret)'
echo "== down"; docker compose -f "$COMPOSE" down -v --remove-orphans 2>&1 | tail -1
