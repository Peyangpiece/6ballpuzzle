const fs=require("fs");
const vm=require("vm");
const runtime=[
  "app-01.js","app-02.js","app-03.js","app-04.js","app-05.js","app-06.js",
  "app-07.js","app-08.js","app-09.js","app-ai-technique.js"
].map(name=>fs.readFileSync(`${__dirname}/../public/${name}`,"utf8")).join("\n");

const checks=String.raw`
function expect(v,m){if(!v)throw new Error(m);}
function putPattern(board,pat,ax,ay,count,color=0){
  for(let i=0;i<count;i++){
    const [dx,dy]=pat[i],x=ax+dx,y=ay+dy;
    expect(valid(x,y),"invalid technique fixture cell "+x+","+y);
    board[y][x]=color;
  }
}

expect(window.__hexAiDifficultyProfileVersion==="ai-difficulty-v3","precise CPU profile was not installed");
expect(AI_PARAMS[1].name==="超よわい"&&AI_PARAMS[2].name==="よわい"&&AI_PARAMS[3].name==="普通"&&AI_PARAMS[4].name==="強い"&&AI_PARAMS[5].name==="超強い","CPU labels mismatch");
expect(AI_PARAMS[1].random>AI_PARAMS[2].random&&AI_PARAMS[2].random>AI_PARAMS[3].random&&AI_PARAMS[3].random>AI_PARAMS[4].random&&AI_PARAMS[4].random>AI_PARAMS[5].random,"random error is not staged downward");
expect(AI_PARAMS[5].random===0&&AI_PARAMS[5].exactTechnique===true,"Super Strong is not deterministic exact-technique mode");
expect(AI_PARAMS[1].technique<AI_PARAMS[2].technique&&AI_PARAMS[2].technique<AI_PARAMS[3].technique&&AI_PARAMS[3].technique<AI_PARAMS[4].technique&&AI_PARAMS[4].technique<AI_PARAMS[5].technique,"technique understanding is not staged upward");
expect(AI_PARAMS[1].dropMode==="fast"&&AI_PARAMS[2].dropMode==="fast","lowest CPU levels must be fast-fall only");
expect(AI_PARAMS[3].dropMode==="hard"&&AI_PARAMS[4].dropMode==="hard"&&AI_PARAMS[5].dropMode==="hard","upper CPU levels lost instant drop");
expect(AI_PARAMS[4].depth===1&&AI_PARAMS[4].beam===12&&AI_PARAMS[5].depth===1&&AI_PARAMS[5].beam===0,"lookahead tiers mismatch");
expect(window.__hexAiLowLevelsUseFastFallOnly===true&&window.__hexAiSuperStrongExactTechnique===true&&window.__hexAiSuperStrongExhaustiveNext===true,"CPU behavior markers missing");

// HEXAGON construction value rises monotonically as the same-colour shape
// approaches completion.
const hex=GARBAGE_SHAPES.HEXAGON;
const h3=newBoard(),h4=newBoard(),h5=newBoard();
putPattern(h3,hex,4,4,3,0);putPattern(h4,hex,4,4,4,0);putPattern(h5,hex,4,4,5,0);
const hs3=window.__hexAiTechniquePotential(h3,5,[0,1,2]);
const hs4=window.__hexAiTechniquePotential(h4,5,[0,1,2]);
const hs5=window.__hexAiTechniquePotential(h5,5,[0,1,2]);
expect(hs3.score<hs4.score&&hs4.score<hs5.score,"HEXAGON progress is not monotone: "+JSON.stringify({hs3,hs4,hs5}));
expect(hs5.best?.type==="HEXAGON"&&hs5.best?.matched===5,"five-of-six HEXAGON was not recognised as primary target");

// The same five-of-six state matters progressively more at higher levels.
const h3Level=window.__hexAiTechniquePotential(h5,3,[0,1,2]).score;
const h4Level=window.__hexAiTechniquePotential(h5,4,[0,1,2]).score;
const h5Level=window.__hexAiTechniquePotential(h5,5,[0,1,2]).score;
expect(h3Level<h4Level&&h4Level<h5Level,"CPU levels do not progressively value technique completion");

// PYRAMID is also explicit, while equivalent HEXAGON progress is worth more.
const pyr=GARBAGE_SHAPES.PYRAMID;
const p5=newBoard();putPattern(p5,pyr,5,4,5,0);
const ps5=window.__hexAiTechniquePotential(p5,5,[0,1,2]);
expect(ps5.best?.type==="PYRAMID"&&ps5.best?.matched===5,"five-of-six PYRAMID was not recognised");
expect(hs5.score>ps5.score,"Super Strong did not prefer equivalent HEXAGON progress");

// Exact level-5 objective puts real HEXAGON/PYRAMID production ahead of generic
// board score. HEXAGON has the larger attack value, then PYRAMID.
{
  const b=newBoard(),res={chain:0,garbage:0};
  const none={b:cloneHexGrid(b,v=>v),res,waza:{HEXAGON:0,PYRAMID:0,STRAIGHT:0}};
  const py={b:cloneHexGrid(b,v=>v),res,waza:{HEXAGON:0,PYRAMID:1,STRAIGHT:0}};
  const hx={b:cloneHexGrid(b,v=>v),res,waza:{HEXAGON:1,PYRAMID:0,STRAIGHT:0}};
  const s0=window.__hexAiExactTechniqueScore(none,null,null),sp=window.__hexAiExactTechniqueScore(py,null,null),sh=window.__hexAiExactTechniqueScore(hx,null,null);
  expect(s0<sp&&sp<sh,"exact technique objective does not rank NONE < PYRAMID < HEXAGON");
}

// On a stable five-of-six PYRAMID fixture, if an immediate technique completion
// exists, Super Strong with NEXT unknown must choose one of the legal moves with
// the maximum immediate HEXAGON/PYRAMID attack. No random alternative is allowed.
{
  const b=newBoard(),ax=6,ay=9;
  for(let i=1;i<pyr.length;i++){const [dx,dy]=pyr[i];b[ay+dy][ax+dx]=0;}
  const colors=[0,2,3],moves=enumerateMoves(b,colors);
  let maxAttack=-1,bestKeys=new Set();
  for(const m of moves){
    const sim=window.__hexAiSimulateDetailed(toColors(b),m);if(!sim)continue;
    const attack=(sim.waza.HEXAGON||0)*(WAZA.HEXAGON.garbage||36)+(sim.waza.PYRAMID||0)*(WAZA.PYRAMID.garbage||24);
    const k=m.x+","+m.y+","+m.rot;
    if(attack>maxAttack){maxAttack=attack;bestKeys=new Set([k]);}else if(attack===maxAttack)bestKeys.add(k);
  }
  expect(maxAttack>0,"fixture exposes no immediate HEXAGON/PYRAMID completion");
  const chosen=bestMove(b,colors,null,5,()=>.999);
  const ck=chosen.x+","+chosen.y+","+chosen.rot;
  expect(bestKeys.has(ck),"Super Strong ignored an immediate optimal technique completion: "+JSON.stringify({maxAttack,chosen}));
}

// Level 5 remains deterministic and legal with exhaustive NEXT search.
{
  const empty=newBoard(),colors=[0,1,2],next=[0,3,4];
  const m1=bestMove(empty,colors,next,5,()=>.01);
  const m2=bestMove(empty,colors,next,5,()=>.99);
  expect(m1&&m2,"Super Strong returned no move on an empty board");
  expect(m1.x===m2.x&&m1.rot===m2.rot&&m1.y===m2.y,"Super Strong changed with RNG despite zero-random exact mode");
  expect(pieceFits(empty,{x:m1.x,y:-2,rot:m1.rot,colors}),"Super Strong selected an unreachable spawn orientation");
}

// Execution difference is also strict: levels 1-2 align and hold fast-fall;
// level 3+ instant-drops once aligned.
function alignedCpu(level){
  const g=createEngine(7000+level);spawn(g);
  g.ai={level,target:{x:g.piece.x,y:g.piece.y,rot:g.piece.rot},thinkT:0,actT:0,stuck:0};
  stepAI(g,1);
  return g;
}
for(const level of[1,2]){
  const g=alignedCpu(level);
  expect(g.state==="PLAYING"&&!!g.piece,AI_PARAMS[level].name+" used instant drop");
  expect(g.fastForward===true,AI_PARAMS[level].name+" did not enter fast-fall after alignment");
}
for(const level of[3,4,5]){
  const g=alignedCpu(level);
  expect(g.state==="RESOLVING"&&!g.piece,AI_PARAMS[level].name+" did not instant-drop after alignment");
}

console.log("precise technique-aware CPU levels PASS",JSON.stringify({hex3:hs3.score,hex4:hs4.score,hex5:hs5.score,pyr5:ps5.score,dropModes:[1,2,3,4,5].map(l=>AI_PARAMS[l].dropMode)}));
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
