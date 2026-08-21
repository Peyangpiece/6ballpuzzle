/* Upward-triangle split-side invariant.
 *
 * For an ordinary (non-garbage) upward triangle, a protruding pile ball may
 * produce a 2+1 split only after the complete three-ball rigid body has no
 * collision-safe continuation. A legal rigid slope route always wins.
 *
 * Once a true split is unavoidable, contact side still decides which lower
 * ball becomes the solo ball.
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

    function fullRigidContinuation(board,members,motions){
        if(typeof hexPhysRigidSlopePlan!=="function")return null;
        const plan=hexPhysRigidSlopePlan(board,members,motions);
        if(!Array.isArray(plan)||plan.length!==members.length)return null;
        const ids=new Set(plan.map(p=>p?.ball?.id));
        if(ids.size!==members.length||!members.every(m=>ids.has(m.ball.id)))return null;
        return plan;
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
        if(normalUpTriplet(members)){
            // A protrusion is not itself a split condition. If the complete
            // three-ball body still has a collision-safe slope route, keep it
            // rigid. This prevents both premature 2+1 mode selection and the
            // visible impression that the triangle separated while airborne.
            const rigid=fullRigidContinuation(board,members,motions);
            if(rigid){
                window.__sixBallLastUpConvexRigidLandingV41="kept-rigid";
                return null;
            }
        }

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

        // Once a true split is unavoidable, preserve the canonical physical
        // 2+1 assignment: the lower ball on the contact side becomes the solo
        // ball and the remaining two travel together to the opposite side.
        if(!soloMotion||Math.sign(soloMotion.tx-solo.x)!==splitSide){
            soloMotion=outwardSoloMotion(board,solo,splitSide,base,own);
        }
        if(!soloMotion||Math.sign(soloMotion.tx-solo.x)!==splitSide)return base;

        window.__sixBallLastUpConvexRigidLandingV41="split-required";
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

    window.__hexUpConvexSplitSideVersion="up-convex-side-v2-rigid-first";
    window.__sixBallUpConvexSplitRequiresRigidFailure=true;
    window.__sixBallUpConvexAirSplitGuard=true;
    window.__hexUpConvexRightContactSoloSide="right";
    window.__hexUpConvexLeftContactSoloSide="left";
})();
