import {el} from './cm-dom.mjs';
import {skillNameLine} from './cm-skill-presentation.mjs';
import {cardName} from './display.mjs';
import {skillIconId} from './cm-icons.mjs';

export function createAccelerationPanel({data,display,skillDetails}){
 const $=selector=>document.querySelector(selector),panel=$('#target-acceleration');
 const skill=(id,note='',metadata={})=>{
  const raw=data.skills[id],row={...raw,...metadata,name:raw.name_jp,description:raw.description_jp},item=el('li','target-skill');
  const button=el('button',`skill-detail-trigger rarity-${raw.rarity==='evolution'?'evolution':raw.rarity==='gold'?'rare':'normal'}`);button.type='button';
  const iconId=skillIconId(raw,display);if(display.icons?.[iconId]){const img=el('img','skill-icon');img.src=`assets/skill-icons/utx_ico_skill_${iconId}.png`;img.alt='';img.loading='lazy';button.append(img);}
  skillDetails.attach(button,row);const copy=el('div','target-skill-copy');copy.append(skillNameLine(row));if(note)copy.append(el('span','target-skill-note',note));item.append(button,copy);return item;
 };
 const clear=()=>{panel.hidden=true;panel.classList.remove('is-stale');};
 const stale=()=>{if(!panel.hidden){panel.classList.add('is-stale');$('#target-plan-state').textContent='설정 변경 · 다시 계산 필요';}};
 const render=plan=>{
  if(!plan){clear();return;}panel.hidden=false;panel.classList.remove('is-stale');$('#target-plan-state').textContent='육성 전 확보 목표';
  $('#target-gain').textContent=`+${plan.gain.toFixed(2)}`;$('#target-cost').textContent=plan.cost.toLocaleString('ko-KR');
  $('#target-scenario-count').textContent=`${plan.scenarioEvolutionCount} / 2`;
  $('#target-skill-list').replaceChildren(...plan.skills.map(row=>skill(row.id,row.rarity==='evolution'?`${row.baseName} 확보 후 진화`:row.inherited?'계승으로 확보':row.routes.length?'추가 가속 목표':'흰 인자로 확보',row)));
  $('#target-no-skills').hidden=plan.skills.length>0;
  $('#target-policy').textContent=`본체 고유기 기준 · 힌트 Lv5 · 할인 특성 없음 · 조합을 함께 계산${plan.sacrificedGain>.0001?` · 탐색 최대 대비 ${plan.sacrificedGain.toFixed(2)}마신 이내에서 SP 절약`:''}`;
  $('#target-search-note').textContent=`발동 조건 충족 가정의 이론값입니다. ${plan.search.method==='bounded'?'제한된 조합을 탐색했습니다. ':''}실제 스탯과 확보한 힌트로 최종 구매를 다시 계산하세요.`;
  $('#target-reward-list').replaceChildren(...plan.rewards.map(reward=>{
   const item=el('article','target-reward'),head=el('div','target-reward-heading');head.append(el('h4','',cardName(data.supports[reward.cardId])),el('span',`target-reason${reward.reason==='target'?' is-required':''}`,reward.reason==='target'?'가속 확보 우선':reward.reason==='fixed'?'레어 구성 고정':reward.reason==='position'?'동급 · 중반 보강':reward.reason==='cost'?'동급 · SP 절약':'추가 마신 비교'));
   const list=el('ul','target-reward-skills');for(const id of reward.ids)list.append(skill(id,reward.targetIds.includes(id)?'목표 가속의 원본 레어':'함께 확보 가능한 레어'));
   item.append(head,list);
   if(reward.alternatives.length){const details=el('details','target-alternatives'),summary=el('summary','','다른 레어 세트');details.append(summary);for(const alternative of reward.alternatives){const line=el('p','');line.textContent=alternative.ids.map(id=>data.skills[id].name_jp).join(' + ')||'레어 보상 없음';line.lang='ja';details.append(line);}item.append(details);}
   return item;
  }));
  $('#target-reward-empty').hidden=plan.rewards.length>0;
 };
 return {render,stale,clear};
}
