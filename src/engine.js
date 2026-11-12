const SLOTS=i18nFill({},function(){return{
 A:{n:L("피해량 증가","Damage bonus"),k:"dmg"},An:{n:L("일반공격 피해","Normal-attack damage"),k:"dmg"},B:{n:L("공격력 증가","Attack bonus"),k:"dmg"},
 E:{n:L("파괴력 증가","Lethality bonus"),k:"dmg"},F:{n:L("적 방어력 감소","Enemy defense down"),k:"dmg"},G:{n:L("적 받는 피해 증가","Enemy damage taken up"),k:"dmg"},
 C:{n:L("체력 증가","Health bonus"),k:"sur"},D:{n:L("받는 피해 감소","Damage taken down"),k:"sur"},DEF:{n:L("방어력 증가","Defense bonus"),k:"sur"},
 H:{n:L("적 공격력 감소","Enemy attack down"),k:"sur"},I:{n:L("적 파괴력 감소","Enemy lethality down"),k:"sur"},J:{n:L("적 피해량 감소","Enemy damage down"),k:"sur"},
 DODGE:{n:L("회피","Dodge"),k:"sur"},
 SKILL:{n:L("스킬 데미지","Skill damage"),k:"x"},SKILLUP:{n:L("스킬 데미지↑","Skill damage up"),k:"x"},
 VSTROOP:{n:L("특정 병종 상대 피해↑","Damage vs a troop type"),k:"x"},TARGET:{n:L("표식 대상 피해↑","Damage vs marked targets"),k:"x"},
 EXTRA:{n:L("추가 피해","Extra damage"),k:"x"},SHIELD:{n:L("보호막","Shield"),k:"x"}};});
// ── 버킷 (2026-11-10 · Ton 영상 "One thing that you DON'T understand about rallies and joiners") ──
// 같은 버킷은 더하고 다른 버킷은 곱한다. 버킷 값 = 1 + Σ%. 점수 = Π(공격 버킷) × Π(방어 버킷)^W_DEF.
// 방어 버킷도 1+Σ 그대로다 — 감소 20% 는 ×0.8 이 아니라 ÷1.2(상대 쪽에서 본 같은 구조)라서다.
// ⚠️ 예전 AH(추가피해 — 칸 없이 따로 곱함)·CRIT 는 없앴다. 스킬 데미지(SKILL)와 리더 전용 버킷(EXCL)은
// **수치 모델이 없어서** 배율에 넣지 않고 진단 칩으로만 띄운다(data.js 머리 주석 참고).
const ATK_B=["A","An","B","E","F","G"],DEF_B=["C","D","DEF","H","I","J","DODGE"];
const ORDER=ATK_B.concat(DEF_B);
const BUCKET=Object.fromEntries(ORDER.map(s=>[s,1]));
const EXCL=["SKILL","SKILLUP","VSTROOP","TARGET","EXTRA","SHIELD"];
const W_DEF=1;              // 방어 버킷의 무게(지수). 1 = 공격 버킷과 같다 — 전투비 R 에 똑같이 곱해지기 때문이다
let CHANCE_NO_STACK=true;   // 같은 버킷 확률형은 효과가 겹치지 않고 발동 확률만 오른다(Ton). false = 예전 기대값 단순합
const MIA_TYPE_MIN=0;       // 미아·플로라 병종 판정 — 비중이 이 값(%)보다 큰 병종만 센다
const GWEN_EFF=.5;          // 그웬 S1 "일부 공격에만" 감쇄. ⚠️ 0.5 는 근거 없는 값이다(사용자 결정 2026-11-10)
const byId=Object.fromEntries(HEROES.map(h=>[h.id,h]));
const wpct=l=>l<2?0:5+(Math.floor(l/2)-1)*2.5;
const norm=(a,b,c)=>{const s=a+b+c;return s<=0?{inf:0,lan:0,mar:0}:{inf:a*100/s,lan:b*100/s,mar:c*100/s};};
function tgtRatio(t,r){return t==="infantry"?r.inf:t==="lancer"?r.lan:t==="marksman"?r.mar:
 t==="inf+mar"?r.inf+r.mar:t==="mar+lan"?r.mar+r.lan:100;}
// 보병은 탱커라 병력 비중 대비 딜 기여가 낮다 → 딜 계열 병종한정 스킬은 딜 지분으로 환산
// ⚠️ 0.3 → 0.1 (2026-11-13 · 사용자 결정). 0.3 에서는 플린트 S1(보병 피해량 +100%)이 60/40 에서 ×1.310 으로 25% 조이너를 전부 제치고,
// 「계산 추천 — 전체 영웅」에 21/60 행 · Top 5 에 2~3장씩 겹쳐 올라왔다. 사용자: "보병만 버프하는 스킬이라 효율이 좋을 수가 없다."
// 시트도 같은 방향이다 — 60행 어디에도 플린트를 조이너로 적지 않았다.
// 시트가 주는 건 **상한 하나**다: 시트에서 보병이 가장 많은 병비(60/40)에서 플린트가 20% 계열(×1.200)을 넘지 않으려면 DW < 1/6.
// 0.1 은 그 안에서 여유를 둔 값이고(60/40 ×1.130) **우리가 고른 숫자다** — 보병의 실제 딜 비중을 잰 자료는 없다.
const DW={infantry:.1,lancer:1,marksman:1};
function dmgShare(t,r){
 const tot=r.inf*DW.infantry+r.lan+r.mar; if(tot<=0)return 0;
 const p=t==="infantry"?r.inf*DW.infantry:t==="lancer"?r.lan:t==="marksman"?r.mar:
   t==="inf+mar"?r.inf*DW.infantry+r.mar:t==="mar+lan"?r.mar+r.lan:tot;
 return p/tot;}
// pc 스킬 — 확률이 병종마다 독립으로 굴러간다. 편성에 든 병종 수만큼 시행이 늘어난다.
// v 는 1병종 기준값이므로 (1−(1−pc)^n)/pc 를 곱해 되돌린다 (n=1 이면 그대로).
// 근거: 볼트 「랠리 조이너 선정 규칙·개리슨 운영 (Ton)」 §6 — 미아 3병종 기대값 43.75%.
function nCls(r){return (r.inf>MIA_TYPE_MIN?1:0)+(r.lan>MIA_TYPE_MIN?1:0)+(r.mar>MIA_TYPE_MIN?1:0);}
// 병종이 하나도 없으면(n=0) pc 스킬의 기대값은 0 이다 — 예전에는 원값을 그대로 돌려줬다(2026-09-14 감사).
function eVal(e,r){const n=nCls(r);
 return e.pc?(n>0?e.v*(1-Math.pow(1-e.pc,n))/e.pc:0):e.v;}
// 같은 스킬이 k장 있을 때의 기대값. pc 는 **시행 횟수만** 늘어나므로 k 에 비례하지 않는다 —
// 시행이 n·k 번이 될 뿐이라 곧 포화한다. 일반 스킬은 그냥 k 배다.
function eK(e,r,k){const n=nCls(r);
 return e.pc?(n>0?e.v*(1-Math.pow(1-e.pc,n*k))/e.pc:0):e.v*k;}
// 이미 have 장 있을 때 한 장 더 넣는 값. have=0 이면 eVal 과 같다.
// ⚠️ 미아를 리더로 쓰고 조이너로 또 넣을 때 이게 없으면 두 번째 장이 +43.75%p 로 잡힌다.
// 실제로는 3병종 발동이 87.5% → 98.4% 로 오를 뿐이라 **+5.5%p** 다.
// 볼트 「랠리 조이너 선정 규칙·개리슨 운영 (Ton)」 §6 "2번째 미아의 기대 이득은 최대 +6.25%p" 와 맞는다.
// 새 가정이 아니라 위 eVal 공식에 시행 횟수를 넣은 것뿐이다.
function eAdd(e,r,have){return eK(e,r,have+1)-eK(e,r,have);}
// 무포화 스킬(bk 없는 X · AH)의 **자기 자신과 겹치는 분**. have 장이 이미 있을 때 한 장 더의 한계.
// 어느 칸인지 모르는 것과, 같은 스킬 두 장이 같은 자리라는 것은 별개다 — 칸을 몰라도
// **자기끼리는 반드시 같은 자리**이므로 이 프로젝트의 1번 모델(같은 칸 합연산)이 그대로 적용된다.
// 이걸 안 하면 리더가 이미 든 스킬을 조이너로 다시 집을 때 페널티가 0 이 된다
// (레니 60/40 자기 재선택 ×1.690 · 손실 38.5% — 2026-09-14 검증에서 8행 확인).
function nbAdd(v,have){return (1+(have+1)*v)/(1+have*v);}
// X(병종 한정) 스킬의 환산 지분 — 딜은 딜 지분, 생존은 병력 지분
function xShare(q,r){return q.k==="sur"?tgtRatio(q.tgt,r)/100:dmgShare(q.tgt,r);}
const NA_SHARE=.5; // 일반공격이 총딜에서 차지하는 비중 가정
// ⚠️ 0.6 → 0.5 (2026-10-17). 엔진으로 0.00~0.70 을 쓸어 보니 **0.00~0.65 는 52행 추천이 한 명도 안 바뀐다.**
// 결과에 닿는 경로는 레이나(1+0.30×NA) 하나뿐이고, NA > 2/3 이면 레이나가 ×1.200(20% 계열 · 칸이 찬 25% 계열)을
// 넘어 9행에 끼어든다. 시트가 주는 건 그 **상한 2/3 하나**다. 0.6 은 그 경계에서 0.067 이라 0.5 로 여유를 뒀다
// (하한 0 은 시트 근거가 아니라 측정 범위 끝이라 구간 가운데 0.33 을 고르지 않았다).
// ⚠️ 0.8 → 0.6 (2026-10-10). 근거는 기전이 아니라 **시트 재현**이다 — 사용자가 목표를 "최대한 시트의 조합과
// 대체가 나오게" 로 정했고, 52행 격자(0.5~0.8)에서 0.5~0.7 이 평탄 구간이라 가운데를 골랐다. 0.8 에서는 레이나가
// ×1.240 으로 25% 에픽(×1.250)에 붙어 23행에 끼어들었다. 시트 G7 주석 "Little skills damage, Reina is okay".
// 측정표는 CLAUDE.md 「2026-10-10 시트 재현 목표」 절에 있다. 느낌으로 다시 만지지 말 것 — 격자부터 다시 돌린다.
// 두 칸 스킬(필리 공15/방10 · 진먼 방10/체10 · Gen 9+ 의 공15/방10 여섯)은 **합으로 잰다** (2026-10-10).
// 다른 칸은 곱이라 (1+a)(1+b) = 1+a+b+ab 가 되는데, 그 교차항 ab(필리 1.5%p)가 정확히 25% 에픽을 제치는 폭이었다.
// 칸에는 그대로 넣고(같은 칸 포화는 살린다) 이 계수로 교차항만 걷어낸다. 역시 근거는 시트 재현이다 —
// 볼트 공식도 시트 Rally Joiners 탭 산수도 다른 스탯은 곱한다. 시트가 둘에 "25%/20%" 라벨을 안 붙이는 게 유일한 간접 신호.
// ⚠️ 2026-11-10 폐지 — 다른 버킷은 **곱한다**. 버킷 이론(가이드 §4 "혼합형은 두 버킷이 서로 곱해진다" · 지시서 §3.1 점수식)과
// 반대였고, 노라(bk X 두 칸)는 원래 곱하고 있어 잣대가 둘이었다. 시트 겹침을 올리려던 보정이라 지시서 §10 에도 걸린다(사용자 결정).
// 함수는 1 을 돌려주는 껍데기로 남긴다 — unit.mjs 의 독립 검산 복제본들이 이 이름을 부른다. 예전 식: (1+a+b)/((1+a)(1+b)).
function twoStat(a,b){return 1;}
// An(일반공격 한정) 칸에 넣을 값 — 총딜 = NA_SHARE×일반공격×(1+Σv) + (1−NA_SHARE)×스킬 이므로
// 칸값은 정확히 1+NA_SHARE×Σv 다. 리더든 조이너든 같은 잣대로 이 칸에 합산한다(2026-09-14).
function anVal(e,r){return e.slot==="An"?e.v*NA_SHARE:eVal(e,r);}

// ── 버킷 엔진 코어 (2026-11-10) ─────────────────────────────────────
// 리더 9스킬과 조이너 S1 을 똑같이 "원자(atom)" 목록으로 바꾸고, 점수는 scoreAtoms 하나가 낸다.
// ⑤ 단일 배율 · 추천 4명 · Top 5 조합이 전부 이 함수를 쓰므로 셋이 서로 다른 산수를 할 수 없다.
//   det  — 버킷에 그대로 더하는 값(확정 · 주기형 시간평균 · 병종 지분 환산된 bk X · An 환산)
//   ch   — 확률형. p(발동 확률) · m(발동 시 효과) · n(판정 횟수 — 미아·플로라는 편성 병종 수)
//   free — 버킷 없는 병종 한정 X(bk 없음). 같은 스킬끼리는 같은 자리라 1+k·v (nbAdd 와 같은 규칙)
//   two  — 두 칸 스킬의 교차항 제거 계수(twoStat)
// 확률형 판정: p 가 "N%" 인 일반 스킬과 pc 스킬만. "4턴중 2턴" 같은 주기형은 시간평균(det)이다.
function chanceP(e){if(e.pc)return e.pc;const m=/^(\d+(?:\.\d+)?)%$/.exec(e.p||"");return m?+m[1]/100:0;}
function sv(e){return e.partial?e.v*GWEN_EFF:e.v;}
// 같은 효과 = 같은 자리. 영웅이 달라도 S1 효과가 완전히 같으면 같은 키다 — 조합 탐색의 동치류도 이 키로 묶는다.
function sig(e){return JSON.stringify([e.slot,e.v,e.p||"",e.pc||0,e.k||"",e.tgt||"",e.bk||"",e.partial||0,e.also||null]);}
function atoms(e,r){
 const out=[],key=sig(e);
 const one=(q,k2)=>{
  if(q.slot==="ECO"||EXCL.indexOf(q.slot)>=0||q.v==null||q.off)return null;
  if(q.slot==="X"){const v=q.v*xShare(q,r);
   out.push(q.bk&&BUCKET[q.bk]?{t:"det",sl:q.bk,v:v,x:1}:{t:"free",key:k2,v:v});return null;}
  if(!BUCKET[q.slot])return null;
  if(q.slot==="An"){const v=q.v*NA_SHARE;out.push({t:"det",sl:"An",v:v,an:1});return v;}
  const p=chanceP(q);
  if(p>0){out.push({t:"ch",sl:q.slot,p:p,m:sv(q)/p,n:q.pc?nCls(r):1,pc:q.pc?1:0,key:k2});return null;}
  const v=sv(q);out.push({t:"det",sl:q.slot,v:v});return v;};
 const a=one(e,key);
 if(e.also)one(e.also,key+"+");
 return out;}
// 확률형 묶음의 기대 기여.
// CHANCE_NO_STACK=false 는 **예전 산수 그대로**다 — pc 스킬(미아·플로라)만 같은 키끼리 판정 횟수를 합치고(eK),
//   나머지 확률형은 장수만큼 기대값을 단순히 더한다(알론소 2장 = 0.40).
// CHANCE_NO_STACK: 같은 버킷의 확률형은 **가장 큰 발동 효과 하나만** 적용된다고 본다(Ton "데미지가 아니라 확률만 오른다").
//   효과 내림차순으로 Σ m_k · (1−(1−p_k)^n_k) · Π_{j<k}(1−p_j)^n_j — 독립 판정.
//   알론소 1/2/3명 → 0.20 / 0.32 / 0.392 · 미아 1장 3병종 0.4375 · 2장 0.4921875.
function chanceEV(items){
 if(!items||!items.length)return 0;
 const g={};items.forEach(a=>{const x=g[a.key]||(g[a.key]={p:a.p,m:a.m,n:0,k:0,pc:a.pc});x.n+=a.n;x.k++;});
 const ls=Object.keys(g).map(k=>g[k]);
 if(!CHANCE_NO_STACK)return ls.reduce((s,x)=>s+(x.pc?x.m*(1-Math.pow(1-x.p,x.n)):x.k*x.p*x.m),0);
 ls.sort((a,b)=>b.m-a.m);
 let miss=1,ev=0;ls.forEach(x=>{const f=Math.pow(1-x.p,x.n);ev+=x.m*(1-f)*miss;miss*=f;});
 return ev;}
function scoreAtoms(list){
 const det={},ch={},fr={};let s=1;
 list.forEach(a=>{if(a.t==="det")det[a.sl]=(det[a.sl]||0)+a.v;
  else if(a.t==="ch")(ch[a.sl]||(ch[a.sl]=[])).push(a);
  else if(a.t==="free"){const x=fr[a.key]||(fr[a.key]={v:a.v,n:0});x.n++;}
  else if(a.t==="two")s*=a.f;});
 const b={};
 ORDER.forEach(sl=>{const v=1+(det[sl]||0)+chanceEV(ch[sl]);b[sl]=v;s*=DEF_B.indexOf(sl)>=0?Math.pow(v,W_DEF):v;});
 Object.keys(fr).forEach(k=>{s*=1+fr[k].n*fr[k].v;});
 return {s:s,b:b};}
// ── 4명 조합 전수 탐색 (§3.5) ──
// 후보는 단일 배율이 1 을 넘는 영웅(gen ≤ gcap · S1 이 ECO/SKILL 계열이 아님). S1 효과가 완전히 같은 영웅은 한 동치류로 묶고
// (제시=제셀=제로니모=블랑쉬=헤르보르=행크 …), 4명 **중복 허용(multiset)** 을 전부 잰다 — 같은 동치류를 여럿 고르면
// 같은 버킷에 합연산으로 들어가므로 손해가 저절로 반영된다. cands 는 calc 의 rank(투자 문턱 순으로 정렬됨)다 →
// 동치류 안의 첫 영웅이 대표명이다. 동치류가 maxC 를 넘으면 단일 배율 상위 maxC 개로 가지친다.
function bestJoiners(base,cands,opt){
 opt=opt||{};const K=opt.top||5,maxC=opt.maxC||30;
 const s0=scoreAtoms(base).s,cl=[],by={};
 cands.forEach(x=>{if(!(x.mul>1.001))return;const k=sig(x.e);
  if(!by[k]){by[k]={key:k,at:x.at,mem:[],mul:x.mul};cl.push(by[k]);}by[k].mem.push(x);});
 const C=cl.length>maxC?cl.slice().sort((a,b)=>b.mul-a.mul).slice(0,maxC):cl;
 const n=C.length,best=[];
 const consider=(ix)=>{
  const sc=scoreAtoms(base.concat(C[ix[0]].at,C[ix[1]].at,C[ix[2]].at,C[ix[3]].at));
  const rel=sc.s/s0;
  if(best.length>=K&&rel<=best[best.length-1].rel+1e-12)return;
  best.push({ix:ix.slice(),rel:rel,b:sc.b});
  best.sort((a,b)=>(b.rel-a.rel>1e-12?1:a.rel-b.rel>1e-12?-1:0)||(()=>{for(let i=0;i<4;i++)if(a.ix[i]!==b.ix[i])return a.ix[i]-b.ix[i];return 0;})());
  if(best.length>K)best.pop();};
 for(let i=0;i<n;i++)for(let j=i;j<n;j++)for(let k=j;k<n;k++)for(let l=k;l<n;l++)consider([i,j,k,l]);
 return best.map(x=>({cls:x.ix.map(i=>C[i]),rel:x.rel,b:x.b,
   flags:x.ix.some(i=>C[i].at.some(a=>a.t==="ch"))?["CHANCE"]:[]}));}
// ── 규칙 레이어 (§4) — 수치 모델이 없는 판단. **점수를 건드리지 않는다.** 칩으로만 띄운다.
// gcap — 그 서버에 아직 없는 영웅을 권하는 칩은 내지 않는다. recIds — 화면의 **시트 조합(#sheet) + 계산 추천(#rec)** 영웅들(render 가 넘긴다).
// 중복 칩은 Top 1 조합뿐 아니라 이것도 본다(Top 1 은 정의상 겹침을 피하므로 그것만 보면 DUP 칩이 사실상 안 뜬다 — 2026-11-10 리뷰).
// ctx — {rows: 이 입력에 걸린 시트 행들, calc: 계산 추천(#rec) 영웅 id}. 노라 칩이 **화면의 시트 카드와 어긋나는 말을 하지 않게** 하려고 받는다.
function joinerRules(ids,r,combo,b0,skHeavy,gcap,recIds,ctx){
 const has=id=>ids.indexOf(id)>=0,out=[];recIds=recIds||[];
 const sheetRows=ctx&&ctx.rows||[],calcIds=ctx&&ctx.calc||[];
 const avail=id=>{const h=HEROES.filter(x=>x.id===id)[0];return !!h&&(gcap==null||h.gen<=gcap);};
 const inC=f=>(!!combo&&combo.cls.some(c=>c.mem.some(x=>f(x.h.id))))||recIds.some(f);
 const miaLike=id=>id==="mia"||id==="flora";
 if((has("mia")||has("flora"))&&inC(miaLike)){
  const n=nCls(r),k0=ids.filter(miaLike).length,p1=1-Math.pow(.5,n*k0),p2=1-Math.pow(.5,n*(k0+1));
  out.push({level:"warn",code:"MIA_DUP",text:L("리더에 미아·플로라가 있는데 시트 조합·계산 추천에 또 미아류가 있습니다 — 같은 적 받피↑ 버킷이라 <b>확률만 오릅니다</b>: 발동 "+(p1*100).toFixed(1)+"% → "+(p2*100).toFixed(1)+"% (기대값 +"+((p2-p1)*50).toFixed(2)+"%p).",
   "A Mia-type joiner is in the sheet set or the calculated pick while the leaders already run Mia/Flora — same enemy-damage-taken bucket, so <b>only the trigger chance rises</b>: "+(p1*100).toFixed(1)+"% → "+(p2*100).toFixed(1)+"% (EV +"+((p2-p1)*50).toFixed(2)+"pp).")});}
 if((has("ligeia")||has("estrella"))&&inC(id=>id==="hendrik"||id==="ligeia"||id==="estrella"))
  out.push({level:"info",code:"HENDRIK_DUP",text:L("리더에 리지아·에스텔라가 있고 시트 조합·계산 추천에 헨드릭류가 있습니다 — 같은 적 방어↓ 버킷입니다.","The leaders run Ligeia/Estrella and the sheet set or the calculated pick has a Hendrik-type joiner — same enemy-defense-down bucket.")});
 if((has("eleonora")||has("greg"))&&inC(id=>id==="patrick"))
  out.push({level:"info",code:"PATRICK_DUP",text:L("리더에 엘레오노라·그렉(체력↑)이 있는데 패트릭이 들어 있습니다 — 체력 버킷이 겹칩니다(Ton 시트 Gen 11 · 13 비고).","Eleonora/Greg (health up) lead and Patrick is in — the health bucket overlaps (Ton sheet notes, Gen 11 and 13).")});
 if(r.lan>=20&&!has("renee")&&avail("renee")&&recIds.indexOf("renee")<0)
  out.push({level:"info",code:"RENEE",text:L("창병이 있는 편성입니다 — 시트의 60/40 행은 대부분 레니를 넣습니다. 버킷이 미확정이라 점수에는 넣지 않았습니다.","This formation has lancers — most 60/40 rows on the sheet include Renee. Her bucket is unconfirmed, so she is not scored.")});
 if(skHeavy&&avail("wuming"))
  out.push({level:"info",code:"WUMING",text:L("상대 스킬 데미지가 많으면 무명이 대안입니다(보병 스킬 받피 −30%) — 버킷 미확정이라 점수 외.","Against heavy skill damage Wu Ming is the alternative (infantry skill damage taken −30%) — unconfirmed bucket, not scored.")});
 if(!skHeavy&&b0.An<=1+1e-9&&avail("reina"))
  out.push({level:"info",code:"REINA",text:L("일반공격 버킷이 비어 있습니다 — 상대 스킬 데미지가 적으면 레이나를 고려하세요(시트 Gen 7 · 11).","The normal-attack bucket is empty — if their skill damage is low, consider Reina (sheet, Gen 7 and 11).")});
 // 노라 겹침 — 시트가 **이 편성의 행**에 실제로 적은 장수를 말한다. 예전에는 보+궁 ≥88% 면 무조건 "시트는 여기서 3~4장" 이라고 적어서,
 // 바로 위 시트 카드가 노라를 한 장도(또는 한 장만) 적은 편성에서도 그 말이 떴다(G13 기젤라·카롤·불카누스 50/10/40 등 — 2026-11-11 리뷰).
 //  · 걸린 행이 노라를 2칸 이상 적었다 → 그 장수를 말한다          · 걸린 행이 있는데 안 겹쳤다 → 칩을 내지 않는다(시트 카드가 곧 답이다)
 //  · 걸린 행이 없다 → 시트 전체의 경향을 **세어서** 말한다(이 편성 얘기가 아니라고 밝힌다)
 if(r.inf+r.mar>=88&&avail("norah")){
  // 칸을 둘로 나눠 센다 — 노라만 적힌 칸(nor)과, 노라가 선택지 중 하나인 칸(opt · 시트 원문 "Norah/Patrick").
  // 둘을 합쳐 "4칸" 이라고 하면 시트 카드(3칸 + 노라/패트릭 1칸)와 어긋난다 — G6 48/4/48 · G6 META 45/5/50 두 행이 그렇다.
  const nor=c=>c.j.filter(cell=>cell.length===1&&cell[0]==="norah").length,opt=c=>c.j.filter(cell=>cell.length>1&&cell.indexOf("norah")>=0).length;
  const top=sheetRows.slice().sort((a,b)=>nor(b)+opt(b)-nor(a)-opt(a))[0];
  const nRec=calcIds.filter(id=>id==="norah").length,mine=top?nor(top):0,either=top?opt(top):0;
  const optTxt=either?L(" 그 밖에 <b>"+either+"칸</b>은 노라와 다른 영웅 중 하나로 적었습니다(카드의 「/」 칸)."," Another <b>"+either+(either>1?" cells offer":" cell offers")+"</b> Norah or another hero (the “/” cell on the card)."):"";
  const calcTxt=nRec>=2?L(" 계산 추천은 "+nRec+"장입니다 — 카드의 「↘ 겹친 자리」 숫자가 장당 값입니다."," The calculated pick takes "+nRec+" — the “↘ stacked copies” line on each card gives the per-copy value.")
    :L(" 계산은 장마다 줄어드는 값을 재서 이득일 때만 겹칩니다."," The calculation stacks her only while each extra copy still wins.");
  if(sheetRows.length){
   if(mine+either>=2)out.push({level:"info",code:"NORAH_STACK",text:L("보병+궁병 위주 편성입니다 — 시트는 이 편성에 노라를 <b>"+mine+"칸</b> 적었습니다.",
     "Infantry + marksman heavy — the sheet writes Norah in <b>"+mine+(mine===1?" cell":" cells")+"</b> for this lineup.")+optTxt+calcTxt});
  }else{
   const st=SHEET_COMPS.filter(c=>(gcap==null||c.g<=gcap)&&nor(c)>=2&&c.rs.some(v=>v[0]+v[2]>=88)),mx=st.length?Math.max.apply(null,st.map(nor)):0;
   if(st.length)out.push({level:"info",code:"NORAH_STACK",text:L("보병+궁병 위주 편성입니다 — 이 편성은 시트에 행이 없지만, 시트는 보+궁 위주 병비의 <b>"+st.length+"개 행</b>에서 노라를 "+(mx>2?"2~"+mx:"2")+"칸 겹쳐 적습니다.",
     "Infantry + marksman heavy — the sheet has no row for this lineup, but it stacks Norah in "+(mx>2?"2–"+mx:"2")+" cells on <b>"+st.length+" rows</b> with infantry + marksman heavy ratios.")+calcTxt});
  }}
 if((combo&&combo.flags.indexOf("CHANCE")>=0)||recIds.some(id=>{const h=HEROES.filter(x=>x.id===id)[0];return !!h&&chanceP(h.exp[0])>0;}))
  out.push({level:"info",code:"CHANCE",text:L("시트 조합·계산 추천에 확률형(미아류 포함)이 있습니다 — 열세일 때 한 방을 노리는 용도입니다(시트 원칙 3).","The sheet set or the calculated pick includes a chance-based skill (Mia types included) — that is for gambling when you are the weaker side (sheet principle 3).")});
 out.push({level:"info",code:"LV5",text:L("조이너는 1번 영웅 S1 이 Lv.5 여야 채택됩니다. 미달이면 그 사람이 통째로 건너뛰어집니다.","A joiner only counts if their first hero's S1 is Lv.5 — otherwise that player is skipped entirely.")});
 return out;}
const tgtName=i18nFill({},function(){return{infantry:L("보병","infantry"),lancer:L("창병","lancers"),marksman:L("궁병","marksmen"),"inf+mar":L("보병+궁병","infantry+marksmen"),"mar+lan":L("궁병+창병","marksmen+lancers")};});
function tgtStat(t,r){const v=tgtRatio(t,r);return v<5?["dead",L("사망","dead"),v]:v<20?["weak",L("약함","weak"),v]:["ok",L("정상","ok"),v];}

// 비율은 [보병,창병,궁병]. 2자리 약칭 해석 규칙:
//  60/40 = 보60·창40 (궁0)   70/30 = 보70·창30 (궁0)
//  50/50 = 보50·궁50 (창0)   49/49 = 보49·궁49 (창2)   40/60 = 보40·궁60 (창0)
//  단, "40/60 초방어를 깨는 50/50"만은 보50·창50 (창병으로 상대 궁60 저격)
const COUNTERS=i18nFill([],function(){return[
 {m:[50,20,30],lbl:"50/20/30",src:"sheet",cv:[[40,40,20],[30,20,50]],
  c:["40/40/20","30/20/50"],
  ban:[{v:[60,40,0],l:"60/40"}],
  why:L("40/40/20은 보40 흡수·창40이 상대 궁30 저격·궁20 전방. 30/20/50은 궁50 속전속결. 반대로 60/40은 궁병이 0이라 상대 보50을 녹이지 못하고, 창40이 잡을 상대 궁도 30뿐이라 화력이 남는다.","40/40/20: 40 infantry absorb, 40 lancers snipe their 30 marksmen, 20 marksmen work the front. 30/20/50: 50 marksmen for a fast kill. 60/40, by contrast, has zero marksmen so it never melts their 50 infantry, and its 40 lancers only have 30 marksmen to hunt — the surplus is wasted.")},
 {m:[60,40,0],lbl:"60/40",src:"sheet",cv:[[40,20,40]],
  c:[L("40/20/40 + 멀티랠리 3~4개","40/20/40 + 3-4 rallies")],
  ban:[{v:[50,0,50],l:"50/50"},{v:[49,2,49],l:"49/49"}],
  why:L("60/40은 만능 방어라 단일 랠리로는 못 깬다. 궁병을 절반 넣는 50/50·49/49는 상대 창40에 후열이 먼저 지워지고, 보60이 오래 버텨 역전당한다. 동시 타격이 정석이고 브래들리·카롤·불카누스가 영웅 카운터.","60/40 is the all-purpose defense and a single rally will not break it. Comps that are half marksmen (50/50, 49/49) lose their back line to those 40 lancers while 60 infantry stall long enough to turn it around. Simultaneous strikes are the standard answer; Bradley, Karol and Vulcanus are the hero counters.")},
 {m:[70,30,0],lbl:"70/30",src:"sheet",cv:[],
  c:[L("멀티랠리로 물량 압박","Multi-rally pressure")],
  // 가이드 카운터표의 70/30 행 금지는 50/50 하나뿐이다. 49/49 를 따로 적지
  // 않아도 거리 2.45 라 BAND_TOL(6) 안에서 같이 잡힌다.
  ban:[{v:[50,0,50],l:"50/50"}],
  why:L("특정 비율 카운터가 없다. 60/40과 같은 이유로 궁병 절반 편성은 금지.","No specific ratio counters it. Half-marksman comps are banned for the same reason as against 60/40.")},
 {m:[40,0,60],lbl:L("40/60 (초방어)","40/60 (ultra-defense)"),src:"sheet",cv:[[50,50,0],[60,40,0]],
  c:[L("50/50/0 (보50·창50)","50/50/0 (50 inf · 50 lancer)"),"60/40"],
  ban:[{v:[50,20,30],l:"50/20/30"}],
  why:L("보50이 전방을 유지하고 창50이 상대 궁60을 순삭한다. 창병이 20밖에 없는 50/20/30은 상대 궁60을 못 지워서 밴드. 여기서는 60/40이 오히려 정답 카운터다.","50 infantry hold the front while 50 lancers erase their 60 marksmen. 50/20/30 only brings 20 lancers, cannot clear those 60 marksmen, and is therefore banned. Here 60/40 is actually the correct counter.")},
 {m:[60,30,10],lbl:"60/30/10",src:"sheet",cv:[[40,20,40]],
  c:[L("40/20/40 + 더블·트리플 랠리","40/20/40 + double or triple rally")],ban:[],
  why:L("단일 랠리는 실패한다. 최소 2~3랠리 필요.","A single rally fails. You need at least 2-3.")},
 {m:[40,10,50],lbl:L("40/10/50 (준공격)","40/10/50 (semi-offensive)"),src:"theory",cv:[[40,40,20],[50,40,10]],
  c:["40/40/20","50/40/10"],ban:[],
  why:L("상대 창병이 10뿐이라 내 후열이 안전하다. 창40으로 상대 주력(궁50)을 지운다. ※ 가이드 카운터표에 없는 확장 항목(이론).","With only 10 lancers on their side your back line is safe. 40 lancers erase their main damage (50 marksmen). Note: an extension not present in the guide's counter table (theory).")}];});
// ── 지금 이 편성이 시트의 어느 행인가 ────────────────────────────────
// 리더 셋이 그 행의 (대안 포함) 리더와 맞고 병비가 라벨에 적힌 비율 중 하나와 가까우면 그 행이다.
// 허용 오차는 밴드 판정과 같은 6 을 쓴다 — 시트가 한 행에 여러 비율을 적어 두므로
// 그 사이를 메우려고 넓힐 필요가 없다(48/4/48 과 40/10/50 은 둘 다 rs 에 들어 있다).
const COMP_TOL=6;
// ⚠️ 세대(gcap)를 반드시 본다. 예전에는 안 봐서, 같은 리더·병비를 쓰는 행이 두 세대에 있으면
// **먼저 나온 행**이 이겼다 — 제로니모·미아·브레들리 48/4/48 을 Gen 8 로 놓아도 Gen 7 행이 잡혀
// 시트가 Gen 8 에 적어 둔 헨드릭 대신 Gen 7 의 패트릭이 나왔다.
// 규칙: gcap 을 넘는 행은 아예 안 쓰고, 남은 것 중 **세대가 가장 높은**(가장 최신) 행을 쓴다.
// 같은 세대면 병비가 더 가까운 쪽.
// 걸리는 시트 행을 **전부** 돌려준다. 보통은 0개나 1개지만,
// 시트가 한 입력에 답을 둘 적어 둔 자리가 있다(data.js 의 SHEET_COMPS 주석 참고).
// 그때 우리가 몰래 하나를 고르지 않고 화면이 둘 다 드러내야 하므로 목록으로 준다.
// 고른 리더가 전부 그 자리의 대안 안에 있어야 하고, 그 행이 요구하는 자리를 다 채워야 한다
function leadersFit(c,ids){
 for(let i=0;i<3;i++){
  const want=c.l[i],got=ids[i];
  if(want.length&&(!got||want.indexOf(got)<0))return false;
  if(!want.length&&got)return false;
 }
 return true;
}
function matchComps(ids,r,gcap){
 const mine=[r.inf,r.lan,r.mar];
 if(ids.filter(Boolean).length<2)return [];
 const hit=[];
 SHEET_COMPS.forEach(c=>{
  if(gcap!==undefined&&c.g>gcap)return;
  if(!leadersFit(c,ids))return;
  const d=Math.min.apply(null,c.rs.map(v=>dist(mine,v)));
  if(d>COMP_TOL)return;
  hit.push({c:c,d:d});
 });
 // 세대가 높은 쪽 → 병비가 가까운 쪽 → 시트가 META 라고 표시한 쪽.
 // META 는 우리 판단이 아니라 시트 라벨을 그대로 읽은 것이다.
 hit.sort((a,b)=>(b.c.g-a.c.g)||(a.d-b.d)||((b.c.meta?1:0)-(a.c.meta?1:0)));
 // **세대·병비로 갈리는 행은 이미 갈린 것이다** — 낮은 세대 행은 답이 아니라 옛 답이다
 // (Gen 7/8 헨드릭 건이 그거였다). 여기서 남기는 것은 그 둘로도 못 가르는 동률뿐이고,
 // 그게 곧 "시트가 한 입력에 답을 둘 적어 둔" 자리다.
 if(!hit.length)return [];
 const top=hit[0];
 return hit.filter(x=>x.c.g===top.c.g&&Math.abs(x.d-top.d)<1e-9).map(x=>x.c);
}
// 병비가 맞는 행이 없을 때 — **리더만 맞는 행**을 안내용으로 돌려준다 (2026-10-10, 사용자 요청).
// 판정·칸 채우기에는 쓰지 않는다. "같은 리더가 시트에 다른 병비로 있다"는 사실만 화면이 알린다 —
// 아모세·필리·린 60/40 에서 시트 50/2/48 행(미아·패트릭·제시*·서윤)이 있다는 걸 사용자가 알 길이 없었다.
// gcap 은 matchComps 와 같은 기준으로 본다(서버에 없는 세대 행을 안내하면 그 조이너도 없다).
function nearComps(ids,gcap){
 if(ids.filter(Boolean).length<2)return [];
 return SHEET_COMPS.filter(c=>(gcap===undefined||c.g<=gcap)&&leadersFit(c,ids)).sort((a,b)=>b.g-a.g);
}
// 동률 타이브레이크용 — gcap 근처(USE_WIN 세대 안) 시트 행에서 이 영웅이 조이너 칸에 오른 행 수 (2026-10-17).
// 시트 등재(s) 플래그만으로는 등재 영웅끼리의 동률(제시·헨드릭·패트릭 ×1.250)을 못 가른다.
// ⚠️ skip(이 입력에 걸리는 시트 행)은 **반드시 뺀다.** 안 빼면 시트 행을 시트 답으로 맞히는 순환이 된다 —
// 그래서 시트 행 대조(unit.mjs)가 따로 손 안 대도 leave-one-out 이다.
// 창 폭은 쓸어서 골랐다: 0 62.3% · 1~2 62.7%(평탄) · 3~4 61.4% · 6 60.5% (52행 겹침). 전체 빈도는 저세대
// 행을 휩쓴 제시가 이겨 효과가 없다. 값을 바꾸지 않는다 — 같은 배율 안에서만 순서를 정한다.
const USE_WIN=2;
function sheetUse(gcap,skip){
 const n={};
 SHEET_COMPS.forEach(c=>{
  if(c.g>gcap||c.g<gcap-USE_WIN||skip.indexOf(c)>=0)return;
  const seen=new Set();c.j.forEach(s=>s.forEach(id=>seen.add(id)));
  seen.forEach(id=>{n[id]=(n[id]||0)+1;});
 });
 return n;
}
// 칸을 채울 때 쓰는 대표 행 하나. 나머지는 화면이 "시트가 답을 둘 적어 뒀다"고 알린다.
function matchComp(ids,r,gcap){
 const all=matchComps(ids,r,gcap);
 return all.length?all[0]:null;
}
// 대표 행과 **시트 카드에 실리는 내용(칸 · 대안 · 비고)이 실제로 다른** 나머지 행들 — 화면이 블록을 따로 그린다.
// 2026-11-11 까지는 조이너 칸(j)만 비교해서, 칸은 같고 대안·비고만 다른 행이 생기면 그 대안·비고가 조용히 사라질 구조였다
// (지금 시트에는 그런 쌍이 없다 — unit.mjs 가 센다).
function compKey(c){return JSON.stringify([c.j,c.jx||0,c.alt||0,c.ax||0,c.ao||0,c.c||""]);}
function compRivals(all){
 if(!all||all.length<2)return [];
 const seen=[compKey(all[0])];
 return all.slice(1).filter(c=>{const k=compKey(c);if(seen.indexOf(k)>=0)return false;seen.push(k);return true;});
}
// 걸린 행 가운데 c 와 내용이 완전히 같은 다른 행들(쌍둥이) — 블록은 하나로 접고 **라벨만** 같이 보여 준다.
// 접기만 하면 시트가 그 편성을 "Offense" 로도 적었다는 사실이 화면에서 사라진다(G1 50/20/30 · G11 60/40 — 2026-11-11 리뷰).
function compTwins(all,c){
 if(!all||all.length<2)return [];
 const k0=compKey(c);
 return all.filter(x=>x!==c&&compKey(x)===k0);
}
const BAND_TOL=6;   // 내 병비가 금지 비율과 이 거리 안이면 밴드
const ROW_TOL=10;   // 상대 비율이 이 거리 밖이면 밴드 판정을 내리지 않는다

// ⚠️ 2026-08-22. 여기 있던 3채널 지표(P/T/B · TH/THW/FEAS/SUP · channels ·
//    CH_TXT/CH_FIX/CH_NAME · modelVerdict)는 걷어냈다. 세 임계값이 각각 밴드
//    단 한 건에 묶여 있어 🚫/⚠️ 판정을 낼 근거가 없었다. 화면 스스로 "이건
//    메커니즘 모델이 아닙니다 · 지표를 믿지 마세요"라고 적고 있었는데, 그렇게까지
//    단서를 달아야 하는 판정은 안 내는 게 맞다.
//    이제 이 계산기는 가이드 카운터표만 근거로 판정한다. 되살리려면 근거부터 —
//    밴드표에 점이 더 붙어서 임계값을 한 건이 아니라 여러 건이 묶어야 한다.

// 실제 메커니즘 (병종 스탯 시스템 가이드) — 화면 하단 참고용
const MECH=i18nFill({},function(){return{
 rps:[[L("보병 → 창병","Infantry → Lancer"),"T1 Master Brawler",L("공격 데미지 +10%","Attack damage +10%")],
      [L("창병 → 사수","Lancer → Marksman"),"T1 Charge",L("공격 데미지 +10%","Attack damage +10%")],
      [L("사수 → 보병","Marksman → Infantry"),"T1 Ranged Strike",L("공격 데미지 +10%","Attack damage +10%")]],
 t7:[[L("보병 T7 Bands of Steel","Infantry T7 Bands of Steel"),L("창병에 대한 방어력 +10%","+10% defense vs lancers")],
     [L("사수 T7 Volley","Marksman T7 Volley"),L("공격 시 10% 확률로 2회 타격","10% chance to strike twice")],
     [L("창병 T7 Ambusher","Lancer T7 Ambusher"),L("20% 확률로 보병 뒤 사수 직격","20% chance to hit the marksmen behind the infantry")]],
 stat:[[L("보병","Infantry"),L("전열","Front"),"10","13","15","10"],
       [L("창병","Lancer"),L("중열","Middle"),"13","11","11","14"],
       [L("사수","Marksman"),L("후열","Back"),"14","10","10","15"]]
};});
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
// 시트 판정 — 이 계산기의 유일한 판정 근거다. DOM 을 안 만지는 순수 함수라
// test/unit.mjs 가 가이드 표 11점을 그대로 먹여 검사한다.
// 표는 "금지 목록"이지 "승인 목록"이 아니다. 금지에 없다고 통과가 아니라
// 표가 그 비율을 언급조차 안 한 것일 수 있다 → 4상태로 구분한다.
// 수비 판정 — 같은 표를 반대 방향으로 읽는다. 새 가정은 없다.
// 표의 왼쪽 열이 "상대 방어"이므로, 수비할 때는 행을 고르는 키가 내 개리슨 비율이고
// 비교 대상이 들어오는 랠리다.
//   들어오는 랠리가 내 행의 금지 목록에 있으면 → 상대가 밴드 편성으로 온 것 (유리)
//   내 행의 추천 카운터에 있으면            → 정석 카운터가 온 것 (위험)
// 금지를 먼저 본다. 두 목록은 서로 다른 비율이라 겹치지 않지만, 겹친다면
// "표가 그 비율로는 못 깬다고 못박은 쪽"이 더 강한 진술이다.
// ⚠️ 추천 카운터에 멀티랠리 전제가 붙은 행이 있다(60/40 · 60/30/10).
//    단일 랠리 하나가 그 비율로 왔다고 곧바로 지는 게 아니다 — 라벨의 전제를 같이 보여줄 것.
function garrisonVerdict(mine,inc){
 const best=COUNTERS.map(c=>({c,d:dist(mine,c.m)})).sort((a,b)=>a.d-b.d)[0];
 const exact=best.d<=ROW_TOL;
 const near=(list,get)=>exact?list.map(x=>({x,d:dist(inc,get(x))})).filter(y=>y.d<BAND_TOL)
   .sort((a,b)=>a.d-b.d).map(y=>y.x)[0]:null;
 const banned=near(best.c.ban,b=>b.v);
 const threat=near(best.c.cv,v=>v);
 return {rule:best.c,banned,threat,exact,d:best.d,
   verdict:!exact?"noRow":banned?"favorable":threat?"threat":"silent"};
}
function sheetVerdict(en,mine){
 const best=COUNTERS.map(c=>({c,d:dist(en,c.m)})).sort((a,b)=>a.d-b.d)[0];
 const exact=best.d<=ROW_TOL;
 const banned=exact?best.c.ban.map(b=>({b,d:dist(mine,b.v)})).filter(x=>x.d<BAND_TOL)
   .sort((a,b)=>a.d-b.d).map(x=>x.b)[0]:null;
 const isCtr=exact&&best.c.cv.some(v=>dist(mine,v)<BAND_TOL);
 return {rule:best.c,banned,exact,d:best.d,
   verdict:!exact?"noRow":banned?"ban":isCtr?"counter":"silent"};
}


function calc(){
 const mode=document.getElementById("mAtk").classList.contains("on")?"rally":"defender";
 const picks=[["hInf","wInf"],["hLan","wLan"],["hMar","wMar"]].map(([h,w])=>({
   hero:byId[document.getElementById(h).value]||null,
   wl:Math.max(0,Math.min(10,+document.getElementById(w).value||0))}));
 const r=norm(+document.getElementById("r1").value||0,+document.getElementById("r2").value||0,+document.getElementById("r3").value||0);
 const leaders=picks.filter(p=>p.hero);
 // #out 은 setOut(render.js) 하나로만 갈아끼운다. 여기서 innerHTML 을 직접 쓰면 "마지막으로 그린 HTML" 기억(LAST_OUT)이 안 지워져,
 // 리더를 다 비웠다가 같은 리더를 다시 고르면 안내문이 그대로 남는다(2026-11-11 리뷰에서 잡힘).
 if(leaders.length===0){setOut('<div class="callout co-tip"><p>'+S("needLeader")+'</p></div>');return;}

 // ── 버킷 집계 (리더 9스킬) ──
 // 점수는 scoreAtoms 가 낸다. 여기서는 화면용 출처(src) · 병종 전용 판정(cls) · 배율 제외 칩(leaderOnly) · 수치 미확인(unknown)을 모은다.
 const base=[],src={},cls=[],leaderOnly=[],unknown=[],offs=[];
 ORDER.forEach(s=>{src[s]=[];});
 leaders.forEach(({hero})=>hero.exp.forEach(e=>{
   if(e.slot==="ECO")return;
   [e].concat(e.also?[e.also]:[]).forEach(q=>{
    if(EXCL.indexOf(q.slot)>=0)leaderOnly.push({hero,skill:e.n,slot:q.slot});
    else if(q.v==null)unknown.push({hero,skill:e.n,slot:q.slot,reason:"v:null"});
    else if(q.off)offs.push({hero,skill:e.n,tgt:q.tgt});
    else if(q.unsure)unknown.push({hero,skill:e.n,slot:q.slot==="X"?(q.bk||"X"):q.slot,reason:"unsure"});
    // X 는 병종 전용 판정(cls)으로도 빠진다 — 한 스킬이 두 병종에 다르게 걸리면 also 로 둘 다 단다.
    // off 는 그 몫 자신의 표시다 — also 가 본체의 off 를 물려받지 않게 따로 적는다.
    if(q.slot==="X"){const[st,lbl,v]=tgtStat(q.tgt,r);cls.push({hero,e:q===e?e:Object.assign({},e,q,{off:q.off||0}),st,lbl,v});}});
   const at=atoms(e,r);
   at.forEach(a=>{
    if(a.t==="det")src[a.sl].push(HN(hero)+" "+e.n+" +"+(a.v*100).toFixed(0)+"%"+
      (a.x?L(" (병종 지분 환산)"," (class share)"):a.an?L(" (일반공격 비중 "+(NA_SHARE*100)+"% 환산)"," (normal-attack share "+(NA_SHARE*100)+"%)"):""));
    else if(a.t==="ch")src[a.sl].push(HN(hero)+" "+e.n+" "+(a.p*100).toFixed(0)+"%×"+(a.m*100).toFixed(0)+"%"+
      (a.n>1?L(" (병종 "+a.n+"회 판정)"," ("+a.n+" rolls, one per troop type)"):"")+L(" — 확률형"," — chance"));});
   base.push.apply(base,at);
 }));
 const s0=scoreAtoms(base),buck=s0.b;

 // ── 위젯 ──
 const wg=picks.filter(p=>p.hero&&p.hero.w).map(p=>({
   hero:p.hero,w:p.hero.w,lv:p.wl,pct:wpct(p.wl),fire:p.hero.w.side===mode&&wpct(p.wl)>0}));
 const wstat={};wg.filter(x=>x.fire).forEach(x=>{wstat[x.w.stat]=(wstat[x.w.stat]||0)+x.pct;});
 const wmul=Object.values(wstat).reduce((a,v)=>a*(1+v/100),1);
 const wDmg=["Attack","Lethality"].reduce((a,s)=>a*(1+(wstat[s]||0)/100),1);
 const wSur=["Defense","Health"].reduce((a,s)=>a*(1+(wstat[s]||0)/100),1);

 // ── 조이너 순위 ──
 const lid=new Set(leaders.map(l=>l.hero.id));
 const gcap=+document.getElementById("gcap").value||99;
 const rank=HEROES.filter(h=>h.gen<=gcap).map(h=>{
   const e=h.exp[0];if(!e||e.slot==="ECO")return null;
   const at=atoms(e,r),s1=scoreAtoms(base.concat(at)),mul=s1.s/s0.s;
   const detail=[];let cond=null;
   // 리더로 쓴 영웅도 조이너로 들어올 수 있다 — 다른 연맹원이 자기 것을 데려오는 것이다.
   // 그 스킬은 이미 리더 쪽 원자로 들어가 있으므로 같은 버킷(또는 같은 자리)에 **한 장 더 얹는 값**으로 저절로 잰다.
   if(e.slot==="X"){const[st,lbl,v]=tgtStat(e.tgt,r);cond=st+"|"+tgtName[e.tgt]+" "+v.toFixed(0)+"% ("+lbl+")";
     // 2026-09-14: 조이너 쪽 사망 절벽은 없앴다 — 지분 환산(xShare)이 이미 연속으로 줄인다. 라벨(cond)만 안내로 남는다.
     [e].concat(e.also&&e.also.slot==="X"?[e.also]:[]).forEach(x=>{const sh=xShare(x,r);
       if(x.off){detail.push(L(tgtName[x.tgt]+" 몫은 배율 제외 — 실전 가치를 잴 자료 없음",tgtName[x.tgt]+" part not scored — no data to value it"));return;}
       detail.push(L(tgtName[x.tgt]+" "+(x.k==="sur"?"병력":"딜")+" 지분 "+(sh*100).toFixed(0)+"% 환산",
                     tgtName[x.tgt]+" "+(x.k==="sur"?"headcount":"damage")+" share "+(sh*100).toFixed(0)+"%"));});}
   if(EXCL.indexOf(e.slot)>=0)detail.push(L("배율 제외 — "+SLOTS[e.slot].n+" (수치 모델 없음)","not scored — "+SLOTS[e.slot].n+" (no numeric model)"));
   else if(e.v==null)detail.push(L("수치 미확인 — 배율 제외 (버킷 미확정)","value unconfirmed — not scored (bucket unknown)"));
   if(e.pc){const n=nCls(r),k0=base.filter(a=>a.t==="ch"&&a.sl===e.slot&&a.n===n&&a.p===e.pc).length;
     detail.push(k0
       ?L("리더가 이미 같은 판정을 들고 있음 → 시행만 "+n+"회 늘어 발동 "+((1-Math.pow(1-e.pc,n*(k0+1)))*100).toFixed(1)+"%",
          "the leaders already roll this → only "+n+" more rolls: fires "+((1-Math.pow(1-e.pc,n*(k0+1)))*100).toFixed(1)+"%")
       :L("병종 "+n+"종 → 발동 "+((1-Math.pow(1-e.pc,n))*100).toFixed(1)+"% · 기대값 "+(eVal(e,r)*100).toFixed(2)+"%",
          n+" troop types → fires "+((1-Math.pow(1-e.pc,n))*100).toFixed(1)+"% · EV "+(eVal(e,r)*100).toFixed(2)+"%"));}
   else if(CHANCE_NO_STACK&&at.some(a=>a.t==="ch")&&base.some(a=>a.t==="ch"&&a.sl===e.slot))
     detail.push(L("같은 버킷 확률형 — 효과는 겹치지 않고 발동 확률만 오릅니다","same-bucket chance skill — the effect does not stack, only the trigger chance rises"));
   if(e.slot==="An")detail.push(L("일반공격 비중 "+(NA_SHARE*100)+"% 가정 · 같은 칸 합연산","assumes normal attacks are "+(NA_SHARE*100)+"% of damage · adds in the same slot"));
   ORDER.forEach(sl=>{const a=s0.b[sl],b=s1.b[sl];
     if(Math.abs(b-a)>1e-12)detail.push(sl+" "+a.toFixed(2)+"→"+b.toFixed(2)+" ×"+(b/a).toFixed(3));});
   at.forEach(a=>{if(a.t==="free"&&base.some(z=>z.t==="free"&&z.key===a.key))
     detail.push(L("리더가 이미 들고 있음 → 자기끼리 합연산","already on the leader → adds to itself"));});
   const tw=at.filter(a=>a.t==="two")[0];
   if(tw&&Math.abs(tw.f-1)>1e-9)detail.push(L("두 칸 스킬 → 합으로 잽니다 (교차항 제거 ×"+tw.f.toFixed(3)+")","two-stat skill → measured as a sum (cross term removed ×"+tw.f.toFixed(3)+")"));
   return{h,e,mul,detail,cond,dup:lid.has(h.id),at};
 }).filter(Boolean);
 // 동률 타이브레이크 — 값이 같으면 모델은 더 못 가른다. 그래서 **투자 문턱**으로 가른다:
 // 실제로 조이너로 들어오는 건 이론 순위가 아니라 "Lv.5 로 올라와 있는 영웅"이기 때문이다.
 //   ① 시트 등재(s) → ② 근처 세대 시트 사용 빈도(sheetUse) → ③ 에픽(만렙이 싸다) → ④ 낮은 세대(보유율이 높다) → ⑤ 데이터 순서
 // 값 자체는 건드리지 않는다. 순위를 바꾸는 게 아니라 **같은 값 안에서만** 순서를 정한다.
 // 예전에는 데이터 순서에 맡겨서 그웬(이론·G5)이 헨드릭(시트·G8)을 앞섰다.
 // 부동소수 끝자리로 동률이 깨지지 않게 6자리에서 반올림해 비교한다.
 // sort 는 ES2019 부터 안정 정렬이라 ⑤ 는 따로 안 적어도 지켜진다.
 // 이 편성이 시트에 있는 행인가 — 있으면 화면의 📋 시트 카드가 그 행을 그대로 보여 준다(render.js). 계산 추천은 이 행을 보지 않는다.
 // ② 의 빈도에서 이 행들을 빼야 하므로 정렬보다 먼저 구한다.
 const comps=matchComps(picks.map(p=>p.hero&&p.hero.id||""),r,gcap);
 const use=sheetUse(gcap,comps);
 const tkey=x=>Math.round(x.mul*1e6);
 rank.sort((a,b)=>(tkey(b)-tkey(a))||((b.h.s?1:0)-(a.h.s?1:0))||
   ((use[b.h.id]||0)-(use[a.h.id]||0))||
   ((b.h.rar==="epic")-(a.h.rar==="epic"))||(a.h.gen-b.h.gen));

 // ── 카운터 ──
 const ev=[+document.getElementById("e1").value||0,+document.getElementById("e2").value||0,+document.getElementById("e3").value||0];
 let ctr=null;
 if(ev[0]+ev[1]+ev[2]>0){
   const en=norm(...ev),ea=[en.inf,en.lan,en.mar];
   const mine=[r.inf,r.lan,r.mar];
   // 같은 표를 랠리는 상대 방어로, 수비는 내 개리슨으로 찾아 읽는다.
   ctr=Object.assign({mode,en:ea},
     mode==="defender"?garrisonVerdict(mine,ea):sheetVerdict(ea,mine));
 }
 const comp=comps.length?comps[0]:null;
 // 칸이 다른 나머지 행 — 시트가 이 입력에 답을 둘 적어 둔 경우다. 화면이 그대로 알린다.
 const rivals=compRivals(comps);
 // 병비가 맞는 행이 없을 때만 — 리더가 같은 행을 안내한다(판정에는 안 쓴다)
 const near=comps.length?[]:nearComps(picks.map(p=>p.hero&&p.hero.id||""),gcap);
 // ── 버킷 조합 Top 5 · 규칙 레이어 · 시트 비교 (2026-11-10) ──
 // 계산 추천(#rec · #recAll)은 한 명씩 고르는 탐욕이다. 여기는 4명 조합 전수 탐색이다.
 const combos=bestJoiners(base,rank,{top:5});
 const skHeavy=!!document.getElementById("skHeavy").checked;
 const ids=picks.map(p=>p.hero&&p.hero.id||"");
 // 규칙 칩(joinerRules)은 render 가 낸다 — 화면의 시트 조합·계산 추천이 정해진 뒤라야 겹침을 볼 수 있어서다.
 render({mode,leaders,picks,r,buck,src,cls,leaderOnly,unknown,offs,base,s0:s0.s,wg,wstat,wmul,wDmg,wSur,rank,ctr,gcap,comp,rivals,comps,near,combos,skHeavy,ids});
}
