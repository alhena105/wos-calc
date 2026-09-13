const esc=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
// 영웅 초상. 파일이 없거나 오프라인이면 스스로 사라진다 — 계산 결과에는 영향이 없다.
const hpic=(h,cls)=>'<img class="hpic'+(cls?" "+cls:"")+'" loading="lazy" alt="" src="img/heroes/'+
 encodeURIComponent(h.id)+'.webp" onerror="this.remove()">';
const sTag=s=>'<span class="slot s-'+(["A","B","E","F","G","C","D"].includes(s)?s:"X")+'">'+s+'</span>';
// 시트 행이 맞으면 그 행의 조이너 칸을 그대로 따를지 여부. 0 이면 시트를 전혀 안 본다.
// 최상위 let 인 이유 — 검사가 0 으로 끄고 **순수 모델**의 시트 재현율을 따로 재야 하기 때문이다.
// 시트를 따른 상태에서 재는 재현율은 순환논이라 검증이 아니다.
// 이름은 예전 "여유폭 2%" 시절의 잔재다 — 지금은 **켜고/끄고** 스위치로만 쓴다.
let SHEET_EDGE=1;
const statKr=i18nFill({},function(){return{Attack:L("공격력","Attack"),Defense:L("방어력","Defense"),Lethality:L("파괴력","Lethality"),Health:L("체력","Health")};});

function render(d){
 const {mode,leaders,picks,r,buck,src,cls,hits,hitMul,wg,wstat,wmul,wDmg,wSur,rank,ctr,gcap,comp,rivals}=d;
 let o="";
 const modeKr=mode==="rally"?L("공성(랠리)","Rally (offense)"):L("수성(개리슨)","Garrison (defense)");
 o+='<h2>'+L("① 리더 구성","① Leaders")+' <span>'+modeKr+L(" · 병비 "," · ratio ")+r.inf.toFixed(0)+"/"+r.lan.toFixed(0)+"/"+r.mar.toFixed(0)+'</span></h2>';
 o+='<div class="panel"><div class="xscroll"><table><thead><tr><th>'+L("슬롯","Slot")+'</th><th>'+L("영웅","Hero")+'</th><th>'+L("원정 3스킬","Expedition skills")+'</th><th>'+L("전무","Gear")+'</th></tr></thead><tbody>';
 [L("보병","Infantry"),L("창병","Lancer"),L("궁병","Marksman")].forEach((c,i)=>{const p=picks[i];
  if(!p.hero){o+='<tr><td class="b">'+c+'</td><td class="note" colspan="3">'+L("미선택","not selected")+'</td></tr>';return;}
  const sk=p.hero.exp.map(e=>{
    if(e.slot==="ECO")return'<div class="note">'+esc(e.n)+L(" — 비전투"," — non-combat")+"</div>";
    if(e.slot==="X"){const[st]=tgtStat(e.tgt,r);
      return'<div'+(st==="dead"?' style="opacity:.45"':"")+">"+sTag("X")+esc(L(e.t,e.te||e.t))+
        '<span class="tag t-'+(st==="dead"?"bad":st==="weak"?"warn":"ok")+'">'+tgtName[e.tgt]+" "+tgtRatio(e.tgt,r).toFixed(0)+"%</span></div>";}
    return"<div>"+sTag(e.slot)+esc(L(e.t,e.te||e.t))+(e.also?" "+sTag(e.also.slot):"")+"</div>";}).join("");
  o+='<tr><td class="b">'+c+'</td><td class="b"><span class="hrow">'+hpic(p.hero,"lg")+"<span>"+esc(HN(p.hero))+"</span></span>"+'<div class="note">'+(LANG==="en"?"":esc(p.hero.en)+" · ")+"Gen "+p.hero.gen+"</div></td><td>"+sk+"</td><td>Lv."+p.wl+"</td></tr>";});
 o+="</tbody></table></div></div>";

 // Gen 10+ 서버에서 창병이 0 면 창병 T12 가 아예 안 켜진다.
 // 근거는 Ton 시트 "Gen 10+" 탭 머리의 T12 CHANGES 줄 하나다 — 임계값을
 // 지어내지 않고 "창병이 0 인가" 만 본다. 시트의 48/4/48 · 40/2/58 · 50/2/48 이
 // 창병을 조금씩 끼워 둔 이유가 이것이다.
 if(gcap>=10&&r.lan===0&&r.inf+r.mar>0)
  o+='<div class="callout co-warn"><h3>'+L("⚠️ 창병 0 — 창병 T12 스킬 미발동","⚠️ No lancers — lancer T12 skills never fire")+'</h3><p>'+
   L("Gen 10 이상 서버에서는 궁병 위주 편성이라도 <b>창병을 조금은 반드시 넣으라</b>고 시트가 적어 두었습니다. 시트의 궁병 편성이 <b>48/4/48 · 40/2/58 · 50/2/48</b> 처럼 창병을 조금씩 끼우는 이유가 이것입니다.",
     "From Gen 10 on, the sheet says to keep <b>at least a sliver of lancers</b> even in marksman comps. That is why its marksman ratios read <b>48/4/48, 40/2/58, 50/2/48</b> rather than dropping lancers entirely.")+
   '</p><p class="cap">'+L("근거: Ton 시트 “Gen 10+” 탭 — T12 CHANGES. 서버 최대 세대를 Gen 9 이하로 내리면 이 경고는 사라집니다.",
     "Source: the Ton sheet, “Gen 10+” tab, T12 CHANGES. Set the server generation cap to 9 or below and this warning goes away.")+"</p></div>";

 // 칸 진단
 o+='<h2>'+L("② SkillMod 칸 진단","② SkillMod slot diagnosis")+' <span>'+L("포화도","saturation")+'</span></h2><div class="panel"><div class="xscroll"><table><thead><tr><th>'+L("칸","Slot")+'</th><th>'+L("이름","Name")+'</th><th>'+L("값","Value")+'</th><th>'+L("포화","Saturation")+'</th><th>'+L("구성","Sources")+'</th></tr></thead><tbody>';
 const used=ORDER.filter(s=>buck[s]>1);
 const empty=ORDER.filter(s=>buck[s]===1);
 used.sort((a,b)=>buck[b]-buck[a]).forEach(s=>{
  const v=buck[s],pc=Math.min(100,(v-1)/0.9*100),sat=v>=1.6?L("포화","saturated"):v>=1.4?L("주의","filling"):L("여유","room");
  o+='<tr'+(v>=1.6?' class="hi"':"")+"><td>"+sTag(s)+'</td><td>'+SLOTS[s].n+'<div class="note">'+(SLOTS[s].k==="dmg"?L("딜","damage"):L("생존","survival"))+
   '</div></td><td class="big">'+v.toFixed(2)+'</td><td><span class="tag t-'+(v>=1.6?"bad":v>=1.4?"warn":"ok")+'">'+sat+
   '</span><div class="bar"><i style="width:'+pc.toFixed(0)+'%"></i></div></td><td class="note">'+src[s].map(esc).join("<br>")+"</td></tr>";});
 o+="</tbody></table></div>";
 if(empty.length)o+='<div class="callout co-ok"><h3>'+L("🟢 빈 칸 — 조이너 1순위 후보","🟢 Empty slots — top joiner targets")+'</h3><p>'+
   empty.map(s=>'<span class="pill">'+s+" "+SLOTS[s].n+"</span>").join("")+"</p></div>";
 // AH(타격 계열)는 칸이 아니라 위 표에 안 나온다. 안 보이면 "왜 이 스킬이 표에 없나" 가 되므로
 // 따로 적고, 칸이 아닌 이유까지 같이 둔다 — 이게 A칸 포화와 갈리는 자리다.
 if(hits.length)o+='<div class="callout co-tip"><h3>'+L("🎯 타격 계열 — 칸이 아닙니다","🎯 Hit-type skills — not a slot")+'</h3><p>'+
   hits.map(x=>'<span class="pill">'+sTag("AH")+esc(HN(x.hero))+" "+esc(x.e.n)+" ×"+(1+x.v).toFixed(3)+"</span>").join("")+
   '</p><p>'+L("합쳐서 <b>×"+hitMul.toFixed(3)+"</b> 입니다. 원문이 <b>extra damage · extra attack · N% damage</b> 처럼 <b>타격에 붙는</b> 것은 피해량(Damage Dealt) 스탯이 아니라 다른 기전이고, 어느 칸인지 <b>자료가 없습니다</b>. 그래서 A칸에 합산하지 않고 각자 곱합니다 — <b>포화를 겪지 않습니다</b>.",
     "Together <b>×"+hitMul.toFixed(3)+"</b>. When the source text reads <b>extra damage, extra attack or N% damage</b>, it rides on a hit rather than raising the Damage Dealt stat, and <b>we have no source</b> for which slot it would occupy. So these never enter the A slot — each multiplies on its own and <b>never saturates</b>.")+
   '</p><p class="cap">'+L("X(병종 한정) 스킬에서 extra damage 계열에 <code>bk</code> 를 달지 않는 것과 <b>같은 규칙</b>입니다. 2026-09-12 까지는 이 둘이 어긋나 있었습니다 — X 는 칸을 피하는데 일반 칸은 A 에 합산하고 있었고, 그래서 A칸이 부풀어 노라처럼 <code>bk</code> 가 붙은 조이너가 시트보다 과소평가됐습니다.",
     "This is the <b>same rule</b> that keeps <code>bk</code> off extra-damage X skills. Until 2026-09-12 the two disagreed — X skills bypassed the slot while ordinary ones were added to A — which inflated the A slot and undervalued <code>bk</code> joiners such as Norah relative to the sheet.")+"</p></div>";
 o+="</div>";

 // 위젯
 o+='<h2>'+L("③ 위젯","③ Widgets")+' <span>'+(mode==="rally"?L("집결(Rally)","Rally"):L("수비(Defender)","Defender"))+L("용만 발동","-side only")+'</span></h2>'+'<div class="panel"><div class="xscroll"><table><thead><tr><th>'+L("영웅","Hero")+'</th><th>'+L("위젯 스킬","Widget skill")+'</th><th>'+L("스탯","Stat")+'</th><th>'+L("방향","Side")+'</th><th>Lv</th><th>'+L("효과","Effect")+'</th></tr></thead><tbody>';
 if(!wg.length)o+='<tr><td colspan="6" class="note">'+L("전용무기 보유 영웅 없음 (에픽은 전용무기가 없습니다)","No hero with exclusive gear (epics have none)")+'</td></tr>';
 wg.forEach(x=>{o+="<tr"+(x.fire?' class="hi"':' class="dead"')+"><td class=\"b\">"+esc(HN(x.hero))+"</td><td class=\"cap\">"+esc(x.w.name)+
  "</td><td>"+statKr[x.w.stat]+"</td><td>"+(x.w.side==="rally"?L("집결","Rally"):L("수비","Defender"))+
  '</td><td>'+x.lv+'</td><td>'+(x.fire?'<span class="big">+'+x.pct+"%</span>":'<span class="tag t-bad">'+(x.lv<2?L("Lv.2 미만","below Lv.2"):L("방향 불일치 → 0","wrong side → 0"))+"</span>")+"</td></tr>";});
 o+="</tbody></table></div>";
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
  o+='<h2>'+L("④ 병종 전용 · 주기형 스킬 판정","④ Class-locked and periodic skills")+'</h2><div class="panel"><div class="xscroll"><table><thead><tr><th>'+L("영웅","Hero")+'</th><th>'+L("스킬","Skill")+'</th><th>'+L("대상","Target")+'</th><th>'+L("현재 비중","Current share")+'</th><th>'+L("판정","Verdict")+'</th></tr></thead><tbody>';
  cls.forEach(c=>{o+="<tr"+(c.st==="dead"?' class="dead"':c.st==="ok"?' class="hi"':"")+'><td class="b">'+esc(HN(c.hero))+"</td><td>"+esc(c.e.n)+
   '<div class="note">'+esc(L(c.e.t,c.e.te||c.e.t))+"</div></td><td>"+tgtName[c.e.tgt]+"</td><td>"+c.v.toFixed(0)+
   '%</td><td><span class="tag t-'+(c.st==="dead"?"bad":c.st==="weak"?"warn":"ok")+'">'+c.lbl+"</span></td></tr>";});
  o+="</tbody></table></div>";
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
 o+='<h2>'+L("⑤ 조이너 한계 배율 순위","⑤ Joiner marginal multiplier ranking")+' <span>'+L("S1만 기여 · 상위 4명만 채택","only S1 counts · top 4 are taken")+(gcap<99?(LANG==="en"?' · Gen '+gcap+' and below':' · Gen '+gcap+' 이하'):'')+'</span></h2><div class="panel"><div class="xscroll"><table><thead><tr><th>#</th><th>'+L("조이너","Joiner")+'</th><th>'+L("S1 스킬","S1 skill")+'</th><th>'+L("칸","Slot")+'</th><th>'+L("계산","Working")+'</th><th>'+L("배율","Multiplier")+'</th></tr></thead><tbody>';
 rank.slice(0,14).forEach((x,i)=>{
  const dmg=x.e.slot!=="X"&&SLOTS[x.e.slot]&&SLOTS[x.e.slot].k==="dmg";
  o+="<tr"+(i<4?' class="hi"':x.mul<=1.001?' class="dead"':"")+"><td>"+(i+1)+'</td><td class="b"><span class="hrow">'+hpic(x.h)+"<span>"+esc(HN(x.h))+"</span></span>"+
   (x.dup?'<span class="tag t-warn">'+L("리더도 씀","also a leader")+'</span>':"")+(x.h.s?'<span class="tag t-ok">'+L("시트","sheet")+'</span>':'<span class="tag t-warn">'+L("이론","theory")+'</span>')+
   '</td><td class="cap">'+esc(L(x.e.t,x.e.te||x.e.t))+"</td><td>"+(x.e.slot==="X"?sTag("X")+(x.e.bk?sTag(x.e.bk):""):sTag(x.e.slot)+(x.e.also?sTag(x.e.also.slot):""))+
   (x.cond?'<div class="note">'+x.cond.split("|")[1]+"</div>":"")+'</td><td class="note">'+x.detail.map(esc).join("<br>")+
   '</td><td class="big">×'+x.mul.toFixed(3)+'<div class="note">'+(x.e.slot==="X"?L("조건부","conditional"):dmg?L("딜","damage"):L("생존","survival"))+"</div></td></tr>";});
 o+="</tbody></table></div>";
 o+='<p class="cap">'+L("배율이 같으면 <b>투자 문턱</b>으로 가릅니다 — <b>시트 등재 → 에픽 → 낮은 세대</b> 순. 계산이 더 못 가르는 자리라, 실제로 Lv.5 까지 올라와 있을 가능성이 높은 쪽을 앞세웁니다. 값을 바꾸는 게 아니라 같은 값 안에서만 순서를 정합니다.",
   "Equal multipliers are broken by the <b>investment threshold</b> — <b>sheet-listed first, then epics, then lower generations</b>. The model cannot separate them, so the tie goes to whoever is more likely to actually be maxed. This only orders within a tie; it never changes a value.")+"</p>";
 // 감소 계열이 왜 25% 증가에 지는지 — 근거는 볼트 「랠리 조이너 선정 규칙·개리슨 운영 (Ton)」 §5·§8.
 // 위 배율은 이미 그 나눗셈으로 계산돼 있다(감소 칸도 같은 buck 에 합산되므로 20% 는 ×1.200 이 된다).
 // 화면에 적어 두는 이유는 "×1.200 과 ×1.250 은 5%p 차이" 로 읽히기 때문이다.
 o+='<div class="callout co-warn"><h3>'+L("⚠️ 감소 계열(20%)은 나눗셈이라 25% 증가에 진다","⚠️ Reduction skills (20%) divide — they lose to a 25% increase")+'</h3><p>'+
  L("흔한 오해는 <b>25% 증가(×1.25)와 20% 감소(×0.8)가 상쇄된다</b>는 것입니다. 감소는 곱하는 게 아니라 <b>나눕니다</b> — <b>1.25 ÷ 1.2 = 1.0417</b> 로 증가 쪽이 4.17% 앞섭니다. 네 장씩 쌓으면 <b>2.0 ÷ 1.8 = 1.111</b> 로 11.1% 벌어집니다. 20% 계열이 \"25%보다 5%p 약한\" 게 아니라 <b>구조적으로</b> 약합니다.",
    "The common misconception is that a 25% increase (×1.25) and a 20% reduction (×0.8) cancel out. Reductions <b>divide</b> rather than multiply — <b>1.25 ÷ 1.2 = 1.0417</b>, so the increase is 4.17% ahead. Stack four of each and it is <b>2.0 ÷ 1.8 = 1.111</b>, an 11.1% gap. A 20% reduction is not \"5pp weaker than 25%\" — it is <b>structurally</b> weaker.")+
  '</p><p>'+L("위 순위의 배율은 <b>이미 이 나눗셈으로 계산돼 있습니다</b> — 20% 감소 스킬이 ×1.200 으로 나오는 게 그 값입니다. 그리고 <b>공격용·방어용 조이너 구분은 없습니다</b>: 데미지 공식이 공수 동일하고 갈리는 건 위젯뿐이라, <b>방어 상황에서도 25% 증가 계열을 쌓는 쪽</b>이 낫습니다.",
    "The multipliers above already carry this division — a 20% reduction showing ×1.200 <em>is</em> that value. And there is no such thing as an offensive or defensive joiner: the damage formula is identical for both, only widgets differ, so <b>stacking 25% increases wins even on defense</b>.")+
  '</p><p class="cap">'+L("예외 — 상대가 같은 영웅을 4스택하면 상대 칸이 이미 합연산으로 포화라 우리 감소가 상대적으로 크게 먹힙니다. 그때는 20% 계열도 쓸 만합니다. · 근거: 볼트 「랠리 조이너 선정 규칙·개리슨 운영 (Ton)」 §5·§8 (Ton 반복 테스트)",
    "Exception — if the enemy stacks the same hero four times, their slot is already saturated by addition, so your reduction bites relatively harder; 20% skills are worth taking then. · Source: vault note “Rally joiner selection & garrison ops (Ton)”, §5 and §8.")+"</p></div>";
 // 기본은 **시트 등재 영웅만**이다(2026-09-12). 계산 순위 그대로가 아니다.
 // 근거: 시트 52행 대조(SHEET_EDGE=0)에서 등재만 쪽이 #1 재현 84.6→92.3% · 겹침 48.2→58.8% 로 올라갔고,
 // **한 행도 나빠지지 않았다.** 이론 배지 영웅(웨인·고든·플린트·그웬)이 36회 끼어들던 자리다.
 // 계산 순위는 아래 보조 패널(#recAll)로 계속 보여준다 — 값을 감추는 게 아니라 순서를 바꾼 것이다.
 // 리더로 쓴 영웅도 조이너로 들어올 수 있다 — 다른 연맹원이 자기 것을 데려오는 것이다.
 // 예전에는 뽑힐 수 없게 막아 뒀는데 **근거 없는 가정**이었다 — 시트는 10개 행에서
 // 리더 영웅을 조이너 칸에 적는다(제로니모 7행 · 노라 1행 등). 2026-09-13 사용자가 짚음.
 // 대신 그 영웅의 스킬은 이미 리더 쪽에서 칸에 들어가 있으므로 한계 배율이 저절로 낮게 잡힌다.
 const pool=rank.filter(x=>x.mul>1.001);
 const poolS=pool.filter(x=>x.h.s);
 // 네 명을 한 칸 묶음에 다 넣고 최종 칸으로 계산한다.
 // 각자의 한계 배율을 그냥 곱하면 같은 칸에 겹칠 때의 포화를 놓친다 —
 // Ton 시트 Rally Joiners 탭이 4×제시를 1.25⁴=2.441 이 아니라 2.0 으로 적어 둔다.
 //
 // 딜 칸만 곱하지 않는다. 전투비를 양쪽 식으로 펴면 분자/분모가 상쇄된다:
 //   R = SkillMod(나)/SkillMod(상대) = (내딜증 × 내감소) / (상대딜증 × 상대감소)
 // 내 딜 칸과 내 감소 칸이 R 에 **똑같이** 곱해지므로, 생존 칸도 같은 무게로 센다.
 // X(병종 한정)는 칸이 아니지만 역시 R 에 곱해지는 계수라 자기 배율로 넣는다.
 const lid=leaders.map(l=>l.hero.id);
 const comboAll=list=>{
  const b=Object.assign({},buck);let x=1;const seen=[];
  const put=(sl,v)=>{if(b[sl]!==undefined)b[sl]+=v;};
  list.forEach(q=>{
   if(q.e.slot==="X"){
    // ⚠️ bk 가 붙은 X 는 그 칸의 **스탯**이다 → 반드시 칸에 넣는다.
    // q.mul 을 그냥 곱하면 그 값이 "리더만 있는 칸" 기준이라, 같은 칸에 들어가는
    // 다른 조이너와 겹치는 분을 통째로 놓친다(제시+제셀+노라가 다 A칸인데 따로 세던 버그).
    const part=w=>{const sh=xShare(w,r);
      if(w.bk&&b[w.bk]!==undefined)put(w.bk,w.v*sh); else x*=1+w.v*sh;};
    part(q.e); if(q.e.also&&q.e.also.slot==="X")part(q.e.also);
    return;}
   // An · AH 는 칸이 아니라 계수다 → 자기 배율을 그대로 곱한다.
   if(q.e.slot==="An"||q.e.slot==="AH"){x*=q.mul;return;}
   // ⚠️ e.v 가 아니라 eAdd 다 — 미아처럼 pc 가 붙은 스킬은 편성 병종 수로 기대값을 내고,
   // **이미 몇 장 있는지**(리더 보유분 + 앞서 고른 조이너)에 따라 두 장째부터 값이 확 준다.
   const have=(lid.indexOf(q.h.id)>=0?1:0)+seen.filter(z=>z===q.h.id).length;
   seen.push(q.h.id);
   put(q.e.slot,eAdd(q.e,r,have));if(q.e.also)put(q.e.also.slot,q.e.also.v);});
  return ORDER.reduce((a,sl)=>a*(b[sl]/buck[sl]),1)*x;};

 // ── 넷을 고르는 방법: 단독 배율 상위 4명이 아니라 **포화를 보며 한 명씩** 고른다 (2026-09-12)
 // 예전에는 rank 상위 4명을 그냥 잘랐다. 그러면 제시·제셀·제로니모처럼 **같은 A칸에 들어가는
 // 영웅이 나란히 뽑힌다** — 각자 단독으로는 ×1.250 이지만 둘째부터는 ×1.200, ×1.167 로 떨어지는데
 // 자르기는 그걸 모른다. 실제로 로건·필리·진먼 Gen 3 에서 미아·제시·제셀·제로니모가 나왔다.
 // 매번 "지금까지 고른 넷에 더했을 때 전투 배율이 가장 커지는 한 명"을 고르면 그 문제가 사라진다.
 //
 // ⚠️ 같은 영웅을 두 번 고르지 않는다. 예전 노트가 "탐욕을 돌리면 같은 X 영웅 4명을 쌓는 답이
 // 나온다"고 경고했는데, 그건 중복을 허용했을 때 이야기다. 후보를 서로 다른 영웅으로 제한하면
 // 시트 지침 5번("4명을 섞는 게 낫다")과 어긋나지 않는다.
 //
 // 동률이면 pool 순서가 이긴다 — pool 은 이미 투자 문턱(시트 등재 → 에픽 → 낮은 세대)으로
 // 정렬돼 있으므로 그 정책이 그대로 지켜진다.
 // 시트 행과 맞으면 그 행의 조이너를 그대로 쓴다 — 이 프로젝트 1번 원칙을 그대로 옮긴 것이다.
 // 예전에는 "애매한 2% 안에서만" 였는데, 그러면 제시군 14칸·가토 5칸 같은 자리를 못 따라가고
 // 예외를 하나씩 늘리게 된다(노라 중복 → 노라 3장 → 제시군 …). 규칙 하나로 정리했다.
 // 대가는 숨기지 않는다 — 계산만으로 고른 답은 바로 아래 #recAll 에 그대로 남아 있다.
 const canRepeat=(out,c)=>c.h.stack||out.indexOf(c)<0;
 // 시트 행이면 **시트 칸을 그대로 채운다.** 칸 안에서 누구를 쓸지만 계산이 고른다
 // (제시* 칸이면 제시·제셀·제로니모 중 조합 배율이 가장 커지는 하나).
 // 이게 이 프로젝트 1번 원칙의 곧이곧대로다 — 예외 목록을 늘리는 대신 규칙 하나로 정리했다.
 // 못 채우는 칸(리더 중복 등)과 칸이 넷보다 적을 때 남는 자리는 아래 탐욕이 메운다.
 const fillCells=(list,cells,out)=>{
  cells.forEach(cell=>{
   if(out.length>=4)return;
   let best=null,bv=-1;
   cell.forEach(id=>{
    const c=list.filter(z=>z.h.id===id)[0];
    if(!c||!canRepeat(out,c))return;
    const v=comboAll(out.concat([c]));
    if(v>bv+1e-9){bv=v;best=c;}});
   if(best)out.push(best);});
 };
 const pick4=(list,useSheet)=>{
  const cells=useSheet&&comp?comp.j:null;
  const out=[];
  if(cells)fillCells(list,cells,out);
  for(let k=out.length;k<4;k++){
   let best=null,bv=-1;
   list.forEach(c=>{if(!canRepeat(out,c))return;
    const v=comboAll(out.concat([c]));
    if(v>bv+1e-9){bv=v;best=c;}});
   if(!best)break;
   out.push(best);}
  return out;};
 // ① 순수 계산 — 시트 우선을 **끄고** 둔다. 이게 보조 패널(#recAll)의 존재 이유다:
 // 시트를 따르느라 얼마를 포기했는지를 사용자가 볼 수 있어야 한다(노라 3장 행은 최대 8% 다).
 const calcTop=pick4(pool,false);
 // 시트 등재 영웅은 에픽 8명이 gen 0 이라 gcap 을 아무리 낮춰도 넷은 남는다.
 // 그래도 빈 경우엔 계산 순위로 되돌린다 — 화면이 비는 것보다 낫다.
 const sheetTop=pick4(poolS,SHEET_EDGE>0);
 const top=sheetTop.length?sheetTop:calcTop;
 o+='<div class="callout co-key" id="rec"><h3>'+L("⭐ 추천 조이너 4명","⭐ Recommended four joiners")+
  ' <span class="tag t-ok">'+L("시트 등재만","sheet-listed only")+'</span></h3><p><b>'+top.map(x=>hpic(x.h,"sm")+esc(HN(x.h))).join(" · ")+
  '</b></p><p class="cap">'+L("전투 배율 ×","Combat multiplier ×")+comboAll(top).toFixed(3)+
  L(" · 리더가 쓰는 영웅도 조이너로 들어올 수 있습니다 — 다른 연맹원이 자기 것을 데려오는 것이라 막지 않습니다."," · a hero already run by a leader can still join — a different alliance member brings their own copy, so it is not blocked.")+"</p>"+
  '<p class="cap">'+L("여기 나오는 건 <b>Ton 시트 조이너 명단에 오른 영웅만</b>입니다. 계산 순위 1~4위를 그대로 쓰지 않는 이유는 <b>투자 문턱</b> 때문입니다 — 이론 순위가 높아도 전설은 만렙 보유자가 적고, 만렙 찍은 사람은 대개 이미 그 영웅을 리더로 쓰고 있어 조이너로 못 뺍니다. 시트 52행과 대조했더니 <b>이쪽이 #1 재현 92.3% · 겹침 58.8%</b> 로, 계산 순위 그대로(84.6% · 48.2%)보다 낫고 <b>한 행도 나빠지지 않았습니다</b>.",
     "These are only heroes on the Ton sheet’s joiner list. The raw top four is not used because of the <b>investment threshold</b>: legendaries are rarely maxed, and whoever did max one is usually already running it as a leader. Checked against all 52 sheet rows, this list reproduces the sheet’s #1 joiner <b>92.3%</b> of the time with <b>58.8%</b> overlap, against 84.6% / 48.2% for the raw ranking — and it was never worse on any row.")+"</p>"+
  (comp?'<p class="cap">'+L("📋 이 편성은 <b>Ton 시트 Gen "+comp.g+" 행</b>에 있습니다(병비 "+comp.rs.map(v=>v.join("/")).join(" · ")+"). 시트가 적은 조이너는 <b>"+
     comp.j.map(cell=>cell.map(id=>esc(HN(byId[id]))).join("/")).join(" · ")+"</b> 입니다. <b>시트 행이면 그 칸을 그대로 따릅니다</b> — 칸 안에서 누구를 쓸지만 계산이 고릅니다(“제시*” 칸이면 제시·제셀·제로니모 중 하나). 이 계산기의 1번 원칙이 <b>“계산이 시트와 엇갈리면 시트를 따른다”</b> 이기 때문입니다. 그 대가는 숨기지 않습니다 — 계산만으로 고른 답이 바로 아래 <b>「🧮 계산 순위 그대로」</b> 에 그대로 있습니다. <b>시트에 없는 편성에서는 아무 일도 일어나지 않습니다</b> — 그게 보통입니다.",
     "📋 This lineup is <b>row Gen "+comp.g+" of the Ton sheet</b> (ratios "+comp.rs.map(v=>v.join("/")).join(", ")+"), whose joiners are <b>"+
     comp.j.map(cell=>cell.map(id=>esc(HN(byId[id]))).join("/")).join(" · ")+"</b>. <b>On a row the sheet covers we fill its cells verbatim</b> — the numbers only decide who fills a cell that lists alternatives (a “Jessie*” cell takes Jessie, Jasser or Jeronimo), because this calculator’s first rule is <b>“when the numbers disagree with the sheet, follow the sheet”</b>. The cost is not hidden — what the numbers alone would pick is in <b>🧮 Raw ranking</b> just below. <b>Nothing is applied to lineups the sheet does not cover</b>, which is the usual case.")+"</p>":"")+
  // 시트가 같은 리더·병비에 답을 둘 이상 적어 둔 자리가 있다. 우리가 몰래 하나를 고르고
  // 나머지를 감추면 "시트를 따른다"는 말이 반쪽이 된다 — 다른 답도 그대로 보여준다.
  (rivals&&rivals.length?'<p class="cap">'+L("⚖️ <b>시트가 이 편성에 답을 "+(rivals.length+1)+"개 적어 뒀습니다.</b> 위는 그중 하나이고, 나머지는 <b>"+
     rivals.map(c=>c.j.map(cell=>cell.map(id=>esc(HN(byId[id]))).join("/")).join(" · ")).join("</b> / <b>")+
     "</b> 입니다. 시트가 어느 쪽을 우선하라고 적어 두지 않았으므로 <b>우리도 고르지 않습니다</b> — 위 칸은 세대 → 병비 근접 → 시트가 “META” 라고 표시한 쪽 → <b>그래도 갈리지 않으면 시트에 먼저 적힌 행</b> 순으로 하나를 집어 채운 것뿐입니다. 공격/수비 라벨로는 갈리지 않습니다(전무는 영웅에 붙어 있고, 위젯은 SkillMod 칸에 들어가지 않아 조이너 순위를 바꾸지 않습니다).",
     "⚖️ <b>The sheet gives "+(rivals.length+1)+" answers for this lineup.</b> The one above is one of them; the other(s) are <b>"+
     rivals.map(c=>c.j.map(cell=>cell.map(id=>esc(HN(byId[id]))).join("/")).join(" · ")).join("</b> / <b>")+
     "</b>. The sheet does not say which takes precedence, so <b>neither do we</b> — the cells above were chosen only by generation, then closest ratio, then whichever row the sheet labels “META”, and <b>failing all that, whichever the sheet lists first</b>. The offense/defense label does not separate them: exclusive weapons belong to the heroes, and widgets never enter a SkillMod slot, so they do not change joiner ranking.")+"</p>":"")+
  '<p class="cap">'+L("넷은 ⑤ 순위 상위 4명을 그냥 자른 게 아니라, <b>포화를 보며 한 명씩</b> 골랐습니다 — 매번 “여기에 더했을 때 전투 배율이 가장 커지는 한 명”입니다. 자르기만 하면 <b>제시·제셀·제로니모처럼 같은 A칸에 들어가는 영웅이 나란히 뽑힙니다</b>(각자 ×1.250 이지만 둘째는 ×1.200, 셋째는 ×1.167 로 떨어집니다). 그래서 순위표 1~4위와 명단이 다를 수 있습니다.",
     "The four are not the top four of ranking ⑤ — each is picked in turn as <b>whoever raises the combined multiplier most</b>, given the ones already chosen. Plain truncation lines up heroes that share a slot (Jessie, Jasser and Jeronimo all fill A: ×1.250, then ×1.200, then ×1.167). So this list can differ from rows 1–4 of the table.")+"</p>"+
  (top.filter((x,i)=>top.indexOf(x)!==i).length?'<p class="cap">'+
   L("같은 영웅이 두 번 나온 것은 <b>시트가 한 행에 그 영웅을 두 칸 이상 적어 둔 경우만</b> 허용하기 때문입니다 — 지금은 <b>노라(11행)·패트릭(2행)</b> 둘뿐이고, 나머지는 중복이 막혀 있습니다. 둘째 장도 같은 칸에 합연산으로 들어가 <b>자기끼리 포화</b>하므로, 계산은 그래도 이득일 때만 집습니다. (예: Gen 1 은 풀이 얇아 <b>2장째 패트릭 ×1.185 가 20% 계열 ×1.167 보다 낫습니다.</b>)","A hero appears twice only where <b>the sheet itself writes that hero in two or more cells of the row</b> — today that is <b>Norah (11 rows) and Patrick (2)</b>; everyone else is blocked from repeating. A second copy still adds into the same slot, so it <b>saturates against itself</b> and the numbers take it only when it still wins. (At Gen 1 the pool is thin enough that a <b>second Patrick, ×1.185, beats the 20% tier at ×1.167.</b>)")+"</p>":"")+
  (top.filter((x,i)=>top.indexOf(x)!==i).length>=2?'<p class="cap">'+
   L("노라가 <b>세 장</b>인 것은 <b>시트가 이 행에 노라 칸을 셋 적었기 때문</b>입니다. 셋째 노라는 우리 계산으로는 <b>−3% 쯤 손해</b>라 계산만으로는 안 뽑힙니다. 그 차이가 <b>시트를 따른 대가</b>이고, 계산만으로 고른 답은 아래 <b>「🧮 계산 순위 그대로」</b> 에 있습니다.",
     "Norah appears <b>three times</b> because <b>the sheet writes three Norah cells for this row</b>. By our numbers the third copy is worth about <b>−3%</b>, so it would never be chosen on merit — that gap is what following the sheet costs here, and what the numbers alone would pick is in <b>🧮 Raw ranking</b> below.")+"</p>":"")+
  '<p class="cap">'+L("위 배율은 네 명의 단독 배율을 곱한 값이 아니라 <b>같은 칸에 겹치는 분을 합쳤을 때</b>의 값입니다. 순위표의 배율을 넣는 순서대로 곱하면 더 크게 나오는데, 그건 포화를 빼먹은 숫자입니다. 그리고 <b>생존 칸도 같은 무게로 셉니다</b> — 전투비를 양쪽 식으로 펴면 <code>(내딜증 × 내감소) ÷ (상대딜증 × 상대감소)</code> 라, 내 딜 칸과 내 감소 칸이 결과에 똑같이 곱해집니다.",
     "This multiplier is not the product of the four individual figures — it is what you get after <b>adding up the parts that land in the same slot</b>. Multiplying the ranking figures together gives a larger number that ignores saturation. <b>Survival slots count the same</b>: expand the kill ratio for both sides and it reduces to <code>(my damage-up × my reduction) ÷ (theirs × theirs)</code>, so your damage slots and your reduction slots multiply the outcome equally.")+"</p>"+
  (top.filter(x=>x.dup).length?'<p class="cap">'+L("⚠️ 리더와 같은 영웅: <b>"+top.filter(x=>x.dup).map(x=>esc(HN(x.h))).join(" · ")+"</b> — 다른 연맹원이 데려오는 것이라 <b>들어올 수 있습니다</b>(시트도 10개 행에서 리더 영웅을 조이너 칸에 적습니다). 다만 그 스킬이 이미 칸에 들어가 있어 <b>한 장 더 얹는 값</b>으로 재어 있습니다.","⚠️ Also a leader: <b>"+top.filter(x=>x.dup).map(x=>esc(HN(x.h))).join(" · ")+"</b> — a different alliance member brings their own copy, so this is <b>allowed</b> (the sheet does it in ten rows). The multiplier already accounts for the leader’s copy already sitting in the slot.")+"</p>":"")+"</div>"+
  (top.map(x=>x.h.id).join()!==calcTop.map(x=>x.h.id).join()?
   '<div class="callout co-tip" id="recAll"><h3>'+L("🧮 계산 순위 그대로","🧮 Raw ranking")+
   // 아래 캡션이 "여기 이론 배지가 붙은 영웅은…" 이라고 가리키므로 배지를 실제로 붙인다.
   // 안 붙이면 넷 중 누가 시트 밖인지 화면에서 알 수 없다(2026-09-13 배포본 육안 검증에서 발견).
   ' <span class="tag t-warn">'+L("이론 포함","includes theory")+'</span></h3><p><b>'+
   calcTop.map(x=>hpic(x.h,"sm")+esc(HN(x.h))+
    (x.h.s?"":' <span class="tag t-warn">'+L("이론","theory")+'</span>')).join(" · ")+
   '</b></p><p class="cap">'+L("전투 배율 ×","Combat multiplier ×")+comboAll(calcTop).toFixed(3)+
   L(" — 시트 명단도 시트 행도 보지 않고 <b>계산만으로</b> 고르면 이렇게 됩니다. 위 추천보다 배율이 높으면, 그 차가 <b>시트를 따르느라 포기한 양</b>입니다."," — picked on the numbers alone, ignoring both the sheet’s joiner list and its rows. If this beats the recommendation above, the gap is what following the sheet costs.")+'</p>'+
   '<p class="cap">'+L('여기 <span class="tag t-warn">이론</span> 배지가 붙은 영웅은 시트 조이너 명단에 없습니다. <b>배율이 틀렸다는 뜻이 아니라</b>, 그 영웅이 실제로 Lv.5 로 올라와 조이너로 들어올 가능성이 낮다는 뜻입니다. <b>연맹원이 이미 그 영웅을 만렙으로 갖고 있다면 이쪽을 쓰는 게 맞습니다.</b>',
     'Heroes tagged <span class="tag t-warn">theory</span> here are not on the sheet’s joiner list. That does <b>not</b> mean the multiplier is wrong — only that such a hero is unlikely to actually show up maxed as a joiner. <b>If someone in your alliance already has it maxed, this is the list to use.</b>')+'</p></div>':"")+"</div>";

 // 카운터 · 밴드 — 근거는 가이드 카운터표 하나뿐이다
 if(ctr){
  const e=ctr.en,mine=[r.inf,r.lan,r.mar],def=ctr.mode==="defender";
  const enLbl=def?L("들어오는 랠리","Incoming rally"):L("상대 방어","Their defense");
  o+='<h2>⑥ '+(def?L("들어오는 랠리 · 수비","Incoming rally · garrison"):L("상대 카운터 · 랠리 밴드 판정","Counter table · rally ban check"))+'</h2><div class="panel">';
  // 수비도 같은 표다 — 행을 고르는 키가 내 개리슨 비율이고, 비교 대상이 들어오는 랠리다.
  if(def){
   const V=ctr.verdict;
   const box={favorable:["co-ok",L("✅ 시트 표: 상대가 금지 편성으로 왔습니다","✅ Sheet: they came with a banned comp")],
              threat:["co-warn",L("🚨 시트 표: 정석 카운터가 왔습니다","🚨 Sheet: this is the textbook counter")],
              silent:["co-tip",L("➖ 시트 표: 언급 없음 — 판단 유보","➖ Sheet: not mentioned — no verdict")],
              noRow:["co-tip",L("➖ 시트 표: 내 개리슨과 맞는 행 없음 — 판단 유보","➖ Sheet: no row matches my garrison — no verdict")]}[V];
   o+='<div class="callout '+box[0]+'"><h3>'+box[1]+' <span class="tag t-ok">'+L("시트","sheet")+'</span></h3>'+
    "<p>"+L("판정 대상 — 내 개리슨 ","Evaluated — my garrison ")+"<b>"+mine.map(v=>v.toFixed(0)).join("/")+"</b> · "+
      L("들어오는 랠리","incoming rally")+" <b>"+e.map(v=>v.toFixed(0)).join("/")+'</b> <span class="cap">'+L("(보/창/궁, 정규화 후)","(inf/lan/mar, after normalising)")+"</span></p>"+
    (ctr.exact?"<p>"+L("내 개리슨은 가이드 카운터표 <b>","My garrison matches the guide's <b>")+esc(ctr.rule.lbl)+L("</b> 행입니다.","</b> row.")+"</p>":
      '<p class="note">'+L("가이드 카운터표에 내 개리슨 비율과 맞는 행이 없습니다(가장 가까운 행 ","The guide's table has no row for my garrison ratio (nearest: ")+esc(ctr.rule.lbl)+").</p>")+
    (V==="favorable"?"<p>"+L("들어오는 <b>","The incoming <b>")+esc(ctr.banned.l)+L("</b>은 이 개리슨에게 <b>금지</b>로 적힌 비율입니다 — 표대로면 상대가 불리합니다.","</b> is listed as <b>banned</b> against this garrison — by the table, they are the ones in trouble.")+"</p>":"")+
    (V==="threat"?"<p>"+L("들어오는 편성이 이 행의 <b>추천 카운터</b>입니다. 표가 이 개리슨을 깨는 정답으로 지목한 비율입니다.","The incoming comp is this row's <b>recommended counter</b> — the ratio the table names as the answer to this garrison.")+"</p>":"")+
    (V==="silent"?'<div class="callout co-warn"><h3>'+L('⚠️ "안전"이 아니라 "표에 없음"입니다','⚠️ This is "not in the table", not "safe"')+'</h3>'+
       "<p>"+L("들어오는 <b>","The incoming <b>")+e.map(v=>v.toFixed(0)).join("/")+L("</b>은 이 행의 <b>추천 카운터에도, 금지 목록에도</b> 없습니다. 표가 이 조합을 다루지 않았다는 뜻이지 막아낸다는 뜻이 아닙니다.","</b> appears in neither the recommended counters nor the ban list for this row. The table does not cover this matchup — that is not the same as holding.")+"</p></div>":"")+
    "<p><b>"+L("이 개리슨을 깨는 편성:","Comps that break this garrison:")+"</b> "+(ctr.rule.c.length?ctr.rule.c.map(c=>'<span class="pill">'+esc(c)+"</span>").join(""):'<span class="cap">'+L("표에 없음","none listed")+"</span>")+"</p>"+
    '<p class="note">'+L("아래 설명문은 가이드 원문이라 <b>공격자 시점</b>으로 쓰여 있습니다 — 내 개리슨을 깨는 쪽에서 본 문장입니다. 내가 칠 때의 판정을 보려면 ⚔️ 공성 모드로 바꾸세요. 그러면 행을 고르는 키가 <b>상대 방어</b>가 됩니다.","The explanation below is quoted from the guide, so it is written from the <b>attacker's</b> point of view — it describes breaking your garrison. To see the verdict for your own attacks, switch to ⚔️ Rally mode: the row is then chosen by <b>their defense</b>.")+"</p>"+
    '<p class="cap">'+esc(ctr.rule.why)+"</p>"+
    (ctr.rule.ban.length?'<p class="cap">'+L("🚫 이 개리슨에게 밴드인 편성(상대가 이걸로 오면 유리): ","🚫 Comps banned against this garrison (good news if they bring one): ")+ctr.rule.ban.map(b=>{
      const near=dist(e,b.v)<BAND_TOL;
      return (near?"<b>":"")+esc(b.l)+" ("+b.v.join("/")+")"+(near?L(" ← 지금 들어온 편성</b>"," ← what just came</b>"):"");}).join(" · ")+"</p>":
      '<p class="cap">'+L("🚫 이 개리슨에게 금지로 적힌 비율은 없습니다.","🚫 The guide lists no banned ratio against this garrison.")+"</p>")+
    (ctr.rule.src==="theory"?'<p class="note">'+L("이 행은 가이드 원본 카운터표에 없는 <b>이론 확장</b>입니다.","This row is a <b>theoretical extension</b> not present in the guide's original table.")+"</p>":"")+
    '<p class="note">'+L("표는 <b>랠리 한 개</b>를 기준으로 적혀 있지 않습니다 — 추천 카운터에 <b>멀티랠리 전제</b>가 붙은 행이 있습니다(위 라벨 확인). 정석 카운터가 하나 왔다고 곧바로 지는 건 아니고, 그 비율로 <b>여러 개</b> 들어올 때가 표가 말하는 상황입니다.","The table is not written per single rally — some rows premise their counter on <b>multiple rallies</b> (see the label above). One textbook-counter rally arriving does not mean you lose; the table is describing several of them.")+"</p>"+
    "</div>";
  }else{
   // 가이드 카운터표 룩업 (랠리 방향 · 1차 자료) — ban / counter / silent / noRow
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
       "<p>"+L("이 행의 추천 카운터로 바꾸거나, 직접 판단하세요. 이 계산기는 시트가 다루지 않는 비율에 대해서는 판정하지 않습니다.","Switch to one of this row's recommended counters, or judge for yourself. This calculator does not rule on ratios the sheet does not cover.")+"</p></div>":"")+
    "<p><b>"+L("추천 카운터:","Recommended counters:")+"</b> "+ctr.rule.c.map(c=>'<span class="pill">'+esc(c)+"</span>").join("")+"</p>"+
    '<p class="cap">'+esc(ctr.rule.why)+"</p>"+
    (ctr.rule.ban.length?'<p class="cap">'+L("🚫 이 상대에게 금지: ","🚫 Banned against this defense: ")+ctr.rule.ban.map(b=>{
      const near=dist(mine,b.v)<BAND_TOL;
      return (near?"<b>":"")+esc(b.l)+" ("+b.v.join("/")+")"+(near?L(" ← 현재 편성</b>"," ← your comp</b>"):"");}).join(" · ")+"</p>":
      '<p class="cap">'+L("🚫 이 상대에겐 가이드상 금지 비율이 없습니다.","🚫 The guide lists no banned ratio against this defense.")+"</p>")+
    (ctr.rule.src==="theory"?'<p class="note">'+L("이 항목은 가이드 원본 카운터표에 없는 <b>이론 확장</b>입니다.","This row is a <b>theoretical extension</b> not present in the guide's original table.")+"</p>":"")+
    '<p class="note">'+L('지금은 표를 <b>공격 방향</b>으로 읽고 있습니다 — 🚫는 "이 비율로 <b>공격하면</b> 진다"는 뜻입니다. 같은 표를 수비 쪽에서 읽으려면 🛡️ 수성 모드로 바꾸세요. 그러면 행을 고르는 키가 <b>내 개리슨</b>이 되고, 들어오는 랠리가 이 행의 카운터인지 금지 편성인지를 봅니다.','You are reading the table in the <b>attack</b> direction — a 🚫 means "you lose if you <b>attack</b> with this ratio". To read the same table from the defending side, switch to 🛡️ Garrison mode: the row is then chosen by <b>your garrison</b>, and the incoming rally is checked against the counters and bans listed in that row.')+"</p>"+
    "</div>";
  }
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

// ── 초상 픽커 ──────────────────────────────────────────────────────────
// 진짜 상태는 여전히 숨은 <select id="hInf|hLan|hMar"> 가 들고 있다.
// calc() 도 테스트도 그 value 만 읽으므로, 이 위젯은 화면일 뿐이고 판정 로직과 무관하다.
// <details> 를 쓰면 열고 닫기·Esc·키보드 포커스가 브라우저 기본 동작으로 해결된다.
const PICKERS=[["hInf","pInf","sInf","gInf","infantry"],
               ["hLan","pLan","sLan","gLan","lancer"],
               ["hMar","pMar","sMar","gMar","marksman"]];
const genLbl=h=>h.gen?"G"+h.gen:L("에픽","Epic");
function syncPicker(selId,sumId,gridId){
 const h=byId[document.getElementById(selId).value];
 document.getElementById(sumId).innerHTML=h
   ? hpic(h)+"<span>"+esc(HN(h))+'</span><span class="cap">'+genLbl(h)+(h.s?" · "+L("시트","sheet"):"")+"</span>"
   : '<span class="cap">'+S("pick")+"</span>";
 const grid=document.getElementById(gridId);
 if(grid)[].forEach.call(grid.querySelectorAll(".pk"),b=>{
   b.setAttribute("aria-pressed",String(b.dataset.id===(h?h.id:"")));});
}
// 팝오버라서 바깥을 눌렀을 때·Esc 에 닫히는 건 직접 붙여야 한다(<details> 기본 동작 아님)
let outsideBound=false;
function closeOnOutside(){
 if(outsideBound)return; outsideBound=true;
 const shut=e=>PICKERS.forEach(p=>{const d=document.getElementById(p[1]);
   if(d&&d.open&&!(e&&e.target&&d.contains(e.target)))d.open=false;});
 document.addEventListener("click",shut);
 document.addEventListener("keydown",e=>{if(e.key==="Escape")shut(null);});
}
function mountPicker(selId,detId,sumId,gridId,cls){
 const grid=document.getElementById(gridId); if(!grid)return;
 grid.innerHTML='<button type="button" class="pk none" data-id="">'+S("pick")+"</button>"+
  HEROES.filter(h=>h.cls===cls).sort((a,b)=>a.gen-b.gen||HN(a).localeCompare(HN(b)))
   .map(h=>'<button type="button" class="pk" data-id="'+h.id+'" title="'+esc(HN(h))+'">'+
     hpic(h)+"<b>"+esc(HN(h))+"</b><i>"+genLbl(h)+
     (h.s?'<span class="tag t-ok">'+L("시트","sheet")+"</span>":"")+"</i></button>").join("");
 grid.onclick=e=>{const b=e.target.closest(".pk"); if(!b)return;
  const sel=document.getElementById(selId);
  sel.value=b.dataset.id;
  document.getElementById(detId).open=false;
  syncPicker(selId,sumId,gridId);
  sel.dispatchEvent(new Event("change",{bubbles:true}));};
 syncPicker(selId,sumId,gridId);
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
  [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17].map(g=>'<option value="'+g+'">'+(LANG==="en"?"Gen "+g+" and below":"Gen "+g+" 이하")+"</option>").join("");
 Object.keys(keep).forEach(id=>{if(keep[id])document.getElementById(id).value=keep[id];});
 PICKERS.forEach(p=>mountPicker(p[0],p[1],p[2],p[3],p[4]));
 closeOnOutside();
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
 PICKERS.forEach(p=>syncPicker(p[0],p[2],p[3]));
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
