# FO-6 part 4c — the fake's stand-in signing page and the firm signer's link: plan (step 1, no code yet)

Row: BACKLOG **FO-6** (R1.54; it also unblocks R1.61's signature step). Rules note: `note.md`, rules 11 and 12. Written 24 Nov (IST) on `claude/busy-goldberg-jyerm9`, stacked on #3460 (part 4b) at fcb8e3ad8. Area: runtime (API only). **No code until** (a) this plan's fresh challenge is answered and the current Lead approves it (P-223 (4)), and (b) #3460's `Reviewer: Approve <head>` is posted. The PR is retargeted to main once #3460 merges.

Duplicate check: the 43 open PR titles and branch names (24 Nov, 16:5x IST), `BACKLOG*.md`, main's code (`sign-fake`, `firm-signing-link`, `fakePage`: none) and `qa/BUGS.md` (no FO-6 4c row; QA-770 is related, below). None found.

## Screen concept: none needed (my reading; the Lead decides)
* The stand-in page is **not a product screen**. It plays the vendor's signing frame on a lane copy, so the walk and the journeys can sign with the fake adapter. It exists only when `PLATFORM_ENVIRONMENT=local`. The client's real page (`/sign/:token`, 375 px first) is FO-5s. The vendor's own frame is FO-6v.
* So it gets no brand work, and only what makes it usable and honest:
  * a `<title>` and an `h1` that says "Test signing page (no real signature)";
  * the document title and the signer's side (client or firm), but **no name and no email**;
  * one `Sign` button in a form;
  * after Sign, a plain line "Signed. You can close this page.";
  * `lang`, a label on the button, and no script.
* The firm signer's link is API only. Its button on the retainer screen is FO-5s.

## What 4c builds
| # | What | Where | Test line (`check_fo6_door.ts`, the third argument dropped) |
|---|---|---|---|
| 1 | **Fake link base.** `fakeSigning({ linkBase })`. When `linkBase()` gives a base, `embeddedLink` answers `<base>/api/public/sign-fake/<providerDocumentId>/<signerId>/<nonce>`. Otherwise it answers today's `https://signing.fake.invalid/…`, so the port contract and every suite's own fake are unchanged. The nonce is 32 random bytes (base64url), kept **in memory, in the fake**, with the firm, document, signer and expiry (the fake's 10 minutes). It is used once: a second Sign on it gets 404. | `signing/port.ts` | E1 "session link on the copy's own origin" |
| 2 | **The stand-in page.** `GET /api/public/sign-fake/:doc/:signer/:nonce` shows the page. `POST` the same path (the form's Sign) works like this:<br>• It takes the nonce, which is checked and consumed in the fake.<br>• It calls the fake's `act(firm, doc, signer, "signed")`.<br>• It hands every webhook call it returns, in order, to `Signing.receive("fake", call)`.<br>So part 3's rules apply unchanged: order, consent, expiry, evidence, `signing.completed`, the win.<br>• An unknown, used or expired nonce, and a bad shape, all get one 404 "This test link does not work."<br>• A refusal from `receive` (409 NOT_YET, applied: false) is shown in words, and the page still offers no second Sign.<br>The page answers `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, plus a CSP with `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'self'`. | new `signing/fake-page.ts` (controller) | E2 "CLIENT_SIGNED", E3 "already signed in words" (4b+4c) |
| 3 | **Local only.**<br>• The feature registers the page's controller, and sets the fake with the link base, only when `PLATFORM_ENVIRONMENT === "local"`.<br>• In `test` and `production` the route does not exist (404), and `embeddedLink` keeps `signing.fake.invalid`.<br>• At start, an assertion logs an error (never stops the app) if the controller is registered outside local.<br>• The link base is `signingPublicBase()` (4a's `link-mail.ts`: `STUDIO_PUBLIC_URL`, else `http://localhost:$STUDIO_PORT`, which `isolated.sh` sets). | `features/front-office-signing.ts` | unit `check_fo6_fake_page.ts`: the feature's controllers with `PLATFORM_ENVIRONMENT=test` and `production` have no stand-in page, and its fake answers `signing.fake.invalid`; with `local`, it has one |
| 4 | **The firm signer's link.** `POST /api/front-office/retainers/:id/firm-signing-link`, with `@PermissionKeys("agent/retainer:show") @OwnOrAll("agent/prospect")`. In order:<br>(1) `Retainers.read` for visibility: another firm's, or a retainer the caller cannot see, is 404.<br>(2) The body is strict `{ consent: true, consentTextVersion: "sign-electronically-v1" }`; anything else is 422 with nothing written.<br>(3) The live request of the retainer's **current version** is found (status SENT, VIEWED or CLIENT_SIGNED). None is 409 NO_LIVE_REQUEST.<br>(4) The caller must be **that request's FIRM signer** (`fo_signer.staff_id`, written at Send from the filed version's representative: rev 16.13's rule). Anyone else is 403 NOT_THE_REPRESENTATIVE. That covers a case officer who sees every prospect, and also a representative changed on the retainer after Send.<br>(5) Every client must have signed (status CLIENT_SIGNED); before that, 409 CLIENTS_FIRST.<br>(6) Under the request's row lock, the firm signer's consent is recorded once (`consent_text_version`, `consented_at`) with one audit line `signing.consented` (actor `staff:<id>`). A second call writes nothing.<br>(7) It answers `{ url, expiresAt }` from `SigningPort.embeddedLink`. SigningEnded is 409 LINK_ENDED; SigningNotFound (the fake forgot after a restart) is 409 LINK_LOST "Send it again".<br>The order is 404 → 422 → 409 → 403 → 409. The 422 comes before any read of the request, so a bad body never tells whether a live request exists. | `signing/routes.ts`; logic in new `signing/firm-link.ts` | E4 403, E5 422 nothing recorded, E6 "signs last: SIGNED" |
| 5 | **Route checks.**<br>• The stand-in page's GET carries `@OpenRead("…no brackets…")` before `@Get`, plus a REVIEWED "open" row.<br>• Its POST gets a PUBLIC_WRITES row (sorted), asked with an unknown nonce: 404.<br>• The firm link is a staff route behind PF-4's guard (no row).<br>• `check_pf28_inputs` gets the new bodies' rows if it asks. Both checks run red first. | `tests/check_forms_qa53.ts`, `tests/pf28-allow-list.json` if needed | `check_forms_qa53`, `check_pf28_inputs` green |
| 6 | **Module card.** `MODULE.rows/FO-6-4c.md`: Entry points (the page, local only; the firm link), Tables (foSigner consent for FIRM), Tests. The known limit Lead 28 asked for: the door's rate limiter is held in one process, so two tasks would each count separately; its map is swept of expired keys only (Lead B Minor 1). It goes in the Entry points line, since the rows file takes only those three line kinds. | `api/src/front-office/MODULE.rows/FO-6-4c.md` | `module-cards.py` |
| 7 | `check_fo6_door.ts`: the third argument is dropped from its run line and usage (every line counts). | `tests/check_fo6_door.ts` (header and usage only) | the whole file, 42/42 |

Estimated about 450 changed lines with tests. No migration: consent columns exist (part 1), and the nonces live in the fake's memory.

## Red first
`check_fo6_door.ts` on 4b's head with argument `4a,4b,4c`: the six 4c lines fail (E1 `signing.fake.invalid`, E2-E3 not signed, E4-E6 route 404). Its output goes in the PR before any code. `check_fo6_fake_page.ts` (the local-only rule, nonce single use, an unknown nonce 404, a used nonce 404, no name or email on the page) is also written first and is red.

## QA-770 and 4c (question 1)
4c makes signing reachable on a lane copy and on the demo for the first time. QA-770 (Open, Major, FO-5d's to fix) says a **withdrawn** retainer's request stays SENT. Part 3's webhook applies `viewed` and `signed` on it. Only `completed` checks the retainer (`service.ts:176-181`). So after 4c, on a copy, a client holding a live session could sign a withdrawn agreement up to CLIENT_SIGNED. Completion would then be refused, so the firm could never finish it and no client is made. 4b's door also reads such a request as live, because it reads only the request's status.

*Recommend:* 4c adds the same retainer check to the `viewed` and `signed` path of `applyRetainer` (`signing/service.ts`): a retainer that is WITHDRAWN, SIGNED_OFFLINE, DECLINED or EXPIRED, or at a newer version, refuses the event, with the receipt stored and `applied: false`. That is about 5 lines plus one test line in `check_fo6_signing_api` (withdraw, then the stand-in Sign is refused and the request stays SENT). The firm link (row 4 (3)) refuses on the same states. FO-5d keeps the real fix (request CANCELLED, envelope cancelled, the door's words). This touches `service.ts`, which 4c's split did not name, so I ask first.

## What 4c does not do
* The door's own reading of a withdrawn retainer (`door.ts`: not touched while #3460 is open, and FO-5d's (2) fixes it at the source).
* The webhook's SECURITY DEFINER lookup is its own part after 4c (Lead 24, answer 1).
* j_54 W3 posts `{}` to the firm link, so it gets 422 after 4c. It is qa's file (note question 10, recommend qa changes the body). j_54 W2 "client A signs" and j_61 W3 "the client signs" turn green with 4c. W3 needs qa's body change.
* Decline on the stand-in page: the fake's `declined` step exists, but decline is FO-5d's (part 3 refuses it: "a decline is applied by FO-5d"). There is no Decline button.

## Questions for the tech lead (with my recommendation)
1. **QA-770's signing path in 4c** (above). *Recommend:* yes, the five-line guard in `service.ts` with its test.
2. **No screen concept for the stand-in page** (above). *Recommend:* agree; it is a local stand-in for the vendor's frame, never shipped.
3. **The nonce is the stand-in page's only key.** j_54 and the test open it in a fresh browser with no door cookie, as a vendor frame would be: the vendor link is the key. Anyone with the URL on a local copy can sign within 10 minutes, once. *Recommend:* accept (local only, 10 minutes, single use, never emailed). It mirrors what the vendor's embedded link is.
4. **The firm signer is the request's FIRM signer, not the retainer's current representative.** A representative changed after Send cannot sign until the agreement is sent again. *Recommend:* accept (rev 16.13: signer read from the filed version).

## Done when
* `check_fo6_door.ts` with no third argument: every line passes (6 formerly pending), twice, on isolated copies.
* `check_fo6_fake_page.ts` green twice; `check_fo6_signing_api` green (with question 1's line); `check_forms_qa53`, `check_pf28_inputs`, `module-cards` green.
* j_54 W2 "client A signs; CLIENT_SIGNED" passes twice on isolated copies (W3 after qa's body change).
* Opus reviewer plus breaker (permissions, a public route): `Reviewer: Approve <exact head>`, and `ci` green.

Legal points (the e-signature identity of a click on a test page): Unconfirmed: no counsel. Sample values only; US$0; no vendor call; live AI off.
