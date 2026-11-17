import {el} from './cm-dom.mjs';
import {skillNameLine} from './cm-skill-presentation.mjs';
import {cardName} from './display.mjs';
import {skillIconId} from './cm-icons.mjs';
import {inheritanceProviders} from './cm-inheritance-provider.mjs';
import {INHERITED_LIMIT} from './cm-recommendation.mjs';

export function createAccelerationPanel({data,display,portraits,skillDetails}){
 const $=selector=>document.querySelector(selector),panel=$('#target-acceleration');
 let current=null;
 const updateAcquisition=(rows=[],states={})=>{
  if(!current)return;
  const target=new Set(current.skills.filter(row=>row.inherited).map(row=>row.id)),recorded=new Set(rows.filter(row=>row.inherited&&states[row.id]!==undefined&&states[row.id]!=='unavailable').map(row=>row.id)),total=new Set([...target,...recorded]).size;
  $('#target-inherited-count').textContent=`${target.size} / ${INHERITED_LIMIT}`;
  $('#target-inheritance-note').textContent=total>INHERITED_LIMIT?`기록한 계승과 목표 가속의 계승을 모두 유지하면 ${total}개입니다. 속도·가속 합계 ${INHERITED_LIMIT}개에 맞추려면 ${total-INHERITED_LIMIT}개를 교체해야 합니다.`:`목표 가속이 계승 ${target.size}칸을 사용합니다. 기록한 다른 계승까지 합치면 ${total} / ${INHERITED_LIMIT}개이며, 추가 여유는 ${INHERITED_LIMIT-total}칸입니다. 계승은 속도·가속 합계 최대 ${INHERITED_LIMIT}개이며, 효율에 따라 적게 추천할 수 있습니다.`;
 };
 const skill=(id,note='',metadata={})=>{
  const raw=data.skills[id],row={...raw,...metadata,name:raw.name_jp,description:raw.description_jp},item=el('li','target-skill');
  const button=el('button',`skill-detail-trigger rarity-${raw.rarity==='evolution'?'evolution':raw.rarity==='gold'?'rare':'normal'}`);button.type='button';
  const iconId=skillIconId(raw,display);if(display.icons?.[iconId]){const img=el('img','skill-icon');img.src=`assets/skill-icons/utx_ico_skill_${iconId}.png`;img.alt='';img.loading='lazy';button.append(img);}
  skillDetails.attach(button,row);const copy=el('div','target-skill-copy');copy.append(skillNameLine(row));if(note)copy.append(el('span','target-skill-note',note));
  const providers=inheritanceProviders(data,row,portraits);
  if(providers.length){
   const list=el('div','target-providers');
   for(const provider of providers){
    const badge=el('span','target-provider'),portrait=el('span','target-provider-portrait',provider.name.slice(0,1));badge.title=`계승 제공: ${provider.label}`;
    if(provider.portrait){const img=el('img');img.src=provider.portrait;img.alt='';img.loading='lazy';img.onerror=()=>{portrait.replaceChildren();portrait.textContent=provider.name.slice(0,1);};portrait.replaceChildren(img);}
    badge.append(portrait,el('span','target-provider-name',provider.label));list.append(badge);
   }
   copy.append(list);
  }else if(row.inherited)copy.append(el('span','target-skill-note','계승 제공 의상 확인 필요'));
  item.append(button,copy);
  if(Number.isFinite(metadata.marginalGain)){
   const value=Math.abs(metadata.marginalGain)<.005?0:metadata.marginalGain,gain=el('span','target-skill-gain');
   gain.title='현재 추천 조합에서 이 스킬을 제외했을 때 감소하는 마신';
   gain.append(el('span','target-gain-label','조합 기여'),el('strong','',`${value>=0?'+':''}${value.toFixed(2)}마신`));item.append(gain);
  }
  return item;
 };
 const clear=()=>{current=null;panel.hidden=true;panel.classList.remove('is-stale');};
 const stale=()=>{if(!panel.hidden){panel.classList.add('is-stale');$('#target-plan-state').textContent='설정 변경 · 다시 계산 필요';}};
 const render=plan=>{
  if(!plan){clear();return;}current=plan;panel.hidden=false;panel.classList.remove('is-stale');$('#target-plan-state').textContent='육성 전 확보 목표';updateAcquisition();
  $('#target-gain').textContent=`+${plan.gain.toFixed(2)}`;$('#target-cost').textContent=plan.cost.toLocaleString('ko-KR');
  $('#target-scenario-count').textContent=`${plan.scenarioEvolutionCount} / 2`;
  const ranked=plan.skills.slice().sort((a,b)=>(b.marginalGain??-Infinity)-(a.marginalGain??-Infinity)||a.id.localeCompare(b.id));
  $('#target-skill-list').replaceChildren(...ranked.map(row=>skill(row.id,row.rarity==='evolution'?`${row.baseName} 확보 후 진화`:row.inherited?'계승으로 확보':row.routes.length?'추가 가속 목표':'흰 인자로 확보',row)));
  $('#target-no-skills').hidden=plan.skills.length>0;
  $('#target-policy').textContent=`본체 고유기 기준 · 힌트 Lv5 · 할인 특성 없음 · ${plan.rankComparison?'순위 조건별 비교 평균':'조합을 함께 계산'}${plan.efficiencyPolicy?' · 추가 SP 효율 비교':''}${plan.sacrificedGain>.0001?` · 최대 마신안 대비 -${plan.sacrificedGain.toFixed(2)}마신`:''}`;
  $('#target-policy').title=plan.efficiencyPolicy?`육성 전 확보 목표의 정책 기준: 추가 100 SP당 ${plan.efficiencyPolicy.minGainPer100Sp.toFixed(2)}마신. 실제 구매는 육성 후 SP로 다시 비교합니다.`:'';
  $('#target-search-note').textContent=`${plan.skillGainPolicy==='remove-one-from-target'?'조합 기여 마신 내림차순입니다. 해당 스킬을 뺐을 때의 감소량이며, 효과가 겹치므로 개별 수치의 합은 조합 전체 마신과 다를 수 있습니다. ':''}${plan.rankComparison?'같은 순위에서 가능한 효과를 함께 비교합니다. 순위 변화·발동 확률을 예측한 값은 아닙니다. ':'발동 조건 충족 가정의 이론값입니다. '}${plan.search.refinementLimited?'추가·교체 비교의 계산 한도에 도달했습니다. ':plan.search.method==='bounded'?'제한된 조합을 탐색했습니다. ':''}${plan.excludedCandidates?.length?`비용 미확인 후보 ${plan.excludedCandidates.length}개를 제외했습니다. `:''}실제 스탯과 확보한 힌트로 최종 구매를 다시 계산하세요.`;
  const renderRewards=rewards=>rewards.map(reward=>{
   const item=el('article','target-reward'),head=el('div','target-reward-heading');head.append(el('h4','',reward.cardId?cardName(data.supports[reward.cardId]):reward.eventName||'시나리오 레어 선택'),el('span',`target-reason${reward.reason==='target'?' is-required':''}`,reward.reason==='target'?'가속 확보 우선':reward.reason==='fixed'?'레어 구성 고정':reward.reason==='position'?'동급 · 중반 보강':reward.reason==='cost'?'동급 · SP 절약':'추가 마신 비교'));
   const list=el('ul','target-reward-skills');for(const id of reward.ids)list.append(skill(id,reward.targetIds.includes(id)?'목표 가속의 원본 레어':'함께 확보 가능한 레어'));
   item.append(head,list);if(reward.scenarioId&&reward.selectionLabel)item.append(el('p','target-help',`선택 목표: ${reward.selectionLabel}`));
   if(reward.alternatives.length){const details=el('details','target-alternatives'),summary=el('summary','','다른 레어 세트');details.append(summary);for(const alternative of reward.alternatives){const line=el('p','');line.textContent=alternative.ids.map(id=>data.skills[id].name_jp).join(' + ')||'레어 보상 없음';line.lang='ja';details.append(line);}item.append(details);}
   return item;
  });
  $('#target-reward-list').replaceChildren(...renderRewards(plan.rewards));
  $('#target-reward-empty').hidden=plan.rewards.length>0;
  const scenarioRewards=plan.scenarioRewards||[];
  $('#target-scenario-rewards').hidden=!scenarioRewards.length;
  $('#target-scenario-reward-list').replaceChildren(...renderRewards(scenarioRewards));
  const goals=(plan.strategyGoals||[]).filter(goal=>goal.skillIds.length);
  $('#target-strategy').hidden=!goals.length;
  $('#target-strategy-list').replaceChildren(...goals.map(goal=>{
   const id=goal.skillIds.includes(goal.preferredId)?goal.preferredId:goal.skillIds[0],item=skill(id,`${goal.label} · 우선 확보`),copy=item.children[1];
   copy.append(el('span','target-skill-note',goal.note),el('span','target-skill-note',goal.comparisonNote));
   copy.append(el('span','target-skill-note','본체 고유기 등 다른 PDM 해제 수단을 쓰면 최종 단계의 전략 핵심 유지를 해제할 수 있습니다.'));
   for(const fallback of goal.scenarioFallbacks||[])copy.append(el('span','target-skill-note',`다른 경로에서 미확보 시: ${fallback.eventName} · ${fallback.label} 선택으로 ${data.skills[fallback.skillId].name_jp} 확보. 같은 이벤트의 다른 레어와 동시 선택할 수 없습니다.`));
   if(goal.sources?.[0]){const source=el('a','strategy-source','전략 근거');source.href=goal.sources[0];source.target='_blank';source.rel='noopener noreferrer';copy.append(source);}
   return item;
  }));
 };
 return {render,stale,clear,updateAcquisition};
}
