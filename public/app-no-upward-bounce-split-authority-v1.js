/* Ordinary-ball no-upward-bounce + split-continuity authority v1.
 * Final visual guard.
 *
 * The logical solver already rejects unsafe paths below HEX_MIN_DIST.  The
 * generic render contact solver historically used a stricter radius of 1.0
 * and could therefore push an otherwise valid moving ball upward after its
 * analytic path had been evaluated.  On a split this looked like a bounce or
 * a one-frame hesitation.
 *
 * Rules here:
 *  - reference split trajectories remain authoritative after they pass the
 *    physics sweep; the generic overlap pass may not distort them;
 *  - ordinary resolving balls never move upward as a render-only correction;
 *  - if restoring the previous Y would leave a true (< HEX_MIN_DIST) overlap,
 *    separation is repaired horizontally, preserving a rigid cohort by moving
 *    the whole cohort together;
 *  - pileFlow / garbage keep their legacy presentation path unchanged.
 */
(function(){
if(
  typeof window==="undefined" ||
  window.__sixBallNoUpwardBounceSplitAuthorityV1 ||
  typeof resolveVisualContacts!=="function"
)return;

window.__sixBallNoUpwardBounceSplitAuthorityV1=true;

const baseResolveVisualContacts=resolveVisualContacts;
const EPS=1e-9;
const SAFE_EPS=1e-7;

function ordinaryBall(ball){
  return !!ball && typeof ball==="object" && !ball.isGarbage;
}
function firstSeg(ball){
  return Array.isArray(ball?.fallPath)&&ball.fallPath.length
    ? (ball.fallPath[0]?.to?ball.fallPath[0]:null)
    : null;
}
function legacyPile(seg){
  return !!(seg?.pileFlow||seg?.pileGravityFall);
}
function splitKind(seg){
  const k=String(seg?.kind||"");
  return (
    k==="REFERENCE_FIRST_CONTACT_PAIR" ||
    k==="REFERENCE_FIRST_CONTACT_SOLO" ||
    /^REFERENCE_INVERTED_HARD_SPLIT_/.test(k) ||
    /^INVERTED_FLAT_SPLIT_/.test(k)
  );
}
function isMoving(g,ball){
  return !!(
    (Array.isArray(ball?.fallPath)&&ball.fallPath.length) ||
    (g?._visualMovingIds instanceof Set&&g._visualMovingIds.has(ball.id))
  );
}
function boardItems(g){
  const out=[];
  for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
    const ball=valid(x,y)?g.board[y][x]:null;
    const v=ball&&g.vis?.get?.(ball.id);
    if(!ordinaryBall(ball)||!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))continue;
    const seg=firstSeg(ball);
    out.push({ball,v,x,y,seg,moving:isMoving(g,ball)});
  }
  return out;
}

/* Contact correction is not the only place that can alter the rendered
 * centre.  updateVisuals also consumes/rebases path segments and older layers
 * may briefly restore a pivot/sample above the previous frame.  Guard the
 * complete visual integration boundary so an ordinary gravity-driven ball can
 * never acquire an upward frame even when no overlap pass runs that tick. */
if(typeof updateVisuals==="function"){
  const baseUpdateVisuals=updateVisuals;
  updateVisuals=function(g,dt){
    if(!g?.board||!g?.vis)return baseUpdateVisuals(g,dt);

    const before=boardItems(g);
    const snap=new Map(before.map(q=>[
      q.ball.id,
      {
        y:Number(q.v.y),
        moving:q.moving,
        pile:legacyPile(q.seg)
      }
    ]));

    const result=baseUpdateVisuals(g,dt);
    let prevented=0;
    for(const q of boardItems(g)){
      const old=snap.get(q.ball.id);
      /* There is no legitimate upward correction for a board ball.  Include
       * the exact landing frame as well: by then fallPath may already have
       * been consumed and the old `moving` flag can be false. */
      if(!old||old.pile)continue;
      if(Number(q.v.y)<old.y-EPS){
        q.v.y=old.y;
        prevented++;
      }
      q.v.vy=Math.max(0,Number(q.v.vy)||0);
    }
    if(prevented){
      window.__sixBallLastNoUpwardIntegratorV2={prevented,at:Date.now()};
    }
    return result;
  };
}
function cohortItems(items,item){
  const gid=Number(item?.ball?.motionGroupId)||0;
  const size=Number(item?.ball?.motionGroupSize)||0;
  if(!gid||size<2)return[item];
  const cohort=items.filter(q=>
    Number(q.ball?.motionGroupId)===gid &&
    Number(q.ball?.motionGroupSize)===size
  );
  return cohort.length===size?cohort:[item];
}
function canShiftCohort(cohort,dx){
  return cohort.every(q=>{
    const nx=Number(q.v.x)+dx;
    return Number.isFinite(nx)&&nx>=-SAFE_EPS&&nx<=W2-1+SAFE_EPS;
  });
}
function shiftCohort(cohort,dx){
  for(const q of cohort){
    q.v.x=Math.max(0,Math.min(W2-1,Number(q.v.x)+dx));
    q.v.vy=Math.max(0,Number(q.v.vy)||0);
  }
}
function repairTrueOverlapHorizontally(items,a,b,minDist){
  const dy=(Number(a.v.y)-Number(b.v.y))*HEX_ROW_H;
  if(Math.abs(dy)>=minDist-SAFE_EPS)return false;
  const dxReal=(Number(a.v.x)-Number(b.v.x))*.5;
  const dist=Math.hypot(dxReal,dy);
  if(dist>=minDist-SAFE_EPS)return false;

  const required=Math.sqrt(Math.max(0,minDist*minDist-dy*dy));
  const logicalSign=Math.sign(Number(a.x)-Number(b.x));
  const visualSign=Math.sign(dxReal);
  const preferred=visualSign||logicalSign||((Number(a.ball.id)||0)<(Number(b.ball.id)||0)?-1:1);

  const aC=cohortItems(items,a),bC=cohortItems(items,b);
  const candidates=[];
  for(const sign of [preferred,-preferred]){
    const targetReal=sign*required;
    const da=2*(targetReal-dxReal);
    const db=-da;
    if(a.moving&&canShiftCohort(aC,da))candidates.push({who:"a",delta:da,mag:Math.abs(da)});
    if(b.moving&&canShiftCohort(bC,db))candidates.push({who:"b",delta:db,mag:Math.abs(db)});
  }
  if(!candidates.length)return false;
  candidates.sort((u,v)=>u.mag-v.mag);
  const best=candidates[0];
  if(best.who==="a")shiftCohort(aC,best.delta);
  else shiftCohort(bC,best.delta);
  return true;
}

resolveVisualContacts=function(g){
  if(!g?.board||!g?.vis)return baseResolveVisualContacts(g);

  const before=boardItems(g);
  const snap=new Map(before.map(q=>[
    q.ball.id,
    {
      x:Number(q.v.x),y:Number(q.v.y),
      split:splitKind(q.seg)&&!legacyPile(q.seg),
      pile:legacyPile(q.seg),
      moving:q.moving
    }
  ]));

  const result=baseResolveVisualContacts(g);

  let upwardPrevented=0,splitRestored=0,horizontalRepairs=0;
  const after=boardItems(g);

  /* A verified reference split path has already passed the authored sweep.
   * Do not let the generic 1.0-radius contact pass bend it, delay it, or kick it
   * upward.  This also keeps pair and solo on the same continuous clock. */
  for(const q of after){
    const s=snap.get(q.ball.id);
    if(!s||s.pile||!s.moving)continue;
    if(s.split){
      if(Math.abs(Number(q.v.x)-s.x)>EPS||Math.abs(Number(q.v.y)-s.y)>EPS){
        q.v.x=s.x;
        q.v.y=s.y;
        q.v.vy=Math.max(0,Number(q.v.vy)||0);
        splitRestored++;
      }
      continue;
    }
    /* The authored gravity/slope path owns vertical motion.  The generic
     * overlap solver runs afterwards and used to move an even-row UP triangle
     * vertically because doubled-x parity makes its contact normal slightly
     * asymmetric.  That downward push was snapped back to the logical row on
     * the next frame and appeared as a landing bounce.  Restore Y after every
     * render-only contact correction; the horizontal repair below resolves
     * any true penetration without creating a future snap-back. */
    if(Math.abs(Number(q.v.y)-s.y)>EPS){
      q.v.y=s.y;
      q.v.vy=Math.max(0,Number(q.v.vy)||0);
      upwardPrevented++;
    }
  }

  /* Restoring Y must never trade the bounce for penetration.  Only violations
   * below the real physics threshold are repaired, and only sideways. */
  const minDist=Number.isFinite(Number(HEX_MIN_DIST))?Number(HEX_MIN_DIST):0.9995;
  for(let pass=0;pass<8;pass++){
    let changed=false;
    for(let i=0;i<after.length;i++)for(let j=i+1;j<after.length;j++){
      const a=after[i],b=after[j];
      if(!a.moving&&!b.moving)continue;
      if(
        Number(a.ball?.motionGroupId)>0 &&
        Number(a.ball?.motionGroupId)===Number(b.ball?.motionGroupId)
      )continue;
      const d=Math.hypot(
        (Number(a.v.x)-Number(b.v.x))*.5,
        (Number(a.v.y)-Number(b.v.y))*HEX_ROW_H
      );
      if(d>=minDist-SAFE_EPS)continue;
      if(repairTrueOverlapHorizontally(after,a,b,minDist)){
        horizontalRepairs++;
        changed=true;
      }
    }
    if(!changed)break;
  }

  if(upwardPrevented||splitRestored||horizontalRepairs){
    window.__sixBallLastNoUpwardBounceVisualV1={
      upwardPrevented,
      splitRestored,
      horizontalRepairs,
      at:Date.now()
    };
  }
  return result;
};

if(typeof liveBatchPointAt==="function"){
  const baseLiveBatchPointAt=liveBatchPointAt;
  liveBatchPointAt=function(batch,member,t,states,memo=new Map(),stack=new Set()){
    const p=baseLiveBatchPointAt(batch,member,t,states,memo,stack);
    const seg=member?.seg;
    if(!splitKind(seg)||legacyPile(seg)||!seg?.from)return p;
    /* Resolving motion is gravity-driven.  A split may be horizontal for part
     * of a frame, but it may never travel above its actual contact centre. */
    return [Number(p[0]),Math.max(Number(seg.from[1]),Number(p[1]))];
  };
}

window.__sixBallNoUpwardBounceVersion="no-upward-bounce-split-authority-v1";
window.__sixBallOrdinaryVisualCorrectionsNeverMoveUp=true;
window.__sixBallOrdinaryIntegratorNeverMovesUp=true;
window.__sixBallOrdinaryContactCorrectionIsHorizontalOnly=true;
window.__sixBallEvenRowUpTriangleLandingNeverLifts=true;
window.__sixBallReferenceSplitPathBeatsGenericContactCorrection=true;
window.__sixBallSplitHasNoResolverPause=true;
window.__sixBallTrueOverlapRepairIsHorizontal=true;
window.__sixBallPileAndGarbageBouncePolicyUnchanged=true;
})();
