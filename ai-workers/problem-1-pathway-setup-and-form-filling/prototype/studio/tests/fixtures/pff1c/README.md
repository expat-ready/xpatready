# PF-F1c: the real staging bucket's recorded answers (R1.65 W5)

These four files are **byte-for-byte copies** of AWS Step 20's raw outputs. The tech lead copied them read-only from AWS CloudShell (ca-central-1) to branch `aws/2026-11-22-staging-proof`, commit `bcc9a66650d73b62ca6a03fa249a56ec3aa83b52` (24 Nov 2026), folder `product/reports/aws-evidence/2026-11-24/r165/`. That branch is not on main. qa copied the files from there on 24 Nov 2026 (qa 11). No AWS call was made for this copy (US$0).

`SHA256SUMS` holds the lines for these four files, taken from that folder's own `SHA256SUMS` without changes. `j_65` W5 reads only `07` and `11`, and checks those two against the sums and the commit's hashes before it reads them. `08` and `12` are kept as evidence and are not read or hashed by the journey (`sha256sum -c SHA256SUMS` checks all four).

| File | What it is (produced 24 Nov 2026, 04:08-04:15 UTC) | What W5 reads from it |
|---|---|---|
| `07-r165-read.txt` | output of `r165-read.sh` (on the branch): for each of the stack's three buckets plus its access-log bucket, the region, versioning, public-access block, default encryption, policy, lifecycle and access logging | for the bucket the app task writes to: `region: ca-central-1`, `versioning: Enabled`, `encryption: aws:kms <key ARN> True`, and the policy's two Deny statements for puts without `aws:kms` |
| `11-xfirm-2.txt` | cross-firm try 2 in the app image on the real bucket (task `51f4d716…`): the app task's `PLATFORM_FILES*` settings, then `XFIRM adapter=S3Files ownFirmReads=sample otherFirmReads=null pathTrick=refused`, `rc=0` | the app task's `PLATFORM_FILES_BUCKET` and `PLATFORM_FILES_KMS_KEY_ID` (W5 checks that the bucket read in `07` is this one, under this key) |
| `08-r165-live.txt` | three live puts on the documents bucket: no encryption header → AccessDenied, `AES256` → AccessDenied (explicit deny in the bucket policy), `aws:kms` → accepted with a version id | kept as evidence; not read by W5 |
| `12-object.txt` | the try-2 object under firm A's prefix, read back as `aws:kms` under the key with its version id, then deleted (`left=0`) | kept as evidence; not read by W5 |

**Limits, plainly:**
* The account id and the key's ARN in these files are the staging account's. They are not secrets, and they are already on the branch above.
* `r165-live.sh` on the branch is **not** the script that wrote `08-r165-live.txt`. The script would print `key rotation:` and `put no SSE header:` under the key `proof-r165/restore-test-<epoch>.txt`. The output instead shows `no header:`, `AES256:` and `aws:kms:` under `proof-r165/run24.txt`. The commands that wrote `08`, `10` and `12` are not committed. That is why W5 does not read `08`. See the qa report.
* Cross-firm try 1 (`09-xfirm.txt`, `10-xfirm-object.txt`) is void: nothing ran. It is not copied here and not counted.
