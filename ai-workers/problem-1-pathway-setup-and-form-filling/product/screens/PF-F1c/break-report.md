# PF-F1c part 1 (R1.65, security): break report, PR #3215 head 8c9003b5c

Breaker (Opus), 23 Nov 2026. Synth only: no AWS account, no UI. **What I tested:** the committed head, copied out with `git archive 8c9003b5c` into a scratch folder that shares `node_modules`. While I worked, someone edited `lib/checks.ts`, `lib/service-checks.ts`, `lib/service.ts`, `README.md` and `test/files-bucket.test.ts` in the shared checkout without committing. Nothing below was run against those edits.

**Method:** one harness runs every exported guard over all four stacks: region, vault, resourcePolicy, bypass, type, and per home stack bucket, backup, database, route, availability, files, taskSetting, secretRead, exposure, role, spread, listener, image, log, wildcard, mail, pool, suffix, retention, alarm. The real stacks give 0 findings. For each attempt below I edited the template (or wrote CDK code), ran the harness again and listed the findings that are new compared with the real stacks. "Passes" means no guard caught the change.

**`npm test` (deploy/cdk, head copy): exit 0 twice, 121 pass, 0 fail.**

## Findings

**B1. Major. Any other ECS task role may now get S3 and the data key outside S3, and no guard notices.** `lib/checks.ts:398` adds `s3:GetObject`, `s3:PutObject`, `s3:ListBucket`, `kms:GenerateDataKey` and `kms:Decrypt` to `ECS_TASK_ACTIONS`. `allowedFor` (`checks.ts:415`) gives that list to *every* role named as a `TaskRoleArn`. `filesTaskFindings` (`lib/service-checks.ts:378-385`) reads only `AWS::IAM::Policy` resources attached to the *service's* task role.
* Reproduction in ordinary CDK, one line each, after `buildApp()`. Both pass every guard:
  * `stacks.production.key.grantDecrypt(stacks.production.service.migration.taskRole)`: the migration task can call `kms:Decrypt` on the data key directly, with no `kms:ViaService` limit.
  * `migration.taskRole.addToPrincipalPolicy({ actions: ["s3:GetObject","s3:PutObject"], resources: [buckets.exports.arnForObjects("*/*"), buckets.documents.arnForObjects("*/*")] })`.
* Template variant, also passing every guard: a new `AWS::IAM::Policy` on `AppMigrateTaskRole…` with get and put on `/*/*` of all four buckets (the access-log bucket included), list on all four, and `kms:Decrypt,GenerateDataKey` on `DataKey` with no condition.
* It is new with this PR: `main`'s `bypassFindings` refuses the same `grantDecrypt` ("allows kms:Decrypt, not on the allow list (ses:SendEmail, ses:SendRawEmail)").

**B2. Major. The same wide grants as inline `Policies` on the service's own task role pass.** I set `Properties.Policies` on `AppTaskTaskRole…` to the B1 statements. Result: 0 new findings. `filesTaskFindings` never reads a role's inline `Policies`, and `bypassFindings` allows them because every action is on the list and every resource belongs to the stack. Control: the same statements in a *second* `AWS::IAM::Policy` on that role are caught (3 findings). B1 and B2 are the reviewer's M1 (`review.md`); the CDK one-liner above shows that ordinary code reaches it, not only a hand-edited template.

**B3. Major. A data bucket can pose as an access-log bucket and so skip KMS, versioning, the KMS put deny and the backup.** `accessLogBuckets` (`checks.ts:190`) counts any bucket that another bucket logs into, provided it logs nowhere itself. Once a bucket is in that set, `bucketFindings` (`checks.ts:212`) checks only the log-bucket rules and `backupFindings` (`checks.ts:383`) leaves it out.
* Reproduction on xr-production, which passes every guard:
  * `ExportsBucket`: `LoggingConfiguration` and `VersioningConfiguration` deleted; encryption set to SSE-S3 (`AES256`); its two `Sid` deny statements removed; taken out of the `BackupSelection`.
  * Its lifecycle set to `{ExpirationInDays: 90, Prefix: "never-used/"}` plus the 1-day abort rule, so its files never expire.
  * `ImportsBucket` now logs into `ExportsBucket` (`imports/`), and the delivery Allow moved with it.
* Variant B4, also passing: a *new* bucket (a copy of the access-log bucket with the same prefix-scoped expiry) that the documents bucket logs into. It is SSE-S3, not versioned, never expires and is not backed up.
* The PR's own test (`test/files-bucket.test.ts:86-89`, "a data bucket cannot pass as a log bucket to dodge its rules or the backup") tries only a chain of buckets that log into each other.
* Suggested direction, not a fix request: exactly one access-log bucket, which every data bucket names; no lifecycle rule filters; no versioning.

**B5. Minor. Access-log lines can be kept for ever while the check passes.** `checks.ts:214` asks for some enabled rule with `ExpirationInDays: 90`, but never looks at the rule's `Prefix` or `TagFilters`, or at versioning. Each of these passes every guard: the 90-day rule scoped to `Prefix: never-used/`, scoped by a `TagFilters` entry, or the log bucket versioned (expiry then only adds a delete marker). Log lines name `<firm id>/<key>` and requester IPs.

**B6. Minor. The 1-day abort rule (gap 3) can be scoped to a prefix nothing uses.** `checks.ts:211` ignores rule filters, so `Prefix: never-used/` on every bucket's abort rule passes. The cost: unfinished parts are billed until someone notices.

**B7. Minor. The KMS put denies can be narrowed and still pass.** `onObjects` (`checks.ts:205`, used by `putDeny` at :223) asks only whether the JSON contains `"<id>"` and `"/*"`. Both `Sid` statements' `Resource` joined as `[<bucket Arn>, "/*", "/nothing"]` (that is, `<bucket>/*/nothing`) passes, and then an AES256 put of any other key is accepted. CDK's own `arnForObjects("*/x")` is caught (control: 6 findings), so this needs a hand-written join. The TLS deny check has the same weakness, but that check predates this PR.

**B8. Minor. The template `cdk deploy` uses differs from the tested one, and `filesTaskFindings` refuses the deployed one.** I synthesized with `cdk.json`'s context (`buildApp({ context })`, which is what the CLI passes; the 22 Nov staging proof deployed with `cdk deploy`). Only `minimizePolicies` changes anything: 4 stacks.
* The task role's KMS statement becomes `["kms:Decrypt","kms:GenerateDataKey"]`. The exact JSON match (`service-checks.ts:379-389`) then gives 2 false findings per home stack. Every other guard passes on that template, and the permissions are equivalent, so nothing widens.
* The stack-level `serverAccessLogsUseBucketPolicy` works: 0 differences with or without it.
* This is the reviewer's minor 2, confirmed independently.

## What held
* **Log-delivery Allow:** the PR's own five widenings (anyone, `s3:*`, every key, any source, no account) are refused, and so is the Allow moved onto a data bucket's policy (control: 1 finding). One extra Allow for a source bucket that does not log there (`/zzz/*`) is accepted. That is harmless: the logging service only, this account, the log bucket only.
* **The `/*/*` allowance** is limited by the action allow list: on the execution role, `s3:GetObject` on `documents/*/*` is refused (1 finding). The Backup role keeps `kms:Decrypt` only. On task roles, see B1 and B2.
* **A second `AWS::IAM::Policy` on the service task role** is caught. `AWS::IAM::ManagedPolicy` and `AWS::IAM::RolePolicy` are refused by `typeFindings`. A managed policy ARN outside `MANAGED_ALLOW` is refused by `bypassFindings` and `secretReadFindings`.
* **Deny semantics as written** (`estate.ts:114`):
  * `StringNotEquals aws:kms` refuses `AES256` and `aws:kms:dsse`.
  * `Null = true` refuses a put that names no encryption, and SSE-C, which sends only the `-customer-algorithm` header.
  * Both apply to every principal, on `<bucket>/*`.
* **The app's puts carry the header:** its only PutObject (`s3-files.ts:100-103`) sends `ServerSideEncryption: "aws:kms"` and `SSEKMSKeyId`. That covers the If-None-Match put and the If-Match tombstone (`:175`). Neither is refused.
* **Multipart:** the app never uses it (single put, `FILE_MAX_BYTES` 25 MB). The access-log bucket has no put deny, so S3 log delivery is not blocked.
* **Grants vs adapter:** get, put and list on documents, plus `GenerateDataKey`/`Decrypt` through `s3.ca-central-1`, cover put, get, head (404 through ListBucket), usedBytes and the signed GET.
* **Link key** (`service.ts:114`): 48 characters, letters and digits, generated by Secrets Manager. That meets the loader (`settings.ts:69`: at least 32 characters, at least 10 different) and `S3FileLinks` (at least 32 bytes). A literal `SecretString` is caught by `taskSettingFindings`. A placeholder template is caught by `filesTaskFindings`. A weaker generator (32 characters from 10 letters, about 106 bits) passes, but it is still strong.
* **Task settings** (PLATFORM_FILES, bucket, key ARN, region) match `choose.ts`'s rules. The tests of gaps 1–4 fail on the broken copies they name.

**Unconfirmed (no AWS docs or account):** whether an AWS Backup S3 restore job sends the encryption header (PR question 1; the drill and the `IfExists` fallback are recorded), and how `UploadPart` behaves under the Null deny. Neither affects the app.

Reproduction scripts (scratch, not committed): `/tmp/claude-0/-home-user-xpatready/6a2a623c-c453-5d4d-b80e-79ed8ed94eb7/scratchpad/breaker1/{harness,attacks,cdknative,flags,onmain}.mts`.

**Verdict: Block**: B1/B2 (= reviewer M1) and B3 are open Majors. B5–B8 are Minor.
