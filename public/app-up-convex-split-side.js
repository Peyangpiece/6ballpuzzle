/* Upward-triangle split-side invariant.
 *
 * For an ordinary (non-garbage) upward triangle, a protruding pile ball on the
 * right side of the triangle must detach exactly the right lower ball; the top
 * plus left lower ball stay together and move left.  A protrusion on the left
 * is the mirror image: the left lower ball detaches and the other two move
 * right.  This layer keeps the existing center-half split window and all
 * collision/arc calculations, but makes the 2+1 assignment explicitly follow
 * the physical contact side instead of any residual momentum/tie-break state.
 */
(function installUpConvexSplitSideInvariant(){
    if(typeof window==="undefined"||window.__hexUpConvexSplitSideInvariant)return;
    if(typeof hexPhysUpConvexSeparator!=="function")return;
    window.__hexUpConvexSplitSideInvariant=true;

    const baseSeparator=hexPhysUpConvexSeparator;

    function normalUpTriplet(members){
        return Array.isArray(members)&&members.length===3&&
            (members[0]?.orientation||members[0]?.ball?.motionGroupOrientation)==="up"&&
            members.every(m=>m?.ball&&!m.ball.isGarbage);
    }

    function outwardSoloMotion(board,solo,side,info,ignore){
        const tx=solo.x+side,ty=solo.y+1;
        if(!valid(tx,ty)||!hexPhysEmpty(board,tx,ty,ignore))return null;
        return{
            x:solo.x,y:solo.y,tx,ty,ball:solo.ball,
            kind:side<0?"ROLL_LEFT":"ROLL_RIGHT",
            pivot:[info.px,info.py],topPivot:null,followSupportIds:[]
        };
    }

    hexPhysUpConvexSeparator=function(board,members,motions){
        const base=baseSeparator(board,members,motions);
        if(!base||!normalUpTriplet(members))return base;

        // hitFraction is measured along the triangle's continuously shifted
        // lower edge. > .5 means the protruding support is on the RIGHT side
        // of the falling triangle; < .5 means it is on the LEFT side.
        const f=Number(base.hitFraction);
        if(!Number.isFinite(f)||Math.abs(f-.5)<=1e-9)return base;
        const splitSide=f>.5?1:-1; // +1: right solo, -1: left solo

        const lowerY=Math.max(...members.map(m=>m.y));
        const lower=members.filter(m=>m.y===lowerY).sort((a,b)=>a.x-b.x);
        const top=members.find(m=>m.y<lowerY);
        if(lower.length!==2||!top)return base;

        const solo=splitSide>0?lower[1]:lower[0];
        const pairLower=splitSide>0?lower[0]:lower[1];
        const own=new Set(members.filter(m=>m.ball.id!==solo.ball.id).map(m=>m.ball.id));
        let soloMotion=motions?.[members.indexOf(solo)]||null;

        // A true center-protrusion split has an unobstructed outward arc around
        // that protruding support. If a later wall/tie-break wrapper supplied a
        // different individual tendency, restore only this canonical outward
        // solo arc; the event resolver still performs the normal sweep safety
        // checks before accepting it.
        if(!soloMotion||Math.sign(soloMotion.tx-solo.x)!==splitSide){
            soloMotion=outwardSoloMotion(board,solo,splitSide,base,own);
        }
        if(!soloMotion||Math.sign(soloMotion.tx-solo.x)!==splitSide)return base;

        return{
            ...base,
            dir:-splitSide,
            top,
            pairLower,
            solo,
            soloMotion,
            splitSide,
            contactSide:splitSide>0?"right":"left"
        };
    };

    window.__hexUpConvexSplitSideVersion="up-convex-side-v1";
    window.__hexUpConvexRightContactSoloSide="right";
    window.__hexUpConvexLeftContactSoloSide="left";
})();
