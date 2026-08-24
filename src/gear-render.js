/* =============================================================================
   gear-render.js — 장비 탭의 DOM 계층. 계산은 gear-engine.js 가 한다.
   -----------------------------------------------------------------------------
   조립 순서상 마지막 파트다 → 닫는 script·body·html 태그를 여기서 낸다.
   (주석 안이라도 닫는 script 태그를 문자 그대로 쓰면 브라우저가 거기서 스크립트를 끊는다.)
   탭 전환 핸들러도 여기 있다. render.js 의 판정 로직은 건드리지 않는다.
============================================================================= */

/* ── 상태 ──────────────────────────────────────────────────────────────
   화면에만 있는 상태다. 계산 입력은 전부 DOM 에서 읽는다. */
var GEAR_TAB = "comp";
var GEAR_ARENA = "none";
var GEAR_DONE = {};        // "병종/슬롯/seq" → true (체크박스)
var GEAR_BUDGET = null;    // 미스릴 예산 슬라이더. null = 아직 안 건드림 = 항상 전액
var GEAR_LS = "wos-calc.gear.v1";
var GEAR_CELLS = [];       // [[병종, 슬롯], ...] — 그리드 순서
GEAR_TROOP_ORDER.forEach(function(t){GEAR_SLOT_ORDER.forEach(function(s){GEAR_CELLS.push([t,s]);});});
var gid = function(pre,t,s){return pre+"_"+t+"_"+s;};
var gEl = function(id){return document.getElementById(id);};

/* ── 정적 문구 ─────────────────────────────────────────────────────────
   applyStatic() 은 편성 탭 것만 채운다. 장비 탭은 여기서 채우고,
   I18N_TABLES 에 등록해 setLang() 이 다시 부르게 한다. */
function gearStatic(){
 var set=function(id,html){var e=gEl(id); if(e)e.innerHTML=html;};
 set("tabComp",L("⚙️ 편성","⚙️ Formation")); set("tabGear",L("🛡️ 장비","🛡️ Gear"));
 set("gLbAtk",L('공격 병비 <span class="cap">(보 / 창 / 궁)</span>','Attack ratio <span class="cap">(inf / lan / mar)</span>'));
 set("gLbDef",L('수비 병비 <span class="cap">(보 / 창 / 궁)</span>','Defense ratio <span class="cap">(inf / lan / mar)</span>'));
 set("gLbAW",L("공격 가중","Attack weight"));
 set("gLbArena",L("아레나 우선도","Arena priority"));
 set("gLbWk",L("미스릴 주당 수급","Mithril per week"));
 set("gLbGrid",L("보유 장비 12조각 — M = 마스터리 · + = 홍색 레벨","Your 12 pieces — M = mastery · + = red level"));
 set("gLbBudget",L("미스릴 예산 — 지금 가진 만큼만 보기","Mithril budget — show only what you can afford"));
 set("gExport",L("JSON 내보내기","Export JSON"));
 set("gImport",L("JSON 붙여넣기","Paste JSON"));
 set("gApply",L("적용","Apply"));
 set("gClear",L("체크 초기화","Clear checkmarks"));
 var ar=gEl("gArena");
 if(ar&&ar.querySelectorAll)[].forEach.call(ar.querySelectorAll("button"),function(b){
  b.innerHTML={none:L("없음","None"),low:L("조금","Low"),high:L("높음","High")}[b.dataset.v]||"";});
 var wp=gEl("gWkPre");
 if(wp)wp.innerHTML=Object.keys(GEAR_DEFAULTS.mithrilPerWeek).map(function(k){
  return '<button type="button" class="chip" data-w="'+GEAR_DEFAULTS.mithrilPerWeek[k]+'">'+
   ({f2p:L("무과금","F2P"),dolphin:L("소과금","Dolphin"),whale:L("고래","Whale")}[k]||k)+
   " · "+GEAR_DEFAULTS.mithrilPerWeek[k]+"</button>";}).join("");
 gearMountPresets("gaPre",["ga1","ga2","ga3"]);
 gearMountPresets("gdPre",["gd1","gd2","gd3"]);
 gearGrid();
 gearHints();
}

/* 병비 프리셋 칩 — 편성 탭과 같은 이유다. 2자리 약칭을 손으로 옮기다 틀린다. */
function gearMountPresets(boxId,ids){
 var box=gEl(boxId); if(!box)return;
 box.innerHTML=GEAR_DEFAULTS.ratioPresets.map(function(p,i){
  return '<button type="button" class="chip" data-i="'+i+'">'+p.id+"</button>";}).join("");
 box.onclick=function(e){
  var b=e.target&&e.target.closest?e.target.closest(".chip"):null; if(!b)return;
  var a=GEAR_DEFAULTS.ratioPresets[+b.dataset.i].attack;
  [a.infantry,a.lancer,a.marksman].forEach(function(v,k){var el=gEl(ids[k]); if(el)el.value=v;});
  gearCalc(); gearSave();};
}

/* 슬라이더·세그먼트 옆의 근거 문구. 값이 바뀌면 다시 쓴다. */
function gearHints(){
 var aw=gearAttackWeight();
 var n=gEl("gAWn");
 if(n)n.innerHTML=L("공격 "+Math.round(aw*100)+"% / 수비 "+Math.round((1-aw)*100)+"% — <b>증원 병력에는 내 장비가 적용되지 않습니다.</b> 개리슨 장비가 실제로 도는 건 자기 성이 직접 맞을 때뿐이라 공격 쪽에 무게를 둡니다.",
   "Attack "+Math.round(aw*100)+"% / defense "+Math.round((1-aw)*100)+"% — <b>your gear does not apply to reinforcement troops.</b> Garrison gear only works when your own castle is hit, so attack is weighted higher.");
 var a=gEl("gArenaN");
 if(a)a.innerHTML=L("탐험 계열 스탯은 <b>아레나 전용</b>입니다. 랠리·개리슨 기여는 0이라 기본은 통행료로만 셉니다(가중 "+GEAR_DEFAULTS.arenaWeight[GEAR_ARENA]+").",
   "Exploration stats are <b>arena only</b>. They contribute nothing to rallies or garrison, so by default they count purely as a toll (weight "+GEAR_DEFAULTS.arenaWeight[GEAR_ARENA]+").");
}

/* ── 입력 ──────────────────────────────────────────────────────────────
   클램프는 읽을 때 항상 건다. 입력칸에 되쓰는 건 change(포커스 이탈) 때만 —
   타이핑 중에 되쓰면 "150" 을 치다가 "100" 으로 잘려서 손가락이 싸운다. */
function gearNum(id,min,max,dflt){
 var e=gEl(id); if(!e)return dflt;
 var v=(e.value===""||e.value===undefined)?dflt:+e.value;
 if(!isFinite(v))v=dflt;
 return Math.max(min,Math.min(max,Math.round(v)));
}
function gearAttackWeight(){
 var e=gEl("gAW"); var v=e?+e.value:GEAR_DEFAULTS.attackWeight;
 return isFinite(v)?Math.max(0,Math.min(1,v)):GEAR_DEFAULTS.attackWeight;
}
function gearInput(){
 var gear={};
 GEAR_TROOP_ORDER.forEach(function(t){gear[t]={};});
 GEAR_CELLS.forEach(function(c){
  gear[c[0]][c[1]]=[gearNum(gid("gm",c[0],c[1]),0,GEAR_MASTERY.max,0),
                    gearNum(gid("gl",c[0],c[1]),0,GEAR_MS[GEAR_MS.length-1].level,0)];});
 var rat=function(p){return{infantry:gearNum(p+"1",0,100,0),lancer:gearNum(p+"2",0,100,0),marksman:gearNum(p+"3",0,100,0)};};
 return {ratios:{attack:rat("ga"),defense:rat("gd")},
   attackWeight:gearAttackWeight(),arenaPriority:GEAR_ARENA,
   mithrilPerWeek:gearNum("gWk",0,999,0),gear:gear};
}

/* ── 12조각 입력 그리드 ────────────────────────────────────────────────
   병종 3행 × 슬롯 4열. 칸마다 마스터리와 홍색 레벨 두 칸. */
function gearGrid(){
 var box=gEl("gGrid"); if(!box)return;
 var keep={};
 GEAR_CELLS.forEach(function(c){
  ["gm","gl"].forEach(function(p){var e=gEl(gid(p,c[0],c[1])); if(e)keep[gid(p,c[0],c[1])]=e.value;});});
 var h='<table class="ggrid"><thead><tr><th></th>'+
  GEAR_SLOT_ORDER.map(function(s){return "<th>"+L(GEAR_SLOTS[s].ko,GEAR_SLOTS[s].en)+
    '<div class="note" style="text-transform:none;letter-spacing:0">'+
    (GEAR_SLOTS[s].side==="left"?L("좌","left"):L("우","right"))+"</div></th>";}).join("")+"</tr></thead><tbody>";
 GEAR_TROOP_ORDER.forEach(function(t){
  h+="<tr><td>"+L(GEAR_TROOPS[t].ko,GEAR_TROOPS[t].en)+
    '<div class="note" style="font-weight:400">'+
    (GEAR_TROOPS[t].role==="tank"?L("탱커","tank"):L("딜러","dps"))+"</div></td>";
  GEAR_SLOT_ORDER.forEach(function(s){
   h+='<td><div class="gcell"><input id="'+gid("gm",t,s)+'" type="number" min="0" max="'+GEAR_MASTERY.max+
     '" placeholder="M" title="'+L("마스터리","Mastery")+'"><input id="'+gid("gl",t,s)+
     '" type="number" min="0" max="'+GEAR_MS[GEAR_MS.length-1].level+'" placeholder="+" title="'+
     L("홍색 레벨","Red level")+'"></div></td>';});
  h+="</tr>";});
 box.innerHTML=h+"</tbody></table>";
 Object.keys(keep).forEach(function(k){var e=gEl(k); if(e)e.value=keep[k];});
 var cap=gEl("gGridCap");
 if(cap)cap.innerHTML=L("<b>+1 은 아직 한 번도 돌파하지 않은 상태입니다.</b> 홍색은 Lv.1 에서 시작해 Lv."+
   GEAR_MS.map(function(m){return m.level;}).join("/")+" 에서 각각 미스릴을 냅니다 — 이걸 거꾸로 알면 비용이 두 배로 틀립니다. 미보유 조각은 M·+ 를 비워 두세요.",
   "<b>'+1' means no breakthrough yet.</b> Red gear starts at Lv.1 and pays mithril at Lv."+
   GEAR_MS.map(function(m){return m.level;}).join("/")+" — getting this backwards doubles your cost estimate. Leave M and + blank for pieces you do not own.");
}

/* ── localStorage · JSON 입출력 ────────────────────────────────────────
   연맹원 상담 결과를 저장·공유해야 한다. 저장이 막힌 환경에서도 계산은 돌아야 하므로
   읽기·쓰기 전부 try 로 감싼다. */
function gearSave(){
 try{localStorage.setItem(GEAR_LS,JSON.stringify(Object.assign(gearInput(),{done:GEAR_DONE})));}catch(e){}
}
function gearApply(d){
 if(!d||typeof d!=="object")return false;
 var put=function(id,v){var e=gEl(id); if(e&&v!==undefined&&v!==null)e.value=v;};
 if(d.gear)GEAR_CELLS.forEach(function(c){
  var cell=(d.gear[c[0]]||{})[c[1]];
  if(cell){put(gid("gm",c[0],c[1]),cell[0]); put(gid("gl",c[0],c[1]),cell[1]);}});
 if(d.ratios&&d.ratios.attack){put("ga1",d.ratios.attack.infantry);put("ga2",d.ratios.attack.lancer);put("ga3",d.ratios.attack.marksman);}
 if(d.ratios&&d.ratios.defense){put("gd1",d.ratios.defense.infantry);put("gd2",d.ratios.defense.lancer);put("gd3",d.ratios.defense.marksman);}
 if(typeof d.attackWeight==="number")put("gAW",d.attackWeight);
 if(typeof d.mithrilPerWeek==="number")put("gWk",d.mithrilPerWeek);
 if(d.arenaPriority&&GEAR_DEFAULTS.arenaWeight[d.arenaPriority]!==undefined)gearSetArena(d.arenaPriority);
 if(d.done&&typeof d.done==="object")GEAR_DONE=d.done;
 return true;
}
function gearSetArena(v){
 GEAR_ARENA=v;
 var ar=gEl("gArena");
 if(ar&&ar.querySelectorAll)[].forEach.call(ar.querySelectorAll("button"),function(b){
  b.classList.toggle("on",b.dataset.v===v);});
 gearHints();
}

/* ── 탭 ────────────────────────────────────────────────────────────────
   ?tab=gear 로 딥링크된다. 기본은 comp. */
function gearShowTab(t){
 GEAR_TAB=t==="gear"?"gear":"comp";
 var c=gEl("tab-comp"),g=gEl("tab-gear");
 if(c)c.hidden=GEAR_TAB!=="comp";
 if(g)g.hidden=GEAR_TAB!=="gear";
 ["tabComp","tabGear"].forEach(function(id,i){
  var b=gEl(id); if(b)b.classList.toggle("on",(i===0)===(GEAR_TAB==="comp"));});
 try{var u=new URL(location.href);
  if(GEAR_TAB==="gear")u.searchParams.set("tab","gear"); else u.searchParams.delete("tab");
  history.replaceState(null,"",u);}catch(e){}
 if(GEAR_TAB==="gear")gearCalc();
}

/* ── 계산 + 렌더 ───────────────────────────────────────────────────────
   편성 탭과 같은 방식이다. 부분 갱신 없이 통째로 다시 그린다. */
function gearCalc(){
 var input=gearInput();
 var plan=gearPlan(input);
 gearWarnLevels(input);
 gearRender(plan,input);
}

/* 게임 표기가 마스터리 상한을 넘으면 경고만 하고 계산은 진행한다.
   우리 표보다 게임 쪽이 1차 자료다. */
function gearWarnLevels(input){
 var over=[];
 GEAR_CELLS.forEach(function(c){
  var cell=input.gear[c[0]][c[1]], cap=gearLevelCap(cell[0]);
  var e=gEl(gid("gl",c[0],c[1]));
  var bad=cell[1]>cap;
  if(e&&e.classList)e.classList.toggle("over",bad);
  if(bad)over.push(L(GEAR_TROOPS[c[0]].ko+" "+GEAR_SLOTS[c[1]].ko,GEAR_TROOPS[c[0]].en+" "+GEAR_SLOTS[c[1]].en)+
    " +"+cell[1]+" > M"+cell[0]+L(" 상한 +"," cap +")+cap);});
 var w=gEl("gGridWarn");
 if(w)w.innerHTML=over.length?L("⚠️ 마스터리로 열 수 있는 상한을 넘는 입력이 있습니다: ",
   "⚠️ Some levels exceed what that mastery can unlock: ")+over.join(" · ")+
   L(" — 게임 표기를 믿고 그대로 계산합니다. 오타가 아닌지만 확인하세요."," — calculated as entered; just check it is not a typo."):"";
}

function gearRender(plan,input){
 var top=gEl("gOutTop"), bot=gEl("gOutBot");
 var T=plan.totals;
 var pieceName=function(t,s){return L(GEAR_TROOPS[t].ko+" "+GEAR_SLOTS[s].ko,GEAR_TROOPS[t].en+" "+GEAR_SLOTS[s].en);};
 var sideName=function(x){return x==="left"?L("좌","Left"):L("우","Right");};
 var gainName=function(x){return x==="attack"?L("공격","Attack"):L("방어","Defense");};
 var key=function(s){return s.troop+"/"+s.slot+"/"+s.seq;};

 // 예산 슬라이더 — 총액이 바뀌면 범위를 다시 잡는다
 // GEAR_BUDGET 은 사용자가 슬라이더를 실제로 움직였을 때만 값이 들어간다.
 // 여기서 총액으로 덮어쓰면 안 된다 — 조각 레벨을 잠깐 올렸다 내리는 사이 총액이 줄었을 때
 // 예산이 그 값에 눌러앉아, 총액이 회복돼도 스텝이 계속 감춰진다(Orca 브라우저에서 잡혔다).
 var budget=GEAR_BUDGET===null?T.mithril:Math.min(GEAR_BUDGET,T.mithril);
 var bud=gEl("gBudget");
 if(bud){
  bud.max=String(T.mithril);
  bud.step="10";   // 총액에 비례한 눈금은 값이 엉뚱하게 스냅된다. 미스릴은 10 단위면 충분하다.
  bud.value=String(budget);
 }
 var shown=plan.steps.filter(function(s){return s.cumMithril<=budget;});
 var bn=gEl("gBudgetN");
 if(bn)bn.innerHTML=L("미스릴 <b>"+budget+"</b> 안에서 실행 가능한 <b>"+shown.length+"</b>스텝 / 전체 "+
   plan.steps.length+"스텝 · 원정 +"+(shown.length?shown[shown.length-1].cumExpedition:0)+"%p",
   "<b>"+shown.length+"</b> of "+plan.steps.length+" steps fit in <b>"+budget+
   "</b> mithril · expedition +"+(shown.length?shown[shown.length-1].cumExpedition:0)+"%p");

 var doneSteps=plan.steps.filter(function(s){return GEAR_DONE[key(s)];});
 var doneM=doneSteps.reduce(function(a,s){return a+s.mithril;},0);
 var doneE=doneSteps.reduce(function(a,s){return a+s.expedition;},0);

 // ── ① 요약 타일 ──
 var o='<h2>'+L("① 총 비용","① Total cost")+' <span>'+
   L("남은 진행 전체","the whole remaining climb")+'</span></h2><div class="panel"><div class="tiles">'+
  '<div><span>'+L("미스릴","Mithril")+'</span><b>'+T.mithril+"</b>"+
   (doneSteps.length?'<div class="note">'+L("체크 완료 ","done ")+doneM+" ("+
     (T.mithril?Math.round(doneM/T.mithril*100):0)+"%)</div>":"")+"</div>"+
  '<div><span>'+L("원정 획득","Expedition gain")+'</span><b>+'+T.expedition+"%p</b>"+
   (doneSteps.length?'<div class="note">'+L("체크 완료 +","done +")+doneE+"%p</div>":"")+"</div>"+
  '<div class="bn"><span>'+L("신화 조각","Mythic shards")+'</span><b>'+T.mythic+"</b>"+
   '<div class="note">'+L("상자 100개당 1개 — 미스릴보다 먼저 마릅니다","~1 per 100 boxes — runs dry before mithril")+"</div></div>"+
  '<div><span>'+L("에센스 스톤","Essence stones")+'</span><b>'+T.essence+"</b></div>"+
  '<div><span>'+L("소요 기간","Time needed")+'</span><b>'+
   (T.weeks===null?"—":L(T.weeks+"주",T.weeks+"w"))+"</b>"+
   '<div class="note">'+L("주당 "+T.mithrilPerWeek+" 기준","at "+T.mithrilPerWeek+" per week")+"</div></div>"+
  "</div>"+
  (doneSteps.length?'<div class="bar" style="margin-top:12px"><i style="width:'+
    (T.mithril?Math.round(doneM/T.mithril*100):0)+'%"></i></div>':"")+"</div>";

 // ── ② 0단계 · 미스릴 0 ── (대개 여기가 가장 큰 즉시 이득이라 맨 위다)
 o+='<h2>'+L("② 0단계 · 미스릴 0","② Step zero · no mithril")+' <span>'+
   L("지금 바로 되는 것","free right now")+'</span></h2><div class="panel">'+
   '<p class="cap">'+L("다음 마일스톤 <b>직전</b>까지는 XP 만 들고 미스릴이 들지 않습니다. 미스릴을 한 톨도 쓰지 않고 능력부여 직전까지 올려둘 수 있는 구간입니다.",
     "Up to <b>one level below</b> the next milestone costs only XP, no mithril. You can park every piece right at the edge of its next empowerment for free.")+"</p>";
 if(!plan.freeXp.length){
  o+='<p class="note">'+L("무료로 올릴 구간이 없습니다 — 모든 조각이 이미 마일스톤 직전이거나 완성입니다.",
    "Nothing to raise for free — every piece is already at a milestone edge or finished.")+"</p>";
 }else{
  o+='<table><thead><tr><th>'+L("조각","Piece")+'</th><th>'+L("현재","Now")+'</th><th>'+L("무료로 도달","Free up to")+
   '</th><th>'+L("XP 상대 단가","Relative XP cost")+"</th></tr></thead><tbody>"+
   plan.freeXp.map(function(f){return "<tr><td class=\"b\">"+esc(pieceName(f.troop,f.slot))+
     "</td><td>+"+f.from+'</td><td class="big">+'+f.to+"</td><td>×"+f.xpRel.toFixed(1)+"</td></tr>";}).join("")+
   "</tbody></table>"+
   '<p class="note">'+L("싼 구간부터 적었습니다. 상대 단가는 <b>금장비 곡선 근사</b>라 순서 판단에만 쓰세요 — 홍색 전용 XP 표는 원자료에 없습니다.",
     "Cheapest bands first. The relative cost approximates the gold-gear curve, so use it for ordering only — no red-gear XP table exists in the source.")+"</p>";
 }
 o+="</div>";

 // ── ③ 효율 구간 ── (절벽이 눈에 보여야 한다)
 o+='<h2>'+L("③ 효율 구간","③ Efficiency tiers")+' <span>'+
   L("어디서 값이 뚝 떨어지는가","where the cliff is")+'</span></h2><div class="panel">';
 if(!plan.tiers.length){
  o+='<p class="note">'+L("올릴 것이 없습니다.","Nothing left to upgrade.")+"</p>";
 }else{
  o+='<table><thead><tr><th>'+L("효율","Efficiency")+'</th><th>'+L("스텝","Steps")+'</th><th>'+
   L("미스릴","Mithril")+'</th><th>'+L("원정 획득","Expedition")+'</th><th>'+L("누적 미스릴","Cumulative")+
   "</th></tr></thead><tbody>"+
   plan.tiers.map(function(t,i){
    var prev=i?plan.tiers[i-1].eff:null;
    var drop=prev?Math.round((1-t.eff/prev)*100):0;
    return "<tr"+(i===0?' class="hi"':"")+'><td class="big">'+t.eff.toFixed(3)+
      (drop>=25?'<div class="tag t-bad">'+L("−"+drop+"%","−"+drop+"%")+"</div>":"")+
      "</td><td>"+t.steps+"</td><td>"+t.mithril+"</td><td>+"+t.expedition+"%p</td><td>"+t.cumMithril+"</td></tr>";}).join("")+
   "</tbody></table>"+
   '<p class="cap">'+L("효율 = (원정 보너스 + 아레나 가중 × 탐험 보너스) ÷ 미스릴. 청크 효율은 각 조각 안에서 <b>단조 감소</b>하므로, 효율 내림차순으로 사는 것이 <b>모든 예산 지점에서</b> 최적입니다 — 휴리스틱이 아니라 교환 논증으로 증명되는 성질입니다.",
     "Efficiency = (expedition bonus + arena weight × exploration bonus) ÷ mithril. Chunk efficiency <b>decreases monotonically</b> within each piece, so buying in descending order of efficiency is optimal <b>at every budget point</b> — this is an exchange argument, not a heuristic.")+"</p>";
 }
 o+="</div>";
 if(top)top.innerHTML=o;

 // ── ④ 업그레이드 순서 ──
 var b='<h2>'+L("④ 업그레이드 순서","④ Upgrade order")+' <span>'+
   (shown.length<plan.steps.length?L("예산 안 "+shown.length+"스텝만 표시","budget shows "+shown.length+" steps"):
    L(plan.steps.length+"스텝",plan.steps.length+" steps"))+'</span></h2><div class="panel">';
 if(!plan.steps.length){
  b+='<p class="note">'+L("모든 조각이 Lv."+GEAR_MS[GEAR_MS.length-1].level+" 입니다. 남은 업그레이드가 없습니다.",
    "Every piece is at Lv."+GEAR_MS[GEAR_MS.length-1].level+". Nothing left.")+"</p>";
 }else{
  b+='<table id="gSteps"><thead><tr><th>#</th><th></th><th>'+L("조각","Piece")+'</th><th>'+L("좌우","Side")+
   '</th><th>'+L("작업","Work")+'</th><th>'+L("원정","Expedition")+'</th><th>'+L("효율","Eff")+'</th><th>'+
   L("미스릴","Mithril")+'</th><th>'+L("누적","Cumulative")+'</th><th>'+L("마스터리 선행","Mastery first")+
   "</th></tr></thead><tbody>"+
   shown.map(function(s,i){
    var k=key(s), done=!!GEAR_DONE[k];
    // 통행료를 지나는 스텝은 왜 미스릴이 더 드는지가 표기로 드러나야 한다
    var work="Lv."+s.fromLevel+" → "+
      s.tolls.map(function(t){return "Lv."+t+"("+L("탐험","exploration")+") → ";}).join("")+
      "Lv."+s.toLevel;
    return "<tr"+(done?' class="done"':"")+"><td>"+(i+1)+
     '</td><td><input type="checkbox" class="gchk" data-k="'+k+'"'+(done?" checked":"")+"></td>"+
     '<td class="b">'+esc(pieceName(s.troop,s.slot))+"</td>"+
     "<td>"+sideName(s.side)+'<div class="note">'+gainName(s.gain)+"</div></td>"+
     "<td>"+work+(s.tolls.length?'<div class="note">'+
       L("탐험 마일스톤은 아레나 전용이라 실전 기여 0 — 지나가는 값입니다","exploration milestones are arena-only, so this is pure toll")+"</div>":"")+"</td>"+
     '<td class="big">+'+s.expedition+"%p</td><td>"+s.eff.toFixed(3)+"</td><td>"+s.mithril+
     "</td><td>"+s.cumMithril+"</td><td>"+(s.masteryPre?
       '<span class="tag t-warn">M'+s.masteryPre.from+"→M"+s.masteryPre.to+'</span><div class="note">'+
       L("에센스 ","essence ")+s.masteryPre.essence+L(" · 신화 "," · mythic ")+s.masteryPre.mythic+"</div>":
       '<span class="note">—</span>')+"</td></tr>";}).join("")+
   "</tbody></table>";
  if(shown.length<plan.steps.length)
   b+='<p class="note">'+L("예산을 줄여서 "+(plan.steps.length-shown.length)+"스텝을 감췄습니다. 슬라이더를 올리면 전체가 보입니다.",
     (plan.steps.length-shown.length)+" steps hidden by the budget slider. Raise it to see them all.")+"</p>";
 }
 b+="</div>";

 // ── ⑤ 좌우 사이클 참조 ──
 var exp=GEAR_MS.filter(function(m){return m.tier==="expedition";});
 var tot=function(side,want){return exp.reduce(function(a,m){return a+(m[side]===want?m.bonus:0);},0);};
 b+='<h2>'+L("⑤ 좌우 사이클 참조","⑤ Left / right cycle")+' <span>'+
   L("총량은 같고 공·방 배분만 다르다","same total, different split")+'</span></h2><div class="panel"><table><thead><tr><th>'+
   L("원정 마일스톤","Expedition milestone")+'</th><th>'+L("좌 (헬멧·벨트)","Left (helmet, belt)")+'</th><th>'+
   L("우 (장갑·신발)","Right (gauntlet, boots)")+'</th><th>'+L("미스릴","Mithril")+"</th></tr></thead><tbody>"+
   exp.map(function(m){return "<tr><td class=\"b\">Lv."+m.level+"</td><td>"+gainName(m.left)+
     ' <span class="big">+'+m.bonus+"%</span></td><td>"+gainName(m.right)+
     ' <span class="big">+'+m.bonus+"%</span></td><td>"+m.mithril+"</td></tr>";}).join("")+
   '<tr class="hi"><td class="b">'+L("완주 합계","Full clear")+"</td><td>"+
   L("공격","Attack")+" +"+tot("left","attack")+"% · "+L("방어","Defense")+" +"+tot("left","defense")+"%</td><td>"+
   L("공격","Attack")+" +"+tot("right","attack")+"% · "+L("방어","Defense")+" +"+tot("right","defense")+"%</td><td>"+
   exp.reduce(function(a,m){return a+m.mithril;},0)+"</td></tr>"+
   "</tbody></table>"+
   '<p class="cap">'+L("탐험 마일스톤(Lv."+GEAR_MS.filter(function(m){return m.tier==="exploration";}).map(function(m){return m.level;}).join("·")+
     ")은 아레나 전용이라 이 표에 없습니다. 미스릴은 내지만 랠리·개리슨 기여는 0입니다.",
     "Exploration milestones (Lv."+GEAR_MS.filter(function(m){return m.tier==="exploration";}).map(function(m){return m.level;}).join(", ")+
     ") are arena-only and are not in this table. They cost mithril but contribute nothing to rallies or garrison.")+"</p></div>";

 // ── ⑥ 경고 · 한계 ── (접지 않는다)
 b+='<h2>'+L("⑥ 경고 · 이 계산의 한계","⑥ Warnings and limits")+'</h2>'+
   '<div class="callout co-warn"><h3>'+L("⚠️ 되돌릴 수 없는 것","⚠️ What you cannot undo")+"</h3><ul>"+
   GEAR_WARNINGS.map(function(w){return "<li>"+esc(w)+"</li>";}).join("")+"</ul></div>"+
   '<div class="callout co-tip"><h3>'+L("📋 자료의 한계","📋 Where the data runs out")+"</h3><ul>"+
   GEAR_CAVEATS.map(function(w){return "<li>"+esc(w)+"</li>";}).join("")+"</ul></div>";
 if(bot)bot.innerHTML=b;
}

/* ── init ──────────────────────────────────────────────────────────────
   render.js 의 init 이 이미 돌아 편성 탭이 그려진 뒤에 실행된다. */
(function(){
 // 언어를 바꾸면 장비 탭도 같이 다시 그린다. I18N_TABLES 는 setLang() 이 부른다.
 if(typeof I18N_TABLES!=="undefined")I18N_TABLES.push(function(){gearStatic();gearCalc();});

 gearStatic();

 var saved=null;
 try{saved=JSON.parse(localStorage.getItem(GEAR_LS)||"null");}catch(e){}
 if(saved)gearApply(saved); else gearSetArena("none");

 var recalc=function(){gearCalc();gearSave();};

 // 입력칸은 input 만 듣는다. change 까지 듣게 하면 포커스가 빠지는 순간 한 번 더 다시
 // 그려서, "숫자를 고치고 바로 체크박스를 누르는" 동작에서 첫 클릭이 삼켜진다
 // (blur → change → 표 재생성 → 눌리려던 체크박스가 사라짐). 실제로 그렇게 잡혔다.
 var grid=gEl("gGrid");
 if(grid){
  grid.addEventListener("input",recalc);
  // 범위를 벗어난 값만 포커스를 뗄 때 되쓴다. 안 바뀌면 다시 그리지 않는다.
  grid.addEventListener("change",function(e){
   var t=e.target; if(!t||t.tagName!=="INPUT"||t.value==="")return;
   var v=+t.value; if(!isFinite(v))return;
   var c=Math.max(+t.min,Math.min(+t.max,Math.round(v)));
   if(c!==v){t.value=String(c);recalc();}});}

 ["ga1","ga2","ga3","gd1","gd2","gd3","gAW","gWk"].forEach(function(id){
  var e=gEl(id); if(!e)return;
  e.addEventListener("input",function(){gearHints();recalc();});});

 var ar=gEl("gArena");
 if(ar)ar.addEventListener("click",function(e){
  var b=e.target&&e.target.closest?e.target.closest("button"):null;
  if(!b||!b.dataset.v)return; gearSetArena(b.dataset.v); recalc();});

 var wp=gEl("gWkPre");
 if(wp)wp.addEventListener("click",function(e){
  var b=e.target&&e.target.closest?e.target.closest(".chip"):null;
  if(!b)return; var w=gEl("gWk"); if(w)w.value=b.dataset.w; recalc();});

 var bud=gEl("gBudget");
 if(bud)bud.addEventListener("input",function(){GEAR_BUDGET=+bud.value;gearCalc();});

 var bot=gEl("gOutBot");
 if(bot)bot.addEventListener("change",function(e){
  var t=e.target;
  if(!t||!t.classList||!t.classList.contains("gchk"))return;
  if(t.checked)GEAR_DONE[t.dataset.k]=true; else delete GEAR_DONE[t.dataset.k];
  gearCalc(); gearSave();});

 var msg=function(s){var m=gEl("gIoMsg"); if(m)m.textContent=s;};
 var ex=gEl("gExport");
 if(ex)ex.onclick=function(){
  var ta=gEl("gJson"); if(!ta)return;
  ta.hidden=false; ta.value=JSON.stringify(Object.assign(gearInput(),{done:GEAR_DONE}),null,1);
  if(ta.select)ta.select();
  msg(L("복사해서 연맹원에게 보내세요.","Copy this and send it to your alliance mate."));};
 var im=gEl("gImport");
 if(im)im.onclick=function(){
  var ta=gEl("gJson"); if(!ta)return;
  ta.hidden=false; ta.value="";
  if(ta.focus)ta.focus();
  msg(L("여기에 붙여넣고 [적용] 을 누르세요.","Paste it here, then hit Apply."));};
 var ap=gEl("gApply");
 if(ap)ap.onclick=function(){
  var ta=gEl("gJson"); if(!ta)return;
  var d=null;
  try{d=JSON.parse(ta.value);}catch(e){msg(L("JSON 을 읽지 못했습니다.","Could not parse that JSON."));return;}
  if(!gearApply(d)){msg(L("JSON 을 읽지 못했습니다.","Could not parse that JSON."));return;}
  ta.hidden=true; msg(L("적용했습니다.","Applied.")); recalc();};
 var cl=gEl("gClear");
 if(cl)cl.onclick=function(){GEAR_DONE={};msg(L("체크를 모두 지웠습니다.","Checkmarks cleared."));recalc();};

 ["tabComp","tabGear"].forEach(function(id,i){
  var b=gEl(id); if(b)b.onclick=function(){gearShowTab(i===0?"comp":"gear");};});

 var want="comp";
 try{if(new URLSearchParams(location.search).get("tab")==="gear")want="gear";}catch(e){}
 gearShowTab(want);
 if(want!=="gear")gearCalc();   // 숨겨져 있어도 미리 계산해 둔다
})();
</script></body></html>
