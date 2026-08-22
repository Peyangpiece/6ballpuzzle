const fs=require("fs");
const path=require("path");
const cp=require("child_process");

const DIR=__dirname;
const files={
  shadow:path.join(DIR,".v1303-rigidity-shadow-current.js"),
  directed:path.join(DIR,".v1303-rigidity-shadow-directed-current.js"),
  commit:path.join(DIR,".v1303-rigidity-commit-state-current.js")
};

function read(name){return fs.readFileSync(path.join(DIR,name),"utf8");}
function mustReplace(source,from,to,label){
  if(!source.includes(from))throw new Error("current oracle patch target missing: "+label);
  return source.split(from).join(to);
}

let shadow=read("v1303-rigidity-shadow-audit.js");
shadow=mustReplace(shadow,"hits.length !== 5","hits.length !== 4","resolver definition count");
shadow=mustReplace(shadow,"Expected exactly 5 resolver planner wrappers","Expected exactly 4 resolver planner wrappers","resolver definition message");
shadow=mustReplace(shadow,"ctx.__v1303CapturedPlans.length !== 6","ctx.__v1303CapturedPlans.length !== 5","captured planner count");
shadow=mustReplace(shadow,"Expected BASE + 5 planners, got ","Expected BASE + 4 planners, got ","captured planner message");
shadow=mustReplace(shadow,"outputs[5]","outputs[outputs.length-1]","random final planner");
shadow=shadow.replace(" * BASE + five resolver wrappers"," * BASE + four resolver wrappers (v3.6 redundant layer removed)");
fs.writeFileSync(files.shadow,shadow);

let directed=read("v1303-rigidity-shadow-directed-audit.js");
directed=mustReplace(directed,'"./v1303-rigidity-shadow-audit.js"','"./.v1303-rigidity-shadow-current.js"',"directed current shadow dependency");
directed=mustReplace(directed,"planners.length !== 6","planners.length !== 5","directed planner count");
directed=mustReplace(directed,"Expected BASE + 5 planners","Expected BASE + 4 planners","directed planner message");
directed=mustReplace(directed,"outputs[5]","outputs[outputs.length-1]","directed final planner");
fs.writeFileSync(files.directed,directed);

let commit=read("v1303-rigidity-commit-state-audit.js");
commit=mustReplace(commit,'"./v1303-rigidity-shadow-audit.js"','"./.v1303-rigidity-shadow-current.js"',"commit current shadow dependency");
commit=mustReplace(commit,'"./v1303-rigidity-shadow-directed-audit.js"','"./.v1303-rigidity-shadow-directed-current.js"',"commit current directed dependency");
commit=mustReplace(commit,"planners.length !== 6","planners.length !== 5","commit planner count");
commit=mustReplace(commit,"Expected BASE + five resolver planners","Expected BASE + four resolver planners","commit planner message");
commit=mustReplace(commit,"result[5].plan","result[result.length-1].plan","commit final planner");
fs.writeFileSync(files.commit,commit);

try{
  cp.execFileSync(process.execPath,[files.commit],{stdio:"inherit"});
  console.log("v1303 CURRENT 4-LAYER ORACLE SUITE PASS: 12000 PREVIEW + COMMIT CASES");
}finally{
  for(const f of Object.values(files))try{fs.unlinkSync(f);}catch{}
}
