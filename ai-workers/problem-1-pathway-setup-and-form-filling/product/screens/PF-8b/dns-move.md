# PF-8b: the later move of expatready.com to Route 53 (must-do, Lead 13 ruling 4)

This row moves no domain. It only defines the zones in code (production `expatready.com`, staging `staging.expatready.com`). Before the name servers for `expatready.com` ever point at the new Route 53 zone (the founder's step, P-607 (2)), the later row that does the move **must** do this, in this order:

1. **Copy every existing record** from the current DNS host into the new zone, before switching. That means MX (the founder's mailboxes stop receiving otherwise), the apex SPF TXT, DKIM CNAMEs or TXT for the current mail provider, the website's A, AAAA and CNAME records, and any verification TXT. Export the current zone file and compare record by record.
2. **DMARC:** if `_dmarc.expatready.com` already exists at the current host, keep one record only. PF-8b's code writes `v=DMARC1; p=none; adkim=s; aspf=r` (Sample), which would clash. Merge the two policies, or drop PF-8b's.
3. **SPF:** PF-8b puts SES's SPF on `mail.expatready.com` (the MAIL FROM domain), so the apex SPF stays the mail provider's. Do not add `include:amazonses.com` at the apex.
4. **Lower the TTLs** at the current host a day before the switch. Switch the NS at the registrar, then check MX, the website and SES verification from outside.
5. **Staging:** add the NS records of `staging.expatready.com` (the stack output `NameServers`) to the production zone. Until then, `staging.expatready.com` falls under production's `*.expatready.com` (break m5). Also reserve `staging` as a firm web address in PF-25 (break m5, a follow-up for that row).

Unconfirmed: no AWS account yet (P-551); the steps above are standard DNS migration practice, to be checked against the founder's current DNS host when the move row starts.
