const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"overlap-regressions.js");
const tmpPath=path.join(__dirname,".overlap-regressions-full-timeout.js");
const indexPath=path.join(__dirname,"../public/index.html");
let source=fs.readFileSync(sourcePath,"utf8");
const oldTimeout='vm.runInNewContext(runtime+assertions,context,{timeout:120000});';
const newTimeout='vm.runInNewContext(runtime+assertions,context,{timeout:300000});';

// Continuous non-overlap is a production invariant, so execute exactly the
// app layers shipped by index.html rather than a separately maintained suffix.
const productionNames=[...fs.readFileSync(indexPath,"utf8").matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
const app10Index=productionNames.indexOf("app-10.js");
if(app10Index<0||!productionNames.includes("app-01.js"))throw new Error("could not derive production app runtime from public/index.html");
const oldRuntime='"app-10.js","app-14.js","app-17.js"';
const newRuntime=productionNames.slice(app10Index).map(n=>JSON.stringify(n)).join(",");

if(!source.includes(oldTimeout)){
  throw new Error("overlap regression timeout declaration changed; update runner explicitly");
}
if(!source.includes(oldRuntime)){
  throw new Error("overlap regression runtime list changed; update production override injection explicitly");
}

// Do not reduce seeds, simulated seconds, collision threshold, or sample count.
// Only permit the unchanged long-run suite enough wall-clock time to finish,
// and execute it with the exact final overrides loaded in production.
source=source.replace(oldRuntime,newRuntime).replace(oldTimeout,newTimeout);
fs.writeFileSync(tmpPath,source);
try{
  cp.execFileSync(process.execPath,[tmpPath],{stdio:"inherit"});
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
