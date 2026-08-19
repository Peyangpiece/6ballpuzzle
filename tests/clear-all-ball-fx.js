const fs=require("fs");
const vm=require("vm");

const adapter=fs.readFileSync(`${__dirname}/../public/app-clear-all-ball-fx.js`,"utf8");
const source=`
const window={};
const W2=19,HEX_ROW_H=Math.sqrt(3)/2,TAU=Math.PI*2,CLEAR_SUPPORT_RELEASE_RATIO=.55;
const COLORS=[{glow:'#f00'},{glow:'#0ff'},{glow:'#0f0'},{glow:'#ff0'},{glow:'#f0f'}];
let baseCalls=0;
function drawSide(){baseCalls++;}
${adapter}
function expect(v,m){if(!v)throw new Error(m);}
expect(window.__hexClearAllBallFx===true,'adapter missing');
expect(window.__hexEveryClearedBallHasDisappearFx===true,'all-clear FX invariant missing');
expect(window.__hexClearAllBallFxVersion==='clear-all-ball-fx-v1','version mismatch');
const cells=[[0,9,0,1],[2,9,1,2],[4,9,2,3],[6,9,3,4],[8,9,4,5],[10,9,0,6],[12,9,1,7]];
const g={state:'RESOLVING',phase:'CLEAR',stateT:.22,holdT:.4,clearing:{cells,committed:false}};
const selected=window.__hexClearAllBallFxCells(g);
expect(selected.length===cells.length,'not every disappearing ball was selected');
expect(new Set(selected.map(q=>q.id)).size===cells.length,'clear FX de-dup removed a real ball');
const st=window.__hexClearAllBallFxState(g);
expect(st.strength>0,'disappearance flash is inactive at support release');
let arcs=0,strokes=0,fills=0;
const ctx={
 save(){},restore(){},beginPath(){},rect(){},clip(){},arc(){arcs++;},stroke(){strokes++;},fill(){fills++;},
 set globalCompositeOperation(v){},set shadowColor(v){},set shadowBlur(v){},set globalAlpha(v){},set strokeStyle(v){},set lineWidth(v){},set fillStyle(v){}
};
const L={D:40,X:20,Y:80,BW:380,BH:420};
drawSide(ctx,g,L,0,0,'','','',0);
expect(baseCalls===1,'base board renderer was not preserved');
expect(arcs===cells.length*2,'every clear cell did not receive ring+core FX: '+arcs);
expect(strokes===cells.length,'every clear cell did not receive disappearance ring');
expect(fills===cells.length,'every clear cell did not receive disappearance core');
// The same authoritative list must remain available after logical removal so
// committed ghosts cannot lose the disappearance effect.
g.clearing.committed=true;g.stateT=.28;
expect(window.__hexClearAllBallFxCells(g).length===cells.length,'committed ghosts lost clear FX membership');
console.log('every cleared ball disappearance FX PASS',JSON.stringify({cells:cells.length,arcs,strokes,fills}));
`;
vm.runInNewContext(source,{console,Math,Set,Map,Array,Object,Number,String,Boolean,JSON,Date,Infinity,NaN});
