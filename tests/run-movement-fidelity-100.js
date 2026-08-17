const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"movement-fidelity-100.js");
const tmpPath=path.join(__dirname,".movement-fidelity-100-production-frame.js");
const indexPath=path.join(__dirname,"../public/index.html");
let source=fs.readFileSync(sourcePath,"utf8");

// Keep this focused movement suite on the exact app stack loaded by the live
// build. The previous fixed list stopped at app-21, so late contact/garbage
// corrections could bypass these 100 motion checks.
const productionNames=[...fs.readFileSync(indexPath,"utf8").matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
if(!productionNames.length||!productionNames.includes("app-01.js"))throw new Error("could not derive production app runtime from public/index.html");
const oldRuntime='const runtimeNames=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js"];';
const productionRuntime=`const runtimeNames=[${productionNames.map(n=>JSON.stringify(n)).join(",")}];`;
const oldSequence="updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);const balls=[];";
const productionSequence="updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);const balls=[];";

if(!source.includes(oldRuntime))throw new Error("movement fidelity runtime list changed; update production runner explicitly");
if(!source.includes(oldSequence))throw new Error("movement fidelity garbage frame sequence changed; update the production-frame runner explicitly");

source=source.replace(oldRuntime,productionRuntime).replace(oldSequence,productionSequence);
fs.writeFileSync(tmpPath,source);
try{
  cp.execFileSync(process.execPath,[tmpPath],{stdio:"inherit"});
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
