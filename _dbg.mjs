import {readFileSync} from "node:fs";
import vm from "node:vm";
const src = p => readFileSync("src/" + p, "utf8");
const EX="GEAR_MS,GEAR_SLOTS,GEAR_TROOPS,GEAR_AXIS,GEAR_AXIS_SUB,GEAR_ORDER,gearPlan,gearAtoms,gearHull,gearBudgetPick";
const sb={console,URLSearchParams,location:{search:"?lang=ko",href:"https://x/"},navigator:{language:"ko"},history:{replaceState(){}}};
vm.createContext(sb);
vm.runInContext(src("i18n.js")+src("gear-data.js")+src("gear-engine.js")+"\n;globalThis.__api={"+EX+"};\n",sb);
const G=sb.__api, MS=G.GEAR_MS, AX=G.GEAR_AXIS;
const TR=["infantry","lancer","marksman"], SL=["helmet","gauntlet","belt","boots"];
// 조각별 (누적 미스릴, 누적 값) — 모든 마일스톤 절단점
function ladder(t,s){
 const side=G.GEAR_SLOTS[s].side, out=[{m:0,v:0,lv:1}]; let m=0,v=0;
 for(const ms of MS){ m+=ms.mithril; v += ms.tier==="expedition" ? (AX[t][ms[side]]||0)*ms.bonus : 0; out.push({m,v,lv:ms.level}); }
 return out;
}
const L={}; for(const t of TR) for(const s of SL) L[t+"/"+s]=ladder(t,s);
// 전 예산 DP (모든 절단점)
const MAX=1800, keys=Object.keys(L);
let dp=new Float64Array(MAX/10+1); let pick=keys.map(()=>null);
let best=new Float64Array(MAX/10+1); let choice=[];
dp.fill(0); choice=Array.from({length:MAX/10+1},()=>({}));
for(const k of keys){
 const nd=new Float64Array(MAX/10+1).fill(-1), nc=Array.from({length:MAX/10+1},()=>null);
 for(let b=0;b<=MAX/10;b++){ if(dp[b]<0)continue;
  for(const step of L[k]){ const nb=b+step.m/10; if(nb>MAX/10)continue;
   const val=dp[b]+step.v; if(val>nd[nb]){nd[nb]=val; nc[nb]={prev:b,k,lv:step.lv,from:choice[b]};} } }
 for(let b=0;b<=MAX/10;b++){ dp[b]=nd[b]; choice[b]=nc[b]; }
}
// 우리 로드맵 누적
const gear={}; for(const t of TR){gear[t]={}; for(const s of SL) gear[t][s]=[11,1];}
const plan=G.gearPlan({ratios:{attack:{infantry:48,lancer:4,marksman:48},defense:{infantry:60,lancer:40,marksman:0}},
 attackWeight:0.75,arenaPriority:"none",mithrilPerWeek:12,gear});
let cm=0,cv=0; const road=[{m:0,v:0}];
for(const s of plan.steps){cm+=s.mithril; cv+=s.value||0; road.push({m:cm,v:cv});}
function roadAt(b){let v=0;for(const p of road)if(p.m<=b)v=p.v;return v;}
// gearBudgetPick 값
console.log(" 예산  로드맵프리픽스  현행DP픽  진짜최적");
for(let b=100;b<=1800;b+=100){
 const p=G.gearBudgetPick(plan.steps,b);
 console.log(String(b).padStart(5)+"  "+roadAt(b).toFixed(1).padStart(12)+"  "+
  (p?p.value:cv).toFixed(1).padStart(9)+"  "+dp[b/10].toFixed(1).padStart(8));
}
