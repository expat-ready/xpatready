#!/bin/bash
# R1.13: genuine app 5xx answers -> log line -> metric filter -> 5xx-rate alarm -> SNS. Never set-alarm-state.
# POST /api/platform/session/callback with an unused code answers 503 on Cognito today (identity/session/provider.ts).
set -u; B=$1; A=xr-staging-5xx-rate; export AWS_PAGER=; T0=$(date -u +%Y-%m-%dT%H:%M:%SZ)
st() { aws cloudwatch describe-alarms --alarm-names $A --query 'MetricAlarms[0].[StateValue,StateUpdatedTimestamp]' --output text; }
echo "before: $(st)"; declare -A N
for i in $(seq 1 56); do # ~20 minutes at most: two full 5-minute periods over the threshold are needed
  for j in 1 2 3 4 5 6; do c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 $B/api/platform/me); N[me-$c]=$((${N[me-$c]:-0}+1)); done
  for j in 1 2; do c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST -H 'content-type: application/json' --data '{"code":"sample-unused-code"}' $B/api/platform/session/callback); N[callback-$c]=$((${N[callback-$c]:-0}+1)); done
  s=$(st); case "$s" in ALARM*) echo "alarm at $(date -u): $s"; hit=1; break;; esac; sleep 20
done
for k in "${!N[@]}"; do echo "requests $k ${N[$k]}"; done
echo "after: $(st)"; sleep 120; T1=$(date -u +%Y-%m-%dT%H:%M:%SZ)
aws cloudwatch describe-alarm-history --alarm-name $A --start-date $T0 --history-item-type StateUpdate --query 'AlarmHistoryItems[].[Timestamp,HistorySummary]' --output text
aws cloudwatch describe-alarm-history --alarm-name $A --start-date $T0 --history-item-type Action --query 'AlarmHistoryItems[].[Timestamp,HistorySummary]' --output text | sed -E 's/[^ ]+@[^ ]+/[email]/g'
for m in NumberOfMessagesPublished NumberOfNotificationsDelivered NumberOfNotificationsFailed; do echo "sns $m $(aws cloudwatch get-metric-statistics --namespace AWS/SNS --metric-name $m --dimensions Name=TopicName,Value=xr-staging-on-call --start-time $T0 --end-time $T1 --period 3600 --statistics Sum --query 'sum(Datapoints[].Sum)' --output text)"; done
[ "${hit:-0}" = 1 ]
