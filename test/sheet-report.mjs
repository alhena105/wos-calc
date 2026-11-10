// 시트 대조 리포트 — 버킷 엔진의 Top 1 조합 vs Ton 시트 2026-11-10 조이너 행.
//   node test/sheet-report.mjs
// **테스트가 아니다.** 실패로 끝나지 않는다(exit 0). 겹침과 원인 태그만 찍는다.
// 시트는 정답지가 아니라 비교 기준이다 — 이 숫자를 올리려고 엔진 상수를 만지지 말 것(BUCKET-ENGINE-PROMPT §10).
//
// 겹침은 **동치류 기준 multiset 최대 매칭**이다. 시트의 LETH*(제시*)는 엔진의 파괴력↑ 25% 동치류
// (제시·제셀·제로니모·블랑쉬·헤르보르·행크) 어느 자리와도 맞는다. "?" 칸은 분모에서 뺀다.
// 리더 자리에 a|b 가 있으면 첫 선택지로 한 번, 둘째 선택지로 한 번 더 돌려 둘 다 적는다.
//
// 원인 태그 (겹침이 시트 칸 수보다 작은 행만):
//   UNKNOWN_BUCKET — 놓친 칸이 레니·무명 (버킷 미확정이라 점수에 안 넣는다 → 규칙 레이어)
//   NORAH_STACK    — 시트가 노라를 2장 이상 적었는데 엔진은 그보다 적다
//   NULL_VALUE     — 리더 스킬 중 수치 미확인(v:null)이 있다 (그 버킷을 비어 있다고 본다)
//                    ⚠️ 놓친 칸과 그 null 의 버킷이 무관해도 붙는다 — "원인"이 아니라 "그런 리더가 있는 줄"로 읽을 것.
//                    이 태그만 붙은 줄은 OTHER 로 세지 않으므로 OTHER 는 그만큼 적게 잡힌다.
//   INVEST         — 엔진 #1 에 시트 조이너 명단 밖 영웅이 있다 (엔진은 보유·투자 문턱을 따지지 않는다)
//   OTHER          — 위 어느 것도 아님
import {boot} from "./dom.mjs";
import {SHEET} from "./fixtures-joiners.mjs";

const CLASS = {"LETH*": ["jessie", "jasser", "jeronimo", "blanchette", "herbjorg", "hank"],
               "ATK*": ["seoyoon", "bradley", "magnus", "rufus", "viveca"],
               "D20*": ["sergey", "bahiti", "lumak"]};
const ALIAS = {hervor: "herbjorg"};
const idsOf = tok => tok.split("|").flatMap(t => CLASS[t] || [ALIAS[t] || t]);
const GENERIC = new Set(["25%", "20%", "?"]);

function leaderSets(spec) {
  const pos = spec.split(",").map(p => p.split("|").map(x => ALIAS[x] || x));
  const first = pos.map(p => p[0]);
  const out = [{tag: "", ids: first}];
  if (pos.some(p => p.length > 1)) out.push({tag: "alt", ids: pos.map(p => p[p.length - 1])});
  return out;
}
function run(gen, type, ratio, lead) {
  const a = boot("ko").mode(type === "off" ? "rally" : "defender").leaders(...lead).gear(10).gcap(gen).mine(ratio);
  a.js("globalThis.__r0=render;render=function(d){globalThis.__d=d;return __r0(d);}");
  a.render();
  return a.js(`({
    combos: __d.combos.map(c => ({rel: c.rel, cls: c.cls.map(k => k.mem.map(x => x.h.id))})),
    nulls: __d.unknown.filter(u => u.reason === "v:null").map(u => u.hero.id + " " + u.skill),
    s: Object.fromEntries(HEROES.map(h => [h.id, !!h.s]))})`);
}
// 시트 칸(토큰) × 엔진 자리(동치류 멤버) 최대 매칭
function overlap(tokens, slots) {
  let best = 0, bestMap = [];
  const perm = (arr, k) => {
    if (k === arr.length) {
      let c = 0; const m = [];
      tokens.forEach((t, i) => { const s = slots[arr[i]]; const hit = s && idsOf(t).some(id => s.includes(id)); if (hit) c++; m.push(hit); });
      if (c > best) { best = c; bestMap = m; }
      return;
    }
    for (let i = k; i < arr.length; i++) { [arr[k], arr[i]] = [arr[i], arr[k]]; perm(arr, k + 1); [arr[k], arr[i]] = [arr[i], arr[k]]; }
  };
  perm(slots.map((_, i) => i), 0);
  return {n: best, hit: bestMap};
}

const lines = [], tagCount = {}, KR = {};
let sum = 0, cnt = 0, top5sum = 0;
for (const [gen, type, ratioS, leadS, joinS, alts, note] of SHEET) {
  const ratio = ratioS.split("/").map(Number);
  const tokens = joinS.split(",").filter(t => !GENERIC.has(t));
  for (const L of leaderSets(leadS)) {
    let res;
    try { res = run(gen, type, ratio, L.ids); if (!res.combos.length) throw new Error("조합 없음"); }
    catch (e) { lines.push("G" + gen + " " + ratioS + " " + L.ids.join("+") + " | 계산 실패: " + e.message); continue; }   // 리포트는 실패로 끝나지 않는다
    const top = res.combos[0];
    const ov = overlap(tokens, top.cls);
    const best5 = Math.max(...res.combos.map(c => overlap(tokens, c.cls).n));
    const frac = tokens.length ? ov.n / tokens.length : 1;
    sum += frac; top5sum += tokens.length ? best5 / tokens.length : 1; cnt++;
    const tags = [];
    if (ov.n < tokens.length) {
      const missedT = tokens.filter((t, i) => !ov.hit[i]);
      if (missedT.some(t => /renee|wuming/.test(t))) tags.push("UNKNOWN_BUCKET");
      const norahSheet = tokens.filter(t => t.split("|")[0] === "norah").length;
      const norahEng = top.cls.filter(s => s.includes("norah")).length;
      if (norahSheet >= 2 && norahEng < norahSheet) tags.push("NORAH_STACK");
      if (res.nulls.length) tags.push("NULL_VALUE");
      if (top.cls.some(s => !s.some(id => res.s[id]))) tags.push("INVEST");
      if (!tags.length) tags.push("OTHER");
      tags.forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
    }
    const eng = top.cls.map(s => s[0] + (s.length > 1 ? "*" : "")).join(",");
    lines.push([("G" + gen).padEnd(4), type.padEnd(4), ratioS.padEnd(9), (L.ids.join("+") + (L.tag ? " (alt)" : "")).padEnd(30), "|",
                joinS.padEnd(34), "|", eng.padEnd(40), "×" + top.rel.toFixed(3), "|", (ov.n + "/" + tokens.length).padEnd(4),
                "top5≤" + best5, "|", tags.join(" ")].join(" "));
  }
}
console.log("gen  type ratio     leaders                        | sheet                              | engine #1 (동치류 대표, * = 동치류)        | overlap     | tags");
lines.forEach(l => console.log(l));
console.log("\n행별 평균 겹침 (Top 1): " + (sum / cnt * 100).toFixed(1) + "%  · Top 5 중 최선: " + (top5sum / cnt * 100).toFixed(1) + "%  · 계산한 줄 " + cnt + " (시트 " + SHEET.length + "행 + 리더 선택지 둘째)");
console.log("원인 태그 집계 (겹침이 모자란 줄 기준, 한 줄에 여러 개 가능): " +
  Object.entries(tagCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " " + v).join(" · "));
