export const INHERITANCE_LIMIT=6;
export const INHERITANCE_TOP=10;
// Also hide values which would be rendered as +0.00 at two decimal places.
export const positiveGain=entry=>Number.isFinite(entry.gain?.median)&&entry.gain.median>.005;
export const scoreOrder=(a,b)=>(b.gain?.median??-Infinity)-(a.gain?.median??-Infinity)||a.id.localeCompare(b.id);
export function skillTables(records,entries){
 const ranked=entries.filter(positiveGain).sort(scoreOrder);
 const table=categories=>{
  const rows=ranked.filter(s=>records.get(s.id).categories.some(c=>categories.includes(c)));
  const ordinary=rows.filter(s=>!records.get(s.id).inherited).map(s=>s.id);
  const inheritance=rows.filter(s=>records.get(s.id).inherited).slice(0,INHERITANCE_TOP).map(s=>s.id);
  return {ordinary,inheritance};
 };
 // Recovery is measured in HP, not in forced-spurt lengths.
 const heal=entries.filter(s=>records.get(s.id).categories.includes('heal')&&s.hpGain>.5)
  .sort((a,b)=>b.hpGain-a.hpGain||a.id.localeCompare(b.id)).map(s=>s.id);
 return {speed:table(['speed','passive']),acceleration:table(['acceleration']),heal};
}
export const visibleSkillIds=tables=>new Set([...tables.speed.ordinary,...tables.speed.inheritance,...tables.acceleration.ordinary,...tables.acceleration.inheritance,...tables.heal]);
