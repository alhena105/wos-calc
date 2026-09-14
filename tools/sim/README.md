# tools/sim — 독립 공식 시뮬레이션 · 시트 대조 · 민감도 스윕

엔진(`src/engine.js` · `src/render.js`)을 **보지 않고** 볼트 공식에서 직접 세운 시뮬레이터로
엔진의 출력을 대조한다. 2026-09-14 에 이 대조가 `An` 칸 결함(레이나 리더 4행)을 잡았다.

```
Kills ≈ √병력 × (공격% × 파괴력%) ÷ (적 방어% × 적 체력%) × SkillMod
SkillMod = (내 피해증폭 × 적 방어감소) ÷ (적 피해감소 × 적 방어증폭)
```

전투비 R 을 펴면 내 쪽 칸이 각각 정확히 한 번 곱해진다 → 같은 칸은 `1+Σv`, 다른 칸은 곱.
`formula.mjs` 가 그 식이고, 엔진처럼 한계 배율을 순차로 곱하지 않고 **세트 전체에서 곧장 Π(1+Σ)** 를 낸다.

```bash
python tools/sim/xlsx2tsv.py data.xlsx   # ① Ton 시트 오프라인 사본 → out/xlsx/*.tsv (openpyxl 필요)
node tools/sim/01-xlsx-diff.mjs          # ② xlsx 54행 ↔ SHEET_COMPS · SHEET_ROWS · s:1 · stack 대조
node tools/sim/02-formula.mjs            # ③ 시트 Rally Joiners 16행 · 54행 추천 배율 · ⑤ 단독 배율 752건 · 탐욕 vs 전수 최적
node tools/sim/03-sweep.mjs              # ④ 세대별 재현율 · DW.infantry/NA_SHARE 민감도 · 포화 곡선
```

산출물은 `out/out-0N.json` (gitignore). 기대 상태(2026-09-14):
- ② 차이 0 (g12 60/20/20 쌍둥이 행은 키가 같아 스크립트가 한 쌍으로 묶는다 — 차이가 아니다)
- ③ 16/16 · 추천 배율 최대 오차 ≤ 0.0005(화면 반올림) · 탐욕 gap 0 (54행 · 두 풀 모두)
- ④ 시트풀 #1 92.3% · DW.infantry 는 0.1~1.0 어디서도 #1 재현이 안 바뀐다(가정이 결과를 흔들지 않는다)

⚠️ 여기 "겹침" 은 **우리 4명 중 시트 #1~#4 칸에 든 비율**(분모 4×52)이라 `unit.mjs` 의 겹침(분모 228)과 숫자가 다르다.
