// Candidate discovery only. Unknown race-dependent conditions remain unknown.
const compare=(left,op,right)=>({ '==':left===right,'!=':left!==right,'>':left>right,'<':left<right,'>=':left>=right,'<=':left<=right })[op] ?? null;
export function evaluateCondition(dnf,context){
  if(dnf===null)return null;
  if(!dnf?.length)return true;
  let unknown=false;
  for(const group of dnf){
    let impossible=false,partial=false;
    for(const atom of group){
      const result=context[atom.field]===undefined?null:compare(context[atom.field],atom.operator,atom.value);
      if(result===false){impossible=true;break;}
      if(result===null)partial=true;
    }
    if(!impossible&&!partial)return true;
    if(!impossible)unknown=true;
  }
  return unknown?null:false;
}
export function possibleInContext(skill,context){
  // This flag requires an earlier activation of this skill (umasim SkillChecker.kt).
  // A later linked effect cannot make a statically impossible first trigger eligible.
  const possible=skill.invocations.map(()=>false);
  for(let pass=0;pass<skill.invocations.length;pass++){
    let changed=false;
    skill.invocations.forEach((inv,index)=>{
      const prior=possible.some((yes,other)=>yes&&other!==index);
      const state={...context,is_activate_other_skill_detail:prior?1:0};
      const eligible=evaluateCondition(inv.condition,state)!==false&&evaluateCondition(inv.precondition,state)!==false;
      if(eligible&&!possible[index]){possible[index]=true;changed=true;}
    });
    if(!changed)break;
  }
  return possible.some(Boolean);
}
export function raceContext(course,style,extra={}){
  return {course_distance:course.distance,distance_type:course.distance_type,ground_type:course.surface,
          track_id:Number(course.track_id),running_style:Number(style),...extra};
}
export function buildCandidates(data,{outfitId,supportIds=[],scenarioId='',bloom=3,context={},purchase=false}){
  if(!data.outfits[outfitId])throw new Error('Unknown outfit');
  if(supportIds.some(id=>!data.supports[id]))throw new Error('Unknown support');
  const supports=new Set(supportIds),routeBy=new Map();
  const add=(id,route)=>{if(!routeBy.has(id))routeBy.set(id,[]);routeBy.get(id).push(route);};
  for(const route of data.acquisition_routes){
    const matches=(route.owner_type==='outfit'&&route.owner_id===outfitId)
      ||(route.owner_type==='support'&&supports.has(route.owner_id))
      ||(route.owner_type==='scenario'&&route.owner_id===scenarioId);
    // Conditional curated paths must be implemented and verified before becoming guaranteed candidates.
    if(matches&&!route.requirements)add(route.skill_id,route);
  }
  const choiceGroups=new Map(),replaced=new Set();
  for(const rule of data.evolution_rules){
    const matches=(rule.owner_type==='outfit'&&rule.owner_id===outfitId)
      ||(rule.owner_type==='scenario'&&rule.owner_id===scenarioId);
    if(!matches||!routeBy.has(rule.base_id))continue;
    const evolved=data.skills[rule.evolved_id];
    if(!evolved.jp_available)continue;
    add(rule.evolved_id,{kind:'evolution',owner_type:rule.owner_type,owner_id:rule.owner_id,base_id:rule.base_id});
    if(!choiceGroups.has(rule.evolved_id))choiceGroups.set(rule.evolved_id,[]);
    choiceGroups.get(rule.evolved_id).push(rule.choice_group);
    replaced.add(rule.base_id);
  }
  const uniqueRarity=data.outfits[outfitId].base_stars>=3?'unique':Number(bloom)>=3?'unique_upgraded':'unique_low_star';
  const learned=[];
  for(const [id,routes] of routeBy){
    const skill=data.skills[id];
    if(!skill||!skill.jp_available||replaced.has(id))continue;
    if(['unique','unique_low_star','unique_upgraded'].includes(skill.rarity)&&skill.rarity!==uniqueRarity)continue;
    if(!possibleInContext(skill,context))continue;
    learned.push({...skill,routes,choice_groups:choiceGroups.get(id)||[]});
  }
  if(purchase){
    // A reached circle family exposes its upgrade as a purchase alternative.
    for(const rel of data.relations){
      if(rel.kind!=='version_family')continue;
      const a=data.skills[rel.from_id],b=data.skills[rel.to_id];
      if(a?.rarity==='white'&&b?.rarity==='white'&&a.name_jp.replace(/[○◎]/g,'')===b.name_jp.replace(/[○◎]/g,'')&&routeBy.has(a.id)&&!routeBy.has(b.id))
        add(b.id,{kind:'upgrade',owner_type:'skill',owner_id:a.id,base_id:a.id});
    }
    for(const [id,routes]of routeBy){
      if(learned.some(s=>s.id===id)||replaced.has(id))continue;
      const skill=data.skills[id];
      if(skill?.rarity==='white'&&skill.jp_available&&possibleInContext(skill,context))learned.push({...skill,routes,choice_groups:[]});
    }
  }
  const reachable=new Set(routeBy.keys());
  // Resolve connected version families; do not suggest another tier of an obtainable skill as an unavailable factor.
  let changed=true;
  while(changed){changed=false;for(const rel of data.relations){
    if(rel.kind!=='version_family')continue;
    if(reachable.has(rel.from_id)||reachable.has(rel.to_id)){
      if(!reachable.has(rel.from_id)){reachable.add(rel.from_id);changed=true;}
      if(!reachable.has(rel.to_id)){reachable.add(rel.to_id);changed=true;}
    }
  }}
  const nativeUniqueIds=new Set([...routeBy.keys()].filter(id=>['unique','unique_low_star','unique_upgraded'].includes(data.skills[id]?.rarity)));
  const uniqueOwners=new Map();
  for(const route of data.acquisition_routes){
    if(route.owner_type!=='outfit'||!['unique','unique_low_star','unique_upgraded'].includes(data.skills[route.skill_id]?.rarity))continue;
    if(!uniqueOwners.has(route.skill_id))uniqueOwners.set(route.skill_id,new Set());
    uniqueOwners.get(route.skill_id).add(route.owner_id);
  }
  const inheritance=Object.values(data.skills).filter(s=>s.inherited&&s.parent_ids.length&&!s.parent_ids.some(id=>nativeUniqueIds.has(id))&&s.jp_available&&possibleInContext(s,context))
    .map(s=>({...s,routes:[{kind:'inheritance',owner_type:'outfit',owner_id:null}],choice_groups:[],
      inheritance_outfit_ids:[...new Set(s.parent_ids.flatMap(id=>[...(uniqueOwners.get(id)||[])]))].sort()}));
  // A normal purchasable white skill has a positive base cost. Rarity 1 alone also
  // includes LoH Hero buffs, Carnival bonuses and innate traits, which are not factors.
  // Cost is an admission check here, never a user SP budget or discount calculation.
  const excluded=purchase?new Set(learned.map(s=>s.id)):reachable;
  const factorCandidates=Object.values(data.skills).filter(s=>s.rarity==='white'&&!s.inherited&&s.jp_available&&!excluded.has(s.id)
    &&data.internal_acceleration_comparison_cost?.[s.id]>0
    &&s.categories.some(t=>['speed','acceleration','heal','passive'].includes(t))
    &&s.invocations.some(i=>i.effects.some(e=>typeof e.value_raw==='number'&&e.value_raw>0))&&possibleInContext(s,context));
  return {learned,inheritance,factorCandidates,recommendationStatus:'not_calculated',factorTop10:null};
}
