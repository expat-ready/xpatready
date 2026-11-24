// FO-7b's C5 fix (#3305 M1): every FO-7b route on an existing invoice is C5-scoped (AG-6-1 §8), so a fixture party is
// a real client the caller can see, never a bare row: a won prospect of the firm with that party as its subject, and
// the firm's "everyone sees all" on (CS-MV1's PgMoneyVisibility: view.all + that setting → every prospect's subject;
// every seeded role holds agent/prospect:view.all). Written with the replica role, as check_csmv1_money_visibility.ts
// does (a fixture needs no lead, stage or release). Returns the party's id, so a helper can wrap its insert.
import { randomUUID } from "node:crypto";

/** Prospect numbers P-9<time><n> (fo_prospect_number_check: P- and 5+ digits): unique across runs on one copy, and far
 *  above what a firm's own counter gives. */
let n = 0;

export function moneyVisible(sql: (q: string) => string, firmId: string, kind: "person" | "company", id: string): string {
  const pid = randomUUID();
  sql(`set session_replication_role = replica;
    insert into fo_prospect (id, firm_id, number, lead_id, type, stage_id, subject_person_id, subject_company_id, primary_contact_person_id, created_by, updated_at, won_via, won_at)
    values ('${pid}', '${firmId}', 'P-9${Date.now()}${String(++n).padStart(3, "0")}', '${randomUUID()}', '${kind === "company" ? "CORPORATE" : "INDIVIDUAL"}', '${randomUUID()}', ${kind === "person" ? `'${id}'` : "null"}, ${kind === "company" ? `'${id}'` : "null"}, '${kind === "person" ? id : randomUUID()}', 'seed:money-visible', now(), 'CONVERTED', now());
    delete from platform_firm_setting where firm_id = '${firmId}' and key = 'platform.everyone_sees_all';
    insert into platform_firm_setting (firm_id, key, value, changed_by) values ('${firmId}', 'platform.everyone_sees_all', 'true'::jsonb, 'seed:money-visible')`);
  return id;
}
