import {outfitName,cardName,cardTypes} from './display.mjs';

// One selected skill appears once. Mixed acceleration effects belong to acceleration.
export function acquisitionPlan(data,records,selected){
 const ordinary={key:'ordinary',label:'일반 스킬',skills:[]},inheritance={key:'inheritance',label:'계승 고유기',skills:[]};
 for(const id of new Set(selected)){
  const skill=records.get(id);if(!skill)continue;
  const row={id,name:skill.name_jp,rarity:skill.rarity,
   category:skill.categories.includes('acceleration')?'acceleration':skill.categories.includes('heal')?'heal':'speed',
   compound:skill.categories.includes('speed')&&skill.categories.includes('acceleration'),detail:'',pathKind:''};
  if(skill.inherited){
   row.detail=[...new Set((skill.inheritance_outfit_ids||[]).map(id=>data.outfits[id]).filter(Boolean).map(outfitName))].join(', ');
   row.pathKind='inheritance';inheritance.skills.push(row);continue;
  }
  const paths=[];
  for(const route of skill.routes||[]){
   if(route.owner_type==='outfit')paths.push('본체');
   if(route.owner_type==='scenario')paths.push(data.scenarios?.[route.owner_id]?.name_jp||'시나리오');
   if(route.owner_type==='support'){
    const card=data.supports[route.owner_id];if(card)paths.push(`${cardName(card)} · ${cardTypes[card.type]||card.type}`);
   }
  }
  row.detail=[...new Set(paths)].join(', ')||'인자';row.pathKind=paths.length?'available':'factor';
  ordinary.skills.push(row);
 }
 const order={speed:0,acceleration:1,heal:2};
 ordinary.skills.sort((a,b)=>order[a.category]-order[b.category]);
 return [ordinary,inheritance];
}
