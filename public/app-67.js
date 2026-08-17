/* Atomic logical motion and global target reservation.
 *
 * A physics event is a simultaneous permutation of board balls.  The previous
 * core accepted bundles independently, so two accepted bundles could reserve
 * the same empty target. hexPhysApplyEvent then cleared every source first and
 * silently `continue`d any placement whose target had become occupied. That
 * deletes a real ball from the board.
 *
 * Invariants:
 *  - one accepted proposal per source ball;
 *  - one accepted proposal per target cell across ALL bundles in the event;
 *  - every target is empty or occupied by another ball in the same event that
 *    is guaranteed to vacate it;
 *  - validation completes before the first board cell is mutated;
 *  - an invalid event is rejected as a whole; no partial placement is legal.
 */
const __hexBundleTargetsFreeBeforeAtomicConservation=hexPhysBundleTargetsFree;
hexPhysBundleTargetsFree=function(bundle,b,accepted){
    if(!__hexBundleTargetsFreeBeforeAtomicConservation(bundle,b,accepted))return false;
    const acceptedTargets=new Set((accepted||[]).map(p=>p.tx+","+p.ty));
    const acceptedSources=new Set((accepted||[]).map(p=>p.ball?.id).filter(Boolean));
    const localSources=new Set((bundle||[]).map(p=>p.ball?.id).filter(Boolean));
    const localTargets=new Set();
    for(const p of bundle||[]){
        if(!p?.ball||!valid(p.tx,p.ty))return false;
        const key=p.tx+","+p.ty;
        if(acceptedTargets.has(key)||localTargets.has(key))return false;
        localTargets.add(key);
        const occupant=b[p.ty][p.tx];
        if(occupant&&!acceptedSources.has(occupant.id)&&!localSources.has(occupant.id))return false;
    }
    return true;
};

function hexValidateAtomicEvent(b,accepted){
    if(!Array.isArray(accepted)||!accepted.length)return false;
    const sourceIds=new Set(),targetKeys=new Set();
    for(const p of accepted){
        if(!p?.ball||!valid(p.x,p.y)||!valid(p.tx,p.ty))return false;
        if(b[p.y][p.x]!==p.ball)return false;
        if(sourceIds.has(p.ball.id))return false;
        sourceIds.add(p.ball.id);
        const key=p.tx+","+p.ty;
        if(targetKeys.has(key))return false;
        targetKeys.add(key);
    }
    for(const p of accepted){
        const occupant=b[p.ty][p.tx];
        if(occupant&&!sourceIds.has(occupant.id))return false;
    }
    return true;
}

hexPhysApplyEvent=function(b,accepted){
    if(!hexValidateAtomicEvent(b,accepted))return false;
    clearBoardEquilibriumLocks(b);
    const seq=HEX_PHYS_EVENT_SEQ++;
    // Validation above guarantees that every target will be available after
    // this simultaneous source clear. No placement branch may skip a ball.
    for(const p of accepted)b[p.y][p.x]=null;
    for(const p of accepted){
        b[p.ty][p.tx]=p.ball;
        noteBoardCell(b,p.ty,p.ball);
    }
    for(const p of accepted)hexPhysAppendSegment(p.ball,p,seq);
    return true;
};
