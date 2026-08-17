const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"reference-fidelity-1000.js");
const tmpPath=path.join(__dirname,".reference-fidelity-1000-production-frame.js");
let source=fs.readFileSync(sourcePath,"utf8");

const oldRuntime='"app-10.js","app-14.js","app-17.js"';
const productionRuntime='"app-10.js","app-14.js","app-17.js","app-18.js","app-19.js","app-20.js","app-21.js"';
const oldFinish='function finishGarbage(seed,type,height){const g=createEngine(seed);flatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);let t=0;while(t<2.5){updateGarbagePacks(g,PHYSICS_FRAME);t+=PHYSICS_FRAME;if(g.activeGarbagePacks[0]?.landed)break;}const added=[];';
const newFinish='function finishGarbage(seed,type,height){const g=createEngine(seed);flatBase(g,height,seed);g.garbShapes=[type];prepareGarbageBatch(g);let t=0;while(t<2.5){updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);t+=PHYSICS_FRAME;if(g.activeGarbagePacks[0]?.landed)break;}const added=[];';

if(!source.includes(oldRuntime))throw new Error("reference-fidelity-1000 runtime list changed; update production runner explicitly");
if(!source.includes(oldFinish))throw new Error("reference-fidelity-1000 garbage completion loop changed; update the production-frame runner explicitly");

source=source.replace(oldRuntime,productionRuntime).replace(oldFinish,newFinish);
fs.writeFileSync(tmpPath,source);
try{
  cp.execFileSync(process.execPath,[tmpPath],{stdio:"inherit"});
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
