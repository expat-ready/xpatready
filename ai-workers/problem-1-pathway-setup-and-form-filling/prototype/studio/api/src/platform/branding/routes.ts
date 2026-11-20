// PF-13 routes (AG-16-2: Owner and Admin edit, `agent/settings:edit`; reading with `agent/settings:list`). PF-4's guard
// does the rest; the firm is the session's. Part 1b: the images (one multipart `file`; the upload layer stops one byte
// past the largest limit and the service names each kind's own) and the public reads under /api/public (open doors:
// the firm by its key through the named bypass use `platform.branding.public`, firm-scope.ts).
import { Body, Controller, Delete, Get, Inject, Param, Put, Query, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { Db, OpenRead } from "../../core.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../identity/keys.ts";
import { BrandingService } from "./branding.ts";
import { BrandingImages, IMAGE_UPLOAD_CAP } from "./images.ts";

type R = { platform?: StaffContext };
type F = { buffer: Buffer } | undefined;

@Controller("api/platform/branding")
export class BrandingController {
  private readonly b: BrandingService;
  constructor(@Inject(Db) db: Db, @Inject(BrandingImages) private readonly images: BrandingImages) { this.b = new BrandingService(db); }
  @Get() @PermissionKeys("agent/settings:list")
  async read(@Req() r: R) { const s = staffOf(r); return { ...(await this.b.read(s)), images: await this.images.links(s) }; }
  @Put() @PermissionKeys("agent/settings:edit")
  save(@Req() r: R, @Body() b: unknown) { return this.b.save(staffOf(r), b); }
  @Put(":kind") @PermissionKeys("agent/settings:edit") @UseInterceptors(FileInterceptor("file", { limits: { fileSize: IMAGE_UPLOAD_CAP, files: 1, fields: 2, parts: 3 } }))
  upload(@Req() r: R, @Param("kind") kind: string, @UploadedFile() f: F) { return this.images.upload(staffOf(r), kind, f ? { bytes: new Uint8Array(f.buffer) } : undefined); }
  @Delete(":kind") @PermissionKeys("agent/settings:edit")
  clear(@Req() r: R, @Param("kind") kind: string) { return this.images.clear(staffOf(r), kind); }
}

@Controller("api/public/firms/:firmKey/branding")
export class BrandingPublicController {
  constructor(@Inject(BrandingImages) private readonly images: BrandingImages) {}
  @Get() @OpenRead("a client page's header: the firm's name, colours, tagline and image links (PF-13; no id)")
  read(@Param("firmKey") firmKey: string) { return this.images.publicBranding(firmKey); }
  @Get(":kind") @OpenRead("the firm's logo, favicon or banner by its stable link (PF-13)")
  async image(@Param("firmKey") firmKey: string, @Param("kind") kind: string, @Query("v") v: unknown, @Res() res: Response) {
    const img = await this.images.publicImage(firmKey, kind, v);
    res.setHeader("Content-Type", img.mediaType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("ETag", img.etag);
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.status(200).end(Buffer.from(img.bytes));
  }
}
