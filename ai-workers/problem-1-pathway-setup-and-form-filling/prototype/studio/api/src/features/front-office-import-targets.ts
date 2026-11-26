// PF-10t (R1.35): the front office registers its import targets with the platform's one engine (IMPORT_TARGETS,
// features/platform-import.ts): people now (api/src/front-office/import-targets/person.ts); companies and leads later.
// Audit is PF-0p's AuditPort; consent is PF-19a's ConsentPort (CONSENT_PORT), in the engine's row transaction.
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Feature } from "../features.ts";
import type { ConsentPort } from "../../../ports/consent.ts";
import type { ImportTargets } from "../../../ports/import-target.ts";
import { PersonImportTarget } from "../front-office/import-targets/person.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { CONSENT_PORT } from "../platform/messages/consent/index.ts";
import { IMPORT_TARGETS } from "./platform-import.ts";

type Tx = Prisma.TransactionClient;

@Injectable()
export class FrontOfficeImportTargets implements OnModuleInit {
  constructor(@Inject(IMPORT_TARGETS) private readonly targets: ImportTargets<Tx>, @Inject(CONSENT_PORT) private readonly consent: ConsentPort<Tx>) {}
  onModuleInit() { if (!this.targets.get("person")) this.targets.register(new PersonImportTarget(auditEvent, this.consent)); }
}

export default { providers: [FrontOfficeImportTargets] } satisfies Feature;
