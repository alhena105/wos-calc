/* =============================================================================
   gear-data.js — 홍색(전설) 영웅장비 상수
   -----------------------------------------------------------------------------
   조립 순서: part1 → i18n → data → gear-data → engine → gear-engine → render → gear-render
   (i18n.js 가 앞이므로 이 파일에서 L() 사용 가능)

   ⚠️ 모든 장비 수치의 단일 출처. 패치로 값이 바뀌면 여기만 고친다.
      gear-engine.js 에는 숫자를 하드코딩하지 말 것.

   출처: Ton(TontonYouTube) 「영웅장비 강화 우선순위 전략 가이드」
        · 「영웅장비 성장 가이드」 비용표
        · 「랠리 편성·조이너·데미지 공식 통합 해설」(증원 장비 미적용)
   검증: 2026-08-23
============================================================================= */

/* --- 능력부여 마일스톤 -------------------------------------------------------
   tier: "expedition"(원정) = 랠리·성 전투·개리슨에 적용되는 실전 스탯
         "exploration"(탐험) = 아레나 전용. 랠리 리더에겐 실전 기여 0 → 통행료
   left  = 벨트·고글 / right = 장갑·신발 이 각 마일스톤에서 받는 스탯 방향
   mastery = 이 마일스톤을 열기 위한 최소 마스터리 레벨
--------------------------------------------------------------------------- */
const GEAR_MS = [
  { level:  20, mithril: 10, tier: "expedition",  bonus: 20,  mastery: 11, left: "attack",  right: "defense"   },
  { level:  40, mithril: 20, tier: "exploration", bonus: 7.5, mastery: 12, left: "health",  right: "lethality" },
  { level:  60, mithril: 30, tier: "expedition",  bonus: 30,  mastery: 13, left: "defense", right: "attack"    },
  { level:  80, mithril: 40, tier: "exploration", bonus: 15,  mastery: 14, left: "attack",  right: "defense"   },
  { level: 100, mithril: 50, tier: "expedition",  bonus: 50,  mastery: 15, left: "attack",  right: "defense"   }
];

/* 원정 마일스톤은 셋(20·60·100)뿐이다.
   볼트 원문 "왼쪽 계열 = 공격 → 방어 → 공격 순" 이 정확히 이 세 칸이다.
   완주 시  왼쪽 = 공격 +70% / 방어 +30%,  오른쪽 = 방어 +70% / 공격 +30%.
   → 좌우는 총량이 같고 공/방 배분만 다르다. */

/* --- 슬롯 ----------------------------------------------------------------- */
const GEAR_SLOTS = {
  helmet:   { side: "left",  stat: "lethality", ko: "고글", en: "Goggles"  },
  belt:     { side: "left",  stat: "health",    ko: "벨트", en: "Belt"     },
  gauntlet: { side: "right", stat: "health",    ko: "장갑", en: "Gauntlet" },
  boots:    { side: "right", stat: "lethality", ko: "신발", en: "Boots"    }
};
const GEAR_SLOT_ORDER = ["helmet", "gauntlet", "belt", "boots"];   // 입력 그리드 열 순서

/* --- 병종 ----------------------------------------------------------------- */
const GEAR_TROOPS = {
  infantry: { mainStat: "health",    role: "tank", ko: "보병", en: "Infantry" },
  marksman: { mainStat: "lethality", role: "dps",  ko: "궁병", en: "Marksman" },
  lancer:   { mainStat: "lethality", role: "dps",  ko: "창병", en: "Lancer"   }
};
const GEAR_TROOP_ORDER = ["infantry", "marksman", "lancer"];       // 입력 그리드 행 순서

/* 주 스탯 = 슬롯 stat === 병종 mainStat.
   보병 → 체력(장갑·벨트) / 궁·창 → 치명(고글·신발).
   완전히 버려도 되는 축은 창병 체력·창병 방어 하나뿐이다(60/40 기준). */

/* --- 병종별 필요 축 --------------------------------------------------------
   출처: 커뮤니티 「HERO GEAR — UPGRADE ORDER」 표 (jiujitefu-jitsu, State 2062).
   32칸 우선순위표를 그대로 옮긴 것이다. 좌우 사이클·골드 스탯 16칸은 우리 GEAR_MS /
   GEAR_SLOTS 와 전부 일치했고(교차검증 통과), 이 표가 새로 더한 것이 아래 등급이다.

     보병  초록 Defense·Health      / 회색 Attack·Lethality
     창병  초록 Attack·Lethality    / 회색 Defense·Health
     궁병  초록 Attack·Lethality·Health / 노랑 Defense   (회색 없음)

   즉 병종마다 필요한 축이 있고 반대 축은 버린다. 표는 회색 칸에 번호를 아예 안 붙였다 —
   "미루라"가 아니라 "그 스탯은 안 친다"는 뜻이므로, 값 0 = 탐험과 같은 통행료로 다룬다.

   ⚠️ 초록 1.0 / 회색 0 은 표를 그대로 읽은 값이다. 노랑(Secondary)에는 표가 숫자를
      주지 않는다 — GEAR_AXIS_SUB 는 우리가 고른 값이다. 화면 ⑥ 한계에 그렇게 적는다.
      값을 쓸어 보면 순서가 평탄 구간으로 갈린다(지금 화면 입력 기준):
        0.50~0.60  궁병 방어 Lv.100 이 12·13위 / 17·18위
        0.70~0.85  10·11위 — 보병 고글·창병 장갑보다 앞  ← 여기를 고름
        1.00       방어를 묶지 않고 따로 사기 시작(22→24스텝). 표의 노랑/초록 구분이 사라진다
      0.75 는 그 평탄 구간의 가운데다. ±0.07 흔들려도 순서가 안 바뀌므로 숫자에 안 매달려도 된다.
--------------------------------------------------------------------------- */
const GEAR_AXIS = {
  infantry: { attack: 0,   defense: 1,   health: 1,   lethality: 0   },
  lancer:   { attack: 1,   defense: 0,   health: 0,   lethality: 1   },
  marksman: { attack: 1,   defense: 0.75, health: 1,  lethality: 1   }
};
const GEAR_AXIS_SUB = 0.75;  // 노랑(추천) 가중 — 표에 근거 없음. 평탄 구간 0.70~0.85 의 가운데

/* --- 원본 표의 우선순위 번호 ------------------------------------------------
   같은 「HERO GEAR — UPGRADE ORDER」 표의 빨간 동그라미 1~32 를 그대로 옮긴 것.
   [GOLD, RED+20, RED+60, RED+100] 순서이고 null 은 번호가 없는 칸(= 맨 마지막)이다.

   표의 구조가 규칙적이다:
     1~8 GOLD · 9~16 RED+20 · 17~24 RED+60 · 25~32 RED+100  (단계별로 딱 8칸씩)
     각 단계 안에서는 보병 → 궁병(필수) → 창병(필수) → 궁병(추천) 순
     궁병만 16칸을 가져간다 — 버리는 축이 없어서 투자 가치가 두 배다

   ⚠️ 1~8 은 전부 <b>골드 장비</b> 단계다. 이 계산기는 홍색만 다루므로 그 여덟은
      계획에 안 들어간다. 표가 "홍색보다 골드가 먼저"라고 말하고 있는 것이라
      화면에 그대로 보여주되 우리 순서와 섞지 않는다.
--------------------------------------------------------------------------- */
const GEAR_ORDER = {
  infantry: { helmet:[null,null,  17,null], gauntlet:[   1,   9,null,  25],
              belt:  [   2,null,  18,null], boots:   [null,  10,null,  26] },
  lancer:   { helmet:[   5,  13,null,  29], gauntlet:[null,null,  21,null],
              belt:  [null,  14,null,  30], boots:   [   6,null,  22,null] },
  marksman: { helmet:[   3,  11,  23,  27], gauntlet:[   7,  15,  19,  31],
              belt:  [   8,  12,  24,  28], boots:   [   4,  16,  20,  32] }
};
const GEAR_ORDER_STAGES = ["GOLD", 20, 60, 100];   // GEAR_ORDER 배열의 열 뜻

/* --- 마스터리 승급 --------------------------------------------------------
   Lv.N 승급 = 에센스 N*10 + 신화조각 max(0, N-10)
   홍색 Lv.100 은 M15 면 충분. M16~20 은 미스릴 진행과 무관한 순수 스탯 버프.
--------------------------------------------------------------------------- */
const GEAR_MASTERY = {
  essenceFactor: 10,
  mythicOffset: 10,
  maxForRed100: 15,
  max: 20
};

/* --- XP 구간 상대 단가 ----------------------------------------------------
   ⚠️ 홍색 전용 XP 표는 원자료에 없다. 금장비 구간 비율만 참고한 근사값.
      순서 판단(어느 조각의 무료 구간이 더 싼가)에만 쓰고 절대량으로 쓰지 말 것.
--------------------------------------------------------------------------- */
const GEAR_XP_BANDS = [
  { from:  1, to: 19, rel:  1.0 },
  { from: 21, to: 39, rel:  3.0 },
  { from: 41, to: 59, rel:  8.0 },
  { from: 61, to: 79, rel: 18.0 },
  { from: 81, to: 99, rel: 33.0 }
];

/* --- 기본값 --------------------------------------------------------------- */
const GEAR_DEFAULTS = {
  /* 증원(reinforcement) 병력에는 내 장비가 적용되지 않는다. 개리슨 수비 장비가
     실제로 작동하는 건 자기 성이 직접 공격받을 때뿐 → 공격 편성에 가중. */
  attackWeight: 0.75,

  /* 탐험 보너스에 곱하는 가중. 볼트: 탐험 스탯 = 아레나 전용. */
  arenaWeight: { none: 0, low: 0.15, high: 0.5 },

  mithrilPerWeek: { f2p: 2, dolphin: 4, whale: 12 },

  /* 프리셋 병비 — 입력 실수 방지용 칩 */
  ratioPresets: [
    { id: "50/20/30", attack: { infantry:50, lancer:20, marksman:30 } },
    { id: "48/4/48",  attack: { infantry:48, lancer:4,  marksman:48 } },
    { id: "30/20/50", attack: { infantry:30, lancer:20, marksman:50 } },
    { id: "60/40/0",  attack: { infantry:60, lancer:40, marksman:0  } },
    { id: "40/60/0",  attack: { infantry:40, lancer:60, marksman:0  } }
  ]
};

/* --- 계산의 한계 (화면에 반드시 노출할 것) --------------------------------- */
const GEAR_CAVEATS = i18nFill([], function () { return [
  L("마일스톤별 탐험/원정 계열 구분은 게임 내 확인값입니다. 원자료(성장 가이드 비용표)에는 스탯 종류만 있고 계열 표기가 없습니다.",
    "The exploration/expedition split per milestone is verified in-game. The source cost table lists only stat types, not the category."),
  L("홍색 전용 XP 표는 원자료에 없습니다. XP 구간 단가는 금장비 비율 근사이므로 순서 판단에만 쓰세요.",
    "No red-gear XP table exists in the source. XP band costs approximate the gold-gear curve — use for ordering only."),
  L("능력부여 보너스가 전역인지 해당 조각 한정인지는 원자료에 없습니다. 상대 비교에만 사용합니다.",
    "Whether empowerment bonuses are global or per-piece is not documented. Used for relative comparison only."),
  L("신화 조각은 상자 100개당 평균 1개입니다. 미스릴보다 먼저 마르는 병목이니 총량을 먼저 확인하세요.",
    "Mythic shards drop ~1 per 100 boxes. They run dry before mithril — check the total first.")
]; });

/* --- 반드시 노출할 경고 ---------------------------------------------------- */
const GEAR_WARNINGS = i18nFill([], function () { return [
  L("마스터리 리포지는 50%만 환불됩니다 — 사실상 금지.",
    "Mastery reforge refunds only 50% — effectively forbidden."),
  L("홍색 조각은 XP 리포지가 불가능합니다(오렌지 상태에서만 24시간마다 무료). 넣은 XP는 회수할 수 없습니다.",
    "Red pieces cannot XP-reforge (orange only, free every 24h). XP spent is unrecoverable."),
  L("'+1'은 미돌파 상태입니다. 홍색은 Lv.1에서 시작하고 Lv.20/40/60/80/100 각각에서 미스릴을 냅니다.",
    "'+1' means no breakthrough yet. Red starts at Lv.1 and costs mithril at each of Lv.20/40/60/80/100.")
]; });
