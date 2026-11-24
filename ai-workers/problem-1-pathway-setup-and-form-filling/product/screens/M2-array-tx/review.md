# Review: M2 no array batch through the app's client (PR #3441), head 4461c363b118b14f33444068b1ed8ddeeead5f43

Fresh reviewer, 24 Nov. Scope: `git diff d33cb8de8..4461c363b` only (11 files). I read Prisma 7.8.0's `getPrismaClient.ts`, `createCompositeProxy.ts`, `itxClientDenyList.ts`, `RequestHandler.ts` and `ClientEngine.ts` (from `@prisma/client/runtime/client.js.map`). All runs used scratch databases on :54329 and isolated copies on runtime ports :4431 to :4433. I did not use :4400. Every swapped file was restored (`firm-scope.ts` sha1 b243f392 before and after) and `git status` is clean.

**Verdict: Rework.** The wall fix is right in intent, and the four conversions are correct. But the run-time override drops the receiver of `$transaction`. In Prisma 7.8 that turns every nested `tx.$transaction(fn)` into a separate top-level transaction on another connection. The firm profile save now fails with a 500 and leaves part of its writes committed. The fix is four lines, and I checked it (B1).

## What I ran
| Check | Result |
|---|---|
| `tests/check_no_array_tx.ts` at the head | **10 passed, 0 failed** |
| The same in a scratch worktree with d33cb8de8's `firm-scope.ts` and the four files | **4 passed, 6 failed**: B's batch ran as A, and as `xr_staff_bypass` reading `A-secret,B-secret`; the refused insert ran; the source check found exactly the four calls |
| Probe: `tx.$transaction(fn)` on the app's client (WalledPool + `oneQueryPerCaller`) | base: same backend pid and txid (nested). **Head: a different pid and txid**; an inner write survives the outer failure (1 row) |
| Probe: `writeSetting(tx)` after `select … for update` on `platform_firm` (profile/service.ts:162-172) | base: saved in 16 ms. **Head: error once the outer timeout passed** (inner insert waits on the outer's row lock) |
| Probe: advisory lock, then `copyFirmHoursTo(tx)` (availability.ts:263-265 → booking-seed.ts:43) | base: 5 windows copied in 25 ms. **Head: error after 5012 ms** (the same advisory lock taken twice) |
| `check_r192_firm_profile.ts` on an isolated copy (real main.ts) | **Head: 48/58**. P2 save is 500 and the audit count per key is `[1,0,0,0,0]` (one key committed); P4 and F1 are 500. With d33cb8de8's `firm-scope.ts`: 58/58. With the B1 fix: 58/58 |
| B1 fix (below) in a scratch copy | nested probe on the same pid and txid; all three probes green; `check_no_array_tx` 10/0 |
| Suites for the four calls at the head | `check_c41_section_order` 32/32, `check_w1_structure` 81/81, `check_bk17_keep_recorded` 25/25 |

## Blockers
- **B1: the override loses `this`, so nested interactive transactions stop being nested.** The bug is at `api/src/platform/firm-scope.ts:544-547`: `c.$transaction.bind(client)` plus an arrow function.
  - In Prisma 7.8 an itx client keeps `$transaction`, because nested transactions are supported and the deny list is only `$connect, $disconnect, $on, $use, $extends`.
  - The itx client reads `$transaction` from the raw client (`createCompositeProxy` get → `target[prop]`), so it gets this override, which is bound to the root client.
  - Prisma decides nesting with `getItxScopeContext(this)`. Bound to the root, it reads "top-level" and opens a new transaction on another pooled connection.
  - Reached by every helper that runs `"$transaction" in db ? db.$transaction(run) : run(db)` when it is given a `tx`:
    - `settings.ts:188` (`writeSetting`), from `settings/profile/service.ts:172`, `branding/branding.ts:132`, `branding/images.ts:56,65`, `booking/settings/timings.ts:153`, `identity/demo-reset.ts:35` and `keep-period/service.ts:45`;
    - `booking-seed.ts:50` (`copyFirmHoursTo`), from `availability.ts:265`, which deadlocks on its own advisory lock;
    - `library-changes.ts:148` (`decideChange`), from `review-proposals.ts:168`, where the batch decision's "one refusal rolls every row back" is lost;
    - `front-office/sales/arrival-port.ts:100`.
  - Effects: the firm profile, branding and booking timings saves fail or keep part of their writes (all-or-none is lost), a person's first availability read hangs 5 s and then fails, and a batch decision can leave some rows decided.
  - `$extends` clients would also get the root's itx client and lose their extensions (there is no `$extends` in `api/src` today).
  - **Fix** (checked above): keep the receiver, and refuse anything that is not a function. That mirrors Prisma's own branch (`typeof input === 'function'`, getPrismaClient.ts `$transaction`), so array-likes are refused too:
    ```ts
    const transaction = c.$transaction;
    c.$transaction = function (this: unknown, arg: unknown, opts?: unknown) {
      return typeof arg !== "function" ? Promise.reject(new Error("M2: …")) : transaction.call(this, arg, opts);
    };
    ```
    Add these cases to `tests/check_no_array_tx.ts`: `tx.$transaction(fn)` inside `db.$transaction` reports the same `pg_backend_pid()` and `txid_current()`; an inner write is rolled back when the outer transaction throws; `tx.$transaction([...])` is refused. Each must be red at 4461c363b.

## Majors
None besides B1.

## Minors
- **m1: the array check is narrower than Prisma's branch.** At `firm-scope.ts:545`, `Array.isArray` refuses arrays and Proxy-wrapped arrays. Any other non-function still goes to `_transactionWithArray`, for example an array-like object with a `map` method. A `Set` or a generator throws before anything runs. **Fix:** `typeof arg !== "function"`, already in B1's code.
- **m2: the array form is not banned in the types, and the source check is a one-line regex.** `Db` still has Prisma's array overload, so `tsc` accepts a new `$transaction([...])`. The regex at `tests/check_no_array_tx.ts:76` misses:
  - a call that spans lines (`$transaction(\n  [`);
  - an array held in a variable (`db.$transaction(ops)`);
  - `Array.from(…)`, `.flatMap(`, or `xs.filter(…).map(`.

  I saw no realistic false positive. A miss fails closed: the run-time refusal turns it into a 500 on that path, never a cross-firm read. **Fix:** give `Db` only the callback signature in `core.ts`, for example `declare $transaction: <R>(fn: (tx: Omit<PrismaClient, ITXClientDenyList>) => Promise<R>, options?: {...}) => Promise<R>`. `tsc` then refuses arrays, and `Parameters<Parameters<Db["$transaction"]>[0]>[0]` (case-prepare.ts:986 and 10 other files) still resolves. Or make the check multiline and flag any `$transaction(` argument that is not `async`, `(`, `function` or a known callback name.
- **m3: the PR body's question 1 is wrong on a fact.** It says the array batch had no time limit, but Prisma 7.8 gives it one: `_transactionWithArray` sets `timeout: options?.timeout ?? transactionOptions.timeout` (5 s), and `ClientEngine.requestBatch` applies it. So 30 s for `edition-published.ts:55` is longer than before. That is acceptable for one indexed `updateMany` per file, but the body should say it. **Fix:** correct the body.
- **m4 (nit):** at `case-prepare.ts:212`, `(tx) => Promise.all(read(tx))` shadows the `tx` parameter of `sync`. **Fix:** rename it, for example `(t) => Promise.all(read(t))`.
- Accepted, not a finding: `PrismaClient.prototype.$transaction.call(db, [...])` gets past both checks. It is a deliberate bypass, and code review would see it.

## The questions asked (verified, no further finding)
- **Is it installed on every client over the WalledPool? Yes.** `core.ts:39` `Db` is the only one in `api/src`. The other 7 `new PrismaClient` calls in `api/src` (seeds, `firms.ts:46`, `prospect-won.ts:230`, `firm-created.ts:146`) use the owner's address, are not request-scoped, and do not use a WalledPool. Tests that build WalledPool clients without `oneQueryPerCaller` are test-only. The only array call left (`check_aud1m_case_writes.ts:94`) uses a plain owner client.
- **case-prepare.ts:212.** Repeatable read and `maxWait` 10 s are kept. The timeout is 5 s both before and after. The three reads run in one repeatable-read transaction on one connection, so they share one snapshot (taken at the first statement). Prisma batches them under `itx-<id>` (RequestHandler.ts:126) on that connection.
- **edition-published.ts:55.** `updateMany` gives a count of 0 on a missing or already-filled row, as before. Same order, all or none.
- **structure.ts:260.** `updateMany` in the same order. The defaults (2 s `maxWait`, 5 s timeout) match the old batch's defaults.
- **studio.ts:783.** `update` still throws P2025 on a missing row, and everything rolls back.
- The firm-scope reasoning holds. An itx takes its connection in its caller's scope when it starts (test 4). Its later batches run on that connection, even when another caller's tick sends them (tests 1b, 2b).

## Not applicable or not checked
- **Journey score: 5/10, fail (one 0 is enough to fail).** See `journey-test-reviewer-2026-11-24.md`. The journeys are API-level on an isolated copy: the firm profile save, plus the probes. I walked no browser, since the diff has no UI. It reaches 10 with B1 fixed (r192 58/58).
- **D1-D20 and BIC-01 to BIC-20:** N/A (platform runtime, no screen). The row fragments follow the Entry points / Tests format.
- **Not run:** `typecheck.mjs` (no type changes in the diff; the PR reports PASS), `graph.mjs`, `check_pf12_walls`, branding, timings, availability and batch-decision suites (most use a plain client, which is why they would not catch B1), and full CI.

Reviewer: Block 4461c363b118b14f33444068b1ed8ddeeead5f43

Verdict: Block 4461c363b118b14f33444068b1ed8ddeeead5f43

## Round 2, head 078ebab5dad1c6c939e0a7340e6e8121ba491175 (24 Nov 13:43 IST)

Same reviewer role, fresh pass. Scope: `git diff 4461c363b..078ebab5d -- ':!*/product/screens/*'` (3 files: `firm-scope.ts`, `case-prepare.ts`, `tests/check_no_array_tx.ts`). Scratch databases on :54329; isolated copies only through `run-suites.sh` (runtime copies, ports +14000), never :4400. Every swapped file was restored (`firm-scope.ts` sha1 39d82cf5 before and after), the temporary probe was moved out of `tests/`, and `git status` is clean.

**Verdict: Ship.** B1 is fixed the way round 1 asked, and I found no Blocker or Major. Four Minors, none of which blocks.

### What I ran
| Check | Result |
|---|---|
| `tests/check_no_array_tx.ts` at the head | **14 passed, 0 failed** |
| The same suite with 4461c363b's `firm-scope.ts` | **12 passed, 2 failed**: nested pid 13644 against 13636 and txid 209853 against 209855; the inner write survives (1 row). The third new case (an array on a tx client) **passes** there (see m6) |
| Mutation: `transaction.call(client, …)` in place of `call(this, …)` | 12/2, the same two cases red |
| Mutation: `Array.isArray(arg)` in place of `typeof arg !== "function"` | **14/0, nothing red** (m5) |
| Call-shape probe (`r2rev/probe.ts` in the scratchpad; `class Db extends PrismaClient` with `oneQueryPerCaller(this)` in its constructor, as core.ts:39) | 12/12: the root runs in the caller's firm and passes options through (repeatable read seen); `tx.$transaction(fn)` and a doubly nested call keep the outer pid and txid; the `"$transaction" in c ? c.$transaction(run) : run(c)` helper opens its own transaction given `db` and nests given `tx`; a `$extends` client's tx keeps its client method and query hook, nests, and refuses an array; an array-like, an iterator, a `Set`, `undefined` and a Prisma promise are all refused with the M2 message, and nothing runs |
| `run-suites.sh --only check_r192_firm_profile.ts` | **58/58** (48/58 at round 1) |
| `run-suites.sh --only` fo3a hours/timings, pf13 branding, qa193 batch mark, bk17 keep recorded | 47/0, 30/0, 18/18, 25/25 |
| Source check alone on api/src (583 files) | **0 raw matches**, even before the comment filter, so there is no false positive today |

### The questions asked
- **B1 is fixed.** `firm-scope.ts:547-552` keeps the unbound method and calls it with the receiver. Prisma's proxy `set` writes an own property on the raw client (createCompositeProxy.ts `set`). Every itx and `$extends` client reaches that property through `target[prop]`, so `this` is the itx or extended proxy. `getItxScopeContext(this)` (getPrismaClient.ts:254, 889) then reads "nested", as it does without the override.
- **`this` in every call shape:** right in all four (probe above). The only shape that changes is a detached `const t = db.$transaction; t(fn)`. It now throws `Cannot read properties of undefined (reading '_engineConfig')`, exactly as Prisma's own method does. No such use exists in api/src (searched `$transaction` not followed by `(`: only types, `in` checks, and `typeof db.$transaction` at library-changes.ts:148).
- **Refusing every non-function breaks no legitimate call.** All 32 `$transaction(` calls in api/src whose argument is not an inline `async` (of 324 in all) pass a callback: `(tx) => …`, `fn`, `run`, or `(snap) => …`. None spans lines. Prisma's runtime calls `$transaction` nowhere itself (searched the whole source map). Prisma also takes this same branch (`typeof input === 'function'`, getPrismaClient.ts:882).
- **The source check** catches an array, `.map`, `.flatMap`, spread and `Array.from`, on one line or across lines. It still misses `xs.filter(p).map(`, `rows().map(`, a variable (`$transaction(ops)`), `$transaction?.([`, `$transaction<[A]>([` and bracket access. It would flag a match after a trailing `//`, in a one-line `/* */` or in a string. Neither kind occurs in api/src. This is round 1's m2, which the builder declined because the run-time refusal fails closed. I accept that.
- **case-prepare.ts:212 rename:** a pure rename, `(tx) => Promise.all(read(tx))` to `(snap) => Promise.all(read(snap))`. It no longer shadows `sync`'s `tx`. The `snap` at :833 is in another function. Repeatable read, `maxWait` 10 s and the 5 s default timeout are unchanged. bk17 25/25.

### Minors
- **m5: the m1 change is not tested.** With `Array.isArray(arg)` restored, `check_no_array_tx` is still 14/0. **Fix:** add one case: `$transaction({ length: 1, map: (f) => [f(<insert>, 0)] } as never)` from firm B in the same tick as firm A is refused, and nothing runs. It is red with `Array.isArray`, because the breaker's a1 ran it as firm A.
- **m6 (records): the PR comment says the three new cases were "each red at 4461c363b".** "An array batch on a transaction client is refused" passes at 4461c363b (12/2 above). It is a fair guard case, but the claim should say that two of the three were red.
- **m7 (nit): the multi-line probe runs the regex on a literal**, not through the file-reading path. A return to `split("\n")` would keep it green. **Fix:** put the file scan in one `scan(text)` function and run the probe through it.
- **Round 1 m3 is still open in the PR body.** Question 1 still says "the array batch had no time limit". The builder's comment says "noted for the body", but the body has not changed. **Fix:** edit the body (the old batch had Prisma's 5 s default).

### Not checked
- `typecheck.mjs`: `tsc api` was killed for lack of memory in this sandbox (148 s, no file checked); `tsc web` passed. The diff's only type surface is `function (this: unknown, arg: unknown, opts?: unknown)` assigned to the local `c.$transaction`. The builder reports PASS.
- Full CI, `check_pf12_walls`, `check_fo3_booking` (both reported green by the builder), and the availability first-read probe (the nesting probe covers its cause).
- **Journey score: 10/10, pass.** See `journey-test-reviewer-2026-11-24.md`, Round 2.

Reviewer: Approve 078ebab5dad1c6c939e0a7340e6e8121ba491175

Verdict: Approve 078ebab5dad1c6c939e0a7340e6e8121ba491175
