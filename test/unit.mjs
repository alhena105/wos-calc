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
import {SHEET_POINTS, QUIET_POINTS, GARRISON_POINTS, GARRISON_QUIET, EXPECTED_COUNTS} from "./fixtures.mjs";
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
  "NA_SHARE,tgtName,tgtStat,COUNTERS,BAND_TOL,ROW_TOL,MECH,dist,sheetVerdict,garrisonVerdict";
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
  const js = ["i18n.js", "data.js", "engine.js", "render.js"].map(src).join("")
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
const hard = scanHangul("engine.js").concat(scanHangul("render.js"));
ok(hard.length === 0, "L() 로 안 감싼 한글 리터럴 없음", hard.join(" | "));

// ── 8. 렌더 (최소 DOM 스텁) ────────────────────────────────────────────
// 브라우저 없이 render.js 까지 실제로 돌려서 "무엇이 어떤 순서로 나오는가"를 본다.
// 문자열 존재 검사만으로는 안 잡히는 것들이 여기서 걸린다 — 빈 화면, 문단 순서.
section("렌더");
{
  const rally = boot("ko").mine([40, 20, 40]).enemy([60, 40, 0]);
  const html = rally.render();
  ok(html.length > 500, "랠리 렌더 결과가 비어 있지 않다", html.length + "자");
  const heads = (html.match(/<h2>[^<]*/g) || []).map(h => h.slice(4, 5));
  ok(["①", "②", "③", "⑤", "⑥"].every(n => heads.includes(n)),
     "섹션 ①②③⑤⑥ 이 모두 렌더된다", heads.join(","));

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

// ── 9. 영웅 초상 ───────────────────────────────────────────────────────
// img/heroes/<영웅 id>.webp. 파일명이 곧 매핑이라 data.js 에 URL 을 두지 않는다.
section("영웅 초상");
{
  const dir = join(ROOT, "img", "heroes");
  const files = existsSync(dir) ? readdirSync(dir) : [];
  const have = new Set(files.filter(f => f.endsWith(".webp")).map(f => f.slice(0, -5)));
  const missing = E.HEROES.filter(h => !have.has(h.id)).map(h => h.id);
  ok(missing.length === 0, "영웅 45명 초상이 모두 있다", missing.join(","));
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

// ── 결과 ───────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(62));
console.log("통과 " + pass + " · 실패 " + fail + (known ? " · 알려진 결함 " + known + "건" : ""));
if (fail) { console.log("\n실패 목록:"); fails.forEach(f => console.log("  ❌ " + f)); }
if (stale.length) {
  console.log("\n고쳐진 것 같습니다 — KNOWN_DEFECTS 에서 지우세요:");
  stale.forEach(s => console.log("  ✨ " + s));
}
process.exit(fail ? 1 : 0);
