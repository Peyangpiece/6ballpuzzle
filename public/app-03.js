function rigidPrecontactDir(b,members,direct){
    if(!direct.length)return 0;

    const momentum=commonRigidMomentumDir(members);
    if(momentum)return momentum;

    const cx=members.reduce(
        (n,m)=>n+m.x,0
    )/members.length;

    // Torque from supports which are still directly below, before tangent
    // contact is reached. Support under the right side pushes the body left,
    // and vice versa.
    let torque=0;
    for(const q of direct)
        torque+=Math.sign(cx-q.member.x);

    if(torque)
        return Math.sign(torque);

    // One support exactly under the center is the unstable top of a convex
    // ball. Preserve tiny placement bias if available; otherwise use the same
    // deterministic left tie-break as the ordinary top-roll solver.
    if(direct.length===1){
        const bias=members.reduce(
            (n,m)=>n+Math.sign(
                m.ball.subCellBias ||
                m.ball.momentumX ||
                0
            ),0
        );
        return Math.sign(bias)||-1;
    }

    // Symmetric two-point precontact is not given an arbitrary lateral push.
    return 0;
}

function rigidDifferentialConstraint(b,members){
    const moves=members.map(m=>
        rigidMemberIndependentMove(b,members,m)
    );

    const moving=moves.filter(Boolean);

    // Nobody is trying to leave the rigid body: it can simply rest intact.
    if(!moving.length){
        return {
            breakRequired:false,
            reason:"rigid_rest",
            moves
        };
    }

    // Some members want to move while one or more are pinned.
    // This is the real "one ball got caught" event.
    if(moving.length!==members.length){
        return {
            breakRequired:true,
            reason:"member_pinned",
            moves
        };
    }

    const first=moving[0];
    const same=moving.every(q=>
        q.dx===first.dx && q.dy===first.dy
    );

    // Different independent gravity directions mean the body is being pulled
    // apart by the surrounding geometry.
    if(!same){
        return {
            breakRequired:true,
            reason:"differential_direction",
            moves
        };
    }

    // All three would choose the same independent move, but the swept rigid
    // motion was rejected. Keep the body intact rather than manufacturing a
    // split; an external obstacle may simply be holding the whole body at rest.
    return {
        breakRequired:false,
        reason:"common_move_blocked",
        moves
    };
}


function rigidFloorCatchInfo(b,members){
    const orientation=
        members[0]?.orientation ||
        members[0]?.ball?.slopeRigidOrientation ||
        "";

    // ▼ only:
    // the bottom member can be one lattice row above the physical floor while
    // both legal down-diagonal destinations are on the final floor row.
    // At this instant the lower ball is the member being "caught" by the floor.
    if(orientation!=="down")
        return null;

    const bottom=members.find(m=>m.role===2);
    if(!bottom)
        return null;

    if(bottom.y!==ROWS-2)
        return null;

    const lx=bottom.x-1;
    const rx=bottom.x+1;
    const fy=ROWS-1;

    if(!valid(lx,fy)||!valid(rx,fy))
        return null;

    const ownIds=new Set(
        members.map(m=>m.ball.id)
    );

    const left=b[fy][lx];
    const right=b[fy][rx];

    // Empty floor or supports not belonging to the falling triplet:
    // either way the bottom member has reached the floor-capture boundary.
    const leftExternal=!left||!ownIds.has(left.id);
    const rightExternal=!right||!ownIds.has(right.id);

    if(!leftExternal||!rightExternal)
        return null;

    return {
        member:bottom,
        floorRow:fy,
        destinations:[
            [lx,fy],
            [rx,fy]
        ]
    };
}

function rigidBodyContinuation(b,members){
    const contacts=slopeRigidExternalContacts(b,members);
    const ballContacts=contacts.filter(c=>c.kind==="ball");
    const floorContact=contacts.some(c=>c.kind==="floor");

    // 1) True continuous 60° slope.
    const straight=strictStraightSlopeInfo(
        b,members,contacts
    );

    if(straight && slopeRigidTranslationSafe(
        b,members,straight.dir,1
    )){
        return {
            move:true,
            dx:straight.dir,
            dy:1,
            mode:"slope",
            contacts,
            straight,
            breakRequired:false
        };
    }

    // 2) ▼ floor-capture boundary.
    // This is a genuine rigidity-break event: the lowest member is the one
    // that reaches the physical floor first. Do not keep the whole triangle
    // suspended one row above the floor.
    const floorCatch=rigidFloorCatchInfo(
        b,members
    );

    if(floorCatch){
        return {
            move:false,
            dx:0,
            dy:0,
            mode:"break",
            contacts,
            straight:null,
            floorContact:true,
            ballContacts,
            directBelow:[],
            breakRequired:true,
            breakReason:"floor_catch",
            caughtMemberId:floorCatch.member.ball.id,
            floorCatch
        };
    }

    // 3) Free fall of the intact triplet.
    if(slopeRigidTranslationSafe(
        b,members,0,2
    )){
        return {
            move:true,
            dx:0,
            dy:2,
            mode:"fall",
            contacts,
            straight:null,
            breakRequired:false
        };
    }

    // 4) Preserve shared incoming momentum when possible.
    const momentumDir=commonRigidMomentumDir(members);
    if(momentumDir && slopeRigidTranslationSafe(
        b,members,momentumDir,1
    )){
        return {
            move:true,
            dx:momentumDir,
            dy:1,
            mode:"momentum",
            contacts,
            straight:null,
            breakRequired:false
        };
    }

    // 5) Convex / partial contact.
    // A one-sided contact is NOT a break event. Roll the entire triangle away
    // from the supporting side. This specifically covers an inverted triangle
    // touching a protruding pile ball at only one point.
    const contactDir=rigidContactPreferredDir(
        contacts,members
    );

    if(contactDir && slopeRigidTranslationSafe(
        b,members,contactDir,1
    )){
        return {
            move:true,
            dx:contactDir,
            dy:1,
            mode:"convex_contact",
            contacts,
            straight:null,
            breakRequired:false
        };
    }

    // If the first preferred side is unavailable, only try the opposite side
    // for a genuinely one-sided/asymmetric contact. Never make a flat body
    // randomly walk left/right.
    if(contactDir && slopeRigidTranslationSafe(
        b,members,-contactDir,1
    )){
        return {
            move:true,
            dx:-contactDir,
            dy:1,
            mode:"convex_escape",
            contacts,
            straight:null,
            breakRequired:false
        };
    }

    // 6) Half-step / precontact with a convex ball.
    // At this lattice pose there may be no tangent contact yet: the obstacle
    // is directly below one member. The old solver looked at each future ball
    // separately here and split the triangle too early.
    const directBelow=rigidDirectBelowContacts(
        b,members
    );
    const precontactDir=rigidPrecontactDir(
        b,members,directBelow
    );

    if(precontactDir && slopeRigidTranslationSafe(
        b,members,precontactDir,1
    )){
        return {
            move:true,
            dx:precontactDir,
            dy:1,
            mode:"convex_precontact",
            contacts,
            directBelow,
            straight:null,
            breakRequired:false
        };
    }

    if(precontactDir && slopeRigidTranslationSafe(
        b,members,-precontactDir,1
    )){
        return {
            move:true,
            dx:-precontactDir,
            dy:1,
            mode:"convex_precontact_escape",
            contacts,
            directBelow,
            straight:null,
            breakRequired:false
        };
    }

    // 7) No common rigid displacement. Only a REAL current contact may tear
    // the body apart. Future independent paths are not a break event while the
    // triplet is still between contact levels.
    const hasCurrentConstraint=
        floorContact ||
        ballContacts.length>0;

    const differential=hasCurrentConstraint
        ? rigidDifferentialConstraint(
            b,members
        )
        : {
            breakRequired:false,
            reason:directBelow.length
                ? "precontact_hold"
                : "rigid_hold",
            moves:[]
        };

    return {
        move:false,
        dx:0,
        dy:0,
        mode:differential.breakRequired
            ? "break"
            : "rigid_rest",
        contacts,
        straight:null,
        floorContact,
        ballContacts,
        breakRequired:differential.breakRequired,
        breakReason:differential.reason,
        memberMoves:differential.moves,
        directBelow
    };
}

function advanceSlopeRigidGroups(b,preview=false){
    const groups=slopeRigidGroups(b);
    if(!groups.size)
        return {moved:false,heldIds:new Set(),released:false};

    const heldIds=new Set();
    let released=false;

    const releaseGroup=(members,reason)=>{
        released=true;
        for(const m of members)
            heldIds.delete(m.ball.id);

        if(!preview){
            for(const m of members){
                m.ball.rigidityBreakReason=reason||"blocked";
                m.ball.rigidityBreakSeq=LIVE_MOTION_SEQ;
                normalizePileBallPhysics(m.ball);
            }
        }
    };

    for(const members of groups.values()){
        // A missing member means the original three-ball body has already
        // been physically broken (cleared/removed/etc.).
        if(members.length!==3){
            releaseGroup(members,"member_missing");
            continue;
        }

        for(const m of members){
            heldIds.add(m.ball.id);
            if(!preview){
                m.ball.rigid=true;
                m.ball.slopeRigidActive=true;
            }
        }

        const continuation=rigidBodyContinuation(
            b,members
        );

        if(continuation.move){
            if(preview)
                return {moved:true,heldIds,released};

            applySlopeRigidTranslation(
                b,members,
                continuation.dx,
                continuation.dy
            );

            return {moved:true,heldIds,released};
        }

        // If common rigid motion no longer exists, this is no longer the
        // active falling triplet. Whether the cause is a differential catch or
        // a fully blocked rest, it has joined the pile and rigidity ends here.
        releaseGroup(
            members,
            continuation.breakRequired
                ? (continuation.breakReason||"differential_constraint")
                : "pile_settled"
        );
        continue;
    }

    return {moved:false,heldIds,released};
}

function settlePass(b,preview=false){
    const slopeRigid=advanceSlopeRigidGroups(b,preview);
    if(slopeRigid.moved)return true;

    const protectedRigidIds=slopeRigid.heldIds;
    const banned=new Set(protectedRigidIds);
    let proposals=[];
    for(let guard=0;guard<W2*ROWS+8;guard++){
        proposals=buildContactAwareProposals(b,banned);
        if(!proposals.length)return slopeRigid.released;
        const movingOrigins=new Set(proposals.map(p=>p.x+","+p.y));
        let reject=null;
        for(const p of proposals){
            if(b[p.ty][p.tx]!==null&&!movingOrigins.has(p.tx+","+p.ty)){reject=p;break;}
        }
        if(reject){banned.add(reject.ball.id);continue;}
        const targetMap=new Map();
        for(const p of proposals){
            const key=p.tx+","+p.ty;
            if(!targetMap.has(key))targetMap.set(key,[]);
            targetMap.get(key).push(p);
        }
        for(const arr of targetMap.values()){
            if(arr.length<=1)continue;
            arr.sort((a,z)=>{
                if(a.y!==z.y)return z.y-a.y;
                const ad=Math.abs(a.tx-a.x)+Math.abs(a.ty-a.y),zd=Math.abs(z.tx-z.x)+Math.abs(z.ty-z.y);
                if(ad!==zd)return ad-zd;
                return a.x-z.x;
            });
            for(let i=1;i<arr.length;i++)banned.add(arr[i].ball.id);
            reject=arr[1];break;
        }
        if(reject)continue;
        const byOrigin=new Map(proposals.map(p=>[p.x+","+p.y,p]));
        for(const p of proposals){
            if(p.visualPivot){
                const sp=byOrigin.get(p.visualPivot[0]+","+p.visualPivot[1]);
                if(sp){p.movingSupportId=sp.ball.id;p.visualPivot=null;}
            }
            if(p.topPivot){
                const sp=byOrigin.get(p.topPivot[0]+","+p.topPivot[1]);
                if(sp){p.movingSupportId=sp.ball.id;p.topPivot=null;}
            }
            p._effectiveVisualPivot=p.visualPivot;
            p._effectiveTopPivot=p.topPivot;
        }
        let pairReject=null;
        for(let i=0;i<proposals.length&&!pairReject;i++)for(let j=i+1;j<proposals.length;j++){
            const a=proposals[i],z=proposals[j];
            const linked=(a.followSupportIds||[]).includes(z.ball.id)||(z.followSupportIds||[]).includes(a.ball.id);
            if(!linked&&proposalsSweepOverlap(a,z)){
                pairReject=a.y!==z.y?(a.y<z.y?a:z):(a.x>z.x?a:z);break;
            }
        }
        if(pairReject){banned.add(pairReject.ball.id);continue;}
        const movingTargets=new Set(proposals.map(p=>p.tx+","+p.ty));
        let stationaryReject=null;
        for(const p of proposals){
            if(proposalHitsStationaryBall(p,b,movingOrigins,movingTargets)){stationaryReject=p;break;}
        }
        if(stationaryReject){banned.add(stationaryReject.ball.id);continue;}
        break;
    }
    if(!proposals.length)return slopeRigid.released;

    // Preview uses the exact same conflict/support solver as the real step,
    // but stops before mutating board/fallPath state.
    if(preview)return true;

    const motionSeq=LIVE_MOTION_SEQ++;
    for(const p of proposals)b[p.y][p.x]=null;
    for(const p of proposals){
        if(b[p.ty][p.tx]!==null){b[p.y][p.x]=p.ball;continue;}
        b[p.ty][p.tx]=p.ball;
        const moving=p.ball;
        if(moving&&typeof moving==="object"){
            if(!Array.isArray(moving.fallPath))moving.fallPath=[];
            const seg={from:[p.x,p.y],to:[p.tx,p.ty],pivot:p.visualPivot||null,
                topPivot:p.topPivot||null,movingSupportId:p.movingSupportId||0,
                followSupportIds:Array.isArray(p.followSupportIds)?[...p.followSupportIds]:[],
                kind:p.kind||"",motionSeq};
            const last=moving.fallPath[moving.fallPath.length-1],lastTo=last&&(last.to||last);
            if(!lastTo||lastTo[0]!==p.tx||lastTo[1]!==p.ty)moving.fallPath.push(seg);
            const dx=p.tx-p.x,dy=p.ty-p.y;
            if(seg.pivot){
                const dir=Math.sign(dx);moving.rollDir=dir;moving.momentumX=dir;moving.subCellBias=dir;
            }else if(dy>=2||p.kind==="follow")moving.rollDir=0;
            moving.shapeHeld=false;moving.forceSplit=false;moving.fallBias=0;moving.fallBiasTTL=0;
            moving.rigid=false;moving.fixedGarbage=false;
        }
    }
    return true;
}

const settleAll = (b) => {
    const cap=ROWS*W2*3;
    for(let i=0;i<cap;i++){
        if(settlePass(b)) continue;
        const movable=[];
        for(let y=ROWS-1;y>=0;y--) for(let x=0;x<W2;x++){
            if(!valid(x,y)||!b[y][x]) continue;
            const candidate=b[y][x];

            // Never bypass slope-rigid group physics through the legacy rescue.
            // A member may move only through advanceSlopeRigidGroups().
            if(candidate?.slopeRigidGroupId)continue;

            const to=settleStep(b,x,y);
            if(to)movable.push({x,y,to,ball:candidate});
        }
        if(!movable.length) {
            const frozen = unstableFrozenBalls(b);
            if (frozen.length) {
                // This should be unreachable with the symmetric-release rule.
                // Never certify an unsupported floating board as stable.
                for (const f of frozen) {
                    const ball=b[f.y][f.x];
                    if (ball) ball.subCellBias = ball.subCellBias || -1;
                }
                continue;
            }
            for(let yy=0;yy<ROWS;yy++) for(let xx=0;xx<W2;xx++) {
                const vv=valid(xx,yy)?b[yy][xx]:null;
                if(vv && typeof vv==="object") vv.rollDir=0;
            }
            return true;
        }
        // rescue is not allowed to invent a center preference or use spawn ID as physics.
        // Input list is already bottom-up / left-to-right; only vertical priority is physical.
        movable.sort((a,c)=>c.y-a.y);
        const q=movable[0],[nx,ny]=q.to;
        if(!valid(nx,ny)||b[ny][nx]!==null) continue;

        const rdx=nx-q.x,rdy=ny-q.y;
        let rescuePivot=null;
        let rescueTopPivot=null;

        if(rdy===1&&Math.abs(rdx)===1){
            const side=[q.x-rdx,q.y+1];

            if(valid(side[0],side[1])&&b[side[1]][side[0]]!==null){
                rescuePivot=side;
            }else{
                const bothDiagOpen=
                    valid(q.x-1,q.y+1)&&b[q.y+1][q.x-1]===null &&
                    valid(q.x+1,q.y+1)&&b[q.y+1][q.x+1]===null;
                const below=
                    valid(q.x,q.y+2)&&b[q.y+2][q.x]!==null;

                if(bothDiagOpen&&below)
                    rescueTopPivot=[q.x,q.y+2];
            }
        }

        const moving=b[q.y][q.x];
        b[q.y][q.x]=null;
        b[ny][nx]=moving;

        if(moving&&typeof moving==="object"){
            moving.rigid=false;
            moving.fixedGarbage=false;
            moving.forceSplit=false;
            moving.fallBias=0;
            moving.fallBiasTTL=0;

            if(!Array.isArray(moving.fallPath))moving.fallPath=[];

            moving.fallPath.push({
                from:[q.x,q.y],
                to:[nx,ny],
                pivot:rescuePivot,
                topPivot:rescueTopPivot,
                movingSupportId:0,
                followSupportIds:[],
                kind:"rescue",
                motionSeq:LIVE_MOTION_SEQ++
            });
        }
    }
    return false;
};
const hasLegalGravityMove=(b)=>settlePass(b,true);

/* 2026-08 flat landing rules
   - ▲: flat surfaceでは3球を維持し、freeXから近い側へクラスターのまま滑る。
   - ▼: flat surfaceでは下1球を先に最寄りの谷へ安定させ、その後に上2球を左右へ必ず分裂。
*/

// 戻り値: null=専用処理なし / true=このフレームで動いた / false=専用処理中だが動かなかった

/* 着地直後の中間位置では、3球を「全部一体」にはしない。
   接触が残っている部分だけを temporary cluster として保持し、
   支持を失った球だけ先に切り離す。盤面変化後に残った部分も再評価する。 */

// activeCluster の球を一時的に盤面から外した状態で、各球単独の重力方向を調べる。
// これで仲間同士を「支え」と誤認せず、本当に裂かれる側だけを検出できる。

// 物理制御の安全弁。特殊な剛性/分裂制御が不安定になった場合は、即座に通常重力へ戻す。
const enforceParityPhysicsMode = (g) => {
    if (!g) return;
    g.activeCluster = null;
    g.landingSpecial = null;
    g.rigidSlideDir = 0;
    g.rigidSlideSteps = 0;
};

function physicsSignature(g) {
    const a=[];
    for (let y=0;y<ROWS;y++) for (let x=0;x<W2;x++) {
        const v=valid(x,y)?g.board[y][x]:null;
        if (v) a.push(v.id+"@"+x+","+y);
    }
    return a.join("|");
}

