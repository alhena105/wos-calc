// 장비 계산기 검사. 브라우저 없이 돈다.
//   node test/gear-unit.mjs
//
// FIXTURE 와 그 아래 표들이 이 엔진의 정답지다. 하나라도 어긋나면 엔진이 틀린 것이지
// 픽스처가 틀린 게 아니다 — 이 도메인은 직관이 반복해서 틀리는 곳이라 수치를 먼저 고정했다.
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import vm from "node:vm";
import {boot} from "./dom.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = p => readFileSync(join(ROOT, "src", p), "utf8");

const KNOWN_DEFECTS = {
  // 비어 있는 게 정상이다. unit.mjs 의 같은 이름 주석 참고.
};
let pass = 0, fail = 0, known = 0;
const fails = [], stale = [];
function ok(cond, name, detail) {
  const isKnown = Object.prototype.hasOwnProperty.call(KNOWN_DEFECTS, name);
  if (cond) { pass++; if (isKnown) stale.push(name); return true; }
  if (isKnown) { known++; console.log("   🔧 알려진 결함 — " + name + ": " + KNOWN_DEFECTS[name]); return false; }
  fail++; fails.push(name + (detail ? " — " + detail : "")); return false;
}
function section(t) { console.log("\n── " + t + " " + "─".repeat(Math.max(0, 58 - t.length))); }
function note(t) { console.log("   " + t); }

// ── 로더 ───────────────────────────────────────────────────────────────
const EXPORTS = "GEAR_MS,GEAR_SLOTS,GEAR_SLOT_ORDER,GEAR_TROOPS,GEAR_TROOP_ORDER,GEAR_MASTERY," +
  "GEAR_XP_BANDS,GEAR_DEFAULTS,GEAR_CAVEATS,GEAR_WARNINGS,I18N_TABLES," +
  "GEAR_AXIS,GEAR_AXIS_SUB,GEAR_ORDER,GEAR_ORDER_STAGES,gearBudgetPick,gearAtoms,gearCut,gearMasteryCost,gearLevelCap,gearTroopWeight,gearPlan";
function load(lang) {
  const code = src("i18n.js") + src("gear-data.js") + src("gear-engine.js") +
    "\n;globalThis.__api={" + EXPORTS + "};\n";
  const sandbox = {
    console, URLSearchParams,
    location: {search: lang ? "?lang=" + lang : "", href: "https://x/"},
    navigator: {language: "ko"},
    history: {replaceState() {}},
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, {filename: "gear.js"});
  return sandbox;
}
const CTX = load("ko");
const G = CTX.__api;

// ── 정답지 ─────────────────────────────────────────────────────────────
const FIXTURE = {
  ratios: {
    attack:  {infantry: 48, lancer: 4,  marksman: 48},
    defense: {infantry: 60, lancer: 40, marksman: 0},
  },
  attackWeight: 0.75,
  arenaPriority: "none",
  mithrilPerWeek: 12,
  gear: {
    infantry: {helmet: [11, 1],  gauntlet: [15, 61], belt: [15, 60], boots: [11, 2]},
    marksman: {helmet: [13, 59], gauntlet: [11, 1],  belt: [11, 1],  boots: [13, 59]},
    lancer:   {helmet: [13, 40], gauntlet: [11, 3],  belt: [11, 1],  boots: [13, 40]},
  },
};

// 역할 가중을 끈 축. 예전 모델(방향을 값으로 안 보던 때)과 같아야 한다 —
// 새 껍질 자르기가 옛 자르기를 그대로 포함한다는 증명이다.
const FLAT = {};
for (const t of ["infantry", "lancer", "marksman"])
  FLAT[t] = {attack: 1, defense: 1, health: 1, lethality: 1};
const FIX_FLAT = Object.assign({}, FIXTURE, {axis: FLAT});

// "번호 병종 슬롯 도달레벨 통행료 방향 효율 미스릴 누적 [마스터리]"
const ORDER = [
  ["infantry", "boots",    20,  [],   "defense", 2.000, 10,   10, null],
  ["infantry", "helmet",   20,  [],   "attack",  2.000, 10,   20, null],
  ["marksman", "belt",     20,  [],   "attack",  2.000, 10,   30, null],
  ["marksman", "gauntlet", 20,  [],   "defense", 2.000, 10,   40, null],
  ["lancer",   "belt",     20,  [],   "attack",  2.000, 10,   50, null],
  ["lancer",   "gauntlet", 20,  [],   "defense", 2.000, 10,   60, null],
  ["marksman", "boots",    60,  [],   "attack",  1.000, 30,   90, null],
  ["marksman", "helmet",   60,  [],   "defense", 1.000, 30,  120, null],
  ["lancer",   "boots",    60,  [],   "attack",  1.000, 30,  150, null],
  ["lancer",   "helmet",   60,  [],   "defense", 1.000, 30,  180, null],
  ["infantry", "helmet",   60,  [40], "defense", 0.600, 50,  230, [11, 13]],
  ["infantry", "boots",    60,  [40], "attack",  0.600, 50,  280, [11, 13]],
  ["marksman", "gauntlet", 60,  [40], "attack",  0.600, 50,  330, [11, 13]],
  ["marksman", "belt",     60,  [40], "defense", 0.600, 50,  380, [11, 13]],
  ["lancer",   "gauntlet", 60,  [40], "attack",  0.600, 50,  430, [11, 13]],
  ["lancer",   "belt",     60,  [40], "defense", 0.600, 50,  480, [11, 13]],
  ["infantry", "gauntlet", 100, [80], "defense", 0.556, 90,  570, null],
  ["infantry", "belt",     100, [80], "attack",  0.556, 90,  660, null],
  ["infantry", "boots",    100, [80], "defense", 0.556, 90,  750, [13, 15]],
  ["infantry", "helmet",   100, [80], "attack",  0.556, 90,  840, [13, 15]],
  ["marksman", "helmet",   100, [80], "attack",  0.556, 90,  930, [13, 15]],
  ["marksman", "boots",    100, [80], "defense", 0.556, 90, 1020, [13, 15]],
  ["marksman", "belt",     100, [80], "attack",  0.556, 90, 1110, [13, 15]],
  ["marksman", "gauntlet", 100, [80], "defense", 0.556, 90, 1200, [13, 15]],
  ["lancer",   "helmet",   100, [80], "attack",  0.556, 90, 1290, [13, 15]],
  ["lancer",   "boots",    100, [80], "defense", 0.556, 90, 1380, [13, 15]],
  ["lancer",   "belt",     100, [80], "attack",  0.556, 90, 1470, [13, 15]],
  ["lancer",   "gauntlet", 100, [80], "defense", 0.556, 90, 1560, [13, 15]],
];

const TIERS = [
  {eff: 2.000, steps: 6,  mithril: 60,   expedition: 120, cumMithril: 60},
  {eff: 1.000, steps: 4,  mithril: 120,  expedition: 120, cumMithril: 180},
  {eff: 0.600, steps: 6,  mithril: 300,  expedition: 180, cumMithril: 480},
  {eff: 0.556, steps: 12, mithril: 1080, expedition: 600, cumMithril: 1560},
];

const FREE_XP = [
  ["lancer", "gauntlet", 3, 19], ["infantry", "boots", 2, 19], ["infantry", "helmet", 1, 19],
  ["marksman", "gauntlet", 1, 19], ["marksman", "belt", 1, 19], ["lancer", "belt", 1, 19],
  ["lancer", "helmet", 40, 59], ["lancer", "boots", 40, 59],
  ["infantry", "gauntlet", 61, 79], ["infantry", "belt", 60, 79],
];

// ── 1. 원자 · 청크 자르기 ─────────────────────────────────────────────
section("원자 · 청크 자르기");
{
  // 역할 가중을 끄면 자르기는 예전의 "탐험 + 다음 원정" 과 정확히 같아야 한다.
  const shape = (troop, slot, lv, axis) => {
    const atoms = G.gearAtoms(troop, G.GEAR_SLOTS[slot].side, lv, 0, axis);
    return G.gearCut(atoms).map(h => atoms.slice(h.from, h.to + 1).map(a => a.level).join("+"));
  };
  ok(shape("marksman", "helmet", 1, FLAT).join(",") === "20,40+60,80+100",
     "가중 OFF · Lv.1 → 20 / 40+60 / 80+100", shape("marksman", "helmet", 1, FLAT).join(" · "));
  ok(shape("marksman", "helmet", 59, FLAT).join(",") === "60,80+100", "가중 OFF · Lv.59 → 60 / 80+100");
  ok(shape("marksman", "helmet", 61, FLAT).join(",") === "80+100", "가중 OFF · Lv.61 → 80+100");
  ok(shape("marksman", "helmet", 85, FLAT).join(",") === "100", "가중 OFF · Lv.85 → 100 단독");
  ok(shape("marksman", "helmet", 100, FLAT).length === 0, "Lv.100 은 남은 청크가 없다");

  // 값이 0 인 마일스톤은 다음 값 있는 마일스톤에 흡수되고, 뒤에 값이 없으면 꼬리째 버린다.
  // 보병 고글(좌): Lv.20 공격은 보병이 안 쓰는 축 → Lv.60 방어에 흡수, Lv.100 공격은 버림.
  ok(shape("infantry", "helmet", 1, G.GEAR_AXIS).join(",") === "20+40+60",
     "보병 고글은 Lv.20 공격을 흡수한다 (Lv.100 공격은 청크 밖)", shape("infantry", "helmet", 1, G.GEAR_AXIS).join(" · "));
  // 창병 장갑(우): Lv.20 방어 흡수 → Lv.60 공격, Lv.100 방어는 버림.
  ok(shape("lancer", "gauntlet", 1, G.GEAR_AXIS).join(",") === "20+40+60",
     "창병 장갑은 Lv.20 방어를 흡수한다 (Lv.100 방어는 청크 밖)", shape("lancer", "gauntlet", 1, G.GEAR_AXIS).join(" · "));
  // 궁병은 버리는 축이 없다 — 전부 산다.
  const mk = shape("marksman", "gauntlet", 1, G.GEAR_AXIS);
  ok(mk.join("+").split("+").map(Number).sort((a, b) => a - b).join(",") === "20,40,60,80,100",
     "궁병은 마일스톤을 하나도 버리지 않는다", mk.join(" · "));

  // 청크는 "통행료 여럿 + 값 있는 마일스톤 하나" 여야 한다. 값 있는 것끼리 합치면
  // 한 조각에 미스릴이 몰려(예전 껍질) 임의 예산에서 손해가 커진다.
  // ⚠️ 그 대가로 효율은 조각 안에서 단조가 아니다 — 여기서 단조를 요구하면 안 된다.
  const bad = [];
  for (const t of G.GEAR_TROOP_ORDER) for (const sl of G.GEAR_SLOT_ORDER) for (const lv of [0, 1, 20, 39, 40, 59, 60, 85]) {
    const a = G.gearAtoms(t, G.GEAR_SLOTS[sl].side, lv, 0.15, G.GEAR_AXIS);
    const h = G.gearCut(a);
    h.forEach((x, k) => {
      const part = a.slice(x.from, x.to + 1);
      if (part.filter(y => y.value > 0).length !== 1) bad.push("값 여럿 " + t + "/" + sl + "@" + lv + "#" + k);
      if (part[part.length - 1].value <= 0) bad.push("끝이 통행료 " + t + "/" + sl + "@" + lv + "#" + k);
    });
    if (h.length && a.slice(h[h.length - 1].to + 1).some(x => x.value > 0)) bad.push("버린 꼬리에 값 " + t + "/" + sl + "@" + lv);
  }
  ok(bad.length === 0, "청크마다 값 있는 마일스톤이 정확히 하나(맨 끝)이고, 버린 꼬리에 값이 없다", bad.slice(0, 3).join(", "));

  // 아레나를 챙기면 탐험 마일스톤에도 값이 붙으므로 "Lv.40 에서 멈춤"이 진짜 선택지가 된다.
  ok(shape("marksman", "helmet", 1, G.GEAR_AXIS).join(",") === "20,40+60,80+100",
     "아레나 0 이면 탐험은 통행료라 정차역이 아니다");
  {
    const a = G.gearAtoms("marksman", "left", 1, 0.15, G.GEAR_AXIS);
    ok(G.gearCut(a).map(h => a.slice(h.from, h.to + 1).map(x => x.level).join("+")).join(",") === "20,40,60,80,100",
       "아레나 가중이 있으면 탐험 마일스톤이 각자 정차역이 된다");
  }
}

// ── 2. 마스터리 승급 비용 ──────────────────────────────────────────────
section("마스터리 승급");
{
  const a = G.gearMasteryCost(11, 13), b = G.gearMasteryCost(13, 15), c = G.gearMasteryCost(12, 13);
  ok(a.essence === 250 && a.mythic === 5, "M11→M13 = 에센스 250 · 신화 5", JSON.stringify(a));
  ok(b.essence === 290 && b.mythic === 9, "M13→M15 = 에센스 290 · 신화 9", JSON.stringify(b));
  ok(c.essence === 130 && c.mythic === 3, "M12→M13 = 에센스 130 · 신화 3", JSON.stringify(c));
  ok(G.gearMasteryCost(15, 15).essence === 0, "같은 레벨이면 비용 0");
  // 마스터리는 돌파에만 걸린다. 마일스톤 사이는 XP 만 들므로 상한은 "못 여는 첫 마일스톤 −1".
  // M11 은 Lv.20 을 돌파할 수 있고 Lv.40 은 못 하므로 +39 까지다 (+20 이 아니다).
  const CAP = {0: 19, 10: 19, 11: 39, 12: 59, 13: 79, 14: 99, 15: 100, 20: 100};
  const capBad = Object.keys(CAP).filter(m => G.gearLevelCap(+m) !== CAP[m])
    .map(m => "M" + m + "→" + G.gearLevelCap(+m) + "(기대 " + CAP[m] + ")");
  ok(capBad.length === 0, "마스터리별 레벨 상한 = 못 여는 첫 마일스톤 −1", capBad.join(" | "));
  // 상한은 그 마스터리로 돌파 가능한 마지막 마일스톤과 반드시 맞물려야 한다
  const mism = [];
  for (let m = 0; m <= G.GEAR_MASTERY.max; m++) {
    const cap = G.gearLevelCap(m);
    const blocked = G.GEAR_MS.filter(x => x.mastery > m)[0];
    if (blocked && cap !== blocked.level - 1) mism.push("M" + m);
    if (!blocked && cap !== 100) mism.push("M" + m);
  }
  ok(mism.length === 0, "0~20 전 구간에서 상한이 마일스톤과 맞물린다", mism.join(","));
}

// ── 3. 픽스처 총계 ─────────────────────────────────────────────────────
section("픽스처 총계 (역할 가중 OFF = 예전 모델)");
const planFlat = G.gearPlan(FIX_FLAT);
const plan = planFlat;   // 아래 골든은 역할 가중을 끈 예전 모델 그대로다
ok(plan.steps.length === 28, "스텝 28개", String(plan.steps.length));
ok(plan.totals.mithril === 1560, "미스릴 1560", String(plan.totals.mithril));
ok(plan.totals.expedition === 1020, "원정 보너스 +1020%p", String(plan.totals.expedition));
ok(plan.totals.essence === 4400, "에센스 스톤 4400", String(plan.totals.essence));
ok(plan.totals.mythic === 120, "신화 조각 120", String(plan.totals.mythic));
ok(plan.totals.weeks === 130, "주당 12 → 130주", String(plan.totals.weeks));
note("총 " + plan.steps.length + "스텝 · 미스릴 " + plan.totals.mithril +
     " · 원정 +" + plan.totals.expedition + "%p · 신화 " + plan.totals.mythic);

// ── 4. 효율 티어 ───────────────────────────────────────────────────────
section("효율 티어");
ok(plan.tiers.length === TIERS.length, "티어 " + TIERS.length + "개", String(plan.tiers.length));
TIERS.forEach((w, i) => {
  const g = plan.tiers[i] || {};
  ok(g.eff === w.eff && g.steps === w.steps && g.mithril === w.mithril &&
     g.expedition === w.expedition && g.cumMithril === w.cumMithril,
     "티어 " + w.eff.toFixed(3) + " → " + w.steps + "스텝 · 미스릴 " + w.mithril,
     JSON.stringify(g));
});
// 효율 절벽이 실제로 존재해야 화면에 보여줄 것이 있다
ok(plan.tiers.every((t, i) => i === 0 || t.eff < plan.tiers[i - 1].eff), "티어 효율이 단조 감소");

// ── 5. 업그레이드 순서 28스텝 ──────────────────────────────────────────
section("업그레이드 순서");
ORDER.forEach((w, i) => {
  const s = plan.steps[i];
  const [troop, slot, to, tolls, gain, eff, mithril, cum, mp] = w;
  const label = (i + 1) + " " + troop + " " + slot + " Lv." + to +
    (tolls.length ? " (toll " + tolls.join(",") + ")" : "");
  if (!s) { ok(false, label, "스텝 없음"); return; }
  const got = [s.troop, s.slot, s.toLevel, s.tolls.map(t => t.level).join(","), s.gain,
               +s.eff.toFixed(3), s.mithril, s.cumMithril,
               s.masteryPre ? s.masteryPre.from + "→" + s.masteryPre.to : "-"].join(" ");
  const want = [troop, slot, to, tolls.join(","), gain, eff, mithril, cum,
                mp ? mp[0] + "→" + mp[1] : "-"].join(" ");
  ok(got === want, label, "결과 [" + got + "] 기대 [" + want + "]");
});
// 같은 조각의 청크는 원래 순서를 지켜야 한다 (효율 정렬이 seq 를 넘어설 수 없다)
{
  const seen = {};
  const bad = [];
  plan.steps.forEach(s => {
    const k = s.troop + "/" + s.slot;
    if (seen[k] !== undefined && s.seq !== seen[k] + 1) bad.push(k + " seq " + seen[k] + "→" + s.seq);
    if (seen[k] === undefined && s.seq !== 0) bad.push(k + " 첫 청크가 seq " + s.seq);
    seen[k] = s.seq;
  });
  ok(bad.length === 0, "같은 조각의 청크가 seq 순서를 지킨다", bad.join(" | "));
  const jumps = plan.steps.filter((s, i) => i > 0 && s.eff > plan.steps[i - 1].eff + 1e-9);
  ok(jumps.length === 0, "전체가 효율 내림차순", String(jumps.length) + "곳 역전");
  const chain = [];
  plan.steps.forEach(s => {
    const k = s.troop + "/" + s.slot;
    if (chain[k] !== undefined && s.fromLevel !== chain[k]) chain.push(k);
    chain[k] = s.toLevel;
  });
  ok(plan.steps.every(s => s.toLevel > s.fromLevel), "레벨이 항상 올라간다");
}

// ── 6. 무료 XP 구간 ────────────────────────────────────────────────────
section("무료 XP 구간");
ok(plan.freeXp.length === FREE_XP.length, "무료 구간 " + FREE_XP.length + "개", String(plan.freeXp.length));
FREE_XP.forEach((w, i) => {
  const g = plan.freeXp[i] || {};
  ok(g.troop === w[0] && g.slot === w[1] && g.from === w[2] && g.to === w[3],
     (i + 1) + " " + w[0] + " " + w[1] + " +" + w[2] + "→+" + w[3],
     JSON.stringify(g));
});
// Lv.59 는 다음 마일스톤이 60 이라 무료 구간의 폭이 0 이다 → 목록에 넣지 않는다
ok(!plan.freeXp.some(x => x.from === x.to), "폭 0 인 구간은 목록에 없다");
ok(plan.freeXp.every((x, i) => i === 0 || x.xpRel >= plan.freeXp[i - 1].xpRel),
   "XP 상대 단가 오름차순");

// ── 6.5 원본 우선순위표에서 직접 유도한 골든 ────────────────────────────
// 커뮤니티 「HERO GEAR — UPGRADE ORDER」 표(32칸)를 옮긴 것. 우리 출력에서 뽑아낸 게
// 아니라 그림을 그대로 읽어 적었다. 어긋나면 GEAR_AXIS 나 껍질이 틀린 것이다.
section("원본 우선순위표 대조");
{
  // [GOLD, RED+20, RED+60, RED+100] 각 칸의 스탯 — 병종 무관하게 슬롯이 정한다
  const CELL = {helmet:["lethality","attack","defense","attack"], gauntlet:["health","defense","attack","defense"],
                belt:["health","attack","defense","attack"],      boots:["lethality","defense","attack","defense"]};
  // 표에 번호가 붙은 칸(=사야 하는 칸). null = 회색(맨 마지막), "y" 접두 = 노랑(보조)
  const NUM = {
    infantry:{helmet:[null,null,17,null], gauntlet:[1,9,null,25], belt:[2,null,18,null], boots:[null,10,null,26]},
    lancer:  {helmet:[5,13,null,29],      gauntlet:[null,null,21,null], belt:[null,14,null,30], boots:[6,null,22,null]},
    marksman:{helmet:[3,11,"y23",27],     gauntlet:[7,"y15",19,"y31"],  belt:[8,12,"y24",28],   boots:[4,"y16",20,"y32"]},
  };
  const RED = [20, 60, 100];

  // (a) 좌우 사이클과 골드 스탯이 표와 같은가 — 16칸
  const mism = [];
  for (const sl of G.GEAR_SLOT_ORDER) {
    if (G.GEAR_SLOTS[sl].stat !== CELL[sl][0]) mism.push(sl + " GOLD " + G.GEAR_SLOTS[sl].stat + "≠" + CELL[sl][0]);
    RED.forEach((lv, i) => {
      const ours = G.GEAR_MS.find(m => m.level === lv)[G.GEAR_SLOTS[sl].side];
      if (ours !== CELL[sl][i + 1]) mism.push(sl + " Lv." + lv + " " + ours + "≠" + CELL[sl][i + 1]);
    });
  }
  ok(mism.length === 0, "좌우 사이클 · 골드 스탯 16칸이 표와 일치", mism.join(" | "));

  // (b) GEAR_AXIS 가 표의 초록/노랑/회색과 같은가 — 빨강 36칸
  const grade = [];
  for (const t of ["infantry", "lancer", "marksman"]) for (const sl of G.GEAR_SLOT_ORDER) RED.forEach((lv, i) => {
    const w = G.GEAR_AXIS[t][CELL[sl][i + 1]];
    const n = NUM[t][sl][i + 1];
    const want = n === null ? 0 : String(n).startsWith("y") ? G.GEAR_AXIS_SUB : 1;
    if (w !== want) grade.push(t + "/" + sl + " Lv." + lv + " 우리=" + w + " 표=" + want);
  });
  ok(grade.length === 0, "GEAR_AXIS 가 표의 초록·노랑·회색 36칸과 일치", grade.join(" | "));

  // (c) 백지에서 계획을 세우면, 값이 붙는 마일스톤이 표의 번호 붙은 빨강 24칸과 정확히 같아야 한다
  const blank = {infantry:{}, lancer:{}, marksman:{}};
  for (const t of Object.keys(blank)) for (const sl of G.GEAR_SLOT_ORDER) blank[t][sl] = [G.GEAR_MASTERY.max, 0];
  const p0 = G.gearPlan(Object.assign({}, FIXTURE, {gear: blank}));
  const ours = new Set();
  p0.steps.forEach(s => s.gains.forEach(g => { if (g.tier === "expedition") ours.add(s.troop + "/" + s.slot + "/" + g.level); }));
  const want = new Set();
  for (const t of Object.keys(NUM)) for (const sl of G.GEAR_SLOT_ORDER) RED.forEach((lv, i) => {
    if (NUM[t][sl][i + 1] !== null) want.add(t + "/" + sl + "/" + lv);
  });
  const missing = [...want].filter(k => !ours.has(k)), extra = [...ours].filter(k => !want.has(k));
  ok(want.size === 24, "표의 번호 붙은 빨강 칸은 24개", String(want.size));
  ok(missing.length === 0 && extra.length === 0,
     "우리가 값으로 세는 마일스톤이 표의 24칸과 정확히 일치",
     "빠짐 " + missing.join(",") + " / 남음 " + extra.join(","));

  // (c2) 우선순위 번호 — 그림에서 읽은 NUM 과 gear-data 의 GEAR_ORDER 가 같은가
  const numBad = [];
  for (const t of Object.keys(NUM)) for (const sl of G.GEAR_SLOT_ORDER) [0, 1, 2, 3].forEach(k => {
    const mine = G.GEAR_ORDER[t][sl][k];
    const img = NUM[t][sl][k] === null ? null : +String(NUM[t][sl][k]).replace("y", "");
    if (mine !== img) numBad.push(t + "/" + sl + "[" + k + "] " + mine + "≠" + img);
  });
  ok(numBad.length === 0, "GEAR_ORDER 가 그림의 번호와 같다", numBad.join(" | "));

  // 그림에서 눈으로 읽히는 구조 — 복사 검사가 아니라 규칙 검증이다
  {
    const flat = [];
    for (const t of Object.keys(G.GEAR_ORDER)) for (const sl of G.GEAR_SLOT_ORDER)
      G.GEAR_ORDER[t][sl].forEach((n, k) => { if (n !== null) flat.push({n, t, sl, k}); });
    ok(flat.length === 32 && new Set(flat.map(x => x.n)).size === 32 &&
       Math.min(...flat.map(x => x.n)) === 1 && Math.max(...flat.map(x => x.n)) === 32,
       "번호 1~32 가 겹치지도 빠지지도 않는다", String(flat.length));
    // 단계마다 딱 8칸씩, 그리고 번호 구간이 단계와 정확히 겹친다
    const stageBad = [];
    [0, 1, 2, 3].forEach(k => {
      const ns = flat.filter(x => x.k === k).map(x => x.n).sort((a, b) => a - b);
      const lo = k * 8 + 1, hi = k * 8 + 8;
      if (ns.length !== 8 || ns[0] !== lo || ns[7] !== hi)
        stageBad.push(G.GEAR_ORDER_STAGES[k] + " " + ns.join(","));
    });
    ok(stageBad.length === 0, "GOLD 1~8 · +20 9~16 · +60 17~24 · +100 25~32 로 단계마다 8칸",
       stageBad.join(" | "));
    // 단계 안의 병종 순서 — 그림에서 그대로 읽힌다: 보병2 → 궁병2 → 창병2 → 궁병2.
    // 궁병이 두 번 나오는 이유가 단계마다 다르다. GOLD 는 주 스탯(치명) 먼저·체력 나중이고,
    // 빨강은 필수(공격) 먼저·추천(방어) 나중이다. 그래서 가중이 아니라 병종으로만 본다.
    const seqBad = [];
    [0, 1, 2, 3].forEach(k => {
      const got = flat.filter(x => x.k === k).sort((a, b) => a.n - b.n)
        .map(x => ({infantry: "보", marksman: "궁", lancer: "창"})[x.t]).join("");
      if (got !== "보보궁궁창창궁궁") seqBad.push(G.GEAR_ORDER_STAGES[k] + " " + got);
    });
    ok(seqBad.length === 0, "단계 안 순서가 보병2 → 궁병2 → 창병2 → 궁병2", seqBad.join(" | "));
    // 빨강 단계에서는 뒤에 오는 궁병 둘이 곧 '추천(방어)' 이다
    const subBad = [];
    [1, 2, 3].forEach(k => {
      const mk = flat.filter(x => x.k === k && x.t === "marksman").sort((a, b) => a.n - b.n);
      if (mk.length !== 4) { subBad.push(G.GEAR_ORDER_STAGES[k] + " 궁병 " + mk.length + "칸"); return; }
      const w = mk.map(x => G.GEAR_AXIS.marksman[CELL[x.sl][x.k]]);
      if (!(w[0] === 1 && w[1] === 1 && w[2] === G.GEAR_AXIS_SUB && w[3] === G.GEAR_AXIS_SUB))
        subBad.push(G.GEAR_ORDER_STAGES[k] + " " + w.join(","));
    });
    ok(subBad.length === 0, "빨강 단계의 궁병 4칸은 필수2 → 추천2 순", subBad.join(" | "));
    // GOLD 단계는 병종마다 '주 스탯' 조각이 먼저다
    {
      const g = flat.filter(x => x.k === 0).sort((a, b) => a.n - b.n);
      const bad = g.filter((x, i) => {
        const main = G.GEAR_SLOTS[x.sl].stat === G.GEAR_TROOPS[x.t].mainStat;
        return i < 6 ? !main : main;   // 1~6 은 전부 주 스탯, 7~8(궁병 체력)은 아니다
      }).map(x => x.n + " " + x.t + "/" + x.sl);
      ok(bad.length === 0, "GOLD 1~6 은 주 스탯 조각 · 7~8 은 궁병 체력", bad.join(", "));
    }
    // 번호가 붙은 칸은 곧 값이 있는 칸이다 (GEAR_AXIS 와 앞뒤가 맞아야 한다)
    const axisBad = flat.filter(x => G.GEAR_AXIS[x.t][CELL[x.sl][x.k]] <= 0)
      .map(x => x.n + " " + x.t + "/" + x.sl);
    ok(axisBad.length === 0, "번호 붙은 칸은 전부 가중이 0보다 크다", axisBad.join(", "));
    ok(flat.filter(x => x.t === "marksman").length === 16,
       "궁병이 32칸 중 16칸 — 버리는 축이 없어 투자 가치가 두 배",
       String(flat.filter(x => x.t === "marksman").length));
  }

  // (d) 보병은 공격을, 창병은 방어를 값으로 세지 않는다
  const wrong = [];
  p0.steps.forEach(s => s.gains.forEach(g => {
    if (s.troop === "infantry" && g.dir === "attack") wrong.push("보병이 공격을 삼 Lv." + g.level);
    if (s.troop === "lancer" && g.dir === "defense") wrong.push("창병이 방어를 삼 Lv." + g.level);
  }));
  ok(wrong.length === 0, "보병은 공격을 · 창병은 방어를 값으로 세지 않는다", wrong.join(", "));

  // (e) 회색 칸은 버리는 게 아니라 맨 마지막이다 — 총액은 가중을 꺼도 켜도 같아야 한다
  const on = G.gearPlan(FIXTURE), off = G.gearPlan(FIX_FLAT);
  ok(on.totals.mithril === off.totals.mithril && on.totals.expedition === off.totals.expedition &&
     on.totals.essence === off.totals.essence && on.totals.mythic === off.totals.mythic,
     "역할 가중은 순서만 바꾸고 총액은 그대로다",
     JSON.stringify([on.totals.mithril, off.totals.mithril, on.totals.mythic, off.totals.mythic]));
  // 쓸모는 달라진다. 매직넘버로 박으면 GEAR_AXIS_SUB 를 건드릴 때 뜻이 안 보이므로 유도한다:
  //   필수(가중 1)로 얻는 원정 510%p + 궁병 방어 180%p × SUB
  //   (궁병 방어 180 = 고글 60:30 + 신발 100:50 + 장갑 20:20·100:50 + 벨트 60:30)
  ok(off.totals.useful === 1020, "가중을 끄면 쓸모 = 원정 총량 1020", String(off.totals.useful));
  ok(Math.abs(on.totals.useful - (510 + 180 * G.GEAR_AXIS_SUB)) < 1e-9,
     "가중을 켜면 쓸모 = 510 + 궁병방어 180 × " + G.GEAR_AXIS_SUB,
     on.totals.useful + " vs " + (510 + 180 * G.GEAR_AXIS_SUB));
  const lo = on.tiers[on.tiers.length - 1];
  ok(lo.eff === 0 && lo.leftover && lo.steps === 4 && lo.mithril === 360,
     "맨 뒤가 효율 0 완성용 구간 4스텝 · 미스릴 360", JSON.stringify(lo));
  ok(on.steps.filter(s => s.leftover).every((s, i, a) =>
       on.steps.indexOf(s) >= on.steps.length - a.length),
     "완성용 스텝은 전부 맨 뒤에 몰려 있다");
  ok(on.leftover.pieces.map(x => x.troop + "/" + x.slot).sort().join(",") ===
     "infantry/belt,infantry/helmet,lancer/boots,lancer/gauntlet",
     "완성용으로 밀린 조각이 표의 회색 칸과 같다",
     on.leftover.pieces.map(x => x.troop + "/" + x.slot).sort().join(","));
}

// ── 6.7 예산 해 — 원본 표 순서보다 못하면 안 된다 ────────────────────────
// 효율 내림차순으로 "앞에서 자르기"는 청크 경계에서만 최적이다. 임의 예산에서는 다음 청크가
// 커서 안 들어가면 미스릴이 논다 — 실제로 예산 300 에서 원본 표 순서에 60%p 뒤졌다.
// 그래서 예산 슬라이더는 다중선택 배낭을 정확히 푼다. 그 해가 표 순서보다 못하면 회귀다.
section("예산 해 vs 원본 표 순서");
{
  const blank = {infantry: {}, lancer: {}, marksman: {}};
  for (const t of Object.keys(blank)) for (const sl of G.GEAR_SLOT_ORDER) blank[t][sl] = [G.GEAR_MASTERY.max, 0];
  const p0 = G.gearPlan(Object.assign({}, FIXTURE, {gear: blank}));
  const RED = [20, 60, 100];

  // 표 9~32 를 차례로 사는 시퀀스를 풀어, 예산별 누적 쓸모 곡선을 만든다
  const cells = [];
  for (const t of Object.keys(G.GEAR_ORDER)) for (const sl of G.GEAR_SLOT_ORDER)
    G.GEAR_ORDER[t][sl].forEach((n, k) => { if (n !== null && k > 0) cells.push({n, t, sl, lv: RED[k - 1]}); });
  cells.sort((a, b) => a.n - b.n);
  const at = {}, curve = [{m: 0, v: 0}];
  let cm = 0, cv = 0;
  for (const c of cells) {
    const side = G.GEAR_SLOTS[c.sl].side;
    const from = at[c.t + "/" + c.sl] || 0;
    G.GEAR_MS.filter(x => x.level > from && x.level <= c.lv).forEach(x => {
      cm += x.mithril;
      if (x.tier === "expedition") cv += (G.GEAR_AXIS[c.t][x[side]] || 0) * x.bonus;
    });
    at[c.t + "/" + c.sl] = c.lv;
    curve.push({m: cm, v: cv});
  }
  const chartAt = b => curve.reduce((best, q) => q.m <= b ? Math.max(best, q.v) : best, 0);
  ok(cells.length === 24, "표에서 푼 빨강 구매 24건", String(cells.length));

  const lose = [], gain = [];
  for (let b = 0; b <= p0.totals.mithril; b += 10) {
    const ours = G.gearBudgetPick(p0.steps, b).value, ch = chartAt(b);
    if (ours < ch - 1e-9) lose.push(b + "(" + ours + "<" + ch + ")");
    if (ours > ch + 1e-9) gain.push(b);
  }
  ok(lose.length === 0, "10 단위 전 예산에서 우리 해가 표 순서보다 못한 곳이 없다", lose.slice(0, 5).join(" "));
  ok(gain.length > 0, "우리 해가 표보다 나은 예산 구간이 있다", gain.length + "곳");

  // 순서대로 자르기와 비교 — 정확해가 절대 뒤지지 않고, 실제로 앞서는 예산이 있다
  const truncAt = b => p0.steps.reduce((a, s) => s.cumMithril <= b ? a + s.useful : a, 0);
  const bad = [], better = [];
  for (let b = 0; b <= p0.totals.mithril; b += 10) {
    const ex = G.gearBudgetPick(p0.steps, b).value, tr = truncAt(b);
    if (ex < tr - 1e-9) bad.push(b);
    if (ex > tr + 1e-9) better.push(b);
  }
  ok(bad.length === 0, "정확해가 순서대로 자르기보다 못한 예산이 없다", bad.slice(0, 5).join(" "));
  ok(better.length > 0, "순서대로 자르기가 손해 보는 예산이 실제로 있다", better.length + "곳");
  // 예산 300 은 이 결함을 처음 잡은 자리다 — 회귀 표식으로 박아 둔다
  ok(G.gearBudgetPick(p0.steps, 300).value >= 270,
     "예산 300 에서 최소 +270%p (예전 순서 자르기는 210 이었다)",
     String(G.gearBudgetPick(p0.steps, 300).value));
  // ── ④ 순서표를 위에서부터 그대로 따라갔을 때 ──────────────────────────
  // 예전에는 껍질이 값 있는 마일스톤끼리 합쳐서 한 조각을 +20 → +100 까지 140 미스릴로
  // 한 번에 올리는 스텝을 만들었다. 순서표를 그대로 따르는 사람은 그 자리에서 미스릴이
  // 묶여 예산 300 에서 210 밖에 못 냈다(원본 표는 270). 사용자가 잡은 결함이다.
  const roadAt = b => p0.steps.reduce((a, s) => s.cumMithril <= b ? a + s.useful : a, 0);
  ok(roadAt(300) === 270, "④ 를 위에서부터 따라가도 예산 300 에서 270 (예전 껍질은 210)", String(roadAt(300)));
  {
    let worst = 0, where = 0;
    for (let b = 0; b <= p0.totals.mithril; b += 10) {
      const gap = chartAt(b) - roadAt(b);
      if (gap > worst) { worst = gap; where = b; }
    }
    ok(worst <= 25, "④ 프리픽스가 원본 표 순서보다 25%p 넘게 뒤지는 예산이 없다", worst + "%p @" + where);
  }
  // 단계 우선 — +20 을 전부, 그다음 +60, 그다음 +100. 이게 이 표의 1순위다.
  {
    const bad = [];
    p0.steps.forEach((s, i) => { if (i && s.stage < p0.steps[i - 1].stage) bad.push(i + 1); });
    ok(bad.length === 0, "순서표의 단계가 되돌아가지 않는다", bad.slice(0, 5).join(" "));
    const first60 = p0.steps.findIndex(s => s.toLevel > 20);
    ok(p0.steps.slice(0, first60).every(s => s.toLevel === 20) && first60 === 8,
       "빈 계정이면 12조각 중 값 있는 +20 여덟 개가 먼저 온다", String(first60));
  }
  // 아레나 정차역은 원정 단계 밖이다 — 단계에 끼우면 실전 기여 0 인 Lv.40 을
  // 다른 조각의 Lv.60 보다 먼저 사게 된다.
  {
    const ar = G.gearPlan(Object.assign({}, FIXTURE, {gear: blank, arenaPriority: "high"}));
    const expStages = G.GEAR_MS.filter(m => m.tier === "expedition").length;
    ok(ar.steps.filter(s => s.exploration > 0).every(s => s.stage >= expStages),
       "아레나 정차역은 원정 단계보다 뒤에 선다");
  }

  // 고른 조합은 조각마다 앞에서부터 연속이어야 한다 (청크는 건너뛸 수 없다)
  {
    const set = G.gearBudgetPick(p0.steps, 500).set;
    const seen = {}, holes = [];
    p0.steps.forEach((s, i) => {
      const k = s.troop + "/" + s.slot;
      seen[k] = seen[k] || [];
      seen[k].push(set.has(i));
    });
    Object.keys(seen).forEach(k => {
      const a = seen[k];
      if (a.some((x, i) => !x && a.slice(i).some(Boolean))) holes.push(k);
    });
    ok(holes.length === 0, "고른 조합에 청크 건너뜀이 없다", holes.join(", "));
  }
}

// ── 7. 엣지 케이스 ─────────────────────────────────────────────────────
section("엣지 케이스");
const one = (troop, slot, cell, over) => {
  const gear = {infantry: {}, marksman: {}, lancer: {}};
  GEAR_ALL.forEach(([t, s]) => { gear[t][s] = [15, 100]; });   // 나머지는 전부 완성 → 제외됨
  gear[troop][slot] = cell;
  return G.gearPlan(Object.assign({}, FIX_FLAT, {gear}, over || {}));
};
const GEAR_ALL = G.GEAR_TROOP_ORDER.flatMap(t => G.GEAR_SLOT_ORDER.map(s => [t, s]));
{
  ok(one("infantry", "helmet", [15, 100]).steps.length === 0, "[15,100] 인 조각은 스텝에서 제외된다");

  // 항목이 아예 없는 조각은 0 이 아니라 "입력 없음"이다. 미보유 조각까지 처음부터 올리는
  // 계획을 내면 총액이 통째로 거짓말이 된다 — Orca 브라우저에서 첫 화면을 보고 잡았다.
  {
    const none = G.gearPlan(Object.assign({}, FIX_FLAT, {gear: {}}));
    ok(none.steps.length === 0 && none.freeXp.length === 0 && none.totals.mithril === 0,
       "입력이 하나도 없으면 계획도 비어 있다",
       JSON.stringify([none.steps.length, none.freeXp.length, none.totals.mithril]));
    const partial = G.gearPlan(Object.assign({}, FIX_FLAT, {gear: {infantry: {helmet: [11, 1]}}}));
    ok(partial.steps.length === 3 && partial.totals.mithril === 150,
       "입력한 조각만 계획에 들어간다 (1조각 = 3스텝 · 150)",
       JSON.stringify([partial.steps.length, partial.totals.mithril]));
    ok(partial.freeXp.length === 1, "무료 XP 도 입력한 조각만", String(partial.freeXp.length));
  }

  const p0 = one("infantry", "helmet", [11, 0]);
  ok(p0.steps.length === 3 && p0.steps[0].toLevel === 20,
     "[11,0] (홍색 미해금) 은 Lv.20 청크부터", JSON.stringify(p0.steps.map(s => s.toLevel)));

  const p85 = one("infantry", "helmet", [13, 85]);
  ok(p85.steps.length === 1 && p85.steps[0].toLevel === 100 &&
     +p85.steps[0].eff.toFixed(3) === 1.000 && p85.steps[0].mithril === 50,
     "[13,85] 다음 청크는 Lv.100 단독 · eff 1.000 · 미스릴 50",
     JSON.stringify(p85.steps.map(s => [s.toLevel, +s.eff.toFixed(3), s.mithril])));

  const p39 = one("infantry", "helmet", [12, 39]);
  const mp = p39.steps[0].masteryPre || {};
  ok(p39.steps[0].toLevel === 60 && p39.steps[0].tolls.map(t => t.level).join() === "40",
     "[12,39] 첫 청크는 Lv.40+60", JSON.stringify([p39.steps[0].toLevel, p39.steps[0].tolls.map(t => t.level)]));
  ok(mp.from === 12 && mp.to === 13 && mp.essence === 130 && mp.mythic === 3,
     "[12,39] 마스터리 선행은 M12→M13 만 (에센스 130 · 신화 3)", JSON.stringify(mp));

  const gearAll11 = {infantry: {}, marksman: {}, lancer: {}};
  GEAR_ALL.forEach(([t, s]) => { gearAll11[t][s] = [11, 1]; });
  const pAll = G.gearPlan(Object.assign({}, FIX_FLAT, {gear: gearAll11}));
  ok(pAll.totals.mithril === 1800, "12조각 전부 [11,1] → 미스릴 1800 (12×150)", String(pAll.totals.mithril));
  ok(pAll.steps.length === 36, "12조각 × 청크 3개 = 36스텝", String(pAll.steps.length));

  // 아레나를 챙기면 탐험 마일스톤에 값이 붙는다 → 통행료가 아니라 정차역이 되어
  // 스텝이 늘고, 그 자리에서 멈추는 선택지가 생긴다. 비용과 원정 총합은 그대로다.
  const high = G.gearPlan(Object.assign({}, FIX_FLAT, {arenaPriority: "high"}));
  const low  = G.gearPlan(Object.assign({}, FIX_FLAT, {arenaPriority: "low"}));
  const sumV = p => +p.steps.reduce((a, x) => a + x.value, 0).toFixed(6);
  ok(high.totals.mithril === plan.totals.mithril && low.totals.mithril === plan.totals.mithril,
     "아레나 가중은 비용을 바꾸지 않는다");
  ok(high.totals.expedition === plan.totals.expedition && high.totals.useful === plan.totals.useful,
     "아레나 가중은 원정 총합·실제 쓸모를 바꾸지 않는다");
  ok(high.steps.length > plan.steps.length && low.steps.length > plan.steps.length,
     "아레나 가중이 있으면 탐험이 별도 정차역으로 선다",
     plan.steps.length + " → " + low.steps.length + " / " + high.steps.length);
  ok(sumV(high) > sumV(low) && sumV(low) > sumV(plan),
     "아레나 가중을 올릴수록 탐험 마일스톤의 값이 커진다",
     [sumV(plan), sumV(low), sumV(high)].join(" / "));
  // 탐험은 원정보다 효율이 낮다 → 순서표에서 원정 뒤로 밀린다.
  ok(high.steps.filter(x => x.exploration > 0).every(x => x.eff < 1),
     "탐험 정차역의 효율은 원정(≥1)보다 낮다");
}

// ── 8. 병종 가중 · 정렬 근거 ───────────────────────────────────────────
section("병종 가중");
{
  const w = t => G.gearTroopWeight(t, FIXTURE.ratios, FIXTURE.attackWeight);
  ok(Math.abs(w("infantry") - 0.51) < 1e-9, "보병 0.51 (0.75×48 + 0.25×60)", String(w("infantry")));
  ok(Math.abs(w("marksman") - 0.36) < 1e-9, "궁병 0.36", String(w("marksman")));
  ok(Math.abs(w("lancer") - 0.13) < 1e-9, "창병 0.13", String(w("lancer")));
  // 공격 가중을 0 으로 두면 수비 병비만 남는다 → 궁병(수비 0)이 꼴찌
  const d = t => G.gearTroopWeight(t, FIXTURE.ratios, 0);
  ok(d("marksman") === 0 && d("lancer") === 0.4, "attackWeight 0 이면 수비 병비만 본다",
     [d("infantry"), d("lancer"), d("marksman")].join("/"));
}

// ── 9. 데이터 무결성 ───────────────────────────────────────────────────
section("gear-data 무결성");
{
  ok(G.GEAR_MS.length === 5, "마일스톤 5개", String(G.GEAR_MS.length));
  ok(G.GEAR_MS.filter(m => m.tier === "expedition").length === 3, "원정 마일스톤은 20·60·100 셋뿐");
  ok(G.GEAR_MS.every((m, i) => i === 0 || m.level > G.GEAR_MS[i - 1].level), "마일스톤이 레벨 오름차순");
  ok(G.GEAR_MS.every(m => ["attack", "defense", "health", "lethality"].includes(m.left) &&
                          ["attack", "defense", "health", "lethality"].includes(m.right)),
     "좌우 스탯 값이 유효");
  // 완주 좌우 합계 — 좌 공70/방30, 우 방70/공30
  const sum = (sideKey, want) => G.GEAR_MS.filter(m => m.tier === "expedition")
    .reduce((a, m) => a + (m[sideKey] === want ? m.bonus : 0), 0);
  ok(sum("left", "attack") === 70 && sum("left", "defense") === 30, "좌 완주 = 공70 / 방30",
     sum("left", "attack") + "/" + sum("left", "defense"));
  ok(sum("right", "defense") === 70 && sum("right", "attack") === 30, "우 완주 = 방70 / 공30",
     sum("right", "defense") + "/" + sum("right", "attack"));
  ok(G.GEAR_SLOT_ORDER.length === 4 && G.GEAR_SLOT_ORDER.every(s => G.GEAR_SLOTS[s]), "슬롯 4개가 모두 정의됨");
  ok(G.GEAR_TROOP_ORDER.length === 3 && G.GEAR_TROOP_ORDER.every(t => G.GEAR_TROOPS[t]), "병종 3개가 모두 정의됨");
  ok(G.GEAR_CAVEATS.length >= 4 && G.GEAR_WARNINGS.length >= 3, "경고·한계 문구가 있다",
     G.GEAR_CAVEATS.length + "/" + G.GEAR_WARNINGS.length);
  // gear-engine 에 숫자를 하드코딩하면 패치 대응이 불가능해진다
  {
    const code = src("gear-engine.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
      .replace(/toFixed\(\d+\)/g, "toFixed()")     // 표시용 반올림 자릿수는 게임 상수가 아니다
      .replace(/1e-\d+/g, "EPS");                 // 부동소수 비교 오차도 게임 상수가 아니다
    // 0·1 은 항등원이고 100 은 % → 비율 환산이다. 게임 수치는 하나도 없어야 한다.
    const nums = [...new Set((code.match(/(?<![\w.])\d+(\.\d+)?/g) || []))].filter(n => !["0", "1", "100"].includes(n));
    ok(nums.length === 0, "gear-engine.js 에 상수 하드코딩 없음", nums.join(","));
  }
}

// ── 10. i18n ───────────────────────────────────────────────────────────
section("i18n");
{
  const dump = () => JSON.stringify(G.GEAR_CAVEATS) + JSON.stringify(G.GEAR_WARNINGS);
  ok(/[가-힣]/.test(dump()), "한국어로 열면 경고·한계가 한글");
  vm.runInContext("LANG='en'; I18N_TABLES.forEach(function(f){f();});", CTX);
  const left = [...new Set((dump().match(/[가-힣][가-힣 ·]*/g) || []))].slice(0, 3);
  ok(!/[가-힣]/.test(dump()), "언어를 토글하면 GEAR_CAVEATS·GEAR_WARNINGS 에 한글이 남지 않는다", left.join(" | "));
  vm.runInContext("LANG='ko'; I18N_TABLES.forEach(function(f){f();});", CTX);
  // 슬롯·병종 이름은 L() 이 아니라 ko/en 필드로 들고 있다
  ok(G.GEAR_SLOT_ORDER.every(s => G.GEAR_SLOTS[s].ko && G.GEAR_SLOTS[s].en), "슬롯 이름이 한/영 짝");
  ok(G.GEAR_TROOP_ORDER.every(t => G.GEAR_TROOPS[t].ko && G.GEAR_TROOPS[t].en), "병종 이름이 한/영 짝");
}

// ── 11. 렌더 (최소 DOM 스텁) ───────────────────────────────────────────
// 화면에 무엇이 어떤 순서로 나오는가까지 브라우저 없이 본다.
section("렌더");
{
  const a = boot("ko");
  a.tab("gear").gearCells(FIXTURE.gear);
  const html = a.gearRender();
  ok(html.length > 500, "장비 탭 렌더 결과가 비어 있지 않다", html.length + "자");
  for (const head of ["0단계", "효율 구간", "업그레이드 순서", "좌우 사이클", "경고"])
    ok(html.includes(head), "섹션 " + head + " 렌더", html.slice(0, 60));
  // 무료 XP 구간이 업그레이드 순서보다 위 — 대개 여기가 가장 큰 즉시 이득이다
  ok(html.indexOf("0단계") < html.indexOf("업그레이드 순서"), "0단계(무료 XP)가 업그레이드 순서보다 위");
  ok(html.indexOf("효율 구간") < html.indexOf("업그레이드 순서"), "효율 구간 요약이 순서표보다 위");
  // 통행료 표기 — 왜 미스릴이 더 드는지가 드러나야 한다
  ok(/Lv\.40\s*\(.*?\)\s*→\s*Lv\.60/.test(a.gearText()), "통행료를 지나는 스텝이 Lv.40(탐험) → Lv.60 으로 표기된다");
  // 경고·한계는 접지 않고 전부 노출
  const txt = a.gearText();
  const missing = G.GEAR_WARNINGS.concat(G.GEAR_CAVEATS)
    .filter(w => !txt.includes(w.replace(/\s+/g, " ").slice(0, 20)));
  ok(missing.length === 0, "GEAR_WARNINGS · GEAR_CAVEATS 가 전부 화면에 있다", String(missing.length) + "건 누락");

  // ── 12조각 카드 그리드 ──
  // 화면 순서는 보→창→궁. 엔진 타이브레이크(GEAR_TROOP_ORDER)와 별개여야 한다 —
  // 그걸 바꾸면 위의 28스텝 픽스처가 흔들린다.
  {
    const g = a.el("gGrid").innerHTML;
    const rows = [...g.matchAll(/<h4>.*?<\/i>([^<]+)</g)].map(m => m[1].trim());
    ok(rows.join(",") === "보병,창병,궁병", "카드 행이 보 → 창 → 궁 순서", rows.join(","));
    ok(G.GEAR_TROOP_ORDER.join(",") === "infantry,marksman,lancer",
       "GEAR_TROOP_ORDER 는 엔진 타이브레이크라 그대로다", G.GEAR_TROOP_ORDER.join(","));
    const cards = g.match(/class="gcard[ "]/g) || [];   // gcards(컨테이너)와 헷갈리지 않게
    ok(cards.length === 12, "카드 12장", String(cards.length));
    ok((g.match(/<svg /g) || []).length === 12, "카드마다 슬롯 아이콘",
       String((g.match(/<svg /g) || []).length));
    // 주 스탯 = 슬롯 stat === 병종 mainStat. 보병은 체력(장갑·벨트), 딜러는 치명(고글·신발).
    ok((g.match(/class="gcard main"/g) || []).length === 6, "주 스탯 카드 6장",
       String((g.match(/class="gcard main"/g) || []).length));
    // 마일스톤 눈금 — 원정 3 · 탐험 2 가 색으로 갈라져야 한다.
    // 트랙은 gearTracks() 가 자식 노드에 직접 쓴다(카드를 다시 만들면 포커스가 날아가므로).
    // dom.mjs 스텁은 진짜 트리가 아니라 자식 변경이 부모 문자열에 안 비친다 → 노드를 직접 읽는다.
    const one = a.el("gt_infantry_gauntlet").innerHTML;
    // 보병 장갑(우) — Lv.20 방어·Lv.100 방어가 필요, Lv.60 공격은 이 병종이 안 쓰는 축
    ok((one.match(/class="g-need/g) || []).length === 2 &&
       (one.match(/class="g-axis/g) || []).length === 1 &&
       (one.match(/class="g-arena/g) || []).length === 2,
       "트랙 눈금이 필요·통행료(축)·통행료(탐험)로 갈라진다",
       one.replace(/title="[^"]*"/g, "").slice(0, 200));
    // 눈금 툴팁은 title 속성이라 위 검사가 일부러 지우고 본다 — 그래서 조사 오류가
    // "공격는 보병에게 안 쓰는 축" 으로 오래 남아 있었다(2026-09-13 브라우저 검증에서 발견).
    // 툴팁도 사용자가 읽는 문장이니 같이 본다.
    {
      const tips = [...a.el("gt_infantry_gauntlet").innerHTML.matchAll(/title="([^"]*)"/g)].map(m => m[1])
        .concat([...a.el("gt_marksman_helmet").innerHTML.matchAll(/title="([^"]*)"/g)].map(m => m[1]));
      const bad = tips.filter(t => /(공격|체력|치명)는|방어은/.test(t));
      ok(bad.length === 0, "눈금 툴팁의 조사가 맞다 (공격은 / 방어는)", bad.slice(0, 2).join(" | "));
      ok(tips.some(t => /공격은 /.test(t)) || tips.some(t => /방어는 /.test(t)),
         "축이 안 맞는 통행료 툴팁이 실제로 나온다", tips.slice(0, 3).join(" | "));
    }
    // "다음"은 값이 있는 다음 관문이다. Lv.61 보병 장갑은 Lv.80 이 아니라 Lv.100 을 가리켜야 한다.
    ok(/Lv\.61/.test(one) && /다음 Lv\.100/.test(one),
       "트랙의 '다음'은 값이 있는 관문을 가리킨다", one.slice(-90));
    // 입력이 없는 조각은 트랙도 제외라고 말해야 한다
    const blankGrid = boot("ko");
    blankGrid.tab("gear");
    blankGrid.gearRender();
    ok(/미입력 — 계획에서 제외/.test(blankGrid.el("gt_lancer_belt").innerHTML),
       "미입력 조각의 트랙은 제외라고 적는다", blankGrid.el("gt_lancer_belt").innerHTML.slice(-60));
  }

  // 아무것도 입력하지 않으면 가짜 계획 대신 안내가 나와야 한다.
  // (첫 화면에 36스텝·미스릴 1800 짜리 계획이 떠 있던 것을 Orca 브라우저에서 잡았다.)
  {
    const blank = boot("ko");
    blank.tab("gear");
    const t = blank.gearText();
    ok(/보유 장비를 입력하세요/.test(t), "입력이 없으면 안내가 나온다", t.slice(0, 80));
    ok(!/id="gSteps"/.test(blank.gearRender()), "입력이 없으면 순서표를 그리지 않는다");
    ok(/좌우 사이클/.test(t) && /경고/.test(t), "참조표와 경고는 입력 전에도 보인다");
    ok(blank.el("gBudgetBox").hidden === true, "스텝이 없으면 예산 슬라이더를 감춘다");
  }

  // 영어
  const en = boot("en");
  en.tab("gear").gearCells(FIXTURE.gear);
  const enTxt = en.gearText();
  const enLeft = [...new Set((enTxt.match(/[가-힣][가-힣 ·]*/g) || []))].slice(0, 3);
  ok(!/[가-힣]/.test(enTxt), "?lang=en 장비 탭에 한글이 없다", enLeft.join(" | "));
  const tog = boot("ko");
  tog.tab("gear").gearCells(FIXTURE.gear); tog.gearRender(); tog.setLang("en");
  const togLeft = [...new Set((tog.gearText().match(/[가-힣][가-힣 ·]*/g) || []))].slice(0, 3);
  ok(!/[가-힣]/.test(tog.gearText()), "한국어로 열고 English 를 눌러도 장비 탭에 한글이 없다", togLeft.join(" | "));
  // 입출력 안내(#gIoMsg)는 버튼을 눌렀을 때 만들어진 문장이라 다시 그려지지 않는다.
  // 그래서 "적용했습니다" 가 영어 화면에 남아 있었다 — 지나간 상태 메시지라 지우는 게 맞다.
  {
    const io = boot("ko");
    io.tab("gear").gearCells(FIXTURE.gear); io.gearRender();
    io.el("gIoMsg").textContent = "적용했습니다.";
    io.setLang("en");
    ok(!/[가-힣]/.test(io.el("gIoMsg").textContent || ""),
       "언어를 바꾸면 입출력 안내가 지워진다", io.el("gIoMsg").textContent);
  }
}

// ── 12. 편성 탭 회귀 ───────────────────────────────────────────────────
// 탭을 붙이면서 기존 판정 UI 가 망가지지 않았는지. 자세한 검사는 test/unit.mjs 몫이다.
section("편성 탭 회귀");
{
  const c = boot("ko").mine([50, 0, 50]).enemy([60, 40, 0]);
  const t = c.text();
  ok(/금지 편성/.test(t), "밴드 판정이 그대로 나온다");
  ok(c.el("rPre").innerHTML.split("chip").length - 1 === 12, "병비 프리셋 칩 12종",
     String(c.el("rPre").innerHTML.split("chip").length - 1));
  c.mine([60, 40, 20]);
  c.js('showSum("rSum",["r1","r2","r3"])');
  ok(/120/.test(c.el("rSum").innerHTML), "합계 ≠ 100 경고", c.el("rSum").innerHTML.slice(0, 40));
}

// ── 결과 ───────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(62));
console.log("통과 " + pass + " · 실패 " + fail + (known ? " · 알려진 결함 " + known + "건" : ""));
if (fail) { console.log("\n실패 목록:"); fails.forEach(f => console.log("  ❌ " + f)); }
if (stale.length) {
  console.log("\n고쳐진 것 같습니다 — KNOWN_DEFECTS 에서 지우세요:");
  stale.forEach(s => console.log("  ✨ " + s));
}
process.exit(fail ? 1 : 0);
