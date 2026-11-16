import {createChartSetup,CM_MODEL_VERSION} from './cm-chart.mjs';
import {ACQUISITION_OPTIONS,acquisitionValue,acquisitionId,checklistCounts,checklistSnapshot} from './cm-state.mjs';
import {umaName,cardName,cardTypeBadge,cardTypes,selectableSupports} from './display.mjs';
import {portraitPath} from './portraits.mjs';
import {searchKey} from './search-select.mjs';
import {characterIdentity} from './acquisition-rules.mjs';

const $=selector=>document.querySelector(selector),el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
const STORAGE='umaboard-cm-workspace-v1';
const trackLabels={'10001':'삿포로','10002':'하코다테','10003':'후쿠시마','10004':'니가타','10005':'나카야마','10006':'도쿄','10007':'주쿄','10008':'교토','10009':'한신','10010':'코쿠라','10101':'오이','10102':'카와사키','10103':'후나바시','10104':'모리오카','10105':'우라와','10201':'롱샹'};
const statLabels={speed:'스피드',stamina:'스태미나',power:'파워',guts:'근성',wisdom:'지능'};
let data,profiles,display,portraits,manifest,worker,ready=false,busy=false,requestId=0,currentPlan='',rows=[],result=null,limit=30,total=0;
let draft={setup:null,roster:{},plans:{}},outfitId='101301',deck=['30275','30311','30300','30322','30289','30323'];
let states={},pickerKind='',pickerSlot=-1,pickerType='',returnFocus=null,searchComposing=false,pickerComposing=false;
const tableNodes=new Map();

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
function setupInput(){return {outfitId,...ownedProfile(),style:Number($('input[name="style"]:checked').value),courseId:$('#course').value,going:Number($('#going').value),weather:Number($('#weather').value),season:Number($('#season').value),time:Number($('#race-time').value),scenarioId:$('#scenario').value,supportIds:deck.filter(Boolean)};}
function planKey(input){return JSON.stringify({...input,supportIds:input.supportIds.slice().sort(),dataVersion:manifest.active_version});}
function persistSetup(){if(!ready)return;draft.setup=setupInput();saveDraft();if(result||rows.length)notice('설정이 바뀌었습니다. 마신표 만들기를 눌러 새 조건을 반영하세요.');}
function stopCalculation(announce=true){
 if(!busy)return;worker.postMessage({type:'cancel'});requestId++;busy=false;
 $('#generate').disabled=false;$('#generate span').textContent='1차 마신표 만들기';$('#cancel-calculation').hidden=true;
 $('#progress-label').textContent='계산을 중지했습니다';$('#export-checklist').disabled=!result;
 if(announce)notice('계산을 중지했습니다. 완료된 행은 그대로 유지됩니다.');
}
function image(path,alt='',className=''){
 const n=el('img',className);n.src=path;n.alt=alt;n.decoding='async';n.loading='lazy';n.addEventListener('error',()=>n.remove(),{once:true});return n;
}
function portrait(kind,id,label){const shell=el('span','portrait-shell',label.slice(0,1));const path=portraitPath(portraits,kind,id);if(path){shell.textContent='';shell.append(image(path));}return shell;}
function renderOutfit(){
 const outfit=data.outfits[outfitId],path=portraitPath(portraits,'outfits',outfitId),p=$('#outfit-portrait');p.replaceChildren();if(path)p.append(image(path));else p.textContent=umaName(outfit).slice(0,1);
 $('#outfit-name').textContent=umaName(outfit);$('#outfit-subtitle').textContent=outfit.outfit_name_jp;$('#unique-level').textContent=`고유기 Lv.${ownedProfile().uniqueLevel}${draft.roster[outfitId]?'':' (기본값)'} · 각성 MAX`;
}
function renderDeck(){
 const container=$('#support-deck');container.replaceChildren();
 deck=Array.from({length:6},(_,i)=>data.supports[deck[i]]?deck[i]:null);
 deck.forEach((id,index)=>{
  const button=el('button','support-slot'+(!id?' is-empty':''));button.type='button';button.dataset.slot=String(index);button.setAttribute('aria-haspopup','dialog');
  if(id){const card=data.supports[id];button.setAttribute('aria-label',`${index+1}번 서포트 ${cardName(card)} 변경`);button.append(portrait('supports',id,cardName(card)));const badge=cardTypeBadge(card);if(badge)button.append(image(badge.src,badge.label,'type-badge'));button.append(el('span','support-copy',cardName(card)));}
  else{button.setAttribute('aria-label',`${index+1}번 서포트 추가`);button.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>';button.append(el('span','support-copy','서포트 추가'));}
  button.addEventListener('click',()=>openPicker('support',index,button));container.append(button);
 });
 $('#deck-count').textContent=`${deck.filter(Boolean).length} / 6`;
}
function option(value,label){const o=el('option','',label);o.value=String(value);return o;}
function selectableCourses(){return Object.values(data.courses).filter(c=>c.selectable&&!c.run_up_m&&Number(c.track_id)<10202);}
function populateCourses(preferred){
 const list=selectableCourses().filter(c=>c.track_id===$('#track').value).sort((a,b)=>a.surface-b.surface||a.distance-b.distance||a.id.localeCompare(b.id));
 $('#course').replaceChildren(...list.map(c=>option(c.id,`${c.surface===1?'잔디':'더트'} ${c.distance.toLocaleString('ko-KR')}m${c.course_variant===3?' · 외':''}`)));
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
 const facts=[course.turn===1?'우회전':'좌회전',...labels.map(([id,values])=>values[Number($('#'+id).value)])];
 $('#race-facts').replaceChildren(...facts.map(text=>el('span','',text)));
 const x=m=>18+m/course.distance*664,late=2*course.distance/3,finish=x(course.distance);
 let svg=`<svg viewBox="0 0 700 86" aria-hidden="true"><defs><pattern id="finish-check" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#126c55"/><rect x="3" y="3" width="3" height="3" fill="#126c55"/></pattern></defs><rect x="18" y="28" width="664" height="17" rx="4" fill="#c4dbcf"/>`;
 for(const c of course.corners)svg+=`<rect x="${x(c.start)}" y="28" width="${c.length/course.distance*664}" height="17" fill="#7da48f"/>`;
 svg+=`<line x1="${x(late)}" x2="${x(late)}" y1="12" y2="55" stroke="#b18421" stroke-width="2"/><text x="${x(late)-7}" y="9" text-anchor="end" fill="#126c55" font-size="10">종반 ${Math.round(late)}m</text>`;
 for(const s of course.slopes){const a=x(s.start),b=x(s.start+s.length),y=s.slope>0?18:53;svg+=`<path d="M${a} ${s.slope>0?24:48} L${b} ${y}" stroke="#126c55" stroke-width="2"/>`;}
 svg+=`<rect x="${finish-5}" y="24" width="8" height="25" fill="url(#finish-check)"/>`;
 for(let i=0;i<=4;i++){const m=course.distance*i/4;svg+=`<line x1="${x(m)}" x2="${x(m)}" y1="58" y2="62" stroke="#9cb9a9"/><text x="${x(m)}" y="78" text-anchor="${i===0?'start':i===4?'end':'middle'}" fill="#456b58" font-size="10">${Math.round(m).toLocaleString('ko-KR')}m</text>`;}
 $('#course-ribbon').innerHTML=svg+'</svg>';$('#course-ribbon').setAttribute('aria-label',`${track} ${surface} ${course.distance}m, 코너 ${course.corners.length}구간, 종반 시작 ${Math.round(late)}m`);
}

function openPicker(kind,slot=-1,trigger=null){
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
  if(!isOutfit){const badge=cardTypeBadge(item);if(badge)b.append(image(badge.src,badge.label,'type-badge'));}
  const copy=el('span','option-name',name);copy.append(el('span','option-subtitle',disabledReason||(isOutfit?item.outfit_name_jp:cardTypes[item.type])));b.append(copy);
  b.addEventListener('click',()=>{stopCalculation(false);if(isOutfit){outfitId=item.id;renderOutfit();}else deck[pickerSlot]=item.id;renderDeck();closePicker();persistSetup();});return b;
 }));
 $('#picker-empty').hidden=list.length!==0;$('#picker-count').textContent=`${list.length.toLocaleString('ko-KR')}개`;
}

function newRow(row){
 const tr=el('tr',row.rarity==='evolution'?'evolution-row':'');tr.dataset.skill=row.id;
 const nameCell=el('td'),identity=el('div','skill-identity'),icon=display.icons?.[row.iconId];
 if(icon){const path=icon.path||`assets/skill-icons/utx_ico_skill_${row.iconId}.png`;identity.append(image(path,'','skill-icon'));}
 else{const fallback=el('span','skill-icon-fallback');fallback.setAttribute('aria-hidden','true');fallback.innerHTML='<svg viewBox="0 0 20 20"><path d="m5 14 4-9 3 6 3-5M4 16h12"/></svg>';identity.append(fallback);}
 const copy=el('div','skill-copy'),name=el('span','skill-name',row.name);name.lang='ja';copy.append(name);
 const kind=row.rarity==='evolution'?'진화':row.inherited?'계승':row.rarity==='gold'?'금딱':'';
 if(kind)copy.append(el('span',`skill-kind ${row.inherited?'inherited':row.rarity}`,kind));
 identity.append(copy);nameCell.append(identity);const gain=el('td','gain-cell');gain.dataset.gain='';
 const state=el('td','state-cell'),select=el('select','hint-select');select.dataset.skillId=acquisitionId(row);select.setAttribute('aria-label',`${row.name} 획득 상태 및 힌트 레벨`);
 select.append(...ACQUISITION_OPTIONS.map(item=>option(item.value,item.label)));state.append(select);tr.append(nameCell,gain,state);return tr;
}
function renderRows(){
 const query=searchKey($('#skill-search').value),filtered=rows.filter(row=>searchKey(row.name).includes(query)),visible=filtered.slice(0,limit),body=$('#skill-table-body');
 const wanted=new Set(visible.map(row=>row.id));
 for(const node of [...body.children])if(!wanted.has(node.dataset.skill))node.remove();
 visible.forEach((row,index)=>{
  let node=tableNodes.get(row.id);if(!node){node=newRow(row);tableNodes.set(row.id,node);}
  const gain=node.querySelector('[data-gain]'),value=Math.abs(row.gain)<.005?0:row.gain;
  gain.textContent=(value>0?'+':'')+value.toFixed(2);gain.classList.toggle('is-zero',value===0);
  const select=node.querySelector('select'),state=acquisitionValue(states[acquisitionId(row)]);if(select.value!==state)select.value=state;
  node.classList.toggle('is-recorded',state!=='unavailable');select.classList.toggle('is-recorded',state!=='unavailable');
  if(body.children[index]!==node)body.insertBefore(node,body.children[index]||null);
 });
 $('#empty-state').hidden=rows.length>0||busy;$('#skill-table-wrap').hidden=visible.length===0;$('#no-results').hidden=!(rows.length>0&&filtered.length===0);
 $('#table-footer').hidden=rows.length===0||filtered.length===0;$('#load-more').hidden=visible.length>=filtered.length;
 $('#visible-count').textContent=`${visible.length} / ${filtered.length}개 표시`;
 const count=checklistCounts(rows,states);$('#checklist-count').replaceChildren();
 if(rows.length){$('#checklist-count').append(document.createTextNode(`전체 ${total||rows.length} · `),el('strong','',`확보 ${count.available}`));}
 else $('#checklist-count').textContent=busy?'계산 준비 중':'목록을 생성해 주세요';
 $('#clear-skill-search').hidden=!$('#skill-search').value;
}
function recordState(id,value){
 states[id]=acquisitionValue(value);
 if(!draft.plans[currentPlan])draft.plans[currentPlan]={states:{}};
 draft.plans[currentPlan].states=states;draft.plans[currentPlan].savedAt=new Date().toISOString();
 const entries=Object.entries(draft.plans).sort((a,b)=>(b[1].savedAt||'').localeCompare(a[1].savedAt||''));draft.plans=Object.fromEntries(entries.slice(0,12));
 const saved=saveDraft();renderRows();$('#draft-status').textContent=saved?'체크 상태가 이 브라우저에 저장되었습니다.':'저장 공간을 사용할 수 없습니다. 목록 저장으로 내려받아 주세요.';
}
function beginCalculation(event){
 event?.preventDefault();if(!ready||busy)return;
 const input=setupInput();
 try{createChartSetup(data,profiles,input);}catch(error){notice(error.message,true);$('#outfit-picker').focus();return;}
 draft.setup=input;saveDraft();currentPlan=planKey(input);states=draft.plans[currentPlan]?.states||{};rows=[];result=null;total=0;limit=30;tableNodes.clear();$('#skill-table-body').replaceChildren();$('#skill-search').value='';
 busy=true;$('#generate').disabled=true;$('#generate span').textContent='마신표 계산 중';$('#cancel-calculation').hidden=false;$('#export-checklist').disabled=true;
 $('#calculation-progress').hidden=false;$('#progress-label').textContent='기준 주행과 스킬을 비교하고 있습니다';$('#progress-count').textContent='';$('#progress-bar').value=0;$('#progress-bar').max=1;$('#draft-status').textContent='';
 notice('첫 30개부터 순서대로 표시합니다. 계산 중에도 획득 상태를 입력할 수 있습니다.');renderRows();worker.postMessage({type:'generate',requestId:++requestId,payload:input});
}
function exportChecklist(){
 if(!result)return;
 const payload={schemaVersion:1,modelVersion:CM_MODEL_VERSION,createdAt:new Date().toISOString(),dataVersion:manifest.active_version,setup:result.setup,
  acquisition:checklistSnapshot(result.rows,states),skills:result.rows.map(row=>({id:row.id,name:row.name,gain:row.gain,timeGain:row.timeGain,hpGain:row.hpGain,rarity:row.rarity,evolutionBaseId:row.evolutionBaseId})),sampling:{count:result.samples,dt:result.dt},fullSpurtPolicy:result.fullSpurtPolicy};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=`umaBoard-CM-${result.setup.course.distance}m.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#draft-status').textContent='계산 기준과 체크 상태를 JSON 파일로 저장했습니다.';
}
function setupWorker(){
 worker=new Worker(new URL('./cm-worker.mjs',import.meta.url),{type:'module'});
 worker.onmessage=({data:message})=>{
  if(message.type==='loaded'){ready=true;$('#generate').disabled=false;return;}
  if(message.requestId!==requestId)return;
  if(message.type==='progress'){
   rows=message.progress.rows;total=message.progress.total;$('#progress-bar').max=total;$('#progress-bar').value=message.progress.completed;$('#progress-count').textContent=`${message.progress.completed} / ${total}`;$('#skill-search').disabled=false;renderRows();
  }else if(message.type==='result'){
   result=message.result;rows=result.rows;total=rows.length;busy=false;$('#generate').disabled=false;$('#generate span').textContent='1차 마신표 다시 만들기';$('#cancel-calculation').hidden=true;$('#export-checklist').disabled=false;$('#skill-search').disabled=false;$('#calculation-progress').hidden=true;
   notice(`${rows.length}개 스킬의 비교를 마쳤습니다. 게임 화면 순서대로 획득 상태를 기록하세요.`);renderRows();
   $('#draft-status').textContent=Object.keys(states).length?'저장된 체크 상태를 불러왔습니다.':'미획득이 기본값입니다. 실제로 확보한 스킬만 변경하세요.';
  }else if(message.type==='error'){
   busy=false;$('#generate').disabled=false;$('#generate span').textContent='1차 마신표 만들기';$('#cancel-calculation').hidden=true;$('#calculation-progress').hidden=true;notice(message.message,true);renderRows();
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
  data=await loadJson(manifest.dataset_path);const saved=draft.setup;
  if(saved&&data.outfits[saved.outfitId])outfitId=saved.outfitId;
  if(saved&&Array.isArray(saved.supportIds))deck=saved.supportIds.slice(0,6);
  const course=selectableCourses().find(c=>c.id===(saved?.courseId||'10808'))||selectableCourses()[0];
  const trackIds=[...new Set(selectableCourses().map(c=>c.track_id))].sort();$('#track').replaceChildren(...trackIds.map(id=>option(id,trackLabels[id]||id)));$('#track').value=course.track_id;populateCourses(course.id);
  $('#scenario').replaceChildren(...Object.values(profiles.profiles).sort((a,b)=>Number(b.id)-Number(a.id)).map(p=>option(p.id,p.name_ko)));$('#scenario').value=profiles.profiles[saved?.scenarioId]?saved.scenarioId:profiles.default_scenario_id;
  if(saved){for(const [id,key]of [['going','going'],['weather','weather'],['season','season'],['race-time','time']])if(saved[key])$('#'+id).value=String(saved[key]);const radio=$(`input[name="style"][value="${Number(saved.style)}"]`);if(radio)radio.checked=true;}
  renderOutfit();renderDeck();renderCaps();renderRace();for(const id of ['track','course','scenario','outfit-picker'])$('#'+id).disabled=false;
  $('#data-version').textContent=`JP 데이터 · ${manifest.active_version.slice(0,8)}`;setupWorker();
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
$('#skill-search').addEventListener('compositionstart',()=>searchComposing=true);$('#skill-search').addEventListener('compositionend',()=>{searchComposing=false;limit=30;renderRows();});$('#skill-search').addEventListener('input',()=>{if(!searchComposing){limit=30;renderRows();}});
$('#clear-skill-search').addEventListener('click',()=>{$('#skill-search').value='';limit=30;renderRows();$('#skill-search').focus();});
$('#load-more').addEventListener('click',()=>{limit+=30;renderRows();});$('#skill-table-body').addEventListener('change',event=>{if(event.target.matches('select[data-skill-id]'))recordState(event.target.dataset.skillId,event.target.value);});$('#export-checklist').addEventListener('click',exportChecklist);
$('#edit-owned').addEventListener('click',()=>{
 if(!ready)return;returnFocus=$('#edit-owned');$('#owned-name').textContent=umaName(data.outfits[outfitId]);$('#owned-bloom').replaceChildren(...Array.from({length:6-data.outfits[outfitId].base_stars},(_,i)=>option(i+data.outfits[outfitId].base_stars,`★${i+data.outfits[outfitId].base_stars}`)));
 $('#owned-bloom').value=String(ownedProfile().bloom);$('#owned-unique').value=String(ownedProfile().uniqueLevel);$('#owned-error').textContent='';$('#owned-dialog').showModal();
});
$('#close-owned').addEventListener('click',()=>$('#owned-dialog').close());$('#owned-dialog').addEventListener('close',()=>returnFocus?.focus());
$('#owned-form').addEventListener('submit',event=>{event.preventDefault();const bloom=Number($('#owned-bloom').value),uniqueLevel=Number($('#owned-unique').value);if(!Number.isInteger(bloom)||bloom<data.outfits[outfitId].base_stars||bloom>5||!Number.isInteger(uniqueLevel)||uniqueLevel<1||uniqueLevel>6){$('#owned-error').textContent='개화와 고유기 레벨을 다시 확인해 주세요.';$('#owned-bloom').focus();return;}stopCalculation(false);draft.roster[outfitId]={bloom,uniqueLevel};renderOutfit();$('#owned-dialog').close();persistSetup();});
start();
