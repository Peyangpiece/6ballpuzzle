const fs=require("fs");
const vm=require("vm");

const read=name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8");
const names=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js"];
const runtime=names.map(read).join("\n");
const app14=read("app-14.js"),app16=read("app-16.js");

const suite=String.raw`
const source14=${JSON.stringify(app14)},source16=${JSON.stringify(app16)};
const completed=[];
function expect(v,m){if(!v)throw new Error(m);}
function close(a,b,e=1e-7){return Math.abs(a-b)<=e;}
function ball(id,c=0){return{id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};}
function put(g,x,y,b){g.board[y][x]=b;setVis(g,b,x,y,0);return b;}
function active(seed){const g=createEngine(seed);spawn(g);return g;}
function flat(g,height,seed){let id=seed*1000;for(let y=ROWS-height;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y))put(g,x,y,ball(id++,(x+y+seed)%COLORS.length));}

function recorder(){
 let cur=null;
 return{segments:[],arcs:[],save(){},restore(){},beginPath(){cur=null;},moveTo(x,y){cur=[x,y];},lineTo(x,y){if(cur)this.segments.push([cur,[x,y]]);cur=[x,y];},arc(x,y,r){this.arcs.push([x,y,r]);},fill(){},stroke(){},closePath(){},set globalCompositeOperation(v){},set globalAlpha(v){},set strokeStyle(v){},set lineWidth(v){},set shadowColor(v){},set shadowBlur(v){},set fillStyle(v){}};
}
function effect(type,age,pointDown=false){
 const g=createEngine(700+age*100|0),pat=GARBAGE_SHAPES[type],ax=type==="STRAIGHT"?0:6,ay=ROWS-3,cells=pat.map(([x,y])=>[ax+x,ay+y]);
 g.fx.formations=[{w:type,cells,tint:WAZA[type].tint,life:WAZA[type].fx-age,max:WAZA[type].fx,pointDown}];
 const D=ME.D,ox=ME.X+(ME.BW-(W2-1)*D*.5)/2,oy=ME.Y+D/2,pos=(x,y)=>[ox+x*D*.5,oy+y*D*HEX_ROW_H],ctx=recorder();
 drawFormationEffects(ctx,g,pos,D);return ctx;
}
function garbageAt(seed,type,height,dt,total){const g=createEngine(seed);flat(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);while(g.garbageClock<total-1e-10)updateGarbagePacks(g,Math.min(dt,total-g.garbageClock));return g.activeGarbagePacks[0];}

// Round 1: 1000 capture-timing and visual-structure comparisons.
for(let i=0;i<1000;i++){
 const mode=i%10;
 if(mode===0)expect(close(READY_FADE_IN_DURATION,.38)&&close(READY_RULE_BEGIN,.38)&&close(READY_RULE_END,1.72)&&close(READY_START_BEGIN,2.12)&&close(READY_START_END,3.20)&&close(READY_DURATION,3.70),"round1 intro clock "+i);
 else if(mode===1)expect(source14.includes('q = g.state === "READY" ? null : g.queue[0]'),"round1 READY next window "+i);
 else if(mode===2)expect(source14.includes("cx=VW/2,cy=400")&&source14.includes('?56:42'),"round1 intro placement/scale "+i);
 else if(mode===3)expect(close(WAZA.STRAIGHT.fx,4.35)&&close(WAZA.PYRAMID.fx,4.05)&&close(WAZA.HEXAGON.fx,4.15),"round1 effect lifetime "+i);
 else if(mode===4){const q=effect("PYRAMID",.8,i&1),ys=q.segments.flat().map(p=>p[1]);expect(q.segments.length>=4&&Math.min(...ys)<=ME.Y+8&&Math.max(...ys)<ME.Y+ME.BH*.68,"round1 pyramid stage "+i);}
 else if(mode===5){const q=effect("HEXAGON",.8),ys=q.segments.flat().map(p=>p[1]);expect(q.segments.length>=21&&Math.min(...ys)<ME.Y&&Math.max(...ys)<ME.Y+ME.BH*.7,"round1 hex wireframe "+i);}
 else if(mode===6){const q=effect("STRAIGHT",.8);expect(q.segments.length>=2&&q.segments.some(([a,b])=>Math.hypot(b[0]-a[0],b[1]-a[1])>ME.D*9),"round1 straight dual trail "+i);}
 else if(mode===7){const p=effect("PYRAMID",3.75),h=effect("HEXAGON",3.75),s=effect("STRAIGHT",3.75);expect(p.arcs.length>=360&&h.arcs.length>=750&&s.arcs.length>=260,"round1 particle density "+i);}
 else if(mode===8)expect(RESULT_REVEAL_DELAY_MS===4250&&source16.includes("RESULT_REVEAL_DELAY_MS")&&source14.includes("phase>=3"),"round1 staged result "+i);
 else{const g=active(9000+i),sig=JSON.stringify(g.piece);g.matchFrozen=true;for(let n=0;n<60;n++)stepEngine(g,PHYSICS_FRAME);expect(JSON.stringify(g.piece)===sig&&g.state==="PLAYING","round1 winner freeze "+i);}
 completed.push(i+1);
}
console.log("reference convergence round 1 1000/1000 PASS");

// Round 2: expand to 2000 with active-piece, rigidity, pile, garbage and skill samples.
for(let i=0;i<1000;i++){
 const mode=i%5,seed=12000+i;
 if(mode===0){const g=active(seed),[lo,hi]=legalXRange(g),x=lo+(hi-lo)*((i%37)+.2)/37;setFreeX(g,x);updateVisuals(g,PHYSICS_FRAME);expect(close(g.freeX,x)&&close(g.pieceVX,x),"round2 continuous drag "+i);}
 else if(mode===1){const b=newBoard(),base=3+2*(i%6),gid=seed,bs=[0,1,2].map(r=>({id:seed*10+r,c:r,motionGroupId:gid,motionGroupRole:r,motionGroupOrientation:"down",motionGroupSize:3,rigid:true})),m=[{ball:bs[0],x:base,y:2,role:0},{ball:bs[1],x:base+2,y:2,role:1},{ball:bs[2],x:base+1,y:3,role:2}];m.forEach(v=>b[v.y][v.x]=v.ball);const p=hexPhysPlanGroup(b,m,false);expect(p.length===3&&p.every(v=>v.ty-v.y===2)&&bs.every(v=>v.rigid),"round2 rigid freefall "+i);}
 else if(mode===2){const g=createEngine(seed),rng=mulberry32(seed);let id=seed*30;for(let n=0;n<9+(i%9);n++){const y=(n%4)*2,xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!g.board[y][x])xs.push(x);if(xs.length)g.board[y][xs[(rng()*xs.length)|0]]=ball(id++,(n+i)%COLORS.length);}settleAll(g.board);expect(!hasLegalGravityMove(g.board)&&!boardHasIllegalFloat(g.board),"round2 pile equilibrium "+i);}
 else if(mode===3){const type=["PYRAMID","HEXAGON","STRAIGHT"][i%3],a=garbageAt(seed,type,i%5,1/30,.42+(i%9)*.03),b=garbageAt(seed,type,i%5,1/120,.42+(i%9)*.03);expect(a&&b&&close(a.y,b.y)&&close(a.vy,b.vy)&&a.y>=GARBAGE_START_Y,"round2 garbage trajectory "+i);}
 else{const pat=GARBAGE_SHAPES.PYRAMID,maxY=Math.max(...pat.map(v=>v[1])),src=i&1?pat:pat.map(([x,y])=>[x,maxY-y]);expect(classify(src)==="PYRAMID"&&effect(i%3===0?"STRAIGHT":i%3===1?"PYRAMID":"HEXAGON",1.1).segments.length>0,"round2 skill recognition "+i);}
 completed.push(1001+i);
}
console.log("reference convergence round 2 2000/2000 PASS");

// Round 3: expand to 3000 with network hand-off, settle chains and terminal stability.
for(let i=0;i<1000;i++){
 const mode=i%5,seed=22000+i;
 if(mode===0){const a=active(seed);setFreeX(a,SPAWN_X+((i%11)-5)*.08);a.dropT=a.dropInterval*((i%13)+1)/14;const p=pieceSnapshotOf(a),b=createEngine(seed+1);b.state="NET";applyRemoteVisualState(b,{piece:p,fx:{g:[]}});const x=b.pieceVX,y=b.piece.y+b.netPieceFrac;stepNetPieceMotion(b,1/60);expect(Number.isFinite(x)&&b.pieceVX===x&&b.piece.y+b.netPieceFrac>=y,"round3 network piece "+i);}
 else if(mode===1){const g=createEngine(seed);g.ai={level:1+(i%5),target:null,thinkT:0,actT:0};let last="",idle=0;for(let n=0;n<PHYSICS_HZ;n++){stepEngine(g,PHYSICS_FRAME);const sig=g.state+"|"+g.phase+"|"+g.ver+"|"+(g.piece?.y??"-");idle=sig===last?idle+1:0;last=sig;}expect(idle<PHYSICS_HZ&&g.physicsWatch.fallbacks===0,"round3 no stall "+i);}
 else if(mode===2){const g=createEngine(seed);flat(g,i%4,seed);g.garbShapes=[["PYRAMID","HEXAGON","STRAIGHT"][i%3]];prepareGarbageBatch(g);let t=0;while(t<2.5&&!g.activeGarbagePacks[0]?.landed){updateGarbagePacks(g,PHYSICS_FRAME);t+=PHYSICS_FRAME;}expect(g.activeGarbagePacks[0]?.landed&&t<2.1,"round3 garbage contact "+i);}
 else if(mode===3){const g=createEngine(seed);let id=seed*20;for(let y=-2;y<ROWS;y++)for(let x=0;x<W2;x++)if(valid(x,y)){const c=((2*x+y)%COLORS.length+COLORS.length)%COLORS.length,b=ball(id++,c);g.board[y][x]=b;noteBoardCell(g.board,y,b);}g.state="RESOLVING";g.phase="CHECK";g.garbDone=true;stepEngine(g,PHYSICS_FRAME);expect(g.state==="GAMEOVER"&&!g.alive,"round3 quiescent loss "+i);}
 else{const p=effect("PYRAMID",1.6,!!(i&1)),h=effect("HEXAGON",1.6),s=effect("STRAIGHT",1.6);expect(p.arcs.length>350&&h.arcs.length>740&&s.arcs.length>250&&drawFormationEffects.toString().includes("hexTurn"),"round3 animated skill trail "+i);}
 completed.push(2001+i);
}
expect(completed.length===3000,"convergence count changed");
globalThis.convergenceCount=completed.length;
console.log("reference convergence round 3 3000/3000 PASS");
`;

const context={
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
};
vm.runInNewContext(runtime+suite,context,{timeout:120000});
if(context.convergenceCount!==3000)throw new Error("reference convergence did not finish");
