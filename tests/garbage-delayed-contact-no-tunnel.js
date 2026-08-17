const fs=require("fs");
const vm=require("vm");

const barrierCode=fs.readFileSync(`${__dirname}/../public/app-38.js`,"utf8");
const harness=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
let updateGarbagePacks=function(g,dt){
  // Simulate the exact dangerous state produced by the production free-fall
  // integrator when materialization is deferred: the packet has analytically
  // advanced below its already-known continuous contact surface.
  for(const p of g.activeGarbagePacks||[]){
    p.y=Number(g.injectY);
    p.vy=Number(g.injectVy)||12;
  }
  return "base-update";
};
function hexGarbageBallContactY(g,pack,index){
  const c=g.contacts?.[index];
  return Number.isFinite(c)?c:Infinity;
}
`;
const assertions=String.raw`
function makePack(n=1){
  return{landed:false,pat:Array.from({length:n},(_,i)=>[i*2,0]),y:-6.2,vy:0};
}

// Wrapper integration: the real app-38 wrapper must run AFTER the dangerous
// free-fall update and retract the renderer-visible packet to first contact.
{
  const p=makePack(1);
  const g={activeGarbagePacks:[p],contacts:[5.25],injectY:7.4,injectVy:18,garbageClock:2};
  const result=updateGarbagePacks(g,1/30);
  expect(result==="base-update","app-38 changed wrapped update result");
  expect(p._hexContactClamped===true,"wrapper did not clamp delayed contact");
  expect(Math.abs(p.y-5.25)<1e-12,"wrapper left packet below contact surface");
  expect(p.vy===0,"wrapper left downward interpolation velocity");
  expect(p.contactY===5.25,"wrapper did not expose exact contact centre");
}

// 1000 varied overshoot cases, including multi-member packets. The earliest
// member contact is the barrier while the packet remains airborne. No amount
// of one-frame overshoot may survive to rendering/interpolation.
for(let i=0;i<1000;i++){
  const count=1+(i%6);
  const base=-2+(i%19)*.37;
  const contacts=Array.from({length:count},(_,j)=>base+j*.29+((i+j)%3)*.013);
  if(i%2)contacts.reverse();
  const barrier=Math.min(...contacts);
  const p=makePack(count);
  p.y=barrier+[1e-7,.0001,.01,.05,.2,.75,1.5,4][i%8];
  p.vy=1+(i%31);
  const g={activeGarbagePacks:[p],contacts,garbageClock:i/120};
  const didClamp=hexGarbageClampAirborneAtContact(g,p);
  expect(didClamp===true,"case "+i+": overshoot was not clamped");
  expect(p._hexContactClamped===true,"case "+i+": clamp marker missing");
  expect(Math.abs(p.y-barrier)<1e-12,"case "+i+": wrong contact barrier");
  expect(p.contactY===barrier,"case "+i+": contact metadata mismatch");
  expect(p.vy===0,"case "+i+": downward interpolation survived");
}

// Before contact, app-38 must not alter reference free fall.
for(let i=0;i<200;i++){
  const p=makePack(1),barrier=3+i*.01;
  p.y=barrier-.001-(i%5)*.02;p.vy=7;
  const g={activeGarbagePacks:[p],contacts:[barrier],garbageClock:i/120};
  const before=p.y;
  const didClamp=hexGarbageClampAirborneAtContact(g,p);
  expect(didClamp===false,"pre-contact case "+i+" was incorrectly clamped");
  expect(p.y===before&&p.vy===7,"pre-contact free fall was modified");
}

// Exactly-contacting centres must remain continuous, not be pushed or snapped.
for(let i=0;i<200;i++){
  const p=makePack(1),barrier=-1+i*.017;
  p.y=barrier;p.vy=5;
  const g={activeGarbagePacks:[p],contacts:[barrier],garbageClock:i/120};
  expect(hexGarbageClampAirborneAtContact(g,p)===false,"exact contact was treated as penetration");
  expect(p.y===barrier,"exact contact centre moved");
}

console.log("garbage delayed-contact no-tunnel 1000/1000 PASS");
`;

vm.runInNewContext(harness+barrierCode+assertions,{console,Math,Number,Array,Object,Map,Set},{timeout:5000});
