# Accounts register (A94: never get stuck on a forgotten password or a lost phone)

The tech lead keeps this list. **No secrets, no names, no email addresses, no account IDs** (public repository): roles only. Passwords live in the founder's password manager; keys live only in AWS Secrets Manager (ca-central-1) or the git-ignored env file. For each account: who signs in, the MFA, and how to recover it. A blank recovery cell is a gap to close.

| # | Provider · account | Purpose | Sign-in (role) | MFA | Recovery route | Gap to close | Status (15 Nov 22:3x IST) |
|---|---|---|---|---|---|---|---|
| 1 | AWS · root of the staging account | billing, account owner | founder (company email) | two devices: authenticator app (main phone) and a backup authenticator on a second device | AWS root recovery by email + phone | password in the manager | active; second MFA added 16 Nov 00:0x IST |
| 2 | AWS · IAM Identity Center admin user | day-to-day admin, Canada only | founder | set by the founder (22:4x IST) | admin reset by root | none | **active**: AdministratorAccess, Canada only |
| 3 | AWS · budget alert and billing profile | US$20/month alert; billing profile valid | founder (email) | n/a | n/a | set the payment currency ("No currency selected") | on |
| 4 | Stripe · sandbox | test payments | founder | to confirm | Stripe email recovery | confirm MFA on | test mode; **test key in Secrets Manager** ca-central-1 (22:4x IST, pasted by the founder; shape checked only) |
| 5 | Google Cloud · staging project | OAuth test app (Calendar, Gmail scopes) | founder (personal Google account) | Google 2-step | **Google backup codes** printed and in the manager | backup codes; move to Expat Ready's own Google org before production (A93) | consent screen in test mode |
| 6 | BoldSign · e-signature | sandbox API | founder (company email) | n/a yet | support ticket | live API needs the Enterprise API plan (price before launch) | **active**: Canada region (app-ca), sandbox key in Secrets Manager |
| 7 | Cloudflare · expatready.com DNS | site, mail and staging addresses | **a third party** | unknown | unknown | founder gets Administrator access before launch | risk |
| 8 | Google Workspace · company mailbox | company email | **managed by a third party's Workspace** | unknown | unknown | Expat Ready's own Workspace, or admin rights, before launch | risk |
| 9 | GoDaddy · expatready.com registrar | domain ownership | to confirm | unknown | unknown | confirm the registrant is Expat Ready | risk |
| 10 | Microsoft · Partner Center / Entra | Microsoft calendar sign-in | founder | to set | to set | deferred (P-621): Google only at this stage | deferred |
| 11 | GitHub · the repository | code and records | founder | to confirm | GitHub recovery codes | recovery codes in the manager | active |
| 12 | Claude accounts (A1, A2) | the build team | founder | to confirm | provider recovery | note which account holds the board link | active |

**Secret names:** `expatready/<env>/<PF-24 setting name>` in Secrets Manager ca-central-1 (for example `expatready/staging/PLATFORM_STRIPE_SECRET_KEY`); never in a file, chat or the repository.

**Rule (A94):** every new outside account gets a row here the day it is created, before anything depends on it; the outside-dependency register (`design/outside-dependencies.md`, P-618) tracks when each is needed.
