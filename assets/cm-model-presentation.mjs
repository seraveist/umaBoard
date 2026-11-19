const signed=value=>`${value>0?'+':''}${value.toFixed(2)}`;
export function calculationSummary(record){
 const p=record.scenarioCoverage??record.samplingPolicy?.opponentConditions;
 const count=record.sampling?.count??record.samples;
 const basis=p?.probabilityBasis==='recorded-count-weights'?'입력 관측 횟수 · 별도 검증 전':p?.probabilityBasis==='user-provided-weights'?'입력 전개 가중치':'실측 확률 아님';
 return `공통 전개 ${p?.cases??p?.expected??1}개 · ${count??0}표본 · ${basis} · 전개 스퍼트 근사`;
}
export function contributionTitle(row){
 if(row.calculationState==='incompatible-reference')return '비교 기준과 획득·진화·계승 제한 충돌';
 if(!Number.isFinite(row.gain))return '계산 미지원';
 const parts=[`${row.comparisonBasis?.kind==='secured-skill-context'?'기준 조합 대비':'단독 전개 평균'} ${signed(row.gain)}마신`];
 if(Number.isFinite(row.robustGain))parts.push(`최소 ${signed(row.robustGain)}마신`);
 const summary=chartScenarioSummary(row);if(summary)parts.push(summary);
 parts.push(`비교 표본 발동 ${((row.activationRate??0)*100).toFixed(1)}%`);
 if(row.categories?.includes('acceleration')&&Number.isFinite(row.usefulAccelerationRate))parts.push(`추가 가속 발생 표본 ${(row.usefulAccelerationRate*100).toFixed(1)}%`);
 return parts.join(' · ');
}
export function marginalSummary(plan,id){
 const value=plan.marginalContributions?.[id];
 if(!value)return '';
 const popularity=popularityText(value.popularityResults);
 return `${value.restoredIds?.length?'기존 스킬 대비 추가':'조합 내 추가 기여'} ${signed(value.gain)}마신${popularity?' · '+popularity:''}`;
}

function popularityText(results){
 if(!(results?.length>1))return '';
 return results.map(b=>`인기 ${b.first===b.last?b.first:b.first+'~'+b.last}위 ${signed(b.gain)}마신(${b.count}표본)`).join(' · ');
}
export function scenarioLabel(id){
 const match=/^coverage-(\d+)$/.exec(id);
 return match?`전개 ${match[1]}`:id;
}
export function chartScenarioSummary(row){
 const scenarios=row.scenarios;
 if(!scenarios?.length||scenarios.some(s=>!Number.isInteger(s.activations)))return '';
 const observed=scenarios.filter(s=>s.activations>0).length;
 let activeWeight=0,inactiveWeight=0,activeGain=0,inactiveGain=0;
 const scale=Math.max(...scenarios.map(s=>s.weight));
 for(const s of scenarios){
  const w=s.weight/scale/s.count;
  activeWeight+=w*s.activations;inactiveWeight+=w*(s.count-s.activations);
  activeGain+=w*s.activatedGainSum;inactiveGain+=w*(s.count*s.gain-s.activatedGainSum);
 }
 const parts=[`발동 관측 전개 ${observed}/${scenarios.length}개`];
 if(observed>0&&observed<scenarios.length){
  const names=scenarios.filter(s=>s.activations>0).map(s=>s.label??scenarioLabel(s.id));
  parts.push(names.join(', '));
 }
 if(activeWeight)parts.push(`발동 표본 평균 ${signed(activeGain/activeWeight)}마신`);
 if(inactiveWeight)parts.push(`미발동 표본 평균 ${signed(inactiveGain/inactiveWeight)}마신`);
 const popularity=popularityText(row.popularityResults);if(popularity)parts.push(popularity);
 return parts.join(' · ');
}
