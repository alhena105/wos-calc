// 공용 — 번들 부팅, 화면 파싱, xlsx 행 파싱
import {readFileSync} from "node:fs";
import {join} from "node:path";
import vm from "node:vm";

import {fileURLToPath} from "node:url";
import {dirname} from "node:path";
// 저장소 루트 · 산출물 폴더(tools/sim/out — .gitignore)
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..").split("\\").join("/");
export const SCRATCH = join(ROOT, "tools", "sim").split("\\").join("/");
const {boot} = await import("file:///" + ROOT + "/test/dom.mjs");
export {boot};

// i18n+data+engine 만 실행한 순수 API (render 없이)
export function api(lang = "ko") {
  const src = p => readFileSync(join(ROOT, "src", p), "utf8");
  const code = src("i18n.js") + src("data.js") + src("engine.js") +
    "\n;globalThis.__api={HEROES,byId,norm,eVal,eK,eAdd,nbAdd,xShare,dmgShare,tgtRatio,nCls,ORDER,SLOTS,NA_SHARE,DW,SHEET_COMPS,matchComps,matchComp,compRivals,dist,HN};\n";
  const sb = {console, URLSearchParams, location: {search: "?lang=" + lang, href: "https://x/"},
    navigator: {language: "ko"}, history: {replaceState() {}}};
  vm.createContext(sb); vm.runInContext(code, sb, {filename: "bundle.js"});
  return sb.__api;
}

// 화면에서 추천 패널(#rec / #recAll) 영웅 id 와 배율을 뽑는다
export function parseRec(html, id) {
  const at = html.indexOf('id="' + id + '"');
  if (at < 0) return null;
  const after = html.slice(at);
  const b = /<p><b>([\s\S]*?)<\/b><\/p>/.exec(after);
  const ids = b ? [...b[1].matchAll(/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]) : [];
  const m = /(?:전투 배율|Combat multiplier) ×([\d.]+)/.exec(after);
  return {ids, mul: m ? +m[1] : null};
}
// ⑤ 순위표 (14행) — [{id, mul}]
export function parseRank(html) {
  const tb = /⑤[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/.exec(html);
  if (!tb) return [];
  return tb[1].split("<tr").slice(1).map(tr => {
    const id = /heroes\/([a-z-]+)\.webp/.exec(tr), mul = /×([\d.]+)<div/.exec(tr) || /×([\d.]+)/.exec(tr);
    return id && mul ? {id: id[1], mul: +mul[1]} : null;
  }).filter(Boolean);
}
// 렌더 한 번 — {rec, recAll, rank, html}
export function renderRow(lead, r, gen, edge = 0, lang = "ko") {
  const a = boot(lang).leaders(lead[0] || "", lead[1] || "", lead[2] || "").mine(r).gcap(gen);
  a.js("SHEET_EDGE=" + edge);
  const html = a.render();
  return {rec: parseRec(html, "rec"), recAll: parseRec(html, "recAll"), rank: parseRank(html), html, a};
}

// ── xlsx TSV → 행 구조 ────────────────────────────────────────────────
const ALIAS = {
  "jessie": ["jessie", "jasser", "jeronimo"], "jessie*": ["jessie", "jasser", "jeronimo"], "jessie**": ["jessie", "jasser", "jeronimo"],
  "sergey": ["sergey", "bahiti", "lumak"], "sergey**": ["sergey", "bahiti", "lumak"],
  "seeyoon": ["seoyoon"], "seyoon": ["seoyoon"], "seo-yoon": ["seoyoon"],
  "ling xue": ["lingxue"], "bokan": ["lumak"], "lumak bokan": ["lumak"],
  "patrik": ["patrick"], "zinmang": ["zinman"], "ziman": ["zinman"],
  "wu ming": ["wuming"], "hervor": ["herbjorg"], "bradley": ["bradley"], "greg": ["greg"],
  "jeronimo": ["jeronimo"], "jasser": ["jasser"],
};
export function heroIds(txt, HEROES) {
  const byEn = Object.fromEntries(HEROES.map(h => [h.en.toLowerCase(), h.id]));
  return txt.split("/").map(s => s.trim().toLowerCase()).filter(Boolean).flatMap(s => {
    if (ALIAS[s]) return ALIAS[s];
    if (byEn[s]) return [byEn[s]];
    const k = s.replace(/[^a-z]/g, "");
    if (byEn[k]) return [byEn[k]];
    const f = HEROES.find(h => h.id === k);
    if (f) return [f.id];
    return ["?" + s];
  });
}
export function parseRatios(label) {
  // "Defense - 60/40/0 or 60/10/30 or 50/20/30", "Defense - 60/40 or 60/30/10"
  const out = [];
  for (const m of label.matchAll(/(\d+)\s*\/\s*(\d+)(?:\s*\/\s*(\d+))?/g)) {
    let a = +m[1], b = +m[2], c = m[3] === undefined ? null : +m[3];
    if (c === null) { // 2자리 약칭: 60/40 = 보60·창40 (CLAUDE.md 규칙)
      if (a === 60 && b === 40) c = 0;
      else if (a === 50 && b === 50) { b = 0; c = 50; }
      else if (a === 40 && b === 60) { b = 0; c = 60; }
      else if (a === 70 && b === 30) c = 0;
      else c = 100 - a - b;
    }
    out.push([a, b, c]);
  }
  return out;
}
export function parseSheet(tsvPath, HEROES) {
  const lines = readFileSync(tsvPath, "utf8").split("\n");
  const rows = []; let gen = 0;
  for (const ln of lines) {
    const c = ln.split("\t");
    const g = /^Generation (\d+)/.exec(c[0] || "");
    if (g) { gen = +g[1]; continue; }
    if (!gen || !c[1] || !/\d+\s*\/\s*\d+/.test(c[0])) continue;
    const label = c[0].trim();
    const leaders = c[1].replace(/&/g, ",").split(",").map(s => s.trim()).filter(Boolean).map(s => heroIds(s, HEROES));
    const j = c.slice(2, 6).map(s => s.trim()).filter(Boolean).map(s => heroIds(s, HEROES));
    const altRaw = c.slice(6, 9).map(s => s.trim()).filter(Boolean);
    const alt = altRaw.filter(s => !/^or 25%|^20% ones/i.test(s)).map(s => heroIds(s, HEROES));
    const altFree = altRaw.filter(s => /^or 25%|^20% ones/i.test(s));
    rows.push({g: gen, label, mode: /Offense/i.test(label) && !/Defense/i.test(label) ? "off" : /Defense/i.test(label) && !/Offense/i.test(label) ? "def" : "both",
      meta: /META/i.test(label) ? 1 : 0, rs: parseRatios(label), l: leaders, j, alt, altFree, comment: (c[9] || "").trim()});
  }
  return rows;
}
export const key3 = v => v.join("/");
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
