// Preparation policy supported by course guides, not an extra bashin formula.
export const STRATEGY_VERSION='cm-strategy-v1';
export const PDM_SOURCES=Object.freeze([
 'https://umamusumelabo.com/ikusei/chanmi-senkouikusei-202610',
 'https://umamusumelabo.com/event/champions-meeting/chanmi-tokyo2400-202606',
 'https://umamusumelabo.com/event/champions-meeting/chanmilong-202612',
 'https://umamusumelabo.com/ikusei/gaisenmon-senkouikusei-202609'
]);
export function strategyGoals(data,setup){
 if(![2,3,4].includes(setup.style)||setup.course.surface!==1||setup.course.distance<2200||!data.skills['201591'])return [];
 const ids=new Set(['201591','201592'].filter(id=>data.skills[id]));
 for(let pass=0;pass<4;pass++)for(const rule of data.evolution_rules||[])if(ids.has(rule.base_id))ids.add(rule.evolved_id);
 return [{id:'pdm-release',label:'PDM 해제',priority:'core',preferredId:'201591',skillIds:[...ids],
  note:'초반 위치 하락을 줄이기 위한 우선 확보 목표입니다. 근처 우마무스메 조건은 실제 전개에 따라 달라집니다.',
  comparisonNote:'표의 마신은 직접 속도 효과입니다. PDM 해제의 추가 마신을 임의로 더하지 않습니다.',
  sources:[...PDM_SOURCES],scope:'turf-2200-plus-non-runner',policyVersion:STRATEGY_VERSION}];
}
export function strategySkillIds(goal,compiled,setup){
 // A later-only evolution must not replace the early PDM-release role.
 return goal.skillIds.filter(id=>{
  const c=compiled.get(id);
  return c&&['supported','assumed'].includes(c.status)&&c.invocations.some(i=>i.effects.some(e=>['target_speed','current_speed','speed_with_decel'].includes(e.kind)&&e.value>0)&&i.condition.some(b=>b.windows.some(([lo])=>lo<setup.course.distance/24)));
 });
}
