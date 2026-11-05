// Frame-to-frame motion continuity over whole games (120 fps, random drops):
// - no ball moves more than 0.3 ball widths in one frame (a dropped piece
//   whose slide started in the air used to swing wide of its pivot and be
//   snapped back by up to 1.3 cells at the end of the segment, app-07.js
//   hexPivotApproachPath);
// - no ball stops for a frame in the middle of a move and then goes on (one idle frame
//   at every cell boundary of a multi-cell roll or slide,
//   app-segment-chain-continuity-v1.js).
const vm = require("vm"), assert = require("assert");
const { ctx } = require("./v1303-plan-group-smoke.js");
const GAMES = 4, PIECES = 40, FPS = 120;
const r = vm.runInContext(`(()=>{
let rnd=12345;const R=()=>{rnd=(rnd*1103515245+12345)>>>0;return rnd/4294967296;};
const H=HEX_ROW_H,dist=(a,b)=>Math.hypot((a[0]-b[0])*.5,(a[1]-b[1])*H);
let frames=0,jumps=[],stalls=[],moves=0;
for(let game=0;game<${GAMES};game++){
  const g=createEngine(1000+game*77,{offset:false,gravityRamp:false});
  const hist=new Map();let pieces=0,guard=0;
  while(g.alive&&pieces<${PIECES}&&guard++<200000){
    if(g.state==="PLAYING"&&g.piece){g.piece.rot=Math.floor(R()*6)%6;setFreeX(g,1+R()*15);g.pieceVX=g.freeX;hardDrop(g);pieces++;}
    stepEngine(g,1/${FPS});frames++;
    const onBoard=new Map();
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)&&g.board[y][x];if(b)onBoard.set(b.id,b);}
    for(const [id,b] of onBoard){
      const v=g.vis.get(id);if(!v||!Number.isFinite(v.x))continue;
      const p=[v.x,v.y],moving=!!(b.fallPath&&b.fallPath.length),h=hist.get(id)||[];
      h.push({p,moving});if(h.length>4)h.shift();hist.set(id,h);
      if(h.length<2)continue;
      const d=dist(h[h.length-1].p,h[h.length-2].p);
      if(d>1e-4)moves++;
      if(d>0.3)jumps.push({game,id,frame:frames,d:+d.toFixed(3)});
      // Moving, then a frame (almost) without movement, then moving again: a stutter.
      // (A ball that has reached its last cell and waits for the rest of its
      // batch is at rest, not stalled, and does not move again.)
      if(h.length===4&&h[1].moving&&h[2].moving){
        const a=dist(h[1].p,h[0].p),b=dist(h[2].p,h[1].p),c=dist(h[3].p,h[2].p);
        if(a>0.03&&c>0.03&&b<0.15*Math.min(a,c))stalls.push({game,id,frame:frames-1,before:+a.toFixed(3),after:+c.toFixed(3)});
      }
    }
  }
}
return {frames,moves,jumps,stalls};
})()`, ctx, { timeout: 600000 });
assert(r.moves > 2000, "the games must actually move balls: " + r.moves);
assert.strictEqual(r.jumps.length, 0, "a ball jumped in one frame: " + JSON.stringify(r.jumps.slice(0, 5)));
assert.strictEqual(r.stalls.length, 0, "a moving ball stopped for a frame mid-move: " + JSON.stringify(r.stalls.slice(0, 5)));
console.log("motion continuity PASS", JSON.stringify({ frames: r.frames, moves: r.moves }));
