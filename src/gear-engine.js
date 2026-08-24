/* =============================================================================
   gear-engine.js — 홍색 장비 업그레이드 순서 계산. 순수 함수만 있다.
   -----------------------------------------------------------------------------
   DOM 을 만지지 않는다. 숫자는 전부 gear-data.js 에서 읽는다 — 여기에 상수를
   하드코딩하면 패치가 왔을 때 고칠 자리가 둘로 갈라진다.
   정답지는 test/gear-unit.mjs 다. 알고리즘을 바꾸면 그 픽스처가 그대로 통과해야 한다.
============================================================================= */

/* 청크 = (지나가야 하는 탐험 통행료 마일스톤) + 그 뒤 첫 원정 마일스톤.
   탐험만 남는 꼬리는 의도적으로 버린다. Lv.40·80 은 아레나 전용이라 랠리·개리슨
   기여가 0이고, 단독으로 살 이유가 없다. 이렇게 잘라야 "Lv.40 에서 멈춤" 이라는
   선택지가 구조적으로 나오지 않는다. */
function gearChunksFor(level){
 const rest=GEAR_MS.filter(m=>m.level>level);
 const out=[]; let buf=[];
 for(const m of rest){buf.push(m); if(m.tier==="expedition"){out.push(buf);buf=[];}}
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

/* 현재 마스터리로 열 수 있는 홍색 레벨 상한. 게임 표기가 이걸 넘으면 경고만 띄우고
   계산은 그대로 진행한다 — 우리 표보다 게임 쪽이 1차 자료다. */
function gearLevelCap(mastery){
 let cap=0;
 for(const m of GEAR_MS){if(m.mastery>mastery)return cap; cap=m.level;}
 return cap;
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
            gear:{병종:{슬롯:[마스터리, 홍색레벨]}}}
   반환 = {steps, freeXp, totals, tiers} */
function gearPlan(input){
 const arenaWeight=GEAR_DEFAULTS.arenaWeight[input.arenaPriority]||0;
 const attackWeight=typeof input.attackWeight==="number"?input.attackWeight:GEAR_DEFAULTS.attackWeight;
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
  const chunks=gearChunksFor(level).map((ms,seq)=>{
   const expl=ms.filter(m=>m.tier==="exploration");
   const expedition=ms.filter(m=>m.tier==="expedition").reduce((a,m)=>a+m.bonus,0);
   const exploration=expl.reduce((a,m)=>a+m.bonus,0);
   const mithril=ms.reduce((a,m)=>a+m.mithril,0);
   const value=expedition+arenaWeight*exploration;
   const last=ms[ms.length-1];        // 구성상 항상 원정 마일스톤이다
   return {troop,slot,side,seq,ti,si,
    toLevel:last.level, tolls:expl.map(m=>m.level),
    mithril,expedition,exploration,value, eff:value/mithril,
    masteryReq:ms.reduce((a,m)=>Math.max(a,m.mastery),0),
    gain:last[side]};
  });
  pieces.push({troop,slot,side,ti,si,mastery,level,chunks});
 }));

 // ── 정렬 기준 ──
 // 청크 효율은 각 조각 안에서 단조 감소하므로, 효율 내림차순 그리디가 모든 예산
 // 지점에서 누적 보너스를 최대화한다(교환 논증). 다른 정렬을 시도하지 말 것.
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
 const steps=[]; let cumMithril=0,cumExpedition=0,essence=0,mythic=0;
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
  cumMithril+=c.mithril; cumExpedition+=c.expedition;
  steps.push({troop:c.troop,slot:c.slot,side:c.side,seq:c.seq,
   fromLevel,toLevel:c.toLevel,tolls:c.tolls,
   mithril:c.mithril,expedition:c.expedition,exploration:c.exploration,
   value:c.value,eff:c.eff,gain:c.gain,masteryPre,cumMithril,cumExpedition});
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
  if(!t||t.eff!==eff){t={eff,steps:0,mithril:0,expedition:0,cumMithril:0};tiers.push(t);}
  t.steps++; t.mithril+=s.mithril; t.expedition+=s.expedition; t.cumMithril=s.cumMithril;
 });

 const mithrilPerWeek=Math.max(0,+input.mithrilPerWeek||0);
 return {steps,freeXp,tiers,
  totals:{mithril:cumMithril,expedition:cumExpedition,essence,mythic,
   weeks:mithrilPerWeek>0?Math.ceil(cumMithril/mithrilPerWeek):null,mithrilPerWeek}};
}
