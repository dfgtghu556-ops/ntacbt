import { readFileSync } from "node:fs";
import { JSDOM, ResourceLoader } from "jsdom";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "fake-indexeddb/auto";
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
class L extends ResourceLoader {
  fetch(url) { const p = url.replace(/^https?:\/\/ntacbt\.test\//, "");
    if (p.startsWith("js/") || p.startsWith("css/")) { try { return Promise.resolve(readFileSync(join(PUBLIC, p))); } catch { return Promise.reject(new Error("404")); } }
    return Promise.resolve(Buffer.from("")); } }
const dom = new JSDOM(readFileSync(join(PUBLIC, "jee-cbt.html"), "utf8"), { url: "https://ntacbt.test/jee-cbt.html", runScripts: "dangerously", pretendToBeVisual: true, resources: new L(),
  beforeParse(w) { w.fetch = async () => ({ ok:false, status:404, json: async () => ({}), text: async () => "" });
    w.indexedDB = globalThis.indexedDB; w.matchMedia = () => ({ matches:false, addListener(){}, removeListener(){} });
    w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {}; } });
const w = dom.window;
w.caches = undefined;
Object.defineProperty(w.HTMLElement.prototype, "scrollIntoView", { value: () => {}, configurable: true });
await new Promise((r) => setTimeout(r, 350));
// simulate the native bridge: listApps() costs N ms like a real phone
const COST = Number(process.argv[2] || 0);
w.eval(`window.AndroidFocus = { isApp: () => true, isLauncherMode: () => true, isGuardEnabled: () => false,
  listApps: () => { const t = Date.now(); while (Date.now() - t < ${COST}) {} return JSON.stringify(Array.from({length: 180}, (_, i) => ({ label: "App " + i, pkg: "com.demo.app" + i }))); },
  openApp: () => true };`);
const hasNative = w.eval(`typeof nativeLauncher === "function" ? !!nativeLauncher() : "no-fn"`);
for (let i = 0; i < 3; i++) {
  const t0 = Date.now();
  w.eval(`appDrawerOpen(false)`);
  const t1 = Date.now();
  const immediate = w.document.querySelectorAll(".launch-app").length;
  await new Promise((r) => setTimeout(r, 900));
  const settled = w.document.querySelectorAll(".launch-app").length;
  console.log(`open #${i + 1}: visible after ${t1 - t0} ms | tiles immediately=${immediate} | tiles settled=${settled} | bridgeCost=${COST}ms`);
  [...w.document.querySelectorAll(".modal")].forEach((m) => m.remove());
  await new Promise((r) => setTimeout(r, 50));
}
process.exit(0);
