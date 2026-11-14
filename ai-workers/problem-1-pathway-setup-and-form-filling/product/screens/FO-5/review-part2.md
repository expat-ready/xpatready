# FO-5 part 2 of 2 (the retainer API): independent review (P-303)

* **PR:** #1777, branch `claude/funny-franklin-ckwwev`. **Commit reviewed:** `c97154b778ddec23df64de5ea79b17a3ab6cb03a` (`git rev-parse HEAD`). Reviewer: Opus, did not build it. Date: 14 Nov 2026.
* **Read:** the diff (`git diff origin/main...HEAD`, 11 files); row FO-5 (`origin/lead/2026-11-07-lead31`); brief `lead-b-briefs/FO-5.md`; concept `fo-5s-retainer-signing` §3 BR-1..BR-18 and §6-§7; contracts §0, §2.3, §2.6, §7 (`origin/lead-b-front-office`); on main: `ports/files.ts`, `ports/render.ts`, `platform/identity/keys.ts`, `platform/settings.ts`, the part 1 migration `20261114210000_fo5_retainer_tables`, PF-3's seeded keys; AG-05 v2.1 only for C5 and AG-5-47.
* All paths below are under `prototype/studio/` unless they say otherwise.

## Runs
* `node_modules/.bin/tsx --tsconfig api/tsconfig.json tests/check_fo5_retainers.ts`: **116 passed, 0 failed**.
* HTTP, isolated copy `fo5rev` on :4434 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`; FO-1a's front-office seed run by hand, three Individual prospects inserted as the test does), signed in as user-R (Owner + Case Manager, licence), user-T (Case Manager, licence), user-O (Case Officer), user-S (firm B). Stopped afterwards; the files it left in the demo's `var/front-office-files/` (m5) removed by hand.

| Call | Result |
|---|---|
| `GET retainer-templates/starter` as R, then upload it as a template | 200 `.docx`, `X-Sample-Note: Sample wording. Unconfirmed: no counsel.`; upload 201, 17 placeholders, no warning |
| starter as O (Case Officer) | 403 |
| Prepare on prospect 1 with a fee; Prepare again on the same prospect | 201 DRAFT v1; second 409, generic text (m8) |
| PATCH edit and POST send at the same moment | send 200; edit 409 `CHANGED` (correct) |
| the same edit again, an empty edit, another edit | **500, 500, 500** `FileKeyTaken` (M1); only Withdraw still works |
| download link as R; the URL as R / firm B / no session / altered | 200 docx / 404 / 401 / 404 |
| sees-all off: read as O; as T (neither owner nor representative) | 404, 404 |
| sees-all off: a link R made, used by O | 200 (m7) |
| sees-all off, T the representative of a retainer on R's prospect: read / edit / send / Signed offline | 200 / 200 / 200 / 200, `prospectWon: true` (m3) |
| a template with `{#fees}{fees.label}{/fees}`; one with `{fees.label}` outside any loop | 422 "{fees.fees.label} is not a placeholder we know"; 201, no warning (m4) |

## Done when: each line has a pass and a fail
| Line | Pass | Fail | Holds? |
|---|---|---|---|
| no active licensed person → no draft (AG-5-49) | representatives = R, T | 409 "No active licensed consultant" | yes; checked before the prospect, so it leaks nothing |
| client name or fee empty → send refused at the field (AG-5-9); everything else "missing" | v2 with fees sendable | 422 `fields.fees`, `fields.client.name` | yes. `completeness` (service.ts:271-279) blocks only those two plus BR-6's choices (signer with an email) |
| merge values copied; a later change to the person never alters them (AG-5-3) | v2 keeps "Client A Sample" | the new name is not in v2; v3 takes it | yes |
| `original_sha256` matches the stored file | sha over stored bytes | other bytes under the key refused | yes |
| an edit before any signature makes version 2 and ends version 1's request | v3, v2 `UPDATED` | — | yes, in part 1's order (end, then status, then the new version) |
| an edit after the client signed → refused (AG-5-65) | — | 409, and a racing edit is refused by the `FOR UPDATE` re-check (service.ts:364-365) | yes, but see M1 for what that refusal leaves behind |
| withdraw without a reason → refused; after Signed → refused (AG-5-34) | Sent → Withdrawn with reason | 422 no reason / spaces; 409 after Signed offline; 409 on a draft | yes |
| Signed offline needs a file and a reason and makes the prospect WON once | WON `SIGNED_OFFLINE`, one stage move | no file, no reason, not a PDF, over 10 MB (Sample), again → refused; one move only | yes; a consultation agreement never wins (service.ts:430) |
| unknown placeholder refused with its name; no fee placeholder → accepted with a warning | warning | 422 naming `{client.passport}` | yes (m4 is a loop edge case) |
| representative reads with everyone-sees-all off; another case officer without the prospect does not | T reads it and the header | O 404 | yes (writes go further: m3) |
| a download link expires and is refused for another firm | link for its firm | expired, other firm, altered | yes at `FileLinks`; route 404/401 also seen over HTTP |
| firm A reading firm B's retainer → 404 | — | read, edit, send, withdraw, draft on B's prospect: 404 | yes |
| every change writes one audit line in its transaction through `AuditPort` | 6 lines for 6 changes on RA1 | a failing audit rolls the draft back | yes; outbox row last in every transaction |

## What holds
* **Keys (AG-05 C5):** every route declares one `agent/retainer:*` key matching C5 (routes.ts:168-182); each is seeded by PF-3; the Case Officer lacks configure-template, offline-sign and void. Default deny via PF-4's guard (O → starter 403).
* **Firm walls:** every read is `firmId`-scoped first; another firm's ids are 404; the download token carries the firm and is checked against the session's firm.
* **FilesPort adapter:** firm folder per key, `FileKey` refuses `..`; write via temp file + `link` (atomic, two writers cannot both win); same bytes = retry. **Links:** HMAC-SHA256 over firm, key, expiry; constant-time compare; 5 minutes (Sample); expired 410, other firm or altered 404; `no-store`.
* **Money:** cents as `bigint`, 0..CAD 100 million, whole numbers only, `ON_DATE` alone carries a real date, currency CAD by the column, total as the sum of rows with an amount ("CAD 3,750.50" tested).
* **Audit and events:** `AuditPort.record(tx, …)` in each transaction (fail-closed, tested), outbox row last; event payloads `.strict()` with ids, kind, version only; audit detail holds ids, versions and sha256, never a name, email or licence number; the read response drops the licence number.
* **Render port and starter:** docxtemplater + pizzip; the starter is built at run time from `samples/fo5-starter-retainer.txt` by the port, no binary in git, labelled Sample and "Unconfirmed: no counsel" in the file and the header; the fee loop is in place; it uploads back with no unknown placeholder and no warning.
* **Part 1's triggers:** the writes follow r2-n2's order everywhere (version ended before the status moves; retainer bumped before the new version; fee rows in the version's transaction). r2-n1's stale comment is fixed. The `platform.prisma` lines moved under the slot lines (no SQL change).
* **AG-5-50:** a Corporate prospect with no `SIGNATORY` gets a draft, a warning and the company's contacts; client name is the company's.

## Findings

### Major
**M1. A rolled-back change leaves its file key taken, and every later Edit of that retainer is a 500 for good.** `service.ts:361-365`: Edit renders and `put`s `retainers/<id>/v<n+1>.docx` *before* its transaction, and only then re-checks the status under the lock. When that re-check refuses (the correct 409 `CHANGED`: a send, or once FO-6 lands the client opening the link or signing, at the same moment), the file stays. The next Edit renders v<n+1> again; the bytes always differ (other values, and even an identical request: pizzip stamps the time into the zip, `docx.ts:56`), so `LocalFiles.put` throws `FileKeyTaken` (`files.ts:40`), which nothing maps: **500 "Something went wrong"** on every retry, forever. Part 1's CHECKs fix the key name (`fo_retainer_version_file_key_check`: `retainers/<id>/v<n>`), so the service cannot pick another one. *Reproduced over HTTP on the first try* (table above): after the race, three edits → 500, 500, 500. Edit and resend (BR-9, AG-5-65 r1, a Done-when line) is then gone for that retainer; the only way out is Withdraw, which emails the client "Agreement withdrawn" once FO-6 lands. The same pattern is in `newTemplateVersion` (`service.ts:193-197`: two Owners uploading a new version at once; the loser can never upload v<n+1> with another file) and `signedOffline` (`service.ts:423-429`: if its transaction is refused, a re-scanned PDF is refused for good). A concurrent double edit also gives the loser a 500 instead of 409.
*Fix (builder's choice; the bar is "a change whose transaction rolled back never blocks the next attempt", with a test that forces a rollback after the file write and then edits again):* e.g. take the retainer's lock and re-check the state before rendering, map `FileKeyTaken` to a 409, and make a refused attempt's key reusable — either keys unique per attempt (needs part 1's three key CHECKs loosened in a new migration: Lead B's OK, P-600) or a byte-stable render plus a rule that a key no row references may be replaced. Ask Lead B in the PR if the migration route is chosen.

### Minor
* **m1. `retainer.sent` is written by FO-5, before FO-6** (`service.ts:392`, `ports/events.ts`). The row's events are drafted, withdrawn and signed_offline; concept §7 gap 2 gives `retainer.sent` to FO-6's send, with the prospect's move to Retainer sent (contracts §2.3). Today a SENT retainer has no request, no email and no prospect move, and the insert-only outbox keeps that event. Either hold the event for FO-6, or state in the PR that FO-6 takes over this method and must handle SENT retainers that have no request.
* **m2. Signed offline wins the prospect but writes no `prospect.won`** (`service.ts:438-451`). Contracts §2.6: "Front office then writes one `prospect.won` event"; FO-8 makes the client from it. The row names only `retainer.signed_offline`, and FO-2 (owner of `prospect.won` and `prospect.stage_moved`) is not on main. This is not a defect of this row. It is a question for Lead B: who writes `prospect.won` for `SIGNED_OFFLINE` (FO-2 reacting to `retainer.signed_offline` with `prospectWon: true`, or FO-5 once the name exists)? Record it in the PR.
* **m3. The representative gets write access, not just read** (`service.ts:121-131` gates every action). With everyone-sees-all off, user-T (representative, not the owner) edited, sent and recorded Signed offline on R's prospect, making it WON (HTTP table). The row and BR-3 grant "may read that retainer and the prospect's header"; AG-05 (v2.1 line 516) says prepare and send also need to "see the lead, prospect…". Either limit writes to people who see the prospect, or get Lead B's OK for the wider rule and write it in the code comment.
* **m4. Placeholders inside a loop or section** (`docx.ts:42-47`). Every tag inside `{#fees}` is prefixed, so `{fees.label}` there is refused as "{fees.fees.label} is not a placeholder we know", a name the firm never typed. Outside any loop, `{fees.label}` is accepted with no warning and prints nothing, because the data has no such key. A section like `{#client.phone}…{/client.phone}` is refused in the same way. The known list (`placeholders.ts:118-121`) shows these names as `fees.label`, which invites both mistakes. Accept the loop's bare names only inside the loop, refuse them outside it, and name in the message exactly what was typed.
* **m5. Isolated copies write into the demo's files** (`files.ts:27` ignores `STUDIO_VAR`; `core.ts:27` has `VAR_ROOT`). `fo5rev` wrote to `studio/var/front-office-files/<firm>/`, and `isolated.sh stop` reported "files removed" but left them (three other firms' folders from earlier runs are still there). `isolated.sh` promises the demo's files are never touched. Default the root to `join(VAR_ROOT, "front-office-files")`.
* **m6. The local adapter is looser than the port** (`files.ts:39-41`). The port (`ports/files.ts:1-3`) and its fake refuse the same key with another content type; `LocalFiles` accepts it and keeps the old type. Also, a key ending `.meta` is the meta file of another key (`files.ts:47, 67`): `put("x.docx.meta")` "succeeds" without writing, and `get` returns the other key's JSON. No caller uses such a key yet, but the port is shared (FO-6, FO-7). Refuse `.meta`/`.tmp` endings or keep meta files in a separate tree, and compare the content type.
* **m7. A download link works for anyone in the firm with the download key** (`routes.ts:155-161`). It checks the firm and the expiry but not visibility: with sees-all off, O downloaded with a link R made (200). Five minutes limits the risk. Bind the token to the staff id, or re-check `visible()` at download.
* **m8. A second Prepare on a prospect with a live retainer gets a generic 409**, "This already exists, or someone else saved the same thing at the same moment" (the global unique-violation mapping; `service.ts:297-302`). Part 1's review (i) asked the API for a plain message, e.g. "Client A already has a retainer in progress. Open it." The rendered v1 file is also left behind (harmless: random id).
* **m9. Send does not re-check the representative** (`service.ts:381-395`). If the representative was deactivated or lost the keys after drafting, the retainer still goes out, and BR-14's dead end ("The representative is no longer active…") follows after the client signs. One `representatives()` check at send prevents this.
* **m10. An edit that ends a sent request writes no event** (`service.ts:366-369`). Under concept §7 gap 9, FO-6 cancels the vendor request when it sees `retainer.withdrawn`; an edit-ended request has no event, so FO-6 must hook Edit directly (BR-9 already makes the two one step). Put this in the PR for FO-6's builder.
* **m11. Gaps against the concept for FO-5s (no new scope asked):** no route lists a prospect's retainers (S2's card has to find them) and no route downloads a template's file or an earlier template version (S1: "versions (each downloadable)"; template versions are not rows, only keys). Say in the PR where FO-5s gets these from (FO-4's prospect read, a later row) so the screen row is not blocked.
* **nit.** The Done-when link lines are tested on `FileLinks`; the route's 410/404 mapping and the representative's read through the guard have no route-level test (the HTTP check above covers them once).

## Journey score (reviewer; the one score for this check)
There is no screen, so the browser parts of `journey-test` (axe, widths, keyboard, visual quality) do not apply. I walked the API journeys over HTTP as staff would drive them through FO-5s (table above): starter → template → prepare → edit → send → withdraw / Signed offline → download, plus the wrong role, another firm, sees-all off, a double submit and a race.

| Criterion | Score | Evidence |
|---|---|---|
| task completed | 1 | main path works end to end |
| next step obvious | 1 | read returns `canSend`, field `blockers`, `missing` |
| plain words | ½ | most refusals are plain; "{fees.fees.label}" (m4), generic 409 (m8), 500 text (M1) |
| feedback and state | 1 | status, versions with ended reasons, sent times |
| correct data | 1 | values copied, sha256 matches, cents, one audit line each, outbox last |
| error recovery | **0** | after a correct 409 `CHANGED`, Edit is a 500 for good (M1) |
| accessibility and screen sizes | n/a | API only |
| speed | ½ | not timed; no visible wait on any call |
| visual quality | n/a | API only |
| trust and sources | 1 | starter labelled Sample and "Unconfirmed: no counsel" in file and header |

**6 of 8 applicable (7.5 of 10 scaled), one criterion at 0: not a pass.** What would raise it, most valuable first: M1 (error recovery to 1), then m4 and m8 (plain words).

## Verdict
Block on **M1**. To fix: a change whose transaction rolled back (Edit, a new template version, Signed offline) must never leave a key that refuses the next attempt, and a lost race answers 409, never 500. Add a test that forces a rollback after the file write and then edits again. The Minors m1-m11 are for the builder to fix or record in the PR; m2, m3 and m10 need Lead B's answer, not a code change by themselves.

Verdict: Block
