# PF-Fp part 1 — break report (Word to PDF through Gotenberg)

PR #2028 / branch `claude/runtime-pffp-topdf` / commit 42ba356. Attacked the adapter API
directly (no screen, no route) with tsx scripts against the live pinned container
(`pffp-got`, 172.18.0.2:3000, Gotenberg 8.40.0). Scope: tech gate entry 17, conditions 1–5.
The PR's own `tests/check_pffp_pdf.ts` passes 48/48 live.

## Findings

### F1 — Input size cap defeated by a Uint8Array subclass with a lying `.length` — Minor (robustness)
`refuseBeforeSending`/`looksLikeDocx` size-check uses `docx.length` (ports/render.ts:
`refuseBeforeSending`). A `class L extends Uint8Array { get length(){return 5} }` over a 20 MB
buffer reports length 5, is NOT refused, yet `new Blob([docx])` in `GotenbergPdf.toPdf`
(gotenberg.ts) sends the full 20 MB — over the 10 MB cap, "before sending".
Repro: `scratchpad/pffp/caplie.mts` → `CAP BYPASS: true`, Blob size 20971520.
Not firm-reachable: real callers pass plain Uint8Array/Buffer from `buildDocx`, whose
`.length` is honest (Buffer, SAB-view, subarray-offset all refuse/convert correctly). Use
`byteLength` for the cap to close it.

### F2 — `pdfFromEnv` treats `CI=""` as not-under-CI — Minor (informational)
`if (env.CI)` is falsy for an empty string, so `{CI:"", DOCUMENT_PDF:"gotenberg", GOTENBERG_URL:…}`
returns GotenbergPdf (gate: "never under CI"). `CI="false"` and `CI="0"` are correctly refused
(truthy). Not realistic: CI systems set `CI=true`, and the demo/CI never set
`DOCUMENT_PDF=gotenberg` (default is the fake), so this needs a deliberate three-part
misconfiguration. Repro: `scratchpad/pffp/base.ts`.

## What held (no finding)

- **Hostile .docx file leak / SSRF (GHSA-wwc9-3q69-2vrm style).** An external-image relationship
  (`TargetMode="External"` → `file:///etc/passwd`) and INCLUDETEXT fields to `/etc/passwd` both
  converted to clean PDFs with **no leaked content** (`scratchpad/pffp/leak.mts`,
  `evil/extimage.docx`, `evil/includetext.docx`). 8.40.0 + flags hold.
- **Zip bomb** (1.5 MB docx, 424 MB decompressed, under the 10 MB input cap) → `TIMEOUT` at
  30006 ms, container `running restarts=0` after. No hang, no throw (`scratchpad/pffp/bomb.mts`).
- **30 s timeout covers the body.** A server that returns headers 200 then dribbles the body
  forever → `TIMEOUT` at 805 ms (limit 800) (`scratchpad/pffp/body.mts`).
- **Output cap.** An 80 MB `%PDF-` answer → `FAILED` "over 52428800 bytes" in 134 ms, read
  stops at the cap (`readCapped`).
- **gotenbergBase bypasses.** Refused: userinfo (`user:pw@`, `token@`), path/query/fragment
  (`/forms/libreoffice`, `?route=`, `/#x`, `\@evil`, `%2f` paths), non-http(s) (`file:`, `ftp:`),
  spaces in host. Accepted-and-equivalent only: IPv6 `[::1]`, `http:host` (no `//`), empty
  userinfo `@host` — all resolve to the intended host, no secret, no other route.
  (`scratchpad/pffp/base.ts`).
- **Redirect not followed** (`redirect:"error"` → FAILED), **non-PDF 200** → FAILED,
  **non-docx zip** → FAILED, **non-bytes input** → NOT_DOCX, **unreachable / throwing adapter**
  → FAILED with the `.docx` kept (`withPdf`). None throws.
- **Only `POST /forms/libreoffice/convert`** is built; live Chromium routes + `downloadFrom`
  answer 404 (PR test, confirmed live).
- **Pinned by digest.** `isPinned` rejects `:latest`, tag-only, digest-only, short digest. (It is
  a format check, not an identity check — `evil.com/gotenberg:…@sha256:…` passes format, but the
  real `GOTENBERG_IMAGE` constant is the pinned official digest; the container runs that digest.)
- **Network isolation** (`pffp-net` internal=true) is PF-8's stack line, not this row.

No Blocker or Major. Did not commit.
