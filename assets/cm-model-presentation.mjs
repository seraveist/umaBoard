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
 parts.push(`비교 표본 발동 ${((row.activationRate??0)*100).toFixed(1)}%`);
 if(row.categories?.includes('acceleration')&&Number.isFinite(row.usefulAccelerationRate))parts.push(`추가 가속 발생 표본 ${(row.usefulAccelerationRate*100).toFixed(1)}%`);
 return parts.join(' · ');
}
export function marginalSummary(plan,id){
 const value=plan.marginalContributions?.[id];
 return value?`${value.restoredIds?.length?'기존 스킬 대비 추가':'조합 내 추가 기여'} ${signed(value.gain)}마신`:'';
}
