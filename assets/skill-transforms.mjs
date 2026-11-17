// Reviewed acquisition relationships, not score/skill exceptions. An inherited
// evolution changes the applied effect while retaining the original paid stage.
// Evidence: original verified 200-SP stages; parent/evolution requirements:
// https://umamusumelabo.com/event/champions-meeting/kyoto2200chanmi-202610
export const INHERITED_EVOLUTIONS=Object.freeze([
 Object.freeze({base_id:'901351',evolved_id:'91101351',owner_type:'inheritance',kind:'inherited_evolution',requirements:['owned-character','direct-parent','evolution-unlocked']}),
 Object.freeze({base_id:'901411',evolved_id:'91101411',owner_type:'inheritance',kind:'inherited_evolution',requirements:['owned-character','direct-parent','evolution-unlocked']})
]);
export const inheritedBase=id=>INHERITED_EVOLUTIONS.find(r=>r.evolved_id===id)?.base_id??id;
export function skillTransforms(data){
 const extra=INHERITED_EVOLUTIONS.filter(r=>data.skills?.[r.base_id]?.inherited&&data.skills?.[r.evolved_id]?.inherited);
 return [...(data.evolution_rules||[]),...extra];
}
export function inheritanceOrigins(data){
 const parents=new Map(skillTransforms(data).filter(r=>data.skills?.[r.base_id]?.inherited&&data.skills?.[r.evolved_id]?.inherited).map(r=>[r.evolved_id,r.base_id]));
 return Object.fromEntries(Object.values(data.skills||{}).filter(s=>s.inherited).map(s=>{let id=s.id;const seen=new Set();while(parents.has(id)&&!seen.has(id)){seen.add(id);id=parents.get(id);}return [s.id,id];}));
}
