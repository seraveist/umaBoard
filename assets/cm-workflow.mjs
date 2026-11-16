// Navigation moves one existing checklist; no duplicate DOM or draft exists.
export function createWorkflow({onChange=()=>{},onViewChange=()=>{}}={}){
 const $=selector=>document.querySelector(selector),root=$('#workspace');let stage='prepare',ready=false;
 const narrow=matchMedia('(max-width:860px)'),viewTabs=$('#post-view-tabs');let postView='record';
 const panel=value=>$(value==='record'?'#finish-checklist-slot':'#post-result-panel');
 const showPostView=(next,{focus=false}={})=>{
  if(!['record','result'].includes(next))return false;
  postView=next;root.dataset.postView=next;viewTabs.hidden=!narrow.matches;
  for(const value of ['record','result']){
   const tab=$('#post-view-'+value),content=panel(value);tab.setAttribute('aria-selected',String(value===next));tab.tabIndex=value===next?0:-1;content.hidden=narrow.matches&&value!==next;
   if(narrow.matches){content.setAttribute('role','tabpanel');content.setAttribute('aria-labelledby',tab.id);}else{content.removeAttribute('role');content.removeAttribute('aria-labelledby');}
  }
  onViewChange(next);
  if(focus)$('#post-view-'+next).focus();
  return stage==='finish';
 };
 viewTabs.addEventListener('click',event=>{const tab=event.target.closest('[role="tab"]');if(tab)showPostView(tab.id.slice('post-view-'.length));});
 viewTabs.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const next=event.key==='Home'?'record':event.key==='End'?'result':postView==='record'?'result':'record';showPostView(next,{focus:true});
 });
 narrow.addEventListener('change',()=>{
  const active=document.activeElement,hiddenPanel=panel(postView==='record'?'result':'record'),wasInTabs=viewTabs.contains(active),willHide=narrow.matches&&hiddenPanel.contains(active);
  showPostView(postView);
  if(willHide)$('#post-view-'+postView).focus({preventScroll:true});
  else if(wasInTabs&&!narrow.matches){const target=postView==='record'?$('#checklist-title'):$('#final-result').hidden?$('#final-inputs>summary'):$('#final-result-title');target.focus({preventScroll:true});}
 });
 showPostView('record');
 const show=(next,{focus=false}={})=>{
  if(!['prepare','finish'].includes(next)||next==='finish'&&!ready)return false;
  stage=next;root.dataset.stage=stage;
  $('#prepare-stage').hidden=stage!=='prepare';$('#finish-stage').hidden=stage!=='finish';
  $('#'+stage+'-checklist-slot').append($('#checklist'));
  for(const value of ['prepare','finish']){const tab=$('#stage-'+value);tab.setAttribute('aria-selected',String(stage===value));tab.tabIndex=stage===value?0:-1;}
  $('#checklist-title').textContent=stage==='prepare'?'1차 마신표':'스킬 획득 체크리스트';
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
 return {get stage(){return stage;},show,showPostView,
  setChartState(state){root.dataset.chartState=state;ready=state==='ready';$('#stage-finish').disabled=!ready;$('#continue-training').disabled=!ready;$('#pre-next-step').hidden=!ready;$('#finish-step-help').textContent=ready?'획득 기록 · 조합 추천':'마신표 완성 후 사용';if(state==='loading')showPostView('record');if(!ready&&stage==='finish')show('prepare',{focus:true});},
  setContext(title,detail){$('#training-context-title').textContent=title;$('#training-context-detail').textContent=detail;}
 };
}
