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
   left  = 벨트·헬멧 / right = 장갑·신발 이 각 마일스톤에서 받는 스탯 방향
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
  helmet:   { side: "left",  stat: "lethality", ko: "헬멧", en: "Helmet"   },
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
   보병 → 체력(장갑·벨트) / 궁·창 → 치명(헬멧·신발).
   완전히 버려도 되는 축은 창병 체력·창병 방어 하나뿐이다(60/40 기준). */

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
const GEAR_CAVEATS = [
  L("마일스톤별 탐험/원정 계열 구분은 게임 내 확인값입니다. 원자료(성장 가이드 비용표)에는 스탯 종류만 있고 계열 표기가 없습니다.",
    "The exploration/expedition split per milestone is verified in-game. The source cost table lists only stat types, not the category."),
  L("홍색 전용 XP 표는 원자료에 없습니다. XP 구간 단가는 금장비 비율 근사이므로 순서 판단에만 쓰세요.",
    "No red-gear XP table exists in the source. XP band costs approximate the gold-gear curve — use for ordering only."),
  L("능력부여 보너스가 전역인지 해당 조각 한정인지는 원자료에 없습니다. 상대 비교에만 사용합니다.",
    "Whether empowerment bonuses are global or per-piece is not documented. Used for relative comparison only."),
  L("신화 조각은 상자 100개당 평균 1개입니다. 미스릴보다 먼저 마르는 병목이니 총량을 먼저 확인하세요.",
    "Mythic shards drop ~1 per 100 boxes. They run dry before mithril — check the total first.")
];

/* --- 반드시 노출할 경고 ---------------------------------------------------- */
const GEAR_WARNINGS = [
  L("마스터리 리포지는 50%만 환불됩니다 — 사실상 금지.",
    "Mastery reforge refunds only 50% — effectively forbidden."),
  L("홍색 조각은 XP 리포지가 불가능합니다(오렌지 상태에서만 24시간마다 무료). 넣은 XP는 회수할 수 없습니다.",
    "Red pieces cannot XP-reforge (orange only, free every 24h). XP spent is unrecoverable."),
  L("'+1'은 미돌파 상태입니다. 홍색은 Lv.1에서 시작하고 Lv.20/40/60/80/100 각각에서 미스릴을 냅니다.",
    "'+1' means no breakthrough yet. Red starts at Lv.1 and costs mithril at each of Lv.20/40/60/80/100.")
];
