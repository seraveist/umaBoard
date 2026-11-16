// Navigation moves one existing checklist; no duplicate DOM or draft exists.
export function createWorkflow({onChange=()=>{}}={}){
 const $=selector=>document.querySelector(selector),root=$('#workspace');let stage='prepare',ready=false;
 const show=(next,{focus=false}={})=>{
  if(!['prepare','finish'].includes(next)||next==='finish'&&!ready)return false;
  stage=next;root.dataset.stage=stage;
  $('#prepare-stage').hidden=stage!=='prepare';$('#finish-stage').hidden=stage!=='finish';
  $('#'+stage+'-checklist-slot').append($('#checklist'));
  for(const value of ['prepare','finish']){const tab=$('#stage-'+value);tab.setAttribute('aria-selected',String(stage===value));tab.tabIndex=stage===value?0:-1;}
  $('#checklist-title').textContent=stage==='prepare'?'1차 마신표':'스킬 획득 체크리스트';
  $('#checklist-description').textContent=stage==='prepare'?'시나리오 기본 상한에서 스킬별 기여를 비교합니다.':'게임 화면 순서대로 습득 상태와 할인 레벨을 기록하세요.';
  $('#stage-description').textContent=stage==='prepare'?'레이스와 편성을 정하고, 육성 전에 배울 스킬을 비교하세요.':'확보한 스킬을 기록하고, 실제 스탯과 SP로 최종 조합을 고르세요.';
  onChange(stage);
  if(focus){$('#stage-'+stage).focus({preventScroll:true});root.scrollIntoView({block:'start'});}
  return true;
 };
 for(const value of ['prepare','finish'])$('#stage-'+value).addEventListener('click',()=>show(value));
 $('.workflow-tabs').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const next=event.key==='Home'||event.key==='ArrowLeft'?'prepare':'finish';if(show(next))$('#stage-'+next).focus();
 });
 $('#continue-training').addEventListener('click',()=>show('finish',{focus:true}));
 $('#edit-preparation').addEventListener('click',()=>{show('prepare',{focus:true});$('#outfit-picker').focus({preventScroll:true});});
 return {get stage(){return stage;},show,
  setChartState(state){root.dataset.chartState=state;ready=state==='ready';$('#stage-finish').disabled=!ready;$('#continue-training').disabled=!ready;$('#pre-next-step').hidden=!ready;$('#finish-step-help').textContent=ready?'획득 기록 · 조합 추천':'마신표 완성 후 사용';if(!ready&&stage==='finish')show('prepare',{focus:true});},
  setContext(title,detail){$('#training-context-title').textContent=title;$('#training-context-detail').textContent=detail;}
 };
}
