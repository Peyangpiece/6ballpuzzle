/* CPU AI core v1: one engine-accurate simulation and one decision function for
 * every CPU level. Replaces app-ai-superstrong-authoritative-v2.js.
 *
 * Simulation. A hard drop is predicted with the production physics itself:
 * the piece lands as a rigid triplet (as lock() releases it) and settleAll()
 * plus the clear rules run on ball objects that carry each ball's id and roll
 * bias, which the physics uses for tie-breaks. The old search settled bare
 * colour numbers instead; those bypass the current motion layers and colour 0
 * (falsy) never fell, so most predicted boards were wrong.
 *
 * Decisions run in the AI Web Worker (ai-worker.js) under a wall-clock budget,
 * so the search never costs frames. Without a worker (tests, old browsers) the
 * same function runs synchronously with a small budget.
 */
(function(){
if(typeof window==="undefined"||window.__sixBallAiCoreV1)return;
if(typeof enumerateMoves!=="function"||typeof pieceCells!=="function"||typeof settleAll!=="function"||typeof AI_PARAMS!=="object")return;
window.__sixBallAiCoreV1=true;

Object.assign(AI_PARAMS[5],{think:0,act:.004,random:0,name:"超強い"});
// Wall-clock search budget per decision (ms). Levels 1-4 also have their
// thinking pause (AI_PARAMS.think), which runs at the same time.
const BUDGET_MS={1:150,2:200,3:350,4:600,5:1500};
const TYPE_RANK={STRAIGHT:1,PYRAMID:2,HEXAGON:3};
const nowMs=()=>(typeof performance!=="undefined"&&performance.now)?performance.now():Date.now();

/* ---------- boards and simulation ---------- */
// Serialisable AI board: {c,id,m} per ball (colour, id, roll bias).
const ballBias=v=>Math.sign(v.momentumX||v.rollDir||v.subCellBias||0);
function aiBoardFrom(board){return cloneHexGrid(board,v=>v==null?null:{c:getC(v),id:Number(v.id)||0,m:typeof v==="object"?(v.m!==undefined?Math.sign(v.m):ballBias(v)):0});}
const aiColors=b=>cloneHexGrid(b,v=>v==null?null:v.c);
function aiSimulateMove(board,move,nextId=1){
 const cells=pieceCells(move);
 for(const[x,y]of cells)if(y<0||!valid(x,y)||board[y][x]!=null)return null;
 const b=cloneHexGrid(board,v=>v==null?null:{id:v.id,c:v.c,momentumX:v.m||0,motionGroupId:0,motionGroupRole:-1,motionGroupOrientation:"",motionGroupSize:0});
 const gid=HEX_PHYS_GROUP_SEQ++,orientation=(move.rot&1)===0?"down":"up";
 cells.forEach(([x,y,c],role)=>{const ball={id:nextId+role,c,momentumX:0,motionGroupId:gid,motionGroupRole:role,motionGroupOrientation:orientation,motionGroupSize:3,rigid:true};b[y][x]=ball;noteBoardCell(b,y,ball);});
 let chain=0,garbage=0;const techniques=[];
 for(let guard=0;guard<40;guard++){
  settleAll(b);
  const groups=findGroups(b);if(!groups.length)break;chain++;
  const kill=new Set(),killColors=new Set();
  for(const grp of groups){
   const w=classify(grp.cells);
   if(w){garbage+=WAZA[w].garbage;killColors.add(grp.color);if(chain===1)techniques.push({type:w,color:grp.color,rank:TYPE_RANK[w]||0});}
   for(const[x,y]of grp.cells)kill.add(x+","+y);
  }
  for(let y=boardScanMin(b);y<ROWS;y++)for(let x=0;x<W2;x++){
   const v=valid(x,y)?b[y][x]:null;if(!v)continue;
   if(killColors.has(v.c))kill.add(x+","+y);
   hexPhysClearGroupBall(v); // after a clear every pile ball is independent
  }
  for(const k of kill){const[x,y]=k.split(",").map(Number);b[y][x]=null;}
 }
 const best=techniques.length?[...techniques].sort((p,q)=>q.rank-p.rank)[0]:null;
 return{b:cloneHexGrid(b,v=>v==null?null:{c:v.c,id:v.id,m:ballBias(v)}),chain,garbage,techniques,best};
}

/* ---------- level 5: technique projects (strategy of the former planner) ---------- */
const colorOf=v=>v==null?null:(typeof v==="object"?v.c:v);
function countColors(arr){const out=Array(COLORS.length).fill(0);for(const c of arr||[])if(Number.isInteger(c)&&c>=0&&c<out.length)out[c]++;return out;}
function boardColorCounts(b){const out=Array(COLORS.length).fill(0);for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){const c=valid(x,y)?colorOf(b[y][x]):null;if(c!=null)out[c]++;}return out;}
const TARGETS=(()=>{
 const out=[],seen=new Set();
 const add=(type,cells)=>{if(!cells.every(([x,y])=>valid(x,y)))return;const keys=cells.map(([x,y])=>x+","+y).sort(),key=type+":"+keys.join("|");if(seen.has(key))return;seen.add(key);out.push({type,cells,cellSet:new Set(keys),bottom:Math.max(...cells.map(([,y])=>y))});};
 const p=GARBAGE_SHAPES.PYRAMID,maxY=Math.max(...p.map(([,y])=>y));
 for(const[type,pat]of[["HEXAGON",GARBAGE_SHAPES.HEXAGON],["PYRAMID",p],["PYRAMID",p.map(([x,y])=>[x,maxY-y])]])
  for(let ay=0;ay<ROWS;ay++)for(let ax=0;ax<W2;ax++)add(type,pat.map(([dx,dy])=>[ax+dx,ay+dy]));
 for(const[dx,dy]of[[2,0],[1,1],[1,-1]])for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++)add("STRAIGHT",Array.from({length:6},(_,i)=>[x+dx*i,y+dy*i]));
 return out;
})();
function supportDebt(b,target,missing){
 let debt=0;
 for(const[x,y]of missing){
  if(touchesFloorRow(y))continue;
  if(![[x-1,y+1],[x+1,y+1]].some(([nx,ny])=>valid(nx,ny)&&(b[ny][nx]!=null||target.cellSet.has(nx+","+ny))))debt++;
 }
 return debt;
}
function evaluateTarget(b,target,color,cur,next){
 let matched=0;const missing=[];
 for(const[x,y]of target.cells){const v=b[y][x];if(v==null){missing.push([x,y]);continue;}if(colorOf(v)!==color)return null;matched++;}
 const debt=supportDebt(b,target,missing);
 const eta=(6-matched)+debt*.52+(matched===0?1.85:0)-matched*.18-(cur[color]||0)*.42-(next[color]||0)*.26;
 return{color,type:target.type,target,matched,missing:6-matched,supportDebt:debt,eta};
}
function betterProject(a,b){
 if(!b)return true;
 if(Math.abs(a.eta-b.eta)>1e-9)return a.eta<b.eta;
 if(TYPE_RANK[a.type]!==TYPE_RANK[b.type])return TYPE_RANK[a.type]>TYPE_RANK[b.type];
 if(a.matched!==b.matched)return a.matched>b.matched;
 if(a.supportDebt!==b.supportDebt)return a.supportDebt<b.supportDebt;
 return a.target.bottom>b.target.bottom;
}
// Pursue the most buildable technique per colour; at most three projects,
// concentrated to two when a third would endanger completion.
function selectProjects(b,colors,nextColors){
 const cur=countColors(colors),next=countColors(nextColors),counts=boardColorCounts(b),cands=[];
 for(let color=0;color<COLORS.length;color++){
  let best=null;for(const t of TARGETS){const p=evaluateTarget(b,t,color,cur,next);if(p&&betterProject(p,best))best=p;}
  if(best)cands.push({...best,cost:best.eta-Math.min(6,counts[color])*.055,supply:(cur[color]||0)+(next[color]||0)});
 }
 cands.sort((a,z)=>a.cost-z.cost||TYPE_RANK[z.type]-TYPE_RANK[a.type]||z.matched-a.matched);
 let limit=Math.min(3,cands.length);
 if(limit>=3){
  const[a,b2,c]=cands;
  if(heightOf(b)>=ROWS-4||a.missing<=2||c.cost>b2.cost+1.15||c.cost>a.cost+1.8||(c.supply===0&&a.supply+b2.supply>=2)||(a.missing+b2.missing<=6&&c.missing>=4))limit=2;
 }
 return cands.slice(0,limit).map(p=>({color:p.color,type:p.type,target:p.target}));
}
function portfolioMetrics(b,projects,knownNext){
 const zero=Array(COLORS.length).fill(0),next=countColors(knownNext);
 const list=projects.map(p=>evaluateTarget(b,p.target,p.color,zero,next)||{type:p.type,matched:0,missing:6,supportDebt:9,eta:99,blocked:true});
 const sorted=[...list].sort((a,z)=>a.eta-z.eta||TYPE_RANK[z.type]-TYPE_RANK[a.type]||z.matched-a.matched);
 const weights=[1,.34,.14];let weighted=0,impossible=0;
 list.forEach((p,i)=>{weighted+=p.eta*(weights[i]||.08);if(p.blocked||p.eta>=90)impossible++;});
 return{primary:sorted[0]||{eta:99,matched:0,missing:6,supportDebt:9,type:"STRAIGHT"},weighted,impossible};
}
function boardRisk(b){
 let top=ROWS,load=0,count=0;
 for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){if(!valid(x,y)||b[y][x]==null)continue;count++;if(y<top)top=y;if(y<=2)load+=3-y;}
 return count?load*8+Math.max(0,5-top)*3+count*.02:0;
}
function cheapMoveScore(m,projects){
 const focus=new Set(projects.map(p=>p.color)),byColor=new Map(projects.map(p=>[p.color,p]));let s=0;
 for(const[x,y,c]of pieceCells(m)){s+=focus.has(c)?2.2:-.2;const p=byColor.get(c);if(p&&p.target.cellSet.has(x+","+y))s+=13+TYPE_RANK[p.type]*.8;s+=Math.max(0,y)*.018;}
 return s;
}
const orderedMoves=(b,colors,projects,beam=Infinity)=>enumerateMoves(b,colors).map((m,index)=>({m,index,cheap:cheapMoveScore(m,projects)})).sort((a,z)=>z.cheap-a.cheap||a.index-z.index).slice(0,beam);
const makeRank=(turn,sim,metrics,index)=>({turn,techRank:sim.best?.rank||0,metrics,risk:boardRisk(sim.b),chain:sim.chain,index});
// Earliest technique first; on the same turn HEXAGON > PYRAMID > STRAIGHT;
// otherwise the fastest-completing project, then board safety.
function compareRank(a,b){
 if(a.turn!==b.turn)return a.turn-b.turn;
 if(a.turn<=2&&a.techRank!==b.techRank)return b.techRank-a.techRank;
 if(a.metrics.impossible!==b.metrics.impossible)return a.metrics.impossible-b.metrics.impossible;
 const pa=a.metrics.primary,pb=b.metrics.primary;
 if(Math.abs(pa.eta-pb.eta)>1e-9)return pa.eta-pb.eta;
 if(Math.abs(a.metrics.weighted-b.metrics.weighted)>1e-9)return a.metrics.weighted-b.metrics.weighted;
 if(TYPE_RANK[pa.type]!==TYPE_RANK[pb.type])return TYPE_RANK[pb.type]-TYPE_RANK[pa.type];
 if(pa.matched!==pb.matched)return pb.matched-pa.matched;
 if(pa.supportDebt!==pb.supportDebt)return pa.supportDebt-pb.supportDebt;
 if(Math.abs(a.risk-b.risk)>1e-9)return a.risk-b.risk;
 if(a.chain!==b.chain)return b.chain-a.chain;
 return a.index-b.index;
}
const bestNode=nodes=>nodes.reduce((best,n)=>!best||compareRank(n.rank,best.rank)<0?n:best,null);
const PARENT_BEAMS=[24,16,10],MOVE_BEAMS=[Infinity,36,24];
// Every current move (best-looking first), then the queued pieces layer by
// layer, until the budget runs out. A technique found on the earliest turn wins.
function decideSuperStrong(req,more,stats){
 const board=req.board,future=(req.queue||[]).slice(0,3),nextId=req.nextId||1;
 const projects=selectProjects(board,req.colors,future[0]||null),noTech=future.length+2;
 const moves=orderedMoves(board,req.colors,projects);
 const cands=[];
 for(const e of moves){
  if(cands.length&&!more())break;
  const sim=aiSimulateMove(board,e.m,nextId);stats.sims++;if(!sim)continue;
  cands.push({root:e,sim,rank:makeRank(sim.best?1:noTech,sim,portfolioMetrics(sim.b,projects,future[0]||null),e.index)});
 }
 if(!cands.length)return moves[0]?.m||null;
 stats.turns=1;
 const now=cands.filter(n=>n.rank.techRank>0);if(now.length)return bestNode(now).root.m;
 let pool=[...cands].sort((a,z)=>compareRank(a.rank,z.rank)).slice(0,PARENT_BEAMS[0]);
 for(let d=0;d<future.length;d++){
  const children=[];let complete=true;
  layer:for(const parent of pool)for(const e of orderedMoves(parent.sim.b,future[d],projects,MOVE_BEAMS[d])){
   if(!more()){complete=false;break layer;}
   const sim=aiSimulateMove(parent.sim.b,e.m,nextId+3*(d+1));stats.sims++;if(!sim)continue;
   children.push({root:parent.root,sim,rank:makeRank(sim.best?d+2:noTech,sim,portfolioMetrics(sim.b,projects,future[d+1]||null),parent.root.index)});
  }
  const tech=children.filter(n=>n.rank.turn===d+2&&n.rank.techRank>0);
  if(tech.length)return bestNode(tech).root.m;
  if(!complete||!children.length)return bestNode(children.length?children:pool).root.m;
  stats.turns=d+2;
  pool=children.sort((a,z)=>compareRank(a.rank,z.rank)).slice(0,PARENT_BEAMS[d+1]||children.length);
 }
 return bestNode(pool).root.m;
}

/* ---------- levels 1-4 ---------- */
// Cheap move ordering for the budgeted search: touching same-coloured balls, low placements.
function contactScore(b,m){let s=0;for(const[x,y,c]of pieceCells(m)){for(const[dx,dy]of DIRS){const nx=x+dx,ny=y+dy;if(valid(nx,ny)&&colorOf(b[ny][nx])===c)s++;}s+=Math.max(0,y)*.05;}return s;}
function decideBasic(req,more,stats,rng){
 const P=AI_PARAMS[req.level],board=req.board,nextId=req.nextId||1;
 const moves=enumerateMoves(board,req.colors);if(!moves.length)return null;
 if(rng()<P.random)return moves[Math.floor(rng()*moves.length)];
 const ordered=moves.map(m=>({m,s:contactScore(board,m)})).sort((a,z)=>z.s-a.s).map(e=>e.m);
 const scored=[];
 for(const m of ordered){
  if(scored.length&&!more())break;
  const sim=aiSimulateMove(board,m,nextId);stats.sims++;if(!sim)continue;
  scored.push({m,b:sim.b,s:evalBoard(aiColors(sim.b),sim,req.level,rng)});
 }
 if(!scored.length)return moves[0];
 scored.sort((a,z)=>z.s-a.s);stats.turns=1;
 const next=req.queue&&req.queue[0];
 if(P.depth>=1&&next){
  const top=scored.slice(0,4);
  for(const c of top){
   let best=-1e9;
   for(const mm of enumerateMoves(c.b,next).map(m=>({m,s:contactScore(c.b,m)})).sort((a,z)=>z.s-a.s).map(e=>e.m)){
    if(!more())break;
    const s2=aiSimulateMove(c.b,mm,nextId+3);stats.sims++;if(s2)best=Math.max(best,evalBoard(aiColors(s2.b),s2,req.level,rng));
   }
   if(best>-1e9)c.s=c.s*.55+best*.45;
  }
  top.sort((a,z)=>z.s-a.s);stats.turns=2;return top[0].m;
 }
 return scored[0].m;
}

/* ---------- one entry point for every level ---------- */
// req: {board (aiBoardFrom), colors, queue, level, nextId, seed, budgetMs, maxSims}
function aiDecide(req){
 const level=Math.max(1,Math.min(5,Number(req.level)||1)),stats={sims:0,turns:0,ms:0};
 const t0=nowMs(),deadline=t0+(Number.isFinite(req.budgetMs)?req.budgetMs:BUDGET_MS[level]),maxSims=Number.isFinite(req.maxSims)?req.maxSims:Infinity;
 const more=()=>stats.sims<maxSims&&nowMs()<deadline;
 const move=level===5?decideSuperStrong({...req,level},more,stats):decideBasic({...req,level},more,stats,mulberry32((Number(req.seed)>>>0)||1));
 stats.ms=nowMs()-t0;
 return{move:move?{x:move.x,y:move.y,rot:move.rot}:null,stats};
}

Object.assign(window,{__sixBallAiBoardFrom:aiBoardFrom,__sixBallAiSimulateMove:aiSimulateMove,__sixBallAiDecide:aiDecide,__sixBallAiBudgetMs:BUDGET_MS});
window.__sixBallAiCoreVersion="ai-core-v1-engine-accurate";
})();

/* ---------- main thread: request decisions, then play them ---------- */
(function installAiPlayer(){
if(typeof window==="undefined"||window.__sixBallAiPlayerV1||typeof window.__sixBallAiDecide!=="function"||typeof stepAI!=="function")return;
if(typeof importScripts==="function")return; // inside the worker: compute only
window.__sixBallAiPlayerV1=true;
const W={worker:null,failed:false,seq:0,pending:new Map()};
function aiWorker(){
 if(W.failed||typeof Worker!=="function"||window.__sixBallAiWorkerDisabled)return null;
 if(W.worker)return W.worker;
 try{
  const w=new Worker(window.__sixBallAiWorkerUrl||"ai-worker.js");
  w.onmessage=e=>{const d=e.data||{},cb=W.pending.get(d.id);W.pending.delete(d.id);if(cb)cb(d);};
  w.onerror=()=>{W.failed=true;W.worker=null;try{w.terminate();}catch(_){}const cbs=[...W.pending.values()];W.pending.clear();for(const cb of cbs)cb({error:"worker"});};
  W.worker=w;return w;
 }catch(_){W.failed=true;return null;}
}
// Synchronous fallback: a short budget so a missing worker never stalls frames.
const SYNC_BUDGET_MS=30;
function decideSync(req){return window.__sixBallAiDecide({...req,budgetMs:Number.isFinite(window.__sixBallAiSyncBudgetMs)?window.__sixBallAiSyncBudgetMs:Math.min(req.budgetMs,SYNC_BUDGET_MS),maxSims:window.__sixBallAiSyncMaxSims});}
function decisionKey(g){return[Number(g.ver)||0,g.piece.colors.join(","),(g.queue?.[0]||[]).join(",")].join("|");}
function request(g,ai,level,key){
 const req={board:window.__sixBallAiBoardFrom(g.board),colors:[...g.piece.colors],queue:(g.queue||[]).slice(0,3).map(q=>[...q]),level,nextId:g.nextId,seed:Math.floor((g.aiRng?g.aiRng():Math.random())*4294967296)>>>0,budgetMs:window.__sixBallAiBudgetMs[level]};
 const r={key,done:false,move:null};ai._aiRequest=r;
 const finish=out=>{r.move=out.move||null;r.done=true;ai._lastAiStats=out.stats||null;};
 const w=aiWorker();
 if(!w){finish(decideSync(req));return;}
 const id=++W.seq;W.pending.set(id,d=>{if(d.error)finish(decideSync(req));else{window.__sixBallAiWorkerAnswers=(window.__sixBallAiWorkerAnswers|0)+1;finish(d);}});
 w.postMessage({id,req});
}
stepAI=function(g,dt){
 const ai=g&&g.ai;if(!ai)return;
 const level=Math.max(1,Math.min(5,Number(ai.level)||1)),P=AI_PARAMS[level];
 if(!g.piece||g.state!=="PLAYING"){ai._aiRequest=null;ai.target=null;return;}
 if(!ai.target){
  const key=decisionKey(g);
  if(ai._aiKey!==key){ai._aiKey=key;ai.stuck=0;}
  if(!ai._aiRequest||ai._aiRequest.key!==key)request(g,ai,level,key);
  if(ai.thinkT>0)ai.thinkT-=dt; // the thinking pause runs while the search does
  if(!ai._aiRequest.done)return;
  if(ai.thinkT>0)return;
  ai.target=ai._aiRequest.move;
  if(!ai.target){hardDrop(g);return;}
 }
 ai.actT-=dt;if(ai.actT>0)return;ai.actT=P.act;
 // A move blocked by the piece's current height is re-planned; after
 // repeated failures the piece is dropped where it is.
 const t=ai.target,replan=()=>{ai.target=null;ai._aiRequest=null;ai.stuck=(ai.stuck||0)+1;ai.thinkT=Math.min(.08,P.think*.2);if(ai.stuck>=3){ai.stuck=0;hardDrop(g);}};
 if(g.piece.rot!==t.rot){const cw=(t.rot-g.piece.rot+6)%6;if(!rotate(g,cw<=3?1:-1))replan();return;}
 if(g.piece.x!==t.x){if(!move(g,g.piece.x<t.x?1:-1))replan();return;}
 hardDrop(g);
};
})();
