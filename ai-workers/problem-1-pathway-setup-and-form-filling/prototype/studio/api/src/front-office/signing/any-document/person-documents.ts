// FO-6d part 2 (BACKLOG row FO-6d; AG-5-61 r4 "the signed copy … filed in Documents"): the signed copies on a person's
// record, any kind (retainers and consultation agreements too), each only when its own prospect is visible to the viewer
// (the leads' own-versus-all rule; review M2 on #3207). The case side's Documents is not built: this list is the filing
// until it is. Route GET /api/front-office/people/:personId/documents, key agent/prospect:show. Every value is Sample.
import { Controller, Get, Inject, Param, Req } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { idParam } from "../../../platform/http/input.ts";
import { OwnOrAll, PermissionKeys, staffOf, type StaffContext } from "../../../platform/identity/keys.ts";
import { sees, visibilityOf } from "../../sales/common.ts";
import { notFound } from "./service.ts";

export class PersonDocuments {
  constructor(private readonly db: PrismaClient) {}

  /** The signed copies on a person's record (any kind: retainers too), when the person is on a prospect the viewer sees;
   *  each item only when its own prospect is visible too. */
  async list(ctx: StaffContext, personId: string) {
    const firmId = ctx.firmId, vis = await visibilityOf(this.db, ctx);
    const person = await this.db.foPerson.findFirst({ where: { firmId, id: personId }, select: { id: true } });
    if (!person) return notFound("person");
    const companies = (await this.db.foCompanyContact.findMany({ where: { firmId, personId }, select: { companyId: true } })).map((c) => c.companyId);
    const on = await this.db.foProspect.findMany({ where: { firmId, OR: [{ subjectPersonId: personId }, { primaryContactPersonId: personId }, ...(companies.length ? [{ subjectCompanyId: { in: companies } }] : [])] }, select: { ownerStaffId: true } });
    if (!vis.seesAll && !on.some((p) => sees(vis, ctx, p.ownerStaffId))) return notFound("person");
    const mine = await this.db.foSigner.findMany({ where: { firmId, personId, signedAt: { not: null } }, select: { requestId: true } });
    const qs = await this.db.foSignatureRequest.findMany({ where: { firmId, id: { in: mine.map((m) => m.requestId) }, status: "SIGNED" }, include: { evidence: true }, orderBy: { endedAt: "desc" } });
    const titles = await this.db.foSigningDocument.findMany({ where: { firmId, id: { in: qs.map((q) => q.documentId) } }, select: { id: true, title: true, prospectId: true } });
    // Review M2 on #3207: each item follows its own prospect's read (a company contact sits on prospects of other owners).
    const rets = await this.db.foRetainer.findMany({ where: { firmId, id: { in: qs.filter((q) => q.documentKind !== "OTHER").map((q) => q.documentId) } }, select: { id: true, prospectId: true } });
    const prospectOf = (q: { documentKind: string; documentId: string }) => (q.documentKind === "OTHER" ? titles.find((t) => t.id === q.documentId)?.prospectId : rets.find((r) => r.id === q.documentId)?.prospectId) ?? null;
    const owners = new Map((await this.db.foProspect.findMany({ where: { firmId, id: { in: qs.map(prospectOf).filter((x): x is string => !!x) } }, select: { id: true, ownerStaffId: true } })).map((p) => [p.id, p.ownerStaffId]));
    const visible = (q: { documentKind: string; documentId: string }) => { const id = prospectOf(q); return vis.seesAll || (!!id && owners.has(id) && sees(vis, ctx, owners.get(id)!)); };
    return { documents: qs.filter((q) => q.evidence && visible(q)).map((q) => ({ kind: "SIGNED_COPY", documentKind: q.documentKind, requestId: q.id, title: titles.find((t) => t.id === q.documentId)?.title ?? (q.documentKind === "RETAINER" ? `Retainer agreement (version ${q.documentVersion})` : "Consultation agreement"),
      signedAt: q.endedAt, sealedSha256: q.evidence!.sealedSha256, auditSha256: q.evidence!.auditSha256 })) };
  }

}

@Controller("api/front-office")
export class PersonDocumentsController {
  constructor(@Inject(PersonDocuments) private readonly svc: PersonDocuments) {}

  @Get("people/:personId/documents") @PermissionKeys("agent/prospect:show") @OwnOrAll("agent/prospect")
  list(@Req() r: { platform?: StaffContext }, @Param("personId") personId: string) { return this.svc.list(staffOf(r), idParam(personId, "person")); }
}
