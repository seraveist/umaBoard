import {activeAcquisitionRoute,scenarioEventGroups} from './acquisition-rules.mjs';

// Existential route assignment: another independent source can satisfy a gold.
// No cartesian-state truncation and no reuse of pre-training hint prices.
export class EventConstraints {
 constructor(data,setup){
  this.data=data;this.cache=new Map();this.groups=[];this.unverified=[];
  this.routes=(data.acquisition_routes||[]).filter(r=>activeAcquisitionRoute(data,setup,r));
  for(const cid of setup.supportIds||[]){
   const known=data.support_events?.[cid],covered=new Set();
   for(const event of known?.events||[]){this.groups.push({...event,card_id:cid});for(const c of event.choices)for(const r of c.rewards)covered.add(r.skill_id);}
   const unknown=[...new Set(this.routes.filter(r=>r.kind==='support_event'&&r.owner_id===cid&&data.skills[r.skill_id]?.rarity==='gold'&&!covered.has(r.skill_id)).map(r=>r.skill_id))];
   if(unknown.length){this.unverified.push(cid);this.groups.push({id:cid+'-unverified',card_id:cid,choices:unknown.map(id=>({id,rewards:[{skill_id:id}]}))});}
  }
  this.groups.push(...scenarioEventGroups(data,setup));
  this.pins=setup.eventChoices||{};
 }
 selection(ids){
  if(!this.data.acquisition_routes)return {}; // Small engine fixtures have no route catalog.
  const needed=new Set(),seen=new Set();
  const visit=id=>{if(seen.has(id))return;seen.add(id);const s=this.data.skills[id];if(s?.rarity==='gold')needed.add(id);if(s?.rarity==='evolution')visit(this.data.evolution_rules.find(r=>r.evolved_id===id)?.base_id);const low=this.data.purchase_stages?.[id]?.prerequisite_id;if(low)visit(low);};
  ids.forEach(visit);const key=[...needed].sort().join(',');if(this.cache.has(key))return this.cache.get(key);
  const clauses=[];
  for(const id of needed){
   const options=[];let independent=false;
   for(const route of this.routes.filter(r=>r.skill_id===id)){
    const grouped=route.kind==='support_event'||route.kind==='scenario_event'&&route.event_id;
    if(!grouped){independent=true;break;}
    for(const g of this.groups){
     if(g.card_id?route.owner_type!=='support'||route.owner_id!==g.card_id:route.owner_type!=='scenario'||route.owner_id!==g.scenario_id||route.event_id!==g.id)continue;
     for(const c of g.choices)if((!this.pins[g.id]||this.pins[g.id]===c.id)&&c.rewards.some(r=>r.skill_id===id))options.push([g.id,c.id]);
    }
   }
   if(!independent)clauses.push(options);
  }
  const solve=assignment=>{
   const remaining=clauses.filter(c=>!c.some(([g,v])=>assignment[g]===v)).map(c=>c.filter(([g,v])=>!assignment[g]||assignment[g]===v));
   if(!remaining.length)return assignment;remaining.sort((a,b)=>a.length-b.length);if(!remaining[0].length)return null;
   for(const [g,v]of remaining[0]){const result=solve({...assignment,[g]:v});if(result)return result;}return null;
  };
  const result=solve({...this.pins});this.cache.set(key,result);return result;
 }
}
