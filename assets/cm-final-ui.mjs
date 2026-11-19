import {el} from './cm-dom.mjs';
import {STAT_KEYS} from './physics.mjs';
import {createFinalSetup} from './cm-final-plan.mjs';
import {skillNameLine,createSkillSourceResolver} from './cm-skill-presentation.mjs';
import {DISCOUNT_TRAITS,resolveDiscountTrait} from './cm-discounts.mjs';
import {evolutionOptions,evolutionGroups} from './cm-evolution.mjs';
import {skillIconId} from './cm-icons.mjs';
import {strategyGoals} from './cm-strategy.mjs';
import {calculationSummary,marginalSummary,scenarioLabel} from './cm-model-presentation.mjs';
import {CM_ALGORITHM} from './cm-algorithm-version.mjs';

export function createFinalPlanner({data,display,manifest,skillDetails,read,write,onResult=()=>true,onRecordError=()=>{}}){
 const $=selector=>document.querySelector(selector),form=$('#final-form'),fields=$('#final-fields'),inputs=$('#final-inputs');
 let chart=null,states={},scope='',previousPlanIds=[],worker=null,requestId=0,result=null,busy=false;
 const values=()=>{const discountTrait=$('#discount-trait').value;return {maintainStrategicSkills:$('#maintain-strategy').checked,maintainTargetAcceleration:$('#maintain-target').checked,stats:Object.fromEntries(STAT_KEYS.map(key=>[key,$('#actual-'+key).value])),spBudget:$('#actual-sp').value,raceContext:{postNumber:$('#actual-post').value?Number($('#actual-post').value):null,popularity:$('#actual-popularity').value?Number($('#actual-popularity').value):null},discountTrait,fastLearner:discountTrait==='fast-learner',aptitudes:Object.fromEntries(['distance','surface','style'].map(key=>[key,$('#actual-'+key+'-aptitude').value])),excludedEvolutionIds:[...form.querySelectorAll('[data-evolution-option]:not(:checked)')].map(node=>node.value)};};
 const setEvolutionOptions=excluded=>{
  $('#maintain-target-control').hidden=!chart.accelerationPlan?.ids?.length;
  $('#maintain-strategy-control').hidden=!strategyGoals(data,chart.setup).length;
  const groups=evolutionGroups(data,chart.setup,evolutionOptions(data,chart));
  for(const kind of ['outfit','scenario'])$('#evolution-options-'+kind).replaceChildren(...groups[kind].map(row=>{
   const label=el('label','evolution-option'),input=el('input');input.type='checkbox';input.value=row.id;input.dataset.evolutionOption='';input.checked=!excluded?.includes(row.id);
   label.append(input,el('span','',`${row.baseName} → ${row.name}`));return label;
  }));
  $('#evolution-options').hidden=!groups.outfit.length&&!groups.scenario.length;
 };
 const aptitudeSummary=()=>{$('#final-aptitude-summary').textContent=`적성 설정 · ${['distance','surface','style'].map(key=>$('#actual-'+key+'-aptitude').value).join(' / ')}`;};
 const inputSummary=()=>{
  const value=values(),valid=STAT_KEYS.every(key=>/^\d+$/.test(value.stats[key])&&Number(value.stats[key])>=1&&Number(value.stats[key])<=3000)&&/^\d+$/.test(value.spBudget)&&Number(value.spBudget)<=100000;
  const summary=$('#final-input-summary');
  if(!valid){summary.textContent='';return;}
  const parts=[`보유 ${Number(value.spBudget).toLocaleString('ko-KR')} SP`,...(value.discountTrait!=='none'?[DISCOUNT_TRAITS[value.discountTrait].label]:[]),`적성 ${['distance','surface','style'].map(key=>value.aptitudes[key]).join(' / ')}`];
  summary.replaceChildren(...parts.map((text,index)=>el('span','input-summary-part',`${index?' · ':''}${text}`)));
 };
 const setValues=value=>{$('#maintain-strategy').checked=value?.maintainStrategicSkills!==false;$('#maintain-target').checked=value?.maintainTargetAcceleration!==false;for(const key of STAT_KEYS)$('#actual-'+key).value=value?.stats?.[key]??'';$('#actual-sp').value=value?.spBudget??'';$('#discount-trait').value=resolveDiscountTrait({discountTrait:Object.hasOwn(DISCOUNT_TRAITS,value?.discountTrait)?value.discountTrait:undefined,fastLearner:value?.fastLearner===true});for(const key of ['distance','surface','style'])$('#actual-'+key+'-aptitude').value=value?.aptitudes?.[key]??'A';for(const [id,key]of [['actual-post','postNumber'],['actual-popularity','popularity']])$('#'+id).value=(value?.raceContext??chart.setup.raceContext)?.[key]??'';setEvolutionOptions(value?.excludedEvolutionIds);aptitudeSummary();inputSummary();};
 const message=(text='')=>{$('#final-status').textContent=text;};
 const stop=(discardWorker=busy)=>{requestId++;if(discardWorker){worker?.terminate();worker=null;}busy=false;$('#final-submit').disabled=!chart;$('#final-submit').textContent='최종 스킬 추천';$('#final-cancel').hidden=true;$('#final-progress').hidden=true;form.setAttribute('aria-busy','false');};
 const stale=(discardWorker=busy)=>{stop(discardWorker);$('#final-export').disabled=true;if(result){$('#final-result').classList.add('is-stale');$('#final-result-state').textContent='재추천 필요';$('#final-submit').textContent='다시 추천';}message();};
 const error=(text,input)=>{inputs.open=true;$('#final-error').textContent=text;if(input){input.setAttribute('aria-invalid','true');input.focus();}};
 const clearError=()=>{$('#final-error').textContent='';for(const input of form.querySelectorAll('[aria-invalid]'))input.removeAttribute('aria-invalid');};
 const save=()=>{inputSummary();if(scope&&!write(scope,{values:values(),previousPlanIds}))message('저장 실패 · 결과를 내려받아 주세요.');};
 const render=plan=>{
  const panel=$('#final-result'),source=createSkillSourceResolver(data,plan.setup);skillDetails.dismiss();$('#final-empty').hidden=true;panel.hidden=false;panel.classList.remove('is-stale');$('#final-result-state').textContent='';
  for(const [id,value]of [['final-used',plan.budget.used],['final-remaining',plan.budget.remaining],['final-budget',plan.budget.total]])$('#'+id).textContent=value.toLocaleString('ko-KR');
  $('#final-gain').textContent=`${plan.gain>0?'+':''}${plan.gain.toFixed(2)}`;
  $('#final-hp-note').textContent=`비교 표본 스퍼트 HP 충족 ${plan.hpSuccesses} / ${plan.sampling.count}${plan.fullSpeedFeasible?'':' · 표본 평균 부족량 '+plan.hpShortfall.toFixed(1)+' HP'}`;
  $('#final-strategy-note').textContent=(plan.maintainedStrategyIds?.length?'전략 핵심 유지: '+plan.maintainedStrategyIds.map(id=>data.skills[id].name_jp).join(' · ')+'. ':'')+(plan.unavailableStrategyGoals?.length?'미확보·다른 고정과 충돌한 전략 목표: '+plan.unavailableStrategyGoals.map(g=>g.label).join(' · ')+'. ':'')+(plan.strategyGoals?.length?plan.setup.maintainStrategicSkills?'PDM 전략 가치는 직접 마신과 별도로 보호합니다.':'전략 핵심 유지를 해제하고 수치로 비교했습니다.':'');
  $('#final-hp-note').classList.toggle('is-error',!plan.fullSpeedFeasible);
  $('#final-purchase-list').replaceChildren(...plan.purchases.map(row=>{
   const item=el('li','final-purchase');item.dataset.finalSkill=row.id;
   const icon=el('button',`skill-detail-trigger rarity-${row.rarity==='evolution'?'evolution':row.rarity==='gold'?'rare':'normal'}`);icon.type='button';
   if(display.icons[row.iconId]){const img=el('img','skill-icon');img.src=`assets/skill-icons/utx_ico_skill_${row.iconId}.png`;img.alt='';img.loading='lazy';icon.append(img);}
   skillDetails.attach(icon,row);item.append(icon);
   const copy=el('div','final-purchase-copy'),heading=el('div','final-purchase-heading');heading.append(skillNameLine(row),el('strong','final-price',`${row.cost} SP`));copy.append(heading,el('span','final-purchase-kind',`${source(row)} · ${row.rarity==='evolution'?'원본 레어 기준':row.hintLevel===0?'획득':`할인 Lv${row.hintLevel}`}`));
   if(row.stages.length){const details=el('details','final-cost-details'),summary=el('summary','','구매 비용 상세');details.append(summary);const list=el('ul');for(const stage of row.stages){const li=el('li');li.append(el('span','',stage.name),el('span','',`${stage.hint===0?'획득':`할인 Lv${stage.hint}`}${stage.extraDiscount?` · ${DISCOUNT_TRAITS[resolveDiscountTrait(plan.setup)].label}`:''} · ${stage.cost} SP`));list.append(li);}details.append(list);copy.append(details);}
   const marginal=marginalSummary(plan,row.id);if(marginal)copy.append(el('span','final-purchase-kind',marginal));
   if(row.transformation?.kind==='inherited_evolution')copy.append(el('span','final-purchase-kind','기본 계승 구매 단계 공유 · 강화 조건 충족 기록 기준'));
   item.append(copy);return item;
  }));
  $('#final-no-purchases').hidden=plan.purchases.length>0;
  const skillItem=(row,note)=>{
   const item=el('li','final-purchase'),button=el('button',`skill-detail-trigger rarity-${row.rarity==='evolution'?'evolution':row.rarity==='gold'?'rare':'normal'}`);button.type='button';
   const id=row.iconId||skillIconId(data.skills[row.id],display);if(display.icons[id]){const img=el('img','skill-icon');img.src=`assets/skill-icons/utx_ico_skill_${id}.png`;img.alt='';img.loading='lazy';button.append(img);}
   skillDetails.attach(button,row);const copy=el('div','final-purchase-copy');copy.append(skillNameLine(row),el('span','final-purchase-kind',note));const marginal=marginalSummary(plan,row.id);if(marginal)copy.append(el('span','final-purchase-kind',marginal));item.append(button,copy);return item;
  };
  for(const kind of ['outfit','scenario']){
   const rows=plan.evolutions[kind];$('#final-evolution-'+kind).replaceChildren(...rows.map(row=>skillItem(row,`${row.baseName} → 진화 · 추가 0 SP`)));
   $('#final-evolution-'+kind+'-empty').hidden=rows.length>0;
  }
  $('#final-scenario-count').textContent=`${plan.scenarioEvolutionCount} / 2`;
  $('#final-active-count').textContent=`${plan.finalSkills.length}개`;
  $('#final-active-list').replaceChildren(...plan.finalSkills.map(row=>skillItem(row,({native:'본체 고유기',owned:'기존 습득',evolution:'진화 적용',purchase:'추가 구매'})[row.origin])));
  $('#final-search-note').textContent=plan.search.allAffordablePlansMeasured?'기록한 후보를 현재 표본 조건에서 전수 비교했습니다.':'평균 기여와 부진 구간 성능을 비교한 범위 내 추천입니다.';
  const compression=plan.search.approximation;
  if(compression.savedSp>0)$('#final-search-note').textContent+=` 같은 HP·위험 기준에서 최고 평균 대비 ${compression.knownMeanLoss.toFixed(3)}마신 차이로 ${compression.savedSp} SP 절약했습니다.`;
  const alternatives=$('#final-scenario-alternatives'),cases=plan.scenarioAlternatives??[];
  alternatives.hidden=!cases.length;alternatives.open=false;
  const names=ids=>ids.map(id=>data.skills[id]?.name_jp??id).join(' · ');
  alternatives.querySelector('ul').replaceChildren(...cases.map(item=>{
   const changes=[item.added.length&&`추가 ${names(item.added)}`,item.removed.length&&`제외 ${names(item.removed)}`].filter(Boolean);
   return el('li','',`${item.label??scenarioLabel(item.scenario)} · ${item.cost} SP · ${changes.join(' / ')}`);
  }));
  if(plan.rankComparison)$('#final-search-note').textContent+=' 순위 조건별 비교 평균이며 순위 확률이나 승률 예측은 아닙니다.';
  if(plan.unavailableTargetIds?.length)$('#final-search-note').textContent+=' 미확보·조건 변경으로 유지하지 못한 목표: '+plan.unavailableTargetIds.map(id=>data.skills[id].name_jp).join(' · ')+'.';
  $('#final-owned-summary').textContent=`습득 스킬 ${plan.ownedIds.length}개`;
  $('#final-owned-list').replaceChildren(...plan.ownedIds.map(id=>{const li=el('li','',data.skills[id].name_jp);li.lang='ja';return li;}));
  $('#final-calculation-note').textContent=`${calculationSummary(plan)} · 전개별 추가 기여 최소 ${plan.robustGain.toFixed(2)}마신${plan.performance?` · 부진 구간 단축 ${plan.performance.tailImprovement.toFixed(3)}초`:''}${plan.physicsSensitivity?` · 전개 스퍼트 근사 사용/제외 차이 ${plan.physicsSensitivity.difference.toFixed(2)}마신`:''}`;
  $('#final-excluded').hidden=!plan.excluded.length;$('#final-excluded-summary').textContent=`제외 ${plan.excluded.length}개`;
  $('#final-excluded-list').replaceChildren(...plan.excluded.map(row=>el('li','',`${data.skills[row.id].name_jp} · ${row.reason}`)));
  $('#final-export').disabled=false;inputSummary();if(inputs.contains(document.activeElement))$('#final-inputs>summary').focus({preventScroll:true});inputs.open=false;if(onResult()!==false)$('#final-result-title').focus();
 };
 form.addEventListener('input',event=>{if(event.target.tagName!=='SELECT'){clearError();stale();save();}});
 form.addEventListener('change',event=>{if(event.target.tagName==='SELECT'){aptitudeSummary();clearError();stale();save();}});
 form.addEventListener('submit',event=>{
  event.preventDefault();if(!chart||busy)return;clearError();
  for(const key of [...STAT_KEYS,'sp']){
   const node=$('#actual-'+key),value=node.value.trim(),max=key==='sp'?100000:3000,min=key==='sp'?0:1;
   if(!/^\d+$/.test(value)||Number(value)<min||Number(value)>max){error(key==='sp'?'보유 SP를 0~100000 사이의 정수로 입력하세요.':'실제 능력치 5개를 각각 1~3000 사이의 정수로 입력하세요.',node);return;}
  }
  const raw=values(),input={maintainTargetAcceleration:raw.maintainTargetAcceleration,maintainStrategicSkills:raw.maintainStrategicSkills,previousPlanIds,stats:Object.fromEntries(STAT_KEYS.map(key=>[key,Number(raw.stats[key])])),spBudget:Number(raw.spBudget),discountTrait:raw.discountTrait,aptitudes:raw.aptitudes,raceContext:{...chart.setup.raceContext,...raw.raceContext},excludedEvolutionIds:raw.excludedEvolutionIds};
  try{createFinalSetup(chart,input);}catch(cause){error(cause.message);return;}
  stop();busy=true;result=null;$('#final-result').hidden=true;$('#final-empty').hidden=false;$('#final-export').disabled=true;$('#final-submit').disabled=true;$('#final-submit').textContent='조합 추천 중';$('#final-cancel').hidden=false;$('#final-progress').hidden=false;$('#final-progress-bar').value=0;$('#final-progress-bar').max=1;form.setAttribute('aria-busy','true');message();save();
  const job=requestId;
  try{
   if(!worker){
    worker=new Worker(new URL('./cm-final-worker.mjs',import.meta.url),{type:'module'});
    worker.postMessage({type:'load',payload:{data,chart}});
   }
  }catch{stop(true);error('추천 계산을 시작하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');return;}
  worker.onmessage=({data:reply})=>{
   if(reply.requestId!==requestId)return;
   if(reply.type==='progress'){$('#final-progress-label').textContent=reply.progress.stage==='candidates'?'실제 스탯으로 후보 비교 중':reply.progress.stage==='search'?'보유 SP에 맞는 조합 탐색 중':'추천 조합 정밀 비교 중';$('#final-progress-bar').max=Math.max(1,reply.progress.total);$('#final-progress-bar').value=reply.progress.completed;}
   if(reply.type==='result'){result=reply.result;previousPlanIds=result.activeIds;stop(false);render(result);message();save();}
   if(reply.type==='error'){stop();error(reply.message);message();if(reply.code==='ACQUISITION_CONFLICT')onRecordError(reply.details?.conflict?.skillIds||[],reply.message);}
  };
  const activeWorker=worker;
  worker.onerror=event=>{event.preventDefault();if(worker!==activeWorker)return;const running=busy;stop(true);if(running)error('추천 계산을 시작하지 못했습니다. 다시 시도해 주세요.');};
  worker.postMessage({type:'recommend',requestId:job,payload:{states,input}});
 });
 $('#final-cancel').addEventListener('click',()=>{stop();message('추천 중지');$('#final-submit').focus();});
 $('#final-export').addEventListener('click',()=>{
  if(!result||$('#final-export').disabled)return;
  const blob=new Blob([JSON.stringify({schemaVersion:1,dataVersion:manifest.active_version,createdAt:new Date().toISOString(),...result,algorithm:CM_ALGORITHM},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=`umaBoard-최종스킬-${result.setup.course.distance}m.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 return {
  setChart(value,acquisition,key){stop(true);clearError();chart=value;states={...acquisition};scope=key;result=null;fields.disabled=false;inputs.open=true;$('#final-result').hidden=true;$('#final-empty').hidden=false;const saved=read(scope);previousPlanIds=Array.isArray(saved?.previousPlanIds)?saved.previousPlanIds:[];setValues(saved?.values);$('#final-submit').disabled=false;message();},
  setStates(value){if(!chart)return;states={...value};clearError();stale();},
  invalidate(){stale(true);chart=null;fields.disabled=true;$('#final-submit').disabled=true;}
 };
}
