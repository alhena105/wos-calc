// src/* 를 순서대로 이어붙여 index.html 을 만든다. 번들러 없음 — 순수 연결이다.
// 순수 연결을 고집하는 이유: 배너 한 줄만 넣어도 산출물이 바뀌어서
// "분해 전후 바이트 동일" 이라는 검증 수단을 잃는다.
//
// 조립 순서가 곧 의존 순서다.
//   part1.html  마크업 + CSS + <script> 여는 태그
//   i18n.js     LANG 결정 · L(ko,en) · HN() · STR      ← engine 이 최상위에서 L() 을 부르므로 data 보다 앞
//   data.js     영웅 45명 데이터베이스
//   engine.js   계산 로직 + calc() (DOM 읽기)
//   render.js   출력 HTML 생성 + 프리셋/합계 경고 + init IIFE + </script></body></html>
//
// 사용법:  node build.mjs          src → index.html
//          node build.mjs --check  산출물이 최신인지만 확인 (쓰지 않음, 다르면 exit 1)
import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
export const PARTS = ["part1.html", "i18n.js", "data.js", "engine.js", "render.js"];
export const OUT = "index.html";

export function bundle() {
  return PARTS.map(p => readFileSync(join(ROOT, "src", p), "utf8")).join("");
}

// import 로 불릴 때(테스트)는 아무것도 쓰지 않는다. 직접 실행할 때만 동작한다.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1]);
const check = process.argv.includes("--check");
const built = bundle();
const outPath = join(ROOT, OUT);

if (!isMain) { /* 모듈로 import 됨 — bundle()/PARTS 만 제공 */ }
else if (check) {
  let cur = "";
  try { cur = readFileSync(outPath, "utf8"); } catch { /* 산출물 없음 */ }
  if (cur === built) { console.log(`✅ ${OUT} 최신 (${Buffer.byteLength(built)}B)`); }
  else {
    console.error(`❌ ${OUT} 가 src/ 와 다릅니다. node build.mjs 를 돌리고 커밋하세요.`);
    process.exit(1);
  }
} else {
  writeFileSync(outPath, built);
  console.log(`${OUT} ← ${PARTS.join(" + ")}  (${Buffer.byteLength(built)}B, ${built.split("\n").length - 1}줄)`);
}
