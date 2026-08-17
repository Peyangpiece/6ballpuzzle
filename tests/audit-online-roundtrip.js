const {runSuite}=require('./audit-harness');
const suite=String.raw`
const bugs=[],stats={};function bug(type,data){stats[type]=(stats[type]||0)+1;if(bugs.length<100)bugs.push({type,...data});}
function boardState(g){const q=[];for(const[x,y]of VALID_CELLS){const b=g.board[y][x];q.push(b?b.c:-1);}return q;}
function visIds(g){const ids=[];for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){const b=valid(x,y)?g.board[y][x]:null;if(b)ids.push(b.id);}return ids;}
if(typeof snapshotOf!=='function'||typeof applySnapshot!=='function')bug('missing-network-snapshot-functions',{});
else for(const seed of [3,11,19,27,35]){
 const src=createEngine(0x71000000+seed);src.ai={level:1+seed%5,target:null,thinkT:0,actT:0};
 for(let step=0;step<1800&&src.alive;step++){if(step===600)src.incomingShapes.push('PYRAMID');if(step===1080)src.incomingShapes.push('HEXAGON');stepEngine(src,PHYSICS_FRAME);}
 const snap=snapshotOf(src),dst=createEngine(0x72000000+seed);dst.state='NET';dst.piece=null;
 applySnapshot(dst,snap,typeof remoteFxSnapshotOf==='function'?remoteFxSnapshotOf(src):null);
 if(snapshotOf(dst)!==snap)bug('snapshot-roundtrip-mismatch',{seed});
 if(JSON.stringify(boardState(dst))!==JSON.stringify(boardState(src)))bug('snapshot-color-board-mismatch',{seed});
 const ids1=visIds(dst);if(new Set(ids1).size!==ids1.length)bug('snapshot-duplicate-id',{seed,ids:ids1});
 for(const id of ids1)if(!dst.vis.has(id))bug('snapshot-missing-vis',{seed,id});
 // Applying the same network packet repeatedly must be idempotent: no ghost ids or vis growth.
 const count1=ids1.length,vis1=dst.vis.size,next1=dst.nextId;for(let k=0;k<8;k++)applySnapshot(dst,snap,null);const ids2=visIds(dst);
 if(ids2.length!==count1||dst.vis.size!==vis1)bug('snapshot-not-idempotent',{seed,count1,count2:ids2.length,vis1,vis2:dst.vis.size,next1,next2:dst.nextId});
 if(new Set(ids2).size!==ids2.length)bug('snapshot-repeat-duplicate-id',{seed});
 // Advance source, remove/add many cells, then apply a newer snapshot. Old remote visuals must disappear.
 for(let step=0;step<720&&src.alive;step++)stepEngine(src,PHYSICS_FRAME);
 const newer=snapshotOf(src);applySnapshot(dst,newer,typeof remoteFxSnapshotOf==='function'?remoteFxSnapshotOf(src):null);
 if(snapshotOf(dst)!==newer)bug('newer-snapshot-mismatch',{seed});
 const live=new Set(visIds(dst));for(const id of dst.vis.keys())if(!live.has(id))bug('stale-remote-visual',{seed,id});
 // Optional active-piece visual roundtrip if the production helpers are available.
 if(typeof pieceSnapshotOf==='function'&&typeof applyRemoteVisualState==='function'){
   const p=pieceSnapshotOf(src),fx=typeof remoteFxSnapshotOf==='function'?remoteFxSnapshotOf(src):null;
   applyRemoteVisualState(dst,{piece:p,fx,alive:src.alive,incoming:pendingIncomingCount(src)});
   if(p&&(!dst.piece||dst.state!=='NET'))bug('remote-piece-lost',{seed,p,dstPiece:dst.piece,state:dst.state});
   if(dst.piece){for(const k of ['x','y','rot'])if(!Number.isFinite(dst.piece[k]))bug('remote-piece-nan',{seed,k,piece:dst.piece});if(!Number.isFinite(dst.pieceVX)||!Number.isFinite(dst.netPieceFrac||0))bug('remote-piece-visual-nan',{seed,pieceVX:dst.pieceVX,frac:dst.netPieceFrac});}
 }
}
globalThis.__NET_AUDIT={stats,bugs};
`;
const ctx=runSuite(suite,{timeout:300000});console.log('ONLINE_ROUNDTRIP_AUDIT',JSON.stringify(ctx.__NET_AUDIT,null,2));if(Object.keys(ctx.__NET_AUDIT.stats).length)process.exitCode=1;
