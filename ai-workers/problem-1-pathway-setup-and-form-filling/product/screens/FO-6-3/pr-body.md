Title: runtime: FO-6 part 3 — retainer signing on the fake vendor: send, state, signed file back, signing.completed
Branch: claude/jolly-curie-wjyd6o → main (open as a draft; the full check runs when it is marked ready)

**What and why.** FO-6 part 3 (brief `design/briefs/track-b/FO-6-3.md` on `lead-b/2026-11-22-track-b` @ 098153d17; R1.54 e-signature with evidence, R1.61's signing half). On the fake vendor only (P-561, P-568: no vendor call):
- **Send.** The retainer's Send now also creates the signing request in the same step. The adapter's envelope is made first, with the current version's file. Then, in Send's own transaction, the request and its signers: the client, then exactly one firm signer, the representative.
  - A failed transaction cancels that envelope.
  - A second Send of the same version gets 409.
  - Any id belonging to another firm (retainer, version, person, staff) is refused.
  - A live request left behind by an Edit is ended (CANCELLED, UPDATED) and its envelope cancelled.
- **State.** `GET /api/front-office/retainers/:id/signing` (key `agent/retainer:show`, `@OwnOrAll("agent/prospect")`) shows the status, "1 of 2 signed", each signer's side, name and moments, and the evidence's hashes. It never shows a token, code or provider id. Another firm's retainer gets 404.
- **The signed file back.** `POST /api/hooks/signing/:provider`:
  - The adapter verifies the body; an unverified call gets 400 and nothing is stored.
  - The request is found by the provider's document id under a named per-firm bypass use, then everything runs as its firm. Each event is stored once, with the request locked first.
  - `viewed` and `signed` move the signer, the request and the retainer. The firm signs last, and nobody signs without recorded consent. Either refusal gets 409 NOT_YET and keeps nothing, so the provider's redelivery applies later.
  - An early `completed` gets 409 NOT_READY. A withdrawn, paper-signed or replaced agreement makes a later `completed` final.
  - `completed` stores both files, hashed, in `fo_signing_evidence`. It moves the request and the retainer to SIGNED, writes `signing.completed` last, then emails "Your signed agreement" to each client once (Reply-To the firm).
  - A CONSULTATION request goes to the handler FO-3c registers (`signing/handlers.ts`); until then it gets 200 "no handler". `declined` is stored and left to FO-5d.
- **`signing.completed`** lives in the new `ports/events/signing.ts` (#2919's pattern; `ports/events.ts` is untouched). On it the retainers module makes the prospect WON `E_SIGNED` once (`retainers/on-signing-completed.ts`). If FO-13c's conflict gate refuses the win, the signature still stands and a `signing.win_held` line says why.

**Plan.** As the brief: one call in `retainers/service.ts` Send, everything else new files. No migration, no schema, no vendor file, no screen, no `main.ts` line.

**Checks and results** (each run from `studio/` with `tsx --tsconfig api/tsconfig.json`):
- `tests/check_fo6_signing_api.ts`: 49 passed, 0 failed; exit 0 twice, at 156832ed9.
- Unchanged and green: `check_fo6_signing` 47/0, `check_fo6_signing_port` 16/0, `check_fo5_retainers` 248/0, `check_fo5b_retainer_checklist` 28/0, `check_pf12_walls` 110/0, `check_fo13c_conflict` 46/0, `check_pf0p_ports` 126/0.
- Updated by one line each to list the new route, bypass use, audit line and sender, then green: `check_pf12b_bypass_audit` 70/0, `check_pf6b_permission_rules` 34/0, `check_fo2w_won_event` 19/0, `check_pf19r_every_sender` 21/0.
- `graph.mjs --check` exit 0; `count-any.mjs` 416 at base and 416 now; `module-cards.py pr` PASS.
- **`check_pf28_inputs` is red:** part (a) is fixed (the hook body reaches a zod parse); part (b) is red on the hook route's HTTP probes (Question 2).
- `run-suites.sh --changed` selects ALL because `retainers/service.ts` is shared. As the skill says, I ran the suites of the files I touched; the PR's check runs the rest.

**Review.** Opus reviewer and breaker, two rounds each: `product/screens/FO-6-3/review.md` and `break-report.md`.

| Round | Commit | Reviewer | Breaker |
|---|---|---|---|
| 1 | c1c7d32 | Changes (4 Majors) | Changes (2 Majors) |
| 2 | e0d7697 | Changes (1 new Major) | Changes (1 new Major) |

Round 2's one Major was the same in both reports: an early `completed` was stored as final. It is fixed at f2021fe with a fail test. A third round needs the Lead's line (Question 1).

PR comment lines to post:
`Reviewer: Changes c1c7d32bd6ba82b618fe080aefbfef729f3dc7ba`
`Reviewer: Changes e0d7697658c973a1338cb0f862a84a31b1a76c70`

**Before and after:** nothing visible (API only). **On the demo:** nothing yet (FO-5s builds the screens; part 4 builds the client's signing door). **Cost:** US$0.

**Questions for the tech lead** (each with my recommendation):
1. **Lead allows round 3:** every Major from both rounds is fixed with a fail test. Recommend: allow a diff-only round 3 (`e0d7697..head`).
2. **PF-28 part (b) on `POST /api/hooks/signing/:provider`:** PF-28 exempts only Stripe's webhook (`HOOK` in `check_pf28_inputs.ts`). Recommend: a second named webhook entry judged over HTTP like Stripe's (signature, then schema), added in this PR. Alternative: an allow-list entry naming FO-6v. The reviewer accepts either as not blocking the label, provided the check is green before merge.
3. **Touch list grew:** `platform/firm-scope.ts` (one `BYPASS_USES` entry; part 1's migration names this path) and one-line list updates in four suites (pf12b, pf6b, fo2w, pf19r). Without them the webhook cannot find a request under the walls, or the sweeps go red. Recommend: accept.
4. **Size:** about 850 changed lines of code and tests (signing/service.ts ~285, the suite ~400), plus records under P-775. That is over P-610's 800, almost all test cases the reviewer and breaker asked for. Recommend: accept as one part.
5. **Start condition:** #2933 and #2919 are still open. Lead 4: build and review now, label only after both merge. Merge main only on a conflict (P-270).
6. **Left for later parts, recorded in `MODULE.rows/FO-6-3.md`:**
   - A request sent before part 4 has no usable link (only the token's sha256 is kept).
   - The signed-copy email is sent after the commit (part 5's JobPort).
   - `prospect.won` still carries `sealed_retainer_sha256: null` (`sales/prospects.ts`).
   - The webhook writes the parsed JSON back for the fake; FO-6v mounts a raw body.
   - A rate limit behind a proxy shares one bucket (breaker m6).
   - Parallel identical completions can leave unused file pairs (breaker m3, the remainder).

**Done when** (the brief's lines, each a named case in `check_fo6_signing_api.ts`): S1-S4, W1-W5, B, G pass; the five unchanged suites exit 0; full `ci` green after Question 2.

Duplicate check: searched `git grep -i "foSignatureRequest|hooks/signing|SIGNING_COMPLETED|signing.completed"` on origin/main (part 1's schema, part 2's port and contract only), open PRs at 15:0x IST (none builds FO-6's API; #2922 FO-3c leaves the webhook to FO-6), BACKLOG FO-6 rows; none. Touch-overlap against #2922: clean (exit 0).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01Ln6TiQQuh9E2zEM4jmnmDc
