// qa QA-476 (UX · Minor, R1.5; seen through R1.12's walk of FO-4): the local staff sign-in asks for "Firm key" and
// "Work email", but a refusal reads "No staff member of that firm signs in with that name." (api/src/platform/identity/
// service.ts, UNKNOWN_STAFF): the person typed no name, and for a wrong firm key "that firm" does not exist. Expected:
// one combined refusal (it must not tell which half was wrong) in the form's words, naming the firm key and work email.
// Fails today; passes when the words match the fields. Each refusal is still 401 with the same code for both halves.
// Run from prototype/: zsh studio/tools/isolated.sh qa476 4473 start --ttl 15 PLATFORM_IDENTITY=local \
//   && trap 'zsh studio/tools/isolated.sh qa476 4473 stop' EXIT \
//   && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_qa476_signin_words.ts 4473 xr_studio_qa476
// US$0, no model call.
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";
const PORT = Number(process.argv[2] ?? 4473), DBNAME = process.argv[3] ?? "xr_studio_qa476", BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const email = rawSql(`select email from platform_staff where actor_id = 'user-T'`).split("\n")[0].trim();
const signIn = async (firmKey: string, mail: string) => {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email: mail, secondStep: true }) });
  const b = await r.json().catch(() => ({}));
  return { status: r.status, detail: String(b.detail ?? ""), code: String(b.code ?? b.errorCode ?? "") };
};
const good = await signIn("sample-firm", email);
ok("QA-476 control: the right firm key and work email sign in (200)", good.status === 200 || good.status === 201, good.status);
const wrongFirm = await signIn("no-such-firm", email), wrongMail = await signIn("sample-firm", "nobody@example.org");
ok("QA-476: both refusals are 401 with the same words (which half was wrong is not told)", wrongFirm.status === 401 && wrongMail.status === 401 && wrongFirm.detail === wrongMail.detail, { wrongFirm, wrongMail });
const words = wrongFirm.detail;
ok("QA-476: the refusal names what the person typed (firm key and work email), not a name", /firm key/i.test(words) && /(work )?email/i.test(words) && !/\bname\b/i.test(words), words);
await db.$disconnect();
process.exitCode = summary() ? 1 : 0;
