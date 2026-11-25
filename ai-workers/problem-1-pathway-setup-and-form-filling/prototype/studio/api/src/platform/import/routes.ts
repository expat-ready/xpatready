// PF-10b part 1 routes. Each declares its access (keys.ts: agent/import:run for the steps, agent/import:view-report for the
// reads; Owner and Admin by default, PF-3's catalogue); PF-4's guard does the rest. The firm is the session's.
// The upload is the file itself (Content-Type text/csv), read here up to the Sample ceiling: the JSON parser of
// /api/platform never sees it (input.ts parses application/json only), so its 256 KB limit stays as it is.
import { Body, Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { PermissionKeys, problem, staffOf, type StaffContext } from "../identity/keys.ts";
import { MAX_BYTES } from "./csv.ts";
import { ImportService, RUN_KEY, VIEW_KEY } from "./engine.ts";

type R = Request & { platform?: StaffContext };

/** The request's bytes, refused past MAX_BYTES (422 TOO_LARGE: main.ts rewrites a 413's words, and the limit must be named, AG-18-58) without reading the rest; text/csv only (415). */
async function csvBody(req: R): Promise<Uint8Array> {
  const type = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "text/csv") problem(415, "Not imported", "Upload the file as CSV (Content-Type text/csv).", { code: "NOT_CSV" });
  if (Number(req.headers["content-length"] ?? 0) > MAX_BYTES) problem(422, "Not imported", `The file is too large: at most ${MAX_BYTES / 1024 / 1024} MB.`, { code: "TOO_LARGE" });
  const parts: Buffer[] = [];
  let n = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    n += chunk.length;
    if (n > MAX_BYTES) { req.unpipe?.(); req.resume(); problem(422, "Not imported", `The file is too large: at most ${MAX_BYTES / 1024 / 1024} MB.`, { code: "TOO_LARGE" }); }
    parts.push(chunk);
  }
  return new Uint8Array(Buffer.concat(parts));
}

@Controller("api/platform/imports")
export class ImportController {
  constructor(@Inject(ImportService) private readonly svc: ImportService) {}
  @Get("targets") @PermissionKeys(RUN_KEY)
  targets() { return this.svc.targets(); }
  @Get("attestation") @PermissionKeys(RUN_KEY)
  attestation(@Req() r: R) { return this.svc.attestation(staffOf(r)); }
  @Post("attestation") @PermissionKeys(RUN_KEY)
  attest(@Req() r: R, @Body() b: unknown) { return this.svc.attest(staffOf(r), b); }
  @Post() @PermissionKeys(RUN_KEY)
  async upload(@Req() r: R, @Query() q: { target?: string; source?: string; name?: string }) { const s = staffOf(r); return this.svc.upload(s, q, await csvBody(r)); }
  @Get(":id") @PermissionKeys(VIEW_KEY)
  view(@Req() r: R, @Param("id") id: string) { return this.svc.view(staffOf(r), id); }
  @Get(":id/rows") @PermissionKeys(VIEW_KEY)
  rows(@Req() r: R, @Param("id") id: string, @Query() q: { outcome?: string; page?: string }) { return this.svc.rows(staffOf(r), id, q); }
  @Post(":id/dry-run") @PermissionKeys(RUN_KEY)
  dryRun(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.svc.dryRun(staffOf(r), id, b); }
  @Post(":id/run") @PermissionKeys(RUN_KEY)
  run(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.svc.run(staffOf(r), id, b); }
}
