const esc=s=>String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
// 영웅 초상. 파일이 없거나 오프라인이면 스스로 사라진다 — 계산 결과에는 영향이 없다.
const hpic=(h,cls)=>'<img class="hpic'+(cls?" "+cls:"")+'" loading="lazy" alt="" src="img/heroes/'+
 encodeURIComponent(h.id)+'.webp" onerror="this.remove()">';
const sTag=s=>'<span class="slot s-'+(["A","B","E","F","G","C","D"].includes(s)?s:"X")+'">'+s+'</span>';
const statKr=i18nFill({},function(){return{Attack:L("공격력","Attack"),Defense:L("방어력","Defense"),Lethality:L("파괴력","Lethality"),Health:L("체력","Health")};});

// ── 🪣 버킷 조합 Top 5 (2026-11-10) — 시트를 보지 않는 버킷 수학만의 답 ──
// 4명 **중복 허용** 조합을 전부 재서 상위 5개를 보여 준다. 계산 추천(#rec · #recAll)은 한 명씩 고르는 탐욕이고 중복을 stack 영웅으로 제한하지만,
// 여기는 제한이 없다. 같은 동치류(S1 효과가 완전히 같은 영웅)는 대표 한 명 + "= 나머지" 로 적는다 — 누가 그 자리에 들어갈 수 있는지 보이게.
// 규칙 칩과 시트 대조는 2026-11-11 개편에서 밖으로 나갔다(💡 #rules · 📋 #sheet · 🔍 #cmp).
function comboPanel(d){
 const {combos,buck}=d;
 if(!combos||!combos.length)return "";
 const nm=c=>{const h=c.mem[0].h,alt=c.mem.slice(1).map(x=>esc(HN(x.h)));
  return hpic(h,"sm")+esc(HN(h))+(alt.length?' <span class="note">= '+alt.join("·")+"</span>":"");};
 let o='<div class="callout co-tip" id="combos"><h3>'+L("🪣 버킷 조합 Top 5 — 4명 전수 탐색","🪣 Bucket combos, top 5 — every four-joiner set searched")+
  ' <span class="tag t-warn">'+L("이론 포함 · 중복 허용","includes theory · repeats allowed")+"</span></h3>";
 combos.forEach((c,i)=>{
  const cnt=[];c.cls.forEach(k=>{const f=cnt.filter(z=>z.c===k)[0];if(f)f.n++;else cnt.push({c:k,n:1});});
  const ch=ORDER.filter(sl=>Math.abs(c.b[sl]-buck[sl])>1e-9).map(sl=>sl+" "+buck[sl].toFixed(2)+"→"+c.b[sl].toFixed(2));
  o+='<div class="combo'+(i===0?" hi":"")+'"><p><b>#'+(i+1)+" ×"+c.rel.toFixed(3)+"</b> — "+cnt.map(z=>(z.n>1?z.n+"× ":"")+nm(z.c)).join(" · ")+
   '</p><p class="cap">'+ch.join(" · ")+(c.flags.length?' <span class="tag t-warn">'+L("확률형 포함","includes chance")+"</span>":"")+"</p></div>";});
 o+='<p class="cap">'+L("위 계산 추천은 한 명씩 고른 답이고, 여기는 <b>4명 조합을 전부</b> 잰 상위 5개입니다 — 같은 영웅을 몇 번이든 겹칠 수 있고 시트 명단도 보지 않습니다. 배율이 비슷한 다른 조합이 무엇인지, <b>“= ”</b> 뒤의 영웅으로 바꿔도 값이 같은지를 볼 때 씁니다. 투자 문턱(실제로 Lv.5 인가)은 따지지 않습니다.",
   "The calculated pick above is chosen one hero at a time; this is the top five of <b>every four-joiner set</b> — any hero may repeat and the sheet’s joiner list is ignored. Use it to see which other sets score about the same, and which heroes after <b>“= ”</b> are interchangeable. It ignores the investment threshold (whether anyone actually has the hero at Lv.5).")+"</p></div>";
 return o;}

function render(d){
 const {mode,leaders,picks,r,buck,src,cls,leaderOnly,unknown,base,s0,wg,wstat,wmul,wDmg,wSur,rank,ctr,gcap,comp,rivals,near,combos}=d;
 // 섹션을 조각으로 모았다가 맨 끝에서 순서대로 잇는다. 번호({{n}})는 그때 매긴다 — 카운터처럼 있을 때만 나오는 섹션이 있어서다.
 let o="";const part={};
 const modeKr=mode==="rally"?L("공성(랠리)","Rally (offense)"):L("수성(개리슨)","Garrison (defense)");
 o+='<h2>{{n}} '+L("리더 구성","Leaders")+' <span>'+modeKr+L(" · 병비 "," · ratio ")+r.inf.toFixed(0)+"/"+r.lan.toFixed(0)+"/"+r.mar.toFixed(0)+'</span></h2>';
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
 part.lead=o;o="";

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
 part.warn=o;o="";

 // 칸 진단
 o+='<h2>{{n}} '+L("SkillMod 칸 진단","SkillMod slot diagnosis")+' <span>'+L("포화도","saturation")+'</span></h2><div class="panel"><div class="xscroll"><table><thead><tr><th>'+L("칸","Slot")+'</th><th>'+L("이름","Name")+'</th><th>'+L("값","Value")+'</th><th>'+L("포화","Saturation")+'</th><th>'+L("구성","Sources")+'</th></tr></thead><tbody>';
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
 // 버킷 점유 맵 — 리더 9스킬이 채운 버킷을 공격/방어 두 줄 칩으로. 값 위에 마우스를 올리면 출처가 뜬다.
 // 배율에 안 들어가는 스킬 데미지 · 리더 전용 버킷은 회색 칩으로 같은 자리에 둔다(2026-11-10).
 const chip=sl=>'<span class="pill'+(buck[sl]>1?" on":" empty")+'" title="'+esc(src[sl].join(" / ")||L("비어 있음","empty"))+'">'+sl+" "+SLOTS[sl].n+" <b>"+buck[sl].toFixed(2)+"</b></span>";
 o+='<div class="callout co-key" id="bmap"><h3>'+L("🪣 버킷 점유 맵 — 리더 9스킬","🪣 Bucket map — the leaders' nine skills")+'</h3>'+
  '<p><b>'+L("공격","Offense")+'</b> '+ATK_B.map(chip).join("")+'</p><p><b>'+L("방어","Defense")+'</b> '+DEF_B.map(chip).join("")+'</p>'+
  (leaderOnly.length?'<p><b>'+L("배율 제외","Not scored")+'</b> '+leaderOnly.map(x=>'<span class="pill dim" title="'+esc(SLOTS[x.slot].n)+'">'+x.slot+" · "+esc(HN(x.hero))+" "+esc(x.skill)+"</span>").join("")+'</p>':"")+
  '<p class="cap">'+L("같은 버킷은 더하고 다른 버킷은 곱합니다(버킷 값 = 1 + Σ%). 감소 계열도 1+Σ 로 나눗셈 쪽에 들어갑니다. <b>회색 칩</b>은 스킬 데미지·리더 전용 버킷(보호막·표식 대상·특정 병종 상대·추가 피해·스킬 데미지↑)이라 <b>수치 모델이 없어 배율에 넣지 않았습니다</b> — 근거: Ton 2026-11-10 영상의 원정스킬 버킷표.",
   "Same bucket adds, different buckets multiply (bucket = 1 + Σ%). Reductions also enter as 1+Σ, on the dividing side. <b>Grey chips</b> are skill damage and leader-only buckets (shield, marked target, vs a troop type, extra damage, skill damage up) — <b>there is no numeric model for them, so they are not scored</b>. Source: the expedition-skill bucket table in Ton's 2026-11-10 video.")+'</p>'+
  (unknown.length?'<p class="cap">❓ '+L("수치 미확인·미확정: ","Unconfirmed: ")+unknown.map(x=>esc(HN(x.hero))+" "+esc(x.skill)+" ("+x.slot+(x.reason==="unsure"?L(" — 표에서도 ?"," — ? in the table"):L(" — 수치 없음 · 배율 제외"," — no value · not scored"))+")").join(" · ")+'</p>':"")+
  '</div>';
 o+="</div>";
 part.buck=o;o="";

 // 위젯
 o+='<h2>{{n}} '+L("위젯","Widgets")+' <span>'+(mode==="rally"?L("집결(Rally)","Rally"):L("수비(Defender)","Defender"))+L("용만 발동","-side only")+'</span></h2>'+'<div class="panel"><div class="xscroll"><table><thead><tr><th>'+L("영웅","Hero")+'</th><th>'+L("위젯 스킬","Widget skill")+'</th><th>'+L("스탯","Stat")+'</th><th>'+L("방향","Side")+'</th><th>Lv</th><th>'+L("효과","Effect")+'</th></tr></thead><tbody>';
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
 part.wid=o;o="";

 // 병종 전용
 if(cls.length){
  o+='<h2>{{n}} '+L("병종 전용 · 주기형 스킬 판정","Class-locked and periodic skills")+'</h2><div class="panel"><div class="xscroll"><table><thead><tr><th>'+L("영웅","Hero")+'</th><th>'+L("스킬","Skill")+'</th><th>'+L("대상","Target")+'</th><th>'+L("현재 비중","Current share")+'</th><th>'+L("판정","Verdict")+'</th></tr></thead><tbody>';
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
 part.cls=o;o="";

 // ── 조이너 안내 (2026-11-11 개편 · 사용자 결정) ──
 // 시트 원문과 계산을 **섞지 않는다.**
 //   📋 #sheet  — Ton 시트 행을 한 글자도 안 바꾸고 그대로: 기본 4칸 · Alternative · 비고. 답이 둘이면 둘 다.
 //   🧮 #rec    — 시트 조이너 명단(s:1) 안에서의 계산. 시트 **행**은 전혀 안 본다.
 //   🧮 #recAll — 전체 영웅으로 한 계산(#rec 과 다를 때만).
 // 예전의 "시트 칸 우선 + 셋째 장부터 교체" 혼합 추천(SHEET_EDGE · fillCells · 🔀 · 📐)은 걷어냈다 — 시트도 계산도 아닌 답이라
 // "시트가 뭐라고 적었나" 와 "공식으로는 뭐가 나오나" 가 둘 다 흐려졌다. 시트 조합에 우리 공식을 대 본 배율은 시트 카드에 따로 찍는다.
 const pool=rank.filter(x=>x.mul>1.001);
 const poolS=pool.filter(x=>x.h.s);
 // 네 명을 한 버킷 묶음에 다 넣고 최종 값으로 잰다 — 각자의 한계 배율을 곱하면 같은 버킷에 겹칠 때의 포화를 놓친다
 // (Ton 시트 Rally Joiners 탭이 4×제시를 1.25⁴=2.441 이 아니라 2.0 으로 적는다). 생존 버킷도 같은 무게로 센다 —
 // R = (내딜증 × 내감소) / (상대딜증 × 상대감소). 엔진의 scoreAtoms 를 그대로 쓴다(단일 배율 · 이 추천 · Top 5 가 같은 산수).
 const comboAll=list=>scoreAtoms(base.concat.apply(base,list.map(q=>q.at))).s/s0;
 // 넷을 고르는 방법: 단독 배율 상위 4명을 자르지 않고 **포화를 보며 한 명씩**(2026-09-12). 동률이면 rank 순서(투자 문턱)가 이긴다.
 // 같은 영웅을 다시 고를 수 있는 건 stack:1(시트가 한 행에 두 칸 이상 적은 영웅 — 노라·패트릭)뿐이다.
 const canRepeat=(out,c)=>c.h.stack||out.indexOf(c)<0;
 const pick4=list=>{const out=[];
  for(let k=0;k<4;k++){let best=null,bv=-1;
   list.forEach(c=>{if(!canRepeat(out,c))return;const v=comboAll(out.concat([c]));if(v>bv+1e-9){bv=v;best=c;}});
   if(!best)break;out.push(best);}
  return out;};
 // 시트 행의 칸마다 한 명 — 칸에 이름이 여럿이면(제시* = 제시·제셀·제로니모) 배율이 가장 커지는 하나로 **잴 뿐**이다.
 // 화면에는 칸에 적힌 이름을 전부 그대로 보여 준다. 중복·겹침을 따지지 않는다(시트가 적은 그대로가 이 카드의 요점이다).
 const sheetPick=c=>{const out=[];
  c.j.forEach(cell=>{let best=null,bv=-1;const cur=out.filter(Boolean);
   cell.forEach(id=>{const z=rank.filter(q=>q.h.id===id)[0];if(!z)return;
    const v=comboAll(cur.concat([z]));if(v>bv+1e-9){bv=v;best=z;}});
   out.push(best);});
  return out;};
 // 배율에 드는가 = S1 이 버킷 원자를 하나라도 내는가(레니·무명은 버킷 미확정이라 원자가 없다).
 // 원자는 있는데 이 병비에서 값이 0 인 것(대상 병종이 없는 병종 한정 스킬)과는 다르다 — 그건 0 으로 "들어간" 것이다.
 const scored=z=>z.at.length>0;
 const uniq=a=>a.filter((x,i)=>a.indexOf(x)===i);
 // 같은 영웅을 겹쳐 넣은 자리의 **이 편성 실제 값**. 순서는 고른(적힌) 순서 그대로 — comboAll 은 순서 불변이라 곱은 같지만,
 // 순서를 바꾸면 어느 장이 "첫 장" 인지가 달라져 단일 순위표와의 대조가 깨진다. 한 영웅의 기여는 S1 하나다.
 const stackNote=list=>{
  const mg=[];let prev=1;
  list.forEach((c,i)=>{const v=comboAll(list.slice(0,i+1));mg.push(v/prev);prev=v;});
  const done=[],out=[];
  list.forEach(c=>{
   if(done.indexOf(c.h.id)>=0)return;
   done.push(c.h.id);
   const ix=[];list.forEach((z,k)=>{if(z.h.id===c.h.id)ix.push(k);});
   if(ix.length<2)return;
   out.push("<b>"+esc(HN(c.h))+"</b> "+ix.map(k=>"×"+mg[k].toFixed(3)).join(" → "));});
  return out.length?'<p class="cap" data-k="stack">'+
   L("↘ 같은 영웅이 겹친 자리 — <b>이 편성의 실제 값</b>은 ","↘ Stacked copies — <b>in this lineup</b> they actually add ")+
   out.join(" · ")+
   L(". 같은 버킷에 합연산으로 들어가 <b>장마다 줄어듭니다</b>(세 자리 반올림).",
     ". Copies land in the same bucket additively, so <b>each one adds less</b> (rounded to three decimals).")+"</p>":"";};
 // 중첩 효율 = 이 편성에서 그 장이 실제로 더한 이득 ÷ 버킷이 전부 비었을 때의 이득. ⚠️ 효율은 순서를 정하지 않는다 —
 // 효율이 낮아도 실제 이득(「이 편성」 열)이 더 클 수 있다. 정렬 키나 문턱으로 쓰지 말 것.
 const effRows=list=>{let prev=1;return list.map((c,i)=>{
   const v=comboAll(list.slice(0,i+1)),gain=v/prev-1;prev=v;
   const alone=scoreAtoms(c.at).s-1,mine=c.at.filter(a=>a.t!=="free"&&a.sl).map(a=>a.sl).filter((x,k,arr)=>arr.indexOf(x)===k);
   const why=[];
   mine.forEach(sl=>{const who=[];if(buck[sl]>1+1e-9)who.push(L("리더","leaders"));
    list.slice(0,i).forEach(o=>{if(o.at.some(a=>a.sl===sl)){const n=esc(HN(o.h));if(who.indexOf(n)<0)who.push(n);}});
    if(who.length)why.push(SLOTS[sl].n+" ← "+who.join("·"));});
   return {c:c,gain:gain,alone:alone,eff:alone>1e-9?gain/alone:null,why:why,ns:!scored(c)};});};
 const effTable=(list,id)=>'<details class="fold"><summary>'+L("장별 이득 · 겹치는 버킷 보기","Per-joiner gain and bucket overlap")+'</summary><div class="xscroll"><table id="'+id+'"><thead><tr><th>'+L("조이너","Joiner")+"</th><th>"+L("빈 버킷일 때","On empty buckets")+"</th><th>"+
   L("이 편성","This lineup")+"</th><th>"+L("효율","Efficiency")+"</th><th>"+L("겹치는 버킷","Overlapping buckets")+"</th></tr></thead><tbody>"+
  effRows(list).map(x=>"<tr><td>"+esc(HN(x.c.h))+"</td><td>"+(x.ns?"—":"+"+(x.alone*100).toFixed(1)+"%")+"</td><td>"+(x.ns?"—":"+"+(x.gain*100).toFixed(1)+"%")+
   "</td><td>"+(x.ns?L("점수 외","not scored"):x.eff==null?"—":(x.eff*100).toFixed(0)+"%")+'</td><td class="cap">'+
   (x.ns?L("버킷 미확정 · 수치 모델 없음","bucket unconfirmed / no numeric model"):x.eff==null?L("이 병비에서는 값이 0 (대상 병종 없음)","adds nothing at this ratio (no target troops)"):x.why.join(" / ")||L("없음","none"))+"</td></tr>").join("")+
  '</tbody></table></div><p class="cap">'+L("<b>효율</b> = 이 편성에서 실제로 더한 이득 ÷ 버킷이 전부 비어 있을 때의 이득. 리더나 앞선 조이너가 같은 버킷을 채웠으면 그만큼 내려갑니다. <b>효율이 순서를 정하지는 않습니다</b> — 효율이 낮아도 실제 이득(「이 편성」 열)이 더 클 수 있습니다.",
   "<b>Efficiency</b> = the gain actually added in this lineup ÷ the gain on completely empty buckets. It drops when leaders or earlier joiners already filled the same bucket. <b>Efficiency does not set the order</b> — a lower-efficiency pick can still add more (the “This lineup” column).")+"</p></details>";
 const names=cell=>cell.map(id=>esc(HN(byId[id]))).join("/");
 // raw — 그 칸의 **시트 원문 표기**(jx · ax). 이름 하나가 여러 영웅으로 펴진 칸에만 있다(Jessie* → 제시/제셀/제로니모).
 // 펴 놓기만 하면 시트가 실제로 뭐라고 적었는지(별표가 있는지 없는지)가 화면에서 사라진다 — 원문을 작은 글씨로 같이 싣는다.
 const faces=(cell,raw)=>cell.map(id=>hpic(byId[id],"sm")+esc(HN(byId[id]))).join('<i class="or">/</i>')+(raw?'<i class="raw">'+esc(raw)+"</i>":"");
 const stackNames=HEROES.filter(h=>h.stack).map(h=>esc(HN(h))).join(" · ");
 const hc=(x,theory)=>'<span class="hc">'+hpic(x.h,"sm")+esc(HN(x.h))+(theory&&!x.h.s?' <span class="tag t-warn">'+L("이론","theory")+'</span>':"")+"</span>";
 // 시트 행 라벨 — 원문은 영어다. 한국어 화면에서는 낱말만 옮기고(비율은 그대로) 원문을 옆에 같이 싣는다.
 const lbText=c=>{let s=c.lb.replace(/^\s*(META|NEW)\s*-?\s*/i,"");
  [["Offense & Defense",L("공격·수비","Offense & Defense")],["Lancers",L("창병","Lancers")],["Marksmen",L("궁병","Marksmen")],["Mix",L("혼합","Mix")],
   ["Offense",L("공격","Offense")],["Defense",L("수비","Defense")],[" or ",L(" 또는 "," or ")]].forEach(p=>{s=s.split(p[0]).join(p[1]);});
  return s;};
 // 시트 행 한 개를 그대로 그린다. mult — 지금 병비에서 우리 공식으로 잰 배율을 붙일지(병비가 다른 📍 행에는 안 붙인다).
 const sheetBlock=(c,mult,effId,same)=>{
  const lst=sheetPick(c),got=lst.filter(Boolean),un=uniq(got.filter(z=>!scored(z)).map(z=>esc(HN(z.h))));
  const multi=uniq(lst.filter((z,i)=>z&&c.j[i].length>1).map(z=>esc(HN(z.h))));
  const seq=c.ao||(c.alt||[]).map((_,i)=>i),free=seq.filter(a=>typeof a!=="number");
  // 펴서 실은 칸의 원문 표기. 시트 범례가 정의한 것은 Jessie* 와 Sergey** 둘뿐이다 — 그 밖의 표기(별표 없는 Jessie · Jessie** · Jessies)를
  // 같은 칸으로 읽은 것은 우리 해석이므로 따로 밝힌다.
  const jx=c.jx||{},ax=c.ax||{},rawAll=uniq(Object.keys(jx).map(k=>jx[k]).concat(Object.keys(ax).map(k=>ax[k])));
  const LEGEND=["Jessie*","Sergey**"],rawOurs=rawAll.filter(x=>LEGEND.indexOf(x)<0);
  let s='<div class="srow"><p class="shd"><span class="tag t-ok">Gen '+c.g+"</span>"+(/^\s*META/i.test(c.lb)?'<span class="tag t-warn">META</span>':"")+
   (/^\s*NEW/i.test(c.lb)?'<span class="tag t-off">NEW</span>':"")+" <b>"+esc(lbText(c))+'</b></p><p class="note">'+
   // 영어 화면은 제목이 곧 원문 라벨이라 다시 안 싣는다 — 다만 META/NEW 를 태그로 떼어 낸 행은 통째 원문을 같이 적는다
   L("리더 ","Leaders ")+c.l.map(names).join(" · ")+(LANG==="en"&&lbText(c)===c.lb?"":" · "+L("시트 라벨 “","sheet label “")+esc(c.lb)+"”")+"</p>"+
   // 내용이 완전히 같아 접은 쌍둥이 행 — 블록은 하나지만 시트가 그 라벨로도 적었다는 사실은 남긴다
   (same&&same.length?'<p class="note" data-k="twin">'+L("시트의 다른 행 ","The sheet’s row ")+same.map(t=>"“"+esc(t.lb)+"”").join(" · ")+
     L(" 도 이 편성에 걸리고 조합·대안·비고가 똑같습니다 — 한 번만 싣습니다."," also matches this lineup with the same set, alternatives and comment — shown once.")+"</p>":"")+
   '<div class="jlab">'+L("기본 조합 <span>Joiner #1~#4</span>","Main set <span>Joiner #1–#4</span>")+'</div><div class="chips" data-k="main">'+
   c.j.map((cell,i)=>'<span class="hc"><i class="no">'+(i+1)+"</i>"+faces(cell,jx[i])+"</span>").join("")+
   (c.j.length<4?'<span class="hc free">'+L("#"+(c.j.length+1)+(c.j.length<3?"~4":"")+" 시트 빈칸","#"+(c.j.length+1)+(c.j.length<3?"–4":"")+" blank on the sheet")+"</span>":"")+"</div>";
  if(mult&&got.length)s+='<p class="mult"><b>'+L("전투 배율 ×","Combat multiplier ×")+comboAll(got).toFixed(3)+'</b> <span class="note">'+
    L("시트 조합을 우리 공식으로 잰 값 · 리더만 있을 때 대비","the sheet’s set scored by our formula · vs the leaders alone")+
    (got.length<4?L(" · 조이너 "+got.length+"명만"," · "+got.length+" joiners only"):"")+"</span></p>"+
    (multi.length?'<p class="note">'+L("이름이 여럿인 칸은 그중 한 명입니다 — 배율은 <b>"+multi.join("·")+"</b> 기준으로 쟀습니다.",
      "A cell with several names means any one of them — the multiplier uses <b>"+multi.join(", ")+"</b>.")+"</p>":"")+
    stackNote(got)+
    (un.length?'<p class="note" data-k="unscored">⚠️ '+L("<b>"+un.join("·")+"</b>의 S1 은 버킷이 미확정이라 <b>배율에 넣지 못했습니다</b> — 위 숫자는 그만큼 실제보다 낮습니다. 시트가 틀렸다는 뜻이 아닙니다.",
      "<b>"+un.join(", ")+"</b>: the S1 bucket is unconfirmed, so it is <b>not scored</b> — the figure above is that much too low. This does not mean the sheet is wrong.")+"</p>":"");
  s+='<div class="jlab">'+L("대안 <span>Alternative #1~#3</span>","Alternatives <span>Alternative #1–#3</span>")+"</div>"+
   (seq.length?'<div class="chips" data-k="alt">'+seq.map(a=>typeof a==="number"?'<span class="hc">'+faces(c.alt[a],ax[a])+"</span>":'<span class="hc free">'+esc(a)+"</span>").join("")+"</div>":
     '<p class="note" data-k="noalt">'+L("시트가 이 행에 대안을 적지 않았습니다.","The sheet lists no alternatives for this row.")+"</p>")+
   (free.length?'<p class="note">'+L("점선 칸(<b>"+free.map(esc).join(" · ")+"</b>)은 시트 원문 표기입니다 — 영웅을 특정하지 않고 <b>그 % 계열 스킬 조이너 아무나</b>라는 뜻으로 읽습니다(우리 해석).",
     "Dashed chips (<b>"+free.map(esc).join(" · ")+"</b>) are the sheet’s own wording — read here as <b>any joiner with a skill of that %</b>, no specific hero (our reading).")+"</p>":"")+
   (rawAll.length?'<p class="note" data-k="raw">'+L("칩 끝의 작은 글씨(<b>"+rawAll.map(esc).join(" · ")+"</b>)가 그 칸의 <b>시트 원문 표기</b>입니다. 시트 범례(*Jessie = Jessie, Jasser or Jeronimo · **Sergey = Bahiti, Lumak Bokan)에 따라 이름을 펼쳐 실었습니다.",
     "The small text at the end of a chip (<b>"+rawAll.map(esc).join(" · ")+"</b>) is <b>what the sheet actually writes</b> in that cell. Names are expanded per the sheet’s legend (*Jessie = Jessie, Jasser or Jeronimo · **Sergey = Bahiti, Lumak Bokan).")+
     (rawOurs.length?" "+L("<b>"+rawOurs.map(esc).join(" · ")+"</b> 는 범례에 없는 표기입니다 — Jessie* 와 같은 칸으로 읽었습니다(<b>우리 해석</b>).",
       "<b>"+rawOurs.map(esc).join(" · ")+"</b> is not a notation the legend defines — it is read here as the same cell as Jessie* (<b>our reading</b>)."):"")+"</p>":"");
  if(c.c)s+='<div class="jlab">'+L("비고 <span>Comments</span>","Comments")+'</div><p class="quote" data-k="note">'+
   (LANG==="en"?esc(c.c):esc(SHEET_NOTE_KO[c.c]||c.c)+' <span class="note">— '+L("원문 “","")+esc(c.c)+L("”","")+"</span>")+"</p>";
  if(mult&&got.length)s+=effTable(got,effId);
  return s+"</div>";};
 // 계산 추천 넷이 시트 칸 몇 개와 맞는가 — 한 명은 한 칸만 먹는다(최대 배정).
 const matchCells=(picks,cells)=>{let bn=-1,ba=[];const used=cells.map(()=>0),cur=[];
  (function go(i,n){if(i===picks.length){if(n>bn){bn=n;ba=cur.slice();}return;}
   for(let k=0;k<cells.length;k++)if(!used[k]&&cells[k].indexOf(picks[i].h.id)>=0){used[k]=1;cur[i]=k;go(i+1,n+1);used[k]=0;}
   cur[i]=-1;go(i+1,n);})(0,0);
  return {n:bn,a:ba};};
 const top=pick4(poolS),calcTop=pick4(pool);
 // 시트 등재 영웅은 에픽 8명이 gen 0 이라 gcap 을 아무리 낮춰도 넷은 남는다. 그래도 비면 전체 풀로 되돌린다.
 const rec=top.length?top:calcTop;
 const recV=comboAll(rec),allV=comboAll(calcTop);
 const sheetRows=comp?[comp].concat(rivals||[]):[];
 o+='<h2>{{n}} '+L("조이너 안내","Joiner guide")+' <span>'+L("시트 조합 · 계산 추천 · S1만 기여","sheet set · calculated pick · only S1 counts")+
  (gcap<99?(LANG==="en"?' · Gen '+gcap+' and below':' · Gen '+gcap+' 이하'):'')+L(" · 병비 "," · ratio ")+r.inf.toFixed(0)+"/"+r.lan.toFixed(0)+"/"+r.mar.toFixed(0)+'</span></h2><div class="jgrid">';
 // ── 📋 시트 카드 ──
 o+='<div class="jcard sheet" id="sheet"><h3>📋 '+L("Ton 시트 조합","Ton sheet set")+' <span class="tag t-ok">'+L("시트 원문","sheet, as written")+"</span></h3>";
 if(comp){
  if(sheetRows.length>1)o+='<p class="cap" data-k="rivals">⚖️ <b>'+L("시트가 이 편성에 답을 "+sheetRows.length+"개 적어 뒀습니다.","The sheet gives "+sheetRows.length+" answers for this lineup.")+"</b> "+
   L("어느 쪽이 우선인지 시트가 적지 않았으므로 <b>우리도 고르지 않고 전부 그대로</b> 싣습니다. 공격/수비 라벨로는 갈리지 않습니다 — 전무는 영웅에 붙어 있고 위젯은 버킷에 들어가지 않아 조이너 계산이 공수에서 같습니다.",
     "It does not say which takes precedence, so <b>neither do we — all are shown as written</b>. The offense/defense label does not separate them: exclusive weapons belong to the heroes and widgets never enter a bucket, so joiner maths is the same on both sides.")+"</p>";
  sheetRows.forEach((c,i)=>{o+=sheetBlock(c,true,"effSheet"+(i?i+1:""),compTwins(d.comps,c));});
 }else if(near&&near.length){
  // 병비가 맞는 행이 없을 때 — 리더가 같은 시트 행을 안내한다(2026-10-10 사용자 요청). 판정이 아니라 안내다.
  o+='<p class="cap" data-k="near">📍 '+L("<b>이 병비로는 시트에 행이 없습니다.</b> 다만 <b>같은 리더 조합이 다른 병비로</b> 시트에 있습니다 — 아래가 그 행입니다(배율은 병비가 달라 재지 않았습니다).",
    "<b>The sheet has no row at this ratio.</b> But <b>the same leaders appear at other ratios</b> — those rows are below (not scored, since the ratio differs).")+"</p>";
  near.forEach(c=>{o+=sheetBlock(c,false,"")+'<p class="note" data-k="goto">'+L("이 병비로 보기: ","View at this ratio: ")+
    c.rs.map(v=>'<button type="button" class="chip" data-r="'+v.join(",")+'">'+v.join("/")+"</button>").join("")+"</p>";});
 }else o+='<p class="cap" data-k="none">'+(leaders.length<2?L("리더를 둘 이상 고르면 시트에서 같은 편성의 행을 찾습니다.","Pick at least two leaders and the matching sheet row is looked up."):
   L("<b>이 리더 조합은 시트에 없습니다.</b> 시트는 세대별 대표 편성 60행만 다룹니다 — 이럴 때는 옆의 계산 추천이 유일한 안내입니다.",
     "<b>The sheet has no row for these leaders.</b> It only covers 60 representative lineups by generation — here the calculated pick alongside is the only guidance."))+"</p>";
 o+='<p class="note">'+L("시트 = TontonYouTube 공개 시트(2026-11-10 사본). 필자의 실전 경험으로 적은 조합이라 계산과 다를 수 있습니다. 대안 칸은 시트가 순서를 매기지 않았고, <b>계산 추천에는 넣지 않았습니다</b>.",
   "Sheet = the public TontonYouTube sheet (copy of 2026-11-10). Its sets come from the author’s field experience, so they can differ from the maths. The sheet does not order its alternatives, and they are <b>not fed into the calculated pick</b>.")+"</p></div>";
 // ── 🧮 계산 카드 ──
 const dups=uniq(rec.filter(x=>x.dup).map(x=>esc(HN(x.h))));
 o+='<div class="jcol"><div class="jcard calc" id="rec"><h3>🧮 '+L("계산 추천","Calculated pick")+' <span class="tag t-ok">'+L("시트 등재만","sheet-listed only")+'</span></h3><p><b>'+
  rec.map(x=>hc(x,false)).join("")+'</b></p><p class="mult"><b>'+L("전투 배율 ×","Combat multiplier ×")+recV.toFixed(3)+'</b> <span class="note">'+L("리더만 있을 때 대비","vs the leaders alone")+"</span></p>"+
  stackNote(rec)+
  (dups.length?'<p class="note" data-k="dup">'+L("<b>"+dups.join("·")+"</b> — 리더도 쓰는 영웅입니다. 다른 연맹원이 자기 것을 데려오므로 막지 않습니다. 이미 채워진 버킷에 <b>한 장 더 얹는 값</b>으로 쟀습니다.",
    "<b>"+dups.join(", ")+"</b> is also a leader — another member brings their own copy, so it is allowed. It is scored as <b>one more copy</b> on a bucket the leader already filled.")+"</p>":"")+
  effTable(rec,"effRec")+
  // ⚠️ "시트를 안 본다" 고 뭉뚱그려 적지 말 것 — 후보 풀(시트 조이너 명단)과 동률 순서(sheetUse)는 시트에서 온다. 안 보는 것은 **이 편성에 걸리는 행**이다.
  '<p class="note" data-k="scope">'+L("<b>Ton 시트 조이너 명단에 오른 영웅 안에서</b>, 버킷 겹침을 보며 전투 배율이 가장 커지는 한 명씩 고른 답입니다. <b>이 편성에 걸리는 시트 행(시트 카드의 조합)은 보지 않습니다.</b> 시트에서 가져오는 것은 셋입니다 — ① 그 명단 ② 같은 영웅을 두 장 이상 넣을 수 있는 영웅("+stackNames+" — 시트가 한 행에 두 칸 이상 적은 영웅입니다) ③ 배율이 <b>완전히 같은</b> 후보끼리의 순서를 정할 때 쓰는 근처 세대(±2) 시트 행의 등장 빈도. ③ 에서도 이 편성의 행은 뺍니다.",
    "Chosen <b>among heroes on the Ton sheet’s joiner list</b>, one at a time — whoever raises the combat multiplier most given bucket overlap. <b>The sheet row for this lineup (the set on the sheet card) is not consulted.</b> Three things do come from the sheet: (1) that list; (2) which heroes may be taken more than once ("+stackNames+" — the ones the sheet writes in two or more cells of a single row); (3) how often a hero appears in sheet rows of nearby generations (±2) — used only to order candidates whose multipliers are <b>exactly equal</b>, and counted without this lineup’s own row.")+"</p></div>";
 if(rec.map(x=>x.h.id).join()!==calcTop.map(x=>x.h.id).join())
  o+='<div class="jcard theory" id="recAll"><h3>🧮 '+L("계산 추천 — 전체 영웅","Calculated pick — all heroes")+' <span class="tag t-warn">'+L("이론 포함","includes theory")+'</span></h3><p><b>'+
   calcTop.map(x=>hc(x,true)).join("")+'</b></p><p class="mult"><b>'+L("전투 배율 ×","Combat multiplier ×")+allV.toFixed(3)+'</b> <span class="note">'+
   L("시트 등재만 대비 ","vs sheet-listed only ")+(allV>=recV?"+":"")+((allV/recV-1)*100).toFixed(1)+"%</span></p>"+stackNote(calcTop)+effTable(calcTop,"effAll")+
   '<p class="note">'+L('시트 조이너 명단으로 <b>거르지 않고 전체 영웅에서</b> 같은 방법으로 고른 답입니다(두 장 이상 넣을 수 있는 영웅과 완전 동률일 때의 순서는 위와 같은 기준을 씁니다). <span class="tag t-warn">이론</span> 배지 영웅은 시트 조이너 명단에 없습니다 — <b>배율이 틀렸다는 뜻이 아니라</b> 실제로 Lv.5 로 올라와 조이너로 들어올 가능성이 낮다는 뜻입니다. <b>연맹원이 이미 만렙으로 갖고 있다면 이쪽이 맞습니다.</b>',
     'The same method <b>over every hero, without filtering by the sheet’s joiner list</b> (which heroes may repeat, and how exact ties are ordered, follow the same rules as above). Heroes tagged <span class="tag t-warn">theory</span> are not on that list — that does <b>not</b> mean the multiplier is wrong, only that such a hero is unlikely to show up maxed as a joiner. <b>If someone in your alliance already has it maxed, this is the list to use.</b>')+"</p></div>";
 o+="</div></div>";
 // ── 🔍 시트 vs 계산 — **걸린 시트 행마다** 비교한다. 시트가 답을 둘 적은 편성에서 대표 행 하나만 비교하면,
 // 위에서는 "우리도 고르지 않는다" 고 해 놓고 여기서 몰래 한 행을 고른 셈이 된다(2026-11-11 리뷰).
 const sheetIds=[];
 if(comp){
  o+='<div class="callout co-tip" id="cmp"><h3>🔍 '+L("시트 vs 계산","Sheet vs calculation")+"</h3>";
  sheetRows.forEach((c,ri)=>{
   const got=sheetPick(c).filter(Boolean),m=matchCells(rec,c.j);
   got.forEach(z=>sheetIds.push(z.h.id));
   const hit=c.j.map(()=>0);m.a.forEach(k=>{if(k>=0)hit[k]=1;});
   const onlyS=c.j.filter((_,k)=>!hit[k]).map(names),onlyC=rec.filter((_,i)=>!(m.a[i]>=0)).map(x=>esc(HN(x.h)));
   const sv=comboAll(got),blank=got.length<4,un=uniq(got.filter(z=>!scored(z)).map(z=>esc(HN(z.h)))),fair=!blank&&!un.length;
   // 비교가 안 되는 이유를 있는 그대로 — 빈칸 때문인지, 배율에 못 넣은 영웅 때문인지, 둘 다인지
   const why=blank&&un.length?L("시트가 조이너 칸을 "+got.length+"칸만 채웠고, 배율에 넣지 못한 영웅(<b>"+un.join("·")+"</b>)도 있습니다(S1 버킷 미확정).","the sheet fills only "+got.length+" joiner cells, and <b>"+un.join(", ")+"</b> in its set cannot be scored either (S1 bucket unconfirmed).")
    :blank?L("시트가 조이너 칸을 "+got.length+"칸만 채웠습니다.","the sheet fills only "+got.length+" joiner cells.")
    :L("시트 조합에 배율에 넣지 못한 영웅(<b>"+un.join("·")+"</b>)이 있습니다(S1 버킷 미확정).","<b>"+un.join(", ")+"</b> in the sheet’s set cannot be scored (S1 bucket unconfirmed).");
   o+='<div class="cmprow">'+(sheetRows.length>1?'<p class="shd"><span class="tag t-ok">Gen '+c.g+"</span>"+(/^\s*META/i.test(c.lb)?'<span class="tag t-warn">META</span>':"")+" <b>"+esc(lbText(c))+"</b></p>":"")+"<p>"+
    L("시트 기본 조합 "+c.j.length+"칸 중 <b>"+m.n+"칸</b>이 계산 추천과 같습니다.","<b>"+m.n+" of "+c.j.length+"</b> cells in the sheet’s main set match the calculated pick.")+
    (onlyS.length||onlyC.length?" "+L("시트에만 <b>"+(onlyS.join(" · ")||"—")+"</b> · 계산에만 <b>"+(onlyC.join(" · ")||"—")+"</b>.","Sheet only: <b>"+(onlyS.join(" · ")||"—")+"</b> · calculation only: <b>"+(onlyC.join(" · ")||"—")+"</b>."):"")+"</p><p>"+
    L("우리 공식으로 잰 배율 — 시트 조합 <b>×"+sv.toFixed(3)+"</b> · 계산 추천 <b>×"+recV.toFixed(3)+"</b>","Scored by our formula — sheet set <b>×"+sv.toFixed(3)+"</b> · calculated pick <b>×"+recV.toFixed(3)+"</b>")+
    (fair?L(" (계산 쪽 "+(recV>=sv?"+":"")+((recV/sv-1)*100).toFixed(1)+"%)."," (calculation "+(recV>=sv?"+":"")+((recV/sv-1)*100).toFixed(1)+"%)."):
      L(". <b>이 둘은 그대로 비교할 수 없습니다</b> — ",". <b>These two are not directly comparable</b> — ")+why)+"</p></div>";});
  o+='<p class="cap">'+L("시트는 필자의 실전 경험, 계산은 버킷 공식입니다. 둘이 다를 때 <b>어느 쪽이 맞는지는 이 도구로 가릴 수 없습니다</b> — 실전 전투 리포트가 있어야 합니다. 계산은 누가 그 영웅을 Lv.5 로 갖고 있는지도 모릅니다. 연맹원이 실제로 데려올 수 있는 영웅에 맞춰 둘을 참고하세요.",
     "The sheet is the author’s field experience; the calculation is the bucket formula. Where they differ, <b>this tool cannot tell which is right</b> — that takes real battle reports. The calculation also does not know who actually has a hero at Lv.5. Use both, against what your members can really bring.")+"</p></div>";}
 // ── 💡 규칙 레이어 — 수치 모델이 없는 판단. 점수를 건드리지 않는다. 시트 조합(걸린 행 전부)과 계산 추천을 둘 다 본다.
 {const calcIds=rec.map(x=>x.h.id);
  const rl=joinerRules(d.ids,r,combos&&combos[0],buck,d.skHeavy,gcap,calcIds.concat(sheetIds),{rows:sheetRows,calc:calcIds});
  if(rl.length)o+='<div class="callout co-key" id="rules"><h3>💡 '+L("이 편성에서 같이 볼 것","Also worth knowing for this lineup")+'</h3><ul class="rules">'+
   rl.map(x=>'<li class="'+x.level+'" data-code="'+x.code+'">'+x.text+"</li>").join("")+"</ul></div>";}
 o+=comboPanel(d);
 // ── 단일 후보 순위표 (접힘) ──
 o+='<div class="panel"><details class="fold" id="single"><summary>'+L("단일 후보 순위표 — 조이너를 1명씩 넣었을 때의 한계 배율 (펼치기)","Single-candidate ranking — the marginal multiplier of one joiner at a time (expand)")+'</summary><div class="xscroll"><table><thead><tr><th>#</th><th>'+L("조이너","Joiner")+'</th><th>'+L("S1 스킬","S1 skill")+'</th><th>'+L("칸","Slot")+'</th><th>'+L("계산","Working")+'</th><th>'+L("배율","Multiplier")+'</th></tr></thead><tbody>';
 rank.slice(0,14).forEach((x,i)=>{
  const dmg=x.e.slot!=="X"&&SLOTS[x.e.slot]&&SLOTS[x.e.slot].k==="dmg";
  o+="<tr"+(x.mul<=1.001?' class="dead"':"")+"><td>"+(i+1)+'</td><td class="b"><span class="hrow">'+hpic(x.h)+"<span>"+esc(HN(x.h))+"</span></span>"+
   (x.dup?'<span class="tag t-warn">'+L("리더도 씀","also a leader")+'</span>':"")+(x.h.s?'<span class="tag t-ok">'+L("시트","sheet")+'</span>':'<span class="tag t-warn">'+L("이론","theory")+'</span>')+
   '</td><td class="cap">'+esc(L(x.e.t,x.e.te||x.e.t))+"</td><td>"+(x.e.slot==="X"?sTag("X")+(x.e.bk?sTag(x.e.bk):""):sTag(x.e.slot)+(x.e.also?sTag(x.e.also.slot):""))+
   (x.cond?'<div class="note">'+x.cond.split("|")[1]+"</div>":"")+'</td><td class="note">'+x.detail.map(esc).join("<br>")+
   '</td><td class="big">×'+x.mul.toFixed(3)+'<div class="note">'+(x.e.slot==="X"?L("조건부","conditional"):dmg?L("딜","damage"):L("생존","survival"))+"</div></td></tr>";});
 o+="</tbody></table></div>";
 o+='<p class="cap">'+L("한 명만 넣었을 때의 값이라 <b>위 추천 4명과 순서가 다를 수 있습니다</b> — 추천은 넷을 같이 넣고 버킷 겹침을 본 값입니다. 배율이 같으면 <b>투자 문턱</b>으로 가릅니다 — <b>시트 등재 → 근처 세대(±2) 시트 행에서 자주 쓰인 영웅 → 에픽 → 낮은 세대</b> 순. 계산이 더 못 가르는 자리라, 실제로 Lv.5 까지 올라와 있을 가능성이 높은 쪽을 앞세웁니다. 빈도를 셀 때 지금 이 편성에 걸리는 시트 행은 뺍니다. 값을 바꾸는 게 아니라 같은 값 안에서만 순서를 정합니다.",
   "These are one-joiner-at-a-time figures, so <b>the order can differ from the four picked above</b> — the pick scores all four together with bucket overlap. Equal multipliers are broken by the <b>investment threshold</b> — <b>sheet-listed first, then heroes the sheet uses most in nearby generations (±2), then epics, then lower generations</b>. The model cannot separate them, so the tie goes to whoever is more likely to actually be maxed. The count leaves out any sheet row that matches this very lineup. This only orders within a tie; it never changes a value.")+"</p></details>";
 // ── 계산 방식 (접힘) — 편성과 무관한 일반 설명은 여기 모은다. 이 편성에 걸리는 경고는 접지 않는다(위 💡 · ⚠️).
 o+='<details class="fold" id="how"><summary>'+L("계산 방식과 한계 — 왜 이렇게 고르나 (펼치기)","How this is calculated, and its limits (expand)")+"</summary>"+
  '<p class="cap">'+L("추천 넷은 단일 순위표 상위 4명을 그냥 자른 게 아니라, <b>포화를 보며 한 명씩</b> 골랐습니다 — 매번 “여기에 더했을 때 전투 배율이 가장 커지는 한 명”입니다. 자르기만 하면 <b>제시·제셀·제로니모처럼 같은 버킷(파괴력)에 들어가는 영웅이 나란히 뽑힙니다</b>(각자 ×1.250 이지만 둘째는 ×1.200, 셋째는 ×1.167 로 떨어집니다).",
     "The four are not the top four of the single-candidate ranking — each is picked in turn as <b>whoever raises the combined multiplier most</b>, given the ones already chosen. Plain truncation lines up heroes that share a bucket (Jessie, Jasser and Jeronimo all fill Lethality: ×1.250, then ×1.200, then ×1.167).")+"</p>"+
  '<p class="cap">'+L("전투 배율은 네 명의 단독 배율을 곱한 값이 아니라 <b>같은 칸에 겹치는 분을 합쳤을 때</b>의 값입니다. 단독 배율을 차례로 곱하면 더 크게 나오는데, 그건 포화를 빼먹은 숫자입니다. 그리고 <b>생존 칸도 같은 무게로 셉니다</b> — 전투비를 양쪽 식으로 펴면 <code>(내딜증 × 내감소) ÷ (상대딜증 × 상대감소)</code> 라, 내 딜 칸과 내 감소 칸이 결과에 똑같이 곱해집니다.",
     "The combat multiplier is not the product of the four individual figures — it is what you get after <b>adding up the parts that land in the same slot</b>. Multiplying the single figures together gives a larger number that ignores saturation. <b>Survival slots count the same</b>: expand the kill ratio for both sides and it reduces to <code>(my damage-up × my reduction) ÷ (theirs × theirs)</code>, so your damage slots and your reduction slots multiply the outcome equally.")+"</p>"+
  '<p class="cap">'+L("기본 계산 추천을 <b>시트 조이너 명단 영웅으로 한정</b>하는 이유는 <b>투자 문턱</b>입니다 — 이론 순위가 높아도 전설은 만렙 보유자가 적고, 만렙 찍은 사람은 대개 이미 그 영웅을 리더로 쓰고 있어 조이너로 못 뺍니다. 시트 58행과 대조했더니 <b>이쪽이 #1 재현 81.0% · 겹침 61.8%</b> 로, 계산 순위 그대로(79.3% · 56.6%)보다 낫고 <b>한 행도 나빠지지 않았습니다</b>. (#1 을 놓친 행은 대부분 시트 #1 이 레니인 행입니다 — 레니 S1 은 버킷이 미확정이라 점수에 넣지 않습니다. 그 행을 빼면 97.9% 입니다.)",
     "The default calculated pick is <b>limited to heroes on the sheet’s joiner list</b> because of the <b>investment threshold</b>: legendaries are rarely maxed, and whoever did max one is usually already running it as a leader. Checked against all 58 sheet rows, this list reproduces the sheet’s #1 joiner <b>81.0%</b> of the time with <b>61.8%</b> overlap, against 79.3% / 56.6% for the all-hero pick — and it was never worse on any row. (Most #1 misses are rows whose sheet #1 is Renee — her S1 bucket is unconfirmed, so she is not scored. Without those rows it is 97.9%.)")+"</p>"+
  '<p class="cap">'+L("계산이 같은 영웅을 두 번 고를 수 있는 것은 <b>시트가 한 행에 그 영웅을 두 칸 이상 적어 둔 경우만</b>입니다 — 지금은 <b>노라·패트릭</b> 둘뿐이고, 나머지는 중복이 막혀 있습니다. 둘째 장도 같은 칸에 합연산으로 들어가 <b>자기끼리 포화</b>하므로, 그래도 이득일 때만 집습니다. 같은 버킷의 확률형은 효과가 겹치지 않고 발동 확률만 오른다고 보고, 미아·플로라는 병종마다 50% 판정입니다.",
     "The calculation may pick a hero twice only where <b>the sheet itself writes that hero in two or more cells of a row</b> — today that is <b>Norah and Patrick</b>; everyone else is blocked from repeating. A second copy still adds into the same slot, so it <b>saturates against itself</b> and is taken only when it still wins. Chance skills in the same bucket are assumed not to stack their effect — only the trigger chance rises — and Mia/Flora roll 50% per troop type.")+"</p>"+
  // 감소 계열이 왜 25% 증가에 지는지 — 근거는 볼트 「랠리 조이너 선정 규칙·개리슨 운영 (Ton)」 §5·§8.
  // 배율은 이미 그 나눗셈으로 계산돼 있다(감소 버킷도 1+Σ 로 쌓이므로 20% 는 ×1.200). "×1.200 과 ×1.250 은 5%p 차이" 로 읽히기 때문에 적어 둔다.
  '<div class="callout co-warn"><h3>'+L("⚠️ 감소 계열(20%)은 나눗셈이라 25% 증가에 진다","⚠️ Reduction skills (20%) divide — they lose to a 25% increase")+'</h3><p>'+
  L("흔한 오해는 <b>25% 증가(×1.25)와 20% 감소(×0.8)가 상쇄된다</b>는 것입니다. 감소는 곱하는 게 아니라 <b>나눕니다</b> — <b>1.25 ÷ 1.2 = 1.0417</b> 로 증가 쪽이 4.17% 앞섭니다. 네 장씩 쌓으면 <b>2.0 ÷ 1.8 = 1.111</b> 로 11.1% 벌어집니다. 20% 계열이 \"25%보다 5%p 약한\" 게 아니라 <b>구조적으로</b> 약합니다.",
    "The common misconception is that a 25% increase (×1.25) and a 20% reduction (×0.8) cancel out. Reductions <b>divide</b> rather than multiply — <b>1.25 ÷ 1.2 = 1.0417</b>, so the increase is 4.17% ahead. Stack four of each and it is <b>2.0 ÷ 1.8 = 1.111</b>, an 11.1% gap. A 20% reduction is not \"5pp weaker than 25%\" — it is <b>structurally</b> weaker.")+
  '</p><p>'+L("위 배율은 <b>이미 이 나눗셈으로 계산돼 있습니다</b> — 20% 감소 스킬이 ×1.200 으로 나오는 게 그 값입니다. 그리고 <b>공격용·방어용 조이너 구분은 없습니다</b>: 데미지 공식이 공수 동일하고 갈리는 건 위젯뿐이라, <b>방어 상황에서도 25% 증가 계열을 쌓는 쪽</b>이 낫습니다.",
    "The multipliers above already carry this division — a 20% reduction showing ×1.200 <em>is</em> that value. And there is no such thing as an offensive or defensive joiner: the damage formula is identical for both, only widgets differ, so <b>stacking 25% increases wins even on defense</b>.")+
  '</p><p class="cap">'+L("예외 — 상대가 같은 영웅을 4스택하면 상대 칸이 이미 합연산으로 포화라 우리 감소가 상대적으로 크게 먹힙니다. 그때는 20% 계열도 쓸 만합니다. · 근거: 볼트 「랠리 조이너 선정 규칙·개리슨 운영 (Ton)」 §5·§8 (Ton 반복 테스트)",
    "Exception — if the enemy stacks the same hero four times, their slot is already saturated by addition, so your reduction bites relatively harder; 20% skills are worth taking then. · Source: vault note “Rally joiner selection & garrison ops (Ton)”, §5 and §8.")+"</p></div></details>";
 // ── 시트 머리말 (접힘) — 두 탭 머리의 지침을 원문 그대로 ──
 o+='<details class="fold" id="tips"><summary>'+L("📜 시트 머리말 — Ton 이 적어 둔 조이너 고르는 지침 (펼치기)","📜 The sheet’s own head notes on choosing joiners (expand)")+'</summary><ul class="rules">'+
  SHEET_TIPS.map(t=>"<li>"+(LANG==="en"?esc(t[0]):esc(t[1])+'<div class="note">'+esc(t[0])+"</div>")+"</li>").join("")+"</ul></details></div>";
 part.join=o;o="";

 // 카운터 · 밴드 — 근거는 가이드 카운터표 하나뿐이다
 if(ctr){
  const e=ctr.en,mine=[r.inf,r.lan,r.mar],def=ctr.mode==="defender";
  const enLbl=def?L("들어오는 랠리","Incoming rally"):L("상대 방어","Their defense");
  o+='<h2>{{n}} '+(def?L("들어오는 랠리 · 수비","Incoming rally · garrison"):L("상대 카운터 · 랠리 밴드 판정","Counter table · rally ban check"))+'</h2><div class="panel">';
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
 part.ctr=o;
 // 순서 (2026-11-11 사용자 결정): 조이너 안내가 맨 위. 상대 병비를 넣었으면 카운터 판정이 그다음이고, 리더·버킷·위젯·병종 진단은 그 아래다.
 const NUM=["①","②","③","④","⑤","⑥","⑦"];let k=0;
 setOut(["warn","join","ctr","lead","buck","wid","cls"].map(key=>part[key]?part[key].replace("{{n}}",()=>NUM[k++]):"").join(""));
}
// #out 을 갈아끼우는 **유일한 자리**다 — render 도, calc 의 "리더를 고르세요" 안내도 여기를 거친다.
// 결과가 같으면 다시 그리지 않는다. 입력칸은 input 과 change 를 둘 다 듣는데, 숫자를 고치고 곧바로 결과 안의 버튼·접기를 누르면
// 포커스가 빠지며 change 가 한 번 더 온다 — 그때 통째로 갈아끼우면 누르던 요소가 사라져 **첫 클릭이 삼켜진다**(2026-11-11 브라우저 검사에서 잡힘).
// 진짜로 바뀔 때는 열어 둔 접기를 다시 열어 준다 — 순위표를 펴 놓고 병비를 만지는 동안 계속 닫히면 못 쓴다.
// ⚠️ 다른 곳에서 out.innerHTML 을 직접 쓰지 말 것. LAST_OUT 이 안 따라가면 "같은 결과" 라고 오판해 화면이 안 돌아온다 —
// 리더를 다 비웠다가 같은 리더를 다시 고르면 안내문이 그대로 남던 버그가 그거였다(2026-11-11 리뷰).
let LAST_OUT=null;
function setOut(html){
 const out=document.getElementById("out");
 if(html===LAST_OUT)return;
 const fkey=x=>x.id||(x.querySelector("table[id]")||{}).id||"";
 const opened=Array.from(out.querySelectorAll("details[open]")).map(fkey).filter(Boolean);
 out.innerHTML=html;LAST_OUT=html;
 if(opened.length)Array.from(out.querySelectorAll("details")).forEach(x=>{if(opened.indexOf(fkey(x))>=0)x.open=true;});
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

// ── 편성 저장 · 이전 편성 (localStorage) ───────────────────────────────
// 두 가지를 한다: ① 마지막 편성(cur)을 다음에 열었을 때 그대로 되살린다 ② 그 전에 조합했던 편성(hist)을 칩으로 깔아 눌러서 불러온다.
// 저장이 막힌 환경(사생활 보호 창 · 스텁)에서도 계산은 돌아야 하므로 읽기·쓰기를 전부 try 로 감싼다 — 장비 탭(GEAR_LS)과 같은 방식이다.
//
// 편성 하나 = {m 모드, l 리더 3, w 전무 3, r 내 병비 3, e 상대 병비 3, g 서버 세대, sk 토글}. 값은 입력칸의 문자열 그대로다.
// 같은 편성인지는 luKey(모드 · 리더 · 내 병비 · 세대)로 가린다 — 전무·상대 병비·토글은 같은 편성의 딸린 값이라 덮어쓴다.
//
// 언제 hist 에 넣는가: **그 편성을 떠나는 순간**, 그리고 그 편성이 HIST_SETTLE_MS 동안 그대로였을 때만.
//  · 리더 셋을 하나씩 바꾸는 중간 상태 · 병비를 타이핑하는 중간 숫자는 금방 지나가므로 안 남는다. 픽커를 열어 둔 시간은 세지 않는다(luBusy).
//  · 타이머는 "머물렀다" 는 표시(LU_SETTLED)만 세운다 — **DOM 을 건드리지 않는다.** 목록이 바뀌는 건 언제나 사용자가 무언가를 누른 순간이라,
//    칩을 누르려는 찰나에 목록이 밀려 엉뚱한 편성을 부르는 일이 없다.
//  · **칩을 눌러 떠날 때만은 머문 시간을 묻지 않는다** — 화면에 있던 편성을 언제나 남긴다. 방금 다 고른 편성을 3초 안에 칩으로 덮으면
//    어디에도 안 남아 되돌아갈 길이 없었다(독립 검증이 짚었다). 목록이 바뀌는 순간이 어차피 그 클릭이라 "누르려는 찰나에 밀림" 과도 무관하다.
//  · 지금 화면의 편성은 목록에서 뺀다(입력칸이 곧 그것이다). 그래서 칩을 누르면 그 칩이 사라지고 방금까지의 편성이 맨 앞에 생긴다 — 첫 칩을 누르면 되돌아간다.
const COMP_LS="wos-calc:comp:v1",HIST_MAX=12,LU_CLS=["infantry","lancer","marksman"];
let HIST_SETTLE_MS=3000;   // let — 검사가 0 으로 내려 타이머 없이 돌린다. 값 자체는 우리가 고른 것이다(픽커에서 옆 픽커로 넘어가는 1~2초보다 길고, 결과를 훑어보는 시간보다 짧게)
let LU_PREV=null,LU_SETTLED=false,LU_TIMER=null,HIST_HTML=null;
function luClean(x){
 if(!x||typeof x!=="object")return null;
 const a3=a=>Array.isArray(a)&&a.length===3;
 if(!a3(x.l)||!a3(x.w)||!a3(x.r)||!a3(x.e))return null;
 const num=(v,max)=>{const t=String(v==null?"":v).trim();if(t==="")return "";const n=+t;return isFinite(n)?String(Math.max(0,Math.min(max,n))):"";};
 const g=String(x.g),maxGen=Math.max.apply(null,HEROES.map(h=>h.gen||0));
 return {m:x.m==="defender"?"defender":"rally",
  l:x.l.map((id,i)=>{const h=byId[id];return h&&h.cls===LU_CLS[i]?h.id:"";}),   // 없어진 영웅 · 병종이 안 맞는 id 는 빈 칸으로
  w:x.w.map(v=>num(v,10)),r:x.r.map(v=>num(v,9999)),e:x.e.map(v=>num(v,9999)),
  g:g==="99"||(/^\d+$/.test(g)&&+g>=1&&+g<=maxGen)?String(+g):"99",sk:x.sk?1:0,t:+x.t||0};   // String(+g) — "007" 같은 값이 select 에 없는 옵션으로 들어가 칸이 비지 않게
}
function luKey(s){return [s.m,s.l.join(","),s.r.map(v=>+v||0).join("/"),s.g].join("|");}
function luState(){
 const v=id=>document.getElementById(id).value;
 return luClean({m:document.getElementById("mAtk").classList.contains("on")?"rally":"defender",
  l:["hInf","hLan","hMar"].map(v),w:["wInf","wLan","wMar"].map(v),r:["r1","r2","r3"].map(v),e:["e1","e2","e3"].map(v),
  g:v("gcap"),sk:document.getElementById("skHeavy").checked?1:0});
}
function luRead(){
 let d=null;
 try{d=JSON.parse(localStorage.getItem(COMP_LS)||"null");}catch(e){}
 const o={cur:null,hist:[]},seen={};
 if(d&&typeof d==="object"){
  o.cur=luClean(d.cur);
  if(Array.isArray(d.hist))o.hist=d.hist.map(luClean).filter(x=>{   // 리더가 하나도 없는 것 · 같은 편성이 두 번 든 것은 버린다
    if(!x||!x.l.some(Boolean))return false;const k=luKey(x);if(seen[k])return false;seen[k]=1;return true;}).slice(0,HIST_MAX);
 }
 return o;
}
function luWrite(d){try{localStorage.setItem(COMP_LS,JSON.stringify({v:1,cur:d.cur,hist:d.hist}));}catch(e){}}
function histPush(list,s){
 const k=luKey(s);
 return [Object.assign({},s,{t:Date.now()})].concat(list.filter(x=>luKey(x)!==k)).slice(0,HIST_MAX);
}
function setMode(m){
 const d=m==="defender";
 document.getElementById(d?"mDef":"mAtk").classList.add("on");document.getElementById(d?"mAtk":"mDef").classList.remove("on");
 document.getElementById("eLab").innerHTML=d?S("lbEnD"):S("lbEnA");
}
function luApply(s){
 const set=(ids,vals)=>ids.forEach((id,i)=>{document.getElementById(id).value=vals[i];});
 setMode(s.m);
 set(["gcap"],[s.g]);set(["hInf","hLan","hMar"],s.l);set(["wInf","wLan","wMar"],s.w);set(["r1","r2","r3"],s.r);set(["e1","e2","e3"],s.e);
 document.getElementById("skHeavy").checked=!!s.sk;
 PICKERS.forEach(p=>syncPicker(p[0],p[2],p[3]));
}
// 리더 픽커를 열어 둔 동안은 "머문" 게 아니다 — 다음 리더를 고르는 중이다. 리더 셋을 차례로 바꿀 때 격자를 훑는 몇 초가
// 머문 시간으로 세어지면 중간 편성(새 보병 + 옛 창·궁)이 목록에 쌓인다. 읽기만 한다(아래 규칙 그대로 — 타이머는 화면을 안 바꾼다).
function luBusy(){return PICKERS.some(p=>{const d=document.getElementById(p[1]);return !!(d&&d.open);});}
function luArm(){
 if(LU_TIMER!=null&&typeof clearTimeout==="function")clearTimeout(LU_TIMER);
 LU_TIMER=null;
 if(HIST_SETTLE_MS<=0||typeof setTimeout!=="function"){LU_SETTLED=true;return;}
 LU_TIMER=setTimeout(()=>{LU_TIMER=null;if(luBusy())luArm();else LU_SETTLED=true;},HIST_SETTLE_MS);
}
// 사용자가 입력을 건드릴 때마다 부른다(초기 렌더 · 언어 전환에서는 안 부른다). loaded — 이전 편성 칩으로 불러온 것:
// ① 떠나는 편성을 머문 시간과 무관하게 남긴다 ② 불러온 편성은 이미 조합했던 것이라 곧바로 머문 것으로 친다.
function luTrack(loaded){
 const s=luState(),d=luRead();
 if(LU_PREV&&luKey(LU_PREV)!==luKey(s)){
  if((LU_SETTLED||loaded)&&LU_PREV.l.some(Boolean))d.hist=histPush(d.hist,LU_PREV);
  LU_SETTLED=false;
 }
 LU_PREV=s;d.cur=s;luWrite(d);
 if(loaded){if(LU_TIMER!=null&&typeof clearTimeout==="function")clearTimeout(LU_TIMER);LU_TIMER=null;LU_SETTLED=true;}
 else if(!LU_SETTLED)luArm();   // 아직 안 머문 편성 — 마지막으로 건드린 때부터 다시 잰다
 histDraw();
}
function histDraw(){
 const box=document.getElementById("hist");if(!box)return;
 const cur=luKey(luState()),list=luRead().hist.filter(x=>luKey(x)!==cur);
 const nm=id=>esc(HN(byId[id])).replace(/"/g,"&quot;");
 const html=!list.length?"":'<div class="hhd"><b>🕘 '+L("이전 편성","Earlier lineups")+"</b>"+
   L("눌러서 불러옵니다 · 이 브라우저에만 저장됩니다","Click one to load it · stored in this browser only")+'</div><div class="hrow">'+
  list.map(x=>{
   const ratio=x.r.map(v=>+v||0).join("/"),k=esc(luKey(x)).replace(/"/g,"&quot;");
   const tip=x.l.filter(Boolean).map(nm).join(" · ")+" — "+(x.m==="defender"?L("수성","Garrison"):L("공성","Rally"))+" · "+ratio+" · "+
    (x.g==="99"?L("세대 전체","all generations"):L("Gen "+x.g+" 이하","Gen "+x.g+" and below"))+
    (x.e.some(v=>+v>0)?" · "+L("상대 ","enemy ")+x.e.map(v=>+v||0).join("/"):"");
   // 초상은 hpic 을 안 쓴다 — 그림을 못 불러와도 alt(영웅 이름)가 그 자리에 남아야 누구의 편성인지 읽힌다
   return '<span class="hchip"><button type="button" class="hgo" data-k="'+k+'" title="'+tip+'" aria-label="'+L("불러오기: ","Load: ")+tip+'">'+
    "<i>"+(x.m==="defender"?"🛡️":"⚔️")+"</i>"+
    x.l.map(id=>id?'<img class="hpic sm" loading="lazy" alt="'+nm(id)+'" src="img/heroes/'+encodeURIComponent(id)+'.webp">':'<i class="hnone">–</i>').join("")+
    "<b>"+ratio+'</b><span class="cap">'+(x.g==="99"?L("전체","All"):"G"+x.g)+"</span></button>"+
    '<button type="button" class="hx" data-k="'+k+'" title="'+L("이 편성 지우기","Remove this lineup")+'" aria-label="'+L("지우기: ","Remove: ")+tip+'">✕</button></span>';
  }).join("")+"</div>";
 if(html===HIST_HTML)return;   // 같으면 다시 안 그린다 — 전무 레벨만 고칠 때마다 칩을 갈아끼울 이유가 없다
 HIST_HTML=html;box.innerHTML=html;
}
const showSums=()=>{showSum("rSum",["r1","r2","r3"]);showSum("eSum",["e1","e2","e3"]);};
function histLoad(k){
 const s=luRead().hist.filter(x=>luKey(x)===k)[0];
 if(!s){histDraw();return;}   // 다른 탭에서 이미 지운 칩 — 죽은 칩을 남겨 두지 않고 목록을 지금 저장값으로 다시 그린다
 luApply(s);showSums();calc();luTrack(true);
}
function histDel(k){
 const d=luRead();d.hist=d.hist.filter(x=>luKey(x)!==k);luWrite(d);histDraw();
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
 histDraw();   // 칩의 영웅 이름·툴팁도 언어를 따른다
}
// ── init ──
(function(){
 rebuildSelects();
 document.getElementById("gcap").value="4";
 document.getElementById("hInf").value="jeronimo";
 document.getElementById("hLan").value="mia";
 document.getElementById("hMar").value="alonso";
 // 마지막 편성이 저장돼 있으면 기본값 대신 그것으로 연다
 const saved=luRead().cur;
 if(saved)luApply(saved); else PICKERS.forEach(p=>syncPicker(p[0],p[2],p[3]));
 // 사용자가 입력을 건드린 뒤의 공통 처리 — 다시 계산하고, 편성을 저장·기록한다
 const touched=()=>{showSums();calc();luTrack();};
 document.getElementById("mAtk").onclick=()=>{setMode("rally");calc();luTrack();};
 document.getElementById("mDef").onclick=()=>{setMode("defender");calc();luTrack();};
 document.getElementById("lgKo").onclick=()=>setLang("ko");
 document.getElementById("lgEn").onclick=()=>setLang("en");
 // 📍 "이 병비로 보기" — 시트 카드가 안내한 행의 병비를 내 병비 칸에 넣는다. #out 은 calc 마다 통째로 갈리므로 위임으로 듣는다.
 document.getElementById("out").addEventListener("click",ev=>{
  const b=ev.target&&ev.target.closest?ev.target.closest("[data-r]"):null;if(!b)return;
  b.getAttribute("data-r").split(",").forEach((v,i)=>{document.getElementById("r"+(i+1)).value=v;});
  touched();});
 // 🕘 이전 편성 칩 — 목록은 통째로 갈리므로 위임으로 듣는다
 document.getElementById("hist").addEventListener("click",ev=>{
  const box=ev.currentTarget,b=ev.target&&ev.target.closest?ev.target.closest("button[data-k]"):null;if(!b)return;
  const del=b.classList.contains("hx"),k=b.getAttribute("data-k");
  // 불러오기는 더블클릭의 둘째 클릭을 버린다 — 첫 클릭에 목록이 한 칸 밀려서 같은 자리에 방금까지의 편성이 와 있다.
  // ✕ 에는 안 건다: detail 은 이어 누르는 동안 계속 올라가서, 걸면 칩을 연달아 지울 때 첫 번째만 지워진다
  if(!del&&ev.detail>1)return;
  const had=ev.detail===0||box.contains(document.activeElement),i=[].indexOf.call(box.querySelectorAll(".hx"),b);
  if(del)histDel(k);else histLoad(k);
  // 눌린 칩은 사라진다 — 포커스가 body 로 빠져 키보드·스크린리더 사용자가 칩 줄을 잃지 않게 옮긴다.
  // 지웠으면 그 자리에 온 칩의 ✕, 불러왔으면 맨 앞 칩(방금 떠난 편성 — 한 번 더 누르면 되돌아간다)
  if(had){const list=box.querySelectorAll(del?".hx":".hgo"),t=list[del?Math.min(i,list.length-1):0];if(t)t.focus();}
 });
 ["hInf","hLan","hMar","wInf","wLan","wMar","r1","r2","r3","e1","e2","e3","gcap","skHeavy"].forEach(id=>{
  const el=document.getElementById(id);el.addEventListener("change",touched);el.addEventListener("input",touched);});
 applyStatic();
 showSums();
 calc();
 // 지금 화면의 편성을 기준점으로 잡는다. 되살린 편성은 이미 조합했던 것이라 머문 것으로 치고, 처음 뜬 기본 편성은 사용자가 건드리기 전에는 기록하지 않는다
 LU_PREV=luState();LU_SETTLED=!!saved;histDraw();
})();
