// Ad-hoc visual QA (not committed). Connects to the Docker Playwright relay; never launches a local browser.
//   node scripts/_qa-shot.tmp.mjs <path> <out.png> [width] [height] [eval-js]
import { chromium } from "@playwright/test";

const [, , path, out, w = "1440", h = "900", evalJs] = process.argv;
const base = process.env.E2E_BASE_URL ?? "http://localhost:18080";
const browser = await chromium.connect("ws://127.0.0.1:45999/", { exposeNetwork: "<loopback>" });
const context = await browser.newContext({ storageState: "storage/student-a.json", viewport: { width: Number(w), height: Number(h) } });
const page = await context.newPage();
await page.goto(base + path, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
for (const sel of (process.env.QA_CLICK ?? "").split("||").filter(Boolean)) {
  await page.locator(sel).first().click();
  await page.waitForTimeout(1200);
}
if (process.env.QA_SCROLL) await page.locator(process.env.QA_SCROLL).first().scrollIntoViewIfNeeded();
if (evalJs) {
  const result = await page.evaluate(evalJs);
  console.log(JSON.stringify(result, null, 1));
}
await page.screenshot({ path: out, fullPage: process.env.QA_FULL !== "0" });
console.log("shot", out, await page.evaluate(() => [window.innerWidth, document.documentElement.scrollWidth, document.body.scrollHeight]));
await browser.close();
