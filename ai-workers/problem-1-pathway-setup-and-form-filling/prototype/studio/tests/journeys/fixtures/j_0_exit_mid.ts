// P-700 (#224) fixture, review of #2133 M2: process.exit(2) while the browser is open and the journey's code runs on.
// The walk must exit 2 (the journey's code), and nothing after the exit may count as a step. No app, no copy.
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.setContent(`<h1>Fixture walk that exits mid-way</h1>`);
console.log("PASS  J-0X W1: the fixture page shows its heading");
process.exit(2);
await fetch("http://127.0.0.1:9/never");   // never settles after the exit
console.log("PASS  J-0X W2: must not be counted");
