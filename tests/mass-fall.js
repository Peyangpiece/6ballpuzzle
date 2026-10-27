// public/app-mass-fall-v1.js: when a clear removes the support of many balls,
// they set off together under gravity and land without the old batch-by-batch
// stalls, no closer to one another than the batched animation drew them; the
// final board is the one the batched SETTLE produced. A clear releasing only a
// few balls is unchanged.
const assert = require("assert"), vm = require("vm");
const { ctx } = require("./v1303-plan-group-smoke.js");

// Clear the bottom `cleared` rows (one colour) under `upper` mixed rows and
// record every upper ball's rendered centre at 120 Hz.
function run(cleared, upper, disabled, perRow = 99) {
  return JSON.parse(vm.runInContext(`(()=>{
    window.__sixBallMassFallDisabled=${disabled};window.__sixBallLastMassFall=null;
    const g=createEngine(77);g.state='RESOLVING';g.phase='CLEAR';g.stateT=0;g.holdT=.4;
    const rows=[];for(let y=ROWS-1;y>=0&&rows.length<${cleared + upper};y--){const xs=[];for(let x=0;x<W2;x++)if(valid(x,y))xs.push(x);rows.push([y,xs]);}
    const ids=[];
    rows.forEach(([y,xs],ri)=>xs.forEach((x,i)=>{if(ri>=${cleared}&&i>=${perRow})return;const b=mkBall(g,ri<${cleared}?0:1+((i+ri*2)%4));g.board[y][x]=b;setVis(g,b,x,y,0);if(ri>=${cleared})ids.push(b.id);}));
    const big=findGroups(g.board).find(gr=>g.board[gr.cells[0][1]][gr.cells[0][0]].c===0);
    g.clearing={cells:big.cells.map(([x,y])=>[x,y,0,g.board[y][x].id]),ids:new Set(big.cells.map(([x,y])=>g.board[y][x].id)),waza:[],committed:false,ghosts:[]};
    const track=new Map(ids.map(id=>[id,[]]));let t=0,checkAt=null,minDist=9;
    for(let k=0;k<720&&checkAt===null;k++){
      stepEngine(g,1/120);t+=1/120;
      const pts=[];
      for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null,v=b&&g.vis.get(b.id);if(!v)continue;pts.push([v.x*.5,v.y*HEX_ROW_H]);if(track.has(b.id))track.get(b.id).push([t,v.x,v.y]);}
      if(g.clearing?.committed||g.phase==='SETTLE')for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++)minDist=Math.min(minDist,Math.hypot(pts[i][0]-pts[j][0],pts[i][1]-pts[j][1]));
      if(g.phase==='CHECK'||g.state!=='RESOLVING')checkAt=t;
    }
    const balls=[...track.values()].map(p=>{let start=null,end=null,pause=0,still=0;
      for(let i=1;i<p.length;i++){const d=Math.hypot(p[i][1]-p[i-1][1],p[i][2]-p[i-1][2]);
        if(d>1e-6){if(start===null)start=p[i-1][0];pause=Math.max(pause,still);still=0;end=p[i][0];}else if(start!==null)still+=1/120;}
      return{start,end,pause,drop:p[p.length-1][2]-p[0][2]};});
    return JSON.stringify({sig:physicsSignature(g),checkAt,minDist,balls,mass:window.__sixBallLastMassFall});
  })()`, ctx));
}

const massive = run(3, 4, false), batched = run(3, 4, true);
assert(massive.mass && massive.mass.balls >= 8, "a large clear starts a mass fall");
assert.strictEqual(massive.sig, batched.sig, "same final board as the batched SETTLE");
const moving = massive.balls.filter(b => b.start !== null);
assert(moving.length >= 20, "the upper rows fall: " + moving.length);
const first = Math.min(...moving.map(b => b.start));
const lateStart = Math.max(...moving.map(b => b.start)) - first;
assert(lateStart <= 0.2, `every released ball sets off within 0.2 s (${lateStart.toFixed(3)} s)`);
const pause = Math.max(...moving.map(b => b.pause));
assert(pause <= 0.2, `no ball waits mid-fall longer than 0.2 s (${pause.toFixed(3)} s)`);
// A free fall of the deepest drop (rows * row height, in diameters) from rest
// at the fitted support-loss gravity, with room for the sideways steps.
const deepest = Math.max(...moving.map(b => b.drop)) * Math.sqrt(3) / 2;
const fall = vm.runInContext(`clearSupportLossFallDuration(${deepest},0,CLEAR_SUPPORT_LOSS_GRAV,CLEAR_SUPPORT_LOSS_TERMINAL_VY)`, ctx);
const lastLanding = Math.max(...moving.map(b => b.end)) - first;
assert(lastLanding <= fall * 2, `collapse lands in ${lastLanding.toFixed(3)} s, free fall ${fall.toFixed(3)} s`);
assert(massive.checkAt < batched.checkAt - 1, `CHECK much sooner than the batched flow (${massive.checkAt.toFixed(2)} vs ${batched.checkAt.toFixed(2)} s)`);
assert(massive.minDist >= Math.min(batched.minDist, 0.86) - 0.005, `balls stay apart (${massive.minDist.toFixed(3)} vs ${batched.minDist.toFixed(3)})`);

// Three balls above a cleared row: the per-ball motion fitted to the captures.
const small = run(1, 1, false, 3);
assert.strictEqual(small.balls.filter(b => b.start !== null).length, 3, "the three upper balls fall");
assert.strictEqual(small.mass, null, "a clear releasing few balls keeps the per-ball motion");

console.log("mass fall PASS", JSON.stringify({ balls: moving.length, lateStart: +lateStart.toFixed(3), pause: +pause.toFixed(3), lastLanding: +lastLanding.toFixed(3), freeFall: +fall.toFixed(3), check: [+massive.checkAt.toFixed(2), +batched.checkAt.toFixed(2)], minDist: [+massive.minDist.toFixed(3), +batched.minDist.toFixed(3)] }));
