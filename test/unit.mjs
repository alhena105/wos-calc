// 브라우저 없이 도는 검사. 커밋 전에 항상 돌린다.
//   node test/unit.mjs
//
// src/*.js 를 vm 컨텍스트에 그대로 실행해서 검사한다. render.js 는 최상위 init IIFE 가
// document 를 만지므로 test/dom.mjs 의 최소 DOM 스텁을 물려서 돌린다 — 그래야
// "화면에 무엇이 어떤 순서로 나오는가"까지 브라우저 없이 검사할 수 있다.
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import vm from "node:vm";
import {SHEET_POINTS, QUIET_POINTS, GARRISON_POINTS, GARRISON_QUIET, EXPECTED_COUNTS,
        JOINER_POINTS, JOINER_DUP_POINTS, SHEET_JOINERS, X_BUCKETED, SHEET_ROWS} from "./fixtures.mjs";
// 시트 원문 사본(자동 생성 — tools/sim/04-sheet-fixture.mjs). SHEET_COMPS 를 화면과만 대조하면 같은 출처끼리의 비교라 데이터가 틀려도 통과한다.
import {SHEET_RAW, SHEET_HEAD, SHEET_TOKENS, SHEET_RATIOS} from "./fixtures-sheet.mjs";
import {PARTS, bundle} from "../build.mjs";
import {boot} from "./dom.mjs";
import {existsSync, readdirSync, statSync} from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = p => readFileSync(join(ROOT, "src", p), "utf8");

// ── 미니 러너 ──────────────────────────────────────────────────────────
// KNOWN_DEFECTS: 아직 고치지 않은 결함. 실패로 세지 않되 매번 크게 찍는다.
// 고치면 이 목록에서 지운다 — 목록에 있는데 통과하면 그것도 알려준다.
const KNOWN_DEFECTS = {
  // 비어 있는 게 정상이다. 결함을 새로 발견했다고 여기 넣지 말 것 —
  // 이미 파악·기록해두고 "지금은 안 고친다"고 정한 것만 담는 자리다.
};
let pass = 0, fail = 0, known = 0;
const fails = [], stale = [];
function ok(cond, name, detail) {
  const isKnown = Object.prototype.hasOwnProperty.call(KNOWN_DEFECTS, name);
  if (cond) {
    pass++;
    if (isKnown) stale.push(name);
    return true;
  }
  if (isKnown) {
    known++;
    console.log("   🔧 알려진 결함 — " + name + ": " + KNOWN_DEFECTS[name]);
    return false;
  }
  fail++; fails.push(name + (detail ? " — " + detail : "")); return false;
}
function section(t) { console.log("\n── " + t + " " + "─".repeat(Math.max(0, 58 - t.length))); }
function note(t) { console.log("   " + t); }

// ── 로더 ───────────────────────────────────────────────────────────────
const EXPORTS = "LANG,L,HN,CN,STR,HEROES,SLOTS,ORDER,byId,wpct,norm,tgtRatio,DW,dmgShare," +
  "NA_SHARE,twoStat,anVal,atoms,scoreAtoms,chanceEV,bestJoiners,joinerRules,sig,EXCL,ATK_B,DEF_B,W_DEF,GWEN_EFF,MIA_TYPE_MIN,tgtName,tgtStat,COUNTERS,BAND_TOL,ROW_TOL,MECH,dist,sheetVerdict,garrisonVerdict,eVal,eK,eAdd,xShare,nCls,matchComp,matchComps,compRivals,nearComps,SHEET_COMPS";
function load(lang) {
  const code = src("i18n.js") + src("data.js") + src("engine.js") +
    "\n;globalThis.__api={" + EXPORTS + "};\n";
  const sandbox = {
    console, URLSearchParams,
    location: {search: lang ? "?lang=" + lang : "", href: "https://x/"},
    navigator: {language: "ko"},
    history: {replaceState() {}},
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, {filename: "bundle.js"});
  return sandbox;
}
const CTX_KO = load("ko"), CTX_EN = load("en");
const E = CTX_KO.__api, EN = CTX_EN.__api;
const run = (ctx, expr) => vm.runInContext(expr, ctx);

// ── 1. 빌드 산출물이 최신인가 ──────────────────────────────────────────
section("빌드");
ok(bundle() === readFileSync(join(ROOT, "index.html"), "utf8"),
   "index.html 이 src/ 와 일치", "node build.mjs 를 돌리고 커밋하세요");
note("파트 " + PARTS.length + "개 → " + (bundle().split("\n").length - 1) + "줄");
// render.js 는 최상위 init IIFE 가 document 를 만져서 실행은 못 하지만, 파싱은 해야 한다.
// 실제로 render.js 만 괄호가 안 맞아 화면이 통째로 비었는데 테스트는 초록이었던 적이 있다.
{
  const js = PARTS.filter(p => p.endsWith(".js")).map(src).join("")
    .replace(/<\/script>[\s\S]*$/, "");
  let err = null;
  try { new vm.Script(js, {filename: "bundle.js"}); } catch (e) { err = String(e); }
  ok(!err, "번들 전체가 파싱된다 (render.js 포함)", err);
}

// ── 2. 영웅 스키마 ─────────────────────────────────────────────────────
section("영웅 데이터 스키마");
const CLS = new Set(["infantry", "lancer", "marksman"]);
const SLOTKEYS = new Set(Object.keys(E.SLOTS).concat(["X", "ECO"]));
const STATS = new Set(["Attack", "Defense", "Lethality", "Health"]);
const ids = E.HEROES.map(h => h.id);
ok(new Set(ids).size === ids.length, "id 중복 없음",
   ids.filter((x, i) => ids.indexOf(x) !== i).join(","));
ok(E.HEROES.length === 61, "영웅 61명", "실제 " + E.HEROES.length);

const errs = [];
for (const h of E.HEROES) {
  if (!CLS.has(h.cls)) errs.push(h.id + ": cls=" + h.cls);
  if (!(h.gen >= 0 && h.gen <= 17)) errs.push(h.id + ": gen=" + h.gen);
  if (!h.kr || !h.en) errs.push(h.id + ": kr/en 누락");
  if (h.rar === "epic") {
    if (h.exp.length !== 2) errs.push(h.id + ": 에픽인데 원정스킬 " + h.exp.length + "개");
    if (h.w) errs.push(h.id + ": 에픽인데 전용무기 있음");
  } else if (h.exp.length !== 3) errs.push(h.id + ": 전설인데 원정스킬 " + h.exp.length + "개");
  if (h.w && (!["rally", "defender"].includes(h.w.side) || !STATS.has(h.w.stat) || !h.w.name))
    errs.push(h.id + ": w 형식 이상");
  for (const e of h.exp) {
    if (!SLOTKEYS.has(e.slot)) errs.push(h.id + "/" + e.n + ": slot=" + e.slot);
    if (!!e.t !== !!e.te) errs.push(h.id + "/" + e.n + ": t/te 짝 누락");
    if (!!e.p !== !!e.pe) errs.push(h.id + "/" + e.n + ": p/pe 짝 누락");
    if (e.slot === "X" && (!e.tgt || !e.k)) errs.push(h.id + "/" + e.n + ": X 인데 tgt/k 누락");
    if (e.k && !["dmg", "sur"].includes(e.k)) errs.push(h.id + "/" + e.n + ": k=" + e.k);
    // v:null = Ton 버킷표가 버킷은 적었지만 수치가 없는 효과(배율 제외 · 2026-11-10). 지어내지 않는다.
    if (e.also && (!SLOTKEYS.has(e.also.slot) || (typeof e.also.v !== "number" && e.also.v !== null)))
      errs.push(h.id + "/" + e.n + ": also 형식 이상");
    // X 에 붙는 also 는 그 자체가 병종 한정이라 tgt/k 가 있어야 한다
    if (e.also && e.also.slot === "X" && (!e.also.tgt || !e.also.k))
      errs.push(h.id + "/" + e.n + ": also X 인데 tgt/k 누락");
    if (typeof e.v !== "number" && !(e.v === null && e.unsure)) errs.push(h.id + "/" + e.n + ": v 없음 (null 이면 unsure 가 있어야 한다)");
  }
}
ok(errs.length === 0, "스키마 위반 없음", errs.slice(0, 5).join(" | "));
note("시트 등재(s:1) " + E.HEROES.filter(h => h.s).length + "명 · X슬롯 보유 " +
     E.HEROES.filter(h => h.exp.some(e => e.slot === "X")).length + "명 · also " +
     E.HEROES.reduce((a, h) => a + h.exp.filter(e => e.also).length, 0) + "건");

// ── 3. 카운터표 무결성 ─────────────────────────────────────────────────
section("COUNTERS 무결성");
const sheetRows = E.COUNTERS.filter(c => c.src === "sheet");
const sum = v => v[0] + v[1] + v[2];
const badVec = [];
for (const c of E.COUNTERS) {
  if (sum(c.m) !== 100) badVec.push(c.lbl + " m=" + c.m);
  c.cv.forEach(v => { if (sum(v) !== 100) badVec.push(c.lbl + " cv=" + v); });
  c.ban.forEach(b => { if (sum(b.v) !== 100) badVec.push(c.lbl + " ban=" + b.v); });
  if (!["sheet", "theory"].includes(c.src)) badVec.push(c.lbl + " src=" + c.src);
}
ok(badVec.length === 0, "모든 비율 벡터의 합이 100", badVec.join(" | "));
const counted = {
  rows: sheetRows.length,
  labels: sheetRows.reduce((a, c) => a + c.c.length, 0),
  counters: sheetRows.reduce((a, c) => a + c.cv.length, 0),
  bans: sheetRows.reduce((a, c) => a + c.ban.length, 0),
};
counted.total = counted.counters + counted.bans;
ok(JSON.stringify(counted) === JSON.stringify(EXPECTED_COUNTS),
   "시트 행에서 센 점 수가 픽스처와 일치",
   "코드 " + JSON.stringify(counted) + " vs 픽스처 " + JSON.stringify(EXPECTED_COUNTS));
ok(SHEET_POINTS.length === EXPECTED_COUNTS.total, "픽스처가 좌표로 검사 가능한 11점", String(SHEET_POINTS.length));
// 49/49 를 금지 목록에 따로 적지 않아도 50/50 이 허용 오차 안에서 같이 잡아야 한다
{
  const mine = [49, 2, 49];   // 합이 100이라 정규화 불필요
  const row = E.COUNTERS.find(c => c.lbl === "70/30");
  ok(row.ban.some(b => E.dist(mine, b.v) < E.BAND_TOL),
     "70/30 상대 49/49 는 50/50 항목이 허용 오차로 잡는다",
     "거리 " + E.dist(mine, row.ban[0].v).toFixed(2));
}

// ── 4. 시트 판정 4상태 ──────────────────────────────────────────────────
section("시트 판정 (sheetVerdict)");
const n3 = v => { const s = sum(v); return [v[0] * 100 / s, v[1] * 100 / s, v[2] * 100 / s]; };
for (const p of SHEET_POINTS) {
  const r = E.sheetVerdict(n3(p.en), n3(p.mine));
  ok(r.verdict === p.want, "상대 " + p.row + " vs 내 " + p.label + " → " + p.want,
     "결과=" + r.verdict + (r.rule ? " (" + r.rule.lbl + " 행, 거리 " + r.d.toFixed(1) + ")" : ""));
}
for (const p of QUIET_POINTS) {
  const r = E.sheetVerdict(n3(p.en), n3(p.mine));
  ok(r.verdict === p.want, "상대 " + p.en.join("/") + " vs 내 " + p.mine.join("/") + " → " + p.want,
     "결과=" + r.verdict + " · " + p.why);
}
// 가이드가 멀티랠리를 전제한 카운터는 판정에 그 전제가 안 들어간다.
// 표시 라벨에 전제가 남아 있어야 사용자가 오해하지 않는다.
for (const p of SHEET_POINTS.filter(x => x.premise)) {
  const row = E.COUNTERS.find(c => c.lbl === p.row);
  ok(row.c.some(label => /멀티랠리|랠리|rall/i.test(label)),
     p.row + " 행의 카운터 라벨에 멀티랠리 전제가 남아 있다", row.c.join(" / "));
}

// 수비는 같은 표를 반대로 읽는다 — 행 키가 내 개리슨, 비교 대상이 들어오는 랠리
section("수비 판정 (garrisonVerdict)");
for (const p of GARRISON_POINTS) {
  const r = E.garrisonVerdict(n3(p.mine), n3(p.incoming));
  ok(r.verdict === p.want, "내 개리슨 " + p.row + " vs 들어온 " + p.label + " → " + p.want,
     "결과=" + r.verdict + (r.rule ? " (" + r.rule.lbl + " 행)" : ""));
}
for (const p of GARRISON_QUIET) {
  const r = E.garrisonVerdict(n3(p.mine), n3(p.incoming));
  ok(r.verdict === p.want, "내 개리슨 " + p.mine.join("/") + " vs 들어온 " + p.incoming.join("/") + " → " + p.want,
     "결과=" + r.verdict + " · " + p.why);
}
// 방향을 뒤집었을 뿐 같은 행을 봐야 한다
{
  const a = E.sheetVerdict(n3([60, 40, 0]), n3([40, 20, 40]));
  const b = E.garrisonVerdict(n3([60, 40, 0]), n3([40, 20, 40]));
  ok(a.rule.lbl === b.rule.lbl, "같은 조합이면 랠리·수비가 같은 행을 본다",
     a.rule.lbl + " vs " + b.rule.lbl);
  ok(a.verdict === "counter" && b.verdict === "threat",
     "랠리에서 추천 카운터인 편성은 수비에서 위협이다", a.verdict + " / " + b.verdict);
}

// ── 5. 허용 오차 · 수비 정책 ───────────────────────────────────────────
section("허용 오차 · 수비");
ok(E.BAND_TOL === 6 && E.ROW_TOL === 10, "허용 오차 고정", E.BAND_TOL + "/" + E.ROW_TOL);
// 49/49 를 금지 목록에 따로 적지 않아도 50/50 이 허용 오차 안에서 같이 잡아야 한다
{
  const row = E.COUNTERS.find(c => c.lbl === "70/30");
  ok(row.ban.length === 1 && E.dist([49, 2, 49], row.ban[0].v) < E.BAND_TOL,
     "70/30 상대 49/49 는 50/50 항목이 허용 오차로 잡는다",
     "거리 " + E.dist([49, 2, 49], row.ban[0].v).toFixed(2));
}
// 걷어낸 3채널 지표가 되살아나지 않았는지
for (const gone of ["TH", "THW", "FEAS", "SUP", "channels", "modelVerdict", "CH_NAME", "CH_FIX"])
  ok(run(CTX_KO, "typeof " + gone) === "undefined",
     "3채널 지표 잔재 없음: " + gone,
     "근거 없는 판정을 되살리려면 밴드표에 점부터 붙여야 합니다");

// ── 6. 계산 보조 함수 ──────────────────────────────────────────────────
section("계산 보조");
ok([0, 1].every(l => E.wpct(l) === 0) && E.wpct(2) === 5 && E.wpct(4) === 7.5 &&
   E.wpct(6) === 10 && E.wpct(8) === 12.5 && E.wpct(10) === 15, "전무 레벨 → %");
ok(Math.abs(E.norm(48, 4, 48).inf - 48) < 1e-9, "병비 정규화 (합 100이면 그대로)");
ok(Math.abs(E.norm(60, 60, 0).inf - 50) < 1e-9, "병비 정규화 (합 120 → 50/50/0)");
ok(E.tgtStat("marksman", E.norm(60, 40, 0))[0] === "dead", "궁병 0% → 사망 판정");
ok(E.tgtStat("marksman", E.norm(50, 20, 30))[0] === "ok", "궁병 30% → 정상 판정");
ok(E.DW.infantry === 0.1 && E.NA_SHARE === 0.5, "딜 지분 가정 고정 (보병 0.1 — 2026-11-13 사용자 결정 · NA_SHARE 0.5 — 2026-10-17 엔진 격자 · 상한 2/3 에서 여유)");
// 0.1 을 고른 기준 — 시트에서 보병이 가장 많은 병비에서 "보병 피해량 +100%"(플린트 S1)가 20% 계열(×1.200)을 넘지 않는다.
// 시트가 주는 건 이 상한(DW < 1/6) 하나뿐이다. 시트에 보병이 더 많은 행이 생기면 여기서 먼저 알려 준다.
{ const top = Math.max(...E.SHEET_COMPS.flatMap(c => c.rs).map(v => v[0] * 100 / (v[0] + v[1] + v[2])));
  const worst = E.SHEET_COMPS.flatMap(c => c.rs).filter(v => Math.abs(v[0] * 100 / (v[0] + v[1] + v[2]) - top) < 1e-9)
    .map(v => E.dmgShare("infantry", E.norm(v[0], v[1], v[2]))).reduce((a, b) => Math.max(a, b), 0);
  ok(top === 60 && worst < 0.2 - 1e-9, "시트의 보병 최대 병비(60%)에서 보병 딜 지분이 20% 미만 — 플린트 S1 이 20% 계열을 넘지 않는다",
     "보병 최대 " + top + "% · 딜 지분 " + (worst * 100).toFixed(1) + "%"); }
ok(E.twoStat(.15, .10) === 1 && E.twoStat(0, .2) === 1, "두 칸 스킬은 곱한다 — 교차항 제거는 폐지됐다 (2026-11-10 · twoStat ≡ 1)");
{ const ph = E.atoms(E.byId.philly.exp[0], {inf: 60, lan: 40, mar: 0});
  const v = E.scoreAtoms(ph).s; ok(Math.abs(v - 1.15 * 1.10) < 1e-12 && !ph.some(a => a.t === "two"), "필리 S1 = 공격 1.15 × 방어 1.10 = ×1.265 (다른 버킷은 곱)", v); }
ok(Math.abs(E.dmgShare("infantry", E.norm(50, 20, 30)) - (50 * 0.1) / (50 * 0.1 + 20 + 30)) < 1e-9,
   "보병 딜 지분에 가중치 0.1 적용");

// ── 7. i18n ────────────────────────────────────────────────────────────
section("i18n");
ok(E.LANG === "ko" && EN.LANG === "en", "?lang= 로 언어가 갈린다");
ok(Object.values(E.STR).every(v => Array.isArray(v) && v.length === 2 && v[0] && v[1]),
   "STR 모든 항목이 한/영 짝");
ok(E.CN("infantry") === "보병" && EN.CN("infantry") === "Infantry", "CN() 이 언어를 탄다");

// 언어 토글 후에도 갱신되는가.
// ?lang=en 으로 처음부터 열면 멀쩡하다 — 한국어로 열고 English 를 누른 경로만 문제다.
// 그래서 문맥 두 개를 비교하면 안 되고, 한 문맥 안에서 언어를 바꿔봐야 한다.
// L() 을 값으로 굳히는 표 전부. 하나라도 빠지면 그 표만 한글로 남는다
// (실제로 COUNTERS 를 빠뜨렸다가 브라우저에서 잡혔다).
const I18N_TABLES_EXPECTED = ["SLOTS", "tgtName", "MECH", "COUNTERS"];
// setLang() 이 하는 일 중 DOM 을 안 만지는 부분만 재현한다
run(CTX_KO, "LANG='en'; I18N_TABLES.forEach(function(f){f();});");
ok(run(CTX_KO, "CN('infantry')") === "Infantry", "토글 후 CN() 은 영어를 낸다");
for (const t of I18N_TABLES_EXPECTED) {
  const dump = run(CTX_KO, "JSON.stringify(" + t + ")");
  const left = [...new Set(dump.match(/[가-힣][가-힣 ·]*/g) || [])].slice(0, 3);
  ok(!/[가-힣]/.test(dump), "언어를 토글하면 " + t + " 에 한글이 남지 않는다", left.join(" | "));
}
ok(run(CTX_KO, "I18N_TABLES.length") >= I18N_TABLES_EXPECTED.length,
   "i18nFill 로 등록된 표가 기대 개수 이상",
   run(CTX_KO, "I18N_TABLES.length") + "개");
// 이후 검사가 오염되지 않게 되돌린다
run(CTX_KO, "LANG='ko'; if(typeof I18N_TABLES!=='undefined')I18N_TABLES.forEach(function(f){f();});");

// 하드코딩 한글 스캔 — L() 인자 밖에 있는 한글 문자열 리터럴
const ALLOW = [" 이하"]; // 'Gen N 이하' 는 L() 대신 LANG 삼항으로 쓴 자리
function scanHangul(file) {
  const code = src(file);
  const spans = [];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === "L" && code[i + 1] === "(" && !/[\w$.]/.test(code[i - 1] || " ")) {
      let d = 0, j = i + 1, q = null;
      for (; j < code.length; j++) {
        const ch = code[j];
        if (q) { if (ch === "\\") j++; else if (ch === q) q = null; continue; }
        if (ch === '"' || ch === "'" || ch === "`") q = ch;
        else if (ch === "(") d++;
        else if (ch === ")" && --d === 0) break;
      }
      spans.push([i, j]);
    }
  }
  const inL = i => spans.some(s => i > s[0] && i < s[1]);
  const hits = [];
  let q = null, start = 0, buf = "", line = 1, startLine = 1;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === "\n") line++;
    if (q) {
      if (ch === "\\") { i++; continue; }
      if (ch === q) {
        if (/[가-힣]/.test(buf) && !inL(start) && !ALLOW.some(a => buf.includes(a)))
          hits.push(file + ":" + startLine + "  " + buf.slice(0, 44));
        q = null;
      } else buf += ch;
      continue;
    }
    if (ch === "/" && code[i + 1] === "/") { while (i < code.length && code[i] !== "\n") i++; line++; continue; }
    if (ch === "/" && code[i + 1] === "*") { const e = code.indexOf("*/", i); line += code.slice(i, e).split("\n").length - 1; i = e + 1; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { q = ch; buf = ""; start = i; startLine = line; }
  }
  return hits;
}
const hard = ["engine.js", "render.js", "gear-engine.js", "gear-render.js"].flatMap(scanHangul);
ok(hard.length === 0, "L() 로 안 감싼 한글 리터럴 없음", hard.join(" | "));

// ── 8. 렌더 (최소 DOM 스텁) ────────────────────────────────────────────
// 브라우저 없이 render.js 까지 실제로 돌려서 "무엇이 어떤 순서로 나오는가"를 본다.
// 문자열 존재 검사만으로는 안 잡히는 것들이 여기서 걸린다 — 빈 화면, 문단 순서.
section("렌더");
{
  const rally = boot("ko").mine([40, 20, 40]).enemy([60, 40, 0]);
  const html = rally.render();
  ok(html.length > 500, "랠리 렌더 결과가 비어 있지 않다", html.length + "자");
  // 2026-11-11: 조이너 안내가 맨 위다(사용자 결정). 번호는 화면에 나오는 순서대로 다시 매기므로 제목으로 순서를 본다.
  const heads = (html.match(/<h2>[^<]*/g) || []).map(h => h.slice(4).trim());
  const hAt = ["조이너 안내", "카운터", "리더 구성", "SkillMod 칸 진단", "위젯"].map(t => heads.findIndex(h => h.includes(t)));
  ok(hAt.every((x, i) => x >= 0 && (i === 0 || x > hAt[i - 1])),
     "섹션 순서: 조이너 안내 → 카운터 → 리더 구성 → 칸 진단 → 위젯", heads.join(" | "));
  ok(heads.length >= 5 && heads.every((h, i) => h.startsWith("①②③④⑤⑥⑦"[i])),
     "섹션 번호가 화면 순서대로 빠짐없이 매겨진다", heads.join(" | "));
  ok(!/\{\{n\}\}/.test(html), "번호 자리표시({{n}})가 화면에 새지 않는다");

  // 리더를 다 비웠다가 **같은 리더를 다시 고르면** 결과가 돌아와야 한다 (2026-11-11 리뷰 · 높음).
  // "같은 HTML 이면 다시 안 그린다"(LAST_OUT)를 넣으면서, 리더 0명 안내문이 #out 을 직접 써서 그 기억이 안 지워졌다 —
  // 다시 고른 결과가 "직전에 그린 것과 같다" 로 오판돼 안내문이 그대로 남았다.
  {
    const a = boot("ko").leaders("jeronimo", "", "").mine([60, 40, 0]);
    const h1 = a.render(), h0 = a.leaders("", "", "").render(), h2 = a.leaders("jeronimo", "", "").render();
    ok(/리더를 한 명 이상 선택하세요/.test(h0) && !/조이너 안내/.test(h0), "리더를 다 비우면 안내문만 뜬다", h0.slice(0, 80));
    ok(/조이너 안내/.test(h1) && h2 === h1, "리더를 다 비웠다가 같은 리더를 다시 고르면 결과가 돌아온다", h2.replace(/<[^>]+>/g, " ").slice(0, 60));
    const h3 = a.leaders("", "", "").render();
    ok(h3 === h0, "다시 비우면 다시 안내문이다");
    const code = p => src(p).replace(/\/\/[^\n]*/g, "");
    ok(!/\bout\.innerHTML\s*=/.test(code("engine.js")) && (code("render.js").match(/\bout\.innerHTML\s*=/g) || []).length === 1,
       "#out 은 setOut 한 곳에서만 갈아끼운다 (직접 쓰면 LAST_OUT 이 안 따라간다)");
  }

  // 4상태가 화면 문구까지 도달하는가
  const say = (mine, en) => boot("ko").mine(mine).enemy(en).text();
  ok(/금지 편성/.test(say([50, 0, 50], [60, 40, 0])), "랠리 ban 문구");
  ok(/추천 카운터/.test(say([60, 40, 0], [40, 0, 60])), "랠리 counter 문구");
  ok(/표에 없음/.test(say([40, 40, 20], [60, 40, 0])), "랠리 silent 문구");
  ok(/해당 행 없음/.test(say([40, 20, 40], [34, 33, 33])), "랠리 noRow 문구");

  const dsay = (mine, inc) => boot("ko").mode("defender").mine(mine).enemy(inc).text();
  ok(/정석 카운터가 왔습니다/.test(dsay([60, 40, 0], [40, 20, 40])), "수비 threat 문구");
  ok(/금지 편성으로 왔습니다/.test(dsay([60, 40, 0], [50, 0, 50])), "수비 favorable 문구");
  ok(/표에 없음/.test(dsay([60, 40, 0], [40, 40, 20])), "수비 silent 문구");
  ok(/맞는 행 없음/.test(dsay([34, 33, 33], [40, 20, 40])), "수비 noRow 문구");

  // 침묵을 통과로 렌더하지 않는다 (이 프로젝트의 정정 이력 3번).
  // 문구에 "안전"이라는 낱말 자체는 나온다 — "'안전'이 아니라 '표에 없음'입니다" 로.
  // 그러니 낱말 유무가 아니라 그 경고가 붙어 있는지를 본다.
  {
    const t = dsay([60, 40, 0], [40, 40, 20]);
    ok(/"안전"이 아니라 "표에 없음"입니다/.test(t),
       "수비 silent 에 '안전이 아니다' 경고가 붙는다", t.slice(0, 80));
    ok(!/막아낼 수 있|안전합니다|문제 없습니다/.test(t),
       "수비 silent 을 안전하다고 말하지 않는다");
  }

  // 문단 순서 — "아래 설명문은 …" 이 가리키는 인용문이 실제로 아래 있어야 한다.
  // 텍스트 존재 검사만 하다가 순서가 뒤집힌 채 배포된 적이 있다.
  const ps = boot("ko").mode("defender").mine([60, 40, 0]).enemy([40, 20, 40]).paras();
  const iNote = ps.findIndex(t => /아래 설명문은/.test(t));
  const iWhy = ps.findIndex(t => /만능 방어라 단일 랠리로는 못 깬다/.test(t));
  ok(iNote >= 0 && iWhy === iNote + 1, "수비: 시점 안내가 가이드 인용문 바로 위",
     "안내 " + iNote + " · 인용문 " + iWhy);
  ok(!/아래 설명문은/.test(rally.text()), "랠리에는 시점 안내가 나오지 않는다");

  // 언어: ?lang=en 직행과 토글 경로 둘 다 한글이 남으면 안 된다
  const en = boot("en").mode("defender").mine([60, 40, 0]).enemy([40, 20, 40]);
  const enLeft = [...new Set((en.text().match(/[가-힣][가-힣 ·]*/g) || []))].slice(0, 3);
  ok(!/[가-힣]/.test(en.text()), "?lang=en 렌더에 한글이 없다", enLeft.join(" | "));
  const tog = boot("ko").mode("defender").mine([60, 40, 0]).enemy([40, 20, 40]);
  tog.render(); tog.setLang("en");
  const togLeft = [...new Set((tog.text().match(/[가-힣][가-힣 ·]*/g) || []))].slice(0, 3);
  ok(!/[가-힣]/.test(tog.text()), "한국어로 열고 English 를 눌러도 한글이 없다", togLeft.join(" | "));
}

// ── 8.5 X 슬롯 규칙 ────────────────────────────────────────────────────
// 확률·주기형은 일반 칸과 같은 잣대(기대값)로 환산한다. 예전에는 X 만 원값이
// 섞여 있어서 5턴마다 250% 짜리가 상시 250% 처럼 계산됐다.
section("X 슬롯");
{
  const X = E.HEROES.flatMap(h => h.exp.filter(e => e.slot === "X").map(e => ({h, e})));
  // 2026-11-10: 추가피해 계열 X 를 SKILL 로 옮겨 38 → 27 로 줄었다
  ok(X.length > 20, "X 스킬 표본", String(X.length));
  // 100% 를 넘는 X 는 대부분 환산을 빠뜨린 것이다. 진짜 예외는 여기 근거와 함께 적는다.
  const BIG_OK = {
    "Rampant": "10회 감쇠 평균 0.535 를 이미 반영한 값 (보병 200%×0.535)",
  };
  const tooBig = X.filter(({e}) => e.v > 1.01 && !BIG_OK[e.n]).map(({h, e}) => h.id + "/" + e.n + "=" + e.v);
  ok(tooBig.length === 0, "환산을 빠뜨린 X 가 없다 (100% 초과는 예외 목록만)", tooBig.join(", "));
  const staleBig = Object.keys(BIG_OK).filter(n => !X.some(({e}) => e.n === n && e.v > 1.01));
  ok(staleBig.length === 0, "예외 목록에 남은 사라진 항목 없음", staleBig.join(", "));
  // 두 병종에 걸리는 스킬은 also 로 담는다 — 조이너 배율이 두 지분을 모두 반영해야 한다
  const dual = X.filter(({e}) => e.also && e.also.slot === "X");
  ok(dual.length >= 4, "두 병종 스킬이 also 로 등록돼 있다", String(dual.length));
  for (const {h, e} of dual)
    ok(e.tgt !== e.also.tgt || e.k !== e.also.k,
       h.id + "/" + e.n + " 의 also 가 본체와 다른 대상·축", e.tgt + "/" + e.k);
}

// ── 9. 영웅 초상 ───────────────────────────────────────────────────────
// img/heroes/<영웅 id>.webp. 파일명이 곧 매핑이라 data.js 에 URL 을 두지 않는다.
section("영웅 초상");
{
  const dir = join(ROOT, "img", "heroes");
  const files = existsSync(dir) ? readdirSync(dir) : [];
  const have = new Set(files.filter(f => f.endsWith(".webp")).map(f => f.slice(0, -5)));
  const missing = E.HEROES.filter(h => !have.has(h.id)).map(h => h.id);
  ok(missing.length === 0, "영웅 전원 초상이 있다", missing.join(","));
  const extra = [...have].filter(id => !E.HEROES.some(h => h.id === id));
  ok(extra.length === 0, "쓰이지 않는 초상 파일이 없다", extra.join(","));
  const total = files.reduce((a, f) => a + statSync(join(dir, f)).size, 0);
  ok(total < 600 * 1024, "초상 전체 용량이 600KB 미만", Math.round(total / 1024) + "KB");
  note("초상 " + have.size + "장 · " + Math.round(total / 1024) + "KB");

  // 렌더에 실제로 박히는가 — 경로가 틀리면 화면에서만 조용히 깨진다
  const html = boot("ko").mine([40, 20, 40]).enemy([60, 40, 0]).render();
  const srcs = [...html.matchAll(/<img class="hpic[^"]*"[^>]*src="([^"]+)"/g)].map(m => m[1]);
  ok(srcs.length >= 4, "리더·조이너 자리에 초상이 렌더된다", srcs.length + "개");
  const bad = srcs.filter(u => !existsSync(join(ROOT, decodeURIComponent(u))));
  ok(bad.length === 0, "렌더된 초상 경로가 실제 파일과 맞는다", bad.slice(0, 3).join(","));
  ok(/onerror="this.remove\(\)"/.test(html), "초상이 깨지면 스스로 사라진다");
}

// ── 10. 초상 픽커 ──────────────────────────────────────────────────────
// 진짜 상태는 숨은 <select> 가 들고 있고 픽커는 화면일 뿐이다.
// 그래도 "모든 영웅이 어딘가에서 고를 수 있는가"는 검사해야 한다.
section("초상 픽커");
{
  const a = boot("ko");
  a.render();
  const grids = {infantry: "gInf", lancer: "gLan", marksman: "gMar"};
  const picked = [];
  for (const [cls, gid] of Object.entries(grids)) {
    const html = a.el(gid).innerHTML;
    const idsIn = [...html.matchAll(/data-id="([a-z0-9]*)"/g)].map(m => m[1]);
    const heroes = idsIn.filter(Boolean);
    const want = E.HEROES.filter(h => h.cls === cls).map(h => h.id);
    ok(heroes.length === want.length && want.every(id => heroes.includes(id)),
       cls + " 픽커에 그 병종 영웅이 모두 있다", heroes.length + "/" + want.length);
    ok(idsIn.includes(""), cls + " 픽커에 선택 해제 버튼이 있다");
    picked.push(...heroes);
  }
  ok(new Set(picked).size === E.HEROES.length, "영웅 전원이 정확히 한 번씩 픽커에 들어간다",
     String(new Set(picked).size) + "/" + E.HEROES.length);
  ok(/<img class="hpic"/.test(a.el("gInf").innerHTML), "픽커 버튼에 초상이 들어간다");
  ok(/제로니모/.test(a.el("sInf").innerHTML), "요약에 현재 리더가 표시된다", a.el("sInf").innerHTML.slice(0, 60));

  // 언어를 바꾸면 픽커도 다시 만들어져야 한다
  a.setLang("en");
  const enHtml = ["gInf", "gLan", "gMar"].map(g => a.el(g).innerHTML).join("");
  const left = [...new Set((enHtml.match(/[가-힣][가-힣 ·]*/g) || []))].slice(0, 3);
  ok(!/[가-힣]/.test(enHtml), "언어를 바꾸면 픽커 이름도 영어가 된다", left.join(" | "));
  ok(/Jeronimo/.test(a.el("sInf").innerHTML), "요약도 같이 바뀐다", a.el("sInf").innerHTML.slice(0, 60));
}

// ── N. 조이너 스택 규칙 (Ton 시트 Rally Joiners 탭) ────────────────────
section("조이너 스택 규칙");
{
  // 시트가 적은 규칙 그대로 계산한다 — 같은 칸은 합, 다른 칸은 곱.
  // 리더가 없으므로 모든 칸이 1 에서 출발한다.
  const combo = ids => {
    const b = {};
    E.ORDER.forEach(sl => { b[sl] = 1; });
    for (const id of ids) {
      const e = E.byId[id].exp[0];
      b[e.slot] += e.v;
      if (e.also && b[e.also.slot] !== undefined) b[e.also.slot] += e.also.v;
    }
    return E.ORDER.filter(sl => E.SLOTS[sl].k === "dmg").reduce((a, sl) => a * b[sl], 1);
  };
  for (const p of JOINER_POINTS) {
    const got = combo(p.ids);
    ok(Math.abs(got - p.mul) < 1e-9,
       "시트 조이너 표: " + p.ids.map(i => E.byId[i].kr).join("+") + " = " + p.mul,
       "우리 " + got.toFixed(4) + " / 시트 " + p.mul + " — " + p.why);
  }
  // 예전 방식(각자의 한계 배율을 그냥 곱하기)이 왜 틀렸는지도 같이 박아 둔다.
  const naive = JOINER_POINTS[0].ids.reduce(a => a * 1.25, 1);
  ok(Math.abs(naive - 2.4414) < 1e-3 && naive > JOINER_POINTS[0].mul,
     "단독 배율을 곱하면 시트보다 부풀려진다 (4×제시 1.25⁴ vs 2.0)",
     naive.toFixed(4) + " vs " + JOINER_POINTS[0].mul);
}

// ── N+0b. 리더가 칸을 채운 상태의 조이너 포화 (같은 탭 12행) ─────────────
section("조이너 포화 — 리더 중복 (시트 12행)");
{
  // 시트가 리더 기준값(a0·b0)에서 다시 계산해 둔 블록이다. 우리 칸 규칙이 같은 값을 내는지,
  // 그리고 **한계 배율**(= total / 기준값 곱)이 맞는지 둘 다 본다.
  // 리더 파싱은 쓰지 않는다 — 시트가 리더 스킬 3개 중 납작한 둘만 세기 때문이다(fixtures 주석).
  const V = 0.25;
  for (const p of JOINER_DUP_POINTS) {
    const a = p.a0 + V * p.nA, b = p.b0 + V * p.nB, total = a * b;
    ok(Math.abs(total - p.total) < 1e-9,
       "시트 중복 표: " + p.lead + " 리더 · A" + p.nA + "/B" + p.nB + " = " + p.total,
       "우리 " + total.toFixed(4) + " / 시트 " + p.total + " — " + p.why);
    ok(Math.abs((total - 1) * 100 - p.boost) < 1e-6,
       "시트의 Damage boost % 가 total−1 이다 (" + p.lead + " A" + p.nA + "/B" + p.nB + ")",
       ((total - 1) * 100).toFixed(2) + "% / 시트 " + p.boost + "%");
    // 한계 배율 = 리더 기준값에 대한 비. 엔진의 comboAll 이 내는 값이 이것이다.
    const marg = total / (p.a0 * p.b0);
    ok(marg > 1 && marg <= 2.26, "한계 배율이 1 과 2.26 사이다 (" + p.lead + ")", marg.toFixed(4));
  }
  // 이 블록의 요점: 리더가 채운 칸에 몰아넣으면 손해다.
  const g = (lead, nA, nB) => JOINER_DUP_POINTS.find(x => x.lead === lead && x.nA === nA && x.nB === nB);
  ok(g("제로니모", 2, 2).total > g("제로니모", 4, 0).total,
     "제로니모 리더에서 2:2 가 4:0 보다 크다 (칸을 쪼개는 쪽이 이긴다)",
     g("제로니모", 2, 2).total + " vs " + g("제로니모", 4, 0).total);
  // 단, 어느 칸이 비었는지에 따라 최적 배분이 달라진다 — 시트가 세 리더로 그걸 보여준다.
  ok(g("마그누스+브레들리", 3, 1).total > g("마그누스+브레들리", 2, 2).total,
     "A칸이 빈 리더에서는 3:1 이 2:2 보다 크다 (최적 배분은 고정이 아니다)",
     g("마그누스+브레들리", 3, 1).total + " vs " + g("마그누스+브레들리", 2, 2).total);
  note("시트 12행 전부 일치 — 리더가 채운 칸에 겹치면 깎인다는 우리 모델의 주장을 시트가 숫자로 적었다");
}

// ── N+1. 시트 조이너 명단(s:1) ─────────────────────────────────────────
section("시트 조이너 명단");
{
  const got = E.HEROES.filter(h => h.s).map(h => h.id).sort();
  const want = [...SHEET_JOINERS].sort();
  const miss = want.filter(x => !got.includes(x)), extra = got.filter(x => !want.includes(x));
  ok(miss.length === 0 && extra.length === 0,
     "s:1 이 시트 조이너 칸 " + want.length + "명과 정확히 일치",
     (miss.length ? "빠짐: " + miss.join(",") : "") + (extra.length ? " 잉여: " + extra.join(",") : ""));
  // 조이너 명단은 Gen 8 이하 그대로다 — Gen 10+ 탭이 늘린 것은 리더뿐이다.
  ok(E.HEROES.filter(h => h.s).every(h => h.gen <= 8),
     "시트 조이너는 전부 Gen 8 이하",
     E.HEROES.filter(h => h.s && h.gen > 8).map(h => h.id).join(","));
}

// ── N+2. 렌더: 추천 4명 배율과 T12 경고 ────────────────────────────────
section("조이너 추천 · T12 경고 (렌더)");
{
  const a = boot("ko");
  a.leaders("gregory", "mia", "blanchette").mine([48, 4, 48]);   // 추천에 생존 칸(패트릭·엘레오노라)이 낀다
  a.el("gcap").value = "17";
  const html = a.render();
  const st = html.indexOf('id="rec"');
  const ids = [...html.slice(st, html.indexOf("</b>", st)).matchAll(/img\/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]);
  const shown = +(html.slice(st, st + 1400).match(/배율 ×([\d.]+)/) || [0, 0])[1];

  // 화면 값이 "칸에 다 넣고 다시 잰 값" 과 같은가.
  // 리더 칸도 엔진과 같은 규칙으로 쌓는다 — eVal(pc) · bk(X) · AH 제외까지.
  // base 가 엔진의 buck 과 어긋나면 b/base 비가 통째로 틀어지므로 여기서 줄여 쓰면 안 된다.
  const rr = E.norm(48, 4, 48);
  const base = {};
  E.ORDER.forEach(sl => { base[sl] = 1; });
  for (const lid of ["gregory", "mia", "blanchette"])
    for (const e of E.byId[lid].exp) {
      if (e.slot === "ECO") continue;
      if (e.slot === "X") {
        const bk = w => { if (w.bk && base[w.bk] !== undefined) base[w.bk] += w.v * E.xShare(w, rr); };
        bk(e); if (e.also && e.also.slot === "X") bk(e.also);
        continue;
      }
      if (e.slot === "AH") continue;                 // 칸이 아니다
      if (base[e.slot] !== undefined) base[e.slot] += E.eVal(e, rr);
      if (e.also && base[e.also.slot] !== undefined) base[e.also.slot] += E.eVal(e.also, rr);
    }
  // 전투비를 양쪽 식으로 펴면 (내딜증 × 내감소) / (상대딜증 × 상대감소) 라
  // 내 딜 칸과 내 감소 칸이 결과에 똑같이 곱해진다 → 모든 칸을 센다.
  const b = Object.assign({}, base);
  let cond = 1;
  for (const id of ids) {
    const e = E.byId[id].exp[0];
    // X 는 예전에 여기서 그냥 건너뛰었다. 추천에 X 영웅이 낀 적이 없어 안 드러났을 뿐이고,
    // 시트 등재만이 기본이 되면서 노라가 들어와 터졌다(2026-09-12).
    //   · bk 가 붙은 X = 그 칸의 스탯이다 → 다른 조이너와 같은 칸에 **합산**한다.
    //     계수로 곱하면 제시+제셀+노라가 전부 A칸인데 겹침을 놓친다.
    //   · bk 가 없는 X = 칸이 아니다 → 자기 계수로 곱한다.
    if (e.slot === "X") {
      const part = w => {
        const sh = E.xShare(w, rr);
        if (w.bk && b[w.bk] !== undefined) b[w.bk] += w.v * sh; else cond *= 1 + w.v * sh;
      };
      part(e); if (e.also && e.also.slot === "X") part(e.also);
      continue;
    }
    // An 은 칸이다 — NA_SHARE 환산값을 그 칸에 합산한다 (2026-09-14. 예전엔 계수로 곱했다)
    if (e.slot === "An") { b.An += e.v * E.NA_SHARE; continue; }
    // AH(타격 계열)는 칸이 아니다 — 합연산에 들어가지 않고 자기 계수로 곱한다
    if (e.slot === "AH") { cond *= 1 + e.v; continue; }
    // pc(미아)는 편성 병종 수로 기대값을 다시 낸다 — 원값 0.25 를 더하면 안 된다
    if (b[e.slot] !== undefined) b[e.slot] += E.eVal(e, rr);
    if (e.also && b[e.also.slot] !== undefined) b[e.also.slot] += e.also.v;
    // 두 칸 스킬은 합으로 — 교차항 제거 (2026-10-10)
    if (e.also && b[e.slot] !== undefined && b[e.also.slot] !== undefined) cond *= E.twoStat(E.eVal(e, rr), e.also.v);
  }
  const want = E.ORDER.reduce((x, sl) => x * (b[sl] / base[sl]), 1) * cond;
  const dmgOnly = E.ORDER.filter(sl => E.SLOTS[sl].k === "dmg")
    .reduce((x, sl) => x * (b[sl] / base[sl]), 1) * cond;
  ok(ids.length === 4, "추천 4명이 네 명이다", ids.join(","));
  // 반올림 자리만 허용한다. 화면에서 읽은 값을 쓰지 않고 전부 스스로 계산하므로 넓힐 이유가 없다.
  ok(Math.abs(shown - +want.toFixed(3)) < 5e-4,
     "화면의 추천 4명 전투 배율이 모든 칸 재계산과 일치",
     "화면 " + shown + " / 칸 " + want.toFixed(3) + " · " + ids.join(","));
  ok(ids.some(id => {
       const e = E.byId[id].exp[0];
       return e.slot !== "X" && E.SLOTS[e.slot] && E.SLOTS[e.slot].k === "sur";
     }) ? want > dmgOnly + 1e-9 : true,
     "생존 칸 조이너가 있으면 딜만 센 값보다 크다",
     "전체 " + want.toFixed(3) + " vs 딜만 " + dmgOnly.toFixed(3));
  ok(/전투 배율 ×/.test(html), "라벨이 '전투 배율' 이다");

  // 기본 추천은 **시트 등재 영웅만**이다 (2026-09-12). 계산 순위는 보조 패널로 내려갔다.
  ok(ids.every(id => E.byId[id].s), "기본 추천 4명이 전부 시트 등재(s:1)다",
     ids.filter(id => !E.byId[id].s).join(","));
  ok(/시트 등재만/.test(html.slice(st, st + 400)), "추천 패널 제목 옆에 '시트 등재만' 배지가 있다");
  {
    const i = html.indexOf('id="recAll"');
    ok(i > st, "계산 순위 패널(#recAll)이 추천 패널 아래에 있다", "rec=" + st + " recAll=" + i);
    const alt = [...html.slice(i, html.indexOf("</b>", i)).matchAll(/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]);
    ok(alt.length === 4 && alt.join() !== ids.join(),
       "두 목록이 실제로 다를 때만 보조 패널이 뜬다", alt.join(",") + " vs " + ids.join(","));
    ok(alt.some(s => !E.HEROES.find(h => h.en.toLowerCase().replace(/ /g, "-") === s).s),
       "보조 패널에는 이론(시트 미등재) 영웅이 들어 있다", alt.join(","));
    // 캡션이 "여기 [이론] 배지가 붙은 영웅은…" 이라고 가리킨다 — 실제로 붙어 있어야 한다.
    // 2026-09-13 배포본 육안 검증에서 발견: 넷 중 누가 시트 밖인지 화면에서 알 수 없었다.
    {
      const head = html.slice(i, html.indexOf("</b>", i));
      const theory = alt.filter(s => !E.HEROES.find(h => h.en.toLowerCase().replace(/ /g, "-") === s).s);
      ok((head.match(/>이론</g) || []).length === theory.length,
         "보조 패널의 이론 배지 개수가 시트 미등재 영웅 수와 같다",
         "배지 " + (head.match(/>이론</g) || []).length + " · 미등재 " + theory.join(","));
    }
  }
  ok(/생존 칸도 같은 무게로 셉니다/.test(html), "생존 칸을 같이 세는 근거가 화면에 있다");
  ok(/같은 칸에 겹치는 분을 합쳤을 때/.test(html),
     "단독 배율을 곱한 값이 아니라는 설명이 붙어 있다");

  // T12 창병 경고 — 시트 "Gen 10+" 탭의 T12 CHANGES 줄
  const warn = t => /창병 T12 스킬 미발동/.test(t);
  ok(warn(boot("ko").leaders("gregory", "", "blanchette").mine([40, 0, 60]).render()),
     "Gen 10+ 서버에서 창병 0 이면 T12 경고가 뜬다");
  ok(!warn(boot("ko").leaders("gregory", "mia", "blanchette").mine([48, 4, 48]).render()),
     "창병이 있으면 T12 경고가 안 뜬다");
  {
    const c = boot("ko");
    c.leaders("gregory", "", "blanchette").mine([40, 0, 60]);
    c.el("gcap").value = "9";
    ok(!warn(c.render()), "서버 세대가 Gen 9 이하면 T12 경고가 안 뜬다");
  }
}

// ── N+3. 병종 한정 "스탯" X 스킬은 칸에 들어간다 (bk) ──────────────────
section("X 스킬의 칸 귀속 (bk)");
{
  // (1) 표시가 픽스처와 정확히 일치하는가 — 픽스처는 wosheroes 원문에서 유도했다
  const got = [];
  for (const h of E.HEROES)
    for (const e of h.exp) {
      if (e.bk) got.push({id: h.id, n: e.n, bk: e.bk, alsoBk: e.also && e.also.bk});
      else if (e.also && e.also.bk) got.push({id: h.id, n: e.n, bk: undefined, alsoBk: e.also.bk});
    }
  const norm = a => a.map(x => x.id + "/" + x.n + "/" + (x.bk || "-") + "/" + (x.alsoBk || "-")).sort().join(" ");
  ok(norm(got) === norm(X_BUCKETED), "bk 표시가 X_BUCKETED " + X_BUCKETED.length + "건과 일치",
     norm(got) === norm(X_BUCKETED) ? "" : "코드 " + norm(got) + " / 픽스처 " + norm(X_BUCKETED));

  // (2) bk 는 X 슬롯에만, 그리고 실재하는 일반 칸을 가리켜야 한다
  const bad = [];
  for (const h of E.HEROES)
    for (const e of h.exp)
      for (const q of [e, e.also].filter(Boolean)) {
        if (!q.bk) continue;
        if ((q.slot || e.slot) !== "X") bad.push(h.id + "/" + e.n + ": bk 인데 X 가 아니다");
        if (!E.SLOTS[q.bk] || q.bk === "X") bad.push(h.id + "/" + e.n + ": bk=" + q.bk + " 는 없는 칸");
        if (q.k === "dmg" && E.SLOTS[q.bk].k !== "dmg") bad.push(h.id + "/" + e.n + ": 딜인데 생존 칸");
        if (q.k === "sur" && E.SLOTS[q.bk].k !== "sur") bad.push(h.id + "/" + e.n + ": 생존인데 딜 칸");
      }
  ok(bad.length === 0, "bk 는 X 슬롯에만 붙고 같은 계열의 실재 칸을 가리킨다", bad.slice(0, 3).join(" | "));

  // (3) 리더의 bk 스킬이 칸에 실제로 들어가는가 — 플린트 보병 100% @ 60/40
  //     보병 딜 지분 = 60*0.1 / (60*0.1 + 40) = 6/46 = 0.1304 → A 에 +0.13  (2026-11-13 까지 0.3 → 18/58 = 0.31)
  {
    const a = boot("ko").leaders("flint", "", "").mine([60, 40, 0]);
    const html = a.render();
    const m = html.match(/피해량 증가[\s\S]{0,400}?class="big">([\d.]+)/);
    const want = 1 + 1.0 * (60 * E.DW.infantry) / (60 * E.DW.infantry + 40);
    ok(m && Math.abs(+m[1] - +want.toFixed(2)) < 5e-3,
       "리더 플린트의 보병 피해량이 A 칸에 지분 환산으로 들어간다",
       "화면 " + (m && m[1]) + " / 기대 " + want.toFixed(2));
    ok(html.includes("Pyromaniac +" + ((want - 1) * 100).toFixed(0) + "% (병종 지분 환산)") && (want - 1) > 0.12 && (want - 1) < 0.14,
       "② 구성 칸에 환산됐다는 표시가 남는다 (60/40 → +13%)", ((want - 1) * 100).toFixed(1) + "%");
  }

  // (4) 조이너의 bk 스킬은 칸에서 잰다 → 포화를 겪는다
  //     예전에는 1 + v×지분 (=1.310) 으로 혼자 1.00 에서 출발해 상위권에 올라왔다.
  {
    const a = boot("ko").leaders("magnus", "sonya", "bradley").mine([60, 40, 0]);
    a.el("gcap").value = "17";
    const html = a.render();
    const sh = (60 * E.DW.infantry) / (60 * E.DW.infantry + 40);
    const A = +html.match(/피해량 증가[\s\S]{0,400}?class="big">([\d.]+)/)[1];
    const bucketed = (A + 1.0 * sh) / A, old = 1 + 1.0 * sh;
    ok(bucketed < old, "칸에서 재면 플린트 배율이 예전보다 낮다",
       bucketed.toFixed(3) + " < " + old.toFixed(3) + " (A칸 " + A + ")");
    // ⚠️ #rec(시트 등재만)이 아니라 #recAll(계산 순위 그대로)을 봐야 한다.
    // 플린트는 시트 미등재라 #rec 에는 애초에 못 든다 — 거기서 검사하면
    // bk 가 도로 빠져도 통과해버려서 이 검사가 아무것도 안 지킨다.
    const idx = html.indexOf('id="recAll"'), src2 = idx >= 0 ? html.slice(idx) : html.slice(html.indexOf('id="rec"'));
    ok(!/heroes\/flint\.webp/.test(src2.slice(0, src2.indexOf("</b>"))),
       "60/40 리더 팀에서 플린트가 계산 순위 상위 4명에 들지 않는다");
  }
}

// ── N+4. 병종마다 독립 시행하는 확률 스킬 (pc) ─────────────────────────
section("병종별 독립 시행 (pc)");
{
  // 볼트 「랠리 조이너 선정 규칙·개리슨 운영 (Ton)」 §6 의 표 그대로:
  //   1병종 50% → 25% · 2병종 75% → 37.5% · 3병종 87.5% → 43.75%
  const want = [[[100, 0, 0], 1.250], [[60, 40, 0], 1.375], [[48, 4, 48], 1.4375]];
  for (const [ratio, mul] of want) {
    const a = boot("ko").leaders("jeronimo", "", "greg").mine(ratio);
    a.el("gcap").value = "17";
    const h0 = a.render(), h = h0.slice(h0.indexOf('id="single"'));   // 단일 순위표에서 읽는다 — 초상은 위쪽 카드에도 나온다
    const m = h.match(/heroes\/mia\.webp[\s\S]{0,1400}?class="big">×([\d.]+)/);
    ok(m && Math.abs(+m[1] - +mul.toFixed(3)) < 5e-4,
       "미야 조이너 배율 @" + ratio.join("/") + " = ×" + mul.toFixed(3),
       "화면 ×" + (m && m[1]));
  }
  // pc 는 미야 S1 · 플로라 S1 둘뿐이다 — 조용히 번지지 않게 못 박는다.
  // 플로라는 2026-11-10 사용자 결정(Ton 영상 "플로라 = 미아")으로 붙었다. 같은 문구 7건(09-14 기각)은 여전히 아니다.
  const pcs = [];
  for (const h of E.HEROES)
    for (const e of h.exp) if (e.pc) pcs.push(h.id + "/" + e.n);
  ok(pcs.join() === "mia/Bad Luck Streak,flora/Enmiring Vines", "pc 가 붙은 스킬은 미야 Bad Luck Streak · 플로라 Enmiring Vines 둘", pcs.join(" | "));

  // 병종이 하나뿐이면 원래 값으로 돌아온다 (n=1 → 항등)
  ok(Math.abs(0.25 * (1 - Math.pow(0.5, 1)) / 0.5 - 0.25) < 1e-12, "n=1 이면 pc 보정은 항등원");
}

// ── N+5. 감소 계열이 나눗셈이라는 안내 ─────────────────────────────────
section("감소 계열 나눗셈 안내");
{
  const h = boot("ko").leaders("jeronimo", "mia", "greg").mine([50, 20, 30]).render();
  ok(/1\.25 ÷ 1\.2 = 1\.0417/.test(h), "25% 대 20% 의 나눗셈 수치가 화면에 있다");
  ok(/2\.0 ÷ 1\.8 = 1\.111/.test(h), "네 장씩 쌓았을 때 수치도 있다");
  ok(/공격용·방어용 조이너 구분은 없습니다/.test(h), "공수 조이너 구분이 없다는 볼트 결론이 있다");
  ok(/4스택/.test(h), "상대 4스택 예외가 같이 적혀 있다");
  // 안내문이 가리키는 값이 실제 계산과 맞는가 — 20% 감소는 칸에 +0.20 으로 들어간다.
  // 볼트 §5 의 "받피감 4장 = ÷(1+0.20×4) = ÷1.8" 이 우리 칸 모델과 같은 산수다.
  {
    const d = boot("ko").leaders("sergey", "", "").mine([60, 40, 0]).render();
    const D = d.match(/받는 피해 감소[\s\S]{0,400}?class="big">([\d.]+)/);
    ok(D && D[1] === "1.20", "세르게이 하나면 D 칸 = 1.20 (= ÷1.2)", D && D[1]);
    // 네 장이면 1.80, 25% 딜 네 장이면 2.00 → 2.0/1.8 = 1.111 (볼트 수치)
    const four = (v) => 1 + v * 4;
    ok(Math.abs(four(0.25) / four(0.20) - 1.1111) < 1e-3,
       "네 장씩 쌓으면 2.0 ÷ 1.8 = 1.111 이 나온다", (four(0.25) / four(0.20)).toFixed(4));
  }
}

// ── N+6. 동률 타이브레이크 ─────────────────────────────────────────────
section("조이너 동률 타이브레이크");
{
  const a = boot("ko").leaders("jeronimo", "", "greg").mine([48, 4, 48]);
  a.el("gcap").value = "17";
  const html = a.render();
  const rows = [...html.matchAll(/<td>(\d+)<\/td><td class="b"><span class="hrow">[\s\S]*?heroes\/([a-z-]+)\.webp[\s\S]*?class="big">×([\d.]+)/g)]
    .map(m => ({rank: +m[1], h: E.byId[m[2]], mul: m[3]}));
  ok(rows.length >= 10, "순위표를 읽었다", rows.length + "행");

  // 값이 같은 묶음 안에서 ① 시트 → ② 에픽 → ③ 낮은 세대 순서가 지켜지는가
  const bad = [];
  for (let i = 1; i < rows.length; i++) {
    const p = rows[i - 1], c = rows[i];
    if (p.mul !== c.mul) continue;                       // 동률 묶음 안에서만 본다
    const key = x => [x.h.s ? 0 : 1, x.h.rar === "epic" ? 0 : 1, x.h.gen];
    const [ps, pe, pg] = key(p), [cs, ce, cg] = key(c);
    if (ps > cs || (ps === cs && pe > ce) || (ps === cs && pe === ce && pg > cg))
      bad.push(p.h.kr + " → " + c.h.kr + " (×" + c.mul + ")");
  }
  ok(bad.length === 0, "동률 안에서 시트 → 에픽 → 낮은 세대 순서가 지켜진다", bad.slice(0, 3).join(" | "));

  // 회귀 표식: 예전에는 데이터 순서에 맡겨 그웬(이론·G5)이 헨드릭(시트·G8)을 앞섰다.
  // 2026-11-10 그웬 S1 이 GWEN_EFF 로 감쇄돼 ×1.250 묶음을 떠났으므로 같은 버킷(F)의 이론 영웅 리지아(G12)로 잰다.
  const at = id => rows.findIndex(x => x.h.id === id);
  const hen = at("hendrik"), gwen = at("ligeia");
  ok(hen >= 0 && gwen >= 0 && rows[hen].mul === rows[gwen].mul && hen < gwen,
     "같은 ×1.250 에서 헨드릭(시트)이 리지아(이론)보다 앞",
     "헨드릭 " + (hen + 1) + "위 / 리지아 " + (gwen + 1) + "위");

  // 타이브레이크는 값을 건드리지 않는다 — 배율은 여전히 내림차순이다
  const desc = rows.every((x, i) => i === 0 || +rows[i - 1].mul >= +x.mul);
  ok(desc, "배율 자체는 여전히 내림차순이다");

  ok(/시트 등재 → 근처 세대\(±2\) 시트 행에서 자주 쓰인 영웅 → 에픽 → 낮은 세대/.test(html), "타이브레이크 기준이 화면에 적혀 있다 (2026-10-17 근처 세대 빈도 포함)");
}

// ── N+6b. 전투 배율 — bk(X) 겹침과 pc 기대값 회귀 ──────────────────────
// ── N+6b. An(일반공격 한정)은 칸이다 — 리더도 조이너도 NA_SHARE 환산값을 같은 칸에 합산 ──
// 2026-09-14 독립 공식 시뮬레이터(Kills ≈ √병력 × 공격×파괴력 ÷ 적방어×적체력 × SkillMod)와
// 54행 전수 대조에서 잡혔다. 레이나가 리더인 4행에서만 엔진이 독립 계산보다 높았다 —
// 리더는 An 칸에 원값 0.30 을 넣고 조이너는 칸 밖에서 ×1.24 를 곱해서, 조이너 레이나가
// 자기 포화를 안 겪었다(×1.240 · 정확 ×1.194). 탐욕이 전수 최적을 놓친 행도 정확히 그 4행이었다.
section("An 칸 — 리더·조이너 같은 잣대 (2026-09-14)");
{
  const r = E.norm(60, 40, 0);
  const reina = E.byId.reina.exp[0];
  ok(reina.slot === "An" && Math.abs(E.anVal(reina, r) - 0.15) < 1e-12, "레이나 S1 은 An 이고 칸값은 0.30×NA_SHARE = 0.15");
  // ⑤ 표는 14행뿐이라 NA_SHARE 0.5 에서는 레이나(×1.130)가 표 밖으로 밀린다 → render 에 넘어가는 rank 를 직접 읽는다
  const rankOf = (a, id) => {
    a.js("const __r=render; render=function(d){globalThis.__d=d;return __r(d);}");
    a.render();
    return +a.js("(function(){const x=__d.rank.find(z=>z.h.id==='" + id + "');return x?x.mul.toFixed(3):'null';})()") || null;
  };
  // 리더 레이나 → 조이너 레이나는 (1.15+0.15)/1.15 = ×1.130
  // ⑤ 는 14행뿐이라 아모세(Viper also 추가 후 ×1.24)가 리더인 편성에서는 레이나가 15위로 밀려 안 보인다 → 나탈리아로
  const m1 = rankOf(boot("ko").leaders("natalia", "reina", "lynn").mine([60, 40, 0]).gcap(4), "reina");
  ok(m1 !== null && Math.abs(m1 - 1.130) < 1e-3, "리더 레이나 행에서 조이너 레이나는 ×1.130 (자기 포화)", "실제 ×" + m1);
  // 리더 없이 → ×1.150 (옛 동작을 포함한다)
  const m0 = rankOf(boot("ko").leaders("natalia", "philly", "lynn").mine([60, 40, 0]).gcap(4), "reina");
  ok(m0 !== null && Math.abs(m0 - 1.15) < 1e-3, "리더가 An 을 안 들면 조이너 레이나는 ×1.150 그대로", "실제 ×" + m0);
  // 다른 영웅의 An(카라 Mech Pet)도 같은 칸 "An" 이다 — 리더 카라가 있으면 조이너 레이나는 같은 step 경로로 깎인다.
  // (⑤ 는 14행만 그려서 gcap 17 에서는 레이나가 표 밖이라 화면으로는 못 본다 → 데이터·환산값으로 지킨다)
  const cara = E.byId.cara.exp.find(e => e.slot === "An");
  ok(!!cara && Math.abs(E.anVal(cara, r) - 0.15) < 1e-12, "카라 Mech Pet 도 An 칸 · 환산값 0.15 (레이나와 합연산)");
  // 추천 패널 배율도 칸 규칙으로 — 레이나 리더 60/40 에서 #rec 의 넷을 칸에 다 넣고 다시 잰 값과 같다
  {
    const a = boot("ko").leaders("ahmose", "reina", "lynn").mine([60, 40, 0]).gcap(4);
    const html = a.render();
    const st = html.indexOf('id="rec"');
    const ids = [...html.slice(st, html.indexOf("</b>", st)).matchAll(/img\/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]);
    const shown = +(html.slice(st, st + 1400).match(/배율 ×([\d.]+)/) || [0, 0])[1];
    const want = a.js(`(function(){
      const r=norm(60,40,0);const lead=["ahmose","reina","lynn"].map(i=>byId[i]);
      const buck={};ORDER.forEach(s=>{buck[s]=1;});
      const add=(sl,v)=>{if(buck[sl]!==undefined)buck[sl]+=v;};
      lead.forEach(h=>h.exp.forEach(e=>{if(e.slot==="ECO"||e.slot==="AH")return;
        if(e.slot==="X"){const bk=q=>{if(q.bk)add(q.bk,q.v*xShare(q,r));};bk(e);if(e.also&&e.also.slot==="X")bk(e.also);return;}
        add(e.slot,anVal(e,r));if(e.also)add(e.also.slot,eVal(e.also,r));}));
      const b=Object.assign({},buck);let x=1;const seen=[];
      ${JSON.stringify(ids)}.forEach(id=>{const e=byId[id].exp[0];const have=(id==="ahmose"||id==="reina"||id==="lynn"?1:0)+seen.filter(z=>z===id).length;seen.push(id);
        if(e.slot==="X"){const p=w=>{const sh=xShare(w,r);if(w.bk&&b[w.bk]!==undefined)b[w.bk]+=w.v*sh;else x*=nbAdd(w.v*sh,have);};p(e);if(e.also&&e.also.slot==="X")p(e.also);return;}
        if(e.slot==="AH"){x*=nbAdd(eVal(e,r),have);return;}
        const a1=e.slot==="An"?anVal(e,r):eAdd(e,r,have);if(b[e.slot]!==undefined)b[e.slot]+=a1;
        if(e.also&&b[e.slot]!==undefined&&b[e.also.slot]!==undefined){const b1=eAdd(e.also,r,have);b[e.also.slot]+=b1;x*=twoStat(a1,b1);}});
      return ORDER.reduce((a,sl)=>a*(b[sl]/buck[sl]),1)*x;})()`);
    ok(Math.abs(shown - +want.toFixed(3)) < 5e-4, "레이나 리더 60/40 추천 배율이 칸 검산과 같다", "화면 ×" + shown + " · 검산 ×" + want.toFixed(3));
    ok(ids.indexOf("reina") < 0 || shown < 2.65, "옛 동작(×2.696 · 레이나 재선택 과대)이 아니다", ids.join(",") + " ×" + shown);
    note("레이나 리더 60/40: " + ids.join(",") + " ×" + shown + " (수정 전 ×2.696)");
  }
}

section("리더 self-pick — 무포화 스킬도 자기끼리 합연산 (2026-09-14)");
{
  // 2026-09-14 검증에서 드러난 비대칭: 칸에 들어가는 스킬은 리더가 이미 채워 두면
  // 조이너의 한계가 줄어드는데(eAdd·bk), **칸이 아닌 스킬(bk 없는 X · AH)은 그렇지 않았다.**
  // 그래서 리더 레니가 자기를 조이너로 다시 집을 때 페널티가 0 이었다(60/40 ×1.690 · 손실 38.5%).
  // 같은 병리가 레니 2행 · 웨인 4행 · 고든 2행에 있었다.
  // 고친 방법은 새 가정이 아니다 — **같은 스킬 두 장은 칸을 몰라도 같은 자리**이므로
  // 이 프로젝트 1번 모델(같은 칸 합연산)을 자기 자신에게 적용한 것뿐이다(nbAdd).
  const val = (lead, r, g, id) => {
    const a = boot("ko").leaders(lead[0], lead[1], lead[2]).mine(r);
    a.el("gcap").value = String(g);
    const html = a.render();
    // ⑤ 순위표에서 그 영웅 행의 마지막 배율. 리더 표에도 초상이 나오므로
    // **× 가 들어 있는 행만** 본다(리더가 그 영웅인 케이스를 재기 때문에 중요하다).
    for (const part of html.split("<tr").filter(x => x.includes(id + ".webp"))) {
      const tr = ("<tr" + part).split("</tr>")[0];
      const m = [...tr.matchAll(/×([\d.]+)/g)];
      if (m.length) return +m[m.length - 1][1];
    }
    return null;
  };
  // [영웅, 계열, 리더로 쓴 편성, 안 쓴 편성, 병비, gcap]
  // 2026-11-10: 레니(EXTRA)·웨인(SKILL)·고든(EXTRA) S1 은 버킷 수치 모델이 없어 **배율에서 빠졌다** → 이 절의 대상이 아니다.
  // 지금 무포화 X 를 S1 으로 가진 조이너는 없지만 리더끼리는 남아 있으므로, 규칙 자체는 아래 원자 검사로 지킨다.
  const CASES = [
    ["flint",  "X(bk있음)", ["flint", "philly", "zinman"],   ["logan", "philly", "zinman"], [60, 40, 0], 2],
  ];
  for (const [id, kind, withL, without, r, g] of CASES) {
    const w = val(withL, r, g, id), o2 = val(without, r, g, id);
    ok(w !== null && o2 !== null && w < o2 - 1e-9,
       "리더가 이미 든 " + kind + " 스킬은 조이너로 다시 집을 때 깎인다 — " + id,
       "리더일 때 " + w + " · 아닐 때 " + o2);
  }
  const R6 = {inf: 60, lan: 40, mar: 0};
  ok(["renee", "wayne", "gordon"].every(id => E.atoms(E.byId[id].exp[0], R6).length === 0),
     "레니·웨인·고든 S1 은 배율 원자가 없다 (EXTRA·SKILL — 규칙 레이어로만 안내)");
  // 무포화 X 의 자기 겹침 — 같은 스킬 두 장은 1+2v (nbAdd 와 같은 규칙)
  const fx = {slot: "X", k: "dmg", v: .5, tgt: "lancer"}, one = E.atoms(fx, R6);
  const s1 = E.scoreAtoms(one).s, s2 = E.scoreAtoms(one.concat(one)).s, v = one[0].v;
  ok(Math.abs(s1 - (1 + v)) < 1e-12 && Math.abs(s2 - (1 + 2 * v)) < 1e-12, "무포화 X 두 장 = 1+2v (곱 (1+v)² 가 아니다)", s1 + " · " + s2);
  // nbAdd 항등식 — have=0 이면 예전과 같아야 한다(옛 동작을 포함한다는 증명)
  const nb = (v, h) => (1 + (h + 1) * v) / (1 + h * v);
  ok(Math.abs(nb(0.37, 0) - 1.37) < 1e-12, "nbAdd(v,0) === 1+v (리더가 없으면 예전 그대로)");
  ok(nb(0.37, 1) < nb(0.37, 0), "nbAdd 는 have 가 늘수록 줄어든다");
}

section("전투 배율 — bk 겹침 · pc 기대값");
{
  // 2026-09-12 에 comboAll 에서 잡은 버그 둘. 둘 다 "추천에 그 조합이 나온 적이 없어서"
  // 안 드러나 있었고, 시트 등재만이 기본이 되면서 한 화면에 같이 떴다.
  //   ① bk 가 붙은 X 조이너(노라)를 칸에 넣지 않고 리더 기준 배율을 그냥 곱했다
  //      → 제시·제셀이 같은 A칸에 들어가는데 겹침을 놓쳤다
  //   ② pc 가 붙은 조이너(미아)를 원값 0.25 로 더했다 → 3병종 기대값 0.4375 여야 한다
  // 이 조합(로건·필리·웨인 45/5/50)은 추천이 미아·노라·제시·제셀 로 나와 둘을 한꺼번에 밟는다.
  const a = boot("ko").leaders("logan", "philly", "wayne").mine([45, 5, 50]);
  a.el("gcap").value = "6";
  const html = a.render();
  const st = html.indexOf('id="rec"');
  const ids = [...html.slice(st, html.indexOf("</b>", st)).matchAll(/img\/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]);
  const shown = +(html.slice(st, st + 1400).match(/배율 ×([\d.]+)/) || [0, 0])[1];
  // 정확한 명단을 박지 않는다 — 고르는 방법을 바꾸면(2026-09-12 탐욕) 명단은 움직인다.
  // 이 검사가 필요로 하는 건 "bk X 한 명 + 그와 같은 칸에 들어가는 조이너 + pc 한 명"뿐이다.
  // ⚠️ 추천 구성에 기대지 않는다 — 고르는 규칙을 바꾸면 명단이 움직인다(2026-09-13 실제로 그랬다).
  // 검사할 것은 comboAll 의 산수이므로 **조합을 직접 지정**해서 옛 계산과 다른지만 본다.
  // 2026-10-17: 제시·제셀이 파괴력(E) 칸으로 옮겨 A칸 기여자가 노라 하나가 됐다 → 소냐(A .20)로 A칸 겹침을 다시 만든다.
  const FIX = ["mia", "norah", "sonya", "jessie"];
  ok(FIX.every(id => E.byId[id]), "고정 조합의 영웅이 전부 존재한다");
  ok(FIX.filter(id => { const e = E.byId[id].exp[0];
       return e.slot === "A" || e.bk === "A" || (e.also && e.also.bk === "A"); }).length >= 2,
     "고정 조합에 A칸 기여자가 둘 이상이다 (bk 겹침이 실제로 생긴다)", FIX.join(","));
  ok(FIX.some(id => E.byId[id].exp[0].pc), "고정 조합에 pc 조이너가 있다", FIX.join(","));
  // A칸에 기여하는 조이너가 둘 이상이어야 겹침이 실제로 생긴다.
  // 노라가 두 장(stack:1) 뽑혀도 둘 다 bk:"A" 라 성립한다 — 이름이 달라야 할 이유는 없다.


  const rr = E.norm(45, 5, 50);
  const mkBase = () => {
    const base = {};
    E.ORDER.forEach(sl => { base[sl] = 1; });
    for (const lid of ["logan", "philly", "wayne"])
      for (const e of E.byId[lid].exp) {
        if (e.slot === "ECO" || e.slot === "AH") continue;
        if (e.slot === "X") {
          const bk = w => { if (w.bk && base[w.bk] !== undefined) base[w.bk] += w.v * E.xShare(w, rr); };
          bk(e); if (e.also && e.also.slot === "X") bk(e.also);
          continue;
        }
        if (base[e.slot] !== undefined) base[e.slot] += E.eVal(e, rr);
        if (e.also && base[e.also.slot] !== undefined) base[e.also.slot] += E.eVal(e.also, rr);
      }
    return base;
  };
  // mode: "ok" = 지금 규칙 · "flatBk" = 옛 버그① · "rawPc" = 옛 버그②
  const combo = mode => {
    const base = mkBase(), b = Object.assign({}, base);
    let x = 1;
    for (const id of FIX) {
      const e = E.byId[id].exp[0];
      if (e.slot === "X") {
        if (mode === "flatBk") {                       // 옛 버그: 순위표 배율을 그냥 곱한다
          const m = new RegExp("heroes/" + E.byId[id].en.toLowerCase().replace(/ /g, "-") +
            "\\.webp[\\s\\S]*?×([\\d.]+)<div").exec(html);
          x *= m ? +m[1] : 1;
          continue;
        }
        const part = w => {
          const sh = E.xShare(w, rr);
          if (w.bk && b[w.bk] !== undefined) b[w.bk] += w.v * sh; else x *= 1 + w.v * sh;
        };
        part(e); if (e.also && e.also.slot === "X") part(e.also);
        continue;
      }
      // An · AH 는 칸이 아니라 계수다 — 예전에 이 둘을 빼먹어서
      // 레이나(An)가 추천에 들자 검산이 혼자 달라졌다.
      if (e.slot === "An") { b.An += e.v * E.NA_SHARE; continue; }   // 칸이다 (2026-09-14)
      if (e.slot === "AH") { x *= 1 + E.eVal(e, rr); continue; }
      const v = mode === "rawPc" ? e.v : E.eVal(e, rr);
      if (b[e.slot] !== undefined) b[e.slot] += v;
      if (e.also && b[e.also.slot] !== undefined) b[e.also.slot] += e.also.v;
      if (e.also && b[e.slot] !== undefined && b[e.also.slot] !== undefined) x *= E.twoStat(v, e.also.v);   // 두 칸 스킬은 합으로 (2026-10-10)
    }
    return E.ORDER.reduce((acc, sl) => acc * (b[sl] / base[sl]), 1) * x;
  };
  const good = combo("ok"), bad1 = combo("flatBk"), bad2 = combo("rawPc");
  // (화면 값과의 일치는 위 「조이너 추천 · T12 경고」 절이 본다. 여기서는 산수만.)
  ok(Math.abs(shown - +bad1.toFixed(3)) > 5e-4,
     "bk 를 칸에 안 넣는 옛 계산과는 다르다 (겹침을 놓치던 버그)",
     "옛 " + bad1.toFixed(3) + " vs 지금 " + good.toFixed(3));
  ok(Math.abs(shown - +bad2.toFixed(3)) > 5e-4,
     "pc 를 원값으로 더하던 옛 계산과는 다르다 (미아 0.25 → 0.4375)",
     "옛 " + bad2.toFixed(3) + " vs 지금 " + good.toFixed(3));
  note("이 조합 전투 배율 ×" + good.toFixed(3) + " (옛 bk 버그 ×" + bad1.toFixed(3) +
       " · 옛 pc 버그 ×" + bad2.toFixed(3) + ")");

  // 시트가 이 행에 적은 노라 3스택은 우리 모델에서 추천보다 낮다 — 남은 이견의 크기를 박아 둔다.
  const stack = (() => {
    const base = mkBase(), b = Object.assign({}, base);
    let x = 1;
    for (const id of ["norah", "norah", "norah", "patrick"]) {
      const e = E.byId[id].exp[0];
      if (e.slot === "X") {
        const part = w => {
          const sh = E.xShare(w, rr);
          if (w.bk && b[w.bk] !== undefined) b[w.bk] += w.v * sh; else x *= 1 + w.v * sh;
        };
        part(e); if (e.also && e.also.slot === "X") part(e.also);
        continue;
      }
      if (e.slot === "An") { b.An += e.v * E.NA_SHARE; continue; }   // 칸이다 (2026-09-14)
      if (e.slot === "AH") { x *= 1 + E.eVal(e, rr); continue; }
      if (b[e.slot] !== undefined) b[e.slot] += E.eVal(e, rr);
      if (e.also && b[e.also.slot] !== undefined) b[e.also.slot] += e.also.v;
      if (e.also && b[e.slot] !== undefined && b[e.also.slot] !== undefined) x *= E.twoStat(E.eVal(e, rr), e.also.v);   // 두 칸 스킬은 합으로 (2026-10-10)
    }
    return E.ORDER.reduce((acc, sl) => acc * (b[sl] / base[sl]), 1) * x;
  })();
  ok(good > stack, "우리 추천이 시트의 노라 3스택보다 높다 (우리 모델 기준)",
     "추천 " + good.toFixed(3) + " vs 노라×3+패트릭 " + stack.toFixed(3));
  note("노라 3스택 ×" + stack.toFixed(3) + " — 같은 영웅을 쌓으면 A·D 두 칸이 자기끼리 포화한다");
}

// ── N+6c. 리더로 쓴 영웅도 조이너로 들어올 수 있다 ─────────────────────
section("리더 중복 — 막지 않는다");
{
  // 2026-09-13 사용자 지적. 조이너는 **다른 연맹원**이 자기 영웅을 데려오는 것이라
  // 리더가 그 영웅을 쓰고 있어도 못 쓸 이유가 없다. 시트가 10개 행에서 그렇게 적는다.
  const comps = JSON.parse(run(CTX_KO, "JSON.stringify(SHEET_COMPS)"));
  let dupRows = 0;
  for (const c of comps) {
    const lead = c.l.reduce((a, x) => a.concat(x), []);
    if (c.j.some(cell => cell.some(id => lead.includes(id)))) dupRows++;
  }
  ok(dupRows >= 8, "시트 스스로 리더 영웅을 조이너 칸에 적는 행이 여럿이다", String(dupRows));
  note("시트에서 리더가 조이너 칸에도 나오는 행 " + dupRows + "개");

  // 리더 영웅이 배율만 높으면 실제로 추천에 들어야 한다. 로건·필리·진먼 60/40 의 필리가 그 자리다.
  {
    const a = boot("ko").leaders("logan", "philly", "zinman").mine([60, 40, 0]);
    a.el("gcap").value = "3";
    const html = a.render();
    const tb = /id="single"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/.exec(html)[1];
    const phil = tb.split("<tr").find(x => /heroes\/philly\.webp/.test(x));
    ok(phil && !/dead/.test(phil), "리더인 필리가 순위표에 정상 배율로 남아 있다");
    ok(phil && +(/×([\d.]+)<div/.exec(phil) || [0, 0])[1] > 1.001,
       "그 배율이 1.000 으로 죽지 않았다", phil && (/×([\d.]+)<div/.exec(phil) || [])[1]);
    ok(!/리더 중복 금지/.test(html), "‘리더 중복 금지’ 안내가 사라졌다 (근거 없는 가정이었다)");
    // 2026-09-13 배포본 브라우저 검증에서 발견. 제외는 걷어냈는데 ⑤ 추천 패널 캡션에
    // "리더와 겹치는 영웅은 자동 제외했습니다" 가 그대로 남아 화면이 거짓말을 하고 있었다.
    ok(!/자동 제외/.test(html) && !/excluded automatically/.test(boot("en")
         .leaders("logan", "philly", "zinman").mine([60, 40, 0]).render()),
       "추천 패널이 아직도 ‘자동 제외’ 라고 적지 않는다 (한/영 둘 다)");
  }

  // ⚠️ 그렇다고 미아를 두 번 세면 안 된다 — pc 는 시행만 늘어난다.
  // 볼트 §6: "2번째 미아의 기대 이득은 최대 +6.25%p".
  {
    const r3 = E.norm(48, 4, 48);
    const mia = E.byId["mia"].exp[0];
    const first = E.eAdd(mia, r3, 0), second = E.eAdd(mia, r3, 1);
    ok(Math.abs(first - 0.4375) < 1e-9, "미아 첫 장은 3병종 기대값 43.75%", (first * 100).toFixed(2) + "%");
    ok(second > 0 && second <= 0.0625,
       "미아 두 장째는 +6.25%p 이하다 (볼트 §6)", "+" + (second * 100).toFixed(2) + "%p");
    note("미아 1장 +" + (first * 100).toFixed(2) + "%p · 2장째 +" + (second * 100).toFixed(2) + "%p");
    // 화면에서도 그렇게 나와야 한다 — 미아가 리더인 행에서 조이너 미아는 상위권 밖
    const a = boot("ko").leaders("jeronimo", "mia", "bradley").mine([48, 4, 48]);
    a.el("gcap").value = "7";
    const html = a.render();
    const rows = [...html.matchAll(/<td>\d+<\/td><td class="b"><span class="hrow">[\s\S]*?heroes\/([a-z-]+)\.webp/g)]
      .map(m => m[1]);
    const at = rows.indexOf("mia");
    ok(at < 0 || at >= 4, "미아가 리더인 행에서 조이너 미아는 상위 4위 밖이다",
       at < 0 ? "14위권 밖" : (at + 1) + "위");
  }
  // 일반 스킬은 두 장째도 그냥 한 장 값이 더해진다 (합연산 → 칸에서 저절로 포화)
  {
    const r3 = E.norm(48, 4, 48);
    const jes = E.byId["jessie"].exp[0];
    ok(Math.abs(E.eAdd(jes, r3, 1) - jes.v) < 1e-12,
       "pc 가 없는 스킬은 두 장째도 같은 값이다 (칸에서 포화하므로 여기서 깎지 않는다)");
  }
}

// ── N+7. 시트 세대별 행과 조이너 순위 대조 ─────────────────────────────
section("시트 행 대조 (조이너 순위)");
{
  // 목적은 만점이 아니다 — 시트는 최적해가 아니라 보유 가능 목록이다(fixtures.mjs 주석 참고).
  // 모델을 건드렸을 때 시트와의 일치가 무너지지 않는지 보는 **하한선**이다.
  //
  // ⚠️ ⑤ 순위표를 긁지 말 것. 순위표는 **리더 중복 영웅까지 그대로 싣는다**(x.dup 행) —
  // 실제 추천은 그걸 빼고 고르는데 검사가 안 빼서 2026-09-12 까지 재현율이 낮게 찍혔다
  // (49행 기준 73.5% 로 나왔는데 추천 패널로 재면 같은 엔진이 81.5% 였다).
  // 화면에서 사람이 읽는 것도 추천 패널이므로 거기를 본다.
  // 2026-11-11: 계산 카드(#rec)는 시트 **행**을 아예 안 본다 — 예전의 "시트 우선" 스위치(SHEET_EDGE)는 없어졌다.
  // 그래서 여기서 재는 값이 곧 화면의 값이다. 시트 원문은 시트 카드(#sheet)가 따로 싣는다(아래 절).
  const recOf = row => {
    const a = boot("ko").leaders(row.lead[0] || "", row.lead[1] || "", row.lead[2] || "").mine(row.r);
    a.el("gcap").value = String(row.gen);
    const html = a.render();
    const after = html.slice(html.indexOf('id="rec"'));
    const b = /<p><b>([\s\S]*?)<\/b><\/p>/.exec(after);
    return b ? [...b[1].matchAll(/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]) : [];
  };
  let first = 0, anyP = 0, totP = 0, anyA = 0, totA = 0;
  const missed = [], missedRows = [];   // missedRows — 라벨이 같은 다른 행과 섞이지 않게 행 객체로도 든다
  for (const row of SHEET_ROWS) {
    const got = recOf(row);
    ok(got.length === 4, "추천 4명이 네 명이다 — G" + row.gen + " " + row.r.join("/"), got.join(","));
    if (row.top.some(x => got.includes(x))) first++; else { missed.push("G" + row.gen + " " + row.r.join("/")); missedRows.push(row); }
    for (const j of row.pri) { totP++; if (got.includes(j)) anyP++; }
    for (const j of row.all) { totA++; if (got.includes(j)) anyA++; }
  }
  const fp = first / SHEET_ROWS.length * 100, pp = anyP / totP * 100, ap = anyA / totA * 100;
  note("시트 #1 조이너가 추천 4명에 든 행 " + first + "/" + SHEET_ROWS.length + " (" + fp.toFixed(1) + "%)");
  note("시트 #1~#4 겹침 " + anyP + "/" + totP + " (" + pp.toFixed(1) + "%) · 대체 칸까지 " +
       anyA + "/" + totA + " (" + ap.toFixed(1) + "%)");
  // 하한선은 실측에서 여유를 두고 잡았다. 떨어지면 모델이 시트에서 멀어진 것이다.
  // ⚠️ 2026-11-10 하한 88 → 78. 버킷 엔진이 레니(EXTRA)·무명(버킷 미확정)을 **일부러** 배율에서 뺐다(사용자 결정 —
  // Ton 영상 버킷표에서 레니 S1 은 추가 피해, 무명 S1 은 미분류다). 시트 #1 이 레니인 행은 순수 계산이 구조적으로 못 맞힌다.
  // 그래서 그 행을 뺀 값을 따로 찍고, 거기에 옛 하한(88)을 건다 — 레니 말고 다른 데서 무너지면 여기서 걸린다.
  const RULE_ONLY = ["renee", "wuming"];
  const rowsX = SHEET_ROWS.filter(row => !row.top.some(x => RULE_ONLY.includes(x)));
  const missedX = missedRows.filter(row => rowsX.includes(row)).map(row => "G" + row.gen + " " + row.r.join("/") + " " + row.lead.join("+"));
  const fpx = (rowsX.length - missedX.length) / rowsX.length * 100;
  note("  └ 시트 #1 이 레니·무명(규칙 레이어)인 행 " + (SHEET_ROWS.length - rowsX.length) + "개를 빼면 " +
       (rowsX.length - missedX.length) + "/" + rowsX.length + " (" + fpx.toFixed(1) + "%) · 놓친 행: " + missed.join(", "));
  ok(fp >= 78, "시트 #1 조이너 재현이 78% 이상", fp.toFixed(1) + "% · 놓친 행: " + missed.slice(0, 4).join(", "));
  ok(fpx >= 88, "레니·무명 #1 행을 뺀 #1 재현이 88% 이상", fpx.toFixed(1) + "% · 놓친 행: " + missedX.join(", "));
  ok(pp >= 58, "시트 #1~#4 조이너 겹침이 58% 이상", pp.toFixed(1) + "%");

  // 화면 캡션이 이 수치를 문자열로 적어 두고 있다 — 엔진이 바뀌면 같이 틀어진다.
  // 실제로 리더 중복을 열자 겹침이 61.4→58.8% 로 내려갔는데 캡션이 61.4% 인 채로 배포됐다.
  {
    const r0 = SHEET_ROWS[0];
    const cap = boot("ko").leaders(r0.lead[0], r0.lead[1], r0.lead[2]).mine(r0.r).render();
    ok(cap.includes("#1 재현 " + fp.toFixed(1) + "% · 겹침 " + pp.toFixed(1) + "%"),
       "추천 패널 캡션의 재현율이 실측과 같다 (묵은 숫자가 아니다)",
       fp.toFixed(1) + "% / " + pp.toFixed(1) + "% · 캡션: " +
       (/#1 재현 [\d.]+% · 겹침 [\d.]+%/.exec(cap) || ["없음"])[0]);
    // 같은 문단의 나머지 두 숫자 — 대조한 행 수와 "레니 행을 빼면 N%". 2026-11-11 리뷰에서 97.9 를 바꿔도 통과하는 게 드러났다.
    ok(cap.includes("시트 " + SHEET_ROWS.length + "행과 대조") && cap.includes("그 행을 빼면 " + fpx.toFixed(1) + "% 입니다"),
       "같은 문단의 행 수와 '레니 행을 빼면 N%' 도 실측과 같다",
       SHEET_ROWS.length + "행 · " + fpx.toFixed(1) + "% · 캡션: " + (/시트 \d+행과 대조/.exec(cap) || ["없음"])[0] + " / " + (/그 행을 빼면 [\d.]+% 입니다/.exec(cap) || ["없음"])[0]);
    const capE = boot("en").leaders(r0.lead[0], r0.lead[1], r0.lead[2]).mine(r0.r).render();
    ok(capE.includes("all " + SHEET_ROWS.length + " sheet rows") && capE.includes("<b>" + fp.toFixed(1) + "%</b>") && capE.includes("<b>" + pp.toFixed(1) + "%</b>") &&
       capE.includes("Without those rows it is " + fpx.toFixed(1) + "%"), "영어 캡션의 숫자도 실측과 같다");
  }

  // 캡션은 **쌍**으로 적혀 있다 — "등재만 92.3%/59.2% vs 계산순위 84.6%/50.4%".
  // 위 검사는 앞 쌍만 봤다. 뒤 쌍(#recAll)이 묵으면 "이쪽이 낫다"는 비교 자체가 거짓이 된다.
  // 그리고 캡션은 "한 행도 나빠지지 않았습니다" 라고 단언한다 — 그건 측정이지 수사가 아니므로
  // 여기서 실제로 센다. 2026-09-13 레니 bk 변경 때 이 세 가지가 한꺼번에 틀어졌다.
  {
    const both = row => {
      const a = boot("ko").leaders(row.lead[0] || "", row.lead[1] || "", row.lead[2] || "").mine(row.r);
      a.el("gcap").value = String(row.gen);
      const html = a.render();
      const at = id => {
        const i = html.indexOf('id="' + id + '"');
        if (i < 0) return null;
        const b = /<p><b>([\s\S]*?)<\/b><\/p>/.exec(html.slice(i));
        return b ? [...b[1].matchAll(/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]) : null;
      };
      const rec = at("rec");
      return {rec, all: at("recAll") || rec};
    };
    let fa = 0, pa = 0, ta = 0, worseTop = [], worseOv = [];
    for (const row of SHEET_ROWS) {
      const {rec, all} = both(row);
      if (row.top.some(x => all.includes(x))) fa++;
      for (const j of row.pri) { ta++; if (all.includes(j)) pa++; }
      // 등재만이 계산순위보다 나쁜 행이 하나라도 있으면 캡션의 단언이 거짓이다
      if (!row.top.some(x => rec.includes(x)) && row.top.some(x => all.includes(x)))
        worseTop.push("G" + row.gen + " " + row.r.join("/"));
      const o1 = row.pri.filter(j => rec.includes(j)).length;
      const o2 = row.pri.filter(j => all.includes(j)).length;
      if (o1 < o2) worseOv.push("G" + row.gen + " " + row.r.join("/") + " (" + o1 + "<" + o2 + ")");
    }
    const fap = fa / SHEET_ROWS.length * 100, pap = pa / ta * 100;
    note("계산 순위 그대로(#recAll) #1 재현 " + fap.toFixed(1) + "% · 겹침 " + pap.toFixed(1) + "%");
    const r0 = SHEET_ROWS[0];
    const cap = boot("ko").leaders(r0.lead[0], r0.lead[1], r0.lead[2]).mine(r0.r).render();
    ok(cap.includes("(" + fap.toFixed(1) + "% · " + pap.toFixed(1) + "%)"),
       "캡션의 '계산 순위 그대로' 쌍도 실측과 같다",
       fap.toFixed(1) + "% / " + pap.toFixed(1) + "% · 캡션: " +
       (/계산 순위 그대로\([\d.]+% · [\d.]+%\)/.exec(cap) || ["없음"])[0]);
    ok(worseTop.length === 0 && worseOv.length === 0,
       "캡션의 '한 행도 나빠지지 않았습니다' 가 실제로 참이다",
       "#1 " + worseTop.join(", ") + " · 겹침 " + worseOv.join(", "));
  }

  // ── 넷을 고르는 방법: 포화를 보며 한 명씩 (2026-09-12) ──
  // 자르기(단독 상위 4명)보다 나빠지는 행이 하나도 없어야 한다. 하나라도 있으면
  // 탐욕이 뒤로 미루는 선택 때문이므로, 그때는 방법을 다시 봐야 한다.
  let gWin = 0, gLose = 0;
  for (const row of SHEET_ROWS) {
    const a = boot("ko").leaders(row.lead[0] || "", row.lead[1] || "", row.lead[2] || "").mine(row.r);
    a.el("gcap").value = String(row.gen);
    const html = a.render();
    const after = html.slice(html.indexOf('id="rec"'));
    const shown = +(/전투 배율 ×([\d.]+)/.exec(after) || [0, 0])[1];
    // 같은 후보 풀에서 "단독 배율 상위 4명"을 잘라 같은 방식으로 재면 얼마인가
    const cut = a.js(`(function(){
      const r=norm(+document.getElementById("r1").value,+document.getElementById("r2").value,+document.getElementById("r3").value);
      const lead=["hInf","hLan","hMar"].map(i=>byId[document.getElementById(i).value]).filter(Boolean);
      const lid=new Set(lead.map(h=>h.id));
      const buck={};ORDER.forEach(s=>{buck[s]=1;});
      lead.forEach(h=>h.exp.forEach(e=>{
        if(e.slot==="ECO"||e.slot==="AH")return;
        const add=(sl,v)=>{if(buck[sl]!==undefined)buck[sl]+=v;};
        if(e.slot==="X"){const bk=q=>{if(q.bk)add(q.bk,q.v*xShare(q,r));};
          bk(e);if(e.also&&e.also.slot==="X")bk(e.also);return;}
        add(e.slot,anVal(e,r));if(e.also)add(e.also.slot,eVal(e.also,r));}));
      const one=id=>{const e=byId[id].exp[0];
        if(e.slot==="X"){const p=w=>{const sh=xShare(w,r);
            return w.bk&&buck[w.bk]!==undefined?(buck[w.bk]+w.v*sh)/buck[w.bk]:1+w.v*sh;};
          return p(e)*(e.also&&e.also.slot==="X"?p(e.also):1);}
        if(e.slot==="An")return (buck.An+e.v*NA_SHARE)/buck.An;
        if(e.slot==="AH")return 1+eVal(e,r);
        let m=1;const st=(sl,v)=>{const b=buck[sl];if(b!==undefined)m*=(b+v)/b;};
        st(e.slot,eVal(e,r)); if(e.also){st(e.also.slot,e.also.v);
          if(buck[e.slot]!==undefined&&buck[e.also.slot]!==undefined)m*=twoStat(eVal(e,r),e.also.v);} return m;};
      const combo=ids=>{const b=Object.assign({},buck);let x=1;
        const put=(sl,v)=>{if(b[sl]!==undefined)b[sl]+=v;};
        ids.forEach(id=>{const e=byId[id].exp[0];
          if(e.slot==="X"){const p=w=>{const sh=xShare(w,r);
              if(w.bk&&b[w.bk]!==undefined)put(w.bk,w.v*sh); else x*=1+w.v*sh;};
            p(e); if(e.also&&e.also.slot==="X")p(e.also); return;}
          if(e.slot==="An"){put("An",e.v*NA_SHARE);return;}
          if(e.slot==="AH"){x*=1+eVal(e,r);return;}
          put(e.slot,eVal(e,r)); if(e.also){put(e.also.slot,e.also.v);
            if(b[e.slot]!==undefined&&b[e.also.slot]!==undefined)x*=twoStat(eVal(e,r),e.also.v);}});
        return ORDER.reduce((a,sl)=>a*(b[sl]/buck[sl]),1)*x;};
      const gcap=+document.getElementById("gcap").value||99;
      const pool=HEROES.filter(h=>h.gen<=gcap&&h.s&&!lid.has(h.id)&&h.exp[0]&&h.exp[0].slot!=="ECO")
        .filter(h=>one(h.id)>1.001);
      pool.sort((p,q)=>one(q.id)-one(p.id));
      return combo(pool.slice(0,4).map(h=>h.id));
    })()`);
    if (shown > cut + 1e-3) gWin++; else if (shown < cut - 1e-3) gLose++;
  }
  note("포화를 보며 고르기가 자르기보다 높은 행 " + gWin + "/" + SHEET_ROWS.length + " · 낮은 행 " + gLose);
  ok(gLose === 0, "자르기보다 낮아지는 행이 없다", String(gLose));
  ok(gWin >= 15, "자르기보다 실제로 높아지는 행이 충분히 많다", String(gWin));
}

// ── N+8. 시트 원문 카드 · 계산 카드 (2026-11-11 개편) ─────────────────────
section("시트 원문 카드 · 계산 카드");
{
  // 사용자 결정(2026-11-11): 시트 원문과 계산을 **섞지 않는다.**
  //   📋 #sheet  — Ton 시트 행 그대로(기본 4칸 · Alternative · 비고). 답이 둘이면 둘 다.
  //   🧮 #rec    — 시트 조이너 명단(s:1) 안에서의 계산.   🧮 #recAll — 전체 영웅 계산.
  // 예전의 "시트 칸 우선 + 셋째 장부터 교체" 혼합 추천(SHEET_EDGE · 🔀 · 📐)은 없다. 여기서 지키는 것은
  //   ① 시트 카드가 시트 행을 한 칸도 안 바꾸고 싣는가        ② 계산 카드가 시트 **행**의 영향을 전혀 안 받는가
  //   ③ 계산이 시트 칸에 얼마나 떨어지는가(하한선 · 진짜 일치) ④ 시트에 없는 편성에서 시트 카드가 그렇게 말하는가
  const ids = s => [...s.matchAll(/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]);
  const strip = s => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  const page = (lead, r, g, lang) => {
    const a = boot(lang || "ko").leaders(lead[0] || "", lead[1] || "", lead[2] || "").mine(r);
    a.el("gcap").value = String(g);
    return a;
  };
  const view = html => {
    const cut = id => { const i = html.indexOf('id="' + id + '"'); return i < 0 ? null : html.slice(i); };
    const four = s => { const b = /<p><b>([\s\S]*?)<\/b><\/p>/.exec(s); return b ? ids(b[1]) : []; };
    const mult = s => +(/전투 배율 ×([\d.]+)/.exec(s) || [0, 0])[1];
    const sheet = (cut("sheet") || "").split('class="jcol"')[0];
    // 시트 카드의 행 블록 — 칩 단위로 읽는다(칸 하나 = 칩 하나)
    const blocks = sheet.split('<div class="srow">').slice(1).map(b => {
      // sx — 그 칩 끝에 작은 글씨로 실린 시트 원문 표기(Jessie* 등). 없으면 null. text 는 그 표기를 뺀 본문이다.
      const chips = k => { const m = new RegExp('data-k="' + k + '">([\\s\\S]*?)</div>').exec(b); if (!m) return null;
        return m[1].split('<span class="hc').slice(1).map(c => ({ids: ids(c), sx: (/<i class="raw">([^<]*)<\/i>/.exec(c) || [0, null])[1],
          text: strip(c.replace(/^[^>]*>/, "").replace(/<i class="raw">[^<]*<\/i>/, ""))})); };
      return {main: (chips("main") || []).filter(c => c.ids.length), alt: chips("alt"), v: mult(b), raw: b, text: strip(b)};
    });
    const rec = cut("rec"), all = cut("recAll");
    // cmpRows — 🔍 비교는 걸린 시트 행마다 한 덩어리다(답이 둘이면 둘)
    return {html, sheet, sheetText: strip(sheet), blocks, rec: four(rec), recV: mult(rec),
            all: all ? four(all) : null, allV: all ? mult(all) : 0, cmp: cut("cmp") ? strip(cut("cmp").split("</div>")[0]) : null,
            cmpRows: cut("cmp") ? cut("cmp").split('<div class="cmprow">').slice(1).map(s => strip(s.split("</div>")[0])) : []};
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const comps = JSON.parse(run(CTX_KO, "JSON.stringify(SHEET_COMPS)"));
  const HNko = id => E.byId[id].kr;

  // ── 데이터: 시트 원문 필드 ──
  ok(comps.length === 60, "SHEET_COMPS 는 시트 편성 행 60개다", String(comps.length));
  ok(comps.every(c => typeof c.lb === "string" && /\d+\/\d+/.test(c.lb)), "60행 전부 시트 행 라벨(lb)을 갖고 있다");
  ok(comps.every(c => (c.meta ? 1 : 0) === (/META/.test(c.lb) ? 1 : 0)), "meta:1 == 라벨에 META 가 적힌 행");
  ok(comps.filter(c => c.meta).length === 5, "시트 라벨이 META 인 행은 5개다", String(comps.filter(c => c.meta).length));
  {
    const bad = comps.filter(c => c.ao && !(same(c.ao.filter(a => typeof a === "number"), (c.alt || []).map((_, i) => i)) &&
      c.ao.every(a => typeof a === "number" || (typeof a === "string" && a.length > 0))));
    ok(bad.length === 0, "ao(대안 칸의 시트 순서)가 alt 인덱스를 빠짐없이 순서대로 싣는다", bad.map(c => c.lb).join(" | "));
    const free = comps.flatMap(c => (c.ao || []).filter(a => typeof a === "string"));
    note("자유 문구 대안 칸 " + free.length + "개: " + [...new Set(free)].join(" · ") + " · 비고가 있는 행 " + comps.filter(c => c.c).length);
    ok(free.length === 30, "시트의 자유 문구 대안 칸(or 25% · 20% ones) 30개를 원문 그대로 실었다", String(free.length));
    const noKo = comps.filter(c => c.c && !run(CTX_KO, "SHEET_NOTE_KO[" + JSON.stringify(c.c) + "]"));
    ok(noKo.length === 0, "비고(c)마다 한국어 옮김이 있다", noKo.map(c => c.c).join(" | "));
    const withAlt = comps.filter(c => c.alt && c.alt.length);
    ok(withAlt.length >= 45, "시트의 Alternative 칸이 실려 있다", withAlt.length + "행");
    const badId = [];
    comps.forEach(c => (c.alt || []).forEach(cell => cell.forEach(id => { if (!E.byId[id]) badId.push(c.g + ":" + id); })));
    ok(badId.length === 0 && comps.every(c => !c.alt || c.alt.every(cell => cell.length > 0)), "alt 의 영웅 id 가 전부 실재하고 빈 칸이 없다", badId.join(", "));
  }

  // ── 데이터 == 시트 원문 (2026-11-11 리뷰) ──
  // 위 검사들은 SHEET_COMPS 가 **자기 자신과** 맞는지만 본다. 아래 ① 도 화면을 SHEET_COMPS 와 대조하므로, 데이터가 시트와 다르면
  // 둘 다 통과한다. 여기가 **시트 원문과** 맞는지 보는 자리다 — 정답지는 data.xlsx 의 TSV 사본에서 자동 생성한 fixtures-sheet.mjs.
  // (예전에는 이 대조가 tools/sim/01-xlsx-diff.mjs 에만 있어서 커밋 전 검사 밖이었다.)
  const FREE = /^or 25%|^20% ones/i;                                                          // 영웅 이름이 아닌 자유 문구
  const LEGEND = ["Jessie*", "Sergey**"];                                                     // 시트 범례가 정의한 표기
  const spread = raw => /\*/.test(raw) || raw.split("/").length !== SHEET_TOKENS[raw].length;   // 이름 하나가 여러 영웅으로 펴진 칸
  {
    ok(SHEET_RAW.length === comps.length, "시트 원문 정답지도 60행이다", SHEET_RAW.length + " vs " + comps.length);
    ok(SHEET_RAW.every(r => r.j.every(Boolean) && r.alt.every(Boolean)), "시트의 빈칸은 행 끝에만 있다 (가운데가 비면 칸 번호가 밀린다)");
    const bad = [];
    SHEET_RAW.forEach((raw, k) => {
      const c = comps[k], tag = "G" + raw.g + " " + raw.lb, miss = [];
      if (!c) { bad.push(tag + " → 행 없음"); return; }
      if (c.g !== raw.g) miss.push("g");
      if (c.lb !== raw.lb) miss.push("lb");
      if ((c.c || "") !== raw.c) miss.push("c");
      if (!same(c.rs, SHEET_RATIOS[raw.lb])) miss.push("rs");
      if (!same(c.l, raw.l.split(/[&,]/).map(s => SHEET_TOKENS[s.trim()]))) miss.push("l");
      if (!same(c.j, raw.j.map(s => SHEET_TOKENS[s]))) miss.push("j");
      const jx = {}; raw.j.forEach((s, i) => { if (s && spread(s)) jx[i] = s; });
      if (!same(c.jx || {}, jx)) miss.push("jx");
      // 대안 칸 — 영웅 칸은 alt, 자유 문구는 ao 에 원문 그대로, 순서는 시트 순서
      if (!same(c.alt || [], raw.alt.filter(s => !FREE.test(s)).map(s => SHEET_TOKENS[s]))) miss.push("alt");
      let ai = 0; const seq = raw.alt.map(s => FREE.test(s) ? s : ai++);
      if (!same(c.ao || (c.alt || []).map((_, i) => i), seq)) miss.push("ao");
      if (!!c.ao !== raw.alt.some(s => FREE.test(s))) miss.push("ao 유무");
      const ax = {}; ai = 0; raw.alt.forEach(s => { if (!s || FREE.test(s)) return; if (spread(s)) ax[ai] = s; ai++; });
      if (!same(c.ax || {}, ax)) miss.push("ax");
      if (miss.length) bad.push(tag + " → " + miss.join(","));
    });
    ok(bad.length === 0, "SHEET_COMPS 60행이 시트 원문과 한 행씩 같다 (라벨 · 리더 · 병비 · 조이너 칸 · 원문 표기 · 대안 순서 · 비고)", bad.slice(0, 5).join(" | "));
    const cnt = {}; comps.forEach(c => [c.jx, c.ax].forEach(o => Object.values(o || {}).forEach(s => { cnt[s] = (cnt[s] || 0) + 1; })));
    note("이름을 펴서 실은 칸의 시트 원문 표기: " + Object.keys(cnt).sort().map(k => k + " ×" + cnt[k]).join(" · "));
    ok(Object.keys(cnt).filter(k => !LEGEND.includes(k)).sort().join() === "Jessie,Jessie**,Jessies",
       "범례에 없는 표기는 아는 셋(별표 없는 Jessie · Jessie** · Jessies)뿐이다 — 새 표기가 생기면 어떻게 읽을지부터 정할 것", Object.keys(cnt).join(" · "));

    // 시트 머리말 — SHEET_TIPS 의 원문은 시트에 실제로 있는 줄이어야 하고, 지침·범례를 빠뜨리지 않아야 한다
    const tips = JSON.parse(run(CTX_KO, "JSON.stringify(SHEET_TIPS)"));
    const notHead = tips.filter(t => !SHEET_HEAD.includes(t[0])).map(t => t[0].slice(0, 50));
    ok(notHead.length === 0, "SHEET_TIPS 의 원문이 전부 시트 머리말에 실제로 있는 줄이다 (합치거나 고쳐 쓰지 않았다)", notHead.join(" | "));
    // 머리말에 있는데 안 실은 줄은 아는 셋뿐이어야 한다: 링크 화살표("<") · 제목("Legend") · 같은 범례의 짧은 표기(표 아래 것이 더 완전하다)
    const SKIP = ["<", "Legend", "*Jessie = Jasser or Jeronimo"];
    const left = SHEET_HEAD.filter(h => !tips.some(t => t[0] === h) && !SKIP.includes(h));
    ok(left.length === 0 && tips.length === SHEET_HEAD.length - SKIP.length, "시트 머리말의 지침·범례를 빠짐없이 실었다", tips.length + "항목 · 빠진 줄: " + left.join(" | "));
    ok(tips.every(t => t[1] && /[가-힣]/.test(t[1])), "머리말 항목마다 한국어 옮김이 있다");
    ok(/8명/.test((tips.find(t => /^T12/.test(t[0])) || [0, ""])[1]), "T12 지침 옮김이 '최대 8명' 조건을 빠뜨리지 않는다");
    // 비고 옮김 — 원문이 밝히지 않은 것을 단정하지 않는다
    const ko = k => run(CTX_KO, "SHEET_NOTE_KO[" + JSON.stringify(k) + "]") || "";
    ok(!/무명의 스킬|상대의 스킬/.test(ko("Wu Ming to counter his skills damages")) && !/편성/.test(ko("Little skills damage, Reina is okay")),
       "비고 옮김이 'his' 가 누구인지 · 누구의 스킬 데미지가 적은지를 지어내지 않는다");
    // 원문이 쉼표로만 이은 두 구를 인과로 잇지 않고, 뜻이 불분명한 문장에 조건("~일 때")을 지어내지 않는다 (2026-11-11 독립 검증)
    ok(!/적어|때문|이라서|므로/.test(ko("Little skills damage, Reina is okay")), "'Little skills damage, Reina is okay' 를 인과로 옮기지 않는다", ko("Little skills damage, Reina is okay"));
    { const k = "No Patrick as Eleonora has Health already. *Reina is no Rufus but Xura";
      ok(!/일 때|이면|경우/.test(ko(k)) && /원문/.test(ko(k)), "'*Reina is no Rufus but Xura' 에 조건을 지어내지 않고 원문을 보라고 적는다", ko(k)); }
  }

  // ── ① 시트 카드는 시트 행을 한 칸도 안 바꾼다 — 60행 전수(행마다 첫 리더·첫 병비) ──
  // 칸 순서 · 칸 안의 이름 · 대안 칸의 순서(자유 문구 포함) · 비고가 SHEET_COMPS 와 같아야 한다.
  // 쌍둥이 행(칸이 같은 두 행)은 블록 하나로 접히므로 "어느 블록이든 이 행과 같다" 로 본다.
  {
    const bad = [], badV = [], badRaw = [], badName = [];
    let multi = 0;
    for (const c of comps) {
      const lead = c.l.map(x => x[0] || "");
      const a = page(lead, c.rs[0], c.g);
      a.js("globalThis.__r0=render;render=function(d){globalThis.__d=d;return __r0(d);}");
      const v = view(a.render());
      const seq = c.ao || (c.alt || []).map((_, i) => i);
      const hit = v.blocks.find(b => same(b.main.map(x => x.ids), c.j) &&
        same((b.alt || []).map(x => x.ids.length ? x.ids : x.text), seq.map(x => typeof x === "number" ? c.alt[x] : x)) &&
        (!c.c || b.text.includes(run(CTX_KO, "SHEET_NOTE_KO[" + JSON.stringify(c.c) + "]")) && b.text.includes(c.c)));
      if (!hit) { bad.push("G" + c.g + " " + c.lb); continue; }
      // 그 블록의 배율 = 그 칸들을 우리 공식(scoreAtoms)에 넣은 값. 칸에 이름이 여럿이면 그중 어느 조합의 값이어야 한다.
      const cand = JSON.parse(a.js("(function(){const d=__d,z=id=>d.rank.find(q=>q.h.id===id);" +
        "const f=l=>scoreAtoms(d.base.concat.apply(d.base,l.map(id=>z(id).at))).s/d.s0;" +
        "let sets=[[]];" + JSON.stringify(c.j) + ".forEach(cell=>{const n=[];sets.forEach(s=>cell.forEach(id=>n.push(s.concat([id]))));sets=n;});" +
        "return JSON.stringify(sets.map(f));})()"));
      if (!cand.some(x => x.toFixed(3) === hit.v.toFixed(3))) badV.push("G" + c.g + " " + c.lb + " 화면 ×" + hit.v + " vs " + cand.map(x => x.toFixed(3)).join("/"));
      // 이름을 펴서 실은 칸에는 **시트 원문 표기**가 같이 실려야 한다 — 칸 자리도 글자도 jx · ax 그대로.
      const tag = "G" + c.g + " " + c.lb;
      const wantJ = c.j.map((_, i) => (c.jx || {})[i] || null), wantA = seq.map(x => typeof x === "number" ? (c.ax || {})[x] || null : null);
      if (!same(hit.main.map(x => x.sx), wantJ) || !same((hit.alt || []).map(x => x.sx), wantA)) badRaw.push(tag + " 칩 표기");
      const all = wantJ.concat(wantA).filter(Boolean), ours = all.filter(s => !LEGEND.includes(s));
      const rn = strip((/data-k="raw">([\s\S]*?)<\/p>/.exec(hit.raw) || [0, ""])[1]);
      // 표기가 있으면 설명 문단이 있고, 범례에 없는 표기(별표 없는 Jessie 등)는 "우리 해석" 이라고 밝힌다. 범례 표기뿐이면 그 말을 붙이지 않는다.
      if (!!all.length !== !!rn || (all.length && !all.every(s => rn.includes(s))) || (ours.length > 0) !== /우리 해석/.test(rn)) badRaw.push(tag + " 설명 문단");
      // 이름이 여럿인 칸 — "배율은 X 기준" 의 X 가 실제로 그 칸의 이름이고, X 로 잰 값이 화면 배율이어야 한다
      if (c.j.some(cell => cell.length > 1)) {
        multi++;
        const named = ((/배율은 <b>([^<]*)<\/b> 기준/.exec(hit.raw) || [0, ""])[1]).split("·").filter(Boolean);
        const picked = c.j.map(cell => cell.length === 1 ? cell[0] : cell.find(id => named.includes(HNko(id))));
        if (picked.some(x => !x)) badName.push(tag + " 안내 이름 [" + named.join(",") + "]");
        else {
          const val = a.js("(function(){const d=__d,z=id=>d.rank.find(q=>q.h.id===id);return scoreAtoms(d.base.concat.apply(d.base," + JSON.stringify(picked) + ".map(id=>z(id).at))).s/d.s0;})()");
          if (val.toFixed(3) !== hit.v.toFixed(3)) badName.push(tag + " [" + named.join(",") + "] 로 재면 ×" + val.toFixed(3) + " ≠ 화면 ×" + hit.v);
        }
      }
    }
    ok(bad.length === 0, "시트 카드가 60행 전부를 칸·대안·비고 그대로 싣는다", bad.slice(0, 4).join(" | "));
    ok(badV.length === 0, "시트 카드의 전투 배율이 그 칸들을 공식에 넣은 값과 같다 (" + multi + "행은 이름이 여럿인 칸)", badV.slice(0, 3).join(" | "));
    ok(badRaw.length === 0, "이름을 펴서 실은 칸마다 시트 원문 표기가 같이 실리고, 범례에 없는 표기는 우리 해석이라고 밝힌다", badRaw.slice(0, 4).join(" | "));
    ok(badName.length === 0, "'배율은 X 기준' 의 X 가 그 칸의 이름이고, X 로 잰 값이 화면 배율과 같다", badName.slice(0, 3).join(" | "));
  }

  // 모든 SHEET_ROWS 가 SHEET_COMPS 에서 찾아져야 한다 — 안 되면 두 표가 어긋난 것이다
  {
    let matched = 0;
    for (const row of SHEET_ROWS)
      if (page(row.lead, row.r, row.gen).js("!!matchComp(" + JSON.stringify(row.lead) + ",norm(" + row.r.join(",") + ")," + row.gen + ")")) matched++;
    ok(matched === SHEET_ROWS.length, "SHEET_ROWS 가 전부 SHEET_COMPS 에서 찾아진다 (두 표가 어긋나지 않았다)", matched + "/" + SHEET_ROWS.length);
  }

  // ── ②③ 계산 카드 — 시트 행을 안 보는가 · 시트 칸에 얼마나 떨어지는가 ──
  // 픽 4명을 칸 4개에 **최대로** 배정한다(한 명은 한 칸만).
  const maxFill = (picks, cells) => {
    let best = 0;
    const go = (used, i, n) => {
      if (n + (picks.length - i) <= best) return;
      if (i === picks.length) { if (n > best) best = n; return; }
      for (let k = 0; k < cells.length; k++)
        if (!used[k] && cells[k].includes(picks[i])) { used[k] = 1; go(used, i + 1, n + 1); used[k] = 0; }
      go(used, i + 1, n);
    };
    go(cells.map(() => 0), 0, 0);
    return best;
  };
  {
    let cellHit0 = 0, cellHitAll = 0, cellTot = 0, leak = [], badStack = [], nor2 = 0, nor3 = 0, lower = [], allLower = [], cmpBad = [];
    let fairN = 0, fairSum = 0, fairMax = 0, unfair = 0;
    for (const row of SHEET_ROWS) {
      const tag = "G" + row.gen + " " + row.r.join("/") + " " + row.lead.join("+");
      const a = page(row.lead, row.r, row.gen), v = view(a.render());
      const c = JSON.parse(a.js("JSON.stringify(matchComp(" + JSON.stringify(row.lead) + ",norm(" + row.r.join(",") + ")," + row.gen + "))"));
      // ② 걸리는 시트 행의 조이너 칸·대안을 엉뚱한 값으로 바꿔도 계산 카드는 그대로여야 한다.
      //    (동률 타이브레이크의 근처 세대 빈도는 걸리는 행을 빼고 세므로, 이 행들만 바꾸면 계산에는 영향이 없어야 한다)
      const b = page(row.lead, row.r, row.gen);
      b.js("matchComps(" + JSON.stringify(row.lead) + ",norm(" + row.r.join(",") + ")," + row.gen + ").forEach(c=>{c.j=[['sergey'],['sergey'],['sergey'],['sergey']];c.alt=[['bahiti']];delete c.ao;})");
      const w = view(b.render());
      if (!same(v.rec, w.rec) || !same(v.all, w.all)) leak.push(tag);
      ok(v.rec.length === 4, "계산 추천이 네 명이다 — " + tag, v.rec.join(","));
      const all = v.all || v.rec;
      if (c) { cellHit0 += maxFill(v.rec, c.j); cellHitAll += maxFill(all, c.j); cellTot += c.j.length; }
      // 중복은 stack:1 영웅만
      for (const list of [v.rec, all]) { const cnt = {}; list.forEach(i => { cnt[i] = (cnt[i] || 0) + 1; });
        for (const id of Object.keys(cnt)) if (cnt[id] >= 2 && !E.byId[id].stack) badStack.push(tag + " " + id + "×" + cnt[id]); }
      const nn = v.rec.filter(x => x === "norah").length; if (nn >= 2) nor2++; if (nn >= 3) nor3++;
      // 전체 풀은 시트 등재 풀을 포함한다 → 배율이 낮을 수 없다
      if (v.all && v.allV < v.recV - 5e-4) allLower.push(tag + " " + v.allV + "<" + v.recV);
      // 시트 조합 vs 계산 추천 — 시트 조합은 계산이 고를 수 있는 범위 안에 있다(시트 등재 영웅 · 중복은 시트가 겹쳐 쓴 영웅뿐)
      const sv = v.blocks[0] ? v.blocks[0].v : 0, got = v.blocks[0] ? v.blocks[0].main.length : 0;
      const unsc = v.blocks[0] && /data-k="unscored"/.test(v.blocks[0].raw);
      if (sv && got === 4 && !unsc) { const d = (v.recV / sv - 1) * 100; fairN++; fairSum += d; if (d > fairMax) fairMax = d; if (v.recV < sv - 5e-4) lower.push(tag + " 계산 ×" + v.recV + " < 시트 ×" + sv); }
      else unfair++;
      // 🔍 비교 문단의 숫자가 두 카드와 같아야 한다
      if (c) {
        const m = /(\d)칸 중 (\d)칸/.exec(v.cmp || "");
        if (!m || +m[1] !== c.j.length || +m[2] !== maxFill(v.rec, c.j) || !v.cmp.includes("×" + sv.toFixed(3)) || !v.cmp.includes("×" + v.recV.toFixed(3)) ||
            (/그대로 비교할 수 없습니다/.test(v.cmp) !== !(got === 4 && !unsc)) || v.cmpRows.length !== v.blocks.length) cmpBad.push(tag);
      }
    }
    ok(leak.length === 0, "걸리는 시트 행의 칸을 바꿔도 계산 카드(#rec · #recAll)는 그대로다 — 시트 행을 안 본다", leak.slice(0, 3).join(" | "));
    note("계산이 시트 칸에 떨어지는 비율 — 시트 등재 풀 " + cellHit0 + "/" + cellTot + " (" + (cellHit0 / cellTot * 100).toFixed(1) + "%) · 전체 풀 " +
         cellHitAll + "/" + cellTot + " (" + (cellHitAll / cellTot * 100).toFixed(1) + "%)");
    // 진짜 하한선. 순수 모델이 시트에서 멀어지면 여기가 먼저 내려간다. 실측에서 여유를 두고 잡았다.
    // ⚠️ 0.60 은 너무 느슨했다 — 회귀 6종을 심어 보니 1종만 걸렸다(2026-09-14 검증). 2026-10-10 에 0.68 로 올렸다.
    ok(cellHit0 / cellTot >= 0.68, "시트 등재 풀 안의 계산이 시트 칸의 68% 이상에 떨어진다", (cellHit0 / cellTot * 100).toFixed(1) + "%");
    // ⚠️ 위 지표는 `#rec` 을 읽으므로 **bk 계열 회귀를 구조적으로 못 잡는다** — 플린트 같은 시트 미등재 영웅이 밀려들어도
    // `poolS` 밖이라 안 보이기 때문이다. 그래서 전체 풀도 같이 잰다.
    ok(cellHitAll / cellTot >= 0.50, "전체 풀 계산도 시트 칸의 50% 이상에 떨어진다", (cellHitAll / cellTot * 100).toFixed(1) + "%");
    ok(badStack.length === 0, "stack:1 이 없는 영웅은 계산에서 중복으로 뽑히지 않는다", badStack.slice(0, 3).join(", "));
    note("계산 추천에 노라 2장 이상 " + nor2 + "행 · 3장 이상 " + nor3 + "행");
    ok(nor2 >= 3, "노라 둘째 장이 계산에서도 실제로 뽑히는 행이 있다 (stack 허용이 죽어 있지 않다)", String(nor2));
    ok(allLower.length === 0, "전체 영웅 계산이 시트 등재만보다 낮은 행이 없다", allLower.slice(0, 3).join(" | "));
    note("비교 가능한 " + fairN + "행(시트 4칸이 다 채워지고 전부 점수에 드는 행)에서 계산 추천이 시트 조합보다 평균 +" +
         (fairSum / fairN).toFixed(2) + "% · 최대 +" + fairMax.toFixed(1) + "% · 비교 불가 " + unfair + "행(레니·무명 · 빈칸)");
    ok(lower.length === 0, "우리 공식으로 재면 계산 추천이 시트 조합보다 낮은 행이 없다 (같은 풀 · 같은 공식)", lower.slice(0, 3).join(" | "));
    ok(cmpBad.length === 0, "🔍 비교 문단의 칸 수·배율이 두 카드와 같고, 비교 불가인 행은 그렇게 적는다", cmpBad.slice(0, 4).join(" | "));
  }
  // 시트가 겹쳐 쓰는 영웅 == stack:1 — 명단을 기억으로 박지 않고 SHEET_COMPS 에서 기계적으로 센다.
  // 2026-09-13 까지 "노라 하나뿐"이라고 적어 뒀는데 Gen 1 두 행의 패트릭을 놓치고 있었다(사용자가 잡았다).
  {
    const repeated = new Set();
    for (const c of comps) {
      const seen = {};
      c.j.forEach(cell => { const k = cell.join("/"); seen[k] = (seen[k] || 0) + 1; });
      for (const k of Object.keys(seen)) if (seen[k] >= 2 && k.indexOf("/") < 0) repeated.add(k);
    }
    const flagged = new Set(E.HEROES.filter(h => h.stack).map(h => h.id));
    const missing = [...repeated].filter(x => !flagged.has(x)), extra = [...flagged].filter(x => !repeated.has(x));
    ok(missing.length === 0 && extra.length === 0, "stack:1 이 붙은 영웅 == 시트가 한 행에서 겹쳐 쓴 영웅",
       (missing.length ? "빠짐: " + missing.join(",") : "") + (extra.length ? " 잉여: " + extra.join(",") : ""));
    note("시트가 겹쳐 쓰는 영웅: " + [...repeated].map(x => E.byId[x].kr).join(" · "));
  }

  // ── ④ 시트에 없는 편성 · 세대 · 병비 ──
  {
    const odd = page(["flint", "mia", "bradley"], [33, 34, 33], 17), v = view(odd.render());
    ok(!odd.js('!!matchComp(["flint","mia","bradley"],norm(33,34,33),17)'), "시트에 없는 조합은 매칭되지 않는다");
    ok(v.blocks.length === 0 && /data-k="none"/.test(v.sheet) && /이 리더 조합은 시트에 없습니다/.test(v.sheetText) && v.cmp === null,
       "시트에 없으면 시트 카드가 그렇게 말하고 비교 문단은 없다", v.sheetText.slice(0, 80));
    ok(v.rec.length === 4, "그래도 계산 추천은 나온다", v.rec.join(","));
    const one = view(page(["flint", "", ""], [60, 40, 0], 17).render());
    ok(/리더를 둘 이상 고르면/.test(one.sheetText), "리더가 하나뿐이면 둘 이상 고르라고 안내한다");
  }
  // 같은 리더·병비를 쓰는 행이 두 세대에 있으면 **세대가 맞는 쪽**을 잡아야 한다(2026-09-13 버그).
  // gcap 을 넘는 행은 아예 안 쓰고, 남은 것 중 세대가 가장 높은 행을 쓴다.
  {
    const lead = ["jeronimo", "mia", "bradley"], rr = [48, 4, 48];
    const at = g => JSON.parse(page(lead, rr, g).js("JSON.stringify(matchComp(" + JSON.stringify(lead) + ",norm(" + rr.join(",") + ")," + g + "))"));
    ok(at(7) && at(7).g === 7, "Gen 7 로 놓으면 Gen 7 행이 잡힌다", at(7) && String(at(7).g));
    ok(at(8) && at(8).g === 8, "Gen 8 로 놓으면 Gen 8 행이 잡힌다 (예전엔 Gen 7 이 이겼다)", at(8) && String(at(8).g));
    ok(!at(6), "Gen 6 로 놓으면 (그 리더 조합의 행이 Gen 7 부터라) 안 잡힌다");
    const m8 = view(page(lead, rr, 8).render()).blocks[0].main.map(x => x.ids.join("/"));
    const m7 = view(page(lead, rr, 7).render()).blocks[0].main.map(x => x.ids.join("/"));
    ok(m8[3] === "hendrik" && m7[3] === "patrick", "시트 카드도 세대를 따라간다 — Gen 8 은 4번 칸이 헨드릭, Gen 7 은 패트릭", m8.join(",") + " / " + m7.join(","));
    ok(!page(["logan", "philly", "zinman"], [10, 10, 80], 3).js('!!matchComp(["logan","philly","zinman"],norm(10,10,80),3)'),
       "리더가 같아도 병비가 멀면 매칭되지 않는다");
  }

  // ── 겹친 영웅의 장당 값(↘) — 이 편성의 실제 값으로 찍는가 (2026-09-13) ──
  {
    const a = page(["jeronimo", "mia", "gwen"], [48, 4, 48], 7), html = a.render(), v = view(html);
    const sline = (/data-k="stack">([\s\S]*?)<\/p>/.exec(v.blocks[0].raw) || [0, ""])[1];
    const mg = [...strip(sline).matchAll(/×(\d+\.\d+)/g)].map(m => +m[1]);
    ok(strip(sline).includes("노라") && mg.length === 3, "시트 카드: 노라 3칸이 그대로 실리고 장당 값이 셋 찍힌다", strip(sline).slice(0, 90));
    ok(mg.every((x, i) => i === 0 || x < mg[i - 1]), "장마다 값이 줄어든다 (포화가 실제로 반영돼 있다)", mg.join(" → "));
    // 핵심 교차검증 — 첫 장의 값은 단일 순위표의 그 영웅 배율과 같아야 한다(S1 하나만 센다).
    // ⚠️ 초상은 리더 표에도 나온다. **× 가 들어 있는 행만** 본다.
    let cells = [];
    for (const part of html.slice(html.indexOf('id="single"')).split("<tr").slice(1).filter(x => x.includes("norah.webp"))) {
      const m = [...("<tr" + part).split("</tr>")[0].matchAll(/×(\d+\.\d+)/g)].map(x => +x[1]);
      if (m.length) { cells = m; break; }
    }
    ok(cells.length > 0 && Math.abs(cells[cells.length - 1] - mg[0]) < 1e-9, "첫 장의 값이 단일 순위표의 그 영웅 배율과 같다 (S1 하나만 센다)",
       "표 " + cells[cells.length - 1] + " vs 문단 " + mg[0]);
    // 계산 카드는 셋째 노라를 안 집는다 — 셋째 장 값(mg[2])보다 나은 영웅이 있어서다
    const rn = v.rec.filter(x => x === "norah").length;
    ok(rn <= 2, "계산 카드는 같은 편성에서 노라를 3장 쌓지 않는다", v.rec.join(","));
    ok(page(["logan", "philly", "zinman"], [60, 40, 0], 3).paras().filter(x => x.includes("↘")).length === 0, "겹치는 영웅이 없으면 그 문단이 안 뜬다");
    const el = page(["jeronimo", "mia", "gwen"], [48, 4, 48], 7, "en").paras().filter(x => x.includes("↘"))[0] || "";
    ok(el.includes("Norah") && !/[가-힣]/.test(el), "영어 화면에도 뜨고 한글이 새지 않는다", el.slice(0, 80));
  }

  // ── 대안 칸 — 화면 ──
  {
    const g1 = view(page(["jeronimo", "molly", "zinman"], [60, 40, 0], 1).render());
    ok(g1.blocks[0].alt && same(g1.blocks[0].alt.map(x => x.ids), [["jessie", "jasser", "jeronimo"], ["seoyoon"]]) && /제시/.test(g1.blocks[0].text) && /서윤/.test(g1.blocks[0].text),
       "대안 칸이 한국어 이름으로 뜬다 (G1 — 제시*/서윤)", g1.blocks[0].alt && g1.blocks[0].alt.map(x => x.text).join(" | "));
    const g1e = view(page(["jeronimo", "molly", "zinman"], [60, 40, 0], 1, "en").render());
    ok(/Jessie/.test(g1e.sheetText) && /Seo-yoon/.test(g1e.sheetText) && !/[가-힣]/.test(g1e.sheetText), "영어 시트 카드에 한글이 없다",
       (g1e.sheetText.match(/[가-힣][가-힣 ·]*/g) || []).slice(0, 3).join(" | "));
    const g3 = view(page(["logan", "philly", "zinman"], [60, 40, 0], 3).render());
    ok(g3.blocks[0].alt === null && /data-k="noalt"/.test(g3.blocks[0].raw), "대안 칸이 없는 행은 없다고 적는다");
    ok(/계산 추천에는 넣지 않았습니다/.test(g1.sheetText), "'대안은 계산에 안 넣는다' 는 단서가 시트 카드에 있다");
    // 자유 문구 — 원문 그대로, 시트 순서 그대로
    const g2 = view(page(["jeronimo", "philly", "alonso"], [50, 20, 30], 2).render());
    ok(same(g2.blocks[0].alt.map(x => x.ids.length ? x.ids.join("/") : x.text), ["patrick", "20% ones"]), "자유 문구 대안(20% ones)이 시트 순서 그대로 뜬다",
       g2.blocks[0].alt.map(x => x.text).join(" | "));
    ok(/우리 해석/.test(g2.blocks[0].text), "자유 문구를 어떻게 읽었는지는 우리 해석이라고 밝힌다");
    // 이름이 여럿인 칸 — 칸은 하나고 그 안에 이름이 전부 보인다
    ok(same(g3.blocks[0].main.map(x => x.ids), [["mia"], ["patrick"], ["jessie", "jasser", "jeronimo"], ["seoyoon"]]) && /이름이 여럿인 칸은 그중 한 명/.test(g3.blocks[0].text),
       "제시* 칸은 한 칸에 세 이름이 다 보이고, 그중 한 명이라는 설명이 붙는다");
    // 비고 — 한국어 옮김과 원문이 같이
    const g13 = view(page(["gisela", "karol", "greg"], [60, 40, 0], 13).render());
    ok(/그렉을 쓰면 패트릭은 넣지 않습니다/.test(g13.blocks[0].text) && /No Patrick if Greg/.test(g13.blocks[0].text), "비고가 한국어 옮김 + 원문으로 뜬다");
    ok(/data-k="unscored"/.test(g13.blocks[0].raw) && /레니/.test(g13.blocks[0].text) && /그대로 비교할 수 없습니다/.test(g13.cmp),
       "레니가 든 시트 조합은 배율에 못 넣었다고 밝히고 비교 불가로 적는다");
    // 빈칸 — Gen 13 은 시트가 조이너 칸을 다 안 채웠다
    const g13b = view(page(["gisela", "mia", "vulcanus"], [48, 4, 48], 13).render());
    ok(g13b.blocks[0].main.length === 2 && /시트 빈칸/.test(g13b.blocks[0].text) && /조이너 2명만/.test(g13b.blocks[0].text), "시트가 비워 둔 칸은 빈칸으로 싣고 지어내지 않는다",
       g13b.blocks[0].text.slice(0, 120));
    // 비교가 안 되는 **이유를 있는 그대로** 적는다 — 빈칸 때문인지, 배율에 못 넣은 영웅 때문인지, 둘 다인지 (2026-11-11 리뷰:
    // 예전에는 레니뿐인 행에도 "레니·무명" 이라고, 빈칸뿐인 행에도 "못 넣은 영웅이 있다" 고 적었다)
    const g13c = view(page(["gisela", "flora", "vulcanus"], [60, 40, 0], 13).render());
    ok(/배율에 넣지 못한 영웅\( 레니 \)이 있습니다/.test(g13.cmp) && !/무명/.test(g13.cmp) && !/칸만 채웠/.test(g13.cmp), "레니만 문제인 행 — 레니만 적는다 (무명·빈칸 얘기 없음)", g13.cmp.slice(-90));
    ok(/조이너 칸을 2칸만 채웠습니다/.test(g13b.cmp) && !/넣지 못한 영웅/.test(g13b.cmp), "빈칸만 문제인 행 — 빈칸만 적는다", g13b.cmp.slice(-70));
    ok(/조이너 칸을 3칸만 채웠고, 배율에 넣지 못한 영웅\( 레니 \)도 있습니다/.test(g13c.cmp), "둘 다인 행 — 둘 다 적는다", g13c.cmp.slice(-90));
  }

  // ── 시트가 한 입력에 답을 둘 적어 둔 자리 — 감추지 않고 둘 다 싣는다 (2026-09-13) ──
  {
    {
      const a = page(["herbjorg", "lloyd", "ligeia"], [60, 20, 20], 12), v = view(a.render());
      ok(a.js('matchComps(["herbjorg","lloyd","ligeia"],norm(60,20,20),12).length') === 2, "g12 60/20/20 에 시트 행이 둘 걸린다");
      ok(a.js('matchComp(["herbjorg","lloyd","ligeia"],norm(60,20,20),12).meta===1'), "동률이면 시트가 META 라고 적은 행이 대표다");
      ok(v.blocks.length === 2 && /META/.test(v.blocks[0].text) && v.blocks[0].main.some(x => x.ids[0] === "gatot") && v.blocks[1].main.some(x => x.ids[0] === "norah"),
         "두 행이 각각 블록으로 뜬다 (META 행의 가토 · 다른 행의 노라)", v.blocks.map(b => b.main.map(x => x.ids.join("/")).join(",")).join(" | "));
      ok(/시트가 이 편성에 답을 2개 적어 뒀습니다/.test(v.sheetText) && /우리도 고르지 않고/.test(v.sheetText), "답이 둘이라고 알리고 고르지 않는다고 적는다");
      const union = [...new Set(comps.filter(c => c.g === 12 && c.rs.some(x => x.join("/") === "60/20/20")).flatMap(c => (c.alt || []).flat()))];
      const shown = [...new Set(v.blocks.flatMap(b => (b.alt || []).flatMap(x => x.ids)))];
      ok(union.length >= 2 && union.every(id => shown.includes(id)), "답이 둘인 자리에서 두 행의 대안이 모두 뜬다", "빠진 것: " + union.filter(id => !shown.includes(id)).map(HNko).join(","));
      ok(v.blocks.every(b => b.v > 0), "두 블록 모두 배율이 붙는다", v.blocks.map(b => b.v).join(" / "));
      // 🔍 비교도 **행마다** 한다 — 대표 행 하나만 비교하면 위의 "고르지 않는다" 와 어긋난다 (2026-11-11 리뷰)
      ok(v.cmpRows.length === 2 && v.cmpRows.every((t, i) => /\d칸 중 \d칸/.test(t) && t.includes("시트 조합 ×" + v.blocks[i].v.toFixed(3)) && t.includes("계산 추천 ×" + v.recV.toFixed(3))),
         "비교 문단이 행마다 있고 각자 그 행의 배율을 쓴다", v.cmpRows.map(t => t.slice(0, 60)).join(" | "));
      ok(/META/.test(v.cmpRows[0]) && /60\/20\/20/.test(v.cmpRows[0]) && !/META/.test(v.cmpRows[1]) && v.blocks[0].v !== v.blocks[1].v, "비교 문단마다 어느 행인지 라벨이 붙는다 (두 행의 배율이 실제로 다르다)");
      // 규칙 칩도 두 행의 조합을 모두 본다 — 대표 행(가토)과 다른 행(노라)이 둘 다 넘어가야 한다
      const b = page(["herbjorg", "lloyd", "ligeia"], [60, 20, 20], 12);
      b.js("globalThis.__j0=joinerRules;joinerRules=function(){globalThis.__ja=[].slice.call(arguments);return __j0.apply(null,arguments);}"); b.render();
      const seen = JSON.parse(b.js("JSON.stringify(__ja[6])")), rows = b.js("__ja[7].rows.length");
      ok(seen.includes("gatot") && seen.includes("norah") && rows === 2, "규칙 칩이 보는 시트 조합은 걸린 행 전부의 합집합이다", seen.join(","));
    }
    {
      const v = view(page(["gatot", "sonya", "bradley"], [60, 40, 0], 8).render());
      ok(v.blocks.length === 2 && /답을 2개 적어 뒀습니다/.test(v.sheetText), "g8 60/40/0 가토에도 시트 행이 둘 걸리고 둘 다 뜬다");
      const e = view(page(["edith", "sonya", "bradley"], [60, 40, 0], 8).render());
      ok(e.blocks.length === 1 && !/답을 \d+개 적어 뒀습니다/.test(e.sheetText), "한 행만 걸리면 알림이 안 뜬다");
    }
    {
      const a = page(["jeronimo", "molly", "zinman"], [50, 20, 30], 1), v = view(a.render());
      ok(a.js('matchComps(["jeronimo","molly","zinman"],norm(50,20,30),1).length') === 2, "g1 50/20/30 도 두 행에 걸리지만");
      ok(v.blocks.length === 1 && !/답을 \d+개 적어 뒀습니다/.test(v.sheetText), "칸이 같으면 블록 하나로 접고 알리지 않는다");
      // 접더라도 시트가 그 편성을 다른 라벨로도 적었다는 사실은 남긴다 (2026-11-11 리뷰 — 접힌 행의 라벨이 화면에서 사라졌다)
      const tw = strip((/data-k="twin">([\s\S]*?)<\/p>/.exec(v.blocks[0].raw) || [0, ""])[1]);
      ok(v.blocks[0].text.includes("Defense - 60/40/0 or 60/10/30 or 50/20/30") && tw.includes("Offense - 50/20/30 or 30/20/50") && v.cmpRows.length === 1,
         "접힌 쌍둥이 행의 라벨을 같이 보여 준다 (G1 — Defense 행 + Offense 행)", tw);
      const g11 = view(page(["eleonora", "lloyd", "bradley"], [60, 40, 0], 11).render());
      ok(g11.blocks.length === 1 && strip((/data-k="twin">([\s\S]*?)<\/p>/.exec(g11.blocks[0].raw) || [0, ""])[1]).includes("Offense & Defense - 60/40/0"),
         "G11 엘레오노라·로이드·브레들리 60/40 — 'Offense & Defense' 행 라벨도 보인다");
      ok(!/data-k="twin"/.test(view(page(["logan", "philly", "zinman"], [60, 40, 0], 3).render()).sheet), "쌍둥이가 없으면 그 문단이 없다");
      const e = view(page(["jeronimo", "molly", "zinman"], [50, 20, 30], 1, "en").render());
      ok(/data-k="twin"/.test(e.sheet) && !/[가-힣]/.test(e.sheetText), "영어 화면에도 뜨고 한글이 새지 않는다");
    }
    // 전수 조사 — 같은 입력에 칸이 다른 행이 걸리는 자리를 **리더 대안 × 병비 전부** 밟아 기계적으로 훑는다.
    // ⚠️ 이 자리를 오래 못 본 이유는 스윕의 종류였다: "각 행을 그 행의 리더로 돌려 칸이 채워지는가" 만 보면 신호가 뜰 자리가 없다.
    // 필요한 건 "한 입력에 행이 둘 이상 걸리는가" 를 묻는 스윕이다(2026-09-13).
    {
      const found = [], lost = [], twinSet = new Set();
      for (const c of comps) for (const rs of c.rs) {
        const alt = c.l.map(cell => cell.length ? cell : [""]);
        for (const a0 of alt[0]) for (const a1 of alt[1]) for (const a2 of alt[2]) {
          const q = "matchComps(" + JSON.stringify([a0, a1, a2]) + ",norm(" + rs.join(",") + ")," + c.g + ")";
          // [칸이 다른 행 수, 걸린 행 수, 화면에 실리는 행 수(대표 + 다른 행 + 그 쌍둥이들)]
          const [hit, n, shown] = JSON.parse(run(CTX_KO, "(function(){const all=" + q + ",rv=compRivals(all),rows=all.length?[all[0]].concat(rv):[];" +
            "return JSON.stringify([rv.length,all.length,rows.reduce((s,c)=>s+1+compTwins(all,c).length,0)]);})()"));
          const tag = "g" + c.g + " " + rs.join("/") + " " + [a0, a1, a2].filter(Boolean).join("+");
          if (hit > 0) found.push(tag);
          if (n > 1 && hit === 0) twinSet.add(tag);
          if (shown !== n) lost.push(tag + " (" + shown + "/" + n + ")");
        }
      }
      // 걸린 행은 블록으로든 쌍둥이 라벨로든 **전부** 화면에 나와야 한다 — 조용히 사라지는 행이 없어야 한다
      ok(lost.length === 0, "걸린 시트 행이 하나도 빠짐없이 화면에 실린다 (블록 또는 쌍둥이 라벨)", lost.slice(0, 4).join(" | "));
      note("칸·대안·비고가 완전히 같아 접히는 입력(쌍둥이) " + twinSet.size + "가지: " + [...twinSet].join(" · "));
      const uniq = [...new Set(found)];
      note("시트가 답을 둘 이상 적어 둔 입력 " + uniq.length + "가지: " + uniq.join(" · "));
      const KNOWN = ["g8 60/40/0 gatot+sonya+bradley", "g12 60/20/20 herbjorg+lloyd+ligeia"];
      ok(uniq.every(s => KNOWN.indexOf(s) >= 0) && uniq.length === KNOWN.length, "칸이 갈리는 자리는 아는 둘(g8 가토 · g12 60/20/20)뿐이다", uniq.join(" · "));
      for (const s of uniq) {
        const m = /^g(\d+) (\S+) (.+)$/.exec(s), l = m[3].split("+");
        const v = view(page(l, m[2].split("/").map(Number), +m[1]).render());
        ok(/답을 \d+개 적어 뒀습니다/.test(v.sheetText) && v.blocks.length >= 2, "화면이 알리고 전부 싣는다 — " + s);
      }
    }
  }

  // ── 병비가 맞는 행이 없으면 리더가 같은 행을 안내한다 (2026-10-10, 사용자 요청) ──
  // 아모세·필리·린 60/40 — 시트는 그 셋을 50/2/48 에만 적어 뒀는데 화면이 침묵해서 "왜 시트랑 달라?" 가 나왔다.
  {
    const a = page(["ahmose", "philly", "lynn"], [60, 40, 0], 4), v = view(a.render());
    ok(a.js('matchComps(["ahmose","philly","lynn"],norm(60,40,0),4).length') === 0, "아모세·필리·린 60/40 은 시트 행이 없다");
    const near = JSON.parse(a.js('JSON.stringify(nearComps(["ahmose","philly","lynn"],4).map(c=>c.rs))'));
    ok(near.length === 1 && near[0][0].join("/") === "50/2/48", "리더가 같은 행은 Gen 4 50/2/48 하나다", JSON.stringify(near));
    ok(/data-k="near"/.test(v.sheet) && v.blocks.length === 1 && /50\/2\/48/.test(v.blocks[0].text) &&
       same(v.blocks[0].main.map(x => x.ids), [["mia"], ["patrick"], ["jessie", "jasser", "jeronimo"], ["seoyoon"]]) && same(v.blocks[0].alt.map(x => x.ids), [["zinman"]]),
       "📍 안내가 그 행의 병비·조이너·대안을 그대로 싣는다", v.blocks[0] ? v.blocks[0].text.slice(0, 140) : "없음");
    ok(v.blocks[0].v === 0 && v.cmp === null, "병비가 다른 행에는 배율도 비교 문단도 붙이지 않는다");
    ok(/data-r="50,2,48"/.test(v.sheet), "그 병비로 바로 옮겨 가는 버튼이 있다");
    const b = view(page(["ahmose", "philly", "lynn"], [50, 2, 48], 4).render());
    ok(!/data-k="near"/.test(b.sheet) && b.blocks.length === 1 && b.blocks[0].v > 0 && b.cmp !== null, "50/2/48 로 두면 안내가 사라지고 시트 행이 잡힌다");
    ok(/data-k="none"/.test(view(page(["ahmose", "philly", "lynn"], [60, 40, 0], 3).render()).sheet), "gcap 3 이면 Gen 4 행을 안내하지 않는다");
    ok(/data-k="none"/.test(view(page(["flint", "philly", "lynn"], [60, 40, 0], 12).render()).sheet), "시트에 없는 리더 조합이면 안내가 없다");
    const e2 = view(page(["ahmose", "philly", "lynn"], [60, 40, 0], 4, "en").render());
    ok(/data-k="near"/.test(e2.sheet) && !/[가-힣]/.test(e2.sheetText) && /50\/2\/48/.test(e2.sheetText), "영어 안내에 한글이 없다");
  }

  // ── 걷어낸 것이 되살아나지 않았는가 ──
  {
    const h = page(["jeronimo", "mia", "gwen"], [48, 4, 48], 5).render();
    ok(!/id="swaps"|id="recEff"|id="recEffSame"/.test(h) && !/SHEET_EDGE|fillCells/.test(src("render.js").replace(/\/\/[^\n]*/g, "")),
       "혼합 추천(시트 칸 우선 + 셋째 장 교체 · SHEET_EDGE)의 흔적이 화면·코드에 없다");
    const iS = h.indexOf('id="sheet"'), iR = h.indexOf('id="rec"'), iC = h.indexOf('id="cmp"'), iT = h.indexOf('id="single"');
    ok(iS > 0 && iS < iR && iR < iC && iC < iT, "순서: 시트 카드 → 계산 카드 → 비교 → 단일 순위표", [iS, iR, iC, iT].join(","));
    ok(/시트 머리말/.test(h) && /Mixing 4 different joiners/.test(h), "시트 머리말 지침(원문)이 실려 있다");
    const nTips = run(CTX_KO, "SHEET_TIPS.length"), tipsHtml = h.slice(h.indexOf('id="tips"'));
    ok((tipsHtml.match(/<li>/g) || []).length === nTips && /This joiners are GENERIC suggestions\./.test(tipsHtml) && /최대 8명/.test(tipsHtml),
       "시트 머리말 접기에 항목이 전부(" + nTips + "개) 실린다", String((tipsHtml.match(/<li>/g) || []).length));
    // 계산 카드가 시트에서 무엇을 가져오고 무엇을 안 보는지 — 뭉뚱그려 "시트를 안 본다" 고 적지 않는다 (2026-11-11 리뷰)
    const scope = strip((/data-k="scope">([\s\S]*?)<\/p>/.exec(h) || [0, ""])[1]);
    ok(/이 편성에 걸리는 시트 행\(시트 카드의 조합\)은 보지 않습니다/.test(scope) && /조이너 명단/.test(scope) && /완전히 같은 후보끼리의 순서/.test(scope) && /등장 빈도/.test(scope),
       "계산 카드가 '걸리는 행은 안 보고, 명단과 동률 순서의 빈도만 시트에서 온다' 고 정확히 적는다", scope.slice(0, 120));
    ok(!/시트의 행\(시트 카드\)은 보지 않습니다|시트 명단도 보지 않고/.test(h), "'시트를 전혀 안 본다' 로 읽히는 옛 문구가 없다");
    // 시트에서 오는 것은 셋이다 — 명단 · 중복 허용(stack) · 동률 순서. "명단과 빈도뿐" 이라고 적으면 stack 을 빠뜨린다 (2026-11-11 독립 검증).
    // 이름은 데이터에서 읽는다: stack 이 붙은 영웅이 바뀌면 문구도 따라 바뀌어야 한다.
    const stackKr = JSON.parse(run(CTX_KO, "JSON.stringify(HEROES.filter(h=>h.stack).map(h=>h.kr))"));
    ok(stackKr.length >= 1 && /시트에서 가져오는 것은 셋/.test(scope) && stackKr.every(n => scope.includes(n)) && !/빈도뿐/.test(scope),
       "계산 카드가 중복 허용 영웅(" + stackKr.join("·") + ")도 시트에서 온다고 적는다 — '명단과 빈도뿐' 이 아니다", scope.slice(100, 260));
    // 전체 영웅 카드는 두 추천이 다를 때만 뜬다 — 반드시 뜨는 편성으로 본다(안 뜨면 그것부터 실패). 플린트·미아·브레들리 48/4/48 gcap 17.
    const hAll = boot("ko").mode("rally").leaders("flint", "mia", "bradley").gear(10).gcap(17).mine([48, 4, 48]).render();
    const allCard = (/id="recAll"[\s\S]*?(?=id="(?:cmp|rules|combos)")/.exec(hAll) || [""])[0];   // 카드 안에 표(div)가 있어 첫 닫는 div 로 자르면 안 된다
    ok(allCard.length > 0 && /두 장 이상 넣을 수 있는 영웅과 완전 동률일 때의 순서는 위와 같은 기준/.test(strip(allCard)),
       "전체 영웅 카드도 중복 허용·동률 기준이 같다고 적는다", allCard ? strip(allCard).slice(-160) : "#recAll 이 안 떴다");
  }
}

// ── N+9. 버킷 이론 (2026-11-10 · Ton 영상 + BUCKET-ENGINE-PROMPT §6) ──────
// 숫자는 지시서 §6 과 시트 Rally Joiners 탭 그대로다. 테스트용 리더는 실제 영웅이 아니라 가짜 스킬 묶음이다 —
// 시트가 제로니모를 "파괴력 .25 + 공격력 .25" 로만 계산하기 때문이다(S3 제외).
section("버킷 이론 (2026-11-10)");
{
  const R3 = {inf: 40, lan: 20, mar: 40}, R2 = {inf: 50, lan: 0, mar: 50}, R1 = {inf: 100, lan: 0, mar: 0};
  const S1 = id => E.byId[id].exp[0];
  const at = (skills, r) => skills.flatMap(e => E.atoms(e, r || R3));
  const abs = (lead, join, r) => E.scoreAtoms(at(lead.concat(join), r)).s;
  const rel = (lead, join, r) => abs(lead, join, r) / abs(lead, [], r);
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const J = S1("jessie"), SY = S1("seoyoon");
  // 1~3 — 같은 25% 넷을 어떻게 놓느냐
  ok(near(abs([], [J, J, J, J]), 2.0), "1 같은 버킷 25%×4 → 2.000", abs([], [J, J, J, J]));
  ok(near(abs([], [J, J, SY, SY]), 2.25), "2 두 버킷 2:2 → 2.250");
  ok(near(abs([], [J, SY, S1("patrick"), S1("hendrik")]), 2.44140625), "3 네 버킷 1:1:1:1 → 2.44140625");
  // 4 — Rally Joiners 탭 (리더 값은 시트가 적은 그대로)
  const E25 = {slot: "E", v: .25}, B25 = {slot: "B", v: .25};
  const rj = [[[], [2.0, 2.25, 2.1875]], [[E25, B25], [2.8125, 3.0625, 3.0]],
              [[E25, B25, B25], [3.375, 3.5, 3.5]], [[B25, B25], [3.0, 3.0, 3.0625]]];
  const sets = [[J, J, J, J], [J, J, SY, SY], [J, S1("jeronimo"), S1("jasser"), SY]];
  rj.forEach(([lead, want]) => {
    const got = sets.map(s => abs(lead, s));
    ok(got.every((g, i) => near(g, want[i])), "4 Rally Joiners 탭 — 리더 " + (lead.map(x => x.slot).join("+") || "없음") + " → " + want.join(" · "), got.join(" · "));
  });
  // 5 — 같은 버킷 확률형: 효과는 안 겹치고 확률만 오른다
  const AL = S1("alonso"), eb = n => E.scoreAtoms(at(Array(n).fill(AL))).b.E - 1;
  ok([1, 2, 3].every((n, i) => near(eb(n), [.20, .32, .392][i])), "5 알론소 1/2/3 (NO_STACK) → +0.20 / +0.32 / +0.392", [1, 2, 3].map(eb).join(" · "));
  run(CTX_KO, "CHANCE_NO_STACK=false");
  const old = [1, 2, 3].map(eb);
  run(CTX_KO, "CHANCE_NO_STACK=true");
  ok([.20, .40, .60].every((v, i) => near(old[i], v)), "5b CHANCE_NO_STACK=false 면 예전 기대값 단순합 (0.20/0.40/0.60)", old.join(" · "));
  // 6 — 미아 병종 판정
  const MI = S1("mia"), gb = (k, r) => E.scoreAtoms(at(Array(k).fill(MI), r)).b.G - 1;
  ok(near(gb(1, R1), .25) && near(gb(1, R2), .375) && near(gb(1, R3), .4375), "6 미아 k=1, n=1/2/3 → +0.25 / +0.375 / +0.4375", [gb(1, R1), gb(1, R2), gb(1, R3)].join(" · "));
  ok(near(gb(2, R3), .4921875), "6b 미아 k=2, n=3 → +0.4921875 (두 번째 미아 +5.5%p 뿐)", gb(2, R3));
  // 7 · 8 — 감소는 나눗셈 · 한계 이득
  ok(near(abs([], [J]) / abs([], [S1("sergey")]), 1.25 / 1.2), "7 1.25 / 1.20 → 1.041666…");
  const E75 = {slot: "E", v: .75};
  ok(near(rel([E75], [J]), 2.0 / 1.75) && rel([E75], [S1("sergey")]) > rel([E75], [J]),
     "8 버킷 1.75 에 +0.25 → ×1.142857 (빈 버킷 20% ×1.20 이 이긴다)", rel([E75], [J]));
  // 9~11 — 리더가 채운 버킷의 조이너는 Top 1 조합에 안 든다 (실제 calc 로)
  const top1 = (lead, ratio, gcap) => {
    const a = boot("ko").mode("rally").leaders(...lead).gear(10).gcap(gcap).mine(ratio);
    a.js("globalThis.__r0=render;render=function(d){globalThis.__d=d;return __r0(d);}");
    a.render();
    return a.js("__d.combos[0].cls.flatMap(c=>c.mem.map(x=>x.h.id))");
  };
  const t9 = top1(["eleonora", "lloyd", "bradley"], [60, 40, 0], 15);
  ok(t9.indexOf("patrick") < 0, "9 리더 엘레오노라 → Top 1 에 패트릭 없음", t9.join(","));
  const t10 = top1(["herbjorg", "lloyd", "ligeia"], [60, 20, 20], 15);
  ok(!t10.some(id => ["hendrik", "ligeia", "estrella"].includes(id)), "10 리더 리지아 → Top 1 에 헨드릭류(F) 없음", t10.join(","));
  const t11 = top1(["gisela", "flora", "vulcanus"], [60, 40, 0], 15);
  ok(t11.indexOf("mia") < 0, "11 리더 플로라 → Top 1 에 미아 없음", t11.join(","));
  // 12 · 13 — 슬롯 회귀
  ok(["jessie", "jasser", "jeronimo", "blanchette"].every(id => S1(id).slot === "E"), "12 제시·제셀·제로니모·블랑쉬 S1 = E");
  const sk = [["mia", "Lucky Charm"], ["alonso", "Poison Harpoon"], ["bahiti", "Fluorescence"]].map(([id, n]) => E.byId[id].exp.find(e => e.n === n));
  ok(sk.every(e => e.slot === "SKILL" && E.atoms(e, R3).length === 0), "13 미아 S2 · 알론소 S3 · 바히티 S2 = SKILL, 배율 기여 0");
  // Gen 1 행 — 제로니모 S1 + 몰리 S3 + 진먼 S3 가 파괴력 버킷을 1.75 까지 채워, 새 버킷을 여는 20% 가 제시*보다 낫다
  const g1 = boot("ko").mode("rally").leaders("jeronimo", "molly", "zinman").gear(10).gcap(1).mine([60, 40, 0]);
  g1.js("globalThis.__r0=render;render=function(d){globalThis.__d=d;return __r0(d);}"); g1.render();
  const g1m = g1.js("Object.fromEntries(__d.rank.map(x=>[x.h.id,x.mul]))");
  ok(g1m.lingxue > g1m.jessie && g1m.lumak > g1m.jessie, "Gen 1 — 링쉐·룸 보겐(20%)이 제시*보다 위 (시트 2026-11 변경의 이유)",
     "lingxue " + g1m.lingxue.toFixed(3) + " · lumak " + g1m.lumak.toFixed(3) + " · jessie " + g1m.jessie.toFixed(3));
  // 전수 탐색은 탐욕(#recAll)보다 못할 수 없다 — 탐욕의 넷도 후보 multiset 중 하나다
  const cmp = boot("ko").mode("rally").leaders("jeronimo", "mia", "bradley").gear(10).gcap(12).mine([48, 4, 48]);
  cmp.js("globalThis.__r0=render;render=function(d){globalThis.__d=d;return __r0(d);}"); cmp.render();
  const [best, n5] = cmp.js("[__d.combos[0].rel,__d.combos.length]");
  ok(n5 === 5, "Top 5 조합이 다섯 개 나온다", n5);
  const html = cmp.render();
  const greedy = +(/id="recAll"[\s\S]*?×([\d.]+)/.exec(html) || /id="rec"[\s\S]*?×([\d.]+)/.exec(html))[1];
  ok(best >= greedy - 5e-4, "전수 탐색 #1 ≥ 계산 순위 그대로(탐욕)", best.toFixed(4) + " vs " + greedy);
  ok(/id="combos"/.test(html) && /id="bmap"/.test(html), "버킷 점유 맵과 Top 5 패널이 렌더된다");
  ok(/data-code="LV5"/.test(html), "규칙 레이어 LV5 칩이 항상 뜬다");
  // ── 시트 카드는 겹치는 칸도 그대로 싣고, 계산 카드는 따로 고른다 (2026-11-11 시트/계산 분리) ──
  // 2026-11-10 의 "겹치는 시트 칸은 따져 보고 바꾼다"(🔀)는 없어졌다 — 시트는 한 칸도 안 바꾼다.
  {
    const card = (lead, ratio, g) => { const h = boot("ko").mode("rally").leaders(...lead).gear(10).gcap(g).mine(ratio).render();
      const cut = (id, end) => { const i = h.indexOf('id="' + id + '"'); if (i < 0) return ""; const j = end ? h.indexOf(end, i) : -1; return j < 0 ? h.slice(i) : h.slice(i, j); };
      const ids = t => [...t.matchAll(/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]);
      const main = (/data-k="main">([\s\S]*?)<\/div>/.exec(cut("sheet", 'class="jcol"')) || [0, ""])[1];
      const rec = cut("rec"), b = /<p><b>([\s\S]*?)<\/b><\/p>/.exec(rec);
      return {sheet: ids(main), rec: b ? ids(b[1]) : [], h}; };
    // 가이드 §7 예시 — Gen 4 제로니모·미아·알론소 48/4/48 = 패트릭·필리·진먼·레이나 (시트 카드에 그대로)
    const z7 = card(["jeronimo", "mia", "alonso"], [48, 4, 48], 4);
    ok(z7.sheet.join() === "patrick,philly,zinman,reina", "가이드 §7 예시가 시트 카드에 시트 순서 그대로 실린다", z7.sheet.join(","));
    // 노라 3장 행 — 시트 카드는 3장 그대로, 계산 카드는 따로
    const n3 = card(["jeronimo", "mia", "gwen"], [48, 4, 48], 5);
    ok(n3.sheet.filter(x => x === "norah").length === 3 && n3.rec.filter(x => x === "norah").length < 3,
       "시트가 노라를 3칸 적은 행 — 시트 카드는 3장 그대로, 계산 카드는 3장을 쌓지 않는다", n3.sheet.join(",") + " / " + n3.rec.join(","));
    ok(!/id="swaps"/.test(n3.h) && !/🔀/.test(n3.h), "시트 칸을 바꿨다는 안내(🔀)는 더 없다 — 바꾸지 않으니까");
  }
  // ── 장별 이득 표 (효율) — 시트 카드와 계산 카드 양쪽에 ──
  {
    const page = (lead, ratio, g) => boot("ko").mode("rally").leaders(...lead).gear(10).gcap(g).mine(ratio).render();
    const tbl = (h, id) => { const i = h.indexOf('id="' + id + '"'); if (i < 0) return null;
      return h.slice(i, h.indexOf("</table>", i)).split("<tr>").slice(2).map(tr => tr.split("</td>").map(td => td.replace(/<[^>]+>/g, ""))); };
    const g5 = page(["jeronimo", "mia", "gwen"], [48, 4, 48], 5), s5 = tbl(g5, "effSheet"), r5 = tbl(g5, "effRec");
    ok(!!r5 && r5.length === 4 && !!s5 && s5.length === 4, "시트 조합·계산 추천 모두 네 명마다 장별 이득 행이 있다",
       (s5 ? s5.map(x => x[0] + " " + x[3]).join(" · ") : "시트 표 없음") + " / " + (r5 ? r5.map(x => x[0] + " " + x[3]).join(" · ") : "계산 표 없음"));
    const nor = s5.filter(x => x[0] === "노라").map(x => parseFloat(x[3]));
    ok(nor.length === 3 && nor[0] < 100 && nor[1] < nor[0] && nor[2] < nor[1], "시트 조합의 노라 효율이 장마다 내려간다 (리더 + 앞선 노라와 겹친다)", nor.join(" → "));
    ok(s5.filter(x => x[0] === "패트릭")[0][3] === "100%" && s5.filter(x => x[0] === "노라")[1][4].includes("노라"),
       "안 겹치면 100% · 겹치면 누구와 겹치는지 적는다", s5.map(x => x[4]).join(" | "));
    const off = page(["logan", "philly", "zinman"], [55, 5, 40], 3);
    ok(!off.includes('id="effSheet"') && off.includes('id="effRec"'), "시트 행이 아니면 시트 쪽 표는 없고 계산 쪽 표만 뜬다");
    // 두 답이 걸리는 자리는 블록마다 표가 따로다
    const g12 = page(["herbjorg", "lloyd", "ligeia"], [60, 20, 20], 12);
    ok(g12.includes('id="effSheet"') && g12.includes('id="effSheet2"'), "시트 답이 둘이면 블록마다 장별 이득 표가 있다");
  }
  // ── 2026-11-10 리뷰 보강 ──
  // 10b — 위 10 은 F 버킷을 없애도 통과했다(넷째 자리가 동률 순서로 정해지는 편성이라). 값을 직접 잰다.
  const mulOf = (lead, id) => { const a = boot("ko").mode("rally").leaders(...lead).gear(10).gcap(15).mine([60, 20, 20]);
    a.js("globalThis.__r0=render;render=function(d){globalThis.__d=d;return __r0(d);}"); a.render();
    return a.js("__d.rank.filter(x=>x.h.id==='" + id + "')[0].mul"); };
  { const m = mulOf(["herbjorg", "lloyd", "ligeia"], "hendrik"); ok(near(m, 1.5 / 1.25), "10b 리더 리지아(F 1.25) → 헨드릭 한계 ×1.200", m); }
  { const m = mulOf(["herbjorg", "lloyd", "bradley"], "hendrik"); ok(near(m, 1.25), "10b 대조군 — 리지아가 없으면 헨드릭 ×1.250", m); }
  // 스펙이 명시한 섞임: 알론소+린(같은 E 40%/50%) = 64% 발동 → 0.32 · 미아+플로라 3병종 = 미아 2장과 같다
  const chOf = id => E.atoms(S1(id), R3);
  { const v = E.scoreAtoms(chOf("alonso").concat(chOf("lynn"))).b.E; ok(near(v, 1.32), "알론소+린 = 파괴력 버킷 1.32 (발동 64%)", v); }
  { const v = E.scoreAtoms(chOf("mia").concat(chOf("flora"))).b.G; ok(near(v, 1 + .5 * (1 - Math.pow(.5, 6))), "미아+플로라 3병종 = 1.4921875 (판정 6회)", v); }
  // 규칙 칩 — 서버 세대 · 기본 추천(#rec)의 겹침 · 문턱
  const chips = (lead, ratio, gcap) => { const h = boot("ko").mode("rally").leaders(...lead).gear(10).gcap(gcap).mine(ratio).render();
    return (h.match(/data-code="[A-Z0-9_]+"/g) || []).map(x => x.slice(11, -1)); };
  const c1 = chips(["jeronimo", "molly", "zinman"], [60, 40, 0], 1);
  ok(!c1.includes("RENEE") && !c1.includes("REINA") && !c1.includes("NORAH_STACK"), "Gen 1 서버에는 레니·레이나·노라 칩이 안 뜬다", c1.join(","));
  const c13 = chips(["gisela", "karol", "greg"], [60, 40, 0], 13);
  ok(c13.includes("PATRICK_DUP"), "G13 기젤라·가로얼·그렉 — 기본 추천에 패트릭이 있으면 PATRICK_DUP (시트 비고 'No Patrick if Greg')", c13.join(","));
  ok(!c13.includes("RENEE"), "기본 추천에 이미 레니가 있으면 RENEE 칩은 안 뜬다", c13.join(","));
  const c19 = chips(["jeronimo", "mia", "bradley"], [48, 4, 48], 12), c20 = chips(["jeronimo", "reina", "greg"], [60, 20, 20], 12);
  ok(c19.includes("NORAH_STACK") && !c19.includes("RENEE"), "48/4/48 — NORAH_STACK 뜨고 RENEE(창병 <20) 안 뜬다", c19.join(","));
  ok(c20.includes("RENEE") && !c20.includes("NORAH_STACK") && !c20.includes("REINA"), "60/20/20 리더 레이나 — RENEE 뜨고 NORAH_STACK·REINA 안 뜬다", c20.join(","));
  // NORAH_STACK 은 **화면의 시트 카드와 어긋나는 말을 하지 않는다** (2026-11-11 리뷰).
  // 예전에는 보+궁 ≥88% 면 무조건 "시트는 여기서 노라를 3~4장까지 적습니다" 였다 — 바로 위 시트 카드가 노라를 안 적은 편성에서도.
  {
    const chipText = (lead, ratio, gcap) => { const h = boot("ko").mode("rally").leaders(...lead).gear(10).gcap(gcap).mine(ratio).render();
      const m = /data-code="NORAH_STACK">([\s\S]*?)<\/li>/.exec(h); return m ? m[1].replace(/<[^>]+>/g, "") : null; };
    // 노라만 적힌 칸(nor)과 노라가 선택지 중 하나인 칸(opt · 시트 원문 "Norah/Patrick")을 따로 센다 — 합쳐서 "4칸" 이라고 하면 시트 카드와 어긋난다
    const nor = c => c.j.filter(cell => cell.length === 1 && cell[0] === "norah").length, opt = c => c.j.filter(cell => cell.length > 1 && cell.includes("norah")).length;
    const all = JSON.parse(run(CTX_KO, "JSON.stringify(SHEET_COMPS)"));
    {
      const withOpt = all.filter(c => opt(c) > 0);
      ok(withOpt.length === 2 && withOpt.every(c => nor(c) === 3 && opt(c) === 1), "노라가 선택지인 칸이 있는 행은 둘이고 둘 다 '노라 3칸 + 노라/패트릭 1칸' 이다", withOpt.map(c => "g" + c.g + " " + c.lb).join(" | "));
      const t6 = chipText(["jeronimo", "mia", "wayne"], [48, 4, 48], 6), t6m = chipText(["logan", "philly", "wayne"], [45, 5, 50], 6);
      [["G6 제로니모·미아·웨인 48/4/48", t6], ["G6 META 로건·필리·웨인 45/5/50", t6m]].forEach(([nm, t]) =>
        ok(t && /노라를 3칸 적었습니다/.test(t) && /그 밖에 1칸은 노라와 다른 영웅 중 하나/.test(t) && !/4칸/.test(t),
           "'Norah/Patrick' 칸을 노라 칸으로 세지 않는다 — 3칸 + 선택지 1칸 (" + nm + ")", t));
      const hEn = boot("en").mode("rally").leaders("jeronimo", "mia", "wayne").gear(10).gcap(6).mine([48, 4, 48]).render();
      const mEn = (/data-code="NORAH_STACK">([\s\S]*?)<\/li>/.exec(hEn) || [0, ""])[1].replace(/<[^>]+>/g, "");
      ok(/Norah in 3 cells/.test(mEn) && /Another 1 cell offers Norah or another hero/.test(mEn) && !/[가-힣]/.test(mEn), "영어 칩도 같다", mEn);
      // 영어 화면의 행 라벨 — 제목이 곧 원문이라 다시 안 싣지만, META 를 태그로 떼어 낸 행은 통째 원문을 같이 적는다
      const hMeta = boot("en").mode("rally").leaders("logan", "philly", "wayne").gear(10).gcap(6).mine([45, 5, 50]).render();
      ok(hMeta.includes("sheet label “META - Defense - 45/5/50 or 40/0/60”"), "영어 화면도 META 행의 라벨 원문을 통째로 싣는다");
      ok(!/sheet label “/.test((/id="sheet"[\s\S]*?id="rec"/.exec(hEn) || [""])[0]), "라벨을 안 쪼갠 행(영어)은 원문을 두 번 싣지 않는다");
    }
    const t3 = chipText(["jeronimo", "mia", "bradley"], [48, 4, 48], 12);
    ok(t3 && /시트는 이 편성에 노라를 3칸 적었습니다/.test(t3), "걸린 시트 행이 노라를 3칸 적었으면 그 장수를 말한다 (G8 제로니모·미아·브레들리)", t3);
    const t2 = chipText(["edith", "mia", "hendrik"], [48, 4, 48], 8);
    ok(t2 && /노라를 2칸 적었습니다/.test(t2), "2칸 적은 행은 2칸이라고 말한다 (G8 에디스·미아·헨드릭)", t2);
    ok(chipText(["gisela", "karol", "vulcanus"], [50, 10, 40], 13) === null, "걸린 시트 행이 노라를 안 겹쳤으면 칩을 내지 않는다 (G13 기젤라·가로얼·불카누스 50/10/40 — 시트 조합에 노라가 없다)");
    ok(chipText(["gregory", "philly", "bradley"], [48, 4, 48], 10) === null, "노라가 한 칸뿐인 행도 마찬가지다 (G10 그레고리·필리·브레들리)");
    // 시트에 없는 편성 — "이 편성" 얘기가 아니라 시트 전체의 경향이라고 밝히고, 행 수·장수는 데이터에서 센다
    const st = all.filter(c => nor(c) >= 2 && c.rs.some(v => v[0] + v[2] >= 88)), mx = Math.max(...st.map(nor));
    const t0 = chipText(["flint", "mia", "bradley"], [48, 4, 48], 17);
    ok(t0 && /이 편성은 시트에 행이 없지만/.test(t0) && t0.includes(st.length + "개 행") && t0.includes("2~" + mx + "칸"), "시트에 없는 편성은 시트 전체의 경향을 세어서 말한다 (" + st.length + "행 · 최대 " + mx + "칸)", t0);
    ok(st.length === all.filter(c => nor(c) >= 2).length, "시트가 노라를 겹쳐 적은 행은 전부 보+궁 위주 병비다 (칩 문구의 전제)", st.length + " vs " + all.filter(c => nor(c) >= 2).length);
    ok(mx === 3, "노라만 적힌 칸은 한 행에 최대 3칸이다 — '2~4칸' 이라고 적으면 선택지 칸까지 센 것이다", "최대 " + mx);
  }
  { const cm = chips(["logan", "philly", "zinman"], [60, 40, 0], 3);   // 시트 행 — 추천 첫 칸이 미아
    ok(cm.includes("CHANCE"), "미아가 든 추천에 CHANCE 칩 (미아류도 확률형이다)", cm.join(",")); }
}

// ── 보병 전용 몫 — 플린트 · 아모세 (2026-11-13 · 사용자 결정) ─────────────
// "보병만 버프하는 스킬이라 효율이 좋을 수가 없다." 그런데 계산은 플린트(보병 피해량 +100%)를 60/40 에서 ×1.310,
// 아모세(보병 받피 −70%)를 ×1.25~1.27 로 재서 「계산 추천 — 전체 영웅」에 21행·13행, Top 5 에 2~3장씩 겹쳐 올렸다.
//   · 보병 딜 가중 DW.infantry 0.3 → 0.1   · 아모세 Viper Formation 의 보병 몫은 배율에서 뺀다(off:1) — 창·궁 몫만 계산
// 여기서 지키는 것: 그 둘이 20% 계열 아래로 내려갔는가 · 시트 편성 어디서도 추천·Top 5 에 안 드는가 · 뺀 몫을 화면이 숨기지 않는가.
section("보병 전용 몫 — 플린트 · 아모세 (2026-11-13)");
{
  // (1) off 는 명단을 박아 둔다 — 늘릴 때는 그 영웅 주석에 근거부터 적어야 한다(data.js 머리말).
  const offs = [];
  for (const h of E.HEROES) for (const e of h.exp) for (const q of [e, e.also].filter(Boolean))
    if (q.off) offs.push(h.id + "/" + e.n + "/" + q.tgt + (q === e ? "" : "(also)"));
  ok(offs.join(",") === "ahmose/Viper Formation/infantry(also)", "배율에서 뺀 몫(off)은 아모세 Viper Formation 의 보병 몫 하나뿐", offs.join(","));

  // (2) 원자 — 아모세 S1 은 창·궁 −30% 몫(시간평균 .15 × 병력 비중)만 D 버킷에 든다. 보병 몫(.35 × 60%)은 안 든다.
  const r64 = E.norm(60, 40, 0), at = E.atoms(E.byId.ahmose.exp[0], r64);
  ok(at.length === 1 && at[0].t === "det" && at[0].sl === "D" && Math.abs(at[0].v - .15 * .4) < 1e-12,
     "아모세 S1 은 60/40 에서 D 버킷에 +0.06 만 넣는다 (보병 몫 +0.21 은 뺐다)", JSON.stringify(at));
  ok(Math.abs(E.scoreAtoms(E.atoms(E.byId.flint.exp[0], r64)).s - (1 + 6 / 46)) < 1e-12, "플린트 S1 은 60/40 빈 버킷에서 ×1.130 (보병 딜 지분 6/46)");

  // (3) 시트 60행 × 리더 대안 × 병비 전부 — 둘 다 20% 계열(×1.200) 아래이고, 전체 영웅 추천·Top 5 어디에도 안 든다.
  //     고치기 전: 전체 영웅 추천에 플린트 21행·아모세 13행, Top 5 에 같은 영웅 2~3장(로건·필리·진먼 60/40 → 미아 + 플린트 2장).
  const a = boot("ko");
  a.js("var __dInf=null;var __rInf=render;render=function(d){__dInf=d;return __rInf(d);};");
  const pickIds = (html, id) => { const i = html.indexOf('id="' + id + '"'); if (i < 0) return null;
    const b = /<p><b>([\s\S]*?)<\/b><\/p>/.exec(html.slice(i)); return b ? [...b[1].matchAll(/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]) : []; };
  const T = ["flint", "ahmose"], inRec = [], inTop = [], high = [];
  let runs = 0, seen = {flint: 0, ahmose: 0};
  for (const c of E.SHEET_COMPS) for (const i of c.l[0]) for (const l of c.l[1]) for (const m of c.l[2]) for (const v of c.rs) {
    runs++;
    const html = a.leaders(i, l, m).mine(v).gcap(c.g).render(), d = a.js("__dInf"), tag = [i, l, m].join("+") + " " + v.join("/");
    for (const t of T) { const x = d.rank.filter(q => q.h.id === t)[0]; if (!x) continue; seen[t]++; if (!(x.mul < 1.2 - 1e-9)) high.push(t + " ×" + x.mul.toFixed(3) + " @ " + tag); }
    const all = pickIds(html, "recAll") || pickIds(html, "rec") || [];
    if (all.some(x => T.includes(x))) inRec.push(tag + " → " + all.join(","));
    (d.combos || []).forEach(k => { if (k.cls.some(q => q.mem.some(x => T.includes(x.h.id)))) inTop.push(tag); });
  }
  ok(runs >= 140 && seen.flint >= 130 && seen.ahmose >= 100, "스윕이 실제로 돌았다 (플린트·아모세가 후보에 있는 편성 수)", runs + "회 · 플린트 " + seen.flint + " · 아모세 " + seen.ahmose);
  ok(high.length === 0, "시트 편성 어디서도 조이너 플린트·아모세가 20% 계열(×1.200)을 넘지 않는다", high.slice(0, 3).join(" | "));
  ok(inRec.length === 0, "시트 편성 어디서도 플린트·아모세가 계산 추천(전체 영웅)에 들지 않는다", inRec.slice(0, 3).join(" | "));
  ok(inTop.length === 0, "시트 편성 어디서도 플린트·아모세가 버킷 조합 Top 5 에 들지 않는다", inTop.slice(0, 3).join(" | "));

  // (4) 리더 아모세 — D 버킷에는 창·궁 몫만 들어가고, 뺀 몫을 화면이 숨기지 않는다(버킷 맵 문단 + 병종 전용 표의 태그).
  const hk = boot("ko").leaders("ahmose", "reina", "lynn").mine([60, 40, 0]).gcap(4).render();
  const dk = (() => { const b = boot("ko"); b.js("var __dInf=null;var __rInf=render;render=function(d){__dInf=d;return __rInf(d);};");
    b.leaders("ahmose", "", "").mine([60, 40, 0]).gcap(4).render(); return b.js("JSON.stringify({D:__dInf.buck.D,offs:__dInf.offs.map(x=>x.hero.id+'/'+x.tgt)})"); })();
  ok(JSON.parse(dk).offs.join(",") === "ahmose/infantry" && Math.abs(JSON.parse(dk).D - 1.06) < 1e-9, "리더 아모세의 D 버킷은 60/40 에서 1.06 (창·궁 몫만)", dk);
  const offP = (/<p class="cap" data-k="off">([\s\S]*?)<\/p>/.exec(hk) || [0, ""])[1];
  ok(/배율에서 뺀 몫/.test(offP) && offP.includes("Viper Formation") && offP.includes("보병 몫") && /나머지 몫은 그대로 계산/.test(offP),
     "버킷 맵이 뺀 몫을 적는다 — 아모세 Viper Formation (보병 몫)", offP.replace(/<[^>]+>/g, "").slice(0, 80));
  const rowsV = hk.split("<tr").filter(s => s.includes("Viper Formation") && s.includes("</td><td>"));
  const tagged = rowsV.filter(s => s.includes(">배율 제외</span>"));
  ok(rowsV.length >= 2 && tagged.length === 1 && tagged[0].includes("<td>보병</td>"),
     "병종 전용 표에서 보병 몫 행에만 「배율 제외」 태그가 붙는다 (창·궁 몫 행에는 없다)", rowsV.length + "행 · 태그 " + tagged.length);
  ok(!/data-k="off"/.test(boot("ko").leaders("flint", "philly", "zinman").mine([60, 40, 0]).gcap(4).render()), "뺀 몫이 없는 리더 구성에서는 그 문단이 안 뜬다");
  const he = boot("en").leaders("ahmose", "reina", "lynn").mine([60, 40, 0]).gcap(4).render();
  ok(/data-k="off">[^<]*Left out of the score/.test(he) && !/[가-힣]/.test((/<p class="cap" data-k="off">([\s\S]*?)<\/p>/.exec(he) || [0, ""])[1]) && he.includes(">not scored</span>"),
     "영어 화면도 뺀 몫을 적는다 (한글 잔존 없음)");

  // (5) 조이너 아모세의 판정 라벨은 계산에 드는 몫(창·궁)을 본다 — 보병 비중으로 "정상" 이라고 적으면 뺀 몫을 근거로 삼는 셈이다.
  { const b = boot("ko"); b.js("var __dInf=null;var __rInf=render;render=function(d){__dInf=d;return __rInf(d);};");
    b.leaders("jeronimo", "mia", "alonso").mine([100, 0, 0]).gcap(4).render();
    const x = JSON.parse(b.js("JSON.stringify((function(){var x=__dInf.rank.filter(function(q){return q.h.id==='ahmose';})[0];return {mul:x.mul,cond:x.cond,detail:x.detail};})())"));
    ok(Math.abs(x.mul - 1) < 1e-9 && /^dead\|/.test(x.cond) && x.detail.some(t => /보병 몫은 배율 제외/.test(t)),
       "보병 100% 편성에서 조이너 아모세는 ×1.000 · 사망 판정 — 계산에 드는 창·궁 몫이 0 이다", JSON.stringify(x).slice(0, 160)); }

  // (6) 가정 문구 — 화면이 새 값을 적는다(0.3 이 남아 있으면 계산과 화면이 어긋난다).
  ok(/보병 가중치 0\.1/.test(E.STR.assump[0]) && /infantry weighted 0\.1/.test(E.STR.assump[1]) && !/0\.3/.test(E.STR.assump[0] + E.STR.assump[1]) &&
     /아모세 S1 의 보병 몫/.test(E.STR.assump[0]) && /infantry part of Ahmose/.test(E.STR.assump[1]), "계산 가정 문구가 보병 가중치 0.1 · 아모세 보병 몫 제외를 적는다");
}

// ── 편성 저장 · 이전 편성 (2026-11-11) ──────────────────────────────────
// 마지막 편성은 다음에 열었을 때 그대로 되살아나고, 그 전에 조합했던 편성은 칩 목록으로 남는다(src/render.js 「편성 저장 · 이전 편성」).
// 기본 스텁에는 localStorage 도 타이머도 없다 — 위의 모든 절이 그 상태로 돌았으니 "저장이 막혀도 계산은 돈다" 는 이미 검사된 셈이고,
// 여기서는 가짜 저장소·가짜 타이머를 넣어 규칙을 본다.
section("편성 저장 · 이전 편성");
{
  const KEY = "wos-calc:comp:v1";
  const fakeLS = (init = {}) => { const m = new Map(Object.entries(init));
    return {getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, raw: () => m.get(KEY)}; };
  const fakeTimers = () => { const q = new Map(); let n = 0;
    return {setTimeout: f => { q.set(++n, f); return n; }, clearTimeout: id => { q.delete(id); },
            fire: () => { const fs = [...q.values()]; q.clear(); fs.forEach(f => f()); }, pending: () => q.size}; };
  // 사용자가 입력을 건드린 것과 같은 일 — init 의 touched() 가 하는 순서 그대로
  const touch = a => { a.js("showSums();calc();luTrack()"); return a; };
  const set = (a, lead, ratio, gcap) => touch(a.mode("rally").leaders(...lead).gcap(gcap).mine(ratio));
  const stored = ls => JSON.parse(ls.raw() || "{}");
  const chips = a => (a.el("hist").innerHTML.match(/class="hchip"/g) || []).length;
  const keys = a => [...a.el("hist").innerHTML.matchAll(/class="hgo" data-k="([^"]+)"/g)].map(m => m[1]);
  const A = [["jeronimo", "mia", "wayne"], [48, 4, 48], 6], B = [["flint", "philly", "zinman"], [60, 40, 0], 2], C = [["hector", "norah", "lynn"], [50, 20, 30], 5];
  const kOf = ([l, r, g]) => "rally|" + l.join(",") + "|" + r.join("/") + "|" + g;

  // ── 저장소가 없는 환경 ──
  {
    const a = boot("ko", {}, {reset: false});
    const empty = JSON.parse(a.js("JSON.stringify(luRead())"));
    ok(empty.cur === null && empty.hist.length === 0, "저장소가 없으면 빈 상태로 읽는다");
    let threw = null; try { set(a, A[0], A[1], A[2]); a.js("histDel('x');histLoad('x')"); } catch (e) { threw = e; }
    ok(!threw && /id="sheet"/.test(a.el("out").innerHTML) && a.el("hist").innerHTML === "", "저장소가 없어도 계산·기록 호출이 던지지 않고 목록은 비어 있다", threw ? String(threw) : "");
  }

  // ── ① 마지막 편성이 다음에 열었을 때 그대로다 ──
  {
    const ls = fakeLS(), a = boot("ko", {localStorage: ls}, {reset: false});
    a.mode("rally").leaders(...A[0]).gear(8).gcap(6).mine(A[1]).enemy([60, 40, 0]); a.js("document.getElementById('skHeavy').checked=true"); touch(a);
    const html1 = a.el("out").innerHTML;
    const b = boot("ko", {localStorage: ls}, {reset: false});
    const got = {l: ["hInf", "hLan", "hMar"].map(i => b.el(i).value), w: ["wInf", "wLan", "wMar"].map(i => b.el(i).value), r: ["r1", "r2", "r3"].map(i => b.el(i).value),
                 e: ["e1", "e2", "e3"].map(i => b.el(i).value), g: b.el("gcap").value, atk: b.el("mAtk").classList.contains("on"), sk: b.el("skHeavy").checked};
    ok(got.l.join() === A[0].join() && got.w.join() === "8,8,8" && got.r.join() === "48,4,48" && got.e.join() === "60,40,0" && got.g === "6" && got.atk && got.sk === true,
       "다시 열면 리더·전무·내 병비·상대 병비·서버 세대·모드·토글이 그대로다", JSON.stringify(got));
    ok(b.el("out").innerHTML === html1, "다시 연 화면의 결과가 닫기 전과 글자 하나까지 같다");
    ok(/웨인/.test(b.el("sMar").innerHTML), "초상 픽커 표시도 되살린 리더를 따른다 (숨은 select 만 바뀌고 픽커가 옛 영웅을 보이면 안 된다)", b.el("sMar").innerHTML.slice(0, 80));
    // 수성 모드 · 리더를 전부 비운 상태도 "마지막 편성" 이다
    a.mode("defender"); touch(a);
    const c = boot("ko", {localStorage: ls}, {reset: false});
    ok(c.el("mDef").classList.contains("on") && !c.el("mAtk").classList.contains("on"), "수성 모드로 닫았으면 수성 모드로 열린다");
    a.leaders("", "", ""); touch(a);
    const d = boot("ko", {localStorage: ls}, {reset: false});
    ok(d.el("hInf").value === "" && d.el("hLan").value === "" && d.el("hMar").value === "" && /리더를 한 명 이상/.test(d.el("out").innerHTML), "리더를 비운 채 닫았으면 비운 채로 열린다(기본 편성으로 덮지 않는다)");
    ok(JSON.parse(d.js("JSON.stringify(luRead().hist)")).every(x => x.l.some(Boolean)), "리더가 하나도 없는 편성은 이전 편성에 넣지 않는다");
  }

  // ── ② 언제 이전 편성에 넣는가 — 머물렀던 편성을 떠나는 순간 ──
  {
    const ls = fakeLS(), tm = fakeTimers(), a = boot("ko", {localStorage: ls, setTimeout: tm.setTimeout, clearTimeout: tm.clearTimeout}, {reset: false});
    ok(ls.raw() === undefined && a.el("hist").innerHTML === "", "처음 연 화면은 아무것도 저장하지 않고 목록도 비어 있다");
    tm.fire();
    set(a, ...A);
    ok(stored(ls).hist.length === 0 && stored(ls).cur.l.join() === A[0].join(), "처음 뜬 기본 편성은 건드리지 않고 떠나면 기록하지 않는다 — 고른 적이 없는 편성이다", JSON.stringify(stored(ls).hist));
    set(a, ...B);
    ok(stored(ls).hist.length === 0, "금방 지나간 편성(머무르기 전에 바꾼 것)은 기록하지 않는다 — 리더를 하나씩 바꾸는 중간 상태가 쌓이지 않는다");
    ok(tm.pending() === 1, "머무는 시간을 재는 타이머는 한 번에 하나다(건드릴 때마다 다시 잰다)", String(tm.pending()));
    const before = a.el("hist").innerHTML, rawBefore = ls.raw();
    tm.fire();
    ok(a.el("hist").innerHTML === before && ls.raw() === rawBefore, "타이머는 표시만 세운다 — 화면도 저장값도 건드리지 않는다(칩을 누르려는 찰나에 목록이 밀리지 않는다)");
    set(a, ...C);
    ok(keys(a).join(" ; ") === kOf(B), "머물렀던 편성을 떠나면 그 편성이 이전 편성에 들어간다", keys(a).join(" ; "));
    tm.fire(); set(a, ...B);
    ok(keys(a).join(" ; ") === kOf(C) && stored(ls).hist.map(x => x.l[0]).join() === "hector,flint",
       "지금 화면의 편성은 목록에서 빠진다 — 저장에는 남아 있고 칩만 안 그린다", keys(a).join(" ; ") + " / " + stored(ls).hist.map(x => x.l[0]).join());
    tm.fire(); set(a, ...A);
    ok(keys(a).join(" ; ") === [kOf(B), kOf(C)].join(" ; ") && stored(ls).hist.length === 2, "같은 편성은 한 번만 남고 맨 앞으로 올라온다(가장 최근에 떠난 편성이 첫 칩)", keys(a).join(" ; "));
    // 딸린 값(전무·상대 병비·토글)은 같은 편성으로 본다 — 칩이 늘지 않고 값만 최신으로 덮인다
    tm.fire(); a.gear(4).enemy([70, 30, 0]); touch(a); a.gear(6); touch(a);
    ok(stored(ls).hist.length === 2 && tm.pending() === 0, "전무·상대 병비만 고치는 것은 편성을 떠나는 게 아니다", stored(ls).hist.length + "개");
    set(a, ...C);
    const top = stored(ls).hist[0];
    ok(top.l.join() === A[0].join() && top.w.join() === "6,6,6" && top.e.join() === "70,30,0", "떠날 때의 전무·상대 병비가 그 편성과 같이 저장된다", JSON.stringify(top));
    // 기본 편성이라도 사용자가 건드리고 머물렀으면 조합한 편성이다
    const ls2 = fakeLS(), tm2 = fakeTimers(), b = boot("ko", {localStorage: ls2, setTimeout: tm2.setTimeout, clearTimeout: tm2.clearTimeout}, {reset: false});
    b.mode("rally").gear(7); touch(b); tm2.fire(); set(b, ...A);
    ok(stored(ls2).hist.length === 1 && stored(ls2).hist[0].l.join() === "jeronimo,mia,alonso", "기본 편성도 건드리고 머문 뒤 떠나면 기록한다", JSON.stringify(stored(ls2).hist.map(x => x.l)));

    // 리더 픽커를 열어 둔 동안은 머문 시간으로 세지 않는다 — 리더 셋을 차례로 바꾸는 중간 편성이 쌓이지 않게
    const ls3 = fakeLS(), tm3 = fakeTimers(), c = boot("ko", {localStorage: ls3, setTimeout: tm3.setTimeout, clearTimeout: tm3.clearTimeout}, {reset: false});
    const h3 = () => stored(ls3).hist.map(x => x.l[0]).join();
    set(c, ...A); c.el("pLan").open = true; tm3.fire();
    ok(tm3.pending() === 1, "픽커가 열려 있을 때 타이머가 울리면 머문 것으로 치지 않고 다시 잰다", String(tm3.pending()));
    set(c, ...B);
    ok(h3() === "", "픽커를 열어 둔 채 흐른 시간은 머문 시간이 아니다 — 그사이의 편성은 기록하지 않는다", h3());
    c.el("pLan").open = false; tm3.fire(); set(c, ...C);
    ok(h3() === "flint", "픽커를 닫고 머물렀으면 떠날 때 기록한다", h3());
    // 칩으로 불러온 편성은 타이머를 기다리지 않는다 — 이미 조합했던 편성이다. 칩을 이어서 눌러도 "방금 떠난 편성이 첫 칩" 이 지켜져야 한다
    tm3.fire(); set(c, ...A); tm3.fire();                       // 저장 [C, B] · 지금 A(머묾)
    c.js("histLoad(" + JSON.stringify(kOf(B)) + ")");           // 저장 [A, C, B] · 지금 B
    ok(tm3.pending() === 0, "불러온 편성에는 머무는 시간 타이머를 걸지 않는다", String(tm3.pending()));
    set(c, ...C);                                               // 타이머를 한 번도 안 울린 채 입력을 바꾼다 → 저장 [B, A, C] · 지금 C
    ok(keys(c).join(" ; ") === [kOf(B), kOf(A)].join(" ; "), "불러온 편성은 곧바로 머문 것으로 친다 — 불러오자마자 입력을 바꿔도 그 편성이 첫 칩으로 올라온다", keys(c).join(" ; "));
    // 칩을 눌러 떠날 때만은 머문 시간을 묻지 않는다 — 방금 만든(아직 안 머문) 편성을 칩으로 덮어도 잃지 않는다. 독립 검증이 짚은 자리다
    const D = [["jeronimo", "philly", "alonso"], [40, 20, 40], 4];
    set(c, ...D);
    ok(tm3.pending() === 1 && keys(c).indexOf(kOf(D)) < 0 && h3().split(",").length === 3, "입력으로 바꾼 직후의 편성은 아직 머문 게 아니다(타이머가 돌고 있다)", tm3.pending() + " · " + h3());
    c.js("histLoad(" + JSON.stringify(kOf(A)) + ")");
    ok(keys(c)[0] === kOf(D) && c.el("hLan").value === "mia", "칩을 눌러 떠나면 머문 적 없는 편성도 맨 앞 칩으로 남는다 — 만들던 편성으로 되돌아갈 수 있다", keys(c).join(" ; "));
    c.js("histLoad(" + JSON.stringify(kOf(D)) + ")");
    ok(c.el("hLan").value === "philly" && c.el("r1").value === "40" && keys(c)[0] === kOf(A), "첫 칩을 누르면 방금 화면으로 되돌아간다(왕복)", keys(c).join(" ; "));
    // 다만 리더가 하나도 없는 화면은 칩으로 떠나도 남기지 않는다
    c.leaders("", "", ""); touch(c); c.js("histLoad(" + JSON.stringify(kOf(A)) + ")");
    ok(stored(ls3).hist.every(x => x.l.some(Boolean)), "리더가 없는 화면은 칩으로 떠나도 기록하지 않는다");

    // 되살린 편성도 이미 조합했던 편성이다 — 열자마자 다른 편성으로 바꿔도(타이머가 한 번도 안 울려도) 기록한다.
    // 사보타주에서 이 자리가 비어 있었다: init 의 LU_SETTLED=!!saved 를 false 로 바꿔도 단위 검사가 전부 통과했다.
    const curA = {m: "rally", l: A[0], w: ["10", "10", "10"], r: A[1].map(String), e: ["", "", ""], g: String(A[2]), sk: 0};
    const ls4 = fakeLS({[KEY]: JSON.stringify({v: 1, cur: curA, hist: []})}), tm4 = fakeTimers();
    const r4 = boot("ko", {localStorage: ls4, setTimeout: tm4.setTimeout, clearTimeout: tm4.clearTimeout}, {reset: false});
    ok(r4.el("hMar").value === "wayne" && tm4.pending() === 0, "되살린 편성으로 열 때는 타이머를 걸지 않는다", r4.el("hMar").value + " · " + tm4.pending());
    set(r4, ...B);
    ok(stored(ls4).hist.map(x => x.l[0]).join() === "jeronimo" && keys(r4).join(" ; ") === kOf(A),
       "되살린 편성은 열자마자 떠나도 기록한다 — 지난번에 조합했던 편성이다", keys(r4).join(" ; "));
  }

  // ── ③ 불러오기 · 지우기 · 상한 ──
  {
    const ls = fakeLS(), a = boot("ko", {localStorage: ls}, {reset: false});
    a.js("HIST_SETTLE_MS=0");   // 타이머 없이 — 건드리는 즉시 머문 것으로 친다
    a.mode("rally").leaders(...A[0]).gear(9).gcap(A[2]).mine(A[1]).enemy([40, 0, 60]); touch(a);
    set(a, ...B); a.gear(10).enemy(["", "", ""]); touch(a);
    set(a, ...C);
    ok(keys(a).join(" ; ") === [kOf(B), kOf(A)].join(" ; "), "칩 순서는 최근에 떠난 편성부터다", keys(a).join(" ; "));
    const cOut = a.el("out").innerHTML;
    a.js("histLoad(" + JSON.stringify(kOf(A)) + ")");
    const got = {l: ["hInf", "hLan", "hMar"].map(i => a.el(i).value).join(), w: a.el("wInf").value, r: ["r1", "r2", "r3"].map(i => a.el(i).value).join("/"), e: ["e1", "e2", "e3"].map(i => a.el(i).value).join("/"), g: a.el("gcap").value};
    ok(got.l === A[0].join() && got.w === "9" && got.r === "48/4/48" && got.e === "40/0/60" && got.g === "6", "칩을 누르면 그 편성의 리더·전무·병비·상대 병비·세대가 입력칸에 들어간다", JSON.stringify(got));
    ok(a.el("out").innerHTML !== cOut && /웨인/.test(a.el("out").innerHTML) && /웨인/.test(a.el("sMar").innerHTML), "결과와 초상 픽커가 불러온 편성으로 바뀐다");
    ok(keys(a).join(" ; ") === [kOf(C), kOf(B)].join(" ; ") && stored(ls).cur.l.join() === A[0].join(),
       "불러오면 방금까지의 편성이 맨 앞에 생기고 불러온 편성은 목록에서 빠진다", keys(a).join(" ; "));
    a.js("histLoad(" + JSON.stringify(kOf(B)) + ")"); a.js("histLoad(" + JSON.stringify(kOf(C)) + ")");
    ok(keys(a).join(" ; ") === [kOf(B), kOf(A)].join(" ; "), "칩을 이어서 눌러도 방금 떠난 편성이 첫 칩이다", keys(a).join(" ; "));
    a.js("histDel(" + JSON.stringify(kOf(B)) + ")");
    ok(keys(a).join(" ; ") === kOf(A) && stored(ls).hist.map(x => x.l[0]).join() === "jeronimo,hector" && stored(ls).cur.l.join() === C[0].join(), "✕ 는 그 편성만 지운다 — 지금 편성과 나머지는 그대로다", keys(a).join(" ; "));
    a.js("histLoad('rally|nobody|0/0/0|1')");
    ok(a.el("hInf").value === C[0][0], "목록에 없는 키로 불러오면 아무 일도 없다");
    // 다른 탭이 그사이 칩을 지웠다 — 이 탭의 칩은 묵은 채다. 그 칩을 누르면 편성은 그대로 두고 목록만 지금 저장값으로 다시 그린다(죽은 칩이 남지 않게)
    const st = stored(ls); st.hist = st.hist.filter(x => x.l[0] !== A[0][0]); ls.setItem(KEY, JSON.stringify(st));
    ok(keys(a).join(" ; ") === kOf(A), "(전제) 저장값만 바뀌었을 때 화면의 칩은 아직 그대로다", keys(a).join(" ; "));
    a.js("histLoad(" + JSON.stringify(kOf(A)) + ")");
    ok(keys(a).length === 0 && a.el("hInf").value === C[0][0], "이미 지워진 칩을 누르면 편성은 안 바뀌고 그 칩이 목록에서 사라진다", keys(a).join(" ; "));
    // 상한 — 서로 다른 편성 15개
    for (let i = 0; i < 15; i++) set(a, A[0], [40 + i, 10, 50 - i], 6);
    const h = stored(ls).hist;
    ok(h.length === 12 && h[0].r.join("/") === "53/10/37" && chips(a) === 12, "이전 편성은 12개까지다 — 오래된 것부터 밀려난다", h.length + "개 · 첫 칩 " + h[0].r.join("/") + " · 화면 " + chips(a));
    ok(h.every((x, i) => i === 0 || h[i - 1].t >= x.t), "저장 순서가 시각 내림차순이다");
  }

  // ── ④ 칩이 싣는 것 ──
  {
    const ls = fakeLS(), a = boot("ko", {localStorage: ls}, {reset: false});
    a.js("HIST_SETTLE_MS=0");
    a.mode("defender").leaders("jeronimo", "", "wayne").gear(10).gcap(99).mine([60, 40, 0]).enemy([40, 20, 40]); touch(a);
    a.enemy(["", "", ""]); set(a, ...A); set(a, ...B);
    const nm = id => a.js("HN(byId[" + JSON.stringify(id) + "])");
    const html = a.el("hist").innerHTML, first = html.split('class="hchip"')[1] || "", second = html.split('class="hchip"')[2] || "";
    ok(/이전 편성/.test(html) && /이 브라우저에만 저장/.test(html), "목록 머리가 무엇인지 · 어디에 저장되는지를 적는다");
    // 영웅 이름은 데이터에서 읽는다 — 표기를 여기 박아 두면 이름을 고칠 때 엉뚱한 검사가 깨진다(미아의 한글 표기는 위키를 따라 「미야」다)
    const tipA = 'title="' + A[0].map(nm).join(" · ") + ' — 공성 · 48/4/48 · Gen 6 이하"';
    ok(/⚔️/.test(first) && /<b>48\/4\/48<\/b>/.test(first) && />G6</.test(first) && first.includes(tipA),
       "칩에 모드 · 내 병비 · 서버 세대가 보이고 툴팁에 리더 이름이 있다(상대 병비를 안 넣은 편성은 그 말이 없다)", first.slice(0, 260));
    ok(/🛡️/.test(second) && /class="hnone"/.test(second) && />전체</.test(second) && second.includes('title="' + nm("jeronimo") + " · " + nm("wayne") + " — 수성 · 60/40/0 · 세대 전체 · 상대 40/20/40\""),
       "수성 · 빈 리더 칸(칩에는 – 자리, 툴팁에는 고른 이름만) · 세대 전체 · 상대 병비도 그대로 싣는다", second.slice(0, 300));
    const imgs = [...html.matchAll(/<img class="hpic sm"[^>]*alt="([^"]*)"[^>]*src="([^"]+)"/g)];
    ok(imgs.length === 5 && imgs.every(m => m[1] && existsSync(join(ROOT, decodeURIComponent(m[2])))) && !/onerror/.test(html),
       "칩의 초상은 실제 파일을 가리키고 alt 에 영웅 이름이 있다 — 그림이 안 떠도 누구의 편성인지 읽힌다", imgs.map(m => m[1]).join(","));
    ok((html.match(/class="hx"/g) || []).length === 2 && /aria-label="지우기: /.test(html) && /aria-label="불러오기: /.test(html), "칩마다 지우기 버튼이 있고 두 버튼 모두 접근명이 있다");
    // 언어 전환 — 칩도 다시 그린다
    a.setLang("en");
    const en = a.el("hist").innerHTML;
    ok(!/[가-힣]/.test(en) && /Earlier lineups/.test(en) && /Jeronimo · Mia · Wayne — Rally · 48\/4\/48 · Gen 6 and below/.test(en) && /Garrison/.test(en),
       "English 로 바꾸면 칩의 이름·툴팁·머리말이 영어가 된다(한글이 남지 않는다)", (en.match(/[가-힣]+/g) || []).slice(0, 5).join(","));
  }

  // ── ⑤ 깨진 저장값 — 버리되 죽지 않는다 ──
  {
    const good = {m: "rally", l: A[0], w: ["10", "10", "10"], r: ["48", "4", "48"], e: ["", "", ""], g: "6", sk: 0, t: 5};
    const cases = [["JSON 이 아니다", "{bad"], ["배열이다", "[1,2]"], ["null", "null"], ["빈 문자열", ""], ["cur 가 숫자다", '{"cur":7,"hist":"x"}']];
    cases.forEach(([nm, raw]) => {
      let a = null, threw = null; try { a = boot("ko", {localStorage: fakeLS({[KEY]: raw})}, {reset: false}); } catch (e) { threw = e; }
      ok(!threw && a.el("hInf").value === "jeronimo" && a.el("hist").innerHTML === "", "저장값이 깨졌으면(" + nm + ") 기본 편성으로 연다", threw ? String(threw) : "");
    });
    const dirty = {cur: {m: "whatever", l: ["mia", "mia", "nobody"], w: ["15", "-3", "x"], r: ["48", "4", "48"], e: ["", null, "1e9"], g: "42", sk: "yes"},
                   hist: [1, null, good, Object.assign({}, good, {t: 9}), {m: "rally", l: ["", "", ""], w: [], r: [], e: []}, Object.assign({}, good, {l: ["flint", "philly", "zinman"], g: "2"}), "x"]};
    const a = boot("ko", {localStorage: fakeLS({[KEY]: JSON.stringify(dirty)})}, {reset: false});
    const s = JSON.parse(a.js("JSON.stringify(luState())"));
    ok(s.m === "rally" && s.l.join("|") === "|mia|" && s.w.join() === "10,0," && s.e.join("|") === "||9999" && s.g === "99" && s.sk === 1,
       "엉뚱한 값은 칸마다 걸러서 되살린다 — 병종이 안 맞는 영웅·없는 영웅은 빈 칸, 범위 밖 숫자는 잘라 넣고, 없는 세대는 전체", JSON.stringify(s));
    const h = JSON.parse(a.js("JSON.stringify(luRead().hist)"));
    ok(h.length === 2 && h[0].l.join() === A[0].join() && h[0].t === 5 && h[1].l[0] === "flint", "이전 편성에서 쓰레기 · 리더 없는 것 · 같은 편성의 둘째는 버린다", JSON.stringify(h.map(x => x.l)));
    ok(chips(a) === 2, "걸러진 목록만 칩으로 나온다", String(chips(a)));
    // 세대는 숫자로 고쳐 쓴다 — "007" 을 그대로 넣으면 select 에 없는 옵션이라 칸이 빈다(독립 검증이 변조 저장값으로 잡았다)
    const gOf = g => a.js("luClean(" + JSON.stringify({m: "rally", l: ["", "", ""], w: ["", "", ""], r: ["", "", ""], e: ["", "", ""], g}) + ").g");
    ok(gOf("007") === "7" && gOf("17") === "17" && gOf("99") === "99" && gOf("18") === "99" && gOf("0") === "99" && gOf("x") === "99" && gOf(6) === "6",
       "서버 세대는 select 옵션 값 그대로(1~17 · 99)로만 되살린다", [gOf("007"), gOf("17"), gOf("18"), gOf("0"), gOf(6)].join(","));
  }

  // ── 소스 규칙 ──
  {
    const src = readFileSync(join(ROOT, "src", "render.js"), "utf8");
    const uses = src.split("\n").filter(l => /localStorage\./.test(l));
    ok(uses.length === 2 && uses.every(l => /try\{/.test(l)), "render.js 의 localStorage 접근은 읽기·쓰기 한 곳씩이고 둘 다 try 안이다", uses.map(l => l.trim().slice(0, 60)).join(" | "));
    ok(/LU_TIMER=setTimeout\(\(\)=>\{LU_TIMER=null;if\(luBusy\(\)\)luArm\(\);else LU_SETTLED=true;\},HIST_SETTLE_MS\)/.test(src), "머무는 시간 타이머의 콜백은 표시만 바꾸거나 다시 잴 뿐이다(DOM · 저장소를 건드리는 코드가 들어가면 안 된다)");
    const busy = (src.match(/function luBusy\(\)\{[^\n]*/) || [""])[0];
    ok(busy && !/innerHTML|\.value\s*=|\.open\s*=|luWrite|histDraw/.test(busy), "픽커가 열렸는지는 읽기만 한다", busy.slice(0, 120));
    ok(/ev\.detail>1\)return/.test(src), "칩 불러오기는 더블클릭의 둘째 클릭을 버린다");
    ok(/<div id="hist"><\/div>/.test(readFileSync(join(ROOT, "src", "part1.html"), "utf8")), "이전 편성 자리(#hist)가 입력 패널에 있다");
  }
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
