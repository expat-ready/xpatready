# R1.52 — shape (P-526), approved

**Approved by Lead 5 on #3653, 25 Nov 11:17 IST, with three changes; the founder ruled Q4 at 11:22 IST:**
- (a) The OAuth helper and the Google loader entries belong to R1.43 (#3659: its part 0 adds `PLATFORM_GOOGLE_CLIENT_ID`/`_SECRET`; its part 2 builds `api/src/platform/oauth/`). **Part R1.52-2 below is dropped**; R1.52-3 builds on R1.43's helper, with no second copy.
- (b) **Q4, the founder's ruling:** only the firm's Owner and Admins send as a shared firm mailbox; everyone else sends from their own mailbox. No setting per mailbox; it can be widened later. This replaces the recommendation in Q4 below.
- (c) Part 4 splits if it goes over 800 lines.
- Q1 to Q3: later, as recommended. Q5: yes, j_52 exits 0 on the mailbox half. Q6: the Google test user from the accounts sitting. Q7: part 1 is add-only and waits its turn in the migration slot (P-600).

The text below is the shape as it was posted for approval.

Item: R1.52 "Connected mailbox; WhatsApp (no SMS)" (Platform + front office). Runtime lane, cloud builder, 25 Nov IST. Written from `origin/main` 63f5cc913.

**Done when (qa/CAPABILITIES R1.52):** "A connected mailbox sends from the staff address and files replies on the record; WhatsApp sends a template only with consent; no SMS anywhere". This builder's half (the brief, 25 Nov): the mailbox parts merged and `walks.yml` journey j_52 exits 0 on main. WhatsApp (FO-11) follows once Meta's account opens, as one more adapter behind the message port.

Duplicate check: searched BACKLOG*.md (R1.52, PF-19m, PF-19mc, PF-19mi, PF-19mx, PF-19ms, FO-11, FO-3s2 Amendment A), all open PRs (records PRs included; none names R1.52, a mailbox, Gmail, OAuth, WhatsApp or FO-3s), `main`'s code (`oauth`, `OAuth`, `pkce`, `code_verifier`, `mailbox`, `gmail`, `msg_mailbox`, `MailboxPort`: none) and qa/BUGS.md; none.

Requirements read (trace-requirements / r1-source-map): AG-10-3, -4, -9, -10, -11, -12, -13, -14, -16, -17, -28, -33, -35, -39, -62, -68, -69, AG-16-18, SA-11-37, SA-11-39. Decisions: P-584 (3) (the mailbox is a platform service), P-621 (Gmail only; Microsoft deferred), P-821 (Google OAuth test app open), P-824 (browser steps by the session).

## 1. What main already has (no rebuild)

| Need | On main | Missing |
|---|---|---|
| One sending path, consent gate, outbox | PF-19b `MessagePort` (`ports/messages.ts`), `channels/email/{ses,local}.ts`, `ConsentPort` with `Channel = EMAIL | WHATSAPP` (no SMS value exists) | a `MAILBOX` sending route (send as the connected mailbox) |
| Encrypted connection credentials | PF-24 `SecretBoxPort` (`ports/secret-box.ts`, AES-GCM adapter, re-encrypt job, purpose-bound) | purpose `mailbox` used |
| Background jobs | PF-14 `JobPort` (pg-boss) | the per-mailbox sync job |
| Notifications | `MsgNotification` + `web/src/modules/platform/notifications` | kind `new-inbound-message` |
| Record timelines | `front-office/sales/timeline.ts` (lead, prospect) | a filed email as a timeline line |
| Settings, My account | `web/src/modules/platform/settings/*`, `account/*` | Connections → Connect your email; My account → Email |
| Google OAuth, Gmail | nothing (no OAuth code at all) | everything |

## 2. Parts (one PR each, each under 800 lines; in this order)

**R1.52-1 — migration — PF-19m: mailbox tables.** ~350 lines. In `platform-messages.prisma` + one migration folder, new tables only: `msg_mailbox` (firm, owner staff id or null = firm mailbox, provider `GOOGLE | MICROSOFT | IMAP` (only GOOGLE built, P-621), address, main-address flag with a partial unique index (one per firm), status `PENDING | CONNECTED | FAILED | DISCONNECTED`, the sealed credential as `SealedSecret` text (no token column), history cursor, last checked, last error code), `msg_email` (firm, mailbox, direction, provider message id unique per mailbox, RFC Message-ID, In-Reply-To, References, thread key, from, to, cc, subject, sent at, body and attachment `FilesPort` keys, filed record kind + id or null, filed by `RULE | STAFF`, rule name), `msg_unmatched` (firm, email, suggestions, state), `msg_address_link` (firm, address, record kind + id, learned from). Firm-scope policies as PF-12. `msg_group_address` is left out (AG-10-62 Advanced; question 2). Test `tests/check_pf19m_mailbox_schema.ts`: second main address refused; same provider id twice refused; no token column; firm B cannot read firm A's rows. Reviewer + breaker (schema, personal data).

**R1.52-2 — runtime — the shared OAuth helper (FO-3s2 Amendment A).** ~450 lines. `api/src/platform/oauth/` once for Google (Microsoft later, P-621): PKCE S256, a signed, short-lived, single-use `state` (firm, person, role, purpose, nonce; HMAC with a key from the loader), code exchange, refresh, revoke, tokens sealed only through `SecretBoxPort`; plain `fetch`, no SDK (gate note in the PR: none needed). Loader entries in `platform/config/settings.ts`: `PLATFORM_GOOGLE_CLIENT_ID` (plain), `PLATFORM_GOOGLE_CLIENT_SECRET` (secret), optional; unset → "Connect your email" says "not set up on this server". **CDK `SERVICE_SECRETS` is left to the R1.43 builder** (brief: add once). Tests on recorded Google token-endpoint answers: forged, expired or replayed `state` refused and nothing stored; a token never in a response, log line or column outside the sealed value; `invalid_grant` on refresh → `REVOKED`. The R1.43 calendar adapter (FO-3s2) then reuses it and adds a grep test "no second PKCE or state implementation". Reviewer + breaker (tokens, public callback).

**R1.52-3 — runtime — PF-19mc: connect a Gmail mailbox.** ~650 lines. `ports/mailbox.ts` (connect URL, exchange, probe, list changes since a cursor, fetch message, send as the mailbox, revoke) with its fake; `api/src/platform/messages/mailbox/gmail.ts` by `fetch` to the Gmail REST API (scopes `gmail.readonly` + `gmail.send`; no modify or delete); `features/platform-mailbox.ts` routes: start connect, callback (verified, firm-scoped, AG-10-33), list (masked `••••@firm.com`, status, last checked), set main, disconnect. "Connected" only after a probe (`users.getProfile` returns the same address); role by context: firm mailbox Owner or Admin only, personal mailbox own only (AG-10-62, -68); disconnect revokes at Google, stops sync and purges unfiled stored email, filed kept (AG-10-4); a refresh failure → `FAILED` plus one notification to the mailbox owner and the firm's Owner; connect, disconnect, verify audited without addresses' mail content (AG-10-35, SA-11-37). One contract test runs the fake and the Gmail adapter (recorded answers) alike (P-606). Reviewer + breaker (permissions, tokens, cross-firm).

**R1.52-4 — runtime — PF-19mi part 1: email in, filed or Unmatched.** ~700 lines. `JobPort` sync per connected mailbox (every 5 min, Sample) on Gmail's `history.list` cursor, idempotent on the provider id; `ports/mail-match.ts` `MailMatchPort.register(module, matcher)`; matching with AI off in AG-10-10's order: (1) thread (In-Reply-To / References of a stored email) here; (2) the front office's matcher (`front-office/mail-match/`: addresses of leads, prospects, clients and learned links); the case side's subject-reference matcher is the release holder's and only registered here (question 3). One fit → filed (timeline line on that record, attachments through `FilesPort`, `new-inbound-message` notification to the record's owner); several or none → `msg_unmatched` with suggestions; a personal mailbox's unfiled mail visible only to its owner (AG-10-69). Link from Unmatched learns the address; link, move and un-file are one audit event type (SA-11-39). No subject or body in any log line (PF-23's capture check). Breaker (personal data, cross-firm).

**R1.52-5 — runtime — PF-19mi part 2: send as the mailbox.** ~400 lines. A `MAILBOX` route in PF-19b's channel registration (`send/channels.ts`): a staff reply or new email goes through the same outbox and consent gate and leaves through `gmail.send` as the person's mailbox, In-Reply-To and References kept, outside Cc kept on reply (AG-10-9); the sent copy stored as an outbound `msg_email` filed to the record. Tests: threading headers present; marketing without consent blocked; a mailbox of firm A cannot send for firm B; an Agent cannot send as a firm mailbox they are not allowed (question 4).

**R1.52-6 — screens — PF-19ms concept**, skill screen-concept, then a fresh challenge and your approval (P-223 (4)): Settings → Connections (firm mailboxes), My account → Email (personal), Unmatched inbox, the email thread on a lead's or prospect's page (reply, attachments, "via info@"). No build before approval.

**R1.52-7 — screens — PF-19ms build.** ~700 lines (split in two if larger). `web/src/modules/platform/mailbox/*`, one embed line in the lead and prospect pages (owner's OK), `tests/check_pf19ms_browser.ts` (keyboard, axe, 1024 and 1440).

**R1.52-8 — journey j_52** (with or inside part 7 if it fits under 800). `tests/journeys/j_52.ts`, header with its `isolated.sh` line:
* W1 an Admin opens Settings → Connections, presses Connect your email → Gmail; the copy's Google endpoints point at the **recorded Gmail server** (`tests/journeys/fixtures/gmail-recorded/`, a local HTTP server replaying recorded token, profile, history, message and send answers): consent returns, the probe passes, the card shows Connected and `••••@…`;
* W2 an Agent tries the same on the firm mailbox → refused; connects their own in My account → Email;
* W3 a lead emails in (recorded `history.list` + `messages.get`) → it is on the lead's page and the owner's bell;
* W4 an unknown sender's email → Unmatched with suggestions; the Admin links it to a prospect; the next email files itself;
* W5 the Agent replies from the lead's page → `messages.send` recorded with In-Reply-To and References, from the Agent's address; the reply is on the timeline;
* W6 Disconnect → revoke called, sync stopped, unfiled mail gone, filed mail kept; ends at the next capability's first step;
* DW lines: each judge re-run on its stand-in must fail there ("NR" lines, P-606); "no SMS": `Channel` has no SMS value and the routes refuse `channel: "SMS"` (one check).
* No live Google call in CI; US$0.

The R1.52 `Completes:` line waits for FO-11 (WhatsApp); until then the last mailbox PR says `Completes: none (R1.52 mailbox half; WhatsApp FO-11 waits on Meta)` and qa/built/PF-19m*.md lines are added per part (question 5).

**Later, not this builder's now:** FO-11 WhatsApp (Meta) as a channel adapter on `Channel.WHATSAPP` with the consent gate already there; PF-19mx IMAP/SMTP (question 1); Microsoft 365 (P-621, deferred).

## 3. Touch list (all new unless marked)
`prisma/schema/platform-messages.prisma` (add only) + one migration folder · `api/src/platform/oauth/*` · `api/src/platform/config/settings.ts` (two loader entries, additive) · `ports/mailbox.ts`, `ports/mail-match.ts`, fakes under `ports/fakes/` · `api/src/platform/messages/mailbox/**` · `api/src/platform/messages/send/channels.ts` (one registration, additive) · `api/src/features/platform-mailbox.ts` and its one line in the app module · `api/src/front-office/mail-match/*` · `api/src/front-office/sales/timeline.ts` (read `msg_email` lines, additive) · `web/src/modules/platform/mailbox/*`, one embed line each in the lead and prospect pages, the settings and account route lists · `tests/check_pf19m*.ts`, `tests/journeys/j_52.ts`, `tests/journeys/fixtures/gmail-recorded/*` · `qa/built/PF-19m*.md` · module card `.rows/R1.52.md` files. **Not touched:** `deploy/cdk/lib/service.ts` (R1.43's builder adds `PLATFORM_GOOGLE_CLIENT_SECRET` and the client id), DECISIONS.md, RULES.md, STATE.md.

Overlap: R1.43 (FO-3s2) shares `platform/oauth/` (I build it in part 2 unless the R1.43 builder already has; whoever is second reuses it) and `settings.ts` (the two Google entries: whoever lands first, the other does not add them). No other open PR touches these files.

## 4. Recorded Gmail answers (CI)
The recordings are Gmail API responses in the shapes Google's API reference documents (token, `users.getProfile`, `users.history.list`, `users.messages.get` format `raw`, `users.messages.send`, the revoke endpoint), with Sample addresses only. After part 3 merges, this session captures one real round trip against the P-821 test app (project expatready-staging, Testing mode) with a Google test user, in the built-in browser where available (P-824), and replaces any field whose shape differs; the PR says which were captured and which written from the reference. No real mail content is committed.

## 5. Questions for the tech lead (each with my recommendation)
1. **IMAP/SMTP (PF-19mx, question 9) in Release 1?** Recommend: after the Gmail half is proven; not in this chain.
2. **Group addresses (`msg_group_address`, AG-10-62 Advanced)** in part 1 or later? Recommend: later (not in R1.52's Done when).
3. **Case-side subject-reference matcher** (file number, UCI): the release holder's. Recommend: `MailMatchPort` ships with the thread and front-office matchers; the case side registers its own later, out of this chain.
4. **Who may send as a firm mailbox (info@)?** Not in the requirements read. Recommend: Owner, Admin and any staff who can open the record (AG-10-69 "whoever can open that record"), audited; a personal mailbox only by its owner.
5. **j_52 before WhatsApp:** recommend j_52 walks the mailbox half and exits 0; FO-11 adds W7-W9 (template with consent, refused without, no SMS) and the `Completes: R1.52` line.
6. **The Google test user** for the one live capture: which account is on the test app's test-user list? Recommend: a staging-only Google account the founder adds; the session does the browser steps itself (P-824), the founder types only the password or code.
7. **Two migrations in flight:** part 1 adds new tables only to `platform-messages.prisma`; #3646 (PF-20), #3639 (PF-22a), #3635 (PF-29a/b), #3647 (PF-4p) are open. Recommend: part 1 queued as an add-only migration on its own tables (P-228's two-at-once rule), you read it.
