/* Upward-triangle rigid-first invariant.
 *
 * An ordinary (non-garbage) upward triplet keeps all three balls rigid for as
 * long as a collision-safe common rigid path exists. A single diagonal pile
 * contact is therefore a slope/pivot event first, not a split event.
 *
 * The complete triplet is allowed to rotate through the same 60-degree arc
 * around the external support. Only when that common rigid arc is physically
 * impossible may the existing 2+1 convex-split rule run. Once a true split is
 * unavoidable, contact side still decides which lower ball becomes the solo
 * ball.
 */
(function installUpConvexSplitSideInvariant(){
    if(typeof window==="undefined"||window.__hexUpConvexSplitSideInvariant)return;
    if(typeof hexPhysUpConvexSeparator!=="function"||typeof hexPhysPlanGroup!=="function")return;
    window.__hexUpConvexSplitSideInvariant=true;

    const baseSeparator=hexPhysUpConvexSeparator;
    const basePlanGroup=hexPhysPlanGroup;

    function normalUpTriplet(members){
        return Array.isArray(members)&&members.length===3&&
            (members[0]?.orientation||members[0]?.ball?.motionGroupOrientation)==="up"&&
            members.every(m=>m?.ball&&!m.ball.isGarbage);
    }

    function rotateCellAroundPivot(x,y,px,py,angle){
        const ox=latticeRealX(x)-latticeRealX(px);
        const oy=cellCenterYNorm(y)-cellCenterYNorm(py);
        const c=Math.cos(angle),s=Math.sin(angle);
        const rx=latticeRealX(px)+ox*c-oy*s;
        const ry=cellCenterYNorm(py)+ox*s+oy*c;
        const tx=Math.round(rx/.5);
        const ty=Math.round((ry-BOARD_TOP_CENTER_N)/HEX_ROW_H);
        if(Math.abs(latticeRealX(tx)-rx)>1e-7||Math.abs(cellCenterYNorm(ty)-ry)>1e-7)return null;
        return[tx,ty];
    }

    function preferredRigidDirection(members){
        const memberBias=members.map(m=>hexPhysBias(m.ball)).filter(Boolean);
        if(memberBias.length){
            const sum=memberBias.reduce((n,v)=>n+v,0);
            if(sum)return Math.sign(sum);
        }
        const top=members.find(m=>m.y===Math.min(...members.map(q=>q.y)));
        const offset=Number(top?.ball?.impactOffsetX);
        return Number.isFinite(offset)?Math.sign(offset):0;
    }

    function fullRigidArcContinuation(board,members){
        if(!normalUpTriplet(members))return null;
        const own=new Set(members.map(m=>m.ball.id));
        const contacts=[];
        const preferred=preferredRigidDirection(members);

        for(const m of members){
            for(const side of[-1,1]){
                const px=m.x+side,py=m.y+1;
                const support=valid(px,py)?board[py][px]:null;
                if(!support||own.has(support.id))continue;
                const rollDir=-side;
                if(preferred&&rollDir!==preferred)continue;
                contacts.push({member:m,side,px,py,support,rollDir});
            }
        }
        if(!contacts.length)return null;

        const bundle=members[0]?.ball?.motionGroupId||HEX_PHYS_GROUP_SEQ;
        const candidates=[];
        for(const contact of contacts){
            const angle=contact.side>0?-Math.PI/3:Math.PI/3;
            const targets=[],used=new Set();
            let descent=0,safe=true;

            for(const m of members){
                const target=rotateCellAroundPivot(m.x,m.y,contact.px,contact.py,angle);
                if(!target){safe=false;break;}
                const[tx,ty]=target,key=tx+","+ty;
                const q=valid(tx,ty)?board[ty][tx]:null;
                if(!valid(tx,ty)||used.has(key)||(q&&!own.has(q.id))||ty<m.y){safe=false;break;}
                used.add(key);
                descent+=ty-m.y;
                targets.push({
                    x:m.x,y:m.y,tx,ty,ball:m.ball,
                    kind:"GROUP_SLOPE_ROLL",
                    pivot:[contact.px,contact.py],topPivot:null,
                    followSupportIds:[contact.support.id],
                    bundleId:bundle,groupSize:members.length,
                    rigidDirection:contact.rollDir
                });
            }

            if(!safe||descent<=0)continue;
            if(targets.some(p=>hexPhysPathHitsStationary(p,board,own)))continue;
            candidates.push({plan:targets,descent,dir:contact.rollDir,pivotId:contact.support.id});
        }

        candidates.sort((a,b)=>b.descent-a.descent||a.pivotId-b.pivotId);
        return candidates[0]||null;
    }

    function keepTripletMetadata(members,dir){
        const gid=members[0]?.ball?.motionGroupId||HEX_PHYS_GROUP_SEQ++;
        for(const m of members){
            m.ball.motionGroupId=gid;
            m.ball.motionGroupSize=3;
            m.ball.rigid=true;
            if(dir){
                m.ball.momentumX=dir;
                m.ball.rollDir=dir;
                m.ball.subCellBias=dir;
            }
        }
    }

    // Authoritative normal-triplet router: before the legacy planner can turn
    // one transiently supported member into a pinned singleton, attempt the
    // complete three-ball rigid arc. This is what prevents a visible airborne
    // 1+2 separation while all three still have one legal downhill motion.
    hexPhysPlanGroup=function(board,members,preview=false){
        if(normalUpTriplet(members)){
            const rigid=fullRigidArcContinuation(board,members);
            if(rigid){
                if(!preview)keepTripletMetadata(members,rigid.dir);
                window.__sixBallLastUpConvexRigidLandingV42="kept-rigid-arc";
                return rigid.plan;
            }
        }
        return basePlanGroup(board,members,preview);
    };

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
            const rigid=fullRigidArcContinuation(board,members);
            if(rigid){
                window.__sixBallLastUpConvexRigidLandingV42="kept-rigid-arc";
                return null;
            }
        }

        const base=baseSeparator(board,members,motions);
        if(!base||!normalUpTriplet(members))return base;

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

        if(!soloMotion||Math.sign(soloMotion.tx-solo.x)!==splitSide){
            soloMotion=outwardSoloMotion(board,solo,splitSide,base,own);
        }
        if(!soloMotion||Math.sign(soloMotion.tx-solo.x)!==splitSide)return base;

        window.__sixBallLastUpConvexRigidLandingV42="split-required";
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

    window.__hexUpConvexSplitSideVersion="up-convex-side-v3-rigid-arc-first";
    window.__sixBallUpConvexSplitRequiresRigidFailure=true;
    window.__sixBallUpConvexAirSplitGuard=true;
    window.__sixBallUpConvexRigidArcFirst=true;
    window.__hexUpConvexRightContactSoloSide="right";
    window.__hexUpConvexLeftContactSoloSide="left";
})();
