const {runSuite}=require('./audit-harness');

const code=String.raw`
(function(){
  function assert(cond,msg){if(!cond)throw new Error(msg);}
  const EPS=1e-8;

  // 1) Shape plans must be decomposed into one-ball plans without changing the
  //    final set of planned lattice cells.
  const pat=GARBAGE_SHAPES.STRAIGHT.map(p=>[p[0],p[1]]);
  const colors=pat.map((_,i)=>i%COLORS.length);
  const base={type:'STRAIGHT',ax:0,targetY:8,pat,colors,seq:3};
  const expanded=hex65ExpandPlansToBalls([base]);
  assert(expanded.length===pat.length,'STRAIGHT was not decomposed per ball: '+expanded.length);
  assert(expanded.every(p=>p.pat.length===1&&p.pat[0][0]===0&&p.pat[0][1]===0),'expanded plan still contains multi-ball packet');
  const want=pat.map(([dx,dy])=>(base.ax+dx)+','+(base.targetY+dy)).sort();
  const got=expanded.map(p=>p.ax+','+p.targetY).sort();
  assert(JSON.stringify(got)===JSON.stringify(want),'single-ball expansion changed final placement plan');
  for(let i=1;i<expanded.length;i++){
    assert(expanded[i-1]._hexSourceShapeDy>=expanded[i]._hexSourceShapeDy,'shape entry order is not lower-row first');
  }

  // 2) Runtime scheduler: never start more than one new ball in one update and
  //    never allow <0.5 s between ACTUAL starts, including large frame stalls.
  const g=createEngine(123456);
  g.state='RESOLVING';g.phase='GARBAGE';g.garbageBatchPrepared=true;
  g.garbageClock=0;g.garbageNextBallAt=0;g.garbLeft=0;g.garbBlocked=false;
  g.garbagePlans=[0,1,2,3,4].map((i)=>({
    type:'PYRAMID',ax:2+i*2,targetY:ROWS-1,pat:[[0,0]],colors:[i%COLORS.length],seq:i,
    y:GARBAGE_START_Y,vy:0,landed:false,_started:false,flightAge:0,contactY:null,
    totalBalls:1,landedCount:0,entryBalls:[],straightAtomic:false
  }));
  g.activeGarbagePacks=[];
  const dts=[1/120,1.2,1/120,.12,.39,.02,.7,1/120,.5,.5,.5,.5];
  const starts=[];
  let prevCount=0;
  for(const dt of dts){
    updateGarbagePacks(g,dt);
    const current=g.garbagePlans.filter(p=>p._started);
    assert(current.length-prevCount<=1,'more than one garbage ball started in one update');
    prevCount=current.length;
    for(const p of current){
      const t=Number(p._hexActualStartTime);
      if(Number.isFinite(t)&&!starts.some(q=>q.p===p))starts.push({p,t});
    }
  }
  starts.sort((a,b)=>a.t-b.t);
  assert(starts.length>=3,'scheduler did not start enough test balls: '+starts.length);
  for(let i=1;i<starts.length;i++){
    const gap=starts[i].t-starts[i-1].t;
    assert(gap+EPS>=HEX65_GARBAGE_BALL_INTERVAL,'actual garbage starts caught up too quickly: '+gap);
  }
  for(const s of starts){
    assert(s.p.pat.length<=1,'runtime started a multi-ball garbage packet');
    assert(Math.abs((s.p.bubbleT||0))<1e-7 || s.p.landed,'new ball was backdated into bubble/flight on its start update');
  }

  console.log('GARBAGE_BALL_INTERVAL_REGRESSION PASS',JSON.stringify({
    expanded:expanded.length,
    starts:starts.map(s=>s.t),
    minGap:starts.length>1?Math.min(...starts.slice(1).map((s,i)=>s.t-starts[i].t)):null
  }));
})();
`;

runSuite(code,{timeout:120000});
