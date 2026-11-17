import {outfitName,umaName} from './display.mjs';
import {portraitPath} from './portraits.mjs';

// Provider identity only; this does not recommend or assign parent slots.
export function inheritanceProviders(data,row,portraits){
 if(!row.inherited)return [];
 const parents=new Set(data.skills[row.id]?.parent_ids||[]);
 const ids=row.providers?.length?row.providers:(data.acquisition_routes||[]).filter(r=>r.owner_type==='outfit'&&parents.has(r.skill_id)).map(r=>r.owner_id);
 return [...new Set(ids)].sort().filter(id=>data.outfits?.[id]).map(id=>{
  const outfit=data.outfits[id],name=umaName(outfit),label=outfit.outfit_name_jp?outfitName(outfit):name;
  return {id,name,label,portrait:portraitPath(portraits,'outfits',id)};
 });
}
