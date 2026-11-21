// Loads one module first, in a fresh process, and prints "loaded" (FO-10, merge batch #2500): an import cycle that leaves a
// decorator's token uninitialised shows only when a module is the first of its cycle to load, so a suite that imported
// it any other way would pass. Usage: tsx --tsconfig api/tsconfig.json tests/lib/load-first.ts <absolute path>
import "reflect-metadata";
await import(process.argv[2]);
console.log("loaded");
