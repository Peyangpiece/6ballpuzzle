const fs=require('fs');
const vm=require('vm');
const path=require('path');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const appNames=[...html.matchAll(/"(app-\d+\.js)"/g)].map(m=>m[1]);
if(!appNames.length)throw new Error('no production app files');
const sources=appNames.map(name=>({name,text:fs.readFileSync(path.join(root,'public',name),'utf8')}));

// ---------- static architecture audit ----------
const defs=new Map(),wrappers=[],staticFlags=[];
const addDef=(name,file,kind)=>{if(!defs.has(name))defs.set(name,[]);defs.get(name).push({file,kind});};
for(const {name:file,text} of sources){
  for(const m of text.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g))addDef(m[1],file,'function');
  for(const m of text.matchAll(/(?:^|\n)\s*([A-Za-z_$][\w$]*)\s*=\s*function\s*\(/g))addDef(m[1],file,'assign-function');
  for(const m of text.matchAll(/(?:^|\n)\s*([A-Za-z_$][\w$]*)\s*=\s*\([^\n]*\)\s*=>/g))addDef(m[1],file,'assign-arrow');
  for(const m of text.matchAll(/const\s+(__[A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*;/g))wrappers.push({file,alias:m[1],target:m[2]});
  const probes=[
    ['Math.random',/Math\.random\s*\(/g],['setTimeout',/setTimeout\s*\(/g],['setInterval',/setInterval\s*\(/g],
    ['MASS_COLLAPSE',/MASS_COLLAPSE|massCollapse/g],['wave terminology',/\bwave(?:Id|Seq|Start|End|Gap|Safe)?\b/gi],
    ['fixedGarbage',/fixedGarbage/g],['forceSplit',/forceSplit/g],['equilibriumLocked',/equilibriumLocked/g]
  ];
  for(const [label,re] of probes){const n=[...text.matchAll(re)].length;if(n)staticFlags.push({file,label,count:n});}
}
const duplicateDefs=[...defs.entries()].filter(([,v])=>v.length>1).map(([name,v])=>({name,locations:v}));
const critical=['stepEngine','updateVisuals','pieceFits','dropPiece','hardDrop','lock','rotate','settlePass','settleAll','hexPhysNaturalMotion','hexPhysPlanGroup','hexPhysBundleSafe','resolveVisualContacts','scheduleFreshPileFlow','hexEnforceFinalVisualNonOverlap','updateGarbagePacks','die','spawn'];
const criticalDefs=critical.map(name=>({name,locations:defs.get(name)||[],wrapperDepth:wrappers.filter(w=>w.target===name).length}));
console.log('AUDIT_STATIC',JSON.stringify({appCount:appNames.length,totalBytes:sources.reduce((n,s)=>n+s.text.length,0),duplicateDefCount:duplicateDefs.length,criticalDefs,staticFlags,topDuplicates:duplicateDefs.sort((a,b)=>b.locations.length-a.locations.length).slice(0,40)},null,2));

// ---------- production runtime ----------
const runtime=sources.map(s=>s.text).join('\n');
const suite=String.raw`
const audit={bugs:[],stats:{},examples:[]};
const BUG_LIMIT=120;
function bug(type,data){if(audit.bugs.length<BUG_LIMIT)audit.bugs.push({type,...data});audit.stats[type]=(audit.stats[type]||0)+1;}
const close=(a,b,e=1e-7)=>Math.abs(a-b)<=e;
const physDist=(a,b)=>hexPhysDist(a.x,a.y,b.x,b.y);
function boardItems(g){const out=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const ball=valid(x,y)?g.board[y][x]:null;if(!ball)continue;const v=g.vis.get(ball.id);out.push({ball,v,x,y});}return out;}
function stateSig(g){const items=boardItems(g).map(q=>[q.ball.id,q.x,q.y,+(q.v?.x??q.x).toFixed(4),+(q.v?.y??q.y).toFixed(4),q.ball.fallPath?.length||0,q.ball.motionGroupId||0]);const packs=(g.activeGarbagePacks||[]).filter(p=>!p.landed).map(p=>[p.seq,+p.y.toFixed(4),p.pat?.length||0]);return JSON.stringify([g.state,g.phase,g.piece&&[g.piece.x,g.piece.y,g.piece.rot,+((g.pieceVX??g.piece.x)).toFixed(4)],items,packs]);}
function checkEngine(g,seed,step){
  const items=boardItems(g),ids=new Set();
  for(const q of items){
    if(ids.has(q.ball.id))bug('duplicate-ball-id',{seed,step,id:q.ball.id});ids.add(q.ball.id);
    if(!q.v)bug('board-ball-missing-visual',{seed,step,id:q.ball.id,x:q.x,y:q.y});
    else{
      if(!Number.isFinite(q.v.x)||!Number.isFinite(q.v.y)||!Number.isFinite(q.v.vy??0))bug('nan-visual',{seed,step,id:q.ball.id,v:q.v});
      const floorY=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/HEX_ROW_H;
      if(q.v.y>floorY+1e-6)bug('floor-penetration',{seed,step,id:q.ball.id,y:q.v.y,floorY});
      if(q.v.x<-1e-6||q.v.x>W2-1+1e-6)bug('wall-penetration',{seed,step,id:q.ball.id,x:q.v.x});
      if(q.ball._hexGarbageContinuousRest){const r=q.ball._hexGarbageContinuousRest,rx=r.px/.5,ry=(r.py-BOARD_TOP_CENTER_N)/HEX_ROW_H;if(Math.hypot((q.v.x-rx)*.5,(q.v.y-ry)*HEX_ROW_H)>2e-5)bug('stale-continuous-rest',{seed,step,id:q.ball.id,visual:[q.v.x,q.v.y],rest:[rx,ry]});}
    }
    if(Array.isArray(q.ball.fallPath))for(const seg of q.ball.fallPath){if(seg?.from&&seg?.to&&seg.to[1]<seg.from[1]-1e-8)bug('upward-fallpath',{seed,step,id:q.ball.id,seg:{from:seg.from,to:seg.to,kind:seg.kind}});}
    if((g.state==='PLAYING'||g.phase==='CHECK')&&!q.ball.fallPath?.length&&q.ball.rigid&&!(q.ball.motionGroupId&&hexPhysGroups(g.board).get(q.ball.motionGroupId)?.some(m=>m.ball.fallPath?.length)))bug('settled-rigidity',{seed,step,id:q.ball.id,group:q.ball.motionGroupId});
  }
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
    const a=items[i],b=items[j];if(!a.v||!b.v)continue;const d=hexPhysDist(a.v.x,a.v.y,b.v.x,b.v.y);if(d<0.999999-1e-7)bug('board-overlap',{seed,step,d,a:{id:a.ball.id,g:!!a.ball.isGarbage,x:a.v.x,y:a.v.y},b:{id:b.ball.id,g:!!b.ball.isGarbage,x:b.v.x,y:b.v.y}});
  }
  for(const [gid,members] of hexPhysGroups(g.board)){
    const declared=new Set(members.map(m=>m.ball.motionGroupSize));if(declared.size!==1||![2,3].includes([...declared][0])||[...declared][0]!==members.length)bug('group-metadata-size',{seed,step,gid,declared:[...declared],actual:members.length});
    if(members.some(m=>!m.ball.rigid))bug('group-nonrigid-member',{seed,step,gid});
  }
  if(g.state==='PLAYING'&&g.piece){if(!Number.isFinite(g.pieceVX)||!Number.isFinite(g.pieceVY))bug('active-nan',{seed,step});}
  if(g.state==='GAMEOVER'){
    const pending=typeof pendingFallPathCount==='function'?pendingFallPathCount(g):0;
    if(pending>0||hasLegalGravityMove(g.board)||boardHasIllegalFloat(g.board))bug('gameover-before-stable',{seed,step,pending,legal:hasLegalGravityMove(g.board),float:boardHasIllegalFloat(g.board),reason:g.gameOverReason});
  }
}
function runAI(seed,seconds=28){
  const g=createEngine(seed);g.ai={level:1+seed%5,target:null,thinkT:0,actT:0};let lastSig='',same=0,maxSame=0;let injected=0;let garbageStarts=[];
  for(let step=0;step<Math.floor(seconds/PHYSICS_FRAME)&&g.alive;step++){
    if(step===120*7)g.incomingShapes.push('PYRAMID');
    if(step===120*11)g.incomingShapes.push('HEXAGON');
    if(step===120*16)g.incomingShapes.push('STRAIGHT');
    if(step===120*21)g.incoming+=5;
    stepEngine(g,PHYSICS_FRAME);checkEngine(g,seed,step);
    for(const p of g.garbagePlans||[])if(p._started&&!p._auditSeen){p._auditSeen=true;garbageStarts.push(p.actualStartTime);}
    const sig=stateSig(g);if(sig===lastSig)same++;else same=0;lastSig=sig;maxSame=Math.max(maxSame,same);
    if(g.state==='RESOLVING'&&same>360)bug('resolving-no-progress-3s',{seed,step,phase:g.phase,same});
  }
  for(let i=1;i<garbageStarts.length;i++){const d=garbageStarts[i]-garbageStarts[i-1];if(Math.abs(d-.5)>1e-7)bug('garbage-start-interval',{seed,i,d,starts:garbageStarts.slice()});}
  return {sig:stateSig(g),state:g.state,phase:g.phase,alive:g.alive,maxSame,stats:g.stats};
}

// broad live-game fuzz
for(let seed=1;seed<=40;seed++)runAI(seed,28);

// deterministic replay: same seed must finish in exactly same state
for(const seed of [3,11,19,27,35]){const a=runAI(1000+seed,18),b=runAI(1000+seed,18);if(a.sig!==b.sig||JSON.stringify(a.stats)!==JSON.stringify(b.stats))bug('nondeterministic-replay',{seed,a,b});}

// natural-motion random-board convergence and cycle audit
function mk(id,c=0){return{id,c,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false};}
for(let seed=0;seed<700;seed++){
 const rng=mulberry32(0xA51C0000+seed),b=newBoard();let id=1000000+seed*100;
 for(let n=0;n<8+(seed%22);n++){
   const y=BOARD_MIN_ROW+Math.floor(rng()*(ROWS-BOARD_MIN_ROW)),xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!b[y][x])xs.push(x);if(!xs.length)continue;const x=xs[Math.floor(rng()*xs.length)];b[y][x]=mk(id++,Math.floor(rng()*COLORS.length));
 }
 let guard=0;while(hasLegalGravityMove(b)&&guard<500){settlePass(b);guard++;}
 if(guard>=500)bug('settle-nontermination',{seed});
 if(hasLegalGravityMove(b))bug('settle-left-legal-move',{seed,guard});
 const seen=new Set();for(let y=boardScanMin(b);y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?b[y][x]:null;if(q){if(seen.has(q.id))bug('settle-duplicate-id',{seed,id:q.id});seen.add(q.id);}}
}

// hard-drop and guide agreement on generated stable piles
for(let seed=0;seed<220;seed++){
 const g=createEngine(50000+seed);spawn(g);const rng=mulberry32(90000+seed);let id=2000000+seed*50;
 for(let n=0;n<seed%10;n++){const y=ROWS-1-2*Math.floor(rng()*3),xs=[];for(let x=0;x<W2;x++)if(valid(x,y)&&!g.board[y][x])xs.push(x);if(!xs.length)continue;g.board[y][xs[Math.floor(rng()*xs.length)]]=mk(id++,n%COLORS.length);}
 settleAll(g.board);for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const q=valid(x,y)?g.board[y][x]:null;if(q)setVis(g,q,x,y,0);}
 g.piece.rot=seed%6;const [lo,hi]=legalXRange(g);const want=lo+(hi-lo)*((seed%17)+.33)/17;setFreeX(g,want);
 const target=dropPiece(g.board,g.piece),expected=pieceCells(target).map(([x,y])=>x+','+y).sort().join('|');const sh=landingShadowCells(g),shadow=sh?sh.map(([x,y])=>x+','+y).sort().join('|'):null;
 if(shadow!==expected)bug('guide-logical-target-mismatch',{seed,expected,shadow});
 const h=createEngine(50000+seed);h.board=g.board.map(r=>r.slice());h.vis=new Map(g.vis);h.queue=g.queue.map(q=>q.slice());h.piece={...g.piece,colors:g.piece.colors.slice()};h.pieceVX=g.pieceVX;h.freeX=g.freeX;h.state='PLAYING';hardDrop(h);
 const made=[];for(const [x,y] of pieceCells(target))if(valid(x,y)&&h.board[y][x])made.push(x+','+y);if(made.sort().join('|')!==expected)bug('harddrop-target-mismatch',{seed,expected,made});
}

// Explicit rigidity subset fixture: when one member is constrained, a compatible pair should survive as a temporary 2-ball rigid group when possible.
{
 const g=createEngine(777001),gid=9001;const bs=[0,1,2].map((r)=>({id:7001+r,c:r,motionGroupId:gid,motionGroupRole:r,motionGroupOrientation:'down',motionGroupSize:3,rigid:true,momentumX:0}));
 const members=[{ball:bs[0],x:7,y:4,role:0,orientation:'down'},{ball:bs[1],x:9,y:4,role:1,orientation:'down'},{ball:bs[2],x:8,y:5,role:2,orientation:'down'}];members.forEach(m=>{g.board[m.y][m.x]=m.ball;setVis(g,m.ball,m.x,m.y,0);});
 // constrain only the right member with an off-grid settled garbage centre
 const ob={id:7999,c:4,isGarbage:true,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:'',motionGroupSize:0,rigid:false,_hexGarbageContinuousRest:{px:5.25,py:cellCenterYNorm(5),groupKey:'audit'}};g.board[5][10]=ob;setVis(g,ob,10.5,5,0);
 const plan=hexPhysPlanGroup(g.board,members,false);const groups=[...hexPhysGroups(g.board).values()];
 if(!plan.length&&groups.every(gr=>gr.length!==2))bug('rigidity-max-compatible-subset-lost',{plan,groups:groups.map(gr=>gr.map(m=>m.ball.id))});
}

globalThis.__auditResult=audit;
`;
const context={React:{useRef(){},useEffect(){},useState(){return[null,()=>{}]},useCallback(f){return f}},window:{},navigator:{},console,Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date,setTimeout(){return 0},clearTimeout(){},setInterval(){return 0},clearInterval(){}};
try{vm.runInNewContext(runtime+suite,context,{timeout:240000});}
catch(err){console.error('AUDIT_RUNTIME_CRASH',err&&err.stack||err);process.exitCode=2;}
if(context.__auditResult){console.log('AUDIT_DYNAMIC',JSON.stringify(context.__auditResult,null,2));}
