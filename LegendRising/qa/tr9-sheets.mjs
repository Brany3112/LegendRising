// qa/tr9-sheets.mjs: P9-A's root-cause record (BUILD-PLAN P9-A: "for each item, record the root cause found: asset,
// playback speed, controller conflict, priority, transition, root motion, scaling, contact point, physics, an AI
// interrupt or a stuck state"). plan/notes/p9a-rootcause.md has a section for every item; each names one cause from that
// list, what was done about it (Fix), and the test line that holds it (Check), and every check it names is one of
// qa/tr9-anim.mjs's or qa/tr9-gkanim.mjs's own lines (or a suite the regression list names).
// Owner: P9-A (Training Mode Phase 9).
//
//   node qa/tr9-sheets.mjs          exits 1 on any failed check
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {checker} from "./wpF-lib.mjs";

const {check, done} = checker("tr9-sheets");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(ROOT, "..", "plan", "notes", "p9a-rootcause.md");
const CAUSES = ["asset", "playback speed", "controller conflict", "priority", "transition", "root motion", "scaling", "contact point", "physics", "an AI interrupt", "a stuck state"];
const ITEMS = ["MV-9 jockey", "MV-9 dribble touches", "MV-14 strike root", "MV-15 the first-person body", "MV-15 camAction", "MV-15 tired",
  "GK-3 keeper hands", "GK-3 keeper distribution", "Transitions", "Contact point"];
const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
check(text.length > 0, "the root-cause record is there (plan/notes/p9a-rootcause.md)", path.relative(process.cwd(), file));
const sections = text.split(/\n## /).slice(1).map(s => { const [head, ...rest] = s.split("\n"); return {head:head.trim(), body:rest.join("\n")}; });
const tests = ["tr9-anim", "tr9-gkanim", "tr2-startstop"].map(n => { const f = path.join(ROOT, "qa", n + ".mjs"); return {n, src:fs.existsSync(f) ? fs.readFileSync(f, "utf8") : ""}; });
const missing = [], noCause = [], noFix = [], badCheck = [];
for (const it of ITEMS){
  const s = sections.find(x => x.head.startsWith(it));
  if (!s){ missing.push(it); continue; }
  const cause = (s.body.match(/\*\*Cause:\*\*\s*([^.]+)\./) || [])[1];
  if (!cause || !CAUSES.includes(cause.trim())) noCause.push({it, cause});
  if (!/\*\*Fix:\*\*/.test(s.body)) noFix.push(it);
  const chk = (s.body.match(/\*\*Check:\*\*([\s\S]*?)(\n- \*\*|\n## |$)/) || [])[1] || "";
  // every quoted check line names a line its test really has
  const quoted = [...chk.matchAll(/`(tr9-anim|tr9-gkanim|tr2-startstop)`\s*"([^"]+)"/g)];
  if (!quoted.length && !/`tr2-startstop`/.test(chk)) badCheck.push({it, why:"no test line named"});
  for (const [, n, line] of quoted){ const T = tests.find(x => x.n === n); if (!T || !T.src.includes(line)) badCheck.push({it, n, line}); }
}
check(!missing.length, `a section for every P9-A item (${ITEMS.length})`, missing);
check(!noCause.length, "each names its root cause, one of the plan's list", noCause);
check(!noFix.length, "each says what was done about it (Fix)", noFix);
check(!badCheck.length, "each names the test line that holds it, and that line is in the test", badCheck);
process.exit(done() ? 0 : 1);
