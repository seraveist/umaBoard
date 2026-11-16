const validIcon=value=>typeof value==='string'&&/^[1-9]\d*$/.test(value);

// Display order/group metadata can fall back to a base skill. Its image cannot:
// evolutions and inherited skills carry independently verified icon identities.
export function skillIconId(skill,display={}){
 const source=skill?.icon_id;
 if(validIcon(source))return source;
 const own=display.skills?.[skill?.id]?.iconId;
 return validIcon(own)?own:null;
}
