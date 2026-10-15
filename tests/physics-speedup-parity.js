// The collision checks that were made faster in 2026-10 must give the same
// answers as the straightforward versions they replaced. A deterministic
// CPU-vs-CPU match (synchronous AI with a fixed number of simulations, attacks
// exchanged) is played; every call of the fast functions is compared with the
// reference implementation below, on the same state.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const PUBLIC = path.join(__dirname, "..", "public");
const read = f => fs.readFileSync(path.join(PUBLIC, f), "utf8");
const SECONDS = Number(process.env.PARITY_SECONDS || 30);

// Reference implementations (the code before the speed-up).
const REFERENCE = `
function __refPileFlowWaveSafe(g,waveSegs,start,duration){
    for(const seg of waveSegs){seg.pileFlowStart=start;seg.pileFlowDuration=duration;seg.pileFlowEnd=start+duration;}
    const boardBalls=[];for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b)boardBalls.push(b);}
    for(let i=0;i<=PILE_FLOW_COLLISION_SAMPLES;i++){const t=start+duration*(i/PILE_FLOW_COLLISION_SAMPLES);for(const seg of waveSegs){const moving=seg._pileFlowBall;if(!moving)continue;const a=pileFlowPositionAt(g,moving,t);for(const other of boardBalls){if(other===moving)continue;const b=pileFlowPositionAt(g,other,t),d=pileFlowPhysicalDist(a,b);if(d<PILE_FLOW_MIN_DIST){for(const q of waveSegs){delete q.pileFlowStart;delete q.pileFlowDuration;delete q.pileFlowEnd;}return false;}}}}return true;
}
function __refBallInBalancedHexagonRing(b,x,y){
    for(let cy=y-1;cy<=y+1;cy++)for(let cx=x-2;cx<=x+2;cx++)if(isBalancedHexagonCenterHole(b,cx,cy)){
        if([[-2,0],[2,0],[-1,-1],[1,-1],[-1,1],[1,1]].some(([dx,dy])=>cx+dx===x&&cy+dy===y))return true;
    }
    return false;
}
function __refVisualSegmentSafe(g,id,ox,oy,nx,ny,minDist=0.999999){
    const physical=Math.hypot((nx-ox)*0.5,(ny-oy)*HEX_ROW_H);
    const samples=Math.max(12,Math.min(48,Math.ceil(physical*36)));
    for(let i=1;i<=samples;i++){const t=i/samples;if(!visualPointSafe(g,id,ox+(nx-ox)*t,oy+(ny-oy)*t,minDist))return false;}
    return true;
}
function __refResolveVisualContacts08(g){
    const items=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null,v=ball&&g.vis.get(ball.id);
        if(ball&&v&&Number.isFinite(v.x)&&Number.isFinite(v.y))items.push({ball,v,x,y,moving:!!(g._visualMovingIds?.has(ball.id)||ball.fallPath?.length)});
    }
    if(items.length<2)return;
    const H=HEX_ROW_H,MIN=1,floorMax=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/H;
    const shift=(q,px,py)=>{
        if(q.ball?.isGarbage&&py<0){const mag=Math.hypot(px,py);let dir=Math.sign(px);if(!dir)dir=Math.sign(q.x-q.v.x)||((q.ball.id&1)?1:-1);px=dir*mag;py=0;}
        const ox=q.v.x,oy=q.v.y;
        q.v.x=Math.max(0,Math.min(W2-1,q.v.x+px/.5));
        if(q.ball?.isGarbage){const proposed=q.v.y+py/H;q.v.y=Math.min(floorMax,Math.max(q.v.y,Math.min(q.y,proposed)));}
        else q.v.y=Math.min(floorMax,q.v.y+py/H);
        return[(q.v.x-ox)*.5,(q.v.y-oy)*H];
    };
    const solvePair=(a,b)=>{
        let dx=(a.v.x-b.v.x)*.5,dy=(a.v.y-b.v.y)*H,d=Math.hypot(dx,dy);
        if(d>=MIN-1e-9)return false;
        if(d<1e-10){const logicalDx=(a.x-b.x)*.5,logicalDy=(a.y-b.y)*H,ld=Math.hypot(logicalDx,logicalDy);if(ld>1e-10){dx=logicalDx/ld;dy=logicalDy/ld;}else{dx=a.ball.id<b.ball.id?-1:1;dy=0;}d=0;}else{dx/=d;dy/=d;}
        const missing=MIN-d;let wa=a.moving&&!b.moving?1:(!a.moving&&b.moving?0:.5),wb=1-wa;
        shift(a,dx*missing*wa,dy*missing*wa);shift(b,-dx*missing*wb,-dy*missing*wb);
        for(let retry=0;retry<3;retry++){
            const rx=(a.v.x-b.v.x)*.5,ry=(a.v.y-b.v.y)*H,rd=Math.hypot(rx,ry);if(rd>=MIN-1e-9)break;
            const nx=rd>1e-10?rx/rd:dx,ny=rd>1e-10?ry/rd:dy,need=MIN-rd;
            const first=(a.moving&&!b.moving)?a:((b.moving&&!a.moving)?b:(retry&1?a:b));const sign=first===a?1:-1;
            const moved=shift(first,nx*need*sign,ny*need*sign),gain=Math.hypot(moved[0],moved[1]);
            if(gain<need*.25){const other=first===a?b:a;shift(other,-nx*need*sign,-ny*need*sign);}
        }
        return true;
    };
    const nearbyPairs=()=>{
        const buckets=new Map(),pairs=[];
        for(let i=0;i<items.length;i++){const q=items[i],bx=Math.floor(q.v.x*.5),by=Math.floor(q.v.y*H),key=bx+","+by;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i);}
        for(let i=0;i<items.length;i++){const q=items[i],bx=Math.floor(q.v.x*.5),by=Math.floor(q.v.y*H);for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++)for(const j of buckets.get((bx+ox)+","+(by+oy))||[])if(j>i)pairs.push([q,items[j]]);}
        return pairs;
    };
    for(let pass=0;pass<48;pass++){let changed=false;for(const[a,b]of nearbyPairs())if(solvePair(a,b))changed=true;if(!changed)break;}
}`;

// Wrappers are installed right after the file that defines each function, so
// later layers that wrap it (runtime-performance-v3 skips the check for pure
// vertical falls) call the comparison, and the function compared is that file's.
const WRAP = {
  "app-06.js": `(function(){const fast=visualSegmentSafe;visualSegmentSafe=function(g,id,ox,oy,nx,ny,minDist){
    const a=fast(g,id,ox,oy,nx,ny,minDist),b=__refVisualSegmentSafe(g,id,ox,oy,nx,ny,minDist);
    if(a!==b)throw new Error("visualSegmentSafe differs for ball "+id);__cmp.segment++;return a;};})();`,
  "app-07.js": `(function(){const fastWave=pileFlowWaveSafe;pileFlowWaveSafe=function(g,waveSegs,start,duration){
    const ref=__refPileFlowWaveSafe(g,waveSegs,start,duration),fast=fastWave(g,waveSegs,start,duration);
    if(ref!==fast)throw new Error("pileFlowWaveSafe differs at start "+start+": reference "+ref+", fast "+fast);__cmp.wave++;return fast;};
   const fastRing=ballInBalancedHexagonRing;ballInBalancedHexagonRing=function(b,x,y){
    const fast=fastRing(b,x,y),ref=__refBallInBalancedHexagonRing(b,x,y);
    if(ref!==fast)throw new Error("ballInBalancedHexagonRing differs at "+x+","+y);__cmp.ring++;return fast;};})();`,
  "app-08.js": "var __fastResolveVisualContacts08=resolveVisualContacts;"
};
const COMPARE_CONTACTS = `
function __compareContacts(g){
 const snap=[...g.vis].map(([id,v])=>[v,v.x,v.y]);
 __refResolveVisualContacts08(g);const ref=snap.map(([v])=>[v.x,v.y]);
 for(const [v,x,y] of snap){v.x=x;v.y=y;}
 __fastResolveVisualContacts08(g);
 snap.forEach(([v],i)=>{if(v.x!==ref[i][0]||v.y!==ref[i][1])throw new Error("app-08 contact solver differs: "+v.x+","+v.y+" vs "+ref[i]);});
 for(const [v,x,y] of snap){v.x=x;v.y=y;}
 __cmp.contacts++;
}`;

function side(seed) {
  const files = JSON.parse(/var AI_WORKER_FILES=(\[[\s\S]*?\]);/.exec(read("ai-worker.js"))[1]);
  const noop = () => {};
  const ctx = { console, performance: { now: () => Date.now() }, setTimeout: () => 0, clearTimeout: noop, navigator: {}, postMessage: noop };
  ctx.self = ctx; ctx.__sixBallAiWorkerBundled = true;
  vm.createContext(ctx);
  vm.runInContext(read("ai-worker.js"), ctx);
  vm.runInContext("var __cmp={wave:0,ring:0,segment:0,contacts:0};" + REFERENCE + COMPARE_CONTACTS, ctx);
  for (const f of files) {
    vm.runInContext(read(f), ctx, { filename: f });
    if (WRAP[f]) vm.runInContext(WRAP[f], ctx);
  }
  vm.runInContext(`window.__sixBallAiSyncMaxSims=6;window.__sixBallAiSyncBudgetMs=1e9;var __g=createEngine(${seed});__g.ai={level:5,target:null,thinkT:0,actT:0};`, ctx);
  return ctx;
}

const S = [side(7), side(7)], run = (c, s) => vm.runInContext(s, c), orbs = [];
let t = 0, step = 0;
while (t < SECONDS) {
  for (let i = 0; i < 2; i++) {
    const c = S[i];
    run(c, `if(__g.alive){__g.events.length=0;stepEngine(__g,PHYSICS_FRAME);}`);
    if (step % 6 === 0) run(c, `if(__g.state==="RESOLVING")__compareContacts(__g);`);
    const out = run(c, `(()=>{if(__g.sendBuffer>0||__g.sendShapes.length){const o={n:__g.sendBuffer,shapes:__g.sendShapes.splice(0)};__g.sendBuffer=0;return JSON.stringify(o);}return "";})()`);
    if (out) orbs.push({ to: 1 - i, at: t + .6, ...JSON.parse(out) });
  }
  for (let k = orbs.length - 1; k >= 0; k--) if (orbs[k].at <= t) {
    const o = orbs.splice(k, 1)[0];
    run(S[o.to], `(()=>{const o=${JSON.stringify(o)};if(o.shapes&&o.shapes.length)__g.incomingShapes.push(...o.shapes.filter(w=>WAZA[w]));else __g.incoming+=o.n;})()`);
  }
  t += 1 / 120; step++;
  if (!run(S[0], "__g.alive") || !run(S[1], "__g.alive")) break;
}
const counts = S.map(c => JSON.parse(run(c, "JSON.stringify(__cmp)")));
const total = k => counts.reduce((n, c) => n + c[k], 0);
assert(total("wave") >= 200, "too few pile-flow schedule checks to compare: " + JSON.stringify(counts));
assert(total("ring") >= 1000 && total("segment") >= 100 && total("contacts") >= 100, "too few calls compared: " + JSON.stringify(counts));
console.log("physics speed-up parity PASS", JSON.stringify({ seconds: +t.toFixed(1), counts }));
