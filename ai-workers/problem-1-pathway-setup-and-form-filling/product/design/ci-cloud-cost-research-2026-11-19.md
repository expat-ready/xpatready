# CI on paid cloud machines: cost comparison (19 Nov 2026, Lead 82; researcher subagent, web pages read 19 Nov)

Asked by the founder 00:5x IST 19 Nov ("do the full detailed research ... cost of Amazon machines ... also Google Cloud, and see what is the best"). Load basis: 15,100 job-min/day now (~252 machine-h), ~6,950 after "run tests once" (#2151, ~116 h); 4 vCPU / 16 GB Linux; up to ~40 jobs at once. Machine rows add 20% start-up/idle overhead (302 h / 139 h). Rows are Inference built from the cited prices; spot prices move hourly.

## Prices found
* AWS ca-central-1 on-demand / lowest spot per hour: m7i.xlarge $0.2247 / $0.0816 (interruption 15-20%); m6a.xlarge $0.1926 / $0.0755 (5-10%); m7g.xlarge $0.1819 / $0.0827 (15-20%) [doit.com/compute/spot/ca-central-1/*]. us-east-1 no real saving. gp3 disk per second, 60 s minimum (~$0.005/h for 40 GB, Inference) [aws.amazon.com/ebs/pricing].
* GCP per hour (data 18 Nov): e2-standard-4 Toronto $0.1475 / Spot $0.0305; Montréal Spot $0.0501; us-central1 $0.134 / $0.0804; t2d-standard-4 Toronto $0.186 / $0.0396 [gcloud-compute.com].
* RunsOn licence: Starter €300/yr (<50k jobs/month), Growth €900/yr; 15-day trial; no compute markup; control plane ~$7/month [runs-on.com/pricing].
* Managed runners, 4 vCPU per minute: Blacksmith $0.008 (no cap); WarpBuild $0.008 or $0.002 BYOC; Ubicloud $0.0025; Namespace $0.008 (Business $250/month caps 160 vCPU = 40 jobs); Depot $0.006 per 2 vCPU; GitHub 4-core larger $0.012; GitHub standard on a public repo $0 [docs.github.com/en/billing/reference/actions-runner-pricing].
* Hetzner CCX43 (16 dedicated vCPU) €275.99/month; AX102 €452.30/month (page also shows a conflicting €174.49/€340.99 table).

## Cost per day (now / after run-tests-once; month = day x 30)
| Option | Now / day | After / day |
|---|---|---|
| GitHub standard (public repo) | $0 | $0 |
| GCP e2-std-4 Toronto Spot + disk | $10.90 | $5.00 |
| GCP e2-std-4 Toronto on-demand | $46.30 | $21.30 |
| AWS m6a ca Spot + disk | $24.30 | $11.20 |
| AWS m6a ca Spot + RunsOn Growth | $27.40 | $14.30 |
| AWS m7i ca on-demand + disk | $69.50 | $32.00 |
| Ubicloud managed | $37.80 | $17.40 |
| Blacksmith / WarpBuild / Namespace | $120.80 | $55.60 |
| GitHub 4-core larger / Depot | $181.20 | $83.40 |
| Hetzner 10x CCX43 (flat, 40-job peak) | ~$92 | same |

## Free credits
* AWS Activate Founders (self-funded): $1,000 up to $5,000; needs pre-Series B, founded within 10 years, a company website, and an AWS account on the **Paid Tier Plan** [aws.amazon.com/startups/credits, read 19 Nov]; validity per account (~12 months, unconfirmed).
* AWS Free plan: $100 + up to $100, ends at 6 months; existing accounts not eligible.
* GCP trial $300 / 90 days, **no quota increases during the trial** [docs.cloud.google.com/free/docs/free-cloud-features]: rules out 160 vCPU (Inference).
* Google for Startups Start: up to $2,000 / 1 year; needs an MVP and a company under ~2 years old.
* Microsoft for Startups: up to $5,000 Azure after business verification.

## Recommendation (Inference)
1. Free GitHub standard runners stay the base; pay only for measured queueing.
2. Cheapest reliable at 40 jobs: RunsOn on AWS ca-central-1, Spot first (~$27/day now, ~$14/day after #2151; ~1 h CloudFormation setup); Activate credits cover it for weeks to months.
3. Cheapest overall: GCP Toronto Spot (~$11 / $5 per day) but needs a self-built orchestrator (actions-runner-controller on GKE, or Cirun, free for public repos).
4. Least setup: Ubicloud managed (~$38 / $17 per day, one label change).
Risk: GitHub's planned $0.002/min self-hosted fee is suspended, not cancelled (~$30/day now if it returns) [runs-on.com/blog/github-self-hosted-runner-fee-2026].

AWS account state (Lead 82, 19 Nov 00:4x): $0 credits; quotas 5 vCPU on-demand and spot in ca-central-1; increase requests to 160 vCPU each filed, Pending.
