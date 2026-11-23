#!/bin/bash
# AWS staging proof, qa gaps on R1.1, R1.13, R1.15 (PR #3206). Run in CloudShell ca-central-1: pass.sh <repo checkout> <out dir>
# Changes: the ECS service's desired count 0 -> 2 -> 0 and one one-off task. No IAM, no SQL, no secret value printed.
# Cost ceiling ~US$0.50. The service goes back to 0 on any exit. Posts unused sign-in codes to our own staging address.
set -u
REPO=$1; OUT=$2; mkdir -p "$OUT"; HERE=$(cd "$(dirname "$0")" && pwd)
S=$REPO/ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio
export AWS_PAGER= AWS_DEFAULT_REGION=ca-central-1; BASE=https://www.staging.lab.expatready.com
[ "$(aws sts get-caller-identity --query Account --output text)" = 581508167097 ] || { echo "wrong account"; exit 2; }
CL=$(aws ecs list-clusters --query 'clusterArns[0]' --output text)
SV=$(aws ecs list-services --cluster "$CL" --query 'serviceArns[0]' --output text)
TD=$(aws ecs describe-services --cluster "$CL" --services "$SV" --query 'services[0].taskDefinition' --output text)
IMG=$(aws ecs describe-task-definition --task-definition "$TD" --query 'taskDefinition.containerDefinitions[0].image' --output text)
down() { aws ecs update-service --cluster "$CL" --service "$SV" --desired-count 0 --query 'service.desiredCount' --output text; aws ecs wait services-stable --cluster "$CL" --services "$SV"; date -u
  aws ecs describe-services --cluster "$CL" --services "$SV" --query 'services[0].[desiredCount,runningCount]' --output text; }
trap 'down > "$OUT/90-scale-0.txt" 2>&1' EXIT
{ date -u; echo "td=$TD"; echo "image=$IMG"; git -C "$REPO" rev-parse HEAD
  aws ecs update-service --cluster "$CL" --service "$SV" --desired-count 2 --query 'service.desiredCount' --output text
  aws ecs wait services-stable --cluster "$CL" --services "$SV"; echo "stable rc=$?"; date -u
  aws ecs describe-services --cluster "$CL" --services "$SV" --query 'services[0].[desiredCount,runningCount,deployments[0].rolloutState]' --output text; } > "$OUT/00-scale-2.txt" 2>&1
# R1.1
{ date -u; bash "$S/tools/skeleton-smoke.sh" "$BASE"; echo "exit=$?"; date -u; } > "$OUT/10-r11-smoke.txt" 2>&1
# R1.15
{ date -u; bash "$HERE/sealed.sh" "$CL" "$SV" "$TD"; echo "exit=$?"; } > "$OUT/20-r115-sealed-roundtrip.txt" 2>&1
# R1.13
{ date -u; bash "$HERE/alarm.sh" "$BASE"; echo "exit=$?"; } > "$OUT/30-r113-real-error-alarm.txt" 2>&1
down > "$OUT/40-scale-0.txt" 2>&1; sleep 60
{ date -u; python3 -I "$HERE/scan_logs.py" "$S/samples/firms.json"; echo "exit=$?"; } > "$OUT/50-log-scan.txt" 2>&1
{ date -u; bash "$HERE/scan_image.sh" "$IMG"; echo "exit=$?"; bash -c "bash '$S/tools/skeleton-smoke.sh' '$BASE' --image '$IMG' | grep -E 'non-root|no secret'"; } > "$OUT/60-image-scan.txt" 2>&1
echo done > "$OUT/99-done.txt"
