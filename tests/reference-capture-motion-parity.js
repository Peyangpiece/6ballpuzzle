const fs=require("fs"),vm=require("vm"),path=require("path"),assert=require("assert/strict");
const {ctx}=require("./v1303-plan-group-smoke.js");
const reference=require("./fixtures/reference-motion-20260814.json");
ctx.motionFps=Number(process.env.TEST_FPS)||120;
const result=vm.runInContext(`(()=>{
  let releasePreviewChecks=0;
  const planGroup=hexPhysPlanGroup;
  hexPhysPlanGroup=function(board,members,preview=false){
    if(!preview){
      const before=JSON.stringify(members.map(m=>m.ball)),trial=planGroup(board,members,true);
      if(trial.some(p=>p.pinnedLowerSplit)){
        if(before!==JSON.stringify(members.map(m=>m.ball)))throw new Error('Pocket release preview mutates ball state');
        releasePreviewChecks++;
      }
    }
    return planGroup(board,members,preview);
  };
  function put(g,x,y,c){const b=mkBall(g,c);g.board[y][x]=b;noteBoardCell(g.board,y,b);setVis(g,b,x,y,0);return b;}
  function landing(mirror=false,inverted=false){
    const g=createEngine(140826);g.state='PLAYING';
    const cells=inverted?[[6,11,2],[8,11,4],[7,10,4]]:[[6,11,0],[8,11,4],[10,11,1],[12,11,2],[9,10,0],[11,10,0]];
    for(const [x,y,c]of cells)put(g,mirror?18-x:x,y,c);
    const first=g.nextId;
    const free=inverted?.67:5.3;
    g.piece={x:6,y:1,rot:inverted?0:1,colors:inverted?[0,2,2]:mirror?[4,2,3]:[4,3,2]};setFreeX(g,mirror?16-free:free);g.pieceVX=g.freeX;hardDrop(g);
    const ids=mirror?[first,first+2,first+1]:[first,first+1,first+2],samples=[];
    for(let i=0;i<=Math.ceil(motionFps*.35);i++){
      if(i)stepEngine(g,1/motionFps);
      samples.push({t:i/motionFps,balls:ids.map(id=>{
        const v=g.vis.get(id);let b;for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)&&g.board[y][x]?.id===id)b=g.board[y][x];
        return {id,x:mirror?18-v.x:v.x,y:v.y,kind:b?.fallPath?.[0]?.kind,pile:!!b?.fallPath?.[0]?.pileFlow,size:b?.motionGroupSize,vy:v.vy};
      })});
    }
    return samples;
  }
  function fall(fast){
    const g=createEngine(12000);spawn(g);g.fastForward=fast;
    const start=g.piece.y+activeDropFraction(g);
    for(let i=0;i<motionFps*.2;i++)stepEngine(g,1/motionFps);
    return ((g.piece.y+activeDropFraction(g)-start)*HEX_ROW_H*REFERENCE_BALL_PX)/.2;
  }
  const traces={landing:landing(),mirrorLanding:landing(true),invertedLanding:landing(false,true)};
  return {fps:motionFps,normal:fall(false),fast:fall(true),...traces,releasePreviewChecks,field:{...ME},physicalDiameter:REFERENCE_BALL_PX};
})()`,ctx,{timeout:120000});
const sampleAt=(t,trace=result.landing)=>{
  const f=t*result.fps,a=trace[Math.floor(f)],b=trace[Math.ceil(f)],u=f-Math.floor(f);
  return a.balls.map((p,i)=>({x:p.x+(b.balls[i].x-p.x)*u,y:p.y+(b.balls[i].y-p.y)*u}));
};
const L=result.field,scale=reference.sourceWidth/1280;
const ox=L.X+(L.BW-9*(L.DX||L.D))/2,oy=L.Y+L.D/2;
const errors=reference.landingSamples.map(p=>{
  const actual=sampleAt((p.frame-reference.contactFrame)/reference.fps)[p.role];
  const x=(ox+actual.x*(L.DX||L.D)*.5)*scale,y=(oy+actual.y*L.D*Math.sqrt(3)/2)*scale;
  return {frame:p.frame,role:p.role,x,y,error:Math.hypot(x-p.x,y-p.y)};
});
const rms=Math.sqrt(errors.reduce((n,p)=>n+p.error*p.error,0)/errors.length),max=Math.max(...errors.map(p=>p.error));
const down=reference.invertedLanding;
const invertedErrors=down.samples.map(p=>{
  const a=sampleAt((p.frame-down.contactFrame)/down.fps,result.invertedLanding)[p.role];
  const x=(ox+a.x*(L.DX||L.D)*.5)*scale,y=(oy+a.y*L.D*Math.sqrt(3)/2)*scale;
  return {...p,actualX:x,actualY:y,error:Math.hypot(x-p.x,y-p.y)};
});
const invertedRms=Math.sqrt(invertedErrors.reduce((n,p)=>n+p.error*p.error,0)/invertedErrors.length),invertedMax=Math.max(...invertedErrors.map(p=>p.error));
let mirrorError=0;
for(let i=0;i<result.landing.length;i++)for(let j=0;j<3;j++){
  const a=result.landing[i].balls[j],b=result.mirrorLanding[i].balls[j];
  mirrorError=Math.max(mirrorError,Math.hypot(a.x-b.x,a.y-b.y));
}
assert(mirrorError<1e-7,"Reference pocket release is not left/right symmetric");
assert(result.releasePreviewChecks>=2,"Physical release preview was not tested on both sides");
const released=result.landing.find(s=>s.balls[1].size===0&&s.balls[0].kind);
assert(released&&released.balls.every(b=>b.size===0),"A pinned lower member incorrectly leaves a forced rigid pair");
if(process.env.CAPTURE_TRACE_ONLY){
  fs.writeFileSync(process.env.CAPTURE_OUTPUT||path.join(__dirname,"../audit-results/reference-motion-2026-10-02/runtime-after.json"),JSON.stringify({result,rms,max,errors,invertedRms,invertedMax,invertedErrors},null,2)+"\n");
  console.log("Capture baseline",JSON.stringify({normal:result.normal,fast:result.fast,rms,max}));
}else{
  // Measured 1920x1080 reference coordinates, not engine-to-engine assertions.
  assert(result.normal>=reference.normalFallPxPerSec[0]&&result.normal<=reference.normalFallPxPerSec[1],"Ordinary fall differs from footage");
  assert(result.fast>=reference.heldFallPxPerSec[0]&&result.fast<=reference.heldFallPxPerSec[1],"Held fast fall differs from footage");
  console.log("Measured capture errors",JSON.stringify({rms,max,errors}));
  assert(rms<=reference.landingRmsTolerancePx,"Landing trajectory RMS differs from source footage");
  assert(max<=reference.landingMaxTolerancePx,"Landing trajectory maximum error exceeds measured tolerance");
  assert(invertedRms<=reference.landingRmsTolerancePx,"Inverted landing differs from second source capture");
  assert(invertedMax<=reference.landingMaxTolerancePx,"Inverted landing maximum error exceeds tolerance");
  console.log("reference capture motion parity PASS",JSON.stringify({fps:result.fps,normal:result.normal,fast:result.fast,samples:errors.length+invertedErrors.length,rms,max,invertedRms,invertedMax}));
}
