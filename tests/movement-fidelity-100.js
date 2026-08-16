const fs=require("fs");
const vm=require("vm");
const read=name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8");
const runtimeNames=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js"];
const runtime=runtimeNames.map(read).join("\n");

const assertions=String.raw`
const passed=[];
function check(id,name,value){if(!value)throw new Error(String(id).padStart(3,"0")+" "+name);passed.push({id,name});}
const close=(a,b,e=1e-6)=>Math.abs(a-b)<=e;
const finite=v=>Number.isFinite(v);
function active(seed=1){const g=createEngine(seed);spawn(g);return g;}
function put(b,x,y,id=900,c=4){const q={id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0};b[y][x]=q;return q;}
function splitFixture(offset,orientation="up"){
 const b=newBoard(),balls=[0,1,2].map(i=>({id:1000+i,c:i,motionGroupId:77,motionGroupRole:i,motionGroupOrientation:orientation,motionGroupSize:3,rigid:true,impactOffsetX:offset}));
 const members=orientation==="up"?[{ball:balls[0],x:6,y:3,role:0,orientation},{ball:balls[1],x:7,y:4,role:1,orientation},{ball:balls[2],x:5,y:4,role:2,orientation}]:[{ball:balls[0],x:5,y:3,role:0,orientation},{ball:balls[1],x:7,y:3,role:1,orientation},{ball:balls[2],x:6,y:4,role:2,orientation}];
 members.forEach(m=>b[m.y][m.x]=m.ball);put(b,6,5,1099);const motions=members.map(m=>hexPhysIndependentMemberMotion(b,members,m));
 return{b,balls,members,motions,info:hexPhysUpConvexSeparator(b,members,motions)};
}
function snapString(entries){const vals=VALID_CELLS.map(()=>0);for(const [x,y,c] of entries){const i=VALID_CELLS.findIndex(q=>q[0]===x&&q[1]===y);if(i>=0)vals[i]=c+1;}return vals.map(v=>String.fromCharCode(48+v)).join("");}

// 001-010: capture-derived natural fall and render continuity.
check(1,"reference ball diameter",close(REFERENCE_BALL_PX,63.4,1e-9));
check(2,"reference natural speed",close(REFERENCE_FALL_PX_PER_SEC,36.239736692842548,1e-9));
check(3,"active step geometry",close(REFERENCE_ACTIVE_STEP_PX,2*REFERENCE_BALL_PX*HEX_ROW_H));
check(4,"drop interval derived from capture",close(DROP_INTERVAL,REFERENCE_ACTIVE_STEP_PX/REFERENCE_FALL_PX_PER_SEC));
check(5,"fixed physics is 120 hertz",PHYSICS_HZ===120&&close(PHYSICS_FRAME,1/120));
{const g=active(5);g.dropT=0;check(6,"fall starts at zero fraction",close(activeDropFraction(g),0));}
{const g=active(6);g.dropT=g.dropInterval*.5;check(7,"fall midpoint is continuous",close(activeDropFraction(g),1));}
{const g=active(7);g.dropT=g.dropInterval*.999;check(8,"fall never overshoots a lattice step",activeDropFraction(g)<2&&activeDropFraction(g)>1.99);}
{const g=active(8);let last=-1,ok=true;for(let i=0;i<=40;i++){g.dropT=g.dropInterval*i/40;const q=activeDropFraction(g);if(q+1e-9<last)ok=false;last=q;}check(9,"natural fall samples are monotone",ok);}
{const g=active(9);const y=g.piece.y;for(let i=0;i<Math.ceil(g.dropInterval/PHYSICS_FRAME)+2;i++)stepEngine(g,PHYSICS_FRAME);check(10,"logical fall advances exactly two rows",g.piece.y===y+2);}

// 011-020: finger X, rotation and fast fall.
{const g=active(11);setFreeX(g,SPAWN_X+.637);check(11,"finger X remains real valued",close(g.freeX,SPAWN_X+.637));}
{const g=active(12);setFreeX(g,SPAWN_X+.637);updateVisuals(g,PHYSICS_FRAME);check(12,"render X follows finger one to one",close(g.pieceVX,g.freeX));}
{const g=active(13);setFreeX(g,-100);updateVisuals(g,PHYSICS_FRAME);const xs=pieceCells(g.piece).map(([x])=>x+g.pieceVX-g.piece.x);check(13,"finger X reaches outer left column",g.freeX===0&&close(Math.min(...xs),0));}
{const g=active(14);setFreeX(g,100);updateVisuals(g,PHYSICS_FRAME);const xs=pieceCells(g.piece).map(([x])=>x+g.pieceVX-g.piece.x);check(14,"finger X reaches outer right column",g.freeX===W2-3&&close(Math.max(...xs),W2-1));}
{const g=active(15);setFreeX(g,SPAWN_X+.49);check(15,"sub-cell X does not quantize the visual",close(g.pieceVX,SPAWN_X)&&close(g.freeX,SPAWN_X+.49));}
check(16,"pointer release preserves fractional X",SOURCE_CONTROLS.includes("Pointer release must not snap")&&SOURCE_CONTROLS.includes("g.pieceVX=g.freeX"));
{const g=active(17),r=g.piece.rot;check(17,"rotation advances sixty degrees",rotate(g,1)&&g.piece.rot===(r+1)%6);}
{const g=active(18);rotate(g,-1);check(18,"counter rotation advances minus sixty",g.piece.rot===5);}
check(19,"rotation capture duration",close(ROTATE_VISUAL_TIME,.10));
check(20,"held fast fall multiplier",close(FAST_DROP_MULTIPLIER,5.8));

// 021-030: hard drop and active-to-pile hand-off.
check(21,"hard drop uses capture-tracked constant speed on mobile",close(REFERENCE_HARD_DROP_PX_PER_FRAME,34.5)&&close(HARD_DROP_SPEED,REFERENCE_HARD_DROP_PX_PER_SEC/REFERENCE_BALL_PX)&&SOURCE_CONTROLS.includes("hardDrop(g)")&&!SOURCE_CONTROLS.includes("g.piece={...target}"));
{const g=active(22),target=dropPiece(g.board,g.piece);hardDrop(g);check(22,"hard drop records deepest target",g.hardDropAnim.target.y===target.y);}
{const g=active(23);hardDrop(g);const h=g.hardDropAnim,a=h.fromY,z=h.targetY,expected=(z-a)*HEX_ROW_H/HARD_DROP_SPEED;h.t=h.dur*.5;const p=pieceSnapshotOf(g);check(23,"hard drop midpoint and duration follow the measured path",close(h.dur,expected)&&p.f+a-g.piece.y>=a-g.piece.y&&p.f<=z-g.piece.y);}
check(24,"contact lock matches four 60fps frames",close(CONTACT_LOCK_DELAY,4/60));
check(25,"landing orientation align matches four 60fps frames",close(LANDING_ALIGN_DURATION,4/60));
{const g=active(26);g.piece={...g.piece,y:8};g.freeX=g.piece.x+.42;g.pieceVX=g.freeX;lock(g,3);const vs=[...g.vis.values()];check(26,"lock preserves fractional visual X",vs.length===3&&vs.every((v,i)=>close(v.x-pieceCells({x:SPAWN_X,y:8,rot:0,colors:[0,1,2]})[i][0],.42)));}
{const g=active(27);g.piece={...g.piece,y:8};g.freeX=g.piece.x-.38;lock(g,3);let ok=true;for(const [x,y] of VALID_CELLS){const b=g.board[y][x];if(b&&!close(b.impactOffsetX,-.38))ok=false;}check(27,"impact offset reaches every released ball",ok);}
{const g=active(28);g.piece={...g.piece,y:8};lock(g,3);const ids=new Set();for(const[x,y]of VALID_CELLS){const b=g.board[y][x];if(b)ids.add(b.motionGroupId);}check(28,"released triplet has one motion group",ids.size===1&&!ids.has(0));}
{const g=active(29);g.piece={...g.piece,y:8,rot:0};lock(g,3);let ok=true;for(const[x,y]of VALID_CELLS){const b=g.board[y][x];if(b&&b.motionGroupOrientation!=="down")ok=false;}check(29,"even rotation releases downward triangle",ok);}
{const g=active(30);g.piece={...g.piece,y:8,rot:1};lock(g,3);let ok=true;for(const[x,y]of VALID_CELLS){const b=g.board[y][x];if(b&&b.motionGroupOrientation!=="up")ok=false;}check(30,"odd rotation releases upward triangle",ok);}

// 031-040: rigidity release conditions.
{const f=splitFixture(0,"down");check(31,"ordinary down triangle is not convex split",!f.info);}
{const b=newBoard(),balls=[0,1,2].map(i=>({id:1200+i,c:i,motionGroupId:12,motionGroupRole:i,motionGroupOrientation:"down",motionGroupSize:3,rigid:true})),m=[{ball:balls[0],x:7,y:2,role:0},{ball:balls[1],x:9,y:2,role:1},{ball:balls[2],x:8,y:3,role:2}];m.forEach(v=>b[v.y][v.x]=v.ball);put(b,9,4,1299);const p=hexPhysPlanGroup(b,m,false);check(32,"slope keeps triplet rigid",p.length===3&&balls.every(q=>q.rigid));}
{const b=newBoard(),balls=[0,1,2].map(i=>({id:1300+i,c:i,motionGroupId:13,motionGroupRole:i,motionGroupOrientation:"down",motionGroupSize:3,rigid:true})),m=[{ball:balls[0],x:1,y:2,role:0},{ball:balls[1],x:3,y:2,role:1},{ball:balls[2],x:2,y:3,role:2}];m.forEach(v=>b[v.y][v.x]=v.ball);const p=hexPhysPlanGroup(b,m,false);check(33,"wall adds no break condition",p.length===3&&balls.every(q=>q.rigid));}
{const b=newBoard(),balls=[0,1,2].map(i=>({id:1400+i,c:i,motionGroupId:14,motionGroupRole:i,motionGroupOrientation:"down",motionGroupSize:3,rigid:true})),m=balls.map((ball,i)=>({ball,x:5+i*2,y:4,role:i}));m.forEach(v=>b[v.y][v.x]=v.ball);const om=hexPhysIndependentMemberMotion,os=hexPhysTranslationSafe;hexPhysIndependentMemberMotion=(bb,mm,v)=>v.role===0?null:{x:v.x,y:v.y,tx:v.x,ty:v.y+2,ball:v.ball,kind:"FREE_FALL",pivot:null,topPivot:null,followSupportIds:[]};hexPhysTranslationSafe=()=>true;const p=hexPhysPlanGroup(b,m,false);hexPhysIndependentMemberMotion=om;hexPhysTranslationSafe=os;check(34,"one pinned ball releases only itself",p.length===2&&!balls[0].rigid&&balls[1].rigid&&balls[2].rigid);}
{const g=createEngine(35),y=ROWS-1,b={id:1500,c:1,motionGroupId:15,motionGroupRole:0,motionGroupOrientation:"down",motionGroupSize:1,rigid:true};g.board[y][0]=b;normalizeAllNonActivePileBalls(g);check(35,"settled pile rigidity becomes zero",!b.rigid&&b.motionGroupId===0);}
{const f=splitFixture(0);const p=hexPhysUpConvexSplitPlan(f.b,f.members,f.info,false);check(36,"convex collision produces three motions",p&&p.length===3);}
{const f=splitFixture(0);hexPhysUpConvexSplitPlan(f.b,f.members,f.info,false);check(37,"convex split retains a rigid pair",f.balls.filter(q=>q.rigid).length===2);}
{const f=splitFixture(0);hexPhysUpConvexSplitPlan(f.b,f.members,f.info,false);check(38,"convex split releases one solo ball",f.balls.filter(q=>!q.rigid).length===1);}
check(39,"no legacy slope break flag",!SOURCE_PHYSICS.includes("forceSplit=true"));
check(40,"minimum physical separation is one diameter",HEX_MIN_DIST>=.999&&HEX_MIN_DIST<=1);

// 041-050: centre-half convex split window and direction.
{const f=splitFixture(-.5);check(41,"left centre-half boundary splits",!!f.info);}
{const f=splitFixture(.5);check(42,"right centre-half boundary splits",!!f.info);}
{const f=splitFixture(-.501);check(43,"left outer quarter stays rigid",!f.info);}
{const f=splitFixture(.501);check(44,"right outer quarter stays rigid",!f.info);}
{const f=splitFixture(-.5);check(45,"left-shift boundary maps to three-quarter fraction",close(f.info.hitFraction,.75));}
{const f=splitFixture(.5);check(46,"right-shift boundary maps to one-quarter fraction",close(f.info.hitFraction,.25));}
{const f=splitFixture(-.25);check(47,"support right of centre sends pair left",f.info.dir===-1);}
{const f=splitFixture(.25);check(48,"support left of centre sends pair right",f.info.dir===1);}
{const f=splitFixture(-.25);const p=hexPhysUpConvexSplitPlan(f.b,f.members,f.info,false);check(49,"split pair shares one bundle",p[0].bundleId===p[1].bundleId&&p[0].bundleId!==0);}
{const f=splitFixture(.25);const p=hexPhysUpConvexSplitPlan(f.b,f.members,f.info,false);check(50,"split solo is independent bundle",p.some(q=>q.bundleId===0));}

// 051-060: accumulated-ball free fall and velocity inheritance.
{const b=newBoard();put(b,5,0);const p=hexPhysNaturalMotion(b,5,0);check(51,"unsupported pile ball free-falls",p?.kind==="FREE_FALL");}
{const b=newBoard();put(b,5,0);const p=hexPhysNaturalMotion(b,5,0);check(52,"free fall advances two lattice rows",p.tx===5&&p.ty===2);}
{const seg={from:[4,0],to:[4,2],pivot:null,topPivot:null};const s={vy:0,speed:0},d=hexMotionDuration(seg,s);check(53,"rest fall duration follows gravity",close(d,Math.sqrt(2*(2*HEX_ROW_H)/GRAV)));}
{const seg={from:[4,0],to:[4,2],pivot:null,topPivot:null},a=hexMotionDuration(seg,{vy:0,speed:0}),b=hexMotionDuration(seg,{vy:5,speed:5});check(54,"inherited velocity shortens next fall",b<a);}
{const seg={from:[4,0],to:[4,2],pivot:null,topPivot:null},s={vy:0,speed:0},d=hexMotionDuration(seg,s),p=liveSegPoint(seg,.5,{vy:0},d);check(55,"free fall midpoint is accelerated",p[1]<1);}
{const seg={from:[4,0],to:[3,1],pivot:null,topPivot:[4,2]},v0=4,s={vy:v0,speed:v0},d=hexMotionDuration(seg,s),fallDist=2*HEX_ROW_H-1,ft=(-v0+Math.sqrt(v0*v0+2*GRAV*fallDist))/GRAV,t=ft*.5/d,p=liveSegPoint(seg,t,{vy:v0},d),expect=(v0*ft*.5+.5*GRAV*(ft*.5)**2)/HEX_ROW_H;check(56,"top contact samples inherited velocity",close(p[1],expect,1e-5));}
{const seg={from:[4,0],to:[4,2],pivot:null,topPivot:null},s={vy:0,speed:0};hexMotionDuration(seg,s);const d2=hexMotionDuration({from:[4,2],to:[4,4],pivot:null,topPivot:null},s);check(57,"consecutive fall carries exit velocity",d2<Math.sqrt(4*HEX_ROW_H/GRAV));}
{const seg={from:[4,0],to:[4,2],pivot:null,topPivot:null};let last=-1,ok=true;for(let i=0;i<=20;i++){const p=liveSegPoint(seg,i/20);if(p[1]<last-1e-9)ok=false;last=p[1];}check(58,"pile fall path is monotone",ok);}
check(59,"renderer forbids upward correction",SOURCE_VISUAL.includes("if(v.y < visualOldY - 1e-9)"));
check(60,"released ball has measured initial velocity",close(RELEASE_INITIAL_VY,3.788971974109861,1e-9));

// 061-070: slope roll and geometric collision.
{const b=newBoard();put(b,5,4,1600);put(b,6,5,1601);check(61,"right support rolls ball left",hexPhysNaturalMotion(b,5,4)?.kind==="ROLL_LEFT");}
{const b=newBoard();put(b,5,4,1700);put(b,4,5,1701);check(62,"left support rolls ball right",hexPhysNaturalMotion(b,5,4)?.kind==="ROLL_RIGHT");}
{const seg={from:[4,4],to:[3,5],pivot:[5,5],topPivot:null};let ok=true;for(let i=0;i<=20;i++){const p=liveSegPoint(seg,i/20);if(!close(hexPhysDist(p[0],p[1],5,5),1,2e-6))ok=false;}check(63,"roll follows constant-radius arc",ok);}
check(64,"roll speed is capture-calibrated",close(SLIDE_SPEED,(Math.PI/3)/(5/30)));
check(65,"sixty-degree slide lasts five frames",close((Math.PI/3)/SLIDE_SPEED,5/30));
{const seg={from:[4,4],to:[3,5],pivot:[5,5],topPivot:null},s={vy:0,speed:0};check(66,"pivot duration uses constant angular speed",close(hexMotionDuration(seg,s),Math.PI/3/SLIDE_SPEED));}
{const seg={from:[4,0],to:[3,1],pivot:null,topPivot:[4,2]},s={vy:3,speed:3},d=hexMotionDuration(seg,s);check(67,"fall-to-arc path has finite duration",finite(d)&&d>0);}
{const b=newBoard(),balls=[0,1,2].map(i=>({id:1800+i,c:i,motionGroupId:18,motionGroupRole:i,motionGroupOrientation:"down",motionGroupSize:3,rigid:true})),m=[{ball:balls[0],x:7,y:2,role:0},{ball:balls[1],x:9,y:2,role:1},{ball:balls[2],x:8,y:3,role:2}];m.forEach(v=>b[v.y][v.x]=v.ball);put(b,9,4,1899);const p=hexPhysPlanGroup(b,m,false);check(68,"rigid slope translates all three equally",p.length===3&&p.every(q=>q.tx-q.x===p[0].tx-p[0].x&&q.ty-q.y===p[0].ty-p[0].y));}
{const a={x:4,y:0,tx:4,ty:2,ball:{id:1}},b={x:4,y:2,tx:4,ty:0,ball:{id:2}},support={x:4,y:4,tx:5,ty:5,kind:"ROLL_RIGHT",pivot:[3,5]},follow={x:5,y:3,tx:6,ty:4,kind:"FOLLOW_SUPPORT",followProposal:support};let contact=true;for(let i=0;i<=20;i++){const p=proposalPointAt(support,i/20),q=proposalPointAt(follow,i/20);if(!close(Math.hypot(p[0]-q[0],p[1]-q[1]),1,2e-6))contact=false;}check(69,"swept paths detect overlap and followers preserve contact",proposalsSweepOverlap(a,b)&&contact);}
{const g=createEngine(70),a=mkBall(g,0),b=mkBall(g,1);g.vis.set(a.id,{x:0,y:0});g.vis.set(b.id,{x:2,y:0});const support={cell:{id:2},seg:{from:[4,4],to:[5,5],kind:"ROLL_RIGHT",pivot:[3,5]},duration:1},follow={cell:{id:1},seg:{from:[5,3],to:[6,4],kind:"FOLLOW_SUPPORT",followSupportIds:[2]},duration:1},batch={byId:new Map([[1,follow],[2,support]])};let contact=true;for(let i=0;i<=20;i++){const memo=new Map(),p=liveBatchPointAt(batch,support,i/20,null,memo),q=liveBatchPointAt(batch,follow,i/20,null,memo);if(!close(hexPhysDist(p[0],p[1],q[0],q[1]),1,2e-6))contact=false;}check(70,"one-diameter visual placement and moving support contact stay legal",visualPointSafe(g,a.id,0,0)&&contact);}

// 071-080: equilibrium, holes and parity.
{const b=newBoard(),pat=GARBAGE_SHAPES.HEXAGON,ay=ROWS-3,ax=1;pat.forEach(([x,y],i)=>put(b,ax+x,ay+y,1900+i,2));check(71,"balanced hexagon centre hole is recognized",isBalancedHexagonCenterHole(b,ax+2,ay+1));}
{const b=newBoard(),pat=GARBAGE_SHAPES.HEXAGON,ay=ROWS-3,ax=1;pat.forEach(([x,y],i)=>put(b,ax+x,ay+y,2000+i,2));check(72,"intentional hexagon hole is retained",boardHasIntentionalHexagonHole(b));}
{const b=newBoard(),pat=GARBAGE_SHAPES.HEXAGON,ay=ROWS-5,ax=1;pat.forEach(([x,y],i)=>put(b,ax+x,ay+y,2100+i,2));check(73,"unanchored ring is not balanced",!isBalancedHexagonCenterHole(b,ax+2,ay+1));}
{const b=newBoard();put(b,0,ROWS-1,2200);check(74,"floor ball is stable",!hasLegalGravityMove(b));}
{const b=newBoard(),q=put(b,0,ROWS-1,2300);q.equilibriumLocked=true;clearBoardEquilibriumLocks(b);check(75,"collision equilibrium lock clears",!q.equilibriumLocked);}
{const b=newBoard(),y=ROWS-2,x=(y&1)?10:11;put(b,x,y,2400);const p=hexPhysNaturalMotion(b,x,y);check(76,"bottom parity bridge reaches floor",p?.kind==="FLOOR_DROP"&&p.ty===ROWS-1);}
{const b=newBoard(),y=ROWS-2,x=(y&1)?4:5;put(b,x,y,2500);const p=hexPhysNaturalMotion(b,x,y);check(77,"bottom parity bridge works away from centre",p?.kind==="FLOOR_DROP");}
check(78,"floor centre matches visible board",close(FLOOR_CENTER_N,BOARD_TOP_CENTER_N+(ROWS-1)*HEX_ROW_H));
{const g=createEngine(79),q=put(g.board,0,ROWS-1,2600);q.motionGroupId=9;q.motionGroupSize=3;q.rigid=true;normalizeAllNonActivePileBalls(g);check(79,"all accumulated balls shed constraints",q.motionGroupId===0&&!q.rigid);}
{const b=newBoard();for(let y=0;y<ROWS;y+=2)put(b,(y&1)?8:9,y,2700+y);settleAll(b);check(80,"bounded settle terminates without floats",!boardHasIllegalFloat(b));}

// 081-090: garbage bubble, cadence, fall and opponent rendering.
check(81,"garbage shapes start every half second",close(HEX_GARBAGE_SHAPE_INTERVAL,.5));
check(82,"garbage bubble grows for 0.34 seconds",close(HEX_GARBAGE_BUBBLE_DURATION,.34));
check(83,"bubble pop has finite 0.14-second tail",close(HEX_GARBAGE_BUBBLE_POP_DURATION,.14));
{const g=createEngine(84);g.garbShapes=["PYRAMID"];prepareGarbageBatch(g);updateGarbagePacks(g,.01);check(84,"first garbage pack starts without batch stall",g.activeGarbagePacks.length===1&&g.activeGarbagePacks[0]._started);}
{const g=createEngine(85);g.garbShapes=["PYRAMID"];prepareGarbageBatch(g);updateGarbagePacks(g,.1);const p=g.activeGarbagePacks[0],y=p.y;updateGarbagePacks(g,.2);check(85,"garbage does not fall inside bubble",close(p.y,y));}
{const g=createEngine(86);g.garbShapes=["PYRAMID"];prepareGarbageBatch(g);updateGarbagePacks(g,.01);const p=g.activeGarbagePacks[0];updateGarbagePacks(g,.4);let n=0,moving=0;for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b?.isGarbage){n++;if(b.fallPath?.length)moving++;}}check(86,"garbage enters at top and falls independently after bubble",p.landed&&n===GARBAGE_SHAPES.PYRAMID.length&&moving>0);}
{let min=Infinity,up=0;for(const type of ["PYRAMID","HEXAGON","STRAIGHT"]){const g=createEngine(87);g.garbShapes=[type];prepareGarbageBatch(g);const last=new Map();for(let i=0;i<600;i++){updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);const balls=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?g.board[y][x]:null,v=q&&g.vis.get(q.id);if(q?.isGarbage&&v)balls.push([q,v]);}for(const[q,v]of balls){const p=last.get(q.id);if(p!=null&&v.y<p-1e-8)up++;last.set(q.id,v.y);}for(let a=0;a<balls.length;a++)for(let b=a+1;b<balls.length;b++){const va=balls[a][1],vb=balls[b][1];min=Math.min(min,hexPhysDist(va.x,va.y,vb.x,vb.y));}}}check(87,"garbage motion is monotone and never overlaps",up===0&&min>=HEX_MIN_DIST);}
{const g=createEngine(88),plan={type:"TEST",pat:[[0,0]],ax:0,targetY:ROWS-1,colors:[0],seq:0,y:GARBAGE_START_Y,vy:0,landed:false};check(88,"garbage materializes at legal anchor",materializeGarbagePack(g,plan)&&!!g.board[ROWS-1][0]);}
{const g=createEngine(89),plan={type:"TEST",pat:[[0,0]],ax:0,targetY:ROWS-1,colors:[0],seq:0,y:GARBAGE_START_Y,vy:0,landed:false};materializeGarbagePack(g,plan);const q=g.board[ROWS-1][0];check(89,"garbage loses spawn-shape rigidity on contact",q.motionGroupId===0&&!q.rigid);}
{const g=createEngine(90);g.activeGarbagePacks=[{type:"PYRAMID",seq:0,pat:[[0,0]],ax:4,y:-2,vy:0,bubbleT:.1,colors:[2],_started:true,landed:false}];check(90,"network snapshot includes moving garbage",remoteFxSnapshotOf(g).g.length===1);}

// 091-100: network interpolation, mobile source and long-run regressions.
{const g=active(91),p=pieceSnapshotOf(g);check(91,"piece packet carries fall state and speed",p.m===1&&p.s===1);}
{const a=active(92),p=pieceSnapshotOf(a),g=createEngine(920);g.state="NET";applyRemoteVisualState(g,{piece:p,fx:{g:[]}});check(92,"first remote piece packet is exact",close(g.pieceVX,p.vx)&&close(g.piece.y+g.netPieceFrac,p.y+p.f));}
{const a=active(93),g=createEngine(930);g.state="NET";const p=pieceSnapshotOf(a);applyRemoteVisualState(g,{piece:p,fx:{g:[]}});const before=g.piece.y+g.netPieceFrac;applyRemoteVisualState(g,{piece:{...p,f:p.f+.2},fx:{g:[]}});check(93,"second remote packet causes no coordinate jump",close(g.piece.y+g.netPieceFrac,before));}
{const a=active(94),g=createEngine(940);g.state="NET";const p=pieceSnapshotOf(a);applyRemoteVisualState(g,{piece:p,fx:{g:[]}});applyRemoteVisualState(g,{piece:{...p,f:p.f+.2},fx:{g:[]}});const y=g.piece.y+g.netPieceFrac;stepNetPieceMotion(g,.05);check(94,"remote active ball interpolates every frame",g.piece.y+g.netPieceFrac>y);}
{const a=active(95),g=createEngine(950);g.state="NET";const p=pieceSnapshotOf(a);applyRemoteVisualState(g,{piece:p,fx:{g:[]}});applyRemoteVisualState(g,{piece:{...p,f:.2,m:1},fx:{g:[]}});check(95,"remote target includes one snapshot of fall lead",g.netPieceTargetY>p.y+.2);}
{const g=createEngine(96),q=put(g.board,5,0,3000,2);setVis(g,q,5,0,0);applySnapshot(g,snapString([[5,2,2]]));const moved=g.board[2][5],v=g.vis.get(moved.id);check(96,"remote pile reuses identity and old visual position",moved.id===q.id&&close(v.y,0));}
{const g=createEngine(97);g.state="NET";g.piece={x:9,y:0,rot:0,colors:[0,1,2]};g.pieceVX=9.4;g.netPieceFrac=.3;applySnapshot(g,snapString([[9,4,0],[11,4,1],[10,5,2]]));const q=g.board[4][9],v=g.vis.get(q.id);check(97,"remote active-to-pile handoff preserves sub-cell X",close(v.x,9.4));}
{const g=createEngine(98);g.state="NET";applyRemoteVisualState(g,{piece:null,fx:{g:[{type:"PYRAMID",seq:0,pat:[[0,0]],ax:4,y:-2,vy:0,bubbleT:.4,colors:[1]}]}});const y=g.activeGarbagePacks[0].y;stepNetGarbageMotion(g,.05);check(98,"remote garbage continues falling between packets",g.activeGarbagePacks[0].y>y);}
{const g=createEngine(99);g.ai={level:3,target:null,thinkT:0,actT:0};let last="",idle=0;for(let i=0;i<120*30&&g.alive;i++){stepEngine(g,PHYSICS_FRAME);const s=g.state+"|"+g.phase+"|"+g.ver+"|"+(g.piece?.y??"-");idle=s===last?idle+1:0;last=s;if(idle>120*8)break;}check(99,"thirty-second ball-motion run does not freeze",idle<=120*8&&g.physicsWatch.fallbacks===0);}
check(100,"all one hundred movement passes completed",passed.length===99);
globalThis.movementResults=passed;
`;

const context={
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date,
 SOURCE_CONTROLS:read("controls-v7.js"),SOURCE_PHYSICS:read("app-02.js")+read("app-03.js"),SOURCE_VISUAL:read("app-08.js")
};
vm.runInNewContext(runtime+assertions,context,{timeout:120000});
if(context.movementResults.length!==100)throw new Error(`expected 100 checks, got ${context.movementResults.length}`);
console.log(`movement fidelity ${context.movementResults.length}/100 PASS`);
