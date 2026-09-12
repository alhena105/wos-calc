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

  // 화면 값이 "칸에 다 넣고 다시 잰 값" 과 같은가
  const base = {};
  E.ORDER.forEach(sl => { base[sl] = 1; });
  for (const lid of ["gregory", "mia", "blanchette"])
    for (const e of E.byId[lid].exp) {
      if (e.slot === "ECO" || e.slot === "X") continue;
      if (base[e.slot] !== undefined) base[e.slot] += e.v;
      if (e.also && base[e.also.slot] !== undefined) base[e.also.slot] += e.also.v;
    }
  // 전투비를 양쪽 식으로 펴면 (내딜증 × 내감소) / (상대딜증 × 상대감소) 라
  // 내 딜 칸과 내 감소 칸이 결과에 똑같이 곱해진다 → 모든 칸을 센다.
  const b = Object.assign({}, base);
  let cond = 1;
  for (const id of ids) {
    const e = E.byId[id].exp[0];
    if (e.slot === "X") continue;                       // 아래에서 화면 배율로 곱한다
    if (e.slot === "An") { cond *= 1 + e.v * E.NA_SHARE; continue; }
    // AH(타격 계열)는 칸이 아니다 — 합연산에 들어가지 않고 자기 계수로 곱한다
    if (e.slot === "AH") { cond *= 1 + e.v; continue; }
    if (b[e.slot] !== undefined) b[e.slot] += e.v;
    if (e.also && b[e.also.slot] !== undefined) b[e.also.slot] += e.also.v;
  }
  const want = E.ORDER.reduce((x, sl) => x * (b[sl] / base[sl]), 1) * cond;
  const dmgOnly = E.ORDER.filter(sl => E.SLOTS[sl].k === "dmg")
    .reduce((x, sl) => x * (b[sl] / base[sl]), 1) * cond;
  ok(ids.length === 4, "추천 4명이 네 명이다", ids.join(","));
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
    const rec = html.slice(html.indexOf('id="rec"'));
    ok(!/heroes\/flint\.webp/.test(rec.slice(0, rec.indexOf("</b>"))),
       "60/40 리더 팀에서 플린트가 추천 4명에 들지 않는다");
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
  const recOf = row => {
    const a = boot("ko").leaders(row.lead[0] || "", row.lead[1] || "", row.lead[2] || "").mine(row.r);
    a.el("gcap").value = String(row.gen);
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
  ok(fp >= 80, "시트 #1 조이너 재현이 80% 이상", fp.toFixed(1) + "% · 놓친 행: " + missed.slice(0, 4).join(", "));
  ok(pp >= 48, "시트 #1~#4 조이너 겹침이 48% 이상", pp.toFixed(1) + "%");
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
