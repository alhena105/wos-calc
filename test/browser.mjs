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
// 편성 탭은 마지막 편성을 localStorage 에 두고 다음에 열 때 되살린다(2026-11-11). 이 컨텍스트의 페이지들은 저장소를 같이 쓰므로,
// 그대로 두면 앞 페이지가 남긴 편성으로 뒤 페이지가 열려 검사끼리 물린다 → 열 때마다 지운다. 저장·복원 자체는 아래 별도 컨텍스트에서 본다.
const COMP_KEY = "wos-calc:comp:v1";
await ctx.addInitScript(k => { try { localStorage.removeItem(k); } catch (e) {} }, COMP_KEY);

async function open(query, c = ctx) {
  const page = await c.newPage();
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(PAGE + (query || ""));
  // ?tab=gear 로 열면 편성 탭이 감춰져 있으므로 "보인다"가 아니라 "붙었다"를 기다린다
  await page.waitForSelector("#out h2", {state: "attached"});
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
// ④ 는 리더가 병종 전용·주기형 스킬을 들고 있을 때만 나온다. 기본 리더 조합엔 없으므로
// 항상 나오는 것만 본다 (unit.mjs 의 섹션 목록과 같은 기준).
// 2026-11-11: 조이너 안내가 맨 위로 올라왔고 번호는 화면 순서대로 다시 매긴다 → 제목으로 본다.
for (const sec of ["조이너 안내", "리더 구성", "SkillMod 칸 진단", "위젯"])
  ok(koOut.includes(sec), "섹션 " + sec + " 렌더");
{
  const heads = await ko.evaluate(() => [...document.querySelectorAll("#out h2")].map(h => h.textContent.trim()));
  ok(/^① 조이너 안내/.test(heads[0] || ""), "조이너 안내가 결과 맨 위 섹션이다", heads.map(h => h.slice(0, 12)).join(" | "));
  ok(heads.every((h, i) => h.startsWith("①②③④⑤⑥⑦"[i])), "섹션 번호가 화면 순서대로 매겨진다", heads.map(h => h.slice(0, 2)).join(""));
}
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
  // 문구에 "안전"이라는 낱말 자체는 나온다 — '"안전"이 아니라 "표에 없음"입니다' 로.
  // 그러니 낱말 유무가 아니라 그 경고가 붙어 있는지를 본다 (unit.mjs 와 같은 기준).
  ok(/"안전"이 아니라 "표에 없음"입니다/.test(t), "수비 silent 에 '안전이 아니다' 경고가 붙는다");
  ok(!/막아낼 수 있|안전합니다|문제 없습니다/.test(t), "수비: 침묵을 안전으로 렌더링하지 않는다");
}
await ko.click("#mAtk");
await setRatio(ko, "r", [40, 20, 40]);
await setRatio(ko, "e", [60, 40, 0]);
await ko.waitForTimeout(80);

// ── 2.5 초상 픽커 ──────────────────────────────────────────────────────
section("초상 픽커");
await ko.click("#pLan > summary");
await ko.waitForTimeout(60);
ok(await ko.isVisible("#gLan .pk[data-id='karol']"), "픽커를 열면 후보가 보인다");
await ko.click("#gLan .pk[data-id='karol']");
await ko.waitForTimeout(80);
ok(await ko.evaluate(() => document.getElementById("hLan").value) === "karol",
   "초상을 누르면 숨은 select 값이 바뀐다");
ok(!(await ko.evaluate(() => document.getElementById("pLan").open)), "고르면 픽커가 닫힌다");
ok(/카롤/.test(await outText(ko)), "고른 영웅이 결과에 반영된다");
{
  const broken = await ko.evaluate(() =>
    [...document.querySelectorAll(".pgrid img.hpic")].filter(i => i.complete && i.naturalWidth === 0).length);
  ok(broken === 0, "픽커 초상이 깨지지 않는다", broken + "개 깨짐");
}
// 고르면 픽커가 닫히므로(위에서 검사했다) 원복하려면 다시 열어야 한다
await ko.click("#pLan > summary");
await ko.waitForTimeout(60);
await ko.click("#gLan .pk[data-id='mia']");
await ko.waitForTimeout(60);

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

// ── 3.5 장비 탭 ────────────────────────────────────────────────────────
section("장비 탭");
await ko.click("#tabGear");
await ko.waitForTimeout(80);
ok(await ko.isVisible("#tab-gear"), "탭을 누르면 장비 탭이 보인다");
ok(!(await ko.isVisible("#tab-comp")), "편성 탭은 감춰진다");
ok(/tab=gear/.test(ko.url()), "URL 에 ?tab=gear 가 붙는다", ko.url());
// 아무것도 입력하지 않았으면 계획 대신 안내가 나와야 한다.
// 첫 화면에 36스텝·미스릴 1800 짜리 가짜 계획이 떠 있던 것을 Orca 브라우저에서 잡았다.
await ko.evaluate(() => {
  document.querySelectorAll("#gGrid input").forEach(i => { i.value = ""; });
  document.querySelector("#gGrid input").dispatchEvent(new Event("input", {bubbles: true}));
});
await ko.waitForTimeout(80);
{
  const t = await ko.textContent("#tab-gear");
  ok(/보유 장비를 입력하세요/.test(t), "입력이 없으면 안내가 나온다");
  ok(!(await ko.evaluate(() => !!document.getElementById("gSteps"))), "입력이 없으면 순서표가 없다");
  ok(await ko.evaluate(() => document.getElementById("gBudgetBox").hidden), "입력이 없으면 예산 슬라이더를 감춘다");
  ok(/좌우 사이클/.test(t) && /되돌릴 수 없는 것/.test(t), "참조표와 경고는 입력 전에도 보인다");
}
// 픽스처와 같은 입력을 넣으면 픽스처와 같은 총계가 나와야 한다
const FIX = {
  infantry: {helmet: [11, 1], gauntlet: [15, 61], belt: [15, 60], boots: [11, 2]},
  marksman: {helmet: [13, 59], gauntlet: [11, 1], belt: [11, 1], boots: [13, 59]},
  lancer:   {helmet: [13, 40], gauntlet: [11, 3], belt: [11, 1], boots: [13, 40]},
};
for (const t of Object.keys(FIX)) for (const sl of Object.keys(FIX[t])) {
  await ko.fill("#gm_" + t + "_" + sl, String(FIX[t][sl][0]));
  await ko.fill("#gl_" + t + "_" + sl, String(FIX[t][sl][1]));
}
await ko.fill("#gWk", "12");
await ko.waitForTimeout(120);
{
  const t = await ko.textContent("#gOutTop");
  ok(/1560/.test(t), "총 미스릴 1560", t.replace(/\s+/g, " ").slice(0, 120));
  ok(/\+1020/.test(t), "원정 +1020%p");
  ok(/130/.test(t), "주당 12 → 130주");
  const b = await ko.textContent("#gOutBot");
  ok(/Lv\.40\(탐험\) → Lv\.60/.test(b.replace(/\s+/g, " ")), "통행료 표기 Lv.40(탐험) → Lv.60");
  // 스텝 수는 GEAR_AXIS_SUB 에 따라 바뀐다. 상수로 박지 말고 엔진과 화면이 맞는지를 본다.
  const {rows, want} = await ko.evaluate(() => ({
    rows: document.querySelectorAll("#gSteps tbody tr:not(.gband)").length,
    want: gearPlan(gearInput()).steps.length,
  }));
  ok(rows === want && rows > 12, "순서표 행 수가 엔진 스텝 수와 같다", rows + " vs " + want);
  // 단계 띠 — 이 표의 1순위가 효율이 아니라 단계라는 걸 화면이 말해야 한다
  {
    const bands = await ko.evaluate(() =>
      [...document.querySelectorAll("#gSteps tbody tr.gband")].map(e => e.textContent.trim()));
    ok(bands.length >= 2 && bands[0].includes("+20"), "순서표에 단계 띠가 붙는다", bands.join(" / "));
    const back = await ko.evaluate(() => {
      const st = [...document.querySelectorAll("#gSteps tbody tr")].filter(r => r.classList.contains("gband"));
      return st.map(e => e.textContent.trim());
    });
    const num = back.map(x => parseInt(x.replace(/[^0-9]/g, ""), 10)).filter(n => !isNaN(n));
    ok(num.every((n, i) => !i || n > num[i - 1]), "단계 띠가 오름차순이다", back.join(" / "));
  }
  const lo = await ko.evaluate(() => document.querySelectorAll("#gSteps tbody tr.dead").length);
  ok(lo === 4, "맨 뒤 완성용 4행이 흐리게 표시된다", String(lo));
  ok(/맨 마지막 — 완성용/.test(await ko.textContent("#gOutBot")), "완성용 안내가 붙는다");
  // ⑤ 원본 우선순위표에 1~32 번호가 다 찍혀야 한다
  {
    const ns = await ko.evaluate(() =>
      [...document.querySelectorAll("#gOutBot .ono.on")].map(e => +e.textContent).sort((a, b) => a - b));
    ok(ns.length === 32 && ns[0] === 1 && ns[31] === 32 && new Set(ns).size === 32,
       "우선순위표에 번호 1~32 가 전부 찍힌다", ns.length + "개 " + ns.slice(0, 5).join(","));
    const blank = await ko.evaluate(() => document.querySelectorAll("#gOutBot .ono:not(.on)").length);
    ok(blank === 16, "번호 없는 칸이 16개 (보병 8 + 창병 8 · 궁병은 0)", String(blank));
    const done = await ko.evaluate(() => document.querySelectorAll("#gOutBot td.cdone").length);
    ok(done > 0, "이미 지난 칸에 ✓ 가 붙는다", String(done));
  }
  ok(/필수/.test(await ko.textContent("#gGridLegend")) && /추천/.test(await ko.textContent("#gGridLegend")),
     "범례가 필수·추천·통행료로 나뉜다", await ko.textContent("#gGridLegend"));
}
// 예산 슬라이더 — 줄이면 표가 짧아진다
await ko.evaluate(() => { const b = gBudget; b.value = "60"; b.dispatchEvent(new Event("input", {bubbles: true})); });
await ko.waitForTimeout(80);
{
  const rows = await ko.evaluate(() => document.querySelectorAll("#gSteps tbody tr:not(.gband)").length);
  ok(rows === 4, "예산 60 이면 4행만 남는다", String(rows));
  // 예산 슬라이더는 앞에서 자르는 게 아니라 그 예산 안 최선을 정확히 푼다
  ok(/최선의 조합/.test(await ko.textContent("#gBudgetN")), "예산 안내가 '최선의 조합'이라고 말한다",
     await ko.textContent("#gBudgetN"));
  {
    const cmp = await ko.evaluate(() => {
      const p = gearPlan(gearInput()), b = 300;
      let tr = 0; p.steps.forEach(s => { if (s.cumMithril <= b) tr += s.useful; });
      return {exact: gearBudgetPick(p.steps, b).value, trunc: tr};
    });
    ok(cmp.exact >= cmp.trunc, "예산 300 에서 정확해가 순서 자르기 이상", JSON.stringify(cmp));
  }
}
await ko.evaluate(() => { const b = gBudget; b.value = b.max; b.dispatchEvent(new Event("input", {bubbles: true})); });
await ko.waitForTimeout(80);
// 체크박스 → 진행률
await ko.click("#gSteps tbody tr:not(.gband) .gchk");
await ko.waitForTimeout(80);
ok(/체크 완료/.test(await ko.textContent("#gOutTop")), "체크하면 진행률이 요약에 뜬다");
// 마스터리 상한 경고 — 계산은 그대로 진행한다
// 마스터리는 돌파에만 걸린다. M11 은 Lv.20 을 뚫을 수 있고 Lv.40 은 못 하므로 +39 까지 정상이다.
// (예전에는 상한을 +20 으로 잡아 게임에서 멀쩡한 M11/+39 에 경고가 떴다.)
await ko.fill("#gm_infantry_helmet", "11");
await ko.fill("#gl_infantry_helmet", "39");
await ko.waitForTimeout(80);
ok((await ko.textContent("#gGridWarn")).trim() === "", "M11 / +39 는 경고가 없다",
   await ko.textContent("#gGridWarn"));
await ko.fill("#gl_infantry_helmet", "40");
await ko.waitForTimeout(80);
ok(/상한 \+39/.test(await ko.textContent("#gGridWarn")), "M11 / +40 은 상한 +39 초과로 경고",
   await ko.textContent("#gGridWarn"));
await ko.fill("#gl_infantry_helmet", "90");
await ko.waitForTimeout(80);
ok(/상한을 넘는/.test(await ko.textContent("#gGridWarn")), "마스터리 상한 초과 경고");
ok((await ko.textContent("#gOutBot")).length > 200, "경고가 떠도 계산은 계속된다");
await ko.fill("#gl_infantry_helmet", "1");
await ko.waitForTimeout(80);
// 총액이 줄었다 돌아오면 예산도 따라와야 한다 — 안 그러면 슬라이더가 낮은 값에 눌러앉아
// 스텝이 계속 감춰진다. Orca 브라우저에서 실제로 그렇게 잡혔다.
{
  const back = await ko.evaluate(() => ({
    rows: document.querySelectorAll("#gSteps tbody tr:not(.gband)").length,
    want: gearPlan(gearInput()).steps.length,
  }));
  ok(back.rows === back.want, "총액이 회복되면 예산 슬라이더도 따라와 전체가 돌아온다",
     back.rows + " vs " + back.want);
}
// 경고·한계는 접지 않고 전부 노출
{
  const n = await ko.evaluate(() => document.querySelectorAll("#gOutBot .callout li").length);
  ok(n >= 7, "경고 3 + 한계 4 가 모두 목록으로 노출", String(n));
  ok((await ko.evaluate(() => document.querySelectorAll("#gOutBot details").length)) === 0,
     "접어두지 않았다");
}
// 병비 합이 100이 아니면 경고 — 장비 쪽은 정규화하지 않으므로 두 축 무게가 실제로 틀어진다
await ko.fill("#ga2", "40");
await ko.waitForTimeout(80);
ok(/합이/.test(await ko.textContent("#gaSum")), "공격 병비 합계 경고", await ko.textContent("#gaSum"));
await ko.fill("#ga2", "4");
await ko.waitForTimeout(80);
ok((await ko.textContent("#gaSum")).trim() === "", "합이 100이면 경고 없음");

// 카드 그리드 — 화면 순서는 보 → 창 → 궁 (엔진 타이브레이크와 별개)
{
  const rows = await ko.evaluate(() =>
    [...document.querySelectorAll(".gsec>h4")].map(h => h.firstElementChild.nextSibling.textContent.trim()));
  ok(rows.join(",") === "보병,창병,궁병", "카드 행이 보 → 창 → 궁", rows.join(","));
  const cards = await ko.evaluate(() => document.querySelectorAll(".gcard").length);
  ok(cards === 12, "카드 12장", String(cards));
  // 병종 한 칸 안에서 2×2 — 고글·장갑 / 벨트·신발. 좌(고글·벨트)가 세로로 맞아야 한다.
  {
    const lay = await ko.evaluate(() => {
      const cs = [...document.querySelectorAll(".gsec")[0].querySelectorAll(".gcard")];
      const top = cs[0].getBoundingClientRect().top;
      return {
        cols: getComputedStyle(cs[0].parentElement).gridTemplateColumns.split(" ").length,
        row1: cs.filter(c => Math.abs(c.getBoundingClientRect().top - top) < 2).length,
        leftAligned: Math.abs(cs[0].getBoundingClientRect().left - cs[2].getBoundingClientRect().left) < 2,
      };
    });
    ok(lay.cols === 2 && lay.row1 === 2, "병종 한 칸이 2열 × 2줄", JSON.stringify(lay));
    ok(lay.leftAligned, "고글과 벨트(좌 계열)가 같은 열에 선다");
  }
  // 트랙이 입력을 따라 갱신되는가 — 카드를 다시 만들지 않고 트랙만 갈아끼운다
  await ko.fill("#gl_lancer_belt", "85");
  await ko.waitForTimeout(80);
  const t85 = await ko.textContent("#gt_lancer_belt");
  ok(/Lv\.85/.test(t85) && /Lv\.100/.test(t85), "레벨을 바꾸면 트랙이 따라간다", t85.replace(/\s+/g, " "));
  // 타이핑 중 포커스가 유지돼야 한다 (카드를 통째로 다시 만들면 여기서 깨진다)
  ok(await ko.evaluate(() => document.activeElement.id) === "gl_lancer_belt",
     "트랙이 갱신돼도 입력 포커스가 유지된다", await ko.evaluate(() => document.activeElement.id));
  await ko.fill("#gl_lancer_belt", "1");
  await ko.waitForTimeout(80);
}

// 접근명 — 그리드 24칸과 체크박스에 이름이 붙어 있어야 한다
{
  const noName = await ko.evaluate(() =>
    [...document.querySelectorAll("#gGrid input, .gchk")].filter(i => !i.getAttribute("aria-label")).length);
  ok(noName === 0, "그리드 입력과 체크박스에 aria-label 이 있다", noName + "개 누락");
}

// 표 칸이 두 줄로 접히지 않는다.
// 배포본에서 순서표의 "보병 고글" 이 접혔고(작업 칸이 폭을 다 먹어 조각 칸이 71px),
// 그걸 nowrap 으로 고치면서 예외를 .note 전체로 너무 넓게 줘서 이번엔 좌우 칸의 "방어" 가
// 24px 안에서 방/어 로 쪼개졌다(한글은 음절 사이에서 끊긴다). 둘 다 여기서 잡는다.
//
// 검사 단위가 중요하다:
//  - 칸 단위로 높이를 보면 패딩을 접힘으로 오인한다
//  - 뱃지가 섞인 칸은 getClientRects() 가 여러 개라 칸 단위 Range 로는 판정이 안 된다
//  - 자식이 있는 칸을 빼면 좌우 칸(<div class="note">)을 놓친다  ← 실제로 놓쳤다
//  → 표 안의 텍스트 노드마다 Range 로 줄 수를 센다. 일부러 접히는 .work/.cap 만 뺀다.
for (const w of [1400, 1024, 800, 600, 390, 320]) {
  const r = await ko.evaluate(width => {
    const st = document.createElement("style");
    st.id = "pwnarrow"; st.textContent = "html{width:" + width + "px!important}";
    document.head.appendChild(st);
    const bad = [];
    document.querySelectorAll("#tab-gear table").forEach(tb => {
      const tw = document.createTreeWalker(tb, NodeFilter.SHOW_TEXT);
      for (let n; (n = tw.nextNode());) {
        if (!n.textContent.trim()) continue;
        let skip = false;
        for (let e = n.parentElement; e && e !== tb; e = e.parentElement)
          if (e.classList.contains("work") || e.classList.contains("cap")) skip = true;
        if (skip) continue;
        const g = document.createRange(); g.selectNodeContents(n);
        if (new Set([...g.getClientRects()].map(x => Math.round(x.top))).size > 1)
          bad.push((tb.id || "table") + " [" + n.textContent.trim().slice(0, 14) + "]");
      }
    });
    const body = document.body.scrollWidth;
    st.remove();
    return {body, bad: [...new Set(bad)]};
  }, w);
  ok(r.bad.length === 0, w + "px 에서 표 안 글자가 접히지 않는다", r.bad.slice(0, 4).join(" / "));
  ok(r.body <= w + 2, w + "px 에서 본문이 가로로 넘치지 않는다", r.body + "px");
}

// 편성 탭으로 돌아가면 밴드 판정이 그대로다
await ko.click("#tabComp");
await ko.waitForTimeout(80);
ok(await ko.isVisible("#tab-comp"), "편성 탭으로 돌아온다");

// 넘침 검사는 오랫동안 장비 탭에만 걸려 있었다. 배포본을 390px 로 열어 보니
// **편성 탭**의 ⑤ 순위표(자연폭 368px)와 ② 칸 진단표가 본문을 통째로 밀고 있었다
// (390px 에서 본문 401px). 장비 탭이 .xscroll 로 푼 문제를 편성 탭만 안 풀고 있었다.
// 2026-09-13 육안 검증에서 발견. 두 탭 다 검사한다.
// ⚠️ 이 검사는 오랫동안 「↘ 장당 한계 배율」 문단이 **없는** 상태만 지나갔다 — 이 시점 편성이
// 제로니모·미아·알론소 60/40/0 이라 겹치는 영웅이 없어서다(2026-09-14 검증에서 지적).
// 실제 위험은 없었지만(문단은 세로로만 자란다) 검사가 안 덮는 자리였다. 겹침 편성으로 바꿔 둔다.
await ko.evaluate(() => {
  const set = (id, v) => {
    const e = document.getElementById(id);
    e.value = v;
    e.dispatchEvent(new Event("change"));
  };
  set("gcap", "7"); set("hInf", "jeronimo"); set("hLan", "mia"); set("hMar", "gwen");
});
await setRatio(ko, "r", [48, 4, 48]);
ok(/↘/.test(await outText(ko)),
   "겹침 편성에서 장당 한계 배율 문단이 뜬다 (아래 넘침 검사가 이 상태를 지나간다)");

for (const w of [1400, 768, 430, 390, 360, 320]) {
  const r = await ko.evaluate(width => {
    const st = document.createElement("style");
    st.id = "pwnarrow2"; st.textContent = "html{width:" + width + "px!important}";
    document.head.appendChild(st);
    const body = document.body.scrollWidth;
    // 어느 표가 범인인지 같이 남긴다 — .xscroll 안이면 굴러도 되므로 뺀다
    // html{width:N} 로 폭을 흉내내므로 clientWidth 는 안 따라온다 — 주입한 폭을 기준으로 본다
    const cw = width, guilty = [];
    document.querySelectorAll("#tab-comp table").forEach(t => {
      if (t.closest(".xscroll")) return;
      if (t.getBoundingClientRect().right > cw + 1)
        guilty.push([...t.querySelectorAll("thead th")].map(x => x.innerText.trim()).join("/").slice(0, 40));
    });
    st.remove();
    return {body, guilty};
  }, w);
  ok(r.body <= w + 2, "편성 탭 " + w + "px 에서 본문이 가로로 넘치지 않는다",
     r.body + "px" + (r.guilty.length ? " · 범인: " + r.guilty.join(" | ") : ""));
}
// 위 검사는 「병종 전용 · 주기형 스킬 판정」 섹션이 **없는** 편성만 지나갔다(제로니모·미아·그웬에는 병종 전용 스킬이 없다).
// 그 섹션의 「실제 병종 메커니즘」 안내에는 표가 셋 있는데 .xscroll 밖이어서, 영어 화면 320px 에서 병종 스탯 표가 본문을 25px 밀고 있었다
// (2026-11-13 · 아모세 리더로 화면을 확인하다 발견). 병종 전용 스킬을 가진 리더로, 진짜 뷰포트에서, 한·영 둘 다 본다 — 영어가 더 넓다.
for (const [lang, q] of [["한국어", ""], ["영어", "?lang=en"]]) {
  const p = await open(q);
  await p.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("change")); };
    set("gcap", "4"); set("hInf", "ahmose"); set("hLan", "reina"); set("hMar", "lynn");
  });
  await setRatio(p, "r", [60, 40, 0]);
  ok((await p.evaluate(() => document.querySelectorAll("#out .callout table.hgrid").length)) === 3,
     lang + " — 병종 전용 스킬 리더(아모세)면 병종 메커니즘 안내의 표 셋이 뜬다 (아래 넘침 검사가 이 상태를 지나간다)");
  for (const w of [430, 390, 360, 320]) {
    await p.setViewportSize({width: w, height: 800});
    const r = await p.evaluate(() => {
      const cw = document.documentElement.clientWidth, guilty = [];
      document.querySelectorAll("#tab-comp table").forEach(t => {
        if (t.closest(".xscroll")) return;
        if (t.getBoundingClientRect().right > cw + 1) guilty.push([...t.querySelectorAll("thead th")].map(x => x.innerText.trim()).join("/").slice(0, 40));
      });
      return {body: document.documentElement.scrollWidth, cw, guilty};
    });
    ok(r.body <= r.cw + 2, lang + " — 병종 전용 섹션이 뜬 편성도 " + w + "px 에서 본문이 가로로 넘치지 않는다",
       r.body + "px / " + r.cw + "px" + (r.guilty.length ? " · 범인: " + r.guilty.join(" | ") : ""));
  }
  await p.close();
}
ok(!/tab=gear/.test(ko.url()), "URL 에서 tab=gear 가 빠진다", ko.url());
ok(/①/.test(await outText(ko)), "편성 결과가 그대로 있다");

// ── 3.7 조이너 안내 — 시트 카드 · 계산 카드 (2026-11-11) ────────────────
// 지금 편성은 제로니모·미아·그웬 48/4/48 Gen 7 — 시트가 노라를 3칸 적은 행이다.
section("조이너 안내 — 시트 카드 · 계산 카드");
{
  const j = await ko.evaluate(() => {
    const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
    const names = s => qa(s).map(e => e.textContent.replace(/^\d/, "").trim());
    const box = s => { const e = q(s); if (!e) return null; const r = e.getBoundingClientRect(); return {l: r.left, r: r.right, t: r.top, b: r.bottom}; };
    return {
      sheet: names('#sheet .srow [data-k="main"] .hc'), rec: names("#rec > p > b .hc"),
      cmp: !!q("#cmp"), cmpText: q("#cmp") ? q("#cmp").textContent : "",
      broken: qa("#out img.hpic").filter(i => i.complete && i.naturalWidth === 0).length,
      // 칩 줄만 flex 여야 한다 — 설명 문단의 굵은 글씨까지 flex 가 되면 줄이 깨진다(실제로 그렇게 됐다)
      flexB: qa("#out .jcard p.cap b, #out .jcard p.note b").filter(b => getComputedStyle(b).display === "flex").length,
      chipFlex: getComputedStyle(q("#rec > p > b")).display,
      open: ["single", "how", "tips"].map(id => q("#" + id) ? q("#" + id).open : null),
      sb: box("#sheet"), rb: box("#rec"),
    };
  });
  // Gen 7 행의 4번 칸은 시트 원문이 "Norah/Patrick" 이다 — 한 칸에 두 이름이 그대로 보여야 한다
  ok(j.sheet.join() === "노라,노라,노라,노라/패트릭", "시트 카드가 시트 칸을 그대로 싣는다 (노라 3칸 + 노라/패트릭 칸)", j.sheet.join(","));
  ok(j.rec.length === 4 && j.rec.filter(x => x === "노라").length < 3, "계산 카드는 네 명을 따로 고른다 (노라 3장을 쌓지 않는다)", j.rec.join(","));
  ok(j.cmp && /칸 중/.test(j.cmpText), "시트 vs 계산 비교 문단이 뜬다");
  ok(j.broken === 0, "카드의 초상이 깨지지 않는다", j.broken + "개");
  ok(j.flexB === 0 && j.chipFlex === "flex", "칩 줄만 flex 고 설명 문단의 굵은 글씨는 그대로다", "문단 속 flex " + j.flexB + " · 칩 줄 " + j.chipFlex);
  ok(j.open.every(x => x === false), "순위표 · 계산 방식 · 시트 머리말은 접힌 채로 뜬다", j.open.join(","));
  ok(j.sb && j.rb && j.rb.l >= j.sb.r - 1 && Math.abs(j.rb.t - j.sb.t) < 4, "넓은 화면에서는 시트 카드와 계산 카드가 나란히 선다",
     j.sb && j.rb ? "시트 " + Math.round(j.sb.l) + "~" + Math.round(j.sb.r) + " · 계산 " + Math.round(j.rb.l) + "~" + Math.round(j.rb.r) : "카드 없음");
  // 접힌 것은 눌러야 열린다
  await ko.click("#how > summary");
  ok(await ko.evaluate(() => document.getElementById("how").open), "「계산 방식과 한계」를 누르면 펼쳐진다");
  ok(await ko.isVisible("#how .callout"), "펼치면 감소 계열 안내가 보인다");
  await ko.click("#how > summary");
  // 숫자를 고친 직후의 첫 클릭이 삼켜지지 않는다 — 입력칸에서 포커스가 빠질 때 오는 change 가 결과를 통째로 다시 그리면
  // 누르던 요소가 사라진다. 결과가 같으면 다시 그리지 않으므로 살아 있어야 한다.
  await ko.fill("#r3", "48");
  await ko.click("#single > summary");
  ok(await ko.evaluate(() => document.getElementById("single").open), "병비 칸을 만진 직후에도 순위표 접기가 첫 클릭에 열린다");
  // 열어 둔 접기는 입력이 바뀌어 다시 그려져도 열린 채다
  await setRatio(ko, "r", [50, 2, 48]);
  ok(await ko.evaluate(() => document.getElementById("single").open), "병비를 바꿔도 열어 둔 순위표는 열린 채다");
  await ko.click("#single > summary");
  await setRatio(ko, "r", [48, 4, 48]);
  ok(!(await ko.evaluate(() => document.getElementById("single").open)), "닫아 둔 접기는 닫힌 채다");

  // 좁은 화면에서는 위아래로 쌓인다
  await ko.setViewportSize({width: 390, height: 900});
  const m = await ko.evaluate(() => { const b = id => document.getElementById(id).getBoundingClientRect();
    return {st: b("sheet").top, sb: b("sheet").bottom, rt: b("rec").top, w: document.body.scrollWidth}; });
  ok(m.rt >= m.sb - 1, "390px 에서는 시트 카드 아래에 계산 카드가 온다", "시트 끝 " + Math.round(m.sb) + " · 계산 시작 " + Math.round(m.rt));
  ok(m.w <= 392, "390px 에서 본문이 가로로 넘치지 않는다", m.w + "px");
  await ko.setViewportSize({width: 1280, height: 720});

  // 병비가 다른 시트 행 안내(📍) — 버튼을 누르면 그 병비로 옮겨 간다
  await ko.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("change")); };
    set("gcap", "4"); set("hInf", "ahmose"); set("hLan", "philly"); set("hMar", "lynn");
  });
  await setRatio(ko, "r", [60, 40, 0]);
  ok(await ko.isVisible('#sheet [data-k="near"]'), "병비가 맞는 행이 없으면 리더가 같은 행을 안내한다");
  ok(!(await ko.evaluate(() => !!document.getElementById("cmp"))), "그때는 비교 문단이 없다 (병비가 다른 행과는 비교하지 않는다)");
  await ko.click('#sheet button[data-r="50,2,48"]');
  await ko.waitForTimeout(80);
  const after = await ko.evaluate(() => ({r: [r1.value, r2.value, r3.value].join("/"), near: !!document.querySelector('#sheet [data-k="near"]'),
    mult: !!document.querySelector("#sheet .srow .mult"), cmp: !!document.getElementById("cmp")}));
  ok(after.r === "50/2/48" && !after.near && after.mult && after.cmp, "병비 버튼을 누르면 그 병비로 바뀌고 시트 행이 잡힌다", JSON.stringify(after));
  ok((await ko.evaluate(k => ((JSON.parse(localStorage.getItem(k) || "{}").cur || {}).r || []).join("/"), COMP_KEY)) === "50/2/48",
     "병비 버튼으로 바꾼 것도 마지막 편성으로 저장된다 (입력칸을 거치지 않는 경로)");

  // 시트가 답을 둘 적어 둔 자리 — 블록 두 개
  await ko.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("change")); };
    set("gcap", "12"); set("hInf", "herbjorg"); set("hLan", "lloyd"); set("hMar", "ligeia");
  });
  await setRatio(ko, "r", [60, 20, 20]);
  ok((await ko.evaluate(() => document.querySelectorAll("#sheet .srow").length)) === 2, "시트가 답을 둘 적은 편성은 두 블록이 다 뜬다");
  ok((await ko.evaluate(() => document.querySelectorAll("#cmp .cmprow").length)) === 2, "비교 문단도 행마다 뜬다 (대표 행 하나만 고르지 않는다)");

  // 이름을 펴서 실은 칸에는 시트 원문 표기가 같이 보인다 — Gen 5 헥터·노라·린 50/20/30 의 4번 칸은 시트가 별표 없이 "Jessie" 라고 적었다
  await ko.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("change")); };
    set("gcap", "5"); set("hInf", "hector"); set("hLan", "norah"); set("hMar", "lynn");
  });
  await setRatio(ko, "r", [50, 20, 30]);
  const rawChip = await ko.evaluate(() => {
    const chips = [...document.querySelectorAll('#sheet .srow [data-k="main"] .hc')];
    const c = chips[3], raw = c && c.querySelector("i.raw"), note = document.querySelector('#sheet [data-k="raw"]');
    const cr = c && c.getBoundingClientRect(), card = document.getElementById("sheet").getBoundingClientRect();
    return {n: chips.length, raw: raw ? raw.textContent : null, vis: raw ? raw.getBoundingClientRect().width > 0 : false,
            imgs: c ? c.querySelectorAll("img").length : 0, inside: !!cr && cr.right <= card.right + 1, note: note ? note.textContent : ""};
  });
  ok(rawChip.n === 4 && rawChip.raw === "Jessie" && rawChip.vis && rawChip.imgs === 3 && rawChip.inside,
     "펴서 실은 칸에 시트 원문 표기(Jessie)가 보이고 칩이 카드 밖으로 나가지 않는다", JSON.stringify(rawChip).slice(0, 160));
  ok(/우리 해석/.test(rawChip.note) && /Jessie\*/.test(rawChip.note), "범례에 없는 표기는 우리 해석이라고 밝힌다", rawChip.note.slice(0, 120));
  await ko.setViewportSize({width: 390, height: 900});
  ok((await ko.evaluate(() => document.body.scrollWidth)) <= 392, "원문 표기가 붙은 칩도 390px 에서 넘치지 않는다");
  await ko.setViewportSize({width: 1280, height: 720});

  // 리더를 다 비웠다가 같은 리더를 다시 고르면 결과가 돌아온다 (2026-11-11 리뷰 — 안내문이 그대로 남던 버그)
  const setLeaders = (a, b, c) => ko.evaluate(([a, b, c]) => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("change")); };
    set("hInf", a); set("hLan", b); set("hMar", c);
  }, [a, b, c]);
  const before = await ko.evaluate(() => document.getElementById("out").innerHTML.length);
  await setLeaders("", "", "");
  const empty = await ko.evaluate(() => ({t: document.getElementById("out").textContent, sheet: !!document.getElementById("sheet")}));
  ok(/리더를 한 명 이상 선택하세요/.test(empty.t) && !empty.sheet, "리더를 다 비우면 안내문만 남는다", empty.t.slice(0, 60));
  await setLeaders("hector", "norah", "lynn");
  const back = await ko.evaluate(() => ({sheet: !!document.getElementById("sheet"), rec: document.querySelectorAll("#rec > p > b .hc").length, n: document.getElementById("out").innerHTML.length}));
  ok(back.sheet && back.rec === 4 && back.n === before, "같은 리더를 다시 고르면 조이너 안내가 돌아온다", JSON.stringify(back) + " · 전 " + before);

  // 원래 편성으로 되돌린다 (아래 검사들이 기본 상태를 기대한다)
  await ko.evaluate(() => {
    const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event("change")); };
    set("gcap", "7"); set("hInf", "jeronimo"); set("hLan", "mia"); set("hMar", "gwen");
  });
  await setRatio(ko, "r", [48, 4, 48]);
}

// ?tab=gear 딥링크
{
  const dl = await open("?tab=gear");
  ok(await dl.isVisible("#tab-gear"), "?tab=gear 딥링크로 바로 장비 탭이 열린다");
  ok(!(await dl.isVisible("#tab-comp")), "딥링크에서 편성 탭은 감춰져 있다");
  await dl.close();
}

// ── 3.8 편성 저장 · 이전 편성 (2026-11-11) ─────────────────────────────
// 저장이 살아 있는 별도 컨텍스트 — 위의 공유 컨텍스트는 열 때마다 저장된 편성을 지운다.
// 머무는 시간(HIST_SETTLE_MS)은 검사가 그때그때 바꾼다: "금방 지나간다" 는 기본값(초 단위)에 맡기고, "머물렀다" 는 100ms 로 줄여 기다린다.
// 타이머와 경주하는 단계는 한 번의 evaluate 로 묶었다(값 바꾸기 + 픽커 열기) — 클릭 사이 시간에 기대면 느린 기계에서 흔들린다.
section("편성 저장 · 이전 편성");
{
  const hctx = await browser.newContext();
  hctx.on("weberror", e => errors.push(String(e.error())));
  // 이 절은 앞 단계가 만든 칩을 다음 단계가 누른다 — 한 군데가 어긋나면 "없는 칩을 기다리다" 30초 뒤에 스크립트가 통째로 죽고 요약이 안 나온다
  // (사보타주에서 변형 4종이 그렇게 걸렸다). 기다림을 줄이고, 멈추면 실패 한 줄로 남긴 뒤 다음 절로 넘어간다.
  hctx.setDefaultTimeout(6000);
  try {
  const p = await open("", hctx);
  const reload = async pg => { await pg.reload(); await pg.waitForSelector("#out h2", {state: "attached"}); };
  const stored = pg => pg.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), COMP_KEY);
  const state = pg => pg.evaluate(() => {
    const v = id => document.getElementById(id).value, t = id => document.getElementById(id).textContent.trim();
    return {l: ["hInf", "hLan", "hMar"].map(v).join(), w: ["wInf", "wLan", "wMar"].map(v).join(), r: ["r1", "r2", "r3"].map(v).join("/"),
            e: ["e1", "e2", "e3"].map(v).join("/"), g: v("gcap"), def: document.getElementById("mDef").classList.contains("on"),
            sk: document.getElementById("skHeavy").checked, pick: ["sInf", "sLan", "sMar"].map(t).join(" | "), lab: t("eLab"), key: luKey(luState())};
  });
  const outHtml = pg => pg.evaluate(() => document.getElementById("out").innerHTML);
  const chips = pg => pg.evaluate(() => [...document.querySelectorAll("#hist .hgo")].map(b => b.getAttribute("data-k")));
  const histHidden = pg => pg.evaluate(() => getComputedStyle(document.getElementById("hist")).display === "none");
  const pick = async (pg, det, id) => { await pg.click("#" + det + " > summary"); await pg.click("#" + det + " .pk[data-id='" + id + "']"); await pg.waitForTimeout(40); };
  const settle = (pg, ms) => pg.evaluate(n => { HIST_SETTLE_MS = n; }, ms);
  const chipSel = k => '#hist .hgo[data-k="' + k + '"]';

  // ── 처음 방문 ──
  ok((await stored(p)) === null && (await histHidden(p)), "처음 열면 아무것도 저장하지 않고 이전 편성 자리는 감춰져 있다");

  // ── ① 마지막 편성이 새로 고쳐도 그대로다 — 진짜 클릭·타이핑으로 만든다 ──
  await pick(p, "pMar", "wayne");
  await p.selectOption("#gcap", "6");
  await p.fill("#wMar", "8");
  await setRatio(p, "e", [60, 40, 0]);
  await p.check("#skHeavy");
  await p.click("#mDef");
  await p.waitForTimeout(60);
  const s1 = await state(p), out1 = await outHtml(p);
  await reload(p);
  const s2 = await state(p), out2 = await outHtml(p);
  ok(s2.l === "jeronimo,mia,wayne" && s2.w === "10,10,8" && s2.r === "48/4/48" && s2.e === "60/40/0" && s2.g === "6" && s2.def && s2.sk,
     "새로 고쳐도 리더 · 전무 · 내 병비 · 상대 병비 · 서버 세대 · 모드 · 토글이 그대로다", JSON.stringify(s2));
  ok(/웨인/.test(s2.pick) && JSON.stringify(s2) === JSON.stringify(s1), "초상 픽커 표시와 상대 병비 라벨도 닫기 전과 같다", s2.pick + " / " + s2.lab);
  ok(out2 === out1, "새로 고친 화면의 결과가 닫기 전과 같다", out1.length + " → " + out2.length);
  ok((await chips(p)).length === 0, "지금 화면의 편성은 이전 편성 칩으로 나오지 않는다");
  const kA = s2.key;

  // ── ② 언제 칩이 생기는가 ──
  await pick(p, "pInf", "flint");          // 되살린 편성을 떠난다
  ok((await chips(p)).join(" ; ") === kA && (await p.isVisible(chipSel(kA))), "되살린 편성을 떠나면 그 편성이 칩으로 생긴다", (await chips(p)).join(" ; "));
  await pick(p, "pLan", "philly");         // 곧바로 다음 리더 — 중간 편성(플린트·미아·웨인)은 머문 적이 없다
  ok((await chips(p)).join(" ; ") === kA, "리더를 이어서 바꾸는 중간 편성은 칩으로 남지 않는다", (await chips(p)).join(" ; "));
  // 머문다 — 전무를 고치면(같은 편성의 딸린 값) 그때부터 다시 잰다
  await settle(p, 100);
  await p.fill("#wInf", "9");
  await p.waitForTimeout(350);
  await settle(p, 3000);
  await setRatio(p, "r", [60, 40, 0]);
  const kX = "defender|flint,philly,wayne|48/4/48|6";
  ok((await chips(p)).join(" ; ") === [kX, kA].join(" ; "), "머물렀던 편성을 떠나면 맨 앞 칩으로 들어가고, 병비를 타이핑하는 중간 숫자는 안 남는다", (await chips(p)).join(" ; "));
  ok((await stored(p)).hist[0].w.join() === "9,10,8", "떠날 때의 전무 레벨이 그 편성과 같이 저장된다");
  // 픽커를 열어 둔 시간은 머문 시간이 아니다 — 값 바꾸기와 픽커 열기를 한 번에 해서 타이머와 경주하지 않는다
  await settle(p, 100);
  await p.evaluate(() => { const w = document.getElementById("wInf"); w.value = "10"; w.dispatchEvent(new Event("input", {bubbles: true}));
                           document.getElementById("pMar").open = true; });
  await p.waitForTimeout(450);
  await settle(p, 3000);
  await p.click("#gMar .pk[data-id='alonso']");
  await p.waitForTimeout(40);
  ok((await chips(p)).join(" ; ") === [kX, kA].join(" ; "), "픽커를 열어 둔 채 흐른 시간은 머문 것으로 치지 않는다 (60/40 중간 편성이 안 남는다)", (await chips(p)).join(" ; "));

  // ── ③ 불러오기 ──
  const beforeLoad = await outHtml(p);
  await p.click(chipSel(kA));
  await p.waitForTimeout(60);
  const s3 = await state(p);
  ok(s3.key === kA && s3.l === "jeronimo,mia,wayne" && s3.w === "10,10,8" && s3.r === "48/4/48" && s3.e === "60/40/0" && s3.def && s3.sk,
     "칩을 누르면 그 편성이 입력칸에 통째로 들어간다", JSON.stringify(s3));
  ok(/웨인/.test(s3.pick) && (await outHtml(p)) === out1 && out1 !== beforeLoad, "픽커 표시와 결과도 불러온 편성의 것이다", s3.pick);
  // 방금까지의 편성(플린트·필리·알론소 60/40)은 머문 적이 없다 — 그래도 칩으로 덮어쓸 때는 남긴다. 안 남기면 만들던 편성으로 돌아갈 길이 없다
  const kZ = "defender|flint,philly,alonso|60/40/0|6";
  ok((await chips(p)).join(" ; ") === [kZ, kX].join(" ; "), "불러온 편성은 목록에서 빠지고, 방금까지의 편성은 머문 적이 없어도 맨 앞 칩으로 남는다", (await chips(p)).join(" ; "));
  // 병비를 고친 직후의 첫 클릭이 삼켜지지 않는다 — 포커스가 빠지며 오는 change 가 목록을 다시 그리면 누르던 칩이 사라진다
  await p.fill("#r1", "47");
  await p.click(chipSel(kA));
  await p.waitForTimeout(60);
  ok((await state(p)).r === "48/4/48", "병비 칸을 만진 직후에도 칩이 첫 클릭에 불러와진다", (await state(p)).r);
  // 더블클릭 — 첫 클릭에 목록이 한 칸 밀려 같은 자리에 방금까지의 편성이 와 있다. 둘째 클릭을 받으면 제자리로 돌아가 버린다
  await p.dblclick(chipSel(kX));
  await p.waitForTimeout(80);
  ok((await state(p)).key === kX && (await chips(p))[0] === kA, "칩을 더블클릭해도 한 번만 불러온다 (방금 떠난 편성이 첫 칩이다)", (await state(p)).key + " · 칩 " + (await chips(p)).join(" ; "));
  // 키보드 — 칩은 버튼이라 Enter 로도 불러와진다. 눌린 칩은 사라지므로 포커스를 맨 앞 칩(방금 떠난 편성)으로 옮긴다
  const focusAt = () => p.evaluate(() => { const a = document.activeElement; return a && a.closest && a.closest("#hist") ? a.className + "|" + a.getAttribute("data-k") : "밖(" + (a ? a.tagName : "") + ")"; });
  await p.focus(chipSel(kA));
  await p.keyboard.press("Enter");
  await p.waitForTimeout(60);
  ok((await state(p)).key === kA && (await chips(p))[0] === kX, "칩에 포커스를 두고 Enter 를 눌러도 불러와진다", (await state(p)).key);
  ok((await focusAt()) === "hgo|" + kX, "불러온 뒤 포커스가 맨 앞 칩에 있다 — body 로 빠지지 않는다 (Enter 한 번 더면 되돌아간다)", await focusAt());

  // ── ④ 지우기 — 새로 고쳐도 지워진 채다 ──
  const kT = "defender|jeronimo,mia,wayne|47/4/48|6";   // 위에서 47 을 치다 만 편성 — 칩으로 떠났으므로 남아 있다
  // 가운데 칩을 지운다 — 맨 앞 칩을 지우면 "그 자리" 와 "맨 앞" 이 같아서 포커스 검사가 헛돈다
  ok((await chips(p)).join(" ; ") === [kX, kT, kZ].join(" ; "), "(전제) 칩 셋 — 방금 떠난 편성 · 47 을 치다 만 편성 · 만들다 떠난 편성", (await chips(p)).join(" ; "));
  await p.focus('#hist .hx[data-k="' + kT + '"]');
  await p.keyboard.press("Enter");
  await p.waitForTimeout(40);
  ok((await chips(p)).join(" ; ") === [kX, kZ].join(" ; ") && (await state(p)).key === kA, "✕ 는 그 칩만 지운다 — 나머지 칩과 지금 편성은 그대로다", (await chips(p)).join(" ; "));
  ok((await focusAt()) === "hx|" + kZ, "지운 뒤 포커스가 그 자리에 온 칩의 ✕ 에 있다", await focusAt());
  // ✕ 에는 더블클릭 가드가 없다 — 이어 누르는 클릭(detail 2)도 지워야 한다. 가드를 걸면 연달아 지울 때 첫 번째만 지워진다
  // (detail 2 인 클릭을 직접 쏜다 — Playwright 의 clickCount 옵션으로는 detail 이 안 올라가서, 가드를 일부러 걸어도 이 검사가 통과했다)
  await p.click("#hist .hx");
  await p.evaluate(() => document.querySelector("#hist .hx").dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, detail: 2})));
  await p.waitForTimeout(40);
  ok((await chips(p)).length === 0 && (await histHidden(p)) && (await state(p)).key === kA, "칩을 다 지우면 자리도 감춘다 (✕ 는 이어 누르는 클릭도 받는다)", (await chips(p)).join(" ; "));
  await reload(p);
  ok((await chips(p)).length === 0 && (await state(p)).key === kA, "지운 편성은 새로 고쳐도 돌아오지 않는다", (await chips(p)).join(" ; "));
  // 모드 버튼도 편성을 바꾸는 것이다
  await p.click("#mAtk");
  await p.waitForTimeout(40);
  ok((await stored(p)).cur.m === "rally" && (await chips(p)).join(" ; ") === kA, "공성/수성을 바꾸면 저장되고, 떠난 쪽이 칩으로 남는다", (await chips(p)).join(" ; "));

  // ── ⑤ 칩이 많을 때 — 12개 ──
  await p.evaluate(k => {
    const d = JSON.parse(localStorage.getItem(k));
    d.hist = Array.from({length: 12}, (_, i) => ({m: i % 2 ? "defender" : "rally", l: ["jeronimo", i % 3 ? "mia" : "", "alonso"], w: ["10", "10", "10"],
      r: [String(40 + i), "10", String(50 - i)], e: ["", "", ""], g: i % 4 ? "6" : "99", sk: 0, t: 100 - i}));
    localStorage.setItem(k, JSON.stringify(d));
  }, COMP_KEY);
  await reload(p);
  const many = await p.evaluate(async () => {
    const row = document.querySelector("#hist .hrow");
    row.scrollIntoView(); await new Promise(r => setTimeout(r, 250));
    const imgs = [...document.querySelectorAll("#hist img")];
    return {n: document.querySelectorAll("#hist .hchip").length, body: document.body.scrollWidth, vw: window.innerWidth,
            rowFits: row.scrollWidth <= row.clientWidth + 1, rows: new Set([...row.children].map(c => Math.round(c.getBoundingClientRect().top))).size,
            broken: imgs.filter(i => i.complete && i.naturalWidth === 0).length, imgs: imgs.length};
  });
  ok(many.n === 12 && many.imgs === 32 && many.broken === 0, "칩 12개가 다 뜨고 초상이 깨지지 않는다", JSON.stringify(many));
  ok(many.body <= many.vw + 1 && many.rowFits && many.rows > 1, "넓은 화면에서는 칩이 여러 줄로 접힌다 (본문이 넘치지 않는다)", JSON.stringify(many));
  await p.setViewportSize({width: 390, height: 900});
  const narrow = await p.evaluate(() => { const row = document.querySelector("#hist .hrow");
    return {body: document.body.scrollWidth, scrolls: row.scrollWidth > row.clientWidth + 1, rows: new Set([...row.children].map(c => Math.round(c.getBoundingClientRect().top))).size,
            chipH: Math.round(row.children[0].getBoundingClientRect().height)}; });
  ok(narrow.body <= 392, "390px 에서 칩 12개가 본문을 가로로 밀지 않는다", narrow.body + "px");
  ok(narrow.scrolls && narrow.rows === 1, "좁은 화면에서는 한 줄로 두고 그 줄만 옆으로 민다 (입력 패널이 길어지지 않는다)", JSON.stringify(narrow));
  ok(narrow.chipH >= 30, "칩이 손가락으로 누를 만한 높이다", narrow.chipH + "px");
  await p.setViewportSize({width: 320, height: 800});
  ok((await p.evaluate(() => document.body.scrollWidth)) <= 322, "320px 에서도 넘치지 않는다");
  await p.setViewportSize({width: 1280, height: 720});

  // ── ⑥ 언어 ──
  await p.click("#lgEn");
  await p.waitForTimeout(120);
  const enHist = await p.evaluate(() => document.getElementById("hist").innerHTML);
  ok(/Earlier lineups/.test(enHist) && !/[가-힣]/.test(enHist), "English 로 바꾸면 칩의 툴팁 · 접근명 · 머리말까지 영어가 된다", (enHist.match(/[가-힣]+/g) || []).slice(0, 5).join(","));
  await p.click("#lgKo");
  await p.waitForTimeout(120);
  ok(/이전 편성/.test(await p.textContent("#hist")), "한국어로 돌아오면 칩도 한국어다");
  {
    const e = await open("?lang=en", hctx);
    const h = await e.evaluate(() => document.getElementById("hist").innerHTML);
    ok((await chips(e)).length === 12 && !/[가-힣]/.test(h), "?lang=en 으로 바로 열어도 저장된 편성이 영어 칩으로 뜬다", (h.match(/[가-힣]+/g) || []).slice(0, 5).join(","));
    await e.close();
  }

  // ── ⑦ 깨진 저장값 · 저장이 막힌 브라우저 ──
  await p.evaluate(k => localStorage.setItem(k, "{bad"), COMP_KEY);
  await reload(p);
  const s7 = await state(p);
  ok(s7.l === "jeronimo,mia,alonso" && s7.g === "4" && (await chips(p)).length === 0, "저장값이 깨졌으면 기본 편성으로 열린다", JSON.stringify(s7).slice(0, 120));
  await pick(p, "pMar", "wayne");
  ok((await stored(p)).cur.l.join() === "jeronimo,mia,wayne", "깨진 저장값은 다음 저장 때 멀쩡한 값으로 덮인다");
  await hctx.close();
  {
    const bctx = await browser.newContext();
    bctx.on("weberror", e => errors.push(String(e.error())));
    await bctx.addInitScript(() => { Object.defineProperty(window, "localStorage", {get() { throw new Error("storage blocked"); }}); });
    const b = await open("", bctx);
    await pick(b, "pMar", "wayne");
    await setRatio(b, "r", [60, 40, 0]);
    const sb = await state(b);
    ok(sb.l === "jeronimo,mia,wayne" && sb.r === "60/40/0" && /웨인/.test(await outText(b)) && (await histHidden(b)),
       "저장소 접근이 막힌 브라우저에서도 계산은 그대로 돈다 (목록만 없다)", JSON.stringify(sb).slice(0, 120));
    await bctx.close();
  }
  } catch (e) {
    ok(false, "편성 저장 시나리오가 끝까지 돈다", String(e).split("\n")[0].slice(0, 200));
  } finally {
    await hctx.close().catch(() => {});
  }
  ok(errors.length === 0, "편성 저장 시나리오에서 에러 없음", errors.slice(0, 3).join(" | "));
}

// ── 4. 언어 ────────────────────────────────────────────────────────────
section("언어");
const en = await open("?lang=en&tab=gear");
const enOut = (await outText(en)) + (await en.textContent("#tab-gear"));
ok(enOut.includes("Leaders"), "?lang=en 이면 영어로 뜬다");
const HANGUL = /[가-힣]/;
const enHits = enOut.split("\n").filter(l => HANGUL.test(l)).slice(0, 3);
ok(!HANGUL.test(enOut), "영어로 열면 결과에 한글이 없다", enHits.join(" | "));

await ko.click("#tabGear");
await ko.click("#lgEn");
await ko.waitForTimeout(120);
const toggled = (await outText(ko)) + (await ko.textContent("#tab-gear"));
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
