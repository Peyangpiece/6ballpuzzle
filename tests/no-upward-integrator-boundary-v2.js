const fs=require("fs");
const vm=require("vm");
const path=require("path");
const {ctx}=require("./v1303-plan-group-smoke.js");

/* Prove that the final boundary blocks an upward displacement even when it is
 * introduced by the visual integrator itself (before contact resolution). */
vm.runInContext(`
  window.__baseUpdateForNoUpwardTest=updateVisuals;
  updateVisuals=function(g,dt){
    const r=window.__baseUpdateForNoUpwardTest(g,dt);
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
      const b=valid(x,y)?g.board[y][x]:null;
      const v=b&&g.vis.get(b.id);
      if(b&&!b.isGarbage&&v&&b.fallPath?.length){v.y-=0.25;v.vy=-3;}
    }
    return r;
  };
`,ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,"../public/app-no-upward-bounce-split-authority-v1.js"),"utf8"),ctx,{filename:"app-no-upward-bounce-split-authority-v1.js"});

function expect(v,msg){if(!v)throw new Error(msg);}
const result=vm.runInContext(`(()=>{
  const g=createEngine(840001),b=mkBall(g,1);
  g.state="RESOLVING";g.phase="SETTLE";
  g.board[5][6]=b;noteBoardCell(g.board,5,b);
  g.vis.set(b.id,{x:6,y:4.5,vy:1,motionSpeed:1});
  b.fallPath=[{from:[6,4.5],to:[6,7],kind:"GROUP_TRANSLATE",motionSeq:1,groupSize:0,bundleId:0}];
  g._visualMovingIds=new Set([b.id]);
  const before={...g.vis.get(b.id)};
  updateVisuals(g,1/240);
  const after={...g.vis.get(b.id)};
  return{before,after,diag:window.__sixBallLastNoUpwardIntegratorV2||null,flag:window.__sixBallOrdinaryIntegratorNeverMovesUp};
})()`,ctx);

expect(result.flag,"integrator boundary flag missing");
expect(result.after.y>=result.before.y-1e-10,"visual integrator produced an upward frame");
expect(result.after.vy>=0,"visual integrator retained upward velocity");
expect(result.diag?.prevented>=1,"upward integrator correction was not recorded");
console.log("ordinary visual integrator no-upward boundary PASS",JSON.stringify(result));
