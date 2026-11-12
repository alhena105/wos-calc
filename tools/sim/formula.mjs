// 독립 구현 — 엔진 코드를 안 보고 공식에서 직접 세운 SkillMod 시뮬레이터.
//   Kills ≈ √병력 × (공격% × 파괴력%) ÷ (적 방어% × 적 체력%) × SkillMod
//   SkillMod = (내 피해증폭 × 적 방어감소) ÷ (적 피해감소 × 적 방어증폭)
// 전투비 R = 내 Kills / 상대 Kills 를 펴면 내 쪽 칸(공격·파괴력·피해증폭·적방어감소 · 그리고
// 상대가 나를 때릴 때 분모에 들어가는 내 방어·체력·받피감소·적공격감소 …)이 각각 정확히 한 번씩
// 곱해진다. 같은 스탯(칸)은 합연산 (1+Σv), 다른 칸은 곱연산.
// 여기서는 리더 3명(원정스킬 전부) + 조이너(S1 하나)의 "세트 전체" 로 한 번에 계산한다 —
// 엔진처럼 한계 배율을 순차로 곱하는 방식이 아니라, 집합에서 곧장 Π(1+Σ) 를 낸다.
export function makeSim(E, opt = {}) {
  const {byId, norm} = E; const DW = opt.DW || E.DW, NA_SHARE = opt.NA_SHARE ?? E.NA_SHARE;
  const cls = r => (r.inf > 0) + (r.lan > 0) + (r.mar > 0);
  const share = (q, r) => {
    const t = q.tgt, ratio = t === "infantry" ? r.inf : t === "lancer" ? r.lan : t === "marksman" ? r.mar :
      t === "inf+mar" ? r.inf + r.mar : t === "mar+lan" ? r.mar + r.lan : 100;
    if (q.k === "sur") return ratio / 100;
    const w = {infantry: r.inf * DW.infantry, lancer: r.lan, marksman: r.mar};
    const tot = w.infantry + w.lancer + w.marksman; if (tot <= 0) return 0;
    const p = t === "infantry" ? w.infantry : t === "lancer" ? w.lancer : t === "marksman" ? w.marksman :
      t === "inf+mar" ? w.infantry + w.marksman : t === "mar+lan" ? w.marksman + w.lancer : tot;
    return p / tot;
  };
  // 세트(스킬 목록)를 칸별로 모은다. 반환: {bucket -> Σv}, pc 그룹은 복사본 수로 한 번에.
  // 두 칸 스킬(공격+방어 등)은 합으로 — 각 칸에는 넣되 교차항 (1+a)(1+b)-(1+a+b)=ab 를 cross 로 걷어낸다 (2026-10-10, 시트 재현 목표)
  // 2026-11-10 버킷 이론 — 스킬 데미지(SKILL)·리더 전용 버킷은 수치 모델이 없어 빼고, v:null 도 뺀다.
  // 확률형(p 가 "N%" · pc)은 버킷별로 모아 "같은 버킷이면 효과는 안 겹치고 확률만 오른다"(Ton)로 기대값을 낸다.
  // 같은 스킬 여러 장은 판정 횟수만 합친다. 그웬 S1(partial)은 GWEN_EFF 로 감쇄.
  const EXCL = new Set(["SKILL", "SKILLUP", "VSTROOP", "TARGET", "EXTRA", "SHIELD"]);
  const GW = opt.GWEN_EFF ?? E.GWEN_EFF, NOSTACK = opt.CHANCE_NO_STACK ?? true;
  const chanceOf = q => q.pc ? q.pc : (/^(\d+(?:\.\d+)?)%$/.exec(q.p || "") ? parseFloat(q.p) / 100 : 0);
  function collect(skills, r) {
    const add = {}, self = {}, ch = {}; let cross = 1;
    const put = (k, v) => { add[k] = (add[k] || 0) + v; };
    const n = cls(r);
    for (const {h, e} of skills) {
      // off — 값은 있지만 배율에서 뺀 몫(아모세 Viper 의 보병 몫 · 2026-11-13). also 가 본체의 off 를 물려받지 않게 따로 적는다.
      const parts = [e].concat(e.also ? [Object.assign({}, e, e.also, {also: null, off: e.also.off || 0})] : []);
      const plain = [];
      parts.forEach((q, idx) => {
        if (q.slot === "ECO" || EXCL.has(q.slot) || q.v == null || q.off) return;
        if (q.slot === "X") {
          const v = q.v * share(q, r);
          if (q.bk) put(q.bk, v); else { const k = "self:" + h.id + "/" + e.n + "/" + q.tgt; self[k] = (self[k] || 0) + v; }
          return;
        }
        if (q.slot === "An") { const k = "self:" + h.id + "/" + e.n; self[k] = (self[k] || 0) + q.v * NA_SHARE; return; }
        const p = idx === 0 ? chanceOf(q) : 0;
        if (p > 0) {
          const k = h.id + "/" + e.n, g = (ch[q.slot] = ch[q.slot] || {});
          g[k] = g[k] || {p, m: q.v / p, rolls: 0, copies: 0, pc: !!q.pc}; g[k].rolls += q.pc ? n : 1; g[k].copies++;
          return;
        }
        const v = q.partial ? q.v * GW : q.v; put(q.slot, v); plain.push(v);
      });
      // 2026-11-10: 교차항 제거 폐지 — 다른 버킷은 곱한다(cross 는 1 로 남는다)
    }
    for (const b in ch) {
      const L = Object.values(ch[b]);
      if (!NOSTACK) { put(b, L.reduce((a, x) => a + (x.pc ? x.m * (1 - Math.pow(1 - x.p, x.rolls)) : x.copies * x.p * x.m), 0)); continue; }
      L.sort((a, c) => c.m - a.m); let miss = 1, ev = 0;
      for (const x of L) { const f = Math.pow(1 - x.p, x.rolls); ev += x.m * (1 - f) * miss; miss *= f; }
      put(b, ev);
    }
    return {add, self, cross};
  }
  const prod = ({add, self, cross}) => Object.values(add).reduce((a, v) => a * (1 + v), 1) * Object.values(self).reduce((a, v) => a * (1 + v), 1) * (cross ?? 1);
  // 리더 스킬 목록 + 조이너 S1 목록
  const leaderSkills = lead => lead.filter(Boolean).flatMap(id => byId[id].exp.map(e => ({h: byId[id], e})));
  const joinerSkills = js => js.map(id => ({h: byId[id], e: byId[id].exp[0]}));
  // 전투 배율 = SkillMod(리더+조이너)/SkillMod(리더)
  function combo(lead, joiners, ratio) {
    const r = norm(...ratio);
    const base = prod(collect(leaderSkills(lead), r));
    const full = prod(collect([...leaderSkills(lead), ...joinerSkills(joiners)], r));
    return full / base;
  }
  // 단독 한계 배율 (조이너 1명)
  const single = (lead, id, ratio) => combo(lead, [id], ratio);
  return {combo, single, collect, prod, share, cls};
}
// 후보 풀에서 4명 전수 탐색(중복은 stack 영웅만) — 최적 조합
export function bruteBest(sim, lead, pool, ratio, stackable, K = 4) {
  let best = null, bv = -1; const cnt = 0;
  const rec = (start, chosen) => {
    if (chosen.length === K) { const v = sim.combo(lead, chosen, ratio); if (v > bv + 1e-12) { bv = v; best = chosen.slice(); } return; }
    for (let i = start; i < pool.length; i++) {
      const id = pool[i];
      const dup = chosen.includes(id);
      if (dup && !stackable.has(id)) continue;
      chosen.push(id); rec(i, chosen); chosen.pop();
    }
  };
  rec(0, []);
  return {ids: best, mul: bv};
}
