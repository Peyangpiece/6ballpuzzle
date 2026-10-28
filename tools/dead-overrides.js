#!/usr/bin/env node
// Finds superseded definitions in the layered runtime: a global that a later
// layer replaces at load time while nothing could have used the old value.
// Such code never runs and should be deleted, not kept behind its override.
//
// A definition D of global N is reported when a later write W of N always runs
// at load time and nothing can observe D in between:
//  - no value read of N between D and W (a `typeof N` check, or a capture
//    `const v=N` whose v is never read, is allowed only while an earlier
//    definition of N exists, so the check cannot change);
//  - W is a direct statement of the program or of a load-time IIFE, possibly
//    inside `if(typeof A==="function"&&...)`, and every early-return guard
//    before it is provably false (`typeof window==="undefined"`, a window flag
//    nothing has set yet, `typeof A!=="function"` for an A defined earlier);
//  - in both the page (index.html) and the AI worker (ai-worker.js) orders.
// Usage: node tools/dead-overrides.js   (tests/no-dead-overrides.js in the gate)
const fs=require("fs"),path=require("path");
const acorn=require("acorn"),scope=require("eslint-scope"),estraverse=require("estraverse");
const PUB=path.join(__dirname,"..","public");
const html=fs.readFileSync(path.join(PUB,"index.html"),"utf8");
const page=JSON.parse(/var files=(\[[\s\S]*?\]);/.exec(html)[1].replace(/,\s*\]$/,"]"));
const wsrc=fs.readFileSync(path.join(PUB,"ai-worker.js"),"utf8");
const worker=JSON.parse(/var AI_WORKER_FILES=(\[[\s\S]*?\]);/.exec(wsrc)[1].replace(/,\s*\]$/,"]"));
const info={},flagWriters=new Map();// window.F writes: name -> Set(file:iifeStart)
const isIIFE=(fn,p)=>p&&p.type==="CallExpression"&&p.callee===fn;
for(const f of page){
  const src=fs.readFileSync(path.join(PUB,f),"utf8");
  const ast=acorn.parse(src,{ecmaVersion:2022,sourceType:"script",ranges:true,allowReturnOutsideFunction:true});
  const sm=scope.analyze(ast,{ecmaVersion:2022});
  const parent=new Map();estraverse.traverse(ast,{enter(n,p){parent.set(n,p);}});
  const fnOf=n=>{for(let p=parent.get(n);p;p=parent.get(p))if(/Function/.test(p.type))return p;return null;};
  const loadFn=new Map();
  const isLoadFn=fn=>{if(!fn)return true;if(loadFn.has(fn))return loadFn.get(fn);const p=parent.get(fn);let ok=false;if(isIIFE(fn,p)){const outer=fnOf(fn);ok=isLoadFn(outer)&&!!directStmt(p,true);}loadFn.set(fn,ok);return ok;};
  // Returns {fn, conds:[typeof-names], guards:[test nodes]} if `n` always runs at load time given conds/guards, else null.
  function directStmt(n,inner){
    const conds=[],guards=[];let s=n;
    for(let p=parent.get(s);p;s=p,p=parent.get(p)){
      if(p.type==="Program"){collectGuards(p.body,s,guards);return{fn:null,conds,guards};}
      if(p.type==="BlockStatement"){
        const pp=parent.get(p);
        if(/Function/.test(pp.type)){collectGuards(p.body,s,guards);if(!guards.ok)return null;return isLoadFn(pp)?{fn:pp,conds,guards}:null;}
        if(pp.type==="IfStatement"&&pp.consequent===p){collectGuards(p.body,s,guards);const t=typeofFnTest(pp.test);if(!t)return null;conds.push(...t);s=pp;p=pp;continue;}
        return null;
      }
      if(p.type==="IfStatement"&&p.consequent===s){const t=typeofFnTest(p.test);if(!t)return null;conds.push(...t);continue;}
      if(/^(ExpressionStatement|VariableDeclaration|VariableDeclarator|AssignmentExpression|SequenceExpression|CallExpression|ParenthesizedExpression|UnaryExpression)$/.test(p.type)){
        if(p.type==="CallExpression"&&p.callee!==s&&!(/Function/.test(s.type)))return null;
        if(p.type==="AssignmentExpression"&&p.right===s&&!/Function/.test(s.type)&&s.type!=="AssignmentExpression")return null;
        if(p.type==="UnaryExpression"&&p.operator!=="!")return null;
        continue;
      }
      if(/Function/.test(p.type)){if(isIIFE(p,parent.get(p)))continue;return null;}
      return null;
    }
    return null;
  }
  function typeofFnTest(t){// typeof A==="function" [&& ...]
    if(t.type==="LogicalExpression"&&t.operator==="&&"){const a=typeofFnTest(t.left),b=typeofFnTest(t.right);return a&&b?[...a,...b]:null;}
    if(t.type==="BinaryExpression"&&/^===?$/.test(t.operator)&&t.left.type==="UnaryExpression"&&t.left.operator==="typeof"&&t.left.argument.type==="Identifier"&&t.right.type==="Literal"&&t.right.value==="function")return[t.left.argument.name];
    return null;
  }
  // Early exits before `s` in `body`: each must be `if(test)return...;` with a provably false test.
  function collectGuards(body,s,guards){
    if(guards.ok===false)return;guards.ok=true;
    for(const st of body){if(st===s)break;
      if(containsExit(st)){
        if(st.type==="IfStatement"&&!st.alternate&&(st.consequent.type==="ReturnStatement"||(st.consequent.type==="BlockStatement"&&st.consequent.body.length===1&&st.consequent.body[0].type==="ReturnStatement"))){guards.push(st.test);continue;}
        guards.ok=false;return;
      }
    }
  }
  function containsExit(st){let found=false;estraverse.traverse(st,{enter(n){if(/Function/.test(n.type))return estraverse.VisitorOption.Skip;if(n.type==="ReturnStatement"||n.type==="ThrowStatement")found=true;}});return found;}
  const events=[];
  for(const n of ast.body)if(n.type==="FunctionDeclaration")events.push({name:n.id.name,kind:"def",pos:-1,start:n.start,end:n.end,how:"decl",load:{fn:null,conds:[],guards:Object.assign([],{ok:true})}});
  const refs=[...sm.globalScope.through];for(const v of sm.globalScope.variables)refs.push(...v.references);
  for(const r of refs){const id=r.identifier,name=id.name;
    if(r.isWrite()){
      const p=parent.get(id);let val=null;if(p&&p.type==="AssignmentExpression"&&p.left===id)val=p.right;if(p&&p.type==="VariableDeclarator"&&p.id===id)val=p.init;
      const ds=directStmt(id);
      events.push({name,kind:"def",pos:id.start,start:val?val.start:id.start,end:val?val.end:id.end,how:"write",load:ds&&ds.guards.ok!==false?ds:null});
      if(r.isRead())events.push({name,kind:"read",pos:id.start});
    } else {
      const p=parent.get(id);let kind="read";
      if(p&&p.type==="UnaryExpression"&&p.operator==="typeof")kind="typeof";
      let q=id,qp=p;if(qp&&qp.type==="ConditionalExpression"&&(qp.consequent===q||qp.alternate===q)){q=qp;qp=parent.get(qp);}
      if(qp&&qp.type==="VariableDeclarator"&&qp.init===q&&qp.id.type==="Identifier"){const v=sm.getDeclaredVariables(qp).find(v=>v.name===qp.id.name);if(v&&v.references.every(r=>!r.isRead()))kind="typeof";}
      events.push({name,kind,pos:id.start});
    }
  }
  estraverse.traverse(ast,{enter(n,p){
    if(n.type==="MemberExpression"&&!n.computed&&n.object.type==="Identifier"&&/^(window|globalThis|self)$/.test(n.object.name)&&n.property.type==="Identifier"){
      const isW=p&&p.type==="AssignmentExpression"&&p.left===n&&p.operator==="=";
      if(isW){(flagWriters.get(n.property.name)||flagWriters.set(n.property.name,new Set()).get(n.property.name)).add(f+":"+((fnOf(n)||{}).start));}
      events.push({name:n.property.name,kind:isW?"memberdef":"read",pos:n.start});
    }
    if(n.type==="Literal"&&typeof n.value==="string"&&/^[A-Za-z_$][\w$]*$/.test(n.value))events.push({name:n.value,kind:"read",pos:n.start});
  }});
  info[f]={src,events,fnOf};
}
// Is a guard test provably false for an IIFE in file f, given defined-before names?
function guardFalse(t,f,fnStart,defined,writtenBefore){
  if(t.type==="LogicalExpression"&&t.operator==="||")return guardFalse(t.left,f,fnStart,defined,writtenBefore)&&guardFalse(t.right,f,fnStart,defined,writtenBefore);
  if(t.type==="BinaryExpression"&&/^===?$/.test(t.operator)&&t.left.type==="UnaryExpression"&&t.left.operator==="typeof"&&t.left.argument.name==="window"&&t.right.value==="undefined")return true;
  if(t.type==="BinaryExpression"&&/^!==?$/.test(t.operator)&&t.left.type==="UnaryExpression"&&t.left.operator==="typeof"&&t.left.argument.type==="Identifier"&&t.right.value==="function")return defined(t.left.argument.name);
  // window.F / window.F===literal: false while nothing has written window.F yet.
  const flag=x=>x.type==="MemberExpression"&&!x.computed&&/^(window|self)$/.test(x.object.name)?x.property.name:null;
  if(flag(t))return !writtenBefore(flag(t),t.start);
  if(t.type==="BinaryExpression"&&/^===?$/.test(t.operator)&&flag(t.left)&&t.right.type==="Literal"&&t.right.value!==undefined)return !writtenBefore(flag(t.left),t.start);
  return false;
}
function analyse(order){
  const seq=new Map();
  order.forEach((f,fi)=>{for(const e of info[f].events)(seq.get(e.name)||seq.set(e.name,[]).get(e.name)).push({...e,f,fi});});
  // names defined (decl or any write) by file index
  const firstDef=new Map();
  for(const [name,es] of seq)for(const e of es)if(e.kind==="def"){const k=e.fi;if(!firstDef.has(name)||firstDef.get(name)>k)firstDef.set(name,k);}
  const loadOK=(e)=>{if(!e.load)return false;const defined=n=>firstDef.has(n)&&firstDef.get(n)<e.fi;
    if(!e.load.conds.every(defined))return false;
    const fnStart=e.load.fn?e.load.fn.start:undefined;
    const writtenBefore=(name,pos)=>(seq.get(name)||[]).some(x=>x.kind==="memberdef"&&(x.fi<e.fi||(x.fi===e.fi&&x.pos<pos)));
    return e.load.guards.every(t=>guardFalse(t,e.f,fnStart,defined,writtenBefore));};
  const dead=[];
  for(const [name,es] of seq){
    const ord=es.slice().sort((a,b)=>a.fi-b.fi||a.pos-b.pos);
    for(let i=0;i<ord.length;i++){
      const d=ord[i];if(d.kind!=="def")continue;
      const earlierDef=ord.slice(0,i).some(e=>e.kind==="def");
      let replaced=null,blocked=false;
      for(let j=i+1;j<ord.length;j++){const e=ord[j];
        if(e.f===d.f&&e.pos>=d.start&&e.pos<d.end)continue;
        if(e.kind==="read"||e.kind==="memberdef"){blocked=true;break;}
        if(e.kind==="typeof"){if(!earlierDef){blocked=true;break;}continue;}
        if(e.kind==="def"){if(loadOK(e)){replaced=e;break;}blocked=true;break;}
      }
      if(!blocked&&replaced)dead.push({name,f:d.f,start:d.start,end:d.end,pos:d.pos,how:d.how,by:replaced.f,byPos:replaced.pos});
    }
  }
  return dead;
}
function findDeadOverrides(){
const key=d=>d.name+"@"+d.f+":"+d.pos;
const dp=analyse(page),dw=analyse(worker),wk=new Set(dw.map(key)),wset=new Set(worker);
const dead=dp.filter(d=>!wset.has(d.f)||wk.has(key(d)));
const line=(f,pos)=>info[f].src.slice(0,Math.max(0,pos)).split("\n").length;
let tot=0;for(const d of dead){d.lines=line(d.f,d.end)-line(d.f,d.start)+1;tot+=d.lines;}
return dead.sort((a,b)=>b.lines-a.lines).map(d=>({...d,line:line(d.f,d.pos),byLine:line(d.by,d.byPos)}));

}
module.exports={findDeadOverrides};
if(require.main===module){
  const dead=findDeadOverrides();
  for(const d of dead)console.log(String(d.lines).padStart(5),d.how.padEnd(6),d.name.padEnd(40),d.f+":"+d.line,"<- replaced by",d.by+":"+d.byLine);
  console.log("superseded definitions:",dead.length);
  process.exitCode=dead.length?1:0;
}
