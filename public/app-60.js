const HEX_GARBAGE_FINAL_BUCKET=1.05;
function hexFinalKey(x,y){return x+","+y;}
function hexFinalBuckets(items){
 const m=new Map();
 for(let i=0;i<items.length;i++){
  const q=items[i],bx=Math.floor((q.v.x*.5)/HEX_GARBAGE_FINAL_BUCKET),by=Math.floor((q.v.y*HEX_ROW_H)/HEX_GARBAGE_FINAL_BUCKET);
  q._hfi=i;q._hfbx=bx;q._hfby=by;
  const k=hexFinalKey(bx,by);if(!m.has(k))m.set(k,[]);m.get(k).push(q);
 }
 return m;
}
function hexFinalPairs(items,buckets){
 const out=[],seen=new Set();
 for(const a of items){
  if(!a.ball?.isGarbage)continue;
  for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
   const list=buckets.get(hexFinalKey(a._hfbx+ox,a._hfby+oy));if(!list)continue;
   for(const b of list){
    if(a===b)continue;
    const lo=Math.min(a._hfi,b._hfi),hi=Math.max(a._hfi,b._hfi),k=lo+":"+hi;if(seen.has(k))continue;seen.add(k);
    const dx=(b.v.x-a.v.x)*.5,dy=(b.v.y-a.v.y)*HEX_ROW_H;if(Math.abs(dx)>=1||Math.abs(dy)>=1)continue;
    out.push([a,b]);
   }
  }
 }
 return out;
}
hexEnforceFinalVisualNonOverlap=function(g){
 const items=hexRenderBoardVisuals(g);if(items.length<2||!items.some(q=>q.ball?.isGarbage))return 0;
 let corrections=0;
 for(let pass=0;pass<72;pass++){
  const pairs=hexFinalPairs(items,hexFinalBuckets(items));if(!pairs.length)break;
  let changed=false;
  for(const [a,b] of pairs){
   const n=hexRenderPairNormal(a,b);if(n.d>=1-HEX_REFERENCE_FINAL_CONTACT_EPS)continue;
   const pileA=hexNormalPileOwnsFinalCentre(g,a),pileB=hexNormalPileOwnsFinalCentre(g,b);if(pileA&&pileB)continue;
   const ma=hexReferenceFinalMobility(g,a),mb=hexReferenceFinalMobility(g,b),total=ma+mb;if(total<=0)continue;
   const push=1-n.d;hexRenderMoveAlongNormal(a,n.nx,n.ny,push*(ma/total),-1);hexRenderMoveAlongNormal(b,n.nx,n.ny,push*(mb/total),+1);
   changed=true;corrections++;
  }
  if(!changed)break;
 }
 for(const q of items){delete q._hfi;delete q._hfbx;delete q._hfby;}
 return corrections;
};
