const fs=require("fs");
const vm=require("vm");

const runtime=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js"]
  .map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const assertions=String.raw`
function expect(value,message){if(!value)throw new Error(message);}

// A wall contributes no support rigidity, but touching it alone must not break
// a freely falling triplet whose cells can still translate together.
{
 const b=newBoard(),balls=[0,1,2].map(i=>({id:200+i,c:i,motionGroupId:120,motionGroupRole:i,motionGroupOrientation:"down",motionGroupSize:3,rigid:true}));
 const members=[{ball:balls[0],x:0,y:2,role:0},{ball:balls[1],x:2,y:2,role:1},{ball:balls[2],x:1,y:3,role:2}];
 for(const m of members)b[m.y][m.x]=m.ball;
 const plan=hexPhysPlanGroup(b,members,false);
 expect(plan.length===3&&plan.every(p=>p.tx===p.x&&p.ty===p.y+2),"wall rigidity: wall blocked the triplet's free fall");
 expect(balls.every(ball=>ball.motionGroupId===120&&ball.rigid),"wall rigidity: wall touch broke an otherwise moving triplet");
}

// One-sided pile contact is a slope, not a rigidity-break event. All members
// follow translated arcs, retaining both orientation and pair distances.
{
 const b=newBoard(),balls=[0,1,2].map(i=>({id:210+i,c:i,motionGroupId:121,motionGroupRole:i,motionGroupOrientation:"down",motionGroupSize:3,rigid:true}));
 const members=[{ball:balls[0],x:6,y:2,role:0,orientation:"down"},{ball:balls[1],x:8,y:2,role:1,orientation:"down"},{ball:balls[2],x:7,y:3,role:2,orientation:"down"}];
 for(const m of members)b[m.y][m.x]=m.ball;b[4][8]={id:219,c:4,motionGroupId:0,rigid:false};
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
 const members=[{ball:balls[0],x:5,y:3,role:0,orientation:"up"},{ball:balls[1],x:6,y:4,role:1,orientation:"up"},{ball:balls[2],x:4,y:4,role:2,orientation:"up"}];
 for(const m of members)b[m.y][m.x]=m.ball;b[5][5]={id:229,c:4,motionGroupId:0,rigid:false};
 const plan=hexPhysPlanGroup(b,members,false);
 expect(plan.length===3,"convex split: upward triangle received no split motion");
 expect(balls[0].motionGroupId===122&&balls[2].motionGroupId===122&&balls[0].motionGroupSize===2&&balls[2].rigid,"convex split: opposite two-ball side lost its rigidity");
 expect(balls[1].motionGroupId===0&&!balls[1].rigid,"convex split: separated ball stayed constrained");
 const solo=plan.find(p=>p.ball.id===221);
 expect(plan.filter(p=>p.bundleId===122).every(p=>p.tx-p.x===-1)&&solo&&solo.tx-solo.x===1,"convex split: left/right separation was not produced");
}

// Preview and application must use the same collision acceptance. A rejected
// proposal is not a legal move and cannot trap SETTLE in an endless loop.
{
 const b=newBoard(),ball={id:230,c:0,motionGroupId:0,rigid:false};b[0][4]=ball;
 const original=hexPhysBundleSafe;hexPhysBundleSafe=()=>false;
 expect(hasLegalGravityMove(b)===false,"gap freeze: preview reported a rejected move as legal");
 hexPhysBundleSafe=original;
}

// A hexagon hole is retained only when its two lower arch members are fully anchored.
{
 const b=newBoard(),pat=GARBAGE_SHAPES.HEXAGON,ax=1;
 for(let i=0;i<pat.length;i++){const[x,y]=pat[i],ball={id:250+i,c:2,motionGroupId:0,rigid:false};b[10+y][ax+x]=ball;}
 expect(isBalancedHexagonCenterHole(b,3,11),"balanced gap: floor-anchored hexagon was not recognized");
 expect(!boardHasIllegalFloat(b)&&!hasLegalGravityMove(b),"balanced gap: complete hexagon did not remain in equilibrium");
 expect(classify(findGroups(b)[0].cells)==="HEXAGON","balanced gap: hexagon formation was lost before clear");
}

// Crossing the visible limit does not lose during a drop; loss is decided at
// the quiescent CHECK checkpoint after all motion and chains are complete.
{
 const b=newBoard();for(let i=0;i<6;i++){const ball={id:300+i,c:3,motionGroupId:0,rigid:false};b[-2][i*2]=ball;noteBoardCell(b,-2,ball);}
 const groups=findGroups(b);
 expect(boardHasOverflow(b)&&groups.length===1&&classify(groups[0].cells)==="STRAIGHT","limit timing: balls above the line did not participate in formation clearing");
}
{
 const g=createEngine(20);g.state="PLAYING";g.piece={x:10,y:-2,rot:0,colors:[0,1,2]};g.pieceVX=10;g.pieceVY=-2;
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
for(const [type,baseY] of [["PYRAMID",10],["HEXAGON",10]]){
 const g=createEngine(type==="PYRAMID"?23:24),pat=GARBAGE_SHAPES[type];
 const ax=type==="HEXAGON"?1:0;
 for(let i=0;i<pat.length;i++){const[x,y]=pat[i],ball=mkBall(g,1);g.board[baseY+y][ax+x]=ball;g.vis.set(ball.id,{x:ax+x,y:baseY+y,vy:0,sq:0});}
 g.state="RESOLVING";g.phase="CHECK";g.garbDone=true;
 stepEngine(g,PHYSICS_FRAME);
 expect(g.phase==="CLEAR"&&g.fx.formations.some(f=>f.w===type),type+" effect: shape-specific animation was not armed");
}

// Exactly one pinned member must be detached without changing the pair's id.
{
 const b=newBoard(),balls=[0,1,2].map(i=>({id:i+1,c:i,motionGroupId:77,motionGroupRole:i,motionGroupOrientation:"down",motionGroupSize:3,rigid:true}));
 const members=balls.map((ball,i)=>({ball,x:4+i*2,y:4,role:i,orientation:"down"}));
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
}

// Consecutive free-fall segments carry velocity instead of restarting from rest.
{
 const g=createEngine(3),ball=mkBall(g,0),v={x:4,y:0,vy:0,motionSpeed:0,sq:0};
 g.board[2][4]=ball;g.vis.set(ball.id,v);
 ball.fallPath=[{from:[4,0],to:[4,2],pivot:null,topPivot:null,motionSeq:1,followSupportIds:[]}];
 const first=collectLiveMotionBatch(g),firstEnd=first.members[0].endState;
 v.vy=firstEnd.vy;v.motionSpeed=firstEnd.speed;
 ball.fallPath=[{from:[4,2],to:[4,4],pivot:null,topPivot:null,motionSeq:2,followSupportIds:[]}];
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
