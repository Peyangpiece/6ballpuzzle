const fs=require("fs");
const vm=require("vm");

const overlay=fs.readFileSync(`${__dirname}/../public/app-gameover-garbage-fade.js`,"utf8");
const assertions=String.raw`
function expect(v,m){if(!v)throw new Error(m);}

const drawCalls=[];
let bubbleCalls=0;
function drawBall(ctx,cx,cy,d,ci,o={}){drawCalls.push({cx,cy,d,ci,o});}
function drawGarbageBubbleBall(){bubbleCalls++;}
function drawSide(ctx,g,L){
  // Simulate the app-14 board branch for the one former-garbage cell.
  drawGarbageBubbleBall(ctx,100,200,L.D,2,3.2);
}

const ROWS=12,W2=19;
function valid(x,y){return y>=0&&y<ROWS&&x>=0&&x<W2;}
function boardScanMin(){return 0;}
const board=Array.from({length:ROWS},()=>Array(W2).fill(null));
const garbage={id:77,c:2,isGarbage:true};
board[11][8]=garbage;
const vis=new Map([[77,{garbageBubbleT:3.2}] ]);
const g={state:"GAMEOVER",stateT:.48+1.85,board,vis,activeGarbagePacks:[]};

// Install overlay after the renderer, exactly like index.html.
${overlay}
expect(window.__hexGameoverGarbageFade===true,"game-over garbage fade adapter not installed");

drawSide({},g,{D:40},0,0,"","",true,0);
expect(bubbleCalls===0,"GAMEOVER still used opaque garbage bubble renderer");
expect(drawCalls.length===1,"GAMEOVER did not route former garbage through ordinary ball draw");
expect(drawCalls[0].o.alpha===0,"floor-row former garbage did not fully fade at ordinary death endpoint");

// Outside GAMEOVER, preserve the original garbage presentation exactly.
drawCalls.length=0;
g.state="RESOLVING";
drawSide({},g,{D:40},0,0,"","",true,0);
expect(bubbleCalls===1,"non-GAMEOVER garbage bubble presentation was changed");
expect(drawCalls.length===0,"non-GAMEOVER garbage was rerouted through death rendering");

console.log("game-over former-garbage fade PASS");
`;

vm.runInNewContext(assertions,{console,Math,Map,Set,Array,Object,Number,String,Boolean,JSON,Date,window:{}});
