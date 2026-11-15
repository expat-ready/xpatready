# Outside dependencies (P-618): bring them forward before they block

The tech lead keeps this list. It holds no secrets and no names. Lead times come from the provider's own page, cited; "to cite" means not yet found, so plan with the 2-week minimum. Start date = need date − lead time − 2× buffer (at least 2 weeks for anything with screening or human review). Every check flags a row inside its start window, or stuck over 48 h, as 🔴 Needs you (alarm: B192).

| # | Provider · what | Lead time (cited) | Needed by (row, date) | Start | Owner | Status (15 Nov 21:5x IST) | Decision date · fallback |
|---|---|---|---|---|---|---|---|
| 1 | AWS · Route 53 domain registration (staging domain) | to cite; support case reply "usually within 24 h" (Lead 56) | PF-8b staging, before the first staging deploy | started 15 Nov | founder (account), Lead 56 | blocked: new-account block; free support case filed 15 Nov | 18 Nov · Cloudflare Registrar |
| 2 | BoldSign · Canada sandbox API (e-signature) | to cite | FO-6v's one Mac check | started 15 Nov | founder (email), Lead 56 | **sign-up worked 16 Nov 00:4x IST from the founder's own Chrome** (the refusals came from the automated browser, not him); region to confirm, then the ticket is updated | 18 Nov · Signority |
| 3 | Google · OAuth verification (Calendar, Gmail restricted scopes; yearly security assessment) | to cite ("several weeks" per Lead 56) | FO-3s2 / PF-19mc, before real firm calendars | when FO-3s2's PR is up | founder, Lead 56 | consent screen in test mode; no client yet | set when filed · test mode with named test users |
| 4 | Microsoft · Partner Center, then the Entra app (**deferred, P-621**) | to cite; needs company documents | Microsoft calendar sign-in rows | not started | founder | deferred 16 Nov | none needed now · Google only (P-621) |
| 5 | AWS SES · production access (mail out of test mode) | to cite | first real outgoing client mail | after row 1 lands | founder, Lead 56 | waits on the staging domain | set when row 1 lands · SES test mode to verified addresses |
| 6 | expatready.com · DNS (Cloudflare) and mailbox Workspace control | n/a (ownership) | before launch, before the first real firm | now | founder | risk: a third party holds both | before launch · Expat Ready's own Workspace and registrar access |
