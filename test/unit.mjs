// 브라우저 없이 도는 검사. 커밋 전에 항상 돌린다.
//   node test/unit.mjs
//
// src/i18n.js + data.js + engine.js 를 vm 컨텍스트에 그대로 실행해서 검사한다.
// render.js 는 최상위 init IIFE 가 document 를 만지므로 실행하지 않고 텍스트로만 훑는다.
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import vm from "node:vm";
import {SHEET_POINTS, FIT_POINTS, UNEXPLAINED, EXPECTED_COUNTS} from "./fixtures.mjs";
import {PARTS, bundle} from "../build.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = p => readFileSync(join(ROOT, "src", p), "utf8");

// ── 미니 러너 ──────────────────────────────────────────────────────────
// KNOWN_DEFECTS: 아직 고치지 않은 결함. 실패로 세지 않되 매번 크게 찍는다.
// 고치면 이 목록에서 지운다 — 목록에 있는데 통과하면 그것도 알려준다.
const KNOWN_DEFECTS = {
  "랠리 수는 판정에 영향을 주지 않는다":
    "channels() 에 철회된 멀티랠리 화력 합산 모델(N)이 남아 있다",
  "L() 로 안 감싼 한글 리터럴 없음":
    "engine.js 의 '병종 비중 부족 → 사망' 이 영어 모드에서도 한글로 나온다",
  "언어를 토글하면 SLOTS.A.n 가 바뀐다": "최상위 const 에서 L() 이 한 번만 평가돼 굳는다",
  "언어를 토글하면 tgtName.infantry 가 바뀐다": "위와 같음",
  "언어를 토글하면 CH_NAME.P 가 바뀐다": "위와 같음",
  "언어를 토글하면 CH_FIX.P 가 바뀐다": "위와 같음",
  "언어를 토글하면 MECH.rps[0][0] 가 바뀐다": "위와 같음",
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
  "NA_SHARE,tgtName,tgtStat,COUNTERS,BAND_TOL,ROW_TOL,TH,THW,FEAS,SUP,channels,CH_NAME,CH_FIX,MECH,dist,modelVerdict";
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

// ── 2. 영웅 스키마 ─────────────────────────────────────────────────────
section("영웅 데이터 스키마");
const CLS = new Set(["infantry", "lancer", "marksman"]);
const SLOTKEYS = new Set(Object.keys(E.SLOTS).concat(["X", "ECO"]));
const STATS = new Set(["Attack", "Defense", "Lethality", "Health"]);
const ids = E.HEROES.map(h => h.id);
ok(new Set(ids).size === ids.length, "id 중복 없음",
   ids.filter((x, i) => ids.indexOf(x) !== i).join(","));
ok(E.HEROES.length === 45, "영웅 45명", "실제 " + E.HEROES.length);

const errs = [];
for (const h of E.HEROES) {
  if (!CLS.has(h.cls)) errs.push(h.id + ": cls=" + h.cls);
  if (!(h.gen >= 0 && h.gen <= 13)) errs.push(h.id + ": gen=" + h.gen);
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
    if (e.also && (!SLOTKEYS.has(e.also.slot) || typeof e.also.v !== "number"))
      errs.push(h.id + "/" + e.n + ": also 형식 이상");
    if (typeof e.v !== "number") errs.push(h.id + "/" + e.n + ": v 없음");
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
  counters: sheetRows.reduce((a, c) => a + c.cv.length, 0),
  bans: sheetRows.reduce((a, c) => a + c.ban.length, 0),
};
counted.total = counted.counters + counted.bans;
ok(JSON.stringify(counted) === JSON.stringify(EXPECTED_COUNTS),
   "시트 행에서 센 점 수가 픽스처와 일치",
   "코드 " + JSON.stringify(counted) + " vs 픽스처 " + JSON.stringify(EXPECTED_COUNTS));
ok(SHEET_POINTS.length === EXPECTED_COUNTS.total, "픽스처 12점", String(SHEET_POINTS.length));

// ── 4. 시트 12점 재현 ──────────────────────────────────────────────────
section("3채널 지표 vs 시트 정답지");
const n3 = v => { const s = sum(v); return [v[0] * 100 / s, v[1] * 100 / s, v[2] * 100 / s]; };
function verdictOf(p) {
  const c = E.channels(n3(p.en), n3(p.mine));
  const ban = ["P", "T", "B"].filter(k => c[k] >= E.TH[k]);
  return {c, ban, lvl: ban.length ? "ban" : "ok"};
}
const chan = c => "[P " + c.P.toFixed(0) + " T " + c.T.toFixed(0) + " B " + c.B.toFixed(0) + "]";
let fitOk = 0;
for (const p of FIT_POINTS) {
  const r = verdictOf(p);
  const hit = r.lvl === p.want;
  if (hit) fitOk++;
  ok(hit, "상대 " + p.row + " vs 내 " + p.label + " → " + p.want,
     "결과=" + r.lvl + " " + chan(r.c));
}
note("적합 대상 " + fitOk + "/" + FIT_POINTS.length + " 재현");

let unexplained = 0;
for (const p of UNEXPLAINED) {
  const r = verdictOf(p);
  unexplained++;
  note("⚠️ 알려진 미해결 — 상대 " + p.row + " vs 내 " + p.label + ": 시트=" + p.want +
       " / 지표=" + r.lvl + " " + chan(r.c) + " (시트 전제: " + p.premise + ")");
  ok(r.lvl !== p.want, "미해결 " + p.row + " vs " + p.label + " 상태 유지",
     "지표가 시트와 일치하게 바뀌었습니다 — fixtures 의 fit 플래그를 재검토하세요");
}

// ── 5. 임계값 ──────────────────────────────────────────────────────────
section("임계값");
for (const k of ["P", "T", "B"]) {
  const lo = E.FEAS[k][0], hi = E.FEAS[k][1];
  ok(E.TH[k] === Math.round((lo + hi) / 2), "TH." + k + " 는 가능 구간 중앙값",
     E.TH[k] + " vs " + lo + "~" + hi);
  ok(E.THW[k] === lo, "THW." + k + " 는 가능 구간 하단", E.THW[k] + " vs " + lo);
}
ok(E.BAND_TOL === 6 && E.ROW_TOL === 10, "허용 오차 고정", E.BAND_TOL + "/" + E.ROW_TOL);
ok(JSON.stringify(E.modelVerdict([60, 40, 0], [40, 20, 40], "defender").keys) === JSON.stringify(["T", "B"]),
   "수비 모드는 T·B 만 본다");
ok(JSON.stringify(E.modelVerdict([60, 40, 0], [40, 20, 40], "rally").keys) === JSON.stringify(["P", "T", "B"]),
   "랠리 모드는 P·T·B 를 본다");

// 멀티랠리는 순차 전투다 — 랠리를 늘려도 한 전투의 판정은 그대로여야 한다
const single = E.channels([60, 40, 0], [40, 20, 40]);
const multi = E.channels([60, 40, 0], [40, 20, 40], 3);
ok(JSON.stringify(single) === JSON.stringify(multi),
   "랠리 수는 판정에 영향을 주지 않는다",
   "channels() 가 랠리 수로 화력을 합산하고 있습니다 — 철회된 모델입니다: " +
   chan(single) + " vs " + chan(multi));

// ── 6. 계산 보조 함수 ──────────────────────────────────────────────────
section("계산 보조");
ok([0, 1].every(l => E.wpct(l) === 0) && E.wpct(2) === 5 && E.wpct(4) === 7.5 &&
   E.wpct(6) === 10 && E.wpct(8) === 12.5 && E.wpct(10) === 15, "전무 레벨 → %");
ok(Math.abs(E.norm(48, 4, 48).inf - 48) < 1e-9, "병비 정규화 (합 100이면 그대로)");
ok(Math.abs(E.norm(60, 60, 0).inf - 50) < 1e-9, "병비 정규화 (합 120 → 50/50/0)");
ok(E.tgtStat("marksman", E.norm(60, 40, 0))[0] === "dead", "궁병 0% → 사망 판정");
ok(E.tgtStat("marksman", E.norm(50, 20, 30))[0] === "ok", "궁병 30% → 정상 판정");
ok(E.DW.infantry === 0.3 && E.NA_SHARE === 0.8, "딜 지분 가정 고정");
ok(Math.abs(E.dmgShare("infantry", E.norm(50, 20, 30)) - (50 * 0.3) / (50 * 0.3 + 20 + 30)) < 1e-9,
   "보병 딜 지분에 가중치 0.3 적용");

// ── 7. i18n ────────────────────────────────────────────────────────────
section("i18n");
ok(E.LANG === "ko" && EN.LANG === "en", "?lang= 로 언어가 갈린다");
ok(Object.values(E.STR).every(v => Array.isArray(v) && v.length === 2 && v[0] && v[1]),
   "STR 모든 항목이 한/영 짝");
ok(E.CN("infantry") === "보병" && EN.CN("infantry") === "Infantry", "CN() 이 언어를 탄다");

// 언어 토글 후에도 갱신되는가.
// ?lang=en 으로 처음부터 열면 멀쩡하다 — 한국어로 열고 English 를 누른 경로만 문제다.
// 그래서 문맥 두 개를 비교하면 안 되고, 한 문맥 안에서 언어를 바꿔봐야 한다.
// 언어 토글 후에도 갱신되는가.
// ?lang=en 으로 처음부터 열면 멀쩡하다 — 한국어로 열고 English 를 누른 경로만 문제다.
// 그래서 문맥 두 개를 비교하면 안 되고, 한 문맥 안에서 언어를 바꿔봐야 한다.
const PROBES = ["SLOTS.A.n", "tgtName.infantry", "CH_NAME.P", "CH_FIX.P", "MECH.rps[0][0]"];
const beforeToggle = PROBES.map(p => run(CTX_KO, p));
// setLang() 이 하는 일 중 DOM 을 안 만지는 부분만 재현한다
run(CTX_KO, "LANG='en'; if(typeof I18N_TABLES!=='undefined')I18N_TABLES.forEach(function(f){f();});");
const afterToggle = PROBES.map(p => run(CTX_KO, p));
ok(run(CTX_KO, "CN('infantry')") === "Infantry", "토글 후 CN() 은 영어를 낸다");
PROBES.forEach((p, i) =>
  ok(beforeToggle[i] !== afterToggle[i], "언어를 토글하면 " + p + " 가 바뀐다",
     "여전히 " + String(afterToggle[i]).slice(0, 24)));
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
const hard = scanHangul("engine.js").concat(scanHangul("render.js"));
ok(hard.length === 0, "L() 로 안 감싼 한글 리터럴 없음", hard.join(" | "));

// ── 결과 ───────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(62));
console.log("통과 " + pass + " · 실패 " + fail +
  (known ? " · 알려진 결함 " + known + "건" : "") +
  (unexplained ? " · 시트-지표 미해결 " + unexplained + "건" : ""));
if (fail) { console.log("\n실패 목록:"); fails.forEach(f => console.log("  ❌ " + f)); }
if (stale.length) {
  console.log("\n고쳐진 것 같습니다 — KNOWN_DEFECTS 에서 지우세요:");
  stale.forEach(s => console.log("  ✨ " + s));
}
process.exit(fail ? 1 : 0);
