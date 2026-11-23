#!/bin/bash
# R1.15 (partial by design): no store in the app holds sealed values (no caller of SecretBoxPort), so a stored row cannot be
# read back. This seals a Sample value with the running image and the stage key ring, and opens it; one fail case: other firm.
set -u; CL=$1; SV=$2; TD=$3; export AWS_PAGER=
NET=$(aws ecs describe-services --cluster "$CL" --services "$SV" --query 'services[0].networkConfiguration' --output json)
C=$(aws ecs describe-task-definition --task-definition "$TD" --query 'taskDefinition.containerDefinitions[0].name' --output text)
JS='const {platformConfig}=await import("./api/src/platform/config/settings.ts");const {aesGcmSecretBox}=await import("./api/src/platform/secret-box/aes-gcm.ts");const b=aesGcmSecretBox(platformConfig().secretBox);const o={firmId:"sample-firm",purpose:"sample.proof"},p="SAMPLE-firm-key-proof";const s=b.seal(o,p);let other="opened";try{b.open({...o,firmId:"sample-solo"},s)}catch(e){other="refused"}console.log("SEALPROOF "+JSON.stringify({scheme:s.split(".").slice(0,2).join("."),parts:s.split(".").length,containsPlain:s.includes(p),opensForOwner:b.open(o,s)===p,otherFirm:other}))'
OV=$(C="$C" JS="$JS" python3 -I -c 'import json,os;print(json.dumps({"containerOverrides":[{"name":os.environ["C"],"command":["node","--import","tsx","--input-type=module","-e",os.environ["JS"]]}]}))')
T=$(aws ecs run-task --cluster "$CL" --task-definition "$TD" --launch-type FARGATE --network-configuration "$NET" --overrides "$OV" --query 'tasks[0].taskArn' --output text); echo "task=$T"
aws ecs wait tasks-stopped --cluster "$CL" --tasks "$T"
E=$(aws ecs describe-tasks --cluster "$CL" --tasks "$T" --query 'tasks[0].containers[0].exitCode' --output text); echo "container exit=$E"
sleep 15; L=$(aws logs get-log-events --log-group-name /xr/staging/app --log-stream-name "studio/$C/${T##*/}" --query 'events[].message' --output text | tr '\t' '\n' | grep SEALPROOF); echo "${L:-no SEALPROOF line}"
[ "$E" = 0 ] && echo "$L" | grep -q '"containsPlain":false,"opensForOwner":true,"otherFirm":"refused"'
