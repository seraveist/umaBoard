import {buildCandidates} from './candidates.mjs';
import {fixedContext} from './activation.mjs';
import {validateSetup,STAT_KEYS} from './physics.mjs';
import {skillName,umaName,outfitName,cardLabel,cardTypes,cardTypeBadge,selectableSupports} from './display.mjs';
import {searchableSelect} from './search-select.mjs';
import {portraitPath} from './portraits.mjs';
import {acquisitionPlan} from './acquisition-plan.mjs';
import {selectionRules,previewToggle} from './selection.mjs';
import {reconcileRows,textIfChanged,htmlIfChanged} from './keyed-dom.mjs';
import {visibleSkillIds,displayedGain} from './result-policy.mjs';
import {accelerationChart} from './acceleration-chart.mjs';
const root=document.querySelector('#uma-plan'),q=s=>root.querySelector(s),qa=s=>[...root.querySelectorAll(s)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tracks={'10001':'삿포로','10002':'하코다테','10003':'니가타','10004':'후쿠시마','10005':'나카야마','10006':'도쿄','10007':'주쿄','10008':'교토','10009':'한신','10010':'고쿠라','10101':'오이','10201':'롱샹','10103':'가와사키','10104':'후나바시','10105':'모리오카','10202':'산타 아니타 파크','10203':'델 마'};
const grades={white:'흰색',gold:'금색',unique:'고유',unique_low_star:'고유',unique_upgraded:'고유',evolution:'진화',inherited:'계승 고유'};
const objectives={maximum:'중앙 발동에서 최대 이득',safe:'5개 표본 중 불리한 발동까지 커버'};
let data,candidates,result,records=new Map(),rules,lastRequest=0,busy=true,dirty=false,appliedSetup,focusSkill;
let inFlight=false,setupBusy=true,pendingActions=[],draftSelected=new Set(),draftUserSelected=new Set(),draftAuto=true,draftObjective='maximum',draftNotice='';
let fixedIds=new Set();
const worker=new Worker(new URL('./engine-worker.mjs',import.meta.url),{type:'module'});
const displayName=skillName;
const option=(id,label)=>`<option value="${esc(id)}">${esc(label)}</option>`;
const signed=n=>Number.isFinite(n)&&n>.005?`+${n.toFixed(2)}`:'—';
const number=(n,decimals=2)=>Number.isFinite(n)?n.toFixed(decimals):'—';
function lockResults(){
 qa('[data-skill-id],[data-skill-remove],[data-select-many],#objective,#clear-speed-selection').forEach(x=>x.disabled=setupBusy||dirty||!result||fixedIds.has(x.dataset.skillId||x.dataset.skillRemove));
 q('#recalculate').disabled=q('#restore-auto').disabled=inFlight||setupBusy||dirty||!result;
 q('#restore-auto').hidden=draftAuto;
 textIfChanged(q('#recalculate'),inFlight?'계산 중…':draftAuto?'가속 조합 재계산':'선택 조합 계산');
}
function renderProgress(){
 const stale=dirty||pendingActions.length>0;
 q('.result-shell').dataset.stale=String(stale);
 q('.result-shell').setAttribute('aria-busy',String(inFlight));
 textIfChanged(q('#result-status'),inFlight?'계산 중…':dirty?'조건 계산 필요':stale?'재계산 필요':result?'계산 완료':'계산 준비 중');
 lockResults();
}
function send(type,payload){
 busy=true;inFlight=true;root.querySelector('.result-shell').setAttribute('aria-busy','true');lockResults();
 q('#input-status').textContent='스킬 조합 비교 중…';q('#show-skills').disabled=true;
 renderProgress();
 worker.postMessage({requestId:++lastRequest,type,payload});
}
worker.onmessage=({data:message})=>{
 if(message.requestId!==lastRequest)return;
 if(message.type==='loaded'){q('#show-skills').disabled=false;apply();return;}
 inFlight=false;setupBusy=false;busy=false;q('#show-skills').disabled=false;
 if(message.type==='error'){
  busy=false;dirty=true;pendingActions=[];
  q('#show-skills').disabled=false;q('.result-shell').setAttribute('aria-busy','false');
  q('#input-status').textContent=message.message;q('#input-status').classList.add('error-message');renderProgress();return;
 }
 result=message.result;fixedIds=new Set(result.fixedIds);draftSelected=new Set(result.selected);draftUserSelected=new Set(result.userSelected);draftAuto=result.auto;draftObjective=result.objective;draftNotice=result.notice||'';
 for(const action of pendingActions)previewAction(action);
 q('#input-status').classList.toggle('error-message',!!result.blockingReason);
 q('#input-status').textContent=dirty?'변경한 조건은 계산하기를 눌러 적용하세요.':pendingActions.length?'가속기 탭에서 재계산하세요.':result.blockingReason||'계산 완료';
 render();
 if(focusSkill){q(`[role=tabpanel]:not([hidden]) [data-skill-id="${focusSkill}"]`)?.focus({preventScroll:true});focusSkill=null;}
 renderProgress();q('#live').textContent=pendingActions.length?'추가 변경이 있습니다. 가속기 탭에서 재계산하세요.':'스킬 이득과 가속 추천, 최속 완주 HP 검토를 갱신했습니다.';
};
worker.onerror=()=>{busy=false;inFlight=false;setupBusy=false;dirty=true;q('#input-status').textContent='계산 엔진을 불러오지 못했습니다. 새로고침하세요.';q('#input-status').classList.add('error-message');q('#show-skills').disabled=false;renderProgress();};
function previewAction(action){
 draftNotice='';
 if(action.type==='toggle'){
  const next=previewToggle(records,rules,draftSelected,action.id,action.checked,fixedIds);draftNotice=next.notice;if(draftNotice)return false;
  draftSelected=new Set(next.selected);
  const skill=records.get(action.id);
  draftUserSelected=new Set([...draftUserSelected].filter(id=>draftSelected.has(id)));
  const manual=action.source==='acceleration'||action.source==='routes'&&skill.categories.includes('acceleration')||skill.categories.includes('acceleration')&&!skill.categories.includes('speed');
  if(manual)draftAuto=false;else if(action.checked)draftUserSelected.add(action.id);
 }else if(action.type==='selectMany'){
  for(const id of action.ids){
   if(fixedIds.has(id))continue;
   if(action.source==='speed'&&draftSelected.has(id)&&!draftUserSelected.has(id)&&records.get(id).categories.some(c=>['speed','passive'].includes(c))){previewAction({type:'toggle',id,checked:true,source:action.source});continue;}
   if(!draftSelected.has(id)&&[...draftSelected].every(other=>rules.compatible(id,other))){
    const next=previewToggle(records,rules,draftSelected,id,true,fixedIds);
    if(!next.notice)previewAction({type:'toggle',id,checked:true,source:action.source});
   }
  }
 }else if(action.type==='clearSpeed'){
  for(const id of [...draftUserSelected])if(records.get(id).categories.some(c=>['speed','passive'].includes(c)))previewAction({type:'toggle',id,checked:false,source:'speed'});
 }else if(action.type==='objective'){draftObjective=action.value;draftAuto=true;}
 else if(action.type==='auto')draftAuto=true;
 return true;
}
function queueAction(action){
 if(dirty||setupBusy||!result)return;
 if(!previewAction(action)){renderSelection();return;}
 pendingActions.push(action);
 q('#input-status').textContent='가속기 탭에서 재계산하세요.';renderSelection();renderProgress();
}
function calculateSelection(forceAuto=false){
 if(inFlight||setupBusy||dirty||!result)return;
 if(forceAuto){previewAction({type:'auto'});pendingActions.push({type:'auto'});renderSelection();}
 const actions=pendingActions;pendingActions=[];send('batch',actions);
}
function listIds(type){
 if(type==='heal')return result.tables.heal;
 const [category,kind]=type.split('-');return result.tables[category][kind==='inheritance'?'inheritance':'ordinary'];
}
function renderList(type,scores){
 const container=q(`#${type}-list`);
 reconcileRows(container,scores,entry=>{
  const s=records.get(entry.id),heal=type==='heal';
  const badgeClass=s.rarity==='evolution'?'pink':s.rarity==='gold'?'gold':s.inherited?'blue':'';
  const row=document.createElement('div');row.className='data-row';
  row.innerHTML=`<label><input type="checkbox" data-skill-id="${esc(s.id)}" aria-label="${esc(displayName(s))} 선택"></label><div class="skill-info"><div class="skill-heading"><span class="rank"></span><span class="skill-name">${esc(displayName(s))}</span><span class="badge ${badgeClass}">${grades[s.rarity]||'기타'}</span>${s.categories.includes('speed')&&s.categories.includes('acceleration')?'<span class="badge">복합</span>':''}${s.categories.includes('passive')?'<span class="badge green">능력치</span>':''}<span class="badge selection-origin" hidden></span><span class="badge assumption-badge" title="순위·상대 조건 성공 가정">조건 가정</span></div><details class="skill-details"><summary>스킬 설명</summary><p>${esc(s.description_jp||'원본 설명 없음')}</p><p class="condition-detail" hidden></p></details></div><div class="skill-value"><strong></strong>${!heal?'<span class="sub gain-label">마신</span>':''}</div>`;
  return row;
 },(row,entry,index)=>{
  textIfChanged(row.querySelector('.rank'),String(index+1));
  const acceleration=type.startsWith('acceleration');
  textIfChanged(row.querySelector('.skill-value strong'),type==='heal'?`${number(entry.hpGain,0)} HP`:signed(displayedGain(entry,acceleration?'acceleration':'speed')));
  if(type!=='heal'){
   const label=row.querySelector('.gain-label');textIfChanged(label,acceleration&&entry.safetyGain>.005?'안전 기여':'마신');
   label.title=acceleration&&entry.safetyGain>.005?'5개 표본의 최저 이득 개선량(마신)':'중앙 발동 표본의 추가·제외 이득(마신)';
  }
  row.querySelector('.assumption-badge').hidden=entry.status!=='assumed';
  const detail=[...(entry.reasons||[]),entry.assumed?.length?'순위·상대 조건 충족을 가정합니다.':''].filter(Boolean).join(' · ');
  const detailNode=row.querySelector('.condition-detail');textIfChanged(detailNode,detail);detailNode.hidden=!detail;
  row.querySelector('input').checked=draftSelected.has(entry.id);
 });
 if(!scores.length)container.innerHTML='<p class="empty-list">유효한 후보가 없습니다.</p>';
}
function renderRoutes(container,skills){
 reconcileRows(container,skills,s=>{
  const row=document.createElement('div');row.className='route-row';row.dataset.routeSkill=s.id;
  const color=s.rarity==='evolution'?'pink':s.rarity==='gold'?'gold':s.rarity==='inherited'?'blue':'';
  row.innerHTML=`<span class="badge route-name">${esc(s.name)}</span><span class="badge ${color}">${grades[s.rarity]||'기타'}</span>${s.compound?'<span class="badge">복합</span>':''}<span class="route-detail"></span><button class="route-remove" data-skill-remove="${esc(s.id)}" aria-label="${esc(s.name)} 선택 해제" title="선택 해제">×</button>`;
  return row;
 },(row,s)=>{textIfChanged(row.querySelector('.route-detail'),s.detail);row.dataset.routeSource=s.pathKind;row.querySelector('.route-remove').hidden=fixedIds.has(s.id);});
}
function renderSelection(){
 const visible=visibleSkillIds(result.tables),shown=[...draftSelected].filter(id=>visible.has(id));
 const [ordinary,inheritance]=acquisitionPlan(data,records,shown);
 const scrolls=qa('.route-scroll').map(node=>[node,node.scrollTop]);
 for(const type of ['speed','acceleration','heal']){
  const skills=ordinary.skills.filter(s=>s.category===type);q(`[data-route-category="${type}"]`).hidden=!skills.length;
  renderRoutes(q(`#route-${type}-list`),skills);
 }
 renderRoutes(q('#route-inheritance-list'),inheritance.skills);
 if(!inheritance.skills.length)q('#route-inheritance-list').innerHTML='<p class="empty-list">선택한 계승기가 없습니다.</p>';
 q('#ordinary-route-empty').hidden=ordinary.skills.length>0;
 for(const [node,top]of scrolls)node.scrollTop=top;
 textIfChanged(q('#selection-status'),`선택 ${shown.length}개`);
 textIfChanged(q('#ordinary-selection-count'),`${ordinary.skills.length}개`);
 const inheritedCount=[...draftSelected].filter(id=>records.get(id).inherited).length;
 textIfChanged(q('#inheritance-selection-count'),`선택 ${inheritedCount}/6`);
 q('#inheritance-selection-count').title=inheritedCount>inheritance.skills.length?'표시에서 제외된 고정 속도 선택도 한도에 포함합니다. 추가 속도기 해제로 초기화할 수 있습니다.':'';
 q('#clear-speed-selection').hidden=![...draftUserSelected].some(id=>records.get(id).categories.some(c=>['speed','passive'].includes(c)));
 q('#selection-notice').hidden=!draftNotice;textIfChanged(q('#selection-notice'),draftNotice);
 qa('[data-skill-id]').forEach(input=>{
  const id=input.dataset.skillId,s=records.get(id);input.checked=draftSelected.has(id);
  const origin=input.closest('.data-row').querySelector('.selection-origin');
  const label=fixedIds.has(id)?'고정':draftAuto&&draftSelected.has(id)&&result.automaticIds.includes(id)&&!draftUserSelected.has(id)&&s.categories.includes('speed')?'추천':'';
  textIfChanged(origin,label);origin.hidden=!label;
 });
 for(const type of ['speed','speed-inheritance','acceleration','acceleration-inheritance','heal']){
  const ids=listIds(type);textIfChanged(q(`#${type}-count`),`${ids.length}개 · 선택 ${ids.filter(id=>draftSelected.has(id)).length}`);
 }
 q('#objective').value=draftObjective;textIfChanged(q('#objective-note'),objectives[draftObjective]);lockResults();
}
function renderChart(){
 const svg=q('#accel-chart');if(q('#panel-acceleration').hidden||!result)return;
 const width=Math.max(260,svg.parentElement.clientWidth);svg.setAttribute('viewBox',`0 0 ${width} 210`);
 htmlIfChanged(svg,accelerationChart(result.accelerationGraph,width));
}
function render(){
 const entries=new Map(result.skills.map(s=>[s.id,s])),rows=ids=>ids.map(id=>entries.get(id));
 for(const type of ['speed','acceleration']){
  renderList(type,rows(result.tables[type].ordinary));
  renderList(type+'-inheritance',rows(result.tables[type].inheritance));
 }
 renderList('heal',rows(result.tables.heal));renderSelection();
 renderChart();
 const combo=result.selected.map(id=>records.get(id)).filter(s=>s.categories.includes('acceleration'));
 htmlIfChanged(q('#acceleration-summary'),`<div class="combo-label"><strong>${result.auto?'자동 추천':'직접 선택'} 조합</strong>${result.auto?`<span class="sub">${result.recommendation.search==='exact'?'완전 탐색':'근사 탐색'}</span>`:''}</div><div>${combo.length?combo.map(s=>esc(displayName(s))).join(' · '):'추가 가속기 없음'}</div><div class="combo-stats"><span>가속 효과 <strong>${signed(result.comparison?.median)} 마신</strong></span><span class="sub">표본 ${signed(result.comparison?.min)} ~ ${signed(result.comparison?.max)}</span></div>${result.recommendation.search==='beam'?'<p>후보가 많아 일부 조합을 탐색했습니다. 전역 최댓값은 보장하지 않습니다.</p>':''}`);
 const labels=['빠른 위치','앞쪽 위치','중앙 위치','뒤쪽 위치','늦은 위치'];
 htmlIfChanged(q('#acceleration-comparison'),result.acceleration.map((r,i)=>`<tr class="${i===2?'active':''}"><td>${labels[i]}</td><td>${number(r.entry?.speed)}</td><td>${number(r.entry?.targetGap)}</td><td>${r.reach&&r.entry?number(r.reach.t-r.entry.t,1):'—'}</td><td>${signed(result.comparison?.values[i])}</td></tr>`).join(''));
 const hp=result.stamina;
 q('#stamina-summary').classList.toggle('ok',!!hp?.fullSpeedFeasible);
 const spurtLabel=result.fullSpurtExcluded?'일반 스퍼트':'최속 스퍼트';
 htmlIfChanged(q('#stamina-summary'),hp?`<strong>${spurtLabel} ${hp.fullSpeedFeasible?'유지 가능':'유지에 HP 부족'}</strong><p>중앙 발동 표본 · 결승 잔량 ${number(hp.hpRemaining,0)} HP${result.fullSpurtExcluded?' · 전개 스퍼트 제외':''}</p>`:'계산 결과 없음');
 htmlIfChanged(q('#stamina-checks'),hp?`<div><span>회복 전부 실패</span><strong>${hp.failHealsFeasible?'유지 가능':'HP 부족'} · ${number(hp.failHealsRemaining,0)} HP</strong></div><div><span>HP 고갈 위치</span><strong>${hp.depletion===null?'고갈 없음':number(hp.depletion,0)+'m'}</strong></div><div><span>최대 HP</span><strong>${number(hp.hpMax,0)}</strong></div>`:'');
 q('#model-status').textContent=result.blockingReason||`조건 성공 가정 · 5개 위치 표본${result.fullSpurtExcluded?' · 전개 스퍼트 제외 추정':''}${result.unsupportedCount?` · 계산 미지원 ${result.unsupportedCount}개 제외`:''}`;
 renderProgress();
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
  const setup=readSetup();
  // The input-panel button also applies staged choices when race/deck inputs
  // are unchanged; rebuilding the setup here would discard those choices.
  if(result&&!dirty&&!setupBusy&&JSON.stringify(setup)===JSON.stringify(appliedSetup)){calculateSelection();return;}
  appliedSetup=setup;candidates=buildCandidates(data,{...appliedSetup,context:fixedContext(appliedSetup)});
  records=new Map([...candidates.learned,...candidates.inheritance,...candidates.factorCandidates].map(s=>[s.id,s]));
  rules=selectionRules(data,records);pendingActions=[];setupBusy=true;
  dirty=false;q('#input-status').classList.remove('error-message');
  q('#scenario-note').textContent=appliedSetup.scenarioId?'시나리오 특수 획득 경로·선택 제한은 추가 검증 중입니다.':'';
  q('#result-context').textContent=`${tracks[appliedSetup.course.track_id]||appliedSetup.course.track_id} ${appliedSetup.course.distance}m · ${q('#style option:checked').textContent} · ${umaName(data.outfits[appliedSetup.outfitId])}`;
  send('setup',appliedSetup);
 }catch(error){busy=false;dirty=true;q('#show-skills').disabled=false;q('#input-status').textContent=error.message;q('#input-status').classList.add('error-message');lockResults();}
}
function activateTab(tab){qa('[role=tab]').forEach(t=>{const active=t===tab;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;q('#'+t.getAttribute('aria-controls')).hidden=!active;});renderChart();}
root.addEventListener('click',event=>{
 const tab=event.target.closest('[role=tab]');if(tab)activateTab(tab);
 const bulk=event.target.closest('[data-select-many]');if(bulk&&!dirty&&result){const type=bulk.dataset.selectMany;queueAction({type:'selectMany',ids:listIds(type).slice(),source:type.split('-')[0]});}
 const remove=event.target.closest('[data-skill-remove]');if(remove&&!dirty&&result){const s=records.get(remove.dataset.skillRemove);queueAction({type:'toggle',id:s.id,checked:false,source:s.categories.includes('acceleration')?'acceleration':s.categories.includes('heal')?'heal':'speed'});}
});
q('[role=tablist]').addEventListener('keydown',event=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const tabs=qa('[role=tab]'),at=tabs.indexOf(document.activeElement);if(at<0)return;
 event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(at+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
 activateTab(tabs[index]);tabs[index].focus();
});
root.addEventListener('change',event=>{
 const el=event.target;
 if(el.closest('.search-select'))return;
 if(el.dataset.skillId){focusSkill=el.dataset.skillId;queueAction({type:'toggle',id:el.dataset.skillId,checked:el.checked,source:el.closest('[role=tabpanel]').id.replace('panel-','')});return;}
 if(el.id==='objective'){queueAction({type:'objective',value:el.value});return;}
 if(el.id==='outfit')syncBloom();
 dirty=true;pendingActions=[];
 busy=inFlight;q('.result-shell').setAttribute('aria-busy',String(busy));q('#show-skills').disabled=busy;
 q('#input-status').textContent='변경한 조건은 계산하기를 눌러 적용하세요.';renderProgress();
});
q('#recalculate').addEventListener('click',()=>calculateSelection());
q('#clear-speed-selection').addEventListener('click',()=>queueAction({type:'clearSpeed'}));
q('#restore-auto').addEventListener('click',()=>calculateSelection(true));
q('#show-skills').addEventListener('click',apply);
new ResizeObserver(renderChart).observe(q('#accel-chart').parentElement);
async function load(){
 try{
  const response=await fetch('data/manifest.json',{cache:'no-cache'});if(!response.ok)throw new Error('manifest unavailable');
  const manifest=await response.json();
  if(!/^data\/bundles\/[a-f0-9]{64}\/dataset\.json$/.test(manifest.dataset_path))throw new Error('invalid data path');
  const bundle=await fetch(manifest.dataset_path);if(!bundle.ok)throw new Error('bundle unavailable');data=await bundle.json();
  if(data.server!=='JP'||data.schema_version!==1)throw new Error('unsupported data version');
  q('#outfit').innerHTML=Object.values(data.outfits).sort((a,b)=>umaName(a).localeCompare(umaName(b),'ko')||a.id.localeCompare(b.id)).map(s=>option(s.id,outfitName(s))).join('');
  q('#outfit').value=data.outfits['114101']?'114101':Object.keys(data.outfits)[0];syncBloom();
  const courses=Object.values(data.courses).filter(c=>c.selectable).sort((a,b)=>Number(a.track_id)-Number(b.track_id)||a.distance-b.distance||a.id.localeCompare(b.id));
  q('#course').innerHTML=courses.map(c=>option(c.id,`${tracks[c.track_id]||c.track_id} · ${c.distance}m · ${c.surface===1?'잔디':'더트'}`)).join('');
  q('#course').value=data.courses['11203']?'11203':courses[0].id;
  q('#scenario').innerHTML=option('','선택 안 함')+Object.values(data.scenarios).map(s=>option(s.id,s.name_jp)).join('');
  const cards=selectableSupports(data),options=option('','미편성')+cards.map(s=>option(s.id,cardLabel(s))).join('');
  q('#deck-inputs').innerHTML=Array.from({length:6},(_,i)=>`<div class="field"><label for="support-${i}-search">서포트 ${i+1}</label><select data-support="${i}" hidden>${options}</select></div>`).join('');
  [q('#outfit'),q('#course'),q('#scenario')].forEach(x=>x.disabled=false);
  const outfitKeywords=new Map(Object.values(data.outfits).map(s=>[s.id,[s.name_jp,...(s.search_aliases_ko||[])].join(' ')]));
  const cardKeywords=new Map(cards.map(s=>[s.id,[s.name_jp,cardTypes[s.type],s.id,...(s.search_aliases_ko||[])].join(' ')]));
  let portraits={};
  try{const response=await fetch('data/portraits.json',{cache:'no-cache'});if(response.ok)portraits=await response.json();}catch{}
  const outfitPortraits=new Map(Object.keys(data.outfits).map(id=>[id,portraitPath(portraits,'outfits',id)]));
  const cardPortraits=new Map(cards.map(s=>[s.id,portraitPath(portraits,'supports',s.id)]));
  const cardBadges=new Map(cards.map(s=>[s.id,cardTypeBadge(s)]));
  searchableSelect(q('#outfit'),{id:'outfit-search',placeholder:'우마무스메 이름 검색',keywords:outfitKeywords,portraits:outfitPortraits});
  qa('[data-support]').forEach((select,i)=>searchableSelect(select,{id:`support-${i}-search`,placeholder:'SSR 이름 검색',keywords:cardKeywords,portraits:cardPortraits,badges:cardBadges}));
  q('#data-status').textContent=`스킬 ${manifest.counts.skills.toLocaleString()}개 · JP`;
  send('load',data);
 }catch(error){q('#data-status').textContent='자료를 불러오지 못했습니다.';q('#input-status').classList.add('error-message');q('#input-status').textContent=location.protocol==='file:'?'로컬 서버로 실행하세요: python -m http.server 8000':'데이터 파일 또는 연결을 확인하고 새로고침하세요.';console.error(error);}
}
load();
