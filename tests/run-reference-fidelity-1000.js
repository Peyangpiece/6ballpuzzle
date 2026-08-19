const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"reference-fidelity-1000.js");
const tmpPath=path.join(__dirname,".reference-fidelity-1000-production-frame.js");
let source=fs.readFileSync(sourcePath,"utf8");

// This suite is a frozen capture-reference baseline for the canonical engine.
// Production policy adapters (ordinary garbage, clear-vacancy conservation,
// floor/wall rules) are validated separately by their dedicated regressions.
// Keep all 1000 reference samples intact; the only harness adjustment is to
// advance the canonical visual/contact integrator whenever a legacy packet is
// sampled after contact begins.
const oldStep='function stepGarbage(seed,type,height,dt,total){const g=createEngine(seed);flatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);let last=GARBAGE_START_Y,mono=true;while(g.garbageClock<total-1e-10){updateGarbagePacks(g,Math.min(dt,total-g.garbageClock));const p=g.activeGarbagePacks[0];if(p&&p.y+1e-9<last)mono=false;if(p)last=p.y;}return{g,p:g.activeGarbagePacks[0],mono};}';
const newStep='function stepGarbage(seed,type,height,dt,total){const g=createEngine(seed);flatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);let last=GARBAGE_START_Y,mono=true;while(g.garbageClock<total-1e-10){const h=Math.min(dt,total-g.garbageClock);updateGarbagePacks(g,h);updateVisuals(g,h);resolveVisualContacts(g);const p=g.activeGarbagePacks[0];if(p&&p.y+1e-9<last)mono=false;if(p)last=p.y;}return{g,p:g.activeGarbagePacks[0],mono};}';
const oldFinish='function finishGarbage(seed,type,height){const g=createEngine(seed);flatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);let t=0;while(t<2.5){updateGarbagePacks(g,PHYSICS_FRAME);t+=PHYSICS_FRAME;if(g.activeGarbagePacks[0]?.landed)break;}const added=[];';
const newFinish='function finishGarbage(seed,type,height){const g=createEngine(seed);flatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);let t=0;while(t<2.5){updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);t+=PHYSICS_FRAME;if(g.activeGarbagePacks[0]?.landed)break;}const added=[];';

if(!source.includes(oldStep))throw new Error("reference-fidelity-1000 garbage trajectory helper changed; update the reference runner explicitly");
if(!source.includes(oldFinish))throw new Error("reference-fidelity-1000 garbage completion loop changed; update the reference runner explicitly");
source=source.replace(oldStep,newStep).replace(oldFinish,newFinish);

fs.writeFileSync(tmpPath,source);
try{
  cp.execFileSync(process.execPath,[tmpPath],{stdio:"inherit"});
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
