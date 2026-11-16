import {el} from './cm-dom.mjs';
import {STAT_KEYS} from './physics.mjs';
import {createFinalSetup} from './cm-final-plan.mjs';
import {skillRarityLabel} from './cm-skill-details.mjs';

export function createFinalPlanner({data,display,manifest,skillDetails,read,write}){
 const $=selector=>document.querySelector(selector),form=$('#final-form'),fields=$('#final-fields');
 let chart=null,states={},scope='',worker=null,requestId=0,result=null,busy=false;
 const values=()=>({stats:Object.fromEntries(STAT_KEYS.map(key=>[key,$('#actual-'+key).value])),spBudget:$('#actual-sp').value,aptitudes:Object.fromEntries(['distance','surface','style'].map(key=>[key,$('#actual-'+key+'-aptitude').value]))});
 const setValues=value=>{for(const key of STAT_KEYS)$('#actual-'+key).value=value?.stats?.[key]??'';$('#actual-sp').value=value?.spBudget??'';for(const key of ['distance','surface','style'])$('#actual-'+key+'-aptitude').value=value?.aptitudes?.[key]??'A';};
 const message=text=>{$('#final-status').textContent=text;};
 const stop=()=>{requestId++;worker?.terminate();worker=null;busy=false;$('#final-submit').disabled=!chart;$('#final-submit').textContent='최종 스킬 추천';$('#final-cancel').hidden=true;$('#final-progress').hidden=true;form.setAttribute('aria-busy','false');};
 const stale=text=>{stop();$('#final-export').disabled=true;if(result){$('#final-result').classList.add('is-stale');$('#final-result-state').textContent='이전 조건의 결과 · 다시 추천해 주세요';}message(text);};
 const error=(text,input)=>{$('#final-error').textContent=text;if(input){input.setAttribute('aria-invalid','true');input.focus();}};
 const clearError=()=>{$('#final-error').textContent='';for(const input of form.querySelectorAll('[aria-invalid]'))input.removeAttribute('aria-invalid');};
 const save=()=>{if(scope&&!write(scope,{values:values()}))message('입력값을 저장하지 못했습니다. 결과를 내려받아 보관해 주세요.');};
 const render=plan=>{
  const panel=$('#final-result');skillDetails.dismiss();panel.hidden=false;panel.classList.remove('is-stale');$('#final-result-state').textContent='현재 스탯·체크 상태 기준';
  for(const [id,value]of [['final-used',plan.budget.used],['final-remaining',plan.budget.remaining],['final-budget',plan.budget.total]])$('#'+id).textContent=value.toLocaleString('ko-KR');
  $('#final-gain').textContent=`${plan.gain>0?'+':''}${plan.gain.toFixed(2)}`;
  $('#final-hp-note').textContent=plan.fullSpeedFeasible?'회복을 포함한 조합으로 최속 스퍼트 HP 조건을 충족합니다.':'탐색한 조합에서 최속 스퍼트 HP 조건을 충족하지 못했습니다. 실제 스태미나와 확보한 회복기를 확인해 주세요.';
  $('#final-hp-note').classList.toggle('is-error',!plan.fullSpeedFeasible);
  $('#final-purchase-list').replaceChildren(...plan.purchases.map(row=>{
   const item=el('li','final-purchase');item.dataset.finalSkill=row.id;
   const icon=el('button',`skill-detail-trigger rarity-${row.rarity==='evolution'?'evolution':row.rarity==='gold'?'rare':'normal'}`);icon.type='button';
   if(display.icons[row.iconId]){const img=el('img','skill-icon');img.src=`assets/skill-icons/utx_ico_skill_${row.iconId}.png`;img.alt='';img.loading='lazy';icon.append(img);}
   skillDetails.attach(icon,row);item.append(icon);
   const copy=el('div','final-purchase-copy'),name=el('strong','',row.name);name.lang='ja';copy.append(name,el('span','final-purchase-kind',`${skillRarityLabel(row)} · ${row.rarity==='evolution'?'원본 레어 구매 후 진화':`힌트 Lv${row.hintLevel}`}`));
   if(row.stages.length){const details=el('details','final-cost-details'),summary=el('summary','','구매 비용 상세');details.append(summary);const list=el('ul');for(const stage of row.stages){const li=el('li');li.append(el('span','',stage.name),el('span','',`Lv${stage.hint} · ${stage.cost} SP`));list.append(li);}details.append(list);copy.append(details);}
   else copy.append(el('span','final-purchase-kind','이미 습득한 하위 단계의 비용은 제외했습니다.'));
   item.append(copy,el('strong','final-price',`${row.cost} SP`));return item;
  }));
  $('#final-no-purchases').hidden=plan.purchases.length>0;
  $('#final-owned-summary').textContent=`기록된 습득 스킬 ${plan.ownedIds.length}개 · 추가 SP 0`;
  $('#final-owned-list').replaceChildren(...plan.ownedIds.map(id=>{const li=el('li','',data.skills[id].name_jp);li.lang='ja';return li;}));
  $('#final-excluded').hidden=!plan.excluded.length;$('#final-excluded-summary').textContent=`추천에서 제외된 스킬 ${plan.excluded.length}개`;
  $('#final-excluded-list').replaceChildren(...plan.excluded.map(row=>el('li','',`${data.skills[row.id].name_jp} · ${row.reason}`)));
  $('#final-export').disabled=false;$('#final-result-title').focus();
 };
 form.addEventListener('input',()=>{clearError();stale('입력값이 바뀌었습니다. 최종 스킬 추천을 다시 실행해 주세요.');save();});
 form.addEventListener('change',event=>{if(event.target.tagName==='SELECT'){clearError();stale('적성이 바뀌었습니다. 최종 스킬 추천을 다시 실행해 주세요.');save();}});
 form.addEventListener('submit',event=>{
  event.preventDefault();if(!chart||busy)return;clearError();
  for(const key of [...STAT_KEYS,'sp']){
   const node=$('#actual-'+key),value=node.value.trim(),max=key==='sp'?100000:3000,min=key==='sp'?0:1;
   if(!/^\d+$/.test(value)||Number(value)<min||Number(value)>max){error(key==='sp'?'보유 SP를 0~100000 사이의 정수로 입력하세요.':'실제 능력치 5개를 각각 1~3000 사이의 정수로 입력하세요.',node);return;}
  }
  const raw=values(),input={stats:Object.fromEntries(STAT_KEYS.map(key=>[key,Number(raw.stats[key])])),spBudget:Number(raw.spBudget),aptitudes:raw.aptitudes};
  try{createFinalSetup(chart,input);}catch(cause){error(cause.message);return;}
  stop();busy=true;result=null;$('#final-result').hidden=true;$('#final-export').disabled=true;$('#final-submit').disabled=true;$('#final-submit').textContent='조합 추천 중';$('#final-cancel').hidden=false;$('#final-progress').hidden=false;$('#final-progress-bar').value=0;$('#final-progress-bar').max=1;form.setAttribute('aria-busy','true');message('현재 습득 상태와 실제 스탯으로 추천을 시작합니다.');save();
  const job=requestId;
  try{worker=new Worker(new URL('./cm-final-worker.mjs',import.meta.url),{type:'module'});}catch{stop();error('추천 계산을 시작하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');return;}
  worker.onmessage=({data:reply})=>{
   if(reply.requestId!==requestId)return;
   if(reply.type==='progress'){$('#final-progress-label').textContent=reply.progress.stage==='candidates'?'실제 스탯으로 후보 비교 중':reply.progress.stage==='search'?'보유 SP에 맞는 조합 탐색 중':'추천 조합 정밀 비교 중';$('#final-progress-bar').max=Math.max(1,reply.progress.total);$('#final-progress-bar').value=reply.progress.completed;}
   if(reply.type==='result'){result=reply.result;stop();render(result);message(`${result.purchases.length}개 추가 스킬을 추천했습니다. 게임에서 구매한 뒤 체크리스트에 습득을 기록하세요.`);}
   if(reply.type==='error'){stop();error(reply.message);message('입력과 획득 상태를 확인한 뒤 다시 추천해 주세요.');}
  };
  worker.onerror=event=>{event.preventDefault();if(job!==requestId)return;stop();error('추천 계산을 시작하지 못했습니다. 다시 시도해 주세요.');};
  worker.postMessage({type:'load',payload:data});worker.postMessage({type:'recommend',requestId:job,payload:{chart,states,input}});
 });
 $('#final-cancel').addEventListener('click',()=>{stop();message('추천을 중지했습니다. 입력과 체크 상태는 유지됩니다.');$('#final-submit').focus();});
 $('#final-export').addEventListener('click',()=>{
  if(!result||$('#final-export').disabled)return;
  const blob=new Blob([JSON.stringify({schemaVersion:1,dataVersion:manifest.active_version,createdAt:new Date().toISOString(),...result},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=`umaBoard-최종스킬-${result.setup.course.distance}m.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('최종 스킬 추천 결과를 저장했습니다.');
 });
 return {
  setChart(value,acquisition,key){stop();chart=value;states={...acquisition};scope=key;result=null;fields.disabled=false;$('#final-result').hidden=true;setValues(read(scope)?.values);$('#final-submit').disabled=false;$('#final-lock-note').textContent=`완성된 1차 마신표 ${chart.rows.length}개와 현재 체크 상태를 사용합니다.`;message('육성 결과 화면의 실제 능력치와 남은 SP를 입력하세요.');},
  setStates(value){if(!chart)return;states={...value};stale('획득 상태가 바뀌었습니다. 변경한 힌트와 습득 기록으로 다시 추천해 주세요.');},
  invalidate(text='먼저 현재 설정으로 1차 마신표를 완성해 주세요.'){stale(text);chart=null;fields.disabled=true;$('#final-submit').disabled=true;$('#final-lock-note').textContent=text;}
 };
}
