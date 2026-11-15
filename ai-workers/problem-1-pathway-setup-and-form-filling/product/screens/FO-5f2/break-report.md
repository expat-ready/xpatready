# FO-5f2 break report (breaker, row DW8) — 15 Nov

Isolated copy `brk_fo5f2` on :4472 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), started and stopped here; never
:4400/:4471/:4473. Signed in as user-R (Owner, sample-firm) and user-S (sample-solo) over HTTP. Scripts in the session
scratchpad, deleted. US$0, live AI off. Scope: FO-5f2 (the placeholder cap's rest, the allowlist, the worker) and the
DW8 goal — re-run every way in over HTTP with a concurrent page read, and try to take the API down / slow it for other
firms / get an unknown placeholder printed blank. Real files from `samples/fo5f2-real-templates.json`.

## Findings

**F1 — Major (availability, P-605). One global worker + one global queue serialize every firm's uploads and renders.**
`worker` and `queue` in `docx.ts:154` are module-level, shared across all firms. Each hostile/heavy upload holds the
single worker ~3.6–5 s (worker OOM→TOO_COMPLEX, or the 5 s timeout). A firm can monopolize it with cheap 106 KB files.
- Repro: firm A (user-R) fires 6 concurrent `runs` uploads (106 KB, body = 1.3 M `<w:r><w:t>a</w:t></w:r>`, no braces);
  300 ms later firm B (user-S) uploads the real Word file. Observed: A's six → 422 TOO_COMPLEX; **B's legitimate upload
  delayed to 27.3 s** (normal ≈ 0.47 s). 24 concurrent → B/others wait ≈ 86 s. Expected: one firm's load should not
  stall another firm's uploads/renders for tens of seconds. `draft`/`edit`/`send` all call `renderDocx`→`inWorker`, so
  retainer rendering is serialized too. No rate limit, per-firm fairness or concurrency cap exists.
- Held within it: the page read (`GET /retainer-templates`) never uses the worker, so it kept answering 200 throughout
  (slowest 3.6 s under a 24-deep queue; 0 failures).

**F2 — Major (availability, observed once; not reproduced in isolation). The whole API process OOM-crashed.**
After ~48 varied hostile uploads (round-3 mix incl. 25 MB-comment CT, 990-override, 2 M `<a/>` rels) a concurrent
`runs`+real burst drove the **main** process (pid, the listener — not the worker) to `FATAL ERROR: Reached heap limit`
(`var/isolated-logs/brk_fo5f2-api.log`). Server went to `000`; firm B's concurrent upload failed ("fetch failed").
Expected: a bounded per-job memory model should never let uploads crash the shared process. On a fresh server I could
**not** reproduce it — single `runs` upload, queue of 6, burst of 24, and 48 sustained heavy uploads all survived (peak
RSS ≈ 1.1–1.4 GB; default heap 2240 MB) with every page read 200. So it is a cumulative/heterogeneous-load effect
(heavy CT-regex + 990-part Maps in the main thread keeping heap pressure high), real but not deterministic. Mitigation
lead: cap concurrent in-flight uploads, and bound the main-thread cost of the huge-CT / many-part cases.

## What held (every way in from the handover — re-run over HTTP; API alive, reads answering throughout)
- Round-3 Major 1 (header Override on `word/h.rels`, `word/_rels/x.rels`, `word/[Content_Types].xml`): flood → 422
  TOO_COMPLEX; passport → 422 PARTS_NOT_ALLOWED. Closed.
- customXml typed core / diagramData; core outside `docProps/`: 422 PARTS_NOT_ALLOWED (flood and passport). Closed.
- `dc:title`/`Company` in a header, settings, docProps app/core; CDATA in a `w:t`: passport → 422 UNKNOWN_PLACEHOLDER
  "{client.passport} is not a placeholder we know"; flood → 422 TOO_MANY_PLACEHOLDERS. Item 5 closed (nothing printed
  blank; brace cap counts them).
- Delimiter change `{=<< >>=}` and `{=[[ ]]=}` (passport and 300 k/750 k flood, each in its own process, line-by-line
  log, no hang): 422 UNKNOWN_PLACEHOLDER "{=<< >>=} is not a placeholder we know" — the change is inert (`OPTIONS` fixes
  delimiters, `changeDelimiterPrefix:null`). Item 4/7 closed.
- N-1: 2 M `<a/>` in `[Content_Types].xml`, `_rels/.rels`, `word/_rels/document.xml.rels` → 422 TOO_COMPLEX in ≤12 ms
  (PACKAGE_PART size cap, pre-parse). 25 MB-comment CT → 422 before any parse.
- The six round-3 ways (`Default Extension="in"`, `Extension=""`, `word/hdr`, single-quoted Override, header under
  `charts/` and `customXml/`): 422 PARTS_NOT_ALLOWED.
- New probes: XML entity-expansion (billion-laughs) in a header → 422 UNREADABLE_FILE; deeply nested XML (60 k–800 k
  deep) in a non-package header → accepted, no crash (xmldom coped); 1.2 M `w:t` runs in a header → 422 TOO_COMPLEX
  (worker OOM, API survives); huge CT with 990 Overrides + no flood → 201 in 1.8 s (a cost, not a crash — round-3 Minor).
- Roles: starter download and upload as a case-only user (user-O) → 403. Duplicates: exact, upper-case and
  trailing-space names → 409; 3 concurrent same-name creates → one 201, two 409 (DB unique index holds). Cross-firm:
  user-S sees only solo's templates. Names: empty/over-120/newline/zero-width/RTL-override → 422; non-English → 201.
  No file / not-a-zip → 422.
- Render path: `GET /retainer-templates/starter` → 200, valid .docx (1418 B), no leftover `{...}` tag, rendered by the
  worker. (Draft→render not exercised: no prospect is seeded in this build; stored templates only ever hold known
  placeholders, and render uses the same `compile()` as the upload scan, so no unknown tag can print blank.)

## DW8: every way in re-run over HTTP (concurrent read = user-S `GET /retainer-templates`)
| way in | status | time | concurrent read slowest |
|---|---|---|---|
| header Override on `.rels` / folder `[Content_Types].xml` (flood/passport) | 422 TOO_COMPLEX / PARTS_NOT_ALLOWED | 13–22 ms | 23 ms |
| customXml core / diagramData, core outside docProps | 422 PARTS_NOT_ALLOWED | 12–19 ms | 20 ms |
| `dc:title`/`Company`/CDATA tags (passport / flood) | 422 UNKNOWN / TOO_MANY_PLACEHOLDERS | 21–44 ms | 40 ms |
| delimiter change `{=<< >>=}` / `{=[[ ]]=}` (passport / flood) | 422 UNKNOWN_PLACEHOLDER | 34–110 ms | 39 ms |
| huge `[Content_Types].xml` (25 MB comment / 990 overrides) | 422 / 201 | 19 ms / 1.8 s | 743 ms |
| N-1: 2 M `<a/>` in CT / rels | 422 TOO_COMPLEX | ≤12 ms | 15 ms |
| the six round-3 ways | 422 PARTS_NOT_ALLOWED | 11–16 ms | 17 ms |
| memory-exhaust `runs` file, single | 422 TOO_COMPLEX | 2–4.5 s | 335 ms |
| **6× `runs` concurrent (firm A), firm B legit upload** | B: **201 after 27.3 s** | — | 2429 ms |
| 24× `runs` concurrent | all 422 | 86 s total | 3575 ms |
