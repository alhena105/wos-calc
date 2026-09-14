// data.xlsx 의 시트 행 ↔ src/data.js SHEET_COMPS · test/fixtures.mjs SHEET_ROWS/SHEET_JOINERS 대조
import {writeFileSync} from "node:fs";
import {api, parseSheet, SCRATCH, ROOT, key3, same} from "./lib.mjs";
const E = api();
const {HEROES, SHEET_COMPS} = E;
const fx = await import("file:///" + ROOT + "/test/fixtures.mjs");

const rows = [...parseSheet(SCRATCH + "/out/xlsx/EN_Rallies_Ratios_Joiners.tsv", HEROES),
              ...parseSheet(SCRATCH + "/out/xlsx/Sheet4.tsv", HEROES)];
const out = {xlsxRows: rows.length, unknownNames: [], compDiff: [], missingInComps: [], extraInComps: [],
  joinerSet: {}, stackSet: {}, sheetRowsDiff: [], altFreeRows: [], generations: {}};

// 이름 매핑 실패
for (const r of rows) for (const cell of [...r.l, ...r.j, ...r.alt]) for (const id of cell) if (id.startsWith("?")) out.unknownNames.push({g: r.g, label: r.label, name: id});

// ① 행 단위 대조 — (g, 리더 대안, 병비) 로 짝을 찾는다
const kComp = c => c.g + "|" + c.l.map(x => x.join("/")).join("&") + "|" + c.rs.map(key3).join(",");
const compMap = new Map(); SHEET_COMPS.forEach((c, i) => compMap.set(kComp(c), {c, i}));
const used = new Set();
for (const r of rows) {
  const k = kComp(r); const hit = compMap.get(k);
  out.generations[r.g] = (out.generations[r.g] || 0) + 1;
  if (r.altFree.length) out.altFreeRows.push({g: r.g, label: r.label, altFree: r.altFree, altKept: r.alt});
  if (!hit) { out.missingInComps.push({g: r.g, label: r.label, l: r.l, rs: r.rs, j: r.j, alt: r.alt}); continue; }
  used.add(hit.i);
  const c = hit.c;
  const d = {};
  if (!same(c.j, r.j)) d.j = {comps: c.j, xlsx: r.j};
  if (!same(c.alt || [], r.alt)) d.alt = {comps: c.alt || [], xlsx: r.alt};
  if ((c.meta ? 1 : 0) !== r.meta) d.meta = {comps: c.meta ? 1 : 0, xlsx: r.meta};
  if (Object.keys(d).length) out.compDiff.push({g: r.g, label: r.label, idx: hit.i, diff: d});
}
SHEET_COMPS.forEach((c, i) => { if (!used.has(i)) out.extraInComps.push({i, c}); });

// ② 조이너 명단 (s:1) — 시트 조이너 칸 + Alternative 칸에 오르는 영웅 집합
const jset = new Set(); rows.forEach(r => [...r.j, ...r.alt].forEach(cell => cell.forEach(id => jset.add(id))));
const s1 = new Set(HEROES.filter(h => h.s).map(h => h.id));
out.joinerSet = {xlsx: [...jset].sort(), dataS1: [...s1].sort(), onlyXlsx: [...jset].filter(x => !s1.has(x)), onlyData: [...s1].filter(x => !jset.has(x)),
  fixtures: fx.SHEET_JOINERS.slice().sort()};
// ③ stack 집합 — 한 행의 j 칸에 같은 id 가 둘 이상 (단일 후보 칸 기준)
const stk = new Set();
rows.forEach(r => { const cnt = {}; r.j.forEach(cell => { if (cell.length === 1) cnt[cell[0]] = (cnt[cell[0]] || 0) + 1; }); Object.entries(cnt).forEach(([id, n]) => { if (n >= 2) stk.add(id); }); });
out.stackSet = {xlsx: [...stk].sort(), data: HEROES.filter(h => h.stack).map(h => h.id).sort()};
// ④ SHEET_ROWS (52) 대조 — lead 첫 후보 · r 첫 병비
const rowsKey = r => r.g + "|" + r.l.map(x => x[0]).join(",") + "|" + key3(r.rs[0]);
const seenK = new Set();
for (const fr of fx.SHEET_ROWS) {
  const k = fr.gen + "|" + fr.lead.join(",") + "|" + key3(fr.r);
  const m = rows.filter(r => rowsKey(r) === k);
  if (!m.length) { out.sheetRowsDiff.push({k, issue: "xlsx 에 없음"}); continue; }
  const r = m[0];
  const pri = [...new Set(r.j.flat())], all = [...new Set([...r.j.flat(), ...r.alt.flat()])];
  const top = r.j[0] || [];
  const dd = {};
  if (!same(fr.top, top)) dd.top = {fx: fr.top, xlsx: top};
  if (!same([...fr.pri].sort(), [...pri].sort())) dd.pri = {fx: fr.pri, xlsx: pri};
  if (!same([...fr.all].sort(), [...all].sort())) dd.all = {fx: fr.all, xlsx: all};
  if (Object.keys(dd).length) out.sheetRowsDiff.push({k, diff: dd});
}
writeFileSync(SCRATCH + "/out/out-01.json", JSON.stringify(out, null, 1));
console.log("xlsx 행", rows.length, "· SHEET_COMPS", SHEET_COMPS.length, "· 세대별", JSON.stringify(out.generations));
console.log("이름 매핑 실패", out.unknownNames.length, JSON.stringify(out.unknownNames));
console.log("xlsx 에 있는데 SHEET_COMPS 에 없음", out.missingInComps.length); out.missingInComps.forEach(x => console.log("  ", JSON.stringify(x)));
console.log("SHEET_COMPS 에 있는데 xlsx 에 없음", out.extraInComps.length); out.extraInComps.forEach(x => console.log("  ", JSON.stringify(x)));
console.log("같은 행인데 칸이 다름", out.compDiff.length); out.compDiff.forEach(x => console.log("  ", JSON.stringify(x)));
console.log("조이너 집합", JSON.stringify({onlyXlsx: out.joinerSet.onlyXlsx, onlyData: out.joinerSet.onlyData}));
console.log("stack 집합", JSON.stringify(out.stackSet));
console.log("SHEET_ROWS 차이", out.sheetRowsDiff.length); out.sheetRowsDiff.forEach(x => console.log("  ", JSON.stringify(x)));
console.log("자유문구 alt 행", out.altFreeRows.length);
