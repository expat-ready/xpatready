// PF-19b part 1 (row 48's `local` adapter; stand-in SI-20 for real delivery): GET /api/demo/platform-inbox?address= lists
// the messages the local adapter marked SENT to one address, newest first, with subject and body from the stored rendered
// file and its attachments (a text file, such as a booking's invite.ics, with its text: qa #1855). Demo workspace only (404 elsewhere); a client's persona, by id or persona name, never opens a mailbox (403; break m1).
import { Controller, Get, Headers, HttpStatus, Inject, Query } from "@nestjs/common";
import { LINK_WORDS } from "../../../../contracts/person-link.ts";
import { normaliseAddress } from "../../../../ports/consent.ts";
import type { FilesPort } from "../../../../ports/files.ts";
import type { Rendered } from "../../../../ports/messages.ts";
import { Db, fail, isDemoWorkspace, OpenRead, RUNTIME_ACTORS } from "../../core.ts";
import { LOCAL_PROVIDER } from "./channels/email/local.ts";
import { fileKeyOf } from "./send/messages.ts";

type H = string | undefined;

/** Made by the feature's factory (api/src/features/platform-messages.ts) with the messages' own FilesPort. */
export class PlatformInbox {
  constructor(private readonly db: Db, private readonly files: FilesPort, private readonly demo: () => boolean = isDemoWorkspace) {}

  async list(address: H, xActor: H) {
    if (!this.demo()) fail("Not found.", HttpStatus.NOT_FOUND);
    if (RUNTIME_ACTORS.some((a) => (a.id === xActor || a.persona === xActor) && (a.duties as readonly string[]).includes("answer"))) fail(LINK_WORDS.inboxClient, HttpStatus.FORBIDDEN);
    let a = "";
    try { a = normaliseAddress("EMAIL", address ?? ""); } catch { fail("Enter an email address like name@example.com.", HttpStatus.BAD_REQUEST); }
    const rows = await this.db.msgOutbox.findMany({
      where: { channel: "EMAIL", address: a, state: "SENT", providerId: { startsWith: `${LOCAL_PROVIDER}:` } },
      orderBy: [{ sentAt: "desc" }, { id: "desc" }], take: 50, select: { id: true, firmId: true, class: true, sentAt: true },
    });
    const messages = [];
    for (const r of rows) {
      const f = await this.files.get(r.firmId, fileKeyOf(r.firmId, r.id));
      if (!f) continue;
      const m = JSON.parse(new TextDecoder().decode(f.bytes)) as Rendered;
      const attachments = [];
      for (const k of m.attachments) {
        const a = await this.files.get(r.firmId, k);
        if (a) attachments.push({ filename: k.split("/").at(-1)!, content_type: a.contentType, size: a.bytes.byteLength, text: /^text\//.test(a.contentType) ? new TextDecoder().decode(a.bytes) : null });
      }
      messages.push({ id: r.id, class: r.class, from: `${m.from.name} <${m.from.address}>`, reply_to: m.replyTo, subject: m.subject, body: m.text, html: m.html, attachments, sent_at: r.sentAt?.toISOString() ?? null });
    }
    return { address: a, stand_in: "SI-20", provider: LOCAL_PROVIDER, messages };
  }
}

@OpenRead("the platform's demo inbox by address (local email adapter, stand-in SI-20): demo workspace only, 404 elsewhere")
@Controller("api/demo")
export class PlatformInboxController {
  constructor(@Inject(PlatformInbox) private readonly x: PlatformInbox) {}
  @Get("platform-inbox") list(@Query("address") address: H, @Headers("x-actor") a: H) { return this.x.list(address, a); }
}
