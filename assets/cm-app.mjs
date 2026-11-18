import {createChartSetup,sortChartRows,CM_MODEL_VERSION} from './cm-chart.mjs';
import {selectableCourse} from './reviewed-course-geometry.mjs';
import {ACQUISITION_OPTIONS,acquisitionValue,acquisitionId,checklistCounts,checklistSnapshot,inheritedCount,canRecordAcquisition,buildAcquisitionHierarchy,relatedAcquisitionIds,updateAcquisition,bulkAcquisition} from './cm-state.mjs';
import {createSkillDetails} from './cm-skill-details.mjs';
import {INHERITED_LIMIT,inheritedOrigin} from './cm-recommendation.mjs';
import {calculationSummary,contributionTitle} from './cm-model-presentation.mjs';
import {SKILL_CATEGORIES,categoryRows} from './cm-categories.mjs';
import {courseSvg} from './cm-course.mjs';
import {umaName,cardName,cardTypeBadge,cardTypes,selectableSupports} from './display.mjs';
import {portraitPath} from './portraits.mjs';
import {searchKey} from './search-select.mjs';
import {characterIdentity} from './acquisition-rules.mjs';
import {createFinalPlanner} from './cm-final-ui.mjs';
import {el} from './cm-dom.mjs';
import {skillNameLine,createSkillSourceResolver} from './cm-skill-presentation.mjs';
import {createWorkflow} from './cm-workflow.mjs';
import {restoreChecklistPlan,trimChecklistPlans} from './cm-plan-storage.mjs';
import {finalAcquisitionSnapshot} from './cm-evolution.mjs';
import {CM_ALGORITHM} from './cm-algorithm-version.mjs';

const $=selector=>document.querySelector(selector);
$('#algorithm-version').textContent=CM_ALGORITHM.name;
const STORAGE='umaboard-cm-workspace-v1';
const trackLabels={'10001':'삿포로','10002':'하코다테','10003':'니가타','10004':'후쿠시마','10005':'나카야마','10006':'도쿄','10007':'주쿄','10008':'교토','10009':'한신','10010':'코쿠라','10101':'오이','10102':'카와사키','10103':'후나바시','10104':'모리오카','10105':'우라와','10201':'롱샹','10202':'산타아니타','10203':'델마'};
const statLabels={speed:'스피드',stamina:'스태미나',power:'파워',guts:'근성',wisdom:'지능'};
let data,profiles,display,portraits,manifest,worker,hierarchy,finalPlanner,skillSources,ready=false,busy=false,requestId=0,currentPlan='',rows=[],result=null,total=0;
let draft={setup:null,roster:{},plans:{}},outfitId='101301',deck=['30275','30311','30300','30322','30289','30323'];
let states={},category='all',pickerKind='',pickerSlot=-1,pickerType='',returnFocus=null,searchComposing=false,pickerComposing=false;
const tableNodes=new Map();
const skillDetails=createSkillDetails();
const workflow=createWorkflow({onChange:()=>{skillDetails.dismiss();if(!$('#cm-notice').classList.contains('is-error'))notice('');if(ready)renderRows();},onViewChange:()=>skillDetails.dismiss()});

function notice(text='',error=false){$('#cm-notice').textContent=text;$('#cm-notice').classList.toggle('is-error',error);}
function readDraft(){
 try{const value=JSON.parse(localStorage.getItem(STORAGE)||'null');if(value&&typeof value==='object'&&!Array.isArray(value))draft={setup:value.setup||null,roster:value.roster&&typeof value.roster==='object'?value.roster:{},plans:value.plans&&typeof value.plans==='object'?value.plans:{}};}
 catch{notice('저장된 설정을 읽지 못했습니다. 새 설정으로 계속할 수 있습니다.');}
}
function saveDraft(){
 try{localStorage.setItem(STORAGE,JSON.stringify(draft));return true;}
 catch{notice('브라우저에 저장하지 못했습니다. 작업을 마치면 목록 저장으로 내려받아 주세요.',true);return false;}
}
function ownedProfile(id=outfitId){
 const entry=draft.roster[id];
 if(entry&&Number.isInteger(entry.bloom)&&entry.bloom>=data.outfits[id].base_stars&&entry.bloom<=5&&Number.isInteger(entry.uniqueLevel)&&entry.uniqueLevel>=1&&entry.uniqueLevel<=6)return entry;
 return {bloom:5,uniqueLevel:6};
}
function setupInput(){return {raceContext:{postNumber:$('#race-post').value?Number($('#race-post').value):null,popularity:$('#race-popularity').value?Number($('#race-popularity').value):null},outfitId,...ownedProfile(),style:Number($('input[name="style"]:checked').value),courseId:$('#course').value,going:Number($('#going').value),weather:Number($('#weather').value),season:Number($('#season').value),time:Number($('#race-time').value),scenarioId:$('#scenario').value,supportIds:deck.filter(Boolean)};}
function persistSetup(){if(!ready)return;draft.setup=setupInput();saveDraft();finalPlanner?.invalidate();$('#export-checklist').disabled=true;workflow.setChartState(result?'stale':'empty');if(result||rows.length)notice('설정 변경 · 마신표를 다시 생성하세요.');}
function stopCalculation(announce=true){
 if(!busy)return;worker.postMessage({type:'cancel'});requestId++;busy=false;
 $('#generate').disabled=false;$('#generate span').textContent='1차 마신표 만들기';$('#cancel-calculation').hidden=true;
 $('#progress-label').textContent='계산을 중지했습니다';$('#export-checklist').disabled=!result;
 workflow.setChartState(result?'ready':'empty');
 if(announce)notice('계산 중지');
}
function image(path,alt='',className=''){
 const n=el('img',className);n.src=path;n.alt=alt;n.decoding='async';n.loading='lazy';n.addEventListener('error',()=>n.remove(),{once:true});return n;
}
function portrait(kind,id,label){const shell=el('span','portrait-shell'+(kind==='supports'?' support-portrait':''),label.slice(0,1));const path=portraitPath(portraits,kind,id);if(path){shell.textContent='';shell.append(image(path));}return shell;}
function renderOutfit(){
 const outfit=data.outfits[outfitId],path=portraitPath(portraits,'outfits',outfitId),p=$('#outfit-portrait');p.replaceChildren();if(path)p.append(image(path));else p.textContent=umaName(outfit).slice(0,1);
 $('#outfit-name').textContent=umaName(outfit);$('#outfit-subtitle').textContent=outfit.outfit_name_jp;$('#unique-level').textContent=`고유기 Lv.${ownedProfile().uniqueLevel}${draft.roster[outfitId]?'':' (기본값)'} · 각성 MAX`;
}
function renderDeck(){
 const container=$('#support-deck');container.replaceChildren();
 deck=Array.from({length:6},(_,i)=>data.supports[deck[i]]?deck[i]:null);
 deck.forEach((id,index)=>{
  const button=el('button','support-slot'+(!id?' is-empty':''));button.type='button';button.dataset.slot=String(index);button.setAttribute('aria-haspopup','dialog');
  if(id){const card=data.supports[id];button.setAttribute('aria-label',`${index+1}번 서포트 ${cardName(card)} 변경`);button.append(portrait('supports',id,cardName(card)));const copy=el('span','support-copy'),badge=cardTypeBadge(card);if(badge)copy.append(image(badge.src,badge.label,'type-badge'));copy.append(el('span','',cardName(card)));button.append(copy);}
  else{button.setAttribute('aria-label',`${index+1}번 서포트 추가`);button.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>';button.append(el('span','support-copy','서포트 추가'));}
  button.addEventListener('click',()=>openPicker('support',index,button));container.append(button);
 });
 $('#deck-count').textContent=`${deck.filter(Boolean).length} / 6`;
}
function option(value,label){const o=el('option','',label);o.value=String(value);return o;}
function selectableCourses(){return Object.values(data.courses).filter(selectableCourse);}
function populateCourses(preferred){
 const list=selectableCourses().filter(c=>c.track_id===$('#track').value).sort((a,b)=>a.surface-b.surface||a.distance-b.distance||a.id.localeCompare(b.id));
 $('#course').replaceChildren(...list.map(c=>option(c.id,`${c.surface===1?'잔디':'더트'} ${c.distance.toLocaleString('ko-KR')}m${c.course_variant===3?' · 외':c.course_variant===2?' · 내':''}`)));
 if(list.some(c=>c.id===preferred))$('#course').value=preferred;
 renderRace();
}
function renderCaps(){const p=profiles.profiles[$('#scenario').value];$('#stat-caps').replaceChildren(...Object.entries(p.stats).map(([key,value])=>{const n=el('div');n.append(el('dt','',statLabels[key]),el('dd','',String(value)));return n;}));}
function renderRace(){
 const course=data.courses[$('#course').value];if(!course)return;
 const track=trackLabels[course.track_id]||`경기장 ${course.track_id}`,surface=course.surface===1?'잔디':'더트';
 $('#race-distance').replaceChildren(document.createTextNode(course.distance.toLocaleString('ko-KR')),el('span','','m'));
 $('#race-title').textContent=`${track} · ${surface}`;
 const labels=[['going',['','양호','다습','포화','불량']],['weather',['','맑음','흐림','비','눈']],['season',['','봄','여름','가을','겨울']],['race-time',['','아침','낮','밤']]];
 const facts=[course.turn===1?'우회전':course.turn===2?'좌회전':'직선',...labels.map(([id,values])=>values[Number($('#'+id).value)])];
 $('#race-facts').replaceChildren(...facts.map(text=>el('span','',text)));
 $('#course-ribbon').innerHTML=courseSvg(course);
 $('#course-ribbon').setAttribute('aria-label',`${track} ${surface} ${course.distance}m. 상대 고저와 초반·중반·종반·최종반, 코너·직선 구간. 종반 시작 ${Math.floor(2*course.distance/3)}m. 가로로 스크롤해 전체 도식을 확인할 수 있습니다.`);
}

function openPicker(kind,slot=-1,trigger=null){
 skillDetails.dismiss();
 pickerKind=kind;pickerSlot=slot;pickerType='';returnFocus=trigger||document.activeElement;
 $('#picker-title').textContent=kind==='outfit'?'육성 우마무스메 선택':`${slot+1}번 서포트 선택`;
 $('#picker-description').textContent=kind==='outfit'?'의상을 확인하고 선택해 주세요.':'SSR 카드만 표시합니다. 같은 캐릭터는 중복 편성할 수 없습니다.';
 $('#picker-search').value='';$('#clear-picker-search').hidden=true;$('#remove-support').hidden=kind!=='support'||!deck[slot];
 $('#picker-type-filters').hidden=kind!=='support';
 const types=[['','전체'],['Speed','스피드'],['Stamina','스태미나'],['Power','파워'],['Guts','근성'],['Wit','지능'],['Friend','친구'],['Group','그룹']];
 $('#picker-type-filters').replaceChildren(...types.map(([type,label])=>{const b=el('button','',label);b.type='button';b.dataset.type=type;b.setAttribute('aria-pressed',String(type===''));b.addEventListener('click',()=>{pickerType=type;for(const node of $('#picker-type-filters').children)node.setAttribute('aria-pressed',String(node.dataset.type===type));renderPicker();});return b;}));
 renderPicker();$('#picker-dialog').showModal();$('#picker-search').focus();
}
function closePicker(){$('#picker-dialog').close();}
function renderPicker(){
 const query=searchKey($('#picker-search').value),isOutfit=pickerKind==='outfit';
 const source=isOutfit?Object.values(data.outfits).sort((a,b)=>umaName(a).localeCompare(umaName(b),'ko')||a.id.localeCompare(b.id)):selectableSupports(data);
 const list=source.filter(item=>{
  const label=isOutfit?umaName(item):cardName(item),aliases=(item.search_aliases_ko||[]).join(' ');
  return (!pickerType||item.type===pickerType||pickerType==='Wit'&&item.type==='Wisdom')&&searchKey(`${label} ${item.name_jp} ${item.outfit_name_jp||''} ${aliases}`).includes(query);
 });
 $('#clear-picker-search').hidden=!$('#picker-search').value;
 $('#picker-options').replaceChildren(...list.map(item=>{
  const name=isOutfit?umaName(item):cardName(item),b=el('button','picker-option');b.type='button';b.dataset.id=item.id;
  b.setAttribute('aria-pressed',String(isOutfit?outfitId===item.id:deck[pickerSlot]===item.id));
  let disabledReason='';
  if(!isOutfit){const identity=characterIdentity(item.name_jp);if(identity===data.outfits[outfitId].name_jp)disabledReason='육성마와 같은 캐릭터';else if(deck.some((id,index)=>index!==pickerSlot&&id&&characterIdentity(data.supports[id].name_jp)===identity))disabledReason='이미 편성된 캐릭터';}
  b.disabled=!!disabledReason;if(disabledReason)b.title=disabledReason;
  b.append(portrait(isOutfit?'outfits':'supports',item.id,name));
  const copy=el('span','option-name',name),subtitle=el('span','option-subtitle',disabledReason||(isOutfit?item.outfit_name_jp:cardTypes[item.type]));if(!isOutfit){const badge=cardTypeBadge(item);if(badge)subtitle.prepend(image(badge.src,badge.label,'type-badge'));}copy.append(subtitle);b.append(copy);
  b.addEventListener('click',()=>{stopCalculation(false);if(isOutfit){outfitId=item.id;renderOutfit();}else deck[pickerSlot]=item.id;renderDeck();closePicker();persistSetup();});return b;
 }));
 $('#picker-empty').hidden=list.length!==0;$('#picker-count').textContent=`${list.length.toLocaleString('ko-KR')}개`;
}

function allChecklistRows(){return [...new Map([...rows,...(result?.inheritanceOptions||[])].map(row=>[row.id,row])).values()];}
function newRow(row){
 const tr=el('tr',row.rarity==='evolution'?'evolution-row':'');tr.dataset.skill=row.id;
 const nameCell=el('td'),identity=el('div','skill-identity'),icon=display.icons?.[row.iconId];
 identity.style.setProperty('--skill-indent-level',String(row.indentLevel||0));
 const iconButton=el('button',`skill-detail-trigger rarity-${row.rarity==='gold'?'rare':row.rarity==='evolution'?'evolution':'normal'}`);iconButton.type='button';
 if(icon){const path=icon.path||`assets/skill-icons/utx_ico_skill_${row.iconId}.png`;iconButton.append(image(path,'','skill-icon'));}
 else{const fallback=el('span','skill-icon-fallback');fallback.setAttribute('aria-hidden','true');fallback.innerHTML='<svg viewBox="0 0 20 20"><path d="m5 14 4-9 3 6 3-5M4 16h12"/></svg>';iconButton.append(fallback);}
 skillDetails.attach(iconButton,{...row,prerequisiteNames:relatedAcquisitionIds(hierarchy,row.id).map(id=>data.skills[id]?.name_jp).filter(Boolean)});identity.append(iconButton);
 const copy=el('div','skill-copy');copy.append(skillNameLine(row),el('span','skill-source',skillSources(row)));
 identity.append(copy);nameCell.append(identity);const gain=el('td','gain-cell');gain.dataset.gain='';
 const state=el('td','state-cell'),select=el('select','hint-select');select.dataset.skillId=acquisitionId(row);select.setAttribute('aria-label',`${row.name} 획득 상태 및 할인 레벨`);
 select.append(...ACQUISITION_OPTIONS.map(item=>option(item.value,item.label)));state.append(select);tr.append(nameCell,gain,state);return tr;
}
function renderRows(){
 const pool=allChecklistRows().filter(row=>!row.inherited||$('#show-all-inherited').checked||rows.some(main=>main.id===row.id)||states[row.id]&&states[row.id]!=='unavailable');
 const query=searchKey($('#skill-search').value),ordered=pool.length?sortChartRows(pool,data,display):[],visible=categoryRows(ordered,category).filter(row=>searchKey(row.name).includes(query)),body=$('#skill-table-body');
 for(const item of SKILL_CATEGORIES){
  const tab=$(`#category-${item.id}`),count=categoryRows(pool,item.id).length;
  tab.setAttribute('aria-selected',String(category===item.id));tab.tabIndex=category===item.id?0:-1;tab.querySelector('.category-count').textContent=String(count);
 }
 $('#skill-categories').hidden=rows.length===0;$('#inheritance-note').hidden=rows.length===0;
 $('#category-panel').setAttribute('aria-labelledby',`category-${category}`);
 const wanted=new Set(visible.map(row=>row.id));
 for(const node of [...body.children])if(!wanted.has(node.dataset.skill))node.remove();
 visible.forEach((row,index)=>{
  let node=tableNodes.get(row.id);if(!node){node=newRow(row);tableNodes.set(row.id,node);}
  const gain=node.querySelector('[data-gain]'),value=Number.isFinite(row.gain)&&Math.abs(row.gain)<.005?0:row.gain;
  gain.textContent=Number.isFinite(value)?(value>0?'+':'')+value.toFixed(2):row.calculationState==='incompatible-reference'?'비교 불가':'미지원';gain.classList.toggle('is-zero',value===0);
  gain.title=contributionTitle(row);
  const select=node.querySelector('select'),state=acquisitionValue(states[acquisitionId(row)]);if(select.value!==state)select.value=state;
  node.classList.toggle('is-recorded',state!=='unavailable');select.classList.toggle('is-recorded',state!=='unavailable');
  node.classList.toggle('is-owned',state==='owned');select.classList.toggle('is-owned',state==='owned');
  if(body.children[index]!==node)body.insertBefore(node,body.children[index]||null);
 });
 skillDetails.dismissDetached();
 $('#empty-state').hidden=rows.length>0||busy;$('#skill-table-wrap').hidden=visible.length===0;$('#no-results').hidden=!(rows.length>0&&visible.length===0);
 const count=checklistCounts(allChecklistRows(),states);$('#checklist-count').replaceChildren();
 $('#inherited-count').textContent=`계승 ${inheritedCount(allChecklistRows(),states)} / ${INHERITED_LIMIT}`;
 if(rows.length){if(workflow.stage==='prepare')$('#checklist-count').textContent=`${pool.length}개 스킬`;else $('#checklist-count').append(document.createTextNode(`전체 ${pool.length} · `),el('strong','',`확보 ${count.available}`));}
 else $('#checklist-count').textContent=busy?'계산 준비 중':'목록을 생성해 주세요';
 $('#clear-skill-search').hidden=!$('#skill-search').value;
 for(const id of ['bulk-unavailable','bulk-level5'])$('#'+id).disabled=busy||!result;
}
function recordState(id,value){
 if(!canRecordAcquisition(allChecklistRows(),states,id,value)){renderRows();$('#draft-status').textContent='계승은 최대 6개입니다.';return;}
 const next=updateAcquisition(allChecklistRows(),states,id,value,hierarchy);
 saveAcquisitionStates(next);
}
function saveAcquisitionStates(next,warning=''){
 states=next;
 for(const node of tableNodes.values()){const select=node.querySelector('select');select.removeAttribute('aria-invalid');select.removeAttribute('aria-describedby');}
 if(!draft.plans[currentPlan])draft.plans[currentPlan]={states:{}};
 draft.plans[currentPlan].states=states;draft.plans[currentPlan].savedAt=new Date().toISOString();
 draft.plans=trimChecklistPlans(draft.plans);
 const saved=saveDraft();renderRows();$('#draft-status').textContent=saved?warning:'저장 실패 · 목록을 내려받아 주세요.';
 finalPlanner?.setStates(states);
}
function recordAll(value){
 if(busy||!result)return;
 const next=bulkAcquisition(allChecklistRows(),states,value),skipped=value==='5'?allChecklistRows().filter(row=>row.inherited&&next[row.id]==='unavailable').length:0;
 saveAcquisitionStates(next,skipped?'계승은 6개만 적용했습니다.':'');
}
function beginCalculation(event){
 event?.preventDefault();if(!ready||busy)return;
 const input=setupInput();
 try{createChartSetup(data,profiles,input);}catch(error){notice(error.message,true);$('#outfit-picker').focus();return;}
 skillSources=createSkillSourceResolver(data,input);
 workflow.setChartState('loading');
 finalPlanner?.invalidate();
 skillDetails.dismiss();draft.setup=input;
 const restored=restoreChecklistPlan(draft.plans,input,manifest);currentPlan=restored.key;
 if(restored.plan)draft.plans[currentPlan]=restored.plan;
 saveDraft();states=draft.plans[currentPlan]?.states||{};rows=[];result=null;total=0;category='all';tableNodes.clear();$('#skill-table-body').replaceChildren();$('#skill-search').value='';
 busy=true;$('#generate').disabled=true;$('#generate span').textContent='마신표 계산 중';$('#cancel-calculation').hidden=false;$('#export-checklist').disabled=true;
 $('#calculation-progress').hidden=false;$('#progress-label').textContent='계승 후보를 비교하고 있습니다';$('#progress-count').textContent='';$('#progress-bar').value=0;$('#progress-bar').max=1;$('#draft-status').textContent='';
 notice();renderRows();worker.postMessage({type:'generate',requestId:++requestId,payload:input});
}
function exportChecklist(){
 if(!result||busy||$('#export-checklist').disabled)return;
 const payload={schemaVersion:1,algorithm:CM_ALGORITHM,modelVersion:CM_MODEL_VERSION,createdAt:new Date().toISOString(),dataVersion:manifest.active_version,setup:result.setup,
  acquisition:finalAcquisitionSnapshot(data,result,states),comparisonBasis:result.comparisonBasis,objectivePolicy:result.objectivePolicy,evolutionOptions:result.evolutionOptions,samplingPolicy:result.samplingPolicy,inheritanceOptions:result.inheritanceOptions,skills:allChecklistRows().map(row=>({id:row.id,name:row.name,gain:row.gain,robustGain:row.robustGain,calculationState:row.calculationState,hpSuccessRate:row.hpSuccessRate,hpShortfall:row.hpShortfall,performance:row.performance,comparisonBasis:row.comparisonBasis,scenarios:row.scenarios,scenarioCoverage:row.scenarioCoverage,usefulAccelerationRate:row.usefulAccelerationRate,timeGain:row.timeGain,hpGain:row.hpGain,rarity:row.rarity,inherited:row.inherited,recommendation:row.recommendation,evolutionBaseId:row.evolutionBaseId,prerequisiteIds:relatedAcquisitionIds(hierarchy,row.id),calculationNotes:row.calculationNotes,assumptions:row.assumptions,activationRate:row.activationRate,sampling:row.sampling})),effectPolicy:'self-performance-only',inheritedTopIds:result.inheritedTopIds,sampling:{count:result.samples,dt:result.dt},fullSpurtPolicy:result.fullSpurtPolicy};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=`umaBoard-CM-${result.setup.course.distance}m.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function setupWorker(){
 worker=new Worker(new URL('./cm-worker.mjs',import.meta.url),{type:'module'});
 worker.onmessage=({data:message})=>{
  if(message.type==='loaded'){ready=true;$('#generate').disabled=false;return;}
  if(message.requestId!==requestId)return;
  if(message.type==='progress'){
   rows=message.progress.rows;states={...states,...checklistSnapshot(rows,states,hierarchy)};total=rows.length;$('#progress-label').textContent=message.progress.stage==='inheritance'?'계승 Top 10 후보 비교 중':'확정된 체크리스트 계산 중';$('#progress-bar').max=message.progress.total;$('#progress-bar').value=message.progress.completed;$('#progress-count').textContent=`${message.progress.completed} / ${message.progress.total}`;$('#skill-search').disabled=false;renderRows();
  }else if(message.type==='result'){
   result=message.result;rows=result.rows;$('#chart-calculation-details').hidden=false;$('#chart-calculation-note').textContent=calculationSummary(result);total=rows.length;states=finalAcquisitionSnapshot(data,result,states);busy=false;$('#generate').disabled=false;$('#generate span').textContent='1차 마신표 다시 만들기';$('#cancel-calculation').hidden=true;$('#export-checklist').disabled=false;$('#skill-search').disabled=false;$('#calculation-progress').hidden=true;
   notice();renderRows();
   const retained=new Set();let trimmed=false;for(const row of allChecklistRows())if(row.inherited&&states[row.id]!=='unavailable'){const origin=row.inheritanceOriginId??inheritedOrigin(row.id);if(!retained.has(origin)&&retained.size>=INHERITED_LIMIT){states[row.id]='unavailable';trimmed=true;}else retained.add(origin);}
   if(draft.plans[currentPlan]){draft.plans[currentPlan].states=states;saveDraft();}
   renderRows();$('#draft-status').textContent=trimmed?'계승은 6개만 복원했습니다.':'';
   finalPlanner?.setChart(result,states,currentPlan);
   workflow.setContext(umaName(data.outfits[result.setup.outfitId]),`${data.outfits[result.setup.outfitId].outfit_name_jp} · ${['','도주','선행','선입','추입'][result.setup.style]} · ${trackLabels[result.setup.course.track_id]} ${result.setup.course.surface===1?'잔디':'더트'} ${result.setup.course.distance.toLocaleString('ko-KR')}m · SSR ${result.setup.supportIds.length}장`);
   workflow.setChartState('ready');
   if(workflow.stage==='prepare'){$('#checklist-title').focus({preventScroll:true});$('#checklist').scrollIntoView({block:'start'});}
  }else if(message.type==='error'){
   busy=false;$('#generate').disabled=false;$('#generate span').textContent='1차 마신표 만들기';$('#cancel-calculation').hidden=true;$('#calculation-progress').hidden=true;workflow.setChartState('empty');notice(message.message,true);renderRows();
  }
 };
 worker.onerror=()=>{stopCalculation(false);notice('계산 작업을 시작하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',true);};
 worker.postMessage({type:'load',requestId:0,payload:{data,profiles,display}});
}
async function loadJson(path){const response=await fetch(path);if(!response.ok)throw new Error(`${path}: ${response.status}`);return response.json();}
async function start(){
 readDraft();
 try{
  [manifest,profiles,display,portraits]=await Promise.all(['data/manifest.json','data/cm-scenario-profiles.json','data/cm-skill-display.json','data/portraits.json'].map(loadJson));
  data=await loadJson(manifest.dataset_path);hierarchy=buildAcquisitionHierarchy(data);
  finalPlanner=createFinalPlanner({data,display,manifest,skillDetails,onResult:()=>workflow.showPostView('result'),onRecordError:(ids,message)=>{
   if(workflow.stage!=='finish')return;workflow.showPostView('record');$('#draft-status').textContent=message;let first=null;
   for(const id of ids){const select=tableNodes.get(id)?.querySelector('select');if(select){select.setAttribute('aria-invalid','true');select.setAttribute('aria-describedby','draft-status');if(select.isConnected)first??=select;}}
   (first||$('#skill-search')).focus();
  },read:key=>draft.plans[key]?.postTraining,write:(key,value)=>{draft.plans[key]??={states:{}};draft.plans[key].postTraining=value;draft.plans[key].savedAt=new Date().toISOString();draft.plans=trimChecklistPlans(draft.plans);return saveDraft();}});
  const saved=draft.setup;
  if(saved&&data.outfits[saved.outfitId])outfitId=saved.outfitId;
  if(saved&&Array.isArray(saved.supportIds))deck=saved.supportIds.slice(0,6);
  const course=selectableCourses().find(c=>c.id===(saved?.courseId||'10808'))||selectableCourses()[0];
  const trackIds=[...new Set(selectableCourses().map(c=>c.track_id))].sort();$('#track').replaceChildren(...trackIds.map(id=>option(id,trackLabels[id]||id)));$('#track').value=course.track_id;populateCourses(course.id);
  $('#scenario').replaceChildren(...Object.values(profiles.profiles).sort((a,b)=>Number(b.id)-Number(a.id)).map(p=>option(p.id,p.name_ko)));$('#scenario').value=profiles.profiles[saved?.scenarioId]?saved.scenarioId:profiles.default_scenario_id;
  if(saved){for(const [id,key]of [['race-post','postNumber'],['race-popularity','popularity']])$('#'+id).value=saved.raceContext?.[key]??'';for(const [id,key]of [['going','going'],['weather','weather'],['season','season'],['race-time','time']])if(saved[key])$('#'+id).value=String(saved[key]);const radio=$(`input[name="style"][value="${Number(saved.style)}"]`);if(radio)radio.checked=true;}
  renderOutfit();renderDeck();renderCaps();renderRace();for(const id of ['track','course','scenario','outfit-picker'])$('#'+id).disabled=false;
  setupWorker();
 }catch{notice('데이터를 불러오지 못했습니다. 네트워크를 확인하고 페이지를 새로고침해 주세요.',true);$('#outfit-name').textContent='데이터를 불러오지 못했습니다';$('#outfit-subtitle').textContent='페이지를 새로고침해 주세요.';}
}

$('#setup-form').addEventListener('submit',beginCalculation);$('#cancel-calculation').addEventListener('click',()=>stopCalculation());$('#outfit-picker').addEventListener('click',event=>openPicker('outfit',-1,event.currentTarget));
$('#track').addEventListener('change',()=>{stopCalculation(false);populateCourses();persistSetup();});
for(const id of ['course','going','weather','season','race-time','scenario'])$('#'+id).addEventListener('change',()=>{stopCalculation(false);renderRace();renderCaps();persistSetup();});
for(const radio of document.querySelectorAll('input[name="style"]'))radio.addEventListener('change',()=>{stopCalculation(false);persistSetup();});
$('#close-picker').addEventListener('click',closePicker);$('#picker-dialog').addEventListener('close',()=>returnFocus?.focus());
$('#picker-dialog').addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing){event.preventDefault();closePicker();}});
$('#picker-search').addEventListener('compositionstart',()=>pickerComposing=true);$('#picker-search').addEventListener('compositionend',()=>{pickerComposing=false;renderPicker();});$('#picker-search').addEventListener('input',()=>{if(!pickerComposing)renderPicker();});
$('#clear-picker-search').addEventListener('click',()=>{$('#picker-search').value='';renderPicker();$('#picker-search').focus();});
$('#remove-support').addEventListener('click',()=>{stopCalculation(false);deck[pickerSlot]=null;renderDeck();closePicker();persistSetup();});
$('#skill-search').addEventListener('compositionstart',()=>searchComposing=true);$('#skill-search').addEventListener('compositionend',()=>{searchComposing=false;renderRows();});$('#skill-search').addEventListener('input',()=>{if(!searchComposing)renderRows();});
$('#clear-skill-search').addEventListener('click',()=>{$('#skill-search').value='';renderRows();$('#skill-search').focus();});
$('#skill-table-body').addEventListener('change',event=>{if(event.target.matches('select[data-skill-id]'))recordState(event.target.dataset.skillId,event.target.value);});$('#export-checklist').addEventListener('click',exportChecklist);
$('#bulk-unavailable').addEventListener('click',()=>recordAll('unavailable'));$('#bulk-level5').addEventListener('click',()=>recordAll('5'));
$('#edit-owned').addEventListener('click',()=>{
 if(!ready)return;returnFocus=$('#edit-owned');$('#owned-name').textContent=umaName(data.outfits[outfitId]);$('#owned-bloom').replaceChildren(...Array.from({length:6-data.outfits[outfitId].base_stars},(_,i)=>option(i+data.outfits[outfitId].base_stars,`★${i+data.outfits[outfitId].base_stars}`)));
 $('#owned-bloom').value=String(ownedProfile().bloom);$('#owned-unique').value=String(ownedProfile().uniqueLevel);$('#owned-error').textContent='';$('#owned-dialog').showModal();
});
$('#close-owned').addEventListener('click',()=>$('#owned-dialog').close());$('#owned-dialog').addEventListener('close',()=>returnFocus?.focus());
$('#owned-form').addEventListener('submit',event=>{event.preventDefault();const bloom=Number($('#owned-bloom').value),uniqueLevel=Number($('#owned-unique').value);if(!Number.isInteger(bloom)||bloom<data.outfits[outfitId].base_stars||bloom>5||!Number.isInteger(uniqueLevel)||uniqueLevel<1||uniqueLevel>6){$('#owned-error').textContent='개화와 고유기 레벨을 다시 확인해 주세요.';$('#owned-bloom').focus();return;}stopCalculation(false);draft.roster[outfitId]={bloom,uniqueLevel};renderOutfit();$('#owned-dialog').close();persistSetup();});
for(const item of SKILL_CATEGORIES){
 const tab=el('button','category-tab');tab.type='button';tab.id=`category-${item.id}`;tab.dataset.category=item.id;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','category-panel');tab.setAttribute('aria-selected',String(item.id==='all'));tab.tabIndex=item.id==='all'?0:-1;
 if(item.icon)tab.append(image(`assets/skill-icons/utx_ico_skill_${item.icon}.png`,'','category-icon'));
 tab.append(el('span','',item.label),el('span','category-count','0'));
 tab.addEventListener('click',()=>{category=item.id;renderRows();$('#skill-table-wrap').scrollTop=0;});$('#skill-categories').append(tab);
}
$('#skill-categories').addEventListener('keydown',event=>{
 const tabs=[...$('#skill-categories').children],index=tabs.indexOf(event.target);if(index<0)return;
 const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
 if(next===null)return;event.preventDefault();tabs[next].focus();tabs[next].click();
});
start();

$('#show-all-inherited').addEventListener('change',renderRows);
for(const id of ['race-post','race-popularity'])$('#'+id).addEventListener('change',()=>{stopCalculation(false);persistSetup();});
