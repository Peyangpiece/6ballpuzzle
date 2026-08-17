const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"movement-fidelity-100.js");
const tmpPath=path.join(__dirname,".movement-fidelity-100-production-frame.js");
let source=fs.readFileSync(sourcePath,"utf8");
const oldRuntime='const runtimeNames=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js"];';
const productionRuntime='const runtimeNames=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js","app-18.js","app-19.js","app-20.js","app-21.js"];';
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
