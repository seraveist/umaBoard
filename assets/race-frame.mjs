import {phaseAt} from './physics.mjs';

// A skill is checked after a movement. Phase-based consumers use that
// movement's start, whereas geometry and the race-half counter use its end.
// The next movement keeps its own physics phase; never rewind state.phase.
export const frameStartPosition=state=>state.prevX??state.x;
export function activationFrame(state,distance){
 return {startX:frameStartPosition(state),endX:state.x,
  phase:phaseAt(frameStartPosition(state),distance),laterHalf:state.x>distance/2};
}
