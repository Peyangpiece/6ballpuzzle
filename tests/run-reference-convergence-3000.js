const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"reference-convergence-3000.js");
const tmpPath=path.join(__dirname,".reference-convergence-3000-production-frame.js");
let source=fs.readFileSync(sourcePath,"utf8");

const oldNames='const names=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js"];';
const newNames='const names=["app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js","app-07.js","app-08.js","app-09.js","app-10.js","app-14.js","app-17.js","app-18.js","app-19.js","app-20.js","app-21.js","app-22.js","app-23.js","app-24.js","app-25.js"];';
const oldRound3='while(t<2.5&&!g.activeGarbagePacks[0]?.landed){updateGarbagePacks(g,PHYSICS_FRAME);t+=PHYSICS_FRAME;}';
const newRound3='while(t<2.5&&!g.activeGarbagePacks[0]?.landed){updateGarbagePacks(g,PHYSICS_FRAME);updateVisuals(g,PHYSICS_FRAME);resolveVisualContacts(g);t+=PHYSICS_FRAME;}';

if(!source.includes(oldNames))throw new Error("reference-convergence-3000 runtime list changed; update runner explicitly");
if(!source.includes(oldRound3))throw new Error("reference-convergence-3000 garbage completion loop changed; update runner explicitly");
source=source.replace(oldNames,newNames).replace(oldRound3,newRound3);

fs.writeFileSync(tmpPath,source);
try{
  cp.execFileSync(process.execPath,[tmpPath],{stdio:"inherit"});
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
