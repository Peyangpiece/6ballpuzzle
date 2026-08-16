const { useRef, useEffect, useState, useCallback } = React;
// Reference capture: counting levels upward from the floor, odd levels hold
// ten balls and even levels hold nine. W2 is the doubled-x representation.
const W2=19,ROWS=12,CLEAR_MIN=6,TAU=Math.PI*2;
// Balls are allowed to exist above the visible limit while a drop, garbage
// batch, or chain is still resolving. This mirrors the reference rule: the
// limit is judged only after the complete board has reached equilibrium.
const OVERFLOW_ROWS=16,BOARD_MIN_ROW=-OVERFLOW_ROWS;
const BALL_RADIUS_N=0.5;
const HEX_ROW_H=Math.sqrt(3)/2;
const BOARD_TOP_CENTER_N=BALL_RADIUS_N;
const BOARD_FLOOR_N=1+(ROWS-1)*HEX_ROW_H;
const FLOOR_CENTER_N=BOARD_FLOOR_N-BALL_RADIUS_N;
const FLOOR_EPS=1e-7;
const cellCenterYNorm=row=>BOARD_TOP_CENTER_N+row*HEX_ROW_H;
const ballBottomYNorm=row=>cellCenterYNorm(row)+BALL_RADIUS_N;
const touchesFloorRow=row=>Math.abs(ballBottomYNorm(row)-BOARD_FLOOR_N)<=FLOOR_EPS;
const latticeRealX=x=>x*0.5;
// ROWS is even, so reversing the old top-based phase makes the floor row
// (y=ROWS-1) the wide ten-ball row seen in the reference footage.
const parityOK=(x,y)=>(((x+y)&1)===1);
const DIRS=[[2,0],[1,1],[-1,1],[-2,0],[-1,-1],[1,-1]];
const COLORS=[
 {base:"#FF3B4D",hi:"#FFC8CC",lo:"#7E0E1B",glow:"#FF6E7C",sym:"star"},
 {base:"#2E86FF",hi:"#BEDCFF",lo:"#0C3781",glow:"#63ABFF",sym:"wave"},
 {base:"#2FD36E",hi:"#BCF8D2",lo:"#0C6234",glow:"#5FEF98",sym:"cross"},
 {base:"#FFB020",hi:"#FFE9B8",lo:"#8A5602",glow:"#FFCB5F",sym:"bar"},
 {base:"#B255F0",hi:"#E9CCFF",lo:"#511D8C",glow:"#CE8AFF",sym:"arc"}
];
const WAZA={
 // The matched balls clear first, while the traced figure remains as a long
 // sparkling afterimage.  The six 30 fps captures keep these trails visible
 // for roughly four seconds; tying them to the shorter clear hold cut them
 // off one to two seconds too early.
 STRAIGHT:{jp:"ストレート",garbage:19,packs:1,hold:1.0,tint:"#FFE66D",fx:4.35},
 PYRAMID:{jp:"ピラミッド",garbage:24,packs:4,hold:1.25,tint:"#57FF7D",fx:4.05},
 HEXAGON:{jp:"ヘキサゴン",garbage:36,packs:6,hold:1.35,tint:"#3DEBFF",fx:4.15}
};
const GARBAGE_SHAPES={
 // Nine balls on the upper row, ten on the lower row. This matches the
 // floor-based odd/even phase instead of placing the short row on the floor.
 STRAIGHT:[[1,0],[3,0],[5,0],[7,0],[9,0],[11,0],[13,0],[15,0],[17,0],[0,1],[2,1],[4,1],[6,1],[8,1],[10,1],[12,1],[14,1],[16,1],[18,1]],
 PYRAMID:[[2,0],[1,1],[3,1],[0,2],[2,2],[4,2]],
 HEXAGON:[[1,0],[3,0],[0,1],[4,1],[1,2],[3,2]]
};
const WAZA_PRIORITY=["HEXAGON","PYRAMID","STRAIGHT"];
const mulberry32=a=>()=>{a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};

/* Sound system is intentionally independent from physics. */
const Sfx={
 ctx:null,master:null,enabled:true,haptics:true,
 init(){if(this.ctx){if(this.ctx.state==="suspended")this.ctx.resume();return;}const C=window.AudioContext||window.webkitAudioContext;if(!C)return;this.ctx=new C();this.master=this.ctx.createGain();this.master.gain.value=.26;const comp=this.ctx.createDynamicsCompressor();comp.threshold.value=-18;comp.knee.value=18;comp.ratio.value=3.2;comp.attack.value=.003;comp.release.value=.16;this.master.connect(comp);comp.connect(this.ctx.destination);},
 tone({f=440,f2=null,d=.1,type="sine",v=1,delay=0,attack=.004}){if(!this.enabled||!this.ctx)return;const t0=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(Math.max(20,f),t0);if(f2)o.frequency.exponentialRampToValueAtTime(Math.max(20,f2),t0+d);g.gain.setValueAtTime(.0001,t0);g.gain.exponentialRampToValueAtTime(Math.max(.0002,v),t0+attack);g.gain.exponentialRampToValueAtTime(.0001,t0+d);o.connect(g);g.connect(this.master);o.start(t0);o.stop(t0+d+.03);},
 noise({d=.12,v=.18,f=1200,q=.7,delay=0,type="lowpass"}){if(!this.enabled||!this.ctx)return;const t0=this.ctx.currentTime+delay,n=Math.max(1,Math.floor(this.ctx.sampleRate*d)),buf=this.ctx.createBuffer(1,n,this.ctx.sampleRate),ch=buf.getChannelData(0);for(let i=0;i<n;i++)ch[i]=(Math.random()*2-1)*Math.pow(1-i/n,1.8);const src=this.ctx.createBufferSource();src.buffer=buf;const lp=this.ctx.createBiquadFilter();lp.type=type;lp.frequency.value=f;lp.Q.value=q;const g=this.ctx.createGain();g.gain.value=v;src.connect(lp);lp.connect(g);g.connect(this.master);src.start(t0);},
 blip(f,delay=0,v=.06){this.tone({f,f2:f*1.07,d:.055,type:"square",v,delay,attack:.002});this.tone({f:f*2,f2:f*1.92,d:.04,type:"sine",v:v*.33,delay});},
 keyThock(vol=1){this.tone({f:126,f2:92,d:.085,type:"sine",v:.105*vol,attack:.0015});this.tone({f:218,f2:172,d:.052,type:"triangle",v:.05*vol,attack:.001});this.noise({d:.028,v:.055*vol,f:760,q:1.25});this.tone({f:74,f2:61,d:.11,type:"sine",v:.045*vol,delay:.009,attack:.002});},
 metal(f,delay=0,v=.045){this.tone({f,f2:f*.985,d:.09,type:"sine",v,delay,attack:.001});this.tone({f:f*1.414,f2:f*1.37,d:.065,type:"triangle",v:v*.38,delay,attack:.001});this.noise({d:.055,v:v*.52,f:Math.min(11800,f*2.4),q:7,delay,type:"bandpass"});},
 vib(p){if(!this.haptics)return;try{if(navigator.vibrate)navigator.vibrate(p);}catch(e){}},
 play(ev,vol=1){switch(ev.t){
  case"move":this.tone({f:238,f2:205,d:.038,type:"triangle",v:.028*vol,attack:.001});this.noise({d:.018,v:.018*vol,f:1100,q:.8});break;
  case"rotate":this.keyThock(vol);if(vol>.9)this.vib(5);break;
  case"land":this.tone({f:148,f2:92,d:.10,type:"sine",v:.115*vol,attack:.0015});this.tone({f:286,f2:214,d:.052,type:"triangle",v:.033*vol,attack:.001});this.noise({d:.035,v:.045*vol,f:680,q:1});if(vol>.9)this.vib(7);break;
  case"drop":this.tone({f:310,f2:108,d:.13,type:"triangle",v:.072*vol,attack:.0015});this.tone({f:115,f2:78,d:.15,type:"sine",v:.048*vol,attack:.002});this.noise({d:.045,v:.038*vol,f:930,q:.9});if(vol>.9)this.vib(10);break;
  case"clear":{const step=Math.min(7,Math.max(0,(ev.chain||1)-1)),root=588*Math.pow(1.075,step);this.tone({f:112,f2:54,d:.24,type:"sine",v:.105*vol,attack:.001});[1,1.335,1.68].forEach((r,i)=>this.metal(root*r,i*.032,(.043+step*.004)*vol));this.noise({d:.11,v:.05*vol,f:2800,q:3,type:"bandpass"});if(vol>.9)this.vib(step>=2?[0,12,24,12]:10);break;}
  case"waza":{const flash=.78,roots={STRAIGHT:784,PYRAMID:588,HEXAGON:523},root=roots[ev.w]||588;this.tone({f:116,f2:50,d:.42,type:"sine",v:.12*vol,attack:.001});this.noise({d:.16,v:.06*vol,f:1645,q:1.2,type:"bandpass"});[2804,8933,11220].forEach((f,i)=>this.metal(f,.07+i*.022,.026*vol));this.tone({f:9956,f2:7385,d:.16,type:"sine",v:.035*vol,delay:flash,attack:.001});this.metal(root,flash,.082*vol);this.metal(root*1.5,flash+.045,.062*vol);this.noise({d:.24,v:.11*vol,f:5480,q:.8,delay:flash,type:"highpass"});this.tone({f:54,f2:42,d:.34,type:"sine",v:.095*vol,delay:1.42,attack:.002});if(vol>.9)this.vib(ev.w==="HEXAGON"?[0,32,22,32,22,60]:[0,20,22,38]);break;}
  case"fast":this.tone({f:182,f2:146,d:.045,type:"triangle",v:.038*vol,attack:.001});this.noise({d:.016,v:.016*vol,f:900,q:.8});if(vol>.9)this.vib(4);break;
  case"garbage":this.noise({d:.34,v:.09*vol,f:1650,q:1.6,type:"bandpass"});this.tone({f:310,f2:590,d:.32,type:"sine",v:.055*vol});this.metal(588,.34,.07*vol);this.tone({f:92,f2:50,d:.24,type:"sine",v:.11*vol,delay:.34,attack:.001});if(vol>.9)this.vib([0,45,24,52]);break;
  case"ready":this.metal(784,.02,.045*vol);this.metal(1175,.08,.032*vol);break;
  case"start":this.tone({f:587,f2:1396,d:.22,type:"triangle",v:.075*vol,attack:.002});this.metal(1396,.13,.07*vol);if(vol>.9)this.vib([0,16,18,28]);break;
  case"win":[784,988,1175,1396,1758].forEach((f,i)=>this.metal(f,i*.072,.075));this.tone({f:98,f2:196,d:.42,type:"sine",v:.08});this.vib([0,24,30,24,30,65]);break;
  case"lose":[392,330,294,220].forEach((f,i)=>this.tone({f,f2:f*.92,d:.22,type:"triangle",v:.07,delay:i*.09}));this.metal(784,.42,.035);this.metal(1396,.48,.028);this.vib([0,90]);break;
 }}
};

/* Basic board storage only. All motion rules live in app-02/app-03. */
const valid=(x,y)=>y>=BOARD_MIN_ROW&&y<ROWS&&x>=0&&x<W2&&parityOK(x,y);
function newHexGrid(fill=null){
 const b=Array.from({length:ROWS},()=>Array(W2).fill(fill));
 for(let y=BOARD_MIN_ROW;y<0;y++)b[y]=Array(W2).fill(fill);
 b._scanMin=fill===null||fill===false?0:BOARD_MIN_ROW;
 return b;
}
const newBoard=()=>newHexGrid(null);
function noteBoardCell(board,y,value){if(board&&value&&y<0)board._scanMin=Math.min(Number.isFinite(board._scanMin)?board._scanMin:0,y);}
function refreshBoardScanMin(board){
 let min=0;for(let y=BOARD_MIN_ROW;y<0;y++){if(board[y]?.some(Boolean)){min=y;break;}}
 board._scanMin=min;return min;
}
function boardScanMin(board){return Math.max(BOARD_MIN_ROW,Math.min(0,Number.isFinite(board?._scanMin)?board._scanMin:0));}
function cloneHexGrid(board,mapCell=v=>v){
 const out=newBoard();
 for(let y=BOARD_MIN_ROW;y<ROWS;y++)for(let x=0;x<W2;x++){const v=mapCell(board[y]?.[x]??null,x,y);out[y][x]=v;noteBoardCell(out,y,v);}
 return out;
}
const getC=v=>(v==null?null:typeof v==="number"?v:v.c);
function floorPackingScore(b,tx,ty){if(ty!==ROWS-1)return 0;let score=0;for(const nx of[tx-2,tx+2])if(nx>=0&&nx<W2&&b[ty][nx]!==null)score++;if(tx<=0||tx>=W2-1)score+=.5;return score;}
