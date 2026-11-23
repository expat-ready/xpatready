// QA-601 (R1.48 "Each message shows Sent, Delivered, Bounced or Failed from the provider's test events"): a firm message
// whose provider refuses the send must end FAILED with a reason (and an event), not wait QUEUED for ever. Today
// `Messages.deliver()` lets the adapter's throw roll its transaction back, the row stays QUEUED and the hourly sweep
// re-queues it with no try count; only platform rows (PF-19p) count tries and end FAILED. This check sends one firm email
// through a channel adapter that always refuses, lets the fake job runner and the sweep try it for 8 hours of fake
// clock, and expects FAILED. It fails today and passes once firm rows end FAILED. Sample rows only; US$0. Run from
// prototype/ against an isolated copy's database (the copy's own worker is not used):
//   zsh studio/tools/isolated.sh qa601 4475 start --ttl 20 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh qa601 4475 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_qa601_provider_failed.ts 4475 xr_studio_qa601
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { LocalFiles } from "../../api/src/front-office/files.ts";
import { auditEvent } from "../../api/src/platform/audit/audit-event.ts";
import { ConsentStore } from "../../api/src/platform/messages/consent/consent-store.ts";
import { channelsOf } from "../../api/src/platform/messages/send/channels.ts";
import { Messages, type ChannelAdapter } from "../../api/src/platform/messages/send/messages.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { fakeAlerts } from "../../ports/alert.ts";
import { FakeClock } from "../../ports/clock.ts";
import { fakeJobs } from "../../ports/jobs.ts";
import { client, recorder } from "../runtime/api.ts";
const PORT = Number(process.argv[2] ?? 4475), DBNAME = process.argv[3] ?? "xr_studio_qa601";
const STUDIO = join(import.meta.dirname, "..", "..");
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
try {
  await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`);
  const person = sql(`insert into fo_person (firm_id, given_names, family_name, email, created_by, updated_at) values ('${A}', 'Refused${run}', 'Sample', 'refused.${run}@example.com', 'seed:qa601', now()) returning id`);
  let tries = 0;
  const refusing: ChannelAdapter = { provider: "sample-refusing", async deliver() { tries++; throw new Error("MessageRejected (Sample): the provider refused this send"); } };
  const files = new LocalFiles(join(STUDIO, "var", `isolated-${DBNAME.replace(/^xr_studio_/, "")}`, "front-office-files"));
  const clock = new FakeClock(new Date()), jobs = fakeJobs(clock);
  const here = new Messages({ db, consent: new ConsentStore(auditEvent), files, jobs, alerts: () => fakeAlerts(), channels: channelsOf([["EMAIL", refusing]]), clock });
  await here.register();
  const sent = await db.$transaction((t) => here.send(t, { firmId: A, person: { kind: "FO_PERSON", id: person }, channel: "EMAIL", class: "TRANSACTIONAL", address: `refused.${run}@example.com`, content: { subject: "Refused (Sample)", text: "x" }, idempotencyKey: randomUUID() }));
  await here.dispatch(A, [sent.outboxId]); await jobs.runDue();
  // The outbox row's created_at is the database's now(): age it as the hours pass, so the sweep sees it as the clock moves.
  for (let h = 1; h <= 8; h++) { sql(`update msg_outbox set created_at = created_at - interval '1 hour' where id = '${sent.outboxId}'`); await clock.advance({ hours: 1 }); await here.sweep(); await jobs.runDue(); }
  const state = sql(`select state from msg_outbox where id = '${sent.outboxId}'`), reason = sql(`select coalesce(state_reason, '') from msg_outbox where id = '${sent.outboxId}'`);
  const events = sql(`select count(*) from msg_event where outbox_id = '${sent.outboxId}' and kind = 'FAILED'`);
  ok("QA-601 setup: the refusing provider was tried more than once", tries > 1, { tries });
  ok("QA-601: a firm email the provider keeps refusing ends FAILED with a reason and one FAILED event (not QUEUED for ever)", state === "FAILED" && reason.length > 0 && events === "1", { state, reason, events, tries });
} finally { await db.$disconnect(); }
process.exit(summary() ? 1 : 0);
