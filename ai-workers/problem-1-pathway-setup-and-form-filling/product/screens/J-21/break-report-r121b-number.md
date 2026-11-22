# Break report: R1.21 follow-up, our GST/HST registration number on the stand-in invoice, and the old-link page (PR #3124)

Verdict: Approve

Target commit: 90da148cd, in its own git worktree. The isolated copy was `brk121b` on :4730 with `PLATFORM_IDENTITY=local`
and no Stripe key. It was restarted with each setting value under test and stopped at the end. US$0: no Stripe call.
The PR's own check `tests/check_r121_invoice_number.ts 4730` passed 12/13. The one failure is expected: my copy ran with
`123456789 RT 0001`, and the check's copy step expects `000000001RT0001`. `check_pf24_secrets.ts` passed 84/84.
`product/tools/typecheck.mjs` reported no new type errors (15 known, 0 fixed). There is no Blocker and no Major.
Tax readings: Unconfirmed: no counsel, no accountant.

## Findings

**m1 (Minor): the setting accepts the Sample number itself, and words that are not a number, and prints them with no Sample label.**
settings.ts:39 `GST_HST_NUMBER_SHAPE` needs only capital letters or digits. It does not need a single digit.
Steps: `isolated.sh brk121b 4730 restart PLATFORM_IDENTITY=local "PLATFORM_GST_HST_NUMBER=000000000 RT 0000"`. Then sign up,
sign in, save an ON address and issue an invoice (as in the check). Then open `hostedUrl`.
Expected: the Sample number is refused, or it is still labelled Sample. Actual: the invoice reads
`GST/HST registration number: 000000000 RT 0000`, with no "(Sample: not our real number)". The money document then looks real.
In-process, `loadPlatformConfig` also loads `ABCDEFGHI`, `NOT A REAL NUMBER`, `TBD TBD TBD` and `123456789`. All of them would
print as our registration number. Suggestions: refuse `SAMPLE_GST_HST_NUMBER` and require at least 9 digits. A note: the team's SA-2-25
(requirements-2026-11-02, SA-02 line 463) already states the shape "9 digits + `RT` + 4 digits" for a firm's number. That is not a
CRA citation, so the PR's choice not to enforce it is defensible. It is the founder's call.

**m2 (Minor): the refusal's wording says "9 to 20 digits", but the rule counts characters.**
settings.ts:68 `expects`: "9 to 20 digits, capital letters and single spaces". You can read this as "9 to 20 digits". The rule
is 9 to 20 characters, and those characters may be all letters (see m1). It also says "as the CRA issued it", but no CRA
format is checked. Steps: start with `PLATFORM_GST_HST_NUMBER=<script>SECRETVAL1</script>`. The api.log reads
"PLATFORM_GST_HST_NUMBER is set but not valid: expected … 9 to 20 digits, capital letters and single spaces …".
Expected: "9 to 20 characters: digits, capital letters and single spaces".

**m3 (Minor): a link that is cut or has something added to its path still answers raw JSON, and repeats the token in it.**
The new catch (stand-in.ts:153-156) covers only requests that reach `GET invoices/:id`. Steps on :4730:
`curl "$B/<id>/x?t=<token>"` → 404 `application/problem+json`, with
`"detail":"Cannot GET /api/demo/billing/invoices/<id>/x?t=<token>"`. That is the live token, echoed back.
`curl "$B/?t=x"` → 404 problem+json. `curl "$B/%E0%A4%A?t=x"` → 400 problem+json "Failed to decode param".
`curl -X POST "$B/<id>?t=x"` → 404 problem+json.
Expected (as the PR states it, "any 404 from that page"): the page in words. Actual: JSON for the path variants. A browser only
opens GET links, and a whole link pasted with a few extra characters lands in `t` (that gives the HTML page), so this matters
little. The JSON comes from the global filter (main.ts:180), which is older than this PR.

## What held

* **Setting, odd values** (loader, in process): Arabic-Indic and full-width digits, a tab, an inner newline, an inner NBSP,
  a zero-width space, an emoji, `=`, `$`, quotes, HTML, dotted `İ`, 21 characters and 100 000 characters are all refused.
  A trailing `\n`/`\r\n`, NBSP at either end and a leading BOM are trimmed and then load clean (`String.trim`). A value of
  spaces only counts as unset: the invoice then prints the Sample with its label (live, :4730).
* **Start-up stops on a bad value.** The log names the setting and never the value: `SECRETVAL1` appears 0 times in the
  refusal text. The set value `123456789 RT 0001` and the invoice token appear 0 times in api.log. The setting is optional in
  test and in production, and it is not named as missing there.
* **Number on the invoice:** `isolated.sh … "PLATFORM_GST_HST_NUMBER=123456789 RT 0001"` passes the spaces through `env "$@"`.
  The invoice prints `GST/HST registration number: 123456789 RT 0001`. The text is escaped (the check's `<script>` case).
* **Old-link page.** A wrong token, no token, an unknown id, the id in upper case, `t` given twice, `t[]=`, `t[a]=`, `%2F` or
  `..%2F` in the id, a token with a leading space, and an invoice forgotten by a restart all give the same page: 404,
  `text/html`, 523 bytes, the same weak ETag. The page has `no-store`, `nosniff`, `no-referrer`, a CSP and no
  `x-powered-by`. `download=1` on a bad link gives no `content-disposition`. `HEAD` gives 404 `text/html` with no body.
  `If-None-Match` with the page's ETag still gives 404, not 304. A trailing slash on a good link still opens the invoice (200).
* **No existence oracle by timing.** 600 rounds each (median / p10, µs): known id with a wrong token of the same length 993/818,
  known id with a short token 977/810, unknown id with a token of the same length 989/813, unknown id with a short token 988/819.
  These are within noise. The size and headers are the same for every case.
* **Non-404 errors are not hidden:** `throw e` passes them to the global filter, which sets `application/problem+json` itself
  (main.ts:185 `.type(...)`). So the `text/html` set earlier does not mislabel JSON.
* **1024 px and 200 % zoom** (Chrome; 512 CSS px at scale 2): neither the invoice nor the old-link page scrolls sideways. The GST/HST line
  wraps cleanly. Keyboard: the first Tab on the old-link page lands on "Plan and billing", with a visible focus ring.
  `/settings/billing` exists (web routes.tsx:37) and answers 200 on the copy.

Not findings (outside "What was built"): the number appears only on the stand-in's page, not on Stripe invoices in
test or production. The `/api/demo/billing/invoices/:id` route stays open on a server with a Stripe key, and it now answers the
same HTML page there.

## Round 2 (diff only: 90da148cd → 83a732991)

Copy `brk121c` on :4730 (`PLATFORM_GST_HST_NUMBER=000000001RT0001`), own worktree at 83a732991, stopped at the end; the PR's
check passed 15/15 against it. US$0. Round 1 missed this: a same-character-length non-ASCII token threw a 500 at 90da148cd;
the builder found it. I confirmed it: the old compare on `"é".repeat(32)` throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`.

**r2-m1 (Minor, the rest of m1): the Sample with its digits split by spaces, and other all-zero numbers, still load and print unlabelled.**
settings.ts:40 `(?!0{9} ?RT ?0{4}$)` allows an optional space only next to `RT`. Steps: `loadPlatformConfig({PLATFORM_ENVIRONMENT:"local",
PLATFORM_GST_HST_NUMBER: v})` loads `000 000 000 RT 0000`, `000000000 R T 0000`, `000000000 RT 00 00`, `0000000000 RT 0000`,
`00000000 RT 0000`, `000000000`, `000000000 RT 0001`. The invoice would print "ExpatReady's GST/HST registration number:
000 000 000 RT 0000" with no Sample label. Expected: compare after removing spaces, or refuse all-zero digits (e.g. `(?![0 RT]*$)`).
Minor: only whoever sets the server can reach it. A digit among words still loads (`NOT A REAL NUMBER 1`, `TBD TBD TBD 9`), as the plain shape allows (founder's call, m1).

**Held**
* Refused: the Sample's own forms `000000000 RT 0000`, `000000000RT0000`, `000000000 RT0000`, `000000000RT 0000`, the same with
  spaces at either end (trimmed first) and with an NBSP inside; `ABCDEFGHI` and `NOT A REAL NUMBER`. Loaded: `123456789 RT 0001`, `123456789RT0001`, `000000001RT0001`.
* No ReDoS: the first lookahead caps the length at 20, and the space-separated groups cannot match the same text two ways.
  10 000 000-character inputs took 5–12 ms (linear); the worst of 200 000 random 9–20 character strings from `0A RT` took 0.29 ms.
* Token compare (stand-in.ts:103, live, 32-character token): `é`×32, `é`×16, the token minus one character plus `é`, `%ED%A0%80`
  lone surrogates, `%FF`×32, `%00`×32, the token plus `%00`, emoji, and `é`×32 on an unknown id each give the same 404 `text/html`
  523-byte page, never a 500; the right token still gives 200; api.log has 0 lines with 500, TypeError or RangeError.
* The line reads `ExpatReady&#39;s GST/HST registration number: 000000001RT0001` (escaped); the Sample keeps its label. The refusal
  says "9 to 20 characters of capital letters, digits (at least one) and single spaces", with no CRA claim: m2 is closed.

Verdict: Approve 83a73299153bf6020450b2a6ef52dde4048ae233
