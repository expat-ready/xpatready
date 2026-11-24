# Short list: outside security test and legal counsel, 24 Nov 2026

Asked for by the founder in Lead 19 (A350, 24 Nov ~09:22 IST: "research security and counsel"), reported to Lead 20. Research only: **nobody contacted, no form filled, no account made, no project detail typed into any site, US$0.** The founder picks; nothing is bought (P-551: only the founder buys or makes accounts).

Duplicate check: `grep -ril "penetration\|pentest\|counsel" product` found one earlier brief, `design/counsel-brief-extension-2026-11-12.md` (five questions on the Chrome extension, Part A), reused below as question group B; no earlier vendor or counsel short list. MVP-CHECKLIST C5 (security test, "Not started (founder to book)"), C18, C23, C24, C26, C31, C32 are the rows this file serves.

## 0. What could not be read (read this first)

* **No vendor site, canada.ca, laws-lois.justice.gc.ca, college-ic.ca, lso.ca or aws.amazon.com page could be opened from this cloud copy (24 Nov 2026).** `curl` got "CONNECT tunnel failed, response 403" from the network proxy; the page reader got "ENOTFOUND" for every host. Nothing was changed in the environment to get round it.
* So **every fact below about a firm comes from a web search excerpt of the named page, not from the page itself.** Each is marked *(excerpt)*. Before the founder relies on a price or lead time, open the source link on the Mac and check it; prices on vendor pages change.
* Search excerpts are summaries by the search tool, not quotes, so no verbatim quote is given for any vendor fact. Where two excerpts disagree it is stated.
* Lead times of counsel: none is public for any of the three; a firm answers that only when asked.

## 1. Outside security test (penetration test)

### 1.1 What to ask any firm to test (the scope, from our records)

Grey-box test (the testers get accounts) of the staff app, the client portal and the API, on a copy running on AWS ca-central-1 with Sample data only, to **OWASP ASVS level 2** (MVP-CHECKLIST C6). Give them **two firms (firm A and firm B), each with every role** (Owner, Admin, staff, licensed representative, client), plus one of our own staff accounts.

1. **Walls between firms (multi-tenant):** from a firm A account, read, change or delete firm B's cases, people, documents, invoices, trust lines, audit lines and settings, by changing ids in URLs and request bodies, by search and export, and by background jobs (C1, C2, P-575, P-584). Our own staff's access to a firm is logged and shown (C4, P-581).
2. **Sign-in and sessions:** two-step sign-in, passkeys, password reset, session expiry and sign-out, the separate pool for our staff, role and permission bypass (an unlicensed user doing a licensed action, `DECISIONS.md:209`; P-566, P-567), the client's code-verified link and an adult's private tab (`DECISIONS.md:409`).
3. **File storage:** uploads (type checks, size, virus-scan bypass, C10), download links (guessing, expiry, reuse across firms), S3 bucket and object access, document export.
4. **Money:** invoice, payment link and trust ledger endpoints (negative amounts, double reverse, race on two requests; the rules P-603, P-634).
5. **AWS set-up review:** IAM, S3 public access, RDS exposure, secrets (C9), logging, in ca-central-1.
6. **Out of scope:** denial of service and load (AWS's own policy forbids it without approval, *(excerpt)* aws.amazon.com/security/penetration-testing); AWS services themselves; the live IRCC portal; any real person's data.
7. **Ask for:** a written report with each finding's severity, steps to reproduce and fix; **one free retest** after fixes; an attestation letter we can show a firm; testers' certifications; where testers and data sit (Canada preferred); that they follow AWS's testing policy.

**Prerequisite we do not have yet:** an AWS copy to test. MVP C12 is "Not started"; STATE (24 Nov) says the AWS console session expired and waits on the founder. No test can start until it runs.

### 1.2 The three firms

| | **Software Secured** (Ottawa, ON) | **Stingrai** (Toronto, ON) | **Packetlabs** (Mississauga/Toronto, ON) |
|---|---|---|---|
| Fits web app + API on AWS | Yes: web app and API testing, and PTaaS (testing on a subscription) *(excerpt)* | Yes: web and API, plus cloud testing; CREST-accredited *(excerpt)* | Yes: web app testing, priced by roles and size *(excerpt)* |
| Public price | **From US$10,800 for web and API; PTaaS from US$21,400** — shown on a third-party directory as "published"; the firm's own pricing page excerpt showed no figure. Treat as *partly public* | **US$6,800 per assessment** for one web app and its APIs (hybrid human + tool test); scope beyond one app is quoted. A second excerpt gave US$450/month vs US$1,275/month for the subscription form — they conflict | **Not public as a price list.** Its own article gives a range of **US$15,000 to over US$100,000** for a web app test *(excerpt)* |
| Lead time | **1 to 2 weeks from a signed statement of work to start** (its scheduling docs); its marketing says "within 3-6 weeks, sometimes sooner" — they differ *(excerpt)* | **Not found** for a human-led test (its AI-only scan gives same-day results) | **Not found** |
| Report | Report within 48-72 h of testing; retest included (1 round on the basic package, up to 3 on the fuller one, unlimited on PTaaS), within 6 months *(excerpt)* | Pentest report and attestation letter *(excerpt)*; retest not stated | Report type not stated in the excerpts |
| Sources (date read: 24 Nov 2026, excerpts only) | softwaresecured.com/pricing; soc2auditors.org/security-firms/software-secured/; docs.softwaresecured.com/pentest-scheduling; docs.softwaresecured.com/retesting | stingrai.io/pricing; stingrai.io/tools/pentest-cost-calculator; clutch.co/profile/stingrai | packetlabs.net/posts/web-application-security-testing-pricing; packetlabs.net/posts/guide-to-the-average-cost-of-a-pentest-in-canada/ |

Market range for context: Packetlabs' own Canada guide gives about CA$5,000 to CA$45,000+ for many ordinary tests *(excerpt)*.

**Judgment:** our scope (two apps, five roles, two firms, money, files) is more than "one web app" at Stingrai's fixed price, so expect a quote above US$6,800 from any of the three. Confidence: medium.

### 1.3 Recommendation (security test)

**Software Secured**, retest included, scope as §1.1. Reasons: the only one of the three whose public material states a start-time (1-2 weeks after signing), a fast report and an included retest; the lower published figure sits between the other two. Stingrai is the cheaper second choice if its quote stays near US$6,800 for our scope.

* **Impact on 29 Nov: none on the build, US$0.** No test can start before 29 Nov: the AWS copy does not run yet, and the earliest start is 1-2 weeks after a signed statement of work. Realistic window: test in the week after the AWS copy is up, report a few days later, retest after fixes; about 3-4 weeks from signing to a clean report (judgment, medium). Cost when bought: most likely US$7,000-15,000 (judgment from the published figures above; low-medium confidence until a quote).
* **May ship without it:** Release 1 on the demo with Sample and synthetic data only, as now.
* **Must not happen without it:** any real firm's or client's data in the product (MVP C5: "before the first firm"); the first firm going live.
* **Date note for the Lead:** P-815 (24 Nov 01:25 IST) moved Release 1 to 12 Dec, aim 6-7 Dec; A350 (24 Nov 09:22 IST) in STATE reads "commit 29 Nov". Not settled here; the impact above is the same for either date, since neither involves real data.

## 2. Legal counsel

### 2.1 The three firms or routes

| | **Miller Thomson LLP** (national firm) | **nNovation LLP** (Ottawa/Toronto privacy firm) | **Law Society of Ontario Referral Service** (route, not a firm) |
|---|---|---|---|
| Covers | A **Regulated Professionals group** (licensing, compliance with regulators, investigations) *(excerpt, millerthomson.com/en/industries/regulated-professionals/)*, plus privacy. Its immigration practice and any CICC work were **not confirmed** in this read | **Privacy only, in depth:** described by Chambers as the leading Canadian boutique for data protection; privacy programs, privacy impact assessments, anti-spam (CASL) *(excerpt, chambers.com office and department pages)*. Not College rules or trust money | Matches a caller with an Ontario lawyer in the area of law needed, for a **free first consultation of up to 30 minutes**; the lawyer's office usually calls back within about three business days *(excerpt, cleo.on.ca; legalline.ca; the lso.ca page itself could not be opened)* |
| Fits our three areas | College rules + trust money + privacy in one brief (judgment; medium-low until checked) | Privacy law (questions group C), not A | Triage only; finds a sole or small-firm lawyer, who might know RCIC practice |
| Public fees | **Not public** | **Not public** | First 30 minutes free; after that the lawyer's own rate, **not public** |
| Lead time | Not public | Not public | ~3 business days to a call-back *(excerpt)* |

Context, weak source: an unattributed Ontario guide puts a lawyer-drafted privacy policy at CA$1,500-3,000 flat, and privacy policy + terms + data-processing agreement at CA$3,500-6,000 *(excerpt, lawyerinfo.ca)*. That covers only part of C24, not the College or trust questions.

**Trust money also needs an accountant, not only a lawyer** (MVP C31, "the accountant's read"): accounting firms that audit immigration consultancies' trust accounts exist (for example insightscpa.ca/immigration-consultant-audit/, *(excerpt)*); fees not public.

**Blind spot:** none of the three was confirmed to have advised software vendors to College licensees. Ask that first in any first call.

### 2.2 The questions now marked "Unconfirmed: no counsel", with their files

Grouped; file and line on `main` at 24 Nov. The same point often appears in several places; the main ones are listed.

**A. College rules (Code of Professional Conduct, SOR/2022-128; the College's regulations)**
1. Trust: does the Code require a **monthly trust reconciliation**? — `design/briefs/FO-7m.md:3`, `BACKLOG.md:1024`.
2. Trust: our reading of **s. 32(f)** (a correction never re-opens an invoice's trust cap) — `BACKLOG.md:1025`, `DECISIONS.md:218`; **s. 32(g)** (the 25-day move counted from the source date) — `BACKLOG.md:758`, `BACKLOG.md:800`.
3. Trust: **card payments only into operating, never into trust**, and our departures from the team's rule on reversals ("stays paid + red shortfall", trust never below zero) — `design/briefs/FO-7c.md:3`, `DECISIONS.md:168`, `DECISIONS.md:187`, `DECISIONS.md:214`, `DECISIONS.md:254`.
4. **Retainer** checklist from **s. 24(3)** and only two items blocking a send; **consultation agreement s. 23** and what "signed" means when acceptance is recorded, not signed — `BACKLOG.md:334`, `BACKLOG.md:343`, `DECISIONS.md:194`, `DECISIONS.md:254`.
5. **Client file keep period:** "6 years from closing, Client File Management Regulation s. 7.2", and that a keep period beats a deletion request — `design/briefs/AUD-5.md:6`, `design/briefs/CS-D6.md:11`, `BACKLOG.md:1123`, `BACKLOG.md:1125`, `BACKLOG.md:1188`, `DECISIONS.md:214`.
6. **Conflict checks, complaints record, identity checks** — `DECISIONS.md:242`, `MVP-CHECKLIST.md:256` (C32), `design/briefs/CS-S1.md:14`; whether an identity document must be unexpired — `DECISIONS.md:86`.
7. Any staff member may pass the **representative-review warning** with a reason — `DECISIONS.md:479`, `DECISIONS.md:491`, `EXPERIENCE.md:78`.
8. Only a **licensed** user may act as the representative — `DECISIONS.md:209`; a verdict shown to a prospect (**s. 44(2)**) — `decisions/P-74-P-78.md:9`.

**B. IRCC**
9. The **Chrome extension**: IRCC portal terms, professional duty, client data in the browser, saving empty portal screens, liability (five questions) — `design/counsel-brief-extension-2026-11-12.md` Part A; `DECISIONS.md:281` (P-540: built as if allowed), `DECISIONS.md:576`, `DECISIONS.md:668`.
10. A fact **corrected after filing**: must IRCC be told? — `DECISIONS.md:678`, `compliance-trace.md:53` (VV-R20).
11. No one signs for the client; a representative cannot sign for the applicant — `compliance-trace.md:54`, `compliance-trace.md:109`; returned incomplete packages and representative standing — `compliance-trace.md:94`, `compliance-trace.md:96`.
12. Forms from copies other than canada.ca; a paper checklist as a deliverable; an engine-made PDF naming Adobe and **IRCC acceptance** of it — `compliance-trace.md:14`, `compliance-trace.md:20`, `DECISIONS.md:346`.
13. The eligibility check's wording ("not a guarantee of approval") — `ASSUMPTIONS.md:46`.

**C. Privacy (PIPEDA; Quebec Law 25 if a firm or client is in Quebec; CASL)**
14. **AI processing outside Canada** before real client documents — `decisions/P-133-document-reading-technology.md:7`, `:25`, `DECISIONS.md:687`, `MVP-CHECKLIST.md:250` (C26: written statement of what leaves Canada: Stripe, BoldSign, AI).
15. **Breach:** the "real risk of significant harm" test, notice to the Privacy Commissioner and to people, the firm notice wording — `BACKLOG.md:1387`, `BACKLOG.md:307`, `MVP-CHECKLIST.md:234` (C18).
16. **Access, correction and deletion requests:** the 30-day target, export with documents, what stays after erasure — `BACKLOG.md:305`, `BACKLOG.md:310`, `design/briefs/CS-X1.md:26`, `:28`, `design/briefs/CS-X2.md:23`, `:57`, `design/briefs/CS-X3.md:75`.
17. An **adult family member's** private answers and consent wording — `DECISIONS.md:409`, `BACKLOG.md:48`.
18. **CASL** opt-in and opt-out for messages — `BACKLOG.md:369`, `BACKLOG.md:418`, `BACKLOG.md:420`.
19. How long an employer's **candidates** are kept — `design/briefs/CS-98c.md:31`.
20. Zoom processing in the US: the privacy notice line — `BACKLOG.md:402`.

**D. Our own contracts and licences**
21. **Privacy policy, terms of service, data-processing agreement**, each firm's acceptance recorded; counsel reads the retainer, trust handling, terms, data location and licences — `MVP-CHECKLIST.md:247` (C23), `:248` (C24).
22. Open-source licences of dev tools and planned parts — `design/b203-gate-c8-stryker.md:13`, `DECISIONS.md:268`.
23. Tax readings for our own billing (Stripe Tax) — `DECISIONS.md:25`.

Also in older records (not repeated): `conflict-table-2026-10-19.md`, `acceptance-card-draft-4-3-2026-10-19.md`, screen reviews under `product/screens/`; about 670 marker lines in all, nearly all repeats of the points above.

### 2.3 Recommendation (counsel)

**One brief, sent first to Miller Thomson** (College rules, trust money and privacy in one firm), with **nNovation as the privacy alternative** if the founder wants a specialist for group C, and **an accountant** for the trust ledger (C31). Before engaging, ask each firm one thing: have you advised a software vendor to RCICs or law firms? If neither says yes, use the Law Society referral's free 30 minutes to find a lawyer who has. Confidence: medium-low (Miller Thomson's immigration and College work was not confirmed in this read).

* **Impact on 29 Nov: none on the build, US$0.** Founder time to send the brief: about 1 hour, using §2.2 and the 12 Nov extension brief. No answer is likely before 29 Nov (no public lead time). Cost when engaged: not public; for scale only, the weak guide's CA$3,500-6,000 covers the privacy policy, terms and DPA alone, and the College, trust and IRCC questions come on top (judgment, low confidence).
* **May ship without counsel:** Release 1 on the demo with Sample and synthetic data; the extension on Sample screens; AI reading Sample documents; legal wording labelled Sample, as now.
* **Must not happen without counsel:** real client data in the product; AI processing of real client documents outside Canada (P-133); the trust ledger holding real client money; any firm signing our terms or DPA; filling the live IRCC portal with a real client's data (P-540 lets the extension be built as if allowed; using it on real data still meets the real-data gate above).

## 3. For the founder, in one line each

* Security test: Software Secured (or Stingrai if cheaper on quote); about US$7-15k, starts 1-2 weeks after signing, needs the AWS copy running first; gates the first real firm, not 29 Nov.
* Counsel: one brief to Miller Thomson (nNovation for privacy, an accountant for trust); fees not public; gates real data and firm contracts, not 29 Nov.
* All prices are from search excerpts; the sites could not be opened from the cloud copy. Check on the Mac before deciding.
