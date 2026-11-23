// FO-9b part 2: the duplicate review list, the guided merge and its Undo (api/src/front-office/duplicates/merge/routes.ts).
import { Db } from "../core.ts";
import type { Feature } from "../features.ts";
import { DuplicateReviewController } from "../front-office/duplicates/merge/routes.ts";
import { DuplicateReview } from "../front-office/duplicates/merge/review.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { ConsentStore } from "../platform/messages/consent/consent-store.ts";

export default {
  controllers: [DuplicateReviewController],
  providers: [{ provide: DuplicateReview, useFactory: (db: Db) => new DuplicateReview(db, { audit: auditEvent, consent: new ConsentStore(auditEvent) }), inject: [Db] }],
} satisfies Feature;
