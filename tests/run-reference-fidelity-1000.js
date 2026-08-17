const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"reference-fidelity-1000.js");
const tmpPath=path.join(__dirname,".reference-fidelity-1000-production-frame.js");
const indexPath=path.join(__dirname,"../public/index.html");
let source=fs.readFileSync(sourcePath,"utf8");

// The fidelity runner must execute the same app files, in the same order, as
// production. Derive that order from index.html so a future app-NN layer can
// never be deployed without also participating in the 1000-pass comparison.
const productionNames=[...fs.readFileSync(indexPath,"utf8").matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const app10Index=productionNames.indexOf("app-10.js");
if(app10Index<0||!productionNames.includes("app-01.js"))throw new Error("could not derive production app runtime from public/index.html");
const oldRuntime='"app-10.js","app-14.js","app-17.js"';
const productionRuntime=productionNames.slice(app10Index).map(n=>JSON.stringify(n)).join(",");
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
