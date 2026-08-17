const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const sourcePath=path.join(__dirname,"overlap-regressions.js");
const tmpPath=path.join(__dirname,".overlap-regressions-full-timeout.js");
const source=fs.readFileSync(sourcePath,"utf8");
const oldTimeout='vm.runInNewContext(runtime+assertions,context,{timeout:120000});';
const newTimeout='vm.runInNewContext(runtime+assertions,context,{timeout:300000});';

if(!source.includes(oldTimeout)){
  throw new Error("overlap regression timeout declaration changed; update runner explicitly");
}

// Do not reduce seeds, simulated seconds, collision threshold, or sample count.
// Only permit the unchanged long-run suite enough wall-clock time to finish.
fs.writeFileSync(tmpPath,source.replace(oldTimeout,newTimeout));
try{
  cp.execFileSync(process.execPath,[tmpPath],{stdio:"inherit"});
}finally{
  try{fs.unlinkSync(tmpPath);}catch{}
}
