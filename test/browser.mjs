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
for (const sec of ["① 리더 구성", "② SkillMod 칸 진단", "③ 위젯", "⑤ 조이너 한계 배율"])
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
    rows: document.querySelectorAll("#gSteps tbody tr").length,
    want: gearPlan(gearInput()).steps.length,
  }));
  ok(rows === want && rows > 12, "순서표 행 수가 엔진 스텝 수와 같다", rows + " vs " + want);
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
  const rows = await ko.evaluate(() => document.querySelectorAll("#gSteps tbody tr").length);
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
await ko.click("#gSteps tbody tr:first-child .gchk");
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
    rows: document.querySelectorAll("#gSteps tbody tr").length,
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
ok(!/tab=gear/.test(ko.url()), "URL 에서 tab=gear 가 빠진다", ko.url());
ok(/①/.test(await outText(ko)), "편성 결과가 그대로 있다");

// ?tab=gear 딥링크
{
  const dl = await open("?tab=gear");
  ok(await dl.isVisible("#tab-gear"), "?tab=gear 딥링크로 바로 장비 탭이 열린다");
  ok(!(await dl.isVisible("#tab-comp")), "딥링크에서 편성 탭은 감춰져 있다");
  await dl.close();
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
