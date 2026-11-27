// LR-058 (bundle A8, the dependency bumps): the seed command names a failed firm's reason in the database's own words.
// Prisma 7.10 puts a code frame of about 800 characters before them in the error's message, so the old cut of the
// message (its first 300 characters) lost the reason (check_fo1a_sales_schema.ts "a firm whose seed fails", full run
// 45965150083). The error below is the shape Prisma 7.10.1 + adapter-pg gave for a trigger's raise on
// tx.foStage.createMany(), read locally on 28 Nov. Pure: no server, no database; US$0.
//   tsx studio/tests/check_fo1a_seed_error_pure.ts
import { seedError } from "../api/src/front-office/firm-seed.ts";
import { recorder } from "./runtime/api.ts";

const { ok, summary } = recorder();
const frame = "\nInvalid `tx.foStage.createMany()` invocation in\n/home/runner/work/studio/api/src/front-office/firm-seed.ts:108:35\n\n"
  + Array.from({ length: 8 }, (_, i) => `  ${100 + i} const line${i} = await tx.$queryRaw<{ seeded_at: Date | null }[]>\`select ...\`;`).join("\n")
  + "\n→ 108 await tx.foStage.createMany(\nDatabase error. Code: `P0001`. Message: `test: this firm's seed fails`";
const v710Error = Object.assign(new Error(frame), { name: "PrismaClientKnownRequestError", code: "P2039",
  meta: { modelName: "FoStage", driverAdapterError: { name: "DriverAdapterError", cause: { originalCode: "P0001", originalMessage: "test: this firm's seed fails", kind: "postgres", code: "P0001", message: "test: this firm's seed fails" } } } });

ok("LR-058 fail (the regression): the old cut of the message loses the reason under Prisma 7.10", !/this firm's seed fails/.test(String(v710Error).slice(0, 300)), { len: String(v710Error).length });
ok("LR-058 pass: a Prisma 7.10 error is named by the database's own words", seedError(v710Error) === "test: this firm's seed fails", { got: seedError(v710Error) });
const noMeta = Object.assign(new Error(frame), { name: "PrismaClientKnownRequestError" });
ok("LR-058 pass: with no adapter cause, the message's last line (which holds the reason) is kept", /this firm's seed fails/.test(seedError(noMeta)), { got: seedError(noMeta) });
ok("LR-058 pass: a one-line error is kept as it is, with its name", seedError(new TypeError("boom")) === "TypeError: boom", { got: seedError(new TypeError("boom")) });
ok("LR-058 pass: a thrown string or null never throws", seedError("plain") === "plain" && seedError(null) === "null");
const long = Object.assign(new Error("x"), { meta: { driverAdapterError: { cause: { message: "y".repeat(2000) } } } });
ok("LR-058 pass: the reason is cut to the limit asked (300 by default; the command's own error 1000)", seedError(long).length === 300 && seedError(long, 1000).length === 1000);

process.exitCode = summary() ? 1 : 0;
