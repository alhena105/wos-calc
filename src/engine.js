const SLOTS=i18nFill({},function(){return{
 A:{n:L("피해량 증가","Damage bonus"),k:"dmg"},An:{n:L("일반공격 피해","Normal-attack damage"),k:"dmg"},B:{n:L("공격력 증가","Attack bonus"),k:"dmg"},
 E:{n:L("파괴력 증가","Lethality bonus"),k:"dmg"},F:{n:L("적 방어력 감소","Enemy defense down"),k:"dmg"},G:{n:L("적 받는 피해 증가","Enemy damage taken up"),k:"dmg"},
 CRIT:{n:L("치명률","Crit rate"),k:"dmg"},
 C:{n:L("체력 증가","Health bonus"),k:"sur"},D:{n:L("받는 피해 감소","Damage taken down"),k:"sur"},DEF:{n:L("방어력 증가","Defense bonus"),k:"sur"},
 H:{n:L("적 공격력 감소","Enemy attack down"),k:"sur"},I:{n:L("적 파괴력 감소","Enemy lethality down"),k:"sur"},J:{n:L("적 피해량 감소","Enemy damage down"),k:"sur"},
 DODGE:{n:L("회피","Dodge"),k:"sur"}};});
const ORDER=["A","An","B","E","F","G","CRIT","C","D","DEF","H","I","J","DODGE"];
const byId=Object.fromEntries(HEROES.map(h=>[h.id,h]));
const wpct=l=>l<2?0:5+(Math.floor(l/2)-1)*2.5;
const norm=(a,b,c)=>{const s=a+b+c;return s<=0?{inf:0,lan:0,mar:0}:{inf:a*100/s,lan:b*100/s,mar:c*100/s};};
function tgtRatio(t,r){return t==="infantry"?r.inf:t==="lancer"?r.lan:t==="marksman"?r.mar:
 t==="inf+mar"?r.inf+r.mar:t==="mar+lan"?r.mar+r.lan:100;}
// 보병은 탱커라 병력 비중 대비 딜 기여가 낮다 → 딜 계열 병종한정 스킬은 딜 지분으로 환산
const DW={infantry:.3,lancer:1,marksman:1};
function dmgShare(t,r){
 const tot=r.inf*DW.infantry+r.lan+r.mar; if(tot<=0)return 0;
 const p=t==="infantry"?r.inf*DW.infantry:t==="lancer"?r.lan:t==="marksman"?r.mar:
   t==="inf+mar"?r.inf*DW.infantry+r.mar:t==="mar+lan"?r.mar+r.lan:tot;
 return p/tot;}
const NA_SHARE=.8; // 일반공격이 총딜에서 차지하는 비중 가정
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
 const out=document.getElementById("out");
 if(leaders.length===0){out.innerHTML='<div class="callout co-tip"><p>'+S("needLeader")+'</p></div>';return;}

 // ── 칸 집계 ──
 const buck={},src={},cls=[];
 ORDER.forEach(s=>{buck[s]=1;src[s]=[];});
 leaders.forEach(({hero})=>hero.exp.forEach(e=>{
   if(e.slot==="ECO")return;
   if(e.slot==="X"){const[st,lbl,v]=tgtStat(e.tgt,r);cls.push({hero,e,st,lbl,v});return;}
   const add=(sl,val)=>{if(buck[sl]===undefined)return;buck[sl]+=val;src[sl].push(HN(hero)+" "+e.n+" +"+(val*100).toFixed(0)+"%");};
   add(e.slot,e.v); if(e.also)add(e.also.slot,e.also.v);
 }));

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
   let mul=1,detail=[],cond=null;
   if(e.slot==="X"){const[st,lbl,v]=tgtStat(e.tgt,r);cond=st+"|"+tgtName[e.tgt]+" "+v.toFixed(0)+"% ("+lbl+")";
     if(st==="dead")return{h,e,mul:1,detail:[L("병종 비중 부족 → 사망","class share too low → dead")],cond,dup:lid.has(h.id)};
     const sh=e.k==="sur"?tgtRatio(e.tgt,r)/100:dmgShare(e.tgt,r);
     mul=1+e.v*sh;detail.push(L((e.k==="sur"?"병력":"딜")+" 지분 "+(sh*100).toFixed(0)+"% 환산",(e.k==="sur"?"headcount":"damage")+" share "+(sh*100).toFixed(0)+"%"));
   }else if(e.slot==="An"){
     mul=1+e.v*NA_SHARE;detail.push(L("일반공격 비중 "+(NA_SHARE*100)+"% 가정","assumes normal attacks are "+(NA_SHARE*100)+"% of damage"));
   }else{
     const step=(sl,val)=>{const b=buck[sl];if(b===undefined)return;const m=(b+val)/b;mul*=m;
       detail.push(sl+" "+b.toFixed(2)+"→"+(b+val).toFixed(2)+" ×"+m.toFixed(3));};
     step(e.slot,e.v); if(e.also)step(e.also.slot,e.also.v);
   }
   return{h,e,mul,detail,cond,dup:lid.has(h.id)};
 }).filter(Boolean).sort((a,b)=>b.mul-a.mul);

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
 render({mode,leaders,picks,r,buck,src,cls,wg,wstat,wmul,wDmg,wSur,rank,ctr,gcap});
}
