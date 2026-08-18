const fs=require("fs");
const vm=require("vm");

const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-pile-arc.js","app-08.js","app-09.js","app-10.js","app-14.js",
  "app-17.js","app-garbage-normal-physics.js","app-garbage-presentation.js",
  "app-garbage-zero-rigidity.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function put(g,x,y,c=0,garbage=false){
 const b=mkBall(g,c);b.isGarbage=garbage;g.board[y][x]=b;noteBoardCell(g.board,y,b);setVis(g,b,x,y,0);return b;
}
expect(window.__hexGarbageSplitRigidityZero===true,"garbage zero-rigidity invariant missing");

// Canonical up-convex split: top + two lower balls meet a centred support.
// The ordinary core normally keeps the 2-ball side rigid after this 2+1 split;
// garbage must instead become three independent zero-rigidity balls.
const g=createEngine(77123);
const support=put(g,6,5,4,false);
const top=put(g,6,3,0,true),left=put(g,5,4,1,true),right=put(g,7,4,2,true);
const gid=901;
const members=[
 {ball:top,x:6,y:3,role:0,orientation:"up"},
 {ball:left,x:5,y:4,role:1,orientation:"up"},
 {ball:right,x:7,y:4,role:2,orientation:"up"}
];
for(const m of members){
 m.ball.motionGroupId=gid;m.ball.motionGroupRole=m.role;m.ball.motionGroupOrientation="up";
 m.ball.motionGroupSize=3;m.ball.rigid=true;
}
top.momentumX=-1;top.rollDir=-1;top.subCellBias=-1;
const plan=hexPhysPlanGroup(g.board,members,false);
expect(Array.isArray(plan)&&plan.length>0,"fixture did not produce a split plan");
for(const m of members){
 expect(m.ball.garbageSplitReleased===true,"split garbage was not marked independent: "+m.ball.id);
 expect(m.ball.rigid===false,"split garbage rigid remained true: "+m.ball.id);
 expect((m.ball.motionGroupId||0)===0,"split garbage kept motionGroupId: "+m.ball.id);
 expect((m.ball.motionGroupSize||0)===0,"split garbage kept motionGroupSize: "+m.ball.id);
}
for(const p of plan){
 if(!p.ball?.isGarbage)continue;
 expect((p.bundleId||0)===0,"split plan kept rigid bundle: "+p.ball.id);
 expect((p.groupSize||0)===0,"split plan kept rigid groupSize: "+p.ball.id);
}
expect(plan.some(p=>p.pivot||p.topPivot||(p.followSupportIds||[]).length),"contact arc/support geometry was removed with rigidity");

// Re-rigidification must be impossible after the split, even if another helper
// later tries to group two touching garbage balls.
const regroup=hexPhysSetGroup([members[0],members[1]],2,"up");
expect(regroup===0,"split garbage was allowed to form a rigid pair again");
expect(!top.rigid&&!left.rigid&&top.motionGroupId===0&&left.motionGroupId===0,"re-group attempt restored rigidity");

// A full, unsplit ordinary triplet remains untouched by the garbage-only rule.
const a=put(g,10,1,0,false),b=put(g,9,2,1,false),c=put(g,11,2,2,false);
const ordinaryGroup=hexPhysSetGroup([
 {ball:a,x:10,y:1,role:0,orientation:"up"},
 {ball:b,x:9,y:2,role:1,orientation:"up"},
 {ball:c,x:11,y:2,role:2,orientation:"up"}
],3,"up");
expect(ordinaryGroup>0&&a.rigid&&b.rigid&&c.rigid,"ordinary ball rigidity was changed by garbage invariant");

console.log("garbage post-split rigidity zero PASS",JSON.stringify({plan:plan.map(p=>({id:p.ball.id,kind:p.kind,bundle:p.bundleId||0,size:p.groupSize||0})),support:support.id}));
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
 setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
 document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});
