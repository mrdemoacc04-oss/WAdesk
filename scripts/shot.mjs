// Dev helper: screenshot a page of the running dev server (http://localhost:4600) with headless Chrome.
//   node scripts/shot.mjs <path> <out.png> [width=1440] [height=900] [theme=light|dark] [fullPage=0|1] [waitMs=1800] ['[{"click":"sel"},{"wait":500}]']
// Actions: {"click":sel} {"type":[sel,text]} {"key":"Escape"} {"scroll":y} {"eval":"js"} {"wait":ms} {"hover":sel} {"scrollTo":sel}
// Prints console errors / failed requests so you can spot runtime problems, not just visual ones.
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import path from "node:path";
const [, , p = "/", out = ".data/shots/shot.png", w = "1440", h = "900", theme = "light", full = "0", wait = "1800", actions = "[]"] = process.argv;
const chrome = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"].find((x) => fs.existsSync(x));
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: +w < 600 ? 2 : 1.5 });
await page.evaluateOnNewDocument((t) => { try { localStorage.setItem("wadesk-theme", t); } catch {} }, theme);
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text().slice(0, 300)); });
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 400)));
page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("favicon")) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`); });
await page.goto("http://localhost:4600" + p, { waitUntil: "networkidle2", timeout: 90000 }).catch((e) => errors.push("goto: " + e.message));
await new Promise((r) => setTimeout(r, +wait));
for (const a of JSON.parse(actions)) {
  try {
    if (a.click) await page.click(a.click);
    if (a.hover) await page.hover(a.hover);
    if (a.type) await page.type(a.type[0], a.type[1]);
    if (a.key) await page.keyboard.press(a.key);
    if (a.scroll !== undefined) await page.evaluate((y) => window.scrollTo(0, y), a.scroll);
    if (a.scrollTo) await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "center" }), a.scrollTo);
    if (a.eval) await page.evaluate(a.eval);
    if (a.wait) await new Promise((r) => setTimeout(r, a.wait));
  } catch (e) { errors.push("action failed: " + e.message.slice(0, 160)); }
}
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out, fullPage: full === "1" });
console.log(errors.length ? "PAGE PROBLEMS:\n" + [...new Set(errors)].join("\n") : "clean: no console errors, no failed requests");
console.log("saved " + out);
await browser.close();
