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
  function collect(skills, r) {
    const add = {}, self = {}, pcg = {};
    const put = (k, v) => { add[k] = (add[k] || 0) + v; };
    for (const {h, e} of skills) {
      if (e.slot === "ECO") continue;
      if (e.pc) { const k = h.id + "/" + e.n; pcg[k] = pcg[k] || {e, n: 0}; pcg[k].n++; continue; }
      if (e.slot === "X") {
        const parts = [e]; if (e.also && e.also.slot === "X") parts.push(Object.assign({}, e, e.also));
        for (const q of parts) {
          const v = q.v * share(q, r);
          if (q.bk) put(q.bk, v); else { const k = "self:" + h.id + "/" + e.n + "/" + q.tgt; self[k] = (self[k] || 0) + v; }
        }
        continue;
      }
      if (e.slot === "AH") { const k = "self:" + h.id + "/" + e.n; self[k] = (self[k] || 0) + e.v; continue; }
      if (e.slot === "An") { const k = "self:" + h.id + "/" + e.n; self[k] = (self[k] || 0) + e.v * NA_SHARE; continue; }
      put(e.slot, e.v); if (e.also) put(e.also.slot, e.also.v);
    }
    const n = cls(r);
    for (const k in pcg) { const {e, n: copies} = pcg[k]; const v = n > 0 ? e.v * (1 - Math.pow(1 - e.pc, n * copies)) / e.pc : 0; put(e.slot, v); if (e.also) put(e.also.slot, e.also.v * copies); }
    return {add, self};
  }
  const prod = ({add, self}) => Object.values(add).reduce((a, v) => a * (1 + v), 1) * Object.values(self).reduce((a, v) => a * (1 + v), 1);
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
