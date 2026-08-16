const fs = require("fs");
const vm = require("vm");

const read = (name) => fs.readFileSync(`${__dirname}/../public/${name}`, "utf8");
const runtimeNames = [
  "app-01.js", "app-02.js", "app-03.js", "app-04.js", "app-05.js",
  "app-06.js", "app-07.js", "app-08.js", "app-09.js", "app-10.js",
  "app-14.js"
];
const runtime = runtimeNames.map(read).join("\n");

const checks = String.raw`
const results=[];
function check(id,name,value){if(!value)throw new Error(String(id).padStart(2,"0")+" "+name);results.push({id,name});}
const close=(a,b,e=1e-6)=>Math.abs(a-b)<=e;

check(1,"16:9 reference viewport",VW===1280&&VH===720);
check(2,"floor-up ten/nine alternating columns",W2===19&&Array.from({length:W2},(_,x)=>x).filter(x=>valid(x,ROWS-1)).length===10&&Array.from({length:W2},(_,x)=>x).filter(x=>valid(x,ROWS-2)).length===9);
check(3,"twelve visible lattice rows",ROWS===12);
check(4,"capture-derived ball diameter",close(REFERENCE_BALL_PX,63.4,1e-9));
check(5,"left field placement",close(ME.X,165)&&close(ME.Y,166)&&close(ME.BW,444));
check(6,"right field placement",close(FOE.X,671)&&close(FOE.Y,166)&&close(FOE.BW,444));
check(7,"equal player field scales",close(ME.D,FOE.D)&&close(ME.BH,FOE.BH));
check(8,"capture floor coordinate",close(ME.Y+ME.BH,611.7,.8));
check(9,"next frame 128 by 106",SOURCE_APP14.includes("const nw = 128, nh = 106"));
check(10,"reflective horizon coordinate",REFERENCE_HORIZON_Y===607);

{const g=createEngine(110);spawn(g);setFreeX(g,SPAWN_X+.63);updateVisuals(g,PHYSICS_FRAME);check(11,"real-valued horizontal drag",close(g.freeX,SPAWN_X+.63)&&close(g.pieceVX,g.freeX));}
check(12,"release retains real-valued X",SOURCE_CONTROLS.includes("if(Number.isFinite(g.freeX))g.pieceVX=g.freeX"));
check(13,"cancel retains real-valued X",SOURCE_CONTROLS.includes("Cancellation/visibility changes")&&!SOURCE_CONTROLS.includes("HTMLCanvasElement.prototype"));
check(14,"capture-derived natural fall",close(REFERENCE_FALL_PX_PER_SEC,36.239736692842548,1e-9));
check(15,"held fast-fall multiplier",close(FAST_DROP_MULTIPLIER,5.8));
check(16,"rotation is exactly sixty degrees",close(TAU/6,Math.PI/3));
check(17,"hard drop is five capture frames",close(HARD_DROP_VISUAL_TIME,5/30));
check(18,"landing alignment duration",close(LANDING_ALIGN_DURATION,4/60));
{const b=newBoard(),balls=[0,1,2].map(i=>({id:120+i,c:i,motionGroupId:12,motionGroupRole:i,motionGroupOrientation:"down",motionGroupSize:3,rigid:true})),m=[{ball:balls[0],x:1,y:2,role:0},{ball:balls[1],x:3,y:2,role:1},{ball:balls[2],x:2,y:3,role:2}];m.forEach(v=>b[v.y][v.x]=v.ball);const p=hexPhysPlanGroup(b,m,false);check(19,"wall adds zero rigidity",p.length===3&&balls.every(v=>v.rigid));}
{const b=newBoard(),balls=[0,1,2].map(i=>({id:130+i,c:i,motionGroupId:13,motionGroupRole:i,motionGroupOrientation:"down",motionGroupSize:3,rigid:true})),m=[{ball:balls[0],x:7,y:2,role:0,orientation:"down"},{ball:balls[1],x:9,y:2,role:1,orientation:"down"},{ball:balls[2],x:8,y:3,role:2,orientation:"down"}];m.forEach(v=>b[v.y][v.x]=v.ball);b[4][9]={id:139,c:4};const p=hexPhysPlanGroup(b,m,false);check(20,"slope keeps triplet rigidity",p.length===3&&p.every(v=>v.kind==="GROUP_SLOPE_TRANSLATE")&&balls.every(v=>v.rigid));}

{const g=createEngine(140),y=ROWS-1,b={id:140,c:1,motionGroupId:14,motionGroupRole:0,motionGroupOrientation:"down",motionGroupSize:1,rigid:true};g.board[y][0]=b;normalizeAllNonActivePileBalls(g);check(21,"settled pile rigidity is zero",!b.rigid&&!b.motionGroupId);}
{const b=newBoard(),balls=[0,1,2].map(i=>({id:150+i,c:i,motionGroupId:15,motionGroupRole:i,motionGroupOrientation:"up",motionGroupSize:3,rigid:true,impactOffsetX:-.5})),m=[{ball:balls[0],x:6,y:3,role:0,orientation:"up"},{ball:balls[1],x:7,y:4,role:1,orientation:"up"},{ball:balls[2],x:5,y:4,role:2,orientation:"up"}];m.forEach(v=>b[v.y][v.x]=v.ball);b[5][6]={id:159,c:4};const motions=m.map(v=>hexPhysIndependentMemberMotion(b,m,v));check(22,"centre-half split includes boundary",!!hexPhysUpConvexSeparator(b,m,motions));}
{const b=newBoard(),balls=[0,1,2].map(i=>({id:160+i,c:i,motionGroupId:16,motionGroupRole:i,motionGroupOrientation:"up",motionGroupSize:3,rigid:true,impactOffsetX:.51})),m=[{ball:balls[0],x:6,y:3,role:0,orientation:"up"},{ball:balls[1],x:7,y:4,role:1,orientation:"up"},{ball:balls[2],x:5,y:4,role:2,orientation:"up"}];m.forEach(v=>b[v.y][v.x]=v.ball);b[5][6]={id:169,c:4};const motions=m.map(v=>hexPhysIndependentMemberMotion(b,m,v));check(23,"outer quarter does not split",!hexPhysUpConvexSeparator(b,m,motions));}
{const b=newBoard(),balls=[0,1,2].map(i=>({id:170+i,c:i,motionGroupId:17,motionGroupRole:i,motionGroupOrientation:"down",motionGroupSize:3,rigid:true})),m=balls.map((ball,i)=>({ball,x:5+i*2,y:4,role:i,orientation:"down"}));m.forEach(v=>b[v.y][v.x]=v.ball);const oldMotion=hexPhysIndependentMemberMotion,oldSafe=hexPhysTranslationSafe;hexPhysIndependentMemberMotion=(board,group,v)=>v.role===0?null:{x:v.x,y:v.y,tx:v.x,ty:v.y+2,ball:v.ball,kind:"FREE_FALL",pivot:null,topPivot:null,followSupportIds:[]};hexPhysTranslationSafe=()=>true;const p=hexPhysPlanGroup(b,m,false);hexPhysIndependentMemberMotion=oldMotion;hexPhysTranslationSafe=oldSafe;check(24,"pinned member preserves rigid pair",p.length===2&&!balls[0].rigid&&balls[1].rigid&&balls[2].rigid&&balls[1].motionGroupSize===2);}
{const cells=GARBAGE_SHAPES.PYRAMID.map(v=>[v[0],v[1]]),maxY=Math.max(...cells.map(([,y])=>y)),inverse=cells.map(([x,y])=>[x,maxY-y]);check(25,"both pyramid orientations classify",classify(cells)==="PYRAMID"&&classify(inverse)==="PYRAMID");}
{const cells=GARBAGE_SHAPES.HEXAGON.map(v=>[v[0],v[1]]);check(26,"hexagon classification",classify(cells)==="HEXAGON");}
{const cells=Array.from({length:6},(_,i)=>[i*2,0]);check(27,"straight classification",classify(cells)==="STRAIGHT");}
{const b=newBoard(),pat=GARBAGE_SHAPES.HEXAGON,ay=ROWS-3,ax=1;pat.forEach(([x,y],i)=>b[ay+y][ax+x]={id:180+i,c:2});check(28,"balanced hexagon hole retained",isBalancedHexagonCenterHole(b,ax+2,ay+1));check(29,"balanced gap does not freeze",!boardHasIllegalFloat(b)&&!hasLegalGravityMove(b));}
check(30,"clear support release phase",close(CLEAR_SUPPORT_RELEASE_RATIO,.90));

check(31,"bubble growth duration",close(HEX_GARBAGE_BUBBLE_DURATION,.34));
check(32,"garbage shape cadence",close(HEX_GARBAGE_SHAPE_INTERVAL,.5));
check(33,"garbage path avoids full solver",!/settleAll\s*\(/.test(reserveGarbagePlan.toString())&&!/settleAll\s*\(/.test(materializeGarbagePack.toString()));
check(34,"pyramid hold timing",close(WAZA.PYRAMID.hold,1.25));
check(35,"capture-length formation afterimages",close(WAZA.STRAIGHT.fx,4.35)&&close(WAZA.PYRAMID.fx,4.05)&&close(WAZA.HEXAGON.fx,4.15));
check(36,"straight broad light blade",SOURCE_APP10.includes("D*1.34"));
check(37,"formation particle edges",SOURCE_APP10.includes("stable sparkling edge particles"));
check(38,"full 19-ring straight preview",SOURCE_APP10.includes("soloStraight?pat"));
check(39,"travelling attack rings",typeof drawAttackFlights==="function"&&SOURCE_APP14.includes("drawAttackFlights(ctx,orbs)"));
check(40,"skill atmosphere tint",SOURCE_APP10.includes("const active=[...(me?.fx?.formations||[])")&&SOURCE_APP10.includes("const wash=ctx.createRadialGradient"));

check(41,"match intro total timing",close(READY_FADE_IN_DURATION,.38)&&close(READY_RULE_BEGIN,.38)&&close(READY_DURATION,3.70));
{const human=createEngine(190),cpu=createEngine(191);cpu.ai={level:1};for(let i=0;i<60;i++){stepEngine(human,PHYSICS_FRAME);stepEngine(cpu,PHYSICS_FRAME);}check(42,"single human intro SE",human.events.filter(e=>e.t==="ready").length===1&&!cpu.events.some(e=>e.t==="ready"));}
check(43,"intro centred between fields",SOURCE_APP14.includes("cx=VW/2,cy=400"));
check(44,"defeat-to-result timing",close(RESULT_REVEAL_DELAY_MS,4250)&&SOURCE_APP16.includes("RESULT_REVEAL_DELAY_MS"));
{const g=createEngine(200);g.state="PLAYING";g.piece={x:9,y:-2,rot:0,colors:[0,1,2]};g.pieceVX=9;lock(g,3);check(45,"overflow deferred until equilibrium",g.alive&&g.state==="RESOLVING");}
{const a=createEngine(210);spawn(a);a.pieceVX=9.375;a.dropT=a.dropInterval*.4;a.fx.formations.push({w:"PYRAMID",cells:[[0,0]],tint:"#57FF7D",life:2,max:4.05});const p=pieceSnapshotOf(a),fx=remoteFxSnapshotOf(a),b=createEngine(211);b.state="NET";applyRemoteVisualState(b,{piece:p,fx});check(46,"remote active piece round-trip",b.piece&&close(b.pieceVX,9.375)&&b.piece.colors.join()==a.piece.colors.join());}
check(47,"network sends piece and technique",SOURCE_APP15.includes("piece:p.piece, fx:p.fx")&&SOURCE_APP16.includes("pieceSnapshotOf(me)"));
check(48,"mobile v7 owns input without prototype patch",SOURCE_CONTROLS.includes("__hexControlsV7Installed")&&!SOURCE_CONTROLS.includes("HTMLCanvasElement.prototype")&&SOURCE_APP16.includes("if(window.__hexControlsV7Installed)return"));
check(49,"measured SE spectral anchors",SOURCE_APP01.includes("2804,8933,11220")&&SOURCE_APP01.includes("9956")&&SOURCE_APP01.includes("5480"));
{const g=createEngine(220);g.ai={level:3,target:null,thinkT:0,actT:0};let last="",idle=0;for(let i=0;i<120*20&&g.alive;i++){stepEngine(g,PHYSICS_FRAME);const s=g.state+"|"+g.phase+"|"+g.ver+"|"+(g.piece?.y??"-");idle=s===last?idle+1:0;last=s;if(idle>120*8)break;}check(50,"20-second deterministic no-stall run",idle<=120*8&&g.physicsWatch.fallbacks===0);}

globalThis.referenceResults=results;
`;

const context = {
  React: { useRef() {}, useEffect() {}, useState() {}, useCallback() {}, createElement() {} },
  window: {}, navigator: {}, console, Math, Map, Set, Array, Number, Object,
  String, Boolean, JSON, Date,
  SOURCE_APP01: read("app-01.js"),
  SOURCE_APP02: read("app-02.js"),
  SOURCE_APP03: read("app-03.js"),
  SOURCE_APP10: read("app-10.js"),
  SOURCE_APP14: read("app-14.js"),
  SOURCE_APP15: read("app-15.js"),
  SOURCE_APP16: read("app-16.js"),
  SOURCE_CONTROLS: read("controls-v7.js"),
  SOURCE_PHYSICS: fs.readFileSync(`${__dirname}/physics-regressions.js`, "utf8")
};

vm.runInNewContext(runtime + checks, context, { timeout: 120000 });
if (context.referenceResults.length !== 50) throw new Error(`expected 50 checks, got ${context.referenceResults.length}`);
console.log(`reference fidelity ${context.referenceResults.length}/50 PASS`);
