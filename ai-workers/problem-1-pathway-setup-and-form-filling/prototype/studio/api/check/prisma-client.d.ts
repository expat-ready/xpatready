// Read by the type check only (tsconfig.check.json, product/tools/typecheck.mjs); nothing imports it at run time.
// `new PrismaClient({ adapter })` infers a client type of its own in every file that writes it, and tsc then expands all
// models again for each (24 Nov 2026: 213 models in about 178 test files, 9.6 GB, out of memory at 8 GB). Here the
// constructor gives the one client type the app itself names, `PrismaClient`: 3.0 GB, the same 15 known errors.
export * from "../../node_modules/.prisma/client/index.js";
import type { Prisma, PrismaClient as Client } from "../../node_modules/.prisma/client/index.js";
export type PrismaClient = Client;
export declare const PrismaClient: new (options: Prisma.PrismaClientOptions) => Client;
