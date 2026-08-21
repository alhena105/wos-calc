// 진짜 브라우저에서 도는 검사. 판정 로직이나 UI 문구를 건드렸으면 돌린다.
//   node test/browser.mjs
//
// playwright 가 없으면 실패가 아니라 건너뛴다(exit 0). 설치는 프로젝트 루트에서:
//   npm i -D playwright        (브라우저 바이너리는 ms-playwright 캐시에 이미 있으면 재사용)
// 실행 파일을 직접 지정하려면: PW_CHROME=/path/to/chrome node test/browser.mjs
import {fileURLToPath, pathToFileURL} from "node:url";
import {dirname, join} from "node:path";
import {existsSync, readdirSync} from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = pathToFileURL(join(ROOT, "index.html")).href;

let chromium;
try { ({chromium} = await import("playwright")); }
catch {
  console.log("⏭  playwright 가 없어 건너뜁니다.  npm i -D playwright  로 설치하세요.");
  process.exit(0);
}

// 실행 파일 결정: PW_CHROME > 리눅스 CI 의 /opt/pw-browsers > playwright 기본 경로
function execPath() {
  if (process.env.PW_CHROME) return process.env.PW_CHROME;
  const pool = "/opt/pw-browsers";
  if (existsSync(pool)) {
    const dir = readdirSync(pool).filter(d => d.startsWith("chromium-")).sort().pop();
    if (dir) {
      const bin = join(pool, dir, "chrome-linux", "chrome");
      if (existsSync(bin)) return bin;
    }
  }
  return undefined; // playwright 가 알아서 찾게 둔다
}

// ── 미니 러너 ──────────────────────────────────────────────────────────
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

const browser = await chromium.launch({executablePath: execPath()});
const errors = [];
const ctx = await browser.newContext();
ctx.on("weberror", e => errors.push(String(e.error())));

async function open(query) {
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(PAGE + (query || ""));
  await page.waitForSelector("#out h2");
  return page;
}
// 병비 세 칸을 채우고 재계산을 기다린다
async function setRatio(page, prefix, v) {
  for (let i = 0; i < 3; i++) await page.fill("#" + prefix + (i + 1), String(v[i]));
  await page.waitForTimeout(50);
}
const outText = page => page.textContent("#out");

// ── 1. 기본 렌더 ───────────────────────────────────────────────────────
section("기본 렌더 (한국어)");
const ko = await open();
const koOut = await outText(ko);
for (const sec of ["① 리더 구성", "② SkillMod 칸 진단", "③ 위젯", "④ 병종 전용", "⑤ 조이너 한계 배율"])
  ok(koOut.includes(sec), "섹션 " + sec + " 렌더");
ok(errors.length === 0, "로드 중 에러 없음", errors.join(" | "));

// ── 2. 시트 판정 4상태 ─────────────────────────────────────────────────
section("시트 판정 4상태");
const CASES = [
  {name: "ban",     en: [60, 40, 0],  mine: [50, 0, 50],  expect: "금지 편성"},
  {name: "counter", en: [40, 0, 60],  mine: [60, 40, 0],  expect: "추천 카운터에 해당"},
  {name: "silent",  en: [60, 40, 0],  mine: [40, 40, 20], expect: "표에 없음"},
  {name: "noRow",   en: [34, 33, 33], mine: [40, 20, 40], expect: "해당 행 없음"},
];
for (const c of CASES) {
  await setRatio(ko, "r", c.mine);
  await setRatio(ko, "e", c.en);
  const t = await outText(ko);
  ok(t.includes(c.expect), "판정 " + c.name + " → \"" + c.expect + "\"",
     "상대 " + c.en.join("/") + " 내 " + c.mine.join("/"));
}
// 걷어낸 3채널 지표가 화면에 되살아나지 않았는지
{
  const t = await outText(ko);
  ok(!/참고 지표|대보병 화력|밴드 임계/.test(t), "3채널 지표 흔적 없음",
     (t.match(/참고 지표|대보병 화력|밴드 임계/g) || []).join(","));
}

// 수비는 같은 표를 반대로 읽는다 — 내 개리슨이 행 키, 들어오는 랠리가 비교 대상
await ko.click("#mDef");
await setRatio(ko, "r", [60, 40, 0]);      // 내 개리슨 60/40
await setRatio(ko, "e", [40, 20, 40]);     // 정석 카운터가 들어온다
ok(/정석 카운터가 왔습니다/.test(await outText(ko)), "수비: 추천 카운터가 오면 위협으로 표시");
await setRatio(ko, "e", [50, 0, 50]);      // 밴드 편성이 들어온다
ok(/금지 편성으로 왔습니다/.test(await outText(ko)), "수비: 밴드 편성이 오면 유리로 표시");
await setRatio(ko, "e", [40, 40, 20]);     // 표가 언급하지 않는 편성
{
  const t = await outText(ko);
  ok(/표에 없음/.test(t), "수비: 표가 침묵하면 판단 유보");
  ok(!/안전/.test(t), "수비: 침묵을 안전으로 렌더링하지 않는다");
}
await ko.click("#mAtk");
await setRatio(ko, "r", [40, 20, 40]);
await setRatio(ko, "e", [60, 40, 0]);
await ko.waitForTimeout(80);

// ── 3. 입력 보조 ───────────────────────────────────────────────────────
section("프리셋 · 합계 경고");
await ko.click("#rPre .chip:has-text('60/40')");
await ko.waitForTimeout(50);
const preset = await ko.evaluate(() => [r1.value, r2.value, r3.value].join("/"));
ok(preset === "60/40/0", "프리셋 60/40 → 보60·창40·궁0", preset);
await setRatio(ko, "r", [60, 40, 20]);
ok((await ko.textContent("#rSum")).includes("120"), "합이 100이 아니면 경고");
await setRatio(ko, "r", [48, 4, 48]);
ok((await ko.textContent("#rSum")).trim() === "", "합이 100이면 경고 없음");

// ── 4. 언어 ────────────────────────────────────────────────────────────
section("언어");
const en = await open("?lang=en");
const enOut = await outText(en);
ok(enOut.includes("Leaders"), "?lang=en 이면 영어로 뜬다");
const HANGUL = /[가-힣]/;
const enHits = enOut.split("\n").filter(l => HANGUL.test(l)).slice(0, 3);
ok(!HANGUL.test(enOut), "영어로 열면 결과에 한글이 없다", enHits.join(" | "));

await ko.click("#lgEn");
await ko.waitForTimeout(80);
const toggled = await outText(ko);
ok(toggled.includes("Leaders"), "토글하면 영어로 바뀐다");
const tHits = [...new Set((toggled.match(/[가-힣][가-힣 ·]*/g) || []))].slice(0, 6);
ok(!HANGUL.test(toggled), "한국어로 열고 English 를 눌러도 결과에 한글이 없다", tHits.join(" | "));

ok(errors.length === 0, "전체 시나리오에서 에러 없음", errors.slice(0, 3).join(" | "));
await browser.close();

// ── 결과 ───────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(62));
console.log("통과 " + pass + " · 실패 " + fail + (known ? " · 알려진 결함 " + known + "건" : ""));
if (fail) { console.log("\n실패 목록:"); fails.forEach(f => console.log("  ❌ " + f)); }
if (stale.length) {
  console.log("\n고쳐진 것 같습니다 — KNOWN_DEFECTS 에서 지우세요:");
  stale.forEach(s => console.log("  ✨ " + s));
}
process.exit(fail ? 1 : 0);
