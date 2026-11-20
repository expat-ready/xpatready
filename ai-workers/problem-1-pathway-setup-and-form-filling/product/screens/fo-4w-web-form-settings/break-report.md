# FO-4w web-form settings: break report (PR #2525, head 43f51b83c)

Breaker run, 20 Nov 2026, on an isolated copy `brk_fo4w` on :4447 (`PLATFORM_IDENTITY=local`, fresh database seeded with
`seedSampleFirms` and `seedSampleFirmsFrontOffice`, and an Admin, a Read-only, a Case-Manager-only, a Billing and a second
Owner added by SQL). Attack scripts were plain `fetch`, `psql` and Playwright (/opt/pw-browsers/chromium) in a scratch folder. Live AI off, US$0.
The shared tree was not changed apart from this file. Its screenshots were not rewritten.

## Findings

### M1 (Major): a save with more than about five ordinary sites fails with a 500 and an audit-failure alert; nothing is saved
- Repro (API): as the Owner, `PUT /api/front-office/web-forms/<id>/allowed-sites` with `{ sites: [6 sites like
  "https://www.sample-firm-<i>.example.co.uk"], version }`. 5 sites (199 characters joined): 200. 6, 7, 8 and 20 sites: **500**
  "Something went wrong on the server. Refresh to see the current state, then try again."; `allowed_sites` stays the same.
  Clearing a list of more than about five sites in one save fails the same way, because `removed` gets as long as `added`.
- Repro (screen): Sales › Settings › Web form. Add a site 7 times, fill 8 rows, Save sites. The notice says "Something went wrong on the
  server". Each of these writes `audit_write_failed` / BR-5 `alert` (AuditWriteFailures metric) to the log.
- Cause: `web-form-settings.ts:79` puts `added: added.join(" ")` and `removed: removed.join(" ")` into the audit detail.
  `ports/audit.ts:16` caps each detail string at 200 characters (`DetailScalar = z.string().max(200)`), so `AuditEntry.parse` throws
  inside the transaction. One site of about 210 characters (allowed up to 255 by `siteEntry`) hits the same 500.
- Expected: any list the rules accept (up to 20 sites, each up to 255 characters) saves with one audit line. Observed: the
  stated limit of 20 can only be reached one site at a time (5 at most per save), and a wide clear-out fails. Removing
  sites is how a firm closes the door, so it matters that this fails. The checks only ever save one or two short sites
  (`check_fo4w…:105–108`, `j_26.ts:99`), so they miss it.

### m1 (Minor): the validation stores values that are not sites, and one of them is a CSP wildcard
- Repro: save `["https://*"]`, `["https://*.example.com"]`, `["https://\"onmouseover=alert(1).com"]`. All return 200 and are
  stored as typed. `new URL` accepts `*`, `"`, `;`, `'` and `=` in a host. `siteEntry` (`web-form-settings.ts:40–51`) checks
  only the scheme, user info, path, query and fragment, not that the host is a real domain or IP.
- Impact today: none seen. `corsFor` (`public.ts:144–151`) matches the browser's Origin exactly, so `https://*` never matches.
  But `frameAncestors` (`public.ts:199–202`) copies the stored values into `frame-ancestors`, where `https://*` means *any https
  site*. Today that header is only on the JSON read; the hosted page has none (open FO-2 item, `fo-4-sales/break-report.md:30`).
  Once the hosted page gets it, as AG-2-49 rule 4 intends, a stored `https://*` lets every site frame the form. A `;` in a
  host also adds directives to that header.
- Expected: refuse a host that is not a domain name, IPv4 or IPv6 address (at least refuse `*`, quotes and `;`).

### m2 (Minor): after Remove, field errors stay on the old row number and point at the wrong entries
- Repro (screen): with Site 1 blank, Site 2 `bad one`, Site 3 blank, Site 4 `https://good.example.com` and Site 5
  `https://x.com/page`, press Save. Rows 2 and 5 are correctly marked invalid (the blank-row mapping holds). Then Remove site 1.
  Now the error "Enter the site with https://…" is on the **blank** new Site 2, `bad one` (now Site 1) has no error, and
  `https://x.com/page` (now Site 4) has lost its error. Screenshot evidence was taken in the scratch run (after-remove.png).
- Cause: `web-form-settings-page.tsx:91` keys errors by row number (`errors[String(i)]`), and Remove (`:96`) filters `rows` without
  touching `errors`. Rows also use `key={i}`.

### m3 (Minor): keyboard focus is lost after Remove
- Repro: Tab to "Remove site 2" and press Enter. `document.activeElement` is `BODY`, so a keyboard or screen-reader user starts
  again from the top of the page (WCAG 2.4.3). Add a site does move focus to the new field (`:99`); Remove does nothing similar (`:96`).

## Tried and held
- **Roles:** Owner and Admin 200. Case Officer, Case Manager (with and without Owner), Read-only and Billing get 403 on GET and
  PUT, and nothing is stored. Signed out gets 401. A deactivated Owner's old token gets 401 `staff-not-active`. An Admin whose
  grant has ended gets 403 on the next request.
- **Tenancy:** the Owner sees only their own firm's form. The other firm's form id gets 404 and is unchanged (from both firms'
  Owners). Bad ids (`not-a-uuid`, a zero uuid, `%27%3B--`) get 404. An upper-case uuid reaches the same row, and the version check still applies.
- **Normalisation:** `HTTPS://EXAMPLE.COM:443` is stored as `https://example.com`. `https://bücher.de` is stored as punycode.
  Surrounding whitespace and a leading NBSP are trimmed. A trailing `/`, an empty `?` or `#`, and `\` are dropped.
  `https://x.com`, `HTTPS://X.COM/` and `https://x.com:443` merge into one entry. An IPv6 address with a port is kept.
  `https://exa\tmple.com` becomes `https://example.com`, as a browser would read it.
- **Refused:** `null`, `*`, `file:`, `javascript:`, `data:`, `blob:`, `ws:`, a path, user info, `<script>`, a space in the host,
  `""` and whitespace only. The field keys `sites.<n>` count only the sites actually sent.
- **Odd JSON:** non-strings, objects, nested arrays, `null` or `true` as entries, sites as a string or an array-like object, extra keys,
  `__proto__` and `constructor` keys, an array or scalar as the whole body, broken JSON, a 2 MB body and a 50 000-item array. All
  get 400 or 422 with nothing saved. 21 sites (even all duplicates) get 422; 20 duplicates are accepted. The 255-character limit holds.
- **Races:** 5 rounds of 10 parallel PUTs (Owner and Admin together) on one version: exactly one 200, nine 409 `STALE`, one audit line
  and the winner's list stored. A lost update (A reads, B saves, A saves) gets 409. A row written by SQL with microseconds saves.
  The same instant written in another form (`+00:00`, no `Z`) gets 409, not a wrong match.
- **Audit line:** one line per save, with action `fo.web_form.sites_changed`, the actor `staff:<id>` (FIRM_STAFF), the correlation id
  and only sites and counts (no token, no email). A save that changes nothing still writes a line and moves the version (by design: "one per save").
- **Screen:** a form name holding `<img onerror>` with long Swedish and Japanese text is shown as plain text (no script ran),
  and long names wrap. A host containing a quote is escaped in the aria-label. There were no page errors.
- **Screen widths:** no sideways scroll at 1024 px, 375 px or 200 % zoom (1280 px at CSS zoom 2).
- **Copy:** with the clipboard refused, Copy falls back to selecting the text and copying it, and says "Copied.". The snippet
  equals `embedSnippet(origin, token)` and escapes the token in the attribute.
- **Keyboard:** the tab order is Site, Remove, Add a site, Save sites, snippet, Copy snippet, link, Copy link. Enter in a field saves.
- **Reload mid-edit:** shows the saved list. Unsaved typing is dropped without a warning; this is not claimed by the concept, so no finding.
- **j_26:** its claims (one site saved by screens, stored once, one audit line, snippet copied and drawn) match what the code does. It does not test multiple sites (see M1).

Verdict: Block (one open Major, M1, at 43f51b83c).
