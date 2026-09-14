// 시트 52행 재현율(세대별) · 가정(DW.infantry, NA_SHARE) 민감도 · 포화 곡선
import {writeFileSync} from "node:fs";
import {api, SCRATCH, ROOT} from "./lib.mjs";
import {makeSim, bruteBest} from "./formula.mjs";
const E = api(); const {HEROES, byId} = E;
const fx = await import("file:///" + ROOT + "/test/fixtures.mjs");
const stackable = new Set(HEROES.filter(h => h.stack).map(h => h.id));
const JGRP = new Set(["jessie", "jasser", "jeronimo"]);

function measure(sim, pool = "S") {
  const rows = [];
  for (const row of fx.SHEET_ROWS) {
    const lead = row.lead, ratio = row.r, g = row.gen;
    const p = HEROES.filter(h => (pool === "S" ? h.s : true) && h.gen <= g && sim.single(lead, h.id, ratio) > 1.001).map(h => h.id);
    const best = bruteBest(sim, lead, p, ratio, stackable);
    const ids = best.ids;
    const topHit = ids.some(id => row.top.includes(id)) ? 1 : 0;
    const priHit = ids.filter(id => row.pri.includes(id)).length;
    const allHit = ids.filter(id => row.all.includes(id)).length;
    rows.push({gen: g, lead, r: ratio, ids, mul: best.mul, topHit, priHit, allHit, sheetTop: row.top, sheetPri: row.pri});
  }
  const n = rows.length;
  const byGen = {};
  rows.forEach(x => { const b = byGen[x.gen] = byGen[x.gen] || {n: 0, top: 0, pri: 0, all: 0}; b.n++; b.top += x.topHit; b.pri += x.priHit; b.all += x.allHit; });
  return {rows, top: rows.reduce((a, x) => a + x.topHit, 0) / n * 100, pri: rows.reduce((a, x) => a + x.priHit, 0) / (4 * n) * 100,
    all: rows.reduce((a, x) => a + x.allHit, 0) / (4 * n) * 100, byGen};
}
const out = {};
// ① 기본 가정 — 시트 등재 풀 / 전체 풀
const base = makeSim(E);
out.baseS = measure(base, "S"); out.baseAll = measure(base, "All");
console.log("기본(DW.inf=.3, NA=.8) 시트풀: #1", out.baseS.top.toFixed(1), "겹침", out.baseS.pri.toFixed(1), "| 전체풀: #1", out.baseAll.top.toFixed(1), "겹침", out.baseAll.pri.toFixed(1));
console.log("세대별(시트풀):", JSON.stringify(out.baseS.byGen));
// ② 민감도 — DW.infantry
out.sweepDW = [];
for (let dw = 0.1; dw <= 1.001; dw += 0.1) {
  const m = measure(makeSim(E, {DW: {infantry: dw, lancer: 1, marksman: 1}}), "S");
  out.sweepDW.push({dw: +dw.toFixed(2), top: m.top, pri: m.pri, all: m.all});
  console.log("DW.inf", dw.toFixed(1), "#1", m.top.toFixed(1), "겹침", m.pri.toFixed(1));
}
// ③ 민감도 — NA_SHARE
out.sweepNA = [];
for (let na = 0.5; na <= 1.001; na += 0.1) {
  const m = measure(makeSim(E, {NA_SHARE: na}), "S");
  out.sweepNA.push({na: +na.toFixed(2), top: m.top, pri: m.pri, all: m.all});
  console.log("NA_SHARE", na.toFixed(1), "#1", m.top.toFixed(1), "겹침", m.pri.toFixed(1));
}
// ④ 포화 곡선 — 같은 칸 k장 vs 섞기 (리더 없음 / 제로니모 리더)
const r3 = [50, 20, 30];
const curve = lead => {
  const pts = [];
  for (let k = 1; k <= 4; k++) {
    const stack = base.combo(lead, Array(k).fill("jessie"), r3);
    const naive = Math.pow(1.25, k);
    const mixIds = ["jessie", "seoyoon", "patrick", "mia"].slice(0, k);
    const mix = base.combo(lead, mixIds, r3);
    pts.push({k, stack, naive, mix, mixIds});
  }
  return pts;
};
out.curveNoLead = curve([]); out.curveJero = curve(["jeronimo"]);
// ⑤ 한 영웅을 k장 겹칠 때 장당 한계 배율 (노라·패트릭·미아·제시) — 제로니모+미아+그웬 48/4/48
const leadN = ["jeronimo", "mia", "gwen"], rN = [48, 4, 48];
out.marginal = {};
for (const id of ["norah", "patrick", "mia", "jessie", "renee"]) {
  const m = []; let prev = 1;
  for (let k = 1; k <= 4; k++) { const v = base.combo(leadN, Array(k).fill(id), rN); m.push(v / prev); prev = v; }
  out.marginal[id] = m;
}
console.log("장당 한계 배율(제로니모·미아·그웬 48/4/48):", JSON.stringify(out.marginal));
writeFileSync(SCRATCH + "/out/out-03.json", JSON.stringify(out, null, 1));
