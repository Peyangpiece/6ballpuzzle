const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"reference-fidelity-1000.js");
const tmpPath=path.join(__dirname,".reference-fidelity-1000-production-frame.js");
const source=fs.readFileSync(sourcePath,"utf8");

const oldFinish='function finishGarbage(seed,type,height){const g=createEngine(seed);flatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);let t=0;while(t<2.5){updateGarbagePacks(g,PHYSICS_FRAME);t+=PHYSICS_FRAME;if(g.activeGarbagePacks[0]?.landed)break;}const added=[];';
const newFinish='function finishGarbage(seed,type,height){const g=createEngine(seed);flatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);let t=0;while(t<2.5){updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);t+=PHYSICS_FRAME;if(g.activeGarbagePacks[0]?.landed)break;}const added=[];';

if(!source.includes(oldFinish)){
  throw new Error("reference-fidelity-1000 garbage completion loop changed; update the production-frame runner explicitly");
}

fs.writeFileSync(tmpPath,source.replace(oldFinish,newFinish));
try{
  cp.execFileSync(process.execPath,[tmpPath],{stdio:"inherit"});
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
