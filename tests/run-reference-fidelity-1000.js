const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"reference-fidelity-1000.js");
const tmpPath=path.join(__dirname,".reference-fidelity-1000-production-frame.js");
let source=fs.readFileSync(sourcePath,"utf8");

// This suite is a frozen capture-reference baseline for the canonical engine.
// Production policy adapters (ordinary garbage, clear-vacancy conservation,
// floor/wall rules) are validated separately by their dedicated regressions.
// Keep all 1000 reference samples intact and only advance visuals while a
// legacy reference garbage packet is completing contact.
const oldFinish='function finishGarbage(seed,type,height){const g=createEngine(seed);flatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);let t=0;while(t<2.5){updateGarbagePacks(g,PHYSICS_FRAME);t+=PHYSICS_FRAME;if(g.activeGarbagePacks[0]?.landed)break;}const added=[];';
const newFinish='function finishGarbage(seed,type,height){const g=createEngine(seed);flatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);let t=0;while(t<2.5){updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);t+=PHYSICS_FRAME;if(g.activeGarbagePacks[0]?.landed)break;}const added=[];';

if(!source.includes(oldFinish))throw new Error("reference-fidelity-1000 garbage completion loop changed; update the reference runner explicitly");
source=source.replace(oldFinish,newFinish);

fs.writeFileSync(tmpPath,source);
try{
  cp.execFileSync(process.execPath,[tmpPath],{stdio:"inherit"});
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
