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

expect(AI_PARAMS[1].name==="超弱い"&&AI_PARAMS[5].name==="超強い","CPU labels were not updated");
expect(AI_PARAMS[1].random>AI_PARAMS[2].random&&AI_PARAMS[2].random>AI_PARAMS[3].random&&AI_PARAMS[3].random>AI_PARAMS[4].random&&AI_PARAMS[4].random>AI_PARAMS[5].random,"random error is not staged downward");
expect(AI_PARAMS[5].random===0,"Super Strong must have zero random move selection");
expect(AI_PARAMS[4].depth===1&&AI_PARAMS[5].depth===1&&AI_PARAMS[5].beam>AI_PARAMS[4].beam,"top CPU levels do not have staged lookahead");
expect(AI_PARAMS[1].technique<AI_PARAMS[2].technique&&AI_PARAMS[2].technique<AI_PARAMS[3].technique&&AI_PARAMS[3].technique<AI_PARAMS[4].technique&&AI_PARAMS[4].technique<AI_PARAMS[5].technique,"technique understanding is not staged upward");

// HEXAGON construction value must rise monotonically as the same-colour shape
// approaches completion. Use an upper-board fixture so no unrelated floor
// placement creates a stronger accidental target.
const hex=GARBAGE_SHAPES.HEXAGON;
const h3=newBoard(),h4=newBoard(),h5=newBoard();
putPattern(h3,hex,4,4,3,0);putPattern(h4,hex,4,4,4,0);putPattern(h5,hex,4,4,5,0);
const hs3=window.__hexAiTechniquePotential(h3,5,[0,1,2]);
const hs4=window.__hexAiTechniquePotential(h4,5,[0,1,2]);
const hs5=window.__hexAiTechniquePotential(h5,5,[0,1,2]);
expect(hs3.score<hs4.score&&hs4.score<hs5.score,"HEXAGON progress is not monotone: "+JSON.stringify({hs3,hs4,hs5}));
expect(hs5.best?.type==="HEXAGON"&&hs5.best?.matched===5,"five-of-six HEXAGON was not recognised as the primary target: "+JSON.stringify(hs5));

// The same five-of-six state is valued more strongly by higher CPU levels.
const h3Level=window.__hexAiTechniquePotential(h5,3,[0,1,2]).score;
const h4Level=window.__hexAiTechniquePotential(h5,4,[0,1,2]).score;
const h5Level=window.__hexAiTechniquePotential(h5,5,[0,1,2]).score;
expect(h3Level<h4Level&&h4Level<h5Level,"CPU levels do not progressively value technique completion");

// PYRAMID is also explicitly recognised, while HEXAGON remains the highest
// priority technique for Super Strong under equivalent completion distance.
const pyr=GARBAGE_SHAPES.PYRAMID;
const p5=newBoard();putPattern(p5,pyr,5,4,5,0);
const ps5=window.__hexAiTechniquePotential(p5,5,[0,1,2]);
expect(ps5.best?.type==="PYRAMID"&&ps5.best?.matched===5,"five-of-six PYRAMID was not recognised: "+JSON.stringify(ps5));
expect(hs5.score>ps5.score,"Super Strong did not prioritise HEXAGON over equivalent PYRAMID progress");

// The actual planner must remain legal and deterministic at level 5.
const empty=newBoard(),colors=[0,1,2],next=[0,3,4];
const fixedRnd=()=>.5;
const m1=bestMove(empty,colors,next,5,fixedRnd);
const m2=bestMove(empty,colors,next,5,fixedRnd);
expect(m1&&m2,"Super Strong returned no move on an empty board");
expect(m1.x===m2.x&&m1.rot===m2.rot&&m1.y===m2.y,"Super Strong is not deterministic with random=0");
expect(pieceFits(empty,{x:m1.x,y:-2,rot:m1.rot,colors}),"Super Strong selected an unreachable spawn orientation");

console.log("technique-aware CPU levels PASS",JSON.stringify({hex3:hs3.score,hex4:hs4.score,hex5:hs5.score,pyr5:ps5.score,move:{x:m1.x,y:m1.y,rot:m1.rot}}));
`;

vm.runInNewContext(runtime+checks,{
 React:{useRef(){},useEffect(){},useState(){},useCallback(){},createElement(){}},
 ReactDOM:{createRoot(){return{render(){}}}},window:{},navigator:{},console,
 Math,Map,Set,Array,Number,Object,String,Boolean,JSON,Date
},{timeout:120000});
