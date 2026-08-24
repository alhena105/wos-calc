// 브라우저 없이 render.js 까지 돌리기 위한 최소 DOM 스텁.
//
// 왜 필요한가: unit.mjs 는 i18n+data+engine 만 실행하고 render.js 는 파싱만 했다.
// 그래서 "화면에 무엇이 어떤 순서로 나오는가"는 검사 대상이 아니었고,
// 실제로 문구 위치가 뒤집힌 채 배포된 적이 있다(안내문이 가리키는 설명문이 위에 있었다).
// Playwright 가 없어도 렌더 결과 HTML 을 문자열로 받아볼 수 있어야 한다.
//
// 이 스텁은 계산기가 실제로 쓰는 것만 흉내낸다 — getElementById · value · innerHTML ·
// textContent · classList · 이벤트 등록(무시). 진짜 DOM 이 아니므로 레이아웃·CSS·클릭
// 전파는 검사하지 못한다. 그건 test/browser.mjs 몫이다.
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import vm from "node:vm";
import {PARTS as ALL_PARTS} from "../build.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// build.mjs 의 조립 순서를 그대로 따른다 — 파트가 늘면 여기도 자동으로 따라간다
const PARTS = ALL_PARTS.filter(p => p.endsWith(".js"));

function makeEl(id) {
  const set = new Set();
  return {
    id, value: "", innerHTML: "", textContent: "", title: "", placeholder: "",
    dataset: {}, onclick: null, options: [],
    classList: {
      contains: c => set.has(c),
      add: c => set.add(c),
      remove: c => set.delete(c),
      toggle: (c, on) => (on === undefined ? (set.has(c) ? set.delete(c) : set.add(c))
                                           : on ? set.add(c) : set.delete(c)),
    },
    addEventListener() {}, dispatchEvent() {}, appendChild() {}, contains: () => false,
    open: false,
    querySelector: () => null, querySelectorAll: () => [],
    scrollIntoView() {},
  };
}

/** 번들을 실행하고 조작 핸들을 돌려준다. lang 은 "ko" | "en". */
export function boot(lang = "ko") {
  const els = new Map();
  const el = id => {
    if (!els.has(id)) els.set(id, makeEl(id));
    return els.get(id);
  };
  const document = {
    title: "",
    addEventListener() {},
    documentElement: {lang: ""},
    getElementById: el,
    createElement: () => makeEl("new"),
    querySelectorAll: () => [],
  };
  const sandbox = {
    console, URLSearchParams, document,
    location: {search: "?lang=" + lang, href: "https://x/?lang=" + lang},
    navigator: {language: "ko"},
    history: {replaceState() {}},
    Event: function () {},
  };
  vm.createContext(sandbox);
  const code = PARTS.map(p => readFileSync(join(ROOT, "src", p), "utf8")).join("")
    .replace(/<\/script>[\s\S]*$/, "");
  vm.runInContext(code, sandbox, {filename: "bundle.js"});

  const api = {
    /** 모드 전환 — init IIFE 의 클릭 핸들러가 하는 일과 같다 */
    mode(m) {
      const on = m === "rally" ? "mAtk" : "mDef", off = m === "rally" ? "mDef" : "mAtk";
      el(on).classList.add("on");
      el(off).classList.remove("on");
      return api;
    },
    /** 내 병비 */
    mine(v) { ["r1", "r2", "r3"].forEach((id, i) => { el(id).value = String(v[i]); }); return api; },
    /** 상대(랠리 모드) 또는 들어오는 랠리(수비 모드) */
    enemy(v) { ["e1", "e2", "e3"].forEach((id, i) => { el(id).value = String(v[i]); }); return api; },
    leaders(inf, lan, mar) {
      el("hInf").value = inf; el("hLan").value = lan; el("hMar").value = mar; return api;
    },
    gear(n) { ["wInf", "wLan", "wMar"].forEach(id => { el(id).value = String(n); }); return api; },
    gcap(n) { el("gcap").value = String(n); return api; },
    /** 계산 후 #out 의 HTML */
    render() { vm.runInContext("calc()", sandbox); return el("out").innerHTML; },
    /** 임의 표현식 실행 — init IIFE 가 이벤트로만 부르는 함수(showSum 등)를 직접 부를 때 */
    js(expr) { return vm.runInContext(expr, sandbox); },
    /** 태그를 걷어낸 본문 텍스트 */
    text() { return api.render().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); },
    /** <p> 단위 본문 (문단 순서 검사용) */
    paras() {
      return api.render().split(/<p\b[^>]*>/).slice(1)
        .map(s => s.split("</p>")[0].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
        .filter(Boolean);
    },
    setLang(l) { vm.runInContext("setLang(" + JSON.stringify(l) + ")", sandbox); return api; },

    /** 탭 전환 — gear-render.js 의 핸들러가 하는 일과 같다 */
    tab(t) { vm.runInContext("gearShowTab(" + JSON.stringify(t) + ")", sandbox); return api; },
    /** 장비 탭 계산 후 #gOutTop + #gOutBot 의 HTML (화면에 나오는 순서 그대로) */
    gearRender() { vm.runInContext("gearCalc()", sandbox); return el("gOutTop").innerHTML + el("gOutBot").innerHTML; },
    gearText() { return api.gearRender().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); },
    el,
  };
  // 기본값 — init IIFE 와 같은 조합에서 출발한다
  return api.mode("rally").leaders("jeronimo", "mia", "alonso").gear(10).gcap(99).mine([48, 4, 48]);
}
