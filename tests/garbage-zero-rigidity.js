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

// Current authority: incoming garbage is released into ordinary single-ball
// physics immediately. Verify that production invariant directly instead of
// relying on an obsolete up-convex split fixture to manufacture the release.
const g=createEngine(77123);g.state="RESOLVING";g.phase="SETTLE";
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

// updateVisuals is wrapped by app-garbage-zero-rigidity. Its pre-pass must
// strip stale rigid metadata before motion/render processing can use it.
updateVisuals(g,0);
for(const m of members){
 expect(m.ball.garbageSplitReleased===true,"incoming garbage was not marked independent: "+m.ball.id);
 expect(m.ball.rigid===false,"incoming garbage rigid remained true: "+m.ball.id);
 expect((m.ball.motionGroupId||0)===0,"incoming garbage kept motionGroupId: "+m.ball.id);
 expect((m.ball.motionGroupSize||0)===0,"incoming garbage kept motionGroupSize: "+m.ball.id);
}

// Once released, no later grouping helper may recreate rigid pairs/groups.
const regroup=hexPhysSetGroup([members[0],members[1]],2,"up");
expect(regroup===0,"released garbage was allowed to form a rigid pair again");
expect(!top.rigid&&!left.rigid&&top.motionGroupId===0&&left.motionGroupId===0,"re-group attempt restored rigidity");

// Motion geometry is preserved while only rigid metadata is stripped.
top.fallPath=[{kind:"ROLL_LEFT",from:[6,3],to:[5,4],pivot:[4,4],bundleId:777,groupSize:2}];
top.garbageSplitReleased=true;
hexPhysSetGroup([members[0]],1,"up");
expect(top.fallPath[0].kind==="ROLL_LEFT"&&Array.isArray(top.fallPath[0].pivot),"garbage release removed motion geometry");
expect((top.fallPath[0].bundleId||0)===0&&(top.fallPath[0].groupSize||0)===0,"released garbage fallPath kept rigid metadata");

// Ordinary non-garbage triplets remain untouched by this garbage-only rule.
const a=put(g,10,1,0,false),b=put(g,9,2,1,false),c=put(g,11,2,2,false);
const ordinaryGroup=hexPhysSetGroup([
 {ball:a,x:10,y:1,role:0,orientation:"up"},
 {ball:b,x:9,y:2,role:1,orientation:"up"},
 {ball:c,x:11,y:2,role:2,orientation:"up"}
],3,"up");
expect(ordinaryGroup>0&&a.rigid&&b.rigid&&c.rigid,"ordinary ball rigidity was changed by garbage invariant");

console.log("garbage zero-rigidity current-authority PASS",JSON.stringify({released:members.map(m=>m.ball.id),ordinaryGroup}));
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Image:function(){this.complete=false;this.naturalWidth=0;},Math,Map,Set,WeakMap,Array,Number,Object,String,Boolean,JSON,Date,
 setTimeout(){return 0},clearTimeout(){},performance:{now(){return 0}},localStorage:{getItem(){return null},setItem(){}},
 document:{getElementById(){return null}},ResizeObserver:function(){this.observe=()=>{};this.disconnect=()=>{};}
},{timeout:120000});
