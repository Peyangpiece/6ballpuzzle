/* HEXDROP active-input continuity repair.
 *
 * The active piece has continuous horizontal coordinates (pieceVX/freeX), but
 * app-09's normal/fast vertical clock still asks pieceFits() whether the next
 * complete lattice row is legal. app-63 later made pieceFits() continuous-aware,
 * so an off-lattice piece can be rejected before a full two-row descent even
 * though there is still open physical space. Shadow/hard-drop already use the
 * exact circle clearance. Make the special "current active piece -> next row"
 * query use that same physical clearance, while leaving every other pieceFits
 * caller (rotation, horizontal reachability, AI boards, etc.) unchanged.
 */
const __hex78PieceFitsBeforeActiveVertical=pieceFits;
pieceFits=function(board,p){
    const g=board?._hexEngine;
    const active=!!g&&g.state==="PLAYING"&&!!g.piece;
    const sameShape=active&&p&&
        p.x===g.piece.x&&p.y===g.piece.y+2&&p.rot===g.piece.rot&&
        p.colors===g.piece.colors;
    if(sameShape&&typeof hex64PhysicalDropClearanceRows==="function"){
        const legacy=typeof __hexPieceFitsBeforeContinuousLegality==="function"
            ? __hexPieceFitsBeforeContinuousLegality(board,p)
            : __hex78PieceFitsBeforeActiveVertical(board,p);
        if(!legacy)return false;
        const residual=typeof hexContinuousResidualX==="function"
            ? hexContinuousResidualX(g)
            : ((Number.isFinite(g.pieceVX)?g.pieceVX:g.piece.x)-g.piece.x);
        return hex64PhysicalDropClearanceRows(g,g.piece,residual)>=2-1e-7;
    }
    return __hex78PieceFitsBeforeActiveVertical(board,p);
};

/* Preserve the complete existing hard-drop pipeline. Only if it actually does
 * nothing while the engine is still PLAYING do we run the canonical physical
 * drop directly. This protects touch/keyboard instant drop from stale legacy
 * animation gates without changing successful hard-drop motion or pile rules.
 */
const __hex78HardDropBeforeInputRescue=hardDrop;
hardDrop=function(g){
    if(!g||g.state!=="PLAYING"||!g.piece)return false;
    const beforePiece=g.piece,beforeId=g.nextId,beforeState=g.state;
    __hex78HardDropBeforeInputRescue(g);
    if(g.state!==beforeState||g.piece!==beforePiece||g.nextId!==beforeId)return true;

    const pose=typeof hexActivePhysicalDropPose==="function"?hexActivePhysicalDropPose(g):null;
    if(!pose)return false;
    g.hardDropAnim=null;
    const dx=Number.isFinite(pose.dx)?pose.dx:
        ((Number.isFinite(g.pieceVX)?g.pieceVX:g.piece.x)-g.piece.x);
    const frac=Math.max(0,Math.min(2,Number(pose.frac)||0));
    armHardDropImpact(g,pose.piece,dx,frac);
    g.piece={...pose.piece};
    g.dropT=g.dropInterval*frac/2;
    emit(g,{t:"drop"});
    lock(g,5);
    if(typeof hex76UseSafeStraightHandoff==="function")
        hex76UseSafeStraightHandoff(g,[beforeId,beforeId+1,beforeId+2]);
    return g.state!=="PLAYING"||!g.piece;
};
