// PF-19b part 1 (row 48's `local` adapter; stand-in SI-20 for real delivery): GET /api/demo/platform-inbox?address= lists
// the messages the local adapter marked SENT to one address, newest first, with subject and body from the stored rendered
// file (PF-19p: platform account messages, no firm, by address as firm ones) and its attachments (a text file, such as a booking's invite.ics, with its text: qa #1855) and, part 2, the List-Unsubscribe headers an SES email would carry. Demo workspace only (404 elsewhere); a client's persona, by id or persona name, never opens a mailbox (403; break m1).
import { Controller, Get, Headers, HttpStatus, Inject, Query } from "@nestjs/common";
import { LINK_WORDS } from "../../../../contracts/person-link.ts";
import { normaliseAddress } from "../../../../ports/consent.ts";
import type { FilesPort } from "../../../../ports/files.ts";
import type { Rendered } from "../../../../ports/messages.ts";
import { Db, fail, isDemoWorkspace, OpenRead, RUNTIME_ACTORS } from "../../core.ts";
import { LOCAL_PROVIDER } from "./channels/email/local.ts";
import { unsubscribeHeaders, type UnsubscribeTokens } from "./channels/email/unsubscribe.ts";
import type { SecretBoxPort } from "../../../../ports/secret-box.ts";
import { fileKeyOf, filesSpaceOf } from "./send/messages.ts";
import { bodyBoxOf, LOCAL_BODY_CONFIG, openStored } from "./send/sealed-body.ts";
import { asBypass, touchFirms } from "../firm-scope.ts";

type H = string | undefined;
/** A text attachment longer than this is listed without its text (review m4; an invite is about 1 KB). */
export const INBOX_TEXT_MAX = 64 * 1024;

/** Made by the feature's factory (api/src/features/platform-messages.ts) with the messages' own FilesPort. */
export class PlatformInbox {
  constructor(private readonly db: Db, private readonly files: FilesPort, private readonly demo: () => boolean = isDemoWorkspace, private readonly unsub?: { tokens: UnsubscribeTokens; publicBase: string },
    /** PF-19e: the box MessagePort seals TRANSACTIONAL bodies with (default: the local copies' fixed key, as Messages'). */
    private readonly box: SecretBoxPort = bodyBoxOf(LOCAL_BODY_CONFIG)) {}

  async list(address: H, xActor: H) {
    if (!this.demo()) fail("Not found.", HttpStatus.NOT_FOUND);
    return asBypass("platform.demo.inbox", () => this.listAll(address, xActor));   // PF-12: every demo firm's mail
  }
  private async listAll(address: H, xActor: H) {
    if (RUNTIME_ACTORS.some((a) => (a.id === xActor || a.persona === xActor) && (a.duties as readonly string[]).includes("answer"))) fail(LINK_WORDS.inboxClient, HttpStatus.FORBIDDEN);
    let a = "";
    try { a = normaliseAddress("EMAIL", address ?? ""); } catch { fail("Enter an email address like name@example.com.", HttpStatus.BAD_REQUEST); }
    const rows = await this.db.msgOutbox.findMany({
      where: { channel: "EMAIL", address: a, state: { in: ["SENT", "DELIVERED"] }, providerId: { startsWith: `${LOCAL_PROVIDER}:` } },
      orderBy: [{ sentAt: "desc" }, { id: "desc" }], take: 50, select: { id: true, firmId: true, audience: true, class: true, sentAt: true },
    });
    // PF-12b: each firm whose mail is listed, before any is read; a PLATFORM_ACCOUNT row (PF-19p) has no firm and is never touched as one.
    await touchFirms(this.db, rows.flatMap((r) => (r.firmId ? [r.firmId] : [])));
    const messages = [];
    for (const r of rows) {
      const f = await this.files.get(filesSpaceOf(r.firmId), fileKeyOf(r.firmId, r.id));
      if (!f) continue;
      let m: Rendered;
      try { m = openStored(this.box, r.firmId, r.id, r.class, f.bytes); } catch { continue; }   // PF-19e: a body that no longer opens (a key not held) is left out
      const attachments = [];
      for (const k of m.attachments) {
        const a = await this.files.get(filesSpaceOf(r.firmId), k);
        if (a) attachments.push({ filename: k.split("/").at(-1)!, content_type: a.contentType, size: a.bytes.byteLength, text: /^text\//.test(a.contentType) && a.bytes.byteLength <= INBOX_TEXT_MAX ? new TextDecoder().decode(a.bytes) : null });
      }
      messages.push({ id: r.id, audience: r.audience, class: r.class, from: `${m.from.name} <${m.from.address}>`, reply_to: m.replyTo, headers: this.unsub ? unsubscribeHeaders(m, this.unsub.tokens, this.unsub.publicBase) : {}, subject: m.subject, body: m.text, html: m.html, attachments, sent_at: r.sentAt?.toISOString() ?? null });
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
