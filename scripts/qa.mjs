// Visits every main route at desktop + mobile, light + dark; reports console errors / failed requests / horizontal overflow.
//   node scripts/qa.mjs [outDir=.data/shots/qa] [routes comma separated]
import puppeteer from "puppeteer-core";
import fs from "node:fs";
const out = process.argv[2] ?? ".data/shots/qa";
const routes = (process.argv[3] ?? "/,/inbox,/campaigns,/campaigns/new,/templates,/templates/new,/contacts,/contacts/import,/automations,/analytics,/growth,/settings").split(",");
const chrome = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"].find((x) => fs.existsSync(x));
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
const combos = [
  { name: "desktop-light", w: 1440, h: 900, theme: "light" },
  { name: "desktop-dark", w: 1440, h: 900, theme: "dark" },
  { name: "mobile-light", w: 390, h: 844, theme: "light" },
  { name: "mobile-dark", w: 390, h: 844, theme: "dark" },
];
let problems = 0;
for (const r of routes) {
  for (const c of combos) {
    const page = await browser.newPage();
    await page.setViewport({ width: c.w, height: c.h, deviceScaleFactor: 1.25 });
    await page.evaluateOnNewDocument((t) => { try { localStorage.setItem("wadesk-theme", t); } catch {} }, c.theme);
    const errs = [];
    page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 200)); });
    page.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 250)));
    page.on("response", (res) => { if (res.status() >= 400) errs.push(`HTTP ${res.status()} ${res.url().replace("http://localhost:4600", "").slice(0, 100)}`); });
    await page.goto("http://localhost:4600" + r, { waitUntil: "networkidle2", timeout: 90000 }).catch((e) => errs.push("goto: " + e.message));
    await new Promise((x) => setTimeout(x, 1400));
    const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (overflow.sw > overflow.cw + 2) errs.push(`horizontal overflow: scrollWidth ${overflow.sw} > ${overflow.cw}`);
    const file = `${out}/${r === "/" ? "home" : r.slice(1).replace(/\//g, "_")}.${c.name}.png`;
    await page.screenshot({ path: file });
    if (errs.length) { problems += errs.length; console.log(`✗ ${r} [${c.name}]\n   ${[...new Set(errs)].join("\n   ")}`); } else console.log(`✓ ${r} [${c.name}]`);
    await page.close();
  }
}
await browser.close();
console.log(problems ? `\n${problems} problem(s)` : "\nall routes clean");
process.exit(problems ? 1 : 0);
