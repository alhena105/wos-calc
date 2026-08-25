# 작업 지시 — wos-calc 에 장비 계산기 탭 추가

## 0. 먼저 읽을 것

1. 저장소 루트의 `CLAUDE.md` — **1차 컨텍스트다.** 아래 내용과 충돌하면 `CLAUDE.md` 를 따르고 나에게 알려라.
2. `src/i18n.js` — `L(ko,en)` 사용법과 `STR` 구조
3. `src/data.js`, `src/render.js` — 기존 코드 스타일(들여쓰기, 네이밍, 패널/테이블 마크업)

작업 시작 전 `git pull` 로 최신화할 것. 로컬 사본이 오래된 상태일 수 있다.

---

## 1. 목표

기존 편성 계산기 페이지에 **탭**을 추가해, 보유 장비 12조각을 입력하면 홍색(전설) 업그레이드 순서를 계산해주는 도구를 붙인다.

```
┌──────────────────────────────┐
│  [편성]  [장비]              │  ← 탭 전환
├──────────────────────────────┤
│  (선택된 계산기)             │
└──────────────────────────────┘
```

**단일 산출물 `index.html` 유지.** 별도 페이지를 만들지 않는다.

---

## 2. 파일 구조

새로 만들 것:

```
src/gear-data.js      ← 첨부한 파일을 그대로 넣는다. 수정 금지.
src/gear-engine.js    ← 순수 계산. DOM 접근 없음.
src/gear-render.js    ← DOM 렌더링.
test/gear-unit.mjs    ← 골든 픽스처 검증.
```

`build.mjs` 조립 순서를 이렇게 바꾼다:

```
part1 → i18n → data → gear-data → engine → gear-engine → render → gear-render
```

`gear-data.js` 가 `L()` 을 호출하므로 반드시 `i18n` 뒤에 온다.

### 기존 파일 수정 범위 — 최소로

- `src/part1.html` — 탭 바 마크업 + 장비 탭 컨테이너(`<div id="tab-gear" hidden>`) 추가. 기존 편성 UI는 `<div id="tab-comp">` 로 감싸기만 한다.
- `src/render.js` — **로직은 건드리지 마라.** 탭 전환 핸들러는 `gear-render.js` 에 둔다.
- **밴드 판정 UI(시트 위 / 지표 아래 순서, 프리셋 칩 12종, 합계≠100 경고)는 절대 손대지 마라.** 회귀하면 안 되는 부분이다.

탭 상태는 `?tab=gear` 쿼리로 딥링크 가능하게 하고, 기본값은 `comp`.

---

## 3. 입력 UI — 12조각 그리드

병종 3행 × 슬롯 4열. 칸마다 **마스터리(M)** 와 **홍색 레벨(+)** 두 개의 number 입력.

```
         헬멧       장갑       벨트       신발
보병   [M][ + ]   [M][ + ]   [M][ + ]   [M][ + ]
궁병   [M][ + ]   [M][ + ]   [M][ + ]   [M][ + ]
창병   [M][ + ]   [M][ + ]   [M][ + ]   [M][ + ]
```

행·열 순서는 `GEAR_TROOP_ORDER` / `GEAR_SLOT_ORDER` 를 쓴다.

**입력 검증**
- 마스터리 0~20, 홍색 레벨 0~100 범위 클램프
- 홍색 레벨이 현재 마스터리로 열 수 있는 상한을 넘으면 **경고를 띄우되 계산은 진행**한다 (게임 쪽 표기를 신뢰)
- `+1` 이 미돌파 상태라는 안내를 그리드 바로 아래 캡션으로 상시 노출 — 이 오해가 비용을 두 배로 틀리게 만든다

**그리드 위에 별도 입력**
- 병비: 공격 / 수비 각각 보·창·궁 3칸씩 → `GEAR_DEFAULTS.ratioPresets` 프리셋 칩 제공
- 공격 가중 슬라이더 (0~1, 기본 `GEAR_DEFAULTS.attackWeight`) — 라벨에 "증원 병력엔 내 장비가 적용되지 않는다" 근거를 붙일 것
- 아레나 우선도 세그먼트 (none / low / high)
- 미스릴 주당 수급 (숫자 입력, 기본 2)

**입출력**: JSON 가져오기/내보내기 버튼. 연맹원 상담 결과를 저장·공유할 수 있어야 한다. localStorage 에 마지막 입력 자동 저장.

---

## 4. 엔진 — `gear-engine.js`

**순수 함수로 작성한다. DOM 접근 금지.** 숫자는 전부 `gear-data.js` 에서 읽는다.

### 4.1 청크 생성

각 조각의 남은 진행을 **청크** 단위로 자른다.

```
청크 = (탐험 통행료 마일스톤이 있으면 그것) + 다음 원정 마일스톤
```

```js
function chunksFor(level) {
  const rest = GEAR_MS.filter(m => m.level > level);
  const out = []; let buf = [];
  for (const m of rest) {
    buf.push(m);
    if (m.tier === "expedition") { out.push(buf); buf = []; }
  }
  return out;   // 탐험만 남은 꼬리(buf)는 의도적으로 버린다
}
```

**탐험만 남는 꼬리를 청크로 만들지 않는 것이 핵심이다.** Lv.40·80 은 실전 기여가 0이라 단독으로 살 이유가 없고, 이렇게 자르면 "Lv.40 에서 멈춤" 이라는 선택지가 구조적으로 나올 수 없다.

### 4.2 청크 가치와 효율

```
value = Σ(원정 보너스) + arenaWeight × Σ(탐험 보너스)
eff   = value / Σ(미스릴)
```

### 4.3 정렬 — 효율 내림차순 그리디

청크 효율은 **각 조각 안에서 단조 감소**하므로, 효율 내림차순 그리디가 모든 예산 지점에서 누적 보너스를 최대화한다. 휴리스틱이 아니라 교환 논증으로 증명되는 성질이다. **다른 정렬을 창의적으로 시도하지 마라.**

동률 타이브레이크 순서:

1. **병종 가중** `attackWeight × 공격비율/100 + (1−attackWeight) × 수비비율/100`
2. **주 스탯 여부** — 슬롯 stat === 병종 mainStat
3. **좌우 방향** — 딜러(role="dps")는 그 청크가 `attack` 을 주면 우선, 탱커(role="tank")는 `defense` 를 주면 우선
4. 안정 정렬용 고정 순서 (`GEAR_TROOP_ORDER`, `GEAR_SLOT_ORDER`, 청크 index)

정렬 후 **같은 조각의 청크는 반드시 원래 순서를 지키도록** 보정한다(seq 순서 강제).

### 4.4 마스터리 선행

각 청크는 `mastery_req` 를 요구한다. 조각의 현재 마스터리가 모자라면 **승급 스텝을 앞에 삽입**하고 비용을 누적한다.

```
Lv.N 승급 = 에센스 N×10 + 신화조각 max(0, N−10)
```

조각별 마스터리 상태를 진행하며 갱신할 것. 같은 조각을 두 번 승급시키지 마라.

### 4.5 무료 XP 구간

각 조각의 현재 레벨에서 **다음 마일스톤 − 1** 까지는 미스릴이 들지 않는다. 이 목록을 `GEAR_XP_BANDS` 상대 단가 오름차순으로 정렬해 별도 반환한다.

### 4.6 반환 스키마

```js
{
  steps: [{
    troop, slot, side, seq,
    fromLevel, toLevel, tolls: [40],      // 지나는 탐험 마일스톤
    mithril, expedition, exploration, value, eff,
    gain: "attack" | "defense",
    masteryPre: { from, to, essence, mythic } | null,
    cumMithril, cumExpedition
  }],
  freeXp: [{ troop, slot, from, to, xpRel }],
  totals: { mithril, expedition, essence, mythic, weeks, mithrilPerWeek },
  tiers:  [{ eff, steps, mithril, expedition, cumMithril }]
}
```

---

## 5. 출력 UI — `gear-render.js`

순서대로:

1. **요약 타일 행** — 총 미스릴 · 원정 획득 %p · 신화 조각 · 소요 기간. 신화 조각은 병목이므로 시각적으로 강조.
2. **0단계 · 미스릴 0** — 무료 XP 구간 표. 화면 최상단에 둘 것. 대개 여기가 가장 큰 즉시 이득이다.
3. **효율 구간 요약** — 티어별 스텝 수 / 미스릴 / 원정 획득 / 누적. **효율 절벽(2.00 → 1.00 → 0.6대)이 눈에 보이게** 할 것.
4. **업그레이드 순서 표** — 번호 · 조각 · 좌우 · 작업(통행료 명시) · 원정 보너스 · 효율 · 미스릴 · 누적 · 마스터리 선행.
   - 통행료를 지나는 스텝은 `Lv.40(탐험) → Lv.60` 처럼 표기해 **왜 미스릴이 더 드는지**를 드러낸다.
   - 각 행에 체크박스. 체크하면 상단 요약 타일의 진행률이 갱신되고 localStorage 에 저장.
5. **좌우 사이클 참조표** — 원정 마일스톤 3개 + 완주 합계(좌 공70/방30, 우 방70/공30).
6. **경고 + 한계** — `GEAR_WARNINGS`, `GEAR_CAVEATS` 전부 노출. 접어두지 마라.

**미스릴 예산 슬라이더**를 표 위에 둔다. 값을 줄이면 그 예산 안에서 실행 가능한 스텝까지만 표시 — "지금 가진 미스릴로 어디까지 가나" 를 바로 볼 수 있게.

디자인은 기존 페이지의 CSS 변수(`--bg`, `--card`, `--line`, `--accent`, `--star` 등)를 그대로 쓴다. 새 색을 도입하지 마라.

---

## 6. i18n

**새 문자열은 전부 `L(ko, en)` 으로 감쌀 것.** `test/unit.mjs` 가 안 감싼 문자열을 논리행 단위로 잡는다 — 실제로 잡아낸 적 있다.

병종·슬롯 이름은 `GEAR_TROOPS[t].ko/en`, `GEAR_SLOTS[s].ko/en` 을 쓴다.

---

## 7. 테스트 — `test/gear-unit.mjs`

아래 픽스처가 **정답지**다. 하나라도 어긋나면 엔진이 틀린 것이다.

### 입력

```js
const FIXTURE = {
  ratios: {
    attack:  { infantry: 48, lancer: 4,  marksman: 48 },
    defense: { infantry: 60, lancer: 40, marksman: 0  }
  },
  attackWeight: 0.75,
  arenaPriority: "none",
  mithrilPerWeek: 12,
  gear: {
    infantry: { helmet:[11,1],  gauntlet:[15,61], belt:[15,60], boots:[11,2]  },
    marksman: { helmet:[13,59], gauntlet:[11,1],  belt:[11,1],  boots:[13,59] },
    lancer:   { helmet:[13,40], gauntlet:[11,3],  belt:[11,1],  boots:[13,40] }
  }
};
```

### 총계

| 항목 | 값 |
|---|--:|
| 스텝 수 | **28** |
| 미스릴 | **1560** |
| 원정 보너스 | **+1020** %p |
| 에센스 스톤 | **4400** |
| 신화 조각 | **120** |

### 효율 티어

| eff | 스텝 | 미스릴 | 원정 | 누적 미스릴 |
|--:|--:|--:|--:|--:|
| 2.000 | 6 | 60 | +120 | 60 |
| 1.000 | 4 | 120 | +120 | 180 |
| 0.600 | 6 | 300 | +180 | 480 |
| 0.556 | 12 | 1080 | +600 | 1560 |

### 순서 (전체 28스텝)

```
 1 infantry boots    Lv.20              defense  eff 2.000  m 10  cum   10
 2 infantry helmet   Lv.20              attack   eff 2.000  m 10  cum   20
 3 marksman belt     Lv.20              attack   eff 2.000  m 10  cum   30
 4 marksman gauntlet Lv.20              defense  eff 2.000  m 10  cum   40
 5 lancer   belt     Lv.20              attack   eff 2.000  m 10  cum   50
 6 lancer   gauntlet Lv.20              defense  eff 2.000  m 10  cum   60
 7 marksman boots    Lv.60              attack   eff 1.000  m 30  cum   90
 8 marksman helmet   Lv.60              defense  eff 1.000  m 30  cum  120
 9 lancer   boots    Lv.60              attack   eff 1.000  m 30  cum  150
10 lancer   helmet   Lv.60              defense  eff 1.000  m 30  cum  180
11 infantry helmet   Lv.60  (toll 40)   defense  eff 0.600  m 50  cum  230   M11→M13
12 infantry boots    Lv.60  (toll 40)   attack   eff 0.600  m 50  cum  280   M11→M13
13 marksman gauntlet Lv.60  (toll 40)   attack   eff 0.600  m 50  cum  330   M11→M13
14 marksman belt     Lv.60  (toll 40)   defense  eff 0.600  m 50  cum  380   M11→M13
15 lancer   gauntlet Lv.60  (toll 40)   attack   eff 0.600  m 50  cum  430   M11→M13
16 lancer   belt     Lv.60  (toll 40)   defense  eff 0.600  m 50  cum  480   M11→M13
17 infantry gauntlet Lv.100 (toll 80)   defense  eff 0.556  m 90  cum  570
18 infantry belt     Lv.100 (toll 80)   attack   eff 0.556  m 90  cum  660
19 infantry boots    Lv.100 (toll 80)   defense  eff 0.556  m 90  cum  750   M13→M15
20 infantry helmet   Lv.100 (toll 80)   attack   eff 0.556  m 90  cum  840   M13→M15
21 marksman helmet   Lv.100 (toll 80)   attack   eff 0.556  m 90  cum  930   M13→M15
22 marksman boots    Lv.100 (toll 80)   defense  eff 0.556  m 90  cum 1020   M13→M15
23 marksman belt     Lv.100 (toll 80)   attack   eff 0.556  m 90  cum 1110   M13→M15
24 marksman gauntlet Lv.100 (toll 80)   defense  eff 0.556  m 90  cum 1200   M13→M15
25 lancer   helmet   Lv.100 (toll 80)   attack   eff 0.556  m 90  cum 1290   M13→M15
26 lancer   boots    Lv.100 (toll 80)   defense  eff 0.556  m 90  cum 1380   M13→M15
27 lancer   belt     Lv.100 (toll 80)   attack   eff 0.556  m 90  cum 1470   M13→M15
28 lancer   gauntlet Lv.100 (toll 80)   defense  eff 0.556  m 90  cum 1560   M13→M15
```

### 무료 XP 구간 (미스릴 0)

```
lancer   gauntlet  +3  → +19
infantry boots     +2  → +19
infantry helmet    +1  → +19
marksman gauntlet  +1  → +19
marksman belt      +1  → +19
lancer   belt      +1  → +19
lancer   helmet    +40 → +59
lancer   boots     +40 → +59
infantry gauntlet  +61 → +79
infantry belt      +60 → +79
```

### 추가로 검증할 엣지 케이스

| 입력 | 기대 |
|---|---|
| 조각이 `[15,100]` | 스텝에서 완전히 제외 |
| 조각이 `[11,0]` (홍색 미해금) | Lv.20 청크부터 시작 |
| 조각이 `[13,85]` | 다음 청크가 **Lv.100 단독**, eff 1.000, 미스릴 50 |
| 조각이 `[12,39]` | 청크 Lv.40+60, 마스터리 선행은 **M12→M13 만** (에센스 130 · 신화 3) |
| 12조각 전부 `[11,1]` | 미스릴 **1800** (= 12 × 150) |
| `arenaPriority: "high"` | eff 티어가 0.600 → 0.675, 0.556 → 0.639 로 상승 |

---

## 8. 완료 조건

- [ ] `node build.mjs` 성공, `index.html` 갱신
- [ ] `node test/unit.mjs` 통과 (기존 테스트 — 회귀 없음)
- [ ] `node test/gear-unit.mjs` 통과 (위 픽스처 전부)
- [ ] `node test/browser.mjs` 통과
- [ ] 편성 탭의 밴드 판정 UI가 **그대로**인지 육안 확인 (시트 위 / 지표 아래, 프리셋 칩 12종, 합계 경고)
- [ ] `?lang=en` 에서 장비 탭 문자열이 전부 영문
- [ ] `?tab=gear` 딥링크 동작

---

## 9. 하지 말 것

- **효율 계산을 직접 추론하지 마라.** 상수는 전부 `gear-data.js` 에 있고 알고리즘은 §4에 못박혀 있다. 이 도메인은 직관이 반복해서 틀리는 곳이다.
- `gear-engine.js` 에 숫자를 하드코딩하지 마라. 패치 대응이 불가능해진다.
- 밴드 판정 UI 순서를 바꾸지 마라.
- 자료에 없는 것을 메커니즘처럼 쓰지 마라. 모르면 화면에 "자료 없음" 이라고 쓴다.
- `index.html` 을 직접 편집하지 마라. `src/*` 를 고치고 빌드한다.
