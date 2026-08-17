const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"overlap-regressions.js");
const tmpPath=path.join(__dirname,".overlap-regressions-full-timeout.js");
let source=fs.readFileSync(sourcePath,"utf8");
const oldTimeout='vm.runInNewContext(runtime+assertions,context,{timeout:120000});';
const newTimeout='vm.runInNewContext(runtime+assertions,context,{timeout:300000});';
const oldRuntime='"app-10.js","app-14.js","app-17.js"';
const newRuntime='"app-10.js","app-14.js","app-17.js","app-18.js","app-19.js","app-20.js","app-21.js","app-22.js","app-23.js","app-24.js","app-25.js"';

if(!source.includes(oldTimeout)){
  throw new Error("overlap regression timeout declaration changed; update runner explicitly");
}
if(!source.includes(oldRuntime)){
  throw new Error("overlap regression runtime list changed; update production override injection explicitly");
}

// Do not reduce seeds, simulated seconds, collision threshold, or sample count.
// Only permit the unchanged long-run suite enough wall-clock time to finish,
// and execute it with the same final overrides loaded in production.
source=source.replace(oldRuntime,newRuntime).replace(oldTimeout,newTimeout);
fs.writeFileSync(tmpPath,source);
try{
  cp.execFileSync(process.execPath,[tmpPath],{stdio:"inherit"});
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
