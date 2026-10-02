import {buildCandidates} from './candidates.mjs';
import {fixedContext} from './activation.mjs';
import {validateSetup,STAT_KEYS} from './physics.mjs';
const root=document.querySelector('#uma-plan'),q=s=>root.querySelector(s),qa=s=>[...root.querySelectorAll(s)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tracks={'10001':'삿포로','10002':'하코다테','10003':'니가타','10004':'후쿠시마','10005':'나카야마','10006':'도쿄','10007':'주쿄','10008':'교토','10009':'한신','10010':'고쿠라','10101':'오이','10201':'롱샹','10103':'가와사키','10104':'후나바시','10105':'모리오카','10202':'산타 아니타 파크','10203':'델 마'};
const cardTypes={Speed:'스피드',Stamina:'스태미나',Power:'파워',Guts:'근성',Wit:'지능',Wisdom:'지능',Friend:'친구',Group:'그룹'};
const kinds={self:'자체 · 각성 MAX',outfit_event:'자체 이벤트',support_hint:'서포트 힌트',support_event:'서포트 이벤트',scenario_event:'시나리오',evolution:'진화',inheritance:'계승 준비'};
const grades={white:'흰색',gold:'금색',unique:'고유',unique_low_star:'고유',unique_upgraded:'고유',evolution:'진화',inherited:'계승 고유'};
const objectives={maximum:'표본 중앙의 최대 이득 · 같은 이득이면 낮은 기준 비용',efficient:'최대 추가 이득 90% 이상을 유지하는 효율 조합',safe:'5개 표본 중 가장 불리한 이득을 최대한 커버'};
let data,candidates,result,records=new Map(),lastRequest=0,busy=true,dirty=false,appliedSetup,focusSkill;
let visible={speed:30,acceleration:30,factors:10,heal:30};
const worker=new Worker(new URL('./engine-worker.mjs',import.meta.url),{type:'module'});
const displayName=s=>s.name_ko||s.name_jp;
const option=(id,label)=>`<option value="${esc(id)}">${esc(label)}</option>`;
const signed=n=>Number.isFinite(n)?`${n<-.005?'−':'+'}${Math.abs(n).toFixed(2)}`:'—';
const number=(n,decimals=2)=>Number.isFinite(n)?n.toFixed(decimals):'—';
function sources(s){
 if(s.inherited)return '계승 준비';
 return [...new Set((s.routes||[]).map(r=>r.owner_type==='support'?data.supports[r.owner_id].name_jp+' · '+kinds[r.kind]:kinds[r.kind]||r.kind))].join(' / ')||'인자 준비';
}
function lockResults(){qa('[data-skill-id],[data-more],#objective,#restore-auto').forEach(x=>x.disabled=busy||dirty||!result);}
function send(type,payload){
 busy=true;root.querySelector('.result-shell').setAttribute('aria-busy','true');lockResults();
 q('#input-status').textContent='스킬 조합 비교 중…';q('#show-skills').disabled=true;
 worker.postMessage({requestId:++lastRequest,type,payload});
}
worker.onmessage=({data:message})=>{
 if(message.requestId!==lastRequest)return;
 if(message.type==='loaded'){q('#show-skills').disabled=false;apply();return;}
 busy=false;q('#show-skills').disabled=false;root.querySelector('.result-shell').setAttribute('aria-busy','false');
 if(message.type==='error'){
  dirty=true;q('#input-status').textContent=message.message;q('#input-status').classList.add('error-message');lockResults();return;
 }
 result=message.result;q('#input-status').classList.toggle('error-message',!!result.blockingReason);
 q('#input-status').textContent=dirty?'변경한 조건은 계산하기를 눌러 적용하세요.':result.blockingReason||'계산 완료';
 render();
 if(focusSkill){q(`[role=tabpanel]:not([hidden]) [data-skill-id="${focusSkill}"]`)?.focus({preventScroll:true});focusSkill=null;}
 q('#live').textContent='스킬 이득과 가속 추천, 최속 완주 HP 검토를 갱신했습니다.';
};
worker.onerror=()=>{busy=false;dirty=true;q('#input-status').textContent='계산 엔진을 불러오지 못했습니다. 새로고침하세요.';q('#input-status').classList.add('error-message');q('#show-skills').disabled=false;lockResults();};
function renderList(type,scores){
 const selected=new Set(result.selected),sorted=scores.slice().sort((a,b)=>(b.gain?.median??-Infinity)-(a.gain?.median??-Infinity)||displayName(records.get(a.id)).localeCompare(displayName(records.get(b.id)),'ko'));
 const limit=visible[type];q(`#${type}-count`).textContent=`${sorted.length}개`;
 q(`#${type}-list`).innerHTML=sorted.slice(0,limit).map((entry,index)=>{
  const s=records.get(entry.id),unsupported=entry.status==='unsupported',inactive=entry.status==='inactive',heal=type==='heal';
  const status=unsupported?'계산 미지원':inactive?'발동 구간 없음':entry.status==='assumed'?'조건 성공 가정':'';
  const badgeClass=s.rarity==='evolution'?'pink':s.rarity==='gold'?'gold':s.inherited?'blue':'';
  const value=heal?'회복':entry.gain?signed(entry.gain.median):'—';
  const detail=[...(entry.reasons||[]),entry.assumed?.length?'순위·상대 조건 충족을 가정합니다.':''].filter(Boolean).join(' · ');
  return `<div class="data-row"><label><input type="checkbox" data-skill-id="${esc(s.id)}" aria-label="${esc(displayName(s))} 선택" ${selected.has(s.id)?'checked':''}></label><div class="skill-info"><div class="skill-heading"><span class="rank">${entry.gain?index+1:'—'}</span><span class="skill-name">${esc(displayName(s))}</span><span class="badge ${badgeClass}">${grades[s.rarity]||'기타'}</span>${s.categories.includes('speed')&&s.categories.includes('acceleration')?'<span class="badge">복합</span>':''}${s.categories.includes('passive')?'<span class="badge green">능력치</span>':''}${s.choice_groups?.length?'<span class="badge">진화 분기</span>':''}${entry.pinned?'<span class="badge">선택 유지</span>':''}</div>${s.name_ko?`<p class="jp-name">${esc(s.name_jp)}</p>`:''}<div class="skill-meta">${esc(sources(s))}</div>${status?`<p class="skill-state ${unsupported?'unsupported':''}" title="${esc(detail)}">${status}</p>`:''}<details class="skill-details"><summary>스킬 설명</summary><p>${esc(s.description_jp||'원본 설명 없음')}</p>${detail?`<p>${esc(detail)}</p>`:''}</details></div><div class="skill-value"><strong class="${entry.gain?.median<-.005?'negative':''}">${value}</strong>${!heal&&entry.gain?'<span class="sub">마신</span>':''}</div></div>`;
 }).join('')+(sorted.length>limit?`<button class="data-more" data-more="${type}">더 보기</button>`:'');
 if(!sorted.length)q(`#${type}-list`).innerHTML='<p class="empty-list">지원 범위에서 추천할 후보가 없습니다.</p>';
}
function render(){
 const entries=result.skills;
 renderList('speed',entries.filter(s=>records.get(s.id).categories.some(t=>['speed','passive'].includes(t))));
 renderList('acceleration',entries.filter(s=>records.get(s.id).categories.includes('acceleration')));
 renderList('heal',entries.filter(s=>records.get(s.id).categories.includes('heal')));
 renderList('factors',result.factors);
 q('#objective').value=result.objective;q('#objective-note').textContent=result.recommendation.efficiencyFallback?'기준 비용 자료가 부족해 효율 추천을 계산할 수 없습니다.':objectives[result.objective];
 const combo=result.selected.map(id=>records.get(id)).filter(s=>s.categories.includes('acceleration'));
 q('#acceleration-summary').innerHTML=`<div class="combo-label"><strong>${result.auto?'자동 추천':'직접 선택'} 조합</strong><span class="sub">${result.recommendation.search==='exact'?'완전 탐색':'근사 탐색'}</span></div><div>${combo.length?combo.map(s=>esc(displayName(s))).join(' · '):'추가 가속기 없음'}</div><div class="combo-stats"><span>가속 효과 <strong>${signed(result.comparison?.median)} 마신</strong></span><span class="sub">표본 ${signed(result.comparison?.min)} ~ ${signed(result.comparison?.max)}</span></div>${result.recommendation.search==='beam'?'<p>후보가 많아 일부 조합을 탐색했습니다. 전역 최댓값은 보장하지 않습니다.</p>':''}`;
 const labels=['빠른 위치','앞쪽 위치','중앙 위치','뒤쪽 위치','늦은 위치'];
 q('#acceleration-comparison').innerHTML=result.acceleration.map((r,i)=>`<tr class="${i===2?'active':''}"><td>${labels[i]}</td><td>${number(r.entry?.speed)}</td><td>${number(r.entry?.targetGap)}</td><td>${r.reach&&r.entry?number(r.reach.t-r.entry.t,1):'—'}</td><td>${signed(result.comparison?.values[i])}</td></tr>`).join('');
 const hp=result.stamina;
 q('#stamina-summary').classList.toggle('ok',!!hp?.fullSpeedFeasible);
 q('#stamina-summary').innerHTML=hp?`<strong>${hp.fullSpeedFeasible?'최속 스퍼트 유지 가능':'최속 스퍼트 유지에 HP 부족'}</strong><p>중앙 발동 표본 · 결승 잔량 ${number(hp.hpRemaining,0)} HP</p>`:'전개스퍼트 계산 범위 초과';
 q('#stamina-checks').innerHTML=hp?`<div><span>회복 전부 실패</span><strong>${hp.failHealsFeasible?'유지 가능':'HP 부족'} · ${number(hp.failHealsRemaining,0)} HP</strong></div><div><span>HP 고갈 위치</span><strong>${hp.depletion===null?'고갈 없음':number(hp.depletion,0)+'m'}</strong></div><div><span>최대 HP</span><strong>${number(hp.hpMax,0)}</strong></div>`:'';
 q('#selection-status').textContent=`선택 ${result.selected.length}개${result.unsupportedSelected.length?` · 미지원 ${result.unsupportedSelected.length}개 효과 제외`:''}`;
 q('#model-status').textContent=result.blockingReason||'조건 성공 가정 · 5개 위치 표본 · 내리막 모드·몸싸움·디버프 제외';
 lockResults();
}
function syncBloom(){
 const base=data.outfits[q('#outfit').value].base_stars,old=Number(q('#bloom').value);
 q('#bloom').innerHTML=[1,2,3,4,5].filter(n=>n>=base).map(n=>option(n,`★${n}`)).join('');q('#bloom').value=String(Math.max(old,base));
}
function readSetup(){
 const supportIds=qa('[data-support]').map(s=>s.value).filter(Boolean);
 if(new Set(supportIds).size!==supportIds.length)throw new Error('동일한 서포트 카드를 중복 편성할 수 없습니다.');
 for(const input of qa('[id^="stat-"]'))if(!input.checkValidity()){input.reportValidity();throw new Error('목표 능력치를 확인하세요.');}
 const setup={course:data.courses[q('#course').value],outfitId:q('#outfit').value,bloom:Number(q('#bloom').value),supportIds,scenarioId:q('#scenario').value,
  style:Number(q('#style').value),going:Number(q('#going').value),mood:Number(q('#mood').value),weather:Number(q('#weather').value),season:Number(q('#season').value),time:Number(q('#time').value),
  stats:Object.fromEntries(STAT_KEYS.map(key=>[key,Number(q('#stat-'+key).value)])),aptitudes:Object.fromEntries(['distance','surface','style'].map(key=>[key,q('#apt-'+key).value]))};
 validateSetup(setup);return setup;
}
function apply(){
 try{
  appliedSetup=readSetup();candidates=buildCandidates(data,{...appliedSetup,context:fixedContext(appliedSetup)});
  records=new Map([...candidates.learned,...candidates.inheritance,...candidates.factorCandidates].map(s=>[s.id,s]));
  visible={speed:30,acceleration:30,factors:10,heal:30};dirty=false;q('#input-status').classList.remove('error-message');
  q('#scenario-note').textContent=appliedSetup.scenarioId?'시나리오 특수 획득 경로·선택 제한은 추가 검증 중입니다.':'';
  q('#result-context').textContent=`${tracks[appliedSetup.course.track_id]||appliedSetup.course.track_id} ${appliedSetup.course.distance}m · ${q('#style option:checked').textContent} · ${data.outfits[appliedSetup.outfitId].name_jp}`;
  send('setup',appliedSetup);
 }catch(error){busy=false;dirty=true;q('#show-skills').disabled=false;q('#input-status').textContent=error.message;q('#input-status').classList.add('error-message');lockResults();}
}
function activateTab(tab){qa('[role=tab]').forEach(t=>{const active=t===tab;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;q('#'+t.getAttribute('aria-controls')).hidden=!active;});}
root.addEventListener('click',event=>{
 const tab=event.target.closest('[role=tab]');if(tab)activateTab(tab);
 const more=event.target.closest('[data-more]');if(more&&!busy&&!dirty&&result){const type=more.dataset.more;visible[type]+=30;render();q(`[data-more="${type}"]`)?.focus();}
});
q('[role=tablist]').addEventListener('keydown',event=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const tabs=qa('[role=tab]'),at=tabs.indexOf(document.activeElement);if(at<0)return;
 event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(at+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
 activateTab(tabs[index]);tabs[index].focus();
});
root.addEventListener('change',event=>{
 const el=event.target;
 if(el.dataset.skillId){focusSkill=el.dataset.skillId;send('toggle',{id:el.dataset.skillId,checked:el.checked,source:el.closest('[role=tabpanel]').id.replace('panel-','')});return;}
 if(el.id==='objective'){send('objective',el.value);return;}
 if(el.id==='outfit')syncBloom();
 dirty=true;q('#input-status').textContent='변경한 조건은 계산하기를 눌러 적용하세요.';lockResults();
});
q('#restore-auto').addEventListener('click',()=>send('auto'));
q('#show-skills').addEventListener('click',apply);
async function load(){
 try{
  const response=await fetch('data/manifest.json',{cache:'no-cache'});if(!response.ok)throw new Error('manifest unavailable');
  const manifest=await response.json();
  if(!/^data\/bundles\/[a-f0-9]{64}\/dataset\.json$/.test(manifest.dataset_path))throw new Error('invalid data path');
  const bundle=await fetch(manifest.dataset_path);if(!bundle.ok)throw new Error('bundle unavailable');data=await bundle.json();
  if(data.server!=='JP'||data.schema_version!==1)throw new Error('unsupported data version');
  q('#outfit').innerHTML=Object.values(data.outfits).sort((a,b)=>a.name_jp.localeCompare(b.name_jp,'ja')).map(s=>option(s.id,`${s.name_jp} · ${s.outfit_name_jp}`)).join('');
  q('#outfit').value=data.outfits['114101']?'114101':Object.keys(data.outfits)[0];syncBloom();
  const courses=Object.values(data.courses).filter(c=>c.selectable).sort((a,b)=>Number(a.track_id)-Number(b.track_id)||a.distance-b.distance||a.id.localeCompare(b.id));
  q('#course').innerHTML=courses.map(c=>option(c.id,`${tracks[c.track_id]||c.track_id} · ${c.distance}m · ${c.surface===1?'잔디':'더트'}`)).join('');
  q('#course').value=data.courses['11203']?'11203':courses[0].id;
  q('#scenario').innerHTML=option('','선택 안 함')+Object.values(data.scenarios).map(s=>option(s.id,s.name_jp)).join('');
  const cards=Object.values(data.supports).sort((a,b)=>a.name_jp.localeCompare(b.name_jp,'ja')),options=option('','미편성')+cards.map(s=>option(s.id,`${s.rarity} · ${s.name_jp.replace(/\s+\((SSR|SR|R)\)$/,'')} · ${cardTypes[s.type]||s.type}`)).join('');
  q('#deck-inputs').innerHTML=Array.from({length:6},(_,i)=>`<label class="field">서포트 ${i+1}<select data-support="${i}">${options}</select></label>`).join('');
  [q('#outfit'),q('#course'),q('#scenario')].forEach(x=>x.disabled=false);
  q('#data-status').textContent=`스킬 ${manifest.counts.skills.toLocaleString()}개 · JP`;
  send('load',data);
 }catch(error){q('#data-status').textContent='자료를 불러오지 못했습니다.';q('#input-status').classList.add('error-message');q('#input-status').textContent=location.protocol==='file:'?'로컬 서버로 실행하세요: python -m http.server 8000':'데이터 파일 또는 연결을 확인하고 새로고침하세요.';console.error(error);}
}
load();
