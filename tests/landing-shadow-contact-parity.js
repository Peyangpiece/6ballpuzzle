const fs = require("fs");
const vm = require("vm");
const path = require("path");
const {ctx} = require("./v1303-plan-group-smoke.js");
const source = fs.readFileSync(path.join(__dirname, "../public/app-10.js"), "utf8");
const start = source.indexOf("function rigidShadowPixelPlacement(");
const end = source.indexOf("function drawLandingShadowBall", start);
if (start < 0 || end < 0) throw new Error("Canonical shadow solver missing");
vm.runInContext(source.slice(start, end).replace("function rigidShadowPixelPlacement(",
  "function canonicalRigidShadowForAudit("), ctx);
const result = vm.runInContext(`(() => {
  let seed=1022026, cases=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let trial=0;trial<240;trial++){
    const g=createEngine(trial+1022026);g.state="PLAYING";g.ver=trial+1;
    g._visualMovingIds=new Set();g.piece={x:7,y:-2,rot:trial%6,colors:[0,1,2]};
    g.pieceVX=4+random()*6;g.freeX=g.pieceVX;
    let id=1;
    for(let y=5;y<ROWS;y++)for(let x=0;x<W2;x++){
      if(!valid(x,y)||random()>.35)continue;
      const b={id,c:id%5,rigid:false,motionGroupId:0};
      g.board[y][x]=b;noteBoardCell(g.board,y,b);
      // Include rendered/logical differences, not just stationary grids.
      g.vis.set(id,{x:x+(trial%2?random()*.2:0),y:y-(trial%3?random()*.2:0)});
      if(trial%3)g._visualMovingIds.add(id);
      id++;
    }
    const shadow=landingShadowVisualCells(g);
    const D=20+random()*60,pos=(x,y)=>[20+x*D*.5,30+y*D*HEX_ROW_H];
    const args=[g,shadow,pos,D,20,30,D*8,D*14];
    const a=canonicalRigidShadowForAudit(...args),b=rigidShadowPixelPlacement(...args);
    if(a.length!==b.length)throw new Error("Shadow shape changed: "+trial);
    for(let i=0;i<a.length;i++)for(let j=0;j<3;j++){
      if(Math.abs(a[i][j]-b[i][j])>1e-9)throw new Error("Published shadow differs from contact solver: "+trial);
    }
    cases++;
  }
  return {cases,renderedOffsets:true,allRotations:true};
})()`, ctx, {timeout:120000});
console.log("published landing shadow contact parity PASS", JSON.stringify(result));
