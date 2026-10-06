export const INHERITANCE_LIMIT=6;
export const INHERITANCE_TOP=10;
// Also hide values which would be rendered as +0.00 at two decimal places.
export const displayedGain=(entry,category='speed')=>category==='acceleration'&&entry.safetyGain>.005?entry.safetyGain:entry.gain?.median;
export const positiveGain=(entry,category='speed')=>Number.isFinite(displayedGain(entry,category))&&displayedGain(entry,category)>.005;
export const scoreOrder=(a,b,category='speed')=>(displayedGain(b,category)??-Infinity)-(displayedGain(a,category)??-Infinity)||a.id.localeCompare(b.id);
export function skillTables(records,entries){
 const table=(category,categories)=>{
  const rows=entries.filter(s=>positiveGain(s,category)&&records.get(s.id).categories.some(c=>categories.includes(c))).sort((a,b)=>scoreOrder(a,b,category));
  const ordinary=rows.filter(s=>!records.get(s.id).inherited).map(s=>s.id);
  const inheritance=rows.filter(s=>records.get(s.id).inherited).slice(0,INHERITANCE_TOP).map(s=>s.id);
  return {ordinary,inheritance};
 };
 // Recovery is measured in HP, not in forced-spurt lengths.
 const heal=entries.filter(s=>records.get(s.id).categories.includes('heal')&&s.hpGain>.5)
  .sort((a,b)=>b.hpGain-a.hpGain||a.id.localeCompare(b.id)).map(s=>s.id);
 return {speed:table('speed',['speed','passive']),acceleration:table('acceleration',['acceleration']),heal};
}
export const visibleSkillIds=tables=>new Set([...tables.speed.ordinary,...tables.speed.inheritance,...tables.acceleration.ordinary,...tables.acceleration.inheritance,...tables.heal]);
