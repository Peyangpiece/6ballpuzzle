/* Parity-safe active-piece hand-off.
 *
 * The active piece may lock at a continuous sub-cell X while its logical cells
 * are already final.  When an ordinary triplet member has no authored fallPath
 * after lock(), there is no physical motion left that can consume that sub-cell
 * offset.  On alternating rows this occurred most visibly for a down triangle
 * over a ball on even levels and an up/reverse triangle over a ball on odd
 * levels: the renderer tried to drift the already-settled ball back to its
 * logical cell, the collision clamp rejected that sideways chord, and SETTLE
 * waited forever for nearlySettled().
 *
 * Commit only newly released NORMAL members that have no motion path directly
 * to their already-accepted logical cell.  Members with a real fallPath keep
 * their exact fractional contact origin and existing arc/slide physics.
 */
(function installReleaseParitySettle(){
    if(typeof window==="undefined"||window.__hexReleaseParitySettle)return;
    if(typeof lock!=="function")return;
    window.__hexReleaseParitySettle=true;

    const baseLock=lock;

    function clearVisualMotionState(v){
        if(!v)return;
        v.vy=0;v.motionSpeed=0;v.gravityMismatch=false;v.justReleased=false;
        delete v._segKey;delete v._segP;delete v._segStartVisualY;
        delete v._segAngle;delete v._segProgress;delete v._segArcTotal;
        delete v._segStartAngle;delete v._segTargetAngle;delete v._segDir;
        delete v._pendingPathComplete;
    }

    function commitStaticReleaseMembers(g,firstId){
        if(!g?.board||!g?.vis)return 0;
        let committed=0;
        for(let y=boardScanMin(g.board);y<ROWS;y++)for(let x=0;x<W2;x++){
            const ball=valid(x,y)?g.board[y][x]:null;
            if(!ball||ball.isGarbage||ball.id<firstId||ball.id>=g.nextId)continue;
            if(Array.isArray(ball.fallPath)&&ball.fallPath.length)continue;
            const v=g.vis.get(ball.id);if(!v)continue;
            if(Math.abs(v.x-x)<=1e-9&&Math.abs(v.y-y)<=1e-9)continue;
            v.x=x;v.y=y;clearVisualMotionState(v);
            ball.releaseParityCommitted=true;
            committed++;
        }
        g._lastStaticReleaseParityCommits=committed;
        return committed;
    }

    lock=function(g,vy=2){
        const firstId=Number.isFinite(g?.nextId)?g.nextId:Infinity;
        const out=baseLock(g,vy);
        if(g?.state==="RESOLVING")commitStaticReleaseMembers(g,firstId);
        return out;
    };

    window.__hexCommitStaticReleaseMembers=commitStaticReleaseMembers;
    window.__hexReleaseParitySettleVersion="release-parity-v1";
    window.__hexStaticReleaseSubcellOffsetAllowed=false;
})();
