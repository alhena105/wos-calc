// data.xlsx(→ out/xlsx/*.tsv) 의 시트 원문을 test/fixtures-sheet.mjs 로 옮긴다 — **글자 그대로**.
// 왜: 화면의 「📋 Ton 시트」 카드는 SHEET_COMPS 를 그리는데, unit.mjs 가 화면을 SHEET_COMPS 와만 대조하면 같은 출처끼리의 비교라
//     데이터가 틀려도 통과한다(2026-11-11 리뷰). 원문 대조(01-xlsx-diff)는 xlsx·python 이 있어야 돌아 커밋 전 검사 밖이었다.
//     이 파일이 낸 정답지를 unit.mjs 가 읽으므로, 시트 원문 대조가 커밋 게이트 안으로 들어온다.
// 시트가 갱신되면: python tools/sim/xlsx2tsv.py data.xlsx → node tools/sim/04-sheet-fixture.mjs → node test/unit.mjs
import {readFileSync, writeFileSync} from "node:fs";
import {SCRATCH, ROOT, api, heroIds, parseRatios} from "./lib.mjs";

const E = api();
const TABS = ["EN_Rallies_Ratios_Joiners.tsv", "Sheet4.tsv"];   // Gen 1~9 · Gen 10+
const FREE = /^or 25%|^20% ones/i;                              // 영웅 이름이 아닌 자유 문구(스킬 계열) — id 로 옮기지 않는다
const rows = [], head = [], tokens = {}, ratios = {};
const clean = s => (s || "").replace(/\r/g, "").trim();
const trimTail = a => { a = a.slice(); while (a.length && !a[a.length - 1]) a.pop(); return a; };
const keep = x => { if (head.indexOf(x) < 0) head.push(x); };
// 칸 하나의 원문 → 영웅 id. 못 옮기는 이름이 있으면 여기서 멈춘다(조용히 "?" 를 싣지 않는다).
const tok = s => {
  if (!s || FREE.test(s)) return;
  const ids = heroIds(s, E.HEROES);
  if (ids.some(x => x[0] === "?")) throw new Error("시트 이름을 영웅 id 로 못 옮겼습니다: " + JSON.stringify(s) + " — tools/sim/lib.mjs 의 ALIAS 를 볼 것");
  tokens[s] = ids;
};
for (const f of TABS) {
  const lines = readFileSync(SCRATCH + "/out/xlsx/" + f, "utf8").split("\n");
  let gen = 0;
  for (const ln of lines) {
    const c = ln.split("\t").map(clean);
    const g = /^Generation (\d+)/.exec(c[0] || "");
    if (g) { gen = +g[1]; continue; }
    // 머리말(세대 표가 시작되기 전) — 비어 있지 않은 칸을 그대로 모은다
    if (!gen) { c.filter(Boolean).forEach(keep); continue; }
    if (!c[1] || !/\d+\s*\/\s*\d+/.test(c[0])) {
      // 표 아래의 범례("*Jessie = Jessie, Jasser or Jeronimo") — 첫 칸이 아니라 오른쪽 칸에 있다
      c.filter(x => /^\*+\w.*=/.test(x)).forEach(keep);
      continue;
    }
    // 칸은 **자리를 지킨다** — Joiner #1~#4(2~5열) · Alternative #1~#3(6~8열). 빈칸은 "" 로 남긴다(Gen 13 은 조이너 칸이 비어 있다).
    const r = {g: gen, lb: c[0], l: c[1], j: trimTail(c.slice(2, 6)), alt: trimTail(c.slice(6, 9)), c: c[9] || ""};
    rows.push(r);
    r.l.split(/[&,]/).map(clean).forEach(tok); r.j.forEach(tok); r.alt.forEach(tok);
    ratios[r.lb] = parseRatios(r.lb);
  }
}
const out = "// ⚠️ 자동 생성 — 손으로 고치지 말 것. `node tools/sim/04-sheet-fixture.mjs` 가 data.xlsx 의 TSV 사본에서 만든다.\n" +
  "// Ton 시트(Heroes, Rallies, Ratios and Joiners) EN 두 탭의 편성 행 **원문 그대로** — 오타(Patrik · Seeyoon · Gisala)와 별표 표기까지.\n" +
  "// unit.mjs 가 src/data.js 의 SHEET_COMPS(lb · l · rs · j · jx · alt · ao · ax · c)와 한 행씩 대조한다.\n" +
  "export const SHEET_RAW = [\n" + rows.map(r => " " + JSON.stringify(r)).join(",\n") + "\n];\n" +
  "// 두 탭 머리의 지침과 범례(중복 제거 · 나온 순서). SHEET_TIPS 의 원문이 여기 있는 줄이어야 한다.\n" +
  "export const SHEET_HEAD = " + JSON.stringify(head, null, 1) + ";\n" +
  "// ── 여기부터는 원문이 아니라 **우리 읽기**다 (tools/sim/lib.mjs 의 heroIds · parseRatios 가 낸 값) ──\n" +
  "// 칸 원문 → 영웅 id. 이름 하나가 여러 id 로 펴지는 칸(Jessie* · Sergey** 는 시트 범례, 별표 없는 Jessie · Jessie** · Jessies 는 우리 해석)이 한눈에 보인다.\n" +
  "export const SHEET_TOKENS = {\n" + Object.keys(tokens).sort().map(k => " " + JSON.stringify(k) + ": " + JSON.stringify(tokens[k])).join(",\n") + "\n};\n" +
  "// 행 라벨 → 병비 목록(보/창/궁). 2자리 약칭과 범위 표기(50/5-10/40-45)를 편 결과다.\n" +
  "export const SHEET_RATIOS = {\n" + Object.keys(ratios).sort().map(k => " " + JSON.stringify(k) + ": " + JSON.stringify(ratios[k])).join(",\n") + "\n};\n";
writeFileSync(ROOT + "/test/fixtures-sheet.mjs", out);
console.log("test/fixtures-sheet.mjs — 편성 행", rows.length, "· 머리말 줄", head.length, "· 칸 표기", Object.keys(tokens).length, "종 · 라벨", Object.keys(ratios).length, "종");
