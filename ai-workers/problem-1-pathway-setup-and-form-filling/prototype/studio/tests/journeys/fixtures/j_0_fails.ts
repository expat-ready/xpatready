// P-700 (#224) fixture: a journey that fails on purpose, with no app (no isolated.sh line, so walk.mjs starts no copy).
// It opens one page, passes one step and fails the next; check_journey_recording.ts proves the walk exits non-zero and
// the recording (video, trace, a screenshot per step) is still written. walks.yml runs it as its self-test.
import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.setContent(`<h1>Fixture walk</h1><button>Next step</button>`);
console.log("PASS  J-0 W1: the fixture page shows its heading");
await page.getByRole("button", { name: "Next step" }).click();
console.log("FAIL  J-0 W2: deliberately failing step (the walk must fail and still upload its recording)");
await browser.close();
process.exit(1);
