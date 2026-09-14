// 독립 시뮬레이터 vs 엔진 — ① 시트 Rally Joiners 16행 ② 54행 추천 배율 ③ ⑤ 단독 배율 ④ 탐욕 vs 전수 최적
import {writeFileSync} from "node:fs";
import {api, renderRow, SCRATCH} from "./lib.mjs";
import {makeSim, bruteBest} from "./formula.mjs";
const E = api(); const sim = makeSim(E);
const {HEROES, byId, SHEET_COMPS} = E;
const out = {rallyJoiners: [], rows: [], summary: {}};

// ① Rally Joiners 탭 (xlsx 그대로) — 리더 없음 4행 + 리더 기준값 블록 12행
const RJ = [
  {lead: [1, 1], jA: 4, jB: 0, total: 2.0}, {lead: [1, 1], jA: 4, jB: 0, total: 2.0}, {lead: [1, 1], jA: 2, jB: 2, total: 2.25}, {lead: [1, 1], jA: 3, jB: 1, total: 2.1875},
  {lead: [1.25, 1.25], jA: 4, jB: 0, total: 2.8125}, {lead: [1.25, 1.25], jA: 4, jB: 0, total: 2.8125}, {lead: [1.25, 1.25], jA: 2, jB: 2, total: 3.0625}, {lead: [1.25, 1.25], jA: 3, jB: 1, total: 3.0},
  {lead: [1.25, 1.5], jA: 4, jB: 0, total: 3.375}, {lead: [1.25, 1.5], jA: 4, jB: 0, total: 3.375}, {lead: [1.25, 1.5], jA: 2, jB: 2, total: 3.5}, {lead: [1.25, 1.5], jA: 3, jB: 1, total: 3.5},
  {lead: [1, 1.5], jA: 4, jB: 0, total: 3.0}, {lead: [1, 1.5], jA: 4, jB: 0, total: 3.0}, {lead: [1, 1.5], jA: 2, jB: 2, total: 3.0}, {lead: [1, 1.5], jA: 3, jB: 1, total: 3.0625},
];
const r3 = E.norm(50, 20, 30);
for (const p of RJ) {
  const skills = [{h: {id: "L"}, e: {slot: "A", v: p.lead[0] - 1}}, {h: {id: "L"}, e: {slot: "B", v: p.lead[1] - 1}}];
  for (let i = 0; i < p.jA; i++) skills.push({h: byId.jessie, e: byId.jessie.exp[0]});
  for (let i = 0; i < p.jB; i++) skills.push({h: byId.seoyoon, e: byId.seoyoon.exp[0]});
  const got = sim.prod(sim.collect(skills, r3));
  out.rallyJoiners.push({...p, got, ok: Math.abs(got - p.total) < 1e-9});
}
console.log("① Rally Joiners 16행 일치", out.rallyJoiners.filter(x => x.ok).length + "/16");

// ② ③ ④ — 54행
const stackable = new Set(HEROES.filter(h => h.stack).map(h => h.id));
let maxRec = 0, maxAll = 0, maxSingle = 0, singles = 0;
for (const c of SHEET_COMPS) {
  const lead = c.l.map(x => x[0]); const ratio = c.rs[0]; const g = c.g;
  const v0 = renderRow(lead, ratio, g, 0);
  const v1 = renderRow(lead, ratio, g, 1);
  const rec0 = v0.rec, all0 = v0.recAll || v0.rec, rec1 = v1.rec;
  const sRec0 = sim.combo(lead, rec0.ids, ratio), sAll0 = sim.combo(lead, all0.ids, ratio), sRec1 = sim.combo(lead, rec1.ids, ratio);
  maxRec = Math.max(maxRec, Math.abs(sRec0 - rec0.mul), Math.abs(sRec1 - rec1.mul)); maxAll = Math.max(maxAll, Math.abs(sAll0 - all0.mul));
  // ⑤ 단독 배율 14행
  const singleDiff = v0.rank.map(x => ({id: x.id, engine: x.mul, sim: sim.single(lead, x.id, ratio)}));
  singleDiff.forEach(x => { maxSingle = Math.max(maxSingle, Math.abs(x.engine - x.sim)); singles++; });
  // 풀 = 시트 등재 + gen 이내 + 단독 배율 > 1.001 (엔진 poolS 정의)
  const poolS = HEROES.filter(h => h.s && h.gen <= g && sim.single(lead, h.id, ratio) > 1.001).map(h => h.id);
  const poolAll = HEROES.filter(h => h.gen <= g && sim.single(lead, h.id, ratio) > 1.001).map(h => h.id);
  const bestS = bruteBest(sim, lead, poolS, ratio, stackable);
  const bestAll = bruteBest(sim, lead, poolAll, ratio, stackable);
  // 시트 칸 자체의 값(칸 안 후보는 최선으로) — 엔진 edge=1 결과가 그것이다
  out.rows.push({g, lead, ratio, label: c.rs.map(v => v.join("/")).join(" · "),
    rec0: {ids: rec0.ids, engine: rec0.mul, sim: sRec0}, all0: {ids: all0.ids, engine: all0.mul, sim: sAll0}, rec1: {ids: rec1.ids, engine: rec1.mul, sim: sRec1},
    bestS, bestAll, poolS: poolS.length, poolAll: poolAll.length,
    gapGreedyS: (bestS.mul / sRec0 - 1) * 100, gapGreedyAll: (bestAll.mul / sAll0 - 1) * 100, lossSheet: (1 - sRec1 / bestS.mul) * 100,
    singleDiff});
  console.log(`g${g} ${lead.join("+")} ${ratio.join("/")}  rec0 ${rec0.mul} sim ${sRec0.toFixed(3)} | recAll ${all0.mul} sim ${sAll0.toFixed(3)} | 최적S ${bestS.mul.toFixed(3)} (${bestS.ids}) gap ${((bestS.mul / sRec0 - 1) * 100).toFixed(2)}% | 최적All ${bestAll.mul.toFixed(3)} gap ${((bestAll.mul / sAll0 - 1) * 100).toFixed(2)}% | 시트따름 ${rec1.mul} 손실 ${((1 - sRec1 / bestS.mul) * 100).toFixed(1)}%`);
}
out.summary = {maxRecDiff: maxRec, maxAllDiff: maxAll, maxSingleDiff: maxSingle, singles,
  greedyGapS: out.rows.filter(x => x.gapGreedyS > 1e-6).length, greedyGapAll: out.rows.filter(x => x.gapGreedyAll > 1e-6).length,
  maxGapS: Math.max(...out.rows.map(x => x.gapGreedyS)), maxGapAll: Math.max(...out.rows.map(x => x.gapGreedyAll)),
  meanLoss: out.rows.reduce((a, x) => a + x.lossSheet, 0) / out.rows.length, maxLoss: Math.max(...out.rows.map(x => x.lossSheet))};
console.log(JSON.stringify(out.summary, null, 1));
writeFileSync(SCRATCH + "/out/out-02.json", JSON.stringify(out, null, 1));
