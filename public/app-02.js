function applyHeldGroupMove(b,members,dx,dy){
    for(const m of members)b[m.y][m.x]=null;
    for(const m of members){
        const nx=m.x+dx,ny=m.y+dy;
        b[ny][nx]=m.ball;
        if(!Array.isArray(m.ball.fallPath))m.ball.fallPath=[];
        const pivot=(dy===1&&Math.abs(dx)===1)?[m.x-dx,m.y+1]:null;
        m.ball.fallPath.push({from:[m.x,m.y],to:[nx,ny],pivot});
        if(dx){
            m.ball.rollDir=Math.sign(dx);
            m.ball.momentumX=Math.sign(dx);
            m.ball.subCellBias=Math.sign(dx);
        }else if(dy>=2){
            m.ball.rollDir=0;
        }
    }
}
function markVisualReleaseStage(members, orientation, gateRoles){
    const gid=members[0]?.ball?.visualTripletId || members[0]?.ball?.shapeGroupId || 0;
    for(const m of members){
        const p=Array.isArray(m.ball.fallPath)?m.ball.fallPath:[];
        m.ball.visualPreReleaseRemaining=p.length;
        m.ball.visualReleaseGroupId=gid;
        m.ball.visualReleaseOrientation=orientation;
        m.ball.visualReleaseGateRoles=gateRoles.slice();
    }
}
function releaseDownTriangle(members){
    // ▼ roles: 0=left upper, 1=right upper, 2=bottom.
    markVisualReleaseStage(members,"down",[2]);
    for(const m of members){
        m.ball.shapeHeld=false;
        m.ball.shapeGroupId=0;
        m.ball.shapeOrientation="";
        if(m.role===0){
            m.ball.fallBias=-1;
            m.ball.fallBiasTTL=1;
            m.ball.forceSplit=true;
        }else if(m.role===1){
            m.ball.fallBias=1;
            m.ball.fallBiasTTL=1;
            m.ball.forceSplit=true;
        }else{
            m.ball.fallBias=0;
            m.ball.fallBiasTTL=0;
            m.ball.forceSplit=false;
        }
    }
}
function releaseUpTriangle(members, gateRoles=[1,2]){
    // ▲ roles: 0=top, 1=right lower, 2=left lower.
    markVisualReleaseStage(members,"up",gateRoles);
    // Release condition only; direction after release is determined by live contacts.
    for(const m of members){
        m.ball.shapeHeld=false;
        m.ball.shapeGroupId=0;
        m.ball.shapeOrientation="";
        m.ball.forceSplit=false;
        m.ball.fallBias=0;
        m.ball.fallBiasTTL=0;
    }
}
function memberMoveWithoutGroup(b,members,m){
    // Keep the queried ball itself on the board; remove only the other two members.
    // Removing the queried ball as well made settleStep() return null and falsely
    // classified every bottom ball as "fixed".
    const others=members.filter(q=>q.ball!==m.ball);
    return withMembersRemoved(b,others,()=>settleStep(b,m.x,m.y));
}
function advanceHeldShapes(b){
    let cleared=false;
    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        if(!valid(x,y))continue;
        const ball=b[y][x];
        if(!ball||!ball.shapeHeld)continue;
        ball.shapeHeld=false;
        ball.shapeGroupId=0;
        ball.shapeOrientation="";
        ball.forceSplit=false;
        ball.fallBias=0;
        ball.fallBiasTTL=0;
        ball.visualReleaseGroupId=0;
        ball.visualPreReleaseRemaining=0;
        cleared=true;
    }
    return {moved:false,released:cleared};
}

let LIVE_MOTION_SEQ=1;

function physicalContactInfo(b,x,y){
    const tangent=[];
    for(const dx of [-1,1]){
        const sx=x+dx,sy=y+1;
        if(valid(sx,sy)&&b[sy][sx]!==null)
            tangent.push({dx,x:sx,y:sy,ball:b[sy][sx]});
    }
    const directBelow=valid(x,y+2)&&b[y+2][x]!==null
        ? {x,y:y+2,ball:b[y+2][x]} : null;
    return {tangent,directBelow};
}
function rawNaturalProposal(b,x,y){
    if(!valid(x,y)||b[y][x]===null)return null;
    const ball=b[y][x];
    const empty=(tx,ty)=>valid(tx,ty)&&b[ty][tx]===null;
    const l=empty(x-1,y+1),r=empty(x+1,y+1);
    const sideL=valid(x-2,y)&&b[y][x-2]!==null;
    const sideR=valid(x+2,y)&&b[y][x+2]!==null;
    let tx=x,ty=y,kind="";
    if(l&&r&&empty(x,y+2)){tx=x;ty=y+2;kind="fall";}
    else if(l&&!r){if(sideL)return null;tx=x-1;ty=y+1;kind="roll";}
    else if(r&&!l){if(sideR)return null;tx=x+1;ty=y+1;kind="roll";}
    else if(!l&&!r)return null;
    else{
        let dir=Math.sign(ball?.rollDir||ball?.momentumX||ball?.subCellBias||0);
        if(y+1===ROWS-1){
            const sl=floorPackingScore(b,x-1,y+1),sr=floorPackingScore(b,x+1,y+1);
            if(sl>sr)dir=-1; else if(sr>sl)dir=1;
        }
        if(!dir)dir=-1;
        tx=x+dir;ty=y+1;kind="topRoll";
    }
    if(!valid(tx,ty))return null;
    const p={x,y,tx,ty,ball,kind,visualPivot:null,topPivot:null,movingSupportId:0,followSupportIds:[]};
    const dx=tx-x,dy=ty-y;
    if(kind==="roll"&&dy===1&&Math.abs(dx)===1){
        const pv=[x-dx,y+1];
        if(valid(pv[0],pv[1])&&b[pv[1]][pv[0]]!==null)p.visualPivot=pv;
    }else if(kind==="topRoll"&&valid(x,y+2)&&b[y+2][x]!==null){
        p.topPivot=[x,y+2];
    }
    return p;
}
function sameMoveVector(a,b){
    return !!a&&!!b&&(a.tx-a.x)===(b.tx-b.x)&&(a.ty-a.y)===(b.ty-b.y);
}
function proposalSignature(p){
    if(!p)return "null";
    return [p.tx,p.ty,p.kind,p.visualPivot?.join(",")||"",p.topPivot?.join(",")||"",
        p.movingSupportId||0,(p.followSupportIds||[]).join(",")].join("|");
}
function buildContactAwareProposals(b,bannedIds=new Set()){
    const entries=[],byId=new Map();
    for(let y=ROWS-1;y>=0;y--)for(let x=0;x<W2;x++){
        if(!valid(x,y)||b[y][x]===null)continue;
        const ball=b[y][x];
        const e={x,y,ball,id:ball.id,raw:rawNaturalProposal(b,x,y),contact:physicalContactInfo(b,x,y),p:null};
        entries.push(e);byId.set(ball.id,e);
    }
    for(const e of entries)if(!bannedIds.has(e.id)&&e.raw)e.p={...e.raw,followSupportIds:[]};
    for(let guard=0;guard<ROWS*3+12;guard++){
        let changed=false;
        for(const e of entries){
            if(bannedIds.has(e.id))continue;
            const old=e.p;
            let next=e.raw?{...e.raw,followSupportIds:[]}:null;
            const contacts=e.contact.tangent;
            if(contacts.length){
                const supportEntries=contacts.map(c=>byId.get(c.ball.id)).filter(Boolean);
                const moving=supportEntries.filter(se=>se.p);
                if(supportEntries.length&&moving.length===supportEntries.length){
                    const first=moving[0].p;
                    if(moving.every(se=>sameMoveVector(first,se.p))){
                        const dx=first.tx-first.x,dy=first.ty-first.y,tx=e.x+dx,ty=e.y+dy;
                        if(valid(tx,ty))next={x:e.x,y:e.y,tx,ty,ball:e.ball,kind:"follow",
                            visualPivot:null,topPivot:null,movingSupportId:moving[0].id,
                            followSupportIds:moving.map(se=>se.id)};
                    }
                }else if(contacts.length===2&&moving.length===1){
                    const movingId=moving[0].id;
                    const stationary=contacts.find(c=>c.ball.id!==movingId);
                    if(stationary){
                        const dir=-stationary.dx,tx=e.x+dir,ty=e.y+1;
                        if(valid(tx,ty))next={x:e.x,y:e.y,tx,ty,ball:e.ball,kind:"roll",
                            visualPivot:[stationary.x,stationary.y],topPivot:null,movingSupportId:0,
                            followSupportIds:[]};
                    }
                }
            }
            if(proposalSignature(old)!==proposalSignature(next)){e.p=next;changed=true;}
        }
        if(!changed)break;
    }
    return entries.filter(e=>e.p).map(e=>e.p);
}

function slopeRigidGroups(b){
    const groups=new Map();

    for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
        if(!valid(x,y))continue;
        const ball=b[y][x];
        if(!ball||!ball.slopeRigidGroupId)continue;

        const gid=ball.slopeRigidGroupId;
        if(!groups.has(gid))groups.set(gid,[]);
        groups.get(gid).push({
            ball,x,y,
            role:ball.slopeRigidRole,
            orientation:ball.slopeRigidOrientation
        });
    }

    return groups;
}

function clearSlopeRigidGroup(members){
    for(const m of members){
        m.ball.slopeRigidGroupId=0;
        m.ball.slopeRigidRole=-1;
        m.ball.slopeRigidOrientation="";
        m.ball.slopeRigidActive=false;
        m.ball.rigid=false;
    }
}

function slopeRigidExternalContacts(b,members){
    const own=new Set(members.map(m=>m.ball.id));
    const contacts=[];

    for(const m of members){
        if(m.y===ROWS-1){
            contacts.push({
                kind:"floor",
                memberId:m.ball.id,
                x:m.x,y:ROWS,
                side:0
            });
        }

        for(const dx of [-1,1]){
            const sx=m.x+dx,sy=m.y+1;
            if(!valid(sx,sy))continue;
            const v=b[sy][sx];
            if(v&&!own.has(v.id)){
                contacts.push({
                    kind:"ball",
                    memberId:m.ball.id,
                    supportId:v.id,
                    x:sx,y:sy,
                    side:dx
                });
            }
        }
    }

    return contacts;
}


function slopeExternalBallAt(b,ownIds,x,y){
    return valid(x,y) &&
        b[y][x]!==null &&
        !ownIds.has(b[y][x].id);
}

function straightDiagonalChainThrough(b,ownIds,sx,sy,dir){
    // dir=+1: x-y is constant, descending to the right.
    // dir=-1: x+y is constant, descending to the left.
    if(!slopeExternalBallAt(b,ownIds,sx,sy))
        return [];

    const out=[[sx,sy]];

    let x=sx,y=sy;
    for(let i=0;i<ROWS;i++){
        x+=dir;y+=1;
        if(!slopeExternalBallAt(b,ownIds,x,y))break;
        out.push([x,y]);
    }

    x=sx;y=sy;
    for(let i=0;i<ROWS;i++){
        x-=dir;y-=1;
        if(!slopeExternalBallAt(b,ownIds,x,y))break;
        out.unshift([x,y]);
    }

    return out;
}

function strictStraightSlopeInfo(b,members,contacts){
    const ownIds=new Set(members.map(m=>m.ball.id));
    const ballContacts=contacts.filter(c=>c.kind==="ball");

    if(!ballContacts.length)
        return null;

    // Every contact underneath the rigid body must belong to ONE contiguous
    // diagonal line. A valley pair, a step, or a protruding bump therefore
    // cannot be classified as a slope.
    for(const dir of [-1,1]){
        for(const seed of ballContacts){
            const chain=straightDiagonalChainThrough(
                b,ownIds,seed.x,seed.y,dir
            );

            // Two balls can occur almost anywhere by accident. Require a real
            // diagonal surface of at least three consecutive tangent balls.
            if(chain.length<3)continue;

            const keys=new Set(chain.map(([x,y])=>x+","+y));
            if(!ballContacts.every(c=>keys.has(c.x+","+c.y)))
                continue;

            // Reject a convexity immediately touching the triplet.
            // Any external lower contact outside this line means the surface
            // below the body is not one straight diagonal plane.
            let clean=true;
            for(const m of members){
                for(const dx of [-1,1]){
                    const x=m.x+dx,y=m.y+1;
                    if(!slopeExternalBallAt(b,ownIds,x,y))continue;
                    if(!keys.has(x+","+y)){
                        clean=false;
                        break;
                    }
                }
                if(!clean)break;
            }
            if(!clean)continue;

            return {
                dir,
                chain,
                invariant:dir===1
                    ? seed.x-seed.y
                    : seed.x+seed.y
            };
        }
    }

    return null;
}

function slopeRigidSurfaceKind(b,members){
    const contacts=slopeRigidExternalContacts(b,members);
    const orientation=
        members[0]?.orientation ||
        members[0]?.ball?.slopeRigidOrientation ||
        "";

    // A physical floor is never a slope.
    if(contacts.some(c=>c.kind==="floor"))
        return {kind:"release",contacts,dir:0};

    // ▼ reaches the empty floor one logical row before y=ROWS-1.
    if(orientation==="down"){
        const bottom=members.find(m=>m.role===2);
        if(bottom &&
           bottom.y===ROWS-2 &&
           valid(bottom.x-1,ROWS-1) &&
           valid(bottom.x+1,ROWS-1) &&
           b[ROWS-1][bottom.x-1]===null &&
           b[ROWS-1][bottom.x+1]===null){
            return {kind:"release",contacts,dir:0};
        }
    }

    const ballContacts=contacts.filter(c=>c.kind==="ball");

    // Before first contact the body remains rigid while freely falling.
    if(!ballContacts.length)
        return {kind:"air",contacts,dir:0};

    const straight=strictStraightSlopeInfo(
        b,members,contacts
    );

    if(straight){
        return {
            kind:"slope",
            contacts,
            dir:straight.dir,
            chain:straight.chain,
            invariant:straight.invariant
        };
    }

    // Everything else is NOT a slope:
    // horizontal shelf, isolated support, valley, step, convex bump,
    // concave pocket, or mixed-height contact.
    return {kind:"release",contacts,dir:0};
}

function slopeRigidMemberPivot(m,dx,dy){
    if(dy===1&&Math.abs(dx)===1)
        return [m.x-dx,m.y+1];
    return null;
}

function slopeRigidTranslationSafe(b,members,dx,dy){
    const ownIds=new Set(members.map(m=>m.ball.id));
    const targets=new Set();

    // Endpoints must be valid and free of external balls.
    for(const m of members){
        const tx=m.x+dx,ty=m.y+dy;

        if(!valid(tx,ty))
            return false;

        const key=tx+","+ty;
        if(targets.has(key))
            return false;
        targets.add(key);

        const occ=b[ty][tx];
        if(occ&&!ownIds.has(occ.id))
            return false;
    }

    // On a 60° straight slope the rigid body does NOT travel along the
    // straight chord between lattice centers. That chord cuts through the
    // supporting ball. Every member follows the same 60° circular displacement
    // around a geometrically corresponding pivot, preserving the triangle
    // exactly throughout the motion.
    for(const m of members){
        const pivot=slopeRigidMemberPivot(m,dx,dy);

        const p={
            x:m.x,
            y:m.y,
            tx:m.x+dx,
            ty:m.y+dy,
            visualPivot:pivot,
            topPivot:null,
            _effectiveVisualPivot:pivot,
            _effectiveTopPivot:null
        };

        for(let y=0;y<ROWS;y++)for(let x=0;x<W2;x++){
            if(!valid(x,y))
                continue;

            const qball=b[y][x];
            if(!qball||ownIds.has(qball.id))
                continue;

            // The real support at this member's pivot is an intentional
            // tangent contact throughout the roll.
            if(pivot&&pivot[0]===x&&pivot[1]===y)
                continue;

            const q=normPoint(x,y);

            for(let i=1;i<=96;i++){
                const pt=proposalPointAt(p,i/96);

                if(Math.hypot(
                    pt[0]-q[0],
                    pt[1]-q[1]
                )<0.9995)
                    return false;
            }
        }
    }

    return true;
}

function applySlopeRigidTranslation(b,members,dx,dy){
    const motionSeq=LIVE_MOTION_SEQ++;
    const fastImpact=members.some(m=>!!m.ball.slopeImpactFast);
    const slopeDuration=fastImpact
        ? SLOPE_HARD_DURATION
        : SLOPE_NORMAL_DURATION;

    const pushed=[];

    for(const m of members)b[m.y][m.x]=null;

    for(const m of members){
        const nx=m.x+dx,ny=m.y+dy;
        b[ny][nx]=m.ball;

        if(!Array.isArray(m.ball.fallPath))
            m.ball.fallPath=[];

        const pivot=slopeRigidMemberPivot(m,dx,dy);

        const seg={
            from:[m.x,m.y],
            to:[nx,ny],
            pivot,
            topPivot:null,
            movingSupportId:0,
            motionSeq,
            rigidTriplet:true,
            slopeRigidArc:true,
            slopeDuration,
            slopeFastImpact:fastImpact,
            slopeContinues:false,
            slopeTerminal:true
        };

        m.ball.fallPath.push(seg);
        pushed.push({ball:m.ball,seg});

        m.ball.rigid=true;
        m.ball.slopeRigidActive=true;

        if(dx){
            m.ball.rollDir=Math.sign(dx);
            m.ball.momentumX=Math.sign(dx);
            m.ball.subCellBias=Math.sign(dx);
        }else if(dy>=2){
            m.ball.rollDir=0;
        }
    }

    // Inspect the NEW rigid pose without advancing it. If the same true
    // straight slope continues, do not ease out at this lattice boundary:
    // reference footage flows through the middle of a slope continuously.
    const gid=members[0]?.ball?.slopeRigidGroupId||0;
    const nextMembers=gid ? slopeRigidGroups(b).get(gid) : null;

    let continues=false;
    if(nextMembers&&nextMembers.length===3){
        const nextSurface=slopeRigidSurfaceKind(b,nextMembers);
        if(nextSurface.kind==="slope"){
            continues=slopeRigidTranslationSafe(
                b,nextMembers,nextSurface.dir,1
            );
        }
    }

    for(const p of pushed){
        p.seg.slopeContinues=continues;
        p.seg.slopeTerminal=!continues;
    }
}
function commonRigidMomentumDir(members){
    let sum=0;
    let seen=0;

    for(const m of members){
        const d=Math.sign(
            m.ball.rollDir ||
            m.ball.momentumX ||
            m.ball.subCellBias ||
            0
        );
        if(d){
            sum+=d;
            seen++;
        }
    }

    if(!seen)return 0;
    if(Math.abs(sum)!==seen)return 0;
    return Math.sign(sum);
}

function rigidContactPreferredDir(contacts,members){
    const ballContacts=contacts.filter(c=>c.kind==="ball");
    if(!ballContacts.length)return 0;

    // A single convex contact determines the physically downhill side:
    // support lower-left => body continues right, support lower-right => left.
    const sideSum=ballContacts.reduce(
        (n,c)=>n+Math.sign(c.side||0),0
    );

    if(Math.abs(sideSum)===ballContacts.length)
        return -Math.sign(sideSum);

    // Mixed contacts do not invent a direction. Preserve an already shared
    // lateral tendency only if all three members agree.
    return commonRigidMomentumDir(members);
}

function rigidMemberIndependentMove(b,members,m){
    const to=memberMoveWithoutGroup(
        b,members,m
    );

    if(!to)return null;

    return {
        dx:to[0]-m.x,
        dy:to[1]-m.y,
        to
    };
}


function rigidDirectBelowContacts(b,members){
    const ownIds=new Set(members.map(m=>m.ball.id));
    const out=[];

    for(const m of members){
        const info=physicalContactInfo(
            b,m.x,m.y
        );
        const d=info.directBelow;

        if(d && !ownIds.has(d.ball.id)){
            out.push({
                member:m,
                support:d
            });
        }
    }

    return out;
}

