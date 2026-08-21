# WOS 편성 계산기

화이트아웃 서바이벌(Whiteout Survival) 랠리·개리슨 편성 계산기입니다.
리더 3명과 병비를 입력하면 다음을 자동 계산합니다.

- **SkillMod 칸 진단** — 리더 9스킬을 칸별로 합산해 포화도를 표시
- **위젯 계산** — 집결(Rally)/수비(Defender) 방향 판정, 스탯 중복 감지, 발동 배율
- **병종 전용 스킬 사망 판정** — 현재 병비에서 죽는 스킬을 표시
- **조이너 한계 배율 순위** — 후보별 곱연산 기여도를 계산해 정렬
- **카운터·밴드 판정** — 상대 방어 병비를 넣으면 가이드 카운터표를 찾아 추천 카운터/금지 편성을 표시 (표가 다루지 않는 비율은 판정하지 않고 그렇다고 밝힘)

## 사용법

`index.html` 하나로 동작합니다. 서버가 필요 없고 파일을 열어도 됩니다.

## 언어 / Language

한국어·영어를 모두 지원합니다. 우측 상단 토글로 전환하고, 브라우저 언어를 자동 감지하며, `?lang=ko` / `?lang=en` 으로 고정할 수 있습니다.

- 한국어: https://alhena105.github.io/wos-calc/?lang=ko
- English: https://alhena105.github.io/wos-calc/?lang=en

Korean and English are both supported. Use the toggle at the top right; the page also auto-detects your browser language, and `?lang=` pins it. Hero names, skill descriptions, verdicts and every caveat are translated.

## 데이터

영웅 45명(Gen 1~13 + 에픽 조이너)의 원정 3스킬과 전용무기 정보를 내장했습니다.
출처: [wosheroes](https://wosheroes.com/) · [whiteoutsurvival-community](https://www.whiteoutsurvival-community.com/) · [whiteoutsurvival.wiki](https://www.whiteoutsurvival.wiki/) (2026-08-15 수집)

## 계산 가정

- 원정스킬은 전부 Lv.5(4성 이상)로 간주
- 확률·주기 스킬은 기대값으로 환산
- 병종 전용 딜 스킬은 보병 가중치 0.3을 적용한 딜 지분으로 환산
- 일반공격 한정 스킬은 총딜의 80%를 일반공격으로 가정
- "확률로 N% 피해" 계열은 "피해량 증가"와 같은 칸으로 묶음 (effect_op 미확정)

계산 모델의 근거는 [랠리 편성 × 조이너 스킬 × 데미지 공식 통합 해설](https://blog.astris.kr/posts/f7a87706-3c2f-40c0-b282-d77a311ab4e3)에 있습니다.

> ⚠️ 계산 결과와 Ton 공개시트가 갈리면 **시트를 우선**하세요. 계산기에는 `시트` / `이론` 배지로 구분해 표시합니다.
