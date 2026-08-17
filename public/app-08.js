function updateVisuals(g, dt) {
g.pileFlowClock=(g.pileFlowClock||0)+dt;
const pileMemo=new Map();
const liveMemo=new Map();
const alive = new Set();
const scanMin=boardScanMin(g.board);
g._visualArcPivotById = new Map();

const liveBatch=collectLiveMotionBatch(g);
if(!g._liveBatchClock)g._liveBatchClock={seq:0,elapsed:0,duration:1/120};

if(liveBatch){
if(g._liveBatchClock.seq!==liveBatch.seq){
g._liveBatchClock={
seq:liveBatch.seq,elapsed:0,duration:liveBatch.duration,
states:new Map(liveBatch.members.map(m=>[m.cell.id,{startState:m.startState,endState:m.endState,naturalDuration:m.duration}]))
};
}else{
g._liveBatchClock.duration=Math.max(g._liveBatchClock.duration,liveBatch.duration);
}
g._liveBatchClock.elapsed=Math.min(
g._liveBatchClock.duration,
g._liveBatchClock.elapsed+dt
);
}else{
g._liveBatchClock={seq:0,elapsed:0,duration:1/120};
}

g._visualMovingIds = new Set();
g._visualMotionSeqById = new Map();
g._liveBatchIds=new Set(liveBatch?liveBatch.members.map(m=>m.cell.id):[]);
for (let yy = scanMin; yy < ROWS; yy++) for (let xx = 0; xx < W2; xx++) {
const cc = valid(xx, yy) ? g.board[yy][xx] : null;
if (!cc) continue;
const vv = g.vis.get(cc.id);
const hasPath = Array.isArray(cc.fallPath) && cc.fallPath.length;
if(hasPath && cc.fallPath[0]?.motionSeq)
g._visualMotionSeqById.set(cc.id,cc.fallPath[0].motionSeq);
const inTransit = !!vv && (Math.abs(vv.x - xx) > 0.015 || Math.abs(vv.y - yy) > 0.015);
if (hasPath || inTransit) g._visualMovingIds.add(cc.id);
}
const H = HEX_ROW_H;
const realDist = (ax, ay, bx, by) => Math.hypot((ax - bx) * 0.5, (ay - by) * H);

g._visualSyncSplitRelease = new Set();
const syncGroups = new Map();
for (let gy=scanMin; gy<ROWS; gy++) for (let gx=0; gx<W2; gx++) {
const gc = valid(gx,gy) ? g.board[gy][gx] : null;
if (!gc || !gc.visualSyncSplitGroup || gc.visualSyncSplitStage !== 0) continue;
if (!syncGroups.has(gc.visualSyncSplitGroup))
syncGroups.set(gc.visualSyncSplitGroup, []);
syncGroups.get(gc.visualSyncSplitGroup).push(gc);
}
for (const [gid, members] of syncGroups) {
if (members.length !== 2) continue;
let bothReady = true;
for (const gc of members) {
const gp = Array.isArray(gc.fallPath) ? gc.fallPath : [];
const gv = g.vis.get(gc.id);
if (!gv || gp.length < 2) { bothReady = false; break; }
const first = gp[0].to ? gp[0] : { to: gp[0] };
if (Math.abs(gv.x-first.to[0]) > 0.004 ||
Math.abs(gv.y-first.to[1]) > 0.004) {
bothReady = false;
break;
}
}
if (bothReady) g._visualSyncSplitRelease.add(gid);
}


for (let y = ROWS - 1; y >= scanMin; y--) {
for (let x = 0; x < W2; x++) {
const cell = valid(x, y) ? g.board[y][x] : null;
if (!cell) continue;
alive.add(cell.id);
let v = g.vis.get(cell.id);
if (!v) { v = { x, y, vy: 0, sq: 0 }; g.vis.set(cell.id, v); }
if(Number.isFinite(v.garbageBubbleT))v.garbageBubbleT+=dt;

if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) {
const rp = Array.isArray(cell.fallPath) && cell.fallPath.length ? cell.fallPath : null;
const rs = rp ? (rp[0].to ? rp[0] : { from:[x,y], to:rp[0], pivot:null }) : null;
if (rs && Array.isArray(rs.from)) {
v.x = rs.from[0];
v.y = rs.from[1];
} else {
v.x = x;
v.y = y;
}
v.vy = Number.isFinite(v.vy) ? Math.max(0, v.vy) : 0;
v.motionSpeed = Number.isFinite(v.motionSpeed) ? Math.max(0, v.motionSpeed) : 0;
delete v._segKey;
delete v._segP;
delete v._segStartVisualY;
delete v._segAngle;
delete v._segTargetAngle;
delete v._segDir;
}

const maxVisualRowY = (FLOOR_CENTER_N - BOARD_TOP_CENTER_N) / HEX_ROW_H;
if (v.y > maxVisualRowY) {
v.y = maxVisualRowY;
v.vy = Math.min(0, v.vy || 0);
}

const visualOldX = v.x, visualOldY = v.y;
const path = Array.isArray(cell.fallPath) ? cell.fallPath : null;
const rawSeg = path && path.length ? path[0] : null;
const seg = rawSeg ? (rawSeg.to ? rawSeg : { from: [v.x, v.y], to: rawSeg, pivot: null }) : null;

if(seg?.pileFlow && updateScheduledPileFlowVisual(g,cell,v,dt,pileMemo)){
continue;
}

const liveBatchMember=
!!seg &&
!!liveBatch &&
seg.motionSeq===liveBatch.seq;

if(liveBatchMember){
const batchDuration=Math.max(1e-9,g._liveBatchClock.duration);
const t=Math.min(1,g._liveBatchClock.elapsed/batchDuration);
const motionState=g._liveBatchClock.states?.get(cell.id);
const member=liveBatch.byId?.get(cell.id);
const [nx,ny]=liveBatchPointAt(liveBatch,member,t,g._liveBatchClock.states,liveMemo);

v.x=nx;
v.y=Math.max(visualOldY,ny);

if(seg.pivot)g._visualArcPivotById.set(cell.id,seg.pivot);
else if(seg.topPivot)g._visualArcPivotById.set(cell.id,seg.topPivot);

v.motionSpeed=Math.max(0.0001,motionState?.endState?.speed||0);
v.vy=Math.max(0,motionState?.endState?.vy||0);

if(t>=1-1e-9){
v.x=seg.to[0];
v.y=seg.to[1];
}

} else if (seg) {
v.motionSpeed=Math.max(v.motionSpeed||0,0.0001);
const [sx, sy] = seg.from;
const [tx, ty] = seg.to;
const segKey = `${sx},${sy}->${tx},${ty}`;
const atStart = realDist(v.x, v.y, sx, sy) <= 0.012;

if (!atStart && v._segKey !== segKey) {
const dx = sx - v.x;
if (Math.abs(dx) > 0.002) v.x += Math.sign(dx) * Math.min(Math.abs(dx), PIECE_SNAP_SPEED * dt);
if (v.y < sy - 0.002) {
v.vy = Math.max(0, v.vy) + GRAV * dt;
v.y = Math.min(sy, v.y + v.vy * dt);
} else {
v.vy = Math.max(0, v.vy || 0);
}
const closeX = Math.abs(v.x - sx) <= 0.018;
const reachedOrPassedY = v.y >= sy - 0.018;
if (closeX && reachedOrPassedY) {
v.x = sx;
v.y = Math.max(v.y, sy);
v.vy = Math.max(0, v.vy || 0);
v.motionSpeed = Math.max(v.motionSpeed || 0, 0.0001);
if (!seg.pivot) {
v._segKey = segKey;
v._segP = 0;
} else {
delete v._segKey;
delete v._segP;
delete v._segAngle;
delete v._segTargetAngle;
delete v._segDir;
}
v._segStartVisualY = v.y;
if (cell.isGarbage) cell.garbageSpawnHold = false;
}
} else if (seg.pivot) {
const key = segKey;
const [px, py] = seg.pivot;
g._visualArcPivotById.set(cell.id, [px, py]);

const srX=(sx-px)*0.5, srY=(sy-py)*H;
const trX=(tx-px)*0.5, trY=(ty-py)*H;
const logicalA0=Math.atan2(srY,srX);
let logicalA1=Math.atan2(trY,trX);
let logicalDa=logicalA1-logicalA0;
while(logicalDa>Math.PI)logicalDa-=Math.PI*2;
while(logicalDa<-Math.PI)logicalDa+=Math.PI*2;

const dir=Math.sign(logicalDa||1);
const arcTotal=Math.abs(logicalDa);

const arcStateValid=
v._segKey===key &&
Number.isFinite(v._segProgress) &&
Number.isFinite(v._segArcTotal) &&
Number.isFinite(v._segStartAngle) &&
Number.isFinite(v._segDir);

if(!arcStateValid){
v._segKey=key;
v._segStartAngle=logicalA0;
v._segArcTotal=arcTotal;
v._segDir=dir;

const curA=Math.atan2((v.y-py)*H,(v.x-px)*0.5);
let rel=curA-logicalA0;
while(rel>Math.PI)rel-=Math.PI*2;
while(rel<-Math.PI)rel+=Math.PI*2;
v._segProgress=Math.max(0,Math.min(arcTotal,dir*rel));

v.vy=Math.max(0,Number.isFinite(v.vy)?v.vy:0);
v.motionSpeed=SLIDE_SPEED;
}

const remain=Math.max(0,v._segArcTotal-v._segProgress);
const stepA=Math.min(remain,SLIDE_SPEED*dt);
v._segProgress+=stepA;

const a=v._segStartAngle+v._segDir*v._segProgress;
const nextX=px+Math.cos(a)/0.5;
const nextY=py+Math.sin(a)/H;

v.x=nextX;
v.y=Math.max(visualOldY,nextY);

const tangentDown=Math.max(
0,
v._segDir*SLIDE_SPEED*Math.cos(a)/H
);
v.vy=Math.max(v.vy||0,tangentDown);
v.motionSpeed=SLIDE_SPEED;

if(remain<=SLIDE_SPEED*dt+1e-9){
v.x=tx;
v.y=Math.max(visualOldY,ty);
v._pendingPathComplete={
tx,ty,
endAngle:a,
endDir:v._segDir,
type:"arc"
};
}
} else {
if (v._segKey !== segKey) { v._segKey = segKey; v._segP = 0; }
const dx = tx - v.x;
if (Math.abs(dx) > 0.002) v.x += Math.sign(dx) * Math.min(Math.abs(dx), PIECE_SNAP_SPEED * dt);
if (v.y < ty - 0.002) {
v.vy = Math.max(0.0001, v.vy || 0) + GRAV * dt;
v.motionSpeed = Math.max(v.motionSpeed || 0, v.vy);
v.y = Math.min(ty, v.y + v.vy * dt);
} else {
v.y = ty;
if (path.length <= 1) {
v.vy = 0;
v.motionSpeed = 0;
} else {
v.vy = Math.max(v.vy || 0, 0.0001);
v.motionSpeed = Math.max(v.motionSpeed || 0, v.vy);
}
}
if (Math.abs(v.x - tx) <= 0.004 && Math.abs(v.y - ty) <= 0.004) {
v.x=tx;
v.y=ty;
v._pendingPathComplete={tx,ty,type:"linear"};
}
}
} else {
const dx = x - v.x;
if (Math.abs(dx) > 0.002) v.x += Math.sign(dx) * Math.min(Math.abs(dx), PIECE_SNAP_SPEED * dt);
else v.x = x;
if (v.y < y - 0.002) {
v.vy = Math.max(0.0001, v.vy || 0) + GRAV * dt;
v.motionSpeed = Math.max(v.motionSpeed || 0, v.vy);
v.y = Math.min(y, v.y + v.vy * dt);
} else if (v.y > y + 0.002) {
v.y = Math.max(v.y, visualOldY);
v.vy = 0;
v.motionSpeed = 0;
v.gravityMismatch = true;
} else {
v.y = y;
v.vy = 0;
v.motionSpeed = 0;
}
}
let visualMoveAccepted=true;
if (!liveBatchMember &&
(Math.abs(v.x-visualOldX)>1e-7 || Math.abs(v.y-visualOldY)>1e-7)) {
const [cx,cy,movedFrac]=clampVisualSegment(g,cell.id,visualOldX,visualOldY,v.x,v.y);
if (movedFrac<0.999999) {
visualMoveAccepted=false;
v.x=cx; v.y=cy;
if (Array.isArray(cell.fallPath) && cell.fallPath.length) {
v.vy=Math.max(v.vy||0,0.0001);
v.motionSpeed=Math.max(v.motionSpeed||0,0.0001);
} else {
v.vy=0; v.motionSpeed=0;
}
}
}

if (v._pendingPathComplete) {
const done=v._pendingPathComplete;
const reached=visualMoveAccepted &&
Math.abs(v.x-done.tx)<=0.004 &&
Math.abs(v.y-done.ty)<=0.004;

const syncBoundaryBlocked =
!!cell.visualSyncSplitGroup &&
cell.visualSyncSplitStage === 0 &&
!g._visualSyncSplitRelease.has(cell.visualSyncSplitGroup);

if (liveBatchMember) {
} else if (reached && Array.isArray(cell.fallPath) && cell.fallPath.length && !syncBoundaryBlocked) {
cell.fallPath.shift();
if (cell.visualSyncSplitGroup && cell.visualSyncSplitStage === 0) {
cell.visualSyncSplitStage = 1;
}
const nextSeg=cell.fallPath.length
? (cell.fallPath[0].to ? cell.fallPath[0] : {
from:[done.tx,done.ty],to:cell.fallPath[0],pivot:null
})
: null;

if (done.type==="arc" && nextSeg && !nextSeg.pivot) {
const tangentDown=Math.max(
0,done.endDir*SLIDE_SPEED*Math.cos(done.endAngle));
v.vy=Math.max(v.vy||0,tangentDown/H,0.0001);
v.motionSpeed=Math.max(SLIDE_SPEED,v.motionSpeed||0);
} else if (nextSeg) {
v.vy=Math.max(v.vy||0,0.0001);
v.motionSpeed=Math.max(
v.motionSpeed||0,
nextSeg.pivot?SLIDE_SPEED:(v.vy||0));
} else {
v.vy=0; v.motionSpeed=0;
}

delete v._segKey; delete v._segP; delete v._segStartVisualY;
delete v._segAngle; delete v._segProgress; delete v._segArcTotal; delete v._segStartAngle; delete v._segTargetAngle; delete v._segDir;
if (!cell.fallPath.length) {
delete cell.fallPath;
cell.visualPreReleaseRemaining=0;
if(v.pileFlow){
v.pileFlow=false;
v.vy=0;
v.motionSpeed=0;
}
}
} else if (!reached && done.type==="arc") {
delete v._segKey;
delete v._segAngle; delete v._segProgress; delete v._segArcTotal; delete v._segStartAngle;
delete v._segTargetAngle;
delete v._segDir;
}
delete v._pendingPathComplete;
}

if(v.y < visualOldY - 1e-9){
v.y=visualOldY;
v.vy=Math.max(0,v.vy||0);
}

if(v.justReleased){
const moving=Array.isArray(cell.fallPath)&&cell.fallPath.length;
if(moving || Math.abs(v.x-x)>0.002 || Math.abs(v.y-y)>0.002){
v.justReleased=false;
}else if(!moving){
v.justReleased=false;
v.vy=0;
v.motionSpeed=0;
}
}

v.sq -= v.sq * Math.min(1,16*dt);
}
}


if(liveBatch &&
g._liveBatchClock.seq===liveBatch.seq &&
g._liveBatchClock.elapsed>=g._liveBatchClock.duration-1e-9){

for(const m of liveBatch.members){
m.v.x=m.seg.to[0];
m.v.y=m.seg.to[1];
}

for(const m of liveBatch.members){
const {cell,v,seg}=m;
const completedState=g._liveBatchClock.states?.get(cell.id)?.endState;
if(!Array.isArray(cell.fallPath)||!cell.fallPath.length)continue;
const cur=cell.fallPath[0];
if(!cur?.to || cur.motionSeq!==liveBatch.seq)continue;

cell.fallPath.shift();

if(cell.visualSyncSplitGroup && cell.visualSyncSplitStage===0)
cell.visualSyncSplitStage=1;

delete v._segKey;
delete v._segP;
delete v._segStartVisualY;
delete v._segAngle;
delete v._segProgress;
delete v._segArcTotal;
delete v._segStartAngle;
delete v._segTargetAngle;
delete v._segDir;
delete v._pendingPathComplete;

if(!cell.fallPath.length){
delete cell.fallPath;
// Keep exit velocity until the canonical solver decides whether another
// segment follows. This removes the one-frame stop/restart at every lattice
// boundary while a ball is still in uninterrupted free fall.
v.vy=Math.max(0,completedState?.vy||v.vy||0);
v.motionSpeed=Math.max(0,completedState?.speed||v.motionSpeed||0);
}
}

g._liveBatchClock={seq:0,elapsed:0,duration:1/120};

const canChainSettle =
g.state==="RESOLVING" &&
(
g.phase==="SETTLE" ||
(g.phase==="CLEAR" && g.clearing?.committed)
);

if(canChainSettle &&
pendingFallPathCount(g)===0 &&
hasLegalGravityMove(g.board)){

releaseSettledConstraints(g,"VISUAL_BATCH_CHAIN");
const chained=settlePass(g.board);

if(chained)g.ver++;
}
}

for (const id of Array.from(g.vis.keys())) if (!alive.has(id)) g.vis.delete(id);
if (g.rotAnim.p < 1) g.rotAnim.p = Math.min(1, g.rotAnim.p + dt / ROTATE_VISUAL_TIME);
if (g.piece) {
if (g.freeX != null) g.pieceVX = g.freeX;
else {
const pdx = g.piece.x - g.pieceVX;
if (Math.abs(pdx) <= PIECE_SNAP_SPEED * dt) g.pieceVX = g.piece.x;
else g.pieceVX += Math.sign(pdx) * PIECE_SNAP_SPEED * dt;
}
g.pieceVY += (g.piece.y - g.pieceVY) * Math.min(1, 18 * dt);
}
}

function legacyPreventVisualOverlap(g) {
    const items=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const c=valid(x,y)?g.board[y][x]:null;
        if(!c)continue;
        const v=g.vis.get(c.id);
        if(v)items.push({id:c.id,tx:x,ty:y,v});
    }

    const MIN=1.0005;
    const H=HEX_ROW_H;
    const floorMax=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/H;

    // Position-based collision constraints.
    // Horizontal separation is preferred because it never creates a visual "hop".
    // Gaps are allowed; penetration is not.
    for(let pass=0;pass<32;pass++){
        let changed=false;

        for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
            const a=items[i],b=items[j];
            let dx=(a.v.x-b.v.x)*0.5;
            let dy=(a.v.y-b.v.y)*H;
            let d=Math.hypot(dx,dy);
            if(d>=MIN-1e-7)continue;

            changed=true;
            const overlap=MIN-d;

            // If horizontal component exists, separate along horizontal component only.
            // This preserves gravity direction and cannot lift either ball.
            if(Math.abs(dx)>1e-5){
                const dir=Math.sign(dx);
                // Each visual moves half the missing real distance.
                const gridShift=overlap; // normalized half-shift / 0.5 => overlap
                a.v.x+=dir*gridShift;
                b.v.x-=dir*gridShift;
            }else{
                // Same X: deterministic left/right split by id.
                const dir=(a.id<b.id)?-1:1;
                const gridShift=overlap+0.0005;
                a.v.x+=dir*gridShift;
                b.v.x-=dir*gridShift;
            }

            // Position projection is a collision correction, not a stop event.
            // Keep both balls' incoming momentum while either is still in motion.
            if (!(g._visualMovingIds && g._visualMovingIds.has(a.id))) {
                a.v.vy=0; a.v.motionSpeed=0;
            }
            if (!(g._visualMovingIds && g._visualMovingIds.has(b.id))) {
                b.v.vy=0; b.v.motionSpeed=0;
            }
        }

        if(!changed)break;
    }

    // Second phase: if a pair remains too close because several constraints compete,
    // move the visually lower ball downward when floor permits; otherwise widen horizontally.
    for(let pass=0;pass<16;pass++){
        let changed=false;
        for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
            const a=items[i],b=items[j];
            const dx=(a.v.x-b.v.x)*0.5;
            const dy=(a.v.y-b.v.y)*H;
            const d=Math.hypot(dx,dy);
            if(d>=MIN-1e-7)continue;
            changed=true;

            const lower=a.v.y>=b.v.y?a:b;
            const other=lower===a?b:a;
            const realDx=Math.abs((lower.v.x-other.v.x)*0.5);
            const needY=Math.sqrt(Math.max(0,MIN*MIN-realDx*realDx));
            const otherY=other.v.y*H;
            const targetY=(otherY+needY)/H;

            if(targetY<=floorMax+1e-7 && targetY>=lower.v.y){
                lower.v.y=targetY;
            }else{
                const dir=(lower.v.x<=other.v.x)?-1:1;
                const needX=Math.sqrt(Math.max(0,MIN*MIN-((lower.v.y-other.v.y)*H)**2));
                const currentX=Math.abs((lower.v.x-other.v.x)*0.5);
                const extra=Math.max(0,needX-currentX);
                lower.v.x+=dir*(extra/0.5+0.0005);
            }
            if (!(g._visualMovingIds && g._visualMovingIds.has(lower.id))) {
                lower.v.vy=0;
                lower.v.motionSpeed=0;
            }
        }
        if(!changed)break;
    }
    // Emergency invariant recovery without animation skipping.
    // If numerical competition leaves a tiny overlap, project the pair apart in-place.
    // Never teleport a moving ball to its logical destination and never delete its path.
    for(let emergency=0;emergency<12;emergency++){
        let fixedAny=false;
        for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
            const a=items[i],b=items[j];
            let dx=(a.v.x-b.v.x)*0.5;
            let dy=(a.v.y-b.v.y)*H;
            let d=Math.hypot(dx,dy);
            if(d>=0.9999)continue;

            fixedAny=true;
            if(d<1e-8){
                const dir=(a.id<b.id)?-1:1;
                a.v.x+=dir*0.50005;
                b.v.x-=dir*0.50005;
                continue;
            }

            const missing=1.00005-d;
            const nx=dx/d, ny=dy/d;
            // Convert normalized real displacement back to doubled-x / lattice-y.
            const sx=(missing*0.5*nx)/0.5;
            const sy=(missing*0.5*ny)/H;

            a.v.x+=sx; a.v.y+=sy;
            b.v.x-=sx; b.v.y-=sy;

            // Respect the common floor without killing tangential/remaining motion.
            a.v.y=Math.min(a.v.y,floorMax);
            b.v.y=Math.min(b.v.y,floorMax);
        }
        if(!fixedAny)break;
    }
}

// Final render-space contact constraint. Logical cells are always unique, but
// their continuous trajectories can meet between cells (for example a diagonal
// follower cutting the chord around a stationary support). Correct only the
// penetration; keep fallPath and velocity intact so the intended motion resumes
// on the next frame instead of freezing or teleporting.
function resolveVisualContacts(g){
    const items=[];
    for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
        const ball=valid(x,y)?g.board[y][x]:null,v=ball&&g.vis.get(ball.id);
        if(ball&&v&&Number.isFinite(v.x)&&Number.isFinite(v.y))items.push({ball,v,x,y,moving:!!(g._visualMovingIds?.has(ball.id)||ball.fallPath?.length)});
    }
    if(items.length<2)return;
    const H=HEX_ROW_H,MIN=1,floorMax=(FLOOR_CENTER_N-BOARD_TOP_CENTER_N)/H;
    const shift=(q,px,py)=>{
        // Once an individual garbage ball has gridified it may slide/fall, but
        // collision correction itself must never lift it. Convert an attempted
        // upward correction into an equal horizontal escape so y remains
        // monotone. Repeated contact passes distribute any residual safely.
        if(q.ball?.isGarbage&&py<0){
            const mag=Math.hypot(px,py);
            let dir=Math.sign(px);
            if(!dir)dir=Math.sign(q.x-q.v.x)||((q.ball.id&1)?1:-1);
            px=dir*mag;
            py=0;
        }
        const ox=q.v.x,oy=q.v.y;
        q.v.x=Math.max(0,Math.min(W2-1,q.v.x+px/.5));
        q.v.y=Math.min(floorMax,q.v.y+py/H);
        return[(q.v.x-ox)*.5,(q.v.y-oy)*H];
    };
    const solvePair=(a,b)=>{
        let dx=(a.v.x-b.v.x)*.5,dy=(a.v.y-b.v.y)*H,d=Math.hypot(dx,dy);
        if(d>=MIN-1e-9)return false;
        if(d<1e-10){
            const logicalDx=(a.x-b.x)*.5,logicalDy=(a.y-b.y)*H,ld=Math.hypot(logicalDx,logicalDy);
            if(ld>1e-10){dx=logicalDx/ld;dy=logicalDy/ld;}else{dx=a.ball.id<b.ball.id?-1:1;dy=0;}
            d=0;
        }else{dx/=d;dy/=d;}
        const missing=MIN-d;
        let wa=a.moving&&!b.moving?1:(!a.moving&&b.moving?0:.5),wb=1-wa;
        shift(a,dx*missing*wa,dy*missing*wa);
        shift(b,-dx*missing*wb,-dy*missing*wb);
        // A wall or the floor can absorb one side's requested displacement.
        // Give any residual to the other ball, then the first, until contact is exact.
        for(let retry=0;retry<3;retry++){
            const rx=(a.v.x-b.v.x)*.5,ry=(a.v.y-b.v.y)*H,rd=Math.hypot(rx,ry);
            if(rd>=MIN-1e-9)break;
            const nx=rd>1e-10?rx/rd:dx,ny=rd>1e-10?ry/rd:dy,need=MIN-rd;
            const first=(a.moving&&!b.moving)?a:((b.moving&&!a.moving)?b:(retry&1?a:b));
            const sign=first===a?1:-1;
            const moved=shift(first,nx*need*sign,ny*need*sign),gain=Math.hypot(moved[0],moved[1]);
            if(gain<need*.25){const other=first===a?b:a;shift(other,-nx*need*sign,-ny*need*sign);}
        }
        return true;
    };
    // Unit-size spatial buckets make the constraint proportional to nearby
    // contacts instead of every pair on the board. Rebuild after each changed
    // pass because a dense projection can create a new neighbour.
    const nearbyPairs=()=>{
        const buckets=new Map(),pairs=[];
        for(let i=0;i<items.length;i++){
            const q=items[i],bx=Math.floor(q.v.x*.5),by=Math.floor(q.v.y*H),key=bx+","+by;
            if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i);
        }
        for(let i=0;i<items.length;i++){
            const q=items[i],bx=Math.floor(q.v.x*.5),by=Math.floor(q.v.y*H);
            for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++)for(const j of buckets.get((bx+ox)+","+(by+oy))||[])if(j>i)pairs.push([q,items[j]]);
        }
        return pairs;
    };
    for(let pass=0;pass<48;pass++){
        let changed=false;
        for(const[a,b]of nearbyPairs())if(solvePair(a,b))changed=true;
        if(!changed)break;
    }
}

// Visual-path deadlock recovery shared by player and CPU.
// The logical board is already a legal, non-overlapping lattice state; if rendering cannot
// consume its path, discard only the stale visual route and snap visuals to that exact state.
// This prevents one side from freezing forever without changing game physics or board results.
function pendingFallPathCount(g) {
    let n = 0;
    for (let y=boardScanMin(g.board);y<ROWS;y++) for (let x=0;x<W2;x++) {
        const c = valid(x,y) ? g.board[y][x] : null;
        if (c && Array.isArray(c.fallPath)) n += c.fallPath.length;
    }
    return n;
}

function forceSyncVisualsToLogical(g, reason = "SETTLE_WATCHDOG") {
    // 最終安全弁でも瞬間ワープさせない。
    // staleなfallPathだけ捨て、現在の表示位置は保持する。
    // 次のupdateVisualsで合法な論理セルへ重力/一定速横補正で自然に追いつかせる。
    for (let y = boardScanMin(g.board); y < ROWS; y++) for (let x = 0; x < W2; x++) {
        const cell = valid(x, y) ? g.board[y][x] : null;
        if (!cell) continue;
        if (Array.isArray(cell.fallPath)) delete cell.fallPath;
        let v = g.vis.get(cell.id);
        if (!v) {
            v = { x, y, vy: 0, sq: 0 };
            g.vis.set(cell.id, v);
        }
        delete v._segKey;
        delete v._segP;
        delete v.garbAnim;
        // x/yは変更しない。重力に逆らう上方向snapは禁止。
    }
    g.activeCluster = null;
    g.landingSpecial = null;
    g.rigidSlideDir = 0;
    g.rigidSlideSteps = 0;
    if (!g.physicsWatch) g.physicsWatch = { lastSig: "", repeats: 0, steps: 0, fallbacks: 0 };
    g.physicsWatch.fallbacks = (g.physicsWatch.fallbacks || 0) + 1;
    g.physicsWatch.lastReason = reason;
    g.ver++;
}

/* tol = 0 で完全一致、0.4 程度なら「だいたい追いついた」判定 */
function nearlySettled(g, tol) {
    for (let y = boardScanMin(g.board); y < ROWS; y++)
        for (let x = 0; x < W2; x++) {
            const cell = valid(x, y) ? g.board[y][x] : null;
            if (!cell)
                continue;
            const v = g.vis.get(cell.id);
            if (Array.isArray(cell.fallPath) && cell.fallPath.length) return false;
            if (v && (Math.abs(v.y - y) > tol || Math.abs(v.x - x) > tol)) return false;
        }
    return true;
}
const SETTLE_TOL = 0.34;
