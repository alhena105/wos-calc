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
  "NA_SHARE,tgtName,tgtStat,COUNTERS,BAND_TOL,ROW_TOL,MECH,dist,sheetVerdict,garrisonVerdict,eVal,eK,eAdd,xShare,nCls,matchComp,matchComps,compRivals,SHEET_COMPS";
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
    if (e.also && (!SLOTKEYS.has(e.also.slot) || typeof e.also.v !== "number"))
      errs.push(h.id + "/" + e.n + ": also 형식 이상");
    // X 에 붙는 also 는 그 자체가 병종 한정이라 tgt/k 가 있어야 한다
    if (e.also && e.also.slot === "X" && (!e.also.tgt || !e.also.k))
      errs.push(h.id + "/" + e.n + ": also X 인데 tgt/k 누락");
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

// ── 8.5 X 슬롯 규칙 ────────────────────────────────────────────────────
// 확률·주기형은 일반 칸과 같은 잣대(기대값)로 환산한다. 예전에는 X 만 원값이
// 섞여 있어서 5턴마다 250% 짜리가 상시 250% 처럼 계산됐다.
section("X 슬롯");
{
  const X = E.HEROES.flatMap(h => h.exp.filter(e => e.slot === "X").map(e => ({h, e})));
  ok(X.length > 30, "X 스킬 표본", String(X.length));
  // 100% 를 넘는 X 는 대부분 환산을 빠뜨린 것이다. 진짜 예외는 여기 근거와 함께 적는다.
  const BIG_OK = {
    "Dreamcatcher": "표식 대상 한정이지만 주기·확률이 없는 상시 효과 (창병 +150%)",
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
    if (e.slot === "An") { cond *= 1 + e.v * E.NA_SHARE; continue; }
    // AH(타격 계열)는 칸이 아니다 — 합연산에 들어가지 않고 자기 계수로 곱한다
    if (e.slot === "AH") { cond *= 1 + e.v; continue; }
    // pc(미아)는 편성 병종 수로 기대값을 다시 낸다 — 원값 0.25 를 더하면 안 된다
    if (b[e.slot] !== undefined) b[e.slot] += E.eVal(e, rr);
    if (e.also && b[e.also.slot] !== undefined) b[e.also.slot] += e.also.v;
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
  //     보병 딜 지분 = 60*0.3 / (60*0.3 + 40) = 18/58 = 0.3103 → A 에 +0.31
  {
    const a = boot("ko").leaders("flint", "", "").mine([60, 40, 0]);
    const html = a.render();
    const m = html.match(/피해량 증가[\s\S]{0,400}?class="big">([\d.]+)/);
    const want = 1 + 1.0 * (60 * E.DW.infantry) / (60 * E.DW.infantry + 40);
    ok(m && Math.abs(+m[1] - +want.toFixed(2)) < 5e-3,
       "리더 플린트의 보병 피해량이 A 칸에 지분 환산으로 들어간다",
       "화면 " + (m && m[1]) + " / 기대 " + want.toFixed(2));
    ok(/Pyromaniac \+31% \(병종 지분 환산\)/.test(html),
       "② 구성 칸에 환산됐다는 표시가 남는다");
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
    const h = a.render();
    const m = h.match(/heroes\/mia\.webp[\s\S]{0,1400}?class="big">×([\d.]+)/);
    ok(m && Math.abs(+m[1] - +mul.toFixed(3)) < 5e-4,
       "미야 조이너 배율 @" + ratio.join("/") + " = ×" + mul.toFixed(3),
       "화면 ×" + (m && m[1]));
  }
  // pc 는 미야 S1 하나뿐이다 — 조용히 번지지 않게 못 박는다
  const pcs = [];
  for (const h of E.HEROES)
    for (const e of h.exp) if (e.pc) pcs.push(h.id + "/" + e.n);
  ok(pcs.join() === "mia/Bad Luck Streak", "pc 가 붙은 스킬은 미야 Bad Luck Streak 하나", pcs.join(" | "));

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

  // 회귀 표식: 예전에는 데이터 순서에 맡겨 그웬(이론·G5)이 헨드릭(시트·G8)을 앞섰다
  const at = id => rows.findIndex(x => x.h.id === id);
  const hen = at("hendrik"), gwen = at("gwen");
  ok(hen >= 0 && gwen >= 0 && rows[hen].mul === rows[gwen].mul && hen < gwen,
     "같은 ×1.250 에서 헨드릭(시트)이 그웬(이론)보다 앞",
     "헨드릭 " + (hen + 1) + "위 / 그웬 " + (gwen + 1) + "위");

  // 타이브레이크는 값을 건드리지 않는다 — 배율은 여전히 내림차순이다
  const desc = rows.every((x, i) => i === 0 || +rows[i - 1].mul >= +x.mul);
  ok(desc, "배율 자체는 여전히 내림차순이다");

  ok(/시트 등재 → 에픽 → 낮은 세대/.test(html), "타이브레이크 기준이 화면에 적혀 있다");
}

// ── N+6b. 전투 배율 — bk(X) 겹침과 pc 기대값 회귀 ──────────────────────
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
  const CASES = [
    ["renee",  "X(bk없음)", ["jeronimo", "renee", "greg"],   ["jeronimo", "mia", "greg"],   [60, 40, 0], 6],
    ["wayne",  "AH",        ["logan", "philly", "wayne"],    ["logan", "philly", "zinman"], [45, 5, 50], 6],
    ["gordon", "X(bk없음)", ["edith", "gordon", "bradley"],  ["edith", "mia", "bradley"],   [60, 40, 0], 7],
    ["flint",  "X(bk있음)", ["flint", "philly", "zinman"],   ["logan", "philly", "zinman"], [60, 40, 0], 2],
  ];
  for (const [id, kind, withL, without, r, g] of CASES) {
    const w = val(withL, r, g, id), o2 = val(without, r, g, id);
    ok(w !== null && o2 !== null && w < o2 - 1e-9,
       "리더가 이미 든 " + kind + " 스킬은 조이너로 다시 집을 때 깎인다 — " + id,
       "리더일 때 " + w + " · 아닐 때 " + o2);
  }
  // 회귀 표식: 예전 값(포화 0)으로 돌아가면 여기서 걸린다
  const renee = val(["jeronimo", "renee", "greg"], [60, 40, 0], 6, "renee");
  ok(renee < 1.5, "레니 자기 재선택이 옛 ×1.690 으로 돌아가지 않았다", String(renee));
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
  a.js("SHEET_EDGE=0");   // 이 절은 comboAll 자체를 보는 자리다 — 시트 우선을 끄고 순수 모델로 잰다
  const html = a.render();
  const st = html.indexOf('id="rec"');
  const ids = [...html.slice(st, html.indexOf("</b>", st)).matchAll(/img\/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]);
  const shown = +(html.slice(st, st + 1400).match(/배율 ×([\d.]+)/) || [0, 0])[1];
  // 정확한 명단을 박지 않는다 — 고르는 방법을 바꾸면(2026-09-12 탐욕) 명단은 움직인다.
  // 이 검사가 필요로 하는 건 "bk X 한 명 + 그와 같은 칸에 들어가는 조이너 + pc 한 명"뿐이다.
  // ⚠️ 추천 구성에 기대지 않는다 — 고르는 규칙을 바꾸면 명단이 움직인다(2026-09-13 실제로 그랬다).
  // 검사할 것은 comboAll 의 산수이므로 **조합을 직접 지정**해서 옛 계산과 다른지만 본다.
  const FIX = ["mia", "norah", "jessie", "jasser"];
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
      if (e.slot === "An") { x *= 1 + e.v * E.NA_SHARE; continue; }
      if (e.slot === "AH") { x *= 1 + E.eVal(e, rr); continue; }
      const v = mode === "rawPc" ? e.v : E.eVal(e, rr);
      if (b[e.slot] !== undefined) b[e.slot] += v;
      if (e.also && b[e.also.slot] !== undefined) b[e.also.slot] += e.also.v;
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
      if (e.slot === "An") { x *= 1 + e.v * E.NA_SHARE; continue; }
      if (e.slot === "AH") { x *= 1 + E.eVal(e, rr); continue; }
      if (b[e.slot] !== undefined) b[e.slot] += E.eVal(e, rr);
      if (e.also && b[e.also.slot] !== undefined) b[e.also.slot] += e.also.v;
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
    const tb = /⑤[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/.exec(html)[1];
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
  // ⚠️ 여기서는 **시트 우선(SHEET_EDGE)을 꺼야 한다.** 켜 두면 "시트를 보고 시트에 맞췄더니
  // 시트와 맞더라" 가 되어 검증이 아니라 순환논이다. 이 절은 **순수 모델**의 재현율만 잰다.
  // 시트 우선의 효과와 대가는 바로 아래 절에서 따로 잰다.
  const recOf = row => {
    const a = boot("ko").leaders(row.lead[0] || "", row.lead[1] || "", row.lead[2] || "").mine(row.r);
    a.el("gcap").value = String(row.gen);
    a.js("SHEET_EDGE=0");
    const html = a.render();
    const after = html.slice(html.indexOf('id="rec"'));
    const b = /<p><b>([\s\S]*?)<\/b><\/p>/.exec(after);
    return b ? [...b[1].matchAll(/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]) : [];
  };
  let first = 0, anyP = 0, totP = 0, anyA = 0, totA = 0;
  const missed = [];
  for (const row of SHEET_ROWS) {
    const got = recOf(row);
    ok(got.length === 4, "추천 4명이 네 명이다 — G" + row.gen + " " + row.r.join("/"), got.join(","));
    if (row.top.some(x => got.includes(x))) first++; else missed.push("G" + row.gen + " " + row.r.join("/"));
    for (const j of row.pri) { totP++; if (got.includes(j)) anyP++; }
    for (const j of row.all) { totA++; if (got.includes(j)) anyA++; }
  }
  const fp = first / SHEET_ROWS.length * 100, pp = anyP / totP * 100, ap = anyA / totA * 100;
  note("시트 #1 조이너가 추천 4명에 든 행 " + first + "/" + SHEET_ROWS.length + " (" + fp.toFixed(1) + "%)");
  note("시트 #1~#4 겹침 " + anyP + "/" + totP + " (" + pp.toFixed(1) + "%) · 대체 칸까지 " +
       anyA + "/" + totA + " (" + ap.toFixed(1) + "%)");
  // 하한선은 실측에서 여유를 두고 잡았다. 떨어지면 모델이 시트에서 멀어진 것이다.
  ok(fp >= 88, "시트 #1 조이너 재현이 88% 이상", fp.toFixed(1) + "% · 놓친 행: " + missed.slice(0, 4).join(", "));
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
  }

  // 캡션은 **쌍**으로 적혀 있다 — "등재만 92.3%/59.2% vs 계산순위 84.6%/50.4%".
  // 위 검사는 앞 쌍만 봤다. 뒤 쌍(#recAll)이 묵으면 "이쪽이 낫다"는 비교 자체가 거짓이 된다.
  // 그리고 캡션은 "한 행도 나빠지지 않았습니다" 라고 단언한다 — 그건 측정이지 수사가 아니므로
  // 여기서 실제로 센다. 2026-09-13 레니 bk 변경 때 이 세 가지가 한꺼번에 틀어졌다.
  {
    const both = row => {
      const a = boot("ko").leaders(row.lead[0] || "", row.lead[1] || "", row.lead[2] || "").mine(row.r);
      a.el("gcap").value = String(row.gen);
      a.js("SHEET_EDGE=0");
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
    a.js("SHEET_EDGE=0");   // 시트 우선은 일부러 배율을 낮추므로 여기서는 끈다
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
        add(e.slot,eVal(e,r));if(e.also)add(e.also.slot,eVal(e.also,r));}));
      const one=id=>{const e=byId[id].exp[0];
        if(e.slot==="X"){const p=w=>{const sh=xShare(w,r);
            return w.bk&&buck[w.bk]!==undefined?(buck[w.bk]+w.v*sh)/buck[w.bk]:1+w.v*sh;};
          return p(e)*(e.also&&e.also.slot==="X"?p(e.also):1);}
        if(e.slot==="An")return 1+e.v*NA_SHARE;
        if(e.slot==="AH")return 1+eVal(e,r);
        let m=1;const st=(sl,v)=>{const b=buck[sl];if(b!==undefined)m*=(b+v)/b;};
        st(e.slot,eVal(e,r)); if(e.also)st(e.also.slot,e.also.v); return m;};
      const combo=ids=>{const b=Object.assign({},buck);let x=1;
        const put=(sl,v)=>{if(b[sl]!==undefined)b[sl]+=v;};
        ids.forEach(id=>{const e=byId[id].exp[0];
          if(e.slot==="X"){const p=w=>{const sh=xShare(w,r);
              if(w.bk&&b[w.bk]!==undefined)put(w.bk,w.v*sh); else x*=1+w.v*sh;};
            p(e); if(e.also&&e.also.slot==="X")p(e.also); return;}
          if(e.slot==="An"){x*=1+e.v*NA_SHARE;return;}
          if(e.slot==="AH"){x*=1+eVal(e,r);return;}
          put(e.slot,eVal(e,r)); if(e.also)put(e.also.slot,e.also.v);});
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

// ── N+8. 애매하면 시트를 따른다 (SHEET_COMPS · SHEET_EDGE) ──────────────
section("애매하면 시트 우선");
{
  // ⚠️ 이 절의 "시트 재현율"은 **검증이 아니다.** 시트를 보고 시트 쪽으로 기울였으니
  // 올라가는 게 당연하다. 여기서 지켜야 하는 것은 두 가지다:
  //   ① 시트 행과 안 맞는 입력에서는 **아무 일도 일어나지 않는다**
  //   ② 시트를 따르느라 잃는 배율이 여유폭(2%) 안에 머문다
  const pick = (row, edge) => {
    const a = boot("ko").leaders(row.lead[0] || "", row.lead[1] || "", row.lead[2] || "").mine(row.r);
    a.el("gcap").value = String(row.gen);
    a.js("SHEET_EDGE=" + edge);
    const html = a.render();
    const after = html.slice(html.indexOf('id="rec"'));
    const b = /<p><b>([\s\S]*?)<\/b><\/p>/.exec(after);
    const ia = html.indexOf('id="recAll"');
    const ba = ia < 0 ? null : /<p><b>([\s\S]*?)<\/b><\/p>/.exec(html.slice(ia));
    const ids = b ? [...b[1].matchAll(/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]) : [];
    return {
      ids,
      // #recAll 은 SHEET_EDGE 와 무관하게 시트를 안 본다. 없으면 #rec 과 같다는 뜻이다.
      all: ba ? [...ba[1].matchAll(/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]) : ids,
      v: +(/전투 배율 ×([\d.]+)/.exec(after) || [0, 0])[1],
    };
  };
  // 모든 시트 행이 실제로 매칭되어야 한다 — 안 되면 SHEET_COMPS 가 픽스처와 어긋난 것이다
  let matched = 0;
  for (const row of SHEET_ROWS) {
    const a = boot("ko").leaders(row.lead[0] || "", row.lead[1] || "", row.lead[2] || "").mine(row.r);
    if (a.js("!!matchComp(" + JSON.stringify(row.lead) + ",norm(" + row.r.join(",") + ")," + row.gen + ")")) matched++;
  }
  ok(matched === SHEET_ROWS.length,
     "SHEET_ROWS 52행이 전부 SHEET_COMPS 에서 찾아진다 (두 표가 어긋나지 않았다)",
     matched + "/" + SHEET_ROWS.length);

  // 시트 행이면 **시트 칸을 그대로 채운다**(2026-09-13, 사용자 결정: 상한 없음).
  // 그래서 여기서 재는 것은 "얼마나 맞췄나"가 아니라 **얼마를 포기했나**다.
  let changed = 0, loss = 0, worst = 0, first0 = 0, first1 = 0, hit0 = 0, hit1 = 0, tot = 0;
  let cellHit = 0, cellHit0 = 0, cellHitAll = 0, cellTot = 0;
  // 픽 4명을 칸 4개에 **최대로** 배정한다. 앞에서부터 그리디로 채우면 순수 계산 쪽이
  // 순서 때문에 억울하게 낮게 잡힌다 — 두 모드를 같은 잣대로 재야 비교가 성립한다.
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
  for (const row of SHEET_ROWS) {
    const off = pick(row, 0), on = pick(row, 1);
    if (off.ids.join() !== on.ids.join()) changed++;
    const d = (off.v - on.v) / off.v * 100;
    loss += d; if (d > worst) worst = d;
    if (row.top.some(x => off.ids.includes(x))) first0++;
    if (row.top.some(x => on.ids.includes(x))) first1++;
    for (const j2 of row.pri) { tot++; if (off.ids.includes(j2)) hit0++; if (on.ids.includes(j2)) hit1++; }
    // 시트 「칸」 기준 — 이게 이 기능이 실제로 하는 일이다
    const a = boot("ko").leaders(row.lead[0] || "", row.lead[1] || "", row.lead[2] || "").mine(row.r);
    // 화면과 같은 행을 봐야 한다 — gcap 을 빼면 다른 세대 행이 잡힌다(2026-09-13 버그)
    const c = JSON.parse(a.js("JSON.stringify(matchComp(" + JSON.stringify(row.lead) +
      ",norm(" + row.r.join(",") + ")," + row.gen + "))"));
    if (c) {
      cellHit += maxFill(on.ids, c.j);      // 시트 우선 ON — 베낀 것이므로 100% 가 당연하다
      cellHit0 += maxFill(off.ids, c.j);    // 시트 우선 OFF (시트 등재 풀 안에서)
      cellHitAll += maxFill(off.all, c.j);  // 전체 풀 — 시트를 어느 쪽으로도 안 본다
      cellTot += c.j.length;
    }
  }
  note("명단이 바뀐 행 " + changed + "/" + SHEET_ROWS.length +
       " · 배율 손실 평균 " + (loss / SHEET_ROWS.length).toFixed(2) + "% · 최대 " + worst.toFixed(1) + "%");
  // ⚠️ 이 두 줄을 붙여 읽지 말 것 — 같은 칸을 재지만 **묻는 게 다르다.**
  //   위: 시트를 베끼도록 만들어 놓고 베꼈는지 본다 → 100% 가 나오는 게 당연하다(순환논).
  //   아래: 시트를 전혀 안 보고 계산만으로 골랐을 때 시트 칸에 얼마나 떨어지는가 → 이게 일치율이다.
  // 예전에는 위 줄만 "시트 칸 적중 100.0%" 로 찍혀서 로그만 보면 "다 맞았다" 로 읽혔다(2026-09-13).
  note("시트 칸 복사 확인 (SHEET_EDGE=1) " + cellHit + "/" + cellTot +
       " (" + (cellHit / cellTot * 100).toFixed(1) + "%) — 순환논 · 검증 아님");
  // ⚠️ "순수 계산" 이라고만 쓰면 과장이다 — 칸 내용은 안 베끼지만 **후보 풀이 시트 파생**이다
  // (poolS = s:1 = 시트 조이너 명단 · stack:1 = 시트가 두 칸 이상 적은 영웅).
  // 필터를 떼면 64.9% → 54.8% 로 내려간다. 그래서 두 줄로 나눠 찍는다(2026-09-14 검증 지적).
  note("진짜 일치   (SHEET_EDGE=0 · 시트 등재 풀 안에서) " + cellHit0 + "/" + cellTot +
       " (" + (cellHit0 / cellTot * 100).toFixed(1) + "%)");
  note("진짜 일치   (전체 풀 #recAll · 시트를 아예 안 봄) " + cellHitAll + "/" + cellTot +
       " (" + (cellHitAll / cellTot * 100).toFixed(1) + "%)");
  note("(참고 · 검증 아님) 시트 #1 재현 " + (first0 / SHEET_ROWS.length * 100).toFixed(1) + "% → " +
       (first1 / SHEET_ROWS.length * 100).toFixed(1) + "% · 겹침 " +
       (hit0 / tot * 100).toFixed(1) + "% → " + (hit1 / tot * 100).toFixed(1) + "%");
  // 시트 칸은 거의 다 채워야 한다. 못 채우는 칸은 리더 중복처럼 **넣을 수 없는** 자리뿐이다.
  // 이건 회귀 검사다 — matchComp 이나 pick4 의 시트 따라가기가 깨지면 여기서 잡힌다.
  // **모델이 시트와 맞는지 보는 검사가 아니다.** 그건 바로 아래 줄이다.
  ok(cellHit / cellTot >= 0.97, "시트 따라가기가 시트 칸을 97% 이상 베낀다 (복사 확인 · 검증 아님)",
     (cellHit / cellTot * 100).toFixed(1) + "%");
  // 진짜 하한선. 순수 모델이 시트에서 멀어지면 여기가 먼저 내려간다.
  // 실측에서 여유를 두고 잡았다 — 올라가면 하한선도 같이 올린다.
  // ⚠️ 0.60 은 너무 느슨했다 — 회귀 6종을 심어 보니 1종만 걸렸다(2026-09-14 검증).
  // 0.63 이면 「탐욕 대신 상위4 자르기」·「투자 문턱 뒤집기」까지 잡히고 여유가 4칸 남는다.
  ok(cellHit0 / cellTot >= 0.63, "시트 등재 풀 안의 순수 계산이 시트 칸의 63% 이상에 떨어진다",
     (cellHit0 / cellTot * 100).toFixed(1) + "%");
  // ⚠️ 위 지표는 `#rec` 을 읽으므로 **bk·AH 계열 회귀를 구조적으로 못 잡는다** — 플린트 같은
  // 시트 미등재 영웅이 밀려들어도 `poolS` 밖이라 안 보이기 때문이다. 그래서 전체 풀도 같이 잰다.
  ok(cellHitAll / cellTot >= 0.50, "전체 풀 순수 계산도 시트 칸의 50% 이상에 떨어진다",
     (cellHitAll / cellTot * 100).toFixed(1) + "%");
  // 대가에는 상한을 안 걸기로 했다(사용자 결정). 다만 **터무니없어지면** 알아야 하므로
  // 감시선만 남긴다. 실측 37.6% — 가장 큰 자리는 G6 60/40/0 제로니모·레니·그렉 이고,
  // 레니의 Nightmare Trace(X 추가딜, v=1.0, 포화 없음)가 ×1.690 이라 순수 계산이 크게 앞선다.
  // **리더 중복을 허용하면서 드러난 자리다** — 예전에는 자기 행에서 레니를 못 뽑아 가려져 있었다.
  ok(worst <= 45, "시트를 따르는 대가가 45% 를 넘는 행은 없다", worst.toFixed(1) + "%");
  ok(changed >= 10, "시트 행에서 실제로 판단이 바뀐다", String(changed));
  ok(hit1 > hit0 && first1 >= first0, "따르게 했으니 시트와 더 가까워진다", hit1 + " vs " + hit0);

  // ① 시트에 없는 편성에서는 아무 일도 일어나지 않아야 한다
  const odd = {lead: ["flint", "mia", "bradley"], r: [33, 34, 33], gen: 17};
  {
    const a = boot("ko").leaders(odd.lead[0], odd.lead[1], odd.lead[2]).mine(odd.r);
    ok(!a.js("!!matchComp(" + JSON.stringify(odd.lead) + ",norm(" + odd.r.join(",") + ")," + odd.gen + ")"),
       "시트에 없는 조합은 매칭되지 않는다");
    ok(pick(odd, 0).ids.join() === pick(odd, 0.02).ids.join(),
       "매칭이 없으면 시트 우선이 결과를 바꾸지 않는다", pick(odd, 0.02).ids.join());
  }
  // ①b 같은 리더·병비를 쓰는 행이 두 세대에 있으면 **세대가 맞는 쪽**을 잡아야 한다.
  // 예전에는 gcap 을 안 봐서 먼저 나온 Gen 7 행이 이겼고, 시트가 Gen 8 에 적어 둔 헨드릭 대신
  // Gen 7 의 패트릭이 나왔다. gcap 을 넘는 행은 아예 안 쓰고, 남은 것 중 세대가 가장 높은 행을 쓴다.
  {
    const lead = ["jeronimo", "mia", "bradley"], rr = [48, 4, 48];
    const at = g => {
      const a = boot("ko").leaders(lead[0], lead[1], lead[2]).mine(rr);
      return JSON.parse(a.js("JSON.stringify(matchComp(" + JSON.stringify(lead) +
        ",norm(" + rr.join(",") + ")," + g + "))"));
    };
    ok(at(7) && at(7).g === 7, "Gen 7 로 놓으면 Gen 7 행이 잡힌다", at(7) && String(at(7).g));
    ok(at(8) && at(8).g === 8, "Gen 8 로 놓으면 Gen 8 행이 잡힌다 (예전엔 Gen 7 이 이겼다)",
       at(8) && String(at(8).g));
    ok(!at(6), "Gen 6 로 놓으면 (그 리더 조합의 행이 Gen 7 부터라) 안 잡힌다");
    // 그 결과가 실제 추천에 나타난다 — 시트 Gen 8 행의 4번 칸은 헨드릭이다
    const a = boot("ko").leaders(lead[0], lead[1], lead[2]).mine(rr);
    a.el("gcap").value = "8";
    const html = a.render(), af = html.slice(html.indexOf('id="rec"'));
    const ids = [...(/<p><b>([\s\S]*?)<\/b><\/p>/.exec(af) || ["", ""])[1]
      .matchAll(/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]);
    ok(ids.includes("hendrik"),
       "Gen 8 제로니모·미아·브레들리 48/4/48 에서 헨드릭이 들어간다 (시트 Gen 8 행의 칸)", ids.join(","));
  }
  // ② 리더는 맞는데 병비가 멀면 매칭되지 않는다 (허용 오차 6)
  {
    const a = boot("ko").leaders("logan", "philly", "zinman").mine([10, 10, 80]);
    ok(!a.js('!!matchComp(["logan","philly","zinman"],norm(10,10,80),3)'),
       "리더가 같아도 병비가 멀면 매칭되지 않는다");
  }
  const HNko = id => E.byId[id].kr;
  // ②a-3 겹쳐 넣은 영웅의 장당 한계 배율을 **이 편성의 실제 값**으로 찍는가 (2026-09-13)
  //      예전에는 문단이 "둘째 장도 자기끼리 포화한다" 고 주장만 하고, 숫자는 일반론이거나
  //      다른 편성 예시였다. 노라 3장을 받은 사람이 자기 2·3장째를 화면에서 못 봤다.
  {
    const a = boot("ko").leaders("jeronimo", "mia", "gwen").mine([48, 4, 48]);
    a.el("gcap").value = "7";
    const html = a.render();
    const line = a.paras().filter(x => x.includes("↘"))[0] || "";
    ok(line.includes("노라"), "겹쳐 넣은 영웅의 장당 값 문단이 뜬다", line.slice(0, 80));
    const mg = [...line.matchAll(/×([\d.]+)/g)].map(m => +m[1]);
    ok(mg.length === 3, "노라 3장이면 값이 셋 찍힌다", mg.join(","));
    ok(mg.every((v, i) => i === 0 || v < mg[i - 1]),
       "장마다 값이 줄어든다 (포화가 실제로 반영돼 있다)", mg.join(" → "));
    // 핵심 교차검증 — 첫 장의 값은 ⑤ 순위표의 그 영웅 배율과 같아야 한다.
    // 다르면 둘 중 하나가 다른 것을 재고 있다는 뜻이다(영웅의 스킬을 전부 먹여서
    // 재면 여기가 어긋난다 — 실제로 그렇게 잘못 재어 본 적이 있다).
    // ⚠️ 초상은 리더 표에도 나온다. **× 가 들어 있는 행만** 봐야 한다 — 그냥 첫 <tr> 를
    // 잡으면 그 영웅이 리더인 케이스에서 엉뚱한 행을 읽는다(2026-09-14 지적).
    let cells = [];
    for (const part of html.split("<tr").filter(x => x.includes("norah.webp"))) {
      const m = [...("<tr" + part).split("</tr>")[0].matchAll(/×([\d.]+)/g)].map(x => +x[1]);
      if (m.length) { cells = m; break; }
    }
    ok(cells.length > 0 && Math.abs(cells[cells.length - 1] - mg[0]) < 1e-9,
       "첫 장의 값이 ⑤ 순위표의 그 영웅 배율과 같다 (S1 하나만 센다)",
       "표 " + cells[cells.length - 1] + " vs 문단 " + mg[0]);
    // 겹치지 않는 편성에서는 문단 자체가 없어야 한다
    const b = boot("ko").leaders("logan", "philly", "zinman").mine([60, 40, 0]);
    b.el("gcap").value = "3";
    ok(b.paras().filter(x => x.includes("↘")).length === 0,
       "겹치는 영웅이 없으면 그 문단이 안 뜬다");
    // 영어
    const e = boot("en").leaders("jeronimo", "mia", "gwen").mine([48, 4, 48]);
    e.el("gcap").value = "7";
    const el = e.paras().filter(x => x.includes("↘"))[0] || "";
    ok(el.includes("Norah") && !/[가-힣]/.test(el),
       "영어 화면에도 뜨고 한글이 새지 않는다", el.slice(0, 80));
  }

  // ②a-2 시트의 Alternative 칸 — 실어는 두되 판정에는 절대 안 들어간다 (2026-09-13)
  //     예전에는 이 정보가 데이터에 아예 없어서, 시트가 "넷을 못 구하면 이것도" 라고
  //     적어 준 69칸이 통째로 버려져 있었다. 화면에만 띄우고 순위에는 안 쓴다.
  {
    const rows = E.SHEET_COMPS;
    const withAlt = rows.filter(c => c.alt && c.alt.length);
    note("Alternative 칸을 실은 행 " + withAlt.length + "/" + rows.length +
         " · 칸 " + withAlt.reduce((a, c) => a + c.alt.length, 0) + "개");
    ok(withAlt.length >= 45, "시트의 Alternative 칸이 실려 있다", withAlt.length + "행");
    // 영웅 id 가 실재하는가 — 오타 하나면 화면에 undefined 가 찍힌다
    const badId = [];
    rows.forEach(c => (c.alt || []).forEach(cell => cell.forEach(id => {
      if (!E.byId[id]) badId.push(c.g + ":" + id);
    })));
    ok(badId.length === 0, "alt 의 영웅 id 가 전부 실재한다", badId.join(", "));
    // 빈 칸을 실어 두면 화면에 빈 볼드가 찍힌다
    ok(rows.every(c => !c.alt || c.alt.every(cell => cell.length > 0)),
       "alt 에 빈 칸이 없다");

    // ⚠️ 핵심: alt 는 판정에 일절 안 들어간다.
    //    alt 에만 있고 j 에는 없는 영웅이 추천에 뽑히면, 그건 alt 때문이 아니라
    //    계산이 원래 고른 것이어야 한다 — alt 를 지워도 결과가 같아야 한다는 뜻이다.
    const row = rows.find(c => c.alt && c.alt.length &&
      c.alt.some(cell => cell.some(id => !c.j.flat().includes(id))));
    ok(!!row, "alt 에만 있는 영웅이 있는 행이 존재한다 (검사가 헛돌지 않는다)");
    if (row) {
      const pick = strip => {
        const a = boot("ko").leaders(row.l[0][0] || "", row.l[1][0] || "", row.l[2][0] || "").mine(row.rs[0]);
        a.el("gcap").value = String(row.g);
        if (strip) a.js("SHEET_COMPS.forEach(c=>{delete c.alt;})");
        const html = a.render();
        const i = html.indexOf('id="rec"');
        const b = /<p><b>([\s\S]*?)<\/b><\/p>/.exec(html.slice(i));
        return b ? [...b[1].matchAll(/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]).join(",") : "";
      };
      ok(pick(false) === pick(true),
         "alt 를 통째로 지워도 추천이 그대로다 (판정에 안 들어간다)",
         pick(false) + " vs " + pick(true));
    }

    // 화면 — 있는 행에는 뜨고, 없는 행에는 안 뜬다. 한/영 양쪽.
    const seeK = (lang, lead, r, g) => {
      const a = boot(lang).leaders(lead[0], lead[1], lead[2]).mine(r);
      a.el("gcap").value = String(g);
      return a.paras().filter(x => x.includes("🔁"));
    };
    const p1 = seeK("ko", ["jeronimo", "molly", "zinman"], [60, 40, 0], 1);
    ok(p1.length === 1 && p1[0].includes("제시") && p1[0].includes("서윤"),
       "대체 조이너 문단이 한국어로 뜬다", p1[0] || "없음");
    const p2 = seeK("en", ["jeronimo", "molly", "zinman"], [60, 40, 0], 1);
    ok(p2.length === 1 && p2[0].includes("Jessie") && p2[0].includes("Seo-yoon"),
       "대체 조이너 문단이 영어로 뜬다 (한글이 새지 않는다)", p2[0] || "없음");
    ok(!/[가-힣]/.test(p2[0] || ""), "영어 화면의 대체 조이너 문단에 한글이 없다", p2[0] || "");
    // 대체 칸이 없는 행(g3 로건·필리·진먼)에서는 문단 자체가 없어야 한다
    ok(seeK("ko", ["logan", "philly", "zinman"], [60, 40, 0], 3).length === 0,
       "대체 칸이 없는 행에는 그 문단이 안 뜬다");
    // 순위에 안 들어간다는 문구를 지우면 안 된다 — 이게 이 문단의 요점이다
    ok((p1[0] || "").includes("순위 계산에는 넣지 않았습니다"),
       "'순위에 안 넣는다' 는 단서가 문단에 남아 있다");

    // ⚠️ 시트가 답을 둘 적어 둔 자리에서 **대표 행의 alt 만** 뜨던 결함 (2026-09-14 검증에서 발견).
    // ⚖️ 문단은 나머지 행의 j 를 그대로 보여 주는데 alt 는 조용히 사라지고 있었다 —
    // g12 60/20/20 은 대표(#53 META)의 alt 가 노라뿐이라 #47 의 "가토" 가 화면에서 증발했다.
    // "우리가 몰래 고르지 않습니다" 라고 적어 둔 문단 옆에서 alt 만 몰래 고르던 셈이다.
    {
      const rows2 = rows.filter(c => c.g === 12 && c.rs.some(v => v.join("/") === "60/20/20"));
      const union = [...new Set(rows2.flatMap(c => (c.alt || []).flat()))];
      ok(rows2.length === 2 && union.length >= 2,
         "g12 60/20/20 은 답이 둘이고 두 행의 alt 가 서로 다르다 (검사가 헛돌지 않는다)",
         rows2.length + "행 · alt " + union.join(","));
      const q = boot("ko").leaders("herbjorg", "lloyd", "ligeia").mine([60, 20, 20]);
      q.el("gcap").value = "12";
      const seen2 = q.paras().filter(x => x.includes("🔁"))[0] || "";
      const missing = union.filter(id => !seen2.includes(HNko(id)));
      ok(missing.length === 0,
         "답이 둘인 자리에서 두 행의 대체 조이너가 **모두** 뜬다",
         "빠진 것: " + missing.map(HNko).join(",") + " · 문단: " + seen2.slice(0, 90));
    }
  }

  // ②b 시트가 한 입력에 답을 둘 적어 둔 자리 — 감추지 않고 드러내는가 (2026-09-13)
  //     발견 경위: 시트 CSV 를 다시 파싱해 SHEET_COMPS 와 대조하다 나왔다.
  //     matchComp 이 하나만 돌려주던 시절엔 배열에서 먼저 나온 행이 조용히 이겼다.
  {
    const comps = JSON.parse(run(CTX_KO, "JSON.stringify(SHEET_COMPS)"));
    ok(comps.length === 54, "SHEET_COMPS 는 시트 편성 행 54개다", String(comps.length));
    const metas = comps.filter(c => c.meta);
    ok(metas.length === 3, "시트 라벨이 META 인 행 3개에 meta:1 이 붙어 있다", String(metas.length));

    // g12 60/20/20 은 시트에 두 줄이고, META 쪽 칸(가토)이 채워져야 한다.
    // 2026-09-12 수집 때 이 행을 중복으로 오분류해서 통째로 빠뜨렸다.
    {
      const a = boot("ko").leaders("herbjorg", "lloyd", "ligeia").mine([60, 20, 20]);
      a.el("gcap").value = "12";
      const n = a.js('matchComps(["herbjorg","lloyd","ligeia"],norm(60,20,20),12).length');
      ok(n === 2, "g12 60/20/20 에 시트 행이 둘 걸린다", String(n));
      ok(a.js('matchComp(["herbjorg","lloyd","ligeia"],norm(60,20,20),12).meta===1'),
         "동률이면 시트가 META 라고 적은 행을 쓴다");
      const html = a.render(), after = html.slice(html.indexOf('id="rec"'));
      const b = /<p><b>([\s\S]*?)<\/b><\/p>/.exec(after);
      const ids = [...b[1].matchAll(/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]);
      ok(ids.includes("gatot"), "그래서 META 행의 가토가 추천에 들어간다", ids.join(","));
      ok(/시트가 이 편성에 답을 2개 적어 뒀습니다/.test(after), "다른 답이 있다고 화면이 알린다");
      ok(/노라/.test((/⚖️[\s\S]{0,300}/.exec(after.replace(/<[^>]+>/g, "")) || [""])[0]),
         "알림에 나머지 답(노라 쪽)이 실제로 적힌다");
    }
    // g8 60/40/0 — 가토로 고르면 시트의 Defense 행과 Offense 행에 둘 다 걸린다.
    // 공/수 라벨로는 못 가른다(전무는 영웅에 붙어 있어 같은 3인조는 같은 side 다) →
    // 우리가 고르지 않고 드러낸다. 대안 리더로만 드러나는 자리라 53행 스윕이 못 잡았다.
    {
      const a = boot("ko").leaders("gatot", "sonya", "bradley").mine([60, 40, 0]);
      a.el("gcap").value = "8";
      const n = a.js('matchComps(["gatot","sonya","bradley"],norm(60,40,0),8).length');
      ok(n === 2, "g8 60/40/0 가토에 시트 행이 둘 걸린다", String(n));
      ok(/시트가 이 편성에 답을 2개 적어 뒀습니다/.test(a.render()), "그 사실을 화면이 알린다");
      // 에디스로 고르면 Offense 행 하나만 걸리므로 알림이 없어야 한다
      const e = boot("ko").leaders("edith", "sonya", "bradley").mine([60, 40, 0]);
      e.el("gcap").value = "8";
      ok(!/답을 \d+개 적어 뒀습니다/.test(e.render()), "한 행만 걸리면 알림이 안 뜬다");
    }
    // 칸이 똑같은 행이 둘 걸리는 경우는 알릴 것이 없다 (g1 · g11)
    {
      const a = boot("ko").leaders("jeronimo", "molly", "zinman").mine([50, 20, 30]);
      a.el("gcap").value = "1";
      ok(a.js('matchComps(["jeronimo","molly","zinman"],norm(50,20,30),1).length') === 2,
         "g1 50/20/30 도 두 행에 걸리지만");
      ok(!/답을 \d+개 적어 뒀습니다/.test(a.render()), "칸이 같으면 알리지 않는다");
    }
    // 전수 조사 — 같은 입력에 칸이 다른 행이 걸리는 자리를 기계적으로 훑는다.
    // 이 검사가 있어야 새 세대를 추가하다 같은 충돌을 또 만들어도 바로 드러난다.
    //
    // ⚠️ 이 자리를 오래 못 본 이유는 **스윕의 종류**였지 대안 여부가 아니었다(2026-09-13 정정).
    // 53행 스윕은 "각 행을 그 행의 리더로 돌려 칸이 채워지는가"만 봤다. 그러면 대표로 잡히는
    // 행이 자기 자신이거나(51/53), 다른 행이더라도 그 행의 칸이 같아서(2/53) **칸 적중이 언제나
    // 만점**이 된다 — 채움 지표에는 신호가 뜰 자리가 없다. 실제로 그 스윕을 돌린 입력에서
    // 이미 행이 둘 걸려 있었다. 부족했던 것은 데이터가 아니라 **질문**이고, 필요한 건 아래처럼
    // "한 입력에 행이 둘 이상 걸리는가"를 묻는 스윕이다.
    // (대안까지 밟는 것은 그와 별개로 더 튼튼한 것뿐이다 — g8 가토는 Defense 행의 첫 후보라
    //  첫 후보만 밟아도 잡힌다. 대안 루프는 앞으로 대안으로만 드러날 충돌을 위한 보험이다.)
    {
      const found = [];
      for (const c of comps) for (const rs of c.rs) {
        // 리더 자리마다 **대안까지 전부** 밟는다
        const alt = c.l.map(cell => cell.length ? cell : [""]);
        for (const a0 of alt[0]) for (const a1 of alt[1]) for (const a2 of alt[2]) {
          const q = JSON.stringify([a0, a1, a2]);
          const hit = JSON.parse(run(CTX_KO,
            "JSON.stringify(compRivals(matchComps(" + q + ",norm(" + rs.join(",") + ")," + c.g + ")).length)"));
          if (hit > 0) found.push("g" + c.g + " " + rs.join("/") + " " + [a0, a1, a2].filter(Boolean).join("+"));
        }
      }
      const uniq = [...new Set(found)];
      note("시트가 답을 둘 이상 적어 둔 입력 " + uniq.length + "가지: " + uniq.join(" · "));
      // 지금 아는 것은 g8 가토 계열과 g12 60/20/20 뿐이다. 늘어나면 알아야 한다.
      // 리더까지 박는다 — 같은 세대·병비에 **다른 리더 조합**으로 새 충돌이 생기면 걸려야 한다
      const KNOWN = ["g8 60/40/0 gatot+sonya+bradley", "g12 60/20/20 herbjorg+lloyd+ligeia"];
      ok(uniq.every(s => KNOWN.indexOf(s) >= 0) && uniq.length === KNOWN.length,
         "칸이 갈리는 자리는 아는 둘(g8 가토 · g12 60/20/20)뿐이다", uniq.join(" · "));
      // 그리고 그 자리마다 화면이 실제로 알리는지 확인 (조용히 하나를 고르면 안 된다)
      for (const s of uniq) {
        const m = /^g(\d+) (\S+) (.+)$/.exec(s), ids = m[3].split("+");
        const a = boot("ko").leaders(ids[0] || "", ids[1] || "", ids[2] || "")
          .mine(m[2].split("/").map(Number));
        a.el("gcap").value = m[1];
        ok(/답을 \d+개 적어 뒀습니다/.test(a.render()), "화면이 알린다 — " + s);
      }
    }
  }

  // ③ 중복은 stack:1 인 영웅(노라)에게만 허용된다
  {
    // ⚠️ 명단을 기억으로 박지 않는다 — **SHEET_COMPS 에서 기계적으로 센다.**
    // 2026-09-13 까지 "노라 하나뿐"이라고 적어 뒀는데 Gen 1 두 행의 패트릭을 놓치고 있었다.
    // 사용자가 잡았다. 이 검사가 있으면 그런 누락이 다시 안 생긴다.
    const comps = JSON.parse(run(CTX_KO, "JSON.stringify(SHEET_COMPS)"));
    const repeated = new Set();
    for (const c of comps) {
      const seen = {};
      c.j.forEach(cell => { const k = cell.join("/"); seen[k] = (seen[k] || 0) + 1; });
      for (const k of Object.keys(seen)) if (seen[k] >= 2 && k.indexOf("/") < 0) repeated.add(k);
    }
    const flagged = new Set(E.HEROES.filter(h => h.stack).map(h => h.id));
    const missing = [...repeated].filter(x => !flagged.has(x));
    const extra = [...flagged].filter(x => !repeated.has(x));
    ok(missing.length === 0 && extra.length === 0,
       "stack:1 이 붙은 영웅 == 시트가 한 행에서 겹쳐 쓴 영웅",
       (missing.length ? "빠짐: " + missing.join(",") : "") + (extra.length ? " 잉여: " + extra.join(",") : ""));
    note("시트가 겹쳐 쓰는 영웅: " + [...repeated].map(x => E.byId[x].kr).join(" · "));
    let dupRows = 0;
    const bad = [];
    for (const row of SHEET_ROWS) for (const edge of [0, 1]) {
      const ids = pick(row, edge).ids;
      const cnt = {};
      ids.forEach(i => { cnt[i] = (cnt[i] || 0) + 1; });
      for (const id of Object.keys(cnt)) {
        if (cnt[id] < 2) continue;
        if (!E.byId[id].stack) bad.push("G" + row.gen + " " + row.r.join("/") + " " + id + "×" + cnt[id]);
        else if (edge === 1 && id === "norah") dupRows++;
      }
    }
    ok(bad.length === 0, "stack:1 이 없는 영웅은 중복으로 뽑히지 않는다", bad.slice(0, 3).join(", "));
    ok(dupRows >= 3, "노라 중복이 실제로 쓰이는 행이 있다 (예외가 죽어 있지 않다)", String(dupRows));
    let three = 0;
    for (const row of SHEET_ROWS) {
      const ids = pick(row, 1).ids;
      if (ids.filter(x => x === "norah").length >= 3) three++;
    }
    ok(three >= 3, "시트가 노라를 3칸 적은 행에서 실제로 3장을 뽑는다", String(three));
    note("시트 우선 상태에서 노라 2장 이상 " + dupRows + "행 · 3장 이상 " + three + "행");
  }
  // ③b 보조 패널(#recAll)은 **시트를 전혀 안 본** 순수 계산이어야 한다.
  // 그래야 "시트를 따르느라 얼마를 포기했는지"가 화면에 보인다. 노라 3장 행은 그 차이가 8% 다.
  {
    const row = {lead: ["magnus", "mia", "hendrik"], r: [48, 4, 48], gen: 9};
    const a = boot("ko").leaders(row.lead[0], row.lead[1], row.lead[2]).mine(row.r);
    a.el("gcap").value = String(row.gen);
    const html = a.render();
    const i = html.indexOf('id="recAll"');
    ok(i > 0, "노라 3장 행에서는 보조 패널이 뜬다 (추천과 다르니까)");
    const alt = [...html.slice(i, html.indexOf("</b>", i)).matchAll(/heroes\/([a-z-]+)\.webp/g)].map(m => m[1]);
    ok(alt.filter(x => x === "norah").length <= 1,
       "보조 패널은 시트를 안 보므로 노라를 3장 쌓지 않는다", alt.join(","));
    const pureV = +(/전투 배율 ×([\d.]+)/.exec(html.slice(i)) || [0, 0])[1];
    const recV = +(/전투 배율 ×([\d.]+)/.exec(html.slice(html.indexOf('id="rec"'))) || [0, 0])[1];
    ok(pureV > recV, "그 행에서 순수 계산이 추천보다 높다 — 포기한 양이 화면에 보인다",
       "순수 " + pureV + " vs 추천 " + recV);
    note("노라 3장 행의 대가: 추천 ×" + recV + " vs 순수 계산 ×" + pureV +
         " (" + ((1 - recV / pureV) * 100).toFixed(1) + "% 포기)");
  }
  // ④ 사용자가 잡은 자리: 로건·필리·진먼 60/40/0 Gen 3 → 시트는 미아·패트릭·제시*·서윤
  {
    const row = {lead: ["logan", "philly", "zinman"], r: [60, 40, 0], gen: 3};
    const on = pick(row, 1);
    ok(on.ids.includes("patrick") && on.ids.includes("mia") &&
       on.ids.includes("seoyoon") && on.ids.some(x => ["jessie", "jasser", "jeronimo"].includes(x)),
       "로건·필리·진먼 60/40 에서 시트의 네 칸을 그대로 채운다", on.ids.join(","));
    // 제시 칸을 두 명이 먹지 않는다
    ok(on.ids.filter(x => ["jessie", "jasser", "jeronimo"].includes(x)).length === 1,
       "제시* 칸은 한 명만 채운다 (평평하게 펴면 둘이 들어가던 자리)", on.ids.join(","));
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
