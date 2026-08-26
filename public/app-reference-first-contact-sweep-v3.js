/* Nintendo-reference first-contact sweep v3.
 *
 * The v2 first-contact authority starts a just-released UP triangle at its
 * signed rendered hard-drop contact.  At an outer hit the surviving
 * top+opposite-lower pair is still falling while the contacted solo ball rolls
 * away.  The snapped logical chord for that pair can cut a few thousandths of
 * a diameter through the support even though the reference motion stays
 * tangent to it.
 *
 * For REFERENCE_FIRST_CONTACT_PAIR only, collision validation and rendering
 * use the same tiny outward tangent bow from the exact rendered start to the
 * canonical target.  The same x offset is applied to both pair members, so
 * their one-diameter spacing is preserved exactly.  Target-cell occupancy and
 * all later physics remain canonical.
 *
 * Timing is taken directly from the 2026-08-26 Nintendo reference capture:
 * first unilateral contact is F126, the surviving pair reaches its first
 * landing at F130 (4 frame intervals), and the solo reaches its first lattice
 * landing at F131 (5 frame intervals).  Keeping those cohorts on independent
 * frame budgets removes the staged/draggy feel without changing later physics.
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
const baseHexMotionDuration=typeof hexMotionDuration==="function"?hexMotionDuration:null;
const baseLiveBatchPointAt=typeof liveBatchPointAt==="function"?liveBatchPointAt:null;
const gameByBoard=new WeakMap();
const baseCreateEngine=createEngine;
const REFERENCE_PAIR_TANGENT_BULGE=0.04;
const SWEEP_SAMPLES=96;
const REFERENCE_CAPTURE_FPS=30.02001334222815;
const REFERENCE_FIRST_CONTACT_PAIR_FRAMES=4;
const REFERENCE_FIRST_CONTACT_SOLO_FRAMES=5;
const REFERENCE_FIRST_CONTACT_PAIR_DURATION=REFERENCE_FIRST_CONTACT_PAIR_FRAMES/REFERENCE_CAPTURE_FPS;
const REFERENCE_FIRST_CONTACT_SOLO_DURATION=REFERENCE_FIRST_CONTACT_SOLO_FRAMES/REFERENCE_CAPTURE_FPS;

createEngine=function(...args){
  const game=baseCreateEngine(...args);
  if(game?.board&&typeof game.board==="object")gameByBoard.set(game.board,game);
  return game;
};

function clamp01(v){return Math.max(0,Math.min(1,Number(v)||0));}
function renderedPoint(x,y){
  return [latticeRealX(Number(x)),cellCenterYNorm(Number(y))];
}
function pairBowVisualX(fromX,toX,u){
  const dir=Math.sign(Number(toX)-Number(fromX));
  if(!dir)return 0;
  u=clamp01(u);
  return dir*REFERENCE_PAIR_TANGENT_BULGE*4*u*(1-u);
}
function pairVisualPoint(fromX,fromY,toX,toY,u){
  u=clamp01(u);
  return [
    Number(fromX)+(Number(toX)-Number(fromX))*u+pairBowVisualX(fromX,toX,u),
    Number(fromY)+(Number(toY)-Number(fromY))*u
  ];
}
function renderedSweepHitsStationary(p,board,movingIds,game){
  const startV=game?.vis?.get?.(p?.ball?.id);
  if(!startV||!startV.justReleased)return null;
  const sx=Number(startV.x),sy=Number(startV.y),tx=Number(p.tx),ty=Number(p.ty);
  if(![sx,sy,tx,ty].every(Number.isFinite))return null;

  const moving=movingIds instanceof Set?movingIds:new Set();
  let minDistance=Infinity,closestId=0,closestCell=null,hit=false,minT=0;

  for(let y=boardScanMin(board);y<ROWS;y++)for(let x=0;x<W2;x++){
    const q=valid(x,y)?board[y][x]:null;
    if(!q||q.id===p.ball.id||moving.has(q.id))continue;
    const qv=game.vis?.get?.(q.id);
    const qp=renderedPoint(
      qv&&Number.isFinite(Number(qv.x))?qv.x:x,
      qv&&Number.isFinite(Number(qv.y))?qv.y:y
    );
    for(let i=0;i<=SWEEP_SAMPLES;i++){
      const t=i/SWEEP_SAMPLES;
      const visual=pairVisualPoint(sx,sy,tx,ty,t);
      const pt=renderedPoint(visual[0],visual[1]);
      const d=Math.hypot(pt[0]-qp[0],pt[1]-qp[1]);
      if(d<minDistance){minDistance=d;closestId=q.id;closestCell=[x,y];minT=t;}
      if(d<HEX_MIN_DIST-1e-7){hit=true;break;}
    }
    if(hit)break;
  }

  window.__sixBallReferenceFirstContactSweepDiagnosticV3={
    ballId:p.ball.id,
    from:[sx,sy],
    to:[tx,ty],
    minDistance,
    minT,
    closestId,
    closestCell,
    threshold:HEX_MIN_DIST,
    tangentBulge:REFERENCE_PAIR_TANGENT_BULGE,
    samples:SWEEP_SAMPLES,
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

if(baseHexMotionDuration){
  hexMotionDuration=function(seg,state={vy:0,speed:0}){
    const natural=baseHexMotionDuration(seg,state);
    const kind=String(seg?.kind||"");
    if(kind==="REFERENCE_FIRST_CONTACT_PAIR")return REFERENCE_FIRST_CONTACT_PAIR_DURATION;
    if(kind==="REFERENCE_FIRST_CONTACT_SOLO")return REFERENCE_FIRST_CONTACT_SOLO_DURATION;
    return natural;
  };
}

if(baseLiveBatchPointAt){
  liveBatchPointAt=function(batch,member,t,states,memo=new Map(),stack=new Set()){
    const point=baseLiveBatchPointAt(batch,member,t,states,memo,stack);
    const seg=member?.seg;
    if(String(seg?.kind||"")!=="REFERENCE_FIRST_CONTACT_PAIR"||!seg?.from||!seg?.to)return point;

    const dy=Number(seg.to[1])-Number(seg.from[1]);
    const dx=Number(seg.to[0])-Number(seg.from[0]);
    let u;
    if(Math.abs(dy)>1e-9)u=(Number(point[1])-Number(seg.from[1]))/dy;
    else if(Math.abs(dx)>1e-9)u=(Number(point[0])-Number(seg.from[0]))/dx;
    else u=1;
    u=clamp01(u);

    const bow=pairBowVisualX(seg.from[0],seg.to[0],u);
    if(Math.abs(bow)<1e-12)return point;
    return [Number(point[0])+bow,Number(point[1])];
  };
}

window.__sixBallReferenceFirstContactSweepUsesRenderedOrigin=true;
window.__sixBallReferenceFirstContactSweepKeepsCanonicalTargets=true;
window.__sixBallReferenceFirstContactPairTangentBulge=REFERENCE_PAIR_TANGENT_BULGE;
window.__sixBallReferenceFirstContactPairUsesSharedBow=true;
window.__sixBallReferenceCaptureFps=REFERENCE_CAPTURE_FPS;
window.__sixBallReferenceFirstContactPairFrames=REFERENCE_FIRST_CONTACT_PAIR_FRAMES;
window.__sixBallReferenceFirstContactSoloFrames=REFERENCE_FIRST_CONTACT_SOLO_FRAMES;
window.__sixBallReferenceFirstContactPairDuration=REFERENCE_FIRST_CONTACT_PAIR_DURATION;
window.__sixBallReferenceFirstContactSoloDuration=REFERENCE_FIRST_CONTACT_SOLO_DURATION;
window.__sixBallReferenceFirstContactTimingUsesCapturedFrames=true;
window.__sixBallReferenceFirstContactSweepVersion="reference-first-contact-sweep-v3";
})();
