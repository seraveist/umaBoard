import {chartScenarioSummary} from './cm-model-presentation.mjs';
export const skillRarityLabel=row=>row.inherited?'계승':row.rarity==='evolution'?'진화':row.rarity==='gold'?'레어':'일반';

// One body-mounted, text-only tooltip avoids table clipping and keeps pointer,
// keyboard and tap access on the same icon button. No source HTML is interpreted.
export function createSkillDetails(){
 const panel=document.createElement('div');panel.id='skill-details';panel.className='skill-details';panel.role='tooltip';panel.hidden=true;document.body.append(panel);
 let active=null,pinned=false,showTimer,hideTimer;
 const clearTimers=()=>{clearTimeout(showTimer);clearTimeout(hideTimer);};
 const dismiss=()=>{
  clearTimers();if(active){active.setAttribute('aria-expanded','false');active.removeAttribute('aria-describedby');}
  panel.hidden=true;active=null;pinned=false;
 };
 const position=()=>{
  if(!active)return;
  const rect=active.getBoundingClientRect(),width=document.documentElement.clientWidth,height=window.innerHeight,gap=10;
  const left=Math.max(12,Math.min(rect.left,width-panel.offsetWidth-12));
  const below=rect.bottom+gap,top=below+panel.offsetHeight<=height-12?below:Math.max(12,rect.top-gap-panel.offsetHeight);
  panel.style.left=`${left}px`;panel.style.top=`${top}px`;
 };
 const show=(button,row,chart)=>{
  clearTimers();if(active&&active!==button)dismiss();active=button;
  const name=document.createElement('strong');name.className='skill-detail-name';name.lang='ja';name.textContent=row.name;
  const kind=document.createElement('span');kind.className='skill-detail-kind';kind.textContent=skillRarityLabel(row);
  const description=document.createElement('p');description.lang='ja';description.textContent=row.description||'등록된 상세 설명이 없습니다.';
  panel.replaceChildren(name,kind,description);
  const summary=chart&&chartScenarioSummary(row);
  if(summary){const line=document.createElement('p');line.textContent=summary;panel.append(line);}
  if(row.prerequisiteNames?.length){const lower=document.createElement('p');lower.className='skill-detail-relations';lower.textContent=`하위 스킬: ${row.prerequisiteNames.join(' · ')}`;panel.append(lower);}
  panel.hidden=false;button.setAttribute('aria-expanded','true');button.setAttribute('aria-describedby',panel.id);position();
 };
 const scheduleHide=()=>{clearTimeout(showTimer);clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if(!pinned&&document.activeElement!==active)dismiss();},120);};
 panel.addEventListener('pointerenter',()=>clearTimeout(hideTimer));panel.addEventListener('pointerleave',scheduleHide);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing&&active){dismiss();event.preventDefault();}});
 document.addEventListener('pointerdown',event=>{if(active&&!active.contains(event.target)&&!panel.contains(event.target))dismiss();});
 document.addEventListener('scroll',event=>{
  if(!active||panel.contains(event.target))return;
  // Keyboard focus can scroll a new table row into view. Keep its description
  // anchored instead of immediately dismissing the explanation just opened.
  const rect=active.getBoundingClientRect(),table=active.closest('.skill-table-wrap')?.getBoundingClientRect();
  if(document.activeElement===active&&!pinned&&rect.bottom>Math.max(0,table?.top||0)&&rect.top<Math.min(innerHeight,table?.bottom||innerHeight))position();else dismiss();
 },true);
 window.addEventListener('resize',dismiss);
 return {
  dismiss,
  dismissDetached(){if(active&&!active.isConnected)dismiss();},
  attach(button,row,chart=false){
   button.setAttribute('aria-label',`${row.name} 상세 설명`);button.setAttribute('aria-controls',panel.id);button.setAttribute('aria-expanded','false');
   button.addEventListener('pointerenter',event=>{if(event.pointerType==='touch')return;clearTimeout(hideTimer);showTimer=setTimeout(()=>show(button,row,chart),300);});
   button.addEventListener('pointerleave',scheduleHide);
   button.addEventListener('focus',()=>show(button,row,chart));button.addEventListener('blur',scheduleHide);
   button.addEventListener('click',()=>{if(active===button&&pinned)dismiss();else{show(button,row,chart);pinned=true;}});
  }
 };
}
