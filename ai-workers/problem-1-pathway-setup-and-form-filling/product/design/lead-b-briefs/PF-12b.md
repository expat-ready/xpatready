# Brief: PF-12b, every use of the bypass writes an audit line, and the own-firm doors stop using it (QA-499; map row 4, R1.4) (cloud builder lane; row owner Lead B)

Written 16 Nov 23:1x IST by Build Lead A (Lead B, 6), rev 16.82, from **QA-499** (Gap · Major, qa #1999). It is ruled by Lead 70 on #1999 (comment 6923947779): "a bypass use must write an `audit_event` row … No log-only ruling, and R1.4's Done when is unchanged". The basis is P-607 (fail-closed audit), AG-1-45 and P-571 (1) (one trail, `audit_event`). Row: new, **PF-12b**, after PF-12 (#1910, merged). **Model: Opus 5.5, effort: high**: walls between firms, audit, security. **Breaker: yes.** The release holder reads the SQL (P-423).

**Parts (named before building, P-644 rule 1; PR titles name the part exactly):**
* **PF-12b part 1: the cross-firm uses write `audit_event`, fail-closed.** It starts **now**: PF-12 is on `main`, and no open PR touches `api/src/platform/firm-scope.ts` (check again at start).
* **PF-12b part 2: the own-firm doors move off the bypass** to narrow lookups owned by `xr_wall_reader`, and leave `BYPASS_USES`. It starts when part 1 is on `main`, because the same file and the same test are involved.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-12b part <1|2>` and take **one part** end to end on a fresh branch from `origin/main`, one PR per part.

**The rules (cite each in the PR):**
* **R1.4's Done when** (map row 4): the bypass is used only by named uses, and "every use writes an audit line".
* **QA-499's expected behaviour** (`qa/BUGS.md` on #1999's branch). Every bypass use that can read or write beyond the caller's own firm writes one `audit_event` row, or is refused. The own-firm doors move to narrow lookups, so they are no longer bypass uses.
* **P-607** (an action whose audit line cannot be written does not happen) and **P-571 (1)** (one trail: `audit_event` through `AuditPort.record`, never a second audit table).
* **AG-1-45** (the firm's trail of access).
* Contracts §0 rule 2 (the firm filter).
* PF-12's break report m6 (`screens/PF-12/break-report.md` §6: "the bypass is one statement away for any xr_app session"). Part 2 shrinks that surface.

**Read only these:**
* on `main`: `api/src/platform/firm-scope.ts` (all of it: `BYPASS_USES`, `asBypass`, `asJob`, `bypassLine`, `onBypassLine`);
* `ports/audit.ts` (`AuditPort.record(tx, entry)`, the fake's `failOn`);
* the audit adapter it names;
* `prisma/schema/governance.prisma` (`AuditEvent`);
* PF-12's migration (the `platform_web_address_taken` definer, owned by `xr_wall_reader` with `search_path` pinned: the pattern for part 2);
* `tests/check_pf12_walls.ts`;
* each caller of `asBypass` and `asJob` (find them with `git grep -n "asBypass\|asJob"`);
* `api/src/platform/MODULE.md`;
* the requirement text the trace tool prints for R1.4 and AG-1-45.

**What to build, part 1 (the uses that cross firms):**

These uses cross firms:
* `job:messages.outbox_sweep`;
* `job:platform.secret_box.reencrypt`;
* `platform.web-address.catch-up`;
* `platform.demo.reset`;
* `platform.demo.inbox`;
* `platform.firms.signup`;
* `job:platform.signup.purge`;

**`asBypass` records before it runs `fn`, and refuses if it cannot record (P-607).** The audit line:
* `action: "platform.bypass"`;
* the use's name;
* the method (never the path, because a token can be in it);
* the actor: the staff id when a request has one, else `job:<queue>` or `system:<use>`;
* the correlation id (PF-23).

**One line per firm the use touches,** under that firm (`AuditPort.record` takes a firm id; that firm's trail shows it, AG-1-45):
* A sweep or a reset that walks firms one at a time records that firm's line **inside that firm's share of the work**, in the same transaction as its writes. Give `asBypass` a `touch(firmId)` callback for this, or a small helper the sweep calls. Name the one you pick in the PR.
* A use whose firm is not known before it runs records the line when the firm is known, in the same transaction. Sign-up verify records under the **new** firm, in the transaction that creates it.
* A use that touches **no** firm's rows needs no line, but the PR must show that it touches none. If it reads a walled table, it does touch a firm, and it records. (The likely case is `job:platform.signup.purge` on pending sign-ups before any firm exists.)

**Fail-closed:** if `AuditPort.record` throws, the use's transaction rolls back and the use is refused. A request answers 500 with plain words, and a job fails and retries as `JobPort` does. No silent use.

**The server-log line stays** as the operations line (PF-23). It is no longer the audit.

**Every entry in `BYPASS_USES` names how it audits:** a new field, `audit: "per-firm" | "none: <reason>"`. A test reads the list and fails on an entry without it.

**What to build, part 2 (the own-firm doors):**

These seven doors and their firm lookup:
* `platform.identity.authenticate`: the session's staff member → their firm;
* `platform.identity.sign-in`: firm key → firm;
* `platform.identity.invitation`: the token → invitation and firm;
* `fo.sales.web-form`: form token → firm;
* `fo.booking.public-page`: firm key → firm;
* `fo.booking.self-service`: booking token → firm;
* `platform.web-address.host`: host → firm.

**What changes:**
* Each door **stops using the bypass.** It calls one narrow `SECURITY DEFINER` function, owned by `xr_wall_reader` with `search_path` pinned, as PF-12's `platform_web_address_taken` is. The function takes the key or token and **returns only what the door needs to choose its firm:** the firm id, plus the staff id or row id where the door needs it, and never a row's other columns. The door then runs as that firm through PF-12's normal scope.
* The door's entry is removed from `BYPASS_USES`.
* One migration holds the functions, with area-prefixed names: `platform_…` for the platform doors and `fo_sales_…` or `fo_booking_…` for the front-office ones (rows rev 15.2).
* **The token stays hashed:** a function that takes a token compares its sha256, as the stored column does. It never receives the stored hash back.
* **Not found answers the same** as today: 404, or the door's own refusal. A wrong token reveals nothing about which firm holds it.
* **Size (P-610):** if the seven doors pass 800 lines, split the part into 2a (`authenticate`, `sign-in`, `invitation`, `host`) and 2b (the three front-office doors). Name the split in the PR before building.

**Done when** (P-606; list the cases in the PR body first; the reviewer ticks one per line). The test files are `tests/check_pf12b_bypass_audit.ts` (part 1) and `tests/check_pf12b_doors.ts` (part 2).
* **`PF-12b DW1` pass/fail (part 1).** On an isolated copy with the two Sample firms, run the outbox sweep, the demo reset and the demo inbox read.
  - Pass: each firm touched has one `audit_event` row (`platform.bypass`, the use, the actor, the correlation id), visible in **that firm's** trail and never in the other's.
  - Fail: QA-499's own steps give 0 rows today, and that count must become one per firm touched.
* **`PF-12b DW2` fail (part 1).** With the audit fake's `failOn` matching `platform.bypass`:
  - the use is refused;
  - nothing it would have written is stored (the transaction rolled back);
  - a request answers 500 with plain words.
* **`PF-12b DW3` (part 1).** Every `BYPASS_USES` entry has `audit`. An entry added without it fails the test. A `none` entry's reason names why it touches no firm.
* **`PF-12b DW4` (part 1).** Sign-up verify writes its line under the new firm, in the transaction that creates it. A refused verify writes no firm and no line.
* **`PF-12b DW5` pass/fail (part 2).**
  - Pass: each of the seven doors still works as today: sign in, an invitation link, a form post, a booking page and a booking link, and a firm address.
  - Fail: a wrong key or token answers exactly as today.
  - Neither: none of the seven calls `asBypass` any more, and none is on `BYPASS_USES` (the test reads the list).
* **`PF-12b DW6` (part 2).**
  - Each new function is owned by `xr_wall_reader`, is `SECURITY DEFINER`, and has its `search_path` pinned.
  - Each returns only the documented columns, checked from the catalogue.
  - `xr_app` can call it, but cannot alter it.
* **`PF-12b DW7` (both parts).** QA-499's check counts `audit_event` rows that name a bypass. It must now match `BYPASS_USES` × firms touched, and the seven doors must add none.

**Duplicate check:** BACKLOG (PF-12; PF-23 the log; PF-4s, whose `/api/system/*` routes will be bypass uses, so they inherit `audit` from part 1's field), open PRs (none on `firm-scope.ts` at writing), `qa/BUGS.md` (QA-499; QA-500 is records, the Lead's). Write one `Duplicate check:` line after re-running it.

**Touch list:**
* **Part 1:**
  - `api/src/platform/firm-scope.ts` (`BYPASS_USES`' `audit` field, `asBypass`'s record step and `touch`);
  - each sweep, reset or door listed in part 1 above, for the per-firm `touch` call only;
  - `tests/check_pf12b_bypass_audit.ts`;
  - `tests/check_pf12_walls.ts`, but only if its bypass-line count changes (say so);
  - `api/src/platform/MODULE.md`, with the invariant "every bypass use writes `platform.bypass` to the touched firm's trail, or is refused".
* **Part 2:**
  - one migration folder (the definer functions);
  - `api/src/platform/firm-scope.ts` (the seven entries removed);
  - the seven doors' lookup call sites (identity guard and session, invitation, web-address host, the form, booking page and self-service lookups), for the lookup only;
  - `tests/check_pf12b_doors.ts`;
  - `api/src/platform/MODULE.md`;
  - `api/src/front-office/MODULE.md`.

**Contract used:** `AuditPort` (`ports/audit.ts`), PF-12's scope (`firm-scope.ts`), PF-23's logger. No port changes: if one is needed, stop and ask (P-423).

**Parallel safety:**
* **`firm-scope.ts` belongs to this row while it is open.** No other row edits `BYPASS_USES` meanwhile. PF-4s and PF-19e add uses after part 1 and must give the `audit` field.
* **Part 2 touches the identity guard.** It must not run beside PF-4c part 1, PF-6m2, PF-4pc or PF-4s, which touch `identity/`. Check open PRs at start; whichever starts second waits (P-526).
* **The migration's stamp** is later than the newest on `main` when it merges (rows rev 15.2).

**Reviewer and breaker** (P-278: walls, audit). The breaker tries:
* a sweep whose audit write fails halfway, where the first firm's work must roll back;
* a bypass use called from a route not on its list (it must still be `BypassRefused`);
* a guessed token against each new definer function (the same answer as not found);
* reading another firm's row through a definer function's return.

**P-610:** part 1 is about 450 changed lines and part 2 about 650, tests included (part 2 splits 2a and 2b if it passes 800).
**P-605/P-606:** Opus 5.5, with no model switch mid-session. Finish whole: if an item needs more than its touch list, stop and ask in a PR comment.
**CI (Lead 70, 22:58 IST 16 Nov):** keep the PR a **draft** until the reviewer approves the head, then mark it ready once for one full ci run.
**Rules (standard, every PF/FO brief):** P-559. One row, one session, one PR. Opus reviewer (P-303); the re-review reads only the diff (P-277). Label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385). Merge `main` only on a conflict (P-270).

Before asking for the label, run on `main` merged into your branch:
* the suites of every CI part that went red on an earlier head;
* every suite in the shard that shares the demo database with yours.

Then paste the result lines in the PR.

Also:
* Live AI off, US$0, and never a priced button (P-175). No real keys anywhere.
* Push after every step (P-557).
* Ask questions in a PR comment headed "Question for the tech lead".
* Report to the current Lead (`tools/current-lead.sh`) and to **Build Lead A** (Lead B, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`).
* Read only the files named here and the code you change (P-556).
