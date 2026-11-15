# Accounts register (A94: never get stuck on a forgotten password or a lost phone)

The tech lead keeps this list. **No secrets, no names, no email addresses, no account IDs** (public repository): roles only. Passwords live in the founder's password manager; keys live only in AWS Secrets Manager (ca-central-1) or the git-ignored env file. For each account: who signs in, the MFA, and how to recover it. A blank recovery cell is a gap to close.

| # | Provider · account | Purpose | Sign-in (role) | MFA | Recovery route | Gap to close | Status (15 Nov 22:3x IST) |
|---|---|---|---|---|---|---|---|
| 1 | AWS · root of the staging account | billing, account owner | founder (company email) | authenticator app, one device | AWS root recovery by email + phone | **second MFA device** on root; password in the manager | active |
| 2 | AWS · IAM Identity Center admin user | day-to-day admin, Canada only | founder | set at first sign-in | admin reset by root | **accept the invitation email**, set password + MFA | invitation sent, not accepted |
| 3 | AWS · budget alert | US$20/month alert | founder (email) | n/a | n/a | none | on |
| 4 | Stripe · sandbox | test payments | founder | to confirm | Stripe email recovery | confirm MFA on; test key straight to Secrets Manager once AWS admin works | test mode |
| 5 | Google Cloud · staging project | OAuth test app (Calendar, Gmail scopes) | founder (personal Google account) | Google 2-step | **Google backup codes** printed and in the manager | backup codes; move to Expat Ready's own Google org before production (A93) | consent screen in test mode |
| 6 | BoldSign · e-signature | sandbox API | founder (company email) | n/a yet | support ticket | account refused by screening; fallback Signority on 18 Nov | blocked |
| 7 | Cloudflare · expatready.com DNS | site, mail and staging addresses | **a third party** | unknown | unknown | founder gets Administrator access before launch | risk |
| 8 | Google Workspace · company mailbox | company email | **managed by a third party's Workspace** | unknown | unknown | Expat Ready's own Workspace, or admin rights, before launch | risk |
| 9 | GoDaddy · expatready.com registrar | domain ownership | to confirm | unknown | unknown | confirm the registrant is Expat Ready | risk |
| 10 | Microsoft · Partner Center / Entra | Microsoft calendar sign-in | founder | to set | to set | needs company documents; not started | not started |
| 11 | GitHub · the repository | code and records | founder | to confirm | GitHub recovery codes | recovery codes in the manager | active |
| 12 | Claude accounts (A1, A2) | the build team | founder | to confirm | provider recovery | note which account holds the board link | active |

**Rule (A94):** every new outside account gets a row here the day it is created, before anything depends on it; the outside-dependency register (`design/outside-dependencies.md`, P-618) tracks when each is needed.
