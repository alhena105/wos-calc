/* =============================================================================
   gear-engine.js — 홍색 장비 업그레이드 순서 계산. 순수 함수만 있다.
   -----------------------------------------------------------------------------
   DOM 을 만지지 않는다. 숫자는 전부 gear-data.js 에서 읽는다 — 여기에 상수를
   하드코딩하면 패치가 왔을 때 고칠 자리가 둘로 갈라진다.
   정답지는 test/gear-unit.mjs 다. 알고리즘을 바꾸면 그 픽스처가 그대로 통과해야 한다.
============================================================================= */

/* 마일스톤 하나의 값.
   원정이면 그 방향(공/방)이 이 병종에게 필요한 축인지로 가중한다 — GEAR_AXIS.
   탐험이면 아레나 가중만 붙는다.
   가중 0 이면 미스릴만 내고 얻는 게 없다 = 통행료. 탐험이든 원정이든 취급이 같다. */
function gearAtoms(troop,side,level,arenaWeight,axis){
 const A=axis||GEAR_AXIS;
 return GEAR_MS.filter(m=>m.level>level).map(m=>{
  const dir=m[side], exp=m.tier==="expedition";
  const w=exp?((A[troop]||{})[dir]||0):0;
  return {level:m.level, dir, tier:m.tier, mithril:m.mithril, mastery:m.mastery,
   expedition:exp?m.bonus:0, exploration:exp?0:m.bonus,
   value:exp?w*m.bonus:arenaWeight*m.bonus, weight:w,
   grade:!exp?"arena":w>=1?"need":w>0?"sub":"toll"};
 });
}

/* 청크 자르기 — 누적 (미스릴, 값) 점들의 위쪽 오목 껍질.
   껍질의 각 구간은 효율이 단조 감소하므로, 효율 내림차순 그리디가 모든 예산 지점에서
   최적이라는 성질이 그대로 유지된다(교환 논증). 값 0 짜리 마일스톤은 그다음 값 있는
   마일스톤에 자동으로 흡수되고, 뒤에 값이 하나도 안 남으면 그 꼬리는 버려진다 —
   "Lv.40 에서 멈춤"이 선택지로 나올 수 없다.
   모든 방향의 가중이 1이면 이 껍질은 예전의 "탐험+다음 원정" 자르기와 정확히 같아진다.
   ⚠️ 값이 하나도 안 남은 꼬리는 여기서 빼지만 계획에서 지우지는 않는다 — gearPlan 이
      효율 0 짜리 "완성용" 청크로 맨 뒤에 붙인다. 원본 표의 회색 칸은 <b>금지</b>가 아니라
      <b>맨 마지막</b>이라는 뜻이다(번호 붙은 32칸을 다 하고 나서 하는 것). */
function gearHull(atoms){
 const cum=[]; let m=0,v=0;
 atoms.forEach(function(a){m+=a.mithril; v+=a.value; cum.push({m,v});});
 const out=[]; let bm=0,bv=0,from=0;
 while(from<cum.length){
  let best=-1,bestEff=0;
  for(let k=from;k<cum.length;k++){
   const dm=cum[k].m-bm; if(dm<=0)continue;
   const e=(cum[k].v-bv)/dm;
   if(e>bestEff+1e-12){bestEff=e;best=k;}
  }
  if(best<0)break;                       // 남은 게 전부 값 0 → 꼬리는 버린다
  out.push({from,to:best,eff:bestEff});
  bm=cum[best].m; bv=cum[best].v; from=best+1;
 }
 return out;
}

/* Lv.N 승급 = 에센스 N×essenceFactor + 신화조각 max(0, N−mythicOffset).
   from→to 는 그 사이 단계를 전부 거친다. */
function gearMasteryCost(from,to){
 let essence=0,mythic=0;
 for(let n=from+1;n<=to;n++){
  essence+=n*GEAR_MASTERY.essenceFactor;
  mythic+=Math.max(0,n-GEAR_MASTERY.mythicOffset);
 }
 return {from,to,essence,mythic};
}

/* 현재 마스터리로 갈 수 있는 홍색 레벨 상한.
   마스터리는 <b>돌파(마일스톤)</b> 에만 걸리고, 마일스톤 사이 레벨업은 XP 만 든다.
   그래서 상한은 "마지막으로 통과한 마일스톤"이 아니라 <b>못 여는 첫 마일스톤 바로 앞</b>이다 —
   M11 이면 Lv.20 은 돌파할 수 있고 Lv.40 은 못 하므로 <b>+39</b> 까지 간다(+20 이 아니다).
   게임 표기가 이걸 넘으면 경고만 띄우고 계산은 그대로 진행한다 — 우리 표보다 게임이 1차 자료다. */
function gearLevelCap(mastery){
 for(const m of GEAR_MS){if(m.mastery>mastery)return m.level-1;}
 return GEAR_MS[GEAR_MS.length-1].level;
}

/* 병종 가중 — 증원 병력에는 내 장비가 적용되지 않는다(볼트). 개리슨 장비가 실제로
   도는 건 자기 성이 직접 맞을 때뿐이라 공격 편성 쪽에 무게를 준다. */
function gearTroopWeight(troop,ratios,attackWeight){
 const a=(ratios&&ratios.attack&&ratios.attack[troop])||0;
 const d=(ratios&&ratios.defense&&ratios.defense[troop])||0;
 return attackWeight*a/100+(1-attackWeight)*d/100;
}

/* 업그레이드 순서 계산.
   input = {ratios:{attack,defense}, attackWeight, arenaPriority, mithrilPerWeek,
            gear:{병종:{슬롯:[마스터리, 홍색레벨]}}, axis?}
   axis 를 주면 GEAR_AXIS 대신 쓴다 — 역할 가중을 끄고 예전 모델과 대조할 때 쓴다.
   반환 = {steps, freeXp, totals, tiers} */
function gearPlan(input){
 const arenaWeight=GEAR_DEFAULTS.arenaWeight[input.arenaPriority]||0;
 const attackWeight=typeof input.attackWeight==="number"?input.attackWeight:GEAR_DEFAULTS.attackWeight;
 const axis=input.axis||GEAR_AXIS;
 const gear=input.gear||{};

 // ── 조각 12개 × 남은 청크 ──
 const pieces=[];
 GEAR_TROOP_ORDER.forEach((troop,ti)=>GEAR_SLOT_ORDER.forEach((slot,si)=>{
  // 항목이 아예 없는 조각은 계획에서 뺀다. 0 이 아니라 "입력이 없다"는 뜻이다 —
  // 미보유 조각까지 처음부터 올리는 계획을 내면 총액이 통째로 거짓말이 된다.
  const cell=(gear[troop]||{})[slot];
  if(!cell)return;
  const mastery=Math.round(cell[0]||0), level=Math.round(cell[1]||0);
  const side=GEAR_SLOTS[slot].side;
  const atoms=gearAtoms(troop,side,level,arenaWeight,axis);
  const hull=gearHull(atoms);
  // 값이 하나도 없는 꼬리는 "완성용" 한 덩어리로 맨 뒤에 붙인다. 효율 0 이라 다른 모든
  // 청크 뒤로 밀리고, 화면에는 별도 구간으로 뜬다 — 미스릴만 쓰고 얻는 게 없는 자리다.
  const tail=hull.length?hull[hull.length-1].to+1:0;
  if(tail<atoms.length)hull.push({from:tail,to:atoms.length-1,eff:0,leftover:true});
  const chunks=hull.map(function(seg,seq){
   const part=atoms.slice(seg.from,seg.to+1);
   const sum=function(k){return part.reduce(function(a,x){return a+x[k];},0);};
   const last=part[part.length-1];
   return {troop,slot,side,seq,ti,si,
    toLevel:last.level,
    tolls:part.filter(function(x){return x.value<=0;})
      .map(function(x){return {level:x.level,kind:x.tier==="exploration"?"arena":"axis"};}),
    gains:part.filter(function(x){return x.value>0;})
      .map(function(x){return {level:x.level,dir:x.dir,bonus:x.bonus||x.expedition||x.exploration,weight:x.weight,tier:x.tier};}),
    mithril:sum("mithril"), expedition:sum("expedition"), exploration:sum("exploration"),
    useful:part.reduce(function(a,x){return a+(x.tier==="expedition"?x.weight*x.expedition:0);},0),
    value:sum("value"), eff:seg.eff, leftover:!!seg.leftover,
    masteryReq:part.reduce(function(a,x){return Math.max(a,x.mastery);},0),
    gain:last.dir};
  });
  pieces.push({troop,slot,side,ti,si,mastery,level,chunks});
 }));

 // ── 정렬 기준 ──
 // 껍질 구간의 효율은 각 조각 안에서 단조 감소한다 → 효율 내림차순 그리디가 최적.
 const tw={}; GEAR_TROOP_ORDER.forEach(t=>{tw[t]=gearTroopWeight(t,input.ratios||{},attackWeight);});
 const isMain=c=>GEAR_SLOTS[c.slot].stat===GEAR_TROOPS[c.troop].mainStat?1:0;
 const dirFit=c=>{const role=GEAR_TROOPS[c.troop].role;
  return (role==="dps"&&c.gain==="attack")||(role==="tank"&&c.gain==="defense")?1:0;};
 const cmp=(a,b)=>(b.eff-a.eff)||(tw[b.troop]-tw[a.troop])||(isMain(b)-isMain(a))||
   (dirFit(b)-dirFit(a))||(a.ti-b.ti)||(a.si-b.si)||(a.seq-b.seq);

 // 조각마다 포인터를 두고 매번 후보 중 최선을 뽑는다. 같은 조각의 청크가 원래
 // 순서를 건너뛸 수 없으므로 seq 순서가 자동으로 지켜진다.
 const ptr=pieces.map(()=>0);
 const curMastery=pieces.map(p=>p.mastery);
 const curLevel=pieces.map(p=>p.level);
 const steps=[]; let cumMithril=0,cumExpedition=0,cumUseful=0,essence=0,mythic=0;
 for(;;){
  let best=-1;
  for(let i=0;i<pieces.length;i++){
   if(ptr[i]>=pieces[i].chunks.length)continue;
   if(best<0||cmp(pieces[i].chunks[ptr[i]],pieces[best].chunks[ptr[best]])<0)best=i;
  }
  if(best<0)break;
  const c=pieces[best].chunks[ptr[best]++];
  let masteryPre=null;
  if(curMastery[best]<c.masteryReq){
   masteryPre=gearMasteryCost(curMastery[best],c.masteryReq);
   curMastery[best]=c.masteryReq;
   essence+=masteryPre.essence; mythic+=masteryPre.mythic;
  }
  const fromLevel=curLevel[best]; curLevel[best]=c.toLevel;
  cumMithril+=c.mithril; cumExpedition+=c.expedition; cumUseful+=c.useful;
  steps.push({troop:c.troop,slot:c.slot,side:c.side,seq:c.seq,
   fromLevel,toLevel:c.toLevel,tolls:c.tolls,gains:c.gains,leftover:c.leftover,
   mithril:c.mithril,expedition:c.expedition,exploration:c.exploration,
   useful:c.useful,value:c.value,eff:c.eff,gain:c.gain,masteryPre,
   cumMithril,cumExpedition,cumUseful});
 }

 // ── 무료 XP 구간 — 다음 마일스톤 직전까지는 미스릴이 들지 않는다 ──
 const freeXp=pieces.map(p=>{
  const next=GEAR_MS.filter(m=>m.level>p.level)[0];
  if(!next)return null;
  const to=next.level-1;
  if(to<=p.level)return null;
  const band=GEAR_XP_BANDS.filter(b=>to>=b.from&&to<=b.to)[0];
  return {troop:p.troop,slot:p.slot,from:p.level,to,xpRel:band?band.rel:0,ti:p.ti,si:p.si};
 }).filter(Boolean).sort((a,b)=>(a.xpRel-b.xpRel)||((a.to-a.from)-(b.to-b.from))||(a.ti-b.ti)||(a.si-b.si))
  .map(x=>({troop:x.troop,slot:x.slot,from:x.from,to:x.to,xpRel:x.xpRel}));

 // ── 효율 구간 (절벽이 보여야 한다) ──
 const tiers=[];
 steps.forEach(s=>{
  const eff=+s.eff.toFixed(3);
  let t=tiers[tiers.length-1];
  if(!t||t.eff!==eff){t={eff,steps:0,mithril:0,expedition:0,useful:0,cumMithril:0,leftover:s.leftover};tiers.push(t);}
  t.steps++; t.mithril+=s.mithril; t.expedition+=s.expedition; t.useful+=s.useful; t.cumMithril=s.cumMithril;
 });

 // 완성용(효율 0) 구간 요약 — 미스릴만 쓰고 이 편성에 쓸모가 없는 몫이 얼마인지.
 const leftover=steps.filter(s=>s.leftover);
 const leftoverSum={steps:leftover.length,
  mithril:leftover.reduce((a,s)=>a+s.mithril,0),
  expedition:leftover.reduce((a,s)=>a+s.expedition,0),
  pieces:leftover.map(s=>({troop:s.troop,slot:s.slot,from:s.fromLevel,to:s.toLevel}))};

 const mithrilPerWeek=Math.max(0,+input.mithrilPerWeek||0);
 return {steps,freeXp,tiers,leftover:leftoverSum,
  totals:{mithril:cumMithril,expedition:cumExpedition,useful:cumUseful,essence,mythic,
   weeks:mithrilPerWeek>0?Math.ceil(cumMithril/mithrilPerWeek):null,mithrilPerWeek}};
}
