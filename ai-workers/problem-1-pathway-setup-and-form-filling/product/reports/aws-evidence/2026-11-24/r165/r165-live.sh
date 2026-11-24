set -u; date -u; B=xr-staging-documentsbucket9ec9deb9-6uplyey6pgi9; K=proof-r165/restore-test-$(date +%s).txt
echo -n 'key rotation: '; aws kms get-key-rotation-status --key-id 5719e23a-2b19-49b9-bc53-35fe1c8462ac --query '[KeyRotationEnabled,RotationPeriodInDays]' --output text
echo -n 'key manager: '; aws kms describe-key --key-id 5719e23a-2b19-49b9-bc53-35fe1c8462ac --query 'KeyMetadata.[KeyManager,KeyState]' --output text
echo 'sample test file' > /tmp/r165.txt
echo -n 'put no SSE header: '; aws s3api put-object --bucket $B --key $K --body /tmp/r165.txt --query '[ServerSideEncryption,VersionId]' --output text 2>&1
echo -n 'put SSE AES256 (not KMS): '; aws s3api put-object --bucket $B --key $K.aes --body /tmp/r165.txt --server-side-encryption AES256 --query '[ServerSideEncryption,VersionId]' --output text 2>&1
echo -n 'anonymous GET https: '; curl -s -o /dev/null -w '%{http_code}' https://$B.s3.ca-central-1.amazonaws.com/$K; echo
echo -n 'anonymous LIST https: '; curl -s -o /dev/null -w '%{http_code}' https://$B.s3.ca-central-1.amazonaws.com/; echo
echo -n 'plain HTTP GET (signed via presign, http): '; U=$(aws s3 presign s3://$B/$K --expires-in 60 | sed 's#^https#http#'); curl -s -o /dev/null -w '%{http_code}' "$U"; echo
V1=$(aws s3api list-object-versions --bucket $B --prefix $K --query 'Versions[?Key==`'$K'`].VersionId' --output text); echo "version before delete: $V1"
echo -n 'delete: '; aws s3api delete-object --bucket $B --key $K --query '[DeleteMarker,VersionId]' --output text
echo -n 'GET after delete: '; aws s3api head-object --bucket $B --key $K >/dev/null 2>&1 && echo found || echo not-found
DM=$(aws s3api list-object-versions --bucket $B --prefix $K --query 'DeleteMarkers[?Key==`'$K'`].VersionId' --output text); echo "delete marker: $DM"
echo -n 'restore (remove delete marker): '; aws s3api delete-object --bucket $B --key $K --version-id $DM --query DeleteMarker --output text
echo -n 'GET after restore: '; aws s3api get-object --bucket $B --key $K /tmp/r165-back.txt --query '[VersionId,ServerSideEncryption,SSEKMSKeyId]' --output text; cmp /tmp/r165.txt /tmp/r165-back.txt && echo content-identical
echo 'cleanup (test objects only):'; for k in $K $K.aes; do aws s3api list-object-versions --bucket $B --prefix $k --query '[Versions,DeleteMarkers][][].[Key,VersionId]' --output text | while read kk vv; do [ "$kk" = "$k" ] && aws s3api delete-object --bucket $B --key $kk --version-id $vv --query VersionId --output text; done; done
date -u
