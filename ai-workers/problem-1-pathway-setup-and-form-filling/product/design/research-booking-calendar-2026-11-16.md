# Booking and calendar: build or buy? Final research round

Date: 16 Nov 2026. All prices in US dollars, read from the vendors' own public pages on 16 Nov 2026 unless marked. Read-only research; no repository files changed.

Labels used below:
- **Verified**: read on the vendor's own page today.
- **Unverified**: from third-party blogs or search summaries only.
- **Not published, ask sales**: the vendor gives no public price.

---

## 1. Short answer

Keep the P-627 decision. Booking stays our own code. Calendar sync goes through our own Google adapter first and Microsoft Graph later. Keep Cronofy as the named fallback for sync.

There are two reasons:

1. **No product passes all our tests at once.** We need our own look, flow, fields and rules. We need firm-by-firm data walls inside our own database. We need links to the agreement, payment and the client's case, and Canadian data residency. Only Cronofy offers a Canadian data centre, and Cronofy sells calendar plumbing, not a booking product we would show to clients.
2. **The open-source option has gone.** Cal.com closed its source code in April 2026. The free version left behind, Cal.diy, is labelled "personal, non-production use" and has no teams, workflows (reminders) or routing. Cal.com's own embeddable parts (Atoms) are in "maintenance mode". Cal.com now points platforms to a new, separate product (coss.com Scheduling) that is weeks old and publishes no data region.

One thing to note (it does not change the decision): Google's Calendar API is free today, but Google's quota page says charges for usage *above quota* are planned for later in 2026. At our volumes we stay far below the free threshold (see section 5).

---

## 2. What each option is

| Option | What it does | How we'd use it | Licence and what it obliges us to do |
|---|---|---|---|
| **Cal.com (hosted SaaS)** | Full booking product (pages, teams, round robin, routing forms, workflows). | Each firm would hold a Cal.com account, or we resell seats. | Commercial terms. Production code has been closed source since 14–15 Apr 2026 (Verified, [cal.com/blog/cal-com-goes-closed-source-why](https://cal.com/blog/cal-com-goes-closed-source-why)). |
| **Cal.com self-hosted Enterprise** | The same product run on our own servers. | Private repository plus a paid licence key. | Price: not published, ask sales ([licence key page](https://website.cal.com/docs/how-to-guides/self-hosting/acquire-and-manage-a-license-key)). Third-party reports say existing enterprise self-hosters were invited to the private repo (Unverified, [alternativeto.net](https://alternativeto.net/news/2026/4/cal-com-is-going-closed-source-with-a-major-shift-in-its-license-strategy/)). |
| **Cal.diy (MIT community fork)** | The old public code, minus the enterprise and commercial parts. | Fork it and bolt it onto our app. | MIT: free to change and resell; we only keep the copyright notice. But its README says "strictly recommended for personal, non-production use". It removes Teams, Organizations, Workflows, Routing Forms, SSO and Insights, and has no releases published (Verified, [github.com/calcom/cal.diy](https://github.com/calcom/cal.diy); [cal.com/blog/cal-diy-open-source-to-closed-source](https://cal.com/blog/cal-diy-open-source-to-closed-source)). It is maintained by former Cal.com interns. |
| **Cal.com Platform API / Atoms** | API plus React parts for building scheduling into a SaaS product. "Managed users" stand in for our users. | Our UI or their React parts, with their engine and their database. | Commercial. **Atoms are in "maintenance mode": fixes only, no new atoms** (Verified, [cal.com/docs/atoms/introduction](https://cal.com/docs/atoms/introduction), [cal.com/platform](https://cal.com/platform)). The Platform pricing page no longer shows tiers and sends platforms to coss.com Scheduling ([cal.com/fr/platform/pricing](https://cal.com/fr/platform/pricing)). The old tiers were Free (25 bookings), Essentials $299/month (500 bookings, then $0.60 each) and Scale $2,499/month (5,000 bookings, then $0.50 each). These figures are Unverified (search summaries only) and appear to be withdrawn. |
| **coss.com Scheduling** (by the Cal.com company) | Booking API "for marketplaces and platforms": hosts, availability, calendar sync, bookings, embeddable booker. | API-driven, with our UI. | Commercial. $0.10 per confirmed booking. 100 bookings/month free. Paid plans from $25/month, credited against usage. $0.99 per 30 host-days above the plan's allowance, billed from Jan 2027 (Verified, [coss.com/scheduling](https://coss.com/scheduling)). No data region, white-label or tenant details are published. Search results described a waitlist. |
| **Cronofy** | Calendar sync API (Google, Microsoft 365, Exchange, Apple) plus scheduling/availability API and embeddable "UI Elements". | API-driven: our booking engine, their calendar plumbing. | Commercial ([cronofy.com/api/markdown/api-pricing](https://www.cronofy.com/api/markdown/api-pricing)). |
| **Nylas** | Calendar/email API plus Nylas Scheduler (hosted pages and React/web components, round robin, Stripe payment). | API-driven, or their components. | Commercial ([nylas.com/pricing](https://www.nylas.com/pricing/), [nylas.com/products/scheduler](https://www.nylas.com/products/scheduler/)). |
| **Calendly** | Booking SaaS. Has an API: a Scheduling API (POST /invitees) can book through our own UI, plus webhooks and embeds. | Each firm's staff must be Calendly users. We embed or call the API on their behalf. | Commercial. Not a white-label platform. |
| **Easy!Appointments** | Open-source self-hosted booking app (PHP 8.2 + MySQL). REST API, webhooks, Google sync by cron job. | One install per firm, or a fork. | GPL-3.0: if we distribute a changed version we must release our changes under GPL. Latest version 1.6.1, 19 Oct 2026 (Verified, [easyappointments.org](https://easyappointments.org/)). |
| **Own build (P-627)** | Our NestJS/Prisma booking engine plus a direct Google Calendar API adapter, later Microsoft Graph. | Everything in our own code and database. | No licence. We must pass Google OAuth verification and Microsoft publisher verification. |

Others seen but not shortlisted: Zoho Bookings, Schedly and OnSched are SaaS products with the same white-label and residency limits; Rallly is a polling tool, not booking.

---

## 3. Fit against our needs

Scale: ✅ fits · ⚠️ partly / with work · ❌ does not fit · ? not published.

| Need | Own build | Cronofy | Nylas | coss.com | Cal.com SaaS / Platform | Cal.diy fork | Calendly | Easy!Appointments |
|---|---|---|---|---|---|---|---|---|
| Our own look (full UI) | ✅ | ✅ via API; UI Elements optional | ✅ via API; hosted white label only on Pro Annual+ | ⚠️ API yes; embed branding ? | ⚠️ Remove branding on Teams; full white label on Enterprise | ✅ (it is our code) | ❌ Calendly brand and flow; colours only | ⚠️ PHP theme |
| Our own flow and fields | ✅ | ✅ (we build the flow) | ⚠️ inside Scheduler's flow, or build it ourselves | ✅ via API | ⚠️ their booking model | ✅ with heavy work | ❌ | ⚠️ |
| Our own rules (agreement, payment, link to case) | ✅ | ✅ (rules stay ours) | ⚠️ Stripe built in; other links are ours | ⚠️ | ⚠️ through webhooks | ✅ with work | ❌ webhooks only | ⚠️ |
| Our own data model in our database | ✅ | ✅ (they hold only calendar tokens and sync state) | ⚠️ booking config lives at Nylas if Scheduler is used | ❌ bookings live at the vendor | ❌ | ✅ but a second, foreign schema | ❌ | ❌ separate MySQL |
| Per-firm data walls | ✅ our tenant rules | ✅ our walls; one Cronofy app for all | ⚠️ grants per account; walls are ours | ? | ⚠️ one org per firm | ⚠️ not multi-tenant by design | ❌ firm owns account | ⚠️ one install per firm |
| Canada data residency | ✅ (our hosting); Google/Microsoft keep data where the firm's own calendar is | ✅ **Canadian data centre** (`api-ca.cronofy.com`) ([docs](https://docs.cronofy.com/developers/temporal-grid/data-centers/index.md)) | ❌ US or EU only ([pricing](https://www.nylas.com/pricing/)) | ? | ❌ none published | ✅ self-hosted | ❌ none published | ✅ self-hosted |
| Security / compliance | Ours to prove | ISO 27001/27701 stated; SOC 2 badge; HIPAA ([pricing](https://www.cronofy.com/api/markdown/api-pricing)) | SOC 2 Type II, ISO 27001/27701 ([nylas.com/security](https://www.nylas.com/security/)) | ? | SOC 2, HIPAA, ISO 27001 on Organizations ([pricing](https://cal.com/pricing)) | None (ours) | Not on pricing page | None (ours) |
| Maturity | New code, ours | Mature, sync-focused, since ~2014 | Mature | **New** (2026) | Mature product; platform parts frozen | Fork maintained by former interns | Mature | Mature, small |
| Lock-in | None | Low: only sync sits behind our adapter | Medium–high with Scheduler; low for sync only | High | High | Low licence, high maintenance | High | Medium |
| Stack fit (TypeScript) | ✅ | ✅ REST | ✅ REST/React | ✅ JS SDK | ✅ React | ⚠️ Next.js monorepo, different from NestJS | n/a | ❌ PHP |

What this shows:
- **Cronofy is the only buy option that keeps our data model and our data walls, and offers Canada.** It replaces only the calendar-plumbing layer, which is exactly its P-627 fallback role.
- **Nylas** is strong and certified, but has no Canadian region. Its Scheduler would pull booking settings out of our database.
- **Every "whole booking product" option** (Cal.com, coss.com, Calendly, Easy!Appointments) either keeps bookings outside our database, has no Canadian region, or cannot be fully customised. That breaks the agreement, payment and case links and the firm-by-firm data walls we own.

---

## 4. Cost estimate: 50 and 100 firms

### Assumptions

| Item | Low | Mid | High |
|---|---|---|---|
| Staff with a calendar, per firm | 3 | 6 | 10 |
| Bookings per firm per month | 50 | 150 | 300 |
| **50 firms:** connected calendars / bookings per month | 150 / 2,500 | 300 / 7,500 | 500 / 15,000 |
| **100 firms:** connected calendars / bookings per month | 300 / 5,000 | 600 / 15,000 | 1,000 / 30,000 |

Each staff member is one connected calendar account. Prices are list prices before tax, with annual billing where that is cheaper.

### Price lines used (read 16 Nov 2026)

| Vendor | Price line | Source |
|---|---|---|
| Cronofy Emerging | $819/month billed annually; up to 500 synced accounts; $1.39 per extra account per month. Paying monthly costs about 10% more. | [cronofy.com/api/markdown/api-pricing](https://www.cronofy.com/api/markdown/api-pricing) |
| Cronofy Growth | $2,399/month billed annually; up to 3,000 accounts; $0.69 per extra | same |
| Cronofy Strategic | Not published, ask sales | same |
| Nylas Pro Annual | From $43/month; 35 calendar-only accounts included; $1.35 per extra calendar-only account; 12-month term; hosted Scheduler white label included | [nylas.com/pricing](https://www.nylas.com/pricing/) |
| coss.com Scheduling | $0.10 per confirmed booking; 100/month free; $0.99 per 30 host-days above allowance (allowance not published) | [coss.com/scheduling](https://coss.com/scheduling) |
| Cal.com Teams / Organizations | $12 / $28 per user per month ("save 25% yearly"; the page does not say which billing period the figure is) | [cal.com/pricing](https://cal.com/pricing) |
| Cal.com Enterprise / self-host licence | Not published, ask sales | same |
| Calendly Teams | $16 per seat per month; Enterprise from $15k/year with a 50-seat minimum | [calendly.com/pricing](https://calendly.com/pricing) |
| Easy!Appointments | Software free (GPL-3.0); managed hosting €20/month per install, billed annually | [easyappointments.org](https://easyappointments.org/) |

### Results (monthly / yearly, US$)

| Option | 50 firms Low | 50 Mid | 50 High | 100 firms Low | 100 Mid | 100 High |
|---|---|---|---|---|---|---|
| **Own build: running cost** (APIs) | ~$0 | ~$0 | ~$0 | ~$0 | ~$0 | ~$0 |
| **Cronofy** (sync only, Emerging) | 819 / 9,828 | 819 / 9,828 | 819 / 9,828 | 819 / 9,828 | 958 / 11,496 | 1,514 / 18,168 |
| **Nylas** (Pro Annual, calendar-only) | 198 / 2,379 | 401 / 4,809 | 671 / 8,049 | 401 / 4,809 | 806 / 9,669 | 1,346 / 16,149 |
| **coss.com** (bookings only) | 240 / 2,880 | 740 / 8,880 | 1,490 / 17,880 | 490 / 5,880 | 1,490 / 17,880 | 2,990 / 35,880 |
| coss.com plus host-days, worst case (1 unit per host per month) | +149 | +297 | +495 | +297 | +594 | +990 |
| **Cal.com Teams** ($12 × staff) | 1,800 / 21,600 | 3,600 / 43,200 | 6,000 / 72,000 | 3,600 / 43,200 | 7,200 / 86,400 | 12,000 / 144,000 |
| **Cal.com Organizations** ($28 × staff; needed for SOC 2) | 4,200 / 50,400 | 8,400 / 100,800 | 14,000 / 168,000 | 8,400 / 100,800 | 16,800 / 201,600 | 28,000 / 336,000 |
| **Calendly Teams** ($16 × staff) | 2,400 / 28,800 | 4,800 / 57,600 | 8,000 / 96,000 | 4,800 / 57,600 | 9,600 / 115,200 | 16,000 / 192,000 |
| **Easy!Appointments** managed (€20 × firm) | €1,000 / €12,000 | same | same | €2,000 / €24,000 | same | same |

How the Cronofy figure for 100 firms, High, is worked out: 1,000 accounts = $819 + 500 × $1.39 = $1,514 a month. That is still cheaper than Growth at $2,399. The Cal.com, Calendly and Easy!Appointments rows cover only the vendor fee. They also need integration work, and they still fail the fit tests in section 3.

### Own build: running cost and one-off steps

| Item | Cost | Lead time | Source |
|---|---|---|---|
| Google Calendar API usage | Free: "All standard use … at no additional cost". Up to 1,000,000 requests per project per day are not billed. Quotas are 10,000/min per project and 600/min per user. Google says charges for going **over** quota are planned for later in 2026. | n/a | [Google quota page](https://developers.google.com/workspace/calendar/api/guides/quota) |
| Rough check of our volume | 30,000 bookings/month plus sync of 1,000 calendars (push notifications plus incremental sync) comes to well under 100,000 requests/day, so far below 1,000,000. My estimate. | n/a | — |
| Google OAuth verification (`calendar.events` is a **sensitive** scope, not restricted) | $0. **No yearly paid security check (CASA)**: that applies only to restricted scopes (Gmail, Drive). Needs: verified domain, homepage, privacy policy, demo video, narrowest-scope justification. | Google says up to ~10 days. Developer forums report 2–8 weeks and repeat rounds (Unverified). **Plan 4–6 weeks; start now.** | [Google: sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [Google help](https://support.google.com/cloud/answer/13464321); forum and Nylas blog Unverified |
| Microsoft Graph calendar | No per-call charge for delegated calendar access. My reading: the page lists no charge, and this is not quoted from a price page. | n/a | [Graph calendar overview](https://learn.microsoft.com/en-us/graph/outlook-calendar-concept-overview) |
| Microsoft publisher verification | $0, no licence. Needs a verified Microsoft AI Cloud Partner Program account, a custom publisher domain and an Entra work account. Without it, users in other firms may be blocked or warned on consent (risk-based step-up consent, apps registered after Nov 2020). | "Minutes" once the partner account is verified; partner account verification takes days (Unverified) | [Microsoft Learn](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview) |
| Reminder emails, hosting, storage | Marginal on our existing email provider and Postgres | n/a | — |
| **Real cost: our engineering time** | Build plus upkeep of the sync edge cases (recurring events, time zones, token refresh, webhook renewals, Microsoft later) | Ongoing | — |

---

## 5. What "fully customised" really means per option

- **Own build**: everything is ours. That covers look, flow, fields, rules, data model, data walls and residency.
- **Cronofy behind our adapter**: everything client-facing is still ours. Only "read free/busy, write the event" moves to Cronofy. We could swap it in for one firm at a time if Google verification is delayed, or for Microsoft before our Graph adapter exists.
- **Nylas Scheduler**: branding (logo, colours) on Pro Annual. Flow and fields are only what Scheduler supports. Going beyond means using the raw API, which is our own build again with a US/EU-only vendor in the middle.
- **Cal.com / coss.com / Calendly**: themed, not owned. Bookings live in their database, and our agreement, payment and case links become webhook copies. With Calendly, every firm's staff need Calendly seats, and the Calendly brand shows.
- **Cal.diy fork**: in theory fully customisable (MIT). In practice we would adopt a large Next.js monorepo with its own schema. It is labelled non-production, has no reminders or team features, and its future is uncertain. That is more work than our own engine.
- **Easy!Appointments**: a different language (PHP). One install per firm breaks our single multi-tenant app model.

---

## 6. Recommendation

| Area | Recommendation | What we gain | What we lose / risk |
|---|---|---|---|
| Booking engine (public page `/book/:firmKey`, types, availability, time off, time zones, .ics, reminders, agreement/payment/case links) | **Keep our own** (P-627 holds) | Full control of look, flow, fields and rules. One data model. Firm data walls in our database. Canada residency. No per-seat or per-booking fees. | We carry build and upkeep. No ready-made round robin or routing (we add them when needed). |
| Google Calendar sync | **Keep our own adapter**; start Google OAuth verification **now** (4–6 week buffer) | Free at our volume. No extra processor of client data. | Verification delay risk. Google's planned over-quota charges (we stay far below). Edge-case upkeep. |
| Microsoft calendar sync | **Own Graph adapter later**; start partner account and publisher verification early | Free. Same pattern as Google. | A second adapter to build and maintain. |
| Fallback for sync | **Keep Cronofy, Canada data centre**, behind the same adapter interface | Ready plan B for Google delays or Microsoft-first firms. Canadian residency. ISO 27001. About $819/month covers up to 500 calendars (100 firms × 5). | $9.8k–18.2k/year once switched on. A new processor in the privacy notice and contracts. |
| Nylas | **Do not adopt** for now | — | No Canadian region; Scheduler pulls booking settings out of our database. Cheaper than Cronofy at low volume, so keep it as a second fallback if Canada is not required. |
| Cal.com / Cal.diy / coss.com | **Do not adopt** | — | Closed source since April 2026, Atoms frozen, fork labelled non-production, coss.com new with no region or white-label terms. Look again in 6–12 months. |
| Calendly | **Do not adopt** (at most an "import from Calendly" helper later) | — | Their brand and flow, and seats for every staff member ($29k–192k/year). |
| Easy!Appointments | **Do not adopt** | — | PHP and one install per firm; fails our tenant model. |

**Overall: keep our own build. Use Cronofy only for part of the job (calendar sync, as a fallback). Replace nothing.**

### What would change this advice
- A firm needs Exchange on-premises or Apple iCloud calendars before we build those adapters. Switch Cronofy on for that firm.
- Google verification is still stuck after about 6 weeks. Switch Cronofy on for Google calendars until it clears.
- coss.com publishes a Canadian region, white-label terms and a tenant model. Re-run this comparison.

---

## 7. Points not confirmed

- Cal.com Platform tier prices (Free/$299/$2,499): search summaries only; the official page no longer shows them.
- Cal.com self-host Enterprise licence price: not published, ask sales.
- Cronofy Strategic and Nylas Enterprise: not published, ask sales. Whether Cronofy's SOC 2 is Type II: shown only as a badge on the pricing page.
- coss.com: data region, licence, white label, waitlist status and the host-day allowance are not published.
- Calendly: the free tier has recently been opened to the Scheduling API (5 bookings per user per day, per a Calendly community post). Older Calendly pages still say a paid plan is required (Unverified, conflicting).
- Real Google review times beyond the official ~10 days: forums and vendor blogs only (Unverified).
- Legal points (whether Canadian residency is required, and processor contracts under PIPEDA and provincial law): Unconfirmed, no counsel.
