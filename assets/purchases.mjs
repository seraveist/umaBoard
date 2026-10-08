// Standard planning prices. White Lv5; verified event maxima; other routes Lv0.
export const nativeUnique=s=>['unique','unique_low_star','unique_upgraded'].includes(s?.rarity);
export const discountedCost=(base,level)=>Math.floor(base*(100-[0,10,20,30,35,40][Math.min(5,Math.max(0,level))])/100);
const key=ids=>[...new Set(ids)].sort().join(',');
const activeRoute=(r,setup)=>!r.requirements&&(
 r.owner_type==='outfit'&&r.owner_id===setup.outfitId||r.owner_type==='support'&&(setup.supportIds||[]).includes(r.owner_id)||r.owner_type==='scenario'&&r.owner_id===setup.scenarioId);

export class PurchaseModel{
 constructor(data,records,setup){
  this.data=data;this.records=records;this.setup=setup;this.cache=new Map();this.stageCache=new Map();this.groups=[];this.warnings=[];
  const policy=data.cost_policy;if(policy&&(policy.white_hint_level!==5||policy.other_hint_level!==0||policy.fast_learner!==false))throw new Error('지원하지 않는 SP 가격 정책입니다.');
  this.policyVersion=policy?.version||'standard-v1';
  this.routes=new Map();for(const r of data.acquisition_routes)if(activeRoute(r,setup)){
   if(!this.routes.has(r.skill_id))this.routes.set(r.skill_id,[]);this.routes.get(r.skill_id).push(r);
  }
  for(const cid of setup.supportIds||[]){
   const known=data.support_events?.[cid];const covered=new Set();
   for(const e of known?.events||[]){
    this.groups.push({...e,card_id:cid,verified:true,source:known.source});
    for(const choice of e.choices)for(const reward of choice.rewards)covered.add(reward.skill_id);
   }
   const unknown=[...this.routes].filter(([id,rs])=>data.skills[id].rarity==='gold'&&!covered.has(id)&&rs.some(r=>r.owner_id===cid&&r.kind==='support_event')).map(([id])=>id).sort();
   if(unknown.length){
    this.warnings.push(cid);
    // Do not manufacture a mutually obtainable multi-gold reward set.
    this.groups.push({id:cid+'-unverified',card_id:cid,name_jp:'이벤트 묶음 미검증',verified:false,
     choices:unknown.map(id=>({id,label:data.skills[id].name_jp,rewards:[{skill_id:id,hint_level:0}]}))});
   }
  }
  this.states=[{hints:{},choices:{}}];this.truncated=false;
  for(const group of this.groups){
   const pin=setup.eventChoices?.[group.id];
   if(pin&&!group.choices.some(c=>c.id===pin))throw new Error('이벤트 선택지를 확인하세요.');
   const choices=pin?group.choices.filter(c=>c.id===pin):group.choices;
   const next=[];
   for(const state of this.states)for(const c of choices){
    const hints={...state.hints};for(const r of c.rewards)hints[r.skill_id]=Math.min(5,(hints[r.skill_id]||0)+r.hint_level);
    next.push({hints,choices:{...state.choices,[group.id]:c.id}});
   }
   if(next.length>4096){this.truncated=true;next.length=4096;}
   this.states=next;
  }
 }
 stages(id,seen=new Set()){
  if(this.stageCache.has(id))return this.stageCache.get(id);
  if(seen.has(id))return null;seen=new Set([...seen,id]);
  const skill=this.data.skills[id];if(!skill)return null;
  if(nativeUnique(skill))return [];
  if(skill.rarity==='evolution'){
   const base=this.records.get(id)?.routes?.find(r=>r.kind==='evolution')?.base_id||this.data.evolution_rules.find(r=>r.evolved_id===id)?.base_id;
   return base?this.stages(base,seen):null;
  }
  const stage=this.data.purchase_stages?.[id];
  if(!stage||stage.status!=='verified')return null;
  const lower=stage.prerequisite_id?this.stages(stage.prerequisite_id,seen):[];
  const chain=lower===null?null:[...lower,{id,base:stage.base_cost,rarity:skill.rarity}];
  this.stageCache.set(id,chain);return chain;
 }
 permitted(id,state){
  const skill=this.data.skills[id];if(skill.rarity!=='gold')return true;
  if((this.routes.get(id)||[]).some(r=>r.kind!=='support_event'))return true;
  return this.groups.some(g=>g.choices.find(c=>c.id===state.choices[g.id])?.rewards.some(r=>r.skill_id===id));
 }
 price(id,state){
  const chain=this.stages(id);if(chain===null)return null;
  if(chain.some(s=>!this.permitted(s.id,state)))return null;
  return chain.reduce((sum,s)=>sum+discountedCost(s.base,s.rarity==='white'?5:(state.hints[s.id]??0)),0);
 }
 selection(ids){
  const cacheKey=key(ids);if(this.cache.has(cacheKey))return this.cache.get(cacheKey);
  const unknown=ids.filter(id=>this.stages(id)===null);let best=null;
  const factors=state=>ids.filter(id=>this.data.skills[id]?.rarity==='white'&&!this.availableRoutes(id,state).length&&!this.stages(id)?.some(s=>this.availableRoutes(s.id,state).length)).length;
  for(const state of this.states){
   const prices=Object.fromEntries(ids.map(id=>[id,this.price(id,state)]));
   if(ids.some(id=>!unknown.includes(id)&&prices[id]===null))continue;
   const used=Object.values(prices).filter(n=>n!==null).reduce((a,b)=>a+b,0);
   if(!best||used<best.used)best={used,prices,state};
   else if(used===best.used){
    best.factorCount??=factors(best.state);const factorCount=factors(state);
    if(factorCount<best.factorCount)best={used,prices,state,factorCount};
   }
  }
  const result=best?{...best,unknown,complete:!unknown.length,feasible:!unknown.length&&best.used<=this.setup.spBudget,remaining:unknown.length?null:this.setup.spBudget-best.used}
   :{used:null,prices:{},state:null,unknown,complete:false,feasible:false,remaining:null,conflict:true};
  this.cache.set(cacheKey,result);if(this.cache.size>3000)this.cache.delete(this.cache.keys().next().value);return result;
 }
 cheapest(id){return this.selection([id]).prices[id]??null;}
 availableRoutes(id,state){
  const allowed=(route,rewardId)=>{
   if(route.kind!=='support_event')return true;
   const groups=this.groups.filter(g=>g.card_id===route.owner_id&&g.choices.some(c=>c.rewards.some(s=>s.skill_id===rewardId)));
   return !groups.length||groups.some(g=>g.choices.find(c=>c.id===state?.choices[g.id])?.rewards.some(s=>s.skill_id===rewardId));
  };
  const routes=(this.routes.get(id)||[]).filter(r=>allowed(r,id));
  // A obtained upper-tier hint also unlocks its proven purchase prerequisites.
  if(this.data.skills[id]?.rarity==='white')for(const [upper,rs]of this.routes){
   if(upper===id||!this.stages(upper)?.some(s=>s.id===id))continue;
   for(const r of rs)if(allowed(r,upper)&&!routes.some(other=>other.owner_type===r.owner_type&&other.owner_id===r.owner_id&&other.kind===r.kind))routes.push(r);
  }
  return routes;
 }
 routeRows(ids,priced=this.selection(ids)){
  const chosen=priced.state?.choices||{},rows=[];
  for(const id of ids){
   const skill=this.records.get(id);if(!skill||nativeUnique(skill))continue;
   const chain=this.stages(id),base=chain?.at(-1)?.id||(skill.rarity==='evolution'?skill.routes?.find(r=>r.kind==='evolution')?.base_id:null)||id;
   const routes=this.availableRoutes(base,priced.state);
   // Circle upgrades inherit the purchase route of their base tier.
   if(skill.rarity==='white'&&chain?.length>1)for(const r of this.availableRoutes(chain[0].id,priced.state))if(!routes.some(other=>other.owner_type===r.owner_type&&other.owner_id===r.owner_id&&other.kind===r.kind))routes.push(r);
   rows.push({id,name:skill.name_jp,purchase_id:base,purchase_name:this.data.skills[base]?.name_jp||skill.name_jp,stages:chain?.map(s=>({id:s.id,name:this.data.skills[s.id]?.name_jp,cost:priced.state?discountedCost(s.base,s.rarity==='white'?5:(priced.state.hints[s.id]??0)):null}))||[],rarity:skill.rarity,inherited:skill.inherited,price:priced.prices[id]??null,routes,
    inheritance_outfit_ids:skill.inheritance_outfit_ids||[],factor:skill.rarity==='white'&&!skill.inherited&&!routes.length});
  }
  const keys=this.data.purchase_order?.keys||{};
  const verified=this.data.purchase_order?.status==='verified'&&rows.every(r=>Number.isFinite(keys[r.id]));
  rows.sort((a,b)=>verified?keys[a.id]-keys[b.id]||a.id.localeCompare(b.id):a.name.localeCompare(b.name,'ja')||a.id.localeCompare(b.id));
  const events=this.groups.filter(g=>chosen[g.id]&&rows.some(row=>row.routes.some(r=>r.owner_id===g.card_id&&r.kind==='support_event')&&g.choices.find(c=>c.id===chosen[g.id])?.rewards.some(r=>this.stages(r.skill_id)?.some(s=>row.stages.some(stage=>stage.id===s.id))))).map(g=>({id:g.id,card_id:g.card_id,name:g.name_jp,choice:chosen[g.id],label:g.choices.find(c=>c.id===chosen[g.id])?.label,verified:g.verified}));
  return {rows,events,sortVerified:verified,sortLabel:verified?'인게임 기본 순서':'스킬명 순 · 기본 순서 검증 중',factorIds:rows.filter(r=>r.factor).map(r=>r.id),warnings:this.warnings};
 }
}
