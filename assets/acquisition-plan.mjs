import {outfitName,cardName,cardTypes} from './display.mjs';

// One selected skill appears once. Prefer a current acquisition path to a factor.
export function acquisitionPlan(data,records,selected){
 const groups=new Map();
 const add=(key,label,row,ownerId=null)=>{
  if(!groups.has(key))groups.set(key,{key,label,ownerId,skills:[]});
  groups.get(key).skills.push(row);
 };
 for(const id of [...new Set(selected)]){
  const skill=records.get(id);if(!skill)continue;
  const row={id,name:skill.name_jp,detail:''},routes=skill.routes||[];
  if(skill.inherited){
   row.detail=(skill.inheritance_outfit_ids||[]).map(id=>data.outfits[id]).filter(Boolean).map(outfitName).join(' / ');
   add('inheritance','고유 계승',row);continue;
  }
  if(routes.some(r=>r.owner_type==='outfit')){add('native','본체',row);continue;}
  const scenario=routes.find(r=>r.owner_type==='scenario');
  if(scenario){add('scenario-'+scenario.owner_id,data.scenarios?.[scenario.owner_id]?.name_jp||'시나리오',row);continue;}
  const supports=[...new Set(routes.filter(r=>r.owner_type==='support').map(r=>r.owner_id))];
  if(supports.length){
   const card=data.supports[supports[0]];
   row.detail=supports.slice(1).map(id=>data.supports[id]).filter(Boolean).map(s=>`또는 ${cardName(s)} · ${cardTypes[s.type]||s.type}`).join(' / ');
   add('support-'+supports[0],`${cardName(card)} · ${cardTypes[card.type]||card.type}`,row,supports[0]);continue;
  }
  add('factor','흰 인자 필요',row);
 }
 const order=g=>g.key==='native'?0:g.key.startsWith('scenario-')?1:g.key.startsWith('support-')?2:g.key==='factor'?3:4;
 return [...groups.values()].sort((a,b)=>order(a)-order(b)||a.key.localeCompare(b.key));
}
