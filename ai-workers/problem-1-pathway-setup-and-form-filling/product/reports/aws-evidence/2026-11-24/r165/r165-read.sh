set -u; date -u
for B in $(aws cloudformation describe-stack-resources --stack-name xr-staging --query "StackResources[?ResourceType=='AWS::S3::Bucket'].PhysicalResourceId" --output text); do
echo "== $B"; echo -n 'region: '; aws s3api get-bucket-location --bucket $B --output text
echo -n 'versioning: '; aws s3api get-bucket-versioning --bucket $B --query Status --output text
echo -n 'public-block: '; aws s3api get-public-access-block --bucket $B --query 'PublicAccessBlockConfiguration' --output json | tr -d ' \n'; echo
echo -n 'encryption: '; aws s3api get-bucket-encryption --bucket $B --query 'ServerSideEncryptionConfiguration.Rules[0].[ApplyServerSideEncryptionByDefault.SSEAlgorithm,ApplyServerSideEncryptionByDefault.KMSMasterKeyID,BucketKeyEnabled]' --output text
echo -n 'policy: '; aws s3api get-bucket-policy --bucket $B --query Policy --output text | python3 -c 'import json,sys; p=json.load(sys.stdin); print([(s.get("Effect"),s.get("Action"),s.get("Condition")) for s in p["Statement"]])'
echo -n 'lifecycle: '; aws s3api get-bucket-lifecycle-configuration --bucket $B --output json 2>&1 | tr -d ' \n' | cut -c1-400; echo
echo -n 'logging: '; aws s3api get-bucket-logging --bucket $B --output json | tr -d ' \n'; echo
done
