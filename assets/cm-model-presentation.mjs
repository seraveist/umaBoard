const signed=value=>`${value>0?'+':''}${value.toFixed(2)}`;
export function calculationSummary(record){
 const p=record.scenarioCoverage??record.samplingPolicy?.opponentConditions;
 const count=record.sampling?.count??record.samples;
 const basis=p?.probabilityBasis==='user-provided-weights'?'입력 전개 가중치':'실측 확률 아님';
 return `공통 전개 ${p?.cases??p?.expected??1}개 · ${count??0}표본 · ${basis} · 전개 스퍼트 근사`;
}
export function contributionTitle(row){
 if(!Number.isFinite(row.gain))return '계산 미지원';
 const parts=[`전개 평균 ${signed(row.gain)}마신`];
 if(Number.isFinite(row.robustGain))parts.push(`최소 ${signed(row.robustGain)}마신`);
 parts.push(`비교 표본 발동 ${((row.activationRate??0)*100).toFixed(1)}%`);
 if(row.categories?.includes('acceleration')&&Number.isFinite(row.usefulAccelerationRate))parts.push(`유효 가속 ${(row.usefulAccelerationRate*100).toFixed(1)}%`);
 return parts.join(' · ');
}
export function marginalSummary(plan,id){
 const value=plan.marginalContributions?.[id];
 return value?`조합 내 추가 기여 ${signed(value.gain)}마신`:'';
}
