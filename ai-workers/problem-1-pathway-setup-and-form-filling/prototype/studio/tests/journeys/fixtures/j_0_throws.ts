// P-700 (#224) fixture, review of #2133 M1: a journey that crashes (a Playwright timeout, uncaught) with its browser
// open. The walk must exit non-zero and still keep its trace, video and the step screenshot. No app, no copy.
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.setContent(`<h1>Fixture walk that crashes</h1>`);
console.log("PASS  J-0T W1: the fixture page shows its heading");
await page.getByRole("button", { name: "Not on this page" }).click({ timeout: 1_000 });   // throws: the crash under test
console.log("PASS  J-0T W2: never reached");
