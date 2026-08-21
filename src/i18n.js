/* ── i18n ──────────────────────────────────────────────────────────────
   L(ko,en)  : 인라인 문자열 쌍. 본문 옆에 번역을 두어 누락을 막는다.
   HN(hero)  : 영웅 표시명 (LANG에 따라 kr/en)
   STR       : part1.html의 정적 마크업 대응표
   언어 결정 순서: ?lang= 쿼리 > navigator.language > 기본 ko
------------------------------------------------------------------------ */
var LANG=(function(){
 try{
  var q=new URLSearchParams(location.search).get("lang");
  if(q==="en"||q==="ko")return q;
  var n=(navigator.language||"ko").toLowerCase();
  return n.indexOf("ko")===0?"ko":"en";
 }catch(e){return "ko";}
})();
function L(ko,en){return LANG==="en"?en:ko;}
function HN(h){return LANG==="en"?(h.en||h.kr):h.kr;}
var CLSN={infantry:["보병","Infantry"],lancer:["창병","Lancer"],marksman:["궁병","Marksman"]};
function CN(c){return L(CLSN[c][0],CLSN[c][1]);}

var STR={
 title:["WOS 편성 계산기 — 조이너·위젯·칸 진단","WOS Formation Calculator — joiners, widgets, slot saturation"],
 h1:['WOS 편성 계산기 <span class="cap">— 조이너 · 위젯 · 칸 진단</span>',
     'WOS Formation Calculator <span class="cap">— joiners · widgets · slot diagnosis</span>'],
 sub:['리더 3명과 병비를 넣으면 <b>SkillMod 칸 포화 · 위젯 발동 · 병종 전용 스킬 사망 · 조이너 한계 배율</b>을 자동 계산합니다. 영웅 45명 데이터 내장.',
      'Enter three leaders and a troop ratio and it works out <b>SkillMod slot saturation, widget activation, dead class-locked skills and joiner marginal multipliers</b>. 45 heroes built in.'],
 mAtk:["⚔️ 공성","⚔️ Rally"], mDef:["🛡️ 수성","🛡️ Garrison"],
 lbInf:["보병 리더","Infantry leader"], lbLan:["창병 리더","Lancer leader"], lbMar:["궁병 리더","Marksman leader"],
 wTip:["전무 레벨","Exclusive-gear level"],
 lbMine:['내 병비 <span class="cap">(보 / 창 / 궁 — 세 칸 모두 채우세요)</span>',
         'My ratio <span class="cap">(inf / lancer / marksman — fill all three)</span>'],
 lbEnA:["상대 방어 병비 (선택)","Their defense ratio (optional)"],
 lbEnD:["들어오는 랠리 병비 (선택)","Incoming rally ratio (optional)"],
 phInf:["보","inf"], phLan:["창","lan"], phMar:["궁","mar"],
 lbGcap:["서버 최대 세대 (조이너 풀 제한)","Server's highest generation (limits the joiner pool)"],
 assump:['<b>계산 가정</b> — 원정스킬은 전부 Lv.5(4성 이상)로 간주 · 확률·주기 스킬은 <b>기대값</b>으로 환산 · 병종 전용 딜 스킬은 보병 가중치 0.3을 적용한 <b>딜 지분</b>으로 환산(보병은 탱커라 병력 비중 대비 딜이 적음) · 일반공격 한정 스킬은 총딜의 80%를 일반공격으로 가정 · "확률로 N% 피해" 계열은 "피해량 증가"와 같은 칸으로 묶었습니다(effect_op 미확정).<br>전무 레벨 0 = 미보유 · 숫자 옆 칸이 전무 레벨입니다. 병비 합이 100이 아니면 자동으로 정규화합니다.',
   '<b>Assumptions</b> — every expedition skill is treated as Lv.5 (4★ or above) · chance-based and periodic skills are converted to <b>expected value</b> · class-locked damage skills are converted to a <b>damage share</b> with infantry weighted 0.3 (infantry tanks, so it contributes less damage than its headcount) · normal-attack-only skills assume 80% of total damage is normal attacks · "N% damage on a chance" is grouped into the same slot as "damage bonus" (effect_op unconfirmed).<br>Exclusive-gear level 0 = not owned; the box beside each hero is its level. If the ratio does not add to 100 it is normalised automatically.'],
 srcData:['데이터 출처: <a href="https://wosheroes.com/">wosheroes</a> · <a href="https://www.whiteoutsurvival-community.com/">whiteoutsurvival-community</a> · <a href="https://www.whiteoutsurvival.wiki/">whiteoutsurvival.wiki</a> (2026-08-15 수집)',
   'Data: <a href="https://wosheroes.com/">wosheroes</a> · <a href="https://www.whiteoutsurvival-community.com/">whiteoutsurvival-community</a> · <a href="https://www.whiteoutsurvival.wiki/">whiteoutsurvival.wiki</a> (collected 2026-08-15)'],
 srcModel:['계산 모델: <a href="https://blog.astris.kr/posts/f7a87706-3c2f-40c0-b282-d77a311ab4e3">랠리 편성 × 조이너 스킬 × 데미지 공식 통합 해설</a> · 확률/주기 스킬은 기대값으로 환산한 근사치입니다.',
   'Model: <a href="https://blog.astris.kr/posts/adb04f46-d525-46a6-810c-940b72f26c77">Rally Comps × Joiner Skills × the Damage Formula</a> · chance and periodic skills are expected-value approximations.'],
 pick:["— 선택 —","— select —"],
 needLeader:["리더를 한 명 이상 선택하세요.","Select at least one leader."]
};
function S(k){return STR[k][LANG==="en"?1:0];}
function applyStatic(){
 document.title=S("title");
 document.documentElement.lang=LANG;
 var set=function(id,html){var el=document.getElementById(id); if(el)el.innerHTML=html;};
 set("h1",S("h1")); set("sub",S("sub"));
 set("mAtk",S("mAtk")); set("mDef",S("mDef"));
 set("lbInf",S("lbInf")); set("lbLan",S("lbLan")); set("lbMar",S("lbMar"));
 set("lbMine",S("lbMine")); set("lbGcap",S("lbGcap"));
 set("assump",S("assump")); set("srcData",S("srcData")); set("srcModel",S("srcModel"));
 ["wInf","wLan","wMar"].forEach(function(id){var e=document.getElementById(id); if(e)e.title=S("wTip");});
 [["r1","phInf"],["r2","phLan"],["r3","phMar"],["e1","phInf"],["e2","phLan"],["e3","phMar"]]
   .forEach(function(p){var e=document.getElementById(p[0]); if(e)e.placeholder=S(p[1]);});
 var d=document.getElementById("mDef").classList.contains("on");
 document.getElementById("eLab").innerHTML=d?S("lbEnD"):S("lbEnA");
 document.getElementById("lgKo").classList.toggle("on",LANG==="ko");
 document.getElementById("lgEn").classList.toggle("on",LANG==="en");
}
function setLang(l){
 if(l===LANG)return;
 LANG=l;
 try{var u=new URL(location.href); u.searchParams.set("lang",l); history.replaceState(null,"",u);}catch(e){}
 applyStatic(); rebuildSelects(); calc();
}
