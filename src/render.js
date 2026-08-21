const esc=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
const sTag=s=>'<span class="slot s-'+(["A","B","E","F","G","C","D"].includes(s)?s:"X")+'">'+s+'</span>';
const statKr=i18nFill({},function(){return{Attack:L("공격력","Attack"),Defense:L("방어력","Defense"),Lethality:L("파괴력","Lethality"),Health:L("체력","Health")};});

function render(d){
 const {mode,leaders,picks,r,buck,src,cls,wg,wstat,wmul,wDmg,wSur,rank,ctr,gcap}=d;
 let o="";
 const modeKr=mode==="rally"?L("공성(랠리)","Rally (offense)"):L("수성(개리슨)","Garrison (defense)");
 o+='<h2>'+L("① 리더 구성","① Leaders")+' <span>'+modeKr+L(" · 병비 "," · ratio ")+r.inf.toFixed(0)+"/"+r.lan.toFixed(0)+"/"+r.mar.toFixed(0)+'</span></h2>';
 o+='<div class="panel"><table><thead><tr><th>'+L("슬롯","Slot")+'</th><th>'+L("영웅","Hero")+'</th><th>'+L("원정 3스킬","Expedition skills")+'</th><th>'+L("전무","Gear")+'</th></tr></thead><tbody>';
 [L("보병","Infantry"),L("창병","Lancer"),L("궁병","Marksman")].forEach((c,i)=>{const p=picks[i];
  if(!p.hero){o+='<tr><td class="b">'+c+'</td><td class="note" colspan="3">'+L("미선택","not selected")+'</td></tr>';return;}
  const sk=p.hero.exp.map(e=>{
    if(e.slot==="ECO")return'<div class="note">'+esc(e.n)+L(" — 비전투"," — non-combat")+"</div>";
    if(e.slot==="X"){const[st]=tgtStat(e.tgt,r);
      return'<div'+(st==="dead"?' style="opacity:.45"':"")+">"+sTag("X")+esc(L(e.t,e.te||e.t))+
        '<span class="tag t-'+(st==="dead"?"bad":st==="weak"?"warn":"ok")+'">'+tgtName[e.tgt]+" "+tgtRatio(e.tgt,r).toFixed(0)+"%</span></div>";}
    return"<div>"+sTag(e.slot)+esc(L(e.t,e.te||e.t))+(e.also?" "+sTag(e.also.slot):"")+"</div>";}).join("");
  o+='<tr><td class="b">'+c+'</td><td class="b">'+esc(HN(p.hero))+'<div class="note">'+(LANG==="en"?"":esc(p.hero.en)+" · ")+"Gen "+p.hero.gen+"</div></td><td>"+sk+"</td><td>Lv."+p.wl+"</td></tr>";});
 o+="</tbody></table></div>";

 // 칸 진단
 o+='<h2>'+L("② SkillMod 칸 진단","② SkillMod slot diagnosis")+' <span>'+L("포화도","saturation")+'</span></h2><div class="panel"><table><thead><tr><th>'+L("칸","Slot")+'</th><th>'+L("이름","Name")+'</th><th>'+L("값","Value")+'</th><th>'+L("포화","Saturation")+'</th><th>'+L("구성","Sources")+'</th></tr></thead><tbody>';
 const used=ORDER.filter(s=>buck[s]>1);
 const empty=ORDER.filter(s=>buck[s]===1);
 used.sort((a,b)=>buck[b]-buck[a]).forEach(s=>{
  const v=buck[s],pc=Math.min(100,(v-1)/0.9*100),sat=v>=1.6?L("포화","saturated"):v>=1.4?L("주의","filling"):L("여유","room");
  o+='<tr'+(v>=1.6?' class="hi"':"")+"><td>"+sTag(s)+'</td><td>'+SLOTS[s].n+'<div class="note">'+(SLOTS[s].k==="dmg"?L("딜","damage"):L("생존","survival"))+
   '</div></td><td class="big">'+v.toFixed(2)+'</td><td><span class="tag t-'+(v>=1.6?"bad":v>=1.4?"warn":"ok")+'">'+sat+
   '</span><div class="bar"><i style="width:'+pc.toFixed(0)+'%"></i></div></td><td class="note">'+src[s].map(esc).join("<br>")+"</td></tr>";});
 o+="</tbody></table>";
 if(empty.length)o+='<div class="callout co-ok"><h3>'+L("🟢 빈 칸 — 조이너 1순위 후보","🟢 Empty slots — top joiner targets")+'</h3><p>'+
   empty.map(s=>'<span class="pill">'+s+" "+SLOTS[s].n+"</span>").join("")+"</p></div>";
 o+="</div>";

 // 위젯
 o+='<h2>'+L("③ 위젯","③ Widgets")+' <span>'+(mode==="rally"?L("집결(Rally)","Rally"):L("수비(Defender)","Defender"))+L("용만 발동","-side only")+'</span></h2>'+'<div class="panel"><table><thead><tr><th>'+L("영웅","Hero")+'</th><th>'+L("위젯 스킬","Widget skill")+'</th><th>'+L("스탯","Stat")+'</th><th>'+L("방향","Side")+'</th><th>Lv</th><th>'+L("효과","Effect")+'</th></tr></thead><tbody>';
 if(!wg.length)o+='<tr><td colspan="6" class="note">'+L("전용무기 보유 영웅 없음 (에픽은 전용무기가 없습니다)","No hero with exclusive gear (epics have none)")+'</td></tr>';
 wg.forEach(x=>{o+="<tr"+(x.fire?' class="hi"':' class="dead"')+"><td class=\"b\">"+esc(HN(x.hero))+"</td><td class=\"cap\">"+esc(x.w.name)+
  "</td><td>"+statKr[x.w.stat]+"</td><td>"+(x.w.side==="rally"?L("집결","Rally"):L("수비","Defender"))+
  '</td><td>'+x.lv+'</td><td>'+(x.fire?'<span class="big">+'+x.pct+"%</span>":'<span class="tag t-bad">'+(x.lv<2?L("Lv.2 미만","below Lv.2"):L("방향 불일치 → 0","wrong side → 0"))+"</span>")+"</td></tr>";});
 o+="</tbody></table>";
 const sk=Object.keys(wstat);
 if(sk.length){
  const dup=sk.filter(s=>wg.filter(x=>x.fire&&x.w.stat===s).length>1);
  o+='<div class="callout '+(dup.length?"co-warn":"co-key")+'"><h3>'+(dup.length?L("⚠️ 스탯 중복","⚠️ Duplicate stat"):L("🔑 위젯 결과","🔑 Widget result"))+"</h3><p>"+
    sk.map(s=>statKr[s]+" <b>+"+wstat[s]+"%</b>").join(" × ")+" = <b>×"+wmul.toFixed(3)+"</b></p>"+
    '<p class="cap">'+L("딜 축(공격×파괴력) ×","Damage axis (attack×lethality) ×")+wDmg.toFixed(3)+L(" · 생존 축(방어×체력) ×"," · survival axis (defense×health) ×")+wSur.toFixed(3)+L(" · 발동 "," · active ")+wg.filter(x=>x.fire).length+" / "+wg.length+"</p>"+
    (dup.length?"<p>"+dup.map(s=>statKr[s]).join("·")+L(" 이 겹쳐 <b>합연산</b>으로 뭉칩니다. 다른 스탯 위젯으로 바꾸면 곱연산이 됩니다."," collide, so they stack <b>additively</b>. Swap one for a widget on a different stat and they multiply instead.")+"</p>":"")+"</div>";}
 o+="</div>";

 // 병종 전용
 if(cls.length){
  o+='<h2>'+L("④ 병종 전용 · 주기형 스킬 판정","④ Class-locked and periodic skills")+'</h2><div class="panel"><table><thead><tr><th>'+L("영웅","Hero")+'</th><th>'+L("스킬","Skill")+'</th><th>'+L("대상","Target")+'</th><th>'+L("현재 비중","Current share")+'</th><th>'+L("판정","Verdict")+'</th></tr></thead><tbody>';
  cls.forEach(c=>{o+="<tr"+(c.st==="dead"?' class="dead"':c.st==="ok"?' class="hi"':"")+'><td class="b">'+esc(HN(c.hero))+"</td><td>"+esc(c.e.n)+
   '<div class="note">'+esc(L(c.e.t,c.e.te||c.e.t))+"</div></td><td>"+tgtName[c.e.tgt]+"</td><td>"+c.v.toFixed(0)+
   '%</td><td><span class="tag t-'+(c.st==="dead"?"bad":c.st==="weak"?"warn":"ok")+'">'+c.lbl+"</span></td></tr>";});
  o+="</tbody></table>";
  const dead=cls.filter(c=>c.st==="dead");
  if(dead.length)o+='<div class="callout co-warn"><h3>'+L("⚠️ 죽은 스킬 ","⚠️ Dead skills: ")+dead.length+L("개","")+"</h3><p>"+
    dead.map(c=>"<b>"+esc(HN(c.hero))+" "+esc(c.e.n)+"</b> — "+tgtName[c.e.tgt]+L(" 비중 "," share ")+c.v.toFixed(0)+"%").join("<br>")+
    "</p><p>"+L("해당 병종을 늘리거나, 병종 전용 스킬이 없는 영웅으로 교체하세요.","Raise that troop type, or swap in a hero without class-locked skills.")+"</p></div>";
  o+='<div class="callout co-tip"><h3>'+L("📖 실제 병종 메커니즘 (병종 스탯 시스템 가이드)","📖 How troop counters actually work (troop stat guide)")+'</h3>'+
   L("<p><b>상성은 전용 타겟팅이 아니라 +10% 공격 보너스입니다.</b> 모든 병종이 모든 병종을 때립니다 — 궁병이 없어도 보병을 잡습니다.</p>","<p><b>The counter triangle is a +10% attack bonus, not exclusive targeting.</b> Every troop type hits every other type — you kill infantry without marksmen.</p>")+
   '<table class="hgrid"><thead><tr><th>'+L("상성","Counter")+'</th><th>'+L("스킬","Skill")+'</th><th>'+L("효과","Effect")+'</th></tr></thead><tbody>'+
   MECH.rps.map(r=>"<tr><td>"+r[0]+"</td><td>"+r[1]+"</td><td>"+r[2]+"</td></tr>").join("")+"</tbody></table>"+
   '<table class="hgrid"><thead><tr><th>'+L("T7 스킬","T7 skill")+'</th><th>'+L("효과","Effect")+'</th></tr></thead><tbody>'+
   MECH.t7.map(r=>"<tr><td>"+r[0]+"</td><td>"+r[1]+"</td></tr>").join("")+"</tbody></table>"+
   '<p class="cap">'+L('창병의 후열 침투는 <b>20% 확률</b>입니다(100% 아님). "창병이 궁병을 순삭한다"는 표현은 실제 수치보다 과장돼 있습니다.','The lancer back-line bypass is a <b>20% chance</b>, not 100%. Phrases like "their lancers delete your marksmen instantly" overstate what the numbers support.')+'</p>'+
   '<table class="hgrid"><thead><tr><th>'+L("병종","Type")+'</th><th>'+L("배치","Row")+'</th><th>'+L("공격","Atk")+'</th><th>'+L("방어","Def")+'</th><th>'+L("체력","HP")+'</th><th>'+L("치명","Leth")+'</th></tr></thead><tbody>'+
   MECH.stat.map(r=>"<tr><td>"+r[0]+"</td><td>"+r[1]+"</td><td>"+r[2]+"</td><td>"+r[3]+"</td><td>"+r[4]+"</td><td>"+r[5]+"</td></tr>").join("")+"</tbody></table>"+
   '<p class="cap">'+L("T10 기준. 사수는 공격·치명 최고 / 방어·체력 최저, 보병은 반대. 창병은 균형형.","At T10. Marksmen top attack and lethality, bottom defense and health; infantry the reverse; lancers balanced.")+'</p>'+
   "</div>";
  o+="</div>";}

 // 조이너
 o+='<h2>'+L("⑤ 조이너 한계 배율 순위","⑤ Joiner marginal multiplier ranking")+' <span>'+L("S1만 기여 · 상위 4명만 채택","only S1 counts · top 4 are taken")+(gcap<99?(LANG==="en"?' · Gen '+gcap+' and below':' · Gen '+gcap+' 이하'):'')+'</span></h2><div class="panel"><table><thead><tr><th>#</th><th>'+L("조이너","Joiner")+'</th><th>'+L("S1 스킬","S1 skill")+'</th><th>'+L("칸","Slot")+'</th><th>'+L("계산","Working")+'</th><th>'+L("배율","Multiplier")+'</th></tr></thead><tbody>';
 rank.slice(0,14).forEach((x,i)=>{
  const dmg=x.e.slot!=="X"&&SLOTS[x.e.slot]&&SLOTS[x.e.slot].k==="dmg";
  o+="<tr"+(i<4&&!x.dup?' class="hi"':x.mul<=1.001?' class="dead"':"")+"><td>"+(i+1)+'</td><td class="b">'+esc(HN(x.h))+
   (x.dup?'<span class="tag t-bad">'+L("리더 중복","already a leader")+'</span>':"")+(x.h.s?'<span class="tag t-ok">'+L("시트","sheet")+'</span>':'<span class="tag t-warn">'+L("이론","theory")+'</span>')+
   '</td><td class="cap">'+esc(L(x.e.t,x.e.te||x.e.t))+"</td><td>"+(x.e.slot==="X"?sTag("X"):sTag(x.e.slot)+(x.e.also?sTag(x.e.also.slot):""))+
   (x.cond?'<div class="note">'+x.cond.split("|")[1]+"</div>":"")+'</td><td class="note">'+x.detail.map(esc).join("<br>")+
   '</td><td class="big">×'+x.mul.toFixed(3)+'<div class="note">'+(x.e.slot==="X"?L("조건부","conditional"):dmg?L("딜","damage"):L("생존","survival"))+"</div></td></tr>";});
 o+="</tbody></table>";
 const top=rank.filter(x=>!x.dup&&x.mul>1.001).slice(0,4);
 const tSheet=rank.filter(x=>!x.dup&&x.mul>1.001&&x.h.s).slice(0,4);
 o+='<div class="callout co-key" id="rec"><h3>'+L("⭐ 추천 조이너 4명","⭐ Recommended four joiners")+'</h3><p><b>'+top.map(x=>esc(HN(x.h))).join(" · ")+
  '</b></p><p class="cap">'+L("딜 배율 ×","Damage multiplier ×")+top.filter(x=>x.e.slot!=="X"&&SLOTS[x.e.slot]&&SLOTS[x.e.slot].k==="dmg").reduce((a,x)=>a*x.mul,1).toFixed(3)+
  L(" · 리더와 겹치는 영웅은 자동 제외했습니다."," · heroes already used as leaders are excluded automatically.")+"</p>"+
  (rank.filter(x=>x.dup).length?'<p class="cap">'+L("🚫 리더 중복 금지: ","🚫 Cannot double as joiners: ")+rank.filter(x=>x.dup).map(x=>esc(HN(x.h))).join(" · ")+"</p>":"")+"</div>"+
  (top.map(x=>x.h.id).join()!==tSheet.map(x=>x.h.id).join()?
   '<div class="callout co-tip"><h3>'+L("📋 Ton 시트 등재 영웅만","📋 Sheet-listed heroes only")+'</h3><p><b>'+tSheet.map(x=>esc(HN(x.h))).join(" · ")+
   '</b></p><p class="cap">'+L('위 계산 순위에 <span class="tag t-warn">이론</span> 배지가 붙은 영웅은 실전 시트 조이너 명단에 없습니다. 대개 <b>투자 문턱</b> 때문입니다 — 전설이라 만렙 보유자가 적거나, 그 영웅을 만렙 찍은 사람은 이미 리더로 쓰고 있어 조이너로 못 뺍니다. 실전에서는 시트 쪽을 우선하세요.','Heroes tagged <span class="tag t-warn">theory</span> above are not on the sheet’s practical joiner list, usually because of the <b>investment threshold</b> — legendaries few players max, or whose owners already run them as leaders and cannot spare them as joiners. In practice, prefer the sheet.')+'</p></div>':"")+"</div>";

 // 카운터 · 밴드
 if(ctr){
  const e=ctr.en,mine=[r.inf,r.lan,r.mar],mv=ctr.mv,def=ctr.mode==="defender";
  const enLbl=def?L("들어오는 랠리","Incoming rally"):L("상대 방어","Their defense");
  const cls=mv.lvl==="ban"?"co-warn":mv.lvl==="warn"?"co-tip":"co-ok";
  const head=mv.lvl==="ban"?L("🚫 밴드 편성입니다","🚫 Banned comp"):mv.lvl==="warn"?L("⚠️ 주의 구간","⚠️ Caution zone"):L("✅ 밴드 아님","✅ Not banned");
  o+='<h2>⑥ '+(def?L("들어오는 랠리 · 수비 밴드 판정","Incoming rally · garrison ban check"):L("상대 카운터 · 랠리 밴드 판정","Counter table · rally ban check"))+'</h2><div class="panel">';
  // 1) 시트 표 룩업 (공격 전용 · 1차 자료) — ban / counter / silent / noRow 4상태
  if(!def){
   const V=ctr.verdict;
   const box={ban:["co-warn",L("🚫 시트 표: 금지 편성","🚫 Sheet: banned comp")],
               counter:["co-ok",L("✅ 시트 표: 추천 카운터","✅ Sheet: recommended counter")],
               silent:["co-tip",L("➖ 시트 표: 언급 없음 — 판단 유보","➖ Sheet: not mentioned — no verdict")],
               noRow:["co-tip",L("➖ 시트 표: 해당 행 없음 — 판단 유보","➖ Sheet: no matching row — no verdict")]}[V];
   o+='<div class="callout '+box[0]+'"><h3>'+box[1]+' <span class="tag t-ok">'+L("시트","sheet")+'</span></h3>'+
    "<p>"+L("판정 대상 — ","Evaluated — ")+enLbl+" <b>"+e.map(v=>v.toFixed(0)).join("/")+"</b> · "+L("내 랠리","my rally")+" <b>"+mine.map(v=>v.toFixed(0)).join("/")+"</b> <span class=\"cap\">"+L("(보/창/궁, 정규화 후)","(inf/lan/mar, after normalising)")+"</span></p>"+
    (ctr.exact?"<p>"+L("가이드 카운터표 <b>","Matches the guide's <b>")+esc(ctr.rule.lbl)+L("</b> 행에 해당합니다.","</b> row.")+"</p>":
      '<p class="note">'+L("가이드 카운터표에 이 상대 비율과 맞는 항목이 없습니다(가장 가까운 항목 ","The guide's counter table has no row for this enemy ratio (nearest: ")+esc(ctr.rule.lbl)+").</p>")+
    (V==="ban"?"<p>"+L("표상 <b>","The table lists <b>")+esc(ctr.banned.l)+L("</b>은 이 상대에게 <b>금지</b>입니다.","</b> as <b>banned</b> against this defense.")+"</p>":"")+
    (V==="counter"?"<p>"+L("현재 편성은 이 행의 <b>추천 카운터</b>에 해당합니다.","Your comp is one of this row's <b>recommended counters</b>.")+"</p>":"")+
    (V==="silent"?'<div class="callout co-warn"><h3>'+L('⚠️ "밴드 아님"이 아니라 "표에 없음"입니다','⚠️ This is "not in the table", not "approved"')+'</h3>'+
       "<p>"+L("현재 편성 <b>","Your comp <b>")+mine.map(v=>v.toFixed(0)).join("/")+L("</b>은 이 행의 <b>추천 카운터에도, 금지 목록에도</b> 들어 있지 않습니다. ","</b> appears in neither the recommended counters nor the ban list for this row. ")+
       L("가이드의 마지막 열은 <b>금지 목록이지 승인 목록이 아닙니다</b> — 금지에 없다고 좋은 편성이라는 뜻이 아니라, <b>시트가 이 비율을 다루지 않은 것</b>입니다.","The guide's last column is a <b>ban list, not an approval list</b> — absence from it does not mean the comp is good, only that <b>the sheet does not cover this ratio</b>.")+"</p>"+
       "<p>"+L("이 행의 추천 카운터로 바꾸거나, 아래 참고 지표를 감안해서 직접 판단하세요.","Switch to one of this row's recommended counters, or judge for yourself with the indicator below in mind.")+"</p></div>":"")+
    "<p><b>"+L("추천 카운터:","Recommended counters:")+"</b> "+ctr.rule.c.map(c=>'<span class="pill">'+esc(c)+"</span>").join("")+"</p>"+
    '<p class="cap">'+esc(ctr.rule.why)+"</p>"+
    (ctr.rule.ban.length?'<p class="cap">'+L("🚫 이 상대에게 금지: ","🚫 Banned against this defense: ")+ctr.rule.ban.map(b=>{
      const near=dist(mine,b.v)<BAND_TOL;
      return (near?"<b>":"")+esc(b.l)+" ("+b.v.join("/")+")"+(near?L(" ← 현재 편성</b>"," ← your comp</b>"):"");}).join(" · ")+"</p>":
      '<p class="cap">'+L("🚫 이 상대에겐 가이드상 금지 비율이 없습니다.","🚫 The guide lists no banned ratio against this defense.")+"</p>")+
    (ctr.rule.src==="theory"?'<p class="note">'+L("이 항목은 가이드 원본 카운터표에 없는 <b>이론 확장</b>입니다.","This row is a <b>theoretical extension</b> not present in the guide's original table.")+"</p>":"")+
    '<p class="note">'+L('이 표는 <b>랠리(공격) 전용</b>입니다 — 🚫는 "이 비율로 <b>공격하면</b> 진다"는 뜻이지 수비 얘기가 아닙니다. 수비 판정은 🛡️ 수성 모드로 바꾸세요. <b>표와 지표가 엇갈리면 표를 따르세요.</b>','This table is <b>rally-only</b> — a 🚫 means "you lose if you <b>attack</b> with this ratio", not a statement about defending. For a garrison verdict switch to 🛡️ Garrison mode. <b>If the table and the indicator disagree, follow the table.</b>')+"</p>"+
    ((V==="counter"&&mv.lvl==="ban")?'<div class="callout co-warn"><h3>'+L("⚖️ 지표와 시트가 엇갈립니다 — 시트를 따르세요","⚖️ The indicator disagrees with the sheet — follow the sheet")+'</h3>'+
       "<p>"+L("참고 지표는 밴드라고 보지만 <b>시트는 이 편성을 추천 카운터로 명시</b>합니다. 이 불일치는 <b>설명되지 않은 상태</b>입니다.","The indicator calls this a ban, but <b>the sheet explicitly lists it as a recommended counter</b>. This disagreement is <b>unexplained</b>.")+"</p>"+
       "<p>"+L('이전 버전은 "시트가 멀티랠리를 전제하니 랠리를 늘리면 지표도 통과한다"고 설명했지만, 그 설명은 <b>철회했습니다</b> — 동시 랠리는 화력이 합쳐지는 게 아니라 각 랠리가 따로 전투하므로 랠리 수를 늘려도 한 전투의 판정은 그대로입니다.','An earlier version explained it as "the sheet assumes multi-rally, so more rallies would clear the indicator too". That explanation has been <b>retracted</b> — simultaneous rallies do not pool their force; each fights separately, so adding rallies does not change the verdict for any single battle.')+"</p>"+
       "<p>"+L("<b>지표를 믿지 마세요.</b> 이건 밴드표 12점에 맞춘 곡선이고, 시트가 1차 자료입니다.","<b>Do not trust the indicator here.</b> It is a curve fitted to 12 points; the sheet is the primary source.")+"</p>"+
       "</div>":"")+
    "</div>";}
  // 2) 참고 지표 (경험 적합 · 근거 약함)
  o+='<div class="callout '+cls+'"><h3>'+head+' <span class="tag t-warn">'+L("참고 지표 · 근거 약함","indicator · weak evidence")+'</span></h3>'+
   "<p>"+enLbl+" <b>"+e.map(v=>v.toFixed(0)).join("/")+"</b> · "+(def?L("내 수비","my garrison"):L("내 랠리","my rally"))+" <b>"+mine.map(v=>v.toFixed(0)).join("/")+"</b>"+
     "</p>"+
   '<table class="hgrid"><thead><tr><th>'+L("채널","Channel")+'</th><th>'+L("값","Value")+'</th><th>'+L("밴드 임계","Ban threshold")+'</th><th>'+L("판정","Verdict")+'</th></tr></thead><tbody>'+
   mv.keys.map(k=>{const v=mv.c[k],st=v>=TH[k]?"🚫":v>=THW[k]?"⚠️":"✅";
     return "<tr><td>"+CH_NAME[k]+"</td><td class=\"ratio\">"+v.toFixed(0)+
       "</td><td>"+TH[k]+' <span class="cap">'+L("(가능 ","(feasible ")+FEAS[k][0]+"~"+FEAS[k][1]+L(" · 임계 결정 "," · pinned by ")+SUP[k].pin+L("건 · 관여 "," · appears in ")+SUP[k].hit+L("건)",")")+"</span></td><td>"+st+"</td></tr>";}).join("")+
   "</tbody></table>"+
   (mv.ban.concat(mv.warn).length?mv.ban.concat(mv.warn).map(k=>'<p class="cap">'+CH_TXT[k](mv.c,e,mine)+" <b>→ "+CH_FIX[k]+"</b></p>").join(""):
     '<p class="cap">'+L("세 채널 모두 임계값 아래입니다. 이 상대에게 쓸 만한 병비입니다.","All channels sit below threshold. This is a workable ratio against that defense.")+'</p>')+
   (mv.lvl==="ban"&&!def?'<p class="cap">'+L("🔁 <b>랠리를 여러 개 보내도 이 판정은 바뀌지 않습니다.</b> 동시 랠리는 화력이 합쳐지는 게 아니라 <b>각 랠리가 남은 개리슨과 따로 전투</b>합니다(1번 랠리 → 살아남은 개리슨이 2번 랠리와 전투 …). 멀티랠리는 편성을 고쳐주는 게 아니라 <b>소모전으로 개리슨을 깎는 것</b>입니다.","🔁 <b>Sending more rallies does not change this verdict.</b> Simultaneous rallies do not pool their force — <b>each fights the surviving garrison separately</b> (rally 1, then whatever survives fights rally 2, and so on). Multi-rally does not fix a comp; it <b>grinds the garrison down by attrition</b>.")+"</p>":"")+
   (def?'<p class="note">'+L('<b>수비는 돌파 채널을 뺍니다.</b> 제한 시간 안에 격파할 의무가 없어 "못 녹인다"가 패배 조건이 아닙니다. 그래서 같은 60/40이라도 랠리로는 밴드가 되고 수비로는 정석이 됩니다.','<b>Defense drops the anti-infantry channel.</b> A garrison is under no obligation to kill anything inside a timer, so "cannot melt them" is not a loss condition. That is why the same 60/40 is a ban as a rally and the standard as a garrison.')+"</p>":"")+
   '<div class="callout co-warn"><h3>'+L("⚠️ 이건 메커니즘 모델이 아닙니다","⚠️ This is not a mechanics model")+'</h3>'+
    "<p>"+L("세 지표는 가이드 카운터표를 <b>자유 파라미터 3개로 재현하도록 맞춘 곡선 적합</b>입니다. 게임 물리에서 유도한 값이 아닙니다. 표는 12항목(카운터 7·밴드 5)이고, 그중 좌표로 비교할 수 있는 11점(70/30 행의 카운터는 비율이 아니라 \"멀티랠리\"라는 서술입니다), 다시 멀티랠리를 전제한 카운터 2건을 뺀 <b>9점</b>에 맞췄습니다.","The three channels are a <b>curve fit</b> with 3 free parameters, not something derived from game physics. The guide's table has 12 entries (7 counters, 5 bans); 11 of them are comparable as ratios (the 70/30 row's counter is the tactic \"multi-rally\", not a ratio), and the fit used the <b>9</b> that remain after dropping the two counters the guide premises on multi-rally.")+"</p>"+
    "<p>"+L("실제 병종 스탯(공격·방어·체력·치명타)과 상성 규칙으로 전투를 시뮬레이션하면 <b>밴드표를 6/12, 즉 우연 수준밖에 못 맞춥니다.</b> 밴드표의 내용은 스탯 표에서 유도되지 않습니다 — 영웅 SkillMod(2~5배)와 실전 경험이 지배하기 때문으로 보입니다.","Simulating combat from the real troop stats (attack, defense, health, lethality) and the counter rules reproduces the ban table only <b>6 times out of 12 — chance level.</b> The table's content is not derivable from the stat sheet; hero SkillMod (2-5×) and practical experience appear to dominate.")+"</p>"+
    "<p>"+L("<b>표에 있는 상황이면 시트를 보세요.</b> 이 지표는 표에 없는 비율을 만났을 때의 참고용입니다. 가능 구간 <b>대보병 41~50 · 상성 31~40 · 후열 21~30</b>의 중앙값을 썼습니다. 세 임계값은 <b>각각 밴드 단 한 건</b>이 상한을 묶고 있습니다(임계 결정 1건) — 셋 다 취약하다는 뜻입니다. 관여 건수(대보병 1·상성 3·후열 3)는 그 채널이 몇 건을 설명하는지일 뿐 임계값의 근거가 아닙니다.","<b>If the situation is in the table, read the sheet.</b> This indicator is for ratios the table does not cover. The values are midpoints of the feasible ranges <b>anti-infantry 41-50 · counter deficit 31-40 · back-line 21-30</b>. Each threshold is pinned by <b>exactly one ban</b> — all three are fragile. The \"appears in\" counts (anti-infantry 1, counter deficit 3, back-line 3) say how many bans a channel helps explain, which is not the same as evidence for its threshold.")+"</p>"+
    "</div>"+
   "</div>";
  o+="</div>";}
 document.getElementById("out").innerHTML=o;
}

// ── 병비 프리셋 & 합계 경고 ────────────────────────────────────────────
// 2자리 표기(60/40 등)를 손으로 3칸에 옮기다 틀리는 사고가 잦다.
// 예: "60/40"을 보60·궁40으로 잘못 넣으면 창병 기본값 4가 남아 58/4/38이 된다.
const PRESETS=i18nFill([],function(){return[
 ["60/40",L("보60·창40","60 inf · 40 lancer"),60,40,0],["70/30",L("보70·창30","70 inf · 30 lancer"),70,30,0],["70/10/20",L("완전방어 Gen7~","full defense, Gen7+"),70,10,20],
 ["50/50",L("보50·궁50","50 inf · 50 mar"),50,0,50],["49/49",L("보49·창2·궁49","49 inf · 2 lan · 49 mar"),49,2,49],["48/4/48",L("보48·창4·궁48","48 inf · 4 lan · 48 mar"),48,4,48],
 ["40/60",L("초방어 보40·궁60","ultra-defense 40 inf · 60 mar"),40,0,60],["50/20/30",L("하이브리드","hybrid"),50,20,30],["40/20/40",L("하이브리드","hybrid"),40,20,40],
 ["40/40/20",L("창병 카운터","lancer counter"),40,40,20],["30/20/50",L("궁병 속결","marksman rush"),30,20,50],["60/30/10",L("방어","defense"),60,30,10]];});
function mountPresets(boxId,ids){
 const box=document.getElementById(boxId);
 box.innerHTML=PRESETS.map((p,i)=>'<button type="button" class="chip" data-i="'+i+'" title="'+p[1]+'">'+p[0]+"</button>").join("");
 box.onclick=e=>{const b=e.target.closest(".chip"); if(!b)return;
  const p=PRESETS[+b.dataset.i];
  ids.forEach((id,k)=>{const el=document.getElementById(id); el.value=p[2+k];});
  ids.forEach(id=>document.getElementById(id).dispatchEvent(new Event("input",{bubbles:true})));};
}
function showSum(sumId,ids){
 const v=ids.map(id=>+document.getElementById(id).value||0), t=v[0]+v[1]+v[2];
 const el=document.getElementById(sumId);
 if(t===0){el.textContent="";return;}
 if(t===100){el.textContent="";return;}
 const n=v.map(x=>(x/t*100).toFixed(0)).join("/");
 el.innerHTML=L("⚠️ 입력 합이 <b>"+t+"</b>입니다 → <b>"+n+"</b> 로 정규화해서 계산합니다. 의도한 비율이 맞는지 확인하세요.","⚠️ Your entries add to <b>"+t+"</b> → normalised to <b>"+n+"</b> for the calculation. Check that this is the ratio you meant.");
}
// ── 셀렉트 재구성 (언어 전환 시 재호출) ──
function rebuildSelects(){
 const keep={hInf:0,hLan:0,hMar:0,gcap:0};
 Object.keys(keep).forEach(id=>{keep[id]=document.getElementById(id).value;});
 const mk=(sel,cls)=>{const el=document.getElementById(sel);
  el.innerHTML='<option value="">'+S("pick")+"</option>"+HEROES.filter(h=>h.cls===cls)
   .sort((a,b)=>a.gen-b.gen||HN(a).localeCompare(HN(b)))
   .map(h=>'<option value="'+h.id+'">'+HN(h)+" ("+(h.gen?"Gen"+h.gen:L("에픽","Epic"))+")</option>").join("");};
 mk("hInf","infantry");mk("hLan","lancer");mk("hMar","marksman");
 document.getElementById("gcap").innerHTML='<option value="99">'+L("전체","All")+"</option>"+
  [1,2,3,4,5,6,7,8,9,10,11,12,13].map(g=>'<option value="'+g+'">'+(LANG==="en"?"Gen "+g+" and below":"Gen "+g+" 이하")+"</option>").join("");
 Object.keys(keep).forEach(id=>{if(keep[id])document.getElementById(id).value=keep[id];});
 mountPresets("rPre",["r1","r2","r3"]); mountPresets("ePre",["e1","e2","e3"]);
 showSum("rSum",["r1","r2","r3"]); showSum("eSum",["e1","e2","e3"]);
}
// ── init ──
(function(){
 rebuildSelects();
 document.getElementById("gcap").value="4";
 document.getElementById("hInf").value="jeronimo";
 document.getElementById("hLan").value="mia";
 document.getElementById("hMar").value="alonso";
 const seg=(a,b)=>{document.getElementById(a).classList.add("on");document.getElementById(b).classList.remove("on");};
 const eLab=()=>{const d=document.getElementById("mDef").classList.contains("on");
  document.getElementById("eLab").innerHTML=d?S("lbEnD"):S("lbEnA");};
 document.getElementById("mAtk").onclick=()=>{seg("mAtk","mDef");eLab();calc();};
 document.getElementById("mDef").onclick=()=>{seg("mDef","mAtk");eLab();calc();};
 document.getElementById("lgKo").onclick=()=>setLang("ko");
 document.getElementById("lgEn").onclick=()=>setLang("en");
 const sums=()=>{showSum("rSum",["r1","r2","r3"]);showSum("eSum",["e1","e2","e3"]);};
 ["hInf","hLan","hMar","wInf","wLan","wMar","r1","r2","r3","e1","e2","e3","gcap"].forEach(id=>{
  const el=document.getElementById(id);const f=()=>{sums();calc();};el.addEventListener("change",f);el.addEventListener("input",f);});
 applyStatic();
 sums();
 calc();
})();
</script></body></html>
