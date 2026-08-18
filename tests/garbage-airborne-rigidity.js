const fs=require("fs");
const vm=require("vm");
const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js",
  "app-garbage-contact.js","app-garbage-rigidity.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function close(a,b,e=1e-8){return Math.abs(a-b)<=e;}
function relSignature(pack){
 const pts=pack.pat.map(([dx,dy])=>[pack.ax+dx,pack.y+dy]);
 const out=[];
 for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++)out.push(hexPhysDist(pts[i][0],pts[i][1],pts[j][0],pts[j][1]));
 return out;
}

{
 const g=createEngine(93001);let id=900000;
 function put(x,y,c=0){const b={id:id++,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0,rigid:false};g.board[y][x]=b;setVis(g,b,x,y,0);return b;}
 put(5,7,0);put(4,8,1);put(6,8,2);put(3,9,3);put(7,9,4);
 const pack={
   type:"PYRAMID",seq:91,pat:[[0,0],[2,0],[-1,1],[1,1],[-2,2],[0,2]],
   colors:[0,1,2,3,4,0],ax:5,targetY:0,y:GARBAGE_START_Y,vy:10,
   landed:false,_started:true,actualStartTime:0,bubbleT:1,totalBalls:6,landedCount:0,entryBalls:[]
 };
 g.activeGarbagePacks=[pack];g.garbageClock=1;
 const beforePat=JSON.stringify(pack.pat),beforeColors=JSON.stringify(pack.colors);
 let first=Infinity;
 for(let i=0;i<pack.pat.length;i++)first=Math.min(first,hexGarbageBallContactY(g,pack,i));
 expect(Number.isFinite(first),"rigid fixture has no contact");

 pack.y=first-0.01;
 const sig0=relSignature(pack);
 const pre=materializeGarbageContactsThrough(g,pack,first-0.01);
 expect(pre===0,"garbage split before first pile contact");
 expect(!pack._pileContactStarted,"pile-contact state started too early");
 expect(JSON.stringify(pack.pat)===beforePat&&JSON.stringify(pack.colors)===beforeColors,"airborne rigid packet mutated before contact");
 const sig1=relSignature(pack);
 expect(sig0.length===sig1.length&&sig0.every((d,i)=>close(d,sig1[i])),"airborne garbage relative distances changed before contact");

 const released=materializeGarbageContactsThrough(g,pack,first+0.75);
 expect(pack._pileContactStarted===true,"first pile contact did not unlock lattice handoff");
 expect(close(pack.y,first,2e-6),"rigid garbage overshot its first pile contact: "+JSON.stringify({first,y:pack.y}));
 expect(released>=1,"first contact did not hand any garbage member to the lattice");
 expect(pack.pat.length<6,"contact did not release any member");

 // Any member that cannot enter the lattice on the first contact frame must be
 // held at the original contact anchor; a later free-flight desiredY must never
 // drag the unresolved remainder through the accumulated pile.
 if(pack.pat.length){
   const remain=pack.pat.length;
   materializeGarbageContactsThrough(g,pack,first+4);
   expect(pack.pat.length<=remain,"post-contact retry recreated garbage members");
   expect(close(pack.y,first,2e-6),"unresolved post-contact garbage continued below the pile contact anchor");
 }
}

for(const type of ["PYRAMID","HEXAGON","STRAIGHT"]){
 const g=createEngine(93010+type.length);g.garbShapes=[type];prepareGarbageBatch(g);
 const p=g.garbagePlans[0];
 let baseline=null,guard=0;
 while(!p._pileContactStarted&&guard++<720){
   updateGarbagePacks(g,PHYSICS_FRAME);
   if(p._pileContactStarted)break;
   if(p._started&&p.pat.length>1){
     const sig=relSignature(p);
     if(!baseline)baseline=sig;
     else expect(sig.length===baseline.length&&sig.every((d,i)=>close(d,baseline[i],2e-7)),type+" changed relative distances before pile contact");
   }
 }
 expect(p._pileContactStarted||p.landed,type+" never reached first rigid contact");
 if(p._pileContactStarted&&p.pat.length)expect(close(p.y,p._pileContactAnchorY,2e-6),type+" unresolved members crossed first-contact anchor");
}

console.log("garbage airborne rigidity until first pile contact PASS");
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
