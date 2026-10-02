import {buildCandidates,raceContext} from './candidates.mjs';
const root=document.querySelector('#uma-plan'),q=s=>root.querySelector(s),qa=s=>[...root.querySelectorAll(s)];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tracks={'10001':'삿포로','10002':'하코다테','10003':'니가타','10004':'후쿠시마','10005':'나카야마','10006':'도쿄','10007':'주쿄','10008':'교토','10009':'한신','10010':'고쿠라','10101':'오이','10201':'롱샹','10103':'가와사키','10104':'후나바시','10105':'모리오카','10202':'산타 아니타 파크','10203':'델 마'};
const cardTypes={Speed:'스피드',Stamina:'스태미나',Power:'파워',Guts:'근성',Wit:'지능',Wisdom:'지능',Friend:'친구',Group:'그룹'};
const kinds={self:'자체 · 각성 MAX',outfit_event:'자체 이벤트',support_hint:'서포트 힌트',support_event:'서포트 이벤트',scenario_event:'시나리오',evolution:'진화',inheritance:'계승 준비'};
const grades={white:'흰색',gold:'금색',unique:'고유',unique_low_star:'고유',unique_upgraded:'고유',evolution:'진화',inherited:'계승 고유'};
let data,result,selected=new Set(),visible={speed:30,acceleration:30,factors:30,heal:30};
const displayName=s=>s.name_ko||s.name_jp;
const sortSkills=list=>list.slice().sort((a,b)=>Number(a.inherited)-Number(b.inherited)||displayName(a).localeCompare(displayName(b),'ko')||a.id.localeCompare(b.id));
function option(id,label){return `<option value="${esc(id)}">${esc(label)}</option>`;}
function sources(s){
 if(s.inherited)return '계승 준비';
 return [...new Set((s.routes||[]).map(r=>r.owner_type==='support'?data.supports[r.owner_id].name_jp+' · '+kinds[r.kind]:kinds[r.kind]||r.kind))].join(' / ')||'인자 준비';
}
function renderList(type,list){
 const sorted=sortSkills(list),limit=visible[type];q(`#${type}-count`).textContent=`${sorted.length}개`;
 q(`#${type}-list`).innerHTML=sorted.slice(0,limit).map(s=>`<div class="data-row"><label><input type="checkbox" data-skill-id="${esc(s.id)}" aria-label="${esc(displayName(s))} 준비 목록에 추가" ${selected.has(s.id)?'checked':''}></label><div class="skill-info"><div class="skill-heading"><span class="skill-name">${esc(displayName(s))}</span><span class="badge ${s.rarity==='evolution'?'pink':s.rarity==='gold'?'gold':s.inherited?'blue':''}">${grades[s.rarity]||'기타'}</span>${s.choice_groups?.length?'<span class="badge">진화 분기</span>':''}</div>${s.name_ko?`<p class="jp-name">${esc(s.name_jp)}</p>`:''}<div class="skill-meta">${esc(sources(s))}</div><details class="skill-details"><summary>스킬 설명</summary><p>${esc(s.description_jp||'원본 설명 없음')}</p><p>발동 조건 확인 전 · 마신 계산 준비 중</p></details></div></div>`).join('')+(sorted.length>limit?`<button class="data-more" data-more="${type}">더 보기</button>`:'');
 if(!sorted.length)q(`#${type}-list`).innerHTML='<p class="empty-list">현재 조건의 후보가 없습니다.</p>';
}
function allLists(){
 const combined=[...result.learned,...result.inheritance],byId=new Map(combined.map(s=>[s.id,s]));
 renderList('speed',[...byId.values()].filter(s=>s.categories.includes('speed')));
 renderList('acceleration',[...byId.values()].filter(s=>s.categories.includes('acceleration')));
 renderList('heal',result.learned.filter(s=>s.categories.includes('heal')));
 renderList('factors',result.factorCandidates);
 q('#selection-status').textContent=`준비 목록 ${selected.size}개`;
}
function syncBloom(){
 const base=data.outfits[q('#outfit').value].base_stars,old=Number(q('#bloom').value);
 q('#bloom').innerHTML=[1,2,3,4,5].filter(n=>n>=base).map(n=>option(n,`★${n}`)).join('');q('#bloom').value=String(Math.max(old,base));
}
function apply(){
 const supportIds=qa('[data-support]').map(s=>s.value).filter(Boolean);
 if(new Set(supportIds).size!==supportIds.length){q('#input-status').textContent='동일한 서포트 카드를 중복 편성할 수 없습니다.';return;}
 const course=data.courses[q('#course').value];
 result=buildCandidates(data,{outfitId:q('#outfit').value,bloom:Number(q('#bloom').value),supportIds,scenarioId:q('#scenario').value,
   context:raceContext(course,q('#style').value,{ground_condition:Number(q('#going').value)})});
 const ids=new Set([...result.learned,...result.inheritance,...result.factorCandidates].map(s=>s.id));
 selected=new Set([...selected].filter(id=>ids.has(id)));visible={speed:30,acceleration:30,factors:30,heal:30};
 q('#input-status').textContent='조건을 적용했습니다.';
 q('#scenario-note').textContent=q('#scenario').value?'시나리오 특수 획득 경로·선택 제한은 검증 중입니다.':'';
 allLists();q('#live').textContent='입력한 편성의 실제 스킬 후보를 갱신했습니다.';
}
function activateTab(tab){
 qa('[role=tab]').forEach(t=>{const active=t===tab;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;q('#'+t.getAttribute('aria-controls')).hidden=!active;});
}
root.addEventListener('click',event=>{
 const tab=event.target.closest('[role=tab]');if(tab)activateTab(tab);
 const more=event.target.closest('[data-more]');if(more){const type=more.dataset.more;visible[type]+=30;allLists();q(`[data-more="${type}"]`)?.focus();}
});
q('[role=tablist]').addEventListener('keydown',event=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const tabs=qa('[role=tab]'),at=tabs.indexOf(document.activeElement);if(at<0)return;
 event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?tabs.length-1:(at+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
 activateTab(tabs[index]);tabs[index].focus();
});
root.addEventListener('change',event=>{
 const el=event.target;
 if(el.dataset.skillId){
  const id=el.dataset.skillId;
  if(el.checked)selected.add(id);else selected.delete(id);
  // A compound skill is one selection, synchronized across category tabs.
  qa('[data-skill-id]').filter(x=>x.dataset.skillId===id).forEach(x=>x.checked=el.checked);
  q('#selection-status').textContent=`준비 목록 ${selected.size}개`;
 }else{if(el.id==='outfit')syncBloom();q('#input-status').textContent='변경한 조건은 목록 보기를 눌러 적용하세요.';}
});
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
  q('#course').innerHTML=courses.map(c=>option(c.id,`${tracks[c.track_id]||c.track_id} · ${c.distance}m · ${c.surface===1?'잔디':'더트'} · ${c.id}`)).join('');
  q('#course').value=data.courses['11203']?'11203':courses[0].id;
  q('#scenario').innerHTML=option('','선택 안 함')+Object.values(data.scenarios).map(s=>option(s.id,s.name_jp)).join('');
  const cards=Object.values(data.supports).sort((a,b)=>a.name_jp.localeCompare(b.name_jp,'ja')),options=option('','미편성')+cards.map(s=>option(s.id,`${s.rarity} · ${s.name_jp.replace(/\s+\((SSR|SR|R)\)$/,'')} · ${cardTypes[s.type]||s.type}`)).join('');
  q('#deck-inputs').innerHTML=Array.from({length:6},(_,i)=>`<label class="field">서포트 ${i+1}<select data-support="${i}">${options}</select></label>`).join('');
  [q('#outfit'),q('#course'),q('#scenario'),q('#show-skills')].forEach(x=>x.disabled=false);
  q('#data-status').textContent=`스킬 ${manifest.counts.skills.toLocaleString()}개 · JP`;
  apply();
 }catch(error){q('#data-status').textContent='자료를 불러오지 못했습니다.';q('#input-status').classList.add('error-message');q('#input-status').textContent=location.protocol==='file:'?'로컬 서버로 실행하세요: python -m http.server 8000':'데이터 파일 또는 연결을 확인하고 새로고침하세요.';console.error(error);}
}
load();
