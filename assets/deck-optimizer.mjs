import {SkillOptimizer} from './skill-optimizer.mjs';
import {PurchaseModel} from './purchases.mjs';
import {buildCandidates} from './candidates.mjs';
import {compileSkill,fixedContext} from './activation.mjs';
import {selectionRules} from './selection.mjs';

export const supportIdentity=card=>(card.name_jp||'').replace(/\s+\((SSR|SR|R)\)$/,'');
export function validateDeck(data,setup,ids,{ownedIds=null,rentalAllowed=true,typeCounts=null,lockedIds=[]}={}){
 if(ids.length>6||new Set(ids).size!==ids.length)throw new Error('서포트는 중복 없이 최대 6장입니다.');
 const own=ownedIds===null?null:new Set(ownedIds),names=new Set(),counts={};let rentals=0;
 const body=data.outfits[setup.outfitId]?.name_jp;
 for(const id of ids){
  const c=data.supports[id];if(!c||c.rarity!=='SSR')throw new Error('SSR 카드만 편성할 수 있습니다.');
  const name=supportIdentity(c);if(names.has(name)||name===body)throw new Error('같은 우마무스메의 카드 또는 육성마와 같은 카드는 편성할 수 없습니다.');
  names.add(name);counts[c.type]=(counts[c.type]||0)+1;if(own&&!own.has(id))rentals++;
 }
 if(rentals>(rentalAllowed?1:0))throw new Error('보유 카드와 최대 1장 렌탈로 편성하세요.');
 if(lockedIds.some(id=>!ids.includes(id)))throw new Error('고정 카드가 편성에서 빠졌습니다.');
 if(typeCounts&&ids.length===6&&Object.entries(typeCounts).some(([type,n])=>(counts[type]||0)!==n))throw new Error('지정한 타입 장수를 만족하지 않습니다.');
 return {rentals,counts};
}
export function recommendDecks(data,setup,constraints){
 const ownedIds=[...new Set(constraints.ownedIds||[])],lockedIds=[...new Set(constraints.lockedIds||[])],rentalAllowed=constraints.rentalAllowed!==false;
 const typeCounts=constraints.typeCounts||null;
 if(typeCounts&&(Object.values(typeCounts).some(n=>!Number.isInteger(n)||n<0)||Object.values(typeCounts).reduce((a,b)=>a+b,0)!==6))throw new Error('타입 장수의 합은 6이어야 합니다.');
 validateDeck(data,setup,lockedIds,{ownedIds,rentalAllowed,lockedIds});
 const owned=new Set(ownedIds),body=data.outfits[setup.outfitId]?.name_jp;
 const cards=Object.values(data.supports).filter(c=>c.rarity==='SSR'&&supportIdentity(c)!==body&&(owned.has(c.id)||rentalAllowed));
 if(ownedIds.length<5&&rentalAllowed||ownedIds.length<6&&!rentalAllowed)throw new Error('보유 카드를 최소 '+(rentalAllowed?5:6)+'장 등록하세요.');
 const probe=new SkillOptimizer(data,{...setup,supportIds:[]});
 const candidates=buildCandidates(data,{...setup,supportIds:cards.map(c=>c.id),purchase:true,context:fixedContext(setup)});
 for(const s of candidates.learned)if(!probe.records.has(s.id)){probe.records.set(s.id,s);probe.compiled.set(s.id,compileSkill(s,setup));}
 probe.rules=selectionRules(data,probe.records);
 const goldScores=new Map();
 const ranked=cards.map(card=>{
  const model=new PurchaseModel(data,probe.records,{...setup,supportIds:[card.id]}),routes=data.acquisition_routes.filter(r=>r.owner_type==='support'&&r.owner_id===card.id);
  const gold=routes.filter(r=>data.skills[r.skill_id]?.rarity==='gold').map(r=>r.skill_id);
  for(const id of gold)if(!goldScores.has(id)&&probe.records.has(id)){
   const gain=Math.max(0,probe.marginal(id,probe.nativeIds,[.5]).gain?.median||0);
   const hp=probe.record(id).categories.includes('heal')?Math.max(0,probe.simulate([...probe.nativeIds,id]).hpRemaining-probe.simulate([...probe.nativeIds]).hpRemaining):0;
   goldScores.set(id,gain+(probe.simulate([...probe.nativeIds]).fullSpeedFeasible?0:hp/200));
  }
  const value=Math.max(0,...model.states.map(state=>gold.reduce((sum,id)=>model.price(id,state)!==null?sum+(goldScores.get(id)||0):sum,0)));
  return {id:card.id,type:card.type,name:supportIdentity(card),rental:!owned.has(card.id),value,white:routes.filter(r=>data.skills[r.skill_id]?.rarity==='white').length};
 }).sort((a,b)=>b.value-a.value||b.white-a.white||a.id.localeCompare(b.id));
 const shortlist=[...new Map([...lockedIds.map(id=>ranked.find(c=>c.id===id)),...['Speed','Stamina','Power','Guts','Wit','Friend','Group'].flatMap(type=>ranked.filter(c=>c.type===type&&(typeCounts===null||typeCounts[type]>0)).slice(0,10)),...ranked.filter(c=>owned.has(c.id)).slice(0,24)].filter(Boolean).map(c=>[c.id,c])).values()];
 let beam=[{ids:lockedIds,names:new Set(lockedIds.map(id=>supportIdentity(data.supports[id]))),value:lockedIds.reduce((sum,id)=>sum+(ranked.find(c=>c.id===id)?.value||0),0)}];
 for(let size=lockedIds.length;size<6;size++){
  const next=new Map();
  for(const row of beam)for(const c of shortlist){
   if(row.names.has(c.name)||row.ids.includes(c.id))continue;
   const ids=[...row.ids,c.id].sort();
   if(ids.filter(id=>!owned.has(id)).length>(rentalAllowed?1:0))continue;
   const typeCount=ids.filter(id=>data.supports[id].type===c.type).length;if(typeCounts&&typeCount>(typeCounts[c.type]||0))continue;
   next.set(ids.join(','),{ids,names:new Set([...row.names,c.name]),value:row.value+c.value});
  }
  beam=[...next.values()].sort((a,b)=>b.value-a.value||a.ids.join(',').localeCompare(b.ids.join(','))).slice(0,24);
  if(!beam.length)throw new Error('보유·렌탈·고정 카드·타입 조건을 만족하는 6장을 만들 수 없습니다.');
 }
 // Equivalent skillless friend/group rentals must not consume all comparisons.
 const signatures=new Set(),decks=[];
 for(const row of beam){
  const signature=row.ids.filter(id=>!['Friend','Group'].includes(data.supports[id].type)||ranked.find(c=>c.id===id)?.value>0||lockedIds.includes(id)).join(',');
  if(!signatures.has(signature)){signatures.add(signature);decks.push(row);}
  if(decks.length===6)break;
 }
 const plans=[];
 for(const row of decks){
  validateDeck(data,setup,row.ids,{ownedIds,rentalAllowed,typeCounts,lockedIds});
  const e=new SkillOptimizer(data,{...setup,supportIds:row.ids});e.objective=constraints.objective||'maximum';
  if((constraints.lockedSkillIds||[]).some(id=>!e.records.has(id)))continue;
  for(const id of constraints.lockedSkillIds||[])e.lock(id,true);
  e.userDisabled=new Set(constraints.excludedSkillIds||[]);
  const optimization=e.optimize({evaluationLimit:180,maxCandidates:36,width:2});
  const price=e.purchase.selection([...e.selected]),plan=e.purchase.routeRows([...e.selected],price);
  plans.push({supportIds:row.ids,rentalId:row.ids.find(id=>!owned.has(id))||null,selected:[...e.selected],budget:{used:price.used,remaining:price.remaining,feasible:price.feasible},optimization,factorCount:plan.factorIds.length,eventCount:plan.events.length});
 }
 if(!plans.length)throw new Error('현재 탐색에서 고정 스킬을 확보하는 편성을 찾지 못했습니다. 고정 카드 또는 보유 목록을 확인하세요.');
 plans.sort((a,b)=>Number(b.optimization.status==='ok')-Number(a.optimization.status==='ok')||(constraints.objective==='safe'?(b.optimization.gain?.min||0)-(a.optimization.gain?.min||0):(b.optimization.gain?.median||0)-(a.optimization.gain?.median||0))||a.factorCount-b.factorCount||a.budget.used-b.budget.used);
 return {plans:plans.slice(0,3),search:'bounded',evaluated:decks.length,shortlisted:shortlist.length,candidateCount:cards.length};
}
