// 가이드 카운터표(wos-counter-formation.html ① 카운터 편성표)를 그대로 옮긴 정답지.
// 로직을 바꿔도 이건 그대로 통과해야 한다. 통과 못 하면 로직이 틀린 것이지
// 픽스처가 틀린 게 아니다. 픽스처는 시트 원본이 바뀌었을 때만 고친다.
//
// 표는 카운터 칸 7항목 · 금지 칸 5항목 = 12항목이다. 그중 70/30 행의 카운터
// "멀티랠리"는 비율이 아니라 전술 서술이라 비교할 벡터가 없다. 그래서 좌표로
// 검사할 수 있는 점은 카운터 6 + 금지 5 = 11점이다.
//
// 비율은 전부 [보병, 창병, 궁병] 3자리로 편다. 2자리 약칭은 빠진 병종이 0이라
// 매번 다른 자리를 가리키고, 과거에 이걸로 입력 사고가 났다.
//   60/40 = 보60·창40 · 70/30 = 보70·창30 · 50/50 = 보50·궁50
//   49/49 = 보49·창2·궁49 · 40/60 = 보40·궁60
//   예외: "40/60 초방어를 깨는 50/50" 만 보50·창50 (창병으로 상대 궁60 저격이 목적)
//
// premise 는 가이드가 그 카운터에 붙여둔 전제다. 판정에는 안 들어가지만,
// "단일 랠리로 된다"는 뜻이 아니라는 것을 픽스처에 남겨둔다.

export const SHEET_POINTS = [
  // 상대 50/20/30 (하이브리드)
  {row:"50/20/30", en:[50,20,30], mine:[40,40,20], label:"40/40/20", want:"counter"},
  {row:"50/20/30", en:[50,20,30], mine:[30,20,50], label:"30/20/50", want:"counter"},
  {row:"50/20/30", en:[50,20,30], mine:[60,40, 0], label:"60/40",    want:"ban"},
  // 상대 60/40 (만능 방어)
  {row:"60/40",    en:[60,40, 0], mine:[40,20,40], label:"40/20/40", want:"counter",
   premise:"멀티랠리 3~4개"},
  {row:"60/40",    en:[60,40, 0], mine:[50, 0,50], label:"50/50",    want:"ban"},
  {row:"60/40",    en:[60,40, 0], mine:[49, 2,49], label:"49/49",    want:"ban"},
  // 상대 70/30 — 카운터는 "멀티랠리"라는 서술뿐이라 비교할 점이 없다
  {row:"70/30",    en:[70,30, 0], mine:[50, 0,50], label:"50/50",    want:"ban"},
  // 상대 40/60 (초방어)
  {row:"40/60",    en:[40, 0,60], mine:[50,50, 0], label:"50/50/0 (보50·창50)", want:"counter"},
  {row:"40/60",    en:[40, 0,60], mine:[60,40, 0], label:"60/40",    want:"counter"},
  {row:"40/60",    en:[40, 0,60], mine:[50,20,30], label:"50/20/30", want:"ban"},
  // 상대 60/30/10
  {row:"60/30/10", en:[60,30,10], mine:[40,20,40], label:"40/20/40", want:"counter",
   premise:"더블·트리플 랠리"},
];

// 표가 말하지 않는 자리. 침묵을 통과로 렌더링하지 않는지 확인하는 용도다 —
// 가이드의 마지막 열은 금지 목록이지 승인 목록이 아니다.
export const QUIET_POINTS = [
  {en:[60,40, 0], mine:[40,40,20], want:"silent",
   why:"60/40 행에 있지만 추천에도 금지에도 없는 비율"},
  {en:[34,33,33], mine:[40,20,40], want:"noRow",
   why:"어느 행과도 ROW_TOL 안에 들지 않는 상대 비율"},
];

// 수비 판정 정답지 — 같은 표를 반대로 읽는다.
// 행을 고르는 키가 내 개리슨(= 표의 "상대 방어" 열)이고, 비교 대상이 들어오는 랠리다.
//   들어오는 랠리가 그 행의 추천 카운터  → threat    (정석 카운터가 왔다)
//   그 행의 금지 목록                    → favorable (상대가 밴드 편성으로 왔다)
export const GARRISON_POINTS = SHEET_POINTS.map(p => ({
  row: p.row, mine: p.en, incoming: p.mine, label: p.label,
  want: p.want === "counter" ? "threat" : "favorable",
  premise: p.premise,
}));

// 표가 침묵하는 자리 (수비 방향)
export const GARRISON_QUIET = [
  {mine:[60,40, 0], incoming:[40,40,20], want:"silent",
   why:"60/40 행에 있지만 추천에도 금지에도 없는 랠리"},
  {mine:[34,33,33], incoming:[40,20,40], want:"noRow",
   why:"어느 행과도 ROW_TOL 안에 들지 않는 내 개리슨"},
];

// 코드의 COUNTERS 시트 행에서 센 값이 가이드 표와 맞는지 교차 검증한다.
// labels 는 가이드의 카운터 칸 항목 수(7), counters 는 그중 벡터가 있는 것(6).
export const EXPECTED_COUNTS = {rows:5, labels:7, counters:6, bans:5, total:11};

// ── Ton 시트 "Rally Joiners" 탭 (2026-09-01 신설) ────────────────────────
//
// 시트가 조이너 스택 규칙을 처음으로 숫자로 적었다:
//   같은 스킬끼리는 합연산(+), 다른 스킬끼리는 곱연산(×).
// 아래는 그 탭의 "리더와 겹치지 않는" 네 행을 그대로 옮긴 것이다.
// 리더 중복 블록 12행은 JOINER_DUP_POINTS 로 따로 뒀다 — 쓰는 방식이 다르다(아래 주석 참고).
//
// 조이너는 S1(첫 원정스킬)만 기여한다 — 시트도 같은 전제로 계산한다.
// mul 은 딜 계열 칸만 곱한 값이고, 리더가 없으므로 모든 칸이 1에서 출발한다.
export const JOINER_POINTS = [
  {ids:["jessie","jessie","jessie","jessie"],   mul:2.0,    why:"4×제시 — 전부 A 칸이라 합연산. 1.25⁴=2.441 이 아니다"},
  {ids:["jessie","jessie","jasser","jasser"],   mul:2.0,    why:"제시와 제셀은 다른 영웅이지만 같은 A 칸이라 4×제시와 같다"},
  {ids:["jessie","jessie","seoyoon","seoyoon"], mul:2.25,   why:"A 두 명 + B 두 명 — 칸이 갈리면 곱연산이라 더 크다"},
  {ids:["jessie","jeronimo","jasser","seoyoon"],mul:2.1875, why:"A 세 명 + B 한 명"},
];

// ── 같은 탭의 "리더가 같은 스킬을 가진 경우" 12행 (2026-09-12 수집) ──────
//
// 시트가 조이너 포화를 **리더가 칸을 채운 상태에서** 다시 계산해 둔 블록이다.
// 이게 우리 한계 배율 모델의 정면 검증이다 — 리더가 채운 칸에 들어가면 값이 깎인다는
// 바로 그 주장을 시트가 숫자로 적어 놨다.
//
// 쓰는 방식이 JOINER_POINTS 와 다르다: 여기서는 **시트가 적은 리더 기준값(a0·b0)을 그대로 먹인다.**
// 우리 엔진의 리더 파싱을 쓰지 않는 이유는, 시트가 리더의 원정스킬 3개 중 "25% 납작한 것" 둘만
// 세기 때문이다(제로니모의 Expert Swordsmanship 은 빼고 계산한다). 그래서 이 픽스처가 검증하는
// 것은 **합연산/곱연산 규칙과 한계 배율**이고, 리더 데이터가 아니다.
//   a0 = 시트의 Lethality 열 기준값 (= 우리 A칸. 시트가 제시를 이 열에 넣는다)
//   b0 = 시트의 *Attack 열 기준값   (= 우리 B칸. 서윤·브레들리·마그누스가 여기)
//   nA / nB = 그 칸에 들어가는 조이너 수 (각 +0.25)
//   total = 시트가 적은 최종 곱 · boost = 시트의 "Damage boost %" (= total − 1)
export const JOINER_DUP_POINTS = [
  // 리더: 제로니모 (Leth + Atk) → 1.25 / 1.25
  {lead:"제로니모",            a0:1.25, b0:1.25, nA:4, nB:0, total:2.8125, boost:181.25, why:"4×제시 — A 가 이미 1.25 라 넷을 더해도 2.25"},
  {lead:"제로니모",            a0:1.25, b0:1.25, nA:4, nB:0, total:2.8125, boost:181.25, why:"2×제시+2×제셀 — 같은 A 칸이라 4×제시와 같다"},
  {lead:"제로니모",            a0:1.25, b0:1.25, nA:2, nB:2, total:3.0625, boost:206.25, why:"둘로 쪼개는 쪽이 크다 — 1.75×1.75"},
  {lead:"제로니모",            a0:1.25, b0:1.25, nA:3, nB:1, total:3.0,    boost:200.00, why:"3:1 은 2:2 보다 작다 — 2.0×1.5"},
  // 리더: 제로니모 + 브레들리 (Atk) → 1.25 / 1.50
  {lead:"제로니모+브레들리",   a0:1.25, b0:1.50, nA:4, nB:0, total:3.375,  boost:237.50, why:"B 가 이미 1.50 이라 A 를 채우는 쪽"},
  {lead:"제로니모+브레들리",   a0:1.25, b0:1.50, nA:4, nB:0, total:3.375,  boost:237.50, why:"2×제시+2×제셀 — 같은 A 칸"},
  {lead:"제로니모+브레들리",   a0:1.25, b0:1.50, nA:2, nB:2, total:3.5,    boost:250.00, why:"1.75×2.0 — 여기서도 2:2 가 최대"},
  {lead:"제로니모+브레들리",   a0:1.25, b0:1.50, nA:3, nB:1, total:3.5,    boost:250.00, why:"2.0×1.75 — 2:2 와 동률이다"},
  // 리더: 마그누스 (Atk) + 브레들리 (Atk) → 1.00 / 1.50
  {lead:"마그누스+브레들리",   a0:1.00, b0:1.50, nA:4, nB:0, total:3.0,    boost:200.00, why:"A 가 비어 있어도 넷을 한 칸에 몰면 2.0 에서 멈춘다"},
  {lead:"마그누스+브레들리",   a0:1.00, b0:1.50, nA:4, nB:0, total:3.0,    boost:200.00, why:"2×제시+2×제셀 — 같은 A 칸"},
  {lead:"마그누스+브레들리",   a0:1.00, b0:1.50, nA:2, nB:2, total:3.0,    boost:200.00, why:"1.5×2.0 — 이 리더에서는 2:2 가 4:0 과 같다"},
  {lead:"마그누스+브레들리",   a0:1.00, b0:1.50, nA:3, nB:1, total:3.0625, boost:206.25, why:"1.75×1.75 — 여기서는 3:1 이 최대다"},
];

// 시트의 조이너 칸(대체 포함)에 실제로 이름이 오르는 영웅 = data.js 의 s:1.
// 범례 "*Jessie = Jessie, Jasser or Jeronimo" 와 "**Sergey = Bahiti, Lumak Bokan" 을 펼친 결과다.
// 리더로만 나오는 영웅(몰리·알론소·그렉 등)은 여기 없다 — 이 플래그를 쓰는 곳이
// ⑤ 의 "시트 등재 영웅만" 조이너 추천 하나뿐이기 때문이다.
export const SHEET_JOINERS = [
  "bahiti","gatot","hendrik","jasser","jeronimo","jessie","lingxue","lumak","lynn",
  "mia","norah","patrick","philly","reina","renee","seoyoon","sergey","wuming","zinman",
];

// ── 병종 한정이지만 "스탯"인 X 스킬 (bk) ────────────────────────────────
//
// wosheroes 원문이 "Damage Dealt / Damage Taken" 을 올린다(내린다)고 적은 것만 담는다.
// 이런 스킬은 일반 칸과 **같은 스탯**이라 칸을 우회하면 그것만 포화를 안 겪는다
// (플린트가 리더 A칸 1.60 을 무시하고 1.00 에서 재어 3위로 올라오던 문제).
// "extra damage / 추가피해" 처럼 타격에 붙는 것은 다른 기전이라 여기 없다. **예외는 없다.**
//
// 원문 확인 (2026-09-01, https://wosheroes.com/heroes/<슬러그>):
//   flint  Pyromaniac           "increases his Infantry's Damage Dealt by 20-100%"
//   ahmose Prayer of Flame      "increasing their damage dealt by 20-100%" (Infantry)
//   hector Rampant              "increasing Infantry's Damage Dealt ... and Marksmen's Damage Dealt"
//   norah  Combined Arms        "decreasing Damage Taken ... and boosting Damage Dealt ... for Infantry and Marksman"
//   xura   Unorthodoxy          "increasing Marksmen's damage dealt by 2-10% while reducing their damage taken by 3-15%"
//   freya  Night's Vengeance    "decreasing damage taken ... and increasing damage dealt ... for her Infantries and Marksmen"
//   dominic Mirror Maze         "reducing damage taken by Infantry and Marksmen ... and increasing their damage dealt"
//   estrella Splendid Scene     "reducing the damage taken by Infantry ... increasing the damage dealt by Lancers"
//   viveca Children of the Mist "reducing damage taken by allied Infantry ... increasing damage dealt by allied Marksmen"
//   gordon Chemical Terror      "increasing Lancers' Damage Dealt by 30-150% ... every 3 turns" (v 는 3턴 환산)
//
// 일부러 뺀 것: renee Dreamcatcher. 원문은 "increasing her Lancers' damage dealt to marked
// targets" 로 분명 스탯이지만, **표식 유지율을 아직 환산하지 않아** v 가 원값(1.5)이다.
// 환산 안 된 값을 칸에 넣으면 오히려 더 부풀려진다 → 환산부터 하고 붙일 것.
//
// ⚠️ **이 픽스처는 자기참조라 bk 판단을 검증하지 못한다.** `unit.mjs` 는 "코드의 bk 집합 ==
// 이 목록" 만 본다 — 양쪽에 같이 넣으면 통과는 자동이다. 시트 숫자에서 유도되는
// `JOINER_POINTS` 와 성격이 다르다. **변경 감지기이지 검증이 아니다**(2026-09-14 지적).
//
// ⚠️ **한때 renee Nightmare Trace 를 여기 넣었다가 되돌렸다 (2026-09-13 → 09-14).**
// 원문이 "extra damage" 라 문구 규칙상 칸이 아닌데, 시트 실측을 근거로 예외를 뒀었다.
// 적대적 검증에서 그 근거 셋 중 **둘이 반증**됐다:
//   · "두 지표가 같은 방향인 건 이 한 건뿐" → `lloyd Iceflare Bomb` 도 그렇고,
//     그 dRec +2 는 레니와 **완전히 같은 두 행·같은 치환**이라 레니를 식별하지 못한다.
//   · "v 가 작아 Δ=0" → corr(v,|Δ|)=0.17. Δ=0 집단의 평균 v 가 **오히려 더 크다**.
//     반례 13건, 그중 `renee Dreamcatcher` v=1.5.
//   · 그리고 전체풀 +6 은 **flint 를 눌러도 똑같이 나온다**(같은 결과를 내는 개입이 6가지).
//     그 지표가 말한 것은 "flint 가 저 6행에서 틀렸다" 이지 "Nightmare Trace 가 A칸이다" 가 아니다.
// **진짜 병리는 따로 있었다** — 리더가 이미 든 무포화 스킬을 조이너로 다시 집을 때 페널티가
// 0 이던 것. 그건 레니만의 문제가 아니라 웨인 4행·고든 2행에도 있었다. 그래서 예외를 두는 대신
// `engine.js` 의 `nbAdd` 로 **일반 규칙**을 만들었다(CLAUDE.md 「리더 self-pick」 절).
export const X_BUCKETED = [
  {id:"flint",    n:"Pyromaniac",           bk:"A"},
  {id:"ahmose",   n:"Prayer of Flame",      bk:"A"},
  {id:"hector",   n:"Rampant",              bk:"A", alsoBk:"A"},
  {id:"norah",    n:"Combined Arms",        bk:"A", alsoBk:"D"},
  {id:"xura",     n:"Unorthodoxy",          bk:"A", alsoBk:"D"},
  {id:"freya",    n:"Night's Vengeance",    bk:"A", alsoBk:"D"},
  {id:"dominic",  n:"Mirror Maze",          bk:"D", alsoBk:"A"},
  {id:"estrella", n:"Splendid Scene",       bk:"A", alsoBk:"D"},
  {id:"viveca",   n:"Children of the Mist", bk:"A", alsoBk:"D"},
  {id:"gordon",   n:"Chemical Terror",      bk:"A"},
  // 2026-09-14 wosheroes 44명 재대조에서 추가: "reducing Damage Taken by 20% for Marksmen … increasing
  // Damage Dealt by 20% for Lancers" — 노라와 같은 꼴인데 tgt:"mar+lan" 한 항목으로 뭉쳐 있었다.
  {id:"edith",    n:"Strategic Balance",    bk:"D", alsoBk:"A"},
  // 2026-09-14: "reducing damage taken by Lancers and Marksmen by 30% and Infantry by 70%" — 문자 그대로 Damage Taken.
  // 창·궁 몫(also)을 더하면서 같이 붙였다. 4회마다 공격을 쉬는 비용은 못 싣는다(data.js 주석).
  {id:"ahmose",   n:"Viper Formation",      bk:"D", alsoBk:"D"},
];

// ── 시트 세대별 행 — 조이너 순위 대조용 ──────────────────────
//
// Ton 시트 두 툴("Gen 1~9" · "Gen 10+")의 편성 행을 그대로 엮긴 것이다.
// 2026-09-12 재수집: 공개 pubhtml 대신 시트 원본을 CSV 로 내려 다시 편성허다.
// 게시본과 원본은 내용이 같았지만, 전에는 Gen 6 두 행(헥투·노라·웨인 45/15/40 ·
// 헥투·몰리·웨인 50/0/50)이 파싱에서 누락되어 49행밖에 없었다 → 지금 52행이다.
//   lead = 리더 3영웅(슬래시 대안은 첫 번째) · r = 별버
//   top  = 시트 조이너 #1 칸 (동치군이면 제시* = 제시/제셀/제로니모 셋을 다 적었다)
//   pri  = 조이너 #1~#4 칸 (동치군 펼침)
//   all  = pri + "Alternative" 칸까지 (시트가 "또는 이것도" 로 쓴 것)
// 같은 (세대, 리더 3인, 별버) 가 걱치는 행 2건은 제거했다(원본 54행 → 52행).
//
// ⚠️ 이건 **정답지가 아니라 대조표다.** 시트는 최적해가 아니라 "실제로 들여및을 수 있는
// 영웅" 목록이라, 우리 계산과 어긋나는 자리가 구조적으로 있다:
//   · 리더에 제로니모가 있어 A칸이 이미 찬 행에서도 시트는 제시를 1순위로 적는다
//     (시트 자신이 그 행 주석에 "Jeronimo is Jessie + Seyoon already so stacking happens" 라고 인정한다)
//   · 10/52 행이 같은 영웅을 2~3장 곹친다(노라 9행) — 시트 지침 5번과 스스로 어긋난다
//   · 가토·무명 같은 보별 전용 방어 영웅을 높게 치는데, 볼트 §8 은 그 분류가 평렸다고 못박는다
// 그래서 **100% 를 목표로 삼지 않는다.** 회관 감시용 하한선만 지킨다.
export const SHEET_ROWS = [
  {gen:1, lead:["jeronimo","molly","zinman"], r:[60,40,0], top:["lingxue"], pri:["lingxue","patrick","lumak"], all:["lingxue","patrick","lumak","jessie","jasser","jeronimo","seoyoon"]},
  {gen:1, lead:["jeronimo","molly","zinman"], r:[50,20,30], top:["lingxue"], pri:["lingxue","patrick","lumak"], all:["lingxue","patrick","lumak","jessie","jasser","jeronimo","seoyoon"]},
  {gen:2, lead:["flint","philly","zinman"], r:[60,40,0], top:["patrick"], pri:["patrick","jessie","jasser","jeronimo","seoyoon","sergey","bahiti","lumak"], all:["patrick","jessie","jasser","jeronimo","seoyoon","sergey","bahiti","lumak"]},
  {gen:2, lead:["jeronimo","philly","alonso"], r:[50,20,30], top:["patrick"], pri:["patrick","jessie","jasser","jeronimo","seoyoon","zinman"], all:["patrick","jessie","jasser","jeronimo","seoyoon","zinman"]},
  {gen:3, lead:["logan","philly","zinman"], r:[60,40,0], top:["mia"], pri:["mia","patrick","jessie","jasser","jeronimo","seoyoon"], all:["mia","patrick","jessie","jasser","jeronimo","seoyoon"]},
  {gen:3, lead:["jeronimo","mia","greg"], r:[50,20,30], top:["jessie","jasser","jeronimo"], pri:["jessie","jasser","jeronimo","seoyoon","philly","patrick"], all:["jessie","jasser","jeronimo","seoyoon","philly","patrick","zinman"]},
  {gen:3, lead:["jeronimo","mia","greg"], r:[60,40,0], top:["jessie","jasser","jeronimo"], pri:["jessie","jasser","jeronimo","seoyoon","philly","patrick"], all:["jessie","jasser","jeronimo","seoyoon","philly","patrick","zinman"]},
  {gen:3, lead:["logan","philly","greg"], r:[50,20,30], top:["mia"], pri:["mia","patrick","jessie","jasser","jeronimo","seoyoon"], all:["mia","patrick","jessie","jasser","jeronimo","seoyoon","zinman"]},
  {gen:4, lead:["ahmose","reina","lynn"], r:[60,40,0], top:["mia"], pri:["mia","patrick","jessie","jasser","jeronimo","seoyoon"], all:["mia","patrick","jessie","jasser","jeronimo","seoyoon","zinman","philly"]},
  {gen:4, lead:["jeronimo","reina","greg"], r:[50,20,30], top:["mia"], pri:["mia","philly","patrick","zinman"], all:["mia","philly","patrick","zinman","jessie","jasser","jeronimo","seoyoon"]},
  {gen:4, lead:["jeronimo","mia","greg"], r:[48,4,48], top:["patrick"], pri:["patrick","philly","zinman","reina"], all:["patrick","philly","zinman","reina","jessie","jasser","jeronimo","seoyoon"]},
  {gen:4, lead:["jeronimo","reina","greg"], r:[60,40,0], top:["patrick"], pri:["patrick","philly","zinman","mia","reina"], all:["patrick","philly","zinman","mia","reina","jessie","jasser","jeronimo","seoyoon"]},
  {gen:4, lead:["ahmose","molly","lynn"], r:[50,2,48], top:["mia"], pri:["mia","patrick","jessie","jasser","jeronimo","seoyoon"], all:["mia","patrick","jessie","jasser","jeronimo","seoyoon","zinman"]},
  {gen:5, lead:["hector","norah","zinman"], r:[60,40,0], top:["mia"], pri:["mia","patrick","jessie","jasser","jeronimo","philly"], all:["mia","patrick","jessie","jasser","jeronimo","philly"]},
  {gen:5, lead:["jeronimo","reina","gwen"], r:[50,20,30], top:["mia"], pri:["mia","jessie","jasser","jeronimo","seoyoon","norah"], all:["mia","jessie","jasser","jeronimo","seoyoon","norah","patrick","philly"]},
  {gen:5, lead:["jeronimo","mia","gwen"], r:[48,4,48], top:["norah"], pri:["norah","patrick"], all:["norah","patrick","philly"]},
  {gen:5, lead:["jeronimo","norah","greg"], r:[60,40,0], top:["mia"], pri:["mia","patrick","jessie","jasser","jeronimo","philly"], all:["mia","patrick","jessie","jasser","jeronimo","philly","zinman"]},
  {gen:5, lead:["logan","norah","greg"], r:[60,40,0], top:["mia"], pri:["mia","norah","jessie","jasser","jeronimo","philly"], all:["mia","norah","jessie","jasser","jeronimo","philly"]},
  {gen:6, lead:["wuming","norah","zinman"], r:[60,40,0], top:["renee"], pri:["renee","mia","patrick","jessie","jasser","jeronimo"], all:["renee","mia","patrick","jessie","jasser","jeronimo","wuming"]},
  {gen:6, lead:["jeronimo","renee","gwen"], r:[50,20,30], top:["jessie","jasser","jeronimo"], pri:["jessie","jasser","jeronimo","seoyoon","mia","norah"], all:["jessie","jasser","jeronimo","seoyoon","mia","norah","patrick","wuming"]},
  {gen:6, lead:["jeronimo","mia","wayne"], r:[48,4,48], top:["norah"], pri:["norah","patrick"], all:["norah","patrick"]},
  {gen:6, lead:["jeronimo","renee","greg"], r:[60,40,0], top:["mia"], pri:["mia","patrick","jessie","jasser","jeronimo","wuming"], all:["mia","patrick","jessie","jasser","jeronimo","wuming"]},
  {gen:6, lead:["logan","philly","wayne"], r:[45,5,50], top:["norah"], pri:["norah","patrick"], all:["norah","patrick","wuming"]},
  {gen:6, lead:["hector","norah","wayne"], r:[45,15,40], top:["mia"], pri:["mia","patrick","philly","lynn"], all:["mia","patrick","philly","lynn","wuming"]},
  {gen:6, lead:["hector","molly","wayne"], r:[50,0,50], top:["mia"], pri:["mia","patrick","norah"], all:["mia","patrick","norah","wuming"]},
  {gen:7, lead:["edith","gordon","bradley"], r:[60,40,0], top:["renee"], pri:["renee","mia","reina","jessie","jasser","jeronimo"], all:["renee","mia","reina","jessie","jasser","jeronimo","wuming"]},
  {gen:7, lead:["edith","molly","bradley"], r:[40,0,60], top:["mia"], pri:["mia","norah","lynn"], all:["mia","norah","lynn"]},
  {gen:7, lead:["jeronimo","mia","bradley"], r:[48,4,48], top:["norah"], pri:["norah","patrick"], all:["norah","patrick","philly"]},
  {gen:8, lead:["gatot","sonya","bradley"], r:[60,40,0], top:["renee"], pri:["renee","patrick","mia","hendrik"], all:["renee","patrick","mia","hendrik","wuming"]},
  {gen:8, lead:["gatot","molly","bradley"], r:[40,0,60], top:["mia"], pri:["mia","patrick","norah","lynn"], all:["mia","patrick","norah","lynn"]},
  {gen:8, lead:["edith","mia","hendrik"], r:[48,4,48], top:["norah"], pri:["norah","jessie","jasser","jeronimo","seoyoon"], all:["norah","jessie","jasser","jeronimo","seoyoon","wuming"]},
  {gen:8, lead:["edith","sonya","bradley"], r:[60,40,0], top:["renee"], pri:["renee","mia","hendrik","jessie","jasser","jeronimo"], all:["renee","mia","hendrik","jessie","jasser","jeronimo","wuming"]},
  {gen:8, lead:["jeronimo","gordon","bradley"], r:[60,40,0], top:["renee"], pri:["renee","mia","hendrik","patrick"], all:["renee","mia","hendrik","patrick","wuming"]},
  {gen:8, lead:["jeronimo","mia","bradley"], r:[48,4,48], top:["norah"], pri:["norah","hendrik"], all:["norah","hendrik"]},
  {gen:9, lead:["magnus","sonya","bradley"], r:[60,40,0], top:["renee"], pri:["renee","mia","patrick","hendrik"], all:["renee","mia","patrick","hendrik","wuming","gatot"]},
  {gen:9, lead:["magnus","molly","bradley"], r:[40,0,60], top:["mia"], pri:["mia","patrick","norah","lynn"], all:["mia","patrick","norah","lynn","gatot"]},
  {gen:9, lead:["magnus","mia","hendrik"], r:[48,4,48], top:["norah"], pri:["norah","patrick"], all:["norah","patrick","gatot"]},
  {gen:9, lead:["magnus","fred","bradley"], r:[60,40,0], top:["renee"], pri:["renee","mia","patrick","hendrik"], all:["renee","mia","patrick","hendrik","wuming","gatot"]},
  {gen:10, lead:["gregory","freya","bradley"], r:[60,40,0], top:["renee"], pri:["renee","mia","patrick","hendrik"], all:["renee","mia","patrick","hendrik","wuming","gatot"]},
  {gen:10, lead:["gregory","molly","bradley"], r:[40,2,58], top:["mia"], pri:["mia","norah","hendrik","patrick"], all:["mia","norah","hendrik","patrick","gatot"]},
  {gen:10, lead:["gregory","mia","blanchette"], r:[48,4,48], top:["norah"], pri:["norah","hendrik","patrick"], all:["norah","hendrik","patrick","gatot"]},
  {gen:10, lead:["gregory","fred","bradley"], r:[60,40,0], top:["renee"], pri:["renee","mia","hendrik","patrick"], all:["renee","mia","hendrik","patrick","wuming","gatot"]},
  {gen:11, lead:["eleonora","lloyd","bradley"], r:[60,40,0], top:["renee"], pri:["renee","mia","hendrik","reina"], all:["renee","mia","hendrik","reina","gatot","wuming"]},
  {gen:11, lead:["eleonora","molly","xura"], r:[40,2,58], top:["mia"], pri:["mia","norah","hendrik","reina"], all:["mia","norah","hendrik","reina","gatot","wuming"]},
  {gen:11, lead:["eleonora","mia","rufus"], r:[48,4,48], top:["norah"], pri:["norah","hendrik","gatot"], all:["norah","hendrik","gatot","wuming"]},
  {gen:12, lead:["herbjorg","lloyd","bradley"], r:[60,40,0], top:["mia"], pri:["mia","renee","patrick","hendrik"], all:["mia","renee","patrick","hendrik","gatot"]},
  {gen:12, lead:["herbjorg","lloyd","ligeia"], r:[60,20,20], top:["mia"], pri:["mia","patrick","norah","seoyoon"], all:["mia","patrick","norah","seoyoon","gatot"]},
  {gen:12, lead:["herbjorg","molly","ligeia"], r:[50,2,48], top:["mia"], pri:["mia","patrick","norah","gatot"], all:["mia","patrick","norah","gatot"]},
  {gen:12, lead:["herbjorg","lloyd","ligeia"], r:[50,10,40], top:["mia"], pri:["mia","patrick","norah","gatot"], all:["mia","patrick","norah","gatot","seoyoon"]},
  {gen:12, lead:["herbjorg","mia","rufus"], r:[48,4,48], top:["patrick"], pri:["patrick","hendrik","norah","gatot"], all:["patrick","hendrik","norah","gatot"]},
  {gen:12, lead:["herbjorg","karol","rufus"], r:[50,10,40], top:["mia"], pri:["mia","patrick","hendrik","norah"], all:["mia","patrick","hendrik","norah"]},
  {gen:12, lead:["herbjorg","karol","bradley"], r:[60,40,0], top:["mia"], pri:["mia","renee","gatot","hendrik"], all:["mia","renee","gatot","hendrik","patrick"]},
];
