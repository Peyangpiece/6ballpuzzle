/* Settle watchdog v1.
 *
 * SETTLE waits until every rendered ball has reached its logical cell. On some
 * dense boards the render-only contact correction keeps pushing balls apart
 * and never converges: the logical board is final but the phase never ends,
 * the match freezes and each step runs the full 128-pass correction (up to
 * 0.2 s per step, so a browser frame can take seconds). In normal play that
 * correction fails to converge at most about 11 calls in a row and a settle
 * lasts at most about 1.5 s; a frozen settle fails hundreds of times. When the
 * logical board is unchanged and the correction has not converged for
 * STALL_NON_CONVERGENT calls in a row, or for STALL_GAME_SECONDS, the rendered
 * balls are put on their logical cells and the engine continues with CHECK as
 * usual.
 */
(function(){
if(typeof window==="undefined"||window.__sixBallSettleWatchdogV1||typeof stepEngine!=="function")return;
window.__sixBallSettleWatchdogV1=true;
const STALL_GAME_SECONDS=3,STALL_NON_CONVERGENT=24;
function snapVisualsToLogical(g){
 let moved=0;
 for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
  const ball=valid(x,y)?g.board[y][x]:null;if(!ball)continue;
  if(Array.isArray(ball.fallPath))ball.fallPath.length=0;
  let v=g.vis.get(ball.id);if(!v){v={x,y,vy:0,sq:0};g.vis.set(ball.id,v);}
  if(Math.abs(v.x-x)>1e-9||Math.abs(v.y-y)>1e-9)moved++;
  v.x=x;v.y=y;v.vy=0;v.motionSpeed=0;v.pileFlow=false;v.justReleased=false;
  for(const k of Object.keys(v))if(k.startsWith("_seg"))delete v[k];
 }
 g._visualMovingIds=new Set();g._visualMotionSeqById=new Map();
 return moved;
}
const baseStepEngine=stepEngine;
stepEngine=function(g,dt){
 const r=baseStepEngine(g,dt);
 if(!g||g.state!=="RESOLVING"||g.phase!=="SETTLE"){if(g)g._settleStall=null;return r;}
 const sig=physicsSignature(g);let w=g._settleStall;
 if(!w||w.sig!==sig)w=g._settleStall={sig,game:0};
 w.game+=Number(dt)||0;
 const stuck=(Number(g._contactNonConvergent)||0)>=STALL_NON_CONVERGENT;
 if(w.game>=STALL_GAME_SECONDS||stuck){
  const moved=snapVisualsToLogical(g);g._settleStall=null;g._contactNonConvergent=0;g.stateT=0;
  window.__sixBallLastSettleWatchdog={moved,game:+w.game.toFixed(2),stuck,at:Date.now()};
 }
 return r;
};
window.__sixBallSettleWatchdogVersion="settle-watchdog-v1";
})();
