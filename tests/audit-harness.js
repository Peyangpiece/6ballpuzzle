const fs=require('fs');
const vm=require('vm');
const path=require('path');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const appNames=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
if(!appNames.length)throw new Error('no production app files found in index.html');
const runtime=appNames.map(name=>fs.readFileSync(path.join(root,'public',name),'utf8')).join('\n');

function context(){
  return {
    React:{useRef(){return{current:null}},useEffect(){},useState(v){return[v,()=>{}]},useCallback(f){return f}},
    window:{},navigator:{},console,Math,Map,Set,WeakMap,WeakSet,Array,Number,Object,String,Boolean,JSON,Date,
    setTimeout(){return 0},clearTimeout(){},setInterval(){return 0},clearInterval(){},performance:{now:()=>0}
  };
}
function runSuite(code,{timeout=240000}={}){
  const ctx=context();
  vm.runInNewContext(runtime+'\n'+code,ctx,{timeout});
  return ctx;
}
module.exports={runSuite,appNames,runtime};
