(() => {
  'use strict';
  const root=document.getElementById('uma-plan');
  const q=s=>root.querySelector(s),qa=s=>[...root.querySelectorAll(s)];
  const setText=(s,v)=>{q(s).textContent=v;};
  const {FixtureEngine,cards,roster}=window.UmaPlanner;
  const num=(v,d=2)=>Number(v).toFixed(d), signed=v=>(v>=0?'+':'')+num(v);
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let caseId='typical',objective='efficient',automatic=true;
  let selectedSpeed=new Set(),selectedAccel=new Set(),selectedHeal=new Set(),selectedFactors=new Set();
  let applied,engine,result,available;
  const defaultDeck=['A','B','C','D','E','F'];
  q('#deck-inputs').innerHTML=defaultDeck.map((id,i)=>{
    const matching=cards.filter(c=>c.slot===i+1);
    return `<div class="support"><div class="support-type">${matching[0].type}</div><select data-setting="support${i+1}" aria-label="서포트 ${i+1}">${matching.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select><small>SSR${i===5?' · 대여':''}</small></div>`;
  }).join('');
  const initial={};qa('[data-setting]').forEach(el=>initial[el.dataset.setting]=el.value);
  function readInputs(){return Object.fromEntries(qa('[data-setting]').map(el=>[el.dataset.setting,el.value||initial[el.dataset.setting]]));}
  function grade(s){const cls=s.grade==='진화'?'pink':s.grade==='금색'?'gold':s.grade.includes('고유')?'blue':'';return `<span class="badge ${cls}">${esc(s.grade)}</span>`;}
  function source(s){return s.cardSlot?cards.find(c=>c.id===applied['support'+s.cardSlot]).name:s.origin.replace(' · 각성 MAX','');}
  function pool(type){return available.filter(s=>s.type===type);}
  function selection(){
    const speed=new Set(selectedSpeed),accel=new Set(selectedAccel);
    for(const id of selectedFactors){const s=engine.record(id);(s.type==='speed'?speed:accel).add(id);}
    return {speed,accel,heal:new Set(selectedHeal)};
  }
  function applyRecommended(){const r=engine.recommend(selection(),caseId,objective);selectedAccel=new Set(r.baseIds);}
  function rebuild(){
    engine=new FixtureEngine(applied);available=engine.available();
    selectedSpeed=new Set(pool('speed').map(s=>s.id));selectedHeal=new Set();
    // Factor choices are retained; when a normal route appears they move into the speed pool.
    const candidateIds=new Set(engine.factors().map(s=>s.id));
    selectedFactors=new Set([...selectedFactors].filter(id=>candidateIds.has(id)));
    automatic=true;applyRecommended();
  }
  function preserveFocus(){
    const el=document.activeElement;
    if(!root.contains(el))return ()=>{};
    const key=el.dataset.skillId?`[data-skill-id="${el.dataset.skillId}"]`:el.dataset.factorId?`[data-factor-id="${el.dataset.factorId}"]`:null;
    return ()=>{if(key)q(key)?.focus({preventScroll:true});};
  }
  function skillRow(s,index,type,value,recommended){
    const chosen=(type==='speed'?selectedSpeed:type==='accel'?selectedAccel:selectedHeal).has(s.id);
    const deltaLabel=chosen?'제외 시 손실':'추가 시 이득';
    const valueText=type==='heal'?num(s.recovery*100,1)+'%':signed(value);
    const detailLabel=type==='heal'?'지구력 회복':deltaLabel+' · 마신';
    const validity=type==='heal'?'':value<0?'<span class="badge gold">손해 가능</span>':value<.05?'<span class="badge">추가 효율 낮음</span>':s.connection?'<span class="badge blue">접속 의존</span>':'';
    return `<div class="skill" data-row-id="${s.id}"><label class="skill-checkbox"><input type="checkbox" data-skill-id="${s.id}" data-skill-type="${type}" aria-label="${esc(s.name)} 효과 반영" ${chosen?'checked':''}></label><div class="skill-info"><div class="skill-heading"><span class="rank">${String(index+1).padStart(2,'0')}</span><span class="skill-name">${esc(s.name)}</span>${grade(s)}${recommended?'<span class="badge green">추천</span>':validity}</div><div class="skill-meta"><span class="acquisition">${esc(source(s))}</span><details class="skill-details"><summary>상세</summary><p>${esc(s.reason)}</p><p>획득: ${esc(s.path)}</p><p>발동: ${esc(s.condition)}</p>${s.evolution?`<p>${esc(s.evolution)}</p>`:''}<p>${detailLabel}</p></details></div></div><div class="skill-value"><strong title="${detailLabel}" class="${value<0?'negative':''}">${valueText}</strong></div></div>`;
  }
  function renderSkills(){
    const sel=selection(),rec=result.recommendation.baseIds;
    for(const type of ['speed','accel']){
      const list=pool(type).map(s=>({...s,value:engine.marginal(s.id,type,sel,caseId)})).sort((a,b)=>b.value-a.value||a.id.localeCompare(b.id));
      q('#'+type+'-list').innerHTML=list.map((s,i)=>skillRow(s,i,type,s.value,type==='accel'&&rec.has(s.id))).join('');
    }
    q('#heal-list').innerHTML=pool('heal').map((s,i)=>skillRow(s,i,'heal',0,false)).join('');
    const extra=[...selectedFactors].map(id=>engine.record(id)).filter(s=>s.type==='speed');
    setText('#factor-speed-note',extra.length?`흰 인자 반영: ${extra.map(s=>s.name).join(' · ')}`:'');q('#factor-speed-note').hidden=!extra.length;
  }
  function renderFactors(){
    const sel=selection();
    const ranked=engine.factors().map(s=>({...s,value:engine.marginal(s.id,s.type,sel,caseId)})).sort((a,b)=>b.value-a.value||a.id.localeCompare(b.id));
    const top=ranked.slice(0,10),topIds=new Set(top.map(s=>s.id));
    const pinned=ranked.filter(s=>selectedFactors.has(s.id)&&!topIds.has(s.id));
    q('#factor-list').innerHTML=[...top,...pinned].map(s=>{
      const rank=ranked.findIndex(r=>r.id===s.id)+1,chosen=selectedFactors.has(s.id);
      return `<div class="skill" data-factor-row="${s.id}"><label class="skill-checkbox"><input type="checkbox" data-factor-id="${s.id}" aria-label="${esc(s.name)} 인자 준비 및 습득 가정" ${chosen?'checked':''}></label><div class="skill-info"><div class="skill-heading"><span class="rank">${String(rank).padStart(2,'0')}</span><span class="skill-name">${esc(s.name)}</span><span class="badge">${s.type==='speed'?'속도':'가속'}</span>${rank>10?'<span class="badge">선택 유지</span>':''}</div><details class="skill-details"><summary>상세</summary><p>${esc(s.reason)}</p><p>발동: ${esc(s.condition)}</p></details></div><div class="skill-value"><strong title="${chosen?'제외 시 손실':'추가 시 이득'} · 마신">${signed(s.value)}</strong></div></div>`;
    }).join('');
    const names=[...selectedFactors].map(id=>engine.record(id).name);
    setText('#factor-plan-count',`${names.length}개 선택`);
    setText('#factor-plan-names',names.join(' · '));q('.factor-plan').hidden=!names.length;
  }
  function renderChart(){
    const svg=q('#accel-chart'),width=Math.max(260,svg.parentElement.clientWidth),height=180;
    const left=43,right=14,top=16,bottom=33,until=12;
    const a=result.run.trajectory.filter(p=>p.t<=until),b=result.noAccel.trajectory.filter(p=>p.t<=until);
    const values=[...a,...b].map(p=>p.v);const low=Math.floor(Math.min(...values)*2)/2-.2,high=Math.ceil(Math.max(...values)*2)/2+.2;
    const x=t=>left+t/until*(width-left-right),y=v=>top+(high-v)/(high-low)*(height-top-bottom);
    const path=arr=>arr.filter((_,i)=>i%4===0).map((p,i)=>(i?'L':'M')+x(p.t).toFixed(1)+','+y(p.v).toFixed(1)).join(' ');
    svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    let html='<title>종반 초반 속도 변화 · 동작 확인용 예시</title><desc>실선은 현재 선택 조합, 점선은 가속기를 제외한 조합입니다.</desc>';
    for(let i=0;i<4;i++){const v=low+(high-low)*i/3;html+=`<line x1="${left}" y1="${y(v)}" x2="${width-right}" y2="${y(v)}" stroke="var(--line)"/><text x="${left-7}" y="${y(v)+4}" text-anchor="end" fill="var(--sub)" font-size="11">${num(v,1)}</text>`;}
    for(const t of [0,4,8,12])html+=`<text x="${x(t)}" y="${height-15}" text-anchor="middle" fill="var(--sub)" font-size="11">${t}s</text>`;
    html+=`<text x="${left}" y="11" fill="var(--sub)" font-size="10">속도 m/s</text><path d="${path(b)}" fill="none" stroke="var(--sub)" stroke-width="1.6" stroke-dasharray="5 4"/><path d="${path(a)}" fill="none" stroke="var(--green)" stroke-width="2.3"/>`;
    svg.innerHTML=html;
  }
  function renderAccel(){
    const recommendation=result.recommendation;
    const names=[...recommendation.ids].map(id=>engine.record(id).name);
    setText('#recommended-combo',names.join(' + ')||'추가 가속 없이 비교');
    const policy={efficient:'최대 이득의 90% 이상',maximum:'최대 가속 이득',robust:'불리한 발동에서 최대 이득'};
    const labels={maximum:'최대',efficient:'효율',robust:'안전'};
    setText('#recommendation-label',`추천 조합 · ${labels[objective]}`);
    setText('#recommend-policy',policy[objective]);
    const recRun=engine.simulate(selection().speed,recommendation.ids,caseId);
    const noAccel=engine.simulate(selection().speed,new Set(),caseId);
    const combinationGain=(recRun.segment-engine.positionAt(noAccel,recRun.finishTime))/2.5;
    setText('#combo-gain',`${signed(combinationGain)} 마신`);q('#combo-gain').title='모든 가속기를 제외한 조합 대비 이득';
    setText('#combo-time',`첫 목표속도 도달 ${recRun.reached===null?'미도달':num(recRun.reached,1)+'초'}`);
    q('#manual-combo').hidden=automatic;
    const selectedNames=[...selection().accel].map(id=>engine.record(id).name);
    setText('#manual-combo','수동 선택: '+(selectedNames.join(' + ')||'가속 미선택'));
    setText('#accel-mode',automatic?'자동':'수동');q('#auto-accel').checked=automatic;
    const scenarioNames={best:'유리',typical:'대표',worst:'불리'};
    q('#scenario-table').innerHTML=result.scenarios.map(s=>`<tr class="${s.id===caseId?'active':''}"><td>${scenarioNames[s.id]}</td><td>${num(s.entrySpeed)}</td><td>${num(s.gap)}</td><td>${s.reached===null?'미도달':num(s.reached,1)}</td><td>${signed(s.accelGain)}</td></tr>`).join('');
    renderChart();
  }
  function renderStamina(){
    const s=result.stamina,normal=s.normal,failed=s.failed;
    setText('#stamina-value',Number(applied.stamina).toLocaleString('ko-KR'));
    setText('#finish-verdict',s.depleted?'지구력 보완 필요':s.canSustain?'목표 스퍼트 유지 가능':'완주 여유가 작음 · 회복 검토');
    setText('#finish-description',`회복 ${selectedHeal.size}개 발동 · 결승 지구력 ${Math.round(normal.hpFinal).toLocaleString('ko-KR')}`);
    q('#finish-status').classList.toggle('ok',s.canSustain);
    setText('#hp-check',s.depleted?'고갈 예상':'고갈 없음');
    setText('#spurt-check',s.canStart?'가능':'지연 검토');
    setText('#sustain-check',s.canSustain?'가능':'부족 / 여유 작음');
    q('#heal-table').innerHTML=[['선택한 회복 정상 발동',normal],['선택한 회복 모두 불발',failed]].map(([name,r])=>`<tr><td>${name}</td><td>${Math.round(r.hpFinal).toLocaleString('ko-KR')}</td><td>${r.hpEmptyAt===null&&r.hpFinal>=70?'유지 가능':'보완 필요'}</td></tr>`).join('');
  }
  function render(){
    const restore=preserveFocus();
    const openDetails=qa('.skill details[open]').map(el=>{const row=el.closest('.skill');return row.dataset.rowId||row.dataset.factorRow;});
    result=engine.analyze(selection(),caseId,objective);
    const sel=selection();
    setText('#entry-speed',num(result.run.entrySpeed));setText('#target-speed',num(result.run.entryTarget));setText('#speed-gap',num(result.run.gap));
    setText('#scenario-caption',caseId==='worst'?'불리한 발동 기준':'대표 발동 기준');
    setText('#global-count',`속도 ${sel.speed.size} · 가속 ${sel.accel.size} · 회복 ${sel.heal.size} · 흰 인자 ${selectedFactors.size}`);
    renderSkills();renderFactors();renderAccel();renderStamina();
    for(const id of openDetails){const details=q(`[data-row-id="${id}"] details, [data-factor-row="${id}"] details`);if(details)details.open=true;}
    restore();
  }
  function updateUnique(){setText('#unique-level',`고유기 Lv. ${Number(q('[data-setting="bloom"]').value)+1} 가정`);}
  function activateTab(tab){
    const list=tab.closest('[role=tablist]');
    for(const peer of list.querySelectorAll('[role=tab]')){
      const active=peer===tab;peer.setAttribute('aria-selected',String(active));peer.tabIndex=active?0:-1;q('#'+peer.getAttribute('aria-controls')).hidden=!active;
    }
    if(tab.id==='accel-tab')renderChart();
  }
  qa('[role=tablist]').forEach(list=>{
    list.addEventListener('click',e=>{const tab=e.target.closest('[role=tab]');if(tab)activateTab(tab);});
    list.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      const tabs=[...list.querySelectorAll('[role=tab]')],i=tabs.indexOf(document.activeElement);if(i<0)return;
      e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;activateTab(tabs[next]);tabs[next].focus();
    });
  });
  root.addEventListener('change',e=>{
    const el=e.target;
    if(el.matches('[data-setting]')){
      if(el.dataset.setting==='trainee')q('[data-setting="bloom"]').value=String(roster.find(r=>r.id===el.value).bloom);
      if(el.dataset.setting==='bloom')roster.find(r=>r.id===q('[data-setting="trainee"]').value).bloom=Number(el.value);
      updateUnique();setText('#calculation-status','입력 변경 · 추천 보기로 적용');
    }
    if(el.dataset.skillId){
      const type=el.dataset.skillType,group=type==='speed'?selectedSpeed:type==='accel'?selectedAccel:selectedHeal;
      if(el.checked)group.add(el.dataset.skillId);else group.delete(el.dataset.skillId);
      if(type==='accel')automatic=false;else if(type==='speed'&&automatic)applyRecommended();
      render();setText('#live','선택한 스킬의 마신·가속 추천·스태미나 결과를 갱신했습니다.');
    }
    if(el.dataset.factorId){
      if(el.checked)selectedFactors.add(el.dataset.factorId);else selectedFactors.delete(el.dataset.factorId);
      if(automatic)applyRecommended();render();setText('#live','흰 인자 선택을 습득 가정에 반영하고 가속 추천을 갱신했습니다.');
    }
    if(el.id==='auto-accel'){automatic=el.checked;if(automatic)applyRecommended();render();}
    if(el.id==='objective'){objective=el.value;caseId=objective==='robust'?'worst':'typical';if(automatic)applyRecommended();render();}
    if(el.dataset.ownedUma){roster.find(r=>r.id===el.dataset.ownedUma).owned=el.checked;renderInventoryCounts();}
    if(el.dataset.ownedSupport)renderInventoryCounts();
    if(el.dataset.ownedBloom){
      const r=roster.find(r=>r.id===el.dataset.ownedBloom);r.bloom=Number(el.value);
      if(q('[data-setting="trainee"]').value===r.id){q('[data-setting="bloom"]').value=el.value;updateUnique();setText('#calculation-status','개화 상태가 변경되었습니다. 추천 보기를 눌러 반영하세요.');}
    }
  });
  q('#all-speed').addEventListener('click',()=>{selectedSpeed=new Set(pool('speed').map(s=>s.id));if(automatic)applyRecommended();render();});
  q('#apply-accel').addEventListener('click',()=>{automatic=true;applyRecommended();render();});
  q('#calculate').addEventListener('click',()=>{
    const invalid=qa('[data-setting]').find(el=>!el.checkValidity()||el.value==='');
    if(invalid){const detail=invalid.closest('details');if(detail)detail.open=true;invalid.reportValidity();setText('#calculation-status','목표 능력치를 1~4,000 범위로 입력하세요.');return;}
    applied=readInputs();rebuild();render();renderInventory();setText('#calculation-status','조건 적용 완료');setText('#live','입력한 조건으로 예시 결과를 갱신했습니다.');
    if(window.matchMedia?.('(max-width: 740px)').matches)q('#results').scrollIntoView({behavior:'smooth',block:'start'});
  });
  const ownedSupportIds=new Set(defaultDeck.slice(0,5));
  function renderInventoryCounts(){setText('#owned-uma-count',qa('[data-owned-uma]:checked').length+'명 등록');setText('#owned-support-count',qa('[data-owned-support]:checked').length+'장 등록');}
  function renderInventory(){
    qa('[data-owned-support]').forEach(el=>{if(el.checked)ownedSupportIds.add(el.dataset.ownedSupport);else ownedSupportIds.delete(el.dataset.ownedSupport);});
    q('#owned-uma-list').innerHTML=roster.map(r=>`<div class="panel inventory-item"><div class="inventory-icon" aria-hidden="true">${r.letter}</div><label class="check-line"><input type="checkbox" data-owned-uma="${r.id}" ${r.owned?'checked':''}>${r.name}</label><p class="help">기본 의상</p><label class="field">개화 상태<select data-owned-bloom="${r.id}" aria-label="${r.name} 개화 상태">${[3,4,5].map(v=>`<option value="${v}" ${v===r.bloom?'selected':''}>★${v}</option>`).join('')}</select></label></div>`).join('');
    q('#owned-support-list').innerHTML=cards.map(c=>`<div class="panel inventory-item"><div class="inventory-icon" aria-hidden="true">${c.id}</div><label class="check-line"><input type="checkbox" data-owned-support="${c.id}" ${ownedSupportIds.has(c.id)?'checked':''}>${c.name}</label><p class="help">SSR · ${c.type}</p></div>`).join('');renderInventoryCounts();
  }
  applied=readInputs();rebuild();render();renderInventory();updateUnique();
  new ResizeObserver(()=>{if(!q('#accel-panel').hidden)renderChart();}).observe(q('#accel-chart').parentElement);
  // Explicit prototype inspection surface for integration and behavioral checks.
  window.UmaPlanner.inspect=()=>({applied:{...applied},automatic,caseId,objective,selected:{speed:[...selectedSpeed],accel:[...selectedAccel],heal:[...selectedHeal],factors:[...selectedFactors]},result});
})();
