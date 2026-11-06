/* Contention order v1: the ball that lost its support first takes the cell.
 *
 * Two balls can want the same empty cell from opposite sides (each rolling
 * round its own support into it, or one falling into it). Moves are planned
 * one event at a time, so the first ball planned takes the cell and the other
 * stays or goes elsewhere. The order used to be the board scan, left before
 * right, so the same situation split one way and its mirror image the other.
 *
 * Here the board remembers when each cell was vacated by a move (cells empty
 * since the board was last at rest, or emptied by a clear, count as time 0).
 * A ball's support-loss time is when the last empty cell under it emptied:
 * for a ball rolling round one support, the cell it rolls into; for a ball
 * with nothing under it, the later of the two. When two moves contend for a
 * cell, the ball whose support went first moves first. Equal times keep the
 * previous order. Used by the clear collapse (app-clear-gap-collapse.js) and
 * the event ordering (hexPhysCandidateBundles, app-gravity-priority-v1.js).
 */
(function(){
if(typeof window==="undefined"||window.__sixBallContentionOrderV1)return;
if(typeof hexPhysApplyEvent!=="function"||typeof valid!=="function")return;
window.__sixBallContentionOrderV1=true;

function times(b){return b&&b.__vacatedAt instanceof Map?b.__vacatedAt:null;}

// When the last empty cell under (x,y) was vacated (0: before this turn's
// moves). Cells outside the board count as support.
window.hexPhysSupportLostAt=function(b,x,y){
  const t=times(b);let at=0;
  for(const dx of[-1,1]){
    const cx=x+dx,cy=y+1;
    if(!valid(cx,cy)||b[cy][cx])continue;
    const v=t?Number(t.get(cx+","+cy))||0:0;
    if(v>at)at=v;
  }
  return at;
};
const supportLostAt=window.hexPhysSupportLostAt;

// Moves record the cells they vacate.
const baseApply=hexPhysApplyEvent;
hexPhysApplyEvent=function(b,accepted){
  const moved=baseApply.apply(this,arguments);
  if(moved&&Array.isArray(b)&&Array.isArray(accepted)&&accepted.length&&accepted.some(p=>p&&p.ball&&typeof p.ball==="object")){
    if(!(b.__vacatedAt instanceof Map)){b.__vacatedAt=new Map();b.__vacatedClock=0;}
    const now=++b.__vacatedClock;
    for(const p of accepted)if(p&&valid(p.x,p.y)&&!b[p.y][p.x])b.__vacatedAt.set(p.x+","+p.y,now);
  }
  return moved;
};

// Proposals carry their ball's support-loss time for the event ordering.
function tag(b,list){
  if(Array.isArray(list))for(const p of list)if(p&&typeof p==="object"&&Number.isFinite(p.x)&&Number.isFinite(p.y))p.supportLostAt=supportLostAt(b,p.x,p.y);
  return list;
}
if(typeof hexPhysContactEntries==="function"){
  const baseEntries=hexPhysContactEntries;
  hexPhysContactEntries=function(b){return tag(b,baseEntries.apply(this,arguments));};
}
if(typeof hexPhysPlanGroup==="function"){
  const basePlan=hexPhysPlanGroup;
  hexPhysPlanGroup=function(b){return tag(b,basePlan.apply(this,arguments));};
}

// A new piece appears with the board at rest: start the record afresh.
if(typeof spawn==="function"){
  const baseSpawn=spawn;
  spawn=function(g){
    if(g&&Array.isArray(g.board)){g.board.__vacatedAt=new Map();g.board.__vacatedClock=0;}
    return baseSpawn.apply(this,arguments);
  };
}

window.__sixBallContentionOrderVersion="contention-order-v1";
})();
