# R1.65 evidence from Step 20 (24 Nov 2026), copied read-only

Copied by the tech lead (Lead 1) from AWS CloudShell (ca-central-1) on 24 Nov 2026 17:18 UTC (22:48 IST): the Step 20 outputs that were only in `~/run24/` (written 04:09-04:15 UTC 24 Nov) and the two read scripts from the CloudShell home. Nothing was run in AWS for this copy. Bundle `r165b.tgz` sha256 `8ad07833299c3203858f3c8ec3290de2b0e005e0d66e8fdf5ca1f2da8dfc9b65` matched CloudShell's after base64 decoding on the Mac; `shasum -a 256 -c SHA256SUMS` passes for all 10 files.

| File | What it is (Step 20 table in `../../../aws-staging-proof-2026-11-22.md`) |
|---|---|
| `r165-read.sh`, `07-r165-read.txt` | the read script and its output: the three buckets' versioning, location, encryption, access logs and lifecycle |
| `r165-live.sh`, `08-r165-live.txt` | puts with no encryption header / `AES256` / `aws:kms`: AccessDenied, AccessDenied, accepted; the test version deleted |
| `xfirm.py`, `09-xfirm.txt`, `10-xfirm-object.txt` | cross-firm try 1 in the app image on the real bucket (void: nothing ran; kept as Step 20 said) |
| `11-xfirm-2.txt`, `12-object.txt` | try 2, task 51f4d716…: `adapter=S3Files ownFirmReads=sample otherFirmReads=null pathTrick=refused`, rc=0; the object under firm A's prefix read back `aws:kms` with the data key, then deleted |

For qa (R1.65 item 2): write the real bucket's answers from `07-r165-read.txt` into `tests/fixtures/pff1c/` where j_65 W5 reads them. Not verdicts: qa decides.
