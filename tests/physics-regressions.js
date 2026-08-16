const fs=require("fs");
const vm=require("vm");

const runtime=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js"]
  .map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const assertions=String.raw`
function expect(value,message){if(!value)throw new Error(message);}

// Capture-derived field and fall constants stay locked to the reference.
expect(W2===19&&ROWS===12&&SPAWN_X===9,"reference geometry: floor-wide 10/9 field changed");
expect(Array.from({length:W2},(_,x)=>x).filter(x=>valid(x,ROWS-1)).length===10,"reference geometry: odd floor level is not ten balls wide");
expect(Array.from({length:W2},(_,x)=>x).filter(x=>valid(x,ROWS-2)).length===9,"reference geometry: even second level is not nine balls wide");
expect(GARBAGE_SHAPES.STRAIGHT.filter(([,y])=>y===0).length===9&&GARBAGE_SHAPES.STRAIGHT.filter(([,y])=>y===1).length===10,"reference geometry: straight garbage rows have the wrong phase");
expect(pieceFits(newBoard(),{x:SPAWN_X,y:-2,rot:0,colors:[0,1,2]}),"reference geometry: centred spawn is outside the reversed lattice");
expect(Math.abs(REFERENCE_BALL_PX-63.4)<1e-9&&HARD_DROP_VISUAL_TIME===5/30,"reference fall timing changed");
{
 const pat=GARBAGE_SHAPES.PYRAMID,maxY=Math.max(...pat.map(([,y])=>y)),inverse=pat.map(([x,y])=>[x,maxY-y]);
 expect(classify(pat)==="PYRAMID"&&classify(inverse)==="PYRAMID","pyramid orientation: inverse pyramid did not trigger pyramid garbage");
}

// On an empty board, the first-level landing guide follows the continuous
// one-finger X instead of snapping back to the logical lattice column.
{
 const g=createEngine(18);g.state="PLAYING";g.piece={x:SPAWN_X,y:-2,rot:0,colors:[0,1,2]};g.pieceVX=SPAWN_X+.625;g.freeX=g.pieceVX;
 const logical=landingShadowCells(g),visual=landingShadowVisualCells(g),dx=g.pieceVX-g.piece.x;
 expect(logical&&visual&&visual.every((cell,i)=>Math.abs(cell[0]-logical[i][0]-dx)<1e-9),"first-level shadow: continuous horizontal offset was lost");
 expect(Math.abs(Math.max(...visual.map(([,y])=>cellCenterYNorm(y)))-FLOOR_CENTER_N)<1e-9,"first-level shadow: guide did not rest on the visible floor");
}

// Releasing a one-finger slide retains the exact real-valued X. Only lock()
// may commit that value to a legal lattice column.
{
 const g=createEngine(19);spawn(g);setFreeX(g,SPAWN_X+.6);updateVisuals(g,PHYSICS_FRAME);g.dragging=false;
 const exact=g.freeX;updateVisuals(g,PHYSICS_FRAME*4);
 expect(Math.abs(exact-(SPAWN_X+.6))<1e-9&&Math.abs(g.pieceVX-exact)<1e-9,"continuous slide: pointer release snapped the visual X");
}

// Every orientation reaches both outer lattice columns continuously. The
// logical anchor remains valid and is committed only when the piece locks.
for(let rot=0;rot<6;rot++){
 const left=createEngine(190+rot);left.state="PLAYING";left.piece={x:SPAWN_X,y:0,rot,colors:[0,1,2]};left.pieceVX=SPAWN_X;
 setFreeX(left,-100);updateVisuals(left,PHYSICS_FRAME);const leftCells=pieceCells(left.piece).map(([x])=>x+left.pieceVX-left.piece.x);
 expect(Math.abs(Math.min(...leftCells))<1e-9,"continuous wall range: rotation "+rot+" cannot reach the left edge");
 const right=createEngine(200+rot);right.state="PLAYING";right.piece={x:SPAWN_X,y:0,rot,colors:[0,1,2]};right.pieceVX=SPAWN_X;
 setFreeX(right,100);updateVisuals(right,PHYSICS_FRAME);const rightCells=pieceCells(right.piece).map(([x])=>x+right.pieceVX-right.piece.x);
 expect(Math.abs(Math.max(...rightCells)-(W2-1))<1e-9,"continuous wall range: rotation "+rot+" cannot reach the right edge");
}

// A disconnected fitting region beyond an occupied column is not reachable
// by a continuous drag. The visual X must stop with the logical piece.
{
 const g=createEngine(219);g.state="PLAYING";g.piece={x:SPAWN_X,y:0,rot:0,colors:[0,1,2]};g.pieceVX=SPAWN_X;
 const blocker={id:2190,c:4,motionGroupId:0,rigid:false};g.board[0][13]=blocker;
 const range=legalXRange(g);setFreeX(g,100);updateVisuals(g,PHYSICS_FRAME);
 expect(range[1]===SPAWN_X&&g.freeX===SPAWN_X&&g.pieceVX===SPAWN_X,"continuous obstacle range: drag crossed a blocked column");
}

// A wall contributes no support rigidity, but touching it alone must not break
// a freely falling triplet whose cells can still translate together.
{
 const b=newBoard(),balls=[0,1,2].map(i=>({id:200+i,c:i,motionGroupId:120,motionGroupRole:i,motionGroupOrientation:"down",motionGroupSize:3,rigid:true}));
 const members=[{ball:balls[0],x:1,y:2,role:0},{ball:balls[1],x:3,y:2,role:1},{ball:balls[2],x:2,y:3,role:2}];
 for(const m of members)b[m.y][m.x]=m.ball;
 const plan=hexPhysPlanGroup(b,members,false);
 expect(plan.length===3&&plan.every(p=>p.tx===p.x&&p.ty===p.y+2),"wall rigidity: wall blocked the triplet's free fall");
 expect(balls.every(ball=>ball.motionGroupId===120&&ball.rigid),"wall rigidity: wall touch broke an otherwise moving triplet");
}

// One-sided pile contact is a slope, not a rigidity-break event. All members
// follow translated arcs, retaining both orientation and pair distances.
{
 const b=newBoard(),balls=[0,1,2].map(i=>({id:210+i,c:i,motionGroupId:121,motionGroupRole:i,motionGroupOrientation:"down",motionGroupSize:3,rigid:true}));
 const members=[{ball:balls[0],x:7,y:2,role:0,orientation:"down"},{ball:balls[1],x:9,y:2,role:1,orientation:"down"},{ball:balls[2],x:8,y:3,role:2,orientation:"down"}];
 for(const m of members)b[m.y][m.x]=m.ball;b[4][9]={id:219,c:4,motionGroupId:0,rigid:false};
 const plan=hexPhysPlanGroup(b,members,false),before=[],mid=plan.map(p=>proposalPointAt(p,.5));
 for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){before.push(hexPhysDist(members[i].x,members[i].y,members[j].x,members[j].y));}
 const middle=[];for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)middle.push(Math.hypot(mid[i][0]-mid[j][0],mid[i][1]-mid[j][1]));
 expect(plan.length===3&&plan.every(p=>p.kind==="GROUP_SLOPE_TRANSLATE"&&p.tx-p.x===-1&&p.ty-p.y===1),"slope rigidity: triplet did not slide as one translated body");
 expect(middle.every((d,i)=>Math.abs(d-before[i])<1e-9),"slope rigidity: shape changed during the translated arc");
 expect(balls.every(ball=>ball.motionGroupId===121&&ball.rigid),"slope rigidity: ordinary slope contact released the triplet");
}

// Only the protruding pile ball centered between an upward triangle's lower
// members may tear it into a rigid pair and one independent ball.
{
 const b=newBoard(),balls=[0,1,2].map(i=>({id:220+i,c:i,motionGroupId:122,motionGroupRole:i,motionGroupOrientation:"up",motionGroupSize:3,rigid:true,momentumX:0}));
 const members=[{ball:balls[0],x:6,y:3,role:0,orientation:"up"},{ball:balls[1],x:7,y:4,role:1,orientation:"up"},{ball:balls[2],x:5,y:4,role:2,orientation:"up"}];
 for(const m of members)b[m.y][m.x]=m.ball;b[5][6]={id:229,c:4,motionGroupId:0,rigid:false};
 const plan=hexPhysPlanGroup(b,members,false);
 expect(plan.length===3,"convex split: upward triangle received no split motion");
 expect(balls[0].motionGroupId===122&&balls[2].motionGroupId===122&&balls[0].motionGroupSize===2&&balls[2].rigid,"convex split: opposite two-ball side lost its rigidity");
 expect(balls[1].motionGroupId===0&&!balls[1].rigid,"convex split: separated ball stayed constrained");
 const solo=plan.find(p=>p.ball.id===221);
 expect(plan.filter(p=>p.bundleId===122).every(p=>p.tx-p.x===-1)&&solo&&solo.tx-solo.x===1,"convex split: left/right separation was not produced");
}

// The upward-triangle split window is exactly the center 2/4 of its continuous
// base. Boundary contacts split; either outer quarter remains a rigid slope.
for(const [offset,expected,dir] of [[-.51,false,0],[-.5,true,-1],[-.4,true,-1],[0,true,-1],[.4,true,1],[.5,true,1],[.51,false,0]]){
 const b=newBoard(),balls=[0,1,2].map(i=>({id:240+i,c:i,motionGroupId:124,motionGroupRole:i,motionGroupOrientation:"up",motionGroupSize:3,rigid:true,momentumX:Math.sign(offset),impactOffsetX:offset}));
 const members=[{ball:balls[0],x:6,y:3,role:0,orientation:"up"},{ball:balls[1],x:7,y:4,role:1,orientation:"up"},{ball:balls[2],x:5,y:4,role:2,orientation:"up"}];
 for(const m of members)b[m.y][m.x]=m.ball;b[5][6]={id:249,c:4,motionGroupId:0,rigid:false};
 const motions=members.map(m=>hexPhysIndependentMemberMotion(b,members,m)),separator=hexPhysUpConvexSeparator(b,members,motions);
 expect(!!separator===expected,"convex range: offset "+offset+" received the wrong split decision");
 if(expected&&offset!==0)expect(separator.dir===dir,"convex range: offset "+offset+" split toward the wrong side");
}
{
 const g=createEngine(25);g.state="PLAYING";g.piece={x:9,y:0,rot:1,colors:[0,1,2]};g.pieceVX=9.4;g.freeX=9.4;
 lock(g,3);
 const released=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const ball=valid(x,y)?g.board[y][x]:null;if(ball?.motionGroupId)released.push(ball);}
 expect(released.length===3&&released.every(ball=>Math.abs(ball.impactOffsetX-.4)<1e-9),"convex range: continuous horizontal release offset was not preserved");
}

// Preview and application must use the same collision acceptance. A rejected
// proposal is not a legal move and cannot trap SETTLE in an endless loop.
{
 const b=newBoard(),ball={id:230,c:0,motionGroupId:0,rigid:false};b[0][5]=ball;
 const original=hexPhysBundleSafe;hexPhysBundleSafe=()=>false;
 expect(hasLegalGravityMove(b)===false,"gap freeze: preview reported a rejected move as legal");
 hexPhysBundleSafe=original;
}

// A hexagon hole is retained only when its two lower arch members are fully anchored.
{
 const b=newBoard(),pat=GARBAGE_SHAPES.HEXAGON,ax=1,baseY=ROWS-3;
 for(let i=0;i<pat.length;i++){const[x,y]=pat[i],ball={id:250+i,c:2,motionGroupId:0,rigid:false};b[baseY+y][ax+x]=ball;}
 expect(isBalancedHexagonCenterHole(b,ax+2,baseY+1),"balanced gap: floor-anchored hexagon was not recognized");
 expect(!boardHasIllegalFloat(b)&&!hasLegalGravityMove(b),"balanced gap: complete hexagon did not remain in equilibrium");
 expect(classify(findGroups(b)[0].cells)==="HEXAGON","balanced gap: hexagon formation was lost before clear");
}

// Crossing the visible limit does not lose during a drop; loss is decided at
// the quiescent CHECK checkpoint after all motion and chains are complete.
{
 const b=newBoard();for(let i=0;i<6;i++){const ball={id:300+i,c:3,motionGroupId:0,rigid:false};b[-2][1+i*2]=ball;noteBoardCell(b,-2,ball);}
 const groups=findGroups(b);
 expect(boardHasOverflow(b)&&groups.length===1&&classify(groups[0].cells)==="STRAIGHT","limit timing: balls above the line did not participate in formation clearing");
}
{
 const g=createEngine(20);g.state="PLAYING";g.piece={x:9,y:-2,rot:0,colors:[0,1,2]};g.pieceVX=9;g.pieceVY=-2;
 lock(g,3);
 expect(g.alive&&g.state==="RESOLVING","limit timing: locking above the line caused immediate defeat");
}
{
 const g=createEngine(21);let id=1000;
 for(let y=-2;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)){const ball={id:id,c:id++,motionGroupId:0,rigid:false};g.board[y][x]=ball;g.vis.set(ball.id,{x,y,vy:0,sq:0});}
 g.state="RESOLVING";g.phase="CHECK";g.garbDone=true;g.incoming=0;g.incomingShapes=[];
 stepEngine(g,PHYSICS_FRAME);
 expect(!g.alive&&g.state==="GAMEOVER","limit timing: quiescent overflow did not cause defeat");
}

// Garbage appears inside an expanding bubble before gravity starts.
{
 const g=createEngine(22);g.state="RESOLVING";g.phase="GARBAGE";g.garbShapes=["PYRAMID"];
 prepareGarbageBatch(g);updateGarbagePacks(g,.1);
 const p=g.activeGarbagePacks[0],startY=p.y;
 updateGarbagePacks(g,HEX_GARBAGE_BUBBLE_DURATION*.5);
 expect(p.y===startY&&p.bubbleT>0,"garbage bubble: pack fell before the bubble finished growing");
 updateGarbagePacks(g,HEX_GARBAGE_BUBBLE_DURATION);
 expect(p.y>startY,"garbage bubble: gravity did not start after the bubble pop");
}

// Pyramid and hexagon completion arm their shape-specific reference effects.
for(const [type,baseY] of [["PYRAMID",ROWS-3],["HEXAGON",ROWS-3]]){
 const g=createEngine(type==="PYRAMID"?23:24),pat=GARBAGE_SHAPES[type];
 const ax=type==="HEXAGON"?1:0;
 for(let i=0;i<pat.length;i++){const[x,y]=pat[i],ball=mkBall(g,1);g.board[baseY+y][ax+x]=ball;g.vis.set(ball.id,{x:ax+x,y:baseY+y,vy:0,sq:0});}
 g.state="RESOLVING";g.phase="CHECK";g.garbDone=true;
 stepEngine(g,PHYSICS_FRAME);
 const fx=g.fx.formations.find(f=>f.w===type);
 expect(g.phase==="CLEAR"&&fx,type+" effect: shape-specific animation was not armed");
 expect(fx.max===WAZA[type].fx&&fx.max>2.5,type+" effect: reference particle hold was shortened");
}

// Exactly one pinned member must be detached without changing the pair's id.
{
 const b=newBoard(),balls=[0,1,2].map(i=>({id:i+1,c:i,motionGroupId:77,motionGroupRole:i,motionGroupOrientation:"down",motionGroupSize:3,rigid:true}));
 const members=balls.map((ball,i)=>({ball,x:5+i*2,y:4,role:i,orientation:"down"}));
 for(const m of members)b[m.y][m.x]=m.ball;
 const original=hexPhysIndependentMemberMotion;
 hexPhysIndependentMemberMotion=(board,group,m)=>m.role===0?null:{x:m.x,y:m.y,tx:m.x,ty:m.y+2,ball:m.ball,kind:"FREE_FALL",pivot:null,topPivot:null,followSupportIds:[]};
 hexPhysTranslationSafe=()=>true;
 const plan=hexPhysPlanGroup(b,members,false);
 hexPhysIndependentMemberMotion=original;
 expect(plan.length===2,"pinned triplet: remaining pair did not keep moving");
 expect(balls[0].motionGroupId===0&&balls[0].rigid===false,"pinned triplet: fixed ball stayed rigid");
 expect(balls[1].motionGroupId===77&&balls[2].motionGroupId===77,"pinned triplet: pair lost original group");
 expect(balls[1].motionGroupSize===2&&balls[2].motionGroupSize===2&&balls[1].rigid&&balls[2].rigid,"pinned triplet: pair rigidity was not preserved");
}

// A stable accumulated group always has zero rigidity.
{
 const g=createEngine(1),y=ROWS-1;
 const balls=[0,1].map(i=>({id:100+i,c:i,motionGroupId:88,motionGroupRole:i,motionGroupOrientation:"down",motionGroupSize:2,rigid:true}));
 g.board[y][0]=balls[0];g.board[y][2]=balls[1];
 normalizeAllNonActivePileBalls(g);
 expect(balls.every(ball=>ball.motionGroupId===0&&ball.rigid===false),"pile rigidity: stable balls remained constrained");
}

// Garbage planning/materialization must never invoke the unbounded full solver.
{
 const g=createEngine(2);
 expect(!/settleAll\s*\(/.test(reserveGarbagePlan.toString()),"garbage planning contains settleAll");
 expect(!/settleAll\s*\(/.test(materializeGarbagePack.toString()),"garbage contact contains settleAll");
 const plan={type:"TEST",pat:[[0,0]],ax:0,targetY:ROWS-1,colors:[0],seq:0,y:GARBAGE_START_Y,vy:0,landed:false};
 const shadow=cloneBoardForGarbagePlan(g.board);
 reserveGarbagePlan(shadow,plan,-1);
 expect(materializeGarbagePack(g,plan),"garbage materialization failed");
 expect(HEX_GARBAGE_SHAPE_INTERVAL===0.5,"garbage interval is not 0.5 seconds");
 expect(!/GARBAGE_PACK_INTERVAL/.test(stepEngine.toString()),"garbage watchdog still references an undefined interval");
}

// Bubble-to-fall integration is invariant across capture and game frame rates.
{
 const run=dt=>{const g=createEngine(31);g.garbShapes=["PYRAMID"];prepareGarbageBatch(g);while(g.garbageClock<.8-1e-9)updateGarbagePacks(g,Math.min(dt,.8-g.garbageClock));return g.activeGarbagePacks[0];};
 const a=run(1/30),b=run(1/120);
 expect(Math.abs(a.y-b.y)<1e-9&&Math.abs(a.vy-b.vy)<1e-9,"garbage trajectory differs between 30fps and 120fps");
 expect(a.actualStartTime===0&&b.actualStartTime===0,"garbage first pack start drifted by one render frame");
}

// Consecutive free-fall segments carry velocity instead of restarting from rest.
{
 const g=createEngine(3),ball=mkBall(g,0),v={x:5,y:0,vy:0,motionSpeed:0,sq:0};
 g.board[2][5]=ball;g.vis.set(ball.id,v);
 ball.fallPath=[{from:[5,0],to:[5,2],pivot:null,topPivot:null,motionSeq:1,followSupportIds:[]}];
 const first=collectLiveMotionBatch(g),firstEnd=first.members[0].endState;
 v.vy=firstEnd.vy;v.motionSpeed=firstEnd.speed;
 ball.fallPath=[{from:[5,2],to:[5,4],pivot:null,topPivot:null,motionSeq:2,followSupportIds:[]}];
 const second=collectLiveMotionBatch(g);
 expect(second.members[0].duration<first.members[0].duration,"continuous fall: velocity restarted at lattice boundary");
}

// Render look-ahead for scheduled pile motion must be defined and finite.
{
 const g=createEngine(4),ball=mkBall(g,0);g.vis.set(ball.id,{x:4,y:0,vy:0,motionSpeed:0,sq:0});
 ball.fallPath=[{from:[4,0],to:[4,2],pivot:null,topPivot:null,motionSeq:1,followSupportIds:[],pileFlow:true,pileFlowStart:0,pileFlowDuration:.4,pileFlowEnd:.4,pileFlowStartVy:0,pileFlowNaturalDuration:.4}];
 const p=pileFlowPositionAt(g,ball,.2,0,null,new Map());
 expect(Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[1]>0&&p[1]<2,"pile render look-ahead returned an invalid position");
}

console.log("physics regressions PASS");
`;

vm.runInNewContext(runtime+assertions,{React:{useRef(){},useEffect(){},useState(){},useCallback(){}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date});
