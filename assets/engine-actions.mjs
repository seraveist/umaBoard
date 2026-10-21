export function applyEngineAction(engine,action){
 if(action.type==='toggle')engine.toggle(action.id,action.checked,action.source);
 else if(action.type==='selectMany')engine.selectMany(action.ids,action.source);
 else if(action.type==='clearSpeed')engine.clearSpeedSelection();
 else if(action.type==='lock')engine.lock(action.id,action.locked);
 else if(action.type==='resetExcluded')engine.resetExcluded();
 else if(action.type==='objective'){
  if(!['maximum','safe'].includes(action.value))throw new Error('추천 기준을 확인하세요.');
  engine.objective=action.value;if(!engine.purchase)engine.useAutomatic();
 }else if(action.type==='auto')engine.useAutomatic();
 else throw new Error('알 수 없는 선택 작업입니다.');
}
