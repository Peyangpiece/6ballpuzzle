/* Nintendo-reference first-contact sweep v3.
 *
 * The v2 first-contact authority intentionally starts a just-released UP
 * triangle at its signed rendered hard-drop contact.  At an outer hit the
 * surviving top+opposite-lower pair can be visibly clear of the pivot even
 * though their snapped logical origins describe a chord through that pivot.
 *
 * For REFERENCE_FIRST_CONTACT_PAIR only, collision validation therefore uses
 * the actual rendered start position -> snapped target segment.  Target-cell
 * occupancy and all later physics remain handled by the canonical resolver.
 */
(function(){
if(
  typeof window==="undefined" ||
  window.__sixBallReferenceFirstContactSweepV3 ||
  typeof hexPhysPathHitsStationary!=="function" ||
  typeof createEngine!=="function"
)return;

window.__sixBallReferenceFirstContactSweepV3=true;
const basePathHitsStationary=hexPhysPathHitsStationary;
const gameByBoard=new WeakMap();
const baseCreateEngine=createEngine;

createEngine=function(...args){
  const game=baseCreateEngine(...args);
  if(game?.board&&typeof game.board==="object")gameByBoard.set(game.board,game);
  return game;
};

function renderedPoint(x,y){
  return [latticeRealX(Number(x)),cellCenterYNorm(Number(y))];
}
function renderedSweepHitsStationary(p,board,movingIds,game){
  const startV=game?.vis?.get?.(p?.ball?.id);
  if(!startV||!startV.justReleased)return null;
  const sx=Number(startV.x),sy=Number(startV.y),tx=Number(p.tx),ty=Number(p.ty);
  if(![sx,sy,tx,ty].every(Number.isFinite))return null;

  const a=renderedPoint(sx,sy),z=renderedPoint(tx,ty);
  const moving=movingIds instanceof Set?movingIds:new Set();
  let minDistance=Infinity,closestId=0,closestCell=null,hit=false;

  for(let y=boardScanMin(board);y<ROWS;y++)for(let x=0;x<W2;x++){
    const q=valid(x,y)?board[y][x]:null;
    if(!q||q.id===p.ball.id||moving.has(q.id))continue;
    const qv=game.vis?.get?.(q.id);
    const qp=renderedPoint(qv&&Number.isFinite(Number(qv.x))?qv.x:x,qv&&Number.isFinite(Number(qv.y))?qv.y:y);
    for(let i=0;i<=64;i++){
      const t=i/64;
      const px=a[0]+(z[0]-a[0])*t,py=a[1]+(z[1]-a[1])*t;
      const d=Math.hypot(px-qp[0],py-qp[1]);
      if(d<minDistance){minDistance=d;closestId=q.id;closestCell=[x,y];}
      if(d<HEX_MIN_DIST-1e-7){hit=true;break;}
    }
    if(hit)break;
  }

  window.__sixBallReferenceFirstContactSweepDiagnosticV3={
    ballId:p.ball.id,
    from:[sx,sy],
    to:[tx,ty],
    minDistance,
    closestId,
    closestCell,
    threshold:HEX_MIN_DIST,
    hit,
    at:Date.now()
  };
  return hit;
}

hexPhysPathHitsStationary=function(p,board,movingIds){
  if(String(p?.kind||"")==="REFERENCE_FIRST_CONTACT_PAIR"){
    const game=gameByBoard.get(board);
    const rendered=renderedSweepHitsStationary(p,board,movingIds,game);
    if(rendered!==null)return rendered;
  }
  return basePathHitsStationary(p,board,movingIds);
};

window.__sixBallReferenceFirstContactSweepUsesRenderedOrigin=true;
window.__sixBallReferenceFirstContactSweepKeepsCanonicalTargets=true;
window.__sixBallReferenceFirstContactSweepVersion="reference-first-contact-sweep-v3";
})();
