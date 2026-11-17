// Percentages are added to the recorded hint rate before stage-level flooring.
export const DISCOUNT_TRAITS=Object.freeze({
 none:Object.freeze({label:'없음',rate:0}),
 studious:Object.freeze({label:'공부가',rate:4}),
 'fast-learner':Object.freeze({label:'수완가',rate:10})
});

export function resolveDiscountTrait(input={}){
 if(input.discountTrait!==undefined){
  if(typeof input.discountTrait!=='string'||!Object.hasOwn(DISCOUNT_TRAITS,input.discountTrait))throw new Error('할인 특성을 확인하세요.');
  return input.discountTrait;
 }
 if(input.fastLearner!==undefined&&typeof input.fastLearner!=='boolean')throw new Error('수완가 선택을 확인하세요.');
 return input.fastLearner===true?'fast-learner':'none';
}
